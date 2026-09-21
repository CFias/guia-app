import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import {
  LoginRounded,
  VisibilityOffRounded,
  VisibilityRounded,
} from "@mui/icons-material";
import { useAuth } from "../../Context/AuthContext";
import { HOME_BY_ROLE } from "../../Context/permissions";
import { SemAcesso, TelaCarregando } from "../../components/Auth/RouteGuards";
import logo from "../../assets/clover.png";
import "../../components/Auth/styles.css";

const mensagemErro = (code) => {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-email":
      return "E-mail ou senha incorretos.";
    case "auth/too-many-requests":
      return "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.";
    case "auth/user-disabled":
      return "Este acesso foi desativado. Fale com o operacional.";
    case "auth/network-request-failed":
      return "Sem conexão. Verifique sua internet e tente de novo.";
    default:
      return "Não foi possível entrar. Tente novamente.";
  }
};

const Login = () => {
  const { user, role, loading, login, enviarRedefinicaoSenha } = useAuth();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  if (loading) return <TelaCarregando />;

  // Já logado e com nível válido: vai pra onde tentava ir (ou pra própria home).
  // Se o nível não puder abrir essa rota, o guard de lá redireciona.
  if (user && role) {
    const from = location.state?.from;
    const destino = from?.pathname
      ? `${from.pathname}${from.search || ""}`
      : HOME_BY_ROLE[role];
    return <Navigate to={destino} replace />;
  }

  // Logado, mas sem cadastro em `users` ou desativado.
  if (user && !role) return <SemAcesso />;

  const entrar = async (e) => {
    e.preventDefault();
    setErro("");
    setAviso("");

    if (!email.trim() || !senha) {
      setErro("Informe e-mail e senha.");
      return;
    }

    try {
      setEnviando(true);
      await login(email, senha);
      // O redirecionamento acontece no topo deste componente, quando o
      // AuthContext terminar de carregar o perfil.
    } catch (err) {
      setErro(mensagemErro(err.code));
    } finally {
      setEnviando(false);
    }
  };

  const esqueciSenha = async () => {
    setErro("");
    setAviso("");

    if (!email.trim()) {
      setErro("Digite seu e-mail acima para receber o link de redefinição.");
      return;
    }

    try {
      setEnviando(true);
      await enviarRedefinicaoSenha(email);
    } catch (err) {
      if (err.code === "auth/invalid-email" || err.code === "auth/network-request-failed") {
        setErro(mensagemErro(err.code));
        return;
      }
      // Qualquer outro erro (ex.: e-mail sem conta) vira a mesma resposta
      // neutra, pra tela não revelar quem tem ou não cadastro.
    } finally {
      setEnviando(false);
    }

    setAviso(
      "Se esse e-mail tiver cadastro, você vai receber um link para criar uma nova senha.",
    );
  };

  return (
    <div className="auth-fullscreen">
      <form className="auth-card" onSubmit={entrar} noValidate>
        <div className="auth-brand">
          <img src={logo} alt="Operacional SSA" />
          <strong>Operacional SSA</strong>
          <span>Entre com o acesso fornecido pela equipe</span>
        </div>

        <div className="auth-form">
          <div className="auth-field">
            <label htmlFor="login-email">E-mail</label>
            <div className="auth-input-wrap">
              <input
                id="login-email"
                type="email"
                autoComplete="username"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={enviando}
                autoFocus
              />
            </div>
          </div>

          <div className="auth-field">
            <label htmlFor="login-senha">Senha</label>
            <div className="auth-input-wrap">
              <input
                id="login-senha"
                className="has-toggle"
                type={mostrarSenha ? "text" : "password"}
                autoComplete="current-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                disabled={enviando}
              />
              <button
                type="button"
                className="auth-toggle-visibility"
                onClick={() => setMostrarSenha((v) => !v)}
                aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
              >
                {mostrarSenha ? (
                  <VisibilityOffRounded fontSize="small" />
                ) : (
                  <VisibilityRounded fontSize="small" />
                )}
              </button>
            </div>
          </div>

          {erro && <div className="auth-alert erro">{erro}</div>}
          {aviso && <div className="auth-alert ok">{aviso}</div>}

          <button type="submit" className="auth-btn-primary" disabled={enviando}>
            <LoginRounded fontSize="small" />
            {enviando ? "Entrando..." : "Entrar"}
          </button>

          <button
            type="button"
            className="auth-link-btn"
            onClick={esqueciSenha}
            disabled={enviando}
          >
            Esqueci minha senha
          </button>
        </div>
      </form>
    </div>
  );
};

export default Login;
