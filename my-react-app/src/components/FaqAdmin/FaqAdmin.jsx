import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  Timestamp,
} from "firebase/firestore";
import { db } from "../../Services/Services/firebase";
import CardSkeleton from "../../components/CardSkeleton/CardSkeleton";
import "./styles.css";
import Icon from "../ui/Icon";
import { iconeMui } from "../ui/iconeMui";
import Segmented from "../ui/Segmented";
import AssistenteConfig from "./AssistenteConfig";
import FotosVeiculo from "./FotosVeiculo";
import {
  FORMATOS,
  obterFormato,
  obterFichaVeiculo,
  obterTabelaPrecos,
  formatarValor,
  RECURSOS_VEICULO,
  TIPOS_VEICULO,
  iconeRecurso,
  ehConfigAssistente,
} from "../FaqComercial/catalogo";

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

const LINHA_PRECO_VAZIA = { servico: "", valor: "", detalhe: "" };

const OPCOES_FORMATO = [
  { value: FORMATOS.RESPOSTA, label: "Resposta pronta", icon: "message" },
  { value: FORMATOS.VEICULO, label: "Ficha de veículo", icon: "car" },
  { value: FORMATOS.TABELA, label: "Tabela de valores", icon: "tag" },
];

const ROTULO_FORMATO = {
  [FORMATOS.RESPOSTA]: "Resposta",
  [FORMATOS.VEICULO]: "Veículo",
  [FORMATOS.TABELA]: "Valores",
};

const NOMES_RECURSOS_PADRAO = RECURSOS_VEICULO.map((r) => r.label);

const FORMULARIO_VAZIO = {
  formato: FORMATOS.RESPOSTA,
  tipoVeiculo: "",
  passageiros: "",
  malasGrandes: "",
  malasBordo: "",
  recursos: [],
  recursosExtras: "",
  tabelaPrecos: [{ ...LINHA_PRECO_VAZIA }],
  categoria: "",
  pergunta: "",
  resposta: "",
  palavrasChave: "",
  validade: "",
  destaque: false,
  ativo: true,
  nomeVeiculo: "",
  imagensVeiculoTexto: "",
  linkOficialVeiculo: "",
  veiculoForaCatalogo: false,
};

// Campos do catálogo (formato, ficha do veículo, tabela) a partir de um item.
const camposCatalogoDoItem = (item) => {
  const ficha = obterFichaVeiculo(item);
  const tabela = obterTabelaPrecos(item);
  return {
    formato: obterFormato(item),
    tipoVeiculo: ficha.tipoVeiculo,
    passageiros: ficha.passageiros ?? "",
    malasGrandes: ficha.malasGrandes ?? "",
    malasBordo: ficha.malasBordo ?? "",
    recursos: ficha.recursos.filter((r) => NOMES_RECURSOS_PADRAO.includes(r)),
    recursosExtras: ficha.recursos
      .filter((r) => !NOMES_RECURSOS_PADRAO.includes(r))
      .join(", "),
    tabelaPrecos: tabela.length ? tabela : [{ ...LINHA_PRECO_VAZIA }],
  };
};

