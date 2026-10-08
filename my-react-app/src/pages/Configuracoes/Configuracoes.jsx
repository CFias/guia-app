import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../Services/Services/firebase";
import {
  JANELA_PADRAO,
  NOMES_DIAS_COMPLETO,
  rotuloJanela,
} from "../../Services/Utils/janelaDisponibilidade";
import { useTheme } from "../../Context/ThemeContext";
import { useAuth } from "../../Context/AuthContext";
import {
  PALETA_ACCENT,
  usePreferenciasUI,
} from "../../Context/preferenciasUIContext";
import CardSkeleton from "../../components/CardSkeleton/CardSkeleton";
import "./config.css";
import {
  Card,
  Field,
  Icon,
  PageHeader,
  Segmented,
  StatusDot,
} from "../../components/ui";
import { extrairIdPastaDrive } from "../../Services/Services/googleDrive";

/* ---------- peças de layout (só apresentação) ---------- */

// seção em duas colunas: título + descrição | controles
const Secao = ({ titulo, descricao, carregando, children }) => (
  <div className="cfg-secao">
    <div className="cfg-secao__texto">
      <h2>{titulo}</h2>
      {descricao && <p>{descricao}</p>}
    </div>
    <div className="cfg-secao__controles">
      {carregando ? <CardSkeleton variant="list" rows={2} /> : children}
    </div>
  </div>
);

const OpcaoCard = ({ ativo, onClick, icone, titulo, texto, disabled }) => (
  <button
    type="button"
    className={`cfg-opcao ${ativo ? "is-active" : ""}`}
    onClick={onClick}
    disabled={disabled}
    aria-pressed={ativo}
  >
    <span className="cfg-opcao__topo">
      <Icon name={icone} size={16} />
      <span className="cfg-opcao__radio" aria-hidden="true" />
    </span>
    <strong>{titulo}</strong>
    {texto && <span className="cfg-opcao__texto">{texto}</span>}
  </button>
);

const Interruptor = ({ id, ligado, onClick, disabled }) => (
  <button
    id={id}
    type="button"
    className={`cfg-switch ${ligado ? "is-on" : ""}`}
    onClick={onClick}
    aria-pressed={ligado}
    disabled={disabled}
  >
    <span className="cfg-switch__thumb" />
  </button>
);

