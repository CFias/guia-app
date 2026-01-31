import { useEffect, useState } from "react";
import {
    collection,
    addDoc,
    getDoc,
    getDocs,
    Timestamp,
    doc,
    updateDoc,
    setDoc
} from "firebase/firestore";
import { db } from "../../Services/Services/firebase";
import "./styles.css";

/* ===== ABREVIAÇÃO DOS DIAS ===== */
const DIA_ABREV = {
    "Segunda": "Seg",
    "Terça": "Ter",
    "Quarta": "Qua",
    "Quinta": "Qui",
    "Sexta": "Sex",
    "Sábado": "Sáb",
    "Domingo": "Dom",
};

const DisponibilidadeGuia = () => {
    const [guias, setGuias] = useState([]);
    const [guiaSelecionado, setGuiaSelecionado] = useState(null);
    /* ===== FILTRO POR DIAS ===== */
    const [filtroDias, setFiltroDias] = useState([]);


    const [diasSemana, setDiasSemana] = useState([]);
    const [selecionados, setSelecionados] = useState([]);

    const [dropdownGuiasOpen, setDropdownGuiasOpen] = useState(false);
    const [dropdownDiasOpen, setDropdownDiasOpen] = useState(false);

    const [loading, setLoading] = useState(false);

    /* ===== CONTROLE DE SEMANA ===== */
    const [semanaOffset, setSemanaOffset] = useState(0);

    /* ===== NOVOS STATES ===== */
    const [disponibilidadeSemana, setDisponibilidadeSemana] = useState([]);
    const [busca, setBusca] = useState("");

    /* ===== BUSCA GUIA ===== */
    const [buscaGuia, setBuscaGuia] = useState("");

    /* ===== CARREGAR GUIAS ===== */
    useEffect(() => {
        const carregarGuias = async () => {
            const snapshot = await getDocs(collection(db, "guides"));
            const lista = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
            }));
            setGuias(lista);
        };

        carregarGuias();
    }, []);


    const toggleFiltroDia = (date) => {
        setFiltroDias(prev =>
            prev.includes(date)
                ? prev.filter(d => d !== date)
                : [...prev, date]
        );
    };

    const selecionarTodosDias = () => {
        if (selecionados.length === diasSemana.length) {
            // se já estão todos selecionados, limpa
            setSelecionados([]);
        } else {
            // seleciona todos os dias da semana atual
            setSelecionados(diasSemana);
        }
    };

    /* ===== ATUALIZA SEMANA VISÍVEL ===== */
    useEffect(() => {
        setDiasSemana(getSemanaAtual(semanaOffset));
    }, [semanaOffset]);

    /* ===== CARREGAR DISPONIBILIDADE DA SEMANA ===== */
    useEffect(() => {
        const carregarDisponibilidadeSemana = async () => {
            const semana = getSemanaAtual(semanaOffset);
            const inicio = semana[0].date;
            const fim = semana[semana.length - 1].date;

            const mapaSemana = {};
            semana.forEach(d => (mapaSemana[d.date] = d));

            const snap = await getDocs(collection(db, "guide_availability"));
            const mapaGuias = {};

            snap.docs.forEach(docSnap => {
                const data = docSnap.data();
                if (!data.guideId || !Array.isArray(data.disponibilidade)) return;

                const guia = guias.find(g => g.id === data.guideId);
                if (!guia) return;

                data.disponibilidade.forEach(d => {
                    if (d.date >= inicio && d.date <= fim && mapaSemana[d.date]) {
                        if (!mapaGuias[guia.id]) {
                            mapaGuias[guia.id] = {
                                guiaId: guia.id,
                                nome: guia.nome,
                                dias: []
                            };
                        }

                        if (!mapaGuias[guia.id].dias.some(x => x.date === d.date)) {
                            mapaGuias[guia.id].dias.push(mapaSemana[d.date]);
                        }
                    }
                });
            });

            setDisponibilidadeSemana(Object.values(mapaGuias));
        };


        if (guias.length) carregarDisponibilidadeSemana();
    }, [guias, semanaOffset]);

    /* ===== FILTRO LISTAGEM ===== */
    const disponibilidadeFiltrada = disponibilidadeSemana.filter(g => {
        if (busca) {
            const termo = busca.toLowerCase();

            const nomeMatch = g.nome.toLowerCase().includes(termo);

            const diaMatch = g.dias.some(d =>
                DIA_ABREV[d.day].toLowerCase().includes(termo) ||
                d.day.toLowerCase().includes(termo) ||
                d.date.includes(termo) ||
                d.date.split("-").reverse().join("/").includes(termo)
            );

            if (!nomeMatch && !diaMatch) return false;
        }

        /* FILTRO POR DIAS ESPECÍFICOS */
        if (filtroDias.length) {
            return g.dias.some(d => filtroDias.includes(d.date));
        }

        return true;
    });


    /* ===== REMOVER DATA SALVA ===== */
    const removerDataSalva = async (guiaId, date) => {
        if (!window.confirm("Remover esta data?")) return;

        try {
            const ref = doc(db, "guide_availability", guiaId);
            const snap = await getDoc(ref);

            if (!snap.exists()) {
                console.error("Documento não encontrado para o guia:", guiaId);
                return;
            }

            const dados = snap.data();

            if (!Array.isArray(dados.disponibilidade)) {
                console.error("Disponibilidade inválida:", dados.disponibilidade);
                return;
            }

            const novaDisponibilidade = dados.disponibilidade.filter(
                d => d.date !== date
            );

            await updateDoc(ref, {
                disponibilidade: novaDisponibilidade,
                updatedAt: Timestamp.now(),
            });

            // Atualiza a tela
            setDisponibilidadeSemana(prev => {
                const existe = prev.find(g => g.guiaId === guiaSelecionado.id);

                if (existe) {
                    return prev.map(g =>
                        g.guiaId === guiaSelecionado.id
                            ? {
                                ...g,
                                dias: [
                                    ...g.dias,
                                    ...selecionados.filter(
                                        d => !g.dias.some(x => x.date === d.date)
                                    )
                                ]
                            }
                            : g
                    );
                }

                return [
                    ...prev,
                    {
                        guiaId: guiaSelecionado.id,
                        nome: guiaSelecionado.nome,
                        dias: [...selecionados]
                    }
                ];
            });

        } catch (err) {
            console.error("Erro ao remover data:", err);
            alert("Erro ao remover a data");
        }
    };



    /* ===== GUIA ===== */
    const selecionarGuia = guia => {
        setGuiaSelecionado(guia);
        setSelecionados([]);
        setBuscaGuia("");
        setDropdownGuiasOpen(false);
    };

    /* ===== DIAS ===== */
    const adicionarDia = dia => {
        if (selecionados.find(d => d.date === dia.date)) return;
        setSelecionados([...selecionados, dia]);
        setDropdownDiasOpen(false);
    };

    const removerDia = date => {
        setSelecionados(selecionados.filter(d => d.date !== date));
    };

    /* ===== SALVAR ===== */
    const salvarDisponibilidade = async () => {
        if (!guiaSelecionado || !selecionados.length) return;

        setLoading(true);
        try {
            const ref = doc(db, "guide_availability", guiaSelecionado.id);

            await setDoc(
                doc(db, "guide_availability", guiaSelecionado.id),
                {
                    guideId: guiaSelecionado.id,
                    guideName: guiaSelecionado.nome,
                    disponibilidade: selecionados.map(d => ({
                        day: d.day,
                        date: d.date,
                    })),
                    updatedAt: Timestamp.now(),
                },
                { merge: true }
            );

            setSelecionados([]);
        } finally {
            setLoading(false);
        }
    };


    const guiasFiltrados = guias.filter(g =>
        g.nome.toLowerCase().includes(buscaGuia.toLowerCase())
    );

    const formatarIntervaloSemana = (semana) => {
        if (!semana.length) return "";

        const inicio = semana[0].date.split("-").reverse().slice(0, 2).join("/");
        const fim = semana[semana.length - 1].date
            .split("-")
            .reverse()
            .slice(0, 2)
            .join("/");

        return `${inicio} – ${fim}`;
    };


    return (
        <div className="disp-container">
            <div className="disp-content">

                <h2 className="disp-h2">Disponibilidade da Semana</h2>



                {/* ===== FORMULÁRIO ===== */}
                <label>Guia</label>
                <div className="dropdown">
                    <div className="dropdown-header" onClick={() => setDropdownGuiasOpen(!dropdownGuiasOpen)}>
                        {guiaSelecionado ? guiaSelecionado.nome : "Selecionar guia"}
                        <span>▾</span>
                    </div>

                    {dropdownGuiasOpen && (
                        <div className="dropdown-list">
                            <input
                                className="search-input"
                                placeholder="Buscar guia..."
                                value={buscaGuia}
                                onChange={e => setBuscaGuia(e.target.value)}
                            />
                            {guiasFiltrados.map(g => (
                                <div key={g.id} className="dropdown-item" onClick={() => selecionarGuia(g)}>
                                    {g.nome}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {guiaSelecionado && (
                    <>
                        <label>Dias disponíveis</label>

                        {/* NOVA OPÇÃO */}
                        <button
                            type="button"
                            className="btn-disp"
                            onClick={selecionarTodosDias}
                        >
                            {selecionados.length === diasSemana.length
                                ? "Remover todos os dias"
                                : "Selecionar todos os dias"}
                        </button>

                        <div className="disp-dropdown">
                            <div
                                className="disp-btn"
                                onClick={() => setDropdownDiasOpen(!dropdownDiasOpen)}
                            >
                                Selecionar dias <span>▾</span>
                            </div>

                            {dropdownDiasOpen && (
                                <div className="dropdown-list">
                                    {diasSemana.map(d => (
                                        <div
                                            key={d.date}
                                            className="dropdown-item"
                                            onClick={() => adicionarDia(d)}
                                        >
                                            {d.label}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}


                <div className="selected-languages">
                    {selecionados.map(d => (
                        <div key={d.date} className="language-tag purple">
                            {d.label}
                            <span onClick={() => removerDia(d.date)}>×</span>
                        </div>
                    ))}
                </div>

                <button className="disp-btn-save" onClick={salvarDisponibilidade} disabled={loading}>
                    {loading ? "Salvando..." : "Salvar Disponibilidade"}
                </button>
            </div>


            <div className="disp-bottom">
                <input
                    className="search-input"
                    placeholder="Buscar por guia ou data"
                    value={busca}
                    onChange={e => setBusca(e.target.value)}
                />

                <h3>Guias disponíveis nesta semana</h3>
                <div className="disp-btn">
                    <button className="btn-disp" onClick={() => setSemanaOffset(o => o - 1)}>◀ Semana anterior</button>
                    <button className="btn-disp" onClick={() => setSemanaOffset(0)}>Semana atual</button>
                    <button className="btn-disp" onClick={() => setSemanaOffset(o => o + 1)}>Próxima semana ▶</button>
                </div>
                <p className="disp-semana-intervalo">
                    {formatarIntervaloSemana(diasSemana)}
                </p>

                {/* ===== FILTRO POR DIAS DA SEMANA ===== */}
                <div className="filtro-dias">
                    {diasSemana.map(d => (
                        <div
                            key={d.date}
                            className={`dia-filtro-tag ${filtroDias.includes(d.date) ? "ativo" : ""
                                }`}
                            onClick={() => toggleFiltroDia(d.date)}
                        >
                            {DIA_ABREV[d.day]}
                            <span>{d.date.split("-").reverse().join("/")}</span>
                        </div>
                    ))}
                </div>

            </div>

            <div className="tabela-disponibilidade">
                {/* CABEÇALHO */}
                <div className="linha header">
                    <div className="col guia">Guia</div>
                    {diasSemana.map(d => (
                        <div key={d.date} className="col dia">
                            {DIA_ABREV[d.day]}
                        </div>
                    ))}
                </div>

                {/* LINHAS */}
                {disponibilidadeFiltrada.map(g => (
                    <div key={g.guiaId} className="linha">
                        <div className="col guia">{g.nome}</div>

                        {diasSemana.map(d => {
                            const diaGuia = g.dias.find(x => x.date === d.date);

                            return (
                                <div key={`${g.guiaId}-${d.date}`} className="col dia">
                                    {diaGuia && (
                                        <div className="cell-dia">
                                            {`${d.date.split("-")[2]}/${d.date.split("-")[1]}`}
                                            <button
                                                className="remove-dia"
                                                onClick={() =>
                                                    removerDataSalva(g.guiaId, d.date)
                                                }
                                            >
                                                ×
                                            </button>
                                        </div>
                                    )}

                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>

        </div>
    );
};

export default DisponibilidadeGuia;

/* ===== FUNÇÕES AUXILIARES ===== */
const diasSemana = [
    "Segunda",
    "Terça",
    "Quarta",
    "Quinta",
    "Sexta",
    "Sábado",
    "Domingo",
];

const getSemanaAtual = (offset = 0) => {
    // data base SEMPRE ao meio-dia (evita bug de fuso)
    const base = new Date();
    base.setHours(12, 0, 0, 0);

    // aplica offset de semanas
    base.setDate(base.getDate() + offset * 7);

    // getDay(): 0 = domingo, 1 = segunda...
    const day = base.getDay();

    // calcula segunda-feira corretamente
    const diffToMonday = day === 0 ? -6 : 1 - day;

    const monday = new Date(base);
    monday.setDate(base.getDate() + diffToMonday);

    return diasSemana.map((dia, index) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + index);

        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const dayNumber = String(d.getDate()).padStart(2, "0");

        return {
            day: dia,
            date: `${year}-${month}-${dayNumber}`,
            label: `${dia} • ${dayNumber}/${month}/${year}`,
        };
    });
};
