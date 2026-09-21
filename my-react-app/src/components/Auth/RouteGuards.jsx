import { Navigate, Outlet, useLocation } from "react-router-dom";
import { LockRounded, LogoutRounded } from "@mui/icons-material";
import { useAuth } from "../../Context/AuthContext";
import { HOME_BY_ROLE } from "../../Context/permissions";
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
          <LockRounded />
        </div>
        <h2>{desativada ? "Acesso desativado" : "Acesso não liberado"}</h2>
        <p>
          {desativada
            ? "Sua conta foi desativada. Fale com o operacional para reativar."
            : "Sua conta ainda não foi liberada no sistema. Fale com o operacional."}
        </p>
        <button type="button" className="auth-btn-secondary" onClick={logout}>
          <LogoutRounded fontSize="small" />
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
  const { user, role, loading } = useAuth();
  const location = useLocation();

  if (loading) return <TelaCarregando />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (!role) return <SemAcesso />;
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
