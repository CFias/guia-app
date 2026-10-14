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
import Drawer from "../ui/Drawer";
import Button from "../ui/Button";
import Segmented from "../ui/Segmented";
import PageHeader from "../ui/PageHeader";
import AssistenteVeiculo from "./AssistenteVeiculo";
import IlustracaoCategoria from "./IlustracaoCategoria";
import {
  ILUSTRACOES,
  fundoComTom,
  ilustracaoDaCategoria,
  ilustracaoDoItem,
  tonsDaLista,
} from "./ilustracoes";
import IdiomaTag from "../ui/IdiomaTag";
import { rotuloDoIdioma } from "../../Services/Utils/idiomas";
import BoasVindasComercial from "../BoasVindas/BoasVindasComercial";
import { useAuth } from "../../Context/AuthContext";
import VisualizadorFoto from "./VisualizadorFoto";
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
  obterFichaEmbarcacao,
  obterFichaEquipamento,
  obterFichaLocal,
  linkWhatsappTelefone,
  obterComplementos,
  obterFornecedorPlaca,
  linkExterno,
  ehMotoguia,
  nomeDoMotoguia,
  ehRegra,
} from "./catalogo";

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
    : "Olá! Preciso de uma informação que não encontrei na Central de Informações. Pode me ajudar?";

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

// guia vinculado (nome e idiomas por extenso), modelo, ano e cor
const textosDosComplementos = (item) => {
  const c = obterComplementos(item);
  return [c.guiaNome, ...c.idiomas.map(rotuloDoIdioma), c.modelo, c.ano, c.cor];
};

// A busca é pela dúvida do comercial, em linguagem natural ("motoguia que
// fala espanhol"): ignora palavras de ligação e exige as demais, aceitando
// plural/singular ("malas" acha "mala").
const PALAVRAS_VAZIAS = new Set(
  "a o as os de da do das dos e é em no na nos nas um uma uns umas que qual quais quem como com para pra por tem ter fala falam falar pode posso precisa preciso sobre se ou ao aos the".split(" "),
);

const raiz = (p) => (p.length > 4 && p.endsWith("s") ? p.slice(0, -1) : p);

const combinaBusca = (texto, termo) => {
  if (texto.includes(termo)) return true;
  const palavras = termo.split(/\s+/).filter((p) => p && !PALAVRAS_VAZIAS.has(p));
  if (!palavras.length) return false;
  return palavras.every((p) => texto.includes(raiz(p)));
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
      ...Object.values(obterFichaEmbarcacao(item)).flat().filter((v) => typeof v === "string"),
      ...Object.entries(obterFichaLocal(item))
        .filter(([k, v]) => k !== "cardapio" && !String(v).startsWith("http"))
        .map(([, v]) => v),
      obterFichaLocal(item).cardapio && "cardápio menu",
      ...Object.values(obterFichaEquipamento(item)).filter((v) => typeof v === "string"),
      ...(Array.isArray(item.palavrasChave) ? item.palavrasChave : []),
      ...textosDosComplementos(item),
      ...Object.values(obterFornecedorPlaca(item)),
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

const segmentos = (nomes) => [
  { value: "todos", label: "Tudo", icon: "grid" },
  { value: FORMATOS.VEICULO, label: nomes.veiculo, icon: "car" },
  { value: FORMATOS.EMBARCACAO, label: nomes.embarcacao, icon: "ship" },
  { value: FORMATOS.LOCAL, label: nomes.local, icon: "mapPin" },
  { value: FORMATOS.EQUIPAMENTO, label: nomes.equipamento, icon: "cadeirinha" },
  { value: FORMATOS.TABELA, label: nomes.tabela, icon: "tag" },
  { value: FORMATOS.RESPOSTA, label: nomes.resposta, icon: "shield" },
];

const FaqComercial = () => {
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [categoriaAtiva, setCategoriaAtiva] = useState("todas");
  const { role } = useAuth();
  const [previaBoasVindas, setPreviaBoasVindas] = useState(false);
  const [formatoAtivo, setFormatoAtivo] = useState("todos");
  const [perguntaCopiadaId, setPerguntaCopiadaId] = useState(null);
  const [itemDetalhado, setItemDetalhado] = useState(null);
  // null = automático (abre na aba de veículos ou quando já há grupo preenchido)
  const [assistenteAberto, setAssistenteAberto] = useState(null);
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
        return combinaBusca(textoBuscavel(item), termo);
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
    const { preenchido, recomendadas, alternativas } = resultadoAssistente;
    const vinculados = new Set(
      configAssistente.opcoes.flatMap((o) => o.veiculosIds),
    );
    const daRecomendada = new Set(recomendadas.flatMap((r) => r.opcao.veiculosIds));
    const dasAlternativas = new Set(alternativas.flatMap((o) => o.veiculosIds));

    return (item) => {
      if (!preenchido) return null;
      // com as regras por faixa a resposta é a categoria, não um carro
      if (resultadoAssistente.modo === "faixas") return null;
      if (daRecomendada.has(item.id)) return "recomendado";
      if (dasAlternativas.has(item.id)) return "comporta";
      if (vinculados.has(item.id)) return "nao";
      const cabe = veiculoComporta(
        obterFichaVeiculo(item, configAssistente),
        resultadoAssistente.efetivo.pax,
        resultadoAssistente.efetivo.grandes,
      );
      return cabe === null ? null : cabe ? "comporta" : "nao";
    };
  }, [resultadoAssistente, configAssistente]);

  const veiculos = useMemo(() => {
    // vitrine da frota: do menor para o maior (sem ficha vai para o fim)
    const capacidade = (item) =>
      obterFichaVeiculo(item, configAssistente).passageiros ?? 999;
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
        capacidade(a) - capacidade(b),
    );
  }, [itensFiltrados, resultadoAssistente, seloVeiculo, configAssistente]);

  const tabelas = useMemo(
    () => itensFiltrados.filter((item) => obterFormato(item) === FORMATOS.TABELA),
    [itensFiltrados],
  );

  const embarcacoes = useMemo(
    () =>
      itensFiltrados
        .filter((item) => obterFormato(item) === FORMATOS.EMBARCACAO)
        .sort(
          (a, b) =>
            (obterFichaEmbarcacao(a).capacidade ?? 9999) -
              (obterFichaEmbarcacao(b).capacidade ?? 9999) || ordenarPorPergunta(a, b),
        ),
    [itensFiltrados],
  );

  const locais = useMemo(
    () =>
      itensFiltrados
        .filter((item) => obterFormato(item) === FORMATOS.LOCAL)
        .sort(
          (a, b) =>
            obterFichaLocal(a).tipoLocal.localeCompare(obterFichaLocal(b).tipoLocal, "pt-BR") ||
            ordenarPorPergunta(a, b),
        ),
    [itensFiltrados],
  );

  const equipamentos = useMemo(
    () =>
      itensFiltrados
        .filter((item) => obterFormato(item) === FORMATOS.EQUIPAMENTO)
        .sort(
          (a, b) =>
            obterFichaEquipamento(a).tipoEquipamento.localeCompare(
              obterFichaEquipamento(b).tipoEquipamento,
              "pt-BR",
            ) || ordenarPorPergunta(a, b),
        ),
    [itensFiltrados],
  );

  // Políticas e regras numa grade só, ordenadas por categoria (a categoria
  // aparece em cada card; os chips do topo filtram por ela).
  const respostas = useMemo(
    () =>
      itensFiltrados
        .filter((item) => obterFormato(item) === FORMATOS.RESPOSTA)
        .sort(
          (a, b) =>
            // regras e políticas primeiro: o que é obrigatório aparece antes
            Number(ehRegra(b)) - Number(ehRegra(a)) ||
            (a.categoria || "Outros").localeCompare(
              b.categoria || "Outros",
              "pt-BR",
              { sensitivity: "base" },
            ) || ordenarComDestaque(a, b),
        ),
    [itensFiltrados],
  );

  // Tom do fundo de cada capa: itens da mesma seção com o mesmo desenho
  // ganham fundos diferentes.
  const tons = useMemo(
    () => ({
      ...tonsDaLista(veiculos, () => FORMATOS.VEICULO),
      ...tonsDaLista(embarcacoes, () => FORMATOS.EMBARCACAO),
      ...tonsDaLista(locais, () => FORMATOS.LOCAL),
      ...tonsDaLista(equipamentos, () => FORMATOS.EQUIPAMENTO),
      ...tonsDaLista(tabelas, () => FORMATOS.TABELA),
      ...tonsDaLista(respostas, () => FORMATOS.RESPOSTA),
    }),
    [veiculos, embarcacoes, locais, equipamentos, tabelas, respostas],
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
        montarTextoCopia(item, itemEstaVencido(item), configAssistente),
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

  const limparFiltros = () => {
    setBusca("");
    setCategoriaAtiva("todas");
    setFormatoAtivo("todos");
  };

  const acoesCard = {
    onAbrir: abrirDetalhe,
    onCopiar: copiarResposta,
  };

  const mostrarAssistente =
    configAssistente.opcoes.some((o) => o.ativo && o.nome) &&
    (formatoAtivo === "todos" || formatoAtivo === FORMATOS.VEICULO);

  const assistenteVisivel =
    assistenteAberto ??
    (formatoAtivo === FORMATOS.VEICULO || resultadoAssistente.preenchido);

  const mostrarFrota =
    veiculos.length > 0 &&
    (formatoAtivo === "todos" || formatoAtivo === FORMATOS.VEICULO);
  const mostrarEmbarcacoes =
    embarcacoes.length > 0 &&
    (formatoAtivo === "todos" || formatoAtivo === FORMATOS.EMBARCACAO);
  const mostrarLocais =
    locais.length > 0 && (formatoAtivo === "todos" || formatoAtivo === FORMATOS.LOCAL);
  const mostrarEquipamentos =
    equipamentos.length > 0 &&
    (formatoAtivo === "todos" || formatoAtivo === FORMATOS.EQUIPAMENTO);
  const mostrarTabelas =
    tabelas.length > 0 &&
    (formatoAtivo === "todos" || formatoAtivo === FORMATOS.TABELA);
  const mostrarRespostas =
    respostas.length > 0 &&
    (formatoAtivo === "todos" || formatoAtivo === FORMATOS.RESPOSTA);

  return (
    <div className="ui-page faq-cat">
      <PageHeader
        title="Central de Informações"
        description="Tire suas dúvidas antes de responder o cliente: veículos, motoguias, preços e taxas, políticas e mais — sempre atualizado pela operação."
        actions={
          <>
            {role !== "comercial" && (
              <Button icon="sparkles" onClick={() => setPreviaBoasVindas(true)} title="Ver o que o comercial vê nas primeiras entradas">
                Prévia das boas-vindas
              </Button>
            )}
            <a
              className="ui-btn ui-btn--secondary"
              href={linkPerguntarOperacional(busca)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon name="message" size={15} />
              Perguntar ao operacional
            </a>
          </>
        }
      />
      {previaBoasVindas && <BoasVindasComercial previa onFechar={() => setPreviaBoasVindas(false)} />}

      <div className="faq-cat-busca">
        <Icon name="search" size={18} />
        <input
          type="text"
          placeholder="Qual é a sua dúvida? Ex.: motoguia que fala espanhol, malas na Spin, política de cancelamento…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar na Central de Informações"
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
          options={segmentos(configAssistente.nomesSecoes)
            // tipos sem nenhum item cadastrado não aparecem
            .filter(
              (s) =>
                s.value === "todos" ||
                s.value === formatoAtivo ||
                contagemFormatos[s.value],
            )
            .map((s) => ({
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
                  <IlustracaoCategoria chave={ilustracaoDaCategoria(cat) || "duvida"} tamanho={20} />
                  {cat}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {!loading && modoVitrine && itensDestaque.length > 0 && (
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

      {!loading && mostrarAssistente &&
        (assistenteVisivel ? (
          <AssistenteVeiculo
            config={configAssistente}
            veiculos={itens.filter((i) => obterFormato(i) === FORMATOS.VEICULO)}
            grupo={grupo}
            onGrupoChange={setGrupo}
            onAbrirVeiculo={abrirDetalhe}
            onRecolher={() => setAssistenteAberto(false)}
          />
        ) : (
          <button
            type="button"
            className="faq-cat-assist-barra"
            onClick={() => setAssistenteAberto(true)}
          >
            <span className="faq-cat-assist-icone">
              <Icon name="sparkles" size={16} />
            </span>
            <span className="faq-cat-assist-texto">
              <strong>Qual veículo usar?</strong>
              <small>Informe passageiros e malas e veja a recomendação na hora.</small>
            </span>
            <span className="faq-cat-assist-abrir">
              Abrir assistente <Icon name="arrowRight" size={14} />
            </span>
          </button>
        ))}

      {loading ? (
        <CardSkeleton variant="list" rows={6} />
      ) : itensFiltrados.length === 0 ? (
        <div className="faq-cat-vazio">
          <span className="faq-cat-vazio-icone">
            <Icon name="search" size={22} />
          </span>
          <strong>
            {itens.length === 0
              ? "Nenhuma informação cadastrada ainda."
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
          {mostrarFrota && (
            <section className="faq-cat-secao">
              <header className="faq-cat-secao-topo">
                <div className="faq-cat-secao-titulos">
                  <h2>
                    <Icon name="car" size={18} />
                    {configAssistente.nomesSecoes.veiculo}
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
                    tom={tons[item.id]}
                    {...acoesCard}
                    copiado={perguntaCopiadaId === item.id}
                    selo={seloVeiculo(item)}
                    config={configAssistente}
                  />
                ))}
              </div>
            </section>
          )}

          {mostrarEmbarcacoes && (
            <section className="faq-cat-secao">
              <header className="faq-cat-secao-topo">
                <div className="faq-cat-secao-titulos">
                  <h2>
                    <Icon name="ship" size={18} />
                    {configAssistente.nomesSecoes.embarcacao}
                    <span className="faq-cat-contador">{embarcacoes.length}</span>
                  </h2>
                  <p>Fotos, lotação, o que tem a bordo e roteiros.</p>
                </div>
              </header>
              <div className="faq-cat-grade faq-cat-grade--frota">
                {embarcacoes.map((item) => (
                  <CardVisual
                    key={item.id}
                    item={item}
                    tom={tons[item.id]}
                    {...acoesCard}
                    copiado={perguntaCopiadaId === item.id}
                  />
                ))}
              </div>
            </section>
          )}

          {mostrarLocais && (
            <section className="faq-cat-secao">
              <header className="faq-cat-secao-topo">
                <div className="faq-cat-secao-titulos">
                  <h2>
                    <Icon name="mapPin" size={18} />
                    {configAssistente.nomesSecoes.local}
                    <span className="faq-cat-contador">{locais.length}</span>
                  </h2>
                  <p>Hotéis, restaurantes e pontos de apoio com endereço e contato.</p>
                </div>
              </header>
              <div className="faq-cat-grade faq-cat-grade--frota">
                {locais.map((item) => (
                  <CardVisual
                    key={item.id}
                    item={item}
                    tom={tons[item.id]}
                    {...acoesCard}
                    copiado={perguntaCopiadaId === item.id}
                  />
                ))}
              </div>
            </section>
          )}

          {mostrarEquipamentos && (
            <section className="faq-cat-secao">
              <header className="faq-cat-secao-topo">
                <div className="faq-cat-secao-titulos">
                  <h2>
                    <Icon name="cadeirinha" size={18} />
                    {configAssistente.nomesSecoes.equipamento}
                    <span className="faq-cat-contador">{equipamentos.length}</span>
                  </h2>
                  <p>Cadeirinhas, bebê conforto e outros itens — fotos, para quem serve e como pedir.</p>
                </div>
              </header>
              <div className="faq-cat-grade faq-cat-grade--frota">
                {equipamentos.map((item) => (
                  <CardVisual
                    key={item.id}
                    item={item}
                    tom={tons[item.id]}
                    {...acoesCard}
                    copiado={perguntaCopiadaId === item.id}
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
                    {configAssistente.nomesSecoes.tabela}
                    <span className="faq-cat-contador">{tabelas.length}</span>
                  </h2>
                  <p>Preços por serviço e taxas dos passeios — abra para ver todos os valores.</p>
                </div>
              </header>

              <div className="faq-cat-grade faq-cat-grade--valores">
                {tabelas.map((item) => (
                  <CardTabela
                    key={item.id}
                    item={item}
                    tom={tons[item.id]}
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
                    <Icon name="shield" size={18} />
                    {configAssistente.nomesSecoes.resposta}
                    <span className="faq-cat-contador">{respostas.length}</span>
                  </h2>
                  <p>Políticas e regras da operação primeiro, depois os demais combinados — abra para ver os detalhes.</p>
                </div>
              </header>

              <div className="faq-cat-grade faq-cat-grade--respostas">
                {respostas.map((item) => (
                  <CardResposta
                    key={item.id}
                    item={item}
                    tom={tons[item.id]}
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
  return (
    <span
      className="faq-cat-selo-categoria"
      style={{ "--cor-categoria": obterCorCategoria(categoria) }}
    >
      <IlustracaoCategoria chave={ilustracaoDaCategoria(categoria) || "duvida"} tamanho={16} />
      {categoria}
    </span>
  );
};

// Capa do card: a foto do cadastro ou, sem foto, a ilustração da categoria
// `regra`: capa azul-marinho com o desenho num cartão branco.
const CapaCard = ({ item, formato, rotulo, destaque = false, tom = 0, regra = false }) => {
  const imagens = obterImagensVeiculo(item);
  const chave = ilustracaoDoItem(item, formato);
  return (
    <div
      className={`faq-cat-capa ${imagens.length ? "tem-foto" : ""} ${regra ? "is-regra" : ""}`}
      style={imagens.length ? undefined : { "--fundo-ilus": fundoComTom(ILUSTRACOES[chave].fundo, tom) }}
    >
      {imagens.length ? (
        <img src={imagens[0]} alt="" loading="lazy" />
      ) : regra ? (
        <span className="faq-cat-capa-cartao">
          <IlustracaoCategoria chave={chave} tamanho={68} />
        </span>
      ) : (
        <IlustracaoCategoria chave={chave} tamanho={88} />
      )}
      {rotulo && (
        <span className="faq-cat-capa-rotulo">
          {regra && <Icon name="shield" size={11} />}
          {rotulo}
        </span>
      )}
      {destaque && (
        <span className="faq-cat-capa-destaque">
          <Icon name="star" size={12} />
          Mais buscada
        </span>
      )}
    </div>
  );
};

// Sem foto (veículo, embarcação, local, equipamento): ilustração no lugar
const SemFotoIlustrada = ({ item, formato, tom = 0 }) => {
  const chave = ilustracaoDoItem(item, formato);
  return (
    <div
      className="faq-cat-veiculo-sem-foto is-ilustrada"
      style={{ "--fundo-ilus": fundoComTom(ILUSTRACOES[chave].fundo, tom) }}
    >
      <IlustracaoCategoria chave={chave} tamanho={96} />
    </div>
  );
};

// Ação discreta: copiar a informação (a Central é para consulta do comercial)
const AcoesRapidas = ({ item, onCopiar, copiado }) => (
  <div className="faq-cat-acoes" onClick={(e) => e.stopPropagation()}>
    <button
      type="button"
      className={`faq-cat-acao ${copiado ? "is-ok" : ""}`}
      onClick={() => onCopiar(item)}
      title={copiado ? "Copiado!" : "Copiar informação"}
      aria-label={copiado ? "Copiado!" : "Copiar informação"}
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

// Placa no estilo Mercosul (faixa azul em cima)
const Placa = ({ placa, grande = false }) => (
  <span className={`faq-cat-placa ${grande ? "is-grande" : ""}`} title="Placa">
    <i aria-hidden="true">BRASIL</i>
    {placa}
  </span>
);

// Fornecedor e placa no card (uma linha discreta)
const FornecedorNoCard = ({ item }) => {
  const { fornecedor, placa } = obterFornecedorPlaca(item);
  if (!fornecedor && !placa) return null;
  return (
    <div className="faq-cat-fornecedor">
      {fornecedor && (
        <span className="faq-cat-fornecedor-nome" title={`Fornecedor: ${fornecedor}`}>
          <Icon name="truck" size={13} />
          {fornecedor}
        </span>
      )}
      {placa && <Placa placa={placa} />}
    </div>
  );
};

const TEXTO_SELO = {
  recomendado: { texto: "Recomendado", icone: "sparkles" },
  comporta: { texto: "Também atende", icone: "check" },
  nao: { texto: "Não comporta", icone: "x" },
};

const CardVeiculo = ({ item, onAbrir, onCopiar, copiado, selo, config, tom }) => {
  const ficha = obterFichaVeiculo(item, config);
  const imagens = item.veiculoForaCatalogo ? [] : obterImagensVeiculo(item);
  const temFicha = fichaTemDados(ficha);
  const comp = obterComplementos(item);
  // motoguia: o título fica só com o carro e o guia vai para a faixa da foto
  const moto = ehMotoguia(item) ? nomeDoMotoguia(item) : null;
  const nome = moto ? moto.carro : item.nomeVeiculo || item.pergunta;

  return (
    <article
      className={`faq-cat-card faq-cat-veiculo ${
        selo === "recomendado"
          ? "is-comporta"
          : selo === "nao"
            ? "is-nao-comporta"
            : ""
      }`}
      {...propsCardClicavel(item, onAbrir)}
    >
      <div className={`faq-cat-veiculo-foto ${moto ? "tem-faixa" : ""}`}>
        {imagens.length > 0 ? (
          <img src={imagens[0]} alt={nome} loading="lazy" />
        ) : (
          <SemFotoIlustrada item={item} formato={FORMATOS.VEICULO} tom={tom} />
        )}
        <div className="faq-cat-veiculo-selos">
          {moto ? (
            <span className="faq-cat-foto-selo is-motoguia">
              <Icon name="user" size={12} />
              Motoguia
            </span>
          ) : (
            ficha.tipoVeiculo && <span className="faq-cat-foto-selo">{ficha.tipoVeiculo}</span>
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
        {moto && (
          <div className="faq-cat-faixa-guia">
            <span className="faq-cat-faixa-avatar" aria-hidden="true">
              {(moto.guia || "G").charAt(0).toUpperCase()}
            </span>
            <span className="faq-cat-faixa-texto">
              <b>{moto.guia || "Motoguia"}</b>
              <small>dirige e guia o passeio</small>
            </span>
          </div>
        )}
      </div>

      <div className="faq-cat-card-corpo">
        <h3 className="faq-cat-card-titulo">{nome}</h3>
        {moto ? (
          moto.guia &&
          !normalizarTexto(nome).includes(normalizarTexto(moto.guia)) && (
            <p className="faq-cat-card-sub is-motoguia">Motoguia {moto.guia}</p>
          )
        ) : (
          item.nomeVeiculo &&
          item.pergunta &&
          item.pergunta !== item.nomeVeiculo && <p className="faq-cat-card-sub">{item.pergunta}</p>
        )}
        <FornecedorNoCard item={item} />

        {temFicha ? (
          <Especificacoes ficha={ficha} compacto />
        ) : (
          <p className="faq-cat-card-previa">{textoPrevia(item.resposta)}</p>
        )}

        {comp.idiomas.length > 0 && (
          <div className="faq-cat-idiomas is-mini" title="Idiomas do guia">
            {comp.idiomas.map((id) => (
              <IdiomaTag key={id} idioma={id} />
            ))}
          </div>
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
          copiado={copiado}
        />
      </footer>
    </article>
  );
};

/* Card com foto para embarcações, locais e equipamentos (mesma estrutura do veículo). */
const CardVisual = ({ item, onAbrir, onCopiar, copiado, tom }) => {
  const formato = obterFormato(item);
  const ehLocal = formato === FORMATOS.LOCAL;
  const ehEquip = formato === FORMATOS.EQUIPAMENTO;
  const fe = obterFichaEmbarcacao(item);
  const fl = obterFichaLocal(item);
  const fq = obterFichaEquipamento(item);
  const imagens = obterImagensVeiculo(item);
  const tipo = ehEquip ? fq.tipoEquipamento : ehLocal ? fl.tipoLocal : fe.tipoEmbarcacao;

  return (
    <article className="faq-cat-card faq-cat-veiculo" {...propsCardClicavel(item, onAbrir)}>
      <div className="faq-cat-veiculo-foto">
        {imagens.length > 0 ? (
          <img src={imagens[0]} alt={item.pergunta} loading="lazy" />
        ) : (
          <SemFotoIlustrada item={item} formato={formato} tom={tom} />
        )}
        <div className="faq-cat-veiculo-selos">
          {tipo && <span className="faq-cat-foto-selo">{tipo}</span>}
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
      </div>

      <div className="faq-cat-card-corpo">
        <h3 className="faq-cat-card-titulo">{item.pergunta}</h3>
        {!ehLocal && !ehEquip && <FornecedorNoCard item={item} />}
        {ehEquip ? (
          <div className="faq-cat-local-info">
            {fq.faixaUso && (
              <span>
                <Icon name="users" size={14} />
                {fq.faixaUso}
              </span>
            )}
            {fq.valor && (
              <span>
                <Icon name="tag" size={14} />
                {fq.valor}
              </span>
            )}
            {fq.antecedencia && (
              <span>
                <Icon name="clock" size={14} />
                {fq.antecedencia}
              </span>
            )}
            {!fq.faixaUso && !fq.valor && !fq.antecedencia && item.resposta && (
              <p className="faq-cat-card-previa">{textoPrevia(item.resposta)}</p>
            )}
          </div>
        ) : ehLocal ? (
          <div className="faq-cat-local-info">
            {(fl.bairro || fl.endereco) && (
              <span>
                <Icon name="mapPin" size={14} />
                {fl.bairro || fl.endereco}
              </span>
            )}
            {fl.horario && (
              <span>
                <Icon name="clock" size={14} />
                {fl.horario}
              </span>
            )}
            {fl.telefone && (
              <span>
                <Icon name="phone" size={14} />
                {fl.telefone}
              </span>
            )}
            {fl.cardapio && (
              <a
                className="faq-cat-cardapio"
                href={linkExterno(fl.cardapio)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title="Abrir o cardápio"
              >
                <Icon name="utensils" size={14} />
                Cardápio
                <Icon name="external" size={12} />
              </a>
            )}
          </div>
        ) : (
          <>
            {fe.capacidade && (
              <div className="faq-cat-specs is-compacto">
                <div className="faq-cat-spec">
                  <Icon name="users" size={14} />
                  <strong>{fe.capacidade}</strong>
                  <span>passageiros</span>
                </div>
              </div>
            )}
            {fe.roteiros && <p className="faq-cat-card-sub">{fe.roteiros}</p>}
            {fe.recursos.length > 0 && (
              <div className="faq-cat-recursos-mini">
                {fe.recursos.slice(0, 5).map((r) => (
                  <span key={r} title={r}>
                    <Icon name={iconeRecurso(r)} size={14} />
                  </span>
                ))}
                {fe.recursos.length > 5 && <em>+{fe.recursos.length - 5}</em>}
              </div>
            )}
          </>
        )}
        {!ehLocal && !ehEquip && !fe.capacidade && !fe.roteiros && item.resposta && (
          <p className="faq-cat-card-previa">{textoPrevia(item.resposta)}</p>
        )}
      </div>

      <footer className="faq-cat-card-rodape">
        {ehLocal && fl.linkMapa ? (
          <a
            className="faq-cat-ver faq-cat-mapa"
            href={fl.linkMapa}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            <Icon name="navigation" size={13} />
            Abrir no mapa
          </a>
        ) : (
          <span className="faq-cat-ver">
            Ver detalhes <Icon name="arrowRight" size={13} />
          </span>
        )}
        <AcoesRapidas
          item={item}
          onCopiar={onCopiar}
          copiado={copiado}
        />
      </footer>
    </article>
  );
};

const LINHAS_NO_CARD = 3; // o resto fica em "+ N valores" (cards do mesmo tamanho)

const CardTabela = ({ item, onAbrir, onCopiar, copiado, tom }) => {
  const linhas = obterTabelaPrecos(item);
  const vencida = itemEstaVencido(item);

  return (
    <article
      className={`faq-cat-card faq-cat-tabela ${vencida ? "is-vencida" : ""}`}
      {...propsCardClicavel(item, onAbrir)}
    >
      <CapaCard item={item} formato={FORMATOS.TABELA} rotulo={item.categoria} destaque={item.destaque} tom={tom} />
      <div className="faq-cat-card-corpo">
        <div className="faq-cat-tabela-topo">
          <div>
            <h3 className="faq-cat-card-titulo">{item.pergunta}</h3>
            <div className="faq-cat-card-selos">
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
                + {linhas.length - LINHAS_NO_CARD} {linhas.length - LINHAS_NO_CARD === 1 ? "valor" : "valores"}
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
          copiado={copiado}
        />
      </footer>
    </article>
  );
};

const CardResposta = ({ item, onAbrir, onCopiar, copiado, tom }) => {
  const vencida = itemEstaVencido(item);
  const regra = ehRegra(item);

  return (
    <article
      className={`faq-cat-card faq-cat-resposta ${vencida ? "is-vencida" : ""} ${regra ? "is-regra" : ""}`}
      {...propsCardClicavel(item, onAbrir)}
    >
      <CapaCard
        item={item}
        formato={FORMATOS.RESPOSTA}
        rotulo={item.categoria}
        destaque={item.destaque && !vencida}
        tom={tom}
        regra={regra}
      />
      <div className="faq-cat-card-corpo">
        {item.validade && (
          <div className="faq-cat-card-selos">
            <SeloValidade item={item} />
          </div>
        )}
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
          {regra ? "Ler a regra" : "Ver detalhes"} <Icon name="arrowRight" size={13} />
        </span>
        <AcoesRapidas
          item={item}
          onCopiar={onCopiar}
          copiado={copiado}
        />
      </footer>
    </article>
  );
};

/* ---------- detalhe (painel lateral) ---------- */

const ListaPrecos = ({ item, linhas, vencida, copiadoId, onCopiarLinha }) => {
  if (vencida) {
    return (
      <p className="faq-cat-vencida-aviso">
        <Icon name="alert" size={14} />
        {MENSAGEM_VENCIDA}
      </p>
    );
  }
  if (!linhas.length) return <p className="faq-cat-muted">Nenhum valor cadastrado.</p>;
  return (
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
            <strong className="faq-cat-tabela-valor ui-cell-num">{formatarValor(linha.valor)}</strong>
            <button
              type="button"
              className={`faq-cat-acao ${linhaCopiada ? "is-ok" : ""}`}
              onClick={() => onCopiarLinha(linha, i)}
              title={linhaCopiada ? "Copiado!" : "Copiar só esta linha"}
              aria-label={linhaCopiada ? "Copiado!" : `Copiar ${linha.servico}`}
            >
              <Icon name={linhaCopiada ? "check" : "copy"} size={14} />
            </button>
          </li>
        );
      })}
    </ul>
  );
};

const Galeria = ({ imagens, nome, ilustracao = "duvida" }) => {
  const [indice, setIndice] = useState(0);
  const [ampliada, setAmpliada] = useState(false);

  if (!imagens.length) {
    return (
      <div
        className="faq-cat-galeria faq-cat-galeria--vazia is-ilustrada"
        style={{ "--fundo-ilus": (ILUSTRACOES[ilustracao] || ILUSTRACOES.duvida).fundo }}
      >
        <IlustracaoCategoria chave={ilustracao} tamanho={120} />
      </div>
    );
  }

  const anterior = () => setIndice((i) => (i === 0 ? imagens.length - 1 : i - 1));
  const proxima = () => setIndice((i) => (i === imagens.length - 1 ? 0 : i + 1));

  return (
    <div className="faq-cat-galeria">
      <div className="faq-cat-galeria-principal">
        <img className="faq-cat-galeria-fundo" src={imagens[indice]} alt="" aria-hidden="true" />
        <button
          type="button"
          className="faq-cat-galeria-ampliar"
          onClick={() => setAmpliada(true)}
          aria-label="Ver foto em tela cheia"
          title="Ver em tela cheia"
        >
          <img src={imagens[indice]} alt={`${nome} — foto ${indice + 1}`} />
          <span className="faq-cat-galeria-lupa">
            <Icon name="maximize" size={15} />
            Ampliar
          </span>
        </button>
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

      {ampliada && (
        <VisualizadorFoto
          imagens={imagens}
          inicial={indice}
          nome={nome}
          onFechar={() => setAmpliada(false)}
        />
      )}
    </div>
  );
};

// Ficha: fornecedor e placa
const BlocoFornecedor = ({ item }) => {
  const { fornecedor, placa } = obterFornecedorPlaca(item);
  if (!fornecedor && !placa) return null;
  return (
    <div className="faq-cat-bloco">
      <h4>{placa ? "Fornecedor e placa" : "Fornecedor"}</h4>
      <div className="faq-cat-fornecedor-ficha">
        {fornecedor && (
          <div className="faq-cat-fornecedor-tile">
            <Icon name="truck" size={18} />
            <span>
              <small>Fornecedor</small>
              <strong>{fornecedor}</strong>
            </span>
          </div>
        )}
        {placa && <Placa placa={placa} grande />}
      </div>
    </div>
  );
};

const FaqDetalhe = ({
  item,
  onFechar,
  onCopiar,
  onCopiarLinha,
  copiadoId,
  configAssistente,
}) => {
  const formato = obterFormato(item);
  const vencida = itemEstaVencido(item);
  const copiado = copiadoId === item.id;
  const ficha = obterFichaVeiculo(item, configAssistente);
  const configuracoes = ficha.configuracoes;
  const linhas = obterTabelaPrecos(item);
  const linkVeiculo = obterLinkDetalheVeiculo(item);
  const imagens = item.veiculoForaCatalogo ? [] : obterImagensVeiculo(item);
  const ehVeiculo = formato === FORMATOS.VEICULO;
  const ehTabela = formato === FORMATOS.TABELA;
  const ehEmbarcacao = formato === FORMATOS.EMBARCACAO;
  const ehLocal = formato === FORMATOS.LOCAL;
  const ehEquip = formato === FORMATOS.EQUIPAMENTO;
  const ehVisual = ehEmbarcacao || ehLocal || ehEquip;
  const fe = obterFichaEmbarcacao(item);
  const fl = obterFichaLocal(item);
  const fq = obterFichaEquipamento(item);
  const fotos = ehVisual ? obterImagensVeiculo(item) : imagens;
  const whatsLocal = linkWhatsappTelefone(fl.telefone);

  const titulo = ehVeiculo ? item.nomeVeiculo || item.pergunta : item.pergunta;
  const ilustracao = ilustracaoDoItem(item, formato);
  const comp = obterComplementos(item);
  const fotosExtras = !ehVeiculo && !ehVisual ? obterImagensVeiculo(item) : [];
  const dadosVeiculo = [
    comp.modelo && { rotulo: "Modelo", valor: comp.modelo },
    comp.ano && { rotulo: "Ano", valor: comp.ano },
    comp.cor && { rotulo: "Cor", valor: comp.cor },
    comp.lugares && { rotulo: "Lugares", valor: comp.lugares },
  ].filter(Boolean);

  return (
    <Drawer
      open
      width={ehVeiculo || ehTabela || ehVisual ? 560 : 500}
      title={titulo}
      subtitle={
        ehVeiculo
          ? [ficha.tipoVeiculo, item.categoria].filter(Boolean).join(" · ")
          : ehEmbarcacao
            ? [fe.tipoEmbarcacao, item.categoria].filter(Boolean).join(" · ")
            : ehLocal
              ? [fl.tipoLocal, item.categoria].filter(Boolean).join(" · ")
              : ehEquip
                ? [fq.tipoEquipamento, item.categoria].filter(Boolean).join(" · ")
                : item.categoria
      }
      onClose={onFechar}
      footer={
        <Button variant="secondary" icon={copiado ? "check" : "copy"} onClick={onCopiar}>
          {copiado ? "Copiado!" : ehTabela ? "Copiar tabela" : "Copiar informação"}
        </Button>
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
            <Galeria imagens={imagens} nome={titulo} ilustracao={ilustracao} />

            {item.nomeVeiculo && item.pergunta && item.pergunta !== item.nomeVeiculo && (
              <p className="faq-cat-detalhe-pergunta">{item.pergunta}</p>
            )}

            <BlocoFornecedor item={item} />

            {(ficha.passageiros !== null ||
              ficha.malasGrandes !== null ||
              ficha.malasBordo !== null) && (
              <div className="faq-cat-bloco">
                <h4>
                  {configuracoes.length > 1
                    ? `Capacidade · ${(configuracoes.find((o) => !o.acessorio) || configuracoes[0]).nome}`
                    : "Capacidade"}
                </h4>
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

        {fotosExtras.length > 0 && <Galeria imagens={fotosExtras} nome={titulo} ilustracao={ilustracao} />}

        {ehTabela && (
          <div className="faq-cat-bloco">
            <h4>Valores por serviço</h4>
            <ListaPrecos item={item} linhas={linhas} vencida={vencida} copiadoId={copiadoId} onCopiarLinha={onCopiarLinha} />
          </div>
        )}

        {ehVisual && (
          <>
            <Galeria
              imagens={fotos}
              nome={item.pergunta}
              ilustracao={ilustracao}
            />

            {ehEquip && (fq.faixaUso || fq.valor || fq.antecedencia || fq.quantidade) && (
              <div className="faq-cat-bloco">
                <h4>Informações</h4>
                <ul className="faq-cat-contato">
                  {fq.faixaUso && (
                    <li>
                      <Icon name="users" size={16} />
                      <span>
                        {fq.faixaUso}
                        <small>Para quem serve</small>
                      </span>
                    </li>
                  )}
                  {fq.valor && (
                    <li>
                      <Icon name="tag" size={16} />
                      <span>
                        {fq.valor}
                        <small>Valor</small>
                      </span>
                    </li>
                  )}
                  {fq.antecedencia && (
                    <li>
                      <Icon name="clock" size={16} />
                      <span>
                        {fq.antecedencia}
                        <small>Como solicitar</small>
                      </span>
                    </li>
                  )}
                  {fq.quantidade && (
                    <li>
                      <Icon name="check" size={16} />
                      <span>
                        {fq.quantidade} disponíve{fq.quantidade === 1 ? "l" : "is"}
                        <small>Quantidade (confirme com o operacional)</small>
                      </span>
                    </li>
                  )}
                </ul>
              </div>
            )}

            {ehEmbarcacao && <BlocoFornecedor item={item} />}

            {ehEmbarcacao && fe.capacidade && (
              <div className="faq-cat-bloco">
                <h4>Lotação</h4>
                <div className="faq-cat-specs">
                  <div className="faq-cat-spec">
                    <Icon name="users" size={18} />
                    <strong>{fe.capacidade}</strong>
                    <span>passageiros</span>
                  </div>
                </div>
              </div>
            )}

            {ehEmbarcacao && fe.recursos.length > 0 && (
              <div className="faq-cat-bloco">
                <h4>A bordo</h4>
                <div className="faq-cat-recursos">
                  {fe.recursos.map((r) => (
                    <span key={r} className="faq-cat-recurso">
                      <Icon name={iconeRecurso(r)} size={14} />
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {ehEmbarcacao && fe.roteiros && (
              <div className="faq-cat-bloco">
                <h4>Roteiros</h4>
                <p className="faq-cat-detalhe-pergunta">{fe.roteiros}</p>
              </div>
            )}

            {ehLocal && (
              <div className="faq-cat-bloco">
                <h4>Endereço e contato</h4>
                <ul className="faq-cat-contato">
                  {(fl.endereco || fl.bairro) && (
                    <li>
                      <Icon name="mapPin" size={16} />
                      <span>
                        {fl.endereco}
                        {fl.bairro && <small>{fl.bairro}</small>}
                      </span>
                      {fl.linkMapa && (
                        <a href={fl.linkMapa} target="_blank" rel="noopener noreferrer">
                          Mapa
                        </a>
                      )}
                    </li>
                  )}
                  {fl.telefone && (
                    <li>
                      <Icon name="phone" size={16} />
                      <span>{fl.telefone}</span>
                      {whatsLocal && (
                        <a href={whatsLocal} target="_blank" rel="noopener noreferrer">
                          WhatsApp
                        </a>
                      )}
                    </li>
                  )}
                  {fl.horario && (
                    <li>
                      <Icon name="clock" size={16} />
                      <span>{fl.horario}</span>
                    </li>
                  )}
                  {fl.cardapio && (
                    <li>
                      <Icon name="utensils" size={16} />
                      <span>Cardápio</span>
                      <a href={linkExterno(fl.cardapio)} target="_blank" rel="noopener noreferrer">
                        Abrir cardápio
                      </a>
                    </li>
                  )}
                  {fl.site && (
                    <li>
                      <Icon name="globe" size={16} />
                      <span className="faq-cat-contato-link">{fl.site}</span>
                      <a
                        href={/^https?:\/\//i.test(fl.site) ? fl.site : `https://${fl.site}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Abrir
                      </a>
                    </li>
                  )}
                  {!fl.endereco && !fl.bairro && !fl.telefone && !fl.horario && !fl.site && !fl.cardapio && (
                    <li className="faq-cat-muted">Sem endereço ou contato cadastrado.</li>
                  )}
                </ul>
              </div>
            )}
          </>
        )}

        {comp.idiomas.length > 0 && (
          <div className="faq-cat-bloco">
            <h4>Idiomas{comp.guiaNome ? ` · ${comp.guiaNome}` : ""}</h4>
            <div className="faq-cat-idiomas">
              {comp.idiomas.map((id) => (
                <IdiomaTag key={id} idioma={id} nome />
              ))}
            </div>
          </div>
        )}

        {dadosVeiculo.length > 0 && (
          <div className="faq-cat-bloco">
            <h4>Veículo</h4>
            <div className="faq-cat-dados">
              {dadosVeiculo.map((d) => (
                <span key={d.rotulo}>
                  {d.rotulo} <b>{d.valor}</b>
                </span>
              ))}
            </div>
          </div>
        )}

        {!ehTabela && linhas.length > 0 && (
          <div className="faq-cat-bloco">
            <h4>Tabela de preços</h4>
            <ListaPrecos item={item} linhas={linhas} vencida={vencida} copiadoId={copiadoId} onCopiarLinha={onCopiarLinha} />
          </div>
        )}

        {(item.resposta || (!ehVeiculo && !ehTabela && !ehVisual)) && (
          <div className="faq-cat-bloco">
            {(ehVeiculo || ehTabela || ehVisual) && <h4>Observações</h4>}
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
