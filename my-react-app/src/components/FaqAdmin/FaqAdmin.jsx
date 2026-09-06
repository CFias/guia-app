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
import {
  QuizRounded,
  SearchRounded,
  FilterAltRounded,
  EditRounded,
  DeleteRounded,
  SaveRounded,
  CloseRounded,
  StarRounded,
  StarBorderRounded,
  VisibilityRounded,
  VisibilityOffRounded,
  LuggageRounded,
  DirectionsCarRounded,
  DescriptionRounded,
  PaidRounded,
  AccessTimeRounded,
  HotelRounded,
  ChildCareRounded,
  GavelRounded,
  HelpRounded,
  EventRounded,
  ContentCopyRounded,
  InsightsRounded,
} from "@mui/icons-material";

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

const FORMULARIO_VAZIO = {
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

const FaqAdmin = () => {
  const [itens, setItens] = useState([]);
  const [loadingInicial, setLoadingInicial] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [removendoId, setRemovendoId] = useState(null);

  const [mensagem, setMensagem] = useState("");
  const [tipoMensagem, setTipoMensagem] = useState("");

  const [busca, setBusca] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("todas");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [ordenarPor, setOrdenarPor] = useState("categoria");

  const [editandoId, setEditandoId] = useState(null);
  const [formulario, setFormulario] = useState(FORMULARIO_VAZIO);

  const carregarItens = async () => {
    try {
      const snap = await getDocs(collection(db, "faq_itens"));

      const lista = snap.docs
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
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

      const statusOk =
        filtroStatus === "todos" ||
        (filtroStatus === "ativos" && item.ativo !== false) ||
        (filtroStatus === "inativos" && item.ativo === false) ||
        (filtroStatus === "destaque" && !!item.destaque) ||
        (filtroStatus === "vencidas" && itemEstaVencido(item)) ||
        (filtroStatus === "vencendo_em_breve" &&
          !itemEstaVencido(item) &&
          itemVenceEmBreve(item));

      if (!categoriaOk || !statusOk) return false;
      if (!termo) return true;

      const alvo = normalizarTexto(
        [
          item.categoria,
          item.pergunta,
          item.resposta,
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
  }, [itens, busca, filtroCategoria, filtroStatus, ordenarPor]);

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
    });

    setTipoMensagem("sucesso");
    setMensagem(
      "Pergunta duplicada — ajuste os campos e salve como uma nova entrada.",
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const salvarItem = async () => {
    if (
      !formulario.categoria.trim() ||
      !formulario.pergunta.trim() ||
      !formulario.resposta.trim()
    ) {
      setTipoMensagem("erro");
      setMensagem("Preencha categoria, pergunta e resposta.");
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

  return (
    <div className="faq-admin-page">
      <div className="faq-admin-header">
        <div>
          <h2 className="faq-admin-title">
            Central de Dúvidas — Administração <QuizRounded fontSize="small" />
          </h2>
          <p className="faq-admin-subtitle">
            Cadastre respostas para as perguntas que o time comercial mais faz —
            cotações, bagagem, veículos e políticas. O que estiver marcado como
            "Ativo" aparece na tela de consulta do comercial.
          </p>
        </div>

        <span className="faq-admin-badge">
          {itens.length} pergunta(s) cadastrada(s)
        </span>
      </div>

      <div className="faq-admin-grid">
        <div className="faq-admin-card faq-admin-card-full">
          <div className="faq-admin-card-header">
            <div className="faq-admin-card-title-row">
              <h3>{editandoId ? "Editar pergunta" : "Nova pergunta"}</h3>
              {editandoId && (
                <button
                  type="button"
                  className="faq-admin-btn-secondary"
                  onClick={limparFormulario}
                >
                  <CloseRounded fontSize="small" />
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
                <EventRounded fontSize="small" />
                Validade da cotação (opcional)
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
              <label>Pergunta</label>
              <input
                type="text"
                className="faq-admin-input"
                placeholder="Ex: Quantas malas cabem no veículo executivo?"
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
              <label>Resposta</label>
              <textarea
                className="faq-admin-textarea"
                rows={5}
                placeholder="Escreva a resposta completa, do jeito que o comercial deve repassar ao cliente."
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

          <div className="faq-admin-veiculo-section">
            <div className="faq-admin-veiculo-header">
              <DirectionsCarRounded fontSize="small" />
              <div>
                <strong>Detalhes do veículo (opcional)</strong>
                <span>
                  Preencha só se a pergunta tiver relação com um veículo
                  específico — isso habilita foto(s) e link no modal de detalhes
                  que o comercial vê.
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
                <label>URLs das imagens (uma por linha)</label>
                <textarea
                  className="faq-admin-textarea"
                  rows={3}
                  placeholder={
                    "https://exemplo.com/foto-frente.jpg\nhttps://exemplo.com/foto-interior.jpg"
                  }
                  value={formulario.imagensVeiculoTexto}
                  onChange={(e) =>
                    setFormulario((prev) => ({
                      ...prev,
                      imagensVeiculoTexto: e.target.value,
                    }))
                  }
                  disabled={salvando}
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
                  Veículo fora do catálogo atual (o modal busca imagens no
                  Google em vez do link oficial)
                </label>
              </div>
            </div>

            {formulario.imagensVeiculoTexto.trim() && (
              <div className="faq-admin-veiculo-preview-multi">
                {formulario.imagensVeiculoTexto
                  .split("\n")
                  .map((url) => url.trim())
                  .filter(Boolean)
                  .map((url, i) => (
                    <img
                      key={`${url}-${i}`}
                      src={url}
                      alt={`${formulario.nomeVeiculo || "Veículo"} ${i + 1}`}
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ))}
              </div>
            )}
          </div>

          <div className="faq-admin-actions">
            <button
              type="button"
              className="faq-admin-btn-primary"
              onClick={salvarItem}
              disabled={salvando}
            >
              <SaveRounded fontSize="small" />
              {salvando
                ? "Salvando..."
                : editandoId
                  ? "Salvar alterações"
                  : "Cadastrar pergunta"}
            </button>
          </div>
        </div>

        <div className="faq-admin-card faq-admin-card-full">
          <div className="faq-admin-card-header">
            <div className="faq-admin-card-title-row">
              <h3>Perguntas cadastradas</h3>
              <span className="faq-admin-badge">
                {itensFiltrados.length} resultado(s)
              </span>
            </div>
          </div>

          <div className="faq-admin-toolbar">
            <div className="faq-admin-field">
              <label>
                <SearchRounded fontSize="small" />
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
                <FilterAltRounded fontSize="small" />
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
                <FilterAltRounded fontSize="small" />
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
                <InsightsRounded fontSize="small" />
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

                return (
                  <div
                    key={item.id}
                    className={`faq-admin-item ${item.ativo === false ? "inativo" : ""}`}
                  >
                    <div className="faq-admin-item-topo">
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
                          <StarRounded fontSize="small" />
                          Destaque
                        </span>
                      )}

                      {item.validade && (
                        <span
                          className={`faq-admin-validade-badge ${
                            vencida
                              ? "vencida"
                              : venceBreve
                                ? "vence-breve"
                                : ""
                          }`}
                        >
                          <EventRounded fontSize="small" />
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
                    <p className="faq-admin-item-resposta">{item.resposta}</p>

                    <div className="faq-admin-stats-line">
                      <InsightsRounded fontSize="small" />
                      {Number(item.contadorVisualizacoes || 0)} visualizações ·{" "}
                      {Number(item.contadorCopias || 0)} cópias
                      {item.atualizadoEm &&
                        ` · atualizado ${formatarTempoRelativo(item.atualizadoEm)}`}
                    </div>

                    {item.nomeVeiculo && (
                      <div className="faq-admin-veiculo-tag">
                        <DirectionsCarRounded fontSize="small" />
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
                          <StarRounded fontSize="small" />
                        ) : (
                          <StarBorderRounded fontSize="small" />
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
                          <VisibilityOffRounded fontSize="small" />
                        ) : (
                          <VisibilityRounded fontSize="small" />
                        )}
                      </button>

                      <button
                        type="button"
                        className="faq-admin-icon-btn"
                        onClick={() => duplicarItem(item)}
                        title="Duplicar"
                      >
                        <ContentCopyRounded fontSize="small" />
                      </button>

                      <button
                        type="button"
                        className="faq-admin-icon-btn"
                        onClick={() => abrirEdicao(item)}
                        title="Editar"
                      >
                        <EditRounded fontSize="small" />
                      </button>

                      <button
                        type="button"
                        className="faq-admin-icon-btn danger"
                        onClick={() => removerItem(item)}
                        disabled={removendoId === item.id}
                        title="Remover"
                      >
                        <DeleteRounded fontSize="small" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FaqAdmin;
