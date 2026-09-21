/* =========================================================
   NÍVEIS DE ACESSO — fonte única da verdade no front.

   ⚠️ Isto só controla o que aparece / qual rota abre. Quem
   realmente protege os dados é o firestore.rules (na raiz do
   projeto). Se mudar algo aqui, espelhe lá.
   ========================================================= */

export const ROLES = {
  OPERACIONAL: "operacional",
  COMERCIAL: "comercial",
  GUIA: "guia",
};

export const ROLE_LABELS = {
  [ROLES.OPERACIONAL]: "Operacional",
  [ROLES.COMERCIAL]: "Comercial",
  [ROLES.GUIA]: "Guia",
};

export const ROLE_DESCRIPTIONS = {
  [ROLES.OPERACIONAL]:
    "Acesso total ao sistema, inclusive cadastro de usuários.",
  [ROLES.COMERCIAL]: "Somente as telas de teor comercial (Central de Dúvidas).",
  [ROLES.GUIA]: "Somente a tela para preencher a própria disponibilidade.",
};

/* Quem pode abrir cada área. Pra liberar uma tela nova ao Comercial,
   é só incluir ROLES.COMERCIAL na lista da área (e no firestore.rules
   a coleção que essa tela lê). */
export const ACESSO = {
  // O layout do Dashboard (menu lateral) abre pra quem tem alguma tela nele;
  // o que cada um vê dentro dele é controlado pelas áreas abaixo.
  layout: [ROLES.OPERACIONAL, ROLES.COMERCIAL],
  painel: [ROLES.OPERACIONAL], // todas as telas operacionais
  faqComercial: [ROLES.OPERACIONAL, ROLES.COMERCIAL],
  minhaDisponibilidade: [ROLES.GUIA],
};

/* Para onde cada nível cai depois do login. Cada destino precisa
   estar liberado para o próprio nível em ACESSO (senão dá loop). */
export const HOME_BY_ROLE = {
  [ROLES.OPERACIONAL]: "/",
  [ROLES.COMERCIAL]: "/faqcomercial",
  [ROLES.GUIA]: "/minha-disponibilidade",
};
