// prontidaoRepository.js
//
// PRONTIDÃO DO DIA
//   Lê o que o robô precisa (reservas do Phoenix do dia, cadastro de guias,
//   disponibilidade dos guias e ocorrências recentes dos fornecedores) e
//   guarda o que a equipe já conferiu:
//   prontidao_dia/{AAAA-MM-DD}.verificados.{id} = { por, em, nota }

import {
  collection,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { buscarItensDoDia } from "./custosRepository";
import { carregarOcorrencias } from "./ocorrenciasRepository";
import { fornecedoresEmAlerta } from "./ocorrenciasCalculo";

const REF_DIA = (data) => doc(db, "prontidao_dia", data);

// chave do mapa no Firestore (sem caracteres que atrapalham caminhos)
export const chaveVerificado = (id = "") =>
  String(id).replace(/[.~*/[\]`]/g, "_");

const menosDias = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

const lerColecao = async (nome) => {
  try {
    const snap = await getDocs(collection(db, nome));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error(`Erro ao ler ${nome}:`, e);
    return [];
  }
};

export const buscarDadosProntidao = async (data) => {
  const [itens, guias, disp, ocorrencias] = await Promise.all([
    buscarItensDoDia(data),
    lerColecao("guides"),
    lerColecao("guide_availability"),
    carregarOcorrencias(menosDias(data, 30), data),
  ]);
  // disponibilidade: lista de { day, date } (ou só a data, em cadastros antigos)
  const disponibilidades = Object.fromEntries(
    disp.map((d) => [
      d.guideId || d.id,
      (Array.isArray(d.disponibilidade) ? d.disponibilidade : [])
        .map((x) => (typeof x === "string" ? x : x?.date || ""))
        .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)),
    ]),
  );
  return {
    itens,
    guias,
    disponibilidades,
    alertasFornecedor: fornecedoresEmAlerta(ocorrencias, {
      ate: data,
      dias: 30,
    }),
  };
};

export const ouvirVerificados = (data, aoMudar) =>
  onSnapshot(
    REF_DIA(data),
    (snap) => aoMudar(snap.exists() ? snap.data()?.verificados || {} : {}),
    (e) => {
      console.error("Erro ao ler prontidão do dia:", e);
      aoMudar({});
    },
  );

export const marcarVerificado = (data, id, verificado, usuario, nota = "") =>
  setDoc(
    REF_DIA(data),
    {
      data,
      verificados: {
        [chaveVerificado(id)]: verificado
          ? {
              por: usuario?.nome || usuario?.email || "",
              em: Timestamp.now(),
              nota: String(nota || "").trim(),
            }
          : deleteField(),
      },
      atualizadoEm: Timestamp.now(),
    },
    { merge: true },
  );
