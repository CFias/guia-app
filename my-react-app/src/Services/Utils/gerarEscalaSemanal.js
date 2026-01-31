export const gerarEscalaSemanal = ({
    passeios,
    disponibilidades,
    guides,
    semana
}) => {
    const OPCOES = 3;
    const resultado = [];

    for (let opcao = 0; opcao < OPCOES; opcao++) {
        const escala = [];
        const usoGuiaPorDia = {}; // { '2026-01-27': Set(guideId) }

        semana.forEach(dia => {
            usoGuiaPorDia[dia.date] = new Set();

            // 👉 passeios que realmente acontecem neste dia
            const passeiosDoDia = passeios.filter(p =>
                (p.frequencia || []).includes(dia.day)
            );

            passeiosDoDia.forEach(passeio => {
                // guias aptos + disponíveis neste dia
                let guiasValidos = guides.filter(guia => {
                    const dispo = disponibilidades.find(
                        d =>
                            d.guideId === guia.id &&
                            d.disponibilidade.some(
                                disp => disp.date === dia.date
                            )
                    );

                    return (
                        dispo &&
                        (guia.passeios || []).some(
                            p => p.id === passeio.id
                        ) &&
                        !usoGuiaPorDia[dia.date].has(guia.id)
                    );
                });

                if (!guiasValidos.length) return;

                // 🔀 aleatório equilibrado
                guiasValidos = guiasValidos.sort(
                    () => Math.random() - 0.5
                );

                const guia = guiasValidos[0];

                usoGuiaPorDia[dia.date].add(guia.id);

                escala.push({
                    date: dia.date,
                    day: dia.day,
                    passeioId: passeio.id,
                    passeioNome: passeio.nome,
                    guideId: guia.id,
                    guideName: guia.nome,
                    whatsapp: guia.whatsapp
                });
            });
        });

        resultado.push(escala);
    }

    return resultado;
};
