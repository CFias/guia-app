import { Fragment, useEffect, useMemo, useState } from "react";
import { Button, Card, Icon, KpiTiles, Segmented } from "../ui";
import {
  DIAS_SEMANA_CURTO,
  DIAS_SEMANA_LONGO,
  MODELOS_ESCALA,
  dataBr,
  diaDaSemana,
  FERIAS,
  OCORRENCIAS,
  ehDomingoDoMes,
  escalaDoDia,
  excecaoDoDia,
  listarDatas,
  nomeOcorrencia,
  relatorioOcorrencias,
  feriadoDoDia,
  janelaDo,
  isoLocal,
  nomeDaFuncao,
  somarDias,
  todosDaEquipe,
  trabalhaPeloModelo,
} from "../../Services/Services/relatorioTurnos";
import { regiaoAtual } from "../../Services/Services/regiaoAtiva";
import { registrarImpressao } from "../../Services/Services/atividadeRepository";
import { CSS_IMPRESSAO, baixarPngHtml, esc, escalarFontes, imprimirHtml } from "./impressaoTurnos";

// tamanho da letra da imagem/PDF da escala (lembrado neste navegador)
const TAMANHOS_LETRA = [80, 90, 100, 110, 120, 130, 140, 150, 170];
const CHAVE_LETRA = "esc.tamanhoLetra";
const lerTamanhoLetra = () => {
  try {
    const n = Number(localStorage.getItem(CHAVE_LETRA));
    return TAMANHOS_LETRA.includes(n) ? n : 100;
  } catch {
    return 100;
  }
};
import "./escala.css";

/* Aba "Escala da equipe": 1 ou 2 semanas, agrupadas por turno. No cabeçalho
   de cada turno, quantas pessoas há em cada dia (vermelho = ninguém). Cada
   dia abre um menu: folga, dia extra, cobrir outro turno ou voltar ao modelo.
   As mudanças ficam pendentes até "Salvar escala" (barra embaixo). Também
   dá para imprimir a escala para o mural, limpar exceções e tirar alguém da
   equipe. É essa escala que o painel do aeroporto e os relatórios usam. */

const hojeIso = () => isoLocal(new Date());
const segundaDa = (iso) => somarDias(iso, -((diaDaSemana(iso) + 6) % 7));
const nomeModelo = (c) => {
  if (c.folguista) return "Folguista";
  const m = c.escala?.modelo || "semanal";
  if (m !== "semanal") return MODELOS_ESCALA.find((x) => x.id === m)?.nome.split(" (")[0] || m;
  const folgas = c.dias?.length ? 7 - c.dias.length : 0;
  return folgas ? `${7 - folgas}x${folgas}` : "todos os dias";
};
const iniciais = (nome = "") =>
  String(nome)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase() || "?";
const FOLGUISTAS = "__folguistas__";
// busca por nome/função e filtro de função ("__sem__" = sem função)
const passaNoFiltro = (c, termo, funcao) =>
  (!termo || `${c.nome} ${c.funcaoNome || ""}`.toLowerCase().includes(termo)) && (!funcao || (funcao === "__sem__" ? !c.funcaoNome : c.funcaoNome === funcao));

// situação de uma pessoa num dia (modelo + exceção)
const situacao = (c, data, rascunho, turnoPorId) => {
  const x = excecaoDoDia(rascunho, data, c.id);
  const base = !c.folguista && trabalhaPeloModelo(c, data);
  const proprio = turnoPorId.get(c.turnoId);
  // horário do dia: o da pessoa no turno dela (com fim de semana e feriado) ou o do turno coberto
  const janela = (t) => {
    if (!t) return "";
    const j = t.id === c.turnoId ? janelaDo(c, t, data) : { inicio: t.inicio, fim: t.fim };
    return `${j.inicio}–${j.fim}`;
  };
  if (x?.tipo === "folga") return { trabalha: false, exc: "folga", rotulo: "Folga", detalhe: "lançada" };
  if (x?.tipo === "ferias") return { trabalha: false, exc: "ferias", ausencia: true, rotulo: "Férias", detalhe: `${dataBr(x.inicio).slice(0, 5)} a ${dataBr(x.fim).slice(0, 5)}` };
  if (x?.tipo === "atestado" || x?.tipo === "falta") return { trabalha: false, exc: x.tipo, ausencia: true, rotulo: nomeOcorrencia(x.tipo), detalhe: x.obs || "" };
  if (x?.tipo === "trabalha") return { trabalha: true, exc: "extra", turno: proprio, rotulo: proprio?.nome || "Extra", detalhe: "dia extra" };
  if (x?.tipo === "cobre") {
    const t = turnoPorId.get(x.turnoId);
    return { trabalha: true, exc: "cobre", turno: t, rotulo: t?.nome || "Cobre", detalhe: `cobrindo · ${janela(t)}` };
  }
  const fer = c.feriadosDela?.[data];
  if (x?.tipo === "atraso")
    return { trabalha: true, exc: "atraso", turno: proprio, rotulo: proprio?.nome || "Trabalha", detalhe: janela(proprio), minutos: Number(x.minutos) || 0, obs: x.obs || "" };
  if (base) return { trabalha: true, turno: proprio, rotulo: proprio?.nome || "Trabalha", detalhe: janela(proprio), rev: !fer && !!c.fds && [0, 6].includes(diaDaSemana(data)), feriado: !!fer };
  if (fer) return { trabalha: false, rotulo: "Folga", detalhe: "feriado", feriado: true };
  if (c.domingoFolga && ehDomingoDoMes(data, c.domingoFolga)) return { trabalha: false, rotulo: "Folga", detalhe: "domingo do mês", domingo: true };
  if (c.fds && [0, 6].includes(diaDaSemana(data))) return { trabalha: false, rotulo: "Folga", detalhe: "revezamento" };
  return { trabalha: false, rotulo: "Folga" };
};

// ---------- impressão (mural) ----------
// cor clarinha a partir da cor do turno/setor (sem color-mix: o PNG não entende)
const tom = (hex = "#1f2328", pct = 12) => {
  const h = String(hex).replace("#", "");
  const n = h.length === 3 ? h.split("").map((x) => x + x).join("") : h.padEnd(6, "0").slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) || 0);
  const mix = (c) => Math.round(255 - ((255 - c) * pct) / 100);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
};
// CSS comum das duas impressões da escala (letra maior, para o mural e o grupo)
const CSS_ESCALA = `
.esc { width: 100%; border-collapse: collapse; }
.esc td, .esc th { text-align: center; border: 1px solid #d0d7de; padding: 7px 5px; white-space: normal; }
.esc thead th { font-size: 11.5px; letter-spacing: .04em; text-transform: uppercase; color: #3d444d; }
.esc th small { font-weight: 500; color: #57606a; font-size: 10.5px; text-transform: none; letter-spacing: 0; }
.esc td.e { text-align: left; min-width: 150px; font-size: 13px; }
.esc td.e small { color: #57606a; font-size: 10.5px; }
.esc td.t { font-weight: 700; font-size: 12.5px; line-height: 1.3; }
.esc td.t small { font-weight: 500; color: #57606a; font-size: 10px; }
.esc td.f { color: #8c959f; font-size: 11px; background-color: #f6f7f9; }
.esc tr.g td { text-align: left; font-weight: 800; font-size: 13px; background: #f6f8fa; }
.esc td.o { font-weight: 800; font-size: 11.5px; }
.esc.mes td, .esc.mes th { padding: 5px 1px; font-size: 10px; }
.esc.mes td.e { font-size: 11px; min-width: 130px; padding: 5px 6px; }
.esc.mes td.e small { font-size: 9px; }
.esc.mes td.t, .esc.mes td.o { font-size: 9.5px; }
.esc.mes td.f { font-size: 9.5px; }
.esc.mes thead th { font-size: 9px; letter-spacing: 0; }
.esc.mes thead th b { font-size: 11px; color: #1f2328; }
.esc.mes thead th.fds { background: #f6f8fa; }
.esc.mes tr.g td { font-size: 11.5px; padding: 6px; }
.legenda { margin: 8px 0 0; color: #57606a; font-size: 10.5px; }
.esc .dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 7px; vertical-align: 0; }
.topo h1 { font-size: 21px; }
.topo p { font-size: 12px; }
`;
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const nomeMes = (iso) => `${MESES[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}`;
// sábados e domingos do mês de uma data
const fimDeSemanaDoMes = (iso) => {
  const ini = `${iso.slice(0, 8)}01`;
  const out = [];
  for (let d = ini; d.slice(0, 7) === iso.slice(0, 7); d = somarDias(d, 1)) if ([0, 6].includes(diaDaSemana(d))) out.push(d);
  return out;
};

// todos os dias do mês de uma data
const diasDoMes = (iso) => {
  const out = [];
  for (let d = `${iso.slice(0, 8)}01`; d.slice(0, 7) === iso.slice(0, 7); d = somarDias(d, 1)) out.push(d);
  return out;
};

