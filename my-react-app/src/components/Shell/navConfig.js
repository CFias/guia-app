/* =========================================================
   MENU LATERAL — grupos e itens.
   - area: chave de ACESSO (Context/permissions.js) que libera o item
   - match: outros paths que deixam o item ativo e o breadcrumb certo
   As rotas em si continuam definidas no App.jsx (nada mudou nelas).
   ========================================================= */

// Item com `abas`: várias telas parecidas viram UMA entrada no menu; as telas
// aparecem como abas no topo (Shell/AbasDaSecao). O item aparece se alguma
// aba estiver liberada e abre na primeira liberada. Cada aba tem a própria
// chave de acesso (Controle de acessos continua tela a tela).
export const GRUPOS_MENU = [
  {
    chave: "visao",
    titulo: "Início",
    itens: [
      {
        to: "/",
        chave: "dashboard",
        label: "Hoje",
        icon: "dashboard",
        area: "painel",
        end: true,
      },
    ],
  },
  {
    chave: "operacao",
    titulo: "Operação",
    itens: [
      {
        to: "/op",
        chave: "painelOperacional",
        label: "Painel do dia",
        icon: "painel",
        area: "painel",
      },
      // painel do aeroporto (abre em tela cheia); só para as contas liberadas
      {
        to: "/atendimento",
        chave: "painelAtendimento",
        label: "Aeroporto",
        icon: "planeLanding",
        area: "painel",
      },
      {
        to: "/previas",
        label: "Envio aos fornecedores",
        icon: "send",
        area: "painel",
        abas: [
          { to: "/previas", chave: "previas", label: "Prévia", icon: "send" },
          {
            to: "/planilha",
            chave: "planilha",
            label: "Planilha",
            icon: "planilha",
          },
        ],
      },
    ],
  },
  {
    chave: "escala",
    titulo: "Guias",
    itens: [
      {
        to: "/passeios",
        chave: "gerarEscala",
        label: "Escala de passeios",
        icon: "sparkles",
        area: "painel",
      },
      {
        to: "/guias",
        label: "Guias",
        icon: "users",
        area: "painel",
        abas: [
          { to: "/guias", chave: "listaGuias", label: "Lista", icon: "users" },
          {
            to: "/mapear-guias",
            chave: "mapaAfinidade",
            label: "Afinidade",
            icon: "map",
          },
          {
            to: "/disponibilidade-guia",
            chave: "disponibilidade",
            label: "Disponibilidade",
            icon: "calendarCheck",
          },
        ],
      },
    ],
  },
  {
    chave: "relatorios",
    titulo: "Equipe e custos",
    itens: [
      {
        to: "/recepcao-turnos",
        chave: "demandaTurnos",
        label: "Escala da equipe",
        icon: "clock",
        area: "painel",
      },
      {
        to: "/custos",
        chave: "custos",
        label: "Custos e alterações",
        icon: "coins",
        area: "painel",
      },
      {
        to: "/servicos-fornecedor",
        chave: "servicosFornecedor",
        label: "Serviços por fornecedor",
        icon: "barChart",
        area: "painel",
      },
    ],
  },
  {
    chave: "gestao",
    titulo: "Administração",
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
      {
        to: "/faqadmin",
        label: "Central de informações",
        icon: "bookOpen",
        area: "painel",
        abas: [
          {
            to: "/faqadmin",
            chave: "centralInformacoes",
            label: "Edição",
            icon: "pencil",
          },
          {
            to: "/faqcomercial",
            chave: "verComercial",
            label: "Como o comercial vê",
            icon: "eye",
          },
        ],
      },
      {
        to: "/acessos",
        label: "Acessos e bases",
        icon: "shield",
        area: "painel",
        abas: [
          {
            to: "/acessos",
            label: "Acessos",
            icon: "shield",
            somenteGerencia: true,
          },
          {
            to: "/regioes",
            label: "Bases",
            icon: "mapPin",
            somenteGerencia: true,
          },
          // gerência + contas marcadas (users/{uid}.verBalanco)
          {
            to: "/balanco",
            label: "Balanço de uso",
            icon: "activity",
            somenteBalanco: true,
          },
        ],
      },
    ],
  },
  {
    // nível Comercial: só a Central de Informações (como já era)
    chave: "comercial",
    titulo: "Comercial",
    somenteSemPainel: true,
    itens: [
      {
        to: "/faqcomercial",
        label: "Central de Informações",
        icon: "bookOpen",
        area: "faqComercial",
      },
      {
        to: "/balanco",
        label: "Balanço de uso",
        icon: "activity",
        area: "layout",
        somenteBalanco: true,
      },
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
  "/conferencia": ["Operação", "Conferência de voos"],
  "/resumo": ["Operação", "Resumo por guia"],
  "/chegadas": ["Operação", "Chegadas"],
  "/outs": ["Operação", "OUT's"],
  "/escala-semanal": ["Guias", "Escala semanal"],
  "/register-tours": ["Administração", "Cadastro de passeios"],
  "/acessos": ["Administração", "Controle de acessos"],
  "/regioes": ["Administração", "Bases"],
  "/configuracoes": ["Conta", "Configurações"],
  "/sobre": ["Conta", "Sobre a FiaSystem"],
};
