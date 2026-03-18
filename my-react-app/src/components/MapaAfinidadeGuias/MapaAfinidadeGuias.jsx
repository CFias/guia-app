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
import "./styles.css";
import {
  AutoGraphRounded,
  ManageAccountsRounded,
  SaveRounded,
  TravelExploreRounded,
} from "@mui/icons-material";

const LABEL_NIVEL = (valor) => {
  if (valor === 0) return "Não operar";
  if (valor <= 20) return "Muito baixo";
  if (valor <= 40) return "Baixo";
  if (valor <= 60) return "Médio";
  if (valor <= 80) return "Bom";
  return "Excelente";
};

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

  return (
    <div className="afinidade-page">
      <div className="afinidade-page-header">
        <div>
          <h2 className="afinidade-page-title">
            Mapa de Afinidade Guia x Passeio{" "}
            <AutoGraphRounded fontSize="small" />
          </h2>
          <p className="afinidade-page-subtitle">
            Defina o nível de operação de cada guia em relação aos passeios e
            melhore a qualidade da distribuição automática.
          </p>
        </div>
      </div>

      <div className="afinidade-grid">
        <div className="afinidade-card afinidade-card-large">
          <div className="afinidade-card-header">
            <div className="afinidade-card-title-row">
              <h3>Selecionar guia</h3>
              <span className="afinidade-badge">Configuração</span>
            </div>
            <p>
              Escolha um guia para ajustar sua afinidade operacional com cada
              passeio cadastrado.
            </p>
          </div>

          {loadingInicial ? (
            <CardSkeleton variant="filters" />
          ) : (
            <>
              <div className="afinidade-field">
                <label htmlFor="afinidade-guia-select">
                  Guia <ManageAccountsRounded fontSize="small" />
                </label>
                <select
                  id="afinidade-guia-select"
                  className="afinidade-select"
                  value={guiaSelecionado}
                  onChange={(e) => setGuiaSelecionado(e.target.value)}
                  disabled={salvando}
                >
                  <option value="">Selecione um guia</option>
                  {guias.map((guia) => (
                    <option key={guia.id} value={guia.id}>
                      {guia.nome}
                    </option>
                  ))}
                </select>
              </div>

              {mensagem && (
                <div className={`afinidade-alerta ${tipoMensagem}`}>
                  {mensagem}
                </div>
              )}

              {guiaAtual && (
                <div className="afinidade-resumo-guia">
                  Configurando níveis de operação para{" "}
                  <strong>{guiaAtual.nome}</strong>
                </div>
              )}

              {guiaAtual && passeios.length === 0 && (
                <div className="afinidade-vazio">
                  Nenhum passeio encontrado na coleção <strong>services</strong>.
                </div>
              )}
            </>
          )}
        </div>

        <div className="afinidade-card">
          <div className="afinidade-card-header">
            <div className="afinidade-card-title-row">
              <h3>Leitura dos níveis</h3>
              <span className="afinidade-badge">Escala</span>
            </div>
            <p>
              Use a escala para indicar o quanto o guia está apto a operar cada
              passeio.
            </p>
          </div>

          {loadingInicial ? (
            <CardSkeleton variant="list" rows={4} />
          ) : (
            <div className="afinidade-legend">
              <div className="afinidade-legend-item">
                <span className="afinidade-legend-dot zero" />
                <div>
                  <strong>0</strong>
                  <span>Não operar</span>
                </div>
              </div>

              <div className="afinidade-legend-item">
                <span className="afinidade-legend-dot baixo" />
                <div>
                  <strong>5 a 40</strong>
                  <span>Nível baixo</span>
                </div>
              </div>

              <div className="afinidade-legend-item">
                <span className="afinidade-legend-dot medio" />
                <div>
                  <strong>45 a 60</strong>
                  <span>Nível médio</span>
                </div>
              </div>

              <div className="afinidade-legend-item">
                <span className="afinidade-legend-dot alto" />
                <div>
                  <strong>65 a 100</strong>
                  <span>Nível alto</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {guiaSelecionado && (
          <div className="afinidade-card afinidade-card-full">
            <div className="afinidade-card-header">
              <div className="afinidade-card-title-row">
                <h3>Relações de afinidade</h3>
                <span className="afinidade-badge">
                  {loadingMapa ? "Carregando..." : `${passeios.length} passeio(s)`}
                </span>
              </div>
              <p>
                Ajuste os níveis individualmente para refletir melhor a aptidão
                operacional do guia.
              </p>
            </div>

            {loadingMapa ? (
              <CardSkeleton variant="affinity" rows={8} />
            ) : passeios.length > 0 ? (
              <>
                <div className="afinidade-lista">
                  {passeios.map((passeio) => {
                    const valor = niveis[String(passeio.id)] ?? 0;

                    return (
                      <div
                        key={passeio.id}
                        className={`afinidade-item ${salvando ? "is-saving" : ""}`}
                      >
                        <div className="afinidade-item-topo">
                          <div className="afinidade-item-relacao">
                            <span className="afinidade-item-guia">
                              <ManageAccountsRounded fontSize="small" />
                              {guiaAtual?.nome}
                            </span>

                            <span className="afinidade-item-separador">•</span>

                            <span className="afinidade-item-passeio">
                              <TravelExploreRounded fontSize="small" />
                              {obterNomePasseio(passeio)}
                            </span>
                          </div>

                          <div className="afinidade-item-valor">
                            <strong>{valor}</strong>
                            <span>{LABEL_NIVEL(valor)}</span>
                          </div>
                        </div>

                        <div className="afinidade-range-wrap">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="5"
                            value={valor}
                            onChange={(e) =>
                              atualizarNivel(passeio.id, e.target.value)
                            }
                            className="afinidade-range"
                            disabled={salvando}
                          />
                        </div>

                        <div className="afinidade-escala-labels">
                          <span>Não opera</span>
                          <span>Médio</span>
                          <span>Excelente</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="afinidade-actions">
                  <button
                    className={`afinidade-btn-save ${salvando ? "is-saving" : ""}`}
                    onClick={salvarMapa}
                    disabled={salvando || !guiaSelecionado}
                  >
                    <SaveRounded fontSize="small" />
                    {salvando ? "Salvando alterações..." : "Salvar mapeamento"}
                  </button>

                  {salvando && (
                    <span className="afinidade-saving-hint">
                      Persistindo dados no sistema...
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="afinidade-vazio">
                Nenhum passeio encontrado para configurar.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MapaAfinidadeGuias;