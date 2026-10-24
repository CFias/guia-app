/* Instalar o sistema como app (tela inicial do celular).
   O Chrome/Android dispara "beforeinstallprompt" uma vez, logo que a página
   carrega — às vezes antes da tela que mostra o botão existir. Por isso o
   evento é guardado aqui, no carregamento (importado no main.jsx), e as
   telas leem pelo hook useInstalarApp().
   iPhone: não existe esse evento; instala-se pelo Safari (Compartilhar →
   Adicionar à Tela de Início). Depois de instalado, o iPhone (iOS 16.4+)
   também recebe as notificações. */
import { useSyncExternalStore } from "react";

let eventoInstalar = null;
let instalado =
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator?.standalone === true);
const ouvintes = new Set();
const avisar = () => ouvintes.forEach((f) => f());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // a gente mostra o próprio cartão
    eventoInstalar = e;
    avisar();
  });
  window.addEventListener("appinstalled", () => {
    eventoInstalar = null;
    instalado = true;
    avisar();
  });
}

const assinar = (f) => {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
};
let fotoAtual = null;
const foto = () => {
  if (
    !fotoAtual ||
    fotoAtual.evento !== eventoInstalar ||
    fotoAtual.instalado !== instalado
  )
    fotoAtual = { evento: eventoInstalar, instalado };
  return fotoAtual;
};

export const ehIphone = () =>
  typeof navigator !== "undefined" &&
  /iphone|ipad|ipod/i.test(navigator.userAgent);

// pede ao navegador para instalar; devolve true se a pessoa aceitou
export const pedirInstalacao = async () => {
  const e = eventoInstalar;
  if (!e) return false;
  e.prompt();
  const escolha = await e.userChoice.catch(() => null);
  eventoInstalar = null;
  avisar();
  return escolha?.outcome === "accepted";
};

export const useInstalarApp = () => {
  const { evento, instalado: jaInstalado } = useSyncExternalStore(
    assinar,
    foto,
    foto,
  );
  const iphone = ehIphone();
  return {
    instalado: jaInstalado,
    // Android/Chrome: botão "Instalar"; iPhone: instrução do Safari
    podeInstalar: !jaInstalado && (!!evento || iphone),
    temBotao: !!evento,
    iphone,
    instalar: pedirInstalacao,
  };
};
