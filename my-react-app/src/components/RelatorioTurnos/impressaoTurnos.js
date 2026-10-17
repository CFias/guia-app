// impressaoTurnos.js
//
// Versão para a gerência do relatório "Demanda por turno": páginas A4 em pé
// (resumo, turnos, colaboradores, mapa de calor do período, dia da semana ×
// hora), abertas na impressão do navegador (dá para "Salvar como PDF"). E a
// planilha Excel com os números.

import * as XLSX from "xlsx";
import logoLuck from "../../assets/clover.png";
import { minimoPositivo, nivelCalor } from "./calor";
import {
  DIAS_SEMANA_CURTO,
  DIAS_SEMANA_LONGO,
  PAPEIS,
  dataBr,
  dataCurta,
  diaDaSemana,
  horaTexto,
  nomeTipo,
  num,
  textoDias,
} from "../../Services/Services/relatorioTurnos";

const esc = (t) =>
  String(t ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0];
const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];
// mesma escala de cor da tela (laranja), em tons fixos para impressão
const CALOR = [
  "#f6f8fa",
  "#fde4cf",
  "#fbc597",
  "#f79d5c",
  "#e8590c",
  "#a63c06",
];
const TEXTO_CALOR = [
  "#8c959f",
  "#1f2328",
  "#1f2328",
  "#1f2328",
  "#ffffff",
  "#ffffff",
];

export const textoPico = (s) =>
  s
    ? `${s.pax} em ${DIAS_SEMANA_CURTO[diaDaSemana(s.data)].toLowerCase()} ${dataCurta(s.data)}`
    : "—";

const CSS = `
@page { size: A4 portrait; margin: 11mm 11mm 13mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #1f2328; font: 10.5px/1.45 Inter, "Segoe UI", Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.topo { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #1f2328; padding-bottom: 8px; }
.topo img { width: 30px; height: 30px; }
.topo h1 { margin: 0; font-size: 18px; }
.topo p { margin: 1px 0 0; color: #57606a; }
.topo .gerado { margin-left: auto; text-align: right; color: #57606a; font-size: 9.5px; }
h2 { font-size: 12px; margin: 14px 0 6px; letter-spacing: .02em; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 10px; }
.kpi { border: 1px solid #ced4da; border-radius: 6px; padding: 6px 9px; }
.kpi span { display: block; color: #57606a; font-size: 9.5px; }
.kpi b { font-size: 17px; }
.kpi small { display: block; color: #57606a; font-size: 9px; }
.turnos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.turno { border: 1px solid #ced4da; border-top: 4px solid var(--c); border-radius: 6px; padding: 7px 9px; break-inside: avoid; }
.turno.apoio { border-style: dashed; border-top-style: solid; }
.turno h3 { margin: 0; font-size: 12.5px; }
.turno .hr { color: #57606a; font-weight: 600; }
.turno .tag { font-size: 8px; border: 1px solid #57606a; border-radius: 3px; padding: 0 4px; margin-left: 4px; color: #57606a; vertical-align: 1px; }
.turno .eq { margin: 3px 0 5px; font-size: 9.5px; color: #444; }
.turno .eq b { color: #1f2328; }
.turno .big { font-size: 24px; font-weight: 800; line-height: 1; }
.turno .big small { font-size: 9.5px; font-weight: 600; color: #57606a; margin-left: 4px; }
.turno ul { list-style: none; margin: 5px 0 0; padding: 0; }
.turno li { padding: 2px 0; border-top: 1px dotted #ced4da; display: flex; justify-content: space-between; gap: 8px; }
.turno li b { white-space: nowrap; }
table { width: 100%; border-collapse: collapse; }
th { text-align: right; font-size: 9px; letter-spacing: .04em; text-transform: uppercase; color: #57606a; padding: 3px 6px; border-bottom: 1.5px solid #1f2328; }
th.e, td.e { text-align: left; }
td { text-align: right; padding: 3px 6px; border-bottom: 1px solid #e1e4e8; font-variant-numeric: tabular-nums; }
td:not(:first-child) { white-space: nowrap; }
td.max { font-weight: 800; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--c); margin-right: 5px; }
.papel { font-size: 8.5px; border: 1px solid #57606a; border-radius: 3px; padding: 0 4px; }
.papel.principal { border-color: #1f2328; font-weight: 700; }
.meses { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; }
.mes { break-inside: avoid; }
.mes h4 { margin: 0 0 3px; font-size: 10.5px; }
.cal { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.cal .ds { font-size: 8px; color: #57606a; text-align: center; }
.cal .d { border-radius: 3px; height: 30px; padding: 2px 3px; display: flex; flex-direction: column; justify-content: space-between; }
.cal .d i { font-style: normal; font-size: 8px; opacity: .8; }
.cal .d b { font-size: 10px; text-align: right; }
.cal .d.fora { background: transparent; color: #ced4da; border: 1px dashed #e1e4e8; }
.leg { display: flex; align-items: center; gap: 3px; margin-top: 6px; font-size: 9px; color: #57606a; }
.leg i { width: 14px; height: 9px; border-radius: 2px; display: inline-block; }
.sh { display: grid; grid-template-columns: 28px repeat(24, 1fr); gap: 1px; }
.sh span { height: 13px; border-radius: 2px; }
.sh .r { font-size: 8.5px; color: #57606a; height: auto; }
.sh .h { font-size: 7.5px; color: #57606a; text-align: center; height: auto; }
.horas { display: grid; grid-template-columns: repeat(24, 1fr); gap: 2px; align-items: end; height: 90px; border-bottom: 1px solid #1f2328; }
.horas div { position: relative; background: var(--c); border-radius: 2px 2px 0 0; min-height: 1px; }
.horas div span { position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); font-size: 7px; color: #57606a; white-space: nowrap; }
.horas-x { display: grid; grid-template-columns: repeat(24, 1fr); gap: 2px; font-size: 7.5px; color: #57606a; text-align: center; margin-top: 2px; }
.top { margin: 5px 0 0; font-size: 9.5px; }
.notas { margin-top: 12px; padding: 7px 9px; border: 1px solid #ced4da; border-radius: 6px; color: #444; font-size: 9.5px; }
.notas p { margin: 2px 0; }
.blk { break-inside: avoid; }
`;