const sabadoDe = (d) => (diaDaSemana(d) === 6 ? d : somarDias(d, -1));
// fins de semana do período (sábado → [sábado, domingo]) para os chips de escolha
const ehFdsLista = (dias, modo, sabadoDe) => {
  if (modo !== "fds") return [];
  const m = new Map();
  dias.forEach((d) => {
    const k = sabadoDe(d);
    m.set(k, [...(m.get(k) || []), d]);
  });
  return [...m.entries()].map(([sab, ds]) => ({ sab, dias: ds }));
};

// cores das ausências e ocorrências (tela e impressão)
const COR_OCORRENCIA = { ferias: FERIAS.cor, ...Object.fromEntries(OCORRENCIAS.map((o) => [o.id, o.cor])) };
// texto curto de um dia (visão do mês: 31 colunas)
const codigoDoDia = (s) => {
  if (s.exc === "ferias") return FERIAS.curto;
  if (s.exc === "atestado" || s.exc === "falta") return OCORRENCIAS.find((o) => o.id === s.exc).curto;
  if (!s.trabalha) return "F";
  if (s.exc === "cobre") return "↪";
  if (s.exc === "extra") return "+";
  const h = (s.detalhe || "").slice(0, 5);
  const hora = h ? (h.slice(3, 5) === "00" ? `${Number(h.slice(0, 2))}h` : `${Number(h.slice(0, 2))}:${h.slice(3, 5)}`) : "T";
  return `${hora}${s.exc === "atraso" ? "!" : ""}`;
};
const LEGENDA_MES = "9h / 9:40 = horário de entrada · F = folga · Fé = férias · At = atestado · Fa = falta · ! = atraso · + = dia extra · ↪ = cobrindo outro turno";

const htmlEscala = ({ config, equipe, dias, rascunho, turnoPorId, titulo = "Escala da equipe", subtitulo, comHorario = false }) => {
  const agora = new Date();
  const mes = dias.length > 14;
  const cab = dias
    .map((d) => {
      const fer = feriadoDoDia(config, d);
      if (mes) return `<th class="${[0, 6].includes(diaDaSemana(d)) ? "fds" : ""}">${esc(DIAS_SEMANA_CURTO[diaDaSemana(d)].slice(0, 1))}<br><b>${esc(d.slice(8))}</b>${fer ? `<br><small style="color:#b45309">fer.</small>` : ""}</th>`;
      return `<th>${esc(DIAS_SEMANA_CURTO[diaDaSemana(d)])}<br><small>${esc(dataBr(d).slice(0, 5))}</small>${fer ? `<br><small style="color:#b45309;font-weight:700">${esc(fer.nome)}</small>` : ""}</th>`;
    })
    .join("");
  const grupos = [
    ...config.turnos.map((t) => ({ t, pessoas: equipe.filter((c) => c.turnoId === t.id) })),
    { t: { nome: "Folguistas", cor: "#64748b", inicio: "", fim: "" }, pessoas: equipe.filter((c) => c.folguista) },
  ].filter((g) => g.pessoas.length);
  const linhas = grupos
    .map(
      (g) =>
        `<tr class="g"><td colspan="${dias.length + 1}" style="border-left:4px solid ${g.t.cor}"><span class="dot" style="background:${g.t.cor}"></span>${esc(g.t.nome)}${g.t.inicio ? ` · ${esc(g.t.inicio)}–${esc(g.t.fim)}` : ""}</td></tr>` +
        g.pessoas
          .map(
            (c) =>
              `<tr><td class="e"><b>${esc(c.nome)}</b>${c.funcaoNome ? `<br><small>${esc(c.funcaoNome)}</small>` : ""}</td>${dias
                .map((d) => {
                  const s = situacao(c, d, rascunho, turnoPorId);
                  if (s.ausencia) {
                    const cor = COR_OCORRENCIA[s.exc];
                    return `<td class="o" style="background:${tom(cor, 12)};color:${cor}">${esc(mes ? codigoDoDia(s) : s.rotulo)}</td>`;
                  }
                  if (mes) return s.trabalha ? `<td class="t" style="background:${tom(s.turno?.cor || "#1f2328", 16)}">${esc(codigoDoDia(s))}</td>` : `<td class="f">F</td>`;
                  return s.trabalha
                    ? `<td class="t" style="background:${tom(s.turno?.cor || "#1f2328", 16)}">${esc(s.exc === "cobre" ? `Cobre ${s.rotulo}` : s.exc === "extra" ? "Extra" : s.rotulo)}${s.exc === "atraso" ? `<br><small style="color:#b45309">atraso ${s.minutos} min</small>` : comHorario && s.detalhe && !s.exc ? `<br><small>${esc(s.detalhe)}</small>` : ""
                    }</td>`
                    : `<td class="f">${s.domingo ? "Folga<br><small>dom. do mês</small>" : "Folga"}</td>`;
                })
                .join("")}</tr>`,
          )
          .join(""),
    )
    .join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Escala ${esc(dataBr(dias[0]))} a ${esc(dataBr(dias[dias.length - 1]))}</title><style>${CSS_IMPRESSAO}
@page { size: A4 landscape; margin: 10mm; }
${CSS_ESCALA}
</style></head><body>
<header class="topo"><div><h1>${esc(titulo)}</h1><p>${esc(subtitulo || `${dataBr(dias[0])} a ${dataBr(dias[dias.length - 1])}`)}</p></div>
<div class="gerado">Luck Receptivo ${esc(regiaoAtual().nome)}<br>Gerado em ${esc(agora.toLocaleDateString("pt-BR"))}</div></header>
<table class="esc${mes ? " mes" : ""}" style="margin-top:10px"><thead><tr><th class="e">Pessoa</th>${cab}</tr></thead><tbody>${linhas}</tbody></table>
${mes ? `<p class="legenda">${esc(LEGENDA_MES)}</p>` : ""}
</body></html>`;
};

