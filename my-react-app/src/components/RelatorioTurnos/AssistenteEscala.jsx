import { Fragment, useEffect, useMemo, useState } from "react";
import { Button, Drawer, Icon } from "../ui";
import {
  CORES_TURNO,
  DIAS_SEMANA_CURTO,
  ETAPAS_PADRAO,
  LETRAS_GRUPO,
  MODELOS_BASE,
  MODELOS_ESCALA,
  carregarContasAtendimento,
  dataBr,
  diaDaSemana,
  escalaDoDia,
  escalaPelaBase,
  gruposDoCiclo,
  horaValida,
  isoLocal,
  normalizarConfig,
  normalizarEscala,
  normalizarEscalaBase,
  novoId,
  somarDias,
  trabalhaPeloModelo,
  validarConfig,
} from "../../Services/Services/relatorioTurnos";
import "./assistente.css";

/* CONFIGURAR ESCALA — assistente em 5 etapas:
   1. Modelo   — o modelo da base (6x1, 5x2, 12x36, 24x48, 2x2, personalizado);
   2. Turnos   — horários, com a linha do tempo das 24h e modelos prontos;
   3. Equipe   — cada pessoa: função, papel, turno e a folga fixa (6x1/5x2) ou
                 a equipe do revezamento (A, B, C…); contas de Atendimento
                 entram com um clique; quem for diferente ganha modelo próprio;
   4. Aeroporto — o que cada um marca no painel e como os pax são contados;
   5. Conferir — as próximas 2 semanas, com os avisos (turno sem ninguém…).
   Só grava ao clicar em "Salvar escala". */

const ETAPAS = [
  { id: "modelo", nome: "Modelo", icone: "calendar" },
  { id: "turnos", nome: "Turnos", icone: "clock" },
  { id: "equipe", nome: "Equipe", icone: "users" },
  { id: "aeroporto", nome: "Aeroporto", icone: "planeLanding" },
  { id: "conferir", nome: "Conferir", icone: "circleCheck" },
];
const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0];
const FOLGUISTA = "__folguista__";
const hojeIso = () => isoLocal(new Date());
const paraMin = (h) => (horaValida(h) ? Number(h.slice(0, 2)) * 60 + Number(h.slice(3)) : 0);
const duracao = (t) => {
  const d = (paraMin(t.fim) - paraMin(t.inicio) + 1440) % 1440 || 1440;
  return `${Math.floor(d / 60)}h${d % 60 ? String(d % 60).padStart(2, "0") : ""}`;
};
const PRESETS_TURNOS = [
  {
    id: "3x8",
    nome: "Manhã, tarde e noite",
    desc: "3 turnos de 8h",
    turnos: [
      ["Manhã", "06:00", "14:00"],
      ["Tarde", "14:00", "22:00"],
      ["Noite", "22:00", "06:00"],
    ],
  },
  {
    id: "2x12",
    nome: "Dia e noite",
    desc: "2 turnos de 12h (plantão)",
    turnos: [
      ["Dia", "07:00", "19:00"],
      ["Noite", "19:00", "07:00"],
    ],
  },
  { id: "comercial", nome: "Comercial", desc: "1 turno, 08h às 18h", turnos: [["Comercial", "08:00", "18:00"]] },
];
const novoColab = (nome = "") => ({ id: novoId(), nome, papel: "principal", dias: [], inicio: "", fim: "", obs: "", escala: normalizarEscala({}), funcao: "", contaUid: "" });

// faixa ilustrada do modelo (14 dias)
const FaixaModelo = ({ modelo, trabalha, folga }) => {
  const m = MODELOS_BASE.find((x) => x.id === modelo);
  const linhas =
    m?.tipo === "semanal"
      ? [Array.from({ length: 14 }, (_, i) => (m.folgas === 1 ? i % 7 !== 6 : i % 7 < 5))]
      : Array.from({ length: Math.min(3, Math.max(1, Math.ceil((trabalha + folga) / trabalha))) }, (_, g) =>
          Array.from({ length: 14 }, (_, i) => ((((i - g * trabalha) % (trabalha + folga)) + (trabalha + folga)) % (trabalha + folga)) < trabalha),
        );
  return (
    <div className="aes-faixa" aria-hidden="true">
      {linhas.map((l, g) => (
        <div key={g} className="aes-faixa__linha">
          {m?.tipo !== "semanal" && <b>{LETRAS_GRUPO[g]}</b>}
          {l.map((on, i) => (
            <i key={i} className={on ? "is-on" : ""} />
          ))}
        </div>
      ))}
    </div>
  );
};

// linha do tempo das 24h com os turnos
const LinhaDoTempo = ({ turnos }) => (
  <div className="aes-tempo">
    <div className="aes-tempo__trilhos">
      {turnos.map((t) => {
        const a = paraMin(t.inicio);
        const b = paraMin(t.fim);
        const partes = a < b ? [[a, b]] : [[a, 1440], [0, b]];
        return (
          <div key={t.id} className="aes-tempo__trilho" title={`${t.nome} ${t.inicio}–${t.fim}`}>
            {partes.map(([x, y], i) => (
              <span key={i} style={{ left: `${(x / 1440) * 100}%`, width: `${((y - x) / 1440) * 100}%`, background: t.cor }}>
                {i === 0 ? t.nome : ""}
              </span>
            ))}
          </div>
        );
      })}
    </div>
    <div className="aes-tempo__horas">
      {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => (
        <span key={h} style={{ left: `${(h / 24) * 100}%` }}>
          {String(h).padStart(2, "0")}h
        </span>
      ))}
    </div>
  </div>
);

