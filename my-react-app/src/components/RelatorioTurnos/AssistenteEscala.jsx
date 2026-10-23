import { Fragment, useEffect, useMemo, useState } from "react";
import { Button, Drawer, Icon } from "../ui";
import {
  CORES_TURNO,
  DIAS_SEMANA_CURTO,
  DOMINGOS_DO_MES,
  ehDomingoDoMes,
  turnoDoRevezamento,
  FERIADOS_FIXOS,
  ETAPAS_PADRAO,
  LETRAS_GRUPO,
  MODELOS_BASE,
  MODELOS_ESCALA,
  carregarContasEquipe,
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
import { carregarFornecedores, ouvirVinculos } from "../../Services/Services/custosRepository";
import { chaveDoVeiculo, normalizarTexto } from "../../Services/Services/custosCalculo";
import "./assistente.css";

// exceção por voo: os veículos (chaves) dos fornecedores marcados, pelo cadastro
// de fornecedores e pelos vínculos da tela Serviços por Fornecedor
const veiculosDosFornecedores = (nomes = [], fornecedores = [], vinculos = {}) => {
  const alvo = new Set(nomes.map((n) => normalizarTexto(n)));
  const chaves = new Set();
  fornecedores
    .filter((f) => alvo.has(normalizarTexto(f?.nome)))
    .forEach((f) =>
      (Array.isArray(f.veiculos) ? f.veiculos : []).forEach((v) => {
        const id = typeof v === "object" ? v?.id : null;
        const nome = typeof v === "object" ? v?.nome : v;
        chaves.add(chaveDoVeiculo(id !== null && id !== undefined && id !== "" ? String(id) : "", nome || ""));
        if (nome) chaves.add(chaveDoVeiculo("", nome));
      }),
    );
  Object.entries(vinculos || {}).forEach(([k, v]) => {
    if (alvo.has(normalizarTexto(v?.fornecedor))) chaves.add(k);
  });
  return [...chaves];
};
const lerVinculosUmaVez = () =>
  new Promise((ok) => {
    let parar = null;
    let feito = false;
    parar = ouvirVinculos((v) => {
      if (feito) return;
      feito = true;
      ok(v || {});
      setTimeout(() => parar && parar(), 0);
    });
  });

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
  { id: "fds", nome: "Fim de semana", icone: "calendar" },
  { id: "feriados", nome: "Feriados", icone: "star" },
  { id: "aeroporto", nome: "Aeroporto", icone: "planeLanding" },
  { id: "conferir", nome: "Conferir", icone: "circleCheck" },
];
const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0];
// o sábado desta semana (domingo conta como a semana que termina nele)
const sabadoAtual = (hoje) => {
  const dow = diaDaSemana(hoje);
  return dow === 0 ? somarDias(hoje, -1) : somarDias(hoje, 6 - dow);
};
// datas do n-ésimo domingo (5 = último) nos próximos meses
const proximosDomingos = (n, desde, meses = 3) => {
  if (!n) return [];
  const out = [];
  let d = desde;
  while (diaDaSemana(d) !== 0) d = somarDias(d, 1);
  for (let i = 0; i < meses * 6 && out.length < meses; i += 1, d = somarDias(d, 7)) if (ehDomingoDoMes(d, n)) out.push(d);
  return out;
};
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

// ---------- busca de contas (reaproveita a conta que a pessoa já tem) ----------
const semAcento = (t = "") =>
  String(t)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
