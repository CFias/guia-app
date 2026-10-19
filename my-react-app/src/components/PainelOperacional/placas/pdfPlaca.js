// pdfPlaca.js
//
// Gera os PDFs das placas (A4 deitado). Fundo (trevo, moldura e desenho) vai
// como imagem, uma vez por modelo; nomes e textos são escritos pelo jsPDF.

import jsPDF from "jspdf";
import {
  ALTURA,
  LARGURA,
  carregarLogoPequeno,
  carregarTrevoCinza,
  rasterizarArte,
  svgArte,
} from "./artePlaca";
import { layoutColecao, layoutIndividual, paginarColecao } from "./layoutPlaca";
import { carregarFontesPlaca, registrarFontesNoPdf } from "./fontesPlaca";

const novoDoc = () => registrarFontesNoPdf(new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" }));

export const desenharPecas = (doc, pecas, { logo } = {}) => {
  pecas.forEach((p) => {
    if (p.t === "texto") {
      doc.setFont(p.font || "helvetica", p.style || "normal");
      doc.setFontSize(p.size);
      doc.setTextColor(...(p.cor || [0, 0, 0]));
      doc.text(String(p.txt ?? ""), p.x, p.y, p.align && p.align !== "left" ? { align: p.align } : undefined);
    } else if (p.t === "linha") {
      doc.setDrawColor(...(p.cor || [0, 0, 0]));
      doc.setLineWidth(p.w || 0.3);
      doc.line(p.x1, p.y1, p.x2, p.y2);
    } else if (p.t === "retangulo") {
      const modo = p.fundo && p.borda ? "FD" : p.fundo ? "F" : "S";
      if (p.fundo) doc.setFillColor(...p.fundo);
      if (p.borda) {
        doc.setDrawColor(...p.borda);
        doc.setLineWidth(p.espessura || 0.3);
      }
      if (p.r) doc.roundedRect(p.x, p.y, p.w, p.h, p.r, p.r, modo);
      else doc.rect(p.x, p.y, p.w, p.h, modo);
    } else if (p.t === "logo" && logo) {
      doc.addImage(logo, "PNG", p.x, p.y, p.w, p.h, "logo_luck", "FAST");
    }
  });
};

const nomeArquivo = (prefixo, txt) =>
  `${prefixo}-${String(txt || "placa").trim().replace(/[^\w-]+/g, "-").replace(/-+/g, "-")}.pdf`;

const recursos = async (modelo, tipo) => {
  const [logo, trevo] = await Promise.all([carregarLogoPequeno(), carregarTrevoCinza(), carregarFontesPlaca()]);
  const fundo = await rasterizarArte(svgArte(modelo, { tipo, trevo }));
  return { logo, fundo };
};

/* placas: [{ nome (já no formato da placa), voo, hotel, mensagem }]
   opcoes: { mostrarVoo, mostrarHotel, mostrarRodape, data } */
export const gerarPdfIndividuais = async ({ placas = [], modelo, opcoes = {}, arquivo }) => {
  if (!placas.length) return;
  const { logo, fundo } = await recursos(modelo, "individual");
  const doc = novoDoc();
  const alias = `fundo_${modelo.id || "modelo"}`;
  placas.forEach((dados, i) => {
    if (i > 0) doc.addPage();
    doc.addImage(fundo, "JPEG", 0, 0, LARGURA, ALTURA, alias, "FAST");
    desenharPecas(doc, layoutIndividual(modelo, { ...dados, data: opcoes.data }, opcoes), { logo });
  });
  doc.save(arquivo || nomeArquivo("placas", placas.length === 1 ? placas[0].nome : placas[0].voo));
};

/* nomes: [texto] já ordenados; opcoes da coleção (ver layoutColecao).
   Vários voos de uma vez: paginas = [{ voo, nomes, numero, total, mensagem }]
   (cada voo começa numa folha nova, com a numeração dele). */
export const gerarPdfColecao = async ({ voo, nomes = [], mensagem = "", paginas, opcoes = {}, trevo = 0.06, arquivo }) => {
  const folhas =
    paginas ||
    paginarColecao(nomes, opcoes.porPlaca).map((p, i, todas) => ({ voo, nomes: p, numero: i + 1, total: todas.length, mensagem }));
  if (!folhas.length) return;
  const { logo, fundo } = await recursos({ trevo }, "colecao");
  const doc = novoDoc();
  folhas.forEach((f, i) => {
    if (i > 0) doc.addPage();
    doc.addImage(fundo, "JPEG", 0, 0, LARGURA, ALTURA, "fundo_colecao", "FAST");
    desenharPecas(
      doc,
      layoutColecao(
        { nomes: f.nomes, numero: f.numero, total: f.total },
        { voo: f.voo, mensagem: f.mensagem, data: opcoes.data },
        { ...opcoes, nomesReferencia: f.referencia || folhas.filter((x) => x.voo === f.voo).flatMap((x) => x.nomes) },
      ),
      { logo },
    );
  });
  doc.save(arquivo || nomeArquivo("placa-colecao", folhas[0].voo));
};
