// mapaServicos.js
//
// "Mapa de serviços" para imprimir (A4 deitado), no lugar do mapa do Phoenix,
// que sai picotado (o mesmo veículo aparece várias vezes em horários
// diferentes). Aqui cada bloco é UMA escala (IN/OUT) ou UM guia+passeio
// (Passeios), com todas as reservas dele juntas, em ordem de horário e de
// número da escala. Gera um HTML e abre a impressão do navegador
// (dá para "Salvar como PDF").
//
// Formato dos dados:
// imprimirMapa({
//   titulo: "MAPA DE CHEGADAS — IN", subtitulo, resumo: [["Escalas", 4], ...],
//   colunas: [{ titulo: "Hora", largura: 60 }, ...],          // larguras em px (A4 ≈ 1060 px úteis)
//   blocos: [{
//     rotulo: "ESCALA", numero: "48211", hora: "08:40", chips: ["AD 4852"],
//     titulo: "VAN THAIS 2", detalhe: "Motorista: THAIS · Receptivo: MARCOS",
//     pax: 11, reservas: 4,
//     secoes: [{ apoio: null | { titulo, detalhe, pax }, linhas: [{ sep, celulas: [{ t, b, i, tag }] }] }],
//   }],
//   rodape: "Painel Operacional → Chegadas",
// })

import logoLuck from "../../../assets/clover.png";

