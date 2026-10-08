import { createContext, useContext } from "react";

/* Preferências de interface POR PESSOA (salvas no navegador, por uid):
   - accent: cor de destaque escolhida em Configurações → Aparência
   - sidebarRecolhida: menu lateral expandido (256px) ou só ícones (72px)
   O tema (Claro / Escuro / Escuro profundo) continua no ThemeContext. */

export const PALETA_ACCENT = [
  { nome: "Verde", hex: "#1f9d6b" },
  { nome: "Petróleo", hex: "#167a8a" },
  { nome: "Azul", hex: "#3d6ee0" },
  { nome: "Violeta", hex: "#7b5cf0" },
  { nome: "Vermelho", hex: "#ec3013" },
  { nome: "Laranja", hex: "#ee6a1f" },
  { nome: "Âmbar", hex: "#e0a019" },
];

export const ACCENT_PADRAO = "#167a8a";

export const PreferenciasUIContext = createContext({
  accent: ACCENT_PADRAO,
  setAccent: () => { },
  sidebarRecolhida: false,
  setSidebarRecolhida: () => { },
});

export const usePreferenciasUI = () => useContext(PreferenciasUIContext);

/* Cor do texto sobre o accent: escuro em cores claras (Âmbar), branco nas demais. */
export const corSobreAccent = (hex = ACCENT_PADRAO) => {
  const n = parseInt(String(hex).replace("#", ""), 16);
  if (!Number.isFinite(n)) return "#ffffff";
  const canais = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const luminancia = 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2];
  return luminancia > 0.28 ? "#111110" : "#ffffff";
};