const corDaHora = (h, turnos) => {
  const meio = h * 60 + 30;
  const t = turnos
    .filter((x) => !x.apoio)
    .find((x) => {
      const a = Number(x.inicio.slice(0, 2)) * 60 + Number(x.inicio.slice(3));
      const b = Number(x.fim.slice(0, 2)) * 60 + Number(x.fim.slice(3));
      return a <= b ? meio >= a && meio < b : meio >= a || meio < b;
    });
  return t?.cor || "#adb5bd";
};

const equipeHtml = (t) =>
  t.colaboradores
    .map(
      (c) =>
        `${c.papel === "principal" ? `<b>${esc(c.nome)}</b>` : `${esc(c.nome)} (sinergia)`}${c.obs ? ` — ${esc(c.obs)}` : ""}${
          c.dias?.length ? `, ${esc(textoDias(c.dias))}` : ""
        }${c.inicio && c.fim ? `, ${horaTexto(c.inicio)}–${horaTexto(c.fim)}` : ""}`,
    )
    .join(" · ") || "Sem colaboradores";

const calendarioHtml = (calendario) => {
  const porData = new Map(calendario.map((d) => [d.data, d]));
  const max = Math.max(0, ...calendario.map((d) => d.pax));
  const min = minimoPositivo(calendario.map((d) => d.pax));
  const meses = [...new Set(calendario.map((d) => d.data.slice(0, 7)))];
  const blocos = meses
    .map((mes) => {
      const [a, m] = mes.split("-").map(Number);
      const vazios = (new Date(a, m - 1, 1, 12).getDay() + 6) % 7;
      const ultimo = new Date(a, m, 0, 12).getDate();
      let cel = ORDEM_SEMANA.map(
        (w) => `<span class="ds">${DIAS_SEMANA_CURTO[w]}</span>`,
      ).join("");
      cel += "<span></span>".repeat(vazios);
      for (let dia = 1; dia <= ultimo; dia += 1) {
        const iso = `${mes}-${String(dia).padStart(2, "0")}`;
        const d = porData.get(iso);
        if (!d) {
          cel += `<span class="d fora"><i>${dia}</i></span>`;
          continue;
        }
        const n = nivelCalor(d.pax, max, min);
        cel += `<span class="d" style="background:${CALOR[n]};color:${TEXTO_CALOR[n]}"><i>${dia}</i><b>${d.pax || ""}</b></span>`;
      }
      return `<div class="mes"><h4>${MESES[m - 1]} ${a}</h4><div class="cal">${cel}</div></div>`;
    })
    .join("");
  const top = [...calendario]
    .sort((a, b) => b.pax - a.pax)
    .slice(0, 3)
    .filter((d) => d.pax > 0);
  return `<div class="meses">${blocos}</div>
<div class="leg">Menos ${CALOR.map((c) => `<i style="background:${c}"></i>`).join("")} Mais <span>(${min > 0 && min < max ? `de ${num(min, 0)} a ` : "até "}${num(max, 0)} pessoas no dia)</span></div>
${top.length ? `<p class="top">Dias de maior demanda: ${top.map((d) => `<b>${DIAS_SEMANA_CURTO[diaDaSemana(d.data)].toLowerCase()} ${dataCurta(d.data)}</b> (${d.pax})`).join(" · ")}</p>` : ""}`;
};

