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
import { esperaDoDoc, horaDe, marcasDaEtapa, resumoEsperas, resumoEsperasPorReserva, textoMinutos, textoPax } from "../../Services/Services/atendimentoAeroporto";

// tabela de no show (impressão)
const htmlNoShow = (lista, titulo = "No show") =>
  lista.length
    ? `<h2>${esc(titulo)} (${lista.length})</h2><table class="pend"><thead><tr><th class="e">Dia</th><th class="e">Hora</th><th class="e">Reserva</th><th class="e">Passageiro</th><th class="e">Voo</th><th>Pax</th><th class="e">Tipo</th><th class="e">Informado por</th></tr></thead><tbody>${lista
      .map(
        (n) =>
          `<tr><td>${esc(dataBr(n.data).slice(0, 5))}</td><td>${esc(n.hora || "")}</td><td>${esc(n.codigo || "—")}</td><td>${esc(n.titular || "")}</td><td>${esc((n.voos || []).join(", ") || n.voo || "")}</td><td style="text-align:right">${n.pax}</td><td><b>${n.tipo === "com_custo" ? "Com custo" : "Sem custo"}</b></td><td>${esc(n.porNome || "")} ${esc(horaDe(n.em))}</td></tr>`,
      )
      .join("")}</tbody></table>`
    : "";
const linhasNoShowExcel = (lista) => [
  ["Dia", "Hora", "Reserva", "Passageiro", "Hotel", "Voo", "Veículo", "Pax", "Detalhe", "Tipo", "Informado por", "Horário"],
  ...lista.map((n) => [dataBr(n.data), n.hora || "", n.codigo || "", n.titular || "", n.hotel || "", (n.voos || []).join(", ") || n.voo || "", n.veiculo || "", Number(n.pax) || 0, textoPax(n), n.tipo === "com_custo" ? "Com custo" : "Sem custo", n.porNome || "", horaDe(n.em)]),
];

const quemComHora = (doc, etapaId) =>
  marcasDaEtapa(doc, etapaId)
    .map((m) => `${m.nome} ${horaDe(m.em)}`)
    .join(", ");

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

  // tempo entre a primeira e a última etapa
  let espera = "";
  if (etapas.length > 1) {
    const e = resumoEsperas(r.docs || [], etapas);
    const ini = etapas[0].nome;
    const fimN = etapas[etapas.length - 1].nome;
    espera = e.veiculos.length
      ? `<h2>Tempo entre ${esc(ini.toLowerCase())} e ${esc(fimN.toLowerCase())}</h2>
<div class="kpis"><div class="kpi"><span>Média por veículo</span><b>${textoMinutos(e.media)}</b></div><div class="kpi"><span>Média por passageiro</span><b>${textoMinutos(e.mediaPax)}</b></div><div class="kpi"><span>Mediana</span><b>${textoMinutos(e.mediana)}</b></div><div class="kpi"><span>Maior espera</span><b>${textoMinutos(e.maior?.espera.min)}</b><small>${esc((e.maior?.doc.voos || []).join(", "))}</small></div></div>
<table class="pend" style="margin-top:8px"><thead><tr><th class="e">Hora</th><th class="e">Voo(s)</th><th class="e">Veículo</th><th>Pax</th><th class="e">${esc(ini)}</th><th class="e">${esc(fimN)}</th><th>Espera</th></tr></thead><tbody>${e.veiculos
        .slice(0, 40)
        .map(
          ({ doc, espera: x }) =>
            `<tr><td>${esc(r.inicio !== r.fim ? `${dataBr(doc.data).slice(0, 5)} ` : "")}${esc(doc.hora || "")}</td><td>${esc((doc.voos || []).join(", ") || "—")}</td><td>${esc(doc.veiculo || "—")}</td><td style="text-align:right">${doc.pax}</td><td>${esc(quemComHora(doc, etapas[0].id))}</td><td>${esc(quemComHora(doc, etapas[etapas.length - 1].id))}</td><td style="text-align:right"><b>${x.min === null ? "sem horário" : textoMinutos(x.min)}</b></td></tr>`,
        )
        .join("")}</tbody></table>`
      : "";
  }

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Atendimento no aeroporto ${esc(periodoTexto(r))}</title><style>${CSS_IMPRESSAO}${CSS_EXTRA}</style></head><body>
<header class="topo"><img src="${logoLuck}" alt=""><div><h1>Atendimento no aeroporto</h1><p>Recepção e embarque por colaborador · ${esc(periodoTexto(r))}</p></div>
<div class="gerado">Luck Receptivo ${esc(regiaoAtual().nome)}<br>Gerado em ${esc(gerado)}</div></header>
<div class="kpis">${kpis}</div>
<h2>Por colaborador</h2>
<table class="atd-tab"><thead><tr><th class="e">Colaborador</th>${cab}</tr></thead><tbody>${linhas || `<tr><td class="e" colspan="${1 + etapas.length * 3}">Nenhuma marcação no período.</td></tr>`}${total}</tbody></table>
${espera}
${rel.noShow?.reservas ? `<div class="kpis" style="grid-template-columns:repeat(3,1fr)"><div class="kpi"><span>No show</span><b>${rel.noShow.reservas}</b><small>${rel.noShow.pax} pax</small></div><div class="kpi"><span>Com custo</span><b>${rel.noShow.comCusto.reservas}</b><small>${rel.noShow.comCusto.pax} pax</small></div><div class="kpi"><span>Sem custo</span><b>${rel.noShow.semCusto.reservas}</b><small>${rel.noShow.semCusto.pax} pax</small></div></div>${htmlNoShow(rel.noShow.lista)}` : ""}
${pendentes}
<div class="notas"><p>Pax = adultos + crianças + bebês do veículo no Phoenix. ${rel.regra === "total"
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
  const marcas = [["Dia", "Hora", "Voo(s)", "Veículo", "Motorista", "Pax", ...etapas.map((e) => `${e.nome} (quem e horário)`), ...(etapas.length > 1 ? ["Espera (min)"] : [])]];
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
        ...etapas.map((e) => quemComHora(d, e.id)),
        ...(etapas.length > 1 ? [esperaDoDoc(d, etapas)?.min ?? ""] : []),
      ]),
    );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(marcas), "Veículos marcados");
  // uma linha por reserva: quem recepcionou e quem embarcou cada passageiro
  const porReserva = [["Dia", "Hora", "Voo", "Reserva", "Passageiro", "Hotel", "Pax", "Detalhe", "Veículo", ...etapas.map((e) => e.nome), ...(etapas.length > 1 ? ["Espera (min)"] : [])]];
  r.docs.forEach((d) =>
    (Array.isArray(d.reservas) ? d.reservas : []).forEach((x) =>
      porReserva.push([
        dataBr(d.data),
        d.hora || "",
        x.voo || (d.voos || []).join(", "),
        x.codigo,
        x.titular,
        x.hotel,
        x.pax,
        textoPax(x),
        d.veiculo || "",
        ...etapas.map((e) => quemComHora(d, e.id)),
        ...(etapas.length > 1 ? [esperaDoDoc(d, etapas)?.min ?? ""] : []),
      ]),
    ),
  );
  if (porReserva.length > 1) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(porReserva), "Reservas");
  if (etapas.length > 1) {
    const pr = resumoEsperasPorReserva(r.docs, etapas);
    if (pr.reservas.length) {
      const linhas = [
        ["Dia", "Hora", "Voo(s)", "Reserva", "Passageiro", "Pax", `${etapas[0].nome} (quem)`, `${etapas[0].nome} (hora)`, `${etapas[etapas.length - 1].nome} (hora)`, "Espera (min)", "Marcada na reserva?"],
        ...pr.reservas.map((x) => [
          dataBr(x.doc.data),
          x.doc.hora || "",
          (x.doc.voos || []).join(", "),
          x.reserva.codigo || "",
          x.reserva.titular || "",
          Number(x.reserva.pax) || 0,
          x.espera.inicio?.nome || "",
          horaDe(x.espera.inicio?.em),
          horaDe(x.espera.fim?.em),
          x.espera.min ?? "",
          x.espera.porReserva ? "sim" : "não (veículo)",
        ]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), "Espera por reserva");
    }
  }
  if (rel.noShow?.reservas) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhasNoShowExcel(rel.noShow.lista)), "No show");
  if (rel.pendentes.length) {
    const pend = [["Dia", "Hora", "Voo(s)", "Veículo", "Pax", "Falta"], ...rel.pendentes.map((g) => [dataBr(g.data), g.hora, g.voos.join(", "), g.veiculo || "", g.pax, g.faltando.join(", ")])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pend), "Pendentes");
  }
  XLSX.writeFile(wb, `atendimento-aeroporto-${r.inicio}${r.fim !== r.inicio ? `-a-${r.fim}` : ""}.xlsx`);
};

