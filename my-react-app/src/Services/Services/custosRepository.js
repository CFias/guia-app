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
import {
  compararComFoto,
  conferenciaSuspeita,
  fotoDaLinha,
  linhaDaAlteracao,
  resumoDoBalanco,
} from "./auditoriaAlteracoes";
import {
  colecaoDaBase,
  idPorRegiao,
  phoenixReserveService,
  regiaoAtual,
} from "./regiaoAtiva";
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

// reserve.customer: nome do passageiro (painel do fornecedor e link do motorista)
const EXPAND =
  "service,schedule,reserve,reserve.customer,establishmentOrigin,establishmentDestination,establishmentOrigin.region,establishmentDestination.region,roadmapService,roadmapService.roadmap,auxRoadmapService.roadmap,auxRoadmapService.roadmap.serviceOrder,auxRoadmapService.roadmap.serviceOrder.vehicle,auxRoadmapService.roadmap.driver,auxRoadmapService.roadmap.guide,roadmapService.roadmap.driver,roadmapService.roadmap.guide,roadmapService.roadmap.serviceOrder,roadmapService.roadmap.serviceOrder.vehicle";

// Cada base tem os próprios custos: Salvador usa os documentos de sempre;
// as outras bases, os mesmos com o sufixo (settings/custos__nat,
// custos_dia__nat, auditoria_dia__nat…). r = a base; sem ela, a base em uso.
const REF_CONFIG = (r = regiaoAtual()) =>
  doc(db, "settings", idPorRegiao("custos", r));
const REF_VINCULOS = (r = regiaoAtual()) =>
  doc(db, "settings", idPorRegiao("vinculos_veiculos_fornecedor", r));
const REF_DIA = (data, r = regiaoAtual()) =>
  doc(db, colecaoDaBase("custos_dia", r), data);
const REF_AUDITORIA = (data, r = regiaoAtual()) =>
  doc(db, colecaoDaBase("auditoria_dia", r), data);

/* ---------------- Phoenix ---------------- */

const urlPhoenix = (data, tipos, regiao) => {
  const p = new URLSearchParams();
  p.append("execution_date", data);
  p.append("expand", EXPAND);
  tipos.forEach((t) => p.append("service_type[]", t));
  return `${regiao ? phoenixReserveService(regiao) : phoenixReserveService()}?${p.toString()}`;
};

const lista = (json) => {
  if (Array.isArray(json)) return json;
  for (const c of [json?.data, json?.results, json?.rows, json?.items])
    if (Array.isArray(c)) return c;
  return [];
};

const buscarJson = async (url) => {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`Phoenix respondeu ${r.status}`);
  return lista(await r.json());
};

// Transfers (IN/OUT/transfer) e passeios do dia, já um por escala
// Reservas do dia como vêm do Phoenix (a tela consolida com as tarifas)
export const buscarItensDoDia = async (data, regiao) => {
  const [base, passeios] = await Promise.all([
    buscarJson(urlPhoenix(data, ["1", "2", "4"], regiao)),
    buscarJson(urlPhoenix(data, ["3"], regiao)),
  ]);
  return [
    ...base.map((i) => ({ ...i, __dataMapa: data })),
    ...passeios.map((i) => ({ ...i, __dataMapa: data, __passeio: true })),
  ];
};

// Transfers e passeios do dia, já um por escala (e os serviços de parceiro
// reconhecidos pelas tarifas)
export const buscarServicosDoDia = async (data, tarifas = [], regiao) =>
  consolidarServicos(await buscarItensDoDia(data, regiao), data, tarifas);

// nomes de serviço vistos no Phoenix (sugestão no cadastro de tarifa de parceiro)
export const registrarServicosConhecidos = (nomes = []) =>
  nomes.length
    ? setDoc(
        REF_CONFIG(),
        { servicosConhecidos: arrayUnion(...nomes) },
        { merge: true },
      )
    : Promise.resolve();

/* ---------------- configuração ---------------- */

export const ouvirConfigCustos = (aoMudar, aoErro) =>
  onSnapshot(
    REF_CONFIG(),
    (snap) =>
      aoMudar(
        normalizarConfigCustos(snap.exists() ? snap.data() : {}),
        snap.exists(),
      ),
    (e) => {
      console.error("Erro ao ler settings/custos:", e);
      aoErro?.(e);
      aoMudar(normalizarConfigCustos({}), false);
    },
  );

export const salvarConfigCustos = (patch) =>
  setDoc(
    REF_CONFIG(),
    { ...patch, atualizadoEm: Timestamp.now() },
    { merge: true },
  );

export const fixarCategoriaVeiculo = (veiculoKey, categoria) =>
  setDoc(
    REF_CONFIG(),
    {
      categoriasVeiculo: { [veiculoKey]: categoria || deleteField() },
      atualizadoEm: Timestamp.now(),
    },
    { merge: true },
  );