const semanaHoraHtml = (semanaHora) => {
  const max = Math.max(0, ...semanaHora.flat().filter((v) => v !== null));
  const min = minimoPositivo(semanaHora.flat());
  let html = `<span></span>${Array.from({ length: 24 }, (_, h) => `<span class="h">${h % 3 === 0 ? String(h).padStart(2, "0") : ""}</span>`).join("")}`;
  ORDEM_SEMANA.forEach((w) => {
    html += `<span class="r">${DIAS_SEMANA_CURTO[w]}</span>`;
    semanaHora[w].forEach((v) => {
      const n = v === null ? 0 : nivelCalor(v, max, min);
      html += `<span style="background:${CALOR[n]}"></span>`;
    });
  });
  return `<div class="sh">${html}</div>`;
};

export const montarHtmlRelatorioTurnos = (r) => {
  const agora = new Date();
  const gerado = `${agora.toLocaleDateString("pt-BR")} ${agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  const principais = r.turnos.filter((t) => !t.apoio);
  const maisMov = [...principais].sort((a, b) => b.mediaPax - a.mediaPax)[0];
  const maxHora = Math.max(1, ...r.porHora);

  const cards = r.turnos
    .map(
      (t) => `<div class="turno ${t.apoio ? "apoio" : ""}" style="--c:${t.cor}">
<h3>${esc(t.nome)} <span class="hr">· ${horaTexto(t.inicio)} às ${horaTexto(t.fim)}</span>${t.apoio ? '<span class="tag">APOIO</span>' : ""}</h3>
<div class="eq">${equipeHtml(t)}</div>
<div class="big">${num(t.mediaPax)}<small>pessoas por ${t.apoio ? "dia na janela" : "turno"} (média)</small></div>
<ul>
${!t.apoio && t.porPrincipal !== null ? `<li><span>Por colaborador principal</span><b>${num(t.porPrincipal)}</b></li>` : ""}
<li><span>Reservas</span><b>${num(t.mediaReservas)}</b></li>
<li><span>${esc(r.grupo)}</span><b>${num(t.mediaGrupos)}</b></li>
<li><span>Pessoas por hora</span><b>${num(t.paxPorHora)}</b></li>
<li><span>Total no período</span><b>${t.totalPax.toLocaleString("pt-BR")}</b></li>
<li><span>Dia mais cheio</span><b>${esc(textoPico(t.maior))}</b></li>
<li><span>Dia mais vazio</span><b>${esc(textoPico(t.menor))}</b></li>
</ul>
</div>`,
    )
    .join("");

  const semana = r.turnos
    .map((t) => {
      const vals = ORDEM_SEMANA.map((w) => t.semana[w]);
      const max = Math.max(...vals.filter((v) => v !== null));
      return `<tr><td class="e"><span class="dot" style="--c:${t.cor}"></span>${esc(t.nome)}${t.apoio ? " (apoio)" : ""}</td>${vals
        .map(
          (v) =>
            `<td class="${v !== null && v === max && v > 0 ? "max" : ""}">${v === null ? "—" : num(v)}</td>`,
        )
        .join("")}</tr>`;
    })
    .join("");

  const colabs = r.colaboradores
    .map(
      (
        c,
      ) => `<tr><td class="e"><b>${esc(c.nome)}</b>${c.obs ? ` <span style="color:#57606a">· ${esc(c.obs)}</span>` : ""}</td>
<td class="e"><span class="papel ${c.papel}">${esc(PAPEIS.find((p) => p.id === c.papel)?.curto)}</span></td>
<td class="e"><span class="dot" style="--c:${c.cor}"></span>${esc(c.turnoNome)}</td>
<td class="e">${horaTexto(c.janela.inicio)}–${horaTexto(c.janela.fim)}</td>
<td class="e">${esc(textoDias(c.dias))}</td>
<td><b>${num(c.mediaPax)}</b></td><td>${c.totalPax.toLocaleString("pt-BR")}</td></tr>`,
    )
    .join("");

  const horas = r.porHora
    .map(
      (v, h) =>
        `<div style="--c:${corDaHora(h, r.turnos)};height:${Math.max(1, (v / maxHora) * 100)}%">${v >= maxHora * 0.12 ? `<span>${num(v, 0)}</span>` : ""}</div>`,
    )
    .join("");

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Demanda por turno ${esc(dataBr(r.inicio))} a ${esc(dataBr(r.fim))}</title><style>${CSS}</style></head><body>
<header class="topo"><img src="${logoLuck}" alt=""><div><h1>Demanda por turno</h1><p>${esc(r.tituloServicos)} · ${esc(dataBr(r.inicio))} a ${esc(dataBr(r.fim))} (${r.nDias} dias)</p></div>
<div class="gerado">Luck Receptivo Salvador<br>Gerado em ${esc(gerado)}</div></header>

<div class="kpis">
<div class="kpi"><span>${esc(r.rotuloPessoas)}</span><b>${r.totalPax.toLocaleString("pt-BR")}</b><small>${r.totalReservas.toLocaleString("pt-BR")} reservas</small></div>
<div class="kpi"><span>Média por dia</span><b>${num(r.mediaPaxDia)}</b><small>pessoas</small></div>
<div class="kpi"><span>Turno mais movimentado</span><b>${esc(maisMov?.nome || "—")}</b><small>${maisMov ? `${num(maisMov.mediaPax)} pessoas por turno` : ""}</small></div>
<div class="kpi"><span>Na troca de turno</span><b>${num(r.troca.mediaPax)}</b><small>pessoas por dia, nos dois turnos</small></div>
</div>
${
  Object.keys(r.porTipo).length > 1
    ? `<p class="top">Por tipo: ${Object.entries(r.porTipo)
        .map(
          ([k, v]) =>
            `${esc(nomeTipo(k))} <b>${v.pax.toLocaleString("pt-BR")}</b>`,
        )
        .join(" · ")}</p>`
    : ""
}

<h2>Média por turno</h2>
<div class="turnos">${cards}</div>

<div class="blk">
<h2>Colaboradores</h2>
<table><thead><tr><th class="e">Colaborador</th><th class="e">Papel</th><th class="e">Turno</th><th class="e">Horário</th><th class="e">Dias</th><th>Média/dia</th><th>Total</th></tr></thead><tbody>${colabs}</tbody></table>
${
  r.folguistas.length
    ? `<p class="top"><b>Folguista${r.folguistas.length > 1 ? "s" : ""}:</b> ${esc(r.folguistas.map((f) => f.nome + (f.obs ? ` (${f.obs})` : "")).join(", "))} — cobre as folgas.</p>`
    : ""
}
</div>

<div class="blk">
<h2>Mapa de calor do período (pessoas por dia)</h2>
${calendarioHtml(r.calendario)}
</div>

<div class="blk">
<h2>Dia da semana × hora (média de pessoas)</h2>
${semanaHoraHtml(r.semanaHora)}
</div>

<div class="blk">
<h2>Média por dia da semana, por turno</h2>
<table><thead><tr><th class="e">Turno</th>${ORDEM_SEMANA.map((w) => `<th>${DIAS_SEMANA_CURTO[w]}</th>`).join("")}</tr></thead><tbody>${semana}</tbody></table>
</div>

<div class="blk">
<h2>Ao longo do dia (média de pessoas por hora)</h2>
<div class="horas">${horas}</div>
<div class="horas-x">${r.porHora.map((_, h) => `<span>${String(h).padStart(2, "0")}</span>`).join("")}</div>
</div>

<div class="notas blk">
<p><b>Como foi calculado:</b> pessoas = adultos + crianças + bebês de cada reserva do Phoenix (${esc(r.tituloServicos)}). Nas chegadas vale o horário do voo${
    r.pelaApresentacao
      ? ` (${r.pelaApresentacao} reservas sem horário de voo usaram a apresentação)`
      : ""
  }; nos demais serviços, a apresentação. Reservas com CLD, cancelado, não escalar ou dispensado não contam. Quando dois turnos se sobrepõem, a reserva conta para os dois. Turno que passa da meia-noite é contado pelo dia em que começa. "Por colaborador principal" divide a demanda do turno pelos colaboradores de função principal escalados no dia; quem está em sinergia não divide a conta.</p>
</div>
</body></html>`;
};

