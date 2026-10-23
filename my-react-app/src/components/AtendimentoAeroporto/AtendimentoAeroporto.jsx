import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { onSnapshot, query, where } from "firebase/firestore";
import Icon from "../ui/Icon";
import { useAuth } from "../../Context/AuthContext";
import { ROLES } from "../../Context/permissions";
import { podeArea } from "../../Context/acessos";
import { colBase } from "../../Services/Services/dadosBase";
import { definirTituloAba } from "../Shell/tituloAba";
import AvaliacaoSistema from "../Atividade/AvaliacaoSistema";
import { registrarAcao } from "../../Services/Services/atividadeRepository";
import {
  carregarConfigTurnos,
  carregarExcecoes,
  dataBr,
  dentro,
  escalaDoDia,
  isoLocal,
  num,
  somarDias,
  todosDaEquipe,
} from "../../Services/Services/relatorioTurnos";
import {
  COL_ATENDIMENTOS,
  buscarChegadasPorVeiculo,
  contarAtendimentos,
  esperaDoDoc,
  eventosNovos,
  horaDe,
  marcarEtapa,
  marcarNoShow,
  marcarRecepcaoReservas,
  recepcaoDaReserva,
  noShowDaReserva,
  TIPOS_NO_SHOW,
  DESCRICAO_NO_SHOW,
  textoRelatoNoShow,
  marcasDaEtapa,
  regraPorVoo,
  textoMinutos,
  textoPax,
  vincularDocs,
} from "../../Services/Services/atendimentoAeroporto";
import { definirSom, somLigado, tocarNotificacao } from "../../Services/Utils/somNotificacao";
import "./atendimento.css";

/* PAINEL DO AEROPORTO (conta "Atendimento" ou Operacional).
   As chegadas do dia (Phoenix), por veículo. Em cada veículo o colaborador
   toca nas etapas que fez — "Recepcionei", "Embarquei" (configurável). Isso
   substitui a assinatura no verso da cartinha. As marcas aparecem na hora
   para todos (tempo real) e alimentam o relatório da Demanda por turno.
   O Operacional pode marcar em nome de um colaborador (ex.: lançar cartinhas). */

const hoje = () => isoLocal(new Date());
const semAcento = (t = "") =>
  String(t)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
// copia um texto (com reserva para navegador sem a API de área de transferência)
const copiarTexto = async (t) => {
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = t;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
};

/* Relato padronizado do no show para colar no grupo (com a descrição editável) */
const RelatoNoShow = ({ reserva, tipo }) => {
  const [editando, setEditando] = useState(false);
  const [descricao, setDescricao] = useState(DESCRICAO_NO_SHOW);
  const [copiado, setCopiado] = useState(false);
  const texto = textoRelatoNoShow({ reserva, tipo, descricao });
  const copiar = async () => {
    if (await copiarTexto(texto)) {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2200);
    } else window.prompt("Copie o relato:", texto);
  };
  return (
    <div className="atd-relato">
      {editando && (
        <>
          <pre className="atd-relato__previa">{texto}</pre>
          <label className="atd-relato__desc">
            <span>Descrição</span>
            <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} maxLength={500} />
          </label>
        </>
      )}
      <div className="atd-relato__acoes">
        <button type="button" className={`atd-relato__copiar ${copiado ? "is-ok" : ""}`} onClick={copiar}>
          <Icon name={copiado ? "check" : "copy"} size={13} /> {copiado ? "Copiado!" : "Copiar relato para o grupo"}
        </button>
        <button type="button" className="atd-relato__editar" onClick={() => setEditando((x) => !x)}>
          {editando ? "Fechar" : "Ver / editar"}
        </button>
      </div>
    </div>
  );
};

// busca o voo no Google (status, atraso, portão)
const buscarVooNoGoogle = (voo) => {
  if (!voo) return;
  window.open(`https://www.google.com/search?q=${encodeURIComponent(`voo ${String(voo).replace(/\s*-\s*/g, " ")}`)}`, "_blank", "noopener,noreferrer");
};

const pl = (n, um, varios) => `${num(n, 0)} ${Math.round(n) === 1 ? um : varios}`;

