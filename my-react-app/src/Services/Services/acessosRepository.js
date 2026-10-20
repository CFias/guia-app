// acessosRepository.js
//
// Controle de acessos por tela (ver Context/acessos.js e firestore.rules).
//  - settings/acessos: marca que o controle foi ativado (e por quem).
//  - users/{uid}.gerencia: true → acesso total e pode mudar os acessos.
//  - users/{uid}.acessos: { chaveDaTela: false } → tela bloqueada.

import { Timestamp, collection, doc, getDoc, getDocs, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

const REF_CONTROLE = () => doc(db, "settings", "acessos");

export const controleAtivado = async () => (await getDoc(REF_CONTROLE())).exists();

export const listarContas = async () => {
  const snap = await getDocs(collection(db, "users"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
};

// A GERÊNCIA não se ativa pelo sistema: só uma conta da gerência promove
// outra (Controle de acessos). A primeira gerência é definida pelo
// administrador no Firebase (users/{uid}.gerencia = true).

export const salvarAcessosConta = async (uid, { gerencia, acessos }, autor) => {
  // só guarda as telas BLOQUEADAS (false); o resto é liberado
  const bloqueadas = Object.fromEntries(Object.entries(acessos || {}).filter(([, v]) => v === false));
  await updateDoc(doc(db, "users", uid), {
    gerencia: !!gerencia,
    acessos: bloqueadas,
    acessosAtualizadoEm: Timestamp.now(),
    acessosAtualizadoPor: { uid: autor.uid, nome: autor.nome || "" },
  });
};