// ---------- impressão do plantão de fim de semana (por setor) ----------
// Liderança no topo; depois um bloco por setor (a função da pessoa). Cada dia
// mostra só o horário daquele dia ou FOLGA — sem o turno.
const EH_LIDERANCA = /l[ií]der|lideran|coorden|supervis|geren/i;
const CORES_SETOR = ["#0f766e", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#4d7c0f", "#a16207", "#475569"];
const faixa = (j) => (j?.inicio && j?.fim ? `${j.inicio}–${j.fim}` : "");

// horário de uma pessoa num dia: { horario, nota } ou null (folga)
const horarioDoDia = (c, d, rascunho, turnoPorId) => {
  const s = situacao(c, d, rascunho, turnoPorId);
  if (!s.trabalha) return null;
  if (s.exc === "cobre") return { horario: faixa(s.turno), nota: `cobre ${s.turno?.nome || ""}`.trim() };
  const t = s.turno || turnoPorId.get(c.turnoId);
  const horario = t ? faixa(janelaDo(c, t, d)) : faixa(c);
  return { horario: horario || "Trabalha", nota: s.exc === "extra" ? "dia extra" : s.exc === "atraso" ? `atraso ${s.minutos} min` : "" };
};

const htmlPlantao = ({ config, equipe, dias, rascunho, turnoPorId, subtitulo }) => {
  const agora = new Date();
  const setorDe = (c) => c.funcaoNome || nomeDaFuncao(config, c.funcao) || "";
  const lideres = equipe.filter((c) => EH_LIDERANCA.test(setorDe(c)));
  const demais = equipe.filter((c) => !lideres.includes(c));
  // ordem dos setores: a das funções cadastradas; sem setor por último
  const ordem = (config.funcoes || []).map((f) => f.nome);
  const pos = (n) => (n ? ordem.indexOf(n) + 1 || 900 : 999);
  const nomes = [...new Set(demais.map(setorDe))].sort((a, b) => pos(a) - pos(b) || a.localeCompare(b));
  // dentro do setor: quem começa mais cedo primeiro
  const cedo = (c) => dias.map((d) => horarioDoDia(c, d, rascunho, turnoPorId)?.horario || "99").sort()[0];
  const ordenar = (lista) => [...lista].sort((a, b) => cedo(a).localeCompare(cedo(b)) || a.nome.localeCompare(b.nome));
  const blocos = [
    ...(lideres.length ? [{ nome: "Liderança de plantão", cor: "#2563eb", pessoas: ordenar(lideres), lider: true }] : []),
    ...nomes.map((n, i) => ({ nome: n || "Outros", cor: CORES_SETOR[i % CORES_SETOR.length], pessoas: ordenar(demais.filter((c) => setorDe(c) === n)) })),
  ];
  const cab = dias
    .map((d) => {
      const fer = feriadoDoDia(config, d);
      return `<th>${esc(DIAS_SEMANA_CURTO[diaDaSemana(d)])}<br><small>${esc(dataBr(d).slice(0, 5))}</small>${fer ? `<br><small style="color:#b45309;font-weight:700">${esc(fer.nome)}</small>` : ""}</th>`;
    })
    .join("");
  const linhas = blocos
    .map(
      (b) =>
        `<tr class="g"><td colspan="${dias.length + 1}" style="border-left:4px solid ${b.cor}"><span class="dot" style="background:${b.cor}"></span>${esc(b.nome)}</td></tr>` +
        b.pessoas
          .map(
            (c) =>
              `<tr><td class="e"><b>${esc(c.nome)}</b>${b.lider && setorDe(c) ? `<br><small>${esc(setorDe(c))}</small>` : ""}</td>${dias
                .map((d) => {
                  const h = horarioDoDia(c, d, rascunho, turnoPorId);
                  if (h) return `<td class="t" style="background:${tom(b.cor, 11)}">${esc(h.horario)}${h.nota ? `<br><small>${esc(h.nota)}</small>` : ""}</td>`;
                  const s = situacao(c, d, rascunho, turnoPorId);
                  return s.ausencia ? `<td class="o" style="background:${tom(COR_OCORRENCIA[s.exc], 12)};color:${COR_OCORRENCIA[s.exc]}">${esc(s.rotulo)}</td>` : `<td class="f">Folga</td>`;
                })
                .join("")}</tr>`,
          )
          .join(""),
    )
    .join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Escala de fim de semana ${esc(dataBr(dias[0]))} a ${esc(dataBr(dias[dias.length - 1]))}</title><style>${CSS_IMPRESSAO}
@page { size: A4 landscape; margin: 10mm; }
${CSS_ESCALA}
</style></head><body>
<header class="topo"><div><h1>Escala de fim de semana</h1><p>${esc(subtitulo || `${dataBr(dias[0])} a ${dataBr(dias[dias.length - 1])}`)}</p></div>
<div class="gerado">Luck Receptivo ${esc(regiaoAtual().nome)}<br>Gerado em ${esc(agora.toLocaleDateString("pt-BR"))}</div></header>
<table class="esc" style="margin-top:10px"><thead><tr><th class="e">Colaborador</th>${cab}</tr></thead><tbody>${linhas}</tbody></table>
</body></html>`;
};

// ---------- relatório de ocorrências (atestado, falta, atraso, férias) ----------
const textoOcorrencias = (l) =>
  l.lista
    .map(
      (o) =>
        `${dataBr(o.data).slice(0, 5)}${o.ate ? ` a ${dataBr(o.ate).slice(0, 5)}` : ""} ${nomeOcorrencia(o.tipo).toLowerCase()}${o.tipo === "atraso" && o.minutos ? ` ${o.minutos} min` : ""}${o.obs ? ` (${o.obs})` : ""}`,
    )
    .join(" · ");
const htmlOcorrencias = ({ rel, inicio, fim }) => {
  const agora = new Date();
  const corpo = rel.linhas.length
    ? rel.linhas
      .map(
        (l) => `<tr><td class="e"><b>${esc(l.nome)}</b>${l.funcaoNome ? `<br><small>${esc(l.funcaoNome)}</small>` : ""}</td>
<td class="n">${l.falta || "—"}</td><td class="n">${l.atestado || "—"}</td><td class="n">${l.atraso ? `${l.atraso}<small> · ${l.minutosAtraso} min</small>` : "—"}</td><td class="n">${l.ferias ? `${l.ferias} dia${l.ferias > 1 ? "s" : ""}` : "—"}</td>
<td class="d">${esc(textoOcorrencias(l)) || "—"}</td></tr>`,
      )
      .join("")
    : `<tr><td colspan="6" class="d" style="text-align:center;padding:16px">Nenhuma ocorrência no período.</td></tr>`;
  const t = rel.total;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ocorrências ${esc(dataBr(inicio))} a ${esc(dataBr(fim))}</title><style>${CSS_IMPRESSAO}
@page { size: A4 landscape; margin: 10mm; }
${CSS_ESCALA}
.oc td.n { text-align: center; font-weight: 800; font-size: 13px; width: 90px; }
.oc td.n small { font-weight: 500; color: #57606a; font-size: 10px; }
.oc td.d { text-align: left; font-size: 11px; color: #3d444d; white-space: normal; }
.oc tfoot td { font-weight: 800; background: #f6f8fa; }
.kpis { margin-top: 12px; }
</style></head><body>
<header class="topo"><div><h1>Ocorrências da equipe</h1><p>${esc(dataBr(inicio))} a ${esc(dataBr(fim))} · faltas, atestados, atrasos e férias</p></div>
<div class="gerado">Luck Receptivo ${esc(regiaoAtual().nome)}<br>Gerado em ${esc(agora.toLocaleDateString("pt-BR"))}</div></header>
<div class="kpis">
<div class="kpi"><span>Faltas</span><b>${t.falta}</b></div>
<div class="kpi"><span>Atestados</span><b>${t.atestado}</b><small>dias</small></div>
<div class="kpi"><span>Atrasos</span><b>${t.atraso}</b><small>${t.minutosAtraso} min no total</small></div>
<div class="kpi"><span>Férias</span><b>${t.ferias}</b><small>dias</small></div>
</div>
<table class="esc oc" style="margin-top:12px"><thead><tr><th class="e">Pessoa</th><th>Faltas</th><th>Atestados</th><th>Atrasos</th><th>Férias</th><th>Dias</th></tr></thead><tbody>${corpo}</tbody></table>
</body></html>`;
};

// ---------- calendário do mês de uma pessoa ----------
const SEMANA_SEG = [1, 2, 3, 4, 5, 6, 0];
const CalendarioPessoa = ({ c, equipe, dias, rascunho, turnoPorId, onTrocar, onFechar, onDia }) => {
  const sit = dias.map((d) => ({ d, s: situacao(c, d, rascunho, turnoPorId) }));
  const conta = (f) => sit.filter(({ s }) => f(s)).length;
  const tot = {
    trabalha: conta((s) => s.trabalha),
    folga: conta((s) => !s.trabalha && !s.ausencia),
    ferias: conta((s) => s.exc === "ferias"),
    atestado: conta((s) => s.exc === "atestado"),
    falta: conta((s) => s.exc === "falta"),
    atraso: conta((s) => s.exc === "atraso"),
    min: sit.reduce((n, { s }) => n + (s.exc === "atraso" ? s.minutos : 0), 0),
  };
  const vazios = (diaDaSemana(dias[0]) + 6) % 7;
  return (
    <Card className="esc-cal">
      <div className="esc-cal__topo">
        <span className="esc-avatar" style={{ "--c": c.cor }}>
          {iniciais(c.nome)}
        </span>
        <span className="esc-cal__quem">
          <select className="ui-input" value={c.id} onChange={(e) => onTrocar(equipe.find((x) => x.id === e.target.value))} aria-label="Pessoa">
            {equipe.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome}
              </option>
            ))}
          </select>
          <small>{[c.funcaoNome, c.turnoNome, nomeModelo(c)].filter(Boolean).join(" · ")}</small>
        </span>
        <Button variant="ghost" size="sm" icon="x" onClick={onFechar}>
          Fechar
        </Button>
      </div>
      <div className="esc-cal__tot">
        <span><b>{tot.trabalha}</b> dias de trabalho</span>
        <span><b>{tot.folga}</b> folgas</span>
        {tot.ferias > 0 && <span className="is-ferias"><b>{tot.ferias}</b> de férias</span>}
        <span className={tot.atestado ? "is-atestado" : ""}><b>{tot.atestado}</b> atestado(s)</span>
        <span className={tot.falta ? "is-falta" : ""}><b>{tot.falta}</b> falta(s)</span>
        <span className={tot.atraso ? "is-atraso" : ""}><b>{tot.atraso}</b> atraso(s){tot.min ? ` · ${tot.min} min` : ""}</span>
      </div>
      <div className="esc-cal__grade">
        {SEMANA_SEG.map((w) => (
          <span key={w} className="esc-cal__sem">
            {DIAS_SEMANA_CURTO[w]}
          </span>
        ))}
        {Array.from({ length: vazios }, (_, i) => (
          <span key={`v${i}`} />
        ))}
        {sit.map(({ d, s }) => (
          <button
            key={d}
            type="button"
            className={`esc-cal__dia ${s.trabalha ? "is-trab" : "is-folga"} ${s.ausencia ? "is-ausencia" : ""} ${s.exc === "atraso" ? "is-atraso" : ""}`}
            style={s.ausencia ? { "--c": COR_OCORRENCIA[s.exc] } : s.trabalha ? { "--c": s.turno?.cor || c.cor } : undefined}
            onClick={(e) => onDia(e, d)}
            title={`${dataBr(d)} · ${s.rotulo}${s.detalhe ? ` (${s.detalhe})` : ""}`}
          >
            <b>{d.slice(8)}</b>
            <span>{s.ausencia ? s.rotulo : s.trabalha ? s.detalhe || s.rotulo : "Folga"}</span>
            {s.exc === "atraso" && <small>atraso {s.minutos} min</small>}
          </button>
        ))}
      </div>
    </Card>
  );
};