// ---------------------------------------------------------------------
// Relatório de UM colaborador
// ---------------------------------------------------------------------
const periodoDe = (x) => (x.inicio === x.fim ? dataBr(x.inicio) : `${dataBr(x.inicio)} a ${dataBr(x.fim)}`);

export const montarHtmlColaborador = (x) => {
  const { pessoa, etapas, r } = x;
  const agora = new Date();
  const gerado = `${agora.toLocaleDateString("pt-BR")} ${agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  const kpis = [
    ...etapas.map(
      (e) =>
        `<div class="kpi"><span>${esc(e.nome)}</span><b>${num(r.etapas[e.id].pax, 1)}</b><small>pax · ${r.etapas[e.id].veiculos} veículos · ${pct(r.etapas[e.id].pct)} do total</small></div>`,
    ),
    etapas.length > 1 ? `<div class="kpi"><span>Espera média</span><b>${textoMinutos(r.esperaMedia)}</b><small>dos veículos atendidos</small></div>` : "",
    `<div class="kpi"><span>Dias com atendimento</span><b>${r.dias.length}</b></div>`,
  ].join("");
  const dias =
    r.dias.length > 1
      ? `<h2>Dia a dia</h2><table><thead><tr><th class="e">Dia</th>${etapas.map((e) => `<th>${esc(e.nome)} · pax</th><th>Veíc.</th>`).join("")}</tr></thead><tbody>${r.dias
        .map((d) => `<tr><td class="e">${esc(dataBr(d.data))}</td>${etapas.map((e) => `<td>${num(d.etapas[e.id].pax, 1)}</td><td>${d.etapas[e.id].veiculos}</td>`).join("")}</tr>`)
        .join("")}</tbody></table>`
      : "";
  const veic = r.veiculos
    .map(({ doc, etapas: minhas, espera }) => {
      const marcas = minhas
        .map((m) => `${esc(etapas.find((e) => e.id === m.id)?.nome || m.id)} ${esc(horaDe(m.em))}${m.lancado ? "*" : ""} (${num(m.pax, 1)} pax)`)
        .join(" · ");
      const res = Array.isArray(doc.reservas) ? doc.reservas.map((z) => `${z.titular || z.codigo} (${z.pax})`).join(", ") : "";
      return `<tr><td>${esc(dataBr(doc.data).slice(0, 5))}</td><td>${esc(doc.hora || "")}</td><td>${esc((doc.voos || []).join(", ") || "—")}</td><td>${esc(doc.veiculo || "—")}</td><td style="text-align:right">${doc.pax}</td><td>${marcas}</td><td style="text-align:right">${espera?.min !== null && espera?.min !== undefined ? textoMinutos(espera.min) : "—"}</td></tr>${res ? `<tr><td></td><td colspan="6" style="color:#57606a;font-size:9px">${esc(res)}</td></tr>` : ""}`;
    })
    .join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Atendimento · ${esc(pessoa.nome)} · ${esc(periodoDe(x))}</title><style>${CSS_IMPRESSAO}${CSS_EXTRA}</style></head><body>
<header class="topo"><img src="${logoLuck}" alt=""><div><h1>${esc(pessoa.nome)}</h1><p>Atendimento no aeroporto · ${esc(pessoa.turnoNome || "")} · ${esc(periodoDe(x))}</p></div>
<div class="gerado">Luck Receptivo ${esc(regiaoAtual().nome)}<br>Gerado em ${esc(gerado)}</div></header>
<div class="kpis">${kpis}</div>
${dias}
${htmlNoShow(r.noShows || [], "No shows informados")}
<h2>Veículos atendidos (${r.veiculos.length})</h2>
<table class="pend"><thead><tr><th class="e">Dia</th><th class="e">Hora</th><th class="e">Voo(s)</th><th class="e">Veículo</th><th>Pax</th><th class="e">O que marcou</th><th>Espera</th></tr></thead><tbody>${veic}</tbody></table>
<div class="notas"><p>${x.regra === "total" ? "Regra: cada pessoa conta o veículo inteiro." : "Regra: quando duas pessoas marcam a mesma etapa, os pax do veículo são divididos entre elas."
    } % = pax do colaborador na etapa ÷ pax com a etapa marcada no período. * lançado pelo Operacional sem o horário da cartinha.</p></div>
<div class="assin"><div>${esc(pessoa.nome)}</div><div>Supervisão</div></div>
</body></html>`;
};

