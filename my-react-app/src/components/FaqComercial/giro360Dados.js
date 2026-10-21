// giro360.js
//
// Giro 360º do veículo: uma sequência de fotos tiradas em volta do carro
// (ou um vídeo dando a volta nele, de onde o sistema tira os quadros). Na
// Central, arrastar para o lado gira o carro.
//
// Guardado como UM arquivo (JSON com os quadros em JPEG) em `arquivos`
// (arquivosRepository — o projeto não usa Firebase Storage). O item do
// veículo (faq_itens) guarda só { arquivoId, quadros, atualizadoEm }.
// Comercial e operacional já leem `arquivos` pelas regras atuais.

import { enviarArquivo, lerArquivoTexto, removerArquivo } from "../../Services/Services/arquivosRepository";

export const MIN_QUADROS = 8;
export const MAX_QUADROS = 36;
export const QUADROS_DO_VIDEO = 24;
const LADO = 960;
const QUALIDADE = 0.7;

const desenhar = (fonte, largura, altura) => {
  const escala = Math.min(1, LADO / Math.max(largura, altura));
  const c = document.createElement("canvas");
  c.width = Math.round(largura * escala);
  c.height = Math.round(altura * escala);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(fonte, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", QUALIDADE);
};

const carregarImagem = (arquivo) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`A foto ${arquivo.name} não pôde ser lida.`));
    };
    img.src = url;
  });

// fotos na ordem do nome do arquivo (IMG_001, IMG_002…)
export const quadrosDeFotos = async (arquivos, aoProgredir) => {
  const fotos = Array.from(arquivos || [])
    .filter((f) => f.type.startsWith("image/"))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { numeric: true }))
    .slice(0, MAX_QUADROS);
  const quadros = [];
  for (let i = 0; i < fotos.length; i += 1) {
    const img = await carregarImagem(fotos[i]);
    quadros.push(desenhar(img, img.width, img.height));
    aoProgredir?.((i + 1) / fotos.length);
  }
  return quadros;
};

// vídeo dando a volta no carro → N quadros espaçados igualmente
export const quadrosDeVideo = (arquivo, total = QUADROS_DO_VIDEO, aoProgredir) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    const quadros = [];
    let i = 0;
    const falhar = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Este vídeo não pôde ser lido pelo navegador. Tente um MP4 (H.264)."));
    };
    const proximo = () => {
      if (i >= total) {
        URL.revokeObjectURL(url);
        resolve(quadros);
        return;
      }
      // um pouco antes do fim para não pegar quadro preto
      video.currentTime = Math.min(video.duration - 0.05, (video.duration * i) / total);
    };
    video.onerror = falhar;
    video.onloadeddata = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) return falhar();
      proximo();
      return undefined;
    };
    video.onseeked = () => {
      quadros.push(desenhar(video, video.videoWidth, video.videoHeight));
      i += 1;
      aoProgredir?.(i / total);
      proximo();
    };
  });

// grava (ou substitui, com o mesmo id) e devolve o que vai no item
export const salvarGiro360 = async (quadros, { arquivoId, aoProgredir } = {}) => {
  const json = JSON.stringify({ versao: 1, quadros });
  const arquivo = new File([json], "giro-360.json", { type: "application/json" });
  const meta = await enviarArquivo(arquivo, { id: arquivoId, aoProgredir });
  return { arquivoId: meta.id, quadros: quadros.length, atualizadoEm: Date.now() };
};

export const removerGiro360 = (arquivoId) => removerArquivo(arquivoId);

// leitura com cache (a mesma volta não é baixada duas vezes na sessão)
const cache = new Map();
export const lerGiro360 = (arquivoId) => {
  if (!arquivoId) return Promise.resolve([]);
  if (!cache.has(arquivoId)) {
    const p = lerArquivoTexto(arquivoId)
      .then((t) => {
        const dados = JSON.parse(t);
        return Array.isArray(dados?.quadros) ? dados.quadros : [];
      })
      .catch((e) => {
        cache.delete(arquivoId);
        throw e;
      });
    cache.set(arquivoId, p);
  }
  return cache.get(arquivoId);
};
export const esquecerGiro360 = (arquivoId) => cache.delete(arquivoId);
