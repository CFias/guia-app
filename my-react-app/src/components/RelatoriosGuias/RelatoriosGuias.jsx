import { useEffect, useState } from "react";
import { collection, getDocs, Timestamp } from "firebase/firestore";
import { db } from "../../Services/Services/firebase";
import LoadingBlock from "../LoadingOverlay/LoadingOverlay";
import "./styles.css";

const RelatorioSemanalGuias = () => {
    const [dataInicio, setDataInicio] = useState("");
    const [dataFim, setDataFim] = useState("");
    const [base, setBase] = useState("ssa");

    const [guias, setGuias] = useState([]);
    const [escalas, setEscalas] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        carregarDados();
    }, []);

    const carregarDados = async () => {
        try {
            setLoading(true);

            const [guiasSnap, escalasSnap] = await Promise.all([
                getDocs(collection(db, "guides")),
                getDocs(collection(db, "scales")),
            ]);

            setGuias(
                guiasSnap.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                }))
            );

            setEscalas(
                escalasSnap.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                }))
            );
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    if (!dataInicio || !dataFim) {
        return (
            <div className="page-container">
                <h2>Relatório Semanal de Guias</h2>
                <div className="filters-grid">
                    <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
                    <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} />
                    <select value={base} onChange={e => setBase(e.target.value)}>
                        <option value="ssa">SSA</option>
                        <option value="rec">REC</option>
                        <option value="for">FOR</option>
                    </select>
                </div>
                <p>Selecione um período para gerar o relatório</p>
            </div>
        );
    }

    const inicio = new Date(`${dataInicio}T00:00:00`);
    const fim = new Date(`${dataFim}T23:59:59`);

    // ===== PROCESSAMENTO CENTRAL =====
    const relatorio = guias.map(guia => {
        const escalasGuia = escalas.filter(e => e.guiaId === guia.id && e.base === base);

        const totalServicos = escalasGuia.length;
        const totalPax = escalasGuia.reduce((s, e) => s + (e.pax || 0), 0);

        const semana = escalasGuia.filter(e => {
            const d = e.date?.toDate?.() || new Date(e.date);
            return d >= inicio && d <= fim;
        });

        return {
            ...guia,
            totalServicos,
            totalPax,
            semanaServicos: semana.length,
            semanaPax: semana.reduce((s, e) => s + (e.pax || 0), 0),
            detalhesSemana: semana,
        };
    });

    return (
        <div className="page-container">
            <h2>Relatório Semanal de Guias</h2>

            {/* FILTROS */}
            <div className="filters-grid">
                <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
                <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} />
                <select value={base} onChange={e => setBase(e.target.value)}>
                    <option value="ssa">SSA</option>
                    <option value="rec">REC</option>
                    <option value="for">FOR</option>
                </select>
            </div>

            <LoadingBlock loading={loading} height={200} text="Gerando relatório..." />

            {!loading && (
                <div className="report-list">
                    {relatorio.map(guia => (
                        <div key={guia.id} className="report-card">
                            <div className="report-header">
                                <h3>{guia.nome}</h3>
                                {guia.semanaServicos > 0 ? (
                                    <span className="badge green">Trabalhou na semana</span>
                                ) : (
                                    <span className="badge gray">Sem escala</span>
                                )}
                            </div>

                            <div className="report-metrics">
                                <div>
                                    <strong>Semana</strong>
                                    <p>{guia.semanaServicos} serviços</p>
                                    <p>{guia.semanaPax} pax</p>
                                </div>

                                <div>
                                    <strong>Total Histórico</strong>
                                    <p>{guia.totalServicos} serviços</p>
                                    <p>{guia.totalPax} pax</p>
                                </div>
                            </div>

                            {guia.detalhesSemana.length > 0 && (
                                <>
                                    <h4>Serviços realizados na semana</h4>
                                    <table className="escala-table">
                                        <thead>
                                            <tr>
                                                <th>Data</th>
                                                <th>Serviço</th>
                                                <th>Pax</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {guia.detalhesSemana.map(s => (
                                                <tr key={s.id}>
                                                    <td>
                                                        {(s.date?.toDate?.() || new Date(s.date)).toLocaleDateString()}
                                                    </td>
                                                    <td>{s.serviceName || "—"}</td>
                                                    <td>{s.pax || 0}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default RelatorioSemanalGuias;