const esc = (t) =>
  String(t ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const celula = (c) => {
  if (c === null || c === undefined) return "<td></td>";
  const obj = typeof c === "object" ? c : { t: c };
  const texto = obj.t === undefined || obj.t === null || obj.t === "-" ? "" : esc(obj.t);
  let conteudo = obj.b ? `<b>${texto}</b>` : texto;
  if (obj.i && texto) conteudo = `<i>${conteudo}</i>`;
  if (obj.tag) conteudo += `<span class="idi">${esc(obj.tag)}</span>`;
  return `<td>${conteudo}</td>`;
};

const CSS = `
@page { size: A4 landscape; margin: 6mm 7mm; }
* { box-sizing: border-box; }
html, body { margin: 0; background: #fff; color: #1f2328; font-family: Inter, "Segoe UI", Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.topo { display: flex; align-items: center; gap: 10px; border-bottom: 1.6px solid #1f2328; padding-bottom: 4px; }
.topo img { width: 22px; height: 22px; filter: grayscale(1); }
.topo b { display: block; font-size: 14px; letter-spacing: .04em; }
.topo span { font-size: 10px; color: #555; }
.res { margin-left: auto; display: flex; gap: 14px; font-size: 9.5px; }
.res div { text-align: right; } .res b { display: block; font-size: 14px; }
/* o bloco pode continuar na página seguinte (economiza folha); o cabeçalho
   nunca fica sozinho no fim da página e cada linha não é cortada ao meio */
.esc { margin-top: 5px; border: 1px solid #1f2328; border-radius: 3px; }
/* cabeçalho do bloco em colunas FIXAS: fornecedor (completo) | hora | voo/passeio | escala | pax */
.h { display: grid; grid-template-columns: minmax(0, 1fr) 54px 190px 150px 104px; align-items: center; column-gap: 10px; background: #e9ecef; padding: 3px 8px; border-bottom: 1px solid #1f2328; break-after: avoid; page-break-after: avoid; break-inside: avoid; }
.c-hora { font-size: 17px; font-weight: 800; white-space: nowrap; }
.esc-num { display: inline-block; border: 1.3px solid #1f2328; border-radius: 3px; padding: 0 6px; background: #fff; color: #1f2328; max-width: 100%; white-space: nowrap; }
.esc-num small { font-size: 7.5px; letter-spacing: .08em; color: #555; margin-right: 4px; }
.esc-num b { font-size: 12px; letter-spacing: .01em; }
.esc-num.vazio b { color: #666; font-weight: 600; }
.c-chips { display: flex; flex-wrap: wrap; gap: 3px; }
.chip { font-size: 11px; font-weight: 800; border: 1.3px solid #1f2328; border-radius: 3px; padding: 0 5px; background: #fff; letter-spacing: .02em; }
.c-forn { line-height: 1.15; }
.c-forn small { font-size: 7.5px; letter-spacing: .08em; color: #555; margin-right: 5px; }
.c-forn b { font-size: 12.5px; overflow-wrap: anywhere; }
.c-forn span { display: block; font-size: 9.5px; color: #444; }
.p { font-size: 10.5px; white-space: nowrap; text-align: right; } .p b { font-size: 14px; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
thead { display: table-header-group; }
tr { break-inside: avoid; page-break-inside: avoid; }
th { font-size: 7.5px; letter-spacing: .06em; text-transform: uppercase; color: #555; text-align: left; padding: 2px 6px; border-bottom: 1px solid #adb5bd; }
td { font-size: 10px; line-height: 1.25; padding: 2px 6px; border-bottom: 1px dotted #ced4da; vertical-align: top; overflow-wrap: anywhere; }
tbody tr:last-child td { border-bottom: none; }
tr.sep td { border-top: 1px solid #868e96; }
.chk { width: 10px; height: 10px; border: 1.1px solid #1f2328; border-radius: 2px; display: inline-block; vertical-align: -1px; }
.idi { display: inline-block; border: 1px solid #1f2328; border-radius: 3px; font-size: 8px; padding: 0 3px; font-weight: 700; margin-left: 4px; vertical-align: 1px; }
.apoio { margin: 3px 6px 5px; border: 1.2px dashed #495057; border-radius: 3px; }
.apoio-h { display: flex; align-items: center; gap: 8px; padding: 2px 6px; font-size: 10px; border-bottom: 1px dashed #adb5bd; break-after: avoid; page-break-after: avoid; }
.apoio-h .tag { font-size: 8px; font-weight: 800; letter-spacing: .08em; border: 1.2px solid #1f2328; border-radius: 3px; padding: 0 5px; }
.apoio-h b { font-size: 11px; } .apoio-h span { color: #444; } .apoio-h .p { margin-left: auto; }
.vazio { padding: 24px; text-align: center; color: #666; font-size: 12px; }
.rod { margin-top: 8px; display: flex; justify-content: space-between; font-size: 8.5px; color: #666; border-top: 1px solid #ced4da; padding-top: 3px; }
`;

export const montarHtmlMapa = ({ titulo, subtitulo, resumo = [], colunas = [], blocos = [], rodape = "" }) => {
  const cols =
    `<colgroup><col style="width:22px">` +
    colunas.map((c) => `<col${c.largura ? ` style="width:${c.largura}px"` : ""}>`).join("") +
    `</colgroup>`;
  const thead = `<thead><tr><th>✓</th>${colunas.map((c) => `<th>${esc(c.titulo)}</th>`).join("")}</tr></thead>`;
  const linhasHtml = (linhas = []) =>
    linhas
      .map((l) => `<tr class="${l.sep ? "sep" : ""}"><td><span class="chk"></span></td>${l.celulas.map(celula).join("")}</tr>`)
      .join("");

  const blocosHtml = blocos
    .map((b) => {
      let h = `<section class="esc"><div class="h">`;
      h += `<div class="c-forn"><small>${esc(b.rotulo || "FORNECEDOR")}</small><b>${esc(b.numero ?? "—")}</b>`;
      h += `<span>${esc(b.titulo || "")}${b.detalhe ? ` · ${esc(b.detalhe)}` : ""}</span></div>`;
      h += `<div class="c-hora">${esc(b.hora || "--:--")}</div>`;
      h += `<div class="c-chips">${(b.chips || []).map((c) => `<span class="chip">${esc(c)}</span>`).join("")}</div>`;
      h += b.escala
        ? `<div><span class="esc-num"><small>ESCALA</small><b>${esc(b.escala)}</b></span></div>`
        : `<div><span class="esc-num vazio"><small>ESCALA</small><b>sem escala</b></span></div>`;
      h += `<div class="p"><b>${b.pax ?? 0}</b> pax · ${b.reservas ?? 0} ${b.reservas === 1 ? "reserva" : "reservas"}</div></div>`;
      (b.secoes || []).forEach((s) => {
        if (s.apoio) {
          h += `<div class="apoio"><div class="apoio-h"><span class="tag">CARRO DE APOIO</span><b>${esc(s.apoio.titulo)}</b>`;
          if (s.apoio.detalhe) h += `<span>${esc(s.apoio.detalhe)}</span>`;
          h += `<span class="p"><b>${s.apoio.pax ?? 0}</b> pax</span></div>`;
          h += `<table>${cols}<tbody>${linhasHtml(s.linhas)}</tbody></table></div>`;
        } else {
          h += `<table>${cols}${thead}<tbody>${linhasHtml(s.linhas)}</tbody></table>`;
        }
      });
      return `${h}</section>`;
    })
    .join("");

  const agora = new Date();
  const impresso = `${agora.toLocaleDateString("pt-BR")} ${agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)} ${esc(subtitulo || "")}</title><style>${CSS}</style></head><body>
<header class="topo"><img src="${logoLuck}" alt=""><div><b>${esc(titulo)}</b><span>${esc(subtitulo || "")}</span></div>
<div class="res">${resumo.map(([l, v]) => `<div>${esc(l)}<b>${esc(v)}</b></div>`).join("")}</div></header>
${blocosHtml || '<p class="vazio">Nenhum serviço para imprimir com os filtros atuais.</p>'}
<footer class="rod"><span>Impresso pelo FiaSystem · ${esc(rodape)} · ${impresso}</span><span>✓ conferido no embarque/desembarque</span></footer>
</body></html>`;
};

// Abre a impressão sem trocar de tela (iframe escondido).
export const imprimirMapa = (dados) => {
  const html = montarHtmlMapa(dados);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
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
  // espera o logo carregar antes de imprimir
  const img = doc.querySelector("img");
  if (img && !img.complete) {
    img.onload = imprimir;
    img.onerror = imprimir;
  } else {
    setTimeout(imprimir, 50);
  }
  return html;
};
