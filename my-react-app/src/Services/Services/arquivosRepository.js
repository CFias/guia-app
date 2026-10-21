// arquivosRepository.js
//
// Arquivos anexados (PDF, imagem, Word, Excel…) sem Firebase Storage — o
// projeto não usa Storage. O arquivo vira base64 e é guardado em partes no
// Firestore (cada documento aceita até 1 MB):
//   arquivos/{id}                { nome, tipo, tamanho, partes, criadoEm, atualizadoEm }
//   arquivos/{id}/partes/{0..n}  { i, dados }   (base64, ~700 KB cada)
// "condicoes_gerais" é o id fixo do documento de Condições gerais da Central.
// Leitura: operacional (regra geral) e comercial; gravação: só operacional.

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

export const ID_CONDICOES_GERAIS = "condicoes_gerais";
export const LIMITE_ARQUIVO_MB = 15;
const TAMANHO_PARTE = 700 * 1024; // caracteres de base64 por documento

const refMeta = (id) => doc(db, "arquivos", id);
const refParte = (id, i) => doc(db, "arquivos", id, "partes", String(i));

const novoId = () =>
  `arq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const lerBase64 = (arquivo) =>
  new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result).split(",")[1] || "");
    leitor.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    leitor.readAsDataURL(arquivo);
  });

export const formatarTamanho = (bytes = 0) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

// tipo curto para o ícone/etiqueta (PDF, IMG, DOC, XLS…)
export const tipoCurto = (meta = {}) => {
  const t = String(meta.tipo || "").toLowerCase();
  const ext = String(meta.nome || "").split(".").pop().toLowerCase();
  if (t.includes("pdf") || ext === "pdf") return "PDF";
  if (t.startsWith("image/")) return "IMG";
  if (/word|document/.test(t) || ["doc", "docx"].includes(ext)) return "DOC";
  if (/sheet|excel/.test(t) || ["xls", "xlsx", "csv"].includes(ext)) return "XLS";
  if (/presentation|powerpoint/.test(t) || ["ppt", "pptx"].includes(ext)) return "PPT";
  return ext ? ext.toUpperCase().slice(0, 4) : "ARQ";
};

const apagarPartes = async (id, aPartirDe = 0) => {
  const snap = await getDocs(collection(db, "arquivos", id, "partes"));
  await Promise.all(
    snap.docs.filter((d) => Number(d.id) >= aPartirDe).map((d) => deleteDoc(d.ref)),
  );
};

// Envia (ou substitui, com `id`) um arquivo. Devolve a meta { id, nome, tipo, tamanho }.
export const enviarArquivo = async (arquivo, { id, aoProgredir } = {}) => {
  if (!arquivo) throw new Error("Escolha um arquivo.");
  if (arquivo.size > LIMITE_ARQUIVO_MB * 1024 * 1024) {
    throw new Error(`O arquivo passa de ${LIMITE_ARQUIVO_MB} MB. Reduza o tamanho e tente de novo.`);
  }
  const arquivoId = id || novoId();
  const base64 = await lerBase64(arquivo);
  const partes = Math.max(1, Math.ceil(base64.length / TAMANHO_PARTE));

  for (let i = 0; i < partes; i += 1) {
    await setDoc(refParte(arquivoId, i), {
      i,
      dados: base64.slice(i * TAMANHO_PARTE, (i + 1) * TAMANHO_PARTE),
    });
    aoProgredir?.((i + 1) / partes);
  }
  // substituindo um arquivo maior: apaga as partes que sobraram
  if (id) await apagarPartes(arquivoId, partes).catch(() => { });

  const meta = {
    nome: arquivo.name || "arquivo",
    tipo: arquivo.type || "application/octet-stream",
    tamanho: arquivo.size || 0,
    partes,
    atualizadoEm: Timestamp.now(),
  };
  await setDoc(refMeta(arquivoId), { ...meta, criadoEm: Timestamp.now() }, { merge: true });
  return { id: arquivoId, nome: meta.nome, tipo: meta.tipo, tamanho: meta.tamanho };
};

export const lerMetaArquivo = async (id) => {
  const snap = await getDoc(refMeta(id));
  return snap.exists() ? { id, ...snap.data() } : null;
};

export const removerArquivo = async (id) => {
  if (!id) return;
  await apagarPartes(id).catch(() => { });
  await deleteDoc(refMeta(id));
};

const montarBlob = async (id) => {
  const meta = await lerMetaArquivo(id);
  if (!meta) throw new Error("Arquivo não encontrado.");
  const snap = await getDocs(collection(db, "arquivos", id, "partes"));
  const base64 = snap.docs
    .map((d) => d.data())
    .sort((a, b) => Number(a.i) - Number(b.i))
    .map((p) => p.dados || "")
    .join("");
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return { meta, blob: new Blob([bytes], { type: meta.tipo || "application/octet-stream" }) };
};

const abreNoNavegador = (tipo = "") => /pdf|^image\/|^text\//i.test(tipo);

// Abre numa aba nova (PDF/imagem/texto) ou baixa (Word, Excel…). A aba é
// aberta antes de buscar as partes, para o navegador não bloquear o pop-up.
export const abrirArquivo = async (id, { nome, tipo } = {}) => {
  const vaiAbrir = abreNoNavegador(tipo);
  const aba = vaiAbrir ? window.open("", "_blank") : null;
  if (aba) {
    aba.document.title = nome || "Abrindo arquivo…";
    aba.document.body.style.cssText = "font-family:system-ui,sans-serif;color:#555;padding:24px";
    aba.document.body.textContent = "Abrindo o arquivo…";
  }
  try {
    const { meta, blob } = await montarBlob(id);
    const url = URL.createObjectURL(blob);
    if (aba && abreNoNavegador(meta.tipo)) {
      aba.location.href = url;
    } else {
      aba?.close();
      const a = document.createElement("a");
      a.href = url;
      a.download = meta.nome || nome || "arquivo";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
  } catch (e) {
    aba?.close();
    throw e;
  }
};

// conteúdo do arquivo como texto (ex.: o JSON com os quadros do giro 360º)
export const lerArquivoTexto = async (id) => {
  const { blob } = await montarBlob(id);
  return blob.text();
};
