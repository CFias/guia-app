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
    itens: [{ to: "/", chave: "dashboard", label: "Dashboard", icon: "dashboard", area: "painel", end: true }],
  },
  {
    chave: "operacao",
    titulo: "Operação do dia",
    itens: [
      { to: "/op", chave: "painelOperacional", label: "Painel Operacional", icon: "painel", area: "painel" },
      // painel do aeroporto (abre em tela cheia); só para as contas liberadas
      { to: "/atendimento", chave: "painelAtendimento", label: "Painel de Atendimento", icon: "planeLanding", area: "painel" },
      { to: "/previas", chave: "previas", label: "Prévia de Serviços", icon: "send", area: "painel" },
      { to: "/planilha", chave: "planilha", label: "Planilha operacional", icon: "planilha", area: "painel" },
    ],
  },
  {
    chave: "escala",
    titulo: "Escala e guias",
    itens: [
      { to: "/passeios", chave: "gerarEscala", label: "Gerar Escala", icon: "sparkles", area: "painel" },
      { to: "/guias", chave: "listaGuias", label: "Lista de Guias", icon: "users", area: "painel" },
      { to: "/mapear-guias", chave: "mapaAfinidade", label: "Mapa de afinidade", icon: "map", area: "painel" },
      {
        to: "/disponibilidade-guia",
        chave: "disponibilidade",
        label: "Disponibilidade da semana",
        icon: "calendarCheck",
        area: "painel",
      },
    ],
  },
  {
    chave: "relatorios",
    titulo: "Custos e relatórios",
    itens: [
      { to: "/custos", chave: "custos", label: "Custos e alterações", icon: "coins", area: "painel" },
      { to: "/recepcao-turnos", chave: "demandaTurnos", label: "Demanda por turno", icon: "clock", area: "painel" },
      {
        to: "/servicos-fornecedor",
        chave: "servicosFornecedor",
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
        chave: ["cadastros", "usuarios"],
        // abre na primeira aba liberada para a conta
        rotaPorChave: { cadastros: "/register-guias", usuarios: "/usuarios" },
        label: "Cadastros",
        icon: "folder",
        area: "painel",
        match: ["/register-guias", "/register-fornecedores", "/usuarios"],
      },
      { to: "/faqadmin", chave: "centralInformacoes", label: "Central de Informações", icon: "bookOpen", area: "painel" },
      { to: "/faqcomercial", chave: "verComercial", label: "Ver como o comercial", icon: "eye", area: "painel" },
      { to: "/acessos", label: "Controle de acessos", icon: "shield", area: "painel", somenteGerencia: true },
      { to: "/regioes", label: "Regiões", icon: "mapPin", area: "painel", somenteGerencia: true },
      // gerência + contas marcadas (users/{uid}.verBalanco)
      { to: "/balanco", label: "Balanço de uso", icon: "activity", area: "painel", somenteBalanco: true },
    ],
  },
  {
    // nível Comercial: só a Central de Informações (como já era)
    chave: "comercial",
    titulo: "Comercial",
    somenteSemPainel: true,
    itens: [
      { to: "/faqcomercial", label: "Central de Informações", icon: "bookOpen", area: "faqComercial" },
      { to: "/balanco", label: "Balanço de uso", icon: "activity", area: "layout", somenteBalanco: true },
    ],
  },
];

export const ITEM_SOBRE = {
  to: "/sobre",
  label: "Sobre a FiaSystem",
  icon: "info",
  area: "sobre",
};

export const ITEM_CONFIGURACOES = {
  to: "/configuracoes",
  label: "Configurações",
  icon: "settings",
  area: "configuracoes",
};

/* Telas que existem mas não aparecem no menu (como antes): só para o breadcrumb */
export const ROTAS_FORA_DO_MENU = {
  "/conferencia": ["Operação do dia", "Conferência de voos"],
  "/resumo": ["Operação do dia", "Resumo por guia"],
  "/chegadas": ["Operação do dia", "Chegadas"],
  "/outs": ["Operação do dia", "OUT's"],
  "/escala-semanal": ["Escala e guias", "Escala semanal"],
  "/register-tours": ["Gestão", "Cadastro de passeios"],
  "/acessos": ["Gestão", "Controle de acessos"],
  "/regioes": ["Gestão", "Regiões"],
  "/configuracoes": ["Conta", "Configurações"],
  "/sobre": ["Conta", "Sobre a FiaSystem"],
};
