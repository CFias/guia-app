import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../Context/AuthContext";
import { GRUPOS_MENU, ITEM_CONFIGURACOES, ITEM_SOBRE, ROTAS_FORA_DO_MENU } from "../Shell/navConfig";
import { definirUsuarioAtividade, registrarPulso, registrarTela } from "../../Services/Services/atividadeRepository";

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
  GRUPOS_MENU.forEach((g) => g.itens.forEach((i) => (m[i.to] = m[i.to] || i.label)));
  [ITEM_CONFIGURACOES, ITEM_SOBRE].forEach((i) => (m[i.to] = i.label));
  Object.entries(ROTAS_FORA_DO_MENU).forEach(([r, [, label]]) => (m[r] = m[r] || label));
  return m;
})();

export const rotuloDaRota = (rota) => ROTULOS[rota] || rota;

const PULSO_MS = 4 * 60 * 1000;

const RegistroAtividade = () => {
  const { user, perfil, role } = useAuth();
  const { pathname } = useLocation();
  const ultimaRota = useRef("");
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
    ultimaRota.current = rota;
    registrarTela(rota, rotuloDaRota(rota));
    registrarPulso(uid, rotuloDaRota(rota));
  }, [liberado, pathname, uid]);

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