export const registrarRegioes = (regioes = []) =>
  regioes.length
    ? setDoc(
        REF_CONFIG(),
        { regioesConhecidas: arrayUnion(...regioes) },
        { merge: true },
      )
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

export const salvarVinculoVeiculo = (
  veiculoKey,
  { fornecedor, veiculoNome = "", placa = "" },
) =>
  setDoc(
    REF_VINCULOS(),
    {
      vinculos: {
        [veiculoKey]: fornecedor
          ? { fornecedor, veiculoNome, placa }
          : deleteField(),
      },
      updatedAt: Timestamp.now(),
    },
    { merge: true },
  );

export const carregarFornecedores = async (r = regiaoAtual()) => {
  try {
    const snap = await getDocs(collection(db, colecaoDaBase("providers", r)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("Erro ao ler fornecedores:", e);
    return [];
  }
};

export const carregarNomesDePasseios = async () => {
  try {
    const snap = await getDocs(collection(db, colecaoDaBase("services")));
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
  return setDoc(
    REF_DIA(data),
    { data, linhas, sincronizadoEm: Timestamp.now() },
    { merge: true },
  );
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
  setDoc(
    REF_DIA(data),
    { data, resumo, resumoEm: Timestamp.now() },
    { merge: true },
  );

export const excluirLinha = (data, chave) =>
  setDoc(
    REF_DIA(data),
    { linhas: { [chave]: deleteField() } },
    { merge: true },
  );

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
  await Promise.all(
    Array.from({ length: Math.min(tamanho, itens.length) }, trabalhador),
  );
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
export const calcularDiasPelaTabela = async (
  datas,
  { config, vinculos, fornecedores },
  aoProgredir,
) => {
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
      const resumo = resumoDoDia(
        recomendarTrocas(servicos, ctx),
        alertasDoDia(linhas),
      );
      await setDoc(
        REF_DIA(data),
        {
          data,
          status: "rascunho",
          linhas: retratos,
          resumo,
          resumoEm: Timestamp.now(),
          sincronizadoEm: Timestamp.now(),
          calculadoPelaTabela: true,
        },
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

// os serviços do dia com o custo pela tabela (sem lançamentos à mão).
// ctx.regiao fixa a base (Phoenix e documentos da MESMA base do começo ao
// fim, mesmo que a gerência troque a base no topo no meio da conferência).
export const calcularLinhasDoDia = async (
  data,
  { config, vinculos, fornecedores, regiao },
) => {
  const fornecedorPorVeiculo = mapaFornecedorPorVeiculo(vinculos, fornecedores);
  const capacidades = mapaCapacidadePorVeiculo(fornecedores);
  const { servicos } = await buscarServicosDoDia(
    data,
    config.tarifas,
    regiao || regiaoAtual(),
  );
  const pares = detectarCasados(servicos, config.casado);
  const apoios = detectarApoios(servicos);
  const ctx = { fornecedorPorVeiculo, config, pares, apoios, capacidades };
  return servicos.map((s) => calcularLinha(s, {}, ctx));
};

export const ouvirAuditoria = (data, aoMudar, r = regiaoAtual()) =>
  onSnapshot(
    REF_AUDITORIA(data, r),
    (snap) => aoMudar(snap.exists() ? snap.data() : null),
    (e) => {
      console.error("Erro ao ler a auditoria do dia:", e);
      aoMudar(null);
    },
  );

// tira (ou refaz) a foto da escala de um dia: substitui a foto e zera o "visto às"
export const tirarFotoDaEscala = async (
  data,
  ctx,
  usuario,
  origem = "manual",
) => {
  const linhas = await calcularLinhasDoDia(data, ctx);
  const fotos = Object.fromEntries(
    linhas.map((l) => [l.chave, fotoDaLinha(l)]),
  );
  await setDoc(REF_AUDITORIA(data, ctx.regiao), {
    data,
    foto: {
      em: Timestamp.now(),
      por: quem(usuario),
      origem,
      servicos: linhas.length,
      linhas: fotos,
    },
    atualizadoEm: Timestamp.now(),
  });
  return linhas.length;
};

const idSeguro = (id) =>
  String(id)
    .replace(/[^\w|:,-]/g, "_")
    .slice(0, 300);
export const chaveDaVista = idSeguro;
const isoDe = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const lerVinculos = async (r) => {
  const snap = await getDoc(REF_VINCULOS(r));
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
const carregarContexto = async (regiao = regiaoAtual()) => ({
  regiao,
  config: normalizarConfigCustos(
    (await getDoc(REF_CONFIG(regiao))).data() || {},
  ),
  vinculos: await lerVinculos(regiao),
  fornecedores: await carregarFornecedores(regiao),
});

// guarda a programação do dia, se ainda não foi guardada; devolve a foto
export const garantirProgramacao = async (data, ctx, usuario) => {
  const snap = await getDoc(REF_AUDITORIA(data, ctx.regiao));
  if (snap.exists() && snap.data()?.foto) return snap.data().foto;
  // ninguém estava com o sistema aberto na virada: vale a última versão
  // da programação guardada na véspera (a "prévia", atualizada a cada 10 min)
  const previa = snap.exists() ? snap.data()?.previa : null;
  const agoraV = new Date();
  const naViradaV =
    isoDe(agoraV) === data &&
    agoraV.getHours() === 0 &&
    agoraV.getMinutes() < 30;
  if (!naViradaV && previa?.linhas && Object.keys(previa.linhas).length) {
    const em = previa.em?.toDate?.() || null;
    if (em && isoDe(em) < data) {
      const foto = { ...previa, origem: "vespera" };
      await setDoc(
        REF_AUDITORIA(data, ctx.regiao),
        { data, foto, previa: deleteField(), atualizadoEm: Timestamp.now() },
        { merge: true },
      );
      return foto;
    }
  }
  const agora = new Date();
  const naVirada =
    isoDe(agora) === data && agora.getHours() === 0 && agora.getMinutes() < 30;
  await tirarFotoDaEscala(
    data,
    ctx,
    usuario,
    naVirada ? "meia-noite" : isoDe(agora) < data ? "antecipada" : "atrasada",
  );
  return (await getDoc(REF_AUDITORIA(data, ctx.regiao))).data()?.foto || null;
};

// o que fica no histórico de cada alteração (sem undefined: o Firestore não aceita)
const resumoAlteracao = (a) =>
  JSON.parse(
    JSON.stringify({
      chave: a.chave,
      hora: a.hora,
      tipoServico: a.tipoServico,
      servico: a.servico,
      classe: a.classe || "",
      titulo: a.titulo || "",
      veiculoAntes: a.veiculosAntes ?? (a.antes?.veiculo || ""),
      veiculoDepois: a.veiculosDepois ?? (a.depois?.veiculo || ""),
      veiculosAntes: a.veiculosAntes || "",
      veiculosDepois: a.veiculosDepois || "",
      totalAntes: a.totalAntes ?? 0,
      totalDepois: a.totalDepois ?? 0,
      mudancas: a.mudancas.map((m) => ({
        tipo: m.tipo,
        de: m.de ?? "",
        para: m.para ?? "",
        qtd: m.qtd ?? 0,
        custo: m.custo || 0,
        id: m.id || "",
      })),
      deltaTabela: a.deltaTabela,
      custoRegras: a.custoRegras,
      impacto: a.impacto,
    }),
  );

// id fixo para a mesma leva de alterações (dois computadores abertos não duplicam o aviso)
const hashTexto = (t) => {
  let h = 5381;
  for (let i = 0; i < t.length; i += 1)
    h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};
const dataBrCurta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/* Aviso no sino (todo o Operacional): "3 alterações na escala de 24/10",
   com uma linha por alteração — sem valores (nem todos têm acesso a Custos). */
export const notificarAlteracoes = (data, novas = [], r = regiaoAtual()) => {
  if (!novas.length) return Promise.resolve();
  const id = `aud_${data}_${hashTexto(
    novas
      .map((a) => a.id)
      .sort()
      .join("|"),
  )}`;
  return setDoc(doc(db, colecaoDaBase("notificacoes", r), id), {
    tipo: "auditoria",
    origem: "sistema",
    data,
    titulo: `${novas.length} atualizaç${novas.length > 1 ? "ões" : "ão"} na programação de ${dataBrCurta(data)}`,
    linhas: novas.slice(0, 6).map(linhaDaAlteracao),
    total: novas.length,
    createdAt: Timestamp.now(),
  });
};

// grava no histórico as alterações que ainda não estavam lá (e avisa no sino);
// com `rel`, guarda também o resumo do dia que alimenta o Balanço
export const registrarNoHistorico = async (
  data,
  alteracoes = [],
  historicoAtual = null,
  rel = null,
  r = regiaoAtual(),
) => {
  const docAtual = (await getDoc(REF_AUDITORIA(data, r))).data() || {};
  const atual = historicoAtual || docAtual.historico || {};
  const novas = alteracoes.filter((a) => !atual[idSeguro(a.id)]);
  const patch = { ultimaVerificacao: Timestamp.now(), suspeita: deleteField() };
  if (rel) patch.resumo = { ...resumoDoBalanco(rel), em: Timestamp.now() };
  if (novas.length)
    patch.historico = Object.fromEntries(
      novas.map((a) => [
        idSeguro(a.id),
        { em: Timestamp.now(), ...resumoAlteracao(a) },
      ]),
    );
  await setDoc(REF_AUDITORIA(data, r), patch, { merge: true });
  if (novas.length)
    await notificarAlteracoes(data, novas, r).catch((e) =>
      console.error("Aviso da auditoria:", e),
    );
  return novas.length;
};

// confere um dia contra a programação; conferência suspeita (Phoenix pela
// metade) não grava nada
export const conferirDia = async (data, ctx, foto) => {
  const linhas = await calcularLinhasDoDia(data, ctx);
  if (conferenciaSuspeita(foto, linhas)) {
    await setDoc(
      REF_AUDITORIA(data, ctx.regiao),
      { ultimaVerificacao: Timestamp.now(), suspeita: Timestamp.now() },
      { merge: true },
    );
    return 0;
  }
  const rel = compararComFoto(foto, linhas, ctx.config.auditoria);
  return registrarNoHistorico(data, rel.alteracoes, null, rel, ctx.regiao);
};

// a programação de amanhã como está agora (vira a "foto" se ninguém estiver
// com o sistema aberto à meia-noite)
export const guardarPreviaDeAmanha = async (ctx, agora = new Date()) => {
  const amanha = new Date(
    agora.getFullYear(),
    agora.getMonth(),
    agora.getDate() + 1,
  );
  const data = isoDe(amanha);
  const snap = await getDoc(REF_AUDITORIA(data, ctx.regiao));
  if (snap.exists() && snap.data()?.foto) return 0;
  const linhas = await calcularLinhasDoDia(data, ctx);
  if (!linhas.length) return 0;
  const fotos = Object.fromEntries(
    linhas.map((l) => [l.chave, fotoDaLinha(l)]),
  );
  await setDoc(
    REF_AUDITORIA(data, ctx.regiao),
    {
      data,
      previa: {
        em: Timestamp.now(),
        por: "sistema",
        servicos: linhas.length,
        linhas: fotos,
      },
    },
    { merge: true },
  );
  return linhas.length;
};

export const rodarAuditoriaAutomatica = async (
  usuario,
  contexto = null,
  regiao = null,
) => {
  const ctx = contexto?.regiao
    ? contexto
    : contexto
      ? { ...contexto, regiao: regiao || regiaoAtual() }
      : await carregarContexto(regiao || regiaoAtual());
  const agora = new Date();
  const hoje = isoDe(agora);
  const foto = await garantirProgramacao(hoje, ctx, usuario);
  const n = foto ? await conferirDia(hoje, ctx, foto) : 0;
  // fecha o dia de ontem (pega o que mudou depois da última conferência)
  const ontem = isoDe(
    new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 1),
  );
  const docOntem = (await getDoc(REF_AUDITORIA(ontem, ctx.regiao))).data();
  if (docOntem?.foto && !docOntem.fechado) {
    await conferirDia(ontem, ctx, docOntem.foto);
    await setDoc(
      REF_AUDITORIA(ontem, ctx.regiao),
      { fechado: Timestamp.now() },
      { merge: true },
    );
  }
  // a partir do meio-dia, vai guardando a programação de amanhã
  if (agora.getHours() >= 12) await guardarPreviaDeAmanha(ctx, agora);
  return n;
};

// Balanço: o resumo de cada dia do período (só os dias com programação guardada)
export const carregarBalanco = async (datas = [], r = regiaoAtual()) =>
  (
    await emLotes(datas, 10, async (data) => {
      const snap = await getDoc(REF_AUDITORIA(data, r));
      const d = snap.exists() ? snap.data() : null;
      return d?.foto
        ? {
            data,
            resumo: d.resumo || null,
            foto: {
              em: d.foto.em || null,
              origem: d.foto.origem || "",
              servicos: d.foto.servicos || 0,
            },
            historico: Object.keys(d.historico || {}).length,
            fechado: !!d.fechado,
          }
        : null;
    })
  ).filter(Boolean);

// apaga do histórico registros que não valem (ex.: os que voltaram atrás)
export const descartarDoHistorico = (data, chaves = [], r = regiaoAtual()) =>
  chaves.length
    ? setDoc(
        REF_AUDITORIA(data, r),
        {
          historico: Object.fromEntries(chaves.map((k) => [k, deleteField()])),
        },
        { merge: true },
      )
    : Promise.resolve();

// só o resumo do Balanço (dia passado aberto no auditor, sem mexer no histórico)
export const gravarResumoDoBalanco = (data, rel, r = regiaoAtual()) =>
  setDoc(
    REF_AUDITORIA(data, r),
    { resumo: { ...resumoDoBalanco(rel), em: Timestamp.now() } },
    { merge: true },
  );
