// regioesRepository.js
//
// Cadastro das bases Luck (Gestão → Regiões), em settings/regioes:
//   { lista: [{ id, nome, sigla, phoenix, telas: [chave…], ativa }], atualizadoEm }
// Salvador (a sede) não fica na lista: é fixa (regiaoAtiva.js → SEDE).

import { doc, onSnapshot, setDoc, Timestamp } from "firebase/firestore";
import { db } from "./firebase";
import { ID_SEDE, SEDE, TELAS_PRONTAS, normalizarLinkPhoenix, phoenixReserveService } from "./regiaoAtiva";

const REF = () => doc(db, "settings", "regioes");

const CHAVES_TELAS = TELAS_PRONTAS.map((t) => t.chave);

// "Natal" → "nat"; "João Pessoa" → "jpa" se a sigla vier; senão das letras do nome
export const idDaSigla = (sigla = "", nome = "") => {
  const base = String(sigla || nome)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return base.slice(0, 12);
};

export const normalizarRegiao = (r = {}) => ({
  id: String(r.id || idDaSigla(r.sigla, r.nome)),
  nome: String(r.nome || "").trim(),
  sigla: String(r.sigla || "").trim().toUpperCase().slice(0, 5),
  phoenix: normalizarLinkPhoenix(r.phoenix),
  telas: Array.isArray(r.telas) ? r.telas.filter((c) => CHAVES_TELAS.includes(c)) : [...CHAVES_TELAS],
  aeroporto: false,
  ativa: r.ativa !== false,
  // tema das placas (placas/temasRegiao.js); vazio = pelo nome da base
  tema: typeof r.tema === "string" ? r.tema.trim().slice(0, 12) : "",
});

export const validarRegioes = (lista = []) => {
  const erros = [];
  const ids = new Set([ID_SEDE]);
  lista.forEach((r, i) => {
    const nome = r.nome || `Região ${i + 1}`;
    if (!r.nome) erros.push(`Região ${i + 1}: informe o nome.`);
    if (!r.sigla) erros.push(`${nome}: informe a sigla.`);
    if (!r.phoenix) erros.push(`${nome}: link do Phoenix inválido.`);
    if (r.phoenix && normalizarLinkPhoenix(r.phoenix) === SEDE.phoenix) erros.push(`${nome}: esse é o link do Phoenix de Salvador.`);
    if (!r.id) erros.push(`${nome}: sigla inválida.`);
    else if (ids.has(r.id)) erros.push(`${nome}: a sigla ${r.sigla} já está em uso.`);
    ids.add(r.id);
    if (!r.telas.length) erros.push(`${nome}: marque pelo menos uma tela.`);
  });
  return erros;
};

export const ouvirRegioes = (aoMudar, aoErro) =>
  onSnapshot(
    REF(),
    (snap) => {
      const lista = snap.exists() && Array.isArray(snap.data()?.lista) ? snap.data().lista : [];
      aoMudar(lista.map(normalizarRegiao).filter((r) => r.id && r.id !== ID_SEDE));
    },
    (e) => {
      console.error("Erro ao ler regiões:", e);
      aoErro?.(e);
    },
  );

export const salvarRegioes = async (lista, uid) => {
  const limpa = lista.map(normalizarRegiao);
  const erros = validarRegioes(limpa);
  if (erros.length) throw new Error(erros.join("\n"));
  await setDoc(REF(), { lista: limpa, atualizadoEm: Timestamp.now(), atualizadoPor: uid || "" });
  return limpa;
};

const isoHoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Confere se o link responde: busca os serviços de hoje no Phoenix da base.
export const testarPhoenix = async (link) => {
  const origem = normalizarLinkPhoenix(link);
  if (!origem) return { ok: false, texto: "Link inválido." };
  const url = `${phoenixReserveService({ phoenix: origem })}?execution_date=${isoHoje()}&expand=service`;
  try {
    const resp = await fetch(url, { headers: { Accept: "application/json" } });
    if (!resp.ok) return { ok: false, texto: `O Phoenix respondeu com erro ${resp.status}.` };
    const json = await resp.json();
    const lista = [json, json?.data, json?.results, json?.rows, json?.items, json?.content, json?.data?.data].find(Array.isArray);
    if (!lista) return { ok: false, texto: "Respondeu, mas não no formato do Phoenix." };
    return { ok: true, texto: `Conectado: ${lista.length} serviço(s) hoje.` };
  } catch {
    return { ok: false, texto: "Não foi possível conectar (link errado ou bloqueado pelo navegador)." };
  }
};
