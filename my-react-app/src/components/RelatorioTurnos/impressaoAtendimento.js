// impressaoAtendimento.js
//
// "Relatório do dia" do atendimento no aeroporto (substitui o verso das
// cartinhas): quem recepcionou e embarcou quantos pax, o % de cada um, a
// cobertura contra o Phoenix e os veículos sem marcação. Impressão (PDF) e Excel.

import * as XLSX from "xlsx";
import logoLuck from "../../assets/clover.png";
import { regiaoAtual } from "../../Services/Services/regiaoAtiva";
import { dataBr, num } from "../../Services/Services/relatorioTurnos";
import { registrarImpressao } from "../../Services/Services/atividadeRepository";
import { CSS_IMPRESSAO, esc, imprimirHtml } from "./impressaoTurnos";

const periodoTexto = (r) => (r.inicio === r.fim ? dataBr(r.inicio) : `${dataBr(r.inicio)} a ${dataBr(r.fim)}`);
const pct = (v) => `${num(v, v && v < 10 ? 1 : 0)}%`;

const CSS_EXTRA = `
.atd-tab td.nome { text-align: left; }
.atd-tab td .t { color: #57606a; font-size: 9px; }
.atd-tab .barra { display: inline-block; height: 6px; border-radius: 3px; background: #1f2328; vertical-align: middle; margin-right: 4px; }
.pend td { text-align: left; }
.assin { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 34px; }
.assin div { border-top: 1px solid #1f2328; padding-top: 3px; text-align: center; color: #57606a; font-size: 9.5px; }
`;

