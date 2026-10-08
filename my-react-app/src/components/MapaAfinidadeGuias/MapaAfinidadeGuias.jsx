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
import CardSkeleton from "../CardSkeleton/CardSkeleton";
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

const MapaAfinidadeGuias = () => {
  const [guias, setGuias] = useState([]);
  const [passeios, setPasseios] = useState([]);
  const [guiaSelecionado, setGuiaSelecionado] = useState("");
  const [niveis, setNiveis] = useState({});

  const [loadingInicial, setLoadingInicial] = useState(true);
  const [loadingMapa, setLoadingMapa] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [buscaGuia, setBuscaGuia] = useState(""); // só filtra a lista visual
  const [mensagem, setMensagem] = useState("");
  const [tipoMensagem, setTipoMensagem] = useState("");

  useEffect(() => {
    const carregarDados = async () => {
      try {
        setLoadingInicial(true);

        const [snapGuias, snapPasseios] = await Promise.all([
          getDocs(collection(db, "guides")),
          getDocs(collection(db, "services")),
        ]);

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
                      <span className="afinidade-guia__avatar" aria-hidden="true">
                        {String(guia.nome || "?").trim().charAt(0).toUpperCase()}
                      </span>
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
                    : `Relações de afinidade · ${passeios.length} passeio(s)`
                }
              />
              {loadingMapa ? (
                <CardSkeleton variant="affinity" rows={8} />
              ) : passeios.length > 0 ? (
                <ul className="afinidade-lista-nova">
                  {passeios.map((passeio) => {
                    const valor = niveis[String(passeio.id)] ?? 0;
                    const corNivel = obterCorNivel(valor);

                    return (
                      <li key={passeio.id} className={salvando ? "is-saving" : ""}>
                        <span className="afinidade-passeio__nome">{obterNomePasseio(passeio)}</span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="5"
                          value={valor}
                          onChange={(e) => atualizarNivel(passeio.id, e.target.value)}
                          className="afinidade-slider"
                          disabled={salvando}
                          aria-label={`Nível em ${obterNomePasseio(passeio)}`}
                          style={{ "--nivel-cor": corNivel, "--nivel-pct": `${valor}%` }}
                        />
                        <span className="afinidade-passeio__valor">
                          <strong className="tabular">{valor}</strong>
                          <span>{LABEL_NIVEL(valor)}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <EmptyState icon="compass" title="Nenhum passeio encontrado para configurar.">
                  Nenhum passeio na coleção services.
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