// ---------- férias / atestado por período ----------
const PeriodoForm = ({ c, ferias, inicioPadrao, onLancar, onTirar, onFechar }) => {
  const [tipo, setTipo] = useState("ferias");
  const [inicio, setInicio] = useState(inicioPadrao);
  const [fim, setFim] = useState(somarDias(inicioPadrao, 29));
  const [obs, setObs] = useState("");
  const valido = inicio && fim && inicio <= fim;
  const nDias = valido ? listarDatas(inicio, fim).length : 0;
  return (
    <div className="esc-modal" role="dialog" aria-modal="true" aria-label={`Férias ou atestado de ${c.nome}`} onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <form
        className="esc-modal__caixa"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valido) return;
          onLancar({ c, tipo, inicio, fim, obs: obs.trim().slice(0, 200) });
          onFechar();
        }}
      >
        <div className="esc-modal__cab">
          <b>Férias ou atestado · {c.nome}</b>
          <button type="button" onClick={onFechar} aria-label="Fechar">
            <Icon name="x" size={16} />
          </button>
        </div>
        <Segmented
          size="sm"
          ariaLabel="Tipo"
          value={tipo}
          onChange={setTipo}
          options={[
            { value: "ferias", label: "Férias" },
            { value: "atestado", label: "Atestado" },
          ]}
        />
        <div className="esc-modal__datas">
          <label>
            <span>De</span>
            <input type="date" className="ui-input" value={inicio} onChange={(e) => setInicio(e.target.value)} required />
          </label>
          <label>
            <span>Até</span>
            <input type="date" className="ui-input" value={fim} min={inicio} onChange={(e) => setFim(e.target.value)} required />
          </label>
        </div>
        <label className="esc-modal__obs">
          <span>Observação</span>
          <input type="text" className="ui-input" value={obs} onChange={(e) => setObs(e.target.value)} maxLength={200} placeholder={tipo === "ferias" ? "ex.: férias 2026/1" : "ex.: CID, médico (opcional)"} />
        </label>
        <p className="esc-modal__dica">
          {valido ? `${nDias} dia(s). ` : "A data final precisa ser depois da inicial. "}
          {tipo === "ferias" ? "Nesses dias a pessoa sai da escala e aparece como Férias." : "Cada dia entra como atestado no relatório de ocorrências."}
        </p>
        {ferias.length > 0 && (
          <div className="esc-modal__lista">
            <span>Férias lançadas</span>
            {ferias.map((f) => (
              <div key={f.id}>
                <b>
                  {dataBr(f.inicio)} a {dataBr(f.fim)}
                </b>
                {f.obs && <small>{f.obs}</small>}
                <button type="button" onClick={() => onTirar(f.id)}>
                  <Icon name="trash" size={13} /> tirar
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="esc-modal__acoes">
          <Button variant="ghost" size="sm" onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={!valido}>
            Lançar {tipo === "ferias" ? "férias" : "atestado"}
          </Button>
        </div>
      </form>
    </div>
  );
};

const EscalaEquipe = ({ config, excecoes, onSalvar, onRemoverDaEquipe, onConfigurar }) => {
  const [semana, setSemana] = useState(() => segundaDa(hojeIso()));
  const [nSemanas, setNSemanas] = useState(1);
  const [rascunho, setRascunho] = useState(excecoes);
  const [salvando, setSalvando] = useState(false);
  const [filtroTurno, setFiltroTurno] = useState("");
  const [busca, setBusca] = useState("");
  const [menu, setMenu] = useState(null); // { tipo: "dia"|"pessoa"|"coluna", c?, data?, x, y }
  const mudou = rascunho !== excecoes;

  // nSemanas: 1, 2, "fds" (sábados e domingos do mês) ou "mes" (o mês inteiro)
  const ehFds = nSemanas === "fds";
  const ehMes = nSemanas === "mes";
  const mesRef = somarDias(semana, 3);
  const diasDoPeriodo = useMemo(() => {
    if (nSemanas === "fds") return fimDeSemanaDoMes(somarDias(semana, 3));
    if (nSemanas === "mes") return diasDoMes(somarDias(semana, 3));
    return Array.from({ length: 7 * nSemanas }, (_, i) => somarDias(semana, i));
  }, [semana, nSemanas]);
  const [filtroFuncao, setFiltroFuncao] = useState("");
  const [pessoaMes, setPessoaMes] = useState(null); // calendário individual (visão do mês)
  const [periodoDe, setPeriodoDe] = useState(null); // pessoa no formulário de férias/atestado
  // Fins de semana: escolher quais mostrar/imprimir (chave = sábado do fim de semana)
  const [fdsOcultos, setFdsOcultos] = useState(() => new Set());
  const [letra, setLetraBruta] = useState(lerTamanhoLetra);
  const setLetra = (n) => {
    setLetraBruta(n);
    try {
      localStorage.setItem(CHAVE_LETRA, String(n));
    } catch {
      /* sem armazenamento: vale só nesta tela */
    }
  };
  const comLetra = (html) => escalarFontes(html, letra / 100);
  const finsDoMes = ehFdsLista(diasDoPeriodo, nSemanas, sabadoDe);
  const dias = useMemo(
    () => (nSemanas === "fds" ? diasDoPeriodo.filter((d) => !fdsOcultos.has(sabadoDe(d))) : diasDoPeriodo),
    [diasDoPeriodo, nSemanas, fdsOcultos],
  );
  const mudarPeriodo = (sentido) => {
    setFdsOcultos(new Set());
    setSemana((s0) => {
      if (!ehFds && !ehMes) return somarDias(s0, sentido * 7 * nSemanas);
      const ref = somarDias(s0, 3);
      const y = Number(ref.slice(0, 4));
      const m = Number(ref.slice(5, 7)) - 1 + sentido;
      // a segunda da semana do dia 4: somando 3 dias, cai sempre dentro do mês
      return segundaDa(isoLocal(new Date(y, m, 4, 12)));
    });
  };
  const equipe = useMemo(() => todosDaEquipe(config), [config]);
  const turnoPorId = useMemo(() => new Map(config.turnos.map((t) => [t.id, t])), [config]);
  const hoje = hojeIso();
  const ultimo = dias[dias.length - 1];

  // fecha o menu ao clicar fora, rolar ou apertar Esc
  useEffect(() => {
    if (!menu) return undefined;
    // rolar a página só fecha se rolar de verdade (o foco do clique às vezes mexe uns pixels)
    const y0 = window.scrollY;
    const fechar = (e) => {
      if (e.type === "keydown" && e.key !== "Escape") return;
      if (e.type === "mousedown" && e.target.closest?.(".esc-menu")) return;
      if (e.type === "scroll" && (e.target?.closest?.(".esc-menu") || ((e.target === document || e.target === document.documentElement) && Math.abs(window.scrollY - y0) < 40))) return;
      setMenu(null);
    };
    window.addEventListener("mousedown", fechar);
    window.addEventListener("keydown", fechar);
    window.addEventListener("scroll", fechar, true);
    window.addEventListener("resize", fechar);
    return () => {
      window.removeEventListener("mousedown", fechar);
      window.removeEventListener("keydown", fechar);
      window.removeEventListener("scroll", fechar, true);
      window.removeEventListener("resize", fechar);
    };
  }, [menu]);
  const abrirMenu = (e, dados) => {
    const r = e.currentTarget.getBoundingClientRect();
    const largura = 260;
    setMenu({ ...dados, x: Math.min(window.innerWidth - largura - 8, Math.max(8, r.left)), y: Math.max(8, Math.min(r.bottom + 4, window.innerHeight - Math.min(520, window.innerHeight * 0.8) - 8)) });
  };

  // ---------- exceções ----------
  const limparOnde = (filtro) =>
    setRascunho((r) => {
      const novo = {};
      Object.entries(r.dias || {}).forEach(([d, pessoas]) => {
        const resto = Object.fromEntries(Object.entries(pessoas || {}).filter(([id]) => !filtro(d, id)));
        if (Object.keys(resto).length) novo[d] = resto;
      });
      return { ...r, dias: novo };
    });
  const noPeriodo = (d) => d >= dias[0] && d <= ultimo;
  const excecoesDe = (id) => dias.filter((d) => rascunho.dias?.[d]?.[id]).length;
  const excecoesDoDia = (d) => Object.keys(rascunho.dias?.[d] || {}).length;
  const excecoesDoPeriodo = dias.reduce((n, d) => n + excecoesDoDia(d), 0);
  const totalExcecoes = Object.values(rascunho.dias || {}).reduce((n, p) => n + Object.keys(p || {}).length, 0);
  // valor: "" (modelo) | "folga" | "trabalha" | "cobre:<turno>" | "atestado" | "falta" | { tipo: "atraso", minutos, obs }
  const definir = (data, id, valor) =>
    setRascunho((r) => {
      const dia = { ...(r.dias?.[data] || {}) };
      if (!valor) delete dia[id];
      else if (typeof valor === "object") dia[id] = valor;
      else if (valor.startsWith("cobre:")) dia[id] = { tipo: "cobre", turnoId: valor.slice(6) };
      else dia[id] = { tipo: valor };
      return { ...r, dias: { ...(r.dias || {}), [data]: dia } };
    });
  // férias (período) e atestado de vários dias
  const lancarPeriodo = ({ c, tipo, inicio, fim, obs }) =>
    setRascunho((r) => {
      if (tipo === "ferias") {
        const nova = { id: `${c.id}_${inicio}_${Date.now().toString(36)}`, pessoaId: c.id, inicio, fim, obs };
        return { ...r, ferias: [...(r.ferias || []), nova].sort((a, b) => a.inicio.localeCompare(b.inicio)) };
      }
      const novo = { ...(r.dias || {}) };
      listarDatas(inicio, fim).forEach((d) => {
        novo[d] = { ...(novo[d] || {}), [c.id]: { tipo, ...(obs ? { obs } : {}) } };
      });
      return { ...r, dias: novo };
    });
  const tirarFerias = (id) => setRascunho((r) => ({ ...r, ferias: (r.ferias || []).filter((f) => f.id !== id) }));
  // quantas exceções mudaram em relação ao salvo
  const pendentes = useMemo(() => {
    if (!mudou) return 0;
    const chaves = new Set();
    [rascunho, excecoes].forEach((x) => Object.entries(x.dias || {}).forEach(([d, p]) => Object.keys(p || {}).forEach((id) => chaves.add(`${d}|${id}`))));
    const nFerias = JSON.stringify(rascunho.ferias || []) !== JSON.stringify(excecoes.ferias || []) ? 1 : 0;
    return (
      [...chaves].filter((k) => {
        const [d, id] = k.split("|");
        return JSON.stringify(rascunho.dias?.[d]?.[id] || null) !== JSON.stringify(excecoes.dias?.[d]?.[id] || null);
      }).length + nFerias
    );
  }, [mudou, rascunho, excecoes]);

  const salvar = async () => {
    setSalvando(true);
    try {
      setRascunho(await onSalvar(rascunho));
    } finally {
      setSalvando(false);
    }
  };
  const tirarDaEquipe = async (c) => {
    if (!onRemoverDaEquipe) return;
    if (!window.confirm(`Tirar ${c.nome} da equipe? A escala e as exceções dele(a) são excluídas. As marcações já feitas no aeroporto continuam no relatório.`)) return;
    const semEle = {
      ...rascunho,
      dias: Object.fromEntries(Object.entries(rascunho.dias || {}).map(([d, p]) => [d, Object.fromEntries(Object.entries(p || {}).filter(([id]) => id !== c.id))])),
      ferias: (rascunho.ferias || []).filter((f) => f.pessoaId !== c.id),
    };
    await onRemoverDaEquipe(c);
    setRascunho(await onSalvar(semEle));
  };

  // ---------- cobertura por turno e dia ----------
  const cobertura = useMemo(
    () =>
      dias.map((d) =>
        Object.fromEntries(
          escalaDoDia(config, rascunho, d).map((e) => {
            const apoio = !e.turno.colaboradores.some((c) => c.papel === "principal");
            return [e.turno.id, { n: e.pessoas.filter((p) => apoio || p.papel !== "sinergia").length, apoio, nomes: e.pessoas.map((p) => p.nome) }];
          }),
        ),
      ),
    [dias, config, rascunho],
  );

  // ---------- grupos (turnos com gente + folguistas) ----------
  const t = busca.trim().toLowerCase();
  const passa = (c) => passaNoFiltro(c, t, filtroFuncao);
  const funcoesNaEquipe = [...new Set(equipe.map((c) => c.funcaoNome).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const grupos = [
    ...config.turnos.map((tt) => ({ id: tt.id, turno: tt, pessoas: equipe.filter((c) => c.turnoId === tt.id) })),
    { id: FOLGUISTAS, turno: { id: FOLGUISTAS, nome: "Folguistas", cor: "#64748b", inicio: "", fim: "" }, pessoas: equipe.filter((c) => c.folguista) },
  ];
  const comGente = grupos.filter((g) => g.pessoas.length);
  const vazios = config.turnos.filter((tt) => !equipe.some((c) => c.turnoId === tt.id));
  const visiveis = comGente.filter((g) => !filtroTurno || g.id === filtroTurno).map((g) => ({ ...g, pessoas: g.pessoas.filter(passa) })).filter((g) => g.pessoas.length);

  // ---------- ocorrências do período (atestado, falta, atraso, férias) ----------
  const ocorr = useMemo(
    () => relatorioOcorrencias({ equipe: equipe.filter((c) => passaNoFiltro(c, t, filtroFuncao)), excecoes: rascunho, inicio: dias[0], fim: ultimo }),
    [equipe, rascunho, dias, ultimo, t, filtroFuncao],
  );
  const imprimirOcorrencias = () => imprimirHtml(comLetra(htmlOcorrencias({ rel: ocorr, inicio: dias[0], fim: ultimo })));
  const pngOcorrencias = () =>
    baixarPngHtml(comLetra(htmlOcorrencias({ rel: ocorr, inicio: dias[0], fim: ultimo })), `ocorrencias-${dias[0].slice(8, 10)}-${dias[0].slice(5, 7)}-a-${ultimo.slice(8, 10)}-${ultimo.slice(5, 7)}.png`).catch((e) => {
      console.error(e);
      window.alert("Não foi possível gerar a imagem.");
    });

  // ---------- indicadores ----------
  const kpis = useMemo(() => {
    const hojeNoPeriodo = hoje >= dias[0] && hoje <= ultimo;
    const dia = hojeNoPeriodo ? hoje : dias[0];
    const trabalham = equipe.filter((c) => situacao(c, dia, rascunho, turnoPorId).trabalha).length;
    const descobertos = cobertura.reduce(
      (n, cob) => n + config.turnos.filter((tt) => equipe.some((c) => c.turnoId === tt.id) && cob[tt.id] && !cob[tt.id].apoio && cob[tt.id].n === 0).length,
      0,
    );
    return { dia, hojeNoPeriodo, trabalham, folga: equipe.filter((c) => !c.folguista).length - equipe.filter((c) => !c.folguista && situacao(c, dia, rascunho, turnoPorId).trabalha).length, descobertos };
  }, [hoje, dias, ultimo, equipe, rascunho, turnoPorId, cobertura, config]);

  // a mesma página serve para imprimir/PDF e para baixar em PNG
  const htmlDaEscala = () => comLetra(htmlDaEscalaBase());
  const htmlDaEscalaBase = () => {
    const dados = { config, equipe: equipe.filter((c) => visiveis.some((g) => g.pessoas.includes(c))), dias, rascunho, turnoPorId };
    return ehFds
      ? htmlPlantao({
        ...dados,
        subtitulo: fdsOcultos.size
          ? `Fim de semana: ${finsDoMes
            .filter((f) => !fdsOcultos.has(f.sab))
            .map((f) => f.dias.map((d) => dataBr(d).slice(0, 5)).join(" e "))
            .join(" · ")}`
          : `Sábados e domingos de ${nomeMes(mesRef)}`,
      })
      : htmlEscala({ ...dados, ...(ehMes ? { titulo: "Escala do mês", subtitulo: nomeMes(mesRef).replace(/^./, (l) => l.toUpperCase()) } : {}) });
  };
  const imprimir = () => {
    registrarImpressao("escala_equipe", "Escala da equipe (impressão)", `${dataBr(dias[0])} a ${dataBr(ultimo)}`);
    imprimirHtml(htmlDaEscala());
  };
  const [gerandoPng, setGerandoPng] = useState(false);
  const baixarPng = async () => {
    setGerandoPng(true);
    try {
      registrarImpressao("escala_equipe", "Escala da equipe (PNG)", `${dataBr(dias[0])} a ${dataBr(ultimo)}`);
      const nome = ehMes
        ? `escala-${mesRef.slice(5, 7)}-${mesRef.slice(0, 4)}.png`
        : `${ehFds ? "escala-fim-de-semana" : "escala"}-${dias[0].slice(8, 10)}-${dias[0].slice(5, 7)}${dias.length > 1 ? `-a-${ultimo.slice(8, 10)}-${ultimo.slice(5, 7)}` : ""}.png`;
      await baixarPngHtml(htmlDaEscala(), nome);
    } catch (e) {
      console.error(e);
      window.alert("Não foi possível gerar a imagem. Tente de novo ou use Imprimir → Salvar como PDF.");
    } finally {
      setGerandoPng(false);
    }
  };

  // ---------- célula ----------
  const celula = (c, d) => {
    const s = situacao(c, d, rascunho, turnoPorId);
    const ativo = menu?.tipo === "dia" && menu.c.id === c.id && menu.data === d;
    return (
      <td key={d} className={`esc-cel ${d === hoje ? "is-hoje" : ""} ${diaDaSemana(d) === 0 || diaDaSemana(d) === 6 ? "is-fds" : ""}`}>
        <button
          type="button"
          className={`esc-cel__btn ${s.trabalha ? "is-trab" : "is-folga"} ${s.exc ? `is-exc is-${s.exc}` : ""} ${s.ausencia ? "is-ausencia" : ""} ${ativo ? "is-ativo" : ""}`}
          style={s.ausencia ? { "--c": COR_OCORRENCIA[s.exc] } : s.trabalha ? { "--c": s.turno?.cor || c.cor } : undefined}
          onClick={(e) => abrirMenu(e, { tipo: "dia", c, data: d })}
          title={`${c.nome} · ${DIAS_SEMANA_LONGO[diaDaSemana(d)]} ${dataBr(d)} · ${s.rotulo}${s.detalhe ? ` (${s.detalhe})` : ""}${s.exc === "atraso" ? ` · atraso de ${s.minutos} min` : ""}`}
        >
          {s.exc && !s.ausencia && s.exc !== "atraso" && <i className="esc-cel__marca" aria-hidden="true" />}
          {s.exc === "atraso" && <i className="esc-cel__marca is-atraso" aria-hidden="true" />}
          {ehMes ? (
            <b className="tabular">{codigoDoDia(s)}</b>
          ) : s.ausencia ? (
            <b>{s.rotulo}</b>
          ) : s.trabalha && (!s.exc || s.exc === "atraso") ? (
            // dentro do grupo do turno, o nome dele já está no cabeçalho: mostra o horário
            <b className="tabular">{nSemanas !== 2 ? s.detalhe || s.rotulo : (s.detalhe || "").slice(0, 5) || s.rotulo}</b>
          ) : (
            <b>{s.exc === "cobre" ? `↪ ${s.rotulo}` : s.exc === "extra" ? "+ Extra" : s.rotulo}</b>
          )}
          {!ehMes && nSemanas !== 2 && (
            <>
              {s.ausencia && s.detalhe && <small>{s.detalhe}</small>}
              {s.exc === "atraso" && <small className="esc-cel__atraso">atraso {s.minutos} min</small>}
              {s.exc && !s.ausencia && s.exc !== "atraso" && <small>{s.exc === "extra" ? `dia extra · ${s.rotulo}` : s.exc === "cobre" ? "cobrindo" : "lançada"}</small>}
              {!s.exc && !s.trabalha && s.detalhe && <small>{s.detalhe}</small>}
              {!s.exc && s.rev && <small className="esc-cel__rev">revezamento</small>}
            </>
          )}
        </button>
      </td>
    );
  };

  const menuDia = () => {
    const { c, data } = menu;
    const x = rascunho.dias?.[data]?.[c.id] || null;
    const base = !c.folguista && trabalhaPeloModelo(c, data);
    const atual = x ? (x.tipo === "cobre" ? `cobre:${x.turnoId}` : x.tipo) : "";
    const ferias = !x ? excecaoDoDia(rascunho, data, c.id) : null; // férias pelo período
    const trabalhaNoDia = x ? ["trabalha", "cobre", "atraso", "atestado", "falta"].includes(x.tipo) : !c.folguista && base;
    const fechar = (valor) => {
      definir(data, c.id, valor);
      setMenu(null);
    };
    const opcoes = [
      { v: "", icone: "refresh", nome: "Como no modelo", desc: c.folguista ? "folga (folguista)" : base ? `trabalha · ${c.turnoNome}` : "folga" },
      ...(!c.folguista && base ? [{ v: "folga", icone: "x", nome: "Folga neste dia", desc: "troca, atestado, banco de horas…" }] : []),
      ...(!c.folguista && !base ? [{ v: "trabalha", icone: "plus", nome: "Dia extra", desc: `trabalha no turno ${c.turnoNome}` }] : []),
      ...config.turnos.filter((tt) => tt.id !== c.turnoId).map((tt) => ({ v: `cobre:${tt.id}`, icone: "refresh", nome: `Cobrir o turno ${tt.nome}`, desc: `${tt.inicio}–${tt.fim}`, cor: tt.cor })),
    ];
    return (
      <>
        <div className="esc-menu__cab">
          <b>{c.nome}</b>
          <small>
            {DIAS_SEMANA_LONGO[diaDaSemana(data)]}, {dataBr(data)}
          </small>
        </div>
        {opcoes.map((o) => (
          <button
            key={o.v || "modelo"}
            type="button"
            className={`esc-menu__op ${atual === o.v ? "is-on" : ""}`}
            onClick={() => {
              definir(data, c.id, o.v);
              setMenu(null);
            }}
          >
            {o.cor ? <i className="esc-menu__cor" style={{ background: o.cor }} /> : <Icon name={o.icone} size={14} />}
            <span>
              <b>{o.nome}</b>
              <small>{o.desc}</small>
            </span>
            {atual === o.v && <Icon name="check" size={14} />}
          </button>
        ))}
        {ferias?.periodo && (
          <button type="button" className="esc-menu__op is-on" onClick={() => (setMenu(null), setPeriodoDe(c))}>
            <i className="esc-menu__cor" style={{ background: FERIAS.cor }} />
            <span>
              <b>De férias</b>
              <small>
                {dataBr(ferias.inicio).slice(0, 5)} a {dataBr(ferias.fim).slice(0, 5)} · alterar
              </small>
            </span>
          </button>
        )}
        {trabalhaNoDia && (
          <div className="esc-menu__oc">
            <span className="esc-menu__tit">Ocorrência do dia</span>
            <div className="esc-menu__oc-btns">
              {OCORRENCIAS.filter((o) => o.ausente).map((o) => (
                <button key={o.id} type="button" className={atual === o.id ? "is-on" : ""} style={{ "--c": o.cor }} onClick={() => fechar(atual === o.id ? "" : o.id)}>
                  {atual === o.id && <Icon name="check" size={12} />} {o.nome}
                </button>
              ))}
            </div>
            <form
              className="esc-menu__atraso"
              onSubmit={(e) => {
                e.preventDefault();
                const min = Math.max(1, Math.min(600, Number(e.currentTarget.elements.min.value) || 0));
                const obs = String(e.currentTarget.elements.obs.value || "").trim().slice(0, 120);
                fechar({ tipo: "atraso", minutos: min, ...(obs ? { obs } : {}) });
              }}
            >
              <label>
                <span>Atraso</span>
                <input name="min" type="number" min="1" max="600" defaultValue={x?.tipo === "atraso" ? x.minutos : 15} aria-label="Minutos de atraso" />
                <small>min</small>
              </label>
              <input name="obs" type="text" placeholder="Observação (opcional)" defaultValue={x?.obs || ""} maxLength={120} />
              <button type="submit">{x?.tipo === "atraso" ? "Atualizar" : "Lançar"}</button>
            </form>
            {(x?.tipo === "atestado" || x?.tipo === "falta" || x?.tipo === "atraso") && (
              <button type="button" className="esc-menu__oc-tirar" onClick={() => fechar(base || c.folguista ? "" : "trabalha")}>
                Tirar a ocorrência
              </button>
            )}
          </div>
        )}
      </>
    );
  };

  const menuPessoa = () => {
    const { c } = menu;
    const n = excecoesDe(c.id);
    return (
      <>
        <div className="esc-menu__cab">
          <b>{c.nome}</b>
          <small>
            {c.turnoNome}
            {c.funcaoNome ? ` · ${c.funcaoNome}` : ""} · {nomeModelo(c)}
          </small>
        </div>
        <button type="button" className="esc-menu__op" onClick={() => (setMenu(null), setPeriodoDe(c))}>
          <i className="esc-menu__cor" style={{ background: FERIAS.cor }} />
          <span>
            <b>Férias ou atestado por período</b>
            <small>{(rascunho.ferias || []).filter((f) => f.pessoaId === c.id).length ? "ver e lançar períodos" : "marca vários dias de uma vez"}</small>
          </span>
        </button>
        <button type="button" className="esc-menu__op" onClick={() => (setMenu(null), setPessoaMes(c), setNSemanas("mes"))}>
          <Icon name="calendar" size={14} />
          <span>
            <b>Ver o mês de {c.nome.split(" ")[0]}</b>
            <small>calendário com folgas e ocorrências</small>
          </span>
        </button>
        <button type="button" className="esc-menu__op" disabled={!n} onClick={() => (limparOnde((d, id) => noPeriodo(d) && id === c.id), setMenu(null))}>
          <Icon name="refresh" size={14} />
          <span>
            <b>Voltar ao modelo no período</b>
            <small>{n ? `${n} exceção(ões) lançada(s)` : "nenhuma exceção no período"}</small>
          </span>
        </button>
        {onConfigurar && (
          <button type="button" className="esc-menu__op" onClick={() => (setMenu(null), onConfigurar())}>
            <Icon name="settings" size={14} />
            <span>
              <b>Mudar turno, função ou folga fixa</b>
              <small>abre o Configurar escala</small>
            </span>
          </button>
        )}
        {onRemoverDaEquipe && (
          <button type="button" className="esc-menu__op is-perigo" onClick={() => (setMenu(null), tirarDaEquipe(c))}>
            <Icon name="trash" size={14} />
            <span>
              <b>Tirar da equipe</b>
              <small>exclui a escala dele(a)</small>
            </span>
          </button>
        )}
      </>
    );
  };

  const menuColuna = () => {
    const { data } = menu;
    const n = excecoesDoDia(data);
    const cob = cobertura[dias.indexOf(data)] || {};
    return (
      <>
        <div className="esc-menu__cab">
          <b>
            {DIAS_SEMANA_LONGO[diaDaSemana(data)]}, {dataBr(data)}
          </b>
          <small>
            {feriadoDoDia(config, data) ? `Feriado · ${feriadoDoDia(config, data).nome} · ` : ""}
            {n ? `${n} exceção(ões) lançada(s)` : "como no modelo"}
          </small>
        </div>
        <ul className="esc-menu__lista">
          {comGente
            .filter((g) => g.id !== FOLGUISTAS)
            .map((g) => (
              <li key={g.id}>
                <i style={{ background: g.turno.cor }} />
                <b>{g.turno.nome}</b>
                <span>{cob[g.id]?.nomes?.join(", ") || <em>ninguém</em>}</span>
              </li>
            ))}
        </ul>
        <button type="button" className="esc-menu__op is-perigo" disabled={!n} onClick={() => (limparOnde((d) => d === data), setMenu(null))}>
          <Icon name="trash" size={14} />
          <span>
            <b>Excluir as exceções do dia</b>
            <small>todos voltam ao modelo</small>
          </span>
        </button>
      </>
    );
  };

  if (equipe.length === 0) {
    return (
      <Card>
        <div className="rtn-esc__vazio">
          <Icon name="calendar" size={28} />
          <b>A escala desta base ainda não foi montada</b>
          <span>Em poucos passos: o modelo (6x1, 12x36…), os turnos e quem trabalha em cada um.</span>
          {onConfigurar && (
            <Button variant="primary" icon="arrowRight" onClick={onConfigurar}>
              Montar a escala
            </Button>
          )}
        </div>
      </Card>
    );
  }

  const periodo = ehFds ? `Fins de semana · ${nomeMes(mesRef)}` : ehMes ? nomeMes(mesRef).replace(/^./, (l) => l.toUpperCase()) : `${dataBr(dias[0]).slice(0, 5)} a ${dataBr(ultimo).slice(0, 5)}`;
  const doHoje = kpis.hojeNoPeriodo ? "hoje" : `em ${dataBr(kpis.dia).slice(0, 5)}`;

  return (
    <div className="esc">
      <KpiTiles
        items={[
          { key: "eq", label: "Na equipe", value: equipe.length, hint: `${comGente.filter((g) => g.id !== FOLGUISTAS).length} turno(s) com gente`, icon: "users" },
          { key: "tr", label: `Trabalham ${doHoje}`, value: kpis.trabalham, hint: `${Math.max(0, kpis.folga)} de folga`, icon: "circleCheck" },
          {
            key: "ex",
            label: "Exceções no período",
            value: excecoesDoPeriodo,
            hint: ocorr.linhas.length ? `${ocorr.total.falta} falta(s) · ${ocorr.total.atestado} atestado(s) · ${ocorr.total.atraso} atraso(s)` : "folgas, extras e coberturas",
            icon: "calendar",
          },
          {
            key: "de",
            label: "Turnos descobertos",
            value: kpis.descobertos,
            hint: kpis.descobertos ? "dias sem ninguém num turno" : "todos os turnos cobertos",
            icon: "alert",
            tone: kpis.descobertos ? "alert" : undefined,
          },
        ]}
        highlightFirst={false}
      />

      <Card className="esc-card">
        <div className="esc-barra">
          <div className="esc-barra__nav">
            <Button variant="ghost" iconOnly size="sm" icon="chevronLeft" onClick={() => mudarPeriodo(-1)} aria-label="Anterior" />
            <b className="esc-barra__periodo">{periodo}</b>
            <Button variant="ghost" iconOnly size="sm" icon="chevronRight" onClick={() => mudarPeriodo(1)} aria-label="Próxima" />
            <Button variant="ghost" size="sm" onClick={() => setSemana(segundaDa(hoje))} disabled={semana === segundaDa(hoje)}>
              Hoje
            </Button>
            <Segmented
              size="sm"
              ariaLabel="Período"
              value={nSemanas}
              onChange={setNSemanas}
              options={[
                { value: 1, label: "Semana" },
                { value: 2, label: "2 semanas" },
                { value: "fds", label: "Fins de semana" },
                { value: "mes", label: "Mês" },
              ]}
            />
          </div>
          <div className="esc-barra__filtros">
            <label className="esc-busca">
              <Icon name="search" size={14} />
              <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pessoa ou função" />
            </label>
            {funcoesNaEquipe.length > 0 && (
              <select className="ui-input esc-filtro" value={filtroFuncao} onChange={(e) => setFiltroFuncao(e.target.value)} aria-label="Função">
                <option value="">Todas as funções</option>
                {funcoesNaEquipe.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
                {equipe.some((c) => !c.funcaoNome) && <option value="__sem__">Sem função</option>}
              </select>
            )}
            <select className="ui-input esc-filtro" value={filtroTurno} onChange={(e) => setFiltroTurno(e.target.value)} aria-label="Turno">
              <option value="">Todos os turnos</option>
              {comGente.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.turno.nome}
                </option>
              ))}
            </select>
            <label className="esc-letra" title="Tamanho da letra na imagem (PNG) e no PDF">
              <span>Letra</span>
              <button type="button" onClick={() => setLetra(TAMANHOS_LETRA[Math.max(0, TAMANHOS_LETRA.indexOf(letra) - 1)])} disabled={letra === TAMANHOS_LETRA[0]} aria-label="Diminuir a letra">
                A−
              </button>
              <select value={letra} onChange={(e) => setLetra(Number(e.target.value))} aria-label="Tamanho da letra na imagem e no PDF">
                {TAMANHOS_LETRA.map((n) => (
                  <option key={n} value={n}>
                    {n}%
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => setLetra(TAMANHOS_LETRA[Math.min(TAMANHOS_LETRA.length - 1, TAMANHOS_LETRA.indexOf(letra) + 1)])} disabled={letra === TAMANHOS_LETRA[TAMANHOS_LETRA.length - 1]} aria-label="Aumentar a letra">
                A+
              </button>
            </label>
            <Button size="sm" icon="image" onClick={baixarPng} loading={gerandoPng} disabled={gerandoPng} title="Baixar a escala como imagem para mandar nos grupos">
              Baixar PNG
            </Button>
            <Button size="sm" icon="printer" onClick={imprimir}>
              {ehFds ? "Imprimir fins de semana" : "Imprimir / PDF"}
            </Button>
          </div>
        </div>

        {ehFds && finsDoMes.length > 0 && (
          <div className="esc-fds-escolha" role="group" aria-label="Fins de semana">
            <span>Mostrar e imprimir:</span>
            {finsDoMes.map((f) => {
              const on = !fdsOcultos.has(f.sab);
              return (
                <button
                  key={f.sab}
                  type="button"
                  className={on ? "is-on" : ""}
                  aria-pressed={on}
                  onClick={() =>
                    setFdsOcultos((o) => {
                      const n = new Set(o);
                      if (n.has(f.sab)) n.delete(f.sab);
                      else n.add(f.sab);
                      return n.size >= finsDoMes.length ? o : n; // pelo menos um
                    })
                  }
                >
                  {on && <Icon name="check" size={12} />}
                  {f.dias.map((d) => d.slice(8)).join(" e ")}/{f.sab.slice(5, 7)}
                </button>
              );
            })}
            {fdsOcultos.size > 0 && (
              <button type="button" className="esc-fds-escolha__todos" onClick={() => setFdsOcultos(new Set())}>
                Todos
              </button>
            )}
          </div>
        )}

        <div className="esc-tabela-wrap">
          <table className={`esc-tabela ${nSemanas === 2 ? "is-compacta" : ""} ${ehMes ? "is-mes" : ""}`}>
            <thead>
              <tr>
                <th className="esc-tabela__pessoa">Pessoa</th>
                {dias.map((d) => (
                  <th key={d} className={`${d === hoje ? "is-hoje" : ""} ${diaDaSemana(d) === 0 || diaDaSemana(d) === 6 ? "is-fds" : ""}`}>
                    <button type="button" className="esc-dia" onClick={(e) => abrirMenu(e, { tipo: "coluna", data: d })} title="Quem trabalha neste dia">
                      <span>{ehMes ? DIAS_SEMANA_CURTO[diaDaSemana(d)].slice(0, 1) : DIAS_SEMANA_CURTO[diaDaSemana(d)]}</span>
                      <b>{d.slice(8)}</b>
                      {excecoesDoDia(d) > 0 && <i className="esc-dia__exc" aria-label={`${excecoesDoDia(d)} exceção(ões)`} />}
                      {feriadoDoDia(config, d) && (
                        <em className="esc-dia__fer" title={feriadoDoDia(config, d).nome}>
                          {ehMes ? "fer." : feriadoDoDia(config, d).nome}
                        </em>
                      )}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visiveis.map((g) => (
                <Fragment key={g.id}>
                  <tr className="esc-grupo" style={{ "--c": g.turno.cor }}>
                    <td className="esc-tabela__pessoa">
                      <span className="esc-grupo__nome">
                        <i />
                        <b>{g.turno.nome}</b>
                        {g.turno.inicio && !ehMes && (
                          <small>
                            {g.turno.inicio}–{g.turno.fim}
                          </small>
                        )}
                        <small>· {g.pessoas.length}</small>
                      </span>
                    </td>
                    {dias.map((d, i) => {
                      if (g.id === FOLGUISTAS) {
                        const cobrindo = g.pessoas.filter((c) => rascunho.dias?.[d]?.[c.id]?.tipo === "cobre").length;
                        return (
                          <td key={d} className="esc-grupo__cob">
                            {cobrindo ? <span>{cobrindo} cobrindo</span> : ""}
                          </td>
                        );
                      }
                      const cob = cobertura[i][g.id] || { n: 0 };
                      const vazio = cob.n === 0 && !cob.apoio;
                      return (
                        <td key={d} className={`esc-grupo__cob ${vazio ? "is-vazio" : ""}`} title={vazio ? "Ninguém neste turno" : cob.nomes?.join(", ")}>
                          <span>
                            {vazio ? <Icon name="alert" size={11} /> : <Icon name="users" size={11} />} {cob.n}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                  {g.pessoas.map((c) => (
                    <tr key={c.id} className="esc-pessoa">
                      <td className="esc-tabela__pessoa">
                        <button type="button" className="esc-pessoa__btn" onClick={(e) => abrirMenu(e, { tipo: "pessoa", c })} title="Opções">
                          <span className="esc-avatar" style={{ "--c": c.cor }}>
                            {iniciais(c.nome)}
                          </span>
                          <span className="esc-pessoa__info">
                            <b>{c.nome}</b>
                            <small>
                              {[c.funcaoNome, nomeModelo(c), c.inicio && c.fim ? `${c.inicio}–${c.fim}` : ""].filter(Boolean).join(" · ")}
                            </small>
                          </span>
                          {excecoesDe(c.id) > 0 && <i className="esc-pessoa__exc" title={`${excecoesDe(c.id)} exceção(ões) no período`} />}
                        </button>
                      </td>
                      {dias.map((d) => celula(c, d))}
                    </tr>
                  ))}
                </Fragment>
              ))}
              {visiveis.length === 0 && (
                <tr>
                  <td colSpan={dias.length + 1} className="esc-nada">
                    Ninguém com esse filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="esc-rodape">
          <span className="esc-legenda">
            <span>
              <i className="is-trab" /> trabalha
            </span>
            <span>
              <i className="is-folga" /> folga
            </span>
            <span>
              <i className="is-exc" /> exceção lançada
            </span>
            {ehMes && <span className="esc-legenda__mes">{LEGENDA_MES}</span>}
            {vazios.length > 0 && (
              <span className="esc-legenda__vazios">
                Turnos sem ninguém: {vazios.map((v) => v.nome).join(", ")}
                {onConfigurar && (
                  <button type="button" onClick={onConfigurar}>
                    ajustar
                  </button>
                )}
              </span>
            )}
          </span>
          <span className="esc-rodape__acoes">
            <Button
              variant="ghost"
              size="sm"
              icon="trash"
              disabled={!excecoesDoPeriodo}
              onClick={() => window.confirm(`Excluir as ${excecoesDoPeriodo} exceções de ${periodo}? A escala volta a ser a do modelo de cada um.`) && limparOnde((d) => noPeriodo(d))}
            >
              Excluir exceções do período
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!totalExcecoes}
              onClick={() =>
                window.confirm(
                  `Excluir toda a escala lançada (${totalExcecoes} exceções, em todas as semanas)? Folgas, dias extras e coberturas voltam ao modelo de cada um. Atestados, faltas, atrasos e férias continuam.`,
                ) &&
                setRascunho((r) => ({
                  ...r,
                  dias: Object.fromEntries(
                    Object.entries(r.dias || {})
                      .map(([d, p]) => [d, Object.fromEntries(Object.entries(p || {}).filter(([, x]) => OCORRENCIAS.some((o) => o.id === x?.tipo)))])
                      .filter(([, p]) => Object.keys(p).length),
                  ),
                }))
              }
            >
              Excluir toda a escala lançada
            </Button>
          </span>
        </div>

        {mudou && (
          <div className="esc-salvar" role="status">
            <span>
              <Icon name="info" size={15} /> {pendentes} alteração(ões) não salva(s)
            </span>
            <span>
              <Button variant="ghost" size="sm" onClick={() => setRascunho(excecoes)} disabled={salvando}>
                Desfazer
              </Button>
              <Button variant="primary" size="sm" icon="save" onClick={salvar} loading={salvando} disabled={salvando}>
                Salvar escala
              </Button>
            </span>
          </div>
        )}
      </Card>

      {ehMes && pessoaMes && equipe.some((x) => x.id === pessoaMes.id) && (
        <CalendarioPessoa
          c={equipe.find((x) => x.id === pessoaMes.id)}
          equipe={equipe}
          dias={dias}
          rascunho={rascunho}
          turnoPorId={turnoPorId}
          onTrocar={(x) => x && setPessoaMes(x)}
          onFechar={() => setPessoaMes(null)}
          onDia={(e, d) => abrirMenu(e, { tipo: "dia", c: equipe.find((x) => x.id === pessoaMes.id), data: d })}
        />
      )}

      <Card className="esc-oc">
        <div className="esc-oc__topo">
          <span>
            <b>Ocorrências do período</b>
            <small>
              {periodo} · faltas, atestados, atrasos e férias{filtroFuncao || t ? " (com o filtro)" : ""}
            </small>
          </span>
          <span className="esc-oc__acoes">
            <Button size="sm" icon="image" onClick={pngOcorrencias} disabled={!ocorr.linhas.length}>
              PNG
            </Button>
            <Button size="sm" icon="printer" onClick={imprimirOcorrencias} disabled={!ocorr.linhas.length}>
              Imprimir / PDF
            </Button>
          </span>
        </div>
        {ocorr.linhas.length === 0 ? (
          <p className="esc-oc__vazio">Nenhuma ocorrência no período. Lance atestado, falta ou atraso clicando no dia da pessoa; férias, no nome dela.</p>
        ) : (
          <div className="esc-oc__tabela">
            <table>
              <thead>
                <tr>
                  <th>Pessoa</th>
                  <th>Faltas</th>
                  <th>Atestados</th>
                  <th>Atrasos</th>
                  <th>Férias</th>
                  <th>Dias</th>
                </tr>
              </thead>
              <tbody>
                {ocorr.linhas.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <b>{l.nome}</b>
                      {l.funcaoNome && <small> · {l.funcaoNome}</small>}
                    </td>
                    <td className={`n ${l.falta ? "is-falta" : ""}`}>{l.falta || "—"}</td>
                    <td className={`n ${l.atestado ? "is-atestado" : ""}`}>{l.atestado || "—"}</td>
                    <td className={`n ${l.atraso ? "is-atraso" : ""}`}>{l.atraso ? `${l.atraso} · ${l.minutosAtraso} min` : "—"}</td>
                    <td className={`n ${l.ferias ? "is-ferias" : ""}`}>{l.ferias ? `${l.ferias} dia(s)` : "—"}</td>
                    <td className="d">{textoOcorrencias(l) || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {periodoDe && (
        <PeriodoForm
          c={periodoDe}
          ferias={(rascunho.ferias || []).filter((f) => f.pessoaId === periodoDe.id)}
          inicioPadrao={hoje >= dias[0] && hoje <= ultimo ? hoje : dias[0]}
          onLancar={lancarPeriodo}
          onTirar={tirarFerias}
          onFechar={() => setPeriodoDe(null)}
        />
      )}

      {menu && (
        <div className="esc-menu" role="menu" style={{ left: menu.x, top: menu.y }}>
          {menu.tipo === "dia" ? menuDia() : menu.tipo === "pessoa" ? menuPessoa() : menuColuna()}
        </div>
      )}
    </div>
  );
};

export default EscalaEquipe;
