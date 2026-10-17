/* =========================================================
   CONTROLE DE ACESSOS POR TELA (operacional)

   - Gerência (users/{uid}.gerencia == true, sempre nível Operacional):
     vê tudo e decide o que cada conta pode ver (tela Controle de acessos).
   - Demais contas do Operacional: users/{uid}.acessos = { chaveDaTela: false }
     bloqueia a tela. Tela sem marcação = liberada (é o comportamento de
     antes, então ninguém perde acesso até a gerência mudar).
   - Comercial e Guia continuam com o acesso fixo do nível (permissions.js).

   ⚠️ Isto controla menu e rotas. Os DADOS exclusivos de cada tela (custos,
   Central de Informações, usuários, turnos, a própria configuração de
   acessos) são protegidos também no firestore.rules — as chaves abaixo
   são as mesmas usadas lá. Se criar uma tela nova, inclua aqui.
   ========================================================= */

import { ROLES } from "./permissions";

export const GRUPOS_ACESSO = [
  {
    titulo: "Visão geral",
    areas: [{ chave: "dashboard", label: "Dashboard", rotas: ["/"] }],
  },
  {
    titulo: "Operação do dia",
    areas: [
      {
        chave: "painelOperacional",
        label: "Painel Operacional",
        detalhe: "Inclui Chegadas, OUT's, Conferência de voos e Resumo por guia.",
        rotas: ["/op", "/chegadas", "/outs", "/conferencia", "/resumo"],
      },
      { chave: "previas", label: "Prévia de Serviços", rotas: ["/previas"] },
      { chave: "planilha", label: "Planilha operacional", rotas: ["/planilha"] },
    ],
  },
  {
    titulo: "Escala e guias",
    areas: [
      { chave: "gerarEscala", label: "Gerar Escala", detalhe: "Inclui a Escala semanal.", rotas: ["/passeios", "/escala-semanal"] },
      { chave: "listaGuias", label: "Lista de Guias", rotas: ["/guias"] },
      { chave: "mapaAfinidade", label: "Mapa de afinidade", rotas: ["/mapear-guias"] },
      { chave: "disponibilidade", label: "Disponibilidade da semana", rotas: ["/disponibilidade-guia"] },
    ],
  },
  {
    titulo: "Custos e relatórios",
    areas: [
      {
        chave: "custos",
        label: "Custos operacionais",
        detalhe: "Custos lançados e tabela de tarifas — protegidos também no banco.",
        rotas: ["/custos"],
        protegidoNoBanco: true,
      },
      {
        chave: "demandaTurnos",
        label: "Demanda por turno",
        detalhe: "Relatório e configuração de turnos e equipe.",
        rotas: ["/recepcao-turnos"],
        protegidoNoBanco: true,
      },
      { chave: "servicosFornecedor", label: "Serviços por Fornecedor", rotas: ["/servicos-fornecedor"] },
    ],
  },
  {
    titulo: "Gestão",
    areas: [
      {
        chave: "cadastros",
        label: "Cadastros de guias, fornecedores e passeios",
        rotas: ["/register-guias", "/register-fornecedores", "/register-tours"],
      },
      {
        chave: "usuarios",
        label: "Usuários (contas do comercial e dos guias)",
        detalhe: "Contas do Operacional e da gerência só a gerência altera.",
        rotas: ["/usuarios"],
        protegidoNoBanco: true,
      },
      {
        chave: "centralInformacoes",
        label: "Central de Informações (edição)",
        detalhe: "Cadastrar e editar o que o comercial vê — protegido também no banco.",
        rotas: ["/faqadmin"],
        protegidoNoBanco: true,
      },
      { chave: "verComercial", label: "Ver como o comercial", rotas: ["/faqcomercial"] },
    ],
  },
  {
    titulo: "Conta",
    areas: [
      {
        chave: "configuracoes",
        label: "Configurações do operacional",
        detalhe: "Regras da escala, Google Drive, serviços fora da escala. Sem isto, vê só o Tema.",
        rotas: [],
      },
    ],
  },
];

export const AREAS = GRUPOS_ACESSO.flatMap((g) => g.areas);

export const ROTA_ACESSOS = "/acessos";

export const ehGerencia = (perfil) => !!perfil && perfil.ativo === true && perfil.role === ROLES.OPERACIONAL && perfil.gerencia === true;

// A conta pode abrir a tela? (só faz sentido para o Operacional)
export const podeArea = (perfil, chave) => {
  if (!perfil || perfil.role !== ROLES.OPERACIONAL) return false;
  if (ehGerencia(perfil)) return true;
  return perfil.acessos?.[chave] !== false;
};

export const areaDaRota = (pathname) => {
  const caminho = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return AREAS.find((a) => a.rotas.includes(caminho)) || null;
};

// Primeira tela liberada (para onde a pessoa vai quando abre algo bloqueado)
export const rotaInicial = (perfil) => {
  const area = AREAS.find((a) => a.rotas.length && podeArea(perfil, a.chave));
  return area ? area.rotas[0] : "/sobre";
};

export const contarBloqueadas = (acessos = {}) => AREAS.filter((a) => acessos?.[a.chave] === false).length;
