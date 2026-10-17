// confirmacaoPasseio.js
//
// Passeio à Praia do Forte (4 horas): só entram na contagem/escala as
// reservas CONFIRMADAS:
// - com "confirmado"/"confirmada" na observação da reserva (o operacional
//   escreve quando o passageiro confirma — caso das operadoras, como Azul
//   Viagens e Decolar);
// - ou vendidas por um vendedor (tem vendedor no pagamento = já confirmado).
// "não confirmado", "aguardando confirmação" etc. não contam.

import { observacoesDoItem } from "./reservasExcluidas";

const normalizar = (t = "") =>
  String(t || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// "PASSEIO À PRAIA DO FORTE 4H", "PRAIA DO FORTE - 4 HORAS"...
export const exigeConfirmacao = (nomeServico = "") => {
  const t = normalizar(nomeServico);
  return (
    t.includes("praia do forte") && /\b4 ?(h|hs|hr|hrs|hora|horas)\b/.test(t)
  );
};

export const observacaoConfirma = (texto = "") => {
  const t = normalizar(texto);
  if (!/\bconfirm(ado|ada|ados|adas|ou|amos)\b/.test(t)) return false;
  // negativas: "não confirmado", "sem confirmação", "aguardando confirmar"...
  const semNegativas = t.replace(
    /\b(nao|sem|aguardando|aguarda|falta|pendente|ainda nao)\s+(de\s+)?(ter\s+)?confirm\w*/g,
    " ",
  );
  return /\bconfirm(ado|ada|ados|adas|ou|amos)\b/.test(semNegativas);
};

export const nomeDoVendedor = (item) => {
  const pagamentos = Array.isArray(item?.reserve?.pdvPayment)
    ? item.reserve.pdvPayment
    : [];
  const comUsuario = pagamentos.find(
    (p) => typeof p?.user?.name === "string" && p.user.name.trim(),
  );
  return comUsuario?.user?.name?.trim() || "";
};

// { confirmada, motivo: "observacao" | "vendedor" | null }
export const situacaoConfirmacao = (item) => {
  if (observacaoConfirma(observacoesDoItem(item)))
    return { confirmada: true, motivo: "observacao" };
  if (nomeDoVendedor(item)) return { confirmada: true, motivo: "vendedor" };
  return { confirmada: false, motivo: null };
};

// linha discreta no serviço: por que o pax mostra só uma parte das reservas
export const resumoPendentes = (lista = []) => {
  const pax = lista.reduce((acc, p) => acc + Number(p.pax || 0), 0);
  const n = lista.length;
  return `Conta só confirmados · ${pax} pax aguardando confirmação (${n} ${n === 1 ? "reserva" : "reservas"})`;
};

export const detalhePendentes = (lista = []) =>
  [
    'Praia do Forte 4h: o pax conta só as reservas confirmadas — com "confirmado" na observação ou vendidas por vendedor.',
    "Aguardando confirmação:",
    ...lista.map(
      (p) =>
        `• Reserva ${p.codigo || "—"}${p.cliente ? ` · ${p.cliente}` : ""}${p.operadora ? ` · ${p.operadora}` : ""} · ${p.pax} pax`,
    ),
  ].join("\n");
