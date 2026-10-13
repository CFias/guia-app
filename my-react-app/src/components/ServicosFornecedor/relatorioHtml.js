// relatorioHtml.js
//
// Monta o HTML do relatório impresso de "Serviços por Fornecedor": cabeçalho,
// indicadores, gráficos (SVG, saem na impressão) e as tabelas. Só recebe os
// dados já filtrados — o relatório mostra apenas os veículos/fornecedores
// selecionados na tela.

export const TIPOS_REL = ["IN", "OUT", "TRF", "PASSEIO", "APOIO"];
export const ROTULO_TIPO = {
  IN: "IN",
  OUT: "OUT",
  TRF: "Transfer",
  PASSEIO: "Passeio",
  APOIO: "Apoio",
};

// cores por tipo (mesma ordem sempre). Texto nunca usa essas cores: a
// legenda traz o nome e o número ao lado do quadradinho.
const COR_TIPO = {
  IN: "#0f6b63",
  OUT: "#3f6fd1",
  TRF: "#c98a1b",
  PASSEIO: "#8a5cc9",
  APOIO: "#c4566d",
};
const COR_UNICA = "#0f6b63";
const TINTA = "#1d2322";
const TINTA_2 = "#4d5856";
const TINTA_3 = "#7f8a88";
const GRADE = "#e3e6e5";

export const esc = (valor = "") =>
  String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const num = (n = 0) => Number(n || 0).toLocaleString("pt-BR");

const dataCurta = (iso = "") => {
  const [, m, d] = String(iso).split("-");
  return m ? `${d}/${m}` : "";
};

const escalaLimpa = (max) => {
  if (max <= 0) return 4;
  const pot = 10 ** Math.floor(Math.log10(max));
  const passo =
    [1, 2, 2.5, 5, 10].map((m) => m * pot).find((p) => max / p <= 4) ||
    pot * 10;
  return Math.ceil(max / passo) * passo;
};

/* ---------------- gráficos ---------------- */

// Colunas por dia (uma série). Valor em cima de cada coluna quando cabe.
export const svgColunasDias = (
  porDia = [],
  { largura = 520, altura = 170 } = {},
) => {
  if (!porDia.length) return "";
  const margemE = 30;
  const margemB = 20;
  const margemT = 14;
  const w = largura - margemE - 6;
  const h = altura - margemB - margemT;
  const max = escalaLimpa(Math.max(...porDia.map((d) => d.total), 0));
  const passo = w / porDia.length;
  const larg = Math.min(22, passo * 0.68);
  const mostrarValor = porDia.length <= 31;
  const cadaRotulo = porDia.length <= 16 ? 1 : Math.ceil(porDia.length / 12);
  const ticks = [0, max / 2, max];
  const y = (v) => margemT + h - (v / max) * h;

  const grade = ticks
    .map(
      (t) =>
        `<line x1="${margemE}" x2="${largura - 6}" y1="${y(t)}" y2="${y(t)}" stroke="${GRADE}" stroke-width="1"/>` +
        `<text x="${margemE - 6}" y="${y(t) + 3}" text-anchor="end" font-size="8" fill="${TINTA_3}">${num(Math.round(t))}</text>`,
    )
    .join("");

  const colunas = porDia
    .map((d, i) => {
      const x = margemE + i * passo + (passo - larg) / 2;
      const altC = d.total ? Math.max(2, (d.total / max) * h) : 0;
      const topo = margemT + h - altC;
      const r = Math.min(4, larg / 2, altC);
      const barra = altC
        ? `<path d="M${x},${margemT + h} V${topo + r} Q${x},${topo} ${x + r},${topo} H${x + larg - r} Q${x + larg},${topo} ${x + larg},${topo + r} V${margemT + h} Z" fill="${COR_UNICA}"/>`
        : "";
      const valor =
        mostrarValor && d.total
          ? `<text x="${x + larg / 2}" y="${topo - 3}" text-anchor="middle" font-size="7.5" font-weight="600" fill="${TINTA_2}">${d.total}</text>`
          : "";
      const rotulo =
        i % cadaRotulo === 0
          ? `<text x="${x + larg / 2}" y="${altura - 6}" text-anchor="middle" font-size="7.5" fill="${TINTA_3}">${dataCurta(d.data)}</text>`
          : "";
      return barra + valor + rotulo;
    })
    .join("");

  return `<svg viewBox="0 0 ${largura} ${altura}" width="100%" role="img" aria-label="Serviços por dia">${grade}${colunas}</svg>`;
};

