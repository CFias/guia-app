import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";
import {
  ACCENT_PADRAO,
  PALETA_ACCENT,
  PreferenciasUIContext,
  corSobreAccent,
} from "./preferenciasUIContext";

const chaveStorage = (uid) => `ui_prefs_${uid || "anon"}`;

const lerPrefs = (uid) => {
  try {
    const bruto = localStorage.getItem(chaveStorage(uid));
    const obj = bruto ? JSON.parse(bruto) : {};
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
};

const salvarPrefs = (uid, prefs) => {
  try {
    localStorage.setItem(chaveStorage(uid), JSON.stringify(prefs));
  } catch {
    /* navegador sem storage: segue só na memória */
  }
};

const accentValido = (hex) =>
  PALETA_ACCENT.some((c) => c.hex === hex) ? hex : ACCENT_PADRAO;

export const PreferenciasUIProvider = ({ children }) => {
  const { user } = useAuth();
  const uid = user?.uid || null;

  // guarda junto o uid dono das preferências: ao trocar de pessoa
  // (login/logout) lê as dela, sem precisar de efeito.
  const [estado, setEstado] = useState(() => ({ uid, prefs: lerPrefs(uid) }));
  const prefs = estado.uid === uid ? estado.prefs : lerPrefs(uid);

  const accent = accentValido(prefs.accent);
  const sidebarRecolhida = prefs.sidebarRecolhida === true;

  // aplica a cor no <html>; os derivados (--accent-300/400/600…) recalculam no CSS
  useEffect(() => {
    const raiz = document.documentElement.style;
    raiz.setProperty("--accent", accent);
    raiz.setProperty("--on-accent", corSobreAccent(accent));
  }, [accent]);

  const atualizar = useCallback(
    (patch) =>
      setEstado((prev) => {
        const base = prev.uid === uid ? prev.prefs : lerPrefs(uid);
        const novo = { ...base, ...patch };
        salvarPrefs(uid, novo);
        return { uid, prefs: novo };
      }),
    [uid],
  );

  const value = useMemo(
    () => ({
      accent,
      setAccent: (hex) => atualizar({ accent: accentValido(hex) }),
      sidebarRecolhida,
      setSidebarRecolhida: (v) =>
        atualizar({
          sidebarRecolhida: typeof v === "function" ? v(sidebarRecolhida) : !!v,
        }),
    }),
    [accent, sidebarRecolhida, atualizar],
  );

  return (
    <PreferenciasUIContext.Provider value={value}>
      {children}
    </PreferenciasUIContext.Provider>
  );
};

export default PreferenciasUIProvider;
