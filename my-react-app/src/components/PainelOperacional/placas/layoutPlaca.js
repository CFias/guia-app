// layoutPlaca.js
//
// Calcula ONDE vai cada texto/linha da placa (em mm, A4 deitado) e devolve
// uma lista de "peças". A mesma lista é desenhada no PDF (pdfPlaca.js) e na
// pré-visualização (PlacaPreview.jsx) — por isso o que se vê é o que sai.
// As larguras dos textos são medidas pelo próprio jsPDF, com as mesmas
// fontes do PDF (Helvetica e Times).

import jsPDF from "jspdf";
import { ALTURA, LARGURA, margensDoModelo, reservaInferior } from "./artePlaca";
import { subtituloDoTema } from "./temasRegiao";

const PT = 0.35278; // 1 pt em mm
const ALTURA_MAIUSCULA = { helvetica: 0.718, times: 0.662 };

const COR = {
  titulo: [52, 58, 64],
  cinza: [108, 117, 125],
  nome: [33, 37, 41],
  mensagem: [95, 102, 109],
  linha: [213, 216, 219],
  separador: [184, 189, 194],
  faixa: [238, 240, 242],
  pilula: [201, 205, 209],
  hotel: [73, 80, 87],
};

let medidor = null;
const doc = () => {
  if (!medidor) medidor = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  return medidor;
};

export const medirTexto = (texto, { font = "helvetica", style = "normal", size = 12 } = {}) => {
  const d = doc();
  d.setFont(font, style);
  d.setFontSize(size);
  return d.getTextWidth(String(texto || ""));
};

// "MARIA DE FATIMA SOUZA LIMA" → "MARIA DE FATIMA"; "joão pereira" → "JOÃO PEREIRA"
export const extrairTextoNomePlaca = (nome = "") => {
  if (!nome) return "NOME NÃO INFORMADO";
  const partes = String(nome).trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (partes.length <= 2) return partes.join(" ").toUpperCase();
  const conectores = ["de", "da", "do", "dos", "das"];
  if (conectores.includes(String(partes[1] || "").toLowerCase()) && partes.length >= 3) {
    return partes.slice(0, 3).join(" ").toUpperCase();
  }
  return partes.slice(0, 2).join(" ").toUpperCase();
};

export const formatarDataPlaca = (dataIso = "") => {
  if (!dataIso) return "";
  const [ano, mes, dia] = String(dataIso).split("-");
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : "";
};

const texto = (txt, x, y, opcoes) => ({ t: "texto", txt, x, y, ...opcoes });

// maior tamanho (pt) com que o texto cabe na largura
const tamanhoQueCabe = (txt, largura, { font, style, max, min = 10 }) => {
  const w = medirTexto(txt, { font, style, size: max });
  if (!w) return max;
  return Math.max(min, Math.min(max, (max * largura) / w));
};

// Cabeçalho comum: logo, "LUCK RECEPTIVO", subtítulo e o voo.
const cabecalho = ({ margens, voo, subtitulo, subtituloItalico, mostrarVoo }) => {
  const pecas = [];
  const y = margens.topo;
  pecas.push({ t: "logo", x: margens.x, y, w: 19, h: 19 });
  pecas.push(texto("LUCK RECEPTIVO", margens.x + 24, y + 8, { font: "helvetica", style: "bold", size: 16, cor: COR.titulo }));
  if (subtitulo) {
    pecas.push(
      texto(subtitulo, margens.x + 24, y + 14.8, {
        font: subtituloItalico ? "times" : "helvetica",
        style: subtituloItalico ? "italic" : "normal",
        size: subtituloItalico ? 14 : 11,
        cor: COR.cinza,
      }),
    );
  }
  if (mostrarVoo) {
    const xDir = LARGURA - margens.x;
    pecas.push(texto("V O O", xDir, y + 3.6, { font: "helvetica", style: "normal", size: 9, cor: COR.cinza, align: "right" }));
    pecas.push(texto(String(voo || "").trim().toUpperCase() || "—", xDir, y + 16, { font: "helvetica", style: "normal", size: 34, cor: COR.titulo, align: "right" }));
  }
  const yLinha = y + 22;
  pecas.push({ t: "linha", x1: margens.x, y1: yLinha, x2: LARGURA - margens.x, y2: yLinha, w: 0.3, cor: COR.linha });
  return { pecas, yLinha };
};