// Uma barra 100% com a divisão por tipo + legenda com número e %.
export const htmlDivisaoTipos = (porTipo = {}) => {
  const total = TIPOS_REL.reduce((a, t) => a + (porTipo[t] || 0), 0);
  if (!total) return '<p class="vazio">Sem serviços.</p>';
  const segmentos = TIPOS_REL.filter((t) => porTipo[t])
    .map(
      (t) =>
        `<span style="flex:${porTipo[t]};background:${COR_TIPO[t]}"></span>`,
    )
    .join("");
  const legenda = TIPOS_REL.map(
    (t) =>
      `<li><i style="background:${COR_TIPO[t]}"></i>${ROTULO_TIPO[t]}<b>${num(porTipo[t] || 0)}</b><small>${Math.round(
        ((porTipo[t] || 0) / total) * 100,
      )}%</small></li>`,
  ).join("");
  return `<div class="divisao">${segmentos}</div><ul class="legenda">${legenda}</ul>`;
};

// Barras horizontais empilhadas por tipo (ranking de fornecedores/veículos)
export const htmlBarrasEmpilhadas = (linhas = [], { limite = 15 } = {}) => {
  if (!linhas.length) return '<p class="vazio">Sem serviços.</p>';
  const max = Math.max(...linhas.map((l) => l.total), 1);
  const itens = linhas.slice(0, limite).map((l) => {
    const segs = TIPOS_REL.filter((t) => l[t])
      .map(
        (t) =>
          `<span style="width:${(l[t] / max) * 100}%;background:${COR_TIPO[t]}" title="${ROTULO_TIPO[t]}: ${l[t]}"></span>`,
      )
      .join("");
    return `<div class="hb">
      <div class="hb-nome">${esc(l.nome)}${l.etiqueta ? ` <em>${esc(l.etiqueta)}</em>` : ""}${l.sub ? `<small>${esc(l.sub)}</small>` : ""}</div>
      <div class="hb-trilho">${segs}</div>
      <div class="hb-total">${num(l.total)}</div>
    </div>`;
  });
  const resto =
    linhas.length > limite
      ? `<p class="sub">+ ${linhas.length - limite} na tabela abaixo</p>`
      : "";
  const legenda = `<ul class="legenda legenda--linha">${TIPOS_REL.map(
    (t) =>
      `<li><i style="background:${COR_TIPO[t]}"></i>${ROTULO_TIPO[t]}</li>`,
  ).join("")}</ul>`;
  return `${legenda}<div class="hbs">${itens.join("")}</div>${resto}`;
};

// Barras horizontais de uma série (ex.: serviços por veículo)
export const htmlBarrasSimples = (linhas = []) => {
  if (!linhas.length) return '<p class="vazio">Sem serviços.</p>';
  const max = Math.max(...linhas.map((l) => l.total), 1);
  return `<div class="hbs">${linhas
    .map(
      (l) => `<div class="hb">
      <div class="hb-nome">${esc(l.nome)}${l.etiqueta ? ` <em>${esc(l.etiqueta)}</em>` : ""}</div>
      <div class="hb-trilho"><span style="width:${(l.total / max) * 100}%;background:${COR_UNICA}"></span></div>
      <div class="hb-total">${num(l.total)}</div>
    </div>`,
    )
    .join("")}</div>`;
};

/* ---------------- documento ---------------- */