const nivelDaConta = (u) => (u.role === "operacional" ? (u.gerencia === true ? "Gerência" : "Operacional") : "Atendimento");
const BuscaContas = ({ contas, situacaoDe, onEscolher }) => {
  const [termo, setTermo] = useState("");
  const [aberta, setAberta] = useState(false);
  const t = semAcento(termo);
  const lista = (contas || []).filter((u) => !t || semAcento(`${u.nome} ${u.email} ${nivelDaConta(u)}`).includes(t));
  const disponiveis = lista.filter((u) => situacaoDe(u).tipo !== "dentro");
  return (
    <div className="aes-busca-contas">
      <label className="aes-busca-contas__campo">
        <Icon name="search" size={15} />
        <input
          type="search"
          value={termo}
          placeholder={contas === null ? "Carregando as contas…" : `Adicionar conta à equipe — buscar nome ou e-mail (${(contas || []).length} contas)`}
          onChange={(e) => {
            setTermo(e.target.value);
            setAberta(true);
          }}
          onFocus={() => setAberta(true)}
          onBlur={() => setTimeout(() => setAberta(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && disponiveis[0]) {
              e.preventDefault();
              onEscolher(disponiveis[0]);
              setTermo("");
            }
            if (e.key === "Escape") setAberta(false);
          }}
          disabled={contas === null}
          aria-label="Buscar conta"
        />
      </label>
      {aberta && contas && (
        <ul className="aes-busca-contas__lista" role="listbox">
          {lista.length === 0 && <li className="aes-busca-contas__vazio">Nenhuma conta com “{termo}”.</li>}
          {lista.slice(0, 60).map((u) => {
            const sit = situacaoDe(u);
            return (
              <li key={u.uid}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  disabled={sit.tipo === "dentro"}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onEscolher(u);
                    setTermo("");
                  }}
                >
                  <span className="aes-busca-contas__avatar">{String(u.nome || u.email || "?").slice(0, 1).toUpperCase()}</span>
                  <span className="aes-busca-contas__info">
                    <b>{u.nome || "Sem nome"}</b>
                    <small>{u.email}</small>
                  </span>
                  <span className={`aes-nivel is-${nivelDaConta(u).toLowerCase()}`}>{nivelDaConta(u)}</span>
                  <span className={`aes-busca-contas__acao is-${sit.tipo}`}>{sit.texto}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

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

  // fornecedores (exceção por voo): ao abrir, recalcula os veículos dos já marcados
  const [fornCad, setFornCad] = useState(null); // { nomes, fornecedores, vinculos }
  useEffect(() => {
    let vivo = true;
    Promise.all([carregarFornecedores().catch(() => []), lerVinculosUmaVez().catch(() => ({}))]).then(([fornecedores, vinculos]) => {
      if (!vivo) return;
      const nomes = [
        ...new Set([
          ...fornecedores.filter((f) => f?.nome && f.ativo !== false).map((f) => String(f.nome).trim()),
          ...Object.values(vinculos || {}).map((v) => String(v?.fornecedor || "").trim()),
        ]),
      ]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "pt-BR"));
      setFornCad({ nomes, fornecedores, vinculos });
      setR((x) => {
        const sel = x.atendimento?.porVoo?.fornecedores || [];
        if (!sel.length) return x;
        return { ...x, atendimento: { ...x.atendimento, porVoo: { fornecedores: sel, veiculos: veiculosDosFornecedores(sel, fornecedores, vinculos) } } };
      });
    });
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    let vivo = true;
    carregarContasEquipe()
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
      const folguistas = destino === FOLGUISTA ? [...semF, { id: nova.id, nome: nova.nome, obs: nova.obs || "", contaUid: nova.contaUid || "", funcao: nova.funcao || "" }] : semF;
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

  // situação de cada conta: já na equipe, dá para vincular a alguém com o mesmo nome, ou adicionar
  const situacaoConta = (conta) => {
    const dentro = pessoas.find(({ c }) => c.contaUid === conta.uid || c.id === conta.uid || (conta.colaboradorId && c.id === conta.colaboradorId));
    if (dentro) return { tipo: "dentro", texto: `na equipe · ${r.turnos.find((tt) => tt.id === dentro.turnoId)?.nome || "folguista"}` };
    const mesmoNome = pessoas.find(({ c }) => !c.contaUid && semAcento(c.nome) && semAcento(c.nome) === semAcento(conta.nome));
    if (mesmoNome) return { tipo: "vincular", texto: `vincular a ${mesmoNome.c.nome}`, pessoa: mesmoNome.c };
    return { tipo: "novo", texto: "+ adicionar" };
  };
  const adicionarConta = (conta) => {
    const sit = situacaoConta(conta);
    if (sit.tipo === "dentro") return;
    if (sit.tipo === "vincular") mudarPessoa(sit.pessoa.id, { contaUid: conta.uid });
    else adicionarPessoa({ id: conta.uid, nome: conta.nome || conta.email, contaUid: conta.uid });
  };

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
              <Button variant="ghost" iconOnly size="sm" icon="arrowUp" disabled={i === 0} onClick={() => setR((x) => { const l = [...x.turnos];[l[i - 1], l[i]] = [l[i], l[i - 1]]; return { ...x, turnos: l }; })} aria-label="Subir" />
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

      <BuscaContas contas={contas} situacaoDe={situacaoConta} onEscolher={adicionarConta} />

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
                        <span className="aes-conta" title="Ligada a uma conta do sistema (marca no painel do aeroporto)">
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

  // ---------- fim de semana ----------
  const doTurno = r.turnos.flatMap((tt) => tt.colaboradores.map((c) => ({ c, t: tt })));
  const nomeDe = (id) => doTurno.find((x) => x.c.id === id)?.c.nome || "—";
  const revs = r.revezamentos || [];
  const sab = sabadoAtual(hojeIso());
  const emRevezamento = new Set(revs.flatMap((x) => x.membros));
  const mudarRev = (id, p) => setR((x) => ({ ...x, revezamentos: (x.revezamentos || []).map((y) => (y.id === id ? { ...y, ...p } : y)) }));
  const fdsDe = (rev, id) => ({ grupo: rev.id, inicio: rev.inicio || sab, posicao: rev.membros.indexOf(id), tamanho: rev.membros.length });
  const quemNoDia = (rev, d) => rev.membros.find((id) => turnoDoRevezamento(fdsDe(rev, id), d)) || "";
  // "no sábado dd/mm trabalha X": X vira o 1º da roda a partir deste sábado
  const definirSabado = (rev, id) => {
    const atual = rev.membros.indexOf(id);
    if (atual < 0) return;
    mudarRev(rev.id, { membros: [...rev.membros.slice(atual), ...rev.membros.slice(0, atual)], inicio: sab });
  };
  const etapaFds = (
    <div className="aes-etapa">
      <header className="aes-cab">
        <h3>Fim de semana</h3>
        <p>Revezamento de sábado e domingo (quem trabalha no sábado folga no domingo, e vice-versa, alternando a cada semana) e o domingo de folga de cada pessoa no mês.</p>
      </header>

      <section className="aes-bloco">
        <h4>Revezamento de sábado e domingo</h4>
        {revs.length === 0 && <p className="aes-muted">Nenhum revezamento ainda. Ex.: Líder e Coordenadora — quando um trabalha no sábado, o outro trabalha no domingo.</p>}
        <div className="aes-revs">
          {revs.map((rev) => {
            const livres = doTurno.filter((x) => !emRevezamento.has(x.c.id));
            const fins = Array.from({ length: 4 }, (_, k) => somarDias(sab, 7 * k));
            const noSabado = quemNoDia(rev, sab);
            return (
              <div key={rev.id} className="aes-rev">
                <div className="aes-rev__topo">
                  <input className="ui-input" value={rev.nome} placeholder="Nome do revezamento (ex.: Liderança)" onChange={(e) => mudarRev(rev.id, { nome: e.target.value })} />
                  <Button
                    variant="ghost"
                    iconOnly
                    size="sm"
                    icon="trash"
                    onClick={() => window.confirm("Excluir este revezamento?") && setR((x) => ({ ...x, revezamentos: x.revezamentos.filter((y) => y.id !== rev.id) }))}
                    aria-label="Excluir revezamento"
                  />
                </div>
                <div className="aes-rev__membros">
                  {rev.membros.map((id) => (
                    <span key={id} className="aes-funcao">
                      {nomeDe(id)}
                      <button type="button" onClick={() => mudarRev(rev.id, { membros: rev.membros.filter((m) => m !== id) })} aria-label={`Tirar ${nomeDe(id)}`}>
                        <Icon name="x" size={10} />
                      </button>
                    </span>
                  ))}
                  {livres.length > 0 && (
                    <select className="ui-input aes-rev__add" value="" onChange={(e) => e.target.value && mudarRev(rev.id, { membros: [...rev.membros, e.target.value], inicio: rev.inicio || sab })} aria-label="Adicionar pessoa">
                      <option value="">+ Adicionar pessoa…</option>
                      {livres.map(({ c, t: tt }) => (
                        <option key={c.id} value={c.id}>
                          {c.nome} · {tt.nome}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                {rev.membros.length === 1 ? (
                  <>
                    <label className="aes-inline">
                      Alterna sozinho(a). No sábado {dataBr(sab).slice(0, 5)}, {nomeDe(rev.membros[0])}:
                      <select
                        className="ui-input"
                        value={turnoDoRevezamento(fdsDe(rev, rev.membros[0]), sab) ? "trabalha" : "folga"}
                        onChange={(e) => mudarRev(rev.id, { inicio: e.target.value === "trabalha" ? sab : somarDias(sab, -7) })}
                      >
                        <option value="trabalha">trabalha (folga no domingo)</option>
                        <option value="folga">folga (trabalha no domingo)</option>
                      </select>
                    </label>
                    <div className="aes-rev__fins">
                      {fins.map((d) => (
                        <div key={d}>
                          <small>
                            {dataBr(d).slice(0, 5)} e {dataBr(somarDias(d, 1)).slice(0, 5)}
                          </small>
                          <span>
                            <b>Sáb</b> {turnoDoRevezamento(fdsDe(rev, rev.membros[0]), d) ? "trabalha" : "folga"}
                          </span>
                          <span>
                            <b>Dom</b> {turnoDoRevezamento(fdsDe(rev, rev.membros[0]), somarDias(d, 1)) ? "trabalha" : "folga"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : rev.membros.length >= 2 ? (
                  <>
                    <label className="aes-inline">
                      No sábado {dataBr(sab).slice(0, 5)}, quem trabalha?
                      <select className="ui-input" value={noSabado} onChange={(e) => definirSabado(rev, e.target.value)}>
                        {rev.membros.map((id) => (
                          <option key={id} value={id}>
                            {nomeDe(id)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="aes-rev__fins">
                      {fins.map((d) => (
                        <div key={d}>
                          <small>
                            {dataBr(d).slice(0, 5)} e {dataBr(somarDias(d, 1)).slice(0, 5)}
                          </small>
                          <span>
                            <b>Sáb</b> {nomeDe(quemNoDia(rev, d))}
                          </span>
                          <span>
                            <b>Dom</b> {nomeDe(quemNoDia(rev, somarDias(d, 1)))}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="aes-muted">Adicione 1 pessoa (alterna sozinha: uma semana sábado, outra domingo) ou 2 ou mais (revezam entre si).</p>
                )}
              </div>
            );
          })}
        </div>
        <span className="aes-acoes-linha">
          <Button size="sm" icon="plus" onClick={() => setR((x) => ({ ...x, revezamentos: [...(x.revezamentos || []), { id: `rev_${novoId()}`, nome: "", membros: [], inicio: sab }] }))}>
            Novo revezamento (2 ou mais pessoas)
          </Button>
          <Button size="sm" icon="plus" onClick={() => setR((x) => ({ ...x, revezamentos: [...(x.revezamentos || []), { id: `rev_${novoId()}`, nome: "Alternado", membros: [], inicio: sab }] }))}>
            Alternado sozinho (sábado ou domingo)
          </Button>
        </span>
      </section>

      <section className="aes-bloco">
        <div className="aes-bloco__topo">
          <h4>Por pessoa: domingo de folga e horário no fim de semana</h4>
          <Button
            size="sm"
            icon="refresh"
            onClick={() =>
              setR((x) => ({
                ...x,
                turnos: x.turnos.map((tt) => {
                  let i = 0;
                  return { ...tt, colaboradores: tt.colaboradores.map((c) => (c.papel === "sinergia" ? c : { ...c, domingoFolga: (i++ % 4) + 1 })) };
                }),
              }))
            }
          >
            Distribuir 1º a 4º em cada turno
          </Button>
        </div>
        <p className="aes-muted">
          No domingo de folga a pessoa folga, qualquer que seja o modelo (distribuir em cada turno evita que todos folguem no mesmo domingo). O horário de fim de semana vale
          para sábado e domingo de quem tiver um diferente (ex.: liderança).
        </p>
        <div className="aes-tabela-wrap">
          <table className="aes-tabela aes-tabela--dom">
            <thead>
              <tr>
                <th>Pessoa</th>
                <th>Turno</th>
                <th>Domingo de folga</th>
                <th>Próximos</th>
                <th>Horário no fim de semana</th>
              </tr>
            </thead>
            <tbody>
              {doTurno.map(({ c, t: tt }) => (
                <tr key={c.id} style={{ "--c": tt.cor }}>
                  <td>
                    <b>{c.nome || "Sem nome"}</b>
                  </td>
                  <td>{tt.nome}</td>
                  <td>
                    <select className="ui-input" value={c.domingoFolga || 0} onChange={(e) => mudarPessoa(c.id, { domingoFolga: Number(e.target.value) })} aria-label={`Domingo de folga de ${c.nome}`}>
                      {DOMINGOS_DO_MES.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="aes-muted">
                    {proximosDomingos(c.domingoFolga, hojeIso())
                      .map((d) => dataBr(d).slice(0, 5))
                      .join(" · ") || "—"}
                  </td>
                  <td>
                    {c.horarioFds ? (
                      <span className="aes-inline">
                        <input type="time" className="ui-input" value={c.horarioFds.inicio} onChange={(e) => mudarPessoa(c.id, { horarioFds: { ...c.horarioFds, inicio: e.target.value } })} aria-label="Início no fim de semana" />
                        às
                        <input type="time" className="ui-input" value={c.horarioFds.fim} onChange={(e) => mudarPessoa(c.id, { horarioFds: { ...c.horarioFds, fim: e.target.value } })} aria-label="Fim no fim de semana" />
                        <button type="button" className="aes-link" onClick={() => mudarPessoa(c.id, { horarioFds: null })} title="Usar o horário de sempre">
                          <Icon name="x" size={12} />
                        </button>
                      </span>
                    ) : (
                      <button type="button" className="aes-link" onClick={() => mudarPessoa(c.id, { horarioFds: { inicio: c.inicio || tt.inicio, fim: c.fim || tt.fim } })}>
                        + horário diferente
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );

  // ---------- feriados ----------
  const feriados = r.feriados || [];
  const [novoFer, setNovoFer] = useState({ data: "", nome: "", base: "normal" });
  const [ferAberto, setFerAberto] = useState("");
  const anoAtual = hojeIso().slice(0, 4);
  const sugestoes = FERIADOS_FIXOS.flatMap(([md, nome]) => [`${anoAtual}-${md}`, `${Number(anoAtual) + 1}-${md}`].map((data) => ({ data, nome })))
    .filter((f) => f.data >= hojeIso() && !feriados.some((x) => x.data === f.data))
    .sort((a, b) => a.data.localeCompare(b.data))
    .slice(0, 6);
  // quem trabalha no feriado começa como na escala normal daquele dia (ou ninguém)
  const criarFeriado = ({ data, nome, base }) => {
    if (!data) return;
    const cfgSemFeriado = normalizarConfig({ ...final, feriados: (final.feriados || []).filter((f) => f.data !== data) });
    const equipe = Object.fromEntries(
      cfgSemFeriado.turnos.flatMap((tt) =>
        tt.colaboradores.map((c) => {
          const janela = tt.inicio ? (c.inicio && c.fim ? { inicio: c.inicio, fim: c.fim } : { inicio: tt.inicio, fim: tt.fim }) : { inicio: "", fim: "" };
          return [c.id, { trabalha: base === "normal" ? trabalhaPeloModelo(c, data) : false, ...janela }];
        }),
      ),
    );
    setR((x) => ({ ...x, feriados: [...(x.feriados || []).filter((f) => f.data !== data), { data, nome: nome || "Feriado", equipe }].sort((a, b) => a.data.localeCompare(b.data)) }));
    setFerAberto(data);
    setNovoFer({ data: "", nome: "", base: "normal" });
  };
  const mudarFer = (data, p) => setR((x) => ({ ...x, feriados: x.feriados.map((f) => (f.data === data ? { ...f, ...p } : f)) }));
  const mudarFerPessoa = (data, id, p) =>
    setR((x) => ({ ...x, feriados: x.feriados.map((f) => (f.data === data ? { ...f, equipe: { ...f.equipe, [id]: { ...(f.equipe[id] || { trabalha: false, inicio: "", fim: "" }), ...p } } } : f)) }));
  const etapaFeriados = (
    <div className="aes-etapa">
      <header className="aes-cab">
        <h3>Feriados</h3>
        <p>Em cada feriado, defina quem trabalha e em que horário. Quem não tiver Sim ou Não marcado segue a escala normal do dia.</p>
      </header>
      <section className="aes-bloco">
        <h4>Novo feriado</h4>
        <div className="aes-mais__linha">
          <input type="date" className="ui-input aes-fer__data" value={novoFer.data} onChange={(e) => setNovoFer((f) => ({ ...f, data: e.target.value }))} aria-label="Data" />
          <input className="ui-input" value={novoFer.nome} placeholder="Nome (ex.: Natal)" onChange={(e) => setNovoFer((f) => ({ ...f, nome: e.target.value }))} aria-label="Nome do feriado" />
          <select className="ui-input aes-fer__base" value={novoFer.base} onChange={(e) => setNovoFer((f) => ({ ...f, base: e.target.value }))} aria-label="Começar de">
            <option value="normal">Começar pela escala normal do dia</option>
            <option value="ninguem">Começar sem ninguém</option>
          </select>
          <Button size="sm" variant="primary" icon="plus" disabled={!novoFer.data} onClick={() => criarFeriado(novoFer)}>
            Adicionar feriado
          </Button>
        </div>
        {sugestoes.length > 0 && (
          <div className="aes-funcoes">
            Próximos:
            {sugestoes.map((f) => (
              <button key={f.data} type="button" className="aes-chip" onClick={() => setNovoFer((x) => ({ ...x, data: f.data, nome: f.nome }))}>
                {dataBr(f.data).slice(0, 5)} {f.nome}
              </button>
            ))}
          </div>
        )}
      </section>
      {feriados.length === 0 && <p className="aes-muted">Nenhum feriado configurado.</p>}
      {feriados.map((f) => {
        const aberto = ferAberto === f.data;
        const trabalham = Object.values(f.equipe).filter((v) => v.trabalha).length;
        return (
          <section key={f.data} className={`aes-bloco aes-fer ${f.data < hojeIso() ? "is-passado" : ""}`}>
            <div className="aes-bloco__topo">
              <button type="button" className="aes-fer__cab" onClick={() => setFerAberto(aberto ? "" : f.data)} aria-expanded={aberto}>
                <Icon name="star" size={15} />
                <b>
                  {DIAS_SEMANA_CURTO[diaDaSemana(f.data)]} {dataBr(f.data)}
                </b>
                <span>{f.nome}</span>
                <small>
                  {trabalham} pessoa(s) trabalham
                </small>
                <Icon name={aberto ? "chevronUp" : "chevronDown"} size={14} />
              </button>
              <Button variant="ghost" iconOnly size="sm" icon="trash" onClick={() => window.confirm(`Excluir o feriado ${f.nome} (${dataBr(f.data)})?`) && setR((x) => ({ ...x, feriados: x.feriados.filter((y) => y.data !== f.data) }))} aria-label="Excluir feriado" />
            </div>
            {aberto && (
              <>
                <input className="ui-input" value={f.nome} onChange={(e) => mudarFer(f.data, { nome: e.target.value })} aria-label="Nome do feriado" />
                <div className="aes-tabela-wrap">
                  <table className="aes-tabela aes-tabela--dom">
                    <thead>
                      <tr>
                        <th>Pessoa</th>
                        <th>Turno</th>
                        <th>Trabalha?</th>
                        <th>Horário no feriado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {doTurno.map(({ c, t: tt }) => {
                        const marcado = !!f.equipe[c.id];
                        const v = f.equipe[c.id] || { trabalha: false, inicio: tt.inicio, fim: tt.fim };
                        return (
                          <tr key={c.id} style={{ "--c": tt.cor }}>
                            <td>
                              <b>{c.nome || "Sem nome"}</b>
                            </td>
                            <td>{tt.nome}</td>
                            <td>
                              <span className="aes-grupos">
                                <button type="button" className={marcado && v.trabalha ? "is-on" : ""} onClick={() => mudarFerPessoa(f.data, c.id, { trabalha: true, inicio: v.inicio || tt.inicio, fim: v.fim || tt.fim })}>
                                  Sim
                                </button>
                                <button type="button" className={marcado && !v.trabalha ? "is-on is-nao" : ""} onClick={() => mudarFerPessoa(f.data, c.id, { trabalha: false })}>
                                  Não
                                </button>
                              </span>
                            </td>
                            <td>
                              {!marcado ? (
                                <span className="aes-muted">escala normal do dia</span>
                              ) : v.trabalha ? (
                                <span className="aes-inline">
                                  <input type="time" className="ui-input" value={v.inicio} onChange={(e) => mudarFerPessoa(f.data, c.id, { inicio: e.target.value })} aria-label="Início" />
                                  às
                                  <input type="time" className="ui-input" value={v.fim} onChange={(e) => mudarFerPessoa(f.data, c.id, { fim: e.target.value })} aria-label="Fim" />
                                </span>
                              ) : (
                                <span className="aes-muted">folga</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        );
      })}
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
        <input type="checkbox" checked={at.recepcaoPorReserva !== false} onChange={(e) => setAt({ recepcaoPorReserva: e.target.checked })} /> Veículo com mais de uma reserva:{" "}
        {at.etapas[0]?.nome?.toLowerCase() || "recepção"} marcada reserva a reserva (o veículo fica completo quando todas chegarem)
      </label>
      <label className="aes-check">
        <input type="checkbox" checked={at.avisarForaDoTurno} onChange={(e) => setAt({ avisarForaDoTurno: e.target.checked })} /> Avisar quando alguém marcar um veículo fora do próprio turno
      </label>
      <div className="aes-porvoo">
        <b>Fornecedores que separam por voo</b>
        <p>
          Para quem leva vários voos com o mesmo número de escala (ex.: o terceirizado de Morro de São Paulo): no painel do aeroporto, cada voo aparece separado, no
          horário dele — a chegada das 13h vai para o turno da tarde, não fica junto com a das 10h.
        </p>
        {!fornCad ? (
          <small className="aes-porvoo__carregando">
            <Icon name="loader" size={13} className="ui-spin" /> Carregando fornecedores…
          </small>
        ) : fornCad.nomes.length === 0 ? (
          <small>Nenhum fornecedor cadastrado.</small>
        ) : (
          <div className="aes-porvoo__lista" role="group" aria-label="Fornecedores que separam por voo">
            {fornCad.nomes.map((n) => {
              const sel = (at.porVoo?.fornecedores || []).some((x) => normalizarTexto(x) === normalizarTexto(n));
              return (
                <button
                  key={n}
                  type="button"
                  className={sel ? "is-on" : ""}
                  aria-pressed={sel}
                  onClick={() => {
                    const atual = at.porVoo?.fornecedores || [];
                    const nova = sel ? atual.filter((x) => normalizarTexto(x) !== normalizarTexto(n)) : [...atual, n];
                    setAt({ porVoo: { fornecedores: nova, veiculos: veiculosDosFornecedores(nova, fornCad.fornecedores, fornCad.vinculos) } });
                  }}
                >
                  {sel && <Icon name="check" size={12} />} {n}
                </button>
              );
            })}
          </div>
        )}
        {(at.porVoo?.fornecedores || []).length > 0 && (
          <small className="aes-porvoo__resumo">
            {(at.porVoo.fornecedores || []).join(", ")} · {(at.porVoo.veiculos || []).length} veículo(s) reconhecido(s). Veículo com o nome do fornecedor no apelido também entra.
          </small>
        )}
      </div>
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

  const conteudo = [etapaModelo, etapaTurnos, etapaEquipe, etapaFds, etapaFeriados, etapaAeroporto, etapaConferir][etapa];
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
