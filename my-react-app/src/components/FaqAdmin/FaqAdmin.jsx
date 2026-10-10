import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  doc,
  Timestamp,
} from "firebase/firestore";
import { db } from "../../Services/Services/firebase";
import CardSkeleton from "../../components/CardSkeleton/CardSkeleton";
import "./styles.css";
import "./lista.css";
import Icon from "../ui/Icon";
import { iconeMui } from "../ui/iconeMui";
import Segmented from "../ui/Segmented";
import Drawer from "../ui/Drawer";
import Button from "../ui/Button";
import PageHeader from "../ui/PageHeader";
import KpiTiles from "../ui/KpiTiles";
import { SearchInput } from "../ui/Form";
import { useToast } from "../ui/toastContext";
import AssistenteConfig from "./AssistenteConfig";
import FormularioItem from "./FormularioItem";
import {
  FORMATOS,
  obterFormato,
  obterFichaVeiculo,
  obterTabelaPrecos,
  ehConfigAssistente,
  textoPrevia,
  obterFichaEmbarcacao,
  obterFichaLocal,
  normalizarConfigAssistente,
  ASSISTENTE_DOC_ID,
  FORMATO_CONFIG_ASSISTENTE,
  NOMES_SECOES_PADRAO,
} from "../FaqComercial/catalogo";
import {
  FORMULARIO_VAZIO,
  ORDEM_CAMPOS,
  formularioDoItem,
  linhasPrecoPreenchidas,
  numeroDoCampo,
  recursosDoFormulario,
  validarFormulario,
  CATEGORIA_PADRAO,
  recursosEmbarcacaoDoFormulario,
  CONFIG_VEICULO_VAZIA,
  configPreenchida,
  nomeAutomaticoConfig,
} from "./regrasFormulario";

// ícones usados como componente (ex.: devolvidos por função)
const LuggageRounded = iconeMui("briefcase");
const DirectionsCarRounded = iconeMui("truck");
const DescriptionRounded = iconeMui("fileText");
const PaidRounded = iconeMui("coins");
const AccessTimeRounded = iconeMui("clock");
const HotelRounded = iconeMui("building");
const ChildCareRounded = iconeMui("baby");
const GavelRounded = iconeMui("scale");
const HelpRounded = iconeMui("help");
const ShipRounded = iconeMui("ship");
const PlaceRounded = iconeMui("mapPin");

