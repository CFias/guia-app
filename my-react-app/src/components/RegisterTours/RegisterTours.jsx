import { useState } from "react";
import { collection, addDoc, Timestamp } from "firebase/firestore";
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
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const adicionarDia = (dia) => {
        if (frequencia.includes(dia)) return;
        setFrequencia([...frequencia, dia]);
        setDropdownOpen(false);
    };

    const removerDia = (dia) => {
        setFrequencia(frequencia.filter(d => d !== dia));
    };

    const salvarPasseio = async (e) => {
        e.preventDefault();

        if (!nome) {
            alert("Nome do passeio é obrigatório");
            return;
        }

        try {
            setLoading(true);

            await addDoc(collection(db, "services"), {
                nome,
                descricao,
                frequencia,
                ativo: true,
                createdAt: Timestamp.now(),
            });

            alert("Passeio cadastrado com sucesso!");

            setNome("");
            setDescricao("");
            setFrequencia([]);
        } catch (error) {
            console.error(error);
            alert("Erro ao cadastrar passeio");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="form-container">
            <h2>Cadastrar Passeio / Serviço</h2>

            <form onSubmit={salvarPasseio}>
                <input
                    type="text"
                    placeholder="Nome do passeio"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
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
                        Selecionar dias
                        <span>▾</span>
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
                    {loading ? "Salvando..." : "Cadastrar Passeio"}
                </button>
            </form>
        </div>
    );
};

export default CadastroPasseio;
