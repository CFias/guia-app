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
import "./styles.css";
import LoadingBlock from "../LoadingOverlay/LoadingOverlay";

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
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [mensagem, setMensagem] = useState("");
  const [tipoMensagem, setTipoMensagem] = useState("");

  useEffect(() => {
    const carregarDados = async () => {
      try {
        setLoading(true);

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
              {
                sensitivity: "base",
              },
            ),
          );

        setGuias(listaGuias);
        setPasseios(listaPasseios);
      } catch (err) {
        console.error("Erro ao carregar dados:", err);
        setTipoMensagem("erro");
        setMensagem("Erro ao carregar dados.");
      } finally {
        setLoading(false);
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
        setLoading(true);

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
        setLoading(false);
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
    if (!guiaSelecionado) return;

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
    <div className="mapa-page">
      <h2 className="page-h2">Mapa de Afinidade Guia x Passeio</h2>

      <div className="mapa-card">
        <div className="config-field">
          <label>Selecionar guia</label>
          <select
            className="theme-select"
            value={guiaSelecionado}
            onChange={(e) => setGuiaSelecionado(e.target.value)}
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
          <div className={`mapa-alerta ${tipoMensagem}`}>{mensagem}</div>
        )}

        {guiaAtual && (
          <div className="mapa-resumo-guia">
            Configurando níveis de operação para{" "}
            <strong>{guiaAtual.nome}</strong>
          </div>
        )}

        {guiaAtual && passeios.length === 0 && (
          <div className="mapa-vazio">
            Nenhum passeio encontrado na coleção <strong>services</strong>.
          </div>
        )}

        {guiaAtual && passeios.length > 0 && (
          <>
            <div className="mapa-lista">
              {passeios.map((passeio) => {
                const valor = niveis[String(passeio.id)] ?? 0;

                return (
                  <div key={passeio.id} className="mapa-item">
                    <div className="mapa-topo">
                      <div className="mapa-titulo-relacao">
                        <span className="mapa-guia">{guiaAtual.nome}</span>
                        <span className="mapa-separador">•</span>
                        <span className="mapa-passeio">
                          {obterNomePasseio(passeio)}
                        </span>
                      </div>

                      <div className="mapa-valor">
                        {valor} • {LABEL_NIVEL(valor)}
                      </div>
                    </div>

                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={valor}
                      onChange={(e) =>
                        atualizarNivel(passeio.id, e.target.value)
                      }
                      className="mapa-range"
                    />

                    <div className="mapa-escala-labels">
                      <span>Não opera</span>
                      <span>Médio</span>
                      <span>Excelente</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              className="disp-btn-save"
              onClick={salvarMapa}
              disabled={salvando || !guiaSelecionado}
            >
              {salvando ? "Salvando..." : "Salvar mapeamento"}
            </button>
          </>
        )}
      </div>

      <LoadingBlock loading={loading} text="Carregando..." />
    </div>
  );
};

export default MapaAfinidadeGuias;
