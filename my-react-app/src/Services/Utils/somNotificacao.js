/* Som das notificações: um "plim" curto gerado no navegador (sem arquivo de
   áudio). Liga/desliga por pessoa, guardado no navegador. O navegador só
   deixa tocar som depois do primeiro clique/toque na página — por isso o
   contexto de áudio é destravado no primeiro gesto. */

const CHAVE = "som_notificacoes";
let ctx = null;

const contexto = () => {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
};

if (typeof window !== "undefined") {
  const destravar = () => {
    const c = contexto();
    if (c?.state === "suspended") c.resume().catch(() => { });
    window.removeEventListener("pointerdown", destravar);
    window.removeEventListener("keydown", destravar);
  };
  window.addEventListener("pointerdown", destravar);
  window.addEventListener("keydown", destravar);
}

export const somLigado = () => {
  try {
    return localStorage.getItem(CHAVE) !== "0";
  } catch {
    return true;
  }
};

export const definirSom = (ligado) => {
  try {
    localStorage.setItem(CHAVE, ligado ? "1" : "0");
  } catch {
    /* navegador sem armazenamento: vale só nesta página */
  }
};

// evita vários sons empilhados quando chegam muitas notificações juntas
let ultimo = 0;

export const tocarNotificacao = ({ forcar = false } = {}) => {
  if (!forcar && !somLigado()) return;
  const agora = Date.now();
  if (agora - ultimo < 1200) return;
  ultimo = agora;
  const c = contexto();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => { });
  const t0 = c.currentTime + 0.02;
  // duas notas (Mi → Si), com volume que some devagar
  [
    [659.25, 0],
    [987.77, 0.13],
  ].forEach(([freq, atraso]) => {
    const osc = c.createOscillator();
    const vol = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    vol.gain.setValueAtTime(0.0001, t0 + atraso);
    vol.gain.exponentialRampToValueAtTime(0.22, t0 + atraso + 0.02);
    vol.gain.exponentialRampToValueAtTime(0.0001, t0 + atraso + 0.45);
    osc.connect(vol).connect(c.destination);
    osc.start(t0 + atraso);
    osc.stop(t0 + atraso + 0.5);
  });
};
