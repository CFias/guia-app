// acessosRepository.js
//
// Controle de acessos por tela (ver Context/acessos.js e firestore.rules).
//  - settings/acessos: marca que o controle foi ativado (e por quem).
//  - users/{uid}.gerencia: true → acesso total e pode mudar os acessos.
//  - users/{uid}.acessos: { chaveDaTela: false } → tela bloqueada.

import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";

const REF_CONTROLE = () => doc(db, "settings", "acessos");

export const controleAtivado = async () =>
  (await getDoc(REF_CONTROLE())).exists();

export const listarContas = async () => {
  const snap = await getDocs(collection(db, "users"));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
};

// Primeira vez: quem ativa vira gerência (o firestore.rules só deixa isso
// acontecer UMA vez — depois, só a gerência promove outras contas).
export const ativarControle = async ({ uid, nome }) => {
  const lote = writeBatch(db);
  lote.set(REF_CONTROLE(), {
    ativadoEm: Timestamp.now(),
    ativadoPor: { uid, nome: nome || "" },
  });
  lote.update(doc(db, "users", uid), {
    gerencia: true,
    gerenciaDesde: Timestamp.now(),
  });
  await lote.commit();
};

export const salvarAcessosConta = async (uid, { gerencia, acessos }, autor) => {
  // só guarda as telas BLOQUEADAS (false); o resto é liberado
  const bloqueadas = Object.fromEntries(
    Object.entries(acessos || {}).filter(([, v]) => v === false),
  );
  await updateDoc(doc(db, "users", uid), {
    gerencia: !!gerencia,
    acessos: bloqueadas,
    acessosAtualizadoEm: Timestamp.now(),
    acessosAtualizadoPor: { uid: autor.uid, nome: autor.nome || "" },
  });
};