// Tabela enxuta: cada linha com os números por tipo, total, % e uma
// barrinha com a divisão por tipo. Última linha = total geral.
export const htmlTabelaMinimalista = (
  linhas = [],
  { rotuloLinha = "Fornecedor", mostrarSub = true } = {},
) => {
  const tot = TIPOS_REL.reduce((a, t) => ({ ...a, [t]: 0 }), { total: 0 });
  linhas.forEach((l) => {
    TIPOS_REL.forEach((t) => {
      tot[t] += l[t] || 0;
    });
    tot.total += l.total;
  });
  const max = Math.max(...linhas.map((l) => l.total), 1);
  const barra = (l) =>
    `<div class="mb" style="width:${(l.total / max) * 100}%">${TIPOS_REL.filter(
      (t) => l[t],
    )
      .map(
        (t) => `<span style="flex:${l[t]};background:${COR_TIPO[t]}"></span>`,
      )
      .join("")}</div>`;
  const tipos = TIPOS_REL.filter((t) => tot[t] > 0 || t !== "APOIO");
  return `<table class="minima">
    <thead><tr><th class="num">#</th><th>${esc(rotuloLinha)}</th>${tipos
      .map(
        (t) =>
          `<th class="num"><i class="pt" style="background:${COR_TIPO[t]}"></i>${ROTULO_TIPO[t]}</th>`,
      )
      .join(
        "",
      )}<th class="num">Total</th><th class="num">%</th><th class="col-barra">Divisão</th></tr></thead>
    <tbody>${linhas
      .map(
        (l, i) => `<tr>
        <td class="num pos">${i + 1}º</td>
        <td><strong>${esc(l.nome)}</strong>${l.etiqueta ? ` <em class="et">${esc(l.etiqueta)}</em>` : ""}${
          mostrarSub && l.sub ? `<div class="mini">${esc(l.sub)}</div>` : ""
        }</td>
        ${tipos.map((t) => `<td class="num${l[t] ? "" : " zero"}">${num(l[t] || 0)}</td>`).join("")}
        <td class="num"><strong>${num(l.total)}</strong></td>
        <td class="num">${tot.total ? ((l.total / tot.total) * 100).toFixed(1).replace(".", ",") : "0"}%</td>
        <td class="col-barra">${barra(l)}</td>
      </tr>`,
      )
      .join("")}</tbody>
    <tfoot><tr><td></td><td><strong>Total</strong></td>${tipos
      .map((t) => `<td class="num"><strong>${num(tot[t])}</strong></td>`)
      .join(
        "",
      )}<td class="num"><strong>${num(tot.total)}</strong></td><td class="num">100%</td><td></td></tr></tfoot>
  </table>`;
};

/* Tamanhos de fonte do relatório impresso (multiplica todos os font-size do
   CSS do documento; os rótulos dos gráficos crescem um pouco menos para não
   se sobreporem). */
export const TAMANHOS_FONTE_RELATORIO = [
  { id: "pequena", nome: "Fonte pequena", escala: 0.9 },
  { id: "normal", nome: "Fonte normal", escala: 1 },
  { id: "grande", nome: "Fonte grande", escala: 1.15 },
  { id: "maior", nome: "Fonte muito grande", escala: 1.3 },
];

export const escalaDaFonte = (id) =>
  TAMANHOS_FONTE_RELATORIO.find((t) => t.id === id)?.escala || 1;

const arred = (n) => Math.round(n * 100) / 100;

const escalarFontes = (html, escala) => {
  if (!escala || escala === 1) return html;
  const escalaGrafico = 1 + (escala - 1) * 0.6;
  return html
    .replace(/<style>[\s\S]*?<\/style>/, (css) => {
      const maior = css.replace(
        /font-size:\s*([\d.]+)px/g,
        (_, n) => `font-size: ${arred(Number(n) * escala)}px`,
      );
      // fonte grande: a barra de divisão cede espaço para o nome do fornecedor
      return escala > 1
        ? maior.replace(
            "</style>",
            `  table.minima .col-barra { width: ${escala > 1.2 ? 12 : 16}%; }\n  table.minima td, table.minima th { padding: 6px 5px; }\n</style>`,
          )
        : maior;
    })
    .replace(
      /font-size="([\d.]+)"/g,
      (_, n) => `font-size="${arred(Number(n) * escalaGrafico)}"`,
    );
};

