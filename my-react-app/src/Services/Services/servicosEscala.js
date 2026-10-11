// servicosEscala.js
//
// Lista de serviços que ficam FORA da escala automática (não recebem guia
// e não aparecem no Gerar Escala). Antes ficava escrita no código; agora
// fica em settings/scale.servicosForaDaEscala e é editada pela tela
// (Configurações → Escala e Mapa de afinidade).

import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import {
  SERVICOS_FORA_DA_ESCALA_PADRAO,
  definirServicosForaDaEscala,
  normalizarTexto,
  obterNomeCanonico,
} from "./plannerUtils";

const chaveDoNome = (nome = "") => normalizarTexto(obterNomeCanonico(nome));

// o serviço (pelo nome) está na lista?
export const estaForaDaEscala = (nome = "", lista = []) => {
  const chave = chaveDoNome(nome);
  return !!chave && lista.some((n) => chaveDoNome(n) === chave);
};

// lista a partir do documento de configuração (padrão se nunca foi salva)
export const listaForaDaEscalaDe = (settings = {}) =>
  Array.isArray(settings?.servicosForaDaEscala)
    ? settings.servicosForaDaEscala
    : [...SERVICOS_FORA_DA_ESCALA_PADRAO];

let carregamento = null;

// Carrega a lista (uma vez por sessão, a não ser que `forcar`) e já deixa
// a escala usando ela.
export const carregarServicosForaDaEscala = async (forcar = false) => {
  if (!carregamento || forcar) {
    carregamento = getDoc(doc(db, "settings", "scale"))
      .then((snap) => {
        const lista = listaForaDaEscalaDe(snap.exists() ? snap.data() : {});
        definirServicosForaDaEscala(lista);
        return lista;
      })
      .catch((err) => {
        console.error("Erro ao carregar serviços fora da escala:", err);
        carregamento = null;
        return [...SERVICOS_FORA_DA_ESCALA_PADRAO];
      });
  }
  return carregamento;
};

// Grava a lista inteira (sem repetidos) e atualiza a escala na hora.
export const salvarServicosForaDaEscala = async (lista = []) => {
  const vistos = new Set();
  const limpa = lista
    .map((n) => String(n || "").trim())
    .filter((n) => {
      const chave = chaveDoNome(n);
      if (!n || vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    })
    .sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));

  await setDoc(
    doc(db, "settings", "scale"),
    { servicosForaDaEscala: limpa, updatedAt: new Date() },
    { merge: true },
  );
  definirServicosForaDaEscala(limpa);
  carregamento = Promise.resolve(limpa);
  return limpa;
};

// Coloca ou tira um serviço da lista.
export const alternarServicoForaDaEscala = async (nome, lista, colocarFora) => {
  const semEle = lista.filter((n) => chaveDoNome(n) !== chaveDoNome(nome));
  return salvarServicosForaDaEscala(colocarFora ? [...semEle, nome] : semEle);
};
