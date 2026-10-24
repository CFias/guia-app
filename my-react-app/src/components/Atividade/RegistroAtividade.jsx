import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../Context/AuthContext";
import { GRUPOS_MENU, ITEM_CONFIGURACOES, ITEM_SOBRE, ROTAS_FORA_DO_MENU } from "../Shell/navConfig";
import { definirUsuarioAtividade, registrarPulso, registrarTela, registrarTempo } from "../../Services/Services/atividadeRepository";
import { useRegiao } from "../../Context/regiaoContext";

/* Registra o uso do sistema para o Balanço de uso: cada tela aberta e, a
   cada 4 minutos com a aba visível, o "último acesso" da conta.
   Não aparece na tela. Fica dentro do Router e do AuthProvider (main.jsx). */

const ROTULOS = (() => {
  const m = {
    "/minha-disponibilidade": "Minha disponibilidade (guia)",
    "/guia/sobre": "Sobre a FiaSystem (guia)",
    "/balanco": "Balanço de uso",
    "/usuarios": "Cadastros · Usuários",
    "/register-fornecedores": "Cadastros · Fornecedores",
    "/register-guias": "Cadastros · Guias",
  };
  GRUPOS_MENU.forEach((g) =>
    g.itens.forEach((i) => {
      (i.abas || []).forEach((a) => (m[a.to] = m[a.to] || `${i.label} · ${a.label}`));
      m[i.to] = m[i.to] || i.label;
    }),
  );
  [ITEM_CONFIGURACOES, ITEM_SOBRE].forEach((i) => (m[i.to] = i.label));
  Object.entries(ROTAS_FORA_DO_MENU).forEach(([r, [, label]]) => (m[r] = m[r] || label));
  return m;
})();

export const rotuloDaRota = (rota) => ROTULOS[rota] || rota;

const PULSO_MS = 4 * 60 * 1000;
// tempo de uso
const TICK_MS = 15 * 1000; // a cada 15 s soma o tempo da tela aberta
const GRAVAR_MS = 2 * 60 * 1000; // grava o acumulado a cada 2 min (e ao trocar de tela/sair)
const OCIOSO_MS = 15 * 60 * 1000; // sem mexer por 15 min: para de contar

const RegistroAtividade = () => {
  const { user, perfil, role } = useAuth();
  const { pathname } = useLocation();
  const ultimaRota = useRef("");
  const { regiao } = useRegiao();
  const baseRef = useRef("ssa");
  const tempoRef = useRef({ pendente: {}, ultimoTick: 0, ultimaInteracao: 0, ultimaGravacao: 0 });
  const liberado = !!user && !!role && perfil?.senhaTemporaria !== true;
  const uid = user?.uid;

  // quem está usando (as impressões registradas em qualquer tela usam isto)
  useEffect(() => {
    definirUsuarioAtividade(liberado ? { uid, nome: perfil?.nome, role, regiao: perfil?.regiao } : null);
    if (!liberado) ultimaRota.current = "";
  }, [liberado, uid, perfil?.nome, role, perfil?.regiao]);

  // cada tela aberta (a mesma rota seguida conta uma vez)
  useEffect(() => {
    if (!liberado || pathname === "/login" || pathname === "/redefinir-senha") return;
    const rota = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
    if (rota === ultimaRota.current) return;
    // o tempo da tela anterior fecha aqui
    tempoRef.current.gravarAgora?.();
    ultimaRota.current = rota;
    registrarTela(rota, rotuloDaRota(rota));
    registrarPulso(uid, rotuloDaRota(rota));
  }, [liberado, pathname, uid]);

  // base em uso (a da conta ou a escolhida pela gerência)
  useEffect(() => {
    baseRef.current = regiao?.id || "ssa";
  }, [regiao?.id]);

  // TEMPO DE USO por tela: soma enquanto a aba está visível e a pessoa mexeu
  // no sistema nos últimos 15 min; grava a cada 2 min, ao trocar de tela e
  // ao esconder/fechar a aba.
  useEffect(() => {
    if (!liberado) return undefined;
    const t = tempoRef.current;
    const agora = () => Date.now();
    t.ultimoTick = agora();
    t.ultimaInteracao = agora();
    t.ultimaGravacao = agora();

    const somar = () => {
      const now = agora();
      const delta = Math.min(now - t.ultimoTick, TICK_MS * 2); // aba suspensa não conta horas
      t.ultimoTick = now;
      const rota = ultimaRota.current;
      if (!rota || document.visibilityState !== "visible" || now - t.ultimaInteracao > OCIOSO_MS) return;
      t.pendente[rota] = (t.pendente[rota] || 0) + delta / 1000;
    };
    const gravar = () => {
      somar();
      const trechos = Object.entries(t.pendente).map(([rota, segundos]) => ({ rota, rotulo: rotuloDaRota(rota), segundos }));
      t.pendente = {};
      t.ultimaGravacao = agora();
      if (trechos.length) registrarTempo(trechos, baseRef.current);
    };
    const tick = () => {
      somar();
      if (agora() - t.ultimaGravacao >= GRAVAR_MS) gravar();
    };
    const mexeu = () => {
      t.ultimaInteracao = agora();
    };
    const aoMudarVisibilidade = () => {
      if (document.visibilityState === "hidden") gravar();
      else t.ultimoTick = agora();
    };
    const intervalo = setInterval(tick, TICK_MS);
    const eventos = ["pointerdown", "keydown", "wheel", "touchstart", "mousemove", "scroll"];
    eventos.forEach((e) => window.addEventListener(e, mexeu, { passive: true, capture: true }));
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    window.addEventListener("pagehide", gravar);
    t.gravarAgora = gravar;
    return () => {
      gravar();
      clearInterval(intervalo);
      eventos.forEach((e) => window.removeEventListener(e, mexeu, { capture: true }));
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
      window.removeEventListener("pagehide", gravar);
      t.gravarAgora = null;
    };
  }, [liberado]);

  // último acesso enquanto a aba está aberta e visível
  useEffect(() => {
    if (!liberado) return undefined;
    const bater = () => {
      if (document.visibilityState === "visible") registrarPulso(uid, rotuloDaRota(ultimaRota.current));
    };
    const t = setInterval(bater, PULSO_MS);
    document.addEventListener("visibilitychange", bater);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", bater);
    };
  }, [liberado, uid]);

  return null;
};

export default RegistroAtividade;
