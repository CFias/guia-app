import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../Services/Services/firebase";
import {
  JANELA_PADRAO,
  NOMES_DIAS_COMPLETO,
  rotuloJanela,
} from "../../Services/Utils/janelaDisponibilidade";
import { useTheme } from "../../Context/ThemeContext";
import CardSkeleton from "../../components/CardSkeleton/CardSkeleton";
import "./styles.css";
import {
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
  GroupsRounded,
  LanguageRounded,
  EventAvailableRounded,
  FolderSharedRounded,
  VpnKeyRounded,
} from "@mui/icons-material";
import { extrairIdPastaDrive } from "../../Services/Services/googleDrive";

const Configuracoes = () => {
  const { theme, toggleTheme, togglePro } = useTheme();

  const [abaAtiva, setAbaAtiva] = useState("tema");
  const [modoDistribuicaoGuias, setModoDistribuicaoGuias] =
    useState("equilibrado");
  const [usarAfinidadeGuiaPasseio, setUsarAfinidadeGuiaPasseio] =
    useState(false);
  const [modoIdioma, setModoIdioma] = useState("preferencial");
  const [paxMinimoParaGuia, setPaxMinimoParaGuia] = useState(2);
  const [pastaDriveTexto, setPastaDriveTexto] = useState("");
  const [driveClientId, setDriveClientId] = useState("");
  const [janelaConfig, setJanelaConfig] = useState(JANELA_PADRAO);

  const [loadingInicial, setLoadingInicial] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const carregar = async () => {
      try {
        setLoadingInicial(true);

        const ref = doc(db, "settings", "scale");
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const data = snap.data();
          setModoDistribuicaoGuias(data.modoDistribuicaoGuias || "equilibrado");
          setUsarAfinidadeGuiaPasseio(data.usarAfinidadeGuiaPasseio || false);
          setModoIdioma(data.modoIdioma || "preferencial");
          setJanelaConfig({
            dowAbertura:
              data.janelaDisponibilidadeAbertura ?? JANELA_PADRAO.dowAbertura,
            dowFechamento:
              data.janelaDisponibilidadeFechamento ??
              JANELA_PADRAO.dowFechamento,
          });
          if (
            data.paxMinimoParaGuia !== undefined &&
            data.paxMinimoParaGuia !== null &&
            Number.isFinite(Number(data.paxMinimoParaGuia))
          ) {
            setPaxMinimoParaGuia(Number(data.paxMinimoParaGuia));
          }
          if (data.driveFolderId) setPastaDriveTexto(data.driveFolderId);
          if (data.driveClientId) setDriveClientId(data.driveClientId);
        }
      } catch (err) {
        console.error("Erro ao carregar configurações:", err);
      } finally {
        setLoadingInicial(false);
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
        { merge: true },
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

  const salvarJanela = async (campo, valor) => {
    const proxima = { ...janelaConfig, [campo]: Number(valor) };
    setJanelaConfig(proxima);
    await salvarConfiguracao({
      janelaDisponibilidadeAbertura: proxima.dowAbertura,
      janelaDisponibilidadeFechamento: proxima.dowFechamento,
    });
  };

  const salvarModoIdioma = async (valor) => {
    if (valor === modoIdioma) return;
    setModoIdioma(valor);
    await salvarConfiguracao({ modoIdioma: valor });
  };

  const salvarPaxMinimo = async () => {
    const valor = Math.max(0, Math.min(20, Math.floor(Number(paxMinimoParaGuia) || 0)));
    setPaxMinimoParaGuia(valor);
    await salvarConfiguracao({ paxMinimoParaGuia: valor });
  };

  const salvarPastaDrive = async () => {
    const id = extrairIdPastaDrive(pastaDriveTexto);
    setPastaDriveTexto(id);
    await salvarConfiguracao({ driveFolderId: id });
  };

  const salvarClientIdDrive = async () => {
    const valor = driveClientId.trim();
    setDriveClientId(valor);
    await salvarConfiguracao({ driveClientId: valor });
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
            disabled={loadingInicial || salvando}
          >
            <span className="config-nav-left">
              <PaletteOutlined fontSize="small" />
              Tema
            </span>
          </button>

          <button
            className={`config-nav-item ${abaAtiva === "escala" ? "active" : ""}`}
            onClick={() => setAbaAtiva("escala")}
            disabled={loadingInicial || salvando}
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
                    Escolha o tema que melhor combina com o ambiente de uso e a
                    legibilidade da operação.
                  </p>
                </div>

                {loadingInicial ? (
                  <CardSkeleton variant="list" rows={3} />
                ) : (
                  <div className="theme-segmented">
                    <button
                      type="button"
                      className={`theme-option ${theme === "light" ? "active" : ""}`}
                      onClick={() => aplicarTema("light")}
                      disabled={salvando}
                    >
                      <div className="theme-option-icon">
                        <LightModeRounded fontSize="small" />
                      </div>
                      <div className="theme-option-text">
                        <strong>Claro</strong>
                        <span>Mais leve e aberto</span>
                      </div>
                      {theme === "light" && (
                        <CheckCircleRounded
                          className="theme-check"
                          fontSize="small"
                        />
                      )}
                    </button>

                    <button
                      type="button"
                      className={`theme-option ${theme === "dark" ? "active" : ""}`}
                      onClick={() => aplicarTema("dark")}
                      disabled={salvando}
                    >
                      <div className="theme-option-icon">
                        <BedtimeRounded fontSize="small" />
                      </div>
                      <div className="theme-option-text">
                        <strong>Dark</strong>
                        <span>Equilíbrio e contraste</span>
                      </div>
                      {theme === "dark" && (
                        <CheckCircleRounded
                          className="theme-check"
                          fontSize="small"
                        />
                      )}
                    </button>

                    <button
                      type="button"
                      className={`theme-option ${theme === "dark-pro" ? "active" : ""}`}
                      onClick={() => aplicarTema("dark-pro")}
                      disabled={salvando}
                    >
                      <div className="theme-option-icon">
                        <NightlightRounded fontSize="small" />
                      </div>
                      <div className="theme-option-text">
                        <strong>Dark Pro</strong>
                        <span>Mais sofisticado</span>
                      </div>
                      {theme === "dark-pro" && (
                        <CheckCircleRounded
                          className="theme-check"
                          fontSize="small"
                        />
                      )}
                    </button>
                  </div>
                )}
              </div>

              <div className="config-card">
                <div className="config-card-header">
                  <div className="config-card-title-row">
                    <h3>Resumo visual</h3>
                    <span className="config-badge">Status</span>
                  </div>
                  <p>Visualização rápida do modo atualmente selecionado.</p>
                </div>

                {loadingInicial ? (
                  <CardSkeleton variant="list" rows={2} />
                ) : (
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
                )}
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

                {loadingInicial ? (
                  <CardSkeleton variant="list" rows={2} />
                ) : (
                  <div className="radio-card-group">
                    <button
                      type="button"
                      className={`radio-card ${modoDistribuicaoGuias === "equilibrado" ? "active" : ""
                        }`}
                      onClick={() => salvarModo("equilibrado")}
                      disabled={salvando}
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
                      disabled={salvando}
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
                )}
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

                {loadingInicial ? (
                  <CardSkeleton variant="list" rows={2} />
                ) : (
                  <div className="switch-row">
                    <div className="switch-copy">
                      <label
                        className="switch-title"
                        htmlFor="afinidade-switch"
                      >
                        Usar afinidade guia x passeio{" "}
                        <Tune fontSize="small" />
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
                      disabled={salvando}
                    >
                      <span className="modern-switch-track">
                        <span className="modern-switch-thumb" />
                      </span>
                    </button>
                  </div>
                )}
              </div>

              <div className="config-card config-card-large">
                <div className="config-card-header">
                  <div className="config-card-title-row">
                    <h3>Janela de disponibilidade dos guias</h3>
                    <span className="config-badge">Regra principal</span>
                  </div>
                  <p>
                    Dias em que os guias conseguem enviar, alterar ou remover
                    a própria disponibilidade — fora desses dias, a tela fica
                    bloqueada para eles.
                  </p>
                </div>

                {loadingInicial ? (
                  <CardSkeleton variant="list" rows={2} />
                ) : (
                  <>
                    <div className="janela-escala-selects">
                      <label className="janela-escala-campo">
                        <span>Abre em</span>
                        <select
                          value={janelaConfig.dowAbertura}
                          onChange={(e) =>
                            salvarJanela("dowAbertura", e.target.value)
                          }
                          disabled={salvando}
                        >
                          {NOMES_DIAS_COMPLETO.map((nome, i) => (
                            <option key={nome} value={i}>
                              {nome} às 00h
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="janela-escala-campo">
                        <span>Fecha em</span>
                        <select
                          value={janelaConfig.dowFechamento}
                          onChange={(e) =>
                            salvarJanela("dowFechamento", e.target.value)
                          }
                          disabled={salvando}
                        >
                          {NOMES_DIAS_COMPLETO.map((nome, i) => (
                            <option key={nome} value={i}>
                              {nome} às 23h59
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <p className="config-help">
                      <EventAvailableRounded fontSize="inherit" /> Janela
                      atual: <strong>{rotuloJanela(janelaConfig)}</strong>.
                      Escala montada aos sábados — o que o guia informar nessa
                      janela vale para a semana seguinte.
                    </p>
                  </>
                )}
              </div>

              <div className="config-card config-card-large">
                <div className="config-card-header">
                  <div className="config-card-title-row">
                    <h3>Idioma dos passageiros</h3>
                    <span className="config-badge">Automação</span>
                  </div>
                  <p>
                    O idioma vem do Phoenix e é comparado com os idiomas que
                    cada guia fala (cadastro do guia).
                  </p>
                </div>

                {loadingInicial ? (
                  <CardSkeleton variant="list" rows={2} />
                ) : (
                  <div className="radio-card-group">
                    {[
                      {
                        valor: "preferencial",
                        titulo: "Preferencial",
                        texto:
                          "Dá preferência a quem fala o idioma. Se ninguém disponível fala, escala mesmo assim e avisa no resultado.",
                      },
                      {
                        valor: "obrigatorio",
                        titulo: "Obrigatório",
                        texto:
                          "Só escala quem fala o idioma do grupo. Sem ninguém que fale, o serviço fica sem guia e é listado no resultado.",
                      },
                      {
                        valor: "desligado",
                        titulo: "Desligado",
                        texto: "Ignora o idioma na escala automática.",
                      },
                    ].map((op) => (
                      <button
                        key={op.valor}
                        type="button"
                        className={`radio-card ${modoIdioma === op.valor ? "active" : ""}`}
                        onClick={() => salvarModoIdioma(op.valor)}
                        disabled={salvando}
                      >
                        <div className="radio-card-top">
                          <div className="radio-card-icon">
                            <LanguageRounded fontSize="small" />
                          </div>
                          <span className="radio-indicator" />
                        </div>

                        <strong>{op.titulo}</strong>
                        <p>{op.texto}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="config-card">
                <div className="config-card-header">
                  <div className="config-card-title-row">
                    <h3>Tamanho mínimo do grupo</h3>
                    <span className="config-badge">Automação</span>
                  </div>
                  <p>
                    Serviços com menos passageiros que isso não recebem guia na
                    escala automática. Privativos (DISP) ficam de fora da regra.
                  </p>
                </div>

                {loadingInicial ? (
                  <CardSkeleton variant="list" rows={2} />
                ) : (
                  <div className="switch-row">
                    <div className="switch-copy">
                      <label className="switch-title" htmlFor="pax-minimo">
                        Guia a partir de (pax){" "}
                        <GroupsRounded fontSize="small" />
                      </label>
                      <p className="config-help">
                        {Number(paxMinimoParaGuia) > 1
                          ? `Passeios com menos de ${paxMinimoParaGuia} pax ficam sem guia automático (ex.: 1 pax).`
                          : "Regra desligada: todo passeio recebe guia, mesmo com 1 pax."}
                      </p>
                    </div>

                    <input
                      id="pax-minimo"
                      type="number"
                      min="0"
                      max="20"
                      className="config-number-input"
                      value={paxMinimoParaGuia}
                      onChange={(e) => setPaxMinimoParaGuia(e.target.value)}
                      onBlur={salvarPaxMinimo}
                      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                      disabled={salvando}
                    />
                  </div>
                )}
              </div>

              <div className="config-card config-card-large">
                <div className="config-card-header">
                  <div className="config-card-title-row">
                    <h3>Google Drive</h3>
                    <span className="config-badge">Opcional</span>
                  </div>
                  <p>
                    Configuração do botão "Salvar no Drive", em Gerar Escala.
                    O passo a passo de como criar o Client ID está no arquivo{" "}
                    <code>GOOGLE_DRIVE_SETUP.md</code>, na raiz do projeto.
                  </p>
                </div>

                {loadingInicial ? (
                  <CardSkeleton variant="list" rows={2} />
                ) : (
                  <>
                    <div className="switch-row">
                      <div className="switch-copy">
                        <label className="switch-title" htmlFor="drive-client-id">
                          Client ID do Google <VpnKeyRounded fontSize="small" />
                        </label>
                        <p className="config-help">
                          Criado no Google Cloud Console — não é um dado
                          secreto, mas identifica este sistema perante o
                          Google. Sem ele, o botão "Salvar no Drive" avisa
                          que falta configurar.
                        </p>
                      </div>

                      <input
                        id="drive-client-id"
                        type="text"
                        placeholder="123456789-abcdefg.apps.googleusercontent.com"
                        className="config-text-input"
                        value={driveClientId}
                        onChange={(e) => setDriveClientId(e.target.value)}
                        onBlur={salvarClientIdDrive}
                        disabled={salvando}
                      />
                    </div>

                    <div className="switch-row">
                      <div className="switch-copy">
                        <label className="switch-title" htmlFor="pasta-drive">
                          Link ou ID da pasta <FolderSharedRounded fontSize="small" />
                        </label>
                        <p className="config-help">
                          Opcional. A escala sempre é salva ali, em vez da
                          raiz do Drive de quem clicar. A pasta precisa estar
                          compartilhada com quem for usar o botão.
                        </p>
                      </div>

                      <input
                        id="pasta-drive"
                        type="text"
                        placeholder="https://drive.google.com/drive/folders/..."
                        className="config-text-input"
                        value={pastaDriveTexto}
                        onChange={(e) => setPastaDriveTexto(e.target.value)}
                        onBlur={salvarPastaDrive}
                        disabled={salvando}
                      />
                    </div>
                  </>
                )}
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

                {loadingInicial ? (
                  <span className="config-saving">Carregando configuração...</span>
                ) : salvando ? (
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