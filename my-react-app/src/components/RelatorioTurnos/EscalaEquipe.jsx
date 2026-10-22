import { Fragment, useEffect, useMemo, useState } from "react";
import { Button, Card, Icon, KpiTiles, Segmented } from "../ui";
import {
  DIAS_SEMANA_CURTO,
  DIAS_SEMANA_LONGO,
  MODELOS_ESCALA,
  dataBr,
  diaDaSemana,
  ehDomingoDoMes,
  escalaDoDia,
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
import { CSS_IMPRESSAO, esc, imprimirHtml } from "./impressaoTurnos";
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

// situação de uma pessoa num dia (modelo + exceção)
const situacao = (c, data, rascunho, turnoPorId) => {
  const x = rascunho.dias?.[data]?.[c.id] || null;
  const base = !c.folguista && trabalhaPeloModelo(c, data);
  const proprio = turnoPorId.get(c.turnoId);
  // horário do dia: o da pessoa no turno dela (com fim de semana e feriado) ou o do turno coberto
  const janela = (t) => {
    if (!t) return "";
    const j = t.id === c.turnoId ? janelaDo(c, t, data) : { inicio: t.inicio, fim: t.fim };
    return `${j.inicio}–${j.fim}`;
  };
  if (x?.tipo === "folga") return { trabalha: false, exc: "folga", rotulo: "Folga", detalhe: "lançada" };
  if (x?.tipo === "trabalha") return { trabalha: true, exc: "extra", turno: proprio, rotulo: proprio?.nome || "Extra", detalhe: "dia extra" };
  if (x?.tipo === "cobre") {
    const t = turnoPorId.get(x.turnoId);
    return { trabalha: true, exc: "cobre", turno: t, rotulo: t?.nome || "Cobre", detalhe: `cobrindo · ${janela(t)}` };
  }
  const fer = c.feriadosDela?.[data];
  if (base) return { trabalha: true, turno: proprio, rotulo: proprio?.nome || "Trabalha", detalhe: janela(proprio), rev: !fer && !!c.fds && [0, 6].includes(diaDaSemana(data)), feriado: !!fer };
  if (fer) return { trabalha: false, rotulo: "Folga", detalhe: "feriado", feriado: true };
  if (c.domingoFolga && ehDomingoDoMes(data, c.domingoFolga)) return { trabalha: false, rotulo: "Folga", detalhe: "domingo do mês", domingo: true };
  if (c.fds && [0, 6].includes(diaDaSemana(data))) return { trabalha: false, rotulo: "Folga", detalhe: "revezamento" };
  return { trabalha: false, rotulo: "Folga" };
};

// ---------- impressão (mural) ----------
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const nomeMes = (iso) => `${MESES[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}`;
// sábados e domingos do mês de uma data
const fimDeSemanaDoMes = (iso) => {
  const ini = `${iso.slice(0, 8)}01`;
  const out = [];
  for (let d = ini; d.slice(0, 7) === iso.slice(0, 7); d = somarDias(d, 1)) if ([0, 6].includes(diaDaSemana(d))) out.push(d);
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

const htmlEscala = ({ config, equipe, dias, rascunho, turnoPorId, titulo = "Escala da equipe", subtitulo, comHorario = false }) => {
  const agora = new Date();
  const cab = dias
    .map((d) => {
      const fer = feriadoDoDia(config, d);
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
        `<tr class="g"><td colspan="${dias.length + 1}" style="--c:${g.t.cor}"><span class="dot" style="--c:${g.t.cor}"></span>${esc(g.t.nome)}${g.t.inicio ? ` · ${esc(g.t.inicio)}–${esc(g.t.fim)}` : ""}</td></tr>` +
        g.pessoas
          .map(
            (c) =>
              `<tr><td class="e"><b>${esc(c.nome)}</b>${c.funcaoNome ? `<br><small>${esc(c.funcaoNome)}</small>` : ""}</td>${dias
                .map((d) => {
                  const s = situacao(c, d, rascunho, turnoPorId);
                  return s.trabalha
                    ? `<td class="t" style="--c:${s.turno?.cor || "#1f2328"}">${esc(s.exc === "cobre" ? `Cobre ${s.rotulo}` : s.exc === "extra" ? "Extra" : s.rotulo)}${
                        comHorario && s.detalhe && !s.exc ? `<br><small>${esc(s.detalhe)}</small>` : ""
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
.esc td, .esc th { text-align: center; border: 1px solid #d0d7de; padding: 4px 3px; }
.esc th small { font-weight: 400; color: #57606a; }
.esc td.e { text-align: left; min-width: 120px; }
.esc td.e small { color: #57606a; font-size: 8.5px; }
.esc td.t { background: color-mix(in srgb, var(--c) 18%, #fff); font-weight: 700; font-size: 9.5px; }
.esc td.f { color: #8c959f; font-size: 9px; background: repeating-linear-gradient(135deg, #fff 0 4px, #f3f4f6 4px 8px); }
.esc tr.g td { text-align: left; font-weight: 800; background: #f6f8fa; border-left: 4px solid var(--c); }
</style></head><body>
<header class="topo"><div><h1>${esc(titulo)}</h1><p>${esc(subtitulo || `${dataBr(dias[0])} a ${dataBr(dias[dias.length - 1])}`)}</p></div>
<div class="gerado">Luck Receptivo ${esc(regiaoAtual().nome)}<br>Gerado em ${esc(agora.toLocaleDateString("pt-BR"))}</div></header>
<table class="esc" style="margin-top:10px"><thead><tr><th class="e">Pessoa</th>${cab}</tr></thead><tbody>${linhas}</tbody></table>
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
  return { horario: horario || "Trabalha", nota: s.exc === "extra" ? "dia extra" : "" };
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
        `<tr class="g"><td colspan="${dias.length + 1}" style="--c:${b.cor}"><span class="dot" style="--c:${b.cor}"></span>${esc(b.nome)}</td></tr>` +
        b.pessoas
          .map(
            (c) =>
              `<tr><td class="e"><b>${esc(c.nome)}</b>${b.lider && setorDe(c) ? `<br><small>${esc(setorDe(c))}</small>` : ""}</td>${dias
                .map((d) => {
                  const h = horarioDoDia(c, d, rascunho, turnoPorId);
                  return h
                    ? `<td class="t" style="--c:${b.cor}">${esc(h.horario)}${h.nota ? `<br><small>${esc(h.nota)}</small>` : ""}</td>`
                    : `<td class="f">Folga</td>`;
                })
                .join("")}</tr>`,
          )
          .join(""),
    )
    .join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Escala de fim de semana ${esc(dataBr(dias[0]))} a ${esc(dataBr(dias[dias.length - 1]))}</title><style>${CSS_IMPRESSAO}
@page { size: A4 landscape; margin: 10mm; }
.esc td, .esc th { text-align: center; border: 1px solid #d0d7de; padding: 5px 3px; }
.esc th small { font-weight: 400; color: #57606a; }
.esc td.e { text-align: left; min-width: 120px; }
.esc td.e small { color: #57606a; font-size: 8.5px; }
.esc td.t { background: color-mix(in srgb, var(--c) 10%, #fff); font-weight: 700; font-size: 10px; font-variant-numeric: tabular-nums; }
.esc td.t small { font-weight: 400; color: #57606a; font-size: 8.5px; }
.esc td.f { color: #8c959f; font-size: 9px; background: repeating-linear-gradient(135deg, #fff 0 4px, #f3f4f6 4px 8px); }
.esc tr.g td { text-align: left; font-weight: 800; background: #f6f8fa; border-left: 4px solid var(--c); }
</style></head><body>
<header class="topo"><div><h1>Escala de fim de semana</h1><p>${esc(subtitulo || `${dataBr(dias[0])} a ${dataBr(dias[dias.length - 1])}`)}</p></div>
<div class="gerado">Luck Receptivo ${esc(regiaoAtual().nome)}<br>Gerado em ${esc(agora.toLocaleDateString("pt-BR"))}</div></header>
<table class="esc" style="margin-top:10px"><thead><tr><th class="e">Colaborador</th>${cab}</tr></thead><tbody>${linhas}</tbody></table>
</body></html>`;
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

  // nSemanas: 1, 2 ou "fds" (sábados e domingos do mês)
  const ehFds = nSemanas === "fds";
  const mesRef = somarDias(semana, 3);
  const diasDoPeriodo = useMemo(
    () => (nSemanas === "fds" ? fimDeSemanaDoMes(somarDias(semana, 3)) : Array.from({ length: 7 * nSemanas }, (_, i) => somarDias(semana, i))),
    [semana, nSemanas],
  );
  // Fins de semana: escolher quais mostrar/imprimir (chave = sábado do fim de semana)
  const [fdsOcultos, setFdsOcultos] = useState(() => new Set());
  const finsDoMes = ehFdsLista(diasDoPeriodo, nSemanas, sabadoDe);
  const dias = useMemo(
    () => (nSemanas === "fds" ? diasDoPeriodo.filter((d) => !fdsOcultos.has(sabadoDe(d))) : diasDoPeriodo),
    [diasDoPeriodo, nSemanas, fdsOcultos],
  );
  const mudarPeriodo = (sentido) => {
    setFdsOcultos(new Set());
    setSemana((s0) => {
      if (!ehFds) return somarDias(s0, sentido * 7 * nSemanas);
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
    const fechar = (e) => {
      if (e.type === "keydown" && e.key !== "Escape") return;
      if (e.type === "mousedown" && e.target.closest?.(".esc-menu")) return;
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
    setMenu({ ...dados, x: Math.min(window.innerWidth - largura - 8, Math.max(8, r.left)), y: Math.max(8, Math.min(r.bottom + 4, window.innerHeight - 360)) });
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
  const definir = (data, id, valor) =>
    setRascunho((r) => {
      const dia = { ...(r.dias?.[data] || {}) };
      if (!valor) delete dia[id];
      else if (valor.startsWith("cobre:")) dia[id] = { tipo: "cobre", turnoId: valor.slice(6) };
      else dia[id] = { tipo: valor };
      return { ...r, dias: { ...(r.dias || {}), [data]: dia } };
    });
  // quantas exceções mudaram em relação ao salvo
  const pendentes = useMemo(() => {
    if (!mudou) return 0;
    const chaves = new Set();
    [rascunho, excecoes].forEach((x) => Object.entries(x.dias || {}).forEach(([d, p]) => Object.keys(p || {}).forEach((id) => chaves.add(`${d}|${id}`))));
    return [...chaves].filter((k) => {
      const [d, id] = k.split("|");
      return JSON.stringify(rascunho.dias?.[d]?.[id] || null) !== JSON.stringify(excecoes.dias?.[d]?.[id] || null);
    }).length;
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
    const semEle = { ...rascunho, dias: Object.fromEntries(Object.entries(rascunho.dias || {}).map(([d, p]) => [d, Object.fromEntries(Object.entries(p || {}).filter(([id]) => id !== c.id))])) };
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
  const passa = (c) => !t || `${c.nome} ${c.funcaoNome || ""}`.toLowerCase().includes(t);
  const grupos = [
    ...config.turnos.map((tt) => ({ id: tt.id, turno: tt, pessoas: equipe.filter((c) => c.turnoId === tt.id) })),
    { id: FOLGUISTAS, turno: { id: FOLGUISTAS, nome: "Folguistas", cor: "#64748b", inicio: "", fim: "" }, pessoas: equipe.filter((c) => c.folguista) },
  ];
  const comGente = grupos.filter((g) => g.pessoas.length);
  const vazios = config.turnos.filter((tt) => !equipe.some((c) => c.turnoId === tt.id));
  const visiveis = comGente.filter((g) => !filtroTurno || g.id === filtroTurno).map((g) => ({ ...g, pessoas: g.pessoas.filter(passa) })).filter((g) => g.pessoas.length);

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

  const imprimir = () => {
    registrarImpressao("escala_equipe", "Escala da equipe (impressão)", `${dataBr(dias[0])} a ${dataBr(ultimo)}`);
    const dados = { config, equipe: equipe.filter((c) => visiveis.some((g) => g.pessoas.includes(c))), dias, rascunho, turnoPorId };
    imprimirHtml(
      ehFds
        ? htmlPlantao({
            ...dados,
            subtitulo: fdsOcultos.size
              ? `Fim de semana: ${finsDoMes
                  .filter((f) => !fdsOcultos.has(f.sab))
                  .map((f) => f.dias.map((d) => dataBr(d).slice(0, 5)).join(" e "))
                  .join(" · ")}`
              : `Sábados e domingos de ${nomeMes(mesRef)}`,
          })
        : htmlEscala(dados),
    );
  };

  // ---------- célula ----------
  const celula = (c, d) => {
    const s = situacao(c, d, rascunho, turnoPorId);
    const ativo = menu?.tipo === "dia" && menu.c.id === c.id && menu.data === d;
    return (
      <td key={d} className={`esc-cel ${d === hoje ? "is-hoje" : ""} ${diaDaSemana(d) === 0 || diaDaSemana(d) === 6 ? "is-fds" : ""}`}>
        <button
          type="button"
          className={`esc-cel__btn ${s.trabalha ? "is-trab" : "is-folga"} ${s.exc ? `is-exc is-${s.exc}` : ""} ${ativo ? "is-ativo" : ""}`}
          style={s.trabalha ? { "--c": s.turno?.cor || c.cor } : undefined}
          onClick={(e) => abrirMenu(e, { tipo: "dia", c, data: d })}
          title={`${c.nome} · ${DIAS_SEMANA_LONGO[diaDaSemana(d)]} ${dataBr(d)} · ${s.rotulo}${s.detalhe ? ` (${s.detalhe})` : ""}`}
        >
          {s.exc && <i className="esc-cel__marca" aria-hidden="true" />}
          {s.trabalha && !s.exc ? (
            // dentro do grupo do turno, o nome dele já está no cabeçalho: mostra o horário
            <b className="tabular">{nSemanas !== 2 ? s.detalhe || s.rotulo : (s.detalhe || "").slice(0, 5) || s.rotulo}</b>
          ) : (
            <b>{s.exc === "cobre" ? `↪ ${s.rotulo}` : s.exc === "extra" ? "+ Extra" : s.rotulo}</b>
          )}
          {s.exc && nSemanas !== 2 && <small>{s.exc === "extra" ? `dia extra · ${s.rotulo}` : s.exc === "cobre" ? "cobrindo" : "lançada"}</small>}
          {!s.exc && !s.trabalha && s.detalhe && nSemanas !== 2 && <small>{s.detalhe}</small>}
          {!s.exc && s.rev && nSemanas !== 2 && <small className="esc-cel__rev">revezamento</small>}
        </button>
      </td>
    );
  };

  const menuDia = () => {
    const { c, data } = menu;
    const x = rascunho.dias?.[data]?.[c.id] || null;
    const base = !c.folguista && trabalhaPeloModelo(c, data);
    const atual = x ? (x.tipo === "cobre" ? `cobre:${x.turnoId}` : x.tipo) : "";
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

  const periodo = ehFds ? `Fins de semana · ${nomeMes(mesRef)}` : `${dataBr(dias[0]).slice(0, 5)} a ${dataBr(ultimo).slice(0, 5)}`;
  const doHoje = kpis.hojeNoPeriodo ? "hoje" : `em ${dataBr(kpis.dia).slice(0, 5)}`;

  return (
    <div className="esc">
      <KpiTiles
        items={[
          { key: "eq", label: "Na equipe", value: equipe.length, hint: `${comGente.filter((g) => g.id !== FOLGUISTAS).length} turno(s) com gente`, icon: "users" },
          { key: "tr", label: `Trabalham ${doHoje}`, value: kpis.trabalham, hint: `${Math.max(0, kpis.folga)} de folga`, icon: "circleCheck" },
          { key: "ex", label: "Exceções no período", value: excecoesDoPeriodo, hint: "folgas, extras e coberturas", icon: "calendar" },
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
              ]}
            />
          </div>
          <div className="esc-barra__filtros">
            <label className="esc-busca">
              <Icon name="search" size={14} />
              <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pessoa ou função" />
            </label>
            <select className="ui-input esc-filtro" value={filtroTurno} onChange={(e) => setFiltroTurno(e.target.value)} aria-label="Turno">
              <option value="">Todos os turnos</option>
              {comGente.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.turno.nome}
                </option>
              ))}
            </select>
            <Button size="sm" icon="printer" onClick={imprimir}>
              {ehFds ? "Imprimir fins de semana" : "Imprimir"}
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
          <table className={`esc-tabela ${nSemanas === 2 ? "is-compacta" : ""}`}>
            <thead>
              <tr>
                <th className="esc-tabela__pessoa">Pessoa</th>
                {dias.map((d) => (
                  <th key={d} className={`${d === hoje ? "is-hoje" : ""} ${diaDaSemana(d) === 0 || diaDaSemana(d) === 6 ? "is-fds" : ""}`}>
                    <button type="button" className="esc-dia" onClick={(e) => abrirMenu(e, { tipo: "coluna", data: d })} title="Quem trabalha neste dia">
                      <span>{DIAS_SEMANA_CURTO[diaDaSemana(d)]}</span>
                      <b>{d.slice(8)}</b>
                      {excecoesDoDia(d) > 0 && <i className="esc-dia__exc" aria-label={`${excecoesDoDia(d)} exceção(ões)`} />}
                      {feriadoDoDia(config, d) && (
                        <em className="esc-dia__fer" title={feriadoDoDia(config, d).nome}>
                          {feriadoDoDia(config, d).nome}
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
                        {g.turno.inicio && (
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
                window.confirm(`Excluir toda a escala lançada (${totalExcecoes} exceções, em todas as semanas)? Folgas, dias extras e coberturas voltam ao modelo de cada um.`) &&
                setRascunho((r) => ({ ...r, dias: {} }))
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

      {menu && (
        <div className="esc-menu" role="menu" style={{ left: menu.x, top: menu.y }}>
          {menu.tipo === "dia" ? menuDia() : menu.tipo === "pessoa" ? menuPessoa() : menuColuna()}
        </div>
      )}
    </div>
  );
};

export default EscalaEquipe;
