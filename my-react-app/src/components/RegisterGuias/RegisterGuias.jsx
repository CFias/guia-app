import { useEffect, useState } from "react";
import { collection, addDoc, getDocs, Timestamp } from "firebase/firestore";
import { db } from "../../Services/Services/firebase";
import { getLanguages } from "../../Services/Services/languages.service";
import CardSkeleton from "../CardSkeleton/CardSkeleton";
import "./styles.css";
import {
  AssignmentIndRounded,
  ChatRounded,
  DriveFileRenameOutlineRounded,
  LanguageRounded,
  LocalActivityRounded,
  NoCrashRounded,
  SaveRounded,
  StarRounded,
} from "@mui/icons-material";

const CadastroGuia = () => {
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  const [idiomasSelecionados, setIdiomasSelecionados] = useState([]);
  const [idiomasDisponiveis, setIdiomasDisponiveis] = useState([]);

  const [passeiosSelecionados, setPasseiosSelecionados] = useState([]);
  const [passeiosDisponiveis, setPasseiosDisponiveis] = useState([]);

  const [diferencial, setDiferencial] = useState("");
  const [motoguia, setMotoguia] = useState(false);

  const [dropdownIdiomasOpen, setDropdownIdiomasOpen] = useState(false);
  const [dropdownPasseiosOpen, setDropdownPasseiosOpen] = useState(false);

  const [loadingInicial, setLoadingInicial] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const carregarDados = async () => {
      try {
        setLoadingInicial(true);

        const langs = await getLanguages();
        setIdiomasDisponiveis(langs);

        const snapshot = await getDocs(collection(db, "services"));
        const services = snapshot.docs.map((doc) => ({
          id: doc.id,
          nome: doc.data().nome,
        }));
        setPasseiosDisponiveis(services);
      } catch (error) {
        console.error("Erro ao carregar dados do cadastro:", error);
      } finally {
        setLoadingInicial(false);
      }
    };

    carregarDados();
  }, []);

  const adicionarIdioma = (idioma) => {
    if (idiomasSelecionados.find((i) => i.id === idioma.id)) return;
    setIdiomasSelecionados([...idiomasSelecionados, idioma]);
    setDropdownIdiomasOpen(false);
  };

  const removerIdioma = (id) => {
    setIdiomasSelecionados(idiomasSelecionados.filter((i) => i.id !== id));
  };

  const adicionarPasseio = (passeio) => {
    if (passeiosSelecionados.find((p) => p.id === passeio.id)) return;
    setPasseiosSelecionados([...passeiosSelecionados, passeio]);
    setDropdownPasseiosOpen(false);
  };

  const removerPasseio = (id) => {
    setPasseiosSelecionados(passeiosSelecionados.filter((p) => p.id !== id));
  };

  const formatarTelefone = (valor) => {
    const numeros = valor.replace(/\D/g, "").slice(0, 11);

    if (numeros.length <= 2) return numeros;
    if (numeros.length <= 7)
      return `(${numeros.slice(0, 2)}) ${numeros.slice(2)}`;
    if (numeros.length <= 11)
      return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`;

    return valor;
  };

  const salvarGuia = async (e) => {
    e.preventDefault();

    if (!nome || !whatsapp) {
      alert("Nome e WhatsApp são obrigatórios");
      return;
    }

    try {
      setSalvando(true);

      await addDoc(collection(db, "guides"), {
        nome,
        whatsapp,
        idiomas: idiomasSelecionados.map((i) => i.label),
        passeios: passeiosSelecionados,
        motoguia,
        diferencial,
        ativo: true,
        createdAt: Timestamp.now(),
      });

      alert("Guia cadastrado com sucesso!");

      setNome("");
      setWhatsapp("");
      setIdiomasSelecionados([]);
      setPasseiosSelecionados([]);
      setMotoguia(false);
      setDiferencial("");
      setDropdownIdiomasOpen(false);
      setDropdownPasseiosOpen(false);
    } catch (error) {
      console.error(error);
      alert("Erro ao cadastrar guia");
    } finally {
      setSalvando(false);
    }
  };

  const bloqueado = salvando || loadingInicial;

  return (
    <div className="cadastro-guia-page">
      <div className="cadastro-guia-header">
        <div>
          <h2 className="cadastro-guia-title">
            Cadastrar Guia Turístico <AssignmentIndRounded fontSize="small" />
          </h2>
          <p className="cadastro-guia-subtitle">
            Cadastre guias, defina idiomas, serviços aptos e diferenciais
            operacionais em uma estrutura mais organizada e profissional.
          </p>
        </div>
      </div>

      <div className="cadastro-guia-layout">
        <section className="cadastro-guia-grid">
          <div className="cadastro-guia-card cadastro-guia-card-large">
            <div className="cadastro-guia-card-header">
              <div className="cadastro-guia-card-title-row">
                <h3>Informações do guia</h3>
                <span className="cadastro-guia-badge">Cadastro</span>
              </div>
              <p>
                Preencha os dados principais do profissional e configure suas
                características operacionais.
              </p>
            </div>

            {loadingInicial ? (
              <CardSkeleton variant="filters" />
            ) : (
              <form className="cadastro-guia-form" onSubmit={salvarGuia}>
                <div className="cadastro-guia-form-grid">
                  <div className="cadastro-guia-field">
                    <label htmlFor="guia-nome">
                      Nome do guia{" "}
                      <DriveFileRenameOutlineRounded fontSize="small" />
                    </label>
                    <input
                      id="guia-nome"
                      type="text"
                      placeholder="Digite o nome do guia"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      disabled={bloqueado}
                    />
                  </div>

                  <div className="cadastro-guia-field">
                    <label htmlFor="guia-whatsapp">
                      WhatsApp <ChatRounded fontSize="small" />
                    </label>
                    <input
                      id="guia-whatsapp"
                      type="text"
                      placeholder="Informe o WhatsApp"
                      value={formatarTelefone(whatsapp)}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      maxLength={15}
                      disabled={bloqueado}
                    />
                  </div>
                </div>

                <div className="cadastro-guia-form-grid">
                  <div className="cadastro-guia-field">
                    <label>
                      Idiomas <LanguageRounded fontSize="small" />
                    </label>

                    <div className="cadastro-guia-dropdown">
                      <div
                        className="cadastro-guia-dropdown-header"
                        onClick={() =>
                          !bloqueado &&
                          setDropdownIdiomasOpen(!dropdownIdiomasOpen)
                        }
                      >
                        <span>Selecionar idiomas</span>
                        <span className="cadastro-guia-dropdown-arrow">▾</span>
                      </div>

                      {dropdownIdiomasOpen && !bloqueado && (
                        <div className="cadastro-guia-dropdown-menu">
                          {idiomasDisponiveis.map((idioma) => (
                            <div
                              key={idioma.id}
                              className="cadastro-guia-dropdown-item"
                              onClick={() => adicionarIdioma(idioma)}
                            >
                              {idioma.label}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="cadastro-guia-tags">
                      {idiomasSelecionados.map((idioma) => (
                        <div className="cadastro-guia-tag" key={idioma.id}>
                          {idioma.label}
                          <span onClick={() => !bloqueado && removerIdioma(idioma.id)}>
                            ×
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="cadastro-guia-field">
                    <label>
                      Passeios aptos <LocalActivityRounded fontSize="small" />
                    </label>

                    <div className="cadastro-guia-dropdown">
                      <div
                        className="cadastro-guia-dropdown-header"
                        onClick={() =>
                          !bloqueado &&
                          setDropdownPasseiosOpen(!dropdownPasseiosOpen)
                        }
                      >
                        <span>Selecionar passeios</span>
                        <span className="cadastro-guia-dropdown-arrow">▾</span>
                      </div>

                      {dropdownPasseiosOpen && !bloqueado && (
                        <div className="cadastro-guia-dropdown-menu">
                          {passeiosDisponiveis.map((passeio) => (
                            <div
                              key={passeio.id}
                              className="cadastro-guia-dropdown-item"
                              onClick={() => adicionarPasseio(passeio)}
                            >
                              {passeio.nome}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="cadastro-guia-tags">
                      {passeiosSelecionados.map((passeio) => (
                        <div
                          className="cadastro-guia-tag cadastro-guia-tag-service"
                          key={passeio.id}
                        >
                          {passeio.nome}
                          <span onClick={() => !bloqueado && removerPasseio(passeio.id)}>
                            ×
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="cadastro-guia-options-row">
                  <button
                    type="button"
                    className={`cadastro-guia-switch ${motoguia ? "active" : ""}`}
                    onClick={() => setMotoguia(!motoguia)}
                    aria-pressed={motoguia}
                    disabled={bloqueado}
                  >
                    <span className="cadastro-guia-switch-track">
                      <span className="cadastro-guia-switch-thumb" />
                    </span>
                    <span className="cadastro-guia-switch-label">
                      Atua como Motoguia <NoCrashRounded fontSize="small" />
                    </span>
                  </button>
                </div>

                <div className="cadastro-guia-field">
                  <label htmlFor="guia-diferencial">
                    Diferencial do guia <StarRounded fontSize="small" />
                  </label>
                  <textarea
                    id="guia-diferencial"
                    placeholder="Informe pontos fortes, características ou diferenciais importantes"
                    value={diferencial}
                    onChange={(e) => setDiferencial(e.target.value)}
                    disabled={bloqueado}
                  />
                </div>

                <div className="cadastro-guia-actions">
                  <button
                    type="submit"
                    disabled={salvando}
                    className={`cadastro-guia-btn-primary ${salvando ? "is-saving" : ""}`}
                  >
                    <SaveRounded fontSize="small" />
                    {salvando ? "Salvando..." : "Cadastrar guia"}
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="cadastro-guia-card">
            <div className="cadastro-guia-card-header">
              <div className="cadastro-guia-card-title-row">
                <h3>Resumo do cadastro</h3>
                <span className="cadastro-guia-badge">Preview</span>
              </div>
              <p>
                Confira rapidamente como os dados do guia estão sendo montados
                antes de salvar.
              </p>
            </div>

            {loadingInicial ? (
              <CardSkeleton variant="list" rows={4} />
            ) : (
              <div className="cadastro-guia-preview">
                <div className="cadastro-guia-preview-item">
                  <span className="cadastro-guia-preview-label">Nome</span>
                  <strong className="cadastro-guia-preview-value">
                    {nome || "Não informado"}
                  </strong>
                </div>

                <div className="cadastro-guia-preview-item">
                  <span className="cadastro-guia-preview-label">WhatsApp</span>
                  <strong className="cadastro-guia-preview-value">
                    {formatarTelefone(whatsapp) || "Não informado"}
                  </strong>
                </div>

                <div className="cadastro-guia-preview-item">
                  <span className="cadastro-guia-preview-label">Idiomas</span>
                  <strong className="cadastro-guia-preview-value">
                    {idiomasSelecionados.length > 0
                      ? idiomasSelecionados.map((i) => i.label).join(", ")
                      : "Nenhum selecionado"}
                  </strong>
                </div>

                <div className="cadastro-guia-preview-item">
                  <span className="cadastro-guia-preview-label">Motoguia</span>
                  <strong className="cadastro-guia-preview-value">
                    {motoguia ? "Sim" : "Não"}
                  </strong>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default CadastroGuia;