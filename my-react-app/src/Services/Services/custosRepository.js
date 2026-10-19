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
