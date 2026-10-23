// custosRepository.js
//
// Leitura e gravação do CUSTO OPERACIONAL.
//   settings/custos            → tarifas por fornecedor, tarifas de guia,
//                                regras do serviço casado, categoria fixada
//                                por veículo e regiões já vistas no Phoenix
//   custos_dia/{AAAA-MM-DD}    → um documento por dia:
//      status: "rascunho" | "conferido"
//      linhas.{chave}         → retrato do serviço + cálculo (`calc`), que é
//                               o que os relatórios leem
//      linhas.{chave}.manual  → o que a pessoa lançou (valor cobrado,
//                               fornecedor, categoria, casado, guia…). A
//                               sincronização com o Phoenix nunca mexe aqui.
// O vínculo veículo → fornecedor continua em settings/vinculos_veiculos_fornecedor
// (o mesmo da tela Serviços por Fornecedor).

import {
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { compararComFoto, fotoDaLinha } from "./auditoriaAlteracoes";
import { phoenixReserveService } from "./regiaoAtiva";
import {
  alertasDoDia,
  calcularLinha,
  consolidarServicos,
  detectarApoios,
  detectarCasados,
  mapaCapacidadePorVeiculo,
  mapaFornecedorPorVeiculo,
  normalizarConfigCustos,
  recomendarTrocas,
  resumoDoDia,
  retratoDaLinha,
} from "./custosCalculo";

const EXPAND =
  "service,schedule,reserve,establishmentOrigin,establishmentDestination,establishmentOrigin.region,establishmentDestination.region,roadmapService,roadmapService.roadmap,auxRoadmapService.roadmap,auxRoadmapService.roadmap.serviceOrder,auxRoadmapService.roadmap.serviceOrder.vehicle,auxRoadmapService.roadmap.driver,auxRoadmapService.roadmap.guide,roadmapService.roadmap.driver,roadmapService.roadmap.guide,roadmapService.roadmap.serviceOrder,roadmapService.roadmap.serviceOrder.vehicle";

const REF_CONFIG = () => doc(db, "settings", "custos");
const REF_VINCULOS = () => doc(db, "settings", "vinculos_veiculos_fornecedor");
const REF_DIA = (data) => doc(db, "custos_dia", data);
const REF_AUDITORIA = (data) => doc(db, "auditoria_dia", data);

/* ---------------- Phoenix ---------------- */

const urlPhoenix = (data, tipos) => {
  const p = new URLSearchParams();
  p.append("execution_date", data);
  p.append("expand", EXPAND);
  tipos.forEach((t) => p.append("service_type[]", t));
  return `${phoenixReserveService()}?${p.toString()}`;
};

const lista = (json) => {
  if (Array.isArray(json)) return json;
  for (const c of [json?.data, json?.results, json?.rows, json?.items]) if (Array.isArray(c)) return c;
  return [];
};

const buscarJson = async (url) => {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`Phoenix respondeu ${r.status}`);
  return lista(await r.json());
};

// Transfers (IN/OUT/transfer) e passeios do dia, já um por escala
// Reservas do dia como vêm do Phoenix (a tela consolida com as tarifas)
export const buscarItensDoDia = async (data) => {
  const [base, passeios] = await Promise.all([
    buscarJson(urlPhoenix(data, ["1", "2", "4"])),
    buscarJson(urlPhoenix(data, ["3"])),
  ]);
  return [
    ...base.map((i) => ({ ...i, __dataMapa: data })),
    ...passeios.map((i) => ({ ...i, __dataMapa: data, __passeio: true })),
  ];
};

// Transfers e passeios do dia, já um por escala (e os serviços de parceiro
// reconhecidos pelas tarifas)
export const buscarServicosDoDia = async (data, tarifas = []) => consolidarServicos(await buscarItensDoDia(data), data, tarifas);

// nomes de serviço vistos no Phoenix (sugestão no cadastro de tarifa de parceiro)
export const registrarServicosConhecidos = (nomes = []) =>
  nomes.length
    ? setDoc(REF_CONFIG(), { servicosConhecidos: arrayUnion(...nomes) }, { merge: true })
    : Promise.resolve();

/* ---------------- configuração ---------------- */

export const ouvirConfigCustos = (aoMudar, aoErro) =>
  onSnapshot(
    REF_CONFIG(),
    (snap) => aoMudar(normalizarConfigCustos(snap.exists() ? snap.data() : {}), snap.exists()),
    (e) => {
      console.error("Erro ao ler settings/custos:", e);
      aoErro?.(e);
      aoMudar(normalizarConfigCustos({}), false);
    },
  );

export const salvarConfigCustos = (patch) =>
  setDoc(REF_CONFIG(), { ...patch, atualizadoEm: Timestamp.now() }, { merge: true });

export const fixarCategoriaVeiculo = (veiculoKey, categoria) =>
  setDoc(
    REF_CONFIG(),
    { categoriasVeiculo: { [veiculoKey]: categoria || deleteField() }, atualizadoEm: Timestamp.now() },
    { merge: true },
  );

export const registrarRegioes = (regioes = []) =>
  regioes.length
    ? setDoc(REF_CONFIG(), { regioesConhecidas: arrayUnion(...regioes) }, { merge: true })
    : Promise.resolve();

/* ---------------- fornecedores e vínculos ---------------- */

export const ouvirVinculos = (aoMudar) =>
  onSnapshot(
    REF_VINCULOS(),
    (snap) => aoMudar(snap.exists() ? snap.data()?.vinculos || {} : {}),
    (e) => {
      console.error("Erro ao ler vínculos de veículos:", e);
      aoMudar({});
    },
  );

export const salvarVinculoVeiculo = (veiculoKey, { fornecedor, veiculoNome = "", placa = "" }) =>
  setDoc(
    REF_VINCULOS(),
    {
      vinculos: { [veiculoKey]: fornecedor ? { fornecedor, veiculoNome, placa } : deleteField() },
      updatedAt: Timestamp.now(),
    },
    { merge: true },
  );

export const carregarFornecedores = async () => {
  try {
    const snap = await getDocs(collection(db, "providers"));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("Erro ao ler fornecedores:", e);
    return [];
  }
};

export const carregarNomesDePasseios = async () => {
  try {
    const snap = await getDocs(collection(db, "services"));
    return snap.docs
      .map((d) => d.data()?.nome || d.data()?.externalName || "")
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
  } catch {
    return [];
  }
};

/* ---------------- dia ---------------- */

export const ouvirCustosDia = (data, aoMudar) =>
  onSnapshot(
    REF_DIA(data),
    (snap) => aoMudar(snap.exists() ? snap.data() : null),
    (e) => {
      console.error("Erro ao ler custos do dia:", e);
      aoMudar(null);
    },
  );

const quem = (usuario) => usuario?.nome || usuario?.email || "";

// retratos: { chave: retrato } — só as linhas que mudaram
export const gravarRetratos = (data, retratos = {}, removidas = []) => {
  const linhas = { ...retratos };
  removidas.forEach((chave) => {
    linhas[chave] = { removido: true };
  });
  if (!Object.keys(linhas).length) return Promise.resolve();
  return setDoc(REF_DIA(data), { data, linhas, sincronizadoEm: Timestamp.now() }, { merge: true });
};

// patch: campos de `manual`; null/"" apaga o campo (volta ao automático)
export const gravarLancamento = (data, chave, patch, usuario, retrato) => {
  const manual = {};
  Object.entries(patch).forEach(([k, v]) => {
    manual[k] = v === null || v === undefined || v === "" ? deleteField() : v;
  });
  manual.por = quem(usuario);
  manual.em = Timestamp.now();
  return setDoc(
    REF_DIA(data),
    {
      data,
      linhas: { [chave]: { ...(retrato || {}), manual } },
      atualizadoEm: Timestamp.now(),
      atualizadoPor: quem(usuario),
    },
    { merge: true },
  );
};

// resumo do recomendador e dos alertas (para o relatório executivo)
export const gravarResumoDia = (data, resumo) =>
  setDoc(REF_DIA(data), { data, resumo, resumoEm: Timestamp.now() }, { merge: true });

export const excluirLinha = (data, chave) =>
  setDoc(REF_DIA(data), { linhas: { [chave]: deleteField() } }, { merge: true });

