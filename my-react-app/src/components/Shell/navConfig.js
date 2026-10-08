/* =========================================================
   MENU LATERAL — grupos e itens.
   - area: chave de ACESSO (Context/permissions.js) que libera o item
   - match: outros paths que deixam o item ativo e o breadcrumb certo
   As rotas em si continuam definidas no App.jsx (nada mudou nelas).
   ========================================================= */

export const GRUPOS_MENU = [
  {
    chave: "visao",
    titulo: "Visão geral",
    itens: [{ to: "/", label: "Dashboard", icon: "dashboard", area: "painel", end: true }],
  },
  {
    chave: "operacao",
    titulo: "Operação do dia",
    itens: [
      { to: "/op", label: "Painel Operacional", icon: "painel", area: "painel" },
      { to: "/previas", label: "Prévia de Serviços", icon: "send", area: "painel" },
      { to: "/planilha", label: "Planilha operacional", icon: "planilha", area: "painel" },
    ],
  },
  {
    chave: "escala",
    titulo: "Escala e guias",
    itens: [
      { to: "/passeios", label: "Gerar Escala", icon: "sparkles", area: "painel" },
      { to: "/guias", label: "Lista de Guias", icon: "users", area: "painel" },
      { to: "/mapear-guias", label: "Mapa de afinidade", icon: "map", area: "painel" },
      {
        to: "/disponibilidade-guia",
        label: "Disponibilidade da semana",
        icon: "calendarCheck",
        area: "painel",
      },
    ],
  },
  {
    chave: "relatorios",
    titulo: "Relatórios",
    itens: [
      {
        to: "/servicos-fornecedor",
        label: "Serviços por Fornecedor",
        icon: "barChart",
        area: "painel",
      },
    ],
  },
  {
    chave: "gestao",
    titulo: "Gestão",
    itens: [
      {
        to: "/register-guias",
        label: "Cadastros",
        icon: "folder",
        area: "painel",
        match: ["/register-guias", "/register-fornecedores", "/usuarios"],
      },
      { to: "/faqadmin", label: "Central de Dúvidas", icon: "help", area: "painel" },
      { to: "/faqcomercial", label: "Ver como o comercial", icon: "eye", area: "painel" },
    ],
  },
  {
    // nível Comercial: só a Central de Dúvidas (como já era)
    chave: "comercial",
    titulo: "Comercial",
    somenteSemPainel: true,
    itens: [
      { to: "/faqcomercial", label: "Central de Dúvidas", icon: "help", area: "faqComercial" },
    ],
  },
];

export const ITEM_CONFIGURACOES = {
  to: "/configuracoes",
  label: "Configurações",
  icon: "settings",
  area: "painel",
};

/* Telas que existem mas não aparecem no menu (como antes): só para o breadcrumb */
export const ROTAS_FORA_DO_MENU = {
  "/conferencia": ["Operação do dia", "Conferência de voos"],
  "/resumo": ["Operação do dia", "Resumo por guia"],
  "/chegadas": ["Operação do dia", "Chegadas"],
  "/outs": ["Operação do dia", "OUT's"],
  "/escala-semanal": ["Escala e guias", "Escala semanal"],
  "/register-tours": ["Gestão", "Cadastro de passeios"],
  "/configuracoes": ["Conta", "Configurações"],
};