const numeroDoCampo = (valor) => {
  if (valor === "" || valor === null || valor === undefined) return null;
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

const FaqAdmin = () => {
  const [itens, setItens] = useState([]);
  const [configAssistente, setConfigAssistente] = useState(null);
  const [abaAdmin, setAbaAdmin] = useState("catalogo");
  const [loadingInicial, setLoadingInicial] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [removendoId, setRemovendoId] = useState(null);

  const [mensagem, setMensagem] = useState("");
  const [tipoMensagem, setTipoMensagem] = useState("");

  const [busca, setBusca] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("todas");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroFormato, setFiltroFormato] = useState("todos");
  const [ordenarPor, setOrdenarPor] = useState("categoria");

  const [editandoId, setEditandoId] = useState(null);
  const [formulario, setFormulario] = useState(FORMULARIO_VAZIO);

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
    } catch (err) {
      console.error("Erro ao carregar perguntas frequentes:", err);
      setTipoMensagem("erro");
      setMensagem("Erro ao carregar as perguntas.");
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

  useEffect(() => {
    if (!mensagem) return;
    const timer = setTimeout(() => {
      setMensagem("");
      setTipoMensagem("");
    }, 3500);
    return () => clearTimeout(timer);
  }, [mensagem]);

  const categoriasDisponiveis = useMemo(() => {
    const unicas = new Set(itens.map((item) => item.categoria).filter(Boolean));
    return Array.from(unicas).sort((a, b) =>
      a.localeCompare(b, "pt-BR", { sensitivity: "base" }),
    );
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

      return 0;
    });
  }, [itens, busca, filtroCategoria, filtroStatus, filtroFormato, ordenarPor]);

  const limparFormulario = () => {
    setFormulario(FORMULARIO_VAZIO);
    setEditandoId(null);
  };

  const abrirEdicao = (item) => {
    setEditandoId(item.id);
    setFormulario({
      categoria: item.categoria || "",
      pergunta: item.pergunta || "",
      resposta: item.resposta || "",
      palavrasChave: Array.isArray(item.palavrasChave)
        ? item.palavrasChave.join(", ")
        : "",
      validade: item.validade || "",
      destaque: !!item.destaque,
      ativo: item.ativo !== false,
      nomeVeiculo: item.nomeVeiculo || "",
      imagensVeiculoTexto: obterImagensVeiculo(item).join("\n"),
      linkOficialVeiculo: item.linkOficialVeiculo || "",
      veiculoForaCatalogo: !!item.veiculoForaCatalogo,
      ...camposCatalogoDoItem(item),
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Pré-preenche o formulário com os dados de um item existente, mas
  // sem editandoId — ao salvar, cria uma pergunta NOVA em vez de
  // sobrescrever a original. Útil pra cadastrar várias perguntas de
  // veículo parecidas ("Temos [modelo] cadastrado?").
  const duplicarItem = (item) => {
    setEditandoId(null);
    setFormulario({
      categoria: item.categoria || "",
      pergunta: item.pergunta ? `${item.pergunta} (cópia)` : "",
      resposta: item.resposta || "",
      palavrasChave: Array.isArray(item.palavrasChave)
        ? item.palavrasChave.join(", ")
        : "",
      validade: item.validade || "",
      destaque: false,
      ativo: true,
      nomeVeiculo: item.nomeVeiculo || "",
      imagensVeiculoTexto: obterImagensVeiculo(item).join("\n"),
      linkOficialVeiculo: item.linkOficialVeiculo || "",
      veiculoForaCatalogo: !!item.veiculoForaCatalogo,
      ...camposCatalogoDoItem(item),
    });

    setTipoMensagem("sucesso");
    setMensagem(
      "Pergunta duplicada — ajuste os campos e salve como uma nova entrada.",
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const salvarItem = async () => {
    const formato = formulario.formato || FORMATOS.RESPOSTA;
    const linhasPreco = formulario.tabelaPrecos
      .map((l) => ({
        servico: l.servico.trim(),
        valor: String(l.valor).trim(),
        detalhe: l.detalhe.trim(),
      }))
      .filter((l) => l.servico || l.valor);

    if (!formulario.categoria.trim() || !formulario.pergunta.trim()) {
      setTipoMensagem("erro");
      setMensagem(
        formato === FORMATOS.TABELA
          ? "Preencha categoria e título da tabela."
          : "Preencha categoria e pergunta.",
      );
      return;
    }

    if (formato === FORMATOS.RESPOSTA && !formulario.resposta.trim()) {
      setTipoMensagem("erro");
      setMensagem("Preencha categoria, pergunta e resposta.");
      return;
    }

    if (formato === FORMATOS.VEICULO && !formulario.nomeVeiculo.trim()) {
      setTipoMensagem("erro");
      setMensagem("Informe o nome do veículo.");
      return;
    }

    if (formato === FORMATOS.TABELA && linhasPreco.length === 0) {
      setTipoMensagem("erro");
      setMensagem("Adicione pelo menos um serviço com valor na tabela.");
      return;
    }

    try {
      setSalvando(true);

      const payload = {
        categoria: resolverCategoriaCanonica(
          formulario.categoria,
          categoriasDisponiveis,
        ),
        pergunta: formulario.pergunta.trim(),
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
          recursos: [
            ...formulario.recursos,
            ...formulario.recursosExtras
              .split(",")
              .map((r) => r.trim())
              .filter(Boolean),
          ],
        },
        tabelaPrecos: linhasPreco,
        atualizadoEm: Timestamp.now(),
      };

      if (editandoId) {
        await updateDoc(doc(db, "faq_itens", editandoId), payload);
      } else {
        await addDoc(collection(db, "faq_itens"), {
          ...payload,
          contadorVisualizacoes: 0,
          contadorCopias: 0,
          criadoEm: Timestamp.now(),
        });
      }

      setTipoMensagem("sucesso");
      setMensagem(editandoId ? "Pergunta atualizada." : "Pergunta cadastrada.");
      limparFormulario();
      await carregarItens();
    } catch (err) {
      console.error("Erro ao salvar pergunta:", err);
      setTipoMensagem("erro");
      setMensagem("Erro ao salvar a pergunta.");
    } finally {
      setSalvando(false);
    }
  };

  const removerItem = async (item) => {
    const confirmar = window.confirm(
      `Remover a pergunta "${item.pergunta}"? Essa ação não pode ser desfeita.`,
    );
    if (!confirmar) return;

    try {
      setRemovendoId(item.id);
      await deleteDoc(doc(db, "faq_itens", item.id));
      setTipoMensagem("sucesso");
      setMensagem("Pergunta removida.");
      if (editandoId === item.id) limparFormulario();
      await carregarItens();
    } catch (err) {
      console.error("Erro ao remover pergunta:", err);
      setTipoMensagem("erro");
      setMensagem("Erro ao remover a pergunta.");
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
    } catch (err) {
      console.error(`Erro ao atualizar ${campo}:`, err);
      setTipoMensagem("erro");
      setMensagem("Não foi possível atualizar o item.");
    }
  };

  const atualizarCampo = (campo, valor) =>
    setFormulario((prev) => ({ ...prev, [campo]: valor }));

  const alternarRecurso = (label) =>
    setFormulario((prev) => ({
      ...prev,
      recursos: prev.recursos.includes(label)
        ? prev.recursos.filter((r) => r !== label)
        : [...prev.recursos, label],
    }));

  const atualizarLinhaPreco = (indice, campo, valor) =>
    setFormulario((prev) => ({
      ...prev,
      tabelaPrecos: prev.tabelaPrecos.map((linha, i) =>
        i === indice ? { ...linha, [campo]: valor } : linha,
      ),
    }));

  const adicionarLinhaPreco = () =>
    setFormulario((prev) => ({
      ...prev,
      tabelaPrecos: [...prev.tabelaPrecos, { ...LINHA_PRECO_VAZIA }],
    }));

  const removerLinhaPreco = (indice) =>
    setFormulario((prev) => ({
      ...prev,
      tabelaPrecos:
        prev.tabelaPrecos.length > 1
          ? prev.tabelaPrecos.filter((_, i) => i !== indice)
          : [{ ...LINHA_PRECO_VAZIA }],
    }));

  const moverLinhaPreco = (indice, direcao) =>
    setFormulario((prev) => {
      const destino = indice + direcao;
      if (destino < 0 || destino >= prev.tabelaPrecos.length) return prev;
      const lista = [...prev.tabelaPrecos];
      [lista[indice], lista[destino]] = [lista[destino], lista[indice]];
      return { ...prev, tabelaPrecos: lista };
    });

  const formatoForm = formulario.formato || FORMATOS.RESPOSTA;
  const ehVeiculoForm = formatoForm === FORMATOS.VEICULO;
  const ehTabelaForm = formatoForm === FORMATOS.TABELA;

  return (
    <div className="faq-admin-page">
      <div className="faq-admin-header">
        <div>
          <h2 className="faq-admin-title">
            Central de Dúvidas — Administração <Icon name="help" size={16} />
          </h2>
          <p className="faq-admin-subtitle">
            Cadastre respostas para as perguntas que o time comercial mais faz —
            cotações, bagagem, veículos e políticas. O que estiver marcado como
            "Ativo" aparece na tela de consulta do comercial.
          </p>
        </div>

        <span className="faq-admin-badge">
          {itens.length} item(ns) no catálogo
        </span>
      </div>

      <Segmented
        className="faq-admin-abas"
        options={[
          { value: "catalogo", label: "Catálogo", icon: "grid", count: itens.length },
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
        <div className="faq-admin-grid">
          <div className="faq-admin-card faq-admin-card-full">
            <div className="faq-admin-card-header">
              <div className="faq-admin-card-title-row">
                <h3>{editandoId ? "Editar item" : "Novo item do catálogo"}</h3>
                {editandoId && (
                  <button
                    type="button"
                    className="faq-admin-btn-secondary"
                    onClick={limparFormulario}
                  >
                    <Icon name="x" size={16} />
                    Cancelar edição
                  </button>
                )}
              </div>
              <p>
                A categoria define automaticamente a cor e o ícone que aparecem
                pro comercial — use o mesmo nome de categoria pra manter a
                identidade consistente.
              </p>
            </div>

            {mensagem && (
              <div className={`faq-admin-alerta ${tipoMensagem}`}>{mensagem}</div>
            )}

            <div className="faq-admin-formato">
              <span className="faq-admin-formato-rotulo">Tipo de item</span>
              <Segmented
                options={OPCOES_FORMATO}
                value={formatoForm}
                onChange={(valor) => atualizarCampo("formato", valor)}
                ariaLabel="Tipo de item do catálogo"
              />
              <span className="faq-admin-field-hint">
                {ehVeiculoForm
                  ? "Aparece na vitrine \"Frota\" com foto, capacidade e itens."
                  : ehTabelaForm
                    ? "Aparece em \"Valores\": uma lista de serviços com preço (ex.: motoguia)."
                    : "Pergunta e resposta prontas para copiar ou enviar no WhatsApp."}
              </span>
            </div>

            <div className="faq-admin-form-grid">
              <div className="faq-admin-field">
                <label>Categoria</label>
                <input
                  type="text"
                  className="faq-admin-input"
                  list="faq-categorias-existentes"
                  placeholder="Ex: Bagagem, Veículos, Cotação..."
                  value={formulario.categoria}
                  onChange={(e) =>
                    setFormulario((prev) => ({
                      ...prev,
                      categoria: e.target.value,
                    }))
                  }
                  disabled={salvando}
                />
                <datalist id="faq-categorias-existentes">
                  {categoriasDisponiveis.map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </div>

              <div className="faq-admin-field">
                <label>Palavras-chave (separadas por vírgula)</label>
                <input
                  type="text"
                  className="faq-admin-input"
                  placeholder="Ex: mala, bagagem, quantidade"
                  value={formulario.palavrasChave}
                  onChange={(e) =>
                    setFormulario((prev) => ({
                      ...prev,
                      palavrasChave: e.target.value,
                    }))
                  }
                  disabled={salvando}
                />
              </div>

              <div className="faq-admin-field">
                <label>
                  <Icon name="calendar" size={16} />
                  {ehTabelaForm
                    ? "Valores válidos até (opcional)"
                    : "Validade da cotação (opcional)"}
                </label>
                <input
                  type="date"
                  className="faq-admin-input"
                  value={formulario.validade}
                  onChange={(e) =>
                    setFormulario((prev) => ({
                      ...prev,
                      validade: e.target.value,
                    }))
                  }
                  disabled={salvando}
                />
              </div>

              <div className="faq-admin-field faq-admin-field-full">
                <label>
                  {ehTabelaForm
                    ? "Título da tabela"
                    : ehVeiculoForm
                      ? "Pergunta / descrição curta"
                      : "Pergunta"}
                </label>
                <input
                  type="text"
                  className="faq-admin-input"
                  placeholder={
                    ehTabelaForm
                      ? "Ex: Motoguia — valores por serviço"
                      : ehVeiculoForm
                        ? "Ex: Gabarito de malas – Spin sem bagageiro"
                        : "Ex: Quantas malas cabem no veículo executivo?"
                  }
                  value={formulario.pergunta}
                  onChange={(e) =>
                    setFormulario((prev) => ({
                      ...prev,
                      pergunta: e.target.value,
                    }))
                  }
                  disabled={salvando}
                />
              </div>

              <div className="faq-admin-field faq-admin-field-full">
                <label>
                  {formatoForm === FORMATOS.RESPOSTA
                    ? "Resposta"
                    : "Observações (opcional)"}
                </label>
                <textarea
                  className="faq-admin-textarea"
                  rows={formatoForm === FORMATOS.RESPOSTA ? 5 : 3}
                  placeholder={
                    formatoForm === FORMATOS.RESPOSTA
                      ? "Escreva a resposta completa, do jeito que o comercial deve repassar ao cliente."
                      : ehTabelaForm
                        ? "Ex: Valores por veículo, até 6 passageiros. Pedágios inclusos."
                        : "Ex: Com bagageiro de teto: até 5 malas grandes."
                  }
                  value={formulario.resposta}
                  onChange={(e) =>
                    setFormulario((prev) => ({
                      ...prev,
                      resposta: e.target.value,
                    }))
                  }
                  disabled={salvando}
                />
                <span className="faq-admin-field-hint">
                  Use *negrito* pra destacar (mesmo padrão do WhatsApp) e linhas
                  começando com "- " pra criar uma lista.
                </span>
              </div>

              <div className="faq-admin-field-checkboxes">
                <label className="faq-admin-checkbox">
                  <input
                    type="checkbox"
                    checked={formulario.destaque}
                    onChange={(e) =>
                      setFormulario((prev) => ({
                        ...prev,
                        destaque: e.target.checked,
                      }))
                    }
                    disabled={salvando}
                  />
                  Destacar (fixa no topo pro comercial)
                </label>

                <label className="faq-admin-checkbox">
                  <input
                    type="checkbox"
                    checked={formulario.ativo}
                    onChange={(e) =>
                      setFormulario((prev) => ({
                        ...prev,
                        ativo: e.target.checked,
                      }))
                    }
                    disabled={salvando}
                  />
                  Ativo (visível pro comercial)
                </label>
              </div>
            </div>

            {ehVeiculoForm && (
              <div className="faq-admin-veiculo-section">
                <div className="faq-admin-veiculo-header">
                  <Icon name="truck" size={16} />
                  <div>
                    <strong>Ficha do veículo</strong>
                    <span>
                      Nome, fotos, capacidade e itens — é o que o comercial vê no
                      card da frota e na ficha completa.
                    </span>
                  </div>
                </div>

                <div className="faq-admin-form-grid">
                  <div className="faq-admin-field">
                    <label>Nome do veículo</label>
                    <input
                      type="text"
                      className="faq-admin-input"
                      placeholder="Ex: Mercedes-Benz Sprinter Executivo"
                      value={formulario.nomeVeiculo}
                      onChange={(e) =>
                        setFormulario((prev) => ({
                          ...prev,
                          nomeVeiculo: e.target.value,
                        }))
                      }
                      disabled={salvando}
                    />
                  </div>

                  <div className="faq-admin-field faq-admin-field-full">
                    <label>
                      <Icon name="image" size={16} />
                      Fotos do veículo
                    </label>
                    <FotosVeiculo
                      valor={formulario.imagensVeiculoTexto
                        .split("\n")
                        .map((url) => url.trim())
                        .filter(Boolean)}
                      onChange={(lista) =>
                        atualizarCampo("imagensVeiculoTexto", lista.join("\n"))
                      }
                      disabled={salvando}
                      nome={formulario.nomeVeiculo || "Veículo"}
                    />
                  </div>

                  <div className="faq-admin-field faq-admin-field-full">
                    <label>Link do site oficial do veículo</label>
                    <input
                      type="text"
                      className="faq-admin-input"
                      placeholder="https://www.mercedes-benz.com.br/..."
                      value={formulario.linkOficialVeiculo}
                      onChange={(e) =>
                        setFormulario((prev) => ({
                          ...prev,
                          linkOficialVeiculo: e.target.value,
                        }))
                      }
                      disabled={salvando || formulario.veiculoForaCatalogo}
                    />
                  </div>

                  <div className="faq-admin-field-checkboxes">
                    <label className="faq-admin-checkbox">
                      <input
                        type="checkbox"
                        checked={formulario.veiculoForaCatalogo}
                        onChange={(e) =>
                          setFormulario((prev) => ({
                            ...prev,
                            veiculoForaCatalogo: e.target.checked,
                          }))
                        }
                        disabled={salvando}
                      />
                      Veículo fora do catálogo atual (a ficha busca imagens no
                      Google em vez do link oficial)
                    </label>
                  </div>
                </div>

                <div className="faq-admin-form-grid faq-admin-ficha-grid">
                  <div className="faq-admin-field">
                    <label>Tipo</label>
                    <input
                      type="text"
                      className="faq-admin-input"
                      list="faq-tipos-veiculo"
                      placeholder="Ex: Van"
                      value={formulario.tipoVeiculo}
                      onChange={(e) => atualizarCampo("tipoVeiculo", e.target.value)}
                      disabled={salvando}
                    />
                    <datalist id="faq-tipos-veiculo">
                      {TIPOS_VEICULO.map((tipo) => (
                        <option key={tipo} value={tipo} />
                      ))}
                    </datalist>
                  </div>

                  <div className="faq-admin-field">
                    <label>
                      <Icon name="users" size={16} />
                      Passageiros
                    </label>
                    <input
                      type="number"
                      min={0}
                      className="faq-admin-input"
                      placeholder="Ex: 15"
                      value={formulario.passageiros}
                      onChange={(e) => atualizarCampo("passageiros", e.target.value)}
                      disabled={salvando}
                    />
                  </div>

                  <div className="faq-admin-field">
                    <label>
                      <Icon name="briefcase" size={16} />
                      Malas grandes (23 kg)
                    </label>
                    <input
                      type="number"
                      min={0}
                      className="faq-admin-input"
                      placeholder="Ex: 10"
                      value={formulario.malasGrandes}
                      onChange={(e) => atualizarCampo("malasGrandes", e.target.value)}
                      disabled={salvando}
                    />
                  </div>

                  <div className="faq-admin-field">
                    <label>
                      <Icon name="briefcase" size={16} />
                      Malas de bordo (10 kg)
                    </label>
                    <input
                      type="number"
                      min={0}
                      className="faq-admin-input"
                      placeholder="Ex: 15"
                      value={formulario.malasBordo}
                      onChange={(e) => atualizarCampo("malasBordo", e.target.value)}
                      disabled={salvando}
                    />
                  </div>

                  <div className="faq-admin-field faq-admin-field-full">
                    <label>Itens do veículo</label>
                    <div className="faq-admin-recursos">
                      {RECURSOS_VEICULO.map((recurso) => {
                        const ativo = formulario.recursos.includes(recurso.label);
                        return (
                          <button
                            key={recurso.label}
                            type="button"
                            className={`faq-admin-recurso ${ativo ? "is-ativo" : ""}`}
                            onClick={() => alternarRecurso(recurso.label)}
                            aria-pressed={ativo}
                            disabled={salvando}
                          >
                            <Icon name={ativo ? "check" : recurso.icon} size={14} />
                            {recurso.label}
                          </button>
                        );
                      })}
                    </div>
                    <input
                      type="text"
                      className="faq-admin-input"
                      placeholder="Outros itens, separados por vírgula (ex: Poltronas reclináveis, Geladeira)"
                      value={formulario.recursosExtras}
                      onChange={(e) => atualizarCampo("recursosExtras", e.target.value)}
                      disabled={salvando}
                    />
                  </div>
                </div>


              </div>
            )}

            {ehTabelaForm && (
              <div className="faq-admin-veiculo-section">
                <div className="faq-admin-veiculo-header">
                  <Icon name="tag" size={16} />
                  <div>
                    <strong>Valores por serviço</strong>
                    <span>
                      Uma linha por serviço. Valor só com números (ex: 250 ou
                      1.250,00) vira R$ automaticamente; texto como "Sob
                      consulta" aparece do jeito que foi escrito.
                    </span>
                  </div>
                </div>

                <div className="faq-admin-precos">
                  <div className="faq-admin-precos-cabecalho" aria-hidden="true">
                    <span>Serviço</span>
                    <span>Valor</span>
                    <span>Detalhe (opcional)</span>
                    <span />
                  </div>

                  {formulario.tabelaPrecos.map((linha, i) => (
                    <div key={i} className="faq-admin-preco-linha">
                      <input
                        type="text"
                        className="faq-admin-input"
                        placeholder="Ex: City Tour Histórico"
                        value={linha.servico}
                        onChange={(e) => atualizarLinhaPreco(i, "servico", e.target.value)}
                        aria-label={`Serviço da linha ${i + 1}`}
                        disabled={salvando}
                      />
                      <div className="faq-admin-preco-valor">
                        <input
                          type="text"
                          inputMode="decimal"
                          className="faq-admin-input"
                          placeholder="Ex: 350"
                          value={linha.valor}
                          onChange={(e) => atualizarLinhaPreco(i, "valor", e.target.value)}
                          aria-label={`Valor da linha ${i + 1}`}
                          disabled={salvando}
                        />
                        {linha.valor && (
                          <span className="faq-admin-preco-formatado">
                            {formatarValor(linha.valor)}
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        className="faq-admin-input"
                        placeholder="Ex: até 4 horas"
                        value={linha.detalhe}
                        onChange={(e) => atualizarLinhaPreco(i, "detalhe", e.target.value)}
                        aria-label={`Detalhe da linha ${i + 1}`}
                        disabled={salvando}
                      />
                      <div className="faq-admin-preco-acoes">
                        <button
                          type="button"
                          className="faq-admin-icon-btn"
                          onClick={() => moverLinhaPreco(i, -1)}
                          disabled={salvando || i === 0}
                          title="Subir"
                          aria-label="Subir linha"
                        >
                          <Icon name="chevronUp" size={16} />
                        </button>
                        <button
                          type="button"
                          className="faq-admin-icon-btn"
                          onClick={() => moverLinhaPreco(i, 1)}
                          disabled={salvando || i === formulario.tabelaPrecos.length - 1}
                          title="Descer"
                          aria-label="Descer linha"
                        >
                          <Icon name="chevronDown" size={16} />
                        </button>
                        <button
                          type="button"
                          className="faq-admin-icon-btn danger"
                          onClick={() => removerLinhaPreco(i)}
                          disabled={salvando}
                          title="Remover linha"
                          aria-label="Remover linha"
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    className="faq-admin-btn-secondary faq-admin-preco-adicionar"
                    onClick={adicionarLinhaPreco}
                    disabled={salvando}
                  >
                    <Icon name="plus" size={16} />
                    Adicionar serviço
                  </button>
                </div>
              </div>
            )}

            <div className="faq-admin-actions">
              <button
                type="button"
                className="faq-admin-btn-primary"
                onClick={salvarItem}
                disabled={salvando}
              >
                <Icon name="save" size={16} />
                {salvando
                  ? "Salvando..."
                  : editandoId
                    ? "Salvar alterações"
                    : ehVeiculoForm
                      ? "Cadastrar veículo"
                      : ehTabelaForm
                        ? "Cadastrar tabela"
                        : "Cadastrar pergunta"}
              </button>
            </div>
          </div>

          <div className="faq-admin-card faq-admin-card-full">
            <div className="faq-admin-card-header">
              <div className="faq-admin-card-title-row">
                <h3>Itens cadastrados</h3>
                <span className="faq-admin-badge">
                  {itensFiltrados.length} resultado(s)
                </span>
              </div>
            </div>

            <div className="faq-admin-toolbar">
              <div className="faq-admin-field">
                <label>
                  <Icon name="search" size={16} />
                  Buscar
                </label>
                <input
                  type="text"
                  className="faq-admin-input"
                  placeholder="Buscar por pergunta, resposta ou palavra-chave"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>

              <div className="faq-admin-field">
                <label>
                  <Icon name="grid" size={16} />
                  Tipo
                </label>
                <select
                  className="faq-admin-select"
                  value={filtroFormato}
                  onChange={(e) => setFiltroFormato(e.target.value)}
                >
                  <option value="todos">Todos</option>
                  <option value={FORMATOS.RESPOSTA}>Respostas prontas</option>
                  <option value={FORMATOS.VEICULO}>Fichas de veículo</option>
                  <option value={FORMATOS.TABELA}>Tabelas de valores</option>
                </select>
              </div>

              <div className="faq-admin-field">
                <label>
                  <Icon name="filter" size={16} />
                  Categoria
                </label>
                <select
                  className="faq-admin-select"
                  value={filtroCategoria}
                  onChange={(e) => setFiltroCategoria(e.target.value)}
                >
                  <option value="todas">Todas</option>
                  {categoriasDisponiveis.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="faq-admin-field">
                <label>
                  <Icon name="filter" size={16} />
                  Status
                </label>
                <select
                  className="faq-admin-select"
                  value={filtroStatus}
                  onChange={(e) => setFiltroStatus(e.target.value)}
                >
                  <option value="todos">Todos</option>
                  <option value="ativos">Ativos</option>
                  <option value="inativos">Inativos</option>
                  <option value="destaque">Destacados</option>
                  <option value="vencendo_em_breve">Vencendo em breve</option>
                  <option value="vencidas">Vencidas</option>
                </select>
              </div>

              <div className="faq-admin-field">
                <label>
                  <Icon name="activity" size={16} />
                  Ordenar por
                </label>
                <select
                  className="faq-admin-select"
                  value={ordenarPor}
                  onChange={(e) => setOrdenarPor(e.target.value)}
                >
                  <option value="categoria">Categoria</option>
                  <option value="recentes">Mais recentes</option>
                  <option value="mais_usadas">Mais usadas</option>
                </select>
              </div>
            </div>

            {loadingInicial ? (
              <CardSkeleton variant="list" rows={5} />
            ) : itensFiltrados.length === 0 ? (
              <div className="faq-admin-vazio">
                Nenhuma pergunta encontrada com esses filtros.
              </div>
            ) : (
              <div className="faq-admin-lista">
                {itensFiltrados.map((item) => {
                  const cor = obterCorCategoria(item.categoria);
                  const IconeCategoria = obterIconeCategoria(item.categoria);
                  const imagensVeiculo = obterImagensVeiculo(item);
                  const vencida = itemEstaVencido(item);
                  const venceBreve = !vencida && itemVenceEmBreve(item);
                  const formatoItem = obterFormato(item);
                  const fichaItem = obterFichaVeiculo(item);
                  const precosItem = obterTabelaPrecos(item);

                  return (
                    <div
                      key={item.id}
                      className={`faq-admin-item ${item.ativo === false ? "inativo" : ""}`}
                    >
                      <div className="faq-admin-item-topo">
                        <span className={`faq-admin-formato-badge is-${formatoItem}`}>
                          <Icon
                            name={
                              formatoItem === FORMATOS.VEICULO
                                ? "car"
                                : formatoItem === FORMATOS.TABELA
                                  ? "tag"
                                  : "message"
                            }
                            size={14}
                          />
                          {ROTULO_FORMATO[formatoItem]}
                        </span>
                        <span
                          className="faq-admin-categoria-badge"
                          style={{
                            "--cor-categoria": cor,
                          }}
                        >
                          <IconeCategoria fontSize="small" />
                          {item.categoria}
                        </span>

                        {item.destaque && (
                          <span className="faq-admin-destaque-badge">
                            <Icon name="star" size={16} />
                            Destaque
                          </span>
                        )}

                        {item.validade && (
                          <span
                            className={`faq-admin-validade-badge ${vencida
                                ? "vencida"
                                : venceBreve
                                  ? "vence-breve"
                                  : ""
                              }`}
                          >
                            <Icon name="calendar" size={16} />
                            {vencida
                              ? `Vencida em ${formatarDataBr(item.validade)}`
                              : venceBreve
                                ? `Vence em ${diasParaVencer(item)} dia(s)`
                                : `Válida até ${formatarDataBr(item.validade)}`}
                          </span>
                        )}

                        {item.ativo === false && (
                          <span className="faq-admin-inativo-badge">Inativo</span>
                        )}
                      </div>

                      <strong className="faq-admin-item-pergunta">
                        {item.pergunta}
                      </strong>
                      {item.resposta && (
                        <p className="faq-admin-item-resposta">{item.resposta}</p>
                      )}

                      {formatoItem === FORMATOS.TABELA && precosItem.length > 0 && (
                        <ul className="faq-admin-precos-resumo">
                          {precosItem.slice(0, 4).map((linha, i) => (
                            <li key={i}>
                              <span>{linha.servico}</span>
                              <strong>{formatarValor(linha.valor)}</strong>
                            </li>
                          ))}
                          {precosItem.length > 4 && (
                            <li className="faq-admin-precos-mais">
                              + {precosItem.length - 4} serviço(s)
                            </li>
                          )}
                        </ul>
                      )}

                      {formatoItem === FORMATOS.VEICULO &&
                        (fichaItem.passageiros !== null ||
                          fichaItem.malasGrandes !== null ||
                          fichaItem.recursos.length > 0) && (
                          <div className="faq-admin-ficha-resumo">
                            {fichaItem.tipoVeiculo && <span>{fichaItem.tipoVeiculo}</span>}
                            {fichaItem.passageiros !== null && (
                              <span>
                                <Icon name="users" size={14} />
                                {fichaItem.passageiros} pax
                              </span>
                            )}
                            {fichaItem.malasGrandes !== null && (
                              <span>
                                <Icon name="briefcase" size={14} />
                                {fichaItem.malasGrandes} grandes
                              </span>
                            )}
                            {fichaItem.malasBordo !== null && (
                              <span>{fichaItem.malasBordo} de bordo</span>
                            )}
                            {fichaItem.recursos.map((r) => (
                              <span key={r} title={r}>
                                <Icon name={iconeRecurso(r)} size={14} />
                              </span>
                            ))}
                          </div>
                        )}

                      <div className="faq-admin-stats-line">
                        <Icon name="activity" size={16} />
                        {Number(item.contadorVisualizacoes || 0)} visualizações ·{" "}
                        {Number(item.contadorCopias || 0)} cópias
                        {item.atualizadoEm &&
                          ` · atualizado ${formatarTempoRelativo(item.atualizadoEm)}`}
                      </div>

                      {item.nomeVeiculo && (
                        <div className="faq-admin-veiculo-tag">
                          <Icon name="truck" size={16} />
                          {item.nomeVeiculo}
                          {imagensVeiculo.length > 1 &&
                            ` (${imagensVeiculo.length} fotos)`}
                          {item.veiculoForaCatalogo && (
                            <span className="faq-admin-veiculo-tag-aviso">
                              fora de catálogo
                            </span>
                          )}
                        </div>
                      )}

                      {Array.isArray(item.palavrasChave) &&
                        item.palavrasChave.length > 0 && (
                          <div className="faq-admin-tags">
                            {item.palavrasChave.map((tag) => (
                              <span key={tag} className="faq-admin-tag">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}

                      <div className="faq-admin-item-actions">
                        <button
                          type="button"
                          className="faq-admin-icon-btn"
                          onClick={() => alternarCampo(item, "destaque")}
                          title={
                            item.destaque
                              ? "Remover destaque"
                              : "Marcar como destaque"
                          }
                        >
                          {item.destaque ? (
                            <Icon name="star" size={16} />
                          ) : (
                            <Icon name="star" size={16} />
                          )}
                        </button>

                        <button
                          type="button"
                          className="faq-admin-icon-btn"
                          onClick={() => alternarCampo(item, "ativo")}
                          title={
                            item.ativo === false
                              ? "Ativar (mostrar pro comercial)"
                              : "Desativar (esconder do comercial)"
                          }
                        >
                          {item.ativo === false ? (
                            <Icon name="eyeOff" size={16} />
                          ) : (
                            <Icon name="eye" size={16} />
                          )}
                        </button>

                        <button
                          type="button"
                          className="faq-admin-icon-btn"
                          onClick={() => duplicarItem(item)}
                          title="Duplicar"
                        >
                          <Icon name="copy" size={16} />
                        </button>

                        <button
                          type="button"
                          className="faq-admin-icon-btn"
                          onClick={() => abrirEdicao(item)}
                          title="Editar"
                        >
                          <Icon name="pencil" size={16} />
                        </button>

                        <button
                          type="button"
                          className="faq-admin-icon-btn danger"
                          onClick={() => removerItem(item)}
                          disabled={removendoId === item.id}
                          title="Remover"
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FaqAdmin;