const AtendimentoAeroporto = () => {
  const { user, perfil, role, logout } = useAuth();
  const ehOperacional = role === ROLES.OPERACIONAL;
  const uid = user?.uid || "";
  const [data, setData] = useState(hoje);
  const [config, setConfig] = useState(null);
  const [configLida, setConfigLida] = useState(false);
  const [excecoes, setExcecoes] = useState({ dias: {} });
  const [carga, setCarga] = useState({ data: "", grupos: [], erro: "" });
  const [docs, setDocs] = useState({ data: "", lista: [] });
  // o Operacional lança por várias pessoas: começa no dia todo
  const [filtroTurno, setFiltroTurno] = useState(() => (ehOperacional ? "todos" : "meu"));
  const [filtro, setFiltro] = useState("pendentes"); // pendentes | todos | meus
  const [busca, setBusca] = useState("");
  const [abertos, setAbertos] = useState(() => new Set()); // veículos com as reservas abertas
  const alternarAberto = (chave) =>
    setAbertos((a) => {
      const n = new Set(a);
      if (n.has(chave)) n.delete(chave);
      else n.add(chave);
      return n;
    });
  const [salvando, setSalvando] = useState("");
  const [recarregar, setRecarregar] = useState(0);

  useEffect(() => {
    definirTituloAba("Atendimento no aeroporto");
  }, []);

  // equipe, escala e regras
  useEffect(() => {
    let vivo = true;
    Promise.all([carregarConfigTurnos(), carregarExcecoes().catch(() => ({ dias: {} }))])
      .then(([c, e]) => {
        if (!vivo) return;
        setConfig(c);
        setExcecoes(e);
        setConfigLida(true);
      })
      .catch(() => {
        if (!vivo) return;
        setConfig(null);
        setConfigLida(true);
      });
    return () => {
      vivo = false;
    };
  }, []);

  // chegadas do Phoenix (por veículo) — espera a configuração por causa da
  // exceção por voo (fornecedores que usam o mesmo número de escala)
  const porVoo = useMemo(() => regraPorVoo(config?.atendimento), [config]);
  useEffect(() => {
    if (!configLida) return undefined;
    let vivo = true;
    buscarChegadasPorVeiculo(data, { porVoo })
      .then((grupos) => vivo && setCarga({ data, grupos, erro: "" }))
      .catch((e) => vivo && setCarga({ data, grupos: [], erro: e?.message || "Não foi possível ler o Phoenix." }));
    return () => {
      vivo = false;
    };
  }, [data, recarregar, configLida, porVoo]);

  // marcas do dia, em tempo real. Para o Operacional, o que OUTRA pessoa
  // marcar toca o som e aparece no aviso "Agora há pouco".
  const etapasRef = useRef([]);
  const [aviso, setAviso] = useState(null);
  const [som, setSom] = useState(somLigado);
  useEffect(() => {
    let anteriores = null;
    return onSnapshot(
      query(colBase(COL_ATENDIMENTOS), where("data", "==", data)),
      (snap) => {
        const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        // marcações feitas neste aparelho chegam com hasPendingWrites: não avisam
        if (ehOperacional && anteriores && !snap.metadata.hasPendingWrites) {
          const novos = eventosNovos(anteriores, lista, etapasRef.current);
          if (novos.length) {
            setAviso({ ...novos[0], mais: novos.length - 1, ts: Date.now() });
            tocarNotificacao();
          }
        }
        anteriores = lista;
        setDocs({ data, lista });
      },
      (e) => console.error("Erro ao ler atendimentos:", e),
    );
  }, [data, ehOperacional]);
  // o aviso some sozinho
  useEffect(() => {
    if (!aviso) return undefined;
    const t = setTimeout(() => setAviso(null), 7000);
    return () => clearTimeout(t);
  }, [aviso]);
  const alternarSom = () => {
    const novo = !som;
    definirSom(novo);
    setSom(novo);
    if (novo) tocarNotificacao({ forcar: true });
  };

  const equipe = useMemo(() => (config ? todosDaEquipe(config) : []), [config]);
  const etapas = useMemo(() => config?.atendimento?.etapas || [], [config]);
  useEffect(() => {
    etapasRef.current = etapas;
  }, [etapas]);
  const regra = config?.atendimento?.contagem || "dividir";

  // quem está marcando.
  // Operacional: sempre a própria conta, com o NOME CADASTRADO na conta (não
  // dá para marcar em nome de outra pessoa). Se a conta está ligada a alguém
  // da escala, usa o id dessa pessoa — o relatório soma no lugar certo.
  const euMesmo = ehOperacional && uid
    ? { id: equipe.find((c) => c.contaUid === uid || c.id === uid)?.id || uid, nome: perfil?.nome || "Operacional", turnoId: equipe.find((c) => c.contaUid === uid || c.id === uid)?.turnoId }
    : null;
  const eu = ehOperacional
    ? euMesmo
    : // a conta é ligada à pessoa em Configurar escala (contaUid); contas antigas, pelo colaboradorId
    equipe.find((c) => user?.uid && (c.contaUid === user.uid || c.id === user.uid)) ||
    equipe.find((c) => perfil?.colaboradorId && c.id === perfil.colaboradorId) ||
    (user?.uid ? { id: user.uid, nome: perfil?.nome || "Atendimento" } : null);
  const quem = eu ? { id: eu.id, nome: eu.nome, colaboradorId: eu.id } : null;

  // meu turno no dia
  const escala = useMemo(() => (config ? escalaDoDia(config, excecoes, data) : []), [config, excecoes, data]);
  const meuTurno = eu ? escala.map((e) => ({ ...e, eu: e.pessoas.find((p) => p.id === eu.id) })).find((e) => e.eu) : null;
  const janela = meuTurno?.eu?.janela || null;

  const grupos = carga.data === data ? carga.grupos : null;
  const lista = docs.data === data ? docs.lista : [];
  const vinculos = useMemo(() => vincularDocs(grupos || [], lista, data), [grupos, lista, data]);
  const marcasDe = (g) => vinculos.get(g.chave)?.doc?.marcas || {};
  const totalPax = (grupos || []).reduce((s, g) => s + g.pax, 0);
  // recepção por reserva: todas as reservas (fora no show) recebidas = recepção feita,
  // mesmo que a marca principal do veículo não tenha sido gravada
  const recepcaoPelasReservas = (g) => {
    if (config?.atendimento?.recepcaoPorReserva === false || g.reservas.length <= 1) return null;
    const doc = vinculos.get(g.chave)?.doc;
    if (!doc) return null;
    const ativas = g.reservas.map((r, i) => ({ r, i })).filter(({ r, i }) => !noShowDaReserva(doc, r, i));
    if (!ativas.length) return null;
    const recs = ativas.map(({ r, i }) => recepcaoDaReserva(doc, r, i));
    if (recs.some((x) => !x)) return null;
    const porNome = new Map();
    recs.forEach((x) => porNome.set(x.nome, { id: x.colaboradorId || x.nome, nome: x.nome, em: x.em }));
    return [...porNome.values()];
  };
  const completo = (g) => etapas.every((e, k) => Object.keys(marcasDe(g)[e.id] || {}).length > 0 || (k === 0 && !!recepcaoPelasReservas(g)));

  const visiveis = (grupos || []).filter((g) => {
    if (filtroTurno === "meu" && janela && !dentro(g.min, janela.inicio, janela.fim)) return false;
    if (filtro === "pendentes" && completo(g)) return false;
    if (filtro === "meus" && !etapas.some((e) => quem && marcasDe(g)[e.id]?.[quem.id])) return false;
    const t = semAcento(busca.trim());
    if (t && !semAcento(`${g.voos.join(" ")} ${g.veiculo} ${g.motorista} ${g.reservas.map((r) => `${r.titular} ${r.codigo} ${r.hotel}`).join(" ")}`).includes(t)) return false;
    return true;
  });

  // meus números do dia
  const meus = useMemo(() => {
    if (!quem) return null;
    const { pessoas } = contarAtendimentos(lista, etapas, regra);
    return pessoas.get(quem.id) || null;
  }, [lista, etapas, regra, quem]);

  // ---------- recepção por reserva (veículo com mais de uma) ----------
  const etapaRecepcao = etapas[0];
  const porReserva = (g) => config?.atendimento?.recepcaoPorReserva !== false && !!etapaRecepcao && g.reservas.length > 1;
  const docDe = (g) => vinculos.get(g.chave)?.doc || null;
  const estadoReservas = (g) => {
    const doc = docDe(g);
    const itens = g.reservas.map((r, i) => ({ r, i, ns: doc ? noShowDaReserva(doc, r, i) : null, rec: doc ? recepcaoDaReserva(doc, r, i) : null }));
    const ativas = itens.filter((x) => !x.ns);
    return { itens, ativas, feitas: ativas.filter((x) => x.rec).length };
  };
  const gravarRecepcao = async (g, alvo, marcar, docOverride) => {
    const v = vinculos.get(g.chave);
    return marcarRecepcaoReservas({
      data,
      grupo: g,
      doc: docOverride || v?.doc || null,
      docId: v?.id,
      alvo,
      marcar,
      quem,
      por: user?.uid,
      etapaId: etapaRecepcao.id,
    });
  };
  const alternarReserva = async (g, r, i) => {
    if (!quem) return;
    const doc = docDe(g);
    const rec = doc ? recepcaoDaReserva(doc, r, i) : null;
    if (rec && rec.colaboradorId !== quem.id && !window.confirm(`${r.titular || r.codigo} foi recepcionada por ${rec.nome}. Desmarcar?`)) return;
    if (!rec && config?.atendimento?.avisarForaDoTurno && janela && !dentro(g.min, janela.inicio, janela.fim)) {
      if (!window.confirm(`Este veículo (${g.hora}) está fora do seu turno (${janela.inicio}–${janela.fim}). Marcar mesmo assim?`)) return;
    }
    setSalvando(`${g.chave}|rr|${i}`);
    try {
      const completou = await gravarRecepcao(g, [{ r, i }], !rec);
      if (!rec) registrarAcao("atendimento_recepcao_reserva", "Recepção de reserva (aeroporto)", `${r.codigo || r.titular} · ${r.pax} pax${completou ? " · veículo completo" : ""}`);
    } catch (e) {
      console.error(e);
      alert("Não foi possível salvar. Confira a conexão.");
    } finally {
      setSalvando("");
    }
  };

  // no show de uma reserva (tipo = null desfaz)
  const informarNoShow = async (g, r, i, tipo) => {
    if (!quem) return;
    const v = vinculos.get(g.chave);
    const atual = v?.doc ? noShowDaReserva(v.doc, r, i) : null;
    if (tipo && atual?.tipo === tipo) return;
    if (!tipo && !window.confirm(`Desfazer o no show de ${r.titular || r.codigo}?`)) return;
    setSalvando(`${g.chave}|ns|${i}`);
    try {
      await marcarNoShow({ data, grupo: g, reserva: r, indice: i, tipo, quem, por: user?.uid, docId: v?.id });
      // a reserva de no show não precisa ser recepcionada: confere se o veículo completou
      if (porReserva(g) && v?.doc?.recepcoes) {
        const chave = Object.keys(v.doc.noShow || {}).find((k) => v.doc.noShow[k]?.codigo === r.codigo) || null;
        const noShow = { ...(v.doc.noShow || {}) };
        if (tipo) noShow[chave || `_${i}`] = { tipo, codigo: r.codigo, titular: r.titular, pax: r.pax };
        else if (chave) delete noShow[chave];
        await gravarRecepcao(g, [], true, { ...v.doc, noShow });
      }
      if (tipo) registrarAcao("atendimento_no_show", "No show (aeroporto)", `${r.codigo || r.titular} · ${tipo === "com_custo" ? "com custo" : "sem custo"}`);
    } catch (e) {
      console.error(e);
      alert("Não foi possível salvar o no show. Confira a conexão.");
    } finally {
      setSalvando("");
    }
  };

  const alternar = async (g, etapa) => {
    if (!quem) return;
    if (etapa.id === etapaRecepcao?.id && porReserva(g)) {
      // botão principal: recebe todas as que faltam de uma vez (ou desfaz todas)
      const { ativas, feitas } = estadoReservas(g);
      const tudo = feitas === ativas.length && ativas.length > 0;
      if (tudo && !window.confirm("Desmarcar a recepção de todas as reservas deste veículo?")) return;
      setSalvando(`${g.chave}|${etapa.id}`);
      try {
        await gravarRecepcao(g, tudo ? ativas : ativas.filter((x) => !x.rec), !tudo);
        if (!tudo) registrarAcao(`atendimento_${etapa.id}`, `${etapa.nome} (aeroporto)`, `${g.voos.join(", ")} · ${g.pax} pax`);
      } catch (e) {
        console.error(e);
        alert("Não foi possível salvar. Confira a conexão.");
      } finally {
        setSalvando("");
      }
      return;
    }
    const marcado = !!marcasDe(g)[etapa.id]?.[quem.id];
    if (!marcado && config?.atendimento?.avisarForaDoTurno && janela && !dentro(g.min, janela.inicio, janela.fim)) {
      if (!window.confirm(`Este veículo (${g.hora}) está fora do seu turno (${janela.inicio}–${janela.fim}). Marcar mesmo assim?`)) return;
    }
    setSalvando(`${g.chave}|${etapa.id}`);
    try {
      await marcarEtapa({
        data,
        grupo: g,
        etapa: etapa.id,
        quem,
        por: user?.uid,
        marcar: !marcado,
        docId: vinculos.get(g.chave)?.id,
      });
      if (!marcado) registrarAcao(`atendimento_${etapa.id}`, `${etapa.nome} (aeroporto)`, `${g.voos.join(", ")} · ${g.pax} pax`);
    } catch (e) {
      console.error(e);
      alert("Não foi possível salvar. Confira a conexão.");
    } finally {
      setSalvando("");
    }
  };

  const desfazerEtapa = async (g, etapa) => {
    if (!quem) return;
    const marcas = marcasDaEtapa({ marcas: marcasDe(g) }, etapa.id);
    const outros = marcas.filter((x) => x.id !== quem.id);
    if (!window.confirm(`Desfazer "${etapa.nome}" deste veículo${outros.length ? ` (marcado por ${marcas.map((x) => x.nome).join(", ")})` : ""}?`)) return;
    setSalvando(`${g.chave}|${etapa.id}`);
    try {
      if (etapa.id === etapaRecepcao?.id && porReserva(g)) {
        const { ativas } = estadoReservas(g);
        await gravarRecepcao(g, ativas.filter((x) => x.rec), false);
      } else {
        const docId = vinculos.get(g.chave)?.id;
        for (const x of marcas) {
          await marcarEtapa({ data, grupo: g, etapa: etapa.id, quem: { id: x.id, nome: x.nome, colaboradorId: x.colaboradorId || x.id }, por: user?.uid, marcar: false, docId });
        }
      }
    } catch (e) {
      console.error(e);
      alert("Não foi possível desfazer. Confira a conexão.");
    } finally {
      setSalvando("");
    }
  };

  // Operacional: só quem a gerência liberou (Controle de acessos → Painel de Atendimento)
  if (ehOperacional && !podeArea(perfil, "painelAtendimento")) {
    return (
      <div className="atd atd--bloqueado">
        <div className="atd-bloqueio">
          <Icon name="lock" size={26} />
          <b>Painel de Atendimento não liberado para esta conta</b>
          <span>A gerência libera em Controle de acessos → Painel de Atendimento (aeroporto).</span>
          <Link to="/" className="atd-btn-leve">
            <Icon name="chevronLeft" size={15} /> Voltar para o sistema
          </Link>
        </div>
      </div>
    );
  }

  const nomeDoDia = data === hoje() ? "Hoje" : data === somarDias(hoje(), -1) ? "Ontem" : data === somarDias(hoje(), 1) ? "Amanhã" : dataBr(data);

  return (
    <div className="atd">
      {aviso && (
        <div className={`atd-aviso is-${aviso.tipo}`} role="status" aria-live="polite" key={aviso.ts}>
          <Icon name={aviso.tipo === "noshow" ? "alert" : "circleCheck"} size={16} />
          <span>
            <b>{aviso.texto}</b>
            <small>
              {aviso.detalhe}
              {aviso.mais > 0 ? ` · +${aviso.mais}` : ""}
            </small>
          </span>
          <button type="button" onClick={() => setAviso(null)} aria-label="Fechar aviso">
            <Icon name="x" size={14} />
          </button>
        </div>
      )}
      <header className="atd-topo">
        <div className="atd-topo__linha">
          <span className="atd-topo__icone">
            <Icon name="planeLanding" size={20} />
          </span>
          <div className="atd-topo__titulo">
            <strong>Atendimento no aeroporto</strong>
            <small>{eu ? `${eu.nome}${meuTurno ? ` · ${meuTurno.turno.nome} ${janela.inicio}–${janela.fim}` : eu.turnoId ? " · folga neste dia" : ehOperacional ? " · conta do Operacional" : " · ainda sem turno na escala"}` : "Entrando…"}</small>
          </div>
          <span className="atd-topo__acoes">
            <AvaliacaoSistema variante="botao" className="atd-btn-leve atd-avaliar" />
            {ehOperacional && (
              <button type="button" className={`atd-btn-leve ${som ? "is-on" : ""}`} onClick={alternarSom} aria-pressed={som} title={som ? "Desligar o som das marcações" : "Ligar o som das marcações"}>
                <Icon name="bell" size={15} />
              </button>
            )}
            {ehOperacional && (
              <Link to="/" className="atd-btn-leve" title="Voltar para o sistema">
                <Icon name="chevronLeft" size={15} /> <span className="atd-btn-txt">Sistema</span>
              </Link>
            )}
            {ehOperacional ? (
              <Link to="/recepcao-turnos" className="atd-btn-leve">
                <Icon name="barChart" size={15} /> <span className="atd-btn-txt">Relatório</span>
              </Link>
            ) : (
              <Link to="/atendimento/sobre" className="atd-btn-leve" title="Sobre a FiaSystem">
                <Icon name="info" size={15} />
              </Link>
            )}
            <Link to="/atendimento/tema" className="atd-btn-leve" title="Tema, cor e tamanho do texto" aria-label="Tema">
              <Icon name="palette" size={15} />
            </Link>
            <button type="button" className="atd-btn-leve" onClick={logout} title="Sair">
              <Icon name="logout" size={15} />
            </button>
          </span>
        </div>

        <div className="atd-dias" role="tablist" aria-label="Dia">
          {[somarDias(hoje(), -1), hoje(), somarDias(hoje(), 1)].map((d) => (
            <button key={d} type="button" role="tab" aria-selected={d === data} className={d === data ? "is-on" : ""} onClick={() => setData(d)}>
              {d === hoje() ? "Hoje" : d < hoje() ? "Ontem" : "Amanhã"}
              <small>{dataBr(d).slice(0, 5)}</small>
            </button>
          ))}
        </div>

        {quem && etapas.length > 0 && (
          <div className="atd-meus">
            {etapas.map((e) => {
              const v = meus?.etapas?.[e.id];
              return (
                <div key={e.id} className="atd-meus__item">
                  <b>{num(v?.pax || 0, 1)}</b>
                  <span>
                    pax · {e.nome.toLowerCase()}
                    <small>{totalPax ? `${num(((v?.pax || 0) / totalPax) * 100, 0)}% do dia` : "—"}</small>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </header>

      <main className="atd-corpo">
        <div className="atd-filtros">
          <label className="atd-busca">
            <Icon name="search" size={15} />
            <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Voo, nome do passageiro, veículo…" />
          </label>
          <div className="atd-chips">
            {janela && (
              <>
                <button type="button" className={filtroTurno === "meu" ? "is-on" : ""} onClick={() => setFiltroTurno("meu")}>
                  Meu turno
                </button>
                <button type="button" className={filtroTurno === "todos" ? "is-on" : ""} onClick={() => setFiltroTurno("todos")}>
                  Dia todo
                </button>
                <i />
              </>
            )}
            {[
              ["pendentes", "Pendentes"],
              ["todos", "Todos"],
              ["meus", "Os meus"],
            ].map(([v, r]) => (
              <button key={v} type="button" className={filtro === v ? "is-on" : ""} onClick={() => setFiltro(v)}>
                {r}
              </button>
            ))}
          </div>
        </div>

        {!config ? (
          <p className="atd-vazio">
            <Icon name="loader" size={18} className="ui-spin" /> Carregando…
          </p>
        ) : !grupos ? (
          <p className="atd-vazio">
            <Icon name="loader" size={18} className="ui-spin" /> Buscando as chegadas de {nomeDoDia.toLowerCase()} no Phoenix…
          </p>
        ) : carga.erro ? (
          <div className="atd-vazio">
            <Icon name="alert" size={18} /> {carga.erro}
            <button type="button" className="atd-btn-leve" onClick={() => setRecarregar((x) => x + 1)}>
              Tentar de novo
            </button>
          </div>
        ) : visiveis.length === 0 ? (
          <p className="atd-vazio">
            <Icon name="circleCheck" size={18} />{" "}
            {grupos.length === 0
              ? `Nenhuma chegada ${nomeDoDia === "Hoje" ? "hoje" : `em ${nomeDoDia.toLowerCase()}`}.`
              : filtro === "pendentes"
                ? "Nada pendente por aqui."
                : "Nenhum veículo com esse filtro."}
          </p>
        ) : (
          <ul className="atd-lista">
            {visiveis.map((g) => {
              const m = marcasDe(g);
              const feito = completo(g);
              // etapas feitas (a recepção vale pelas reservas quando todas foram recebidas)
              const feitas = etapas.map((e, k) => {
                const marcas = marcasDaEtapa({ marcas: m }, e.id);
                const virtual = !marcas.length && k === 0 ? recepcaoPelasReservas(g) : null;
                return { e, k, marcas: marcas.length ? marcas : virtual || [], virtual: !!virtual };
              });
              const prox = feitas.find((x) => !x.marcas.length);
              const situacao = feito ? "feito" : feitas.some((x) => x.marcas.length) ? "andamento" : "pendente";
              const rotuloSituacao = feito
                ? "Concluído"
                : prox?.k === 0
                  ? "Aguardando recepção"
                  : prox?.k === etapas.length - 1
                    ? "Aguardando embarque"
                    : `Aguardando ${(prox?.e.nome || "").toLowerCase()}`;
              return (
                <li key={g.chave} className={`atd-carro is-${situacao}`}>
                  <div className="atd-carro__topo">
                    <span className="atd-carro__hora">{g.hora || "--:--"}</span>
                    <span className="atd-carro__voos">
                      {(g.voos.length ? g.voos : ["Sem voo"]).map((v) => (
                        <b key={v}>
                          <Icon name="planeLanding" size={12} /> {v}
                          {g.voos.length > 0 && (
                            <button type="button" className="atd-carro__lupa" onClick={() => buscarVooNoGoogle(v)} title={`Buscar ${v} no Google`} aria-label={`Buscar o voo ${v} no Google`}>
                              <Icon name="search" size={12} />
                            </button>
                          )}
                        </b>
                      ))}
                    </span>
                    <span className="atd-carro__pax" title={`${g.pax} passageiro(s)`}>
                      <Icon name="users" size={14} /> {g.pax}
                    </span>
                  </div>
                  <span className={`atd-carro__situacao is-${situacao}`}>
                    <i aria-hidden="true" /> {rotuloSituacao}
                  </span>
                  <div className="atd-carro__veiculo">
                    <span className="atd-carro__veic-ic" aria-hidden="true">
                      <Icon name="car" size={15} />
                    </span>
                    {g.veiculo ? (
                      <>
                        <b>{g.veiculo}</b>
                        {g.motorista && <span> · {g.motorista}</span>}
                        {g.porVoo && (
                          <span className="atd-carro__porvoo" title="Fornecedor com a mesma escala para voos diferentes: cada voo aparece separado, no horário dele">
                            separado por voo
                          </span>
                        )}
                      </>
                    ) : (
                      <em>Ainda sem veículo na escala</em>
                    )}
                  </div>
                  {vinculos.get(g.chave)?.herdado && (
                    <small className="atd-carro__herdado">
                      <Icon name="info" size={12} /> Marcado pelo voo, antes de o Phoenix escalar o veículo
                    </small>
                  )}
                  <button
                    type="button"
                    className={`atd-carro__reservas-btn ${abertos.has(g.chave) ? "is-aberto" : ""}`}
                    onClick={() => alternarAberto(g.chave)}
                    aria-expanded={abertos.has(g.chave)}
                  >
                    <span className="atd-carro__nomes">
                      {g.reservas
                        .slice(0, 3)
                        .map((r) => `${r.titular || r.codigo}${r.pax > 1 ? ` (${r.pax})` : ""}`)
                        .join(" · ")}
                      {g.reservas.length > 3 ? ` · +${g.reservas.length - 3}` : ""}
                    </span>
                    <span className="atd-carro__reservas-acao">
                      {(() => {
                        const doc = vinculos.get(g.chave)?.doc;
                        const n = doc ? g.reservas.filter((r, i) => noShowDaReserva(doc, r, i)).length : 0;
                        return n ? <em className="atd-noshow-tag">{n} no show</em> : null;
                      })()}
                      {porReserva(g) &&
                        (() => {
                          const { ativas, feitas } = estadoReservas(g);
                          return (
                            <em className={`atd-rec-tag ${feitas === ativas.length && ativas.length ? "is-ok" : ""}`}>
                              {etapaRecepcao.nome.slice(0, 5)}. {feitas}/{ativas.length}
                            </em>
                          );
                        })()}
                      {g.reservas.length} reserva{g.reservas.length === 1 ? "" : "s"}
                      <Icon name="chevronDown" size={14} />
                    </span>
                  </button>
                  {abertos.has(g.chave) && (
                    <ul className="atd-reservas">
                      {g.reservas.map((r, i) => (
                        <li key={`${r.codigo}-${i}`} className={porReserva(g) ? "com-marca" : ""}>
                          {porReserva(g) &&
                            (() => {
                              const doc = docDe(g);
                              const rec = doc ? recepcaoDaReserva(doc, r, i) : null;
                              const ns = doc ? noShowDaReserva(doc, r, i) : null;
                              const ocupado = salvando === `${g.chave}|rr|${i}`;
                              return (
                                <button
                                  type="button"
                                  className={`atd-reservas__marca ${rec ? "is-ok" : ""}`}
                                  onClick={() => alternarReserva(g, r, i)}
                                  disabled={!quem || ocupado || !!ns}
                                  aria-pressed={!!rec}
                                  title={ns ? "No show" : rec ? `${rec.nome} ${horaDe(rec.em)} — tocar para desmarcar` : `Marcar como ${etapaRecepcao.nome.toLowerCase()}`}
                                >
                                  <Icon name={ocupado ? "loader" : rec ? "circleCheck" : ns ? "x" : "circle"} size={18} className={ocupado ? "ui-spin" : undefined} />
                                </button>
                              );
                            })()}
                          <div className="atd-reservas__topo">
                            <b>{r.titular || "Sem nome"}</b>
                            <span className="atd-reservas__pax">{r.pax} pax</span>
                          </div>
                          <div className="atd-reservas__info">
                            {r.codigo && <span className="atd-reservas__codigo">{r.codigo}</span>}
                            <span>
                              <Icon name="mapPin" size={12} /> {r.hotel || "Hotel não informado"}
                            </span>
                            {g.voos.length > 1 && r.voo && <span>Voo {r.voo}</span>}
                          </div>
                          <small className="atd-reservas__det">{textoPax(r)}</small>
                          {(() => {
                            const ns = vinculos.get(g.chave)?.doc ? noShowDaReserva(vinculos.get(g.chave).doc, r, i) : null;
                            const ocupado = salvando === `${g.chave}|ns|${i}`;
                            const recebida = vinculos.get(g.chave)?.doc ? recepcaoDaReserva(vinculos.get(g.chave).doc, r, i) : null;
                            if (!ns && recebida)
                              return (
                                <small className="atd-reservas__recebida">
                                  <Icon name="circleCheck" size={12} /> {etapaRecepcao?.nome || "Recepcionada"} · {recebida.nome} {horaDe(recebida.em)}
                                </small>
                              );
                            return ns ? (
                              <div className={`atd-noshow is-${ns.tipo}`}>
                                <Icon name="alert" size={13} />
                                <span>
                                  <b>{ns.tipo === "com_custo" ? "No show com custo" : "No show sem custo"}</b>
                                  <small>
                                    {ns.porNome || "—"}
                                    {ns.em?.toDate ? ` · ${ns.em.toDate().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}
                                  </small>
                                </span>
                                <button type="button" onClick={() => informarNoShow(g, r, i, null)} disabled={!quem || ocupado}>
                                  Desfazer
                                </button>
                                <RelatoNoShow reserva={{ ...ns, ...r }} tipo={ns.tipo} />
                              </div>
                            ) : (
                              <div className="atd-noshow-btns">
                                {TIPOS_NO_SHOW.map((t) => (
                                  <button key={t.id} type="button" onClick={() => informarNoShow(g, r, i, t.id)} disabled={!quem || ocupado}>
                                    {ocupado ? <Icon name="loader" size={12} className="ui-spin" /> : null} No show · {t.curto.toLowerCase()}
                                  </button>
                                ))}
                              </div>
                            );
                          })()}
                        </li>
                      ))}
                    </ul>
                  )}
                  {(() => {
                    // dois botões lado a lado: Recepcionei e Embarquei. O de cada etapa
                    // só libera depois da anterior; feito, mostra quem e a hora — tocar
                    // de novo desfaz (com confirmação)
                    const icone = (k) => (k === 0 ? "check" : k === etapas.length - 1 ? "car" : "circleCheck");
                    const tom = (k) => (k === 0 ? "rec" : k === etapas.length - 1 ? "emb" : "meio");
                    // "a recepção", "o embarque" (as etapas têm nome no passado: Recepcionou, Embarcou)
                    const daEtapa = (k) => (k === 0 ? "da recepção" : k === etapas.length - 1 ? "do embarque" : `de ${etapas[k].nome.toLowerCase()}`);
                    const aEtapa = (k) => (k === 0 ? "a recepção" : k === etapas.length - 1 ? "o embarque" : etapas[k].nome.toLowerCase());
                    return (
                      <div className="atd-botoes" style={{ "--n": etapas.length }}>
                        {feitas.map((x) => {
                          const feita = x.marcas.length > 0;
                          const anterior = x.k > 0 ? feitas[x.k - 1] : null;
                          const travada = !feita && anterior && !anterior.marcas.length;
                          const seguinteFeita = feitas[x.k + 1]?.marcas.length > 0;
                          const ocupado = salvando === `${g.chave}|${x.e.id}`;
                          const jaMarquei = !!(quem && m[x.e.id]?.[quem.id]);
                          const parcial = !feita && x.k === 0 && porReserva(g) ? estadoReservas(g) : null;
                          const tocar = () => {
                            if (!feita) return alternar(g, x.e);
                            if (seguinteFeita) return window.alert(`Desfaça ${aEtapa(x.k + 1)} antes.`);
                            return desfazerEtapa(g, x.e);
                          };
                          return (
                            <div key={x.e.id} className="atd-botao-wrap">
                              <button
                                type="button"
                                className={`atd-botao is-${tom(x.k)} ${feita ? "is-feito" : travada ? "is-travado" : "is-livre"}`}
                                onClick={tocar}
                                disabled={!quem || ocupado || travada}
                                aria-pressed={feita}
                                title={
                                  travada
                                    ? `Libera depois ${daEtapa(anterior.k)}`
                                    : feita
                                      ? `Tocar para desfazer ${aEtapa(x.k)}`
                                      : x.e.acao || x.e.nome
                                }
                              >
                                <span className="atd-botao__ic">
                                  {ocupado ? (
                                    <Icon name="loader" size={18} className="ui-spin" />
                                  ) : feita ? (
                                    <Icon name="check" size={18} />
                                  ) : (
                                    <span className="atd-botao__num">{x.k + 1}</span>
                                  )}
                                </span>
                                <span className="atd-botao__txt">
                                  <b>
                                    {feita ? x.e.nome : x.e.acao || x.e.nome}
                                    {x.k > 0 && <Icon name={icone(x.k)} size={14} className="atd-botao__tipo" />}
                                  </b>
                                  <small>
                                    {feita
                                      ? x.marcas.map((y) => `${String(y.nome || "").split(" ")[0]} ${horaDe(y.em)}`).join(" · ")
                                      : travada
                                        ? `libera depois ${daEtapa(anterior.k)}`
                                        : parcial && parcial.ativas.length
                                          ? `toque para receber todas · ${parcial.feitas}/${parcial.ativas.length}`
                                          : x.k === 0
                                            ? "toque quando receber o passageiro"
                                            : x.k === etapas.length - 1
                                              ? "toque quando o veículo sair"
                                              : "toque para marcar"}
                                  </small>
                                </span>
                                {feita && (
                                  <span className="atd-botao__desfazer" aria-hidden="true">
                                    <Icon name="undo" size={13} />
                                  </span>
                                )}
                                {travada && <Icon name="lock" size={14} className="atd-botao__cadeado" />}
                              </button>
                              {feita && !jaMarquei && !x.virtual && !(x.k === 0 && porReserva(g)) && (
                                <button type="button" className="atd-botao__eu" onClick={() => alternar(g, x.e)} disabled={!quem || ocupado}>
                                  + eu também
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                  {(() => {
                    const esp = esperaDoDoc({ marcas: m }, etapas);
                    return esp?.min !== null && esp?.min !== undefined ? (
                      <small className="atd-carro__espera">
                        <Icon name="clock" size={12} /> {textoMinutos(esp.min)} entre {etapas[0].nome.toLowerCase()} e {etapas[etapas.length - 1].nome.toLowerCase()}
                      </small>
                    ) : null;
                  })()}
                </li>
              );
            })}
          </ul>
        )}
        {grupos && grupos.length > 0 && (
          <p className="atd-rodape">
            {pl(grupos.length, "veículo", "veículos")} · {pl(totalPax, "pax", "pax")} em {nomeDoDia.toLowerCase()} · {pl(grupos.filter(completo).length, "concluído", "concluídos")}
          </p>
        )}
      </main>
    </div>
  );
};

export default AtendimentoAeroporto;
