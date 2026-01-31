export const gerarMensagemConfirmacaoDatas = ({
    nomeGuia,
    datasSelecionadas,
}) => {
    const listaDatas = datasSelecionadas
        .map(
            d =>
                `• ${d.day} (${new Date(d.date).toLocaleDateString("pt-BR")})`
        )
        .join("\n");

    return `
Olá ${nomeGuia}! 👋

Estamos organizando a agenda da próxima semana e gostaríamos de confirmar sua disponibilidade para as seguintes datas:

📅 *Datas selecionadas:*
${listaDatas}

Você confirma disponibilidade para essas datas?

👉 Responda com *SIM* para confirmar  
👉 Ou *NÃO* caso não consiga atender alguma delas

Obrigado! 😊
`;
};
