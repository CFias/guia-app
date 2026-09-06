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
import {
  QuizRounded,
  SearchRounded,
  StarRounded,
  ContentCopyRounded,
  CheckRounded,
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
  WarningAmberRounded,
  CloseRounded,
  OpenInNewRounded,
  ImageSearchRounded,
  WhatsApp,
  NavigateBeforeRounded,
  NavigateNextRounded,
} from "@mui/icons-material";

const MENSAGEM_VENCIDA = "Consultar Operacional para valores atualizados.";

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
    .replace(/[\u0300-\u036f]/g, "")
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

const FaqComercial = () => {
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [categoriaAtiva, setCategoriaAtiva] = useState("todas");
  const [perguntaCopiadaId, setPerguntaCopiadaId] = useState(null);
  const [itemDetalhado, setItemDetalhado] = useState(null);

  useEffect(() => {
    const carregar = async () => {
      try {
        setLoading(true);
        const snap = await getDocs(collection(db, "faq_itens"));

        const lista = snap.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
          .filter((item) => item.ativo !== false)
          .sort((a, b) =>
            (a.pergunta || "").localeCompare(b.pergunta || "", "pt-BR", {
              sensitivity: "base",
            }),
          );

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

  const modoAgrupado = !busca.trim() && categoriaAtiva === "todas";

  const itensFiltrados = useMemo(() => {
    const termo = normalizarTexto(busca);

    const filtrados = itens.filter((item) => {
      const categoriaOk =
        categoriaAtiva === "todas" || item.categoria === categoriaAtiva;

      if (!categoriaOk) return false;
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

    // destaques sempre primeiro, mantendo ordem alfabética dentro de
    // cada grupo (destaque / normal) — usado no modo lista simples
    // (busca ativa ou filtro de categoria específica).
    return [...filtrados].sort((a, b) => {
      if (!!b.destaque !== !!a.destaque) return b.destaque ? 1 : -1;
      return (a.pergunta || "").localeCompare(b.pergunta || "", "pt-BR", {
        sensitivity: "base",
      });
    });
  }, [itens, busca, categoriaAtiva]);

  // Modo agrupado (sem busca/filtro ativo): "Mais buscadas" no topo +
  // uma seção por categoria — ajuda quem não sabe bem o que procurar.
  const itensDestaque = useMemo(
    () => itens.filter((item) => item.destaque && !itemEstaVencido(item)),
    [itens],
  );

  const gruposPorCategoria = useMemo(() => {
    const mapa = {};
    itens.forEach((item) => {
      const categoria = item.categoria || "Outros";
      if (!mapa[categoria]) mapa[categoria] = [];
      mapa[categoria].push(item);
    });

    return Object.entries(mapa)
      .map(([categoria, lista]) => ({
        categoria,
        itens: [...lista].sort((a, b) =>
          (a.pergunta || "").localeCompare(b.pergunta || "", "pt-BR", {
            sensitivity: "base",
          }),
        ),
      }))
      .sort((a, b) =>
        a.categoria.localeCompare(b.categoria, "pt-BR", {
          sensitivity: "base",
        }),
      );
  }, [itens]);

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

  const copiarResposta = async (item) => {
    try {
      const textoResposta = itemEstaVencido(item)
        ? MENSAGEM_VENCIDA
        : item.resposta;

      await navigator.clipboard.writeText(
        `${item.pergunta}\n\n${textoResposta}`,
      );
      setPerguntaCopiadaId(item.id);
      registrarUso(item, "contadorCopias");
      setTimeout(() => {
        setPerguntaCopiadaId((atual) => (atual === item.id ? null : atual));
      }, 1800);
    } catch (err) {
      console.error("Erro ao copiar resposta:", err);
      alert("Não foi possível copiar a resposta.");
    }
  };

  const compartilharWhatsapp = (item) => {
    const textoResposta = itemEstaVencido(item)
      ? MENSAGEM_VENCIDA
      : item.resposta;
    const texto = `${item.pergunta}\n\n${textoResposta}`;

    window.open(
      `https://wa.me/?text=${encodeURIComponent(texto)}`,
      "_blank",
      "noopener,noreferrer",
    );
    registrarUso(item, "contadorCopias");
  };

  return (
    <div className="faq-comercial-page">
      <div className="faq-comercial-header">
        <div className="faq-comercial-brand">
          <QuizRounded fontSize="large" />
          <div>
            <h2>Central de Dúvidas</h2>
            <p>
              Respostas prontas pras perguntas mais comuns dos clientes —
              cotações, bagagem, veículos e políticas.
            </p>
          </div>
        </div>
      </div>

      <div className="faq-comercial-search-row">
        <div className="faq-comercial-search-field">
          <SearchRounded fontSize="small" />
          <input
            type="text"
            placeholder="Busque por palavra-chave (ex: mala, cancelamento, criança...)"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      </div>

      <div className="faq-comercial-categorias">
        <button
          type="button"
          className={`faq-comercial-chip ${categoriaAtiva === "todas" ? "active" : ""}`}
          onClick={() => setCategoriaAtiva("todas")}
        >
          Todas
        </button>

        {categorias.map((cat) => {
          const cor = obterCorCategoria(cat);
          const Icone = obterIconeCategoria(cat);

          return (
            <button
              key={cat}
              type="button"
              className={`faq-comercial-chip ${categoriaAtiva === cat ? "active" : ""}`}
              style={{ "--cor-categoria": cor }}
              onClick={() => setCategoriaAtiva(cat)}
            >
              <Icone fontSize="small" />
              {cat}
            </button>
          );
        })}
      </div>

      {loading ? (
        <CardSkeleton variant="list" rows={6} />
      ) : itensFiltrados.length === 0 ? (
        <div className="faq-comercial-vazio">
          <span>
            {busca || categoriaAtiva !== "todas"
              ? "Nenhuma pergunta encontrada com esses filtros."
              : "Nenhuma pergunta cadastrada ainda."}
          </span>
          <a
            className="faq-comercial-nao-encontrei-btn"
            href={linkPerguntarOperacional(busca)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <WhatsApp fontSize="small" />
            Perguntar ao operacional
          </a>
        </div>
      ) : modoAgrupado ? (
        <div className="faq-comercial-lista">
          {itensDestaque.length > 0 && (
            <div className="faq-comercial-categoria-secao">
              <div className="faq-comercial-categoria-secao-titulo destaque">
                <StarRounded fontSize="small" />
                Mais buscadas
              </div>
              {itensDestaque.map((item) => (
                <FaqItemCard
                  key={item.id}
                  item={item}
                  onAbrir={abrirDetalhe}
                  onCopiar={copiarResposta}
                  onCompartilhar={compartilharWhatsapp}
                  copiado={perguntaCopiadaId === item.id}
                />
              ))}
            </div>
          )}

          {gruposPorCategoria.map((grupo) => {
            const cor = obterCorCategoria(grupo.categoria);
            const Icone = obterIconeCategoria(grupo.categoria);

            return (
              <div
                key={grupo.categoria}
                className="faq-comercial-categoria-secao"
              >
                <div
                  className="faq-comercial-categoria-secao-titulo"
                  style={{ "--cor-categoria": cor }}
                >
                  <Icone fontSize="small" />
                  {grupo.categoria}
                </div>
                {grupo.itens.map((item) => (
                  <FaqItemCard
                    key={item.id}
                    item={item}
                    onAbrir={abrirDetalhe}
                    onCopiar={copiarResposta}
                    onCompartilhar={compartilharWhatsapp}
                    copiado={perguntaCopiadaId === item.id}
                  />
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="faq-comercial-lista">
          {itensFiltrados.map((item) => (
            <FaqItemCard
              key={item.id}
              item={item}
              onAbrir={abrirDetalhe}
              onCopiar={copiarResposta}
              onCompartilhar={compartilharWhatsapp}
              copiado={perguntaCopiadaId === item.id}
            />
          ))}
        </div>
      )}

      {!loading && itens.length > 0 && (
        <div className="faq-comercial-rodape-ajuda">
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
        <FaqDetalheModal
          key={itemDetalhado.id}
          item={itemDetalhado}
          onFechar={() => setItemDetalhado(null)}
          onCopiar={() => copiarResposta(itemDetalhado)}
          onCompartilhar={() => compartilharWhatsapp(itemDetalhado)}
          copiado={perguntaCopiadaId === itemDetalhado.id}
        />
      )}
    </div>
  );
};

const FaqItemCard = ({ item, onAbrir, onCopiar, onCompartilhar, copiado }) => {
  const cor = obterCorCategoria(item.categoria);
  const Icone = obterIconeCategoria(item.categoria);
  const vencida = itemEstaVencido(item);
  const venceBreve = !vencida && itemVenceEmBreve(item);

  return (
    <div
      className={`faq-comercial-item ${item.destaque ? "destaque" : ""} ${vencida ? "vencida" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => onAbrir(item)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onAbrir(item);
        }
      }}
    >
      <div className="faq-comercial-item-topo">
        <span
          className="faq-comercial-categoria-badge"
          style={{ "--cor-categoria": cor }}
        >
          <Icone fontSize="small" />
          {item.categoria}
        </span>

        {item.destaque && !vencida && (
          <span className="faq-comercial-destaque-badge">
            <StarRounded fontSize="small" />
            Mais buscada
          </span>
        )}

        {vencida ? (
          <span className="faq-comercial-vencida-badge">
            <WarningAmberRounded fontSize="small" />
            Vencida em {formatarDataBr(item.validade)}
          </span>
        ) : venceBreve ? (
          <span className="faq-comercial-vence-breve-badge">
            <EventRounded fontSize="small" />
            Vence em {diasParaVencer(item)} dia(s)
          </span>
        ) : (
          item.validade && (
            <span className="faq-comercial-validade-badge">
              <EventRounded fontSize="small" />
              Válida até {formatarDataBr(item.validade)}
            </span>
          )
        )}

        <div className="faq-comercial-item-acoes">
          <button
            type="button"
            className="faq-comercial-share-btn"
            onClick={(e) => {
              e.stopPropagation();
              onCompartilhar(item);
            }}
            title="Compartilhar no WhatsApp"
            aria-label="Compartilhar no WhatsApp"
          >
            <WhatsApp fontSize="small" />
          </button>

          <button
            type="button"
            className={`faq-comercial-copy-btn ${copiado ? "success" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onCopiar(item);
            }}
            title={copiado ? "Copiado!" : "Copiar pergunta e resposta"}
            aria-label={copiado ? "Copiado!" : "Copiar pergunta e resposta"}
          >
            {copiado ? (
              <CheckRounded fontSize="small" />
            ) : (
              <ContentCopyRounded fontSize="small" />
            )}
          </button>
        </div>
      </div>

      <strong className="faq-comercial-pergunta">{item.pergunta}</strong>

      {vencida ? (
        <p className="faq-comercial-resposta vencida">
          <WarningAmberRounded fontSize="small" />
          {MENSAGEM_VENCIDA}
        </p>
      ) : (
        <div className="faq-comercial-resposta">
          {renderizarResposta(item.resposta)}
        </div>
      )}

      {item.nomeVeiculo && (
        <div className="faq-comercial-veiculo-hint">
          <DirectionsCarRounded fontSize="small" />
          {item.nomeVeiculo} — ver detalhes
        </div>
      )}
    </div>
  );
};

const FaqDetalheModal = ({
  item,
  onFechar,
  onCopiar,
  onCompartilhar,
  copiado,
}) => {
  const cor = obterCorCategoria(item.categoria);
  const Icone = obterIconeCategoria(item.categoria);
  const vencida = itemEstaVencido(item);
  const venceBreve = !vencida && itemVenceEmBreve(item);
  const linkVeiculo = obterLinkDetalheVeiculo(item);
  const imagens = obterImagensVeiculo(item);
  const [indiceImagem, setIndiceImagem] = useState(0);

  const irParaImagemAnterior = () =>
    setIndiceImagem((i) => (i === 0 ? imagens.length - 1 : i - 1));

  const irParaProximaImagem = () =>
    setIndiceImagem((i) => (i === imagens.length - 1 ? 0 : i + 1));

  return (
    <div className="faq-comercial-modal-overlay" onClick={onFechar}>
      <div className="faq-comercial-modal" onClick={(e) => e.stopPropagation()}>
        <div className="faq-comercial-modal-header">
          <span
            className="faq-comercial-categoria-badge"
            style={{ "--cor-categoria": cor }}
          >
            <Icone fontSize="small" />
            {item.categoria}
          </span>

          <button
            type="button"
            className="faq-comercial-modal-close"
            onClick={onFechar}
            aria-label="Fechar"
          >
            <CloseRounded fontSize="small" />
          </button>
        </div>

        <div className="faq-comercial-modal-badges">
          {item.destaque && !vencida && (
            <span className="faq-comercial-destaque-badge">
              <StarRounded fontSize="small" />
              Mais buscada
            </span>
          )}

          {vencida ? (
            <span className="faq-comercial-vencida-badge">
              <WarningAmberRounded fontSize="small" />
              Vencida em {formatarDataBr(item.validade)}
            </span>
          ) : venceBreve ? (
            <span className="faq-comercial-vence-breve-badge">
              <EventRounded fontSize="small" />
              Vence em {diasParaVencer(item)} dia(s)
            </span>
          ) : (
            item.validade && (
              <span className="faq-comercial-validade-badge">
                <EventRounded fontSize="small" />
                Válida até {formatarDataBr(item.validade)}
              </span>
            )
          )}
        </div>

        <h3 className="faq-comercial-modal-pergunta">{item.pergunta}</h3>

        {vencida ? (
          <p className="faq-comercial-modal-resposta vencida">
            <WarningAmberRounded fontSize="small" />
            {MENSAGEM_VENCIDA}
          </p>
        ) : (
          <div className="faq-comercial-modal-resposta">
            {renderizarResposta(item.resposta)}
          </div>
        )}

        {item.atualizadoEm && (
          <p className="faq-comercial-modal-atualizado">
            Atualizado {formatarTempoRelativo(item.atualizadoEm)}
          </p>
        )}

        {item.nomeVeiculo && (
          <div className="faq-comercial-modal-veiculo">
            <div className="faq-comercial-modal-veiculo-imagem">
              {!item.veiculoForaCatalogo && imagens.length > 0 ? (
                <>
                  <img src={imagens[indiceImagem]} alt={item.nomeVeiculo} />

                  {imagens.length > 1 && (
                    <>
                      <button
                        type="button"
                        className="faq-comercial-galeria-seta esquerda"
                        onClick={irParaImagemAnterior}
                        aria-label="Imagem anterior"
                      >
                        <NavigateBeforeRounded fontSize="small" />
                      </button>

                      <button
                        type="button"
                        className="faq-comercial-galeria-seta direita"
                        onClick={irParaProximaImagem}
                        aria-label="Próxima imagem"
                      >
                        <NavigateNextRounded fontSize="small" />
                      </button>

                      <div className="faq-comercial-galeria-pontos">
                        {imagens.map((_, i) => (
                          <span
                            key={i}
                            className={`faq-comercial-galeria-ponto ${
                              i === indiceImagem ? "ativo" : ""
                            }`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="faq-comercial-modal-veiculo-placeholder">
                  <DirectionsCarRounded fontSize="large" />
                  <span>Sem foto cadastrada</span>
                </div>
              )}
            </div>

            <div className="faq-comercial-modal-veiculo-info">
              <strong>{item.nomeVeiculo}</strong>

              {linkVeiculo && (
                <a
                  href={linkVeiculo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="faq-comercial-modal-veiculo-link"
                >
                  {linkVeiculo.tipo === "oficial" ? (
                    <>
                      <OpenInNewRounded fontSize="small" />
                      Ver site oficial
                    </>
                  ) : (
                    <>
                      <ImageSearchRounded fontSize="small" />
                      Buscar fotos no Google
                    </>
                  )}
                </a>
              )}
            </div>
          </div>
        )}

        <div className="faq-comercial-modal-actions">
          <button
            type="button"
            className="faq-comercial-share-btn-full"
            onClick={onCompartilhar}
          >
            <WhatsApp fontSize="small" />
            Compartilhar
          </button>

          <button
            type="button"
            className={`faq-comercial-copy-btn-full ${copiado ? "success" : ""}`}
            onClick={onCopiar}
          >
            {copiado ? (
              <CheckRounded fontSize="small" />
            ) : (
              <ContentCopyRounded fontSize="small" />
            )}
            {copiado ? "Copiado!" : "Copiar"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FaqComercial;
