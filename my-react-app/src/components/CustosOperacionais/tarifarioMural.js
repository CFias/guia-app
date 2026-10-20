// tarifarioMural.js
//
// Impressão do Tarifário para o MURAL: uma folha A4 deitada, de bater o
// olho — tipo de serviço, veículo e o valor. Uma grade única (colunas de
// veículo alinhadas de cima a baixo), tipos de serviço como faixas de seção,
// valores alinhados à direita e, se pedido, o casado logo embaixo.

import logoLuck from "../../assets/clover.png";
import { ladosIguais } from "./tarifarioGrade";
import { registrarImpressao } from "../../Services/Services/atividadeRepository";

const esc = (t) =>
  String(t ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const SUFIXO = { pax: "/pax", reserva: "/res." };

// um tom só (o verde da marca) para os tipos de serviço; o resto é tinta e cinza
const SECAO = {
  AEROPORTO: { nome: "Aeroporto", nota: "IN e OUT, valor por trecho" },
  TRF: { nome: "Transfer entre hotéis", nota: "" },
  PASSEIO: { nome: "Passeios", nota: "" },
  APOIO: { nome: "Apoio", nota: "valor por trecho" },
  SERVICO: { nome: "Parceiros", nota: "" },
};

// pictogramas de traço (imprimem bem em P&B)
const ICONE = {
  carro:
    '<svg viewBox="0 0 48 24"><path d="M6 17h36v-5l-6-6H14l-6 6H6z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="14" cy="18" r="3" fill="var(--tinta)" stroke="currentColor" stroke-width="2.2"/><circle cx="34" cy="18" r="3" fill="var(--tinta)" stroke="currentColor" stroke-width="2.2"/></svg>',
  van: '<svg viewBox="0 0 48 24"><path d="M5 18V6h26l8 6h4v6z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="13" cy="18" r="3" fill="var(--tinta)" stroke="currentColor" stroke-width="2.2"/><circle cx="35" cy="18" r="3" fill="var(--tinta)" stroke="currentColor" stroke-width="2.2"/></svg>',
  "van-alongada":
    '<svg viewBox="0 0 56 24"><path d="M3 18V6h36l8 6h6v6z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="11" cy="18" r="3" fill="var(--tinta)" stroke="currentColor" stroke-width="2.2"/><circle cx="43" cy="18" r="3" fill="var(--tinta)" stroke="currentColor" stroke-width="2.2"/></svg>',
  micro:
    '<svg viewBox="0 0 56 26"><rect x="3" y="4" width="48" height="15" rx="3" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M8 9h8M20 9h8M32 9h8" stroke="currentColor" stroke-width="2.2"/><circle cx="13" cy="20" r="3" fill="var(--tinta)" stroke="currentColor" stroke-width="2.2"/><circle cx="41" cy="20" r="3" fill="var(--tinta)" stroke="currentColor" stroke-width="2.2"/></svg>',
  onibus:
    '<svg viewBox="0 0 64 26"><rect x="2" y="3" width="58" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M7 8h8M19 8h8M31 8h8M43 8h8" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="20" r="3" fill="var(--tinta)" stroke="currentColor" stroke-width="2.2"/><circle cx="48" cy="20" r="3" fill="var(--tinta)" stroke="currentColor" stroke-width="2.2"/></svg>',
};

const ORDEM_COL = ["", "carro", "van", "van-alongada", "micro", "onibus"];
const NOME_COL = {
  "": "Qualquer veículo",
  carro: "Carro",
  van: "Van",
  "van-alongada": "Van alongada",
  micro: "Micro",
  onibus: "Ônibus",
};

const CSS = `
@page { size: A4 landscape; margin: 9mm 10mm; }
:root { --tinta: #18263a; --marca: #0f6b5a; --marca-claro: #eaf3f0; --linha: #dde2e8; --zebra: #f6f8fa; --cinza: #687385; }
* { box-sizing: border-box; }
body { margin: 0; color: var(--tinta); font-family: "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.topo { display: flex; align-items: flex-end; gap: 12px; padding-bottom: 10px; }
.topo img { width: 34px; height: 34px; }
.topo h1 { margin: 0; font-size: 24px; font-weight: 700; line-height: 1.1; letter-spacing: -.01em; }
.topo .sub { display: block; font-size: 12px; color: var(--cinza); margin-top: 2px; }
.topo .dir { margin-left: auto; text-align: right; font-size: 11px; color: var(--cinza); line-height: 1.5; }
.topo .dir b { color: var(--tinta); font-weight: 600; }
table { width: 100%; border-collapse: collapse; font-size: inherit; table-layout: fixed; }
thead th { background: var(--tinta); color: #fff; font-size: 11px; font-weight: 600; padding: 7px 8px 6px; text-align: right; vertical-align: bottom; border-left: 1px solid #2c3d55; }
thead th:first-child { text-align: left; border-left: 0; font-weight: 400; color: #b9c3d1; }
thead th svg { display: block; height: 16px; width: auto; margin: 0 0 3px auto; color: #fff; }
tr.secao th { text-align: left; padding: 9px 10px 5px; font-size: 13px; font-weight: 700; color: var(--marca); background: #fff; border-bottom: 2px solid var(--marca); }
tr.secao th span { font-weight: 400; font-size: 11px; color: var(--cinza); margin-left: 8px; }
td { padding: 6px 10px; border-bottom: 1px solid var(--linha); border-left: 1px solid var(--linha); vertical-align: middle; }
td:first-child { border-left: 0; border-right: 1px solid #c5ccd6; font-size: 11.5px; font-weight: 600; letter-spacing: .02em; text-transform: uppercase; line-height: 1.3; }
tr.z td { background: var(--zebra); }
td.v { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
td.v b { font-size: 16px; font-weight: 700; }
td.v .suf { font-size: 10px; color: var(--cinza); margin-left: 2px; }
td.v .cas { display: block; font-size: 10px; color: var(--marca); margin-top: 1px; }
td.v .dir { display: block; font-size: 10px; color: var(--cinza); }
td.v .dir + .dir { margin-top: 2px; }
td.v .dir b { font-size: 14px; margin-left: 6px; color: var(--tinta); }
.rodape { margin-top: 8px; display: flex; justify-content: space-between; font-size: 10px; color: var(--cinza); }
`;

const reais = (v) =>
  Number(v).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const preco = (t, extra = "") =>
  `<b>${reais(t.valor)}</b>${SUFIXO[t.cobranca] ? `<span class="suf">${SUFIXO[t.cobranca]}</span>` : ""}${extra}`;
const vazio = "<td></td>";

const celulaSimples = (cel, mostrarCasado) => {
  if (!cel) return vazio;
  const t = cel.tarifa;
  const cas =
    mostrarCasado && t.valorCasado != null
      ? `<span class="cas">casado ${reais(t.valorCasado)}</span>`
      : "";
  return `<td class="v">${preco(t)}${cas}</td>`;
};

const celulaPar = (linha, cat, mostrarCasado) => {
  const c = linha.celulas[cat];
  if (!c || (!c.a && !c.b)) return vazio;
  const cas = mostrarCasado && linha.casado?.[cat];
  const casTxt = cas
    ? `<span class="cas">casado ${reais(cas.trechoA)}${cas.iguais ? "" : ` / ${reais(cas.trechoB)}`}</span>`
    : "";
  if (linha.umSentido || ladosIguais(c.a, c.b) || !c.a || !c.b) {
    const t = (c.a || c.b).tarifa;
    const lado =
      !linha.umSentido && (!c.a || !c.b)
        ? `<span class="suf">só ${esc(c.a ? linha.siglas.a : linha.siglas.b)}</span>`
        : "";
    return `<td class="v">${preco(t, lado)}${casTxt}</td>`;
  }
  return `<td class="v"><span class="dir">${esc(linha.siglas.a)}<b>${reais(c.a.tarifa.valor)}</b></span><span class="dir">${esc(linha.siglas.b)}<b>${reais(c.b.tarifa.valor)}</b></span>${casTxt}</td>`;
};

const nomeDaLinha = (sec, l) => {
  if (sec.chave === "AEROPORTO") return l.modelo?.regiao || "Qualquer região";
  if (sec.chave === "APOIO")
    return String(l.rotulo || "").replace(/^Por trecho · /, "");
  return l.rotulo;
};

const temValor = (l, cat) => {
  const c = l.celulas?.[cat];
  return l.tipoLinha === "par" ? !!(c && (c.a || c.b)) : !!c;
};

export const montarHtmlMural = (
  secoes = [],
  { subtitulo = "", mostrarCasado = true } = {},
) => {
  const hoje = new Date().toLocaleDateString("pt-BR");
  const comLinhas = secoes.filter((s) => s.linhas.length);

  // uma grade só para a folha inteira: as colunas de veículo ficam alinhadas
  // de cima a baixo, como na planilha; só entram veículos que têm algum preço
  const usadas = ORDEM_COL.filter((cat) =>
    comLinhas.some((s) => s.linhas.some((l) => temValor(l, cat))),
  );
  const extras = [
    ...new Set(comLinhas.flatMap((s) => s.colunas.map((c) => c.valor))),
  ].filter(
    (cat) =>
      !ORDEM_COL.includes(cat) &&
      comLinhas.some((s) => s.linhas.some((l) => temValor(l, cat))),
  );
  const colunas = [...usadas, ...extras];
  const nomeExtra = (cat) =>
    comLinhas.flatMap((s) => s.colunas).find((c) => c.valor === cat)?.nome ||
    cat;
  const n = colunas.length || 1;
  const largRotulo = n > 4 ? 28 : 34;

  const cab = `<tr><th>Serviço</th>${colunas
    .map(
      (cat) =>
        `<th>${ICONE[cat] || ""}${esc(NOME_COL[cat] ?? nomeExtra(cat))}</th>`,
    )
    .join("")}</tr>`;

  const corpo = comLinhas
    .map((sec) => {
      const v = SECAO[sec.chave] || SECAO.SERVICO;
      const titulo = `<tr class="secao"><th colspan="${n + 1}">${esc(v.nome)}${v.nota ? `<span>${esc(v.nota)}</span>` : ""}</th></tr>`;
      const linhas = sec.linhas
        .map(
          (l, i) =>
            `<tr${i % 2 ? ' class="z"' : ""}><td>${esc(nomeDaLinha(sec, l))}</td>${colunas
              .map((cat) =>
                l.tipoLinha === "par"
                  ? celulaPar(l, cat, mostrarCasado)
                  : celulaSimples(l.celulas?.[cat], mostrarCasado),
              )
              .join("")}</tr>`,
        )
        .join("");
      return `<tbody>${titulo}${linhas}</tbody>`;
    })
    .join("");

  const temCasado =
    mostrarCasado &&
    comLinhas.some((s) =>
      s.linhas.some(
        (l) =>
          (l.casado && Object.keys(l.casado).length) ||
          Object.values(l.celulas || {}).some(
            (c) => c?.tarifa?.valorCasado != null,
          ),
      ),
    );

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Tarifário ${esc(hoje)}</title><style>${CSS}</style></head><body>
<header class="topo"><img src="${logoLuck}" alt=""><div><h1>Tarifário operacional</h1><span class="sub">${esc(subtitulo)}</span></div><div class="dir">Valores em R$<br>Atualizado em <b>${esc(hoje)}</b></div></header>
<table><colgroup><col style="width:${largRotulo}%">${colunas.map(() => `<col style="width:${(100 - largRotulo) / n}%">`).join("")}</colgroup><thead>${cab}</thead>${corpo}</table>
<div class="rodape"><span>${temCasado ? "Casado: IN e OUT no mesmo veículo, valor de cada trecho." : ""}</span><span>Luck Receptivo SSA</span></div>
</body></html>`;
};

export const imprimirMural = (secoes, opcoes) => {
  registrarImpressao("tarifario_mural", "Tarifário mural", ""); // Balanço de uso
  const html = montarHtmlMural(secoes, opcoes);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  const imprimir = () => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } finally {
      setTimeout(() => iframe.remove(), 60 * 1000);
    }
  };
  const img = doc.querySelector("img");
  if (img && !img.complete) {
    img.onload = imprimir;
    img.onerror = imprimir;
  } else setTimeout(imprimir, 50);
  return html;
};