// função: escolhe ou cria
const SelectFuncao = ({ valor, funcoes, onChange, onCriar }) => (
  <select
    className="ui-input"
    value={valor || ""}
    onChange={(e) => {
      if (e.target.value === "__nova__") {
        const nome = window.prompt("Nome da nova função (ex.: Recepção, Embarque, Supervisão):");
        if (nome && nome.trim()) onChange(onCriar(nome.trim()));
        return;
      }
      onChange(e.target.value);
    }}
    aria-label="Função"
  >
    <option value="">—</option>
    {funcoes.map((f) => (
      <option key={f.id} value={f.id}>
        {f.nome}
      </option>
    ))}
    <option value="__nova__">+ Criar função…</option>
  </select>
);

const AssistenteEscala = ({ config, onClose, onSalvar }) => {
  const [r, setR] = useState(() => {
    const c = normalizarConfig(config);
    return { ...c, escalaBase: { ...c.escalaBase, inicio: c.escalaBase.inicio || hojeIso() } };
  });
  const [etapa, setEtapa] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [erros, setErros] = useState([]);
  const [aberta, setAberta] = useState(""); // pessoa com "mais opções" aberta
  const [contas, setContas] = useState(null);

  useEffect(() => {
    let vivo = true;
    carregarContasAtendimento()
      .then((l) => vivo && setContas(l))
      .catch(() => vivo && setContas([]));
    return () => {
      vivo = false;
    };
  }, []);

  const base = r.escalaBase;
  const modeloBase = MODELOS_BASE.find((m) => m.id === base.modelo) || MODELOS_BASE[0];
  const ehSemanal = modeloBase.tipo === "semanal";
  const nGrupos = gruposDoCiclo(base);
  const mudarBase = (p) => setR((x) => ({ ...x, escalaBase: normalizarEscalaBase({ ...x.escalaBase, ...p }) }));

  // ---------- pessoas (todas as dos turnos + folguistas) ----------
  const pessoas = [
    ...r.turnos.flatMap((t) => t.colaboradores.map((c) => ({ c, turnoId: t.id }))),
    ...(r.folguistas || []).map((f) => ({ c: { ...novoColab(), ...f }, turnoId: FOLGUISTA })),
  ];
  const mudarPessoa = (id, parcial, novoTurno) =>
    setR((x) => {
      let pessoa = null;
      let turnoAtual = "";
      x.turnos.forEach((t) =>
        t.colaboradores.forEach((c) => {
          if (c.id === id) [pessoa, turnoAtual] = [c, t.id];
        }),
      );
      (x.folguistas || []).forEach((f) => {
        if (f.id === id) [pessoa, turnoAtual] = [{ ...novoColab(), ...f }, FOLGUISTA];
      });
      if (!pessoa) return x;
      const destino = novoTurno !== undefined ? novoTurno : turnoAtual;
      const nova = { ...pessoa, ...parcial };
      const turnos = x.turnos.map((t) => {
        const sem = t.colaboradores.filter((c) => c.id !== id);
        if (t.id !== destino) return { ...t, colaboradores: sem };
        return turnoAtual === destino ? { ...t, colaboradores: t.colaboradores.map((c) => (c.id === id ? nova : c)) } : { ...t, colaboradores: [...sem, nova] };
      });
      const semF = (x.folguistas || []).filter((f) => f.id !== id);
      const folguistas = destino === FOLGUISTA ? [...semF, { id: nova.id, nome: nova.nome, obs: nova.obs || "", contaUid: nova.contaUid || "" }] : semF;
      return { ...x, turnos, folguistas };
    });
  const adicionarPessoa = (dados = {}) => {
    const t = r.turnos[0];
    if (!t) return;
    const c = { ...novoColab(), ...dados };
    if (!ehSemanal) {
      // revezamento: distribui entre as equipes (A, B…) para cobrir todos os dias
      const porGrupo = Array.from({ length: nGrupos }, (_, g) => pessoas.filter((p) => (p.c.escala?.grupo || 0) === g).length);
      c.escala = { ...c.escala, grupo: porGrupo.indexOf(Math.min(...porGrupo)) };
    }
    setR((x) => ({ ...x, turnos: x.turnos.map((tt) => (tt.id === t.id ? { ...tt, colaboradores: [...tt.colaboradores, c] } : tt)) }));
    if (!dados.nome) setAberta(c.id);
  };
  // revezamento: alterna A, B, C… dentro de cada turno (só quem segue o modelo da equipe)
  const distribuirGrupos = () =>
    setR((x) => ({
      ...x,
      turnos: x.turnos.map((t) => {
        let i = 0;
        return {
          ...t,
          colaboradores: t.colaboradores.map((c) => (c.escala?.propria ? c : { ...c, escala: { ...c.escala, grupo: i++ % nGrupos } })),
        };
      }),
    }));
  const removerPessoa = (id) =>
    setR((x) => ({ ...x, turnos: x.turnos.map((t) => ({ ...t, colaboradores: t.colaboradores.filter((c) => c.id !== id) })), folguistas: (x.folguistas || []).filter((f) => f.id !== id) }));

  const naEquipe = (conta) => pessoas.some(({ c }) => c.contaUid === conta.uid || c.id === conta.uid || (conta.colaboradorId && c.id === conta.colaboradorId));
  const contasFora = (contas || []).filter((ct) => !naEquipe(ct));

  const criarFuncao = (nome) => {
    const existe = (r.funcoes || []).find((f) => f.nome.toLowerCase() === nome.toLowerCase());
    if (existe) return existe.id;
    const id = `f_${novoId()}`;
    setR((x) => ({ ...x, funcoes: [...(x.funcoes || []), { id, nome }] }));
    return id;
  };

  // ---------- turnos ----------
  const mudarTurno = (id, p) => setR((x) => ({ ...x, turnos: x.turnos.map((t) => (t.id === id ? { ...t, ...p } : t)) }));
  const aplicarPreset = (preset) => {
    const temGente = r.turnos.some((t) => t.colaboradores.length);
    if (temGente && !window.confirm("Trocar os turnos pelos do modelo? Quem estiver num turno que sair vai para o primeiro turno novo.")) return;
    setR((x) => {
      const todos = x.turnos.flatMap((t) => t.colaboradores);
      const novos = preset.turnos.map(([nome, inicio, fim], i) => {
        const igual = x.turnos.find((t) => t.nome.toLowerCase() === nome.toLowerCase());
        return { id: igual?.id || novoId(), nome, inicio, fim, cor: CORES_TURNO[i % CORES_TURNO.length], colaboradores: igual ? igual.colaboradores : [] };
      });
      const alocados = new Set(novos.flatMap((t) => t.colaboradores.map((c) => c.id)));
      novos[0].colaboradores = [...novos[0].colaboradores, ...todos.filter((c) => !alocados.has(c.id))];
      return { ...x, turnos: novos };
    });
  };
  const adicionarTurno = () =>
    setR((x) => ({ ...x, turnos: [...x.turnos, { id: novoId(), nome: `Turno ${x.turnos.length + 1}`, inicio: "08:00", fim: "16:00", cor: CORES_TURNO[x.turnos.length % CORES_TURNO.length], colaboradores: [] }] }));
  const removerTurno = (t) => {
    if (r.turnos.length <= 1) return;
    if (t.colaboradores.length && !window.confirm(`Remover o turno ${t.nome}? As ${t.colaboradores.length} pessoa(s) dele vão para o turno ${r.turnos.find((x) => x.id !== t.id).nome}.`)) return;
    setR((x) => {
      const resto = x.turnos.filter((y) => y.id !== t.id);
      resto[0] = { ...resto[0], colaboradores: [...resto[0].colaboradores, ...t.colaboradores] };
      return { ...x, turnos: resto };
    });
  };

  // ---------- configuração final (aplica o modelo da base em quem não tem próprio) ----------
  const final = useMemo(() => {
    const aplicar = (c) => (c.escala?.propria ? c : { ...c, escala: escalaPelaBase(base, c.escala?.grupo || 0), ...(ehSemanal ? {} : { dias: [] }) });
    return normalizarConfig({ ...r, turnos: r.turnos.map((t) => ({ ...t, colaboradores: t.colaboradores.map(aplicar) })) });
  }, [r, base, ehSemanal]);

  // ---------- conferir: 14 dias ----------
  const dias = useMemo(() => Array.from({ length: 14 }, (_, i) => somarDias(hojeIso(), i)), []);
  const conferencia = useMemo(() => {
    const porDia = dias.map((d) => escalaDoDia(final, { dias: {} }, d));
    const avisos = [];
    final.turnos.forEach((t, ti) => {
      const temPrincipal = t.colaboradores.some((c) => c.papel === "principal");
      if (!temPrincipal) return;
      const vazios = dias.filter((_, i) => !porDia[i][ti].pessoas.some((p) => p.papel !== "sinergia"));
      if (vazios.length) avisos.push({ tipo: "alerta", texto: `${t.nome}: ninguém escalado em ${vazios.length} dia(s) — ${vazios.slice(0, 4).map((d) => `${DIAS_SEMANA_CURTO[diaDaSemana(d)].toLowerCase()} ${dataBr(d).slice(0, 5)}`).join(", ")}${vazios.length > 4 ? "…" : ""}.` });
    });
    final.turnos.forEach((t) => {
      if (!t.colaboradores.length) avisos.push({ tipo: "aviso", texto: `O turno ${t.nome} está sem ninguém.` });
    });
    if (ehSemanal) {
      final.turnos.forEach((t) =>
        t.colaboradores
          .filter((c) => !c.escala.propria)
          .forEach((c) => {
            const folgas = c.dias?.length ? 7 - c.dias.length : 0;
            if (folgas !== modeloBase.folgas) avisos.push({ tipo: "aviso", texto: `${c.nome || "Sem nome"}: ${folgas === 0 ? "sem folga fixa marcada" : `${folgas} folga(s) na semana`} (o modelo ${modeloBase.nome} pede ${modeloBase.folgas}).` });
          }),
      );
    }
    final.turnos.forEach((t) => t.colaboradores.filter((c) => !c.nome?.trim()).forEach(() => avisos.push({ tipo: "alerta", texto: `Tem uma pessoa sem nome no turno ${t.nome}.` })));
    return { porDia, avisos };
  }, [final, dias, ehSemanal, modeloBase]);

  const salvar = async () => {
    const problemas = validarConfig(final);
    setErros(problemas);
    if (problemas.length) {
      setEtapa(ETAPAS.length - 1);
      return;
    }
    setSalvando(true);
    try {
      await onSalvar({ ...final, escalaBase: base });
    } catch (e) {
      console.error(e);
      setErros(["Não foi possível salvar. Confira a conexão e tente de novo."]);
    } finally {
      setSalvando(false);
    }
  };

  // ======================= etapas =======================
  const etapaModelo = (
    <div className="aes-etapa">
      <header className="aes-cab">
        <h3>Qual é o modelo de escala da equipe?</h3>
        <p>Vale para todo mundo. Quem tiver um jeito diferente (um jovem aprendiz, um folguista) você ajusta na etapa Equipe.</p>
      </header>
      <div className="aes-modelos" role="radiogroup" aria-label="Modelo de escala">
        {MODELOS_BASE.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={base.modelo === m.id} className={`aes-modelo ${base.modelo === m.id ? "is-on" : ""}`} onClick={() => mudarBase({ modelo: m.id })}>
            <span className="aes-modelo__topo">
              <b>{m.nome}</b>
              {base.modelo === m.id && <Icon name="circleCheck" size={16} />}
            </span>
            <span className="aes-modelo__titulo">{m.titulo}</span>
            <FaixaModelo modelo={m.id} trabalha={m.id === "ciclo" && base.modelo === "ciclo" ? base.trabalha : m.trabalha || 1} folga={m.id === "ciclo" && base.modelo === "ciclo" ? base.folga : m.folga || 1} />
            <small>{m.desc}</small>
          </button>
        ))}
      </div>
      {modeloBase.tipo === "ciclo" && (
        <div className="aes-ciclo">
          {base.modelo === "ciclo" && (
            <>
              <label>
                <span>Dias de trabalho</span>
                <input type="number" min={1} max={14} className="ui-input" value={base.trabalha} onChange={(e) => mudarBase({ trabalha: e.target.value })} />
              </label>
              <label>
                <span>Dias de folga</span>
                <input type="number" min={1} max={14} className="ui-input" value={base.folga} onChange={(e) => mudarBase({ folga: e.target.value })} />
              </label>
            </>
          )}
          <label>
            <span>A equipe A começa em</span>
            <input type="date" className="ui-input" value={base.inicio} onChange={(e) => mudarBase({ inicio: e.target.value })} />
          </label>
          <p className="aes-dica">
            <Icon name="info" size={14} /> {nGrupos} equipes se revezam ({LETRAS_GRUPO.slice(0, nGrupos).split("").join(", ")}). A equipe B começa {base.trabalha} dia(s) depois da A
            {nGrupos > 2 ? ", e assim por diante" : ""}.
          </p>
        </div>
      )}
    </div>
  );

  const etapaTurnos = (
    <div className="aes-etapa">
      <header className="aes-cab">
        <h3>Quais são os turnos?</h3>
        <p>Comece por um modelo pronto ou ajuste os horários. Turno que passa da meia-noite é contado pelo dia em que começa.</p>
      </header>
      <div className="aes-presets">
        {PRESETS_TURNOS.map((p) => (
          <button key={p.id} type="button" className="aes-preset" onClick={() => aplicarPreset(p)}>
            <b>{p.nome}</b>
            <small>{p.desc}</small>
          </button>
        ))}
      </div>
      <LinhaDoTempo turnos={r.turnos} />
      <ul className="aes-turnos">
        {r.turnos.map((t, i) => (
          <li key={t.id} style={{ "--c": t.cor }}>
            <span className="aes-turnos__cores">
              {CORES_TURNO.map((cor) => (
                <button key={cor} type="button" className={t.cor === cor ? "is-on" : ""} style={{ background: cor }} onClick={() => mudarTurno(t.id, { cor })} aria-label={`Cor ${cor}`} />
              ))}
            </span>
            <input className="ui-input aes-turnos__nome" value={t.nome} onChange={(e) => mudarTurno(t.id, { nome: e.target.value })} aria-label="Nome do turno" />
            <input type="time" className="ui-input" value={t.inicio} onChange={(e) => mudarTurno(t.id, { inicio: e.target.value })} aria-label="Início" />
            <span className="aes-turnos__as">às</span>
            <input type="time" className="ui-input" value={t.fim} onChange={(e) => mudarTurno(t.id, { fim: e.target.value })} aria-label="Fim" />
            <span className="aes-turnos__dur">{duracao(t)}</span>
            <span className="aes-turnos__gente">
              <Icon name="users" size={12} /> {t.colaboradores.length}
            </span>
            <span className="aes-turnos__acoes">
              <Button variant="ghost" iconOnly size="sm" icon="arrowUp" disabled={i === 0} onClick={() => setR((x) => { const l = [...x.turnos]; [l[i - 1], l[i]] = [l[i], l[i - 1]]; return { ...x, turnos: l }; })} aria-label="Subir" />
              <Button variant="ghost" iconOnly size="sm" icon="trash" disabled={r.turnos.length <= 1} onClick={() => removerTurno(t)} aria-label={`Remover ${t.nome}`} />
            </span>
          </li>
        ))}
      </ul>
      <Button icon="plus" onClick={adicionarTurno}>
        Adicionar turno
      </Button>
    </div>
  );

  const celulaEscala = (c, turnoId) => {
    if (turnoId === FOLGUISTA) return <span className="aes-muted">Cobre as folgas (lance na grade da semana)</span>;
    if (c.escala?.propria) {
      const m = MODELOS_ESCALA.find((x) => x.id === c.escala.modelo);
      return (
        <button type="button" className="aes-propria" onClick={() => setAberta(c.id)}>
          Modelo próprio: {m?.id === "semanal" ? "dias da semana" : m?.nome.split(" (")[0]}
        </button>
      );
    }
    if (ehSemanal) {
      const dias = c.dias || [];
      const folga = (d) => dias.length > 0 && !dias.includes(d);
      const alternar = (d) => {
        const trab = dias.length ? dias : [0, 1, 2, 3, 4, 5, 6];
        const prox = trab.includes(d) ? trab.filter((x) => x !== d) : [...trab, d].sort();
        if (prox.length) mudarPessoa(c.id, { dias: prox.length === 7 ? [] : prox });
      };
      const n = dias.length ? 7 - dias.length : 0;
      return (
        <span className="aes-folgas">
          {ORDEM_SEMANA.map((d) => (
            <button key={d} type="button" className={folga(d) ? "is-on" : ""} aria-pressed={folga(d)} onClick={() => alternar(d)} title={folga(d) ? "Folga" : "Trabalha"}>
              {DIAS_SEMANA_CURTO[d].slice(0, 3)}
            </button>
          ))}
          <small className={n === modeloBase.folgas ? "" : "is-aviso"}>{n === 0 ? "marque a folga" : `${n} folga${n > 1 ? "s" : ""}`}</small>
        </span>
      );
    }
    return (
      <span className="aes-grupos" role="radiogroup" aria-label="Equipe do revezamento">
        {Array.from({ length: nGrupos }, (_, g) => (
          <button key={g} type="button" role="radio" aria-checked={(c.escala?.grupo || 0) === g} className={(c.escala?.grupo || 0) === g ? "is-on" : ""} onClick={() => mudarPessoa(c.id, { escala: { ...c.escala, grupo: g } })} title={`Equipe ${LETRAS_GRUPO[g]}: começa em ${dataBr(somarDias(base.inicio, g * base.trabalha)).slice(0, 5)}`}>
            {LETRAS_GRUPO[g]}
          </button>
        ))}
      </span>
    );
  };

  const maisOpcoes = (c) => {
    const e = c.escala || normalizarEscala({});
    const setE = (p) => mudarPessoa(c.id, { escala: normalizarEscala({ ...e, ...p }) });
    return (
      <div className="aes-mais">
        <label className="aes-check">
          <input
            type="checkbox"
            checked={!!e.propria}
            onChange={(ev) => setE(ev.target.checked ? { ...(ehSemanal ? { modelo: "12x36", referencia: base.inicio } : { modelo: "semanal" }), propria: true } : { propria: false })}
          />
          Modelo diferente do da equipe
        </label>
        {e.propria && (
          <div className="aes-mais__linha">
            <select className="ui-input" value={e.modelo} onChange={(ev) => setE({ modelo: ev.target.value, referencia: e.referencia || base.inicio })}>
              {MODELOS_ESCALA.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
            {e.modelo === "semanal" ? (
              <span className="aes-folgas">
                {ORDEM_SEMANA.map((d) => {
                  const dias = c.dias || [];
                  const trabalha = !dias.length || dias.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      className={trabalha ? "is-trab" : "is-on"}
                      onClick={() => {
                        const trab = dias.length ? dias : [0, 1, 2, 3, 4, 5, 6];
                        const prox = trab.includes(d) ? trab.filter((x) => x !== d) : [...trab, d].sort();
                        if (prox.length) mudarPessoa(c.id, { dias: prox.length === 7 ? [] : prox });
                      }}
                    >
                      {DIAS_SEMANA_CURTO[d].slice(0, 3)}
                    </button>
                  );
                })}
              </span>
            ) : (
              <>
                {e.modelo === "ciclo" && (
                  <>
                    <input type="number" min={1} max={14} className="ui-input aes-num" value={e.trabalha} onChange={(ev) => setE({ trabalha: ev.target.value })} aria-label="Dias de trabalho" />
                    <span>x</span>
                    <input type="number" min={1} max={14} className="ui-input aes-num" value={e.folga} onChange={(ev) => setE({ folga: ev.target.value })} aria-label="Dias de folga" />
                  </>
                )}
                <label className="aes-inline">
                  começa em <input type="date" className="ui-input" value={e.referencia} onChange={(ev) => setE({ referencia: ev.target.value })} />
                </label>
              </>
            )}
          </div>
        )}
        <div className="aes-mais__linha">
          <label className="aes-check">
            <input type="checkbox" checked={!!(c.inicio || c.fim)} onChange={(ev) => mudarPessoa(c.id, ev.target.checked ? { inicio: "08:00", fim: "17:00" } : { inicio: "", fim: "" })} />
            Horário diferente do turno
          </label>
          {(c.inicio || c.fim) && (
            <span className="aes-inline">
              <input type="time" className="ui-input" value={c.inicio} onChange={(ev) => mudarPessoa(c.id, { inicio: ev.target.value })} /> às{" "}
              <input type="time" className="ui-input" value={c.fim} onChange={(ev) => mudarPessoa(c.id, { fim: ev.target.value })} />
            </span>
          )}
        </div>
        <input className="ui-input" placeholder="Observação (ex.: Jovem Aprendiz)" value={c.obs || ""} onChange={(ev) => mudarPessoa(c.id, { obs: ev.target.value })} />
      </div>
    );
  };

  const etapaEquipe = (
    <div className="aes-etapa">
      <header className="aes-cab">
        <h3>Quem trabalha em cada turno?</h3>
        <p>
          {ehSemanal
            ? `Modelo ${modeloBase.nome}: marque a folga fixa de cada pessoa (dia em destaque = folga).`
            : `Modelo ${modeloBase.nome}: escolha a equipe de cada pessoa (${LETRAS_GRUPO.slice(0, nGrupos).split("").join(", ")}). A equipe A começa em ${dataBr(base.inicio)}.`}
        </p>
        {!ehSemanal && pessoas.length > 1 && (
          <Button size="sm" icon="refresh" onClick={distribuirGrupos} className="aes-distribuir">
            Distribuir {LETRAS_GRUPO.slice(0, nGrupos).split("").join("/")} automaticamente
          </Button>
        )}
      </header>

      {contasFora.length > 0 && (
        <div className="aes-contas">
          <span>
            <Icon name="smartphone" size={14} /> Contas de atendimento fora da equipe:
          </span>
          {contasFora.map((ct) => (
            <button key={ct.uid} type="button" className="aes-chip" onClick={() => adicionarPessoa({ id: ct.uid, nome: ct.nome || ct.email, contaUid: ct.uid })}>
              <Icon name="plus" size={12} /> {ct.nome || ct.email}
            </button>
          ))}
          {contasFora.length > 1 && (
            <button type="button" className="aes-link" onClick={() => contasFora.forEach((ct) => adicionarPessoa({ id: ct.uid, nome: ct.nome || ct.email, contaUid: ct.uid }))}>
              Adicionar todas
            </button>
          )}
        </div>
      )}

      <div className="aes-tabela-wrap">
        <table className="aes-tabela">
          <thead>
            <tr>
              <th>Pessoa</th>
              <th>Função</th>
              <th>Papel</th>
              <th>Turno</th>
              <th>{ehSemanal ? "Folga fixa" : "Equipe"}</th>
              <th aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {pessoas.length === 0 && (
              <tr>
                <td colSpan={6} className="aes-vazio">
                  Ninguém na equipe ainda. Adicione as pessoas ou as contas de atendimento.
                </td>
              </tr>
            )}
            {pessoas.map(({ c, turnoId }) => {
              const turno = r.turnos.find((t) => t.id === turnoId);
              return (
                <Fragment key={c.id}>
                  <tr style={{ "--c": turno?.cor || "#64748b" }}>
                    <td className="aes-tabela__nome">
                      <input className="ui-input" value={c.nome} placeholder="Nome" onChange={(e) => mudarPessoa(c.id, { nome: e.target.value })} aria-label="Nome" />
                      {c.contaUid && (
                        <span className="aes-conta" title="Tem conta de atendimento (marca no celular)">
                          <Icon name="smartphone" size={11} />
                        </span>
                      )}
                    </td>
                    <td>
                      <SelectFuncao valor={c.funcao} funcoes={r.funcoes || []} onChange={(v) => mudarPessoa(c.id, { funcao: v })} onCriar={criarFuncao} />
                    </td>
                    <td>
                      {turnoId === FOLGUISTA ? (
                        <span className="aes-muted">Folguista</span>
                      ) : (
                        <select className="ui-input" value={c.papel} onChange={(e) => mudarPessoa(c.id, { papel: e.target.value })} aria-label="Papel">
                          <option value="principal">Principal</option>
                          <option value="sinergia">Apoio (sinergia)</option>
                        </select>
                      )}
                    </td>
                    <td>
                      <select className="ui-input aes-turno-sel" value={turnoId} onChange={(e) => mudarPessoa(c.id, {}, e.target.value)} aria-label="Turno">
                        {r.turnos.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.nome} ({t.inicio}–{t.fim})
                          </option>
                        ))}
                        <option value={FOLGUISTA}>Folguista (cobre folgas)</option>
                      </select>
                    </td>
                    <td>{celulaEscala(c, turnoId)}</td>
                    <td className="aes-tabela__acoes">
                      {turnoId !== FOLGUISTA && (
                        <Button variant="ghost" iconOnly size="sm" icon={aberta === c.id ? "chevronUp" : "settings"} onClick={() => setAberta(aberta === c.id ? "" : c.id)} aria-label="Mais opções" title="Modelo próprio, horário, observação" />
                      )}
                      <Button variant="ghost" iconOnly size="sm" icon="trash" onClick={() => window.confirm(`Tirar ${c.nome || "esta pessoa"} da equipe?`) && removerPessoa(c.id)} aria-label="Tirar da equipe" />
                    </td>
                  </tr>
                  {aberta === c.id && turnoId !== FOLGUISTA && (
                    <tr className="aes-tabela__mais">
                      <td colSpan={6}>{maisOpcoes(c)}</td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="aes-rodape-equipe">
        <Button icon="userPlus" onClick={() => adicionarPessoa()}>
          Adicionar pessoa
        </Button>
        <span className="aes-funcoes">
          Funções:
          {(r.funcoes || []).map((f) => (
            <span key={f.id} className="aes-funcao">
              {f.nome}
              <button
                type="button"
                onClick={() =>
                  window.confirm(`Excluir a função ${f.nome}?`) &&
                  setR((x) => ({ ...x, funcoes: x.funcoes.filter((y) => y.id !== f.id), turnos: x.turnos.map((t) => ({ ...t, colaboradores: t.colaboradores.map((c) => (c.funcao === f.id ? { ...c, funcao: "" } : c)) })) }))
                }
                aria-label={`Excluir ${f.nome}`}
              >
                <Icon name="x" size={10} />
              </button>
            </span>
          ))}
          <button
            type="button"
            className="aes-link"
            onClick={() => {
              const nome = window.prompt("Nome da nova função:");
              if (nome && nome.trim()) criarFuncao(nome.trim());
            }}
          >
            + Criar função
          </button>
        </span>
      </div>
    </div>
  );

  const at = r.atendimento || { ativo: true, etapas: ETAPAS_PADRAO, contagem: "dividir", avisarForaDoTurno: true };
  const setAt = (p) => setR((x) => ({ ...x, atendimento: { ...at, ...p } }));
  const etapaAeroporto = (
    <div className="aes-etapa">
      <header className="aes-cab">
        <h3>Atendimento no aeroporto</h3>
        <p>O que cada pessoa marca no celular, por veículo (o verso da cartinha), e como os pax são contados no relatório.</p>
      </header>
      <label className="aes-check">
        <input type="checkbox" checked={at.ativo} onChange={(e) => setAt({ ativo: e.target.checked })} /> Painel do aeroporto ativo
      </label>
      <div className="aes-etapas-at">
        <span className="aes-etapas-at__cab">
          <small>No relatório</small>
          <small>No botão do celular</small>
        </span>
        {at.etapas.map((x) => (
          <div key={x.id} className="aes-mais__linha">
            <input className="ui-input" value={x.nome} placeholder="Ex.: Recepcionou" onChange={(e) => setAt({ etapas: at.etapas.map((y) => (y.id === x.id ? { ...y, nome: e.target.value } : y)) })} />
            <input className="ui-input" value={x.acao} placeholder="Ex.: Recepcionei" onChange={(e) => setAt({ etapas: at.etapas.map((y) => (y.id === x.id ? { ...y, acao: e.target.value } : y)) })} />
            <Button variant="ghost" iconOnly size="sm" icon="trash" disabled={at.etapas.length <= 1} onClick={() => setAt({ etapas: at.etapas.filter((y) => y.id !== x.id) })} aria-label="Remover etapa" />
          </div>
        ))}
        {at.etapas.length < 4 && (
          <Button size="sm" icon="plus" onClick={() => setAt({ etapas: [...at.etapas, { id: novoId(), nome: "", acao: "" }] })}>
            Adicionar etapa
          </Button>
        )}
      </div>
      <div className="aes-opcoes2" role="radiogroup" aria-label="Contagem">
        {[
          ["dividir", "Dividir os pax", "10 pax com 2 pessoas = 5 para cada. A soma bate com o total do dia."],
          ["total", "Cada um conta tudo", "10 pax com 2 pessoas = 10 para cada (como na cartinha)."],
        ].map(([v, t, d]) => (
          <button key={v} type="button" role="radio" aria-checked={at.contagem === v} className={at.contagem === v ? "is-on" : ""} onClick={() => setAt({ contagem: v })}>
            <b>{t}</b>
            <small>{d}</small>
          </button>
        ))}
      </div>
      <label className="aes-check">
        <input type="checkbox" checked={at.avisarForaDoTurno} onChange={(e) => setAt({ avisarForaDoTurno: e.target.checked })} /> Avisar quando alguém marcar um veículo fora do próprio turno
      </label>
    </div>
  );

  const pessoasFinal = [...final.turnos.flatMap((t) => t.colaboradores.map((c) => ({ c, t })))];
  const etapaConferir = (
    <div className="aes-etapa">
      <header className="aes-cab">
        <h3>Confira as próximas 2 semanas</h3>
        <p>
          Modelo {modeloBase.nome} · {final.turnos.length} turno(s) · {pessoasFinal.length} pessoa(s){(final.folguistas || []).length ? ` + ${final.folguistas.length} folguista(s)` : ""}. Folgas,
          trocas e coberturas do dia a dia você lança depois, na Escala da equipe.
        </p>
      </header>
      {(erros.length > 0 || conferencia.avisos.length > 0) && (
        <ul className="aes-avisos">
          {erros.map((e) => (
            <li key={e} className="is-alerta">
              <Icon name="alert" size={14} /> {e}
            </li>
          ))}
          {conferencia.avisos.map((a) => (
            <li key={a.texto} className={`is-${a.tipo}`}>
              <Icon name="alert" size={14} /> {a.texto}
            </li>
          ))}
        </ul>
      )}
      {!erros.length && !conferencia.avisos.length && (
        <p className="aes-ok">
          <Icon name="circleCheck" size={16} /> Todos os turnos têm gente em todos os dias.
        </p>
      )}
      <div className="aes-tabela-wrap">
        <table className="aes-grade">
          <thead>
            <tr>
              <th>Pessoa</th>
              {dias.map((d) => (
                <th key={d} className={diaDaSemana(d) === 0 || diaDaSemana(d) === 6 ? "is-fds" : ""}>
                  {DIAS_SEMANA_CURTO[diaDaSemana(d)].slice(0, 1)}
                  <small>{d.slice(8)}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pessoasFinal.map(({ c, t }) => (
              <tr key={c.id}>
                <td>
                  <i style={{ background: t.cor }} />
                  {c.nome || "Sem nome"}
                </td>
                {dias.map((d) => {
                  const on = trabalhaPeloModelo(c, d);
                  return (
                    <td key={d} className={on ? "is-on" : ""} style={on ? { "--c": t.cor } : undefined} title={`${c.nome} · ${dataBr(d)} · ${on ? t.nome : "folga"}`}>
                      {on ? t.nome.slice(0, 1) : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            {final.turnos.map((t, ti) => (
              <tr key={t.id}>
                <td>
                  <i style={{ background: t.cor }} />
                  No turno {t.nome}
                </td>
                {conferencia.porDia.map((dia, i) => {
                  const n = dia[ti].pessoas.filter((p) => p.papel !== "sinergia").length;
                  const apoio = !t.colaboradores.some((c) => c.papel === "principal");
                  return (
                    <td key={dias[i]} className={n === 0 && !apoio ? "is-vazio" : ""}>
                      {apoio ? dia[ti].pessoas.length : n}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tfoot>
        </table>
      </div>
    </div>
  );

  const conteudo = [etapaModelo, etapaTurnos, etapaEquipe, etapaAeroporto, etapaConferir][etapa];
  const ultima = etapa === ETAPAS.length - 1;

  return (
    <Drawer
      open
      onClose={onClose}
      width={1120}
      title="Configurar escala"
      subtitle="Modelo, turnos e equipe em poucos passos. Nada é gravado até você salvar."
      footer={
        <>
          <Button onClick={() => (etapa === 0 ? onClose() : setEtapa(etapa - 1))} disabled={salvando}>
            {etapa === 0 ? "Cancelar" : "Voltar"}
          </Button>
          {!ultima && (
            <Button variant="ghost" icon="save" onClick={salvar} loading={salvando} disabled={salvando}>
              Salvar agora
            </Button>
          )}
          <Button variant="primary" icon={ultima ? "save" : "arrowRight"} onClick={() => (ultima ? salvar() : setEtapa(etapa + 1))} loading={ultima && salvando} disabled={salvando}>
            {ultima ? "Salvar escala" : `Próximo: ${ETAPAS[etapa + 1].nome}`}
          </Button>
        </>
      }
    >
      <div className="aes">
        <nav className="aes-passos" aria-label="Etapas">
          {ETAPAS.map((e, i) => (
            <button key={e.id} type="button" className={`${i === etapa ? "is-atual" : ""} ${i < etapa ? "is-feita" : ""}`} onClick={() => setEtapa(i)} aria-current={i === etapa ? "step" : undefined}>
              <span className="aes-passos__num">{i < etapa ? <Icon name="check" size={13} /> : i + 1}</span>
              <span className="aes-passos__nome">
                <Icon name={e.icone} size={14} /> {e.nome}
              </span>
            </button>
          ))}
        </nav>
        {conteudo}
      </div>
    </Drawer>
  );
};

export default AssistenteEscala;