const Configuracoes = () => {
  const { theme, toggleTheme, togglePro } = useTheme();
  const { perfil } = useAuth();
  const { accent, setAccent } = usePreferenciasUI();

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

  /* ---------- só apresentação ---------- */
  const TEMAS = [
    { valor: "light", nome: "Claro", texto: "Mais leve e aberto", icone: "sun", experiencia: "Mais limpa" },
    { valor: "dark", nome: "Dark", texto: "Equilíbrio e contraste", icone: "moon", experiencia: "Mais confortável" },
    { valor: "dark-pro", nome: "Dark Pro", texto: "Mais sofisticado", icone: "sparkles", experiencia: "Mais premium" },
  ];
  const temaAtual = TEMAS.find((t) => t.valor === theme) || TEMAS[2];

  const estado = loadingInicial
    ? { tone: "muted", texto: "Carregando configuração..." }
    : salvando
      ? { tone: "warning", texto: "Salvando configuração..." }
      : { tone: "accent", texto: "Tudo sincronizado" };

  return (
    <div className="ui-page cfg-page">
      <PageHeader
        title="Configurações"
        description="Aparência da plataforma (sua) e regras da escala automática (da equipe)."
        actions={<StatusDot tone={estado.tone}>{estado.texto}</StatusDot>}
      />

      <Segmented
        ariaLabel="Grupo de configurações"
        value={abaAtiva}
        onChange={setAbaAtiva}
        options={[
          { value: "tema", label: "Tema", icon: "palette", disabled: loadingInicial || salvando },
          { value: "escala", label: "Escala", icon: "sparkles", disabled: loadingInicial || salvando },
        ]}
      />

      {abaAtiva === "tema" && (
        <Card className="cfg-card">
          <Secao
            carregando={loadingInicial}
            titulo="Aparência da plataforma"
            descricao="Escolha o tema que melhor combina com o ambiente de uso e a legibilidade da operação."
          >
            <div className="cfg-opcoes cfg-opcoes--3">
              {TEMAS.map((t) => (
                <OpcaoCard
                  disabled={salvando}
                  key={t.valor}
                  ativo={theme === t.valor}
                  onClick={() => aplicarTema(t.valor)}
                  icone={t.icone}
                  titulo={t.nome}
                  texto={t.texto}
                />
              ))}
            </div>
            <p className="cfg-ajuda">
              <Icon name="info" size={14} />
              <span>
                Tema atual: <strong>{temaAtual.nome}</strong> · {temaAtual.experiencia}
              </span>
            </p>
          </Secao>

          {/* Cor de destaque: de cada pessoa, salva neste navegador */}
          <Secao
            titulo="Cor de destaque"
            descricao={`Só para você (${perfil?.nome || "este usuário"}). Fica salva neste navegador.`}
          >
            <div className="config-accent-swatches" role="radiogroup" aria-label="Cor de destaque">
              {PALETA_ACCENT.map((cor) => (
                <button
                  key={cor.hex}
                  type="button"
                  role="radio"
                  aria-checked={accent === cor.hex}
                  className={`config-accent-swatch ${accent === cor.hex ? "active" : ""}`}
                  style={{ "--swatch": cor.hex }}
                  onClick={() => setAccent(cor.hex)}
                  title={cor.nome}
                >
                  <span className="config-accent-dot" aria-hidden="true" />
                  <span>{cor.nome}</span>
                </button>
              ))}
            </div>
          </Secao>
        </Card>
      )}

      {abaAtiva === "escala" && (
        <Card className="cfg-card">
          <Secao
            carregando={loadingInicial}
            titulo="Modo de distribuição"
            descricao="Lógica usada para distribuir os serviços entre os guias na geração automática."
          >
            <div className="cfg-opcoes">
              <OpcaoCard
                disabled={salvando}
                ativo={modoDistribuicaoGuias === "equilibrado"}
                onClick={() => salvarModo("equilibrado")}
                icone="activity"
                titulo="Equilibrado"
                texto="Distribui os serviços de forma mais justa entre os guias, ajudando a equilibrar melhor a operação."
              />
              <OpcaoCard
                disabled={salvando}
                ativo={modoDistribuicaoGuias === "seguir_nivel_selecionado"}
                onClick={() => salvarModo("seguir_nivel_selecionado")}
                icone="sparkles"
                titulo="Prioridade"
                texto="Favorece guias com maior nível de prioridade durante a geração da escala automática."
              />
            </div>
          </Secao>

          <Secao
            carregando={loadingInicial}
            titulo="Afinidade operacional"
            descricao="Uso da afinidade entre guia e passeio (Mapa de afinidade)."
          >
            <div className="cfg-linha">
              <div className="cfg-linha__texto">
                <label htmlFor="afinidade-switch">Usar afinidade guia x passeio</label>
                <p>
                  {usarAfinidadeGuiaPasseio
                    ? "A escala automática considera o histórico e o vínculo operacional entre guia e passeio."
                    : "A escala automática ignora o mapeamento de afinidade e distribui sem considerar esse relacionamento."}
                </p>
              </div>
              <Interruptor
                disabled={salvando}
                id="afinidade-switch"
                ligado={usarAfinidadeGuiaPasseio}
                onClick={() => salvarUsoAfinidade(!usarAfinidadeGuiaPasseio)}
              />
            </div>
          </Secao>

          <Secao
            carregando={loadingInicial}
            titulo="Janela de disponibilidade dos guias"
            descricao="Dias em que os guias conseguem enviar, alterar ou remover a própria disponibilidade — fora desses dias, a tela fica bloqueada para eles."
          >
            <div className="cfg-campos">
              <Field label="Abre em" icon="calendar">
                <select
                  value={janelaConfig.dowAbertura}
                  onChange={(e) => salvarJanela("dowAbertura", e.target.value)}
                  disabled={salvando}
                >
                  {NOMES_DIAS_COMPLETO.map((nome, i) => (
                    <option key={nome} value={i}>
                      {nome} às 00h
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Fecha em" icon="calendar">
                <select
                  value={janelaConfig.dowFechamento}
                  onChange={(e) => salvarJanela("dowFechamento", e.target.value)}
                  disabled={salvando}
                >
                  {NOMES_DIAS_COMPLETO.map((nome, i) => (
                    <option key={nome} value={i}>
                      {nome} às 23h59
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <p className="cfg-ajuda">
              <Icon name="calendarCheck" size={14} />
              <span>
                Janela atual: <strong>{rotuloJanela(janelaConfig)}</strong>. Escala montada aos
                sábados — o que o guia informar nessa janela vale para a semana seguinte.
              </span>
            </p>
          </Secao>

          <Secao
            carregando={loadingInicial}
            titulo="Idioma dos passageiros"
            descricao="O idioma vem do Phoenix e é comparado com os idiomas que cada guia fala (cadastro do guia)."
          >
            <div className="cfg-opcoes cfg-opcoes--3">
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
                <OpcaoCard
                  disabled={salvando}
                  key={op.valor}
                  ativo={modoIdioma === op.valor}
                  onClick={() => salvarModoIdioma(op.valor)}
                  icone="languages"
                  titulo={op.titulo}
                  texto={op.texto}
                />
              ))}
            </div>
          </Secao>

          <Secao
            carregando={loadingInicial}
            titulo="Tamanho mínimo do grupo"
            descricao="Serviços com menos passageiros que isso não recebem guia na escala automática. Privativos (DISP) ficam de fora da regra."
          >
            <div className="cfg-linha">
              <div className="cfg-linha__texto">
                <label htmlFor="pax-minimo">Guia a partir de (pax)</label>
                <p>
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
                className="cfg-input cfg-input--numero"
                value={paxMinimoParaGuia}
                onChange={(e) => setPaxMinimoParaGuia(e.target.value)}
                onBlur={salvarPaxMinimo}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                disabled={salvando}
              />
            </div>
          </Secao>

          <Secao
            carregando={loadingInicial}
            titulo="Google Drive"
            descricao={
              <>
                Configuração do botão "Salvar no Drive", em Gerar Escala. O passo a passo de como
                criar o Client ID está no arquivo <code>GOOGLE_DRIVE_SETUP.md</code>, na raiz do
                projeto.
              </>
            }
          >
            <div className="cfg-campo-texto">
              <label htmlFor="drive-client-id">
                <Icon name="key" size={14} /> Client ID do Google
              </label>
              <input
                id="drive-client-id"
                type="text"
                placeholder="123456789-abcdefg.apps.googleusercontent.com"
                className="cfg-input"
                value={driveClientId}
                onChange={(e) => setDriveClientId(e.target.value)}
                onBlur={salvarClientIdDrive}
                disabled={salvando}
              />
              <p>
                Criado no Google Cloud Console — não é um dado secreto, mas identifica este sistema
                perante o Google. Sem ele, o botão "Salvar no Drive" avisa que falta configurar.
              </p>
            </div>

            <div className="cfg-campo-texto">
              <label htmlFor="pasta-drive">
                <Icon name="folder" size={14} /> Link ou ID da pasta
              </label>
              <input
                id="pasta-drive"
                type="text"
                placeholder="https://drive.google.com/drive/folders/..."
                className="cfg-input"
                value={pastaDriveTexto}
                onChange={(e) => setPastaDriveTexto(e.target.value)}
                onBlur={salvarPastaDrive}
                disabled={salvando}
              />
              <p>
                Opcional. A escala sempre é salva ali, em vez da raiz do Drive de quem clicar. A
                pasta precisa estar compartilhada com quem for usar o botão.
              </p>
            </div>
          </Secao>

          <p className="cfg-rodape">
            <Icon name="save" size={14} />
            As alterações são aplicadas automaticamente assim que você interage com os controles.
          </p>
        </Card>
      )}
    </div>
  );
};

export default Configuracoes;
