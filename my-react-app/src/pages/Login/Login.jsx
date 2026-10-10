import { useEffect, useState } from "react";
import { definirTituloAba } from "../../components/Shell/tituloAba";
import { Navigate, useLocation } from "react-router-dom";
import Icon from "../../components/ui/Icon";
import { useAuth } from "../../Context/AuthContext";
import { HOME_BY_ROLE } from "../../Context/permissions";
import { SemAcesso, TelaCarregando } from "../../components/Auth/RouteGuards";
import logo from "../../assets/clover.png";
import "../../components/Auth/styles.css";
import "../../components/Auth/login.css";
import PaisagemNordeste from "../../components/Auth/PaisagemNordeste";

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
  useEffect(() => {
    definirTituloAba("Entrar");
  }, []);

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
    <div className="login">
      {/* ---------- lado da marca ---------- */}
      <aside className="login-arte" aria-hidden="true">
        <header className="login-marca">
          <span className="login-marca__logo">
            <img src={logo} alt="" />
          </span>
          <span>
            <strong>Operacional SSA</strong>
            <small>Luck Receptivo · Salvador, Bahia</small>
          </span>
        </header>

        <div className="login-chamada">
          <span className="login-chamada__selo">Central de operações</span>
          <h1>
            Da chegada no aeroporto
            <br />
            ao último passeio do dia.
          </h1>
          <ul className="login-recursos">
            <li>
              <Icon name="planeLanding" size={16} />
              Chegadas e OUT's com status do voo
            </li>
            <li>
              <Icon name="sparkles" size={16} />
              Escala de guias e mapa de afinidade
            </li>
            <li>
              <Icon name="send" size={16} />
              Prévias e envio aos fornecedores
            </li>
          </ul>
        </div>

        <div className="login-paisagem">
          <PaisagemNordeste className="login-paisagem__svg" />
        </div>
      </aside>

      {/* ---------- formulário ---------- */}
      <main className="login-lado-form">
        <form className="login-form" onSubmit={entrar} noValidate>
          <span className="login-form__logo-mobile">
            <img src={logo} alt="Operacional SSA" />
          </span>

          <div className="login-form__titulo">
            <h2>Entrar</h2>
            <p>Use o e-mail e a senha fornecidos pela equipe operacional.</p>
          </div>

          <div className="login-campo">
            <label htmlFor="login-email">E-mail</label>
            <div className="login-input">
              <Icon name="mail" size={16} className="login-input__icone" />
              <input
                id="login-email"
                type="email"
                autoComplete="username"
                inputMode="email"
                placeholder="seu.nome@luck.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={enviando}
                autoFocus
              />
            </div>
          </div>

          <div className="login-campo">
            <div className="login-campo__topo">
              <label htmlFor="login-senha">Senha</label>
              <button
                type="button"
                className="login-link"
                onClick={esqueciSenha}
                disabled={enviando}
              >
                Esqueci minha senha
              </button>
            </div>
            <div className="login-input">
              <Icon name="lock" size={16} className="login-input__icone" />
              <input
                id="login-senha"
                type={mostrarSenha ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                disabled={enviando}
              />
              <button
                type="button"
                className="login-input__olho"
                onClick={() => setMostrarSenha((v) => !v)}
                aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                title={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
              >
                <Icon name={mostrarSenha ? "eyeOff" : "eye"} size={16} />
              </button>
            </div>
          </div>

          {erro && (
            <div className="login-alerta is-erro" role="alert">
              <Icon name="alert" size={16} />
              <span>{erro}</span>
            </div>
          )}
          {aviso && (
            <div className="login-alerta is-ok" role="status">
              <Icon name="circleCheck" size={16} />
              <span>{aviso}</span>
            </div>
          )}

          <button type="submit" className="login-botao" disabled={enviando}>
            {enviando ? (
              <>
                <Icon name="loader" size={16} className="ui-spin" />
                Entrando...
              </>
            ) : (
              <>
                Entrar
                <Icon name="arrowRight" size={16} />
              </>
            )}
          </button>

          <p className="login-ajuda">
            <Icon name="shield" size={14} />
            Acesso restrito. Contas são criadas pelo operacional.
          </p>
        </form>

        <footer className="login-rodape">
          <span>© Luck Receptivo</span>
          <span>Uso interno</span>
        </footer>
      </main>
    </div>
  );
};

export default Login;
