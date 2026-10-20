import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import Icon from "../ui/Icon";
import { useAuth } from "../../Context/AuthContext";
import { HOME_BY_ROLE, ROLES } from "../../Context/permissions";
import { areaDaRota, podeArea, rotaForaDaRegiao, rotaInicial, telaNaRegiao } from "../../Context/acessos";
import { useRegiao } from "../../Context/regiaoContext";
import DefinirSenha from "./DefinirSenha";
import "./styles.css";

export const TelaCarregando = () => (
  <div className="auth-fullscreen">
    <div className="auth-spinner" aria-label="Carregando" />
  </div>
);

/* Logado no Firebase, mas sem acesso ao sistema: não existe cadastro em
   users/{uid} ou a conta foi desativada pelo operacional. Não redireciona
   (evita loop) — só explica e deixa sair. */
export const SemAcesso = () => {
  const { perfil, logout } = useAuth();
  const desativada = perfil && perfil.ativo !== true;

  return (
    <div className="auth-fullscreen">
      <div className="auth-card auth-card-center">
        <div className="auth-icon-badge">
          <Icon name="key" size={16} />
        </div>
        <h2>{desativada ? "Acesso desativado" : "Acesso não liberado"}</h2>
        <p>
          {desativada
            ? "Sua conta foi desativada. Fale com o operacional para reativar."
            : "Sua conta ainda não foi liberada no sistema. Fale com o operacional."}
        </p>
        <button type="button" className="auth-btn-secondary" onClick={logout}>
          <Icon name="logout" size={16} />
          Sair
        </button>
      </div>
    </div>
  );
};

/* Uso: <Route element={<RequireRole roles={[ROLES.OPERACIONAL]} />}> ...rotas... </Route>
   - sem sessão            → /login (guarda de onde veio)
   - sessão sem acesso     → tela "Acesso não liberado"
   - nível não permitido   → manda para a home do próprio nível */
export const RequireRole = ({ roles }) => {
  const { user, perfil, role, loading } = useAuth();
  const location = useLocation();

  if (loading) return <TelaCarregando />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (!role) return <SemAcesso />;
  // primeiro acesso com senha temporária: define a senha antes de tudo
  if (perfil?.senhaTemporaria === true) return <DefinirSenha />;
  if (!roles.includes(role)) {
    return <Navigate to={HOME_BY_ROLE[role]} replace />;
  }

  return <Outlet />;
};

/* Rota coringa (URL que não existe): cada um volta pra sua home. */
export const RedirectHome = () => {
  const { user, role, loading } = useAuth();

  if (loading) return <TelaCarregando />;
  if (!user) return <Navigate to="/login" replace />;
  if (!role) return <SemAcesso />;

  return <Navigate to={HOME_BY_ROLE[role]} replace />;
};

/* Telas do Operacional com acesso por conta (Controle de acessos).
   Envolve as rotas operacionais: se a conta não pode abrir a tela da URL,
   a home ("/") manda para a primeira tela liberada; as demais mostram o
   aviso de sem permissão. Comercial e Guia não passam por aqui (o nível
   deles já decide). */
export const RequireArea = () => {
  const { perfil, role, loading } = useAuth();
  const { regiao } = useRegiao();
  const location = useLocation();

  if (loading) return <TelaCarregando />;
  if (role !== ROLES.OPERACIONAL) return <Outlet />;

  const area = areaDaRota(location.pathname);
  const foraDaRegiao = rotaForaDaRegiao(location.pathname, regiao);
  if (!foraDaRegiao && (!area || podeArea(perfil, area.chave, regiao))) return <Outlet />;

  if (location.pathname === "/") return <Navigate to={rotaInicial(perfil, regiao)} replace />;

  // a tela existe, mas não nesta base (região)
  const naoNaBase = foraDaRegiao || (area && !telaNaRegiao(area.chave, regiao));

  return (
    <div className="auth-sem-permissao">
      <Icon name="lock" size={22} />
      <h2>{naoNaBase ? "Tela não disponível nesta base" : "Você não tem acesso a esta tela"}</h2>
      <p>
        {naoNaBase ? (
          <>
            <b>{area?.label || "Esta tela"}</b> usa dados próprios de Salvador e não está liberada para a base{" "}
            <b>{regiao.nome}</b>. A gerência libera as telas de cada base em Gestão → Regiões.
          </>
        ) : (
          <>
            <b>{area.label}</b> não está liberada para a sua conta. Se precisar, peça à gerência para liberar em Controle de acessos.
          </>
        )}
      </p>
      <Link className="auth-btn-secondary" to={rotaInicial(perfil, regiao)}>
        Ir para uma tela liberada
      </Link>
    </div>
  );
};