export const marcarStatusDia = (data, status, usuario) =>
  setDoc(
    REF_DIA(data),
    {
      data,
      status,
      conferidoPor: status === "conferido" ? quem(usuario) : deleteField(),
      conferidoEm: status === "conferido" ? Timestamp.now() : deleteField(),
    },
    { merge: true },
  );

/* ---------------- período (relatórios) ---------------- */

const emLotes = async (itens, tamanho, fn) => {
  const res = new Array(itens.length);
  let i = 0;
  const trabalhador = async () => {
    while (i < itens.length) {
      const atual = i;
      i += 1;
      res[atual] = await fn(itens[atual], atual);
    }
  };
  await Promise.all(Array.from({ length: Math.min(tamanho, itens.length) }, trabalhador));
  return res;
};

export const carregarCustosPeriodo = async (datas = []) =>
  (
    await emLotes(datas, 8, async (data) => {
      const snap = await getDoc(REF_DIA(data));
      return snap.exists() ? { data, ...snap.data() } : null;
    })
  ).filter(Boolean);

// Dias sem lançamento: busca no Phoenix e grava o retrato pela tabela
// (rascunho), para o relatório não ficar com buraco. Não sobrescreve nada
// lançado à mão (só cria o que não existe).
export const calcularDiasPelaTabela = async (datas, { config, vinculos, fornecedores }, aoProgredir) => {
  const fornecedorPorVeiculo = mapaFornecedorPorVeiculo(vinculos, fornecedores);
  const capacidades = mapaCapacidadePorVeiculo(fornecedores);
  let feitos = 0;
  const falhas = [];
  await emLotes(datas, 3, async (data) => {
    try {
      const { servicos } = await buscarServicosDoDia(data, config.tarifas);
      const pares = detectarCasados(servicos, config.casado);
      const apoios = detectarApoios(servicos);
      const retratos = {};
      const ctx = { fornecedorPorVeiculo, config, pares, apoios, capacidades };
      const linhas = servicos.map((s) => calcularLinha(s, {}, ctx));
      linhas.forEach((l) => {
        retratos[l.chave] = retratoDaLinha(l);
      });
      const resumo = resumoDoDia(recomendarTrocas(servicos, ctx), alertasDoDia(linhas));
      await setDoc(
        REF_DIA(data),
        { data, status: "rascunho", linhas: retratos, resumo, resumoEm: Timestamp.now(), sincronizadoEm: Timestamp.now(), calculadoPelaTabela: true },
        { merge: true },
      );
    } catch (e) {
      console.error("Falha ao calcular", data, e);
      falhas.push(data);
    }
    feitos += 1;
    aoProgredir?.(feitos, datas.length);
  });
  return { falhas };
};

/* ---------------- auditor de alterações ----------------
   auditoria_dia/{data}:
     foto   → { em, por, origem: "manual" | "automatica" | "tardia", servicos, linhas: { chave: foto } }
     vistas → { <id da alteração>: quando o auditor viu a alteração pela 1ª vez } */

// os serviços do dia com o custo pela tabela (sem lançamentos à mão)
export const calcularLinhasDoDia = async (data, { config, vinculos, fornecedores }) => {
  const fornecedorPorVeiculo = mapaFornecedorPorVeiculo(vinculos, fornecedores);
  const capacidades = mapaCapacidadePorVeiculo(fornecedores);
  const { servicos } = await buscarServicosDoDia(data, config.tarifas);
  const pares = detectarCasados(servicos, config.casado);
  const apoios = detectarApoios(servicos);
  const ctx = { fornecedorPorVeiculo, config, pares, apoios, capacidades };
  return servicos.map((s) => calcularLinha(s, {}, ctx));
};

export const ouvirAuditoria = (data, aoMudar) =>
  onSnapshot(
    REF_AUDITORIA(data),
    (snap) => aoMudar(snap.exists() ? snap.data() : null),
    (e) => {
      console.error("Erro ao ler a auditoria do dia:", e);
      aoMudar(null);
    },
  );

// tira (ou refaz) a foto da escala de um dia: substitui a foto e zera o "visto às"
export const tirarFotoDaEscala = async (data, ctx, usuario, origem = "manual") => {
  const linhas = await calcularLinhasDoDia(data, ctx);
  const fotos = Object.fromEntries(linhas.map((l) => [l.chave, fotoDaLinha(l)]));
  await setDoc(REF_AUDITORIA(data), {
    data,
    foto: { em: Timestamp.now(), por: quem(usuario), origem, servicos: linhas.length, linhas: fotos },
    atualizadoEm: Timestamp.now(),
  });
  return linhas.length;
};

const idSeguro = (id) => String(id).replace(/[^\w|:,-]/g, "_").slice(0, 300);
export const chaveDaVista = idSeguro;
const isoDe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const lerVinculos = async () => {
  const snap = await getDoc(REF_VINCULOS());
  return snap.exists() ? snap.data()?.vinculos || {} : {};
};

/* AUDITORIA AUTOMÁTICA (sem botão):
   1. a programação do dia é guardada logo depois da meia-noite (o sistema
      aberto por quem tem acesso a Custos agenda para 00:00); se ninguém
      estava com o sistema aberto, ela é guardada na primeira vez que alguém
      abrir — e fica marcada como "guardada depois da meia-noite";
   2. de tempos em tempos, compara o Phoenix com a programação e grava no
      histórico cada alteração nova (com a hora em que apareceu), mesmo que
      ninguém esteja olhando o auditor — inclusive as que depois voltam atrás. */
const carregarContexto = async () => ({
  config: normalizarConfigCustos((await getDoc(REF_CONFIG())).data() || {}),
  vinculos: await lerVinculos(),
  fornecedores: await carregarFornecedores(),
});

// guarda a programação do dia, se ainda não foi guardada; devolve a foto
export const garantirProgramacao = async (data, ctx, usuario) => {
  const snap = await getDoc(REF_AUDITORIA(data));
  if (snap.exists() && snap.data()?.foto) return snap.data().foto;
  const agora = new Date();
  const naVirada = isoDe(agora) === data && agora.getHours() === 0 && agora.getMinutes() < 30;
  await tirarFotoDaEscala(data, ctx, usuario, naVirada ? "meia-noite" : isoDe(agora) < data ? "antecipada" : "atrasada");
  return (await getDoc(REF_AUDITORIA(data))).data()?.foto || null;
};

// o que fica no histórico de cada alteração (sem undefined: o Firestore não aceita)
const resumoAlteracao = (a) =>
  JSON.parse(
    JSON.stringify({
      chave: a.chave,
      hora: a.hora,
      tipoServico: a.tipoServico,
      servico: a.servico,
      veiculoAntes: a.antes?.veiculo || "",
      veiculoDepois: a.depois?.veiculo || "",
      mudancas: a.mudancas.map((m) => ({ tipo: m.tipo, de: m.de ?? "", para: m.para ?? "", qtd: m.qtd ?? 0, custo: m.custo || 0 })),
      deltaTabela: a.deltaTabela,
      custoRegras: a.custoRegras,
      impacto: a.impacto,
    }),
  );

// grava no histórico as alterações que ainda não estavam lá
export const registrarNoHistorico = async (data, alteracoes = [], historicoAtual = null) => {
  const atual = historicoAtual || (await getDoc(REF_AUDITORIA(data))).data()?.historico || {};
  const novas = alteracoes.filter((a) => !atual[idSeguro(a.id)]);
  const patch = { ultimaVerificacao: Timestamp.now() };
  if (novas.length) patch.historico = Object.fromEntries(novas.map((a) => [idSeguro(a.id), { em: Timestamp.now(), ...resumoAlteracao(a) }]));
  await setDoc(REF_AUDITORIA(data), patch, { merge: true });
  return novas.length;
};

export const rodarAuditoriaAutomatica = async (usuario, contexto = null) => {
  const ctx = contexto || (await carregarContexto());
  const hoje = isoDe(new Date());
  const foto = await garantirProgramacao(hoje, ctx, usuario);
  if (!foto) return 0;
  const linhas = await calcularLinhasDoDia(hoje, ctx);
  const rel = compararComFoto(foto, linhas, ctx.config.auditoria);
  return registrarNoHistorico(hoje, rel.alteracoes);
};
