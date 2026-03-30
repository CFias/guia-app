// plannerSummary.js

export const gerarMensagemGuia = (guiaResumo, semana = []) => {
    if (!guiaResumo?.datas || guiaResumo.datas.size === 0) return "";

    const datasOrdenadas = Array.from(guiaResumo.datas).sort();

    const listaDatas = datasOrdenadas
        .map((data) => {
            const diaObj = semana.find((d) => d.date === data);
            if (!diaObj) return null;
            return `• ${diaObj.day} (${data.split("-").reverse().join("/")})`;
        })
        .filter(Boolean)
        .join("\n");

    return `
Olá, ${guiaResumo.nome}! 🍀

Segue sua escala da semana:

${listaDatas}

Gentilmente, confirme o recebimento.
Operacional - Luck Receptivo 🍀
`.trim();
};

export const gerarResumoGuiasSemana = ({
    semana = [],
    guias = [],
    disponibilidades = [],
    extras = {},
}) => {
    if (!semana.length || !guias.length) {
        return {
            resumoComServico: [],
            guiasDisponiveisSemServico: [],
            resumoCompleto: [],
        };
    }

    const inicioSemana = semana[0].date;
    const fimSemana = semana[semana.length - 1].date;

    const disponibilidadeMap = {};
    const bloqueiosMap = {};

    disponibilidades.forEach((d) => {
        if (!Array.isArray(d.disponibilidade)) return;

        const diasSemana = d.disponibilidade.filter(
            (ds) => ds.date >= inicioSemana && ds.date <= fimSemana,
        );

        disponibilidadeMap[d.guideId] = diasSemana.filter(
            (ds) => ds.status !== "BLOCKED",
        ).length;

        bloqueiosMap[d.guideId] = diasSemana
            .filter((ds) => ds.status === "BLOCKED")
            .map((ds) => ds.date);
    });

    // monta base com TODOS os guias ativos
    const baseResumo = guias
        .filter((g) => g.ativo)
        .map((guia) => ({
            guiaId: guia.id,
            nome: guia.nome || "Guia",
            nivelPrioridade: guia.nivelPrioridade || 2,
            totalServicos: 0,
            diasDisponiveis: disponibilidadeMap[guia.id] || 0,
            bloqueios: bloqueiosMap[guia.id] || [],
            ocupacao: 0,
            sobrecarga: false,
            datas: new Set(),
            semServico: false,
        }));

    const contador = {};
    baseResumo.forEach((item) => {
        contador[item.guiaId] = item;
    });

    semana.forEach((dia) => {
        const registrosDia = extras[dia.date] || [];

        registrosDia.forEach((r) => {
            if (!r.guiaId) return;
            if (r.allocationStatus === "CLOSED") return;
            if (!contador[r.guiaId]) return;

            contador[r.guiaId].totalServicos += 1;
            contador[r.guiaId].datas.add(r.date);
        });
    });

    const resumoCompleto = Object.values(contador).map((g) => {
        const dias = Number(g.diasDisponiveis) || 0;
        const total = Number(g.totalServicos) || 0;
        const ocupacao = dias > 0 ? Math.round((total / dias) * 100) : 0;

        return {
            ...g,
            ocupacao: Number.isFinite(ocupacao) ? ocupacao : 0,
            sobrecarga: ocupacao >= 90,
            semServico: dias > 0 && total === 0,
        };
    });

    const resumoComServico = resumoCompleto
        .filter((g) => g.totalServicos > 0)
        .sort((a, b) => b.ocupacao - a.ocupacao);

    const guiasDisponiveisSemServico = resumoCompleto
        .filter((g) => g.semServico)
        .sort((a, b) => {
            if (b.diasDisponiveis !== a.diasDisponiveis) {
                return b.diasDisponiveis - a.diasDisponiveis;
            }

            if ((b.nivelPrioridade || 0) !== (a.nivelPrioridade || 0)) {
                return (b.nivelPrioridade || 0) - (a.nivelPrioridade || 0);
            }

            return (a.nome || "").localeCompare(b.nome || "", "pt-BR", {
                sensitivity: "base",
            });
        });

    return {
        resumoComServico,
        guiasDisponiveisSemServico,
        resumoCompleto,
    };
};