import { useEffect, useState } from "react";
import {
    collection,
    getDocs,
    getDoc,
    setDoc,
    addDoc,
    deleteDoc,
    doc,
    query,
    where,
    updateDoc
} from "firebase/firestore";
import { db } from "../../Services/Services/firebase";
import "./styles.css";

const DIAS = [
    "Segunda",
    "Terça",
    "Quarta",
    "Quinta",
    "Sexta",
    "Sábado",
    "Domingo",
];

export const gerarSemana = (offset = 0) => {
    const hoje = new Date();
    const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    base.setDate(base.getDate() + offset * 7);

    const diaSemana = base.getDay() === 0 ? 7 : base.getDay();
    const segunda = new Date(base);
    segunda.setDate(base.getDate() - (diaSemana - 1));

    return DIAS.map((dia, index) => {
        const d = new Date(segunda);
        d.setDate(segunda.getDate() + index);

        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");

        return {
            day: dia,
            date: `${yyyy}-${mm}-${dd}`,
            label: `${dia} — ${dd}/${mm}/${yyyy}`,
        };
    });
};

const ListaPasseiosSemana = () => {
    const [semanaOffset, setSemanaOffset] = useState(0);
    const [semana, setSemana] = useState([]);
    const [services, setServices] = useState([]);
    const [extras, setExtras] = useState({});
    const [guias, setGuias] = useState([]);
    const [modoVisualizacao, setModoVisualizacao] = useState(true);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        carregarDados();
    }, [semanaOffset]);

    const carregarDados = async () => {
        setLoading(true);
        try {
            const semanaAtual = gerarSemana(semanaOffset);
            setSemana(semanaAtual);

            const servSnap = await getDocs(collection(db, "services"));
            setServices(servSnap.docs.map(d => ({ id: d.id, ...d.data() })));

            const guiasSnap = await getDocs(collection(db, "guides"));
            setGuias(guiasSnap.docs.map(d => ({ id: d.id, ...d.data() })));

            const mapa = {};
            for (const dia of semanaAtual) {
                const q = query(
                    collection(db, "weekly_services"),
                    where("date", "==", dia.date)
                );
                const snap = await getDocs(q);
                mapa[dia.date] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            }
            setExtras(mapa);
        } finally {
            setLoading(false);
        }
    };

    const salvarOuCriarWeeklyService = async (registroId, payload) => {
        setLoading(true);
        try {
            if (registroId) {
                try {
                    await updateDoc(doc(db, "weekly_services", registroId), payload);
                    return;
                } catch (err) { }
            }

            await addDoc(collection(db, "weekly_services"), {
                ...payload,
                createdAt: new Date()
            });
        } finally {
            setLoading(false);
        }
    };

    const removerPasseio = async (id) => {
        setLoading(true);
        try {
            await deleteDoc(doc(db, "weekly_services", id));
            await carregarDados();
        } finally {
            setLoading(false);
        }
    };

    const statusGrupo = (pax) => {
        if (!pax) return null;
        return pax >= 8 ? (
            <span className="status ok">Grupo Formado</span>
        ) : (
            <span className="status alerta">Formar Grupo</span>
        );
    };

    const enviarWhatsappGuiasSemana = () => {
        if (!semana.length || !extras || !guias.length) return;

        const mapaGuias = {};

        // mapa seguro da semana visível
        const mapaSemana = {};
        semana.forEach(d => {
            mapaSemana[d.date] = d;
        });

        Object.values(extras).flat().forEach(r => {
            // 🔒 validação TOTAL
            if (
                !r.guiaId ||
                !r.serviceId ||          // ⬅️ ESSENCIAL
                !r.date ||
                !mapaSemana[r.date]
            ) {
                return;
            }

            if (!mapaGuias[r.guiaId]) {
                const guia = guias.find(g => g.id === r.guiaId);
                if (!guia || !guia.whatsapp) return;

                mapaGuias[r.guiaId] = {
                    nome: guia.nome,
                    whatsapp: guia.whatsapp,
                    datas: new Set()
                };
            }

            const diaSemana = mapaSemana[r.date];
            mapaGuias[r.guiaId].datas.add(
                `${diaSemana.day} (${diaSemana.label.split("—")[1].trim()})`
            );
        });

        Object.values(mapaGuias).forEach(guia => {
            if (!guia.datas.size) return;

            const listaDatas = Array.from(guia.datas)
                .sort()
                .map(d => `• ${d}`)
                .join("\n");

            const texto = `
Olá, ${guia.nome}! 👋

Segue o bloqueio da semana:

${listaDatas}

O serviço específico de cada dia será informado com antecedência mínima de 1 dia.

Qualquer dúvida, fico à disposição.
Operacional - Luck Receptivo 🙌
        `.trim();

            const telefone = guia.whatsapp.replace(/\D/g, "");
            const mensagem = encodeURIComponent(texto);

            window.open(
                `https://wa.me/55${telefone}?text=${mensagem}`,
                "_blank"
            );
        });
    };





    /* ===== GUIA MANUAL ===== */
    const alterarGuiaManual = async (registroId, guia) => {
        if (!registroId) return;

        setLoading(true);
        try {
            await setDoc(
                doc(db, "weekly_services", registroId),
                {
                    guiaId: guia?.id || null,
                    guiaNome: guia?.nome || null,
                    manual: true
                },
                { merge: true }
            );
            await carregarDados();
        } finally {
            setLoading(false);
        }
    };

    /* ===== PAX MANUAL ===== */
    const alterarPaxManual = async (registroId, pax) => {
        if (!registroId) return;

        setLoading(true);
        try {
            await setDoc(
                doc(db, "weekly_services", registroId),
                {
                    passengers: Number(pax)
                },
                { merge: true }
            );
            await carregarDados();
        } finally {
            setLoading(false);
        }
    };

    const alocarGuiasSemana = async () => {
        setLoading(true);
        try {
            if (!guias.length || !services.length || !semana.length) return;

            const inicioSemana = semana[0].date;
            const fimSemana = semana[semana.length - 1].date;

            const contadorSemana = {};
            guias.forEach(g => contadorSemana[g.id] = 0);

            const snapDisp = await getDocs(collection(db, "guide_availability"));
            const disponibilidades = snapDisp.docs
                .map(d => d.data())
                .filter(d =>
                    Array.isArray(d.disponibilidade) &&
                    d.disponibilidade.some(ds =>
                        ds.date >= inicioSemana && ds.date <= fimSemana
                    )
                );

            for (const dia of semana) {
                const guiasDisponiveis = guias.filter(g =>
                    disponibilidades.some(d =>
                        d.guideId === g.id &&
                        d.disponibilidade.some(ds => ds.date === dia.date)
                    )
                );

                if (!guiasDisponiveis.length) continue;

                const passeiosFixos = services.filter(s =>
                    (s.frequencia || []).includes(dia.day)
                );

                const qReg = query(
                    collection(db, "weekly_services"),
                    where("date", "==", dia.date)
                );
                const snapReg = await getDocs(qReg);

                const registrosDia = snapReg.docs.map(d => ({
                    id: d.id,
                    ...d.data()
                }));

                const usadosNoDia = new Set();
                registrosDia.forEach(r => {
                    if (r.guiaId) usadosNoDia.add(r.guiaId);
                });

                for (const p of passeiosFixos) {
                    if (!registrosDia.some(r => r.serviceId === p.id)) {
                        const docRef = await addDoc(collection(db, "weekly_services"), {
                            serviceId: p.id,
                            serviceName: p.nome,
                            passengers: 0,
                            modalidade: "regular",
                            date: dia.date,
                            day: dia.day,
                            createdAt: new Date()
                        });

                        registrosDia.push({
                            id: docRef.id,
                            serviceId: p.id,
                            guiaId: null
                        });
                    }
                }

                for (const r of registrosDia) {
                    if (r.guiaId || r.manual) continue;

                    const elegiveis = guiasDisponiveis.filter(
                        g => !usadosNoDia.has(g.id)
                    );

                    if (!elegiveis.length) break;

                    const menorCarga = Math.min(
                        ...elegiveis.map(g => contadorSemana[g.id])
                    );

                    const candidatos = elegiveis.filter(
                        g => contadorSemana[g.id] === menorCarga
                    );

                    const guiaSelecionado =
                        candidatos[Math.floor(Math.random() * candidatos.length)];

                    await setDoc(
                        doc(db, "weekly_services", r.id),
                        {
                            guiaId: guiaSelecionado.id,
                            guiaNome: guiaSelecionado.nome
                        },
                        { merge: true }
                    );

                    usadosNoDia.add(guiaSelecionado.id);
                    contadorSemana[guiaSelecionado.id]++;
                }
            }

            await carregarDados();
            alert("Escala gerada respeitando apenas a semana visível ✅");

        } finally {
            setLoading(false);
        }
    };

    const removerGuiasSemana = async () => {
        setLoading(true);
        try {
            for (const dia of semana) {
                const q = query(
                    collection(db, "weekly_services"),
                    where("date", "==", dia.date)
                );
                const snap = await getDocs(q);

                for (const docSnap of snap.docs) {
                    const data = docSnap.data();
                    if (!data.guiaId) continue;

                    await updateDoc(docSnap.ref, {
                        guiaId: null,
                        guiaNome: null,
                        manual: false
                    });
                }
            }
            await carregarDados();
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="page-container">
            {loading && (
                <div className="loading-overlay">
                    <div className="spinner"></div>
                    <span>Carregando...</span>
                </div>
            )}

            <h2>Planejamento Semanal de Passeios</h2>

            <div className="week-controls">
                <button className="btn-list1" onClick={() => setSemanaOffset(o => o - 1)}>⬅ Semana anterior</button>
                <button className="btn-list" onClick={() => setSemanaOffset(0)}>Semana atual</button>
                <button className="btn-list1" onClick={() => setSemanaOffset(o => o + 1)}>Semana seguinte ➡</button>
            </div>

            <div className="mode-toggle">
                <button className="btn-list" onClick={() => setModoVisualizacao(true)}>Visualizar</button>
                <button className="btn-list" onClick={() => setModoVisualizacao(false)}>Editar</button>
                <button className="btn-list" onClick={alocarGuiasSemana}>Alocar guias da semana</button>
                <button className="btn-list" onClick={removerGuiasSemana}>Remover guias</button>
                <button
                    className="btn-list"
                    onClick={enviarWhatsappGuiasSemana}
                >
                    Enviar escala por WhatsApp
                </button>

            </div>

            {semana.map(dia => {
                const passeiosFixos = services.filter(s =>
                    (s.frequencia || []).includes(dia.day)
                );

                const registrosDia = extras[dia.date] || [];

                return (
                    <div key={dia.date} className="day-card">
                        <strong className="day-list">{dia.label}</strong>

                        {passeiosFixos.map(p => {
                            const registro = registrosDia.find(r => r.serviceId === p.id);

                            return (
                                <div key={p.id} className="passeio-item">
                                    <span>{p.nome}</span>

                                    {modoVisualizacao ? (
                                        <>
                                            <span>{registro?.passengers || 0} pax</span>
                                            {statusGrupo(registro?.passengers)}
                                            <span>{registro?.guiaNome || "-"}</span>
                                        </>
                                    ) : (
                                        <>
                                            <input
                                                type="number"
                                                min="0"
                                                value={registro?.passengers ?? ""}
                                                onChange={e =>
                                                    alterarPaxManual(registro.id, e.target.value)
                                                }
                                            />

                                            <select
                                                value={registro?.guiaId || ""}
                                                onChange={e => {
                                                    const guia = guias.find(g => g.id === e.target.value);
                                                    alterarGuiaManual(registro.id, guia || null);
                                                }}
                                            >
                                                <option value="">Sem guia</option>
                                                {guias.map(g => (
                                                    <option key={g.id} value={g.id}>
                                                        {g.nome}
                                                    </option>
                                                ))}
                                            </select>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                );
            })}
        </div>
    );
};

export default ListaPasseiosSemana;
