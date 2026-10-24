import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "../../Services/Services/firebase";
import {
  alternarServicoForaDaEscala,
  carregarServicosForaDaEscala,
  estaForaDaEscala,
} from "../../Services/Services/servicosEscala";
import { Link } from "react-router-dom";
import {
  DIAS_A_FRENTE_PADRAO,
  DIAS_HISTORICO_PADRAO,
  cadastrarServicosDoPhoenix,
  levantarServicosDoPhoenix,
  separarSemMapeamento,
} from "../../Services/Services/servicosPhoenix";
import {
  SEMANAS_EXPERIENCIA,
  chavesNomeGuia,
  guiasPhoenixSemCadastro,
  nivelSugeridoPeloHistorico,
} from "../../Services/Services/historicoEscala";
import { encontrarServiceCatalogo } from "../../Services/Services/plannerApi";
import { normalizarTexto } from "../../Services/Services/plannerUtils";
import CardSkeleton from "../CardSkeleton/CardSkeleton";
import "./styles.css";
import "./afinidade.css";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  Icon,
  PageHeader,
  SearchInput,
} from "../ui";
import GuiaAvatar from "../ui/GuiaAvatar";

const LABEL_NIVEL = (valor) => {
  if (valor === 0) return "Não operar";
  if (valor <= 20) return "Muito baixo";
  if (valor <= 40) return "Baixo";
  if (valor <= 60) return "Médio";
  if (valor <= 80) return "Bom";
  return "Excelente";
};

// Mesmas 4 faixas da legenda ("Leitura dos níveis"), só com tokens:
// 0 = neutro, 5–40 = aviso, 45–60 = accent claro, 65–100 = accent.
const obterCorNivel = (valor) => {
  if (valor === 0) return "var(--text-3)";
  if (valor <= 40) return "var(--warning)";
  if (valor <= 60) return "var(--accent-300)";
  return "var(--accent)";
};

const FAIXAS_LEGENDA = [
  { valor: 0, faixa: "0", rotulo: "Não opera" },
  { valor: 20, faixa: "5–40", rotulo: "Baixo" },
  { valor: 50, faixa: "45–60", rotulo: "Médio" },
  { valor: 80, faixa: "65–100", rotulo: "Alto" },
];

const obterNomePasseio = (passeio) => {
  return (
    passeio?.nome ||
    passeio?.name ||
    passeio?.externalName ||
    passeio?.serviceName ||
    passeio?.titulo ||
    "Passeio sem nome"
  );
};

// Uma linha do mapa: nome do passeio, régua de afinidade e nível.
// `fora` = o passeio está fora da escala automática (não recebe guia).
const LinhaPasseio = ({
  passeio,
  valor,
  salvando,
  fora,
  alternando,
  historico,
  onNivel,
  onAlternar,
  onAplicarSugestao,
}) => {
  const nome = obterNomePasseio(passeio);
  const corNivel = obterCorNivel(valor);
  return (
    <li className={`${salvando ? "is-saving" : ""} ${fora ? "is-fora" : ""}`}>
      <span className="afinidade-passeio__nome">
        {nome}
        <button
          type="button"
          className="afinidade-passeio__escala"
          onClick={onAlternar}
          disabled={alternando}
          title={
            fora
              ? "Voltar a receber guia na escala automática"
              : "Este passeio não recebe guia: tirar da escala automática"
          }
        >
          <Icon name={fora ? "plus" : "eyeOff"} size={12} />
          {fora ? "Colocar na escala" : "Tirar da escala"}
        </button>
        {historico && (
          <span className={`afinidade-historico ${historico.naoOpera ? "is-alerta" : ""}`}>
            <Icon name="history" size={12} />
            fez {historico.vezes}× nas últimas {SEMANAS_EXPERIENCIA} semanas
            {historico.naoOpera && " — está como Não operar"}
            {historico.sugestao && (
              <>
                {" · "}sugerido {historico.sugestao}
                <button
                  type="button"
                  onClick={onAplicarSugestao}
                  disabled={salvando}
                  title={`Usar ${historico.sugestao} neste passeio`}
                >
                  Aplicar
                </button>
              </>
            )}
          </span>
        )}
      </span>
      <input
        type="range"
        min="0"
        max="100"
        step="5"
        value={valor}
        onChange={(e) => onNivel(e.target.value)}
        className="afinidade-slider"
        disabled={salvando}
        aria-label={`Nível em ${nome}`}
        style={{ "--nivel-cor": corNivel, "--nivel-pct": `${valor}%` }}
      />
      <span className="afinidade-passeio__valor">
        <strong className="tabular">{valor}</strong>
        <span>{LABEL_NIVEL(valor)}</span>
      </span>
    </li>
  );
};

