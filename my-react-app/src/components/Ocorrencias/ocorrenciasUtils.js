// Utilitários da tela de Ocorrências (sem componentes).
import { hojeIso, somarDias } from "../CustosOperacionais/custosDatas";

export const copiarTexto = async (texto) => {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // navegador sem clipboard API (ou sem permissão): seleção manual
    try {
      const area = document.createElement("textarea");
      area.value = texto;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
};

const inicioDoMes = (iso) => `${iso.slice(0, 7)}-01`;
const fimDoMes = (iso) => {
  const [a, m] = iso.split("-").map(Number);
  const ultimo = new Date(a, m, 0).getDate();
  return `${iso.slice(0, 7)}-${String(ultimo).padStart(2, "0")}`;
};

// presets de período (o fim nunca passa de hoje)
export const PERIODOS = [
  { value: "mes", label: "Este mês" },
  { value: "mes-passado", label: "Mês passado" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
  { value: "ano", label: "Este ano" },
];

export const periodoDoPreset = (preset) => {
  const hoje = hojeIso();
  if (preset === "mes") return { inicio: inicioDoMes(hoje), fim: hoje };
  if (preset === "mes-passado") {
    const ref = somarDias(inicioDoMes(hoje), -1);
    return { inicio: inicioDoMes(ref), fim: fimDoMes(ref) };
  }
  if (preset === "30") return { inicio: somarDias(hoje, -29), fim: hoje };
  if (preset === "90") return { inicio: somarDias(hoje, -89), fim: hoje };
  if (preset === "ano")
    return { inicio: `${hoje.slice(0, 4)}-01-01`, fim: hoje };
  return { inicio: inicioDoMes(hoje), fim: hoje };
};

const MESES = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];
export const nomeDoMes = (aaaamm = "") => {
  const [a, m] = String(aaaamm).split("-");
  return m ? `${MESES[Number(m) - 1]}/${a.slice(2)}` : aaaamm;
};

// abre o HTML do relatório numa aba nova (ele chama a impressão sozinho)
export const abrirParaImprimir = (documento) => {
  const janela = window.open("", "_blank");
  if (!janela) {
    alert("Libere os pop-ups deste site para imprimir o relatório.");
    return;
  }
  janela.document.open();
  janela.document.write(documento);
  janela.document.close();
};

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
    /* sem storage: vale só nesta visita */
  }
};
