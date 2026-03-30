// plannerRepository.js

import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    query,
    setDoc,
    updateDoc,
    where,
    writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { getSemanaKey, mapearRegistrosPorData, normalizarTexto } from "./plannerUtils";

export const carregarBasePlanner = async () => {
    const [servSnap, guiasSnap, configSnap, dispSnap, afinidadeSnap] =
        await Promise.all([
            getDocs(collection(db, "services")),
            getDocs(collection(db, "guides")),
            getDoc(doc(db, "settings", "scale")),
            getDocs(collection(db, "guide_availability")),
            getDocs(collection(db, "guide_tour_levels")),
        ]);

    const services = servSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
    }));

    const guias = guiasSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
    }));

    const disponibilidades = dispSnap.docs.map((d) => d.data());
    const afinidades = afinidadeSnap.docs;

    const settings = configSnap.exists() ? configSnap.data() : {};

    return {
        services,
        guias,
        disponibilidades,
        afinidades,
        modoDistribuicaoGuias: settings.modoDistribuicaoGuias || "equilibrado",
        usarAfinidadeGuiaPasseio: settings.usarAfinidadeGuiaPasseio || false,
        normalizarTexto,
    };
};

export const carregarModoGeradoSemana = async (semanaRef = []) => {
    const semanaKey = getSemanaKey(semanaRef);
    if (!semanaKey) return null;

    try {
        const snap = await getDoc(doc(db, "weekly_scale_meta", semanaKey));
        return snap.exists() ? snap.data().modoDistribuicaoGerado || null : null;
    } catch (err) {
        console.error("Erro ao carregar modo gerado da semana:", err);
        return null;
    }
};

export const salvarModoGeradoSemana = async (semanaRef = [], modo) => {
    const semanaKey = getSemanaKey(semanaRef);
    if (!semanaKey) return;

    await setDoc(
        doc(db, "weekly_scale_meta", semanaKey),
        {
            semanaInicio: semanaRef[0].date,
            semanaFim: semanaRef[semanaRef.length - 1].date,
            modoDistribuicaoGerado: modo,
            updatedAt: new Date(),
        },
        { merge: true },
    );
};

export const limparModoGeradoSemana = async (semanaRef = []) => {
    const semanaKey = getSemanaKey(semanaRef);
    if (!semanaKey) return;

    await setDoc(
        doc(db, "weekly_scale_meta", semanaKey),
        {
            modoDistribuicaoGerado: null,
            updatedAt: new Date(),
        },
        { merge: true },
    );
};

export const carregarWeeklyServicesDoDia = async (date) => {
    const q = query(collection(db, "weekly_services"), where("date", "==", date));
    const snap = await getDocs(q);

    return snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
    }));
};

export const carregarWeeklyServicesDaSemana = async (semana = []) => {
    if (!semana.length) return {};

    const inicioSemana = semana[0].date;
    const fimSemana = semana[semana.length - 1].date;

    const q = query(
        collection(db, "weekly_services"),
        where("date", ">=", inicioSemana),
        where("date", "<=", fimSemana),
    );

    const snap = await getDocs(q);

    const lista = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
    }));

    return mapearRegistrosPorData(semana, lista);
};

export const salvarOuAtualizarWeeklyService = async (id, payload) => {
    if (id) {
        await setDoc(doc(db, "weekly_services", id), payload, { merge: true });
        return id;
    }

    const ref = await addDoc(collection(db, "weekly_services"), payload);
    return ref.id;
};

export const removerWeeklyService = async (id) => {
    if (!id) return;
    await deleteDoc(doc(db, "weekly_services", id));
};

export const alterarStatusAlocacao = async (registroId, status) => {
    if (!registroId) return;

    const dadosUpdate = { allocationStatus: status };

    if (status === "CLOSED") {
        dadosUpdate.guiaId = null;
        dadosUpdate.guiaNome = null;
    }

    await setDoc(doc(db, "weekly_services", registroId), dadosUpdate, {
        merge: true,
    });
};

export const salvarPaxManual = async (registroId, pax) => {
    if (!registroId) return;

    await setDoc(
        doc(db, "weekly_services", registroId),
        { passengers: Number(pax || 0) },
        { merge: true },
    );
};

export const salvarGuiaManual = async ({ registroId, guia, dia }) => {
    if (!registroId) return;

    await setDoc(
        doc(db, "weekly_services", registroId),
        {
            guiaId: guia?.id || null,
            guiaNome: guia?.nome || null,
            day: dia.day,
            date: dia.date,
            manual: false,
            updatedAt: new Date(),
        },
        { merge: true },
    );
};

export const adicionarPasseioManual = async ({ dia, dados }) => {
    await addDoc(collection(db, "weekly_services"), {
        serviceName: dados.nome,
        serviceId: null,
        externalServiceId: null,
        passengers: Number(dados.pax || 0),
        adultCount: 0,
        childCount: 0,
        infantCount: 0,
        guiaId: dados.guiaId || null,
        guiaNome: dados.guiaNome || null,
        date: dia.date,
        day: dia.day,
        manual: true,
        createdAt: new Date(),
        allocationStatus: "OPEN",
    });
};

export const removerPasseio = async (id) => {
    await deleteDoc(doc(db, "weekly_services", id));
};

export const aplicarPlanoDeAlocacao = async (atualizacoes = []) => {
    if (!atualizacoes.length) return;

    const batch = writeBatch(db);

    atualizacoes.forEach((item) => {
        if (!item?.registroId) return;

        batch.set(
            doc(db, "weekly_services", item.registroId),
            {
                guiaId: item.guiaId ?? null,
                guiaNome: item.guiaNome ?? null,
                updatedAt: new Date(),
            },
            { merge: true },
        );
    });

    await batch.commit();
};

export const limparGuiasDeServicosFechados = async (semana = []) => {
    if (!semana.length) return;

    const inicioSemana = semana[0].date;
    const fimSemana = semana[semana.length - 1].date;

    const q = query(
        collection(db, "weekly_services"),
        where("date", ">=", inicioSemana),
        where("date", "<=", fimSemana),
    );

    const snap = await getDocs(q);
    const batch = writeBatch(db);

    snap.docs.forEach((docSnap) => {
        const r = docSnap.data();
        if (r.allocationStatus === "CLOSED" && (r.guiaId || r.guiaNome)) {
            batch.update(docSnap.ref, {
                guiaId: null,
                guiaNome: null,
            });
        }
    });

    await batch.commit();
};

export const removerGuiasSemana = async (semana = []) => {
    if (!semana.length) return;

    const inicioSemana = semana[0].date;
    const fimSemana = semana[semana.length - 1].date;

    const q = query(
        collection(db, "weekly_services"),
        where("date", ">=", inicioSemana),
        where("date", "<=", fimSemana),
    );

    const snap = await getDocs(q);
    const batch = writeBatch(db);

    snap.docs.forEach((docSnap) => {
        const data = docSnap.data();
        if (!data.guiaId && !data.guiaNome) return;

        batch.update(docSnap.ref, {
            guiaId: null,
            guiaNome: null,
            manual: false,
            updatedAt: new Date(),
        });
    });

    await batch.commit();
};