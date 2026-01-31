import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../Services/Services/firebase";
import { gerarEscalaSemanal } from "../../Services/Utils/gerarEscalaSemanal";
import { getSemana } from "../../Services/Utils/weekDates";
import "./styles.css";

const EscalaSemanal = () => {
    const [passeios, setPasseios] = useState([]);
    const [disponibilidades, setDisponibilidades] = useState([]);
    const [guides, setGuides] = useState([]);

    const [opcoes, setOpcoes] = useState([]);
    const [opcaoSelecionada, setOpcaoSelecionada] = useState(null);
    const [loading, setLoading] = useState(false);

    const semana = getSemana(); // ✅ semana CORRETA

    useEffect(() => {
        carregarDados();
    }, []);

    const carregarDados = async () => {
        setLoading(true);

        const servicesSnap = await getDocs(collection(db, "services"));
        const guidesSnap = await getDocs(collection(db, "guides"));
        const availabilitySnap = await getDocs(collection(db, "guide_availability"));

        setPasseios(servicesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setGuides(guidesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setDisponibilidades(availabilitySnap.docs.map(d => d.data()));

        setLoading(false);
    };

    const gerarEscala = () => {
        const resultado = gerarEscalaSemanal({
            passeios,
            disponibilidades,
            guides,
            semana
        });

        setOpcoes(resultado);
        setOpcaoSelecionada(null);
    };

    /* ===== ENVIO DOS BLOQUEIOS ===== */
    const enviarBloqueiosSemana = () => {
        if (opcaoSelecionada === null) {
            alert("Selecione uma opção");
            return;
        }

        const escala = opcoes[opcaoSelecionada];
        if (!escala || !escala.length) {
            alert("Essa opção não possui escala");
            return;
        }

        const guiasMap = {};

        escala.forEach(item => {
            if (!item.whatsapp || !item.guideId) return;

            if (!guiasMap[item.guideId]) {
                guiasMap[item.guideId] = {
                    nome: item.guideName,
                    whatsapp: item.whatsapp.replace(/\D/g, ""),
                    servicos: []
                };
            }

            guiasMap[item.guideId].servicos.push(
                `${item.day} • ${item.date.split("-").reverse().join("/")} — ${item.passeioNome}`
            );
        });

        Object.values(guiasMap).forEach((guia, index) => {
            setTimeout(() => {
                const mensagem = `
Olá ${guia.nome} 👋

Você foi escalado para os seguintes serviços nesta semana:

${guia.servicos.map(s => `• ${s}`).join("\n")}

Pode confirmar, por favor?
                `;

                const url = `https://wa.me/${guia.whatsapp}?text=${encodeURIComponent(mensagem)}`;
                window.open(url, "_blank");
            }, index * 1200); // delay evita bloqueio
        });
    };

    return (
        <div className="page-container">
            <h2>Escala Semanal</h2>

            <button onClick={gerarEscala} disabled={loading}>
                {loading ? "Gerando..." : "Gerar Escala Automática"}
            </button>

            {opcoes.length > 0 && (
                <>
                    <table className="escala-table">
                        <thead>
                            <tr>
                                <th>Data</th>
                                <th>Opção 1</th>
                                <th>Opção 2</th>
                                <th>Opção 3</th>
                            </tr>
                        </thead>
                        <tbody>
                            {semana.map(dia => (
                                <tr key={dia.date}>
                                    <td>
                                        <strong>{dia.day}</strong><br />
                                        {dia.label.split("•")[1]}
                                    </td>

                                    {[0, 1, 2].map(opcao => (
                                        <td key={opcao}>
                                            {opcoes[opcao]
                                                ?.filter(i => i.date === dia.date)
                                                .map(i => (
                                                    <div key={`${i.passeioId}-${i.guideId}`}>
                                                        <strong>{i.passeioNome}</strong><br />
                                                        {i.guideName}
                                                    </div>
                                                ))}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div style={{ marginTop: 20 }}>
                        <label>Escolher opção:</label>
                        <select
                            value={opcaoSelecionada ?? ""}
                            onChange={e => setOpcaoSelecionada(Number(e.target.value))}
                        >
                            <option value="">Selecione</option>
                            <option value={0}>Opção 1</option>
                            <option value={1}>Opção 2</option>
                            <option value={2}>Opção 3</option>
                        </select>
                    </div>
                </>
            )}

            {opcaoSelecionada !== null && (
                <button
                    onClick={enviarBloqueiosSemana}
                    style={{ marginTop: 20 }}
                >
                    Disparar bloqueios da semana (WhatsApp)
                </button>
            )}
        </div>
    );
};

export default EscalaSemanal;
