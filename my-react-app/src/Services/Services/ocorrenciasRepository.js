// ocorrenciasRepository.js
//
// OCORRÊNCIAS DE FORNECEDORES
//   ocorrencias/{id} → uma por fato (atraso, não compareceu, elogio…), com o
//   retrato do serviço do Phoenix (data, hora, tipo, veículo, fornecedor,
//   motorista) e o que aconteceu (categoria, responsável, gravidade,
//   impactos, descrição, status). Só o operacional lê e grava (regra geral
//   do firestore.rules).

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import { mapaFornecedorPorVeiculo, chaveDoVeiculo } from "./custosCalculo";
import { buscarServicosDoDia, emLotes } from "./custosRepository";
import { chaveFornecedor, normalizarOcorrencia } from "./ocorrenciasCalculo";

const COLECAO = () => collection(db, "ocorrencias");

const comId = (d) => ({ id: d.id, ...d.data() });

const quem = (usuario, uid) => ({
  uid: uid || "",
  nome: usuario?.nome || usuario?.email || "",
});

// período por data do serviço (AAAA-MM-DD), mais recente primeiro
const consultaPeriodo = (inicio, fim) =>
  query(
    COLECAO(),
    where("data", ">=", inicio),
    where("data", "<=", fim),
    orderBy("data", "desc"),
  );

export const ouvirOcorrencias = (inicio, fim, aoMudar, aoErro) =>
  onSnapshot(
    consultaPeriodo(inicio, fim),
    (snap) => aoMudar(snap.docs.map(comId)),
    (e) => {
      console.error("Erro ao ler ocorrências:", e);
      aoErro?.(e);
      aoMudar([]);
    },
  );

export const carregarOcorrencias = async (inicio, fim) => {
  try {
    const snap = await getDocs(consultaPeriodo(inicio, fim));
    return snap.docs.map(comId);
  } catch (e) {
    console.error("Erro ao ler ocorrências:", e);
    return [];
  }
};

export const salvarOcorrencia = async (id, formulario, usuario, uid) => {
  const dados = normalizarOcorrencia(formulario);
  const agora = Timestamp.now();
  if (id) {
    await updateDoc(doc(db, "ocorrencias", id), {
      ...dados,
      atualizadoEm: agora,
      atualizadoPor: quem(usuario, uid),
    });
    return id;
  }
  const ref = await addDoc(COLECAO(), {
    ...dados,
    criadoEm: agora,
    criadoPor: quem(usuario, uid),
  });
  return ref.id;
};

export const marcarResolvida = (id, resolvida, resolucao, usuario, uid) =>
  updateDoc(doc(db, "ocorrencias", id), {
    status: resolvida ? "resolvida" : "aberta",
    ...(resolucao !== undefined
      ? { resolucao: String(resolucao || "").trim() }
      : {}),
    atualizadoEm: Timestamp.now(),
    atualizadoPor: quem(usuario, uid),
  });

export const excluirOcorrencia = (id) => deleteDoc(doc(db, "ocorrencias", id));

// Quantos serviços cada fornecedor fez no período (para "ocorrências a cada
// 100 serviços"). Consulta o Phoenix dia a dia.
export const contarServicosPorFornecedor = async (
  datas,
  { config, vinculos, fornecedores },
  aoProgredir,
) => {
  const porVeiculo = mapaFornecedorPorVeiculo(vinculos, fornecedores);
  const contagem = {};
  let feitos = 0;
  const falhas = [];
  await emLotes(datas, 3, async (data) => {
    try {
      const { servicos } = await buscarServicosDoDia(data, config.tarifas);
      servicos.forEach((s) => {
        const fixa = s.tarifaFixaId
          ? config.tarifas.find((t) => t.id === s.tarifaFixaId)
          : null;
        const nome =
          fixa?.fornecedor ||
          porVeiculo[s.veiculoKey] ||
          porVeiculo[chaveDoVeiculo("", s.veiculo)] ||
          "";
        if (!nome) return;
        const k = chaveFornecedor(nome);
        contagem[k] = (contagem[k] || 0) + 1;
      });
    } catch (e) {
      console.error("Falha ao contar serviços de", data, e);
      falhas.push(data);
    }
    feitos += 1;
    aoProgredir?.(feitos, datas.length);
  });
  return { contagem, falhas };
};
