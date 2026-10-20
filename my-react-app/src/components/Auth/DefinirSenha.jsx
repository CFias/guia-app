import { useEffect, useState } from "react";
import { updatePassword } from "firebase/auth";
import { Timestamp, doc, updateDoc } from "firebase/firestore";
import Icon from "../ui/Icon";
import { auth, db } from "../../Services/Services/firebase";
import { useAuth } from "../../Context/AuthContext";
import { definirTituloAba } from "../Shell/tituloAba";
import logo from "../../assets/clover.png";
import "./styles.css";

/* PRIMEIRO ACESSO: a conta foi criada com senha temporária
   (users/{uid}.senhaTemporaria == true). Antes de abrir qualquer tela, a
   pessoa define a senha que vai usar de verdade (digitada 2 vezes). Depois
   disso, entra sempre com ela. Aparece no lugar das telas (RouteGuards). */

const MIN_SENHA = 8;

// regras simples, mostradas como checklist enquanto digita
const REGRAS = [
  { teste: (s) => s.length >= MIN_SENHA, texto: `Pelo menos ${MIN_SENHA} caracteres` },
  { teste: (s) => /[A-Za-zÀ-ÿ]/.test(s) && /\d/.test(s), texto: "Letras e números" },
];

const mensagemErro = (code) => {
  switch (code) {
    case "auth/weak-password":
      return "Senha fraca. Use pelo menos 8 caracteres, com letras e números.";
    case "auth/requires-recent-login":
      return "Por segurança, entre de novo com a senha temporária e defina a senha logo em seguida.";
    case "auth/network-request-failed":
      return "Sem conexão. Verifique sua internet e tente de novo.";
    default:
      return "Não foi possível salvar a senha. Tente novamente.";
  }
};

const DefinirSenha = () => {
  const { user, perfil, logout } = useAuth();
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [precisaEntrarDeNovo, setPrecisaEntrarDeNovo] = useState(false);

  useEffect(() => {
    definirTituloAba("Defina sua senha");
  }, []);

  const regrasOk = REGRAS.every((r) => r.teste(senha));
  const iguais = senha.length > 0 && senha === confirma;

  const salvar = async (e) => {
    e.preventDefault();
    setErro("");
    if (!regrasOk) {
      setErro(`A senha precisa ter pelo menos ${MIN_SENHA} caracteres, com letras e números.`);
      return;
    }
    if (!iguais) {
      setErro("As duas senhas não são iguais. Digite de novo.");
      return;
    }
    try {
      setEnviando(true);
      await updatePassword(auth.currentUser, senha);
      // a partir daqui a senha temporária não vale mais
      await updateDoc(doc(db, "users", user.uid), { senhaTemporaria: false, senhaDefinidaEm: Timestamp.now() });
      // o perfil (onSnapshot) atualiza sozinho e o sistema abre
    } catch (err) {
      console.error("Erro ao definir a senha:", err);
      if (err.code === "auth/requires-recent-login") setPrecisaEntrarDeNovo(true);
      setErro(mensagemErro(err.code));
      setEnviando(false);
    }
  };

  const primeiroNome = String(perfil?.nome || "").trim().split(/\s+/)[0];

  return (
    <div className="auth-fullscreen">
      <form className="auth-card" onSubmit={salvar} noValidate>
        <div className="auth-brand">
          <img src={logo} alt="Operacional Luck" />
          <strong>{primeiroNome ? `Bem-vindo(a), ${primeiroNome}!` : "Primeiro acesso"}</strong>
          <span>
            Defina a sua senha. A senha temporária só vale para este primeiro acesso; daqui em diante você entra com a senha que
            escolher agora.
          </span>
        </div>

        <div className="auth-form">
          <input type="email" value={user?.email || ""} autoComplete="username" readOnly hidden />

          <div className="auth-field">
            <label htmlFor="definir-senha">Nova senha</label>
            <div className="auth-input-wrap">
              <input
                id="definir-senha"
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
                <Icon name={mostrar ? "eyeOff" : "eye"} size={16} />
              </button>
            </div>
            <ul className="auth-regras">
              {REGRAS.map((r) => (
                <li key={r.texto} className={r.teste(senha) ? "ok" : ""}>
                  <Icon name={r.teste(senha) ? "circleCheck" : "minus"} size={13} /> {r.texto}
                </li>
              ))}
            </ul>
          </div>

          <div className="auth-field">
            <label htmlFor="confirmar-senha">Repita a nova senha</label>
            <div className="auth-input-wrap">
              <input
                id="confirmar-senha"
                type={mostrar ? "text" : "password"}
                autoComplete="new-password"
                value={confirma}
                onChange={(e) => setConfirma(e.target.value)}
                disabled={enviando}
              />
            </div>
            {confirma && (
              <small className={`auth-hint ${iguais ? "auth-hint-ok" : "auth-hint-erro"}`}>
                {iguais ? "As senhas são iguais." : "As senhas ainda não são iguais."}
              </small>
            )}
          </div>

          {erro && <div className="auth-alert erro">{erro}</div>}

          {precisaEntrarDeNovo ? (
            <button type="button" className="auth-btn-primary" onClick={logout}>
              <Icon name="login" size={16} />
              Entrar de novo
            </button>
          ) : (
            <button type="submit" className="auth-btn-primary" disabled={enviando || !regrasOk || !iguais}>
              <Icon name="key" size={16} />
              {enviando ? "Salvando..." : "Confirmar senha"}
            </button>
          )}

          <button type="button" className="auth-link-btn" onClick={logout} disabled={enviando}>
            Sair
          </button>
        </div>
      </form>
    </div>
  );
};

export default DefinirSenha;
