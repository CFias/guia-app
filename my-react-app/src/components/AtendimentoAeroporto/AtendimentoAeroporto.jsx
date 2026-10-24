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

// "LITORAL NORTE" -> "Litoral Norte"
const nomeRegiao = (r) =>
  String(r || "")
    .toLowerCase()
    .replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase())
    .replace(/\b(De|Da|Do|Das|Dos|E)\b/g, (m) => m.toLowerCase());
const CHAVE_REGIAO = "atd.filtroRegiao";
const lerRegiaoSalva = () => {
  try {
    return localStorage.getItem(CHAVE_REGIAO) || "";
  } catch {
    return "";
  }
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
  const [filtro, setFiltroBruto] = useState("pendentes"); // pendentes | todos | meus
  // cards em que a pessoa mexeu agora ficam na lista (mesmo concluídos) até
  // ela trocar o filtro — o painel não "pula" embaixo do dedo
  const [fixos, setFixos] = useState(() => new Set());
  const setFiltro = (f) => {
    setFiltroBruto(f);
    setFixos(new Set());
  };
  const fixar = (chave) => setFixos((x) => (x.has(chave) ? x : new Set(x).add(chave)));
  const [busca, setBusca] = useState("");
  const [regiao, setRegiaoBruta] = useState(lerRegiaoSalva);
  const setRegiao = (r) => {
    setRegiaoBruta(r);
    try {
      if (r) localStorage.setItem(CHAVE_REGIAO, r);
      else localStorage.removeItem(CHAVE_REGIAO);
    } catch {
      /* navegador sem armazenamento: o filtro só não fica lembrado */
    }
  };
  const [abertos, setAbertos] = useState(() => new Set()); // veículos com as reservas abertas
  const alternarAberto = (chave) =>
    setAbertos((a) => {
      const n = new Set(a);
      if (n.has(chave)) n.delete(chave);
      else n.add(chave);
      return n;
    });
  const [salvando, setSalvando] = useState("");
  // "Como funciona": aparece até a pessoa tocar em "Entendi" (reabre pelo "?")
  const [guiaAberto, setGuiaAberto] = useState(() => {
    try {
      return !localStorage.getItem("atd.guiaVisto");
    } catch {
      return false;
    }
  });
  const fecharGuia = () => {
    setGuiaAberto(false);
    try {
      localStorage.setItem("atd.guiaVisto", "1");
    } catch {
      /* sem armazenamento: só não fica lembrado */
    }
  };
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

  // regiões do dia (com quantos carros cada); a escolhida só vale se existir hoje
  const regioesDoDia = useMemo(() => {
    const n = new Map();
    (grupos || []).forEach((g) => (g.regioes || []).forEach((r) => n.set(r, (n.get(r) || 0) + 1)));
    return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [grupos]);
  const regiaoAtiva = regioesDoDia.some(([r]) => r === regiao) ? regiao : "";

  // região, turno e busca valem para tudo; o status (a fazer, concluídos…) por cima
  const t = semAcento(busca.trim());
  const doRecorte = (grupos || []).filter((g) => {
    if (regiaoAtiva && !(g.regioes || []).includes(regiaoAtiva)) return false;
    if (filtroTurno === "meu" && janela && !dentro(g.min, janela.inicio, janela.fim)) return false;
    if (t && !semAcento(`${g.voos.join(" ")} ${g.veiculo} ${g.motorista} ${(g.regioes || []).join(" ")} ${g.reservas.map((r) => `${r.titular} ${r.codigo} ${r.hotel}`).join(" ")}`).includes(t)) return false;
    return true;
  });
  const meuNoVeiculo = (g) => etapas.some((e) => quem && marcasDe(g)[e.id]?.[quem.id]);
  const porStatus = {
    pendentes: (g) => !completo(g) || fixos.has(g.chave),
    concluidos: (g) => completo(g),
    todos: () => true,
    meus: (g) => meuNoVeiculo(g),
  };
  const contagem = Object.fromEntries(Object.entries(porStatus).map(([k, fn]) => [k, doRecorte.filter(fn).length]));
  const visiveis = doRecorte.filter(porStatus[filtro] || porStatus.todos);

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
    fixar(g.chave);
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

  // resumo do recorte (região + turno): concluídos, aguardando embarque, aguardando recepção
  const recebeu = (g) => Object.keys(marcasDe(g)[etapas[0]?.id] || {}).length > 0 || !!recepcaoPelasReservas(g);
  const resumo = (() => {
    const base = (grupos || []).filter((g) => (!regiaoAtiva || (g.regioes || []).includes(regiaoAtiva)) && !(filtroTurno === "meu" && janela && !dentro(g.min, janela.inicio, janela.fim)));
    const prontos = base.filter(completo);
    const noMeio = base.filter((g) => !completo(g) && recebeu(g));
    const esperando = base.length - prontos.length - noMeio.length;
    const pax = (l) => l.reduce((s2, g) => s2 + g.pax, 0);
    return { total: base.length, prontos: prontos.length, noMeio: noMeio.length, esperando, pax: pax(base), paxProntos: pax(prontos) };
  })();
  const pctDe = (n) => (resumo.total ? (n / resumo.total) * 100 : 0);

  // nomes das etapas para os textos de ajuda
  const nomeAcao = (k) => etapas[k]?.acao || etapas[k]?.nome || "";
  const ultimaK = etapas.length - 1;

  // veículos agrupados pelo horário de chegada
  const blocos = [];
  visiveis.forEach((g) => {
    const ultimo = blocos[blocos.length - 1];
    if (ultimo && ultimo.hora === (g.hora || "--:--")) ultimo.itens.push(g);
    else blocos.push({ hora: g.hora || "--:--", itens: [g] });
  });

  const STATUS = [
    ["pendentes", "A fazer", contagem.pendentes - doRecorte.filter((g) => completo(g) && fixos.has(g.chave)).length],
    ["concluidos", "Concluídos", contagem.concluidos],
    ["todos", "Todos", contagem.todos],
    ...(quem ? [["meus", "Os meus", contagem.meus]] : []),
  ];

  const renderCarro = (g) => {
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
        : prox?.k === ultimaK
          ? "Aguardando embarque"
          : `Aguardando ${(prox?.e.nome || "").toLowerCase()}`;
    const tom = (k) => (k === 0 ? "rec" : k === ultimaK ? "emb" : "meio");
    const icone = (k) => (k === 0 ? "check" : k === ultimaK ? "car" : "circleCheck");
    const aEtapa = (k) => (k === 0 ? "a recepção" : k === ultimaK ? "o embarque" : etapas[k].nome.toLowerCase());
    const feitasOk = feitas.filter((x) => x.marcas.length);
    const ultima = feitasOk[feitasOk.length - 1] || null;
    const ocupadoEm = (x) => salvando === `${g.chave}|${x.e.id}`;
    const parcial = prox && prox.k === 0 && porReserva(g) ? estadoReservas(g) : null;
    const instrucao = !prox
      ? ""
      : parcial && parcial.ativas.length
        ? `recebe todas as reservas · ${parcial.feitas} de ${parcial.ativas.length} já recebidas`
        : prox.k === 0
          ? "toque quando receber o passageiro"
          : prox.k === ultimaK
            ? "toque quando o veículo sair"
            : "toque para marcar";
    const jaMarqueiUltima = !!(ultima && quem && m[ultima.e.id]?.[quem.id]);
    const doc = docDe(g);
    const nNoShow = doc ? g.reservas.filter((r, i) => noShowDaReserva(doc, r, i)).length : 0;
    const esp = esperaDoDoc({ marcas: m }, etapas);
    const aberto = abertos.has(g.chave);

    return (
      <li key={g.chave} className={`atd-carro is-${situacao}`}>
        {/* 1. situação e passageiros */}
        <div className="atd-carro__cab">
          <span className={`atd-status is-${situacao}`}>
            <i aria-hidden="true" /> {rotuloSituacao}
          </span>
          <span className="atd-carro__pax" title={`${g.pax} passageiro(s)`}>
            <Icon name="users" size={14} /> {g.pax} <small>pax</small>
          </span>
        </div>

        {/* 2. veículo e motorista */}
        <div className="atd-carro__veiculo">
          <span className="atd-carro__veic-ic" aria-hidden="true">
            <Icon name="car" size={16} />
          </span>
          {g.veiculo ? (
            <span className="atd-carro__veic-txt">
              <b>{g.veiculo}</b>
              {g.motorista && <small>{g.motorista}</small>}
            </span>
          ) : (
            <span className="atd-carro__veic-txt">
              <em>Ainda sem veículo na escala</em>
            </span>
          )}
        </div>

        {/* 3. voo e região */}
        <div className="atd-carro__meta">
          {(g.voos.length ? g.voos : ["Sem voo"]).map((v) => (
            <span key={v} className="atd-tag is-voo">
              <Icon name="planeLanding" size={12} /> {v}
              {g.voos.length > 0 && (
                <button type="button" className="atd-tag__lupa" onClick={() => buscarVooNoGoogle(v)} title={`Ver o status do voo ${v} no Google`} aria-label={`Ver o status do voo ${v} no Google`}>
                  <Icon name="search" size={11} />
                </button>
              )}
            </span>
          ))}
          {(g.regioes || []).map((r) => (
            <span key={r} className="atd-tag">
              <Icon name="mapPin" size={11} /> {nomeRegiao(r)}
            </span>
          ))}
          {g.porVoo && (
            <span className="atd-tag is-info" title="Fornecedor com a mesma escala para voos diferentes: cada voo aparece separado, no horário dele">
              separado por voo
            </span>
          )}
        </div>
        {vinculos.get(g.chave)?.herdado && (
          <small className="atd-carro__nota">
            <Icon name="info" size={12} /> Marcado pelo voo, antes de o Phoenix escalar o veículo
          </small>
        )}

        {/* 4. reservas (abre/fecha) */}
        <button type="button" className={`atd-reservas-btn ${aberto ? "is-aberto" : ""}`} onClick={() => alternarAberto(g.chave)} aria-expanded={aberto}>
          <span className="atd-reservas-btn__nomes">
            {g.reservas
              .slice(0, 3)
              .map((r) => `${r.titular || r.codigo}${r.pax > 1 ? ` (${r.pax})` : ""}`)
              .join(" · ")}
            {g.reservas.length > 3 ? ` · +${g.reservas.length - 3}` : ""}
          </span>
          <span className="atd-reservas-btn__acao">
            {nNoShow > 0 && <em className="atd-mini is-aviso">{nNoShow} no show</em>}
            {porReserva(g) &&
              (() => {
                const { ativas, feitas: nFeitas } = estadoReservas(g);
                return <em className={`atd-mini ${nFeitas === ativas.length && ativas.length ? "is-ok" : ""}`}>{nFeitas}/{ativas.length} recebidas</em>;
              })()}
            {aberto ? "Fechar" : `${g.reservas.length} reserva${g.reservas.length === 1 ? "" : "s"}`}
            <Icon name="chevronDown" size={14} />
          </span>
        </button>
        {aberto && (
          <ul className="atd-reservas">
            {g.reservas.map((r, i) => {
              const rec = doc ? recepcaoDaReserva(doc, r, i) : null;
              const ns = doc ? noShowDaReserva(doc, r, i) : null;
              const ocupadoR = salvando === `${g.chave}|rr|${i}`;
              const ocupadoNs = salvando === `${g.chave}|ns|${i}`;
              return (
                <li key={`${r.codigo}-${i}`} className={`${porReserva(g) ? "com-marca" : ""} ${ns ? "is-noshow" : ""} ${rec ? "is-recebida" : ""}`}>
                  {porReserva(g) && (
                    <button
                      type="button"
                      className={`atd-reservas__marca ${rec ? "is-ok" : ""}`}
                      onClick={() => alternarReserva(g, r, i)}
                      disabled={!quem || ocupadoR || !!ns}
                      aria-pressed={!!rec}
                      title={ns ? "No show" : rec ? `${rec.nome} ${horaDe(rec.em)} — tocar para desmarcar` : `Marcar só esta reserva como ${etapaRecepcao.nome.toLowerCase()}`}
                    >
                      <Icon name={ocupadoR ? "loader" : rec ? "check" : ns ? "x" : "circle"} size={16} className={ocupadoR ? "ui-spin" : undefined} />
                    </button>
                  )}
                  <div className="atd-reservas__corpo">
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
                    {!ns && rec ? (
                      <small className="atd-reservas__recebida">
                        <Icon name="circleCheck" size={12} /> {etapaRecepcao?.nome || "Recepcionada"} · {rec.nome} {horaDe(rec.em)}
                      </small>
                    ) : ns ? (
                      <div className={`atd-noshow is-${ns.tipo}`}>
                        <Icon name="alert" size={13} />
                        <span>
                          <b>{ns.tipo === "com_custo" ? "No show com custo" : "No show sem custo"}</b>
                          <small>
                            {ns.porNome || "—"}
                            {ns.em?.toDate ? ` · ${ns.em.toDate().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}
                          </small>
                        </span>
                        <button type="button" onClick={() => informarNoShow(g, r, i, null)} disabled={!quem || ocupadoNs}>
                          Desfazer
                        </button>
                        <RelatoNoShow reserva={{ ...ns, ...r }} tipo={ns.tipo} />
                      </div>
                    ) : (
                      <div className="atd-noshow-btns">
                        <span>Passageiro não apareceu?</span>
                        {TIPOS_NO_SHOW.map((tp) => (
                          <button key={tp.id} type="button" onClick={() => informarNoShow(g, r, i, tp.id)} disabled={!quem || ocupadoNs}>
                            {ocupadoNs ? <Icon name="loader" size={12} className="ui-spin" /> : null} No show {tp.curto.toLowerCase()}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* 5. etapas: o que já foi feito (passos) e o próximo toque */}
        <div className="atd-acao">
          {etapas.length > 0 && (
            <ol className="atd-passos" aria-label="Etapas do atendimento">
              {feitas.map((x) => {
                const ok = x.marcas.length > 0;
                const atual = prox && x.k === prox.k;
                return (
                  <li key={x.e.id} className={`is-${tom(x.k)} ${ok ? "is-ok" : atual ? "is-atual" : ""}`}>
                    <span className="atd-passos__ic">{ok ? <Icon name={icone(x.k)} size={12} /> : x.k + 1}</span>
                    <span className="atd-passos__txt">
                      <b>{x.e.nome}</b>
                      <small>{ok ? x.marcas.map((y) => `${String(y.nome || "").split(" ")[0]} ${horaDe(y.em)}`).join(" · ") : atual ? "agora" : "depois"}</small>
                    </span>
                    {x === ultima && (
                      <span className="atd-passos__acoes">
                        {!jaMarqueiUltima && !x.virtual && !(x.k === 0 && porReserva(g)) && (
                          <button type="button" onClick={() => alternar(g, x.e)} disabled={!quem || !!salvando} title={`Também participei d${aEtapa(x.k).startsWith("a ") ? "a" : "o"} ${aEtapa(x.k).slice(2)}`}>
                            + eu
                          </button>
                        )}
                        <button type="button" onClick={() => desfazerEtapa(g, x.e)} disabled={!quem || !!salvando} title={`Desfazer ${aEtapa(x.k)}`} aria-label={`Desfazer ${aEtapa(x.k)}`}>
                          {ocupadoEm(x) ? <Icon name="loader" size={12} className="ui-spin" /> : <Icon name="undo" size={12} />}
                        </button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          {prox ? (
            <button type="button" className={`atd-botao is-${tom(prox.k)}`} onClick={() => alternar(g, prox.e)} disabled={!quem || ocupadoEm(prox)} title={prox.e.acao || prox.e.nome}>
              <span className="atd-botao__ic">{ocupadoEm(prox) ? <Icon name="loader" size={16} className="ui-spin" /> : <Icon name={icone(prox.k)} size={16} />}</span>
              <span className="atd-botao__txt">
                <b>{prox.e.acao || prox.e.nome}</b>
                <small>{instrucao}</small>
              </span>
              <span className="atd-botao__passo">
                passo {prox.k + 1} de {etapas.length}
              </span>
            </button>
          ) : (
            <div className="atd-concluido">
              <Icon name="circleCheck" size={16} /> Atendimento concluído
              {esp?.min !== null && esp?.min !== undefined && <small>· espera de {textoMinutos(esp.min)}</small>}
            </div>
          )}
        </div>
      </li>
    );
  };

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

      {/* ===== topo fixo: quem, dia ===== */}
      <header className="atd-topo">
        <div className="atd-topo__linha">
          <span className="atd-topo__icone">
            <Icon name="planeLanding" size={18} />
          </span>
          <div className="atd-topo__titulo">
            <strong>Atendimento no aeroporto</strong>
            <small>{eu ? `${eu.nome}${meuTurno ? ` · ${meuTurno.turno.nome} ${janela.inicio}–${janela.fim}` : eu.turnoId ? " · folga neste dia" : ehOperacional ? " · conta do Operacional" : " · ainda sem turno na escala"}` : "Entrando…"}</small>
          </div>
          <span className="atd-topo__acoes">
            <button type="button" className={`atd-btn-leve ${guiaAberto ? "is-on" : ""}`} onClick={() => setGuiaAberto((x) => !x)} title="Como funciona" aria-label="Como funciona" aria-pressed={guiaAberto}>
              <Icon name="help" size={15} />
            </button>
            <AvaliacaoSistema variante="botao" className="atd-btn-leve atd-avaliar" />
            {ehOperacional && (
              <button type="button" className={`atd-btn-leve ${som ? "is-on" : ""}`} onClick={alternarSom} aria-pressed={som} title={som ? "Desligar o som das marcações" : "Ligar o som das marcações"}>
                <Icon name="bell" size={15} />
              </button>
            )}
            {ehOperacional && (
              <Link to="/recepcao-turnos" className="atd-btn-leve" title="Relatório do atendimento">
                <Icon name="barChart" size={15} /> <span className="atd-btn-txt">Relatório</span>
              </Link>
            )}
            {ehOperacional && (
              <Link to="/" className="atd-btn-leve" title="Voltar para o sistema">
                <Icon name="chevronLeft" size={15} /> <span className="atd-btn-txt">Sistema</span>
              </Link>
            )}
            {!ehOperacional && (
              <Link to="/atendimento/sobre" className="atd-btn-leve" title="Sobre a FiaSystem" aria-label="Sobre">
                <Icon name="info" size={15} />
              </Link>
            )}
            <Link to="/atendimento/tema" className="atd-btn-leve" title="Tema, cor e tamanho do texto" aria-label="Tema">
              <Icon name="palette" size={15} />
            </Link>
            <button type="button" className="atd-btn-leve" onClick={logout} title="Sair" aria-label="Sair">
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
      </header>

      <main className="atd-corpo">
        {/* ===== como funciona (uma vez; reabre pelo "?") ===== */}
        {guiaAberto && etapas.length > 0 && (
          <section className="atd-guia" aria-label="Como funciona">
            <div className="atd-guia__cab">
              <b>Como funciona</b>
              <button type="button" onClick={fecharGuia}>
                Entendi
              </button>
            </div>
            <ol>
              {etapas.map((e, k) => (
                <li key={e.id} className={`is-${k === 0 ? "rec" : k === ultimaK ? "emb" : "meio"}`}>
                  <span>{k + 1}</span>
                  <p>
                    Toque em <b>{nomeAcao(k)}</b> {k === 0 ? "quando receber o passageiro no desembarque." : k === ultimaK ? "quando o veículo sair com os passageiros." : "quando fizer essa etapa."}
                  </p>
                </li>
              ))}
              <li className="is-ok">
                <span>
                  <Icon name="check" size={12} />
                </span>
                <p>
                  Pronto: o veículo sai de <b>A fazer</b> e vai para <b>Concluídos</b>. Errou? Toque em <Icon name="undo" size={11} /> para desfazer.
                </p>
              </li>
            </ol>
            <small>
              Veículo com várias reservas: abra as reservas para receber uma por vez ou informar <b>no show</b>.
            </small>
          </section>
        )}

        {/* ===== o dia em números ===== */}
        {grupos && grupos.length > 0 && (
          <section className="atd-resumo" aria-label="Resumo do dia">
            <div className="atd-resumo__topo">
              <span>
                <b>
                  {nomeDoDia}
                  {regiaoAtiva ? ` · ${nomeRegiao(regiaoAtiva)}` : ""}
                </b>
                <small>
                  {pl(resumo.total, "veículo", "veículos")} · {pl(resumo.pax, "passageiro", "passageiros")}
                </small>
              </span>
              <span className="atd-resumo__pct tabular">
                {num(pctDe(resumo.prontos), 0)}%<small>concluído</small>
              </span>
            </div>
            <div className="atd-resumo__barra" aria-hidden="true">
              <span className="is-feito" style={{ width: `${pctDe(resumo.prontos)}%` }} />
              <span className="is-andamento" style={{ width: `${pctDe(resumo.noMeio)}%` }} />
            </div>
            <div className="atd-resumo__legenda">
              <button type="button" className="is-pendente" onClick={() => setFiltro("pendentes")}>
                <i /> <b className="tabular">{resumo.esperando}</b> aguardando recepção
              </button>
              {etapas.length > 1 && (
                <button type="button" className="is-andamento" onClick={() => setFiltro("pendentes")}>
                  <i /> <b className="tabular">{resumo.noMeio}</b> aguardando embarque
                </button>
              )}
              <button type="button" className="is-feito" onClick={() => setFiltro("concluidos")}>
                <i /> <b className="tabular">{resumo.prontos}</b> concluído{resumo.prontos === 1 ? "" : "s"}
              </button>
            </div>
            {quem && meus && (
              <div className="atd-resumo__eu">
                <Icon name="user" size={13} /> Você:{" "}
                {etapas.map((e, k) => (
                  <span key={e.id}>
                    {k > 0 && " · "}
                    <b className="tabular">{num(meus.etapas?.[e.id]?.pax || 0, 1)}</b> pax {e.nome.toLowerCase()}
                  </span>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ===== filtros ===== */}
        <div className="atd-filtros">
          <label className="atd-busca">
            <Icon name="search" size={15} />
            <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Voo, passageiro, reserva ou veículo" />
          </label>
          <div className="atd-abas" role="tablist" aria-label="Situação">
            {STATUS.map(([v, r, n]) => (
              <button key={v} type="button" role="tab" aria-selected={filtro === v} className={filtro === v ? "is-on" : ""} onClick={() => setFiltro(v)}>
                {r} <small className="tabular">{n}</small>
              </button>
            ))}
          </div>
          {(janela || regioesDoDia.length > 1) && (
            <div className="atd-chips" role="group" aria-label="Recorte">
              {janela && (
                <>
                  <button type="button" className={filtroTurno === "meu" ? "is-on" : ""} onClick={() => setFiltroTurno("meu")}>
                    <Icon name="clock" size={12} /> Meu turno
                  </button>
                  <button type="button" className={filtroTurno === "todos" ? "is-on" : ""} onClick={() => setFiltroTurno("todos")}>
                    Dia todo
                  </button>
                  {regioesDoDia.length > 1 && <i aria-hidden="true" />}
                </>
              )}
              {regioesDoDia.length > 1 && (
                <>
                  <button type="button" className={!regiaoAtiva ? "is-on" : ""} onClick={() => setRegiao("")}>
                    <Icon name="mapPin" size={12} /> Todas as regiões
                  </button>
                  {regioesDoDia.map(([r, n]) => (
                    <button key={r} type="button" className={regiaoAtiva === r ? "is-on" : ""} onClick={() => setRegiao(regiaoAtiva === r ? "" : r)}>
                      {nomeRegiao(r)} <small>{n}</small>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* ===== lista ===== */}
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
          <div className="atd-vazio">
            <Icon name="circleCheck" size={22} />
            <b>
              {grupos.length === 0
                ? `Nenhuma chegada ${nomeDoDia === "Hoje" ? "hoje" : `em ${nomeDoDia.toLowerCase()}`}.`
                : filtro === "pendentes" && !t
                  ? "Tudo em dia por aqui."
                  : "Nenhum veículo com esse filtro."}
            </b>
            {grupos.length > 0 && filtro === "pendentes" && !t && <span>Os veículos atendidos estão em Concluídos.</span>}
          </div>
        ) : (
          <div className="atd-blocos">
            {blocos.map((bl) => (
              <section key={`${bl.hora}-${bl.itens[0].chave}`} className="atd-bloco">
                <h3 className="atd-bloco__cab">
                  <span className="atd-bloco__hora tabular">{bl.hora}</span>
                  <span className="atd-bloco__info">
                    {pl(bl.itens.length, "veículo", "veículos")} · {pl(bl.itens.reduce((s2, g) => s2 + g.pax, 0), "pax", "pax")}
                    {(() => {
                      const voos = [...new Set(bl.itens.flatMap((g) => g.voos))];
                      return voos.length ? ` · ${voos.slice(0, 3).join(", ")}${voos.length > 3 ? "…" : ""}` : "";
                    })()}
                  </span>
                </h3>
                <ul className="atd-lista">{bl.itens.map(renderCarro)}</ul>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default AtendimentoAeroporto;