const dataCurta = (iso) => (iso ? iso.split("-").reverse().slice(0, 2).join("/") : "");

// Aviso de passeios que aparecem no Phoenix mas não estão no mapa nem
// fora da escala (na escala eles ficam sem nenhum guia apto).
const AvisoSemMapa = ({ varredura, semMapa, ocupado, onConferir, onAdicionar, onTirar, onAdicionarTodos }) => {
  const [verTodos, setVerTodos] = useState(false);
  const periodo = `últimas ${DIAS_HISTORICO_PADRAO / 7} semanas e próximas ${DIAS_A_FRENTE_PADRAO / 7}`;

  if (varredura.estado === "varrendo") {
    const pct = varredura.total ? Math.round((varredura.feitas / varredura.total) * 100) : 0;
    return (
      <div className="afinidade-aviso is-varrendo" role="status">
        <Icon name="refresh" size={15} className="afinidade-aviso__girando" />
        <span>
          Conferindo os passeios do Phoenix ({periodo})… {varredura.feitas}/{varredura.total}
        </span>
        <span className="afinidade-aviso__barra" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </span>
      </div>
    );
  }

  if (varredura.estado === "erro") {
    return (
      <div className="afinidade-aviso is-erro" role="status">
        <Icon name="alert" size={15} />
        <span>Não foi possível conferir os passeios do Phoenix agora.</span>
        <button type="button" className="afinidade-aviso__link" onClick={onConferir}>
          Tentar de novo
        </button>
      </div>
    );
  }

  if (varredura.estado !== "pronto") return null;

  if (!semMapa.length) {
    return (
      <div className="afinidade-aviso is-ok" role="status">
        <Icon name="circleCheck" size={15} />
        <span>
          Todos os passeios do Phoenix ({periodo}) estão no mapa ou fora da escala.
        </span>
        <button type="button" className="afinidade-aviso__link" onClick={onConferir}>
          Conferir de novo
        </button>
      </div>
    );
  }

  const visiveis = verTodos ? semMapa : semMapa.slice(0, 6);
  return (
    <Card className="afinidade-sem-mapa">
      <div className="afinidade-sem-mapa__cab">
        <span className="afinidade-sem-mapa__icone">
          <Icon name="alert" size={18} />
        </span>
        <div>
          <strong>
            {semMapa.length} passeio{semMapa.length === 1 ? "" : "s"} do Phoenix sem mapeamento
          </strong>
          <p>
            Aparecem no Phoenix ({periodo}) mas não estão no mapa nem fora da escala — na
            escala eles ficam sem guia apto. Coloque no mapa para dar afinidade aos guias, ou
            tire da escala se não recebem guia.
          </p>
        </div>
        <div className="afinidade-sem-mapa__acoes">
          <Button size="sm" variant="ghost" icon="refresh" onClick={onConferir} disabled={ocupado}>
            Conferir de novo
          </Button>
          {semMapa.length > 1 && (
            <Button size="sm" icon="plus" onClick={onAdicionarTodos} disabled={ocupado}>
              Colocar todos no mapa
            </Button>
          )}
        </div>
      </div>
      <ul className="afinidade-sem-mapa__lista">
        {visiveis.map((s) => (
          <li key={s.chave}>
            <div className="afinidade-sem-mapa__nome">
              <strong>{s.nome}</strong>
              <span>
                {s.proximo ? `próximo: ${dataCurta(s.proximo)}` : `último: ${dataCurta(s.ultimo)}`}
                {" · "}
                {s.totalDias} dia{s.totalDias === 1 ? "" : "s"} no período
                {s.frequencia.length > 0 && ` · ${s.frequencia.map((d) => d.slice(0, 3)).join(", ")}`}
                {s.externalServiceId && ` · id ${s.externalServiceId}`}
              </span>
            </div>
            <div className="afinidade-sem-mapa__botoes">
              <Button size="sm" variant="primary" icon="plus" onClick={() => onAdicionar(s)} disabled={ocupado}>
                Colocar no mapa
              </Button>
              <Button size="sm" variant="ghost" icon="eyeOff" onClick={() => onTirar(s)} disabled={ocupado}>
                Fora da escala
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {semMapa.length > 6 && (
        <button type="button" className="afinidade-aviso__link afinidade-sem-mapa__mais" onClick={() => setVerTodos((v) => !v)}>
          {verTodos ? "Mostrar menos" : `Ver todos os ${semMapa.length}`}
        </button>
      )}
    </Card>
  );
};

const MapaAfinidadeGuias = () => {
  const [guias, setGuias] = useState([]);
  const [passeios, setPasseios] = useState([]);
  const [guiaSelecionado, setGuiaSelecionado] = useState("");
  const [niveis, setNiveis] = useState({});

  const [loadingInicial, setLoadingInicial] = useState(true);
  const [loadingMapa, setLoadingMapa] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [buscaGuia, setBuscaGuia] = useState(""); // só filtra a lista visual
  const [buscaPasseio, setBuscaPasseio] = useState("");
  const [foraDaEscala, setForaDaEscala] = useState([]);
  const [verFora, setVerFora] = useState(false);
  const [alternando, setAlternando] = useState(false);
  // conferência com o Phoenix (histórico + próximas semanas)
  const [varredura, setVarredura] = useState({ estado: "idle", feitas: 0, total: 0, servicos: [], historico: [] });
  const [mensagem, setMensagem] = useState("");
  const [tipoMensagem, setTipoMensagem] = useState("");

  useEffect(() => {
    const carregarDados = async () => {
      try {
        setLoadingInicial(true);

        const [snapGuias, snapPasseios, listaFora] = await Promise.all([
          getDocs(collection(db, "guides")),
          getDocs(collection(db, "services")),
          carregarServicosForaDaEscala(true),
        ]);
        setForaDaEscala(listaFora);

        const listaGuias = snapGuias.docs
          .map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }))
          .sort((a, b) =>
            (a.nome || "").localeCompare(b.nome || "", "pt-BR", {
              sensitivity: "base",
            }),
          );

        const listaPasseios = snapPasseios.docs
          .map((docSnap) => {
            const data = docSnap.data();

            return {
              id: docSnap.id,
              ...data,
              nomeExibicao:
                data.nome ||
                data.name ||
                data.externalName ||
                data.serviceName ||
                data.titulo ||
                "Passeio sem nome",
            };
          })
          .sort((a, b) =>
            (a.nomeExibicao || "").localeCompare(
              b.nomeExibicao || "",
              "pt-BR",
              { sensitivity: "base" },
            ),
          );

        setGuias(listaGuias);
        setPasseios(listaPasseios);
      } catch (err) {
        console.error("Erro ao carregar dados:", err);
        setTipoMensagem("erro");
        setMensagem("Erro ao carregar dados.");
      } finally {
        setLoadingInicial(false);
      }
    };

    carregarDados();
  }, []);

  useEffect(() => {
    const carregarMapaGuia = async () => {
      if (!guiaSelecionado) {
        setNiveis({});
        return;
      }

      try {
        setLoadingMapa(true);

        const ref = doc(db, "guide_tour_levels", guiaSelecionado);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const data = snap.data();
          setNiveis(data.tours || {});
        } else {
          setNiveis({});
        }
      } catch (err) {
        console.error("Erro ao carregar afinidade do guia:", err);
        setTipoMensagem("erro");
        setMensagem("Erro ao carregar o mapeamento do guia.");
      } finally {
        setLoadingMapa(false);
      }
    };

    carregarMapaGuia();
  }, [guiaSelecionado]);

  useEffect(() => {
    if (!mensagem) return;

    const timer = setTimeout(() => {
      setMensagem("");
      setTipoMensagem("");
    }, 3500);

    return () => clearTimeout(timer);
  }, [mensagem]);

  const guiaAtual = useMemo(
    () => guias.find((g) => g.id === guiaSelecionado) || null,
    [guias, guiaSelecionado],
  );

  const atualizarNivel = (tourId, valor) => {
    setNiveis((prev) => ({
      ...prev,
      [String(tourId)]: Number(valor),
    }));
  };

  const salvarMapa = async () => {
    if (!guiaSelecionado || salvando) return;

    try {
      setSalvando(true);
      setMensagem("");
      setTipoMensagem("");

      await setDoc(
        doc(db, "guide_tour_levels", guiaSelecionado),
        {
          guideId: guiaSelecionado,
          guideName: guiaAtual?.nome || "",
          tours: niveis,
          updatedAt: Timestamp.now(),
        },
        { merge: true },
      );

      setTipoMensagem("sucesso");
      setMensagem("Mapeamento salvo com sucesso.");
    } catch (err) {
      console.error("Erro ao salvar mapeamento:", err);
      setTipoMensagem("erro");
      setMensagem("Erro ao salvar mapeamento.");
    } finally {
      setSalvando(false);
    }
  };

  const conferirPhoenix = async () => {
    setVarredura({ estado: "varrendo", feitas: 0, total: 0, servicos: [], historico: [] });
    try {
      const { servicos, historico } = await levantarServicosDoPhoenix({
        onProgresso: (feitas, total) =>
          setVarredura((v) => ({ ...v, feitas, total })),
      });
      setVarredura({ estado: "pronto", feitas: 0, total: 0, servicos, historico });
    } catch (err) {
      console.error("Erro ao conferir os passeios do Phoenix:", err);
      setVarredura({ estado: "erro", feitas: 0, total: 0, servicos: [], historico: [] });
    }
  };

  // confere sozinho ao abrir a tela (depois de carregar o cadastro)
  useEffect(() => {
    if (!loadingInicial && varredura.estado === "idle") conferirPhoenix();
  }, [loadingInicial]);

  const semMapa = useMemo(
    () =>
      varredura.estado === "pronto"
        ? separarSemMapeamento({ servicos: varredura.servicos, catalogo: passeios, foraDaEscala })
        : [],
    [varredura, passeios, foraDaEscala],
  );

  // guias do Phoenix que não batem com nenhum nome/apelido do cadastro
  const guiasSemCadastro = useMemo(
    () => guiasPhoenixSemCadastro({ entradas: varredura.historico || [], guias }),
    [varredura, guias],
  );

  // quantos dias o guia selecionado fez cada passeio nas últimas semanas
  const vezesPorPasseio = useMemo(() => {
    if (!guiaAtual || !varredura.historico?.length) return {};
    const chaves = new Set(chavesNomeGuia(guiaAtual));
    const contagem = {};
    varredura.historico
      .filter((e) => chaves.has(e.guiaChave))
      .forEach((e) => {
        const p = encontrarServiceCatalogo(e.externalServiceId, e.serviceName, passeios, normalizarTexto);
        if (p) contagem[p.id] = (contagem[p.id] || 0) + 1;
      });
    return contagem;
  }, [guiaAtual, varredura, passeios]);

  const historicoDoPasseio = (passeio) => {
    const vezes = vezesPorPasseio[passeio.id] || 0;
    if (!vezes) return null;
    const atual = niveis[String(passeio.id)] ?? 0;
    const sugestao = nivelSugeridoPeloHistorico(vezes);
    return { vezes, sugestao: sugestao > atual ? sugestao : null, naoOpera: atual === 0 };
  };

  const sugestoesPendentes = passeios.filter((p) => historicoDoPasseio(p)?.sugestao);

  const aplicarSugestoes = (lista) => {
    setNiveis((prev) => {
      const prox = { ...prev };
      lista.forEach((p) => {
        const h = historicoDoPasseio(p);
        if (h?.sugestao) prox[String(p.id)] = h.sugestao;
      });
      return prox;
    });
    setTipoMensagem("sucesso");
    setMensagem(
      lista.length === 1
        ? "Sugestão aplicada — clique em Salvar mapeamento para gravar."
        : `${lista.length} sugestões aplicadas — clique em Salvar mapeamento para gravar.`,
    );
  };

  const colocarNoMapa = async (lista) => {
    try {
      setAlternando(true);
      const criados = await cadastrarServicosDoPhoenix(lista);
      setPasseios((prev) =>
        [...prev, ...criados.map((c) => ({ ...c, nomeExibicao: c.nome }))].sort((a, b) =>
          obterNomePasseio(a).localeCompare(obterNomePasseio(b), "pt-BR", { sensitivity: "base" }),
        ),
      );
      setTipoMensagem("sucesso");
      setMensagem(
        criados.length === 1
          ? `${criados[0].nome} entrou no mapa — ajuste a afinidade dos guias com ele.`
          : `${criados.length} passeios entraram no mapa — ajuste a afinidade dos guias com eles.`,
      );
    } catch (err) {
      console.error("Erro ao colocar passeio no mapa:", err);
      setTipoMensagem("erro");
      setMensagem("Não foi possível colocar o passeio no mapa.");
    } finally {
      setAlternando(false);
    }
  };

  const tirarDaEscalaPeloNome = async (nome) => {
    try {
      setAlternando(true);
      setForaDaEscala(await alternarServicoForaDaEscala(nome, foraDaEscala, true));
      setTipoMensagem("sucesso");
      setMensagem(`${nome} saiu da escala automática.`);
    } catch (err) {
      console.error("Erro ao tirar serviço da escala:", err);
      setTipoMensagem("erro");
      setMensagem("Não foi possível tirar o serviço da escala.");
    } finally {
      setAlternando(false);
    }
  };

  const alternarEscala = async (passeio, colocarFora) => {
    try {
      setAlternando(true);
      const lista = await alternarServicoForaDaEscala(
        obterNomePasseio(passeio),
        foraDaEscala,
        colocarFora,
      );
      setForaDaEscala(lista);
      setTipoMensagem("sucesso");
      setMensagem(
        colocarFora
          ? `${obterNomePasseio(passeio)} saiu da escala automática.`
          : `${obterNomePasseio(passeio)} voltou para a escala automática.`,
      );
    } catch (err) {
      console.error("Erro ao alterar serviço da escala:", err);
      setTipoMensagem("erro");
      setMensagem("Não foi possível alterar o passeio na escala.");
    } finally {
      setAlternando(false);
    }
  };

  const termoPasseio = buscaPasseio.trim().toLowerCase();
  const passeiosFiltrados = termoPasseio
    ? passeios.filter((p) => obterNomePasseio(p).toLowerCase().includes(termoPasseio))
    : passeios;
  const passeiosNaEscala = passeiosFiltrados.filter(
    (p) => !estaForaDaEscala(obterNomePasseio(p), foraDaEscala),
  );
  const passeiosFora = passeiosFiltrados.filter((p) =>
    estaForaDaEscala(obterNomePasseio(p), foraDaEscala),
  );

  const termo = buscaGuia.trim().toLowerCase();
  const guiasVisiveis = termo
    ? guias.filter((g) => String(g.nome || "").toLowerCase().includes(termo))
    : guias;

  return (
    <div className="afinidade-page ui-page">
      <PageHeader
        title="Mapa de afinidade"
        description="Defina o nível de cada guia em cada passeio para melhorar a distribuição automática."
        actions={
          <Button
            variant="primary"
            icon="save"
            onClick={salvarMapa}
            disabled={salvando || !guiaSelecionado}
            loading={salvando}
          >
            {salvando ? "Salvando alterações..." : "Salvar mapeamento"}
          </Button>
        }
      >
        <ul className="afinidade-legenda" aria-label="Leitura dos níveis">
          {FAIXAS_LEGENDA.map((f) => (
            <li key={f.faixa}>
              <span className="afinidade-legenda__dot" style={{ background: obterCorNivel(f.valor) }} />
              <strong className="tabular">{f.faixa}</strong> {f.rotulo}
            </li>
          ))}
        </ul>
      </PageHeader>

      {mensagem && (
        <div className={`afinidade-msg ${tipoMensagem === "erro" ? "is-erro" : ""}`} role="status">
          <Icon name={tipoMensagem === "erro" ? "alert" : "circleCheck"} size={16} />
          {mensagem}
        </div>
      )}

      {varredura.estado === "pronto" && guiasSemCadastro.length > 0 && (
        <div className="afinidade-aviso is-guias" role="status">
          <Icon name="user" size={15} />
          <span>
            Guias do Phoenix que não batem com o cadastro (o histórico deles não conta na escala
            nem nas sugestões):{" "}
            <b>
              {guiasSemCadastro
                .slice(0, 10)
                .map((g) => `${g.nome} (${g.vezes}×)`)
                .join(", ")}
            </b>
            {guiasSemCadastro.length > 10 && ` e mais ${guiasSemCadastro.length - 10}`}. Ajuste o
            apelido no cadastro do guia (Lista de guias) para ficar igual ao do Phoenix.
          </span>
        </div>
      )}

      <AvisoSemMapa
        varredura={varredura}
        semMapa={semMapa}
        ocupado={alternando || salvando}
        onConferir={conferirPhoenix}
        onAdicionar={(sv) => colocarNoMapa([sv])}
        onAdicionarTodos={() => colocarNoMapa(semMapa)}
        onTirar={(sv) => tirarDaEscalaPeloNome(sv.nome)}
      />

      <div className="afinidade-layout">
        {/* ---- guias ---- */}
        <Card className="afinidade-guias">
          <div className="afinidade-guias__busca">
            <SearchInput
              value={buscaGuia}
              onChange={(e) => setBuscaGuia(e.target.value)}
              placeholder="Buscar guia"
              aria-label="Buscar guia"
            />
          </div>
          {loadingInicial ? (
            <CardSkeleton variant="list" rows={6} />
          ) : (
            <ul className="afinidade-guias__lista" role="listbox" aria-label="Guia">
              {guiasVisiveis.map((guia) => {
                const ativo = guia.id === guiaSelecionado;
                return (
                  <li key={guia.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={ativo}
                      className={`afinidade-guia ${ativo ? "is-active" : ""}`}
                      onClick={() => setGuiaSelecionado(guia.id)}
                      disabled={salvando}
                    >
                      <GuiaAvatar nome={guia.nome} id={guia.id} soFoto semLink tamanho={30} />
                      <span className="afinidade-guia__nome">{guia.nome}</span>
                      {guia.ativo === false && <span className="ui-cell-sub">inativo</span>}
                    </button>
                  </li>
                );
              })}
              {!guiasVisiveis.length && (
                <li className="afinidade-guias__vazio">Nenhum guia encontrado.</li>
              )}
            </ul>
          )}
        </Card>

        {/* ---- passeios do guia ---- */}
        <Card className="afinidade-passeios">
          {!guiaSelecionado ? (
            <EmptyState icon="map" title="Selecione um guia">
              Escolha um guia na lista para ajustar a afinidade dele com cada passeio cadastrado.
            </EmptyState>
          ) : (
            <>
              <CardHeader
                icon="user"
                title={guiaAtual?.nome}
                subtitle={
                  loadingMapa
                    ? "Carregando..."
                    : `${passeios.length - passeiosFora.length} passeio(s) na escala${passeiosFora.length ? ` · ${passeiosFora.length} fora` : ""
                    }`
                }
              />
              <div className="afinidade-passeios__ferramentas">
                {sugestoesPendentes.length > 0 && (
                  <Button
                    size="sm"
                    icon="history"
                    onClick={() => aplicarSugestoes(sugestoesPendentes)}
                    disabled={salvando}
                    title="Sobe a afinidade dos passeios que o guia fez nas últimas semanas (nunca baixa)"
                  >
                    Aplicar sugestões do histórico ({sugestoesPendentes.length})
                  </Button>
                )}
                <SearchInput
                  value={buscaPasseio}
                  onChange={(e) => setBuscaPasseio(e.target.value)}
                  placeholder="Buscar passeio"
                  aria-label="Buscar passeio"
                />
                <span className="afinidade-passeios__dica">
                  <Icon name="info" size={13} />
                  Faltou algum passeio?{" "}
                  <Link to="/register-tours">Puxe do Phoenix no Cadastro de passeios</Link>.
                </span>
              </div>
              {loadingMapa ? (
                <CardSkeleton variant="affinity" rows={8} />
              ) : passeios.length > 0 ? (
                <>
                  <ul className="afinidade-lista-nova">
                    {passeiosNaEscala.map((passeio) => (
                      <LinhaPasseio
                        key={passeio.id}
                        passeio={passeio}
                        valor={niveis[String(passeio.id)] ?? 0}
                        salvando={salvando}
                        alternando={alternando}
                        onNivel={(v) => atualizarNivel(passeio.id, v)}
                        onAlternar={() => alternarEscala(passeio, true)}
                        historico={historicoDoPasseio(passeio)}
                        onAplicarSugestao={() => aplicarSugestoes([passeio])}
                      />
                    ))}
                    {!passeiosNaEscala.length && (
                      <li className="afinidade-lista-vazia">Nenhum passeio encontrado.</li>
                    )}
                  </ul>

                  {passeiosFora.length > 0 && (
                    <div className="afinidade-fora">
                      <button
                        type="button"
                        className="afinidade-fora__toggle"
                        onClick={() => setVerFora((v) => !v)}
                        aria-expanded={verFora}
                      >
                        <Icon name={verFora ? "chevronUp" : "chevronDown"} size={15} />
                        Fora da escala automática
                        <span className="afinidade-fora__qtd">{passeiosFora.length}</span>
                        <small>não recebem guia — ajuste em Configurações → Escala ou aqui</small>
                      </button>
                      {verFora && (
                        <ul className="afinidade-lista-nova">
                          {passeiosFora.map((passeio) => (
                            <LinhaPasseio
                              key={passeio.id}
                              passeio={passeio}
                              fora
                              valor={niveis[String(passeio.id)] ?? 0}
                              salvando={salvando}
                              alternando={alternando}
                              onNivel={(v) => atualizarNivel(passeio.id, v)}
                              onAlternar={() => alternarEscala(passeio, false)}
                              historico={historicoDoPasseio(passeio)}
                              onAplicarSugestao={() => aplicarSugestoes([passeio])}
                            />
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <EmptyState icon="compass" title="Nenhum passeio cadastrado.">
                  Puxe os passeios do Phoenix no{" "}
                  <Link to="/register-tours">Cadastro de passeios</Link>.
                </EmptyState>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
};

export default MapaAfinidadeGuias;
