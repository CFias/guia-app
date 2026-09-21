import { useCallback, useEffect, useMemo, useState } from "react";
import { getApps, initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  signOut,
} from "firebase/auth";
import {
  Timestamp,
  collection,
  deleteField,
  doc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db, firebaseConfig } from "../../Services/Services/firebase";
import { enviarEmailRedefinicao } from "../../Services/Services/authEmail";
import { useAuth } from "../../Context/AuthContext";
import {
  ROLES,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
} from "../../Context/permissions";
import {
  AdminPanelSettingsRounded,
  AutorenewRounded,
  ContentCopyRounded,
  EditRounded,
  LockResetRounded,
  PersonAddRounded,
} from "@mui/icons-material";
import "./styles.css";

/* ---------------------------------------------------------
   Criar conta SEM derrubar a sessão do operacional:
   createUserWithEmailAndPassword() faz login automático na conta
   nova. Usando uma 2ª instância do app (com auth próprio), o login
   automático acontece lá e a sessão do operacional segue intacta.
   --------------------------------------------------------- */
const getSecondaryAuth = () => {
  const existente = getApps().find((a) => a.name === "secondary-auth");
  return getAuth(existente ?? initializeApp(firebaseConfig, "secondary-auth"));
};

const gerarSenha = () => {
  // Sem caracteres ambíguos (0/O, 1/l/I) — a senha vai ser passada por WhatsApp.
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => chars[n % chars.length]).join("");
};

const mensagemErroAuth = (code) => {
  switch (code) {
    case "auth/email-already-in-use":
      return "Já existe uma conta com esse e-mail.";
    case "auth/invalid-email":
      return "E-mail inválido.";
    case "auth/weak-password":
      return "Senha fraca. Use pelo menos 6 caracteres.";
    case "auth/network-request-failed":
      return "Sem conexão. Tente de novo.";
    case "permission-denied":
      return "Sem permissão no Firestore. Confira se o firestore.rules foi publicado.";
    default:
      return "Não foi possível concluir a operação. Tente novamente.";
  }
};

const FORM_VAZIO = {
  nome: "",
  email: "",
  senha: "",
  role: ROLES.GUIA,
  guideId: "",
};

