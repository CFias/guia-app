import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  increment,
} from "firebase/firestore";
import { db } from "../../Services/Services/firebase";
import CardSkeleton from "../../components/CardSkeleton/CardSkeleton";
import "./styles.css";
import Icon from "../ui/Icon";
import { iconeMui } from "../ui/iconeMui";
import Drawer from "../ui/Drawer";
import Button from "../ui/Button";
import Segmented from "../ui/Segmented";
import PageHeader from "../ui/PageHeader";
import AssistenteVeiculo from "./AssistenteVeiculo";
import {
  FORMATOS,
  MENSAGEM_VENCIDA,
  obterFormato,
  obterFichaVeiculo,
  fichaTemDados,
  obterTabelaPrecos,
  formatarValor,
  iconeRecurso,
  montarTextoCopia,
  montarTextoLinhaPreco,
  textoPrevia,
  ehConfigAssistente,
  normalizarConfigAssistente,
  recomendarVeiculo,
  descreverCombinacoes,
} from "./catalogo";

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

// Suporta o campo antigo (imagemVeiculoUrl) e o novo (imagensVeiculo).
const obterImagensVeiculo = (item) => {
  if (Array.isArray(item?.imagensVeiculo) && item.imagensVeiculo.length) {
    return item.imagensVeiculo;
  }
  if (item?.imagemVeiculoUrl) return [item.imagemVeiculoUrl];
  return [];
};

// Link de detalhe do veículo: fora do catálogo (ou sem link oficial
// cadastrado) cai numa busca de imagens do Google pelo nome — sempre
// pensado pra abrir em nova aba.
const obterLinkDetalheVeiculo = (item) => {
  const nome = String(item?.nomeVeiculo || "").trim();
  const linkOficial = String(item?.linkOficialVeiculo || "").trim();

  if (!item?.veiculoForaCatalogo && linkOficial) {
    return { url: linkOficial, tipo: "oficial" };
  }

  if (nome) {
    return {
      url: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(nome)}`,
      tipo: "google",
    };
  }

  return null;
};

const normalizarTexto = (texto = "") =>
  String(texto)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

// Mesma paleta e mesma lógica de hash do painel administrativo — pra
// cada categoria sair com a cor e o ícone idênticos nas duas telas.
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

// Formatação leve, no mesmo padrão do WhatsApp: *negrito* e linhas
// começando com "- " viram lista. Sem dependências externas.
const processarNegrito = (texto, prefixo) => {
  const partes = String(texto).split(/\*(.+?)\*/g);
  return partes.map((parte, i) =>
    i % 2 === 1 ? <strong key={`${prefixo}-b-${i}`}>{parte}</strong> : parte,
  );
};

const renderizarResposta = (texto = "") => {
  const linhas = String(texto).split("\n");
  const blocos = [];
  let listaAtual = null;

  linhas.forEach((linha) => {
    const linhaTrim = linha.trim();
    const ehItemLista = /^[-*]\s+/.test(linhaTrim);

    if (ehItemLista) {
      if (!listaAtual) listaAtual = [];
      listaAtual.push(linhaTrim.replace(/^[-*]\s+/, ""));
    } else {
      if (listaAtual) {
        blocos.push({ tipo: "lista", itens: listaAtual });
        listaAtual = null;
      }
      if (linhaTrim) {
        blocos.push({ tipo: "paragrafo", texto: linha });
      }
    }
  });

  if (listaAtual) blocos.push({ tipo: "lista", itens: listaAtual });

  return blocos.map((bloco, i) => {
    if (bloco.tipo === "lista") {
      return (
        <ul key={i} className="faq-resposta-lista">
          {bloco.itens.map((itemTexto, j) => (
            <li key={j}>{processarNegrito(itemTexto, `${i}-${j}`)}</li>
          ))}
        </ul>
      );
    }
    return (
      <p key={i} className="faq-resposta-paragrafo">
        {processarNegrito(bloco.texto, `${i}`)}
      </p>
    );
  });
};

const linkPerguntarOperacional = (contexto = "") => {
  const texto = contexto.trim()
    ? `Olá! Não encontrei uma resposta pra: "${contexto.trim()}". Pode me ajudar?`
    : "Olá! Preciso de uma informação que não encontrei na Central de Dúvidas. Pode me ajudar?";

  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
};

const ordenarPorPergunta = (a, b) =>
  (a.pergunta || "").localeCompare(b.pergunta || "", "pt-BR", {
    sensitivity: "base",
  });

// destaques primeiro, depois ordem alfabética
const ordenarComDestaque = (a, b) => {
  if (!!b.destaque !== !!a.destaque) return b.destaque ? 1 : -1;
  return ordenarPorPergunta(a, b);
};

const textoBuscavel = (item) => {
  const ficha = obterFichaVeiculo(item);
  return normalizarTexto(
    [
      item.categoria,
      item.pergunta,
      item.resposta,
      item.nomeVeiculo,
      ficha.tipoVeiculo,
      ...ficha.recursos,
      ...obterTabelaPrecos(item).flatMap((l) => [l.servico, l.detalhe]),
      ...(Array.isArray(item.palavrasChave) ? item.palavrasChave : []),
    ]
      .filter(Boolean)
      .join(" "),
  );
};

// Veículo comporta o grupo? null = ficha sem o dado (não dá pra afirmar).
const veiculoComporta = (ficha, pax, malas) => {
  if (!pax && !malas) return null;
  if (pax && ficha.passageiros === null) return null;
  if (malas && ficha.malasGrandes === null) return null;
  return (!pax || ficha.passageiros >= pax) && (!malas || ficha.malasGrandes >= malas);
};

const SEGMENTOS = [
  { value: "todos", label: "Tudo", icon: "grid" },
  { value: FORMATOS.VEICULO, label: "Frota", icon: "car" },
  { value: FORMATOS.TABELA, label: "Valores", icon: "tag" },
  { value: FORMATOS.RESPOSTA, label: "Respostas", icon: "message" },
];

const FaqComercial = () => {
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [categoriaAtiva, setCategoriaAtiva] = useState("todas");
  const [formatoAtivo, setFormatoAtivo] = useState("todos");
  const [perguntaCopiadaId, setPerguntaCopiadaId] = useState(null);
  const [itemDetalhado, setItemDetalhado] = useState(null);
  const [grupo, setGrupo] = useState({
    pax: 0,
    grandes: 0,
    bordo: 0,
    especiais: {},
  });
  const [configAssistente, setConfigAssistente] = useState(() =>
    normalizarConfigAssistente(null),
  );

  useEffect(() => {
    const carregar = async () => {
      try {
        setLoading(true);
        const snap = await getDocs(collection(db, "faq_itens"));

        const todos = snap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));

        // a configuração do assistente mora na mesma coleção
        setConfigAssistente(
          normalizarConfigAssistente(todos.find(ehConfigAssistente)),
        );

        const lista = todos
          .filter((item) => !ehConfigAssistente(item))
          .filter((item) => item.ativo !== false)
          .sort(ordenarPorPergunta);

        setItens(lista);
      } catch (err) {
        console.error("Erro ao carregar perguntas frequentes:", err);
      } finally {
        setLoading(false);
      }
    };

    carregar();
  }, []);

  const categorias = useMemo(() => {
    const unicas = new Set(itens.map((item) => item.categoria).filter(Boolean));
    return Array.from(unicas).sort((a, b) =>
      a.localeCompare(b, "pt-BR", { sensitivity: "base" }),
    );
  }, [itens]);

  const contagemFormatos = useMemo(() => {
    const contagem = { todos: itens.length };
    itens.forEach((item) => {
      const f = obterFormato(item);
      contagem[f] = (contagem[f] || 0) + 1;
    });
    return contagem;
  }, [itens]);

  const modoVitrine =
    !busca.trim() && categoriaAtiva === "todas" && formatoAtivo === "todos";

  const itensFiltrados = useMemo(() => {
    const termo = normalizarTexto(busca);

    return itens
      .filter((item) => {
        if (categoriaAtiva !== "todas" && item.categoria !== categoriaAtiva)
          return false;
        if (formatoAtivo !== "todos" && obterFormato(item) !== formatoAtivo)
          return false;
        if (!termo) return true;
        return textoBuscavel(item).includes(termo);
      })
      .sort(ordenarComDestaque);
  }, [itens, busca, categoriaAtiva, formatoAtivo]);

  const resultadoAssistente = useMemo(
    () => recomendarVeiculo(configAssistente, grupo),
    [configAssistente, grupo],
  );

  // Selo de cada veículo na frota conforme o grupo do assistente:
  // "recomendado" | "comporta" | "nao" | null (sem dado para afirmar).
  const seloVeiculo = useMemo(() => {
    const { preenchido, recomendada, alternativas } = resultadoAssistente;
    const vinculados = new Set(
      configAssistente.opcoes.flatMap((o) => o.veiculosIds),
    );
    const daRecomendada = new Set(recomendada?.veiculosIds || []);
    const dasAlternativas = new Set(alternativas.flatMap((o) => o.veiculosIds));

    return (item) => {
      if (!preenchido) return null;
      if (daRecomendada.has(item.id)) return "recomendado";
      if (dasAlternativas.has(item.id)) return "comporta";
      if (vinculados.has(item.id)) return "nao";
      const cabe = veiculoComporta(
        obterFichaVeiculo(item),
        resultadoAssistente.efetivo.pax,
        resultadoAssistente.efetivo.grandes,
      );
      return cabe === null ? null : cabe ? "comporta" : "nao";
    };
  }, [resultadoAssistente, configAssistente]);

  const veiculos = useMemo(() => {
    // vitrine da frota: do menor para o maior (sem ficha vai para o fim)
    const capacidade = (item) => obterFichaVeiculo(item).passageiros ?? 999;
    const lista = itensFiltrados
      .filter((item) => obterFormato(item) === FORMATOS.VEICULO)
      .sort((a, b) => capacidade(a) - capacidade(b) || ordenarPorPergunta(a, b));
    if (!resultadoAssistente.preenchido) return lista;

    // com o grupo informado: recomendado primeiro, depois quem comporta
    const ORDEM = { recomendado: 0, comporta: 1, null: 2, nao: 3 };
    const peso = (item) => ORDEM[seloVeiculo(item)];
    return [...lista].sort(
      (a, b) =>
        peso(a) - peso(b) ||
        (obterFichaVeiculo(a).passageiros ?? 999) -
        (obterFichaVeiculo(b).passageiros ?? 999),
    );
  }, [itensFiltrados, resultadoAssistente, seloVeiculo]);

  const tabelas = useMemo(
    () => itensFiltrados.filter((item) => obterFormato(item) === FORMATOS.TABELA),
    [itensFiltrados],
  );

  // Respostas prontas numa grade só, ordenadas por categoria (a categoria
  // aparece em cada card; os chips do topo filtram por ela).
  const respostas = useMemo(
    () =>
      itensFiltrados
        .filter((item) => obterFormato(item) === FORMATOS.RESPOSTA)
        .sort(
          (a, b) =>
            (a.categoria || "Outros").localeCompare(
              b.categoria || "Outros",
              "pt-BR",
              { sensitivity: "base" },
            ) || ordenarComDestaque(a, b),
        ),
    [itensFiltrados],
  );

  // "Mais buscadas": atalhos no topo da vitrine.
  const itensDestaque = useMemo(
    () => itens.filter((item) => item.destaque && !itemEstaVencido(item)),
    [itens],
  );

  const registrarUso = async (item, campo) => {
    try {
      await updateDoc(doc(db, "faq_itens", item.id), {
        [campo]: increment(1),
      });
    } catch (err) {
      console.error(`Erro ao registrar ${campo}:`, err);
    }
  };

  const abrirDetalhe = (item) => {
    setItemDetalhado(item);
    registrarUso(item, "contadorVisualizacoes");
  };

  const marcarCopiado = (chave) => {
    setPerguntaCopiadaId(chave);
    setTimeout(() => {
      setPerguntaCopiadaId((atual) => (atual === chave ? null : atual));
    }, 1800);
  };

  const copiarResposta = async (item) => {
    try {
      await navigator.clipboard.writeText(
        montarTextoCopia(item, itemEstaVencido(item)),
      );
      marcarCopiado(item.id);
      registrarUso(item, "contadorCopias");
    } catch (err) {
      console.error("Erro ao copiar resposta:", err);
      alert("Não foi possível copiar a resposta.");
    }
  };

  const copiarLinhaPreco = async (item, linha, indice) => {
    try {
      await navigator.clipboard.writeText(montarTextoLinhaPreco(item, linha));
      marcarCopiado(`${item.id}#${indice}`);
      registrarUso(item, "contadorCopias");
    } catch (err) {
      console.error("Erro ao copiar valor:", err);
      alert("Não foi possível copiar o valor.");
    }
  };

  const compartilharWhatsapp = (item) => {
    const texto = montarTextoCopia(item, itemEstaVencido(item));

    window.open(
      `https://wa.me/?text=${encodeURIComponent(texto)}`,
      "_blank",
      "noopener,noreferrer",
    );
    registrarUso(item, "contadorCopias");
  };

  const limparFiltros = () => {
    setBusca("");
    setCategoriaAtiva("todas");
    setFormatoAtivo("todos");
  };

  const acoesCard = {
    onAbrir: abrirDetalhe,
    onCopiar: copiarResposta,
    onCompartilhar: compartilharWhatsapp,
  };

  const mostrarAssistente =
    configAssistente.opcoes.some((o) => o.ativo && o.nome) &&
    (formatoAtivo === "todos" || formatoAtivo === FORMATOS.VEICULO);

  const mostrarFrota =
    veiculos.length > 0 &&
    (formatoAtivo === "todos" || formatoAtivo === FORMATOS.VEICULO);
  const mostrarTabelas =
    tabelas.length > 0 &&
    (formatoAtivo === "todos" || formatoAtivo === FORMATOS.TABELA);
  const mostrarRespostas =
    respostas.length > 0 &&
    (formatoAtivo === "todos" || formatoAtivo === FORMATOS.RESPOSTA);

  return (
    <div className="ui-page faq-cat">
      <PageHeader
        title="Central de Dúvidas"
        description="Catálogo de respostas prontas: frota, valores e políticas para agilizar o atendimento."
        actions={
          <a
            className="ui-btn ui-btn--secondary"
            href={linkPerguntarOperacional(busca)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="message" size={15} />
            Perguntar ao operacional
          </a>
        }
      />

      <div className="faq-cat-busca">
        <Icon name="search" size={18} />
        <input
          type="text"
          placeholder="O que o cliente perguntou? Ex.: malas na Spin, motoguia, cancelamento, criança…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar na Central de Dúvidas"
        />
        {busca && (
          <button
            type="button"
            className="faq-cat-busca-limpar"
            onClick={() => setBusca("")}
            aria-label="Limpar busca"
          >
            <Icon name="x" size={15} />
          </button>
        )}
      </div>

      <div className="faq-cat-filtros">
        <Segmented
          options={SEGMENTOS.map((s) => ({
            ...s,
            count: contagemFormatos[s.value] || 0,
          }))}
          value={formatoAtivo}
          onChange={setFormatoAtivo}
          ariaLabel="Tipo de conteúdo"
        />

        {categorias.length > 0 && (
          <div className="faq-cat-chips" role="list">
            <button
              type="button"
              className={`faq-cat-chip ${categoriaAtiva === "todas" ? "is-active" : ""}`}
              onClick={() => setCategoriaAtiva("todas")}
            >
              Todas as categorias
            </button>
            {categorias.map((cat) => {
              const Icone = obterIconeCategoria(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  className={`faq-cat-chip ${categoriaAtiva === cat ? "is-active" : ""}`}
                  style={{ "--cor-categoria": obterCorCategoria(cat) }}
                  onClick={() =>
                    setCategoriaAtiva(categoriaAtiva === cat ? "todas" : cat)
                  }
                >
                  <Icone fontSize="small" />
                  {cat}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {!loading && mostrarAssistente && (
        <AssistenteVeiculo
          config={configAssistente}
          veiculos={itens.filter((i) => obterFormato(i) === FORMATOS.VEICULO)}
          grupo={grupo}
          onGrupoChange={setGrupo}
          onAbrirVeiculo={abrirDetalhe}
        />
      )}

      {loading ? (
        <CardSkeleton variant="list" rows={6} />
      ) : itensFiltrados.length === 0 ? (
        <div className="faq-cat-vazio">
          <span className="faq-cat-vazio-icone">
            <Icon name="search" size={22} />
          </span>
          <strong>
            {itens.length === 0
              ? "Nenhuma resposta cadastrada ainda."
              : "Nada encontrado com esses filtros."}
          </strong>
          <span>
            Tente outra palavra ou pergunte direto ao operacional — a resposta
            pode virar um item novo do catálogo.
          </span>
          <div className="faq-cat-vazio-acoes">
            {itens.length > 0 && (
              <Button variant="ghost" icon="undo" onClick={limparFiltros}>
                Limpar filtros
              </Button>
            )}
            <a
              className="ui-btn ui-btn--primary"
              href={linkPerguntarOperacional(busca)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon name="message" size={15} />
              Perguntar ao operacional
            </a>
          </div>
        </div>
      ) : (
        <div className="faq-cat-conteudo">
          {modoVitrine && itensDestaque.length > 0 && (
            <div className="faq-cat-atalhos">
              <span className="faq-cat-atalhos-titulo">
                <Icon name="star" size={14} />
                Mais buscadas
              </span>
              {itensDestaque.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="faq-cat-atalho"
                  onClick={() => abrirDetalhe(item)}
                >
                  {obterFormato(item) === FORMATOS.VEICULO
                    ? item.nomeVeiculo || item.pergunta
                    : item.pergunta}
                </button>
              ))}
            </div>
          )}

          {mostrarFrota && (
            <section className="faq-cat-secao">
              <header className="faq-cat-secao-topo">
                <div className="faq-cat-secao-titulos">
                  <h2>
                    <Icon name="car" size={18} />
                    Frota
                    <span className="faq-cat-contador">{veiculos.length}</span>
                  </h2>
                  <p>Fotos, capacidade e itens de cada veículo.</p>
                </div>

              </header>

              <div className="faq-cat-grade faq-cat-grade--frota">
                {veiculos.map((item) => (
                  <CardVeiculo
                    key={item.id}
                    item={item}
                    {...acoesCard}
                    copiado={perguntaCopiadaId === item.id}
                    selo={seloVeiculo(item)}
                  />
                ))}
              </div>
            </section>
          )}

          {mostrarTabelas && (
            <section className="faq-cat-secao">
              <header className="faq-cat-secao-topo">
                <div className="faq-cat-secao-titulos">
                  <h2>
                    <Icon name="tag" size={18} />
                    Valores
                    <span className="faq-cat-contador">{tabelas.length}</span>
                  </h2>
                  <p>Tabelas por serviço — copie a tabela inteira ou só a linha.</p>
                </div>
              </header>

              <div className="faq-cat-grade faq-cat-grade--valores">
                {tabelas.map((item) => (
                  <CardTabela
                    key={item.id}
                    item={item}
                    {...acoesCard}
                    copiado={perguntaCopiadaId === item.id}
                  />
                ))}
              </div>
            </section>
          )}

          {mostrarRespostas && (
            <section className="faq-cat-secao">
              <header className="faq-cat-secao-topo">
                <div className="faq-cat-secao-titulos">
                  <h2>
                    <Icon name="message" size={18} />
                    Respostas prontas
                    <span className="faq-cat-contador">{respostas.length}</span>
                  </h2>
                  <p>Abra para ler inteira, ou copie direto do card.</p>
                </div>
              </header>

              <div className="faq-cat-grade faq-cat-grade--respostas">
                {respostas.map((item) => (
                  <CardResposta
                    key={item.id}
                    item={item}
                    {...acoesCard}
                    copiado={perguntaCopiadaId === item.id}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {!loading && itens.length > 0 && itensFiltrados.length > 0 && (
        <div className="faq-cat-rodape">
          Não encontrou o que procurava?{" "}
          <a
            href={linkPerguntarOperacional(busca)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Fale com o operacional
          </a>
        </div>
      )}

      {itemDetalhado && (
        <FaqDetalhe
          key={itemDetalhado.id}
          item={itemDetalhado}
          onFechar={() => setItemDetalhado(null)}
          onCopiar={() => copiarResposta(itemDetalhado)}
          onCompartilhar={() => compartilharWhatsapp(itemDetalhado)}
          onCopiarLinha={(linha, i) => copiarLinhaPreco(itemDetalhado, linha, i)}
          configAssistente={configAssistente}
          copiadoId={perguntaCopiadaId}
        />
      )}
    </div>
  );
};

/* ---------- peças do catálogo ---------- */

const SeloValidade = ({ item }) => {
  const vencida = itemEstaVencido(item);
  if (vencida) {
    return (
      <span className="faq-cat-selo is-alerta">
        <Icon name="alert" size={12} />
        Vencida em {formatarDataBr(item.validade)}
      </span>
    );
  }
  if (itemVenceEmBreve(item)) {
    return (
      <span className="faq-cat-selo is-aviso">
        <Icon name="calendar" size={12} />
        Vence em {diasParaVencer(item)} dia(s)
      </span>
    );
  }
  if (item.validade) {
    return (
      <span className="faq-cat-selo">
        <Icon name="calendar" size={12} />
        Válida até {formatarDataBr(item.validade)}
      </span>
    );
  }
  return null;
};

const SeloCategoria = ({ categoria }) => {
  if (!categoria) return null;
  const Icone = obterIconeCategoria(categoria);
  return (
    <span
      className="faq-cat-selo-categoria"
      style={{ "--cor-categoria": obterCorCategoria(categoria) }}
    >
      <Icone fontSize="small" />
      {categoria}
    </span>
  );
};

const AcoesRapidas = ({ item, onCopiar, onCompartilhar, copiado }) => (
  <div className="faq-cat-acoes" onClick={(e) => e.stopPropagation()}>
    <button
      type="button"
      className="faq-cat-acao"
      onClick={() => onCompartilhar(item)}
      title="Enviar no WhatsApp"
      aria-label="Enviar no WhatsApp"
    >
      <Icon name="message" size={15} />
    </button>
    <button
      type="button"
      className={`faq-cat-acao ${copiado ? "is-ok" : ""}`}
      onClick={() => onCopiar(item)}
      title={copiado ? "Copiado!" : "Copiar texto pronto"}
      aria-label={copiado ? "Copiado!" : "Copiar texto pronto"}
    >
      <Icon name={copiado ? "check" : "copy"} size={15} />
    </button>
  </div>
);

const propsCardClicavel = (item, onAbrir) => ({
  role: "button",
  tabIndex: 0,
  onClick: () => onAbrir(item),
  onKeyDown: (e) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onAbrir(item);
    }
  },
});

const Especificacoes = ({ ficha, compacto = false }) => {
  const specs = [
    { icone: "users", valor: ficha.passageiros, rotulo: "passageiros", curto: "pax" },
    { icone: "briefcase", valor: ficha.malasGrandes, rotulo: "malas grandes (23 kg)", curto: "grandes" },
    { icone: "briefcase", valor: ficha.malasBordo, rotulo: "malas de bordo (10 kg)", curto: "bordo", leve: true },
  ].filter((s) => s.valor !== null);

  if (!specs.length) return null;

  return (
    <div className={`faq-cat-specs ${compacto ? "is-compacto" : ""}`}>
      {specs.map((s) => (
        <div key={s.rotulo} className={`faq-cat-spec ${s.leve ? "is-leve" : ""}`}>
          <Icon name={s.icone} size={compacto ? 14 : 18} />
          <strong>{s.valor}</strong>
          <span>{compacto ? s.curto : s.rotulo}</span>
        </div>
      ))}
    </div>
  );
};

const TEXTO_SELO = {
  recomendado: { texto: "Recomendado", icone: "sparkles" },
  comporta: { texto: "Também atende", icone: "check" },
  nao: { texto: "Não comporta", icone: "x" },
};

const CardVeiculo = ({ item, onAbrir, onCopiar, onCompartilhar, copiado, selo }) => {
  const ficha = obterFichaVeiculo(item);
  const imagens = item.veiculoForaCatalogo ? [] : obterImagensVeiculo(item);
  const nome = item.nomeVeiculo || item.pergunta;
  const temFicha = fichaTemDados(ficha);

  return (
    <article
      className={`faq-cat-card faq-cat-veiculo ${selo === "recomendado"
          ? "is-comporta"
          : selo === "nao"
            ? "is-nao-comporta"
            : ""
        }`}
      {...propsCardClicavel(item, onAbrir)}
    >
      <div className="faq-cat-veiculo-foto">
        {imagens.length > 0 ? (
          <img src={imagens[0]} alt={nome} loading="lazy" />
        ) : (
          <div className="faq-cat-veiculo-sem-foto">
            <Icon name="car" size={34} />
            <span>Sem foto</span>
          </div>
        )}
        <div className="faq-cat-veiculo-selos">
          {ficha.tipoVeiculo && (
            <span className="faq-cat-foto-selo">{ficha.tipoVeiculo}</span>
          )}
          {item.destaque && (
            <span className="faq-cat-foto-selo is-destaque" title="Mais buscada">
              <Icon name="star" size={12} />
            </span>
          )}
        </div>
        {imagens.length > 1 && (
          <span className="faq-cat-foto-contagem">
            <Icon name="image" size={12} />
            {imagens.length}
          </span>
        )}
        {selo && (
          <span className={`faq-cat-cabe is-${selo}`}>
            <Icon name={TEXTO_SELO[selo].icone} size={12} />
            {TEXTO_SELO[selo].texto}
          </span>
        )}
      </div>

      <div className="faq-cat-card-corpo">
        <h3 className="faq-cat-card-titulo">{nome}</h3>
        {item.nomeVeiculo && item.pergunta && item.pergunta !== item.nomeVeiculo && (
          <p className="faq-cat-card-sub">{item.pergunta}</p>
        )}

        {temFicha ? (
          <Especificacoes ficha={ficha} compacto />
        ) : (
          <p className="faq-cat-card-previa">{textoPrevia(item.resposta)}</p>
        )}

        {ficha.recursos.length > 0 && (
          <div className="faq-cat-recursos-mini">
            {ficha.recursos.slice(0, 5).map((r) => (
              <span key={r} title={r}>
                <Icon name={iconeRecurso(r)} size={14} />
              </span>
            ))}
            {ficha.recursos.length > 5 && <em>+{ficha.recursos.length - 5}</em>}
          </div>
        )}
      </div>

      <footer className="faq-cat-card-rodape">
        <span className="faq-cat-ver">
          Ver ficha <Icon name="arrowRight" size={13} />
        </span>
        <AcoesRapidas
          item={item}
          onCopiar={onCopiar}
          onCompartilhar={onCompartilhar}
          copiado={copiado}
        />
      </footer>
    </article>
  );
};

const LINHAS_NO_CARD = 4;

const CardTabela = ({ item, onAbrir, onCopiar, onCompartilhar, copiado }) => {
  const linhas = obterTabelaPrecos(item);
  const vencida = itemEstaVencido(item);

  return (
    <article
      className={`faq-cat-card faq-cat-tabela ${vencida ? "is-vencida" : ""}`}
      {...propsCardClicavel(item, onAbrir)}
    >
      <div className="faq-cat-card-corpo">
        <div className="faq-cat-tabela-topo">
          <span className="faq-cat-tile">
            <Icon name="tag" size={18} />
          </span>
          <div>
            <h3 className="faq-cat-card-titulo">
              {item.pergunta}
              {item.destaque && (
                <Icon name="star" size={14} className="faq-cat-estrela" />
              )}
            </h3>
            <div className="faq-cat-card-selos">
              <SeloCategoria categoria={item.categoria} />
              <SeloValidade item={item} />
            </div>
          </div>
        </div>

        {vencida ? (
          <p className="faq-cat-vencida-aviso">
            <Icon name="alert" size={14} />
            {MENSAGEM_VENCIDA}
          </p>
        ) : linhas.length > 0 ? (
          <ul className="faq-cat-precos">
            {linhas.slice(0, LINHAS_NO_CARD).map((linha, i) => (
              <li key={`${linha.servico}-${i}`}>
                <span className="faq-cat-preco-servico">{linha.servico}</span>
                <span className="faq-cat-preco-pontos" aria-hidden="true" />
                <strong className="ui-cell-num">{formatarValor(linha.valor)}</strong>
              </li>
            ))}
            {linhas.length > LINHAS_NO_CARD && (
              <li className="faq-cat-precos-mais">
                + {linhas.length - LINHAS_NO_CARD} serviço(s)
              </li>
            )}
          </ul>
        ) : (
          <p className="faq-cat-card-previa">{textoPrevia(item.resposta)}</p>
        )}
      </div>

      <footer className="faq-cat-card-rodape">
        <span className="faq-cat-ver">
          Ver tabela <Icon name="arrowRight" size={13} />
        </span>
        <AcoesRapidas
          item={item}
          onCopiar={onCopiar}
          onCompartilhar={onCompartilhar}
          copiado={copiado}
        />
      </footer>
    </article>
  );
};

const CardResposta = ({ item, onAbrir, onCopiar, onCompartilhar, copiado }) => {
  const vencida = itemEstaVencido(item);

  return (
    <article
      className={`faq-cat-card faq-cat-resposta ${vencida ? "is-vencida" : ""}`}
      {...propsCardClicavel(item, onAbrir)}
    >
      <div className="faq-cat-card-corpo">
        <div className="faq-cat-card-selos">
          <SeloCategoria categoria={item.categoria} />
          {item.destaque && !vencida && (
            <span className="faq-cat-selo is-destaque">
              <Icon name="star" size={12} />
              Mais buscada
            </span>
          )}
          <SeloValidade item={item} />
        </div>
        <h3 className="faq-cat-card-titulo">{item.pergunta}</h3>
        {vencida ? (
          <p className="faq-cat-vencida-aviso">
            <Icon name="alert" size={14} />
            {MENSAGEM_VENCIDA}
          </p>
        ) : (
          <p className="faq-cat-card-previa">{textoPrevia(item.resposta)}</p>
        )}
      </div>

      <footer className="faq-cat-card-rodape">
        <span className="faq-cat-ver">
          Ler resposta <Icon name="arrowRight" size={13} />
        </span>
        <AcoesRapidas
          item={item}
          onCopiar={onCopiar}
          onCompartilhar={onCompartilhar}
          copiado={copiado}
        />
      </footer>
    </article>
  );
};

/* ---------- detalhe (painel lateral) ---------- */

const Galeria = ({ imagens, nome }) => {
  const [indice, setIndice] = useState(0);

  if (!imagens.length) {
    return (
      <div className="faq-cat-galeria faq-cat-galeria--vazia">
        <Icon name="car" size={40} />
        <span>Sem foto cadastrada</span>
      </div>
    );
  }

  const anterior = () => setIndice((i) => (i === 0 ? imagens.length - 1 : i - 1));
  const proxima = () => setIndice((i) => (i === imagens.length - 1 ? 0 : i + 1));

  return (
    <div className="faq-cat-galeria">
      <div className="faq-cat-galeria-principal">
        <img src={imagens[indice]} alt={`${nome} — foto ${indice + 1}`} />
        {imagens.length > 1 && (
          <>
            <button
              type="button"
              className="faq-cat-galeria-seta is-esq"
              onClick={anterior}
              aria-label="Imagem anterior"
            >
              <Icon name="chevronLeft" size={18} />
            </button>
            <button
              type="button"
              className="faq-cat-galeria-seta is-dir"
              onClick={proxima}
              aria-label="Próxima imagem"
            >
              <Icon name="chevronRight" size={18} />
            </button>
            <span className="faq-cat-foto-contagem">
              {indice + 1} / {imagens.length}
            </span>
          </>
        )}
      </div>
      {imagens.length > 1 && (
        <div className="faq-cat-galeria-miniaturas">
          {imagens.map((url, i) => (
            <button
              key={`${url}-${i}`}
              type="button"
              className={i === indice ? "is-ativa" : ""}
              onClick={() => setIndice(i)}
              aria-label={`Ver foto ${i + 1}`}
            >
              <img src={url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const FaqDetalhe = ({
  item,
  onFechar,
  onCopiar,
  onCompartilhar,
  onCopiarLinha,
  copiadoId,
  configAssistente,
}) => {
  const configuracoes = (configAssistente?.opcoes || []).filter(
    (o) => o.ativo && o.veiculosIds.includes(item.id),
  );
  const formato = obterFormato(item);
  const vencida = itemEstaVencido(item);
  const copiado = copiadoId === item.id;
  const ficha = obterFichaVeiculo(item);
  const linhas = obterTabelaPrecos(item);
  const linkVeiculo = obterLinkDetalheVeiculo(item);
  const imagens = item.veiculoForaCatalogo ? [] : obterImagensVeiculo(item);
  const ehVeiculo = formato === FORMATOS.VEICULO;
  const ehTabela = formato === FORMATOS.TABELA;

  const titulo = ehVeiculo ? item.nomeVeiculo || item.pergunta : item.pergunta;

  return (
    <Drawer
      open
      width={ehVeiculo || ehTabela ? 560 : 500}
      title={titulo}
      subtitle={
        ehVeiculo
          ? [ficha.tipoVeiculo, item.categoria].filter(Boolean).join(" · ")
          : item.categoria
      }
      onClose={onFechar}
      footer={
        <>
          <Button variant="secondary" icon="message" onClick={onCompartilhar}>
            Enviar no WhatsApp
          </Button>
          <Button
            variant="primary"
            icon={copiado ? "check" : "copy"}
            onClick={onCopiar}
          >
            {copiado ? "Copiado!" : ehTabela ? "Copiar tabela" : "Copiar texto"}
          </Button>
        </>
      }
    >
      <div className="faq-cat-detalhe">
        {(item.destaque || item.validade) && (
          <div className="faq-cat-card-selos">
            {item.destaque && !vencida && (
              <span className="faq-cat-selo is-destaque">
                <Icon name="star" size={12} />
                Mais buscada
              </span>
            )}
            <SeloValidade item={item} />
          </div>
        )}

        {ehVeiculo && (
          <>
            <Galeria imagens={imagens} nome={titulo} />

            {item.nomeVeiculo && item.pergunta && item.pergunta !== item.nomeVeiculo && (
              <p className="faq-cat-detalhe-pergunta">{item.pergunta}</p>
            )}

            {fichaTemDados(ficha) && (
              <div className="faq-cat-bloco">
                <h4>Capacidade</h4>
                <Especificacoes ficha={ficha} />
              </div>
            )}

            {configuracoes.length > 0 && (
              <div className="faq-cat-bloco">
                <h4>Configurações de bagagem</h4>
                <ul className="faq-cat-configs">
                  {configuracoes.map((o) => (
                    <li key={o.id}>
                      <div>
                        <strong>{o.nome}</strong>
                        <span>
                          Até {o.paxMax} passageiros
                          {o.combinacoes.length > 0 &&
                            ` · ${descreverCombinacoes(o.combinacoes)}`}
                        </span>
                      </div>
                      {o.acessorio && (
                        <span className="faq-cat-selo is-aviso">
                          {o.acessorio}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {ficha.recursos.length > 0 && (
              <div className="faq-cat-bloco">
                <h4>Itens do veículo</h4>
                <div className="faq-cat-recursos">
                  {ficha.recursos.map((r) => (
                    <span key={r} className="faq-cat-recurso">
                      <Icon name={iconeRecurso(r)} size={14} />
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {ehTabela && (
          <div className="faq-cat-bloco">
            <h4>Valores por serviço</h4>
            {vencida ? (
              <p className="faq-cat-vencida-aviso">
                <Icon name="alert" size={14} />
                {MENSAGEM_VENCIDA}
              </p>
            ) : linhas.length ? (
              <ul className="faq-cat-tabela-detalhe">
                {linhas.map((linha, i) => {
                  const chave = `${item.id}#${i}`;
                  const linhaCopiada = copiadoId === chave;
                  return (
                    <li key={chave}>
                      <div className="faq-cat-tabela-servico">
                        <strong>{linha.servico || "Serviço"}</strong>
                        {linha.detalhe && <span>{linha.detalhe}</span>}
                      </div>
                      <strong className="faq-cat-tabela-valor ui-cell-num">
                        {formatarValor(linha.valor)}
                      </strong>
                      <button
                        type="button"
                        className={`faq-cat-acao ${linhaCopiada ? "is-ok" : ""}`}
                        onClick={() => onCopiarLinha(linha, i)}
                        title={linhaCopiada ? "Copiado!" : "Copiar só esta linha"}
                        aria-label={
                          linhaCopiada ? "Copiado!" : `Copiar ${linha.servico}`
                        }
                      >
                        <Icon name={linhaCopiada ? "check" : "copy"} size={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="faq-cat-muted">Nenhum valor cadastrado.</p>
            )}
          </div>
        )}

        {(item.resposta || (!ehVeiculo && !ehTabela)) && (
          <div className="faq-cat-bloco">
            {(ehVeiculo || ehTabela) && <h4>Observações</h4>}
            {vencida && !ehTabela ? (
              <p className="faq-cat-vencida-aviso">
                <Icon name="alert" size={14} />
                {MENSAGEM_VENCIDA}
              </p>
            ) : (
              <div className="faq-cat-resposta-texto">
                {renderizarResposta(item.resposta)}
              </div>
            )}
          </div>
        )}

        {ehVeiculo && linkVeiculo && (
          <a
            href={linkVeiculo.url}
            target="_blank"
            rel="noopener noreferrer"
            className="faq-cat-link"
          >
            <Icon name={linkVeiculo.tipo === "oficial" ? "external" : "search"} size={14} />
            {linkVeiculo.tipo === "oficial" ? "Ver site oficial" : "Buscar fotos no Google"}
          </a>
        )}

        <div className="faq-cat-previa-copia">
          <span>Como o cliente vai receber</span>
          <pre>{montarTextoCopia(item, vencida)}</pre>
        </div>

        {item.atualizadoEm && (
          <p className="faq-cat-muted">
            Atualizado {formatarTempoRelativo(item.atualizadoEm)}
          </p>
        )}
      </div>
    </Drawer>
  );
};

export default FaqComercial;
