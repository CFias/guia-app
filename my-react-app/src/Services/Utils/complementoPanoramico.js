// complementoPanoramico.js
//
// City Tour Histórico (meio dia) + City Tour Panorâmico (meio dia) =
// City Tour Histórico e Panorâmico (dia inteiro).
// Quando o passageiro compra só o Histórico e o comercial vende o Panorâmico
// como complemento, o Phoenix mostra duas reservas separadas. Para a contagem
// do Dashboard, essa reserva passa a valer como Histórico e Panorâmico (uma
// vez só), e o Panorâmico correspondente sai da conta.
//
// Casamento: mesma data e mesmo cliente (nome sem acento/maiúsculas) ou
// mesmo código de reserva. Cada Panorâmico completa no máximo um Histórico.

export const NOME_HISTORICO = "CITY TOUR HISTORICO";
export const NOME_PANORAMICO = "CITY TOUR PANORAMICO";
export const NOME_HISTORICO_PANORAMICO = "CITY TOUR HISTORICO E PANORAMICO";

const chaveTexto = (t = "") =>
  String(t || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/* registros: [{ date, nome, externalServiceId, cliente, codigo, pax, ... }]
   Devolve uma nova lista: Históricos com complemento viram
   NOME_HISTORICO_PANORAMICO (com `complemento`), e os Panorâmicos usados saem. */
export const juntarComplementoPanoramico = (registros = []) => {
  const porData = new Map();
  registros.forEach((r, i) => {
    if (!porData.has(r.date)) porData.set(r.date, []);
    porData.get(r.date).push(i);
  });

  const removidos = new Set();
  const convertidos = new Map(); // índice do histórico → { panoramico }

  porData.forEach((indices) => {
    const panoramicos = indices.filter(
      (i) => registros[i].nome === NOME_PANORAMICO,
    );
    if (!panoramicos.length) return;
    const historicos = indices.filter(
      (i) => registros[i].nome === NOME_HISTORICO,
    );
    historicos.forEach((h) => {
      const hist = registros[h];
      const cliente = chaveTexto(hist.cliente);
      const codigo = chaveTexto(hist.codigo);
      const achado = panoramicos.find((p) => {
        if (removidos.has(p)) return false;
        const pan = registros[p];
        return (
          (cliente && chaveTexto(pan.cliente) === cliente) ||
          (codigo && chaveTexto(pan.codigo) === codigo)
        );
      });
      if (achado === undefined) return;
      removidos.add(achado);
      convertidos.set(h, registros[achado]);
    });
  });

  if (!convertidos.size) return registros;

  // id do Histórico e Panorâmico do dia (para juntar no mesmo serviço do Phoenix)
  const idCompletoPorData = {};
  registros.forEach((r) => {
    if (
      r.nome === NOME_HISTORICO_PANORAMICO &&
      r.externalServiceId &&
      !idCompletoPorData[r.date]
    ) {
      idCompletoPorData[r.date] = r.externalServiceId;
    }
  });

  return registros
    .map((r, i) => {
      if (removidos.has(i)) return null;
      const pan = convertidos.get(i);
      if (!pan) return r;
      return {
        ...r,
        nome: NOME_HISTORICO_PANORAMICO,
        externalServiceId: idCompletoPorData[r.date] || null,
        complemento: {
          codigo: r.codigo || "",
          cliente: r.cliente || "",
          pax: r.pax,
          codigoPanoramico: pan.codigo || "",
        },
      };
    })
    .filter(Boolean);
};

// texto curto para mostrar no serviço
export const resumoComplementos = (lista = []) => {
  if (!lista.length) return "";
  if (lista.length === 1) {
    const c = lista[0];
    return `Reserva ${c.codigo || c.cliente} tem o Panorâmico como complemento`;
  }
  return `${lista.length} reservas com o Panorâmico como complemento`;
};

export const detalheComplementos = (lista = []) =>
  lista
    .map(
      (c) =>
        `Reserva ${c.codigo || "—"}${c.cliente ? ` (${c.cliente})` : ""}: Histórico + Panorâmico${
          c.codigoPanoramico && c.codigoPanoramico !== c.codigo
            ? ` (reserva ${c.codigoPanoramico})`
            : ""
        } · ${c.pax} pax`,
    )
    .join("\n");