export const imprimirColaborador = (x) => {
  if (!x) return "";
  registrarImpressao("atendimento_colaborador", "Atendimento por colaborador (impressão)", `${x.pessoa.nome} · ${periodoDe(x)}`);
  return imprimirHtml(montarHtmlColaborador(x));
};

export const baixarExcelColaborador = (x) => {
  if (!x) return;
  const { pessoa, etapas, r } = x;
  const wb = XLSX.utils.book_new();
  const resumo = [
    ["Colaborador", pessoa.nome],
    ["Turno", pessoa.turnoNome || ""],
    ["Período", periodoDe(x)],
    [],
    ["Etapa", "Pax", "Veículos", "% do total"],
    ...etapas.map((e) => [e.nome, Number(r.etapas[e.id].pax.toFixed(1)), r.etapas[e.id].veiculos, Number(r.etapas[e.id].pct.toFixed(1))]),
    ...(etapas.length > 1 ? [[], ["Espera média (min)", r.esperaMedia === null ? "" : Math.round(r.esperaMedia)]] : []),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumo), "Resumo");
  const dias = [["Dia", ...etapas.flatMap((e) => [`${e.nome} (pax)`, `${e.nome} (veículos)`])], ...r.dias.map((d) => [dataBr(d.data), ...etapas.flatMap((e) => [Number(d.etapas[e.id].pax.toFixed(1)), d.etapas[e.id].veiculos])])];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dias), "Por dia");
  const veic = [["Dia", "Hora", "Voo(s)", "Veículo", "Pax do veículo", ...etapas.flatMap((e) => [`${e.nome} (horário)`, `${e.nome} (pax dele)`]), "Espera (min)", "Reservas"]];
  r.veiculos.forEach(({ doc, etapas: minhas, espera }) =>
    veic.push([
      dataBr(doc.data),
      doc.hora || "",
      (doc.voos || []).join(", "),
      doc.veiculo || "",
      Number(doc.pax) || 0,
      ...etapas.flatMap((e) => {
        const m = minhas.find((z) => z.id === e.id);
        return m ? [horaDe(m.em), Number(m.pax.toFixed(1))] : ["", ""];
      }),
      espera?.min ?? "",
      Array.isArray(doc.reservas) ? doc.reservas.map((z) => `${z.codigo} ${z.titular} (${z.pax})`).join("; ") : "",
    ]),
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(veic), "Veículos");
  if (r.noShows?.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhasNoShowExcel(r.noShows)), "No show");
  const nome = pessoa.nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "-").toLowerCase();
  XLSX.writeFile(wb, `atendimento-${nome}-${x.inicio}${x.fim !== x.inicio ? `-a-${x.fim}` : ""}.xlsx`);
};
