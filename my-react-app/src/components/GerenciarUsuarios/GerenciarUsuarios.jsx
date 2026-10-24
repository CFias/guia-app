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
  deleteDoc,
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
  ROLE_LABELS,
} from "../../Context/permissions";
import { contarBloqueadas, ehGerencia } from "../../Context/acessos";
import { useRegiao } from "../../Context/regiaoContext";
import { ID_SEDE, SEDE } from "../../Services/Services/regiaoAtiva";
import { Link } from "react-router-dom";
import Icon from "../ui/Icon";
import { GuiaAvatar, Segmented } from "../ui";
import RegisterGuias from "../RegisterGuias/RegisterGuias";
import { prepararFotoGuia } from "../../Services/Utils/fotoGuia";
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
  guiaSemAcesso: "Guias sem acesso ao sistema",
};

// Filtro por grupo: gerência, operacional, comercial, guia ou desativadas
const grupoDaConta = (u) =>
  u.semAcesso ? "guiaSemAcesso" : u.ativo === false ? "desativadas" : u.role === ROLES.OPERACIONAL && u.gerencia === true ? "gerencia" : u.role;

// tipos de pessoa no cadastro (a ordem é a da tela)
const TIPOS_PESSOA = [
  { role: ROLES.GUIA, nome: "Guia", dica: "Ficha do guia (idiomas, passeios, motoguia). Acesso ao sistema é opcional.", icone: "flag" },
  { role: ROLES.OPERACIONAL, nome: "Operacional", dica: "Telas do operacional — a gerência escolhe quais em Acessos.", icone: "briefcase", soGerencia: true },
  { role: ROLES.ATENDIMENTO, nome: "Atendimento", dica: "Só o painel do aeroporto (recepção e embarque).", icone: "planeLanding" },
  { role: ROLES.COMERCIAL, nome: "Comercial", dica: "Só a Central de informações.", icone: "bookOpen" },
];

/* Foto (opcional) de quem não é guia: user_fotos/{uid} — mesmo formato da
   foto do guia (JPEG quadrado em data URL). A do guia continua em guide_fotos. */
const salvarFotoConta = (uid, foto) =>
  foto ? setDoc(doc(db, "user_fotos", uid), { uid, foto, atualizadoEm: Timestamp.now() }) : deleteDoc(doc(db, "user_fotos", uid));

const CampoFoto = ({ nome, foto, onChange, disabled, destaque = false }) => {
  const [erro, setErro] = useState("");
  const escolher = async (arquivo) => {
    if (!arquivo) return;
    setErro("");
    try {
      onChange(await prepararFotoGuia(arquivo));
    } catch (e) {
      setErro(e?.message?.startsWith("Escolha") ? e.message : "Não foi possível ler a imagem.");
    }
  };
  return (
    <div className={`usuarios-foto ${destaque ? "is-destaque" : ""}`}>
      <GuiaAvatar nome={nome || "?"} foto={foto} soFoto semLink tamanho={52} />
      <div>
        <strong>Foto {destaque ? "(recomendada)" : "(opcional)"}</strong>
        <small>{destaque ? "Com foto, a pessoa é reconhecida na hora nas telas." : "Aparece junto do nome nas listas."}</small>
        <span className="usuarios-foto__acoes">
          <label className={`usuarios-btn ${disabled ? "is-off" : ""}`}>
            <Icon name="image" size={14} /> {foto ? "Trocar" : "Adicionar"}
            <input type="file" accept="image/*" hidden disabled={disabled} onChange={(e) => escolher(e.target.files?.[0])} />
          </label>
          {foto && (
            <button type="button" className="usuarios-btn ghost" onClick={() => onChange("")} disabled={disabled}>
              Remover
            </button>
          )}
        </span>
        {erro && <small className="usuarios-foto__erro">{erro}</small>}
      </div>
    </div>
  );
};
const ORDEM_GRUPO = { gerencia: 0, [ROLES.OPERACIONAL]: 1, [ROLES.ATENDIMENTO]: 2, [ROLES.COMERCIAL]: 3, [ROLES.GUIA]: 4, guiaSemAcesso: 5, desativadas: 6 };
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

/* PESSOAS: guias e contas de acesso num cadastro só.
   podeContas: a conta pode criar/editar contas (Controle de acessos → usuarios)
   podeGuias:  a conta pode cadastrar guias (Controle de acessos → cadastros) */
const GerenciarUsuarios = ({ podeContas = true, podeGuias = true, tipoInicial }) => {
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
  const [tipo, setTipo] = useState(() => tipoInicial || (podeGuias ? ROLES.GUIA : ROLES.COMERCIAL));
  const [acessoGuia, setAcessoGuia] = useState(() => ({ ativo: false, email: "", senha: gerarSenha() }));
  const [fotoNova, setFotoNova] = useState("");
  const [fotosContas, setFotosContas] = useState({});
  const [darAcessoA, setDarAcessoA] = useState(null); // guia sem conta
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
      const [usersSnap, guidesSnap, fotosSnap] = await Promise.all([
        podeContas ? getDocs(collection(db, "users")) : Promise.resolve({ docs: [] }),
        getDocs(collection(db, "guides")),
        podeContas ? getDocs(collection(db, "user_fotos")).catch(() => ({ docs: [] })) : Promise.resolve({ docs: [] }),
      ]);
      setFotosContas(Object.fromEntries(fotosSnap.docs.map((d) => [d.id, d.data()?.foto || ""])));

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
  }, [podeContas]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const baseDoForm = souGerencia ? form.regiao : perfil?.regiao || ID_SEDE;

  const guiasVinculados = useMemo(() => {
    const mapa = new Map();
    usuarios.forEach((u) => u.guideId && mapa.set(u.guideId, u.id));
    return mapa;
  }, [usuarios]);

  // guias cadastrados que ainda não têm acesso ao sistema entram na lista
  const pessoas = useMemo(
    () => [
      ...usuarios,
      ...guias
        .filter((g) => !guiasVinculados.has(g.id))
        .map((g) => ({ id: `g_${g.id}`, nome: g.nome || "", email: "", role: ROLES.GUIA, semAcesso: true, guideId: g.id, guideName: g.nome, whatsapp: g.whatsapp || "" })),
    ],
    [usuarios, guias, guiasVinculados],
  );

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
    const c = { todos: 0, gerencia: 0, [ROLES.OPERACIONAL]: 0, [ROLES.ATENDIMENTO]: 0, [ROLES.COMERCIAL]: 0, [ROLES.GUIA]: 0, guiaSemAcesso: 0, guias: 0, desativadas: 0 };
    pessoas.filter((u) => passaBusca(u) && passaBase(u)).forEach((u) => {
      c.todos += 1;
      c[grupoDaConta(u)] = (c[grupoDaConta(u)] || 0) + 1;
      if (u.role === ROLES.GUIA && u.ativo !== false) c.guias += 1;
    });
    return c;
  }, [pessoas, passaBusca, passaBase]);

  const usuariosFiltrados = useMemo(
    () =>
      pessoas
        .filter((u) => passaBusca(u) && passaBase(u))
        .filter((u) => filtroRole === "todos" || (filtroRole === "guias" ? u.role === ROLES.GUIA && u.ativo !== false : grupoDaConta(u) === filtroRole))
        .sort(
          (a, b) =>
            ORDEM_GRUPO[grupoDaConta(a)] - ORDEM_GRUPO[grupoDaConta(b)] || (a.nome || "").localeCompare(b.nome || "", "pt-BR"),
        ),
    [pessoas, filtroRole, passaBusca, passaBase],
  );

  useEffect(() => {
    setQtdVisivel(ITENS_POR_PAGINA);
  }, [filtroRole, busca, filtroBase]);

  const usuariosVisiveis = usuariosFiltrados.slice(0, qtdVisivel);
  const restantes = usuariosFiltrados.length - usuariosVisiveis.length;

  const setCampo = (campo, valor) =>
    setForm((prev) => ({ ...prev, [campo]: valor }));

  /* ---------------- criar ---------------- */
  // cria o login (sem derrubar a sessão de quem está cadastrando) e o perfil
  const criarContaNoAuth = async ({ nome, email, senha, role, guia, regiao, foto }) => {
    const secondaryAuth = getSecondaryAuth();
    let cred = null;
    try {
      cred = await createUserWithEmailAndPassword(secondaryAuth, email, senha);
      await setDoc(doc(db, "users", cred.user.uid), {
        nome,
        email,
        role,
        ativo: true,
        ...(role === ROLES.GUIA && guia ? { guideId: guia.id, guideName: guia.nome } : {}),
        ...(souGerencia && TEM_BASE.includes(role) && regiao && regiao !== ID_SEDE ? { regiao } : {}),
        // primeiro acesso: a pessoa troca a senha temporária pela dela (DefinirSenha)
        senhaTemporaria: true,
        createdAt: Timestamp.now(),
        createdBy: usuarioLogado.uid,
      });
      if (foto) await salvarFotoConta(cred.user.uid, foto).catch((e) => console.error("Foto da conta:", e));
      return cred.user.uid;
    } catch (err) {
      console.error("Erro ao criar usuário:", err);
      // conta de login criada mas perfil não salvo: desfaz (senão o e-mail fica preso)
      if (cred?.user) await deleteUser(cred.user).catch(() => {});
      throw new Error(mensagemErroAuth(err.code));
    } finally {
      await signOut(secondaryAuth).catch(() => {});
    }
  };

  const validarLogin = (email, senha) => {
    if (!email) return "Informe o e-mail (será o login).";
    if (String(senha || "").length < 6) return "A senha temporária precisa ter pelo menos 6 caracteres.";
    return "";
  };

  const criarUsuario = async (e) => {
    e.preventDefault();
    setMsg(null);
    setCredenciais(null);
    const nome = form.nome.trim();
    const email = form.email.trim().toLowerCase();
    if (!nome) {
      setMsg({ tipo: "erro", texto: "Preencha o nome." });
      return;
    }
    const erro = validarLogin(email, form.senha);
    if (erro) {
      setMsg({ tipo: "erro", texto: erro });
      return;
    }
    try {
      setSalvando(true);
      await criarContaNoAuth({ nome, email, senha: form.senha, role: tipo, regiao: baseDoForm, foto: fotoNova });
      const base = TEM_BASE.includes(tipo) ? regiaoPorId(baseDoForm)?.nome || SEDE.nome : SEDE.nome;
      setCredenciais({ nome, email, senha: form.senha, base });
      setForm({ ...FORM_VAZIO, senha: gerarSenha() });
      setFotoNova("");
      await carregar();
    } catch (err) {
      setMsg({ tipo: "erro", texto: err.message });
    } finally {
      setSalvando(false);
    }
  };

  // guia novo com "Dar acesso ao sistema" marcado
  const validarAcessoDoGuia = () => (acessoGuia.ativo ? validarLogin(acessoGuia.email.trim(), acessoGuia.senha) : "");
  const depoisDeCadastrarGuia = async (guia) => {
    if (acessoGuia.ativo) {
      const email = acessoGuia.email.trim().toLowerCase();
      await criarContaNoAuth({ nome: guia.nome, email, senha: acessoGuia.senha, role: ROLES.GUIA, guia });
      setCredenciais({ nome: guia.nome, email, senha: acessoGuia.senha, base: SEDE.nome });
      setAcessoGuia({ ativo: false, email: "", senha: gerarSenha() });
      await carregar();
      return "\n\nO acesso ao sistema também foi criado — as credenciais estão no topo da tela.";
    }
    await carregar();
    return "";
  };

  // guia que já existia, sem conta: cria o acesso
  const darAcessoAoGuia = async ({ email, senha }) => {
    const g = darAcessoA;
    const erro = validarLogin(email.trim(), senha);
    if (erro) throw new Error(erro);
    const em = email.trim().toLowerCase();
    await criarContaNoAuth({ nome: g.nome, email: em, senha, role: ROLES.GUIA, guia: { id: g.guideId, nome: g.nome } });
    setCredenciais({ nome: g.nome, email: em, senha, base: SEDE.nome });
    setDarAcessoA(null);
    await carregar();
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
      if (dados.foto !== undefined) await salvarFotoConta(dados.id, dados.foto).catch((e) => console.error("Foto da conta:", e));

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
          Pessoas <Icon name="users" size={16} />
        </h2>
        <p>
          Guias e contas de acesso num cadastro só. Escolha quem você vai
          cadastrar; o guia pode ou não ter acesso ao sistema. Não existe
          cadastro aberto na tela de login.
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
        {/* ============ NOVA PESSOA ============ */}
        <div className="usuarios-card usuarios-nova">
          <h3>
            <Icon name="userPlus" size={16} /> Nova pessoa
          </h3>
          <div className="usuarios-tipos" role="radiogroup" aria-label="Quem você vai cadastrar">
            {TIPOS_PESSOA.filter((t) => (t.role === ROLES.GUIA ? podeGuias : podeContas && rolesPermitidos.includes(t.role) && (!t.soGerencia || souGerencia))).map((t) => (
              <button
                key={t.role}
                type="button"
                role="radio"
                aria-checked={tipo === t.role}
                className={`usuarios-tipo ${tipo === t.role ? "is-on" : ""}`}
                onClick={() => {
                  setTipo(t.role);
                  setMsg(null);
                }}
              >
                <Icon name={t.icone} size={16} />
                <b>{t.nome}</b>
                <small>{t.dica}</small>
              </button>
            ))}
          </div>

          {tipo === ROLES.GUIA ? (
            <RegisterGuias key="guia" embutido validarExtra={validarAcessoDoGuia} aoSalvar={depoisDeCadastrarGuia}>
              {podeContas && (
                <div className={`usuarios-acesso ${acessoGuia.ativo ? "is-on" : ""}`}>
                  <label className="usuarios-check">
                    <input type="checkbox" checked={acessoGuia.ativo} onChange={(e) => setAcessoGuia((x) => ({ ...x, ativo: e.target.checked }))} />
                    <span>
                      <b>Dar acesso ao sistema</b> — o guia entra para preencher a própria disponibilidade e os idiomas.
                    </span>
                  </label>
                  {acessoGuia.ativo && (
                    <div className="usuarios-acesso__campos">
                      <label className="usuarios-field">
                        <span>E-mail (será o login)</span>
                        <input type="email" value={acessoGuia.email} onChange={(e) => setAcessoGuia((x) => ({ ...x, email: e.target.value }))} autoComplete="off" />
                      </label>
                      <label className="usuarios-field">
                        <span>Senha temporária</span>
                        <div className="usuarios-senha-row">
                          <input type="text" value={acessoGuia.senha} onChange={(e) => setAcessoGuia((x) => ({ ...x, senha: e.target.value }))} autoComplete="off" />
                          <button type="button" className="usuarios-icon-btn" title="Gerar outra senha" onClick={() => setAcessoGuia((x) => ({ ...x, senha: gerarSenha() }))}>
                            <Icon name="refresh" size={16} />
                          </button>
                        </div>
                      </label>
                    </div>
                  )}
                </div>
              )}
            </RegisterGuias>
          ) : (
            <form className="usuarios-form" onSubmit={criarUsuario} autoComplete="off">
              <CampoFoto nome={form.nome} foto={fotoNova} onChange={setFotoNova} disabled={salvando} />

              <label className="usuarios-field">
                <span>Nome</span>
                <input type="text" value={form.nome} onChange={(e) => setCampo("nome", e.target.value)} disabled={salvando} />
              </label>

              <label className="usuarios-field">
                <span>E-mail (será o login)</span>
                <input type="email" value={form.email} onChange={(e) => setCampo("email", e.target.value)} disabled={salvando} autoComplete="off" />
              </label>

              <label className="usuarios-field">
                <span>Senha temporária</span>
                <div className="usuarios-senha-row">
                  <input type="text" value={form.senha} onChange={(e) => setCampo("senha", e.target.value)} disabled={salvando} autoComplete="off" />
                  <button type="button" className="usuarios-icon-btn" title="Gerar outra senha" onClick={() => setCampo("senha", gerarSenha())} disabled={salvando}>
                    <Icon name="refresh" size={16} />
                  </button>
                </div>
              </label>

              {mostrarRegiao && TEM_BASE.includes(tipo) && (
                <CampoRegiao
                  value={form.regiao}
                  onChange={(v) => setCampo("regiao", v)}
                  opcoes={opcoesRegiao.filter((r) => r.id === ID_SEDE || r.ativa)}
                  disabled={salvando}
                />
              )}

              {tipo === ROLES.ATENDIMENTO && (
                <small className="usuarios-hint">
                  Depois de criar, defina a função, o turno e a folga fixa da pessoa em Escala da equipe → Configurar escala → Equipe.
                </small>
              )}

              <button type="submit" className="usuarios-btn primary" disabled={salvando}>
                {salvando ? "Criando..." : `Criar acesso · ${ROLE_LABELS[tipo]}`}
              </button>
            </form>
          )}
        </div>

        {/* ============ LISTA ============ */}
        <div className="usuarios-card">
          <div className="usuarios-lista-topo">
            <h3>
              Pessoas cadastradas <span className="usuarios-total">{pessoas.length}</span>
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
                { value: "guias", label: "Guias", count: contagem.guias },
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
                <li className={`${u.ativo === false ? "inativo" : ""} ${u.semAcesso ? "sem-acesso" : ""}`}>
                  <div className="usuarios-item-info usuarios-item-com-foto">
                    <GuiaAvatar nome={u.nome} id={u.guideId || undefined} foto={u.guideId ? undefined : fotosContas[u.id] || ""} soFoto semLink tamanho={38} />
                    <div className="usuarios-item-txt">
                    <strong>
                      {u.nome}
                      {u.id === usuarioLogado.uid && (
                        <span className="usuarios-voce"> (você)</span>
                      )}
                    </strong>
                    {u.semAcesso ? (
                      <>
                        <span>{u.whatsapp ? `WhatsApp ${u.whatsapp}` : "Guia cadastrado"}</span>
                        <span className="usuarios-ultimo">Sem acesso ao sistema</span>
                      </>
                    ) : (
                      <>
                        <span>{u.email}</span>
                        <span className="usuarios-ultimo">{textoUltimoAcesso(u)}</span>
                        {u.role === ROLES.GUIA && u.guideName && u.guideName !== u.nome && <span className="usuarios-vinculo">Guia: {u.guideName}</span>}
                      </>
                    )}
                    </div>
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

                  {u.semAcesso ? (
                  <div className="usuarios-item-acoes">
                    <a className="usuarios-icon-btn" href={`/ver-como-guia/${u.guideId}`} target="_blank" rel="noopener noreferrer" title="Ver como o guia vê (nada é salvo)">
                      <Icon name="eye" size={16} />
                    </a>
                    {podeContas && (
                      <button type="button" className="usuarios-btn" onClick={() => setDarAcessoA(u)} title="Criar login para o guia preencher a disponibilidade">
                        <Icon name="key" size={14} /> Dar acesso
                      </button>
                    )}
                  </div>
                  ) : (
                  <div className="usuarios-item-acoes">
                    {u.role === ROLES.GUIA && u.guideId && (
                      <a className="usuarios-icon-btn" href={`/ver-como-guia/${u.guideId}`} target="_blank" rel="noopener noreferrer" title="Ver como o guia vê (nada é salvo)">
                        <Icon name="eye" size={16} />
                      </a>
                    )}
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
                  )}
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

      {darAcessoA && <DarAcessoModal guia={darAcessoA} onFechar={() => setDarAcessoA(null)} onCriar={darAcessoAoGuia} />}

      {editando && (
        <EditarUsuarioModal
          usuario={editando}
          fotoAtual={editando.guideId ? null : fotosContas[editando.id] || ""}
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

// guia sem conta → cria o login
const DarAcessoModal = ({ guia, onFechar, onCriar }) => {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState(gerarSenha);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setErro("");
    setSalvando(true);
    try {
      await onCriar({ email, senha });
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  };
  return (
    <div className="usuarios-modal-overlay" onClick={onFechar}>
      <form className="usuarios-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3>Dar acesso a {guia.nome}</h3>
        <p className="usuarios-hint">O guia entra no sistema para preencher a própria disponibilidade e os idiomas.</p>
        <label className="usuarios-field">
          <span>E-mail (será o login)</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" autoFocus />
        </label>
        <label className="usuarios-field">
          <span>Senha temporária</span>
          <div className="usuarios-senha-row">
            <input type="text" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="off" />
            <button type="button" className="usuarios-icon-btn" title="Gerar outra senha" onClick={() => setSenha(gerarSenha())}>
              <Icon name="refresh" size={16} />
            </button>
          </div>
        </label>
        {erro && <div className="usuarios-alert erro">{erro}</div>}
        <div className="usuarios-modal-acoes">
          <button type="button" className="usuarios-btn ghost" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" className="usuarios-btn primary" disabled={salvando}>
            {salvando ? "Criando..." : "Criar acesso"}
          </button>
        </div>
      </form>
    </div>
  );
};

const EditarUsuarioModal = ({
  usuario,
  fotoAtual = null,
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
  // foto: só de quem não é guia (a do guia fica na Lista de guias); undefined = não mexeu
  const [foto, setFoto] = useState(undefined);

  const set = (campo, valor) => setDados((p) => ({ ...p, [campo]: valor }));

  const submit = async (e) => {
    e.preventDefault();
    if (dados.role === ROLES.GUIA && !dados.guideId) {
      alert("Escolha qual guia essa conta representa.");
      return;
    }
    setSalvando(true);
    await onSalvar(fotoAtual !== null && foto !== undefined ? { ...dados, foto } : dados);
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

        {fotoAtual !== null && <CampoFoto nome={dados.nome} foto={foto === undefined ? fotoAtual : foto} onChange={setFoto} disabled={salvando} />}

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

