import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../Services/Services/firebase";
import EditarGuiaModal from "./EditarGuiaModal.jsx";
import CardSkeleton from "../CardSkeleton/CardSkeleton";
import "./styles.css";
import {
  FilterListRounded,
  ManageAccountsRounded,
  SearchRounded,
} from "@mui/icons-material";

const ListaGuias = () => {
  const [guias, setGuias] = useState([]);
  const [idiomasFiltro, setIdiomasFiltro] = useState([]);

  const [busca, setBusca] = useState("");
  const [idiomaSelecionado, setIdiomaSelecionado] = useState("");
  const [filtroMotoguia, setFiltroMotoguia] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");

  const [guiaEditando, setGuiaEditando] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    carregarGuias();
  }, []);

  const carregarGuias = async () => {
    try {
      setLoading(true);

      const snap = await getDocs(collection(db, "guides"));
      const data = snap.docs
        .map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }))
        .sort((a, b) =>
          (a.nome || "").localeCompare(b.nome || "", "pt-BR", {
            sensitivity: "base",
          }),
        );

      setGuias(data);

      const idiomasUnicos = [...new Set(data.flatMap((g) => g.idiomas || []))];
      setIdiomasFiltro(idiomasUnicos);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const guiasFiltrados = guias.filter((guia) => {
    const texto =
      `${guia.nome} ${guia.whatsapp} ${(guia.idiomas || []).join(" ")}`.toLowerCase();

    const buscaOk = texto.includes(busca.toLowerCase());

    const idiomaOk =
      !idiomaSelecionado || (guia.idiomas || []).includes(idiomaSelecionado);

    const motoguiaOk =
      filtroMotoguia === "todos" ||
      (filtroMotoguia === "sim" && guia.motoguia) ||
      (filtroMotoguia === "nao" && !guia.motoguia);

    const statusOk =
      filtroStatus === "todos" ||
      (filtroStatus === "ativo" && guia.ativo) ||
      (filtroStatus === "inativo" && !guia.ativo);

    return buscaOk && idiomaOk && motoguiaOk && statusOk;
  });

  return (
    <div className="lista-guias-page">
      <div className="lista-guias-header">
        <div>
          <h2 className="lista-guias-title">
            Lista de Guias <ManageAccountsRounded fontSize="small" />
          </h2>
          <p className="lista-guias-subtitle">
            Consulte os guias cadastrados, aplique filtros e faça ajustes
            individuais quando necessário.
          </p>
        </div>
      </div>

      <div className="lista-guias-grid">
        <div className="lista-guias-card lista-guias-card-large">
          <div className="lista-guias-card-header">
            <div className="lista-guias-card-title-row">
              <h3>Filtros</h3>
              <span className="lista-guias-badge">
                <FilterListRounded fontSize="small" />
                {loading ? "..." : `${guiasFiltrados.length} resultado(s)`}
              </span>
            </div>
            <p>Use os filtros abaixo para localizar guias com mais rapidez.</p>
          </div>

          {loading ? (
            <CardSkeleton variant="filters" />
          ) : (
            <>
              <div className="lista-guias-filters-grid">
                <div className="lista-guias-search">
                  <SearchRounded fontSize="small" />
                  <input
                    type="text"
                    placeholder="Buscar por nome, idioma ou WhatsApp"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                  />
                </div>

                <select
                  className="lista-guias-select"
                  value={idiomaSelecionado}
                  onChange={(e) => setIdiomaSelecionado(e.target.value)}
                >
                  <option value="">Todos os idiomas</option>
                  {idiomasFiltro.map((idioma) => (
                    <option key={idioma} value={idioma}>
                      {idioma}
                    </option>
                  ))}
                </select>

                <select
                  className="lista-guias-select"
                  value={filtroMotoguia}
                  onChange={(e) => setFiltroMotoguia(e.target.value)}
                >
                  <option value="todos">Filtro de Motoguia</option>
                  <option value="sim">Motoguia</option>
                  <option value="nao">Não motoguia</option>
                </select>

                <select
                  className="lista-guias-select"
                  value={filtroStatus}
                  onChange={(e) => setFiltroStatus(e.target.value)}
                >
                  <option value="todos">Filtro de Status</option>
                  <option value="ativo">Ativos</option>
                  <option value="inativo">Inativos</option>
                </select>
              </div>

              <div className="lista-guias-counter">
                Guias cadastrados: <strong>{guias.length}</strong>
              </div>
            </>
          )}
        </div>

        <div className="lista-guias-card lista-guias-card-full">
          <div className="lista-guias-card-header">
            <div className="lista-guias-card-title-row">
              <h3>Guias cadastrados</h3>
              <span className="lista-guias-badge">
                {loading ? "..." : `${guias.length} total`}
              </span>
            </div>
            <p>
              Visualize os dados principais, idiomas, prioridade, status e faça
              edições quando necessário.
            </p>
          </div>

          <div className="lista-guias-table-wrap">
            {loading ? (
              <CardSkeleton variant="table" />
            ) : (
              <table className="lista-guias-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>WhatsApp</th>
                    <th>Idiomas</th>
                    <th>Prioridade</th>
                    <th>Motoguia</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>

                <tbody>
                  {guiasFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan="7">
                        <div className="empty-state">
                          Nenhum guia encontrado com os filtros aplicados.
                        </div>
                      </td>
                    </tr>
                  ) : (
                    guiasFiltrados.map((guia) => (
                      <tr key={guia.id}>
                        <td className="lista-guias-name-cell">{guia.nome}</td>
                        <td>{guia.whatsapp}</td>

                        <td>
                          <div className="lista-guias-tags-inline">
                            {(guia.idiomas || []).map((idioma) => (
                              <span
                                key={idioma}
                                className="lista-guias-language-tag"
                              >
                                {idioma}
                              </span>
                            ))}
                          </div>
                        </td>

                        <td>
                          <span
                            className={`lista-guias-priority-badge priority-${guia.nivelPrioridade || 2}`}
                          >
                            {guia.nivelPrioridade || 2}
                          </span>
                        </td>

                        <td>{guia.motoguia ? "Sim" : "Não"}</td>

                        <td>
                          <span
                            className={`lista-guias-status ${guia.ativo ? "ativo" : "inativo"
                              }`}
                          >
                            {guia.ativo ? "Ativo" : "Inativo"}
                          </span>
                        </td>

                        <td>
                          <button
                            className="lista-guias-btn-edit"
                            onClick={() => setGuiaEditando(guia)}
                          >
                            Editar
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {guiaEditando && (
        <EditarGuiaModal
          guia={guiaEditando}
          onClose={() => setGuiaEditando(null)}
          onSaved={carregarGuias}
        />
      )}
    </div>
  );
};

export default ListaGuias;