export const documentoRelatorio = ({ escalaFonte = 1, ...opcoes }) =>
  escalarFontes(montarDocumento(opcoes), escalaFonte);

const montarDocumento = ({
  titulo,
  subtitulo = "",
  resumo = "",
  periodo,
  geradoEm,
  meta = [],
  avisos = [],
  kpis = [],
  graficos = [],
  corpo = "",
  rodape = "",
  paisagem = false,
}) => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<title>${esc(titulo)} — ${esc(periodo)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Inter", "Segoe UI", Arial, sans-serif; color: ${TINTA}; margin: 24px; font-size: 10.5px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  header { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; padding-bottom: 12px; margin-bottom: 14px; border-bottom: 3px solid ${COR_UNICA}; }
  header .marca { font-size: 9px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: ${COR_UNICA}; }
  header h1 { margin: 2px 0 0; font-size: 19px; letter-spacing: -.01em; }
  header .subtitulo { margin-top: 3px; color: ${TINTA_2}; font-size: 11px; }
  header .meta { text-align: right; color: ${TINTA_2}; line-height: 1.6; }
  header .meta strong { color: ${TINTA}; }
  h2 { font-size: 12.5px; margin: 18px 0 8px; }
  h3 { font-size: 10.5px; margin: 0 0 8px; text-transform: uppercase; letter-spacing: .06em; color: ${TINTA_2}; }
  .sub { margin: 0 0 8px; color: ${TINTA_2}; }
  .mini { color: ${TINTA_3}; font-size: 8.5px; margin-top: 2px; }
  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(66px, 1fr)); gap: 6px; margin: 0 0 14px; }
  .kpis div { border: 1px solid ${GRADE}; border-radius: 10px; padding: 7px 9px; }
  .kpis div.destaque { background: ${COR_UNICA}; border-color: ${COR_UNICA}; color: #fff; }
  .kpis span { display: block; font-size: 8.5px; text-transform: uppercase; letter-spacing: .05em; color: ${TINTA_3}; }
  .kpis div.destaque span { color: rgba(255,255,255,.8); }
  .kpis strong { display: block; margin-top: 2px; font-size: 15px; letter-spacing: -.01em; white-space: nowrap; }
  .graficos { display: grid; grid-template-columns: 1.4fr 1fr; gap: 12px; margin-bottom: 14px; }
  .graficos.um { grid-template-columns: 1fr; }
  .painel { border: 1px solid ${GRADE}; border-radius: 10px; padding: 12px 14px; break-inside: avoid; }
  .painel.largo { grid-column: 1 / -1; }
  .divisao { display: flex; gap: 2px; height: 16px; border-radius: 5px; overflow: hidden; margin: 4px 0 10px; }
  .legenda { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; }
  .resumo { margin: 0 0 14px; padding: 10px 14px; border-left: 3px solid ${COR_UNICA}; background: #f2f7f6; border-radius: 0 8px 8px 0; font-size: 11.5px; line-height: 1.55; color: ${TINTA}; }
  .resumo b { color: ${COR_UNICA}; }
  table.minima td, table.minima th { padding: 7px 8px; }
  table.minima td.zero { color: #c3c9c8; }
  table.minima td.pos { color: ${TINTA_3}; width: 26px; }
  table.minima tfoot td { border-top: 2px solid ${TINTA}; border-bottom: 0; background: #fff !important; }
  table.minima .col-barra { width: 22%; }
  .mb { display: flex; gap: 1px; height: 9px; min-width: 3px; border-radius: 3px; overflow: hidden; }
  .pt { display: inline-block; width: 7px; height: 7px; border-radius: 2px; margin-right: 4px; vertical-align: 0; }
  .et { font-style: normal; font-size: 8px; font-weight: 700; padding: 1px 5px; border-radius: 99px; background: #e4f1ee; color: ${COR_UNICA}; }
  .notas { margin: 10px 0 0; padding: 0 0 0 14px; color: ${TINTA_2}; font-size: 9.5px; line-height: 1.5; }
  .legenda li { display: flex; align-items: center; gap: 6px; color: ${TINTA_2}; }
  .legenda i { width: 9px; height: 9px; border-radius: 2px; flex: none; }
  .legenda b { margin-left: auto; color: ${TINTA}; }
  .legenda small { color: ${TINTA_3}; width: 30px; text-align: right; }
  .legenda--linha { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-bottom: 8px; }
  .legenda--linha li b, .legenda--linha li small { display: none; }
  .hbs { display: flex; flex-direction: column; gap: 6px; }
  .hb { display: grid; grid-template-columns: minmax(120px, 34%) 1fr 34px; align-items: center; gap: 8px; }
  .hb-nome { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hb-nome em { font-style: normal; font-size: 8px; font-weight: 700; padding: 1px 5px; border-radius: 99px; background: #e4f1ee; color: ${COR_UNICA}; }
  .hb-nome small { display: block; font-weight: 400; color: ${TINTA_3}; font-size: 8.5px; overflow: hidden; text-overflow: ellipsis; }
  .hb-trilho { display: flex; gap: 2px; height: 11px; }
  .hb-trilho span { display: block; height: 100%; min-width: 2px; }
  .hb-trilho span:last-child { border-radius: 0 4px 4px 0; }
  .hb-total { text-align: right; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  th { text-align: left; padding: 6px 7px; font-size: 8.5px; text-transform: uppercase; letter-spacing: .05em; color: ${TINTA_2}; border-bottom: 2px solid ${TINTA}; }
  td { padding: 5px 7px; border-bottom: 1px solid ${GRADE}; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #f6f8f7; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .tag { display: inline-block; padding: 0 5px; border-radius: 4px; font-size: 8px; font-weight: 700; color: #fff; }
  .vazio { text-align: center; color: ${TINTA_3}; padding: 12px; }
  .aviso { background: #fff6dd; border: 1px solid #edd58a; padding: 7px 10px; border-radius: 8px; margin: 0 0 10px; }
  .rodape { margin-top: 14px; padding-top: 8px; border-top: 1px solid ${GRADE}; color: ${TINTA_3}; font-size: 9px; }
  .quebra { break-before: page; }
  section.secao { break-inside: avoid-page; }
  @page { size: A4 ${paisagem ? "landscape" : "portrait"}; margin: 11mm; }
  @media print { body { margin: 0; } }
</style></head>
<body>
  <header>
    <div>
      <div class="marca">Operacional SSA · Serviços por fornecedor</div>
      <h1>${esc(titulo)}</h1>
      ${subtitulo ? `<div class="subtitulo">${esc(subtitulo)}</div>` : ""}
    </div>
    <div class="meta">Período: <strong>${esc(periodo)}</strong><br/>${meta.map((m) => `${esc(m)}<br/>`).join("")}Gerado em ${esc(geradoEm)}</div>
  </header>
  ${resumo ? `<p class="resumo">${resumo}</p>` : ""}
  ${avisos.map((a) => `<p class="aviso">${esc(a)}</p>`).join("")}
  ${kpis.length ? `<div class="kpis">${kpis.map((k, i) => `<div${i === 0 ? ' class="destaque"' : ""}><span>${esc(k.rotulo)}</span><strong>${esc(k.valor)}</strong></div>`).join("")}</div>` : ""}
  ${graficos.length ? `<div class="graficos${graficos.length === 1 ? " um" : ""}">${graficos.map((g) => `<div class="painel${g.largo ? " largo" : ""}"><h3>${esc(g.titulo)}</h3>${g.html}</div>`).join("")}</div>` : ""}
  ${corpo}
  ${rodape ? `<p class="rodape">${esc(rodape)}</p>` : ""}
  <script>window.onload = function () { setTimeout(function () { window.print(); }, 150); };</script>
</body></html>`;

export const tagTipo = (tipo) =>
  `<span class="tag" style="background:${COR_TIPO[tipo] || TINTA_3}">${esc(ROTULO_TIPO[tipo] || tipo)}</span>`;