export const imprimirRelatorioTurnos = (r) => {
  if (!r) return "";
  const html = montarHtmlRelatorioTurnos(r);
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

// Excel: resumo por turno, colaboradores e uma linha por dia
export const baixarExcelTurnos = (r) => {
  if (!r) return;
  const resumo = [
    [
      `Demanda por turno · ${r.tituloServicos} · ${dataBr(r.inicio)} a ${dataBr(r.fim)} (${r.nDias} dias)`,
    ],
    [],
    [
      "TURNO",
      "HORÁRIO",
      "TIPO",
      "EQUIPE",
      "MÉDIA PESSOAS",
      "POR COLABORADOR PRINCIPAL",
      "MÉDIA RESERVAS",
      `MÉDIA ${r.grupo.toUpperCase()}`,
      "PESSOAS/HORA",
      "TOTAL",
      "DIA MAIS CHEIO",
      "DIA MAIS VAZIO",
    ],
    ...r.turnos.map((t) => [
      t.nome,
      `${t.inicio} às ${t.fim}`,
      t.apoio ? "Janela de apoio" : "Turno",
      t.colaboradores
        .map((c) => `${c.nome}${c.papel === "sinergia" ? " (sinergia)" : ""}`)
        .join(", "),
      Number(t.mediaPax.toFixed(1)),
      t.porPrincipal === null || t.apoio
        ? ""
        : Number(t.porPrincipal.toFixed(1)),
      Number(t.mediaReservas.toFixed(1)),
      Number(t.mediaGrupos.toFixed(1)),
      Number(t.paxPorHora.toFixed(1)),
      t.totalPax,
      textoPico(t.maior),
      textoPico(t.menor),
    ]),
    [],
    [r.rotuloPessoas, r.totalPax],
    ["Média por dia", Number(r.mediaPaxDia.toFixed(1))],
    [
      "Na troca de turno (média/dia, conta nos dois turnos)",
      Number(r.troca.mediaPax.toFixed(1)),
    ],
    ...Object.entries(r.porTipo).map(([k, v]) => [nomeTipo(k), v.pax]),
  ];
  const abaResumo = XLSX.utils.aoa_to_sheet(resumo);
  abaResumo["!cols"] = [20, 14, 14, 36, 14, 22, 14, 14, 12, 10, 20, 20].map(
    (wch) => ({ wch }),
  );

  const colabs = [
    [
      "COLABORADOR",
      "PAPEL",
      "OBSERVAÇÃO",
      "TURNO",
      "HORÁRIO",
      "DIAS",
      "DIAS NO PERÍODO",
      "MÉDIA PESSOAS/DIA",
      "TOTAL",
    ],
    ...r.colaboradores.map((c) => [
      c.nome,
      PAPEIS.find((p) => p.id === c.papel)?.nome,
      c.obs,
      c.turnoNome,
      `${c.janela.inicio}–${c.janela.fim}`,
      textoDias(c.dias),
      c.diasNoPeriodo,
      Number(c.mediaPax.toFixed(1)),
      c.totalPax,
    ]),
    ...r.folguistas.map((f) => [
      f.nome,
      "Folguista",
      f.obs,
      "",
      "",
      "",
      "",
      "",
      "",
    ]),
  ];
  const abaColabs = XLSX.utils.aoa_to_sheet(colabs);
  abaColabs["!cols"] = [18, 18, 24, 20, 12, 16, 14, 16, 10].map((wch) => ({
    wch,
  }));

  const porDia = [
    [
      "DATA",
      "DIA",
      "PESSOAS NO DIA",
      "RESERVAS NO DIA",
      ...r.turnos.map((t) => `${t.nome.toUpperCase()} (${t.inicio}–${t.fim})`),
    ],
    ...r.calendario.map((d, i) => [
      dataBr(d.data),
      DIAS_SEMANA_LONGO[diaDaSemana(d.data)],
      d.pax,
      d.reservas,
      ...r.turnos.map((t) => t.serie[i].pax),
    ]),
  ];
  const abaDias = XLSX.utils.aoa_to_sheet(porDia);
  abaDias["!cols"] = [12, 10, 14, 14, ...r.turnos.map(() => 22)].map((wch) => ({
    wch,
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, abaResumo, "Resumo");
  XLSX.utils.book_append_sheet(wb, abaColabs, "Colaboradores");
  XLSX.utils.book_append_sheet(wb, abaDias, "Por dia");
  XLSX.writeFile(wb, `demanda-por-turno-${r.inicio}-a-${r.fim}.xlsx`);
};
