// relatorioExecutivo.js
//
// Relatório executivo do custo operacional para a diretoria (PDF pela
// impressão do navegador). Duas versões:
//  - simples: 1 página, números que importam e destaques em texto;
//  - detalhado: + gráficos (custo por dia, por tipo, por fornecedor),
//    guias, eficiência e alertas.
// Fonte: serviços e escalas do Phoenix + o que foi lançado no custo do dia
// (custos_dia). O "evitável" vem do recomendador de trocas e é estimativa.

import logoLuck from "../../assets/clover.png";
import { NOME_CATEGORIA, NOME_TIPO } from "../../Services/Services/custosCalculo";

const esc = (t) =>
  String(t ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const reais = (v, centavos = false) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: centavos ? 2 : 0, maximumFractionDigits: centavos ? 2 : 0 });
const num = (v) => Number(v || 0).toLocaleString("pt-BR");
const pct = (v, t) => (t ? `${((v / t) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—");
const dataBr = (iso = "") => {
  const [a, m, d] = String(iso).split("-");
  return a ? `${d}/${m}/${a}` : "";
};
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const diaSemana = (iso) => {
  const [a, m, d] = iso.split("-").map(Number);
  return DIAS[new Date(a, m - 1, d, 12).getDay()];
};

const COR = { barra: "#0e7490", eco: "#1a7f37", evit: "#b45309", alerta: "#b42318", t2: "#57606a", t3: "#8c959f", ln: "#d8dee4" };

const CSS = `
@page { size: A4 portrait; margin: 12mm 12mm 14mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #1f2328; font: 10.5px/1.45 Inter, "Segoe UI", Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.topo { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #1f2328; padding-bottom: 8px; }
.topo img { width: 30px; height: 30px; }
.topo h1 { margin: 0; font-size: 18px; }
.topo p { margin: 1px 0 0; color: ${COR.t2}; }
.topo .dir { margin-left: auto; text-align: right; color: ${COR.t2}; font-size: 9.5px; }
.fonte { margin: 6px 0 0; color: ${COR.t2}; font-size: 9.5px; }
h2 { font-size: 12px; margin: 16px 0 6px; letter-spacing: .02em; }
.kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; }
.kpi { border: 1px solid #ced4da; border-radius: 6px; padding: 8px 10px; }
.kpi span { display: block; color: ${COR.t2}; font-size: 9.5px; }
.kpi b { display: block; font-size: 19px; line-height: 1.2; }
.kpi small { display: block; color: ${COR.t2}; font-size: 9px; }
.kpi.eco b { color: ${COR.eco}; }
.kpi.evit { border-style: dashed; border-color: ${COR.evit}; }
.kpi.evit b { color: ${COR.evit}; }
.destaques { margin: 0; padding-left: 16px; }
.destaques li { margin: 3px 0; }
.duas { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
table { width: 100%; border-collapse: collapse; font-size: inherit; }
th { text-align: right; font-size: 9px; letter-spacing: .04em; text-transform: uppercase; color: ${COR.t2}; padding: 3px 6px; border-bottom: 1.5px solid #1f2328; }
th.e, td.e { text-align: left; }
td { text-align: right; padding: 3px 6px; border-bottom: 1px solid #e1e4e8; font-variant-numeric: tabular-nums; }
.barra { display: inline-block; height: 7px; background: ${COR.barra}; border-radius: 2px; vertical-align: middle; }
.nota { margin-top: 14px; padding: 8px 10px; border: 1px solid #ced4da; border-radius: 6px; color: #444; font-size: 9.5px; }
.nota p { margin: 2px 0; }
.blk { break-inside: avoid; }
svg text { font-family: Inter, "Segoe UI", Arial, sans-serif; }
`;

// barras horizontais (gráfico de ranking)
const barrasHtml = (itens, total, { max = 8, nome = (k) => k } = {}) => {
  const lista = itens.slice(0, max);
  const maior = Math.max(1, ...lista.map((i) => i.valor));
  return `<table><thead><tr><th class="e">Item</th><th class="e" style="width:42%"></th><th>Valor</th><th>%</th><th>Serv.</th></tr></thead><tbody>${lista
    .map(
      (i) => `<tr><td class="e">${esc(nome(i.chave))}</td><td class="e"><span class="barra" style="width:${Math.max(2, (i.valor / maior) * 100)}%"></span></td><td>${reais(i.valor)}</td><td>${pct(
        i.valor,
        total,
      )}</td><td>${num(i.servicos)}</td></tr>`,
    )
    .join("")}</tbody></table>${itens.length > max ? `<p class="fonte">+ ${itens.length - max} outros.</p>` : ""}`;
};

// colunas do custo por dia (SVG)
const colunasDiaSvg = (porDia) => {
  const W = 700;
  const H = 170;
  const base = H - 22;
  const maior = Math.max(1, ...porDia.map((d) => d.total + (d.evitavel || 0)));
  const passo = W / Math.max(1, porDia.length);
  const larg = Math.max(2, Math.min(22, passo * 0.7));
  const mostraData = (i) => porDia.length <= 16 || i % Math.ceil(porDia.length / 12) === 0;
  const barras = porDia
    .map((d, i) => {
      const x = i * passo + (passo - larg) / 2;
      const h = (d.total / maior) * (base - 10);
      const he = ((d.evitavel || 0) / maior) * (base - 10);
      const vazio = d.status === "sem-lancamento";
      return `${
        vazio
          ? `<rect x="${x}" y="${base - 2}" width="${larg}" height="2" fill="${COR.ln}"/>`
          : `<rect x="${x}" y="${base - h}" width="${larg}" height="${Math.max(1, h)}" rx="2" fill="${COR.barra}"/>`
      }${he > 0.5 ? `<rect x="${x}" y="${base - h - he}" width="${larg}" height="${he}" fill="none" stroke="${COR.evit}" stroke-dasharray="2 2"/>` : ""}${
        mostraData(i) ? `<text x="${x + larg / 2}" y="${H - 6}" font-size="8" text-anchor="middle" fill="${COR.t2}">${d.data.slice(8)}/${d.data.slice(5, 7)}</text>` : ""
      }`;
    })
    .join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Custo por dia"><line x1="0" y1="${base}" x2="${W}" y2="${base}" stroke="#1f2328" stroke-width="1"/>${barras}</svg>
<p class="fonte"><span class="barra" style="width:14px"></span> custo do dia · <span style="display:inline-block;width:12px;height:7px;border:1px dashed ${COR.evit};vertical-align:middle"></span> evitável estimado · traço cinza = dia sem lançamento</p>`;
};

const destaques = (r, nDias) => {
  const t = r.total;
  const itens = [];
  const diasComValor = r.porDia.filter((d) => d.status !== "sem-lancamento" && d.total > 0);
  if (diasComValor.length) {
    const maior = [...diasComValor].sort((a, b) => b.total - a.total)[0];
    const media = diasComValor.reduce((a, d) => a + d.total, 0) / diasComValor.length;
    itens.push(`Custo médio por dia de <b>${reais(media)}</b>; o dia mais caro foi <b>${diaSemana(maior.data)} ${dataBr(maior.data)}</b> (${reais(maior.total)}).`);
  }
  const forn = r.porFornecedor.filter((f) => f.chave !== "Sem fornecedor");
  if (forn.length) {
    const top = forn[0];
    const top3 = forn.slice(0, 3).reduce((a, f) => a + f.valor, 0);
    itens.push(`<b>${esc(top.chave)}</b> é o maior fornecedor (${pct(top.valor, t.fornecedores)} do valor de fornecedores); os 3 maiores somam ${pct(top3, t.fornecedores)}.`);
  }
  const ecoReal = t.economia + t.noShowEconomia;
  if (ecoReal > 0)
    itens.push(
      `Economia realizada de <b>${reais(ecoReal)}</b>: ${reais(t.economiaCasado)} com serviços casados (${num(Math.round(t.casados / 2))} pares), ${reais(t.economiaNegociada)} negociados abaixo da tabela${
        t.noShowEconomia ? ` e ${reais(t.noShowEconomia)} em no-show` : ""
      }.`,
    );
  if (t.evitavel > 0 || t.evitavelRessalva > 0)
    itens.push(
      `Evitável estimado: até <b>${reais(t.evitavel)}</b> em ${num(t.evitavelQtd)} troca(s) de veículo sugeridas pelo recomendador${
        t.evitavelRessalva > 0 ? `; outros ${reais(t.evitavelRessalva)} (${num(t.evitavelRessalvaQtd)}) dependem de reservas que pedem fornecedor ou veículo específico` : ""
      }.`,
    );
  const alertas = t.alertaLotacao + t.alertaNaoEscalar + t.alertaHorario;
  if (alertas)
    itens.push(
      `Sinais de ocorrência: <b>${num(t.alertaLotacao)}</b> serviço(s) com mais passageiros que lugares, <b>${num(t.alertaNaoEscalar)}</b> com reserva que não devia estar escalada e <b>${num(
        t.alertaHorario,
      )}</b> horário(s) apertado(s) no mesmo veículo.`,
    );
  if (t.acimaQtd) itens.push(`${num(t.acimaQtd)} serviço(s) cobrados acima da tabela (+${reais(t.acimaDaTabela)}) — vale revisar a tabela ou o fornecedor.`);
  const pend = t.semValor + t.guiasAConfirmar;
  if (pend) itens.push(`Pendências: ${num(t.semValor)} serviço(s) sem valor e ${num(t.guiasAConfirmar)} guia(s) a confirmar — o custo real pode ser maior.`);
  if (t.diasComLancamento < nDias) itens.push(`Atenção: ${nDias - t.diasComLancamento} dia(s) do período sem lançamento ficaram fora dos números.`);
  return itens;
};

export const montarHtmlExecutivo = (r, { inicio, fim, modo = "simples", nDias }) => {
  const t = r.total;
  const agora = new Date();
  const gerado = `${agora.toLocaleDateString("pt-BR")} ${agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  const ecoReal = t.economia + t.noShowEconomia;
  const detalhado = modo === "detalhado";

  const kpis = `<div class="kpis">
<div class="kpi"><span>Custo operacional</span><b>${reais(t.total)}</b><small>fornecedores ${reais(t.fornecedores)} · guias ${reais(t.guias)}</small></div>
<div class="kpi"><span>Custo por passageiro</span><b>${reais(t.custoPorPax, true)}</b><small>${num(t.pax)} pax · ${num(t.servicos)} serviços</small></div>
<div class="kpi"><span>Cobertura</span><b>${num(t.diasComLancamento)}/${num(nDias)} dias</b><small>${num(t.diasConferidos)} conferido(s)</small></div>
<div class="kpi eco"><span>Economia realizada</span><b>${reais(ecoReal)}</b><small>casados, negociado e no-show</small></div>
<div class="kpi evit"><span>Evitável estimado</span><b>${reais(t.evitavel)}</b><small>${t.evitavelRessalva > 0 ? `+ ${reais(t.evitavelRessalva)} com ressalva` : "trocas sugeridas pelo recomendador"}</small></div>
<div class="kpi"><span>Alertas da operação</span><b>${num(t.alertaLotacao + t.alertaNaoEscalar + t.alertaHorario)}</b><small>${num(t.alertaLotacao)} lotação · ${num(t.alertaNaoEscalar)} não escalar · ${num(t.alertaHorario)} horário</small></div>
</div>`;

  const lista = destaques(r, nDias);
  const tipos = barrasHtml(r.porTipo, t.fornecedores, { nome: (k) => NOME_TIPO[k] || k, max: 6 });
  const fornecedores = barrasHtml(r.porFornecedor, t.fornecedores, { max: detalhado ? 10 : 5 });

  let corpo = `${kpis}
<h2>Destaques</h2>
<ul class="destaques">${lista.map((l) => `<li>${l}</li>`).join("") || "<li>Sem dados suficientes no período.</li>"}</ul>
<div class="duas blk">
<div><h2>Por tipo de serviço</h2>${tipos}</div>
<div><h2>Maiores fornecedores</h2>${fornecedores}</div>
</div>`;

  if (detalhado) {
    const guias = r.porGuia.slice(0, 8);
    corpo += `
<div class="blk"><h2>Custo por dia</h2>${colunasDiaSvg(r.porDia)}</div>
<div class="duas blk">
<div><h2>Por categoria de veículo</h2>${barrasHtml(r.porCategoria, t.fornecedores, { nome: (k) => NOME_CATEGORIA[k] || "Sem categoria", max: 6 })}</div>
<div><h2>Guias</h2>
<table><tbody>
<tr><td class="e">Pago a guias (lançado)</td><td>${reais(t.guias)}</td></tr>
<tr><td class="e">Guias a confirmar (referência)</td><td>${num(t.guiasAConfirmar)} · ${reais(t.guiasAConfirmarRef)}</td></tr>
<tr><td class="e">Tabela MI</td><td>${num(t.guiaMiQtd)} · ${reais(t.guiaMiValor)}</td></tr>
<tr><td class="e">Regular + idioma (adicional)</td><td>${num(t.guiaIdiomaQtd)} · ${reais(t.guiaAdicional)}</td></tr>
</tbody></table>
${guias.length ? `<table style="margin-top:6px"><thead><tr><th class="e">Guia</th><th>Serv.</th><th>Valor</th></tr></thead><tbody>${guias
      .map((g) => `<tr><td class="e">${esc(g.chave)}</td><td>${num(g.servicos)}</td><td>${reais(g.valor)}</td></tr>`)
      .join("")}</tbody></table>` : ""}
</div>
</div>
<div class="duas blk">
<div><h2>Eficiência</h2>
<table><tbody>
<tr><td class="e">Serviços casados</td><td>${num(t.casados)} serviço(s) · ${reais(t.economiaCasado)}</td></tr>
<tr><td class="e">Negociado abaixo da tabela</td><td>${reais(t.economiaNegociada)}</td></tr>
<tr><td class="e">No-show (deixou de pagar)</td><td>${num(t.noShowQtd)} · ${reais(t.noShowEconomia)}</td></tr>
<tr><td class="e">Cobrado acima da tabela</td><td>${num(t.acimaQtd)} · +${reais(t.acimaDaTabela)}</td></tr>
<tr><td class="e">Evitável estimado</td><td>${num(t.evitavelQtd)} troca(s) · ${reais(t.evitavel)}</td></tr>
<tr><td class="e">Evitável com ressalva</td><td>${num(t.evitavelRessalvaQtd)} · ${reais(t.evitavelRessalva)}</td></tr>
</tbody></table></div>
<div><h2>Regiões / passeios que mais custam</h2>${barrasHtml(r.porRegiao, t.fornecedores, { max: 6 })}</div>
</div>`;
  }

  corpo += `
<div class="nota blk">
<p><b>Sobre o "evitável":</b> é uma estimativa do recomendador de trocas (serviços casados entre veículos da mesma categoria, com lugares e horário livres, pela tabela de tarifas). É relativo: nem toda troca é viável — a reserva pode pedir um fornecedor ou veículo específico, o veículo pode não estar disponível de fato ou a operação pode ter outra prioridade. Por isso a parte que depende de observação da reserva aparece separada ("com ressalva").${
    t.diasComRecomendador < t.diasComLancamento ? ` Calculado em ${num(t.diasComRecomendador)} de ${num(t.diasComLancamento)} dias (os demais foram lançados antes desta versão).` : ""
  }</p>
<p><b>Fonte:</b> serviços, escalas e reservas do Phoenix; valores lançados no Custo do dia da FiaSystem (o que não foi lançado usa a tabela de tarifas). Reservas com CLD, cancelado, não escalar ou dispensado não contam passageiros.</p>
</div>`;

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório executivo ${esc(dataBr(inicio))} a ${esc(dataBr(fim))}</title><style>${CSS}</style></head><body>
<header class="topo"><img src="${logoLuck}" alt=""><div><h1>Custo operacional — relatório executivo${detalhado ? " (detalhado)" : ""}</h1><p>${esc(dataBr(inicio))} a ${esc(dataBr(fim))} · ${num(nDias)} dias</p></div>
<div class="dir">Luck Receptivo Salvador<br>Gerado em ${esc(gerado)}</div></header>
<p class="fonte">Números reais do Phoenix e dos lançamentos do custo do dia.</p>
${corpo}
</body></html>`;
};

export const imprimirExecutivo = (r, opcoes) => {
  const html = montarHtmlExecutivo(r, opcoes);
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
  const img = doc.querySelector("img");
  if (img && !img.complete) {
    img.onload = imprimir;
    img.onerror = imprimir;
  } else setTimeout(imprimir, 50);
  return html;
};
