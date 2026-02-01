import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../Services/Services/firebase";
import EditarGuiaModal from "./EditarGuiaModal.jsx";
import "./styles.css";

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
            const data = snap.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
            }));

            setGuias(data);

            const idiomasUnicos = [
                ...new Set(data.flatMap(g => g.idiomas || [])),
            ];
            setIdiomasFiltro(idiomasUnicos);

        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    // ===== FILTRO COMPLETO =====
    const guiasFiltrados = guias.filter(guia => {
        const texto =
            `${guia.nome} ${guia.whatsapp} ${(guia.idiomas || []).join(" ")}`.toLowerCase();

        const buscaOk = texto.includes(busca.toLowerCase());

        const idiomaOk =
            !idiomaSelecionado ||
            (guia.idiomas || []).includes(idiomaSelecionado);

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
        <div className="page-container">
            <h2>Lista de Guias</h2>

            {/* ===== FILTROS ===== */}
            <div className="filters-grid">
                <input
                    type="text"
                    placeholder="Buscar por nome, idioma ou WhatsApp"
                    value={busca}
                    onChange={e => setBusca(e.target.value)}
                />

                <select
                    value={idiomaSelecionado}
                    onChange={e => setIdiomaSelecionado(e.target.value)}
                >
                    <option value="">Todos os idiomas</option>
                    {idiomasFiltro.map(idioma => (
                        <option key={idioma} value={idioma}>
                            {idioma}
                        </option>
                    ))}
                </select>

                <select
                    value={filtroMotoguia}
                    onChange={e => setFiltroMotoguia(e.target.value)}
                >
                    <option value="todos">Todos</option>
                    <option value="sim">Motoguia</option>
                    <option value="nao">Não motoguia</option>
                </select>

                <select
                    value={filtroStatus}
                    onChange={e => setFiltroStatus(e.target.value)}
                >
                    <option value="todos">Todos</option>
                    <option value="ativo">Ativos</option>
                    <option value="inativo">Inativos</option>
                </select>
            </div>

            {/* ===== TABELA ===== */}
            {loading ? (
                <p>Carregando...</p>
            ) : (
                <table className="escala-table">
                    <thead>
                        <tr>
                            <th>Nome</th>
                            <th>WhatsApp</th>
                            <th>Idiomas</th>
                            <th>Motoguia</th>
                            <th>Status</th>
                            <th>Ações</th>
                        </tr>
                    </thead>

                    <tbody>
                        {guiasFiltrados.map(guia => (
                            <tr key={guia.id}>
                                <td>{guia.nome}</td>
                                <td>{guia.whatsapp}</td>

                                <td>
                                    <div className="tags-inline">
                                        {(guia.idiomas || []).map(idioma => (
                                            <span
                                                key={idioma}
                                                className="language-tag"
                                            >
                                                {idioma}
                                            </span>
                                        ))}
                                    </div>
                                </td>

                                <td>{guia.motoguia ? "Sim" : "Não"}</td>

                                <td>
                                    <span
                                        className={
                                            guia.ativo ? "ativo" : "inativo"
                                        }
                                    >
                                        {guia.ativo ? "Ativo" : "Inativo"}
                                    </span>
                                </td>

                                <td>
                                    <button
                                    className="btn-edit"
                                        onClick={() => setGuiaEditando(guia)}
                                    >
                                        Editar
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {/* ===== MODAL ===== */}
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
