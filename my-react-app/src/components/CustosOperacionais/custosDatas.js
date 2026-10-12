// Datas e textos curtos usados nas telas de custos.

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DIAS_LONGOS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

export const isoLocal = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const hojeIso = () => isoLocal(new Date());

export const paraData = (iso) => {
  const [a, m, d] = String(iso).split("-").map(Number);
  return new Date(a, (m || 1) - 1, d || 1, 12);
};

export const somarDias = (iso, n) => {
  const d = paraData(iso);
  d.setDate(d.getDate() + n);
  return isoLocal(d);
};

export const listarDatas = (inicio, fim) => {
  if (!inicio || !fim || inicio > fim) return [];
  const datas = [];
  let atual = inicio;
  while (atual <= fim && datas.length < 400) {
    datas.push(atual);
    atual = somarDias(atual, 1);
  }
  return datas;
};

export const dataBr = (iso = "") => {
  const [a, m, d] = String(iso).split("-");
  return a ? `${d}/${m}/${a}` : "";
};

export const dataCurta = (iso = "") => {
  const [, m, d] = String(iso).split("-");
  return m ? `${d}/${m}` : "";
};

export const diaDaSemana = (iso) => DIAS[paraData(iso).getDay()];
export const diaDaSemanaLongo = (iso) => DIAS_LONGOS[paraData(iso).getDay()];

export const duracaoTexto = (min) => {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r} min`;
  return r ? `${h}h${String(r).padStart(2, "0")}` : `${h}h`;
};

export const baixarArquivo = (
  conteudo,
  nome,
  tipo = "text/csv;charset=utf-8",
) => {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const idDoCardVeiculo = (veiculoKey) =>
  `cst-veic-${String(veiculoKey).replace(/[^a-zA-Z0-9_-]/g, "-")}`;

export const lerPreferencia = (chave, padrao) => {
  try {
    return localStorage.getItem(chave) || padrao;
  } catch {
    return padrao;
  }
};

export const gravarPreferencia = (chave, valor) => {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    /* sem storage: fica só nesta visita */
  }
};

export const valorParaTexto = (v) =>
  v === null || v === undefined || v === ""
    ? ""
    : Number(v).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
