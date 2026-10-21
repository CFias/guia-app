// atividadeRepository.js
//
// Registro de uso do sistema (Balanço de uso) e avaliações.
//
//  - atividade_diaria/{uid}__{AAAA-MM-DD}: um documento por pessoa por dia
//    { uid, nome, role, regiao, dia, ultimo, logins, telasVistas, impressoes,
//      telas: { chave: n }, acoes: { chave: n }, rotulos: { chave: "Nome" },
//      eventos: [{ em, tipo, rotulo, detalhe }] (até ~150 por dia) }
//    Quem grava é a própria pessoa (firestore.rules); quem lê é a gerência e
//    as contas marcadas com users/{uid}.verBalanco.
//  - users/{uid}: ultimoLogin, ultimoAcesso, ultimaTela (a própria conta grava).
//  - avaliacoes/{uid}: { nota 0–5, comentario, nome, role, regiao, atualizadoEm,
//    criadoEm } — uma por pessoa (pode mudar quando quiser).
//
// Tudo aqui é "melhor esforço": se falhar (sem rede, regra antiga), o uso do
// sistema continua normal — só o registro é perdido.

import {
  Timestamp,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";

export const COL_ATIVIDADE = "atividade_diaria";
export const COL_AVALIACOES = "avaliacoes";
const LIMITE_EVENTOS_DIA = 150;

// dia em Salvador (UTC-3), "2026-10-20"
export const diaLocal = (data = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(data);

export const diaMenos = (dias, base = new Date()) =>
  diaLocal(new Date(base.getTime() - dias * 86400000));

// chave segura para campo de mapa no Firestore ("/op" → "op", "placas.pdf" → "placas_pdf")
const chaveSegura = (t = "") =>
  String(t || "inicio")
    .replace(/^\/+/, "")
    .replace(/[^\w-]+/g, "_")
    .slice(0, 60) || "inicio";

// ---------- quem está usando (preenchido pelo RegistroAtividade) ----------
let atual = null; // { uid, nome, role, regiao }
const eventosNaSessao = {}; // dia → quantos eventos esta aba já gravou
export const definirUsuarioAtividade = (u) => {
  atual = u && u.uid ? u : null;
};

// Convite para avaliar o sistema: aparece DEPOIS de uma ação concluída
// (imprimir placas, consultar a Central, enviar a disponibilidade…) — ver
// AvaliacaoSistema.jsx. Quem só navega também recebe, depois de várias telas.
export const EVENTO_ACAO = "luck:acao-concluida";
const TELAS_PARA_CONVITE = 8;
let telasNaSessao = 0;
const avisarAcao = (chave, rotulo) => {
  try {
    window.dispatchEvent(
      new CustomEvent(EVENTO_ACAO, { detail: { chave, rotulo } }),
    );
  } catch {
    /* navegador sem CustomEvent: sem convite */
  }
};

const gravar = async ({ tipo, chave, rotulo, detalhe = "" }) => {
  if (!atual) return;
  if ((tipo === "impressao" || tipo === "acao") && chave !== "avaliacao")
    avisarAcao(chave, rotulo);
  if (tipo === "tela" && (telasNaSessao += 1) === TELAS_PARA_CONVITE)
    avisarAcao("navegacao", "");
  const dia = diaLocal();
  const ref = doc(db, COL_ATIVIDADE, `${atual.uid}__${dia}`);
  const k = chaveSegura(chave);
  const n = (eventosNaSessao[dia] = (eventosNaSessao[dia] || 0) + 1);
  const dados = {
    uid: atual.uid,
    nome: atual.nome || "",
    role: atual.role || "",
    regiao: atual.regiao || "ssa",
    dia,
    ultimo: Timestamp.now(),
  };
  if (tipo === "login") dados.logins = increment(1);
  if (tipo === "tela") {
    dados.telasVistas = increment(1);
    dados.telas = { [k]: increment(1) };
    dados.rotulos = { [k]: String(rotulo || chave).slice(0, 80) };
  }
  if (tipo === "impressao" || tipo === "acao") {
    if (tipo === "impressao") dados.impressoes = increment(1);
    dados.acoes = { [k]: increment(1) };
    dados.rotulos = { [k]: String(rotulo || chave).slice(0, 80) };
  }
  if (n <= LIMITE_EVENTOS_DIA) {
    dados.eventos = arrayUnion({
      em: Date.now(),
      tipo,
      rotulo: String(rotulo || chave || "").slice(0, 80),
      detalhe: String(detalhe || "").slice(0, 120),
    });
  }
  try {
    await setDoc(ref, dados, { merge: true });
  } catch (e) {
    if (n === 1)
      console.warn(
        "Registro de uso não gravado (confira o firestore.rules):",
        e?.code || e,
      );
  }
};

export const registrarTela = (rota, rotulo) =>
  gravar({ tipo: "tela", chave: rota, rotulo });

// TEMPO DE USO: segundos com a tela aberta, a aba visível e a pessoa
// mexendo no sistema (sem interação por 15 min, para de contar). O
// RegistroAtividade junta os segundos e grava a cada ~2 min, de uma vez:
//   trechos = [{ rota, rotulo, segundos }]
// Grava também a hora do dia (horas.{"14"}) e a base em uso (tempoBase.{nat}).
const horaLocal = () =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
export const registrarTempo = async (trechos = [], baseEmUso = "ssa") => {
  if (!atual) return;
  const validos = trechos.filter((t) => t.segundos > 0);
  if (!validos.length) return;
  const total = Math.round(validos.reduce((s, t) => s + t.segundos, 0));
  const dia = diaLocal();
  const tempo = {};
  const rotulos = {};
  validos.forEach((t) => {
    const k = chaveSegura(t.rota);
    tempo[k] = increment(Math.round(t.segundos));
    rotulos[k] = String(t.rotulo || t.rota).slice(0, 80);
  });
  try {
    await setDoc(
      doc(db, COL_ATIVIDADE, `${atual.uid}__${dia}`),
      {
        uid: atual.uid,
        nome: atual.nome || "",
        role: atual.role || "",
        regiao: atual.regiao || "ssa",
        dia,
        ultimo: Timestamp.now(),
        tempoTotal: increment(total),
        tempo,
        rotulos,
        horas: { [horaLocal()]: increment(total) },
        tempoBase: { [String(baseEmUso || "ssa")]: increment(total) },
      },
      { merge: true },
    );
  } catch {
    /* sem rede: perde só este trecho */
  }
};
// impressões / PDFs / relatórios: registrarImpressao("placas_colecao", "Placas coleção", "23 placas")
export const registrarImpressao = (chave, rotulo, detalhe) =>
  gravar({ tipo: "impressao", chave, rotulo, detalhe });
export const registrarAcao = (chave, rotulo, detalhe) =>
  gravar({ tipo: "acao", chave, rotulo, detalhe });

export const registrarLogin = async (uid, perfil) => {
  definirUsuarioAtividade({
    uid,
    nome: perfil?.nome,
    role: perfil?.role,
    regiao: perfil?.regiao,
  });
  await gravar({ tipo: "login", chave: "login", rotulo: "Entrou no sistema" });
  try {
    await updateDoc(doc(db, "users", uid), {
      ultimoLogin: serverTimestamp(),
      ultimoAcesso: serverTimestamp(),
    });
  } catch {
    /* regra antiga: segue sem o último login */
  }
};

// "estou aqui": atualiza o último acesso (e a tela) a cada poucos minutos
export const registrarPulso = async (uid, tela) => {
  try {
    await updateDoc(doc(db, "users", uid), {
      ultimoAcesso: serverTimestamp(),
      ultimaTela: String(tela || "").slice(0, 80),
    });
  } catch {
    /* sem rede ou regra antiga */
  }
};

export const listarAtividade = async (dias = 30) => {
  const snap = await getDocs(
    query(
      collection(db, COL_ATIVIDADE),
      where("dia", ">=", diaMenos(dias - 1)),
    ),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

// ---------- avaliações ----------
export const minhaAvaliacao = async (uid) => {
  const s = await getDoc(doc(db, COL_AVALIACOES, uid));
  return s.exists() ? { id: s.id, ...s.data() } : null;
};

export const salvarAvaliacao = async (
  uid,
  { nota, comentario, nome, role, regiao },
  jaExistia,
) => {
  await setDoc(
    doc(db, COL_AVALIACOES, uid),
    {
      uid,
      nota: Math.max(0, Math.min(5, Math.round(Number(nota) || 0))),
      comentario: String(comentario || "")
        .trim()
        .slice(0, 1000),
      nome: nome || "",
      role: role || "",
      regiao: regiao || "ssa",
      atualizadoEm: Timestamp.now(),
      ...(jaExistia ? {} : { criadoEm: Timestamp.now() }),
    },
    { merge: true },
  );
};

export const listarAvaliacoes = async () => {
  const snap = await getDocs(collection(db, COL_AVALIACOES));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

// resposta ao convite: { adiadoAte: ms } ("Depois" → 1 hora) ou { dispensado: true }
export const salvarConviteAvaliacao = (uid, convite) =>
  updateDoc(doc(db, "users", uid), { avaliacaoConvite: convite });

// quem pode ver o Balanço de uso (marcado pela gerência)
export const definirVerBalanco = (uid, valor) =>
  updateDoc(doc(db, "users", uid), { verBalanco: !!valor });
