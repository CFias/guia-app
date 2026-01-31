export const diasSemana = [
    "Segunda",
    "Terça",
    "Quarta",
    "Quinta",
    "Sexta",
    "Sábado",
    "Domingo",
];

// cria data LOCAL sem risco de fuso
const criarDataLocal = (ano, mes, dia) => {
    return new Date(ano, mes, dia, 12, 0, 0);
};

const formatarISO = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
};

export const getSemana = (offsetSemana = 0) => {
    const hoje = new Date();
    hoje.setHours(12, 0, 0, 0);

    const diaSemana = hoje.getDay(); // 0 = domingo
    const diffSegunda = diaSemana === 0 ? -6 : 1 - diaSemana;

    const segunda = new Date(hoje);
    segunda.setDate(hoje.getDate() + diffSegunda + offsetSemana * 7);
    segunda.setHours(12, 0, 0, 0);

    return diasSemana.map((dia, index) => {
        const data = new Date(segunda);
        data.setDate(segunda.getDate() + index);
        data.setHours(12, 0, 0, 0);

        return {
            day: dia,
            date: formatarISO(data), // 🔥 DATA CORRETA
            dateObj: data,           // 🔥 USO INTERNO
            label: `${dia} • ${data.toLocaleDateString("pt-BR")}`,
        };
    });
};
