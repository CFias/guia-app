import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
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
import { contarBloqueadas, ehGerencia } from "../../Context/acessos";
import { useRegiao } from "../../Context/regiaoContext";
import { ID_SEDE, SEDE } from "../../Services/Services/regiaoAtiva";
import { Link } from "react-router-dom";
import Icon from "../ui/Icon";
import { Segmented } from "../ui";
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

const semAcento = (t = "") =>
  String(t)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const ROTULO_GRUPO = {
  gerencia: "Gerência",
  [ROLES.OPERACIONAL]: ROLE_LABELS[ROLES.OPERACIONAL],
  [ROLES.COMERCIAL]: ROLE_LABELS[ROLES.COMERCIAL],
  [ROLES.GUIA]: ROLE_LABELS[ROLES.GUIA],
  [ROLES.ATENDIMENTO]: "Atendimento",
  desativadas: "Desativadas",
};

// Filtro por grupo: gerência, operacional, comercial, guia ou desativadas
const grupoDaConta = (u) =>
  u.ativo === false ? "desativadas" : u.role === ROLES.OPERACIONAL && u.gerencia === true ? "gerencia" : u.role;
const ORDEM_GRUPO = { gerencia: 0, [ROLES.OPERACIONAL]: 1, [ROLES.ATENDIMENTO]: 2, [ROLES.COMERCIAL]: 3, [ROLES.GUIA]: 4, desativadas: 5 };
// contas que pertencem a uma base (Operacional e Atendimento)
const TEM_BASE = [ROLES.OPERACIONAL, ROLES.ATENDIMENTO];

// "Último acesso: hoje 14:32" / "Nunca entrou"
const paraData = (v) => (v?.toDate ? v.toDate() : v ? new Date(v) : null);
const textoUltimoAcesso = (u) => {
  const d = paraData(u.ultimoAcesso) || paraData(u.ultimoLogin);
  if (!d) return u.senhaTemporaria ? "Nunca entrou" : "Último acesso: sem registro";
  const min = (Date.now() - d.getTime()) / 60000;
  if (min < 6) return "Usando agora";
  const hoje = new Date().toDateString() === d.toDateString();
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `Último acesso: ${hoje ? `hoje ${hora}` : `${d.toLocaleDateString("pt-BR")} ${hora}`}`;
};

const FORM_VAZIO = {
  nome: "",
  email: "",
  senha: "",
  role: ROLES.GUIA,
  guideId: "",
  regiao: ID_SEDE,
};

/* Campo "Base" (região) das contas do Operacional — só a gerência escolhe.
   Salvador é a sede (tudo); as outras bases vêm de Gestão → Regiões. */
const CampoRegiao = ({ value, onChange, opcoes, disabled }) => (
  <label className="usuarios-field">
    <span>Base (região)</span>
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      {opcoes.map((r) => (
        <option key={r.id} value={r.id}>
          {r.nome} ({r.sigla}){r.id === ID_SEDE ? " · sede, todas as telas" : r.ativa ? "" : " · desativada"}
        </option>
      ))}
    </select>
    <small className="usuarios-hint">
      A conta só vê os dados do Phoenix dessa base e as telas liberadas para ela. <Link to="/regioes">Ver regiões</Link>
    </small>
  </label>
);

const GerenciarUsuarios = () => {
  const { user: usuarioLogado, perfil } = useAuth();
  // Contas do Operacional (e a gerência) só a gerência cria ou altera — a
  // regra também está no firestore.rules. Os demais criam/editam comercial e guia.
  const souGerencia = ehGerencia(perfil);
  const rolesPermitidos = souGerencia ? Object.values(ROLES) : [ROLES.COMERCIAL, ROLES.GUIA, ROLES.ATENDIMENTO];
  const podeEditar = (u) => souGerencia || (u.role !== ROLES.OPERACIONAL && !u.gerencia);

  const { regioes } = useRegiao();
  const opcoesRegiao = useMemo(() => [SEDE, ...regioes], [regioes]);
  const mostrarRegiao = souGerencia && regioes.length > 0;
  const regiaoPorId = (id) => opcoesRegiao.find((r) => r.id === (id || ID_SEDE));

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
  const [filtroBase, setFiltroBase] = useState("todas");
  const [busca, setBusca] = useState("");

  // Lista cresce aos poucos ("carregar mais") em vez de mostrar tudo de uma
  // vez. Volta ao tamanho inicial sempre que o filtro muda.
  const ITENS_POR_PAGINA = 8;
  const [qtdVisivel, setQtdVisivel] = useState(ITENS_POR_PAGINA);

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

  const baseDoForm = souGerencia ? form.regiao : perfil?.regiao || ID_SEDE;

  const guiasVinculados = useMemo(() => {
    const mapa = new Map();
    usuarios.forEach((u) => u.guideId && mapa.set(u.guideId, u.id));
    return mapa;
  }, [usuarios]);

  const passaBusca = useCallback(
    (u) => {
      const t = semAcento(busca.trim());
      if (!t) return true;
      return semAcento(`${u.nome} ${u.email} ${u.guideName || ""}`).includes(t);
    },
    [busca],
  );
  const passaBase = useCallback(
    (u) => filtroBase === "todas" || (TEM_BASE.includes(u.role) && (u.regiao || ID_SEDE) === filtroBase),
    [filtroBase],
  );
  // contagem de cada grupo já com a busca e a base aplicadas
  const contagem = useMemo(() => {
    const c = { todos: 0, gerencia: 0, [ROLES.OPERACIONAL]: 0, [ROLES.ATENDIMENTO]: 0, [ROLES.COMERCIAL]: 0, [ROLES.GUIA]: 0, desativadas: 0 };
    usuarios.filter((u) => passaBusca(u) && passaBase(u)).forEach((u) => {
      c.todos += 1;
      c[grupoDaConta(u)] = (c[grupoDaConta(u)] || 0) + 1;
    });
    return c;
  }, [usuarios, passaBusca, passaBase]);

  const usuariosFiltrados = useMemo(
    () =>
      usuarios
        .filter((u) => passaBusca(u) && passaBase(u))
        .filter((u) => filtroRole === "todos" || grupoDaConta(u) === filtroRole)
        .sort(
          (a, b) =>
            ORDEM_GRUPO[grupoDaConta(a)] - ORDEM_GRUPO[grupoDaConta(b)] || (a.nome || "").localeCompare(b.nome || "", "pt-BR"),
        ),
    [usuarios, filtroRole, passaBusca, passaBase],
  );

  useEffect(() => {
    setQtdVisivel(ITENS_POR_PAGINA);
  }, [filtroRole, busca, filtroBase]);

  const usuariosVisiveis = usuariosFiltrados.slice(0, qtdVisivel);
  const restantes = usuariosFiltrados.length - usuariosVisiveis.length;

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
        ...(souGerencia && TEM_BASE.includes(form.role) && form.regiao && form.regiao !== ID_SEDE
          ? { regiao: form.regiao }
          : {}),
        // primeiro acesso: a pessoa troca a senha temporária pela dela (DefinirSenha)
        senhaTemporaria: true,
        createdAt: Timestamp.now(),
        createdBy: usuarioLogado.uid,
      });

      criado = true;
    } catch (err) {
      console.error("Erro ao criar usuário:", err);

      // Se a conta de login chegou a ser criada mas o perfil não foi salvo,
      // desfaz — senão sobra uma conta "órfã" que bloqueia o e-mail.
      if (cred?.user) await deleteUser(cred.user).catch(() => { });

      setMsg({ tipo: "erro", texto: mensagemErroAuth(err.code) });
    } finally {
      await signOut(secondaryAuth).catch(() => { });
      setSalvando(false);
    }

    if (criado) {
      const base = TEM_BASE.includes(form.role) ? regiaoPorId(baseDoForm)?.nome || SEDE.nome : SEDE.nome;
      setCredenciais({ nome, email, senha: form.senha, base });
      setForm({ ...FORM_VAZIO, senha: gerarSenha() });
      await carregar();
    }
  };

  const copiarCredenciais = async () => {
    if (!credenciais) return;
    const texto =
      `Acesso ao Operacional Luck · base ${credenciais.base || SEDE.nome}\n` +
      `Endereço: ${window.location.origin}/login\n` +
      `E-mail: ${credenciais.email}\n` +
      `Senha temporária: ${credenciais.senha}\n` +
      `No primeiro acesso, o sistema pede para você criar a sua senha.`;
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
        // quem vê o Balanço de uso: só a gerência marca
        ...(souGerencia ? { verBalanco: !!dados.verBalanco } : {}),
        // base: só a gerência mexe (a regra do banco não deixa os demais)
        ...(souGerencia
          ? { regiao: TEM_BASE.includes(dados.role) && dados.regiao && dados.regiao !== ID_SEDE ? dados.regiao : deleteField() }
          : {}),
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
          Usuários e acessos <Icon name="shield" size={16} />
        </h2>
        <p>
          Só o operacional cria contas. Escolha o nível de acesso de cada
          pessoa — não existe cadastro aberto na tela de login.
          {souGerencia ? (
            <>
              {" "}
              As telas que cada conta do Operacional vê ficam em <Link to="/acessos">Controle de acessos</Link>.
            </>
          ) : (
            <> Contas do Operacional só a gerência cria e altera.</>
          )}
        </p>
      </div>

      {msg && <div className={`usuarios-alert ${msg.tipo}`}>{msg.texto}</div>}

      {credenciais && (
        <div className="usuarios-credenciais">
          <strong>Conta criada para {credenciais.nome}</strong>
          <p>
            Envie estes dados para a pessoa. No primeiro acesso, o sistema pede
            para ela criar a própria senha (digitada duas vezes); a temporária
            deixa de valer. Por segurança, a senha só aparece aqui agora.
          </p>
          <code>
            {credenciais.email}
            <br />
            {credenciais.senha}
          </code>
          <div className="usuarios-credenciais-acoes">
            <button type="button" className="usuarios-btn" onClick={copiarCredenciais}>
              <Icon name="copy" size={16} />
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
            <Icon name="userPlus" size={16} /> Nova conta
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
                <Icon name="refresh" size={16} />
              </button>
            </div>
          </label>

          <div className="usuarios-field">
            <span>Nível de acesso</span>
            <div className="usuarios-roles">
              {rolesPermitidos.map((r) => (
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

          {mostrarRegiao && TEM_BASE.includes(form.role) && (
            <CampoRegiao
              value={form.regiao}
              onChange={(v) => setCampo("regiao", v)}
              opcoes={opcoesRegiao.filter((r) => r.id === ID_SEDE || r.ativa)}
              disabled={salvando}
            />
          )}

          {form.role === ROLES.ATENDIMENTO && (
            <small className="usuarios-hint">
              Depois de criar, defina a função, o turno e a folga fixa da pessoa em Demanda por turno → Turnos e equipe → Contas de atendimento.
            </small>
          )}

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
            <h3>
              Contas cadastradas <span className="usuarios-total">{usuarios.length}</span>
            </h3>
            {mostrarRegiao && (
              <select value={filtroBase} onChange={(e) => setFiltroBase(e.target.value)} aria-label="Filtrar por base">
                <option value="todas">Todas as bases</option>
                {opcoesRegiao.map((r) => (
                  <option key={r.id} value={r.id}>
                    Base {r.nome}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="usuarios-filtros">
            <label className="usuarios-busca">
              <Icon name="search" size={15} />
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome, e-mail ou guia"
                aria-label="Buscar conta"
              />
              {busca && (
                <button type="button" onClick={() => setBusca("")} aria-label="Limpar busca" title="Limpar busca">
                  <Icon name="x" size={14} />
                </button>
              )}
            </label>
            <Segmented
              size="sm"
              value={filtroRole}
              onChange={setFiltroRole}
              ariaLabel="Filtrar por nível"
              options={[
                { value: "todos", label: "Todos", count: contagem.todos },
                { value: "gerencia", label: "Gerência", count: contagem.gerencia },
                { value: ROLES.OPERACIONAL, label: ROLE_LABELS[ROLES.OPERACIONAL], count: contagem[ROLES.OPERACIONAL] },
                ...(contagem[ROLES.ATENDIMENTO] || filtroRole === ROLES.ATENDIMENTO
                  ? [{ value: ROLES.ATENDIMENTO, label: "Atendimento", count: contagem[ROLES.ATENDIMENTO] }]
                  : []),
                { value: ROLES.COMERCIAL, label: ROLE_LABELS[ROLES.COMERCIAL], count: contagem[ROLES.COMERCIAL] },
                { value: ROLES.GUIA, label: ROLE_LABELS[ROLES.GUIA], count: contagem[ROLES.GUIA] },
                { value: "desativadas", label: "Desativadas", count: contagem.desativadas },
              ]}
            />
          </div>

          {loading ? (
            <p className="usuarios-vazio">Carregando...</p>
          ) : usuariosFiltrados.length === 0 ? (
            <p className="usuarios-vazio">
              {busca.trim() ? `Nenhuma conta com “${busca.trim()}”.` : "Nenhuma conta por aqui."}
              {(busca.trim() || filtroRole !== "todos" || filtroBase !== "todas") && (
                <>
                  {" "}
                  <button
                    type="button"
                    className="usuarios-limpar"
                    onClick={() => {
                      setBusca("");
                      setFiltroRole("todos");
                      setFiltroBase("todas");
                    }}
                  >
                    Limpar filtros
                  </button>
                </>
              )}
            </p>
          ) : (
            <ul className="usuarios-lista">
              {usuariosVisiveis.map((u, i) => (
                <Fragment key={u.id}>
                  {filtroRole === "todos" && (i === 0 || grupoDaConta(usuariosVisiveis[i - 1]) !== grupoDaConta(u)) && (
                    <li className="usuarios-grupo" aria-hidden="true">
                      {ROTULO_GRUPO[grupoDaConta(u)]} <span>{contagem[grupoDaConta(u)]}</span>
                    </li>
                  )}
                  <li className={u.ativo === false ? "inativo" : ""}>
                    <div className="usuarios-item-info">
                      <strong>
                        {u.nome}
                        {u.id === usuarioLogado.uid && (
                          <span className="usuarios-voce"> (você)</span>
                        )}
                      </strong>
                      <span>{u.email}</span>
                      <span className="usuarios-ultimo">{textoUltimoAcesso(u)}</span>
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
                      {u.gerencia === true && u.role === ROLES.OPERACIONAL && (
                        <span className="usuarios-badge gerencia">Gerência</span>
                      )}
                      {TEM_BASE.includes(u.role) && u.regiao && u.regiao !== ID_SEDE && (
                        <span className="usuarios-badge regiao" title={`Base ${regiaoPorId(u.regiao)?.nome || u.regiao}`}>
                          {regiaoPorId(u.regiao)?.sigla || u.regiao.toUpperCase()}
                        </span>
                      )}
                      {u.role === ROLES.OPERACIONAL && !u.gerencia && contarBloqueadas(u.acessos) > 0 && (
                        <span className="usuarios-badge restrito" title="Telas bloqueadas em Controle de acessos">
                          {contarBloqueadas(u.acessos)} tela(s) bloqueada(s)
                        </span>
                      )}
                      {u.ativo === false && (
                        <span className="usuarios-badge desativado">Desativado</span>
                      )}
                      {u.senhaTemporaria === true && u.ativo !== false && (
                        <span className="usuarios-badge pendente" title="Ainda não entrou para criar a própria senha">
                          1º acesso pendente
                        </span>
                      )}
                      {u.verBalanco === true && !u.gerencia && (
                        <span className="usuarios-badge balanco" title="Pode ver o Balanço de uso">
                          Vê o balanço
                        </span>
                      )}
                    </div>

                    <div className="usuarios-item-acoes">
                      <button
                        type="button"
                        className="usuarios-icon-btn"
                        title="Enviar link de nova senha"
                        onClick={() => enviarRedefinicao(u)}
                      >
                        <Icon name="key" size={16} />
                      </button>
                      <button
                        type="button"
                        className="usuarios-icon-btn"
                        title={podeEditar(u) ? "Editar" : "Só a gerência altera contas do Operacional"}
                        disabled={!podeEditar(u)}
                        onClick={() => {
                          setMsg(null);
                          setEditando(u);
                        }}
                      >
                        <Icon name="pencil" size={16} />
                      </button>
                    </div>
                  </li>
                </Fragment>
              ))}
            </ul>
          )}

          {!loading && restantes > 0 && (
            <button
              type="button"
              className="usuarios-btn ghost usuarios-carregar-mais"
              onClick={() =>
                setQtdVisivel((v) => v + ITENS_POR_PAGINA)
              }
            >
              <Icon name="chevronDown" size={16} />
              Carregar mais ({restantes} restante{restantes === 1 ? "" : "s"})
            </button>
          )}
        </div>
      </div>

      {editando && (
        <EditarUsuarioModal
          usuario={editando}
          guias={guias}
          guiasVinculados={guiasVinculados}
          ehVoce={editando.id === usuarioLogado.uid}
          rolesPermitidos={rolesPermitidos}
          opcoesRegiao={mostrarRegiao ? opcoesRegiao : null}
          podeMarcarBalanco={souGerencia}
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
  rolesPermitidos = Object.values(ROLES),
  opcoesRegiao = null,
  podeMarcarBalanco = false,
  onFechar,
  onSalvar,
}) => {
  const [dados, setDados] = useState({
    id: usuario.id,
    nome: usuario.nome || "",
    role: usuario.role || ROLES.GUIA,
    ativo: usuario.ativo !== false,
    guideId: usuario.guideId || "",
    regiao: usuario.regiao || ID_SEDE,
    verBalanco: usuario.verBalanco === true,
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
            {rolesPermitidos.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>

        {opcoesRegiao && TEM_BASE.includes(dados.role) && !usuario.gerencia && (
          <CampoRegiao
            value={dados.regiao}
            onChange={(v) => set("regiao", v)}
            opcoes={opcoesRegiao.filter((r) => r.id === ID_SEDE || r.ativa || r.id === dados.regiao)}
            disabled={ehVoce}
          />
        )}

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

        {podeMarcarBalanco && !usuario.gerencia && dados.role !== ROLES.GUIA && (
          <label className="usuarios-check">
            <input type="checkbox" checked={dados.verBalanco} onChange={(e) => set("verBalanco", e.target.checked)} />
            <span>Pode ver o Balanço de uso (quem usa, impressões e avaliações)</span>
          </label>
        )}

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

