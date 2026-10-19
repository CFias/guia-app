// fontesPlaca.js
//
// Letras do nome na placa. As três primeiras são as fontes que o PDF já tem
// (Helvetica, Times e Courier); as outras são arquivos TTF próprios, só com
// os caracteres do português/espanhol/inglês (pequenos, 20–55 KB), em
// src/assets/fonts — todas de licença livre (ver src/assets/fonts/LICENCAS.md).
//
// Cada fonte própria é carregada uma vez (quando o painel das placas abre) e
// registrada em dois lugares:
// - no jsPDF (medição do layout e cada PDF gerado) — addFileToVFS/addFont;
// - no navegador (FontFace), para a pré-visualização sair igual ao PDF.
// Enquanto não carrega, o layout usa a Forte (Helvetica) no lugar.

import { useEffect, useState } from "react";
import modernaUrl from "../../../assets/fonts/placa-moderna.ttf";
import classicaUrl from "../../../assets/fonts/placa-classica.ttf";
import condensadaUrl from "../../../assets/fonts/placa-condensada.ttf";
import suaveUrl from "../../../assets/fonts/placa-suave.ttf";
import editorialUrl from "../../../assets/fonts/placa-editorial.ttf";
import cursivaUrl from "../../../assets/fonts/placa-cursiva.ttf";

// cap: altura da maiúscula (fração do tamanho) — usada para centralizar o nome
export const FONTES_PLACA = {
  forte: { label: "Forte", pdf: "helvetica", estilo: "bold", css: "Helvetica, Arial, sans-serif", peso: 700, cap: 0.718 },
  elegante: { label: "Elegante (serifa)", pdf: "times", estilo: "bold", css: '"Times New Roman", Times, serif', peso: 700, cap: 0.662 },
  moderna: { label: "Moderna", pdf: "PlacaModerna", estilo: "normal", css: '"PlacaModerna", sans-serif', peso: 400, cap: 0.705, url: modernaUrl },
  condensada: { label: "Condensada", pdf: "PlacaCondensada", estilo: "normal", css: '"PlacaCondensada", sans-serif', peso: 400, cap: 0.729, url: condensadaUrl },
  suave: { label: "Suave", pdf: "PlacaSuave", estilo: "normal", css: '"PlacaSuave", sans-serif', peso: 400, cap: 0.648, url: suaveUrl },
  classica: { label: "Clássica", pdf: "PlacaClassica", estilo: "normal", css: '"PlacaClassica", serif', peso: 400, cap: 0.667, url: classicaUrl },
  editorial: { label: "Editorial", pdf: "PlacaEditorial", estilo: "normal", css: '"PlacaEditorial", serif', peso: 400, cap: 0.7, url: editorialUrl },
  cursiva: { label: "Itálica", pdf: "PlacaCursiva", estilo: "normal", css: '"PlacaCursiva", serif', peso: 400, cap: 0.7, url: cursivaUrl },
  maquina: { label: "Máquina de escrever", pdf: "courier", estilo: "bold", css: '"Courier New", Courier, monospace', peso: 700, cap: 0.571 },
};

export const LETRAS = Object.entries(FONTES_PLACA).map(([value, f]) => ({ value, label: f.label }));

// ---------- carregamento ----------
const base64 = {}; // id → conteúdo do TTF em base64
let promessa = null;
const ouvintes = new Set();
let versao = 0;

const paraBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

export const versaoFontes = () => versao;

export const fonteCarregada = (id) => {
  const f = FONTES_PLACA[id];
  return !!f && (!f.url || !!base64[id]);
};

// fonte efetiva (cai na Forte enquanto a própria não carregou)
export const fonteDoNome = (id) => (fonteCarregada(id) ? FONTES_PLACA[id] : FONTES_PLACA.forte);

// registra as fontes próprias já carregadas num documento jsPDF
export const registrarFontesNoPdf = (doc) => {
  Object.entries(FONTES_PLACA).forEach(([id, f]) => {
    if (!f.url || !base64[id]) return;
    const arquivo = `${f.pdf}.ttf`;
    try {
      doc.addFileToVFS(arquivo, base64[id]);
      doc.addFont(arquivo, f.pdf, "normal");
    } catch (e) {
      console.error(`Fonte ${f.label} não entrou no PDF:`, e);
    }
  });
  return doc;
};

const carregarUma = async (id, f) => {
  const resp = await fetch(f.url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const buf = await resp.arrayBuffer();
  const Face = typeof window !== "undefined" ? window.FontFace : undefined;
  if (Face && document.fonts) {
    const face = new Face(f.pdf, buf.slice(0));
    await face.load();
    document.fonts.add(face);
  }
  base64[id] = paraBase64(buf);
};

// carrega todas as fontes próprias (uma vez); avisa quem está ouvindo
export const carregarFontesPlaca = () => {
  if (!promessa) {
    promessa = Promise.all(
      Object.entries(FONTES_PLACA)
        .filter(([, f]) => f.url)
        .map(([id, f]) =>
          carregarUma(id, f)
            .then(() => {
              versao += 1;
              ouvintes.forEach((fn) => fn(versao));
            })
            .catch((e) => console.error(`Não foi possível carregar a fonte ${f.label}:`, e)),
        ),
    );
  }
  return promessa;
};

// hook: dispara o carregamento e redesenha quando cada fonte fica pronta
export const useFontesPlaca = () => {
  const [v, setV] = useState(versao);
  useEffect(() => {
    ouvintes.add(setV);
    carregarFontesPlaca();
    return () => ouvintes.delete(setV);
  }, []);
  return v;
};