export const montarHtmlAtendimento = (r) => {
  const agora = new Date();
  const gerado = `${agora.toLocaleDateString("pt-BR")} ${agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  const { etapas, rel } = r;
  const kpis = [
    rel.phoenix ? `<div class="kpi"><span>Chegaram (Phoenix)</span><b>${num(rel.phoenix.pax, 0)}</b><small>${rel.phoenix.veiculos} veículos</small></div>` : "",
    ...etapas.map((e) => {
      const marcado = rel.porEtapa[e.id]?.pax || 0;
      const cob = rel.phoenix?.pax ? ` · ${pct((rel.phoenix.porEtapa[e.id] / rel.phoenix.pax) * 100)} do Phoenix` : "";
      return `<div class="kpi"><span>${esc(e.nome)}</span><b>${num(marcado, 0)}</b><small>pax marcados · ${rel.porEtapa[e.id]?.veiculos || 0} veículos${cob}</small></div>`;
    }),
    rel.phoenix ? `<div class="kpi"><span>Pendentes</span><b>${rel.pendentes.length}</b><small>veículos sem alguma etapa</small></div>` : "",
  ].join("");

  const max = Math.max(1, ...rel.linhas.map((l) => l.etapas[etapas[0]?.id]?.pax || 0));
  const linhas = rel.linhas
    .map(
      (l) => `<tr><td class="e nome"><span class="dot" style="--c:${l.cor}"></span><b>${esc(l.nome)}</b> <span class="t">${esc(l.turnoNome)}</span></td>${etapas
        .map((e, i) => {
          const v = l.etapas[e.id];
          const barra = i === 0 ? `<span class="barra" style="width:${Math.round((v.pax / max) * 50)}px"></span>` : "";
          return `<td>${barra}${num(v.pax, 1)}</td><td>${v.veiculos}</td><td><b>${v.pax ? pct(v.pct) : "—"}</b></td>`;
        })
        .join("")}</tr>`,
    )
    .join("");
  const cab = etapas.map((e) => `<th>${esc(e.nome)} · pax</th><th>Veíc.</th><th>%</th>`).join("");
  const total = `<tr><td class="e"><b>Total marcado</b></td>${etapas
    .map((e) => `<td><b>${num(rel.porEtapa[e.id]?.pax || 0, 0)}</b></td><td><b>${rel.porEtapa[e.id]?.veiculos || 0}</b></td><td>${rel.regra === "total" ? "—" : "100%"}</td>`)
    .join("")}</tr>`;

  const pendentes = rel.pendentes.length
    ? `<h2>Veículos sem marcação (${rel.pendentes.length})</h2><table class="pend"><thead><tr><th class="e">Dia</th><th class="e">Hora</th><th class="e">Voo(s)</th><th class="e">Veículo</th><th>Pax</th><th class="e">Falta</th></tr></thead><tbody>${rel.pendentes
        .map(
          (g) =>
            `<tr><td>${esc(dataBr(g.data).slice(0, 5))}</td><td>${esc(g.hora)}</td><td>${esc(g.voos.join(", ") || "—")}</td><td>${esc(g.veiculo || "sem veículo")}</td><td style="text-align:right">${g.pax}</td><td>${esc(g.faltando.join(", "))}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : rel.phoenix
      ? `<p class="top">Todos os veículos do Phoenix têm as etapas marcadas.</p>`
      : "";

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Atendimento no aeroporto ${esc(periodoTexto(r))}</title><style>${CSS_IMPRESSAO}${CSS_EXTRA}</style></head><body>
<header class="topo"><img src="${logoLuck}" alt=""><div><h1>Atendimento no aeroporto</h1><p>Recepção e embarque por colaborador · ${esc(periodoTexto(r))}</p></div>
<div class="gerado">Luck Receptivo ${esc(regiaoAtual().nome)}<br>Gerado em ${esc(gerado)}</div></header>
<div class="kpis">${kpis}</div>
<h2>Por colaborador</h2>
<table class="atd-tab"><thead><tr><th class="e">Colaborador</th>${cab}</tr></thead><tbody>${linhas || `<tr><td class="e" colspan="${1 + etapas.length * 3}">Nenhuma marcação no período.</td></tr>`}${total}</tbody></table>
${pendentes}
<div class="notas"><p>Pax = adultos + crianças + bebês do veículo no Phoenix. ${
    rel.regra === "total"
      ? "Regra: quando duas pessoas marcam a mesma etapa, cada uma conta o veículo inteiro (a soma passa de 100%)."
      : "Regra: quando duas pessoas marcam a mesma etapa, os pax do veículo são divididos entre elas."
  } % = pax da pessoa na etapa ÷ pax com a etapa marcada.</p></div>
${r.inicio === r.fim ? `<div class="assin"><div>Supervisão do turno</div><div>Gerência</div></div>` : ""}
</body></html>`;
};

export const imprimirAtendimento = (r) => {
  registrarImpressao("atendimento_aeroporto", "Atendimento no aeroporto (impressão)", periodoTexto(r));
  return imprimirHtml(montarHtmlAtendimento(r));
};

export const baixarExcelAtendimento = (r) => {
  const { etapas, rel } = r;
  const colabs = [
    ["Colaborador", "Turno", ...etapas.flatMap((e) => [`${e.nome} (pax)`, `${e.nome} (veículos)`, `${e.nome} (%)`])],
    ...rel.linhas.map((l) => [
      l.nome,
      l.turnoNome,
      ...etapas.flatMap((e) => [Number(l.etapas[e.id].pax.toFixed(1)), l.etapas[e.id].veiculos, Number(l.etapas[e.id].pct.toFixed(1))]),
    ]),
    ["Total marcado", "", ...etapas.flatMap((e) => [rel.porEtapa[e.id]?.pax || 0, rel.porEtapa[e.id]?.veiculos || 0, rel.regra === "total" ? "" : 100])],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(colabs), "Colaboradores");
  const marcas = [["Dia", "Hora", "Voo(s)", "Veículo", "Motorista", "Pax", ...etapas.map((e) => e.nome)]];
  r.docs
    .slice()
    .sort((a, b) => a.data.localeCompare(b.data) || String(a.hora).localeCompare(String(b.hora)))
    .forEach((d) =>
      marcas.push([
        dataBr(d.data),
        d.hora || "",
        (d.voos || []).join(", "),
        d.veiculo || "",
        d.motorista || "",
        Number(d.pax) || 0,
        ...etapas.map((e) =>
          Object.values(d.marcas?.[e.id] || {})
            .map((m) => m.nome)
            .join(", "),
        ),
      ]),
    );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(marcas), "Veículos marcados");
  if (rel.pendentes.length) {
    const pend = [["Dia", "Hora", "Voo(s)", "Veículo", "Pax", "Falta"], ...rel.pendentes.map((g) => [dataBr(g.data), g.hora, g.voos.join(", "), g.veiculo || "", g.pax, g.faltando.join(", ")])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pend), "Pendentes");
  }
  XLSX.writeFile(wb, `atendimento-aeroporto-${r.inicio}${r.fim !== r.inicio ? `-a-${r.fim}` : ""}.xlsx`);
};
