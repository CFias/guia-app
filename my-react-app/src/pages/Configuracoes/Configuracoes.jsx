import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../Services/Services/firebase";
import { useTheme } from "../../Context/ThemeContext";
import "./styles.css";
import { DarkMode, Insights, Settings } from "@mui/icons-material";

const Configuracoes = () => {
    const { theme, toggleTheme, togglePro } = useTheme();

    const [abaAtiva, setAbaAtiva] = useState("tema");
    const [modoDistribuicaoGuias, setModoDistribuicaoGuias] = useState("equilibrado");
    const [salvando, setSalvando] = useState(false);

    useEffect(() => {
        const carregar = async () => {
            try {
                const ref = doc(db, "settings", "scale");
                const snap = await getDoc(ref);

                if (snap.exists()) {
                    const data = snap.data();
                    setModoDistribuicaoGuias(data.modoDistribuicaoGuias || "equilibrado");
                }
            } catch (err) {
                console.error("Erro ao carregar configurações:", err);
            }
        };

        carregar();
    }, []);

    const salvarModo = async (valor) => {
        try {
            setSalvando(true);
            setModoDistribuicaoGuias(valor);

            await setDoc(
                doc(db, "settings", "scale"),
                {
                    modoDistribuicaoGuias: valor,
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

    const handleChangeTheme = (e) => {
        const selectedTheme = e.target.value;

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
            <h2 className="config-title-page">Configurações <Settings fontSize="10" /></h2>

            <div className="config-layout">
                <aside className="config-nav">
                    <button
                        className={`config-nav-item ${abaAtiva === "tema" ? "active" : ""}`}
                        onClick={() => setAbaAtiva("tema")}
                    >
                        Tema <DarkMode fontSize="10" />
                    </button>

                    <button
                        className={`config-nav-item ${abaAtiva === "escala" ? "active" : ""}`}
                        onClick={() => setAbaAtiva("escala")}
                    >
                        Escala <Insights fontSize="10" />
                    </button>
                </aside>

                <section className="config-content">
                    {abaAtiva === "tema" && (
                        <div className="config-card">
                            <h3>Aparência</h3>

                            <div className="config-field">
                                <label htmlFor="theme-select">Tema <DarkMode fontSize="10"/></label>
                                <select
                                    id="theme-select"
                                    className="theme-select"
                                    value={theme}
                                    onChange={handleChangeTheme}
                                >
                                    <option value="light">Claro</option>
                                    <option value="dark">Dark</option>
                                    <option value="dark-pro">Dark Pro</option>
                                </select>
                            </div>

                            <p className="config-help">
                                Escolha o modo visual da plataforma.
                            </p>
                        </div>
                    )}

                    {abaAtiva === "escala" && (
                        <div className="config-card">
                            <h3>Distribuição de Escala</h3>

                            <div className="config-field">
                                <label htmlFor="modo-distribuicao">
                                    Modo de distribuição dos guias <Insights fontSize="10"/>
                                </label>
                                <select
                                    id="modo-distribuicao"
                                    className="theme-select"
                                    value={modoDistribuicaoGuias}
                                    onChange={(e) => salvarModo(e.target.value)}
                                >
                                    <option value="equilibrado">Equilibrado</option>
                                    <option value="seguir_nivel_selecionado">
                                        Seguir nível selecionado
                                    </option>
                                </select>
                            </div>

                            <p className="config-help">
                                {modoDistribuicaoGuias === "equilibrado"
                                    ? "Distribui os serviços de forma mais justa entre os guias."
                                    : "Prioriza os guias com maior nível de prioridade na geração da escala."}
                            </p>

                            {salvando && (
                                <span className="config-saving">Salvando configuração...</span>
                            )}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};

export default Configuracoes;