const rodape = ({ margens, data, extraDireita }) => {
  const pecas = [];
  const y = ALTURA - Math.max(5, margens.base - 1);
  if (data) pecas.push(texto(`Operacional · Luck Receptivo · ${formatarDataPlaca(data)}`, margens.x, y, { font: "helvetica", style: "normal", size: 8, cor: COR.cinza }));
  if (extraDireita) pecas.push(texto(extraDireita, LARGURA - margens.x, y, { font: "helvetica", style: "normal", size: 8, cor: COR.cinza, align: "right" }));
  return pecas;
};

// divide o nome em duas linhas o mais equilibradas possível
const dividirEmDuas = (nome) => {
  const palavras = nome.split(" ");
  if (palavras.length < 2) return [nome];
  let melhor = null;
  for (let i = 1; i < palavras.length; i += 1) {
    const a = palavras.slice(0, i).join(" ");
    const b = palavras.slice(i).join(" ");
    const dif = Math.abs(a.length - b.length);
    if (!melhor || dif < melhor.dif) melhor = { linhas: [a, b], dif };
  }
  return melhor.linhas;
};

/* Placa individual.
   dados: { nome, voo, hotel, mensagem (texto pronto), data }
   opcoes: { mostrarVoo, mostrarHotel, mostrarRodape } */
export const layoutIndividual = (modelo, dados = {}, opcoes = {}) => {
  const margens = margensDoModelo(modelo);
  const { pecas, yLinha } = cabecalho({
    margens,
    voo: dados.voo,
    subtitulo: subtituloDoTema(),
    mostrarVoo: opcoes.mostrarVoo !== false,
  });

  const fontNome = modelo.letra === "elegante" ? "times" : "helvetica";
  const nome = String(dados.nome || "").trim() || "NOME NÃO INFORMADO";
  const larguraUtil = LARGURA - margens.x * 2 - 14;
  const topo = yLinha + 4;
  const fundo = ALTURA - reservaInferior(modelo);
  const alturaUtil = fundo - topo;

  const msg = String(dados.mensagem || "").trim();
  const hotel = opcoes.mostrarHotel ? String(dados.hotel || "").trim() : "";
  const tamMsg = msg ? tamanhoQueCabe(msg, larguraUtil, { font: "times", style: "italic", max: 32, min: 14 }) : 0;
  const altMsg = msg ? tamMsg * PT * 0.9 : 0;
  const altHotel = hotel ? 11 : 0;
  const folgas = (msg ? 7 : 0) + (hotel ? 7 : 0);

  // nome: uma linha com a maior letra possível; se ficar pequena demais,
  // quebra em duas linhas equilibradas
  const capFator = ALTURA_MAIUSCULA[fontNome] * PT;
  const maxPorAltura = (alturaUtil - altMsg - altHotel - folgas) / capFator;
  const maxNome = Math.min(120, maxPorAltura);
  let linhas = [nome];
  let tam = tamanhoQueCabe(nome, larguraUtil, { font: fontNome, style: "bold", max: maxNome, min: 18 });
  if (tam < 58 && nome.includes(" ")) {
    const duas = dividirEmDuas(nome);
    const maior = duas.reduce((a, b) => (medirTexto(a, { font: fontNome, style: "bold", size: 10 }) >= medirTexto(b, { font: fontNome, style: "bold", size: 10 }) ? a : b));
    const maxDuas = Math.min(96, (alturaUtil - altMsg - altHotel - folgas) / (capFator * 2.35));
    const tamDuas = tamanhoQueCabe(maior, larguraUtil, { font: fontNome, style: "bold", max: maxDuas, min: 18 });
    if (tamDuas > tam * 1.12) {
      linhas = duas;
      tam = tamDuas;
    }
  }
  const capNome = tam * capFator;
  const entreLinhas = capNome * 1.35;
  const altNome = capNome + (linhas.length - 1) * entreLinhas;

  const altBloco = altMsg + altNome + altHotel + folgas;
  let y = topo + (alturaUtil - altBloco) / 2;
  const cx = LARGURA / 2;

  if (msg) {
    y += altMsg;
    pecas.push(texto(msg, cx, y, { font: "times", style: "italic", size: tamMsg, cor: COR.mensagem, align: "center" }));
    y += 7;
  }
  linhas.forEach((linha, i) => {
    const yl = y + capNome + i * entreLinhas;
    pecas.push(texto(linha, cx, yl, { font: fontNome, style: "bold", size: tam, cor: COR.nome, align: "center" }));
  });
  y += altNome;
  if (hotel) {
    y += 7;
    const tamHotel = 18;
    const txtHotel = hotel.length > 60 ? `${hotel.slice(0, 58)}…` : hotel;
    const w = Math.min(larguraUtil, medirTexto(txtHotel, { size: tamHotel }) + 12);
    pecas.push({ t: "retangulo", x: cx - w / 2, y, w, h: altHotel, r: altHotel / 2, borda: COR.pilula, espessura: 0.3 });
    pecas.push(texto(txtHotel, cx, y + altHotel / 2 + tamHotel * PT * 0.36, { font: "helvetica", style: "normal", size: tamHotel, cor: COR.hotel, align: "center" }));
  }

  if (opcoes.mostrarRodape) pecas.push(...rodape({ margens, data: dados.data }));
  return pecas;
};

