import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Icon from "../ui/Icon";
import MoreMenu from "../ui/MoreMenu";
import CartaoInstalar from "../ui/CartaoInstalar";
import { useInstalarApp } from "../../Services/Services/instalarApp";
import { useAuth } from "../../Context/AuthContext";
import { ROLES } from "../../Context/permissions";
import { definirTituloAba } from "../Shell/tituloAba";
import { dataBr, isoLocal, somarDias } from "../../Services/Services/relatorioTurnos";
import {
  NOME_TIPO_SERVICO,
  estadoLiberacao,
  ouvirConfigPainel,
  salvarLinkMotorista,
  linkGravadoDoMotorista,
  textoAbertura,
  buscarServicosBrutos,
  servicosDoFornecedor,
  servicosGuardados,
  carregarFornecedor,
  definirMotorista,
  formatarTelefone,
  ouvirEscalaMotoristas,
  ouvirMotoristas,
  ouvirVinculos,
  salvarMotorista,
} from "../../Services/Services/fornecedorPainel";
import {
  assinaturaServicos,
  baseAtual,
  gravarInscricaoNasEscalas,
  gravarMotoristaApp,
  gravarMotoristaDia,
  horaDoTimestamp,
  inscreverPush,
  lembrarLinkDoApp,
  linkDoMotorista,
  migrarEtapas,
  novoToken,
  ouvirMotoristaDia,
  paradasDoServico,
  paxDetalhado,
  registrarServiceWorker,
  servicoParaMotorista,
  situacaoDoServico,
} from "../../Services/Services/viagemMotorista";
import MotoristaDia from "../MotoristaDia/MotoristaDia";
import { aeroportoDaBase, hoteisParaOrdenar, ordenarHoteisDoServico, pontosDosHoteis } from "../../Services/Services/ordemHoteis";
import AvaliacaoSistema from "../Atividade/AvaliacaoSistema";
import { useTheme } from "../../Context/ThemeContext";
import "./fornecedor.css";

/* PAINEL DO FORNECEDOR PARCEIRO (celular primeiro).
   O fornecedor vê os serviços dos veículos dele, carro a carro, e escolhe o
   motorista de cada serviço. A Luck vê a escolha na hora, no Painel do dia.
   REGRA: escolher motorista NÃO é obrigatório. Serviço sem motorista escolhido
   é do próprio fornecedor ("Eu mesmo") — ele recebe tudo na aba Minha viagem
   (aviso de passageiro recepcionado, Cheguei · Iniciar · Finalizar), igual ao
   link do motorista. Fornecedor sem motorista cadastrado só usa Minha viagem.
   O Operacional abre o mesmo painel em /ver-como-fornecedor/:id (e pode
   escolher motoristas pelo fornecedor). */

const hoje = () => isoLocal(new Date());
const ATUALIZAR_A_CADA = 5 * 60 * 1000;
const CHAVE_GUIA = "pf.guiaVisto";
// "motorista" do serviço que fica com o próprio fornecedor (sem motorista escolhido)
const EU_MESMO = "__proprio";

const tomDoTipo = (t) => ({ IN: "in", OUT: "out", TRF: "trf", PASSEIO: "passeio" })[t] || "trf";
const iconeDoTipo = (t) => ({ IN: "planeLanding", OUT: "planeTakeoff", PASSEIO: "compass" })[t] || "car";
const nomeDia = (d) => (d === hoje() ? "Hoje" : d === somarDias(hoje(), 1) ? "Amanhã" : ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][new Date(`${d}T12:00:00`).getDay()]);

const lerGuiaVisto = () => {
  try {
    return !!localStorage.getItem(CHAVE_GUIA);
  } catch {
    return true;
  }
};

/* folha para cadastrar um motorista rápido (sem sair do carro) */
const NovoMotorista = ({ aoSalvar, aoFechar, salvando }) => {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  return (
    <div className="pf-folha" role="dialog" aria-modal="true" aria-label="Cadastrar motorista">
      <button type="button" className="pf-folha__fundo" onClick={aoFechar} aria-label="Fechar" />
      <form
        className="pf-folha__caixa"
        onSubmit={(e) => {
          e.preventDefault();
          if (nome.trim()) aoSalvar({ nome, telefone });
        }}
      >
        <b>Novo motorista</b>
        <label>
          <span>Nome</span>
          <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Como a equipe chama" maxLength={80} />
        </label>
        <label>
          <span>WhatsApp (opcional)</span>
          <input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(71) 99999-9999" inputMode="tel" />
        </label>
        <div className="pf-folha__acoes">
          <button type="button" className="pf-btn" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="pf-btn is-primario" disabled={!nome.trim() || salvando}>
            {salvando ? "Salvando…" : "Salvar e escolher"}
          </button>
        </div>
      </form>
    </div>
  );
};

const PainelFornecedor = () => {
  const { perfil, role, logout } = useAuth();
  const { theme, toggleTheme } = useTheme() || {};
  const { fornecedorId: idDaRota } = useParams();
  const previa = !!idDaRota && role === ROLES.OPERACIONAL;
  const fornecedorId = previa ? idDaRota : perfil?.fornecedorId || "";

  const [data, setData] = useState(hoje);
  const [aba, setAba] = useState(null); // null = escolhe sozinho (Minha viagem para quem dirige)
  const [fornecedor, setFornecedor] = useState(undefined); // undefined = carregando, null = não achou
  const [vinculos, setVinculos] = useState({});
  const [motoristas, setMotoristas] = useState([]);
  const [escala, setEscala] = useState({ data: "", servicos: {}, links: {} });
  const [config, setConfig] = useState(null);
  const [agora, setAgora] = useState(() => new Date());
  const [viagens, setViagens] = useState({}); // token → doc do link do motorista (etapas)
  const viagensRef = useRef({});
  useEffect(() => {
    viagensRef.current = viagens;
  }, [viagens]);
  // serviços do dia (todos, do Phoenix); o filtro pelos carros do fornecedor é feito na tela
  const [carga, setCarga] = useState(() => {
    const guardados = servicosGuardados(hoje());
    return guardados ? { chave: `${hoje()}|cache`, servicos: guardados, erro: "" } : { chave: "", servicos: [], erro: "" };
  });
  const [recarregar, setRecarregar] = useState(0);
  const [salvando, setSalvando] = useState("");
  const [abertos, setAbertos] = useState(() => new Set());
  const [novoPara, setNovoPara] = useState(null); // { servicos } esperando um motorista novo
  const [guiaAberto, setGuiaAberto] = useState(() => !lerGuiaVisto());
  const [pedidoAvaliacao, setPedidoAvaliacao] = useState(0);
  const app = useInstalarApp();
  const navigate = useNavigate();
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    definirTituloAba("Painel do fornecedor");
  }, []);

  // cadastro do fornecedor (veículos) e vínculos veículo → fornecedor
  useEffect(() => {
    if (!fornecedorId) return undefined;
    let vivo = true;
    carregarFornecedor(fornecedorId)
      .then((f) => vivo && setFornecedor(f))
      .catch((e) => {
        console.error(e);
        if (vivo) setFornecedor(null);
      });
    const parar = ouvirVinculos((v) => vivo && setVinculos(v || {}));
    return () => {
      vivo = false;
      parar?.();
    };
  }, [fornecedorId]);

  useEffect(() => (fornecedorId ? ouvirMotoristas(fornecedorId, setMotoristas) : undefined), [fornecedorId]);
  useEffect(() => (fornecedorId ? ouvirEscalaMotoristas(data, fornecedorId, (e) => setEscala({ data, ...e })) : undefined), [data, fornecedorId]);
  // a escala (com os links de cada motorista) DESTE dia já chegou do banco?
  // Antes disso, nenhum link novo é criado — senão, ao trocar de dia, o painel
  // achava que não havia link e criava outro vazio ("zerava" as etapas).
  const escalaDoDiaLida = escala.data === data;
  useEffect(() => ouvirConfigPainel(setConfig), []);
  // relógio do cadeado (abre sozinho na hora configurada)
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  const liberacao = (d) => (config ? estadoLiberacao(d, config, agora) : { liberado: d === hoje(), abreEm: null });
  const liberado = liberacao(data).liberado;

  // serviços do dia (Phoenix): UMA busca por dia/atualização, já no início (não
  // espera o cadastro nem os vínculos); o último resultado fica guardado e
  // aparece na hora na próxima vez
  const chaveCarga = `${data}|${recarregar}`;
  useEffect(() => {
    if (!fornecedorId || !liberado) return undefined;
    let vivo = true;
    const guardados = servicosGuardados(data);
    if (guardados) setCarga((c) => (c.chave.startsWith(`${data}|`) ? c : { chave: `${data}|cache`, servicos: guardados, erro: "" }));
    buscarServicosBrutos(data)
      .then((servicos) => vivo && setCarga({ chave: chaveCarga, servicos, erro: "" }))
      .catch((e) => {
        console.error(e);
        if (vivo) setCarga((c) => (c.chave.startsWith(`${data}|`) ? { ...c, chave: chaveCarga, erro: c.servicos.length ? "" : "Não foi possível buscar os serviços agora. Toque em Atualizar." } : { chave: chaveCarga, servicos: [], erro: "Não foi possível buscar os serviços agora. Toque em Atualizar." }));
      });
    return () => {
      vivo = false;
    };
  }, [chaveCarga, data, fornecedorId, liberado]);
  useEffect(() => {
    const t = setInterval(() => setRecarregar((x) => x + 1), ATUALIZAR_A_CADA);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!aviso) return undefined;
    const t = setTimeout(() => setAviso(""), 3200);
    return () => clearTimeout(t);
  }, [aviso]);

  // carregando = ainda sem nada deste dia (ao atualizar, a lista atual continua na tela)
  const temDoDia = carga.chave.startsWith(`${data}|`);
  const carregando = !temDoDia || !fornecedor;
  const atualizando = temDoDia && carga.chave !== chaveCarga;
  const servicosDoDiaBrutos = temDoDia ? carga.servicos : null;
  const veiculos = useMemo(
    () => (servicosDoDiaBrutos && fornecedor ? servicosDoFornecedor(servicosDoDiaBrutos, fornecedor, vinculos) : []),
    [servicosDoDiaBrutos, fornecedor, vinculos],
  );
  const motoristaPorId = useMemo(() => Object.fromEntries(motoristas.map((m) => [m.id, m])), [motoristas]);
  const motoristaPorIdRef = useRef(motoristaPorId);
  useEffect(() => {
    motoristaPorIdRef.current = motoristaPorId;
  }, [motoristaPorId]);
  const escolhas = escala.data === data ? escala.servicos : {};
  const links = escala.data === data ? escala.links || {} : {};

  // ---- ordem dos hotéis (escala com 2+ hotéis), a partir do aeroporto ----
  // cada hotel é localizado uma vez (fica guardado) — ver ordemHoteis.js
  const [geo, setGeo] = useState({ pontos: {}, aeroporto: null });
  const nomesHoteis = useMemo(
    () => [...new Set(hoteisParaOrdenar(veiculos.flatMap((v) => v.servicos.map(servicoParaMotorista))))].sort().join("|"),
    [veiculos],
  );
  useEffect(() => {
    if (!nomesHoteis) return undefined;
    let vivo = true;
    Promise.all([pontosDosHoteis(nomesHoteis.split("|")), aeroportoDaBase()])
      .then(([pontos, aeroporto]) => vivo && setGeo({ pontos, aeroporto }))
      .catch((e) => console.error("Ordem dos hotéis:", e));
    return () => {
      vivo = false;
    };
  }, [nomesHoteis]);

  // ---- link do dia de cada motorista ----
  // os serviços de cada motorista no dia (para o link dele), com os hotéis na ordem da viagem
  const porMotorista = useMemo(() => {
    const m = {};
    veiculos.forEach((v) =>
      v.servicos.forEach((s) => {
        const id = escolhas[s.chave]?.motoristaId || EU_MESMO;
        (m[id] = m[id] || []).push(ordenarHoteisDoServico(servicoParaMotorista(s), geo.pontos, geo.aeroporto));
      }),
    );
    Object.values(m).forEach((l) => l.sort((a, b) => String(a.hora).localeCompare(String(b.hora))));
    return m;
  }, [veiculos, escolhas, geo]);

  const euMesmo = useMemo(
    () =>
      fornecedor
        ? {
            id: EU_MESMO,
            // o próprio fornecedor dirige: o nome da pessoa da conta (ex.: Clóvis), não o da empresa
            nome: (!previa && perfil?.nome) || fornecedor.nome || "Fornecedor",
            telefone: String(fornecedor.whatsapp || "").replace(/\D/g, ""),
          }
        : null,
    [fornecedor, perfil?.nome, previa],
  );
  const dadosDoLink = (mot, servicos) => ({
    base: baseAtual(),
    data,
    fornecedorId: fornecedor.id,
    fornecedorNome: fornecedor.nome || "",
    motoristaId: mot.id,
    motoristaNome: mot.nome || "",
    motoristaTelefone: mot.telefone || "",
    minutosAntesCheguei: config?.minutosAntesCheguei ?? 60,
    servicos,
  });

  // Serviço que já teve etapa marcada NÃO sai do link do motorista (mesmo que a
  // Luck troque o veículo no Phoenix): a viagem feita fica registrada.
  // Escala refeita no Phoenix (número novo, mesma viagem): as etapas passam para
  // o serviço novo (migrarEtapas) e o antigo não fica repetido na tela.
  const viagensLidas = Object.keys(viagens).sort().join("|");
  const comHistorico = (token, servicos) => {
    const anterior = token ? viagensRef.current[token] : null;
    if (!anterior) return servicos;
    const { migradas } = migrarEtapas(anterior.servicos || [], anterior.eventos || {}, servicos);
    const ficam = (anterior.servicos || []).filter(
      (sv) => !migradas.has(sv.chave) && !servicos.some((x) => x.chave === sv.chave) && Object.keys(anterior.eventos?.[sv.chave] || {}).length > 0,
    );
    return ficam.length ? [...servicos, ...ficam].sort((a, b) => String(a.hora).localeCompare(String(b.hora))) : servicos;
  };
  const etapasMigradas = (token, servicos) => {
    const anterior = token ? viagensRef.current[token] : null;
    return anterior ? migrarEtapas(anterior.servicos || [], anterior.eventos || {}, servicos).eventos : {};
  };

  // cria (ou atualiza) o link do dia do motorista; para os motoristas, o link
  // enviado é o FIXO do app (/m/<tokenApp>), que acha o dia sozinho
  const prepararLink = async (mot) => {
    // confere no banco antes de criar: se já existe link do dia, reaproveita
    const atual = links[mot.id] || (await linkGravadoDoMotorista(data, fornecedor.id, mot.id));
    const token = atual?.token || novoToken();
    const servicos = comHistorico(atual?.token, porMotorista[mot.id] || []);
    const migradas = etapasMigradas(atual?.token, servicos);
    await gravarMotoristaDia(token, {
      ...dadosDoLink(mot, servicos),
      ...(Object.keys(migradas).length ? { eventos: migradas } : {}),
      ...(atual?.token ? {} : { criadoEm: new Date() }),
    });
    await salvarLinkMotorista(data, fornecedor, mot.id, { token, assinatura: assinaturaServicos(servicos) });
    if (mot.id === EU_MESMO) return linkDoMotorista(token);
    let tokenApp = mot.tokenApp;
    if (!tokenApp) {
      tokenApp = novoToken();
      await salvarMotorista(fornecedor.id, { ...mot, tokenApp });
    }
    await gravarMotoristaApp(
      tokenApp,
      { base: baseAtual(), fornecedorId: fornecedor.id, fornecedorNome: fornecedor.nome || "", motoristaId: mot.id, motoristaNome: mot.nome || "" },
      data,
      token,
    );
    return linkDoMotorista(tokenApp);
  };
  // o link do próprio fornecedor: devolve o token (cria na hora, se ainda não existe)
  const tokenEuMesmo = async () => links[EU_MESMO]?.token || (await prepararLink(euMesmo)).split("/m/")[1];

  // a escala mudou (troca de motorista, horário, reserva nova): o link de quem já recebeu acompanha
  useEffect(() => {
    if (!fornecedor || !liberado || carga.chave !== chaveCarga || !escalaDoDiaLida) return;
    Object.entries(links).forEach(([motId, l]) => {
      const mot = motId === EU_MESMO ? euMesmo : motoristaPorIdRef.current[motId];
      if (!l?.token || !mot) return;
      const servicos = comHistorico(l.token, porMotorista[motId] || []);
      const assinatura = assinaturaServicos(servicos);
      const migradas = etapasMigradas(l.token, servicos);
      // nada mudou e não há etapa para passar para uma escala refeita
      if (assinatura === l.assinatura && !Object.keys(migradas).length) return;
      gravarMotoristaDia(l.token, { ...dadosDoLink(mot, servicos), ...(Object.keys(migradas).length ? { eventos: migradas } : {}) })
        .then(() => salvarLinkMotorista(data, fornecedor, motId, { token: l.token, assinatura }))
        .catch((e) => console.error("Não foi possível atualizar o link do motorista:", e));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // viagensLidas: quando o link chega do banco, confere se há etapas para migrar
  }, [porMotorista, links, liberado, carga.chave, escalaDoDiaLida, viagensLidas]);

  // Links criados sozinhos, sem precisar reenviar: o do próprio fornecedor
  // ("Eu mesmo") e o dia de cada motorista que já tem o app (link fixo).
  const meusServicos = porMotorista[EU_MESMO] || [];

  // App no celular do fornecedor: instalável e com o aviso de "passageiros
  // recepcionados" mesmo fora da aba Minha viagem (ou usando outro app).
  useEffect(() => {
    if (previa) return;
    registrarServiceWorker();
    lembrarLinkDoApp(`${window.location.origin}/fornecedor`);
  }, [previa]);
  const minhasChegadas = meusServicos
    .filter((s) => s.tipo === "IN" && s.escalaId)
    .map((s) => s.escalaId)
    .join("|");
  useEffect(() => {
    if (previa || !minhasChegadas || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    inscreverPush().then((sub) => sub && gravarInscricaoNasEscalas(sub, baseAtual(), data, minhasChegadas.split("|")));
  }, [previa, minhasChegadas, data]);
  const criandoLinks = useRef(new Set());
  useEffect(() => {
    if (!fornecedor || !liberado || carga.chave !== chaveCarga || !escalaDoDiaLida) return;
    Object.keys(porMotorista).forEach((motId) => {
      const mot = motId === EU_MESMO ? euMesmo : motoristaPorIdRef.current[motId];
      if (!mot || (motId !== EU_MESMO && !mot.tokenApp)) return;
      const chave = `${data}|${motId}`;
      if (links[motId]?.token || criandoLinks.current.has(chave)) return;
      criandoLinks.current.add(chave);
      prepararLink(mot).catch((e) => {
        console.error("Não foi possível criar o link do dia:", e);
        criandoLinks.current.delete(chave);
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [porMotorista, links, liberado, carga.chave, data, escalaDoDiaLida]);

  // etapas que os motoristas já marcaram (para mostrar aqui também)
  const tokensDoDia = Object.values(links)
    .map((l) => l?.token)
    .filter(Boolean)
    .sort()
    .join("|");
  useEffect(() => {
    if (!tokensDoDia) return undefined;
    const paradas = tokensDoDia.split("|").map((t) => ouvirMotoristaDia(t, (v) => setViagens((x) => ({ ...x, [t]: v }))));
    return () => paradas.forEach((p) => p?.());
  }, [tokensDoDia]);
  const eventosDoServico = (chave, motoristaId) => {
    const t = links[motoristaId]?.token;
    return t ? viagens[t]?.eventos?.[chave] || null : null;
  };
  // Serviço com etapa marcada (posicionado / em viagem / finalizado) fica preso
  // a quem começou: não dá mais para trocar o motorista.
  const travaDoServico = (s) => {
    const motId = escolhas[s.chave]?.motoristaId || EU_MESMO;
    const ev = eventosDoServico(s.chave, motId);
    const st = ev ? situacaoDoServico(s.tipo, ev) : null;
    if (!st?.ultima) return null;
    return { motId, nome: motId === EU_MESMO ? "Você" : escolhas[s.chave]?.motoristaNome || "Motorista", etapa: st.ultima, em: ev[st.ultima.id]?.em, concluido: st.concluido };
  };
  const ativos = motoristas.filter((m) => m.ativo !== false);
  const temMotoristas = ativos.length > 0;
  // aba: quem não tem motorista começa em Minha viagem
  const abaAtual = aba || (temMotoristas ? "servicos" : "viagem");

  const totalServicos = veiculos.reduce((s, v) => s + v.servicos.length, 0);
  const comMotorista = veiculos.reduce((s, v) => s + v.servicos.filter((x) => escolhas[x.chave]?.motoristaId).length, 0);
  const comigo = totalServicos - comMotorista;

  const escolher = useCallback(
    async (servicos, motorista, rotulo) => {
      if (!fornecedor) return;
      setSalvando(rotulo);
      try {
        await definirMotorista(data, fornecedor, servicos, motorista);
        setAviso(motorista ? `${motorista.nome} escolhido · a Luck já vê no painel` : "Motorista retirado");
      } catch (e) {
        console.error(e);
        window.alert("Não foi possível salvar. Confira a internet e tente de novo.");
      } finally {
        setSalvando("");
      }
    },
    [data, fornecedor],
  );

  const aoEscolherNoSelect = (valor, servicos, rotulo) => {
    if (valor === "__novo") {
      setNovoPara({ servicos, rotulo });
      return;
    }
    escolher(servicos, valor ? motoristaPorId[valor] : null, rotulo);
  };

  const cadastrarEEscolher = async ({ nome, telefone }) => {
    setSalvando("novo");
    try {
      const id = await salvarMotorista(fornecedorId, { nome, telefone });
      const m = { id, nome: nome.trim(), telefone: String(telefone || "").replace(/\D/g, "") };
      if (novoPara?.servicos?.length) await definirMotorista(data, fornecedor, novoPara.servicos, m);
      setAviso(`${m.nome} cadastrado${novoPara?.servicos?.length ? " e escolhido" : ""}`);
      setNovoPara(null);
    } catch (e) {
      console.error(e);
      window.alert("Não foi possível cadastrar o motorista.");
    } finally {
      setSalvando("");
    }
  };

  const fecharGuia = () => {
    setGuiaAberto(false);
    try {
      localStorage.setItem(CHAVE_GUIA, "1");
    } catch {
      /* sem armazenamento: só não fica lembrado */
    }
  };

  const alternarAberto = (k) =>
    setAbertos((a) => {
      const n = new Set(a);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const seletorMotorista = ({ valor, servicos, rotulo, rotuloVazio = "Eu mesmo dirijo" }) => (
    <label className={`pf-sel ${valor ? "is-outro" : ""}`}>
      <span className="pf-sel__avatar" aria-hidden="true">
        {valor === "__misto" ? <Icon name="users" size={13} /> : valor ? String(motoristaPorId[valor]?.nome || "?").trim().charAt(0).toUpperCase() : <Icon name="user" size={13} />}
      </span>
      <select value={valor || ""} onChange={(e) => aoEscolherNoSelect(e.target.value, servicos, rotulo)} disabled={!!salvando} aria-label="Quem dirige">
        {valor === "__misto" && (
          <option value="__misto" disabled>
            Vários motoristas
          </option>
        )}
        <option value="">{rotuloVazio}</option>
        {ativos.map((m) => (
          <option key={m.id} value={m.id}>
            {m.nome}
          </option>
        ))}
        {valor && valor !== "__misto" && !ativos.some((m) => m.id === valor) && <option value={valor}>{motoristaPorId[valor]?.nome || "Motorista desativado"}</option>}
        <option value="__novo">+ Cadastrar motorista…</option>
      </select>
      {salvando === rotulo ? <Icon name="loader" size={14} className="ui-spin" /> : <Icon name="chevronDown" size={14} />}
    </label>
  );

  /* ---------------- sem vínculo ---------------- */
  if (!fornecedorId || fornecedor === null) {
    return (
      <div className="pf pf--bloqueado">
        <div className="pf-bloqueio">
          <Icon name="truck" size={28} />
          <b>{fornecedorId ? "Fornecedor não encontrado" : "Conta sem fornecedor vinculado"}</b>
          <span>Fale com a Luck para ligar esta conta ao cadastro do seu fornecedor.</span>
          {previa ? (
            <Link to="/" className="pf-btn">
              Voltar para o sistema
            </Link>
          ) : (
            <button type="button" className="pf-btn" onClick={logout}>
              Sair
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="pf">
      {previa && (
        <div className="pf-previa" role="status">
          <Icon name="eye" size={14} /> Você está vendo como <b>{fornecedor?.nome || "o fornecedor"}</b> vê. O motorista que você escolher aqui vale de verdade.
          <Link to="/">Voltar</Link>
        </div>
      )}

      <header className="pf-topo">
        <div className="pf-topo__linha">
          <span className="pf-topo__icone">
            <Icon name="truck" size={18} />
          </span>
          <div className="pf-topo__titulo">
            <strong>{fornecedor?.nome || "Carregando…"}</strong>
            <small>Painel do fornecedor · Luck Receptivo</small>
          </div>
          <span className="pf-topo__acoes">
            {toggleTheme && (
              <button
                type="button"
                className="pf-icone"
                onClick={toggleTheme}
                title={theme === "light" ? "Tema escuro" : "Tema claro"}
                aria-label={theme === "light" ? "Usar tema escuro" : "Usar tema claro"}
              >
                <Icon name={theme === "light" ? "moon" : "sun"} size={16} />
              </button>
            )}
            <MoreMenu
              label="Menu"
              items={[
                { label: guiaAberto ? "Esconder o guia" : "Como funciona", icon: "help", onClick: () => setGuiaAberto((x) => !x) },
                !previa && app.temBotao && { label: "Instalar o app", icon: "download", onClick: app.instalar },
                !previa && { label: "Avaliar o sistema", icon: "star", onClick: () => setPedidoAvaliacao((n) => n + 1) },
                !previa && { label: "Cores e tamanho do texto", icon: "palette", onClick: () => navigate("/fornecedor/tema") },
                !previa && "divider",
                !previa && { label: "Sair", icon: "logout", danger: true, onClick: logout },
              ]}
            />
            {!previa && <AvaliacaoSistema variante="oculto" pedido={pedidoAvaliacao} />}
          </span>
        </div>
        <div className="pf-dias" role="tablist" aria-label="Dia">
          {[hoje(), somarDias(hoje(), 1), somarDias(hoje(), 2)].map((d) => (
            <button key={d} type="button" role="tab" aria-selected={d === data} className={`${d === data ? "is-on" : ""} ${liberacao(d).liberado ? "" : "is-bloqueado"}`} onClick={() => setData(d)}>
              {!liberacao(d).liberado && <Icon name="lock" size={12} />}
              {nomeDia(d)} <small>{dataBr(d).slice(0, 5)}</small>
            </button>
          ))}
        </div>
      </header>

      <main className="pf-corpo">
        {!previa && <CartaoInstalar chave="fornecedor.instalarAdiado" />}
        {guiaAberto && (
          <section className="pf-guia" aria-label="Como funciona">
            <div className="pf-guia__cab">
              <b>Como funciona</b>
              <button type="button" onClick={fecharGuia}>
                Entendi
              </button>
            </div>
            <ol>
              <li>
                <span>1</span>
                <p>
                  Na aba <b>Minha viagem</b> você recebe o aviso quando a Luck recepcionar seus passageiros e marca <b>Cheguei · Iniciar viagem · Finalizar</b>.
                </p>
              </li>
              <li>
                <span>2</span>
                <p>
                  Tem motoristas? Cadastre na aba <b>Motoristas</b> e escolha quem faz cada serviço — é opcional. O que você não passar para ninguém fica com
                  você.
                </p>
              </li>
              <li>
                <span>
                  <Icon name="check" size={12} />
                </span>
                <p>Cada motorista recebe o link do dia dele pelo WhatsApp. A Luck acompanha tudo no painel de monitoramento.</p>
              </li>
            </ol>
            <small>A prévia e a ordem de serviço continuam chegando pelo WhatsApp, como sempre.</small>
          </section>
        )}

        <div className="pf-abas" role="tablist" aria-label="Seções">
          <button type="button" role="tab" aria-selected={abaAtual === "viagem"} className={abaAtual === "viagem" ? "is-on" : ""} onClick={() => setAba("viagem")}>
            <span className="pf-abas__ic">
              <Icon name="navigation" size={14} />
              {liberado && meusServicos.length > 0 && <small>{meusServicos.length}</small>}
            </span>
            Minha viagem
          </button>
          <button type="button" role="tab" aria-selected={abaAtual === "servicos"} className={abaAtual === "servicos" ? "is-on" : ""} onClick={() => setAba("servicos")}>
            <span className="pf-abas__ic">
              <Icon name="car" size={14} />
              {liberado && <small>{totalServicos}</small>}
            </span>
            Carros
          </button>
          <button type="button" role="tab" aria-selected={abaAtual === "motoristas"} className={abaAtual === "motoristas" ? "is-on" : ""} onClick={() => setAba("motoristas")}>
            <span className="pf-abas__ic">
              <Icon name="users" size={14} />
              <small>{ativos.length}</small>
            </span>
            Motoristas
          </button>
        </div>

        {abaAtual !== "motoristas" && !liberado ? (
          <section className="pf-cadeado" aria-live="polite">
            <span className="pf-cadeado__ic">
              <Icon name="lock" size={26} />
            </span>
            <b>
              Serviços de {nomeDia(data).toLowerCase()} ({dataBr(data).slice(0, 5)}) ainda fechados
            </b>
            <p>
              A Luck ainda está ajustando a programação. Os serviços ficam disponíveis {textoAbertura(liberacao(data).abreEm, agora)} — aí você vê os
              carros e escolhe os motoristas.
            </p>
            <small>A prévia pelo WhatsApp continua chegando normalmente.</small>
          </section>
        ) : abaAtual === "viagem" ? (
          fornecedor === undefined || carregando ? (
            <div className="pf-vazio">
              <Icon name="loader" size={20} className="ui-spin" /> Buscando os serviços de {nomeDia(data).toLowerCase()}…
            </div>
          ) : !meusServicos.length ? (
            <div className="pf-vazio">
              <Icon name="navigation" size={22} />
              <b>{totalServicos ? "Todos os serviços estão com os seus motoristas." : `Nenhum serviço nos seus carros ${data === hoje() ? "hoje" : `em ${dataBr(data).slice(0, 5)}`}.`}</b>
              <span>{totalServicos ? "Acompanhe as etapas deles na aba Carros." : "Os serviços aparecem aqui quando a Luck escala seus veículos."}</span>
            </div>
          ) : (
            // abre na hora com os serviços já carregados; o link é só para gravar as etapas
            <MotoristaDia token={links[EU_MESMO]?.token || ""} embutido diaLocal={dadosDoLink(euMesmo, comHistorico(links[EU_MESMO]?.token, meusServicos))} garantirToken={tokenEuMesmo} />
          )
        ) : abaAtual === "servicos" ? (
          <>
            {/* resumo */}
            {!carregando && !carga.erro && veiculos.length > 0 && (
              <section className="pf-resumo">
                <div className="pf-resumo__topo">
                  <span>
                    <b>
                      {veiculos.length} carro{veiculos.length === 1 ? "" : "s"} · {totalServicos} serviço{totalServicos === 1 ? "" : "s"}
                    </b>
                    <small>
                      {nomeDia(data)}, {dataBr(data)}
                    </small>
                  </span>
                </div>
                <div className="pf-resumo__nums">
                  <span>
                    <i className="is-eu" /> <b className="tabular">{comigo}</b> com você
                  </span>
                  <span>
                    <i className="is-mot" /> <b className="tabular">{comMotorista}</b> com seus motoristas
                  </span>
                </div>
                {!temMotoristas && (
                  <button type="button" className="pf-resumo__dica" onClick={() => setAba("motoristas")}>
                    <Icon name="info" size={13} /> Você dirige todos os serviços. Tem motoristas? Cadastre para dividir
                    <Icon name="chevronRight" size={13} />
                  </button>
                )}
              </section>
            )}

            <div className="pf-barra">
              <span>{atualizando ? "Atualizando com o Phoenix…" : !carregando ? "Serviços do Phoenix · atualiza sozinho a cada 5 min" : ""}</span>
              <button type="button" className="pf-btn is-leve" onClick={() => setRecarregar((x) => x + 1)} disabled={carregando || atualizando}>
                <Icon name="refresh" size={14} className={carregando || atualizando ? "ui-spin" : undefined} /> Atualizar
              </button>
            </div>

            {!carregando && Object.keys(porMotorista).some((k) => k !== EU_MESMO) && (
              <section className="pf-links">
                <div className="pf-links__cab">
                  <b>
                    <Icon name="send" size={14} /> App dos motoristas
                  </b>
                  <small>Envie uma vez: o link é o mesmo todo dia e os serviços de cada dia entram sozinhos. O motorista instala no celular e recebe o aviso de passageiro recepcionado mesmo com a tela apagada.</small>
                </div>
                <ul>
                  {Object.entries(porMotorista)
                    .filter(([motId]) => motId !== EU_MESMO)
                    .map(([motId, servs]) => {
                    const mot = motoristaPorId[motId] || { id: motId, nome: servs[0]?.motoristaNome || "Motorista" };
                    const enviado = !!links[motId]?.token;
                    const ev = viagens[links[motId]?.token]?.eventos || {};
                    const feitos = servs.filter((x) => situacaoDoServico(x.tipo, ev[x.chave]).concluido).length;
                    return (
                      <li key={motId}>
                        <span className="pf-mot__avatar" aria-hidden="true">
                          {String(mot.nome || "?").trim().charAt(0).toUpperCase()}
                        </span>
                        <span className="pf-links__txt">
                          <b>{mot.nome}</b>
                          <small>
                            {servs.length} serviço{servs.length === 1 ? "" : "s"}
                            {mot.tokenApp ? ` · tem o app · ${feitos}/${servs.length} finalizado(s)` : enviado ? ` · link enviado · ${feitos}/${servs.length} finalizado(s)` : " · app ainda não enviado"}
                          </small>
                        </span>
                        <span className="pf-links__acoes">
                          <button
                            type="button"
                            className="pf-icone"
                            title="Copiar o link"
                            aria-label={`Copiar o link de ${mot.nome}`}
                            disabled={!!salvando}
                            onClick={async () => {
                              setSalvando(`link|${motId}`);
                              try {
                                const url = await prepararLink(mot);
                                await navigator.clipboard.writeText(url).catch(() => window.prompt("Copie o link:", url));
                                setAviso("Link copiado");
                              } catch (e) {
                                console.error(e);
                                window.alert("Não foi possível gerar o link.");
                              } finally {
                                setSalvando("");
                              }
                            }}
                          >
                            <Icon name="copy" size={14} />
                          </button>
                          <button
                            type="button"
                            className={`pf-btn ${enviado ? "" : "is-primario"}`}
                            disabled={!!salvando}
                            onClick={async () => {
                              // abre a janela já no clique (o navegador bloqueia se abrir depois)
                              const janela = window.open("", "_blank");
                              setSalvando(`link|${motId}`);
                              try {
                                const url = await prepararLink(mot);
                                const texto =
                                  `Olá, ${String(mot.nome || "").split(" ")[0]}! Este é o seu app de serviços da ${fornecedor?.nome || ""} · Luck Receptivo — o link é o mesmo todo dia:\n${url}\n\n` +
                                  "1) Abra no celular e toque em Instalar (ou, no iPhone, Compartilhar → Adicionar à Tela de Início).\n" +
                                  "2) Toque em Ativar os avisos e permita as notificações e a localização.\n" +
                                  "Avisamos quando o passageiro for recepcionado, mesmo com o celular bloqueado. Em cada serviço, toque em Cheguei, Iniciar viagem e Finalizar.";
                                const wa = mot.telefone ? `https://wa.me/55${mot.telefone}?text=${encodeURIComponent(texto)}` : `https://wa.me/?text=${encodeURIComponent(texto)}`;
                                if (janela) janela.location.href = wa;
                                else window.open(wa, "_blank");
                              } catch (e) {
                                console.error(e);
                                janela?.close();
                                window.alert("Não foi possível gerar o link.");
                              } finally {
                                setSalvando("");
                              }
                            }}
                          >
                            {salvando === `link|${motId}` ? <Icon name="loader" size={14} className="ui-spin" /> : <Icon name="message" size={14} />}
                            {mot.tokenApp || enviado ? "Reenviar" : "Enviar no WhatsApp"}
                          </button>
                        </span>
                      </li>
                    );
                    })}
                </ul>
              </section>
            )}

            {fornecedor === undefined || carregando ? (
              <div className="pf-vazio">
                <Icon name="loader" size={20} className="ui-spin" /> Buscando os serviços de {nomeDia(data).toLowerCase()}…
              </div>
            ) : carga.erro ? (
              <div className="pf-vazio">
                <Icon name="alert" size={20} /> {carga.erro}
              </div>
            ) : veiculos.length === 0 ? (
              <div className="pf-vazio">
                <Icon name="car" size={22} />
                <b>Nenhum serviço nos seus carros {data === hoje() ? "hoje" : `em ${dataBr(data).slice(0, 5)}`}.</b>
                <span>Os serviços aparecem aqui quando a Luck escala seus veículos.</span>
              </div>
            ) : (
              <ul className="pf-carros">
                {veiculos.map((v) => {
                  const ids = v.servicos.map((s) => escolhas[s.chave]?.motoristaId || "");
                  const meus = ids.filter((x) => !x).length;
                  const todosIguais = ids.every((x) => x && x === ids[0]) ? ids[0] : "";
                  const pax = v.servicos.reduce((s, x) => s + (x.pax || 0), 0);
                  return (
                    <li key={v.chave} className="pf-carro">
                      <div className="pf-carro__cab">
                        <span className="pf-carro__ic">
                          <Icon name="car" size={17} />
                        </span>
                        <span className="pf-carro__nome">
                          <b>{v.veiculo}</b>
                          <small>
                            {v.placa ? `${v.placa} · ` : ""}
                            {v.servicos.length} serviço{v.servicos.length === 1 ? "" : "s"} · {pax} pax
                          </small>
                        </span>
                        <span className={`pf-pill ${meus === ids.length ? "is-eu" : meus ? "is-misto" : "is-mot"}`}>
                          {meus === ids.length ? "Com você" : meus ? `${ids.length - meus} com motorista` : todosIguais ? motoristaPorId[todosIguais]?.nome || "Motorista" : "Com motoristas"}
                        </span>
                      </div>

                      {temMotoristas && v.servicos.filter((x) => !travaDoServico(x)).length > 1 && (
                        <div className="pf-carro__todos">
                          <span>Quem dirige o carro todo</span>
                          {seletorMotorista({ valor: todosIguais || (meus === ids.length ? "" : "__misto"), servicos: v.servicos.filter((x) => !travaDoServico(x)), rotulo: `carro|${v.chave}` })}
                        </div>
                      )}

                      <ol className="pf-servicos">
                        {v.servicos.map((s) => {
                          const esc = escolhas[s.chave];
                          const aberto = abertos.has(s.chave);
                          const voos = [...new Set((s.reservasLista || []).map((r) => r.voo).filter(Boolean))];
                          return (
                            <li key={s.chave} className={`pf-serv is-${tomDoTipo(s.tipo)}`}>
                              <div className="pf-serv__linha">
                                <span className="pf-serv__hora tabular">{s.hora || "--:--"}</span>
                                <div className="pf-serv__info">
                                  <span className="pf-serv__tipo">
                                    <Icon name={iconeDoTipo(s.tipo)} size={12} /> {NOME_TIPO_SERVICO[s.tipo] || s.tipo}
                                    {voos.length > 0 && <em>{voos.join(", ")}</em>}
                                  </span>
                                  <b className="pf-serv__desc">{s.descricao}</b>
                                  {(() => {
                                    // 2+ hotéis: a ordem da viagem, a partir do aeroporto
                                    const sm = ordenarHoteisDoServico(servicoParaMotorista(s), geo.pontos, geo.aeroporto);
                                    const hoteis = s.tipo === "IN" ? sm.destinos : s.tipo === "OUT" ? sm.origens : [];
                                    if (!hoteis || hoteis.length < 2) return null;
                                    return (
                                      <ol className="pf-serv__ordem" aria-label="Ordem sugerida dos hotéis">
                                        <li className="is-titulo">Ordem sugerida · o motorista marca cada hotel na ordem em que chegar</li>
                                        {hoteis.map((h, i) => (
                                          <li key={h}>
                                            <i>{i + 1}</i>
                                            {h}
                                            {sm.kmHoteis?.[h] !== undefined && <small> · {sm.kmHoteis[h]} km do aeroporto</small>}
                                          </li>
                                        ))}
                                        {sm.ordemHoteis !== "auto" && (
                                          <li className="is-aviso">{sm.ordemHoteis === "parcial"
                                              ? "Algum hotel não foi achado no mapa: ficou no fim."
                                              : sm.ordemHoteis === "sem"
                                                ? "Hotéis não achados no mapa: ordem do Phoenix."
                                                : "Calculando a ordem pelo mapa…"}</li>
                                        )}
                                      </ol>
                                    );
                                  })()}
                                  <span className="pf-serv__meta">
                                    <Icon name="users" size={12} /> {s.pax} pax
                                    {(s.reservasLista || []).length > 0 && (
                                      <button type="button" onClick={() => alternarAberto(s.chave)} aria-expanded={aberto}>
                                        {aberto ? "Fechar" : `${s.reservasLista.length} reserva${s.reservasLista.length === 1 ? "" : "s"}`}
                                        <Icon name="chevronDown" size={12} />
                                      </button>
                                    )}
                                  </span>
                                </div>
                              </div>
                              {aberto && (
                                <ul className="pf-serv__reservas">
                                  {s.reservasLista.map((r, i) => (
                                    <li key={`${r.codigo}-${i}`}>
                                      <div className="pf-res__linha">
                                        <b>{r.titular || "Passageiro sem nome no sistema"}</b>
                                        <span className="pf-res__pax" title="Adultos / crianças / bebês">
                                          {paxDetalhado(r)}
                                        </span>
                                      </div>
                                      <span>
                                        {r.codigo ? `Reserva ${r.codigo}` : "Reserva sem código"}
                                        {r.voo ? ` · voo ${r.voo}${r.horaVoo ? ` ${r.horaVoo}` : ""}` : ""}
                                      </span>
                                      <small>
                                        {r.origem || "—"} → {r.destino || "—"}
                                      </small>
                                      {r.obs && <p className="pf-res__obs">{r.obs}</p>}
                                    </li>
                                  ))}
                                </ul>
                              )}
                              {(() => {
                                const ev = eventosDoServico(s.chave, esc?.motoristaId || EU_MESMO);
                                if (!ev) return null;
                                const st = situacaoDoServico(s.tipo, ev);
                                if (!st.ultima) return null;
                                // mais de um hotel: quantas paradas já foram feitas
                                const paradas = paradasDoServico(servicoParaMotorista(s));
                                const feitas = paradas.filter((p) => ev[p.id]?.em).length;
                                return (
                                  <span className={`pf-serv__etapa ${st.concluido ? "is-ok" : ""}`}>
                                    <Icon name={st.concluido ? "circleCheck" : "navigation"} size={12} /> {ev[st.ultima.id]?.porta ? `Porta ${ev[st.ultima.id].porta}` : st.ultima.feito} · {horaDoTimestamp(ev[st.ultima.id]?.em)}
                                    {paradas.length > 0 && !st.concluido && ` · ${feitas} de ${paradas.length} hotéis`}
                                  </span>
                                );
                              })()}
                              {temMotoristas && travaDoServico(s) ? (
                                <span className="pf-serv__trava" title="Depois que a viagem começa, o motorista não muda">
                                  <Icon name="lock" size={12} /> {travaDoServico(s).nome} · {travaDoServico(s).concluido ? "viagem finalizada" : "viagem em andamento"}
                                </span>
                              ) : temMotoristas && (
                              <div className="pf-serv__motorista">
                                {seletorMotorista({ valor: esc?.motoristaId || "", servicos: [s], rotulo: `serv|${s.chave}` })}
                                {esc?.motoristaTelefone && (
                                  <a className="pf-icone" href={`https://wa.me/55${esc.motoristaTelefone}`} target="_blank" rel="noopener noreferrer" title={`WhatsApp de ${esc.motoristaNome}`} aria-label={`WhatsApp de ${esc.motoristaNome}`}>
                                    <Icon name="message" size={15} />
                                  </a>
                                )}
                              </div>
                              )}
                            </li>
                          );
                        })}
                      </ol>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        ) : (
          <Motoristas fornecedorId={fornecedorId} motoristas={motoristas} />
        )}
      </main>

      {novoPara && <NovoMotorista aoSalvar={cadastrarEEscolher} aoFechar={() => setNovoPara(null)} salvando={salvando === "novo"} />}
      {aviso && (
        <div className="pf-toast" role="status" aria-live="polite">
          <Icon name="circleCheck" size={15} /> {aviso}
        </div>
      )}
    </div>
  );
};

/* ---------------- aba Motoristas ---------------- */
const Motoristas = ({ fornecedorId, motoristas }) => {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [editando, setEditando] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const salvar = async (dados) => {
    setSalvando(true);
    try {
      await salvarMotorista(fornecedorId, dados);
      return true;
    } catch (e) {
      console.error(e);
      window.alert("Não foi possível salvar o motorista.");
      return false;
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="pf-mot">
      <form
        className="pf-mot__novo"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!nome.trim()) return;
          if (await salvar({ nome, telefone })) {
            setNome("");
            setTelefone("");
          }
        }}
      >
        <b>Cadastrar motorista</b>
        <div className="pf-mot__campos">
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome" aria-label="Nome do motorista" maxLength={80} />
          <input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="WhatsApp (opcional)" aria-label="WhatsApp do motorista" inputMode="tel" />
          <button type="submit" className="pf-btn is-primario" disabled={!nome.trim() || salvando}>
            <Icon name="plus" size={14} /> Adicionar
          </button>
        </div>
        <small>Na próxima etapa, cada motorista vai poder entrar com o próprio acesso para ver os serviços dele.</small>
      </form>

      {motoristas.length === 0 ? (
        <div className="pf-vazio">
          <Icon name="users" size={22} />
          <b>Nenhum motorista cadastrado.</b>
          <span>Cadastre acima — depois é só escolher em cada serviço.</span>
        </div>
      ) : (
        <ul className="pf-mot__lista">
          {motoristas.map((m) =>
            editando?.id === m.id ? (
              <li key={m.id} className="is-editando">
                <input value={editando.nome} onChange={(e) => setEditando((x) => ({ ...x, nome: e.target.value }))} aria-label="Nome" maxLength={80} />
                <input value={editando.telefone} onChange={(e) => setEditando((x) => ({ ...x, telefone: e.target.value }))} aria-label="WhatsApp" inputMode="tel" />
                <span className="pf-mot__acoes">
                  <button type="button" className="pf-btn" onClick={() => setEditando(null)}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="pf-btn is-primario"
                    disabled={!editando.nome.trim() || salvando}
                    onClick={async () => (await salvar(editando)) && setEditando(null)}
                  >
                    Salvar
                  </button>
                </span>
              </li>
            ) : (
              <li key={m.id} className={m.ativo === false ? "is-inativo" : ""}>
                <span className="pf-mot__avatar" aria-hidden="true">
                  {String(m.nome || "?").trim().charAt(0).toUpperCase()}
                </span>
                <span className="pf-mot__txt">
                  <b>{m.nome}</b>
                  <small>{m.telefone ? formatarTelefone(m.telefone) : "sem WhatsApp"}{m.ativo === false ? " · desativado" : ""}</small>
                </span>
                <span className="pf-mot__acoes">
                  <button type="button" className="pf-icone" onClick={() => setEditando({ ...m, telefone: m.telefone || "" })} title="Editar" aria-label={`Editar ${m.nome}`}>
                    <Icon name="pencil" size={14} />
                  </button>
                  <button
                    type="button"
                    className="pf-btn is-leve"
                    onClick={() => salvar({ ...m, ativo: m.ativo === false })}
                    disabled={salvando}
                  >
                    {m.ativo === false ? "Reativar" : "Desativar"}
                  </button>
                </span>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
};

export default PainelFornecedor;
