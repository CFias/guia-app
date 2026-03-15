import { useEffect, useState } from "react";
import {
    collection,
    addDoc,
    Timestamp,
    getDocs,
    doc,
    updateDoc,
} from "firebase/firestore";
import { db } from "../../Services/Services/firebase";
import "./styles.css";

const diasSemana = [
    "Segunda",
    "Terça",
    "Quarta",
    "Quinta",
    "Sexta",
    "Sábado",
    "Domingo",
];

const CadastroPasseio = () => {
    const [nome, setNome] = useState("");
    const [descricao, setDescricao] = useState("");
    const [frequencia, setFrequencia] = useState([]);
    const [externalServiceId, setExternalServiceId] = useState("");
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const [passeios, setPasseios] = useState([]);
    const [editandoId, setEditandoId] = useState(null);

    useEffect(() => {
        carregarPasseios();
    }, []);

    const carregarPasseios = async () => {
        try {
            const snap = await getDocs(collection(db, "services"));
            const lista = snap.docs.map((d) => ({
                id: d.id,
                ...d.data(),
            }));

            setPasseios(lista);
        } catch (err) {
            console.error("Erro ao carregar passeios:", err);
        }
    };

    const adicionarDia = (dia) => {
        if (frequencia.includes(dia)) return;
        setFrequencia([...frequencia, dia]);
        setDropdownOpen(false);
    };

    const removerDia = (dia) => {
        setFrequencia(frequencia.filter((d) => d !== dia));
    };

    const limparFormulario = () => {
        setNome("");
        setDescricao("");
        setFrequencia([]);
        setExternalServiceId("");
        setEditandoId(null);
    };

    const editarPasseio = (p) => {
        setEditandoId(p.id);
        setNome(p.nome || "");
        setDescricao(p.descricao || "");
        setFrequencia(p.frequencia || []);
        setExternalServiceId(p.externalServiceId || "");
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const salvarPasseio = async (e) => {
        e.preventDefault();

        if (!nome) {
            alert("Nome do passeio é obrigatório");
            return;
        }

        try {
            setLoading(true);

            const payload = {
                nome,
                descricao,
                frequencia,
                externalName: nome,
                externalServiceId: externalServiceId
                    ? Number(externalServiceId)
                    : null,
            };

            if (editandoId) {
                await updateDoc(doc(db, "services", editandoId), {
                    ...payload,
                    updatedAt: Timestamp.now(),
                });

                alert("Passeio atualizado com sucesso!");
            } else {
                await addDoc(collection(db, "services"), {
                    ...payload,
                    ativo: true,
                    createdAt: Timestamp.now(),
                });

                alert("Passeio cadastrado com sucesso!");
            }

            limparFormulario();
            await carregarPasseios();
        } catch (error) {
            console.error(error);
            alert("Erro ao salvar passeio");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="form-container">
            <h2>{editandoId ? "Editar Passeio / Serviço" : "Cadastrar Passeio / Serviço"}</h2>

            <form onSubmit={salvarPasseio}>
                <input
                    type="text"
                    placeholder="Nome do passeio"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                />

                <input
                    type="number"
                    placeholder="ID externo do serviço"
                    value={externalServiceId}
                    onChange={(e) => setExternalServiceId(e.target.value)}
                />

                <textarea
                    placeholder="Descrição do passeio"
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                />

                <label>Frequência do Passeio</label>

                <div className="dropdown-cad">
                    <div
                        className="dropdown-header"
                        onClick={() => setDropdownOpen(!dropdownOpen)}
                    >
                        Selecionar dias <span>▾</span>
                    </div>

                    {dropdownOpen && (
                        <div className="dropdown-list">
                            {diasSemana.map((dia) => (
                                <div
                                    key={dia}
                                    className="dropdown-item"
                                    onClick={() => adicionarDia(dia)}
                                >
                                    {dia}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="selected-languages">
                    {frequencia.map((dia) => (
                        <div className="language-tag" key={dia}>
                            {dia}
                            <span onClick={() => removerDia(dia)}>×</span>
                        </div>
                    ))}
                </div>

                <button type="submit" disabled={loading}>
                    {loading
                        ? "Salvando..."
                        : editandoId
                            ? "Salvar Alterações"
                            : "Cadastrar Passeio"}
                </button>

                {editandoId && (
                    <button
                        type="button"
                        className="btn-cancelar"
                        onClick={limparFormulario}
                    >
                        Cancelar
                    </button>
                )}
            </form>

            <div className="lista-passeios">
                <h3>Passeios Cadastrados</h3>

                {passeios.length === 0 ? (
                    <p>Nenhum passeio cadastrado.</p>
                ) : (
                    <ul className="passeio-list">
                        {passeios.map((p) => (
                            <li key={p.id} className="passeio-card">
                                <div className="passeio-info">
                                    <strong className="p-name">{p.nome}</strong>
                                    <p>{p.descricao}</p>

                                    <p>
                                        <strong>ID externo:</strong>{" "}
                                        {p.externalServiceId || "-"}
                                    </p>

                                    <div className="frequencia-tags">
                                        {(p.frequencia || []).map((dia) => (
                                            <span key={dia} className="tag-dia">
                                                {dia}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                <button
                                    className="btn-editar"
                                    onClick={() => editarPasseio(p)}
                                >
                                    Editar
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default CadastroPasseio;
