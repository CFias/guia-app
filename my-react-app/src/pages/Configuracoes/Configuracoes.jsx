import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../Services/Services/firebase";
import { useTheme } from "../../Context/ThemeContext";
import "./styles.css";
import {
  DarkMode,
  Insights,
  Settings,
  Tune,
  PaletteOutlined,
  AutoAwesomeRounded,
  SaveRounded,
  LightModeRounded,
  BedtimeRounded,
  NightlightRounded,
  CheckCircleRounded,
} from "@mui/icons-material";

const Configuracoes = () => {
  const { theme, toggleTheme, togglePro } = useTheme();

  const [abaAtiva, setAbaAtiva] = useState("tema");
  const [modoDistribuicaoGuias, setModoDistribuicaoGuias] =
    useState("equilibrado");
  const [usarAfinidadeGuiaPasseio, setUsarAfinidadeGuiaPasseio] =
    useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const carregar = async () => {
      try {
        const ref = doc(db, "settings", "scale");
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const data = snap.data();
          setModoDistribuicaoGuias(data.modoDistribuicaoGuias || "equilibrado");
          setUsarAfinidadeGuiaPasseio(data.usarAfinidadeGuiaPasseio || false);
        }
      } catch (err) {
        console.error("Erro ao carregar configurações:", err);
      }
    };

    carregar();
  }, []);

  const salvarConfiguracao = async (novosCampos) => {
    try {
      setSalvando(true);

      await setDoc(
        doc(db, "settings", "scale"),
        {
          ...novosCampos,
          updatedAt: new Date(),
        },
        { merge: true }
      );
    } catch (err) {
      console.error("Erro ao salvar configuração:", err);
      alert("Erro ao salvar configuração");
    } finally {
      setSalvando(false);
    }
  };

  const salvarModo = async (valor) => {
    if (valor === modoDistribuicaoGuias) return;
    setModoDistribuicaoGuias(valor);
    await salvarConfiguracao({
      modoDistribuicaoGuias: valor,
    });
  };

  const salvarUsoAfinidade = async (valor) => {
    if (valor === usarAfinidadeGuiaPasseio) return;
    setUsarAfinidadeGuiaPasseio(valor);
    await salvarConfiguracao({
      usarAfinidadeGuiaPasseio: valor,
    });
  };

  const aplicarTema = (selectedTheme) => {
    if (selectedTheme === theme) return;

    if (selectedTheme === "light") {
      if (theme === "dark-pro") togglePro();
      if (theme !== "light") toggleTheme();
    }

    if (selectedTheme === "dark") {
      if (theme === "light") toggleTheme();
      if (theme === "dark-pro") togglePro();
    }

    if (selectedTheme === "dark-pro") {
      if (theme === "light") toggleTheme();
      if (theme === "dark") togglePro();
    }
  };

  return (
    <div className="config-page">
      <div className="config-page-header">
        <div>
          <h2 className="config-title-page">
            Configurações <Settings fontSize="small" />
          </h2>
          <p className="config-subtitle">
            Ajuste a aparência da plataforma e defina o comportamento da escala
            automática com uma interface mais moderna e objetiva.
          </p>
        </div>
      </div>

      <div className="config-layout">
        <aside className="config-nav">
          <button
            className={`config-nav-item ${abaAtiva === "tema" ? "active" : ""}`}
            onClick={() => setAbaAtiva("tema")}
          >
            <span className="config-nav-left">
              <PaletteOutlined fontSize="small" />
              Tema
            </span>
          </button>

          <button
            className={`config-nav-item ${abaAtiva === "escala" ? "active" : ""}`}
            onClick={() => setAbaAtiva("escala")}
          >
            <span className="config-nav-left">
              <AutoAwesomeRounded fontSize="small" />
              Escala
            </span>
          </button>
        </aside>

        <section className="config-content">
          {abaAtiva === "tema" && (
            <div className="config-grid">
              <div className="config-card config-card-large">
                <div className="config-card-header">
                  <div className="config-card-title-row">
                    <h3>Aparência da plataforma</h3>
                    <span className="config-badge">Visual</span>
                  </div>
                  <p>
                    Escolha o tema que melhor combina com o ambiente de uso e
                    a legibilidade da operação.
                  </p>
                </div>

                <div className="theme-segmented">
                  <button
                    type="button"
                    className={`theme-option ${theme === "light" ? "active" : ""}`}
                    onClick={() => aplicarTema("light")}
                  >
                    <div className="theme-option-icon">
                      <LightModeRounded fontSize="small" />
                    </div>
                    <div className="theme-option-text">
                      <strong>Claro</strong>
                      <span>Mais leve e aberto</span>
                    </div>
                    {theme === "light" && (
                      <CheckCircleRounded className="theme-check" fontSize="small" />
                    )}
                  </button>

                  <button
                    type="button"
                    className={`theme-option ${theme === "dark" ? "active" : ""}`}
                    onClick={() => aplicarTema("dark")}
                  >
                    <div className="theme-option-icon">
                      <BedtimeRounded fontSize="small" />
                    </div>
                    <div className="theme-option-text">
                      <strong>Dark</strong>
                      <span>Equilíbrio e contraste</span>
                    </div>
                    {theme === "dark" && (
                      <CheckCircleRounded className="theme-check" fontSize="small" />
                    )}
                  </button>

                  <button
                    type="button"
                    className={`theme-option ${theme === "dark-pro" ? "active" : ""}`}
                    onClick={() => aplicarTema("dark-pro")}
                  >
                    <div className="theme-option-icon">
                      <NightlightRounded fontSize="small" />
                    </div>
                    <div className="theme-option-text">
                      <strong>Dark Pro</strong>
                      <span>Mais sofisticado</span>
                    </div>
                    {theme === "dark-pro" && (
                      <CheckCircleRounded className="theme-check" fontSize="small" />
                    )}
                  </button>
                </div>
              </div>

              <div className="config-card">
                <div className="config-card-header">
                  <div className="config-card-title-row">
                    <h3>Resumo visual</h3>
                    <span className="config-badge">Status</span>
                  </div>
                  <p>Visualização rápida do modo atualmente selecionado.</p>
                </div>

                <div className="config-preview">
                  <div className="config-preview-item">
                    <span className="preview-label">Tema atual</span>
                    <strong className="preview-value">
                      {theme === "light"
                        ? "Claro"
                        : theme === "dark"
                          ? "Dark"
                          : "Dark Pro"}
                    </strong>
                  </div>

                  <div className="config-preview-item">
                    <span className="preview-label">Experiência</span>
                    <strong className="preview-value">
                      {theme === "light"
                        ? "Mais limpa"
                        : theme === "dark"
                          ? "Mais confortável"
                          : "Mais premium"}
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          )}

          {abaAtiva === "escala" && (
            <div className="config-grid">
              <div className="config-card config-card-large">
                <div className="config-card-header">
                  <div className="config-card-title-row">
                    <h3>Modo de distribuição</h3>
                    <span className="config-badge">Regra principal</span>
                  </div>
                  <p>
                    Defina a lógica usada para distribuir os serviços entre os
                    guias na geração automática.
                  </p>
                </div>

                <div className="radio-card-group">
                  <button
                    type="button"
                    className={`radio-card ${modoDistribuicaoGuias === "equilibrado" ? "active" : ""
                      }`}
                    onClick={() => salvarModo("equilibrado")}
                  >
                    <div className="radio-card-top">
                      <div className="radio-card-icon">
                        <Insights fontSize="small" />
                      </div>
                      <span className="radio-indicator" />
                    </div>

                    <strong>Equilibrado</strong>
                    <p>
                      Distribui os serviços de forma mais justa entre os guias,
                      ajudando a equilibrar melhor a operação.
                    </p>
                  </button>

                  <button
                    type="button"
                    className={`radio-card ${modoDistribuicaoGuias === "seguir_nivel_selecionado"
                        ? "active"
                        : ""
                      }`}
                    onClick={() => salvarModo("seguir_nivel_selecionado")}
                  >
                    <div className="radio-card-top">
                      <div className="radio-card-icon">
                        <AutoAwesomeRounded fontSize="small" />
                      </div>
                      <span className="radio-indicator" />
                    </div>

                    <strong>Prioridade</strong>
                    <p>
                      Favorece guias com maior nível de prioridade durante a
                      geração da escala automática.
                    </p>
                  </button>
                </div>
              </div>

              <div className="config-card">
                <div className="config-card-header">
                  <div className="config-card-title-row">
                    <h3>Afinidade operacional</h3>
                    <span className="config-badge">Automação</span>
                  </div>
                  <p>
                    Ative ou desative o uso da afinidade entre guia e passeio.
                  </p>
                </div>

                <div className="switch-row">
                  <div className="switch-copy">
                    <label className="switch-title" htmlFor="afinidade-switch">
                      Usar afinidade guia x passeio <Tune fontSize="small" />
                    </label>
                    <p className="config-help">
                      {usarAfinidadeGuiaPasseio
                        ? "A escala automática considera o histórico e o vínculo operacional entre guia e passeio."
                        : "A escala automática ignora o mapeamento de afinidade e distribui sem considerar esse relacionamento."}
                    </p>
                  </div>

                  <button
                    id="afinidade-switch"
                    type="button"
                    className={`modern-switch ${usarAfinidadeGuiaPasseio ? "active" : ""
                      }`}
                    onClick={() =>
                      salvarUsoAfinidade(!usarAfinidadeGuiaPasseio)
                    }
                    aria-pressed={usarAfinidadeGuiaPasseio}
                  >
                    <span className="modern-switch-track">
                      <span className="modern-switch-thumb" />
                    </span>
                  </button>
                </div>
              </div>

              <div className="config-status-card">
                <div className="config-status-top">
                  <div>
                    <h4>Estado da configuração</h4>
                    <p>
                      As alterações são aplicadas automaticamente assim que você
                      interage com os controles.
                    </p>
                  </div>

                  <div className="config-status-icon">
                    <SaveRounded fontSize="small" />
                  </div>
                </div>

                {salvando ? (
                  <span className="config-saving">Salvando configuração...</span>
                ) : (
                  <span className="config-saved">Tudo sincronizado</span>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default Configuracoes;