const getHojeIso = () => {
  const hoje = new Date();
  const yyyy = hoje.getFullYear();
  const mm = String(hoje.getMonth() + 1).padStart(2, "0");
  const dd = String(hoje.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const formatarDataBr = (dataIso) => {
  if (!dataIso) return "";
  const [ano, mes, dia] = String(dataIso).split("-");
  return `${dia}/${mes}/${ano}`;
};

const itemEstaVencido = (item) => {
  if (!item?.validade) return false;
  return item.validade < getHojeIso();
};

// Quantos dias faltam pra vencer (negativo = já venceu).
const diasParaVencer = (item) => {
  if (!item?.validade) return null;
  const hoje = new Date(getHojeIso());
  const alvo = new Date(item.validade);
  return Math.round((alvo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
};

const itemVenceEmBreve = (item, limiteDias = 3) => {
  const dias = diasParaVencer(item);
  return dias !== null && dias >= 0 && dias <= limiteDias;
};

// "há 2 dias", "ontem", "agora mesmo"... aceita Firestore Timestamp ou
// qualquer coisa que o construtor Date entenda.
const formatarTempoRelativo = (timestamp) => {
  if (!timestamp) return "";

  const data =
    typeof timestamp?.toDate === "function"
      ? timestamp.toDate()
      : new Date(timestamp);

  if (Number.isNaN(data.getTime())) return "";

  const diffMs = Date.now() - data.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "agora mesmo";
  if (diffMin < 60) return `há ${diffMin} min`;

  const diffHoras = Math.floor(diffMin / 60);
  if (diffHoras < 24) return `há ${diffHoras}h`;

  const diffDias = Math.floor(diffHoras / 24);
  if (diffDias === 1) return "ontem";
  if (diffDias < 30) return `há ${diffDias} dias`;

  const diffMeses = Math.floor(diffDias / 30);
  if (diffMeses < 12)
    return `há ${diffMeses} ${diffMeses === 1 ? "mês" : "meses"}`;

  const diffAnos = Math.floor(diffMeses / 12);
  return `há ${diffAnos} ${diffAnos === 1 ? "ano" : "anos"}`;
};

// Suporta o campo antigo (imagemVeiculoUrl, uma imagem só) e o novo
// (imagensVeiculo, array) — assim nada quebra pros itens já cadastrados.
const obterImagensVeiculo = (item) => {
  if (Array.isArray(item?.imagensVeiculo) && item.imagensVeiculo.length) {
    return item.imagensVeiculo;
  }
  if (item?.imagemVeiculoUrl) return [item.imagemVeiculoUrl];
  return [];
};

const normalizarTexto = (texto = "") =>
  String(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

// Evita fragmentar categorias por causa de "Veiculo" vs "Veículos": se
// já existir uma categoria com o mesmo nome normalizado, reaproveita a
// grafia já usada em vez de criar uma nova variante.
const resolverCategoriaCanonica = (
  categoriaDigitada,
  categoriasExistentes = [],
) => {
  const alvo = normalizarTexto(categoriaDigitada);
  const existente = categoriasExistentes.find(
    (cat) => normalizarTexto(cat) === alvo,
  );
  return existente || String(categoriaDigitada || "").trim();
};

// Paleta fixa — a cor de cada categoria é derivada do próprio nome
// (hash simples), então a mesma categoria sempre sai com a mesma cor,
// sem ninguém precisar escolher manualmente.
const PALETA_CATEGORIAS = [
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#a855f7",
  "#06b6d4",
  "#ec4899",
  "#f97316",
];

const obterCorCategoria = (categoria = "") => {
  const texto = String(categoria || "").trim();
  if (!texto) return PALETA_CATEGORIAS[0];

  let hash = 0;
  for (let i = 0; i < texto.length; i += 1) {
    hash = texto.charCodeAt(i) + ((hash << 5) - hash);
  }

  return PALETA_CATEGORIAS[Math.abs(hash) % PALETA_CATEGORIAS.length];
};

// Ícone por palavra-chave no nome da categoria — só um reforço visual,
// cai num ícone genérico quando não reconhece nada.
const obterIconeCategoria = (categoria = "") => {
  const texto = normalizarTexto(categoria);

  if (texto.includes("bagage") || texto.includes("mala")) return LuggageRounded;
  if (
    texto.includes("veicul") ||
    texto.includes("carro") ||
    texto.includes("van") ||
    texto.includes("onibus")
  )
    return DirectionsCarRounded;
  if (texto.includes("embarca") || texto.includes("barco") || texto.includes("nautic"))
    return ShipRounded;
  if (
    texto.includes("local") ||
    texto.includes("restaurante") ||
    texto.includes("apoio")
  )
    return PlaceRounded;
  if (texto.includes("documen")) return DescriptionRounded;
  if (
    texto.includes("cotac") ||
    texto.includes("preco") ||
    texto.includes("valor") ||
    texto.includes("pagamento")
  )
    return PaidRounded;
  if (texto.includes("horari") || texto.includes("tempo"))
    return AccessTimeRounded;
  if (texto.includes("hotel") || texto.includes("hospedagem"))
    return HotelRounded;
  if (texto.includes("crianc") || texto.includes("infant"))
    return ChildCareRounded;
  if (
    texto.includes("politic") ||
    texto.includes("regra") ||
    texto.includes("cancelamento")
  )
    return GavelRounded;

  return HelpRounded;
};

const ROTULO_FORMATO = {
  [FORMATOS.RESPOSTA]: "Resposta",
  [FORMATOS.VEICULO]: "Veículo",
  [FORMATOS.TABELA]: "Valores",
  [FORMATOS.EMBARCACAO]: "Embarcação",
  [FORMATOS.LOCAL]: "Local",
};

const ICONE_FORMATO = {
  [FORMATOS.RESPOSTA]: "message",
  [FORMATOS.VEICULO]: "car",
  [FORMATOS.TABELA]: "tag",
  [FORMATOS.EMBARCACAO]: "ship",
  [FORMATOS.LOCAL]: "mapPin",
};

const tituloDoItem = (item) =>
  obterFormato(item) === FORMATOS.VEICULO
    ? item.nomeVeiculo || item.pergunta
    : item.pergunta;

// Resumo de uma linha mostrado na lista (o que o item contém).
const resumoDoItem = (item, config) => {
  const formato = obterFormato(item);
  if (formato === FORMATOS.VEICULO) {
    const ficha = obterFichaVeiculo(item, config);
    const partes = [
      ficha.tipoVeiculo,
      ficha.configuracoes.length
        ? ficha.configuracoes.map((o) => o.nome).join(" / ")
        : ficha.passageiros !== null && `${ficha.passageiros} pax`,
    ].filter(Boolean);
    const fotos = obterImagensVeiculo(item).length;
    if (fotos) partes.push(`${fotos} foto${fotos === 1 ? "" : "s"}`);
    if (!ficha.configuracoes.length) partes.push("sem configuração no assistente");
    return partes.join(" · ");
  }
  if (formato === FORMATOS.EMBARCACAO) {
    const f = obterFichaEmbarcacao(item);
    const fotos = obterImagensVeiculo(item).length;
    return [
      f.tipoEmbarcacao,
      f.capacidade && `${f.capacidade} passageiros`,
      f.roteiros,
      fotos && `${fotos} foto${fotos === 1 ? "" : "s"}`,
    ]
      .filter(Boolean)
      .join(" · ") || "Embarcação sem detalhes";
  }
  if (formato === FORMATOS.LOCAL) {
    const f = obterFichaLocal(item);
    const fotos = obterImagensVeiculo(item).length;
    return [
      f.tipoLocal,
      f.bairro || f.endereco || "sem endereço",
      f.telefone,
      fotos && `${fotos} foto${fotos === 1 ? "" : "s"}`,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (formato === FORMATOS.TABELA) {
    const linhas = obterTabelaPrecos(item);
    return linhas.length
      ? `${linhas.length} serviço${linhas.length === 1 ? "" : "s"}: ${linhas
          .slice(0, 3)
          .map((l) => l.servico)
          .join(", ")}${linhas.length > 3 ? "…" : ""}`
      : "Tabela sem serviços";
  }
  return textoPrevia(item.resposta);
};

// Veículo antigo sem configuração: traz a capacidade que estava na ficha
// para dentro do formulário (vira configuração ao salvar).
const capacidadeAntiga = (item) => {
  const ficha = obterFichaVeiculo(item);
  if (ficha.passageiros === null && ficha.malasGrandes === null && ficha.malasBordo === null) {
    return CONFIG_VEICULO_VAZIA();
  }
  return {
    ...CONFIG_VEICULO_VAZIA(),
    paxMax: ficha.passageiros ?? "",
    combinacoes: [{ grandes: ficha.malasGrandes ?? "", bordo: ficha.malasBordo ?? "" }],
  };
};

const FaqAdmin = () => {
  const { mostrarToast } = useToast();
  const [itens, setItens] = useState([]);
  const [configAssistente, setConfigAssistente] = useState(null);
  const [abaAdmin, setAbaAdmin] = useState("catalogo");
  const [loadingInicial, setLoadingInicial] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [removendoId, setRemovendoId] = useState(null);
  const [erroCarregar, setErroCarregar] = useState("");

  const [busca, setBusca] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("todas");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroFormato, setFiltroFormato] = useState("todos");
  const [ordenarPor, setOrdenarPor] = useState("categoria");

  // formulário (painel lateral)
  const [formAberto, setFormAberto] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [formulario, setFormulario] = useState(FORMULARIO_VAZIO);
  const [tentouSalvar, setTentouSalvar] = useState(false);
  const [nomesAberto, setNomesAberto] = useState(false);
  const [nomesRascunho, setNomesRascunho] = useState(NOMES_SECOES_PADRAO);
  const [salvandoNomes, setSalvandoNomes] = useState(false);
  const formOriginalRef = useRef(JSON.stringify(FORMULARIO_VAZIO));

  const carregarItens = async () => {
    try {
      const snap = await getDocs(collection(db, "faq_itens"));

      const todos = snap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));

      // a configuração do assistente fica na mesma coleção, fora da lista
      setConfigAssistente(todos.find(ehConfigAssistente) || null);

      const lista = todos
        .filter((item) => !ehConfigAssistente(item))
        .sort(
          (a, b) =>
            (a.categoria || "").localeCompare(b.categoria || "", "pt-BR", {
              sensitivity: "base",
            }) || (a.pergunta || "").localeCompare(b.pergunta || "", "pt-BR"),
        );

      setItens(lista);
      setErroCarregar("");
    } catch (err) {
      console.error("Erro ao carregar a Central de Informações:", err);
      setErroCarregar("Erro ao carregar os itens.");
    }
  };

  useEffect(() => {
    const carregar = async () => {
      setLoadingInicial(true);
      await carregarItens();
      setLoadingInicial(false);
    };

    carregar();
  }, []);

  const categoriasDisponiveis = useMemo(() => {
    const unicas = new Set(itens.map((item) => item.categoria).filter(Boolean));
    return Array.from(unicas).sort((a, b) =>
      a.localeCompare(b, "pt-BR", { sensitivity: "base" }),
    );
  }, [itens]);

  const configNormalizada = useMemo(
    () => normalizarConfigAssistente(configAssistente),
    [configAssistente],
  );

  const contagem = useMemo(() => {
    const c = {
      todos: itens.length,
      [FORMATOS.RESPOSTA]: 0,
      [FORMATOS.VEICULO]: 0,
      [FORMATOS.TABELA]: 0,
      [FORMATOS.EMBARCACAO]: 0,
      [FORMATOS.LOCAL]: 0,
      ativos: 0,
      inativos: 0,
      destaque: 0,
      vencidas: 0,
      vencendo_em_breve: 0,
    };
    itens.forEach((item) => {
      c[obterFormato(item)] += 1;
      if (item.ativo === false) c.inativos += 1;
      else c.ativos += 1;
      if (item.destaque) c.destaque += 1;
      if (itemEstaVencido(item)) c.vencidas += 1;
      else if (itemVenceEmBreve(item)) c.vencendo_em_breve += 1;
    });
    return c;
  }, [itens]);

  const itensFiltrados = useMemo(() => {
    const termo = normalizarTexto(busca);

    const filtrados = itens.filter((item) => {
      const categoriaOk =
        filtroCategoria === "todas" || item.categoria === filtroCategoria;

      const formatoOk =
        filtroFormato === "todos" || obterFormato(item) === filtroFormato;

      const statusOk =
        filtroStatus === "todos" ||
        (filtroStatus === "ativos" && item.ativo !== false) ||
        (filtroStatus === "inativos" && item.ativo === false) ||
        (filtroStatus === "destaque" && !!item.destaque) ||
        (filtroStatus === "vencidas" && itemEstaVencido(item)) ||
        (filtroStatus === "vencendo_em_breve" &&
          !itemEstaVencido(item) &&
          itemVenceEmBreve(item));

      if (!categoriaOk || !statusOk || !formatoOk) return false;
      if (!termo) return true;

      const alvo = normalizarTexto(
        [
          item.categoria,
          item.pergunta,
          item.resposta,
          item.nomeVeiculo,
          ...obterTabelaPrecos(item).map((l) => l.servico),
          obterFichaEmbarcacao(item).tipoEmbarcacao,
          obterFichaLocal(item).tipoLocal,
          obterFichaLocal(item).bairro,
          ...(Array.isArray(item.palavrasChave) ? item.palavrasChave : []),
        ]
          .filter(Boolean)
          .join(" "),
      );

      return alvo.includes(termo);
    });

    return [...filtrados].sort((a, b) => {
      if (ordenarPor === "recentes") {
        const dataA = a.atualizadoEm?.toMillis ? a.atualizadoEm.toMillis() : 0;
        const dataB = b.atualizadoEm?.toMillis ? b.atualizadoEm.toMillis() : 0;
        return dataB - dataA;
      }

      if (ordenarPor === "mais_usadas") {
        const usoA =
          Number(a.contadorCopias || 0) + Number(a.contadorVisualizacoes || 0);
        const usoB =
          Number(b.contadorCopias || 0) + Number(b.contadorVisualizacoes || 0);
        return usoB - usoA;
      }

      if (ordenarPor === "nome") {
        return (tituloDoItem(a) || "").localeCompare(tituloDoItem(b) || "", "pt-BR", {
          sensitivity: "base",
        });
      }

      return 0;
    });
  }, [itens, busca, filtroCategoria, filtroStatus, filtroFormato, ordenarPor]);

  const validacao = useMemo(() => validarFormulario(formulario), [formulario]);

  /* ---------- formulário ---------- */

  const abrirFormulario = (dados, id = null) => {
    setFormulario(dados);
    formOriginalRef.current = JSON.stringify(dados);
    setEditandoId(id);
    setTentouSalvar(false);
    setFormAberto(true);
  };

  const novoItem = (formato = FORMATOS.RESPOSTA) =>
    abrirFormulario({
      ...FORMULARIO_VAZIO,
      formato,
      categoria: CATEGORIA_PADRAO[formato] || "",
      configsVeiculo: formato === FORMATOS.VEICULO ? [CONFIG_VEICULO_VAZIA()] : [],
    });

  // nomes dos veículos que usam cada configuração (para avisar quando é compartilhada)
  const nomeVeiculoPorId = useMemo(() => {
    const mapa = {};
    itens.forEach((i) => {
      mapa[i.id] = i.nomeVeiculo || i.pergunta;
    });
    return mapa;
  }, [itens]);

  const opcoesComUso = useMemo(
    () =>
      configNormalizada.opcoes.map((o) => ({
        ...o,
        usadaPor: o.veiculosIds.map((id) => nomeVeiculoPorId[id]).filter(Boolean),
      })),
    [configNormalizada, nomeVeiculoPorId],
  );

  const configsDoVeiculo = (id) =>
    opcoesComUso
      .filter((o) => o.veiculosIds.includes(id))
      .map((o) => ({
        id: o.id,
        nome: o.nome,
        paxMax: o.paxMax || "",
        acessorio: o.acessorio,
        combinacoes: o.combinacoes.length
          ? o.combinacoes.map((x) => ({ ...x }))
          : [{ grandes: "", bordo: "" }],
        usadaPor: o.veiculosIds
          .filter((v) => v !== id)
          .map((v) => nomeVeiculoPorId[v])
          .filter(Boolean),
      }));

  const abrirEdicao = (item) => {
    const configs = configsDoVeiculo(item.id);
    abrirFormulario(
      {
        ...formularioDoItem(item),
        configsVeiculo:
          obterFormato(item) === FORMATOS.VEICULO && !configs.length
            ? [capacidadeAntiga(item)]
            : configs,
      },
      item.id,
    );
  };

  // Pré-preenche com os dados de um item existente, mas sem editandoId —
  // ao salvar, cria um item NOVO em vez de sobrescrever o original.
  const duplicarItem = (item) => {
    abrirFormulario({
      ...formularioDoItem(item, true),
      configsVeiculo: configsDoVeiculo(item.id).map((c) => ({
        ...c,
        usadaPor: [...c.usadaPor, nomeVeiculoPorId[item.id]].filter(Boolean),
      })),
    });
    mostrarToast("Cópia aberta — ajuste e salve como um item novo.");
  };

  const limparFormulario = () => {
    setFormAberto(false);
    setEditandoId(null);
    setTentouSalvar(false);
    setFormulario(FORMULARIO_VAZIO);
  };

  const fecharFormulario = () => {
    const alterado = JSON.stringify(formulario) !== formOriginalRef.current;
    if (alterado && !window.confirm("Descartar as alterações não salvas?")) return;
    limparFormulario();
  };

  const irParaCampo = (campo) => {
    const alvo = document.querySelector(`.fi [data-campo="${campo}"]`);
    if (!alvo) return;
    alvo.scrollIntoView({ behavior: "smooth", block: "center" });
    alvo.querySelector("input, textarea, select")?.focus({ preventScroll: true });
  };

  // Grava as configurações do veículo no documento do assistente:
  // atualiza as existentes, cria as novas (na posição certa, da menor para
  // a maior) e desvincula as que foram removidas do veículo.
  const salvarCapacidade = async (idVeiculo) => {
    const cfg = configNormalizada;
    let opcoes = cfg.opcoes.map((o) => ({ ...o, veiculosIds: [...o.veiculosIds] }));
    const antes = JSON.stringify(opcoes);
    const vinculadas = new Set();

    formulario.configsVeiculo.filter(configPreenchida).forEach((c) => {
      const dados = {
        nome: c.nome.trim() || nomeAutomaticoConfig(c, formulario.nomeVeiculo),
        paxMax: Math.max(0, Math.floor(Number(c.paxMax) || 0)),
        acessorio: c.acessorio || "",
        combinacoes: c.combinacoes
          .map((x) => ({
            grandes: Math.max(0, Math.floor(Number(x.grandes) || 0)),
            bordo: Math.max(0, Math.floor(Number(x.bordo) || 0)),
          }))
          .filter((x) => x.grandes > 0 || x.bordo > 0),
      };
      const existente = c.id ? opcoes.find((o) => o.id === c.id) : null;
      if (existente) {
        Object.assign(existente, dados);
        if (!existente.veiculosIds.includes(idVeiculo)) existente.veiculosIds.push(idVeiculo);
        vinculadas.add(existente.id);
        return;
      }
      const nova = {
        id: `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        grupo: formulario.tipoVeiculo.trim(),
        observacao: "",
        ativo: true,
        veiculosIds: [idVeiculo],
        ...dados,
      };
      // posição: antes da primeira opção maior (o assistente recomenda a primeira que comporta)
      const tamanho = (o) =>
        o.paxMax * 1000 + (o.combinacoes[0] ? o.combinacoes[0].grandes * 2 + o.combinacoes[0].bordo : 0);
      const pos = opcoes.findIndex((o) => tamanho(o) > tamanho(nova));
      if (pos === -1) opcoes.push(nova);
      else opcoes.splice(pos, 0, nova);
      vinculadas.add(nova.id);
    });

    opcoes = opcoes.map((o) =>
      !vinculadas.has(o.id) && o.veiculosIds.includes(idVeiculo)
        ? { ...o, veiculosIds: o.veiculosIds.filter((v) => v !== idVeiculo) }
        : o,
    );

    if (JSON.stringify(opcoes) === antes) return;

    if (configAssistente) {
      await updateDoc(doc(db, "faq_itens", configAssistente.id || ASSISTENTE_DOC_ID), {
        opcoes,
        atualizadoEm: Timestamp.now(),
      });
    } else {
      await setDoc(doc(db, "faq_itens", ASSISTENTE_DOC_ID), {
        formato: FORMATO_CONFIG_ASSISTENTE,
        ativo: false,
        pergunta: "Configuração do assistente de veículo",
        categoria: "",
        resposta: "",
        ...cfg,
        opcoes,
        atualizadoEm: Timestamp.now(),
      });
    }
  };

  const abrirNomes = () => {
    setNomesRascunho({ ...configNormalizada.nomesSecoes });
    setNomesAberto(true);
  };

  const salvarNomes = async () => {
    const nomesSecoes = Object.fromEntries(
      Object.entries(NOMES_SECOES_PADRAO).map(([chave, padrao]) => [
        chave,
        String(nomesRascunho[chave] || "").trim() || padrao,
      ]),
    );
    try {
      setSalvandoNomes(true);
      if (configAssistente) {
        await updateDoc(doc(db, "faq_itens", configAssistente.id || ASSISTENTE_DOC_ID), {
          nomesSecoes,
          atualizadoEm: Timestamp.now(),
        });
      } else {
        await setDoc(doc(db, "faq_itens", ASSISTENTE_DOC_ID), {
          formato: FORMATO_CONFIG_ASSISTENTE,
          ativo: false,
          pergunta: "Configuração do assistente de veículo",
          categoria: "",
          resposta: "",
          ...configNormalizada,
          nomesSecoes,
          atualizadoEm: Timestamp.now(),
        });
      }
      mostrarToast("Nomes das seções atualizados.");
      setNomesAberto(false);
      await carregarItens();
    } catch (err) {
      console.error("Erro ao salvar nomes das seções:", err);
      mostrarToast("Não foi possível salvar os nomes.");
    } finally {
      setSalvandoNomes(false);
    }
  };

  const salvarItem = async () => {
    const { erros } = validarFormulario(formulario);
    if (Object.keys(erros).length > 0) {
      setTentouSalvar(true);
      const primeiro =
        ORDEM_CAMPOS.find((c) => erros[c]) ||
        (Object.keys(erros).some((c) => c.startsWith("linha-")) ? "tabela" : null);
      setTimeout(() => primeiro && irParaCampo(primeiro), 50);
      return;
    }

    const formato = formulario.formato || FORMATOS.RESPOSTA;

    try {
      setSalvando(true);

      const payload = {
        categoria: resolverCategoriaCanonica(
          formulario.categoria,
          categoriasDisponiveis,
        ),
        // veículo: a descrição curta é opcional — sem ela, o título é o nome
        pergunta:
          formulario.pergunta.trim() ||
          (formato === FORMATOS.VEICULO ? formulario.nomeVeiculo.trim() : ""),
        resposta: formulario.resposta.trim(),
        palavrasChave: formulario.palavrasChave
          .split(",")
          .map((p) => normalizarTexto(p))
          .filter(Boolean),
        validade: formulario.validade || null,
        destaque: !!formulario.destaque,
        ativo: formulario.ativo !== false,
        nomeVeiculo: formulario.nomeVeiculo.trim(),
        imagensVeiculo: formulario.imagensVeiculoTexto
          .split("\n")
          .map((url) => url.trim())
          .filter(Boolean),
        linkOficialVeiculo: formulario.linkOficialVeiculo.trim(),
        veiculoForaCatalogo: !!formulario.veiculoForaCatalogo,
        formato,
        fichaVeiculo: {
          tipoVeiculo: formulario.tipoVeiculo.trim(),
          passageiros: numeroDoCampo(formulario.passageiros),
          malasGrandes: numeroDoCampo(formulario.malasGrandes),
          malasBordo: numeroDoCampo(formulario.malasBordo),
          recursos: recursosDoFormulario(formulario),
        },
        tabelaPrecos: linhasPrecoPreenchidas(formulario.tabelaPrecos),
        fichaEmbarcacao: {
          tipoEmbarcacao: formulario.tipoEmbarcacao.trim(),
          capacidade: numeroDoCampo(formulario.capacidadeEmbarcacao),
          recursos: recursosEmbarcacaoDoFormulario(formulario),
          roteiros: formulario.roteiros.trim(),
        },
        fichaLocal: {
          tipoLocal: formulario.tipoLocal.trim(),
          endereco: formulario.endereco.trim(),
          bairro: formulario.bairro.trim(),
          telefone: formulario.telefone.trim(),
          horario: formulario.horario.trim(),
          linkMapa: formulario.linkMapa.trim(),
          site: formulario.site.trim(),
        },
        atualizadoEm: Timestamp.now(),
      };

      let idSalvo = editandoId;
      if (editandoId) {
        await updateDoc(doc(db, "faq_itens", editandoId), payload);
      } else {
        const ref = await addDoc(collection(db, "faq_itens"), {
          ...payload,
          contadorVisualizacoes: 0,
          contadorCopias: 0,
          criadoEm: Timestamp.now(),
        });
        idSalvo = ref.id;
      }

      // Veículo: a capacidade (configurações) mora no Assistente de veículo.
      if (formato === FORMATOS.VEICULO && idSalvo) {
        await salvarCapacidade(idSalvo);
      }

      mostrarToast(editandoId ? "Item atualizado." : "Item cadastrado.");
      limparFormulario();
      await carregarItens();
    } catch (err) {
      console.error("Erro ao salvar item:", err);
      mostrarToast("Erro ao salvar o item. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  };

  const removerItem = async (item) => {
    const confirmar = window.confirm(
      `Remover "${tituloDoItem(item)}"? Essa ação não pode ser desfeita.`,
    );
    if (!confirmar) return;

    try {
      setRemovendoId(item.id);
      await deleteDoc(doc(db, "faq_itens", item.id));
      mostrarToast("Item removido.");
      if (editandoId === item.id) limparFormulario();
      await carregarItens();
    } catch (err) {
      console.error("Erro ao remover item:", err);
      mostrarToast("Erro ao remover o item.");
    } finally {
      setRemovendoId(null);
    }
  };

  const alternarCampo = async (item, campo) => {
    try {
      await updateDoc(doc(db, "faq_itens", item.id), {
        [campo]: !item[campo],
        atualizadoEm: Timestamp.now(),
      });
      await carregarItens();
      if (campo === "ativo") {
        mostrarToast(item.ativo === false ? "Item visível para o comercial." : "Item escondido do comercial.");
      }
    } catch (err) {
      console.error(`Erro ao atualizar ${campo}:`, err);
      mostrarToast("Não foi possível atualizar o item.");
    }
  };

  const alternarStatus = (status) =>
    setFiltroStatus((atual) => (atual === status ? "todos" : status));

  const temFiltro =
    busca.trim() ||
    filtroCategoria !== "todas" ||
    filtroStatus !== "todos" ||
    filtroFormato !== "todos";

  const limparFiltros = () => {
    setBusca("");
    setFiltroCategoria("todas");
    setFiltroStatus("todos");
    setFiltroFormato("todos");
  };

  return (
    <div className="ui-page fa">
      <PageHeader
        title="Central de Informações"
        description="Cadastre o que o comercial consulta: respostas prontas, fichas de veículo e tabelas de valores."
        more={[
          { label: "Nomes das seções", icon: "pencil", onClick: abrirNomes },
        ]}
        actions={
          abaAdmin === "catalogo" && (
            <Button variant="primary" icon="plus" onClick={() => novoItem()}>
              Novo item
            </Button>
          )
        }
      />

      <Segmented
        className="faq-admin-abas"
        options={[
          { value: "catalogo", label: "Itens", icon: "grid", count: itens.length },
          { value: "assistente", label: "Assistente de veículo", icon: "sparkles" },
        ]}
        value={abaAdmin}
        onChange={setAbaAdmin}
        ariaLabel="Seção da administração"
      />

      {abaAdmin === "assistente" ? (
        loadingInicial ? (
          <CardSkeleton variant="list" rows={4} />
        ) : (
          <AssistenteConfig
            configSalva={configAssistente}
            veiculos={itens.filter(
              (item) => obterFormato(item) === FORMATOS.VEICULO,
            )}
            onSalvo={carregarItens}
          />
        )
      ) : (
        <>
          <KpiTiles
            highlightFirst={false}
            items={[
              {
                key: "ativos",
                label: "Visíveis",
                value: contagem.ativos,
                icon: "eye",
                active: filtroStatus === "ativos",
                onClick: () => alternarStatus("ativos"),
              },
              {
                key: "destaque",
                label: "Em destaque",
                value: contagem.destaque,
                icon: "star",
                active: filtroStatus === "destaque",
                onClick: () => alternarStatus("destaque"),
              },
              {
                key: "vencendo",
                label: "Vencendo em 3 dias",
                value: contagem.vencendo_em_breve,
                icon: "calendar",
                tone: contagem.vencendo_em_breve ? "warning" : undefined,
                active: filtroStatus === "vencendo_em_breve",
                onClick: () => alternarStatus("vencendo_em_breve"),
              },
              {
                key: "vencidas",
                label: "Vencidos",
                value: contagem.vencidas,
                icon: "alert",
                tone: contagem.vencidas ? "alert" : undefined,
                active: filtroStatus === "vencidas",
                onClick: () => alternarStatus("vencidas"),
              },
              {
                key: "inativos",
                label: "Escondidos",
                value: contagem.inativos,
                icon: "eyeOff",
                active: filtroStatus === "inativos",
                onClick: () => alternarStatus("inativos"),
              },
            ]}
          />

          <div className="fa-filtros">
            <SearchInput
              className="fa-busca"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por título, conteúdo, serviço ou palavra-chave"
            />
            <Segmented
              size="sm"
              options={[
                { value: "todos", label: "Todos", count: contagem.todos },
                { value: FORMATOS.RESPOSTA, label: "Respostas", icon: "message", count: contagem[FORMATOS.RESPOSTA] },
                { value: FORMATOS.VEICULO, label: "Veículos", icon: "car", count: contagem[FORMATOS.VEICULO] },
                { value: FORMATOS.EMBARCACAO, label: "Embarcações", icon: "ship", count: contagem[FORMATOS.EMBARCACAO] },
                { value: FORMATOS.LOCAL, label: "Locais", icon: "mapPin", count: contagem[FORMATOS.LOCAL] },
                { value: FORMATOS.TABELA, label: "Valores", icon: "tag", count: contagem[FORMATOS.TABELA] },
              ]}
              value={filtroFormato}
              onChange={setFiltroFormato}
              ariaLabel="Tipo de item"
            />
            <select
              className="ui-input fa-select"
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
              aria-label="Categoria"
            >
              <option value="todas">Todas as categorias</option>
              {categoriasDisponiveis.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <select
              className="ui-input fa-select"
              value={ordenarPor}
              onChange={(e) => setOrdenarPor(e.target.value)}
              aria-label="Ordenar por"
            >
              <option value="categoria">Ordenar: categoria</option>
              <option value="nome">Ordenar: nome</option>
              <option value="recentes">Ordenar: mais recentes</option>
              <option value="mais_usadas">Ordenar: mais usados</option>
            </select>
          </div>

          {erroCarregar && <div className="faq-admin-alerta erro">{erroCarregar}</div>}

          {loadingInicial ? (
            <CardSkeleton variant="list" rows={5} />
          ) : itens.length === 0 ? (
            <div className="fa-vazio">
              <Icon name="bookOpen" size={26} />
              <strong>Nada cadastrado ainda</strong>
              <span>Comece pelo que o comercial mais pergunta.</span>
              <div className="fa-vazio-acoes">
                <Button icon="message" onClick={() => novoItem(FORMATOS.RESPOSTA)}>
                  Resposta pronta
                </Button>
                <Button icon="car" onClick={() => novoItem(FORMATOS.VEICULO)}>
                  Veículo
                </Button>
                <Button icon="tag" onClick={() => novoItem(FORMATOS.TABELA)}>
                  Tabela de valores
                </Button>
                <Button icon="ship" onClick={() => novoItem(FORMATOS.EMBARCACAO)}>
                  Embarcação
                </Button>
                <Button icon="mapPin" onClick={() => novoItem(FORMATOS.LOCAL)}>
                  Local
                </Button>
              </div>
            </div>
          ) : itensFiltrados.length === 0 ? (
            <div className="fa-vazio">
              <Icon name="search" size={24} />
              <strong>Nenhum item com esses filtros</strong>
              {temFiltro && (
                <Button variant="ghost" icon="undo" onClick={limparFiltros}>
                  Limpar filtros
                </Button>
              )}
            </div>
          ) : (
            <>
              <p className="fa-contagem">
                {itensFiltrados.length} de {itens.length} item(ns)
                {temFiltro && (
                  <button type="button" onClick={limparFiltros}>
                    limpar filtros
                  </button>
                )}
              </p>
              <ul className="fa-lista">
                {itensFiltrados.map((item) => (
                  <LinhaItem
                    config={configNormalizada}
                    key={item.id}
                    item={item}
                    removendo={removendoId === item.id}
                    onEditar={abrirEdicao}
                    onDuplicar={duplicarItem}
                    onRemover={removerItem}
                    onAlternar={alternarCampo}
                  />
                ))}
              </ul>
            </>
          )}
        </>
      )}

      <Drawer
        open={nomesAberto}
        title="Nomes das seções"
        subtitle="Como cada grupo aparece para o comercial na Central de Informações."
        onClose={() => setNomesAberto(false)}
        onSave={salvarNomes}
        saving={salvandoNomes}
        saveLabel="Salvar nomes"
      >
        <div className="fi">
          {[
            { chave: "veiculo", rotulo: "Veículos", icone: "car" },
            { chave: "embarcacao", rotulo: "Embarcações", icone: "ship" },
            { chave: "local", rotulo: "Locais", icone: "mapPin" },
            { chave: "tabela", rotulo: "Tabelas de valores", icone: "tag" },
            { chave: "resposta", rotulo: "Respostas prontas", icone: "message" },
          ].map((s) => (
            <div key={s.chave} className="fi-campo">
              <label className="fi-rotulo" htmlFor={`nome-secao-${s.chave}`}>
                <Icon name={s.icone} size={14} /> {s.rotulo}
              </label>
              <input
                id={`nome-secao-${s.chave}`}
                type="text"
                className="fi-input"
                maxLength={40}
                placeholder={NOMES_SECOES_PADRAO[s.chave]}
                value={nomesRascunho[s.chave]}
                onChange={(e) =>
                  setNomesRascunho((r) => ({ ...r, [s.chave]: e.target.value }))
                }
              />
              <span className="fi-msg">Vazio volta para “{NOMES_SECOES_PADRAO[s.chave]}”.</span>
            </div>
          ))}
        </div>
      </Drawer>

      <Drawer
        open={formAberto}
        width={760}
        title={editandoId ? "Editar item" : "Novo item"}
        subtitle={
          editandoId
            ? "As mudanças aparecem para o comercial assim que você salvar."
            : "Escolha o tipo e preencha o essencial — o resto é opcional."
        }
        onClose={fecharFormulario}
        onSave={salvarItem}
        saving={salvando}
        saveLabel={editandoId ? "Salvar alterações" : "Cadastrar item"}
      >
        {formAberto && (
          <FormularioItem
            formulario={formulario}
            setFormulario={setFormulario}
            categorias={categoriasDisponiveis}
            validacao={validacao}
            mostrarErros={tentouSalvar}
            salvando={salvando}
            onIrParaCampo={irParaCampo}
            opcoesAssistente={opcoesComUso}
            fator={configNormalizada.fatorBordoPorGrande}
          />
        )}
      </Drawer>
    </div>
  );
};

/* ---------- linha da lista ---------- */

const LinhaItem = ({ item, config, removendo, onEditar, onDuplicar, onRemover, onAlternar }) => {
  const formato = obterFormato(item);
  const cor = obterCorCategoria(item.categoria);
  const IconeCategoria = obterIconeCategoria(item.categoria);
  const capa =
    (formato === FORMATOS.VEICULO && !item.veiculoForaCatalogo) ||
    formato === FORMATOS.EMBARCACAO ||
    formato === FORMATOS.LOCAL
      ? obterImagensVeiculo(item)[0]
      : null;
  const vencida = itemEstaVencido(item);
  const venceBreve = !vencida && itemVenceEmBreve(item);
  const inativo = item.ativo === false;

  return (
    <li className={`fa-item ${inativo ? "is-inativo" : ""}`}>
      <button
        type="button"
        className="fa-item-principal"
        onClick={() => onEditar(item)}
        title="Editar"
      >
        <span className={`fa-item-capa is-${formato}`}>
          {capa ? <img src={capa} alt="" loading="lazy" /> : <Icon name={ICONE_FORMATO[formato]} size={18} />}
        </span>

        <span className="fa-item-texto">
          <span className="fa-item-titulo">{tituloDoItem(item) || "(sem título)"}</span>
          <span className="fa-item-meta">
            <span className="fa-item-categoria" style={{ "--cor-categoria": cor }}>
              <IconeCategoria fontSize="small" />
              {item.categoria || "Sem categoria"}
            </span>
            <span className="fa-item-tipo">{ROTULO_FORMATO[formato]}</span>
            <span className="fa-item-resumo">{resumoDoItem(item, config)}</span>
          </span>
        </span>

        <span className="fa-item-selos">
          {inativo && (
            <span className="fa-selo">
              <Icon name="eyeOff" size={12} />
              Escondido
            </span>
          )}
          {item.destaque && (
            <span className="fa-selo is-destaque">
              <Icon name="star" size={12} />
              Destaque
            </span>
          )}
          {item.validade && (
            <span className={`fa-selo ${vencida ? "is-alerta" : venceBreve ? "is-aviso" : ""}`}>
              <Icon name="calendar" size={12} />
              {vencida
                ? `Venceu ${formatarDataBr(item.validade)}`
                : venceBreve
                  ? `Vence em ${diasParaVencer(item)} dia(s)`
                  : `Até ${formatarDataBr(item.validade)}`}
            </span>
          )}
        </span>

        <span className="fa-item-uso" title="Visualizações · cópias pelo comercial">
          <span>
            <Icon name="eye" size={13} />
            {Number(item.contadorVisualizacoes || 0)}
          </span>
          <span>
            <Icon name="copy" size={13} />
            {Number(item.contadorCopias || 0)}
          </span>
          {item.atualizadoEm && <small>{formatarTempoRelativo(item.atualizadoEm)}</small>}
        </span>
      </button>

      <div className="fa-item-acoes">
        <button
          type="button"
          className={`fa-acao ${item.destaque ? "is-on" : ""}`}
          onClick={() => onAlternar(item, "destaque")}
          title={item.destaque ? "Tirar do destaque" : "Destacar em Mais buscadas"}
          aria-label={item.destaque ? "Tirar do destaque" : "Destacar"}
        >
          <Icon name="star" size={16} />
        </button>
        <button
          type="button"
          className="fa-acao"
          onClick={() => onAlternar(item, "ativo")}
          title={inativo ? "Mostrar para o comercial" : "Esconder do comercial"}
          aria-label={inativo ? "Mostrar para o comercial" : "Esconder do comercial"}
        >
          <Icon name={inativo ? "eyeOff" : "eye"} size={16} />
        </button>
        <button
          type="button"
          className="fa-acao"
          onClick={() => onDuplicar(item)}
          title="Duplicar"
          aria-label="Duplicar"
        >
          <Icon name="copy" size={16} />
        </button>
        <button
          type="button"
          className="fa-acao"
          onClick={() => onEditar(item)}
          title="Editar"
          aria-label="Editar"
        >
          <Icon name="pencil" size={16} />
        </button>
        <button
          type="button"
          className="fa-acao is-perigo"
          onClick={() => onRemover(item)}
          disabled={removendo}
          title="Remover"
          aria-label="Remover"
        >
          <Icon name="trash" size={16} />
        </button>
      </div>
    </li>
  );
};

export default FaqAdmin;
