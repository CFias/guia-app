import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import {
  CheckCircleRounded,
  ErrorOutlineRounded,
  LockResetRounded,
  VisibilityOffRounded,
  VisibilityRounded,
} from "@mui/icons-material";
import { auth } from "../../Services/Services/firebase";
import logo from "../../assets/clover.png";
import "../../components/Auth/styles.css";

/* Tela de redefinição de senha (temática).

   O e-mail de recuperação do Firebase traz um link com ?mode=resetPassword
   &oobCode=... . Com a "URL de ação" do modelo de e-mail apontando pra cá,
   quem clica cai nesta tela em vez da página padrão do Firebase.
   Rota pública: a pessoa não está logada quando chega aqui. */

const MIN_SENHA = 6;

const mensagemErro = (code) => {
  switch (code) {
    case "auth/weak-password":
      return `Senha fraca. Use pelo menos ${MIN_SENHA} caracteres.`;
    case "auth/expired-action-code":
    case "auth/invalid-action-code":
      return "Este link expirou ou já foi usado. Peça um novo link.";
    case "auth/user-disabled":
      return "Este acesso foi desativado. Fale com o operacional.";
    case "auth/network-request-failed":
      return "Sem conexão. Verifique sua internet e tente de novo.";
    default:
      return "Não foi possível redefinir a senha. Tente novamente.";
  }
};

const RedefinirSenha = () => {
  const [params] = useSearchParams();
  const mode = params.get("mode");
  const oobCode = params.get("oobCode");

  // verificando → formulario | invalido ; formulario → sucesso
  const [fase, setFase] = useState(() =>
    mode === "resetPassword" && oobCode ? "verificando" : "invalido",
  );
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (mode !== "resetPassword" || !oobCode) return;

    let ativo = true;
    verifyPasswordResetCode(auth, oobCode)
      .then((emailDaConta) => {
        if (!ativo) return;
        setEmail(emailDaConta);
        setFase("formulario");
      })
      .catch(() => ativo && setFase("invalido"));

    return () => {
      ativo = false;
    };
  }, [mode, oobCode]);

  const redefinir = async (e) => {
    e.preventDefault();
    setErro("");

    if (senha.length < MIN_SENHA) {
      setErro(`A senha precisa ter pelo menos ${MIN_SENHA} caracteres.`);
      return;
    }
    if (senha !== confirma) {
      setErro("As senhas não são iguais.");
      return;
    }

    try {
      setEnviando(true);
      await confirmPasswordReset(auth, oobCode, senha);
      setFase("sucesso");
    } catch (err) {
      if (
        err.code === "auth/expired-action-code" ||
        err.code === "auth/invalid-action-code"
      ) {
        setFase("invalido");
        return;
      }
      setErro(mensagemErro(err.code));
    } finally {
      setEnviando(false);
    }
  };

  if (fase === "verificando") {
    return (
      <div className="auth-fullscreen">
        <div className="auth-spinner" aria-label="Verificando link" />
      </div>
    );
  }

  if (fase === "invalido") {
    return (
      <div className="auth-fullscreen">
        <div className="auth-card auth-card-center">
          <div className="auth-icon-badge auth-icon-badge-erro">
            <ErrorOutlineRounded />
          </div>
          <h2>Link inválido ou expirado</h2>
          <p>
            Este link de redefinição não pode mais ser usado. Volte ao login e
            toque em “Esqueci minha senha” para receber um novo.
          </p>
          <Link to="/login" className="auth-btn-primary">
            Ir para o login
          </Link>
        </div>
      </div>
    );
  }

  if (fase === "sucesso") {
    return (
      <div className="auth-fullscreen">
        <div className="auth-card auth-card-center">
          <div className="auth-icon-badge">
            <CheckCircleRounded />
          </div>
          <h2>Senha redefinida!</h2>
          <p>Sua nova senha já está valendo. Entre com ela para continuar.</p>
          <Link to="/login" className="auth-btn-primary">
            Ir para o login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-fullscreen">
      <form className="auth-card" onSubmit={redefinir} noValidate>
        <div className="auth-brand">
          <img src={logo} alt="Operacional SSA" />
          <strong>Nova senha</strong>
          <span>
            Defina a nova senha de acesso de{" "}
            <b className="auth-email-tag">{email}</b>
          </span>
        </div>

        <div className="auth-form">
          {/* ajuda o gerenciador de senhas do navegador a salvar pra conta certa */}
          <input
            type="email"
            value={email}
            autoComplete="username"
            readOnly
            hidden
          />

          <div className="auth-field">
            <label htmlFor="nova-senha">Nova senha</label>
            <div className="auth-input-wrap">
              <input
                id="nova-senha"
                className="has-toggle"
                type={mostrar ? "text" : "password"}
                autoComplete="new-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                disabled={enviando}
                autoFocus
              />
              <button
                type="button"
                className="auth-toggle-visibility"
                onClick={() => setMostrar((v) => !v)}
                aria-label={mostrar ? "Ocultar senha" : "Mostrar senha"}
              >
                {mostrar ? (
                  <VisibilityOffRounded fontSize="small" />
                ) : (
                  <VisibilityRounded fontSize="small" />
                )}
              </button>
            </div>
            <small className="auth-hint">
              Mínimo de {MIN_SENHA} caracteres.
            </small>
          </div>

          <div className="auth-field">
            <label htmlFor="confirma-senha">Repita a nova senha</label>
            <div className="auth-input-wrap">
              <input
                id="confirma-senha"
                type={mostrar ? "text" : "password"}
                autoComplete="new-password"
                value={confirma}
                onChange={(e) => setConfirma(e.target.value)}
                disabled={enviando}
              />
            </div>
          </div>

          {erro && <div className="auth-alert erro">{erro}</div>}

          <button type="submit" className="auth-btn-primary" disabled={enviando}>
            <LockResetRounded fontSize="small" />
            {enviando ? "Salvando..." : "Salvar nova senha"}
          </button>

          <Link to="/login" className="auth-link-btn">
            Voltar ao login
          </Link>
        </div>
      </form>
    </div>
  );
};

export default RedefinirSenha;