const GerenciarUsuarios = () => {
  const { user: usuarioLogado } = useAuth();

  const [usuarios, setUsuarios] = useState([]);
  const [guias, setGuias] = useState([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState(() => ({
    ...FORM_VAZIO,
    senha: gerarSenha(),
  }));
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState(null); // { tipo: "ok" | "erro", texto }
  const [credenciais, setCredenciais] = useState(null); // mostrada 1x após criar
  const [copiado, setCopiado] = useState(false);

  const [editando, setEditando] = useState(null);
  const [filtroRole, setFiltroRole] = useState("todos");

  const carregar = useCallback(async () => {
    try {
      setLoading(true);
      const [usersSnap, guidesSnap] = await Promise.all([
        getDocs(collection(db, "users")),
        getDocs(collection(db, "guides")),
      ]);

      setUsuarios(
        usersSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR")),
      );
      setGuias(
        guidesSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((g) => g.ativo !== false)
          .sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR")),
      );
    } catch (err) {
      console.error("Erro ao carregar usuários:", err);
      setMsg({ tipo: "erro", texto: mensagemErroAuth(err.code) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const guiasVinculados = useMemo(() => {
    const mapa = new Map();
    usuarios.forEach((u) => u.guideId && mapa.set(u.guideId, u.id));
    return mapa;
  }, [usuarios]);

  const usuariosFiltrados = useMemo(
    () =>
      filtroRole === "todos"
        ? usuarios
        : usuarios.filter((u) => u.role === filtroRole),
    [usuarios, filtroRole],
  );

  const setCampo = (campo, valor) =>
    setForm((prev) => ({ ...prev, [campo]: valor }));

  /* ---------------- criar ---------------- */
  const criarUsuario = async (e) => {
    e.preventDefault();
    setMsg(null);
    setCredenciais(null);

    const nome = form.nome.trim();
    const email = form.email.trim().toLowerCase();

    if (!nome || !email) {
      setMsg({ tipo: "erro", texto: "Preencha nome e e-mail." });
      return;
    }
    if (form.senha.length < 6) {
      setMsg({
        tipo: "erro",
        texto: "A senha temporária precisa ter pelo menos 6 caracteres.",
      });
      return;
    }
    if (form.role === ROLES.GUIA && !form.guideId) {
      setMsg({
        tipo: "erro",
        texto: "Escolha qual guia essa conta vai representar.",
      });
      return;
    }

    const guia = guias.find((g) => g.id === form.guideId);
    const secondaryAuth = getSecondaryAuth();
    let cred = null;
    let criado = false;

    try {
      setSalvando(true);

      cred = await createUserWithEmailAndPassword(
        secondaryAuth,
        email,
        form.senha,
      );

      await setDoc(doc(db, "users", cred.user.uid), {
        nome,
        email,
        role: form.role,
        ativo: true,
        ...(form.role === ROLES.GUIA && guia
          ? { guideId: guia.id, guideName: guia.nome }
          : {}),
        createdAt: Timestamp.now(),
        createdBy: usuarioLogado.uid,
      });

      criado = true;
    } catch (err) {
      console.error("Erro ao criar usuário:", err);

      // Se a conta de login chegou a ser criada mas o perfil não foi salvo,
      // desfaz — senão sobra uma conta "órfã" que bloqueia o e-mail.
      if (cred?.user) await deleteUser(cred.user).catch(() => {});

      setMsg({ tipo: "erro", texto: mensagemErroAuth(err.code) });
    } finally {
      await signOut(secondaryAuth).catch(() => {});
      setSalvando(false);
    }

    if (criado) {
      setCredenciais({ nome, email, senha: form.senha });
      setForm({ ...FORM_VAZIO, senha: gerarSenha() });
      await carregar();
    }
  };

  const copiarCredenciais = async () => {
    if (!credenciais) return;
    const texto =
      `Acesso ao Operacional SSA\n` +
      `Endereço: ${window.location.origin}/login\n` +
      `E-mail: ${credenciais.email}\n` +
      `Senha temporária: ${credenciais.senha}`;
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      window.prompt("Copie as credenciais:", texto);
    }
  };

  /* ---------------- editar ---------------- */
  const salvarEdicao = async (dados) => {
    try {
      const nome = dados.nome.trim();
      if (!nome) {
        setMsg({ tipo: "erro", texto: "O nome não pode ficar vazio." });
        return false;
      }
      const guia = guias.find((g) => g.id === dados.guideId);

      await updateDoc(doc(db, "users", dados.id), {
        nome,
        role: dados.role,
        ativo: dados.ativo,
        ...(dados.role === ROLES.GUIA && guia
          ? { guideId: guia.id, guideName: guia.nome }
          : { guideId: deleteField(), guideName: deleteField() }),
        updatedAt: Timestamp.now(),
      });

      setMsg({ tipo: "ok", texto: "Usuário atualizado." });
      await carregar();
      return true;
    } catch (err) {
      console.error("Erro ao atualizar usuário:", err);
      setMsg({ tipo: "erro", texto: mensagemErroAuth(err.code) });
      return false;
    }
  };

  const enviarRedefinicao = async (u) => {
    try {
      await enviarEmailRedefinicao(u.email);
      setMsg({
        tipo: "ok",
        texto: `Link de redefinição enviado para ${u.email}.`,
      });
    } catch (err) {
      console.error("Erro ao enviar redefinição:", err);
      setMsg({ tipo: "erro", texto: mensagemErroAuth(err.code) });
    }
  };

  return (
    <div className="usuarios-page">
      <div className="usuarios-header">
        <h2>
          Usuários e acessos <AdminPanelSettingsRounded fontSize="small" />
        </h2>
        <p>
          Só o operacional cria contas. Escolha o nível de acesso de cada
          pessoa — não existe cadastro aberto na tela de login.
        </p>
      </div>

      {msg && <div className={`usuarios-alert ${msg.tipo}`}>{msg.texto}</div>}

      {credenciais && (
        <div className="usuarios-credenciais">
          <strong>Conta criada para {credenciais.nome}</strong>
          <p>
            Envie estes dados para a pessoa. Por segurança, a senha só aparece
            aqui agora — depois, use “Enviar link de nova senha”.
          </p>
          <code>
            {credenciais.email}
            <br />
            {credenciais.senha}
          </code>
          <div className="usuarios-credenciais-acoes">
            <button type="button" className="usuarios-btn" onClick={copiarCredenciais}>
              <ContentCopyRounded fontSize="small" />
              {copiado ? "Copiado!" : "Copiar mensagem"}
            </button>
            <button
              type="button"
              className="usuarios-btn ghost"
              onClick={() => setCredenciais(null)}
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      <div className="usuarios-grid">
        {/* ============ CRIAR ============ */}
        <form className="usuarios-card" onSubmit={criarUsuario} autoComplete="off">
          <h3>
            <PersonAddRounded fontSize="small" /> Nova conta
          </h3>

          <label className="usuarios-field">
            <span>Nome</span>
            <input
              type="text"
              value={form.nome}
              onChange={(e) => setCampo("nome", e.target.value)}
              disabled={salvando}
            />
          </label>

          <label className="usuarios-field">
            <span>E-mail (será o login)</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setCampo("email", e.target.value)}
              disabled={salvando}
              autoComplete="off"
            />
          </label>

          <label className="usuarios-field">
            <span>Senha temporária</span>
            <div className="usuarios-senha-row">
              <input
                type="text"
                value={form.senha}
                onChange={(e) => setCampo("senha", e.target.value)}
                disabled={salvando}
                autoComplete="off"
              />
              <button
                type="button"
                className="usuarios-icon-btn"
                title="Gerar outra senha"
                onClick={() => setCampo("senha", gerarSenha())}
                disabled={salvando}
              >
                <AutorenewRounded fontSize="small" />
              </button>
            </div>
          </label>

          <div className="usuarios-field">
            <span>Nível de acesso</span>
            <div className="usuarios-roles">
              {Object.values(ROLES).map((r) => (
                <label
                  key={r}
                  className={`usuarios-role-option ${form.role === r ? "ativo" : ""}`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={r}
                    checked={form.role === r}
                    onChange={() => setCampo("role", r)}
                    disabled={salvando}
                  />
                  <strong>{ROLE_LABELS[r]}</strong>
                  <small>{ROLE_DESCRIPTIONS[r]}</small>
                </label>
              ))}
            </div>
          </div>

          {form.role === ROLES.GUIA && (
            <label className="usuarios-field">
              <span>Guia vinculado</span>
              <select
                value={form.guideId}
                onChange={(e) => setCampo("guideId", e.target.value)}
                disabled={salvando}
              >
                <option value="">Selecionar guia</option>
                {guias.map((g) => (
                  <option
                    key={g.id}
                    value={g.id}
                    disabled={guiasVinculados.has(g.id)}
                  >
                    {g.nome}
                    {guiasVinculados.has(g.id) ? " (já tem acesso)" : ""}
                  </option>
                ))}
              </select>
              <small className="usuarios-hint">
                A disponibilidade que a pessoa preencher é gravada neste guia.
                O guia precisa estar em “Cadastrar Guias”.
              </small>
            </label>
          )}

          <button type="submit" className="usuarios-btn primary" disabled={salvando}>
            {salvando ? "Criando..." : "Criar conta"}
          </button>
        </form>

        {/* ============ LISTA ============ */}
        <div className="usuarios-card">
          <div className="usuarios-lista-topo">
            <h3>Contas cadastradas</h3>
            <select
              value={filtroRole}
              onChange={(e) => setFiltroRole(e.target.value)}
              aria-label="Filtrar por nível"
            >
              <option value="todos">Todos os níveis</option>
              {Object.values(ROLES).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <p className="usuarios-vazio">Carregando...</p>
          ) : usuariosFiltrados.length === 0 ? (
            <p className="usuarios-vazio">Nenhuma conta por aqui.</p>
          ) : (
            <ul className="usuarios-lista">
              {usuariosFiltrados.map((u) => (
                <li key={u.id} className={u.ativo === false ? "inativo" : ""}>
                  <div className="usuarios-item-info">
                    <strong>
                      {u.nome}
                      {u.id === usuarioLogado.uid && (
                        <span className="usuarios-voce"> (você)</span>
                      )}
                    </strong>
                    <span>{u.email}</span>
                    {u.role === ROLES.GUIA && (
                      <span className="usuarios-vinculo">
                        Guia: {u.guideName || "—"}
                      </span>
                    )}
                  </div>

                  <div className="usuarios-item-tags">
                    <span className={`usuarios-badge role-${u.role}`}>
                      {ROLE_LABELS[u.role] || u.role}
                    </span>
                    {u.ativo === false && (
                      <span className="usuarios-badge desativado">Desativado</span>
                    )}
                  </div>

                  <div className="usuarios-item-acoes">
                    <button
                      type="button"
                      className="usuarios-icon-btn"
                      title="Enviar link de nova senha"
                      onClick={() => enviarRedefinicao(u)}
                    >
                      <LockResetRounded fontSize="small" />
                    </button>
                    <button
                      type="button"
                      className="usuarios-icon-btn"
                      title="Editar"
                      onClick={() => {
                        setMsg(null);
                        setEditando(u);
                      }}
                    >
                      <EditRounded fontSize="small" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {editando && (
        <EditarUsuarioModal
          usuario={editando}
          guias={guias}
          guiasVinculados={guiasVinculados}
          ehVoce={editando.id === usuarioLogado.uid}
          onFechar={() => setEditando(null)}
          onSalvar={async (dados) => {
            const ok = await salvarEdicao(dados);
            if (ok) setEditando(null);
          }}
        />
      )}
    </div>
  );
};

const EditarUsuarioModal = ({
  usuario,
  guias,
  guiasVinculados,
  ehVoce,
  onFechar,
  onSalvar,
}) => {
  const [dados, setDados] = useState({
    id: usuario.id,
    nome: usuario.nome || "",
    role: usuario.role || ROLES.GUIA,
    ativo: usuario.ativo !== false,
    guideId: usuario.guideId || "",
  });
  const [salvando, setSalvando] = useState(false);

  const set = (campo, valor) => setDados((p) => ({ ...p, [campo]: valor }));

  const submit = async (e) => {
    e.preventDefault();
    if (dados.role === ROLES.GUIA && !dados.guideId) {
      alert("Escolha qual guia essa conta representa.");
      return;
    }
    setSalvando(true);
    await onSalvar(dados);
    setSalvando(false);
  };

  return (
    <div className="usuarios-modal-overlay" onClick={onFechar}>
      <form
        className="usuarios-modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h3>Editar acesso</h3>
        <p className="usuarios-hint">{usuario.email}</p>

        <label className="usuarios-field">
          <span>Nome</span>
          <input
            type="text"
            value={dados.nome}
            onChange={(e) => set("nome", e.target.value)}
          />
        </label>

        <label className="usuarios-field">
          <span>Nível de acesso</span>
          <select
            value={dados.role}
            onChange={(e) => set("role", e.target.value)}
            disabled={ehVoce}
          >
            {Object.values(ROLES).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>

        {dados.role === ROLES.GUIA && (
          <label className="usuarios-field">
            <span>Guia vinculado</span>
            <select
              value={dados.guideId}
              onChange={(e) => set("guideId", e.target.value)}
            >
              <option value="">Selecionar guia</option>
              {guias.map((g) => {
                const donoAtual = guiasVinculados.get(g.id);
                const ocupado = donoAtual && donoAtual !== usuario.id;
                return (
                  <option key={g.id} value={g.id} disabled={ocupado}>
                    {g.nome}
                    {ocupado ? " (já tem acesso)" : ""}
                  </option>
                );
              })}
            </select>
          </label>
        )}

        <label className="usuarios-check">
          <input
            type="checkbox"
            checked={dados.ativo}
            onChange={(e) => set("ativo", e.target.checked)}
            disabled={ehVoce}
          />
          <span>Conta ativa (desmarque para bloquear o acesso)</span>
        </label>

        {ehVoce && (
          <small className="usuarios-hint">
            Você não pode mudar o próprio nível nem desativar a própria conta —
            evita ficar sem nenhum operacional.
          </small>
        )}

        <div className="usuarios-modal-acoes">
          <button type="button" className="usuarios-btn ghost" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" className="usuarios-btn primary" disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default GerenciarUsuarios;
