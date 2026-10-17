// reservasExcluidas.js
//
// Reservas que NÃO contam em lugar nenhum do sistema: quando a observação
// da reserva tem "CLD", "cancelado/cancelada", "não escalar" ou
// "dispensado/dispensada". Aplicado no ponto em que cada tela lê a lista do
// Phoenix (extrairListaResposta), então vale para Dashboard, Painel, Escala,
// Prévia, Custos, Serviços por Fornecedor, Resumo etc.

const normalizar = (t = "") =>
  String(t || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const CAMPOS_OBSERVACAO = [
  (i) => i?.observation,
  (i) => i?.observations,
  (i) => i?.notes,
  (i) => i?.note,
  (i) => i?.reserve?.observation,
  (i) => i?.reserve?.observations,
  (i) => i?.reserve?.notes,
  (i) => i?.reserve?.note,
];

export const observacoesDoItem = (item) =>
  CAMPOS_OBSERVACAO.map((f) => f(item))
    .filter((v) => typeof v === "string" && v.trim())
    .join(" | ");

const TERMOS =
  /\b(cld|cancelad[oa]s?|cancelamento|nao escalar|dispensad[oa]s?)\b/;

export const observacaoExclui = (texto = "") => TERMOS.test(normalizar(texto));

// só itens que são reserva/serviço do Phoenix (não cadastro de fornecedor etc.)
const pareceReserva = (item) =>
  !!item &&
  typeof item === "object" &&
  (item.reserve || item.is_adult_count !== undefined || item.presentation_hour);

export const reservaExcluida = (item) =>
  pareceReserva(item) && observacaoExclui(observacoesDoItem(item));

export const semReservasExcluidas = (lista = []) =>
  Array.isArray(lista) ? lista.filter((item) => !reservaExcluida(item)) : [];