/* Divide os nomes do voo em placas de no máximo `porPlaca` nomes. */
export const paginarColecao = (nomes = [], porPlaca = 5) => {
  const n = Math.min(5, Math.max(1, Number(porPlaca) || 5));
  const paginas = [];
  for (let i = 0; i < nomes.length; i += n) paginas.push(nomes.slice(i, i + n));
  return paginas;
};

/* Uma página da placa coleção: um nome por faixa, todos do mesmo tamanho.
   opcoes: { porPlaca, separacao: linha|caixa|faixa, tamanho: auto|manual,
             escala, mostrarVoo, mostrarRodape, mensagem (texto pronto) }
   pagina: { nomes: [texto], numero, total } */
export const layoutColecao = ({ nomes = [], numero = 1, total = 1 }, dados = {}, opcoes = {}) => {
  const margens = margensDoModelo({});
  const { pecas, yLinha } = cabecalho({
    margens,
    voo: dados.voo,
    subtitulo: dados.mensagem || subtituloDoTema(),
    subtituloItalico: !!dados.mensagem,
    mostrarVoo: opcoes.mostrarVoo !== false,
  });

  const separacao = opcoes.separacao || "linha";
  const topo = yLinha + 4;
  const fundo = ALTURA - 13;
  const gap = separacao === "caixa" ? 2.5 : 0;
  const linhas = Math.max(1, nomes.length);
  const altLinha = (fundo - topo - gap * (linhas - 1)) / linhas;
  const xa = margens.x;
  const larguraFaixa = LARGURA - margens.x * 2;
  const larguraTexto = larguraFaixa - 16;

  const capFator = ALTURA_MAIUSCULA.helvetica * PT;
  const maxPorAltura = (altLinha * 0.6) / capFator;
  const teto = maxPorAltura * 1.2; // limite do manual: a letra nunca encosta na faixa vizinha
  // quanto cada nome aguenta na largura
  const cabe = nomes.map((n) => tamanhoQueCabe(n, larguraTexto, { font: "helvetica", style: "bold", max: teto, min: 14 }));
  // automático: a maior letra em que o nome mais longo da página cabe
  const auto = Math.min(maxPorAltura, ...(cabe.length ? cabe : [maxPorAltura]));
  const manual = opcoes.tamanho === "manual";
  const escala = manual ? Math.min(1.3, Math.max(0.7, Number(opcoes.escala) || 1)) : 1;
  const alvo = Math.min(teto, auto * escala);

  nomes.forEach((nome, i) => {
    const y = topo + i * (altLinha + gap);
    if (separacao === "faixa" && i % 2 === 0) {
      pecas.push({ t: "retangulo", x: xa, y, w: larguraFaixa, h: altLinha, r: 0, fundo: COR.faixa });
    }
    if (separacao === "caixa") {
      pecas.push({ t: "retangulo", x: xa, y, w: larguraFaixa, h: altLinha, r: 2.5, borda: COR.separador, espessura: 0.6 });
    }
    if (separacao === "linha" && i > 0) {
      pecas.push({ t: "linha", x1: xa, y1: y, x2: xa + larguraFaixa, y2: y, w: 0.6, cor: COR.separador });
    }
    // no manual, um nome que não caberia na largura diminui só ele
    const tam = Math.min(alvo, cabe[i]);
    const yBase = y + altLinha / 2 + (tam * capFator) / 2;
    pecas.push(texto(nome, LARGURA / 2, yBase, { font: "helvetica", style: "bold", size: tam, cor: COR.nome, align: "center" }));
  });

  pecas.push(
    ...rodape({
      margens,
      data: opcoes.mostrarRodape ? dados.data : "",
      extraDireita: total > 1 ? `${numero}/${total}` : "",
    }),
  );
  return pecas;
};
