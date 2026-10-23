import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, EmptyState, Icon, PageHeader, SearchInput, useToast } from "../ui";
import { useAuth } from "../../Context/AuthContext";
import { ROLES, ROLE_LABELS } from "../../Context/permissions";
import { AREAS, GRUPOS_ACESSO, contarBloqueadas, ehGerencia, liberadaNoMapa, telaNaRegiao } from "../../Context/acessos";
import { useRegiao } from "../../Context/regiaoContext";
import { ID_SEDE, SEDE } from "../../Services/Services/regiaoAtiva";
import { controleAtivado, listarContas, salvarAcessosConta } from "../../Services/Services/acessosRepository";
import "./acessos.css";

/* =========================================================
   CONTROLE DE ACESSOS (só a gerência)
   Escolhe a conta e marca, tela por tela do menu, se pode ou não pode.
   A gerência (supervisor, coordenação, gerente geral) vê tudo e é quem
   mexe aqui. As regras de segurança do banco seguem a mesma marcação.
   ========================================================= */

const ORDEM_NIVEL = { gerencia: 0, [ROLES.OPERACIONAL]: 1, [ROLES.ATENDIMENTO]: 2, [ROLES.COMERCIAL]: 3, [ROLES.GUIA]: 4 };
const nivelDaConta = (u) => (u.role === ROLES.OPERACIONAL && u.gerencia === true ? "gerencia" : u.role);
const rotuloNivel = (n) => (n === "gerencia" ? "Gerência" : ROLE_LABELS[n] || n);

const dataHora = (ts) => {
  const d = ts?.toDate ? ts.toDate() : null;
  return d ? `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "";
};

const PodeNaoPode = ({ valor, onChange, disabled, rotulo }) => (
  <div className="acs-pnp" role="radiogroup" aria-label={rotulo}>
    <button type="button" role="radio" aria-checked={valor} className={valor ? "is-pode" : ""} onClick={() => onChange(true)} disabled={disabled}>
      <Icon name="check" size={13} /> Pode
    </button>
    <button type="button" role="radio" aria-checked={!valor} className={!valor ? "is-naopode" : ""} onClick={() => onChange(false)} disabled={disabled}>
      <Icon name="x" size={13} /> Não pode
    </button>
  </div>
);


const ControleAcessos = () => {
  const { user, perfil, role } = useAuth();
  const { mostrarToast } = useToast();
  const souGerencia = ehGerencia(perfil);
  const { regioes } = useRegiao();
  // base (região) da conta: fora de Salvador só existem as telas liberadas para a base
  const baseDaConta = (c) => {
    if (!c?.regiao || c.regiao === ID_SEDE || c.gerencia === true) return SEDE;
    return regioes.find((r) => r.id === c.regiao) || { id: c.regiao, nome: c.regiao.toUpperCase(), sigla: c.regiao.toUpperCase(), telas: [] };
  };

  const [ativo, setAtivo] = useState(null); // null = carregando
  const [contas, setContas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [selId, setSelId] = useState(null);
  const [rascunho, setRascunho] = useState(null); // { gerencia, acessos }
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setErro("");
    setCarregando(true);
    try {
      const ok = await controleAtivado();
      setAtivo(ok);
      if (souGerencia) setContas(await listarContas());
    } catch (e) {
      console.error(e);
      setErro("Não foi possível carregar as contas. Confira se o firestore.rules novo foi publicado.");
    } finally {
      setCarregando(false);
    }
  }, [souGerencia]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const selecionada = contas.find((c) => c.id === selId) || null;

  const escolher = (c) => {
    setSelId(c.id);
    setRascunho({ gerencia: c.gerencia === true, acessos: { ...(c.acessos || {}) } });
  };

  const sujo = useMemo(() => {
    if (!selecionada || !rascunho) return false;
    if ((selecionada.gerencia === true) !== rascunho.gerencia) return true;
    return AREAS.some((a) => liberadaNoMapa(selecionada.acessos, a.chave) !== liberadaNoMapa(rascunho.acessos, a.chave));
  }, [selecionada, rascunho]);

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return contas
      .filter((c) => !t || `${c.nome} ${c.email}`.toLowerCase().includes(t))
      .sort((a, b) => ORDEM_NIVEL[nivelDaConta(a)] - ORDEM_NIVEL[nivelDaConta(b)] || (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
  }, [contas, busca]);

  const grupos = useMemo(() => {
    const m = new Map();
    filtradas.forEach((c) => {
      const n = nivelDaConta(c);
      if (!m.has(n)) m.set(n, []);
      m.get(n).push(c);
    });
    return [...m.entries()];
  }, [filtradas]);

  const marcar = (chave, pode) => setRascunho((r) => ({ ...r, acessos: { ...r.acessos, [chave]: pode ? true : false } }));
  const marcarTodas = (pode) => setRascunho((r) => ({ ...r, acessos: Object.fromEntries(AREAS.map((a) => [a.chave, pode])) }));
  const copiarDe = (id) => {
    const origem = contas.find((c) => c.id === id);
    if (origem) setRascunho((r) => ({ ...r, acessos: { ...(origem.acessos || {}) } }));
  };

  const salvar = async () => {
    if (!selecionada || !rascunho) return;
    setSalvando(true);
    try {
      await salvarAcessosConta(selecionada.id, rascunho, { uid: user.uid, nome: perfil?.nome });
      mostrarToast(`Acessos de ${selecionada.nome} salvos`);
      const novas = await listarContas();
      setContas(novas);
      const atual = novas.find((c) => c.id === selecionada.id);
      if (atual) setRascunho({ gerencia: atual.gerencia === true, acessos: { ...(atual.acessos || {}) } });
    } catch (e) {
      console.error(e);
      mostrarToast("Não foi possível salvar. Confira a conexão e o firestore.rules.");
    } finally {
      setSalvando(false);
    }
  };

  // ---------- quem não é da gerência ----------
  if (role !== ROLES.OPERACIONAL) return null;
  if (!souGerencia) {
    return (
      <div className="acs ui-page">
        <PageHeader title="Controle de acessos" description="Quais telas cada conta do Operacional pode abrir." />
        {/* Ninguém vira gerência por aqui: quem define a gerência é outra conta
            da gerência (nesta tela) ou o administrador, no Firebase. */}
        {carregando || ativo === null ? (
          <EmptyState icon="loader" title="Carregando…" />
        ) : (
          <EmptyState icon="lock" title="Só a gerência mexe nos acessos">
            Peça a alguém da gerência se precisar liberar ou bloquear uma tela.
          </EmptyState>
        )}
        {erro && <p className="acs-erro">{erro}</p>}
      </div>
    );
  }

  // ---------- gerência ----------
  const ehVoce = selecionada?.id === user.uid;
  const operacional = selecionada?.role === ROLES.OPERACIONAL;
  const outrasOperacional = contas.filter((c) => c.role === ROLES.OPERACIONAL && !c.gerencia && c.id !== selecionada?.id);

  return (
    <div className="acs ui-page">
      <PageHeader
        title="Controle de acessos"
        description="Escolha a conta e marque, tela por tela, o que ela pode abrir. A gerência vê tudo."
      />
      {erro && <p className="acs-erro">{erro}</p>}

      <div className="acs-grade">
        <Card className="acs-lista">
          <div className="acs-lista__busca">
            <SearchInput value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar conta" />
          </div>
          {carregando ? (
            <p className="acs-vazio">Carregando…</p>
          ) : (
            grupos.map(([nivel, lista]) => (
              <div key={nivel} className="acs-lista__grupo">
                <h4>
                  {rotuloNivel(nivel)} <span>{lista.length}</span>
                </h4>
                <ul>
                  {lista.map((c) => {
                    const bloq = c.role === ROLES.OPERACIONAL && !c.gerencia ? contarBloqueadas(c.acessos) : 0;
                    return (
                      <li key={c.id}>
                        <button type="button" className={`acs-conta ${selId === c.id ? "is-sel" : ""} ${c.ativo === false ? "is-inativa" : ""}`} onClick={() => escolher(c)}>
                          <span className="acs-conta__avatar" aria-hidden="true">
                            {(c.nome || "?").trim().slice(0, 1).toUpperCase()}
                          </span>
                          <span className="acs-conta__info">
                            <b>
                              {c.nome || "Sem nome"}
                              {c.id === user.uid && <small> (você)</small>}
                            </b>
                            <span>{c.email}</span>
                          </span>
                          {c.role === ROLES.OPERACIONAL && baseDaConta(c).id !== ID_SEDE && (
                            <span className="acs-chip acs-chip--base" title={`Base ${baseDaConta(c).nome}`}>
                              {baseDaConta(c).sigla}
                            </span>
                          )}
                          {c.ativo === false ? (
                            <span className="acs-chip">desativada</span>
                          ) : nivelDaConta(c) === "gerencia" ? (
                            <span className="acs-chip acs-chip--ger">total</span>
                          ) : c.role === ROLES.OPERACIONAL ? (
                            <span className={`acs-chip ${bloq ? "acs-chip--bloq" : ""}`}>{bloq ? `${bloq} bloqueada${bloq > 1 ? "s" : ""}` : "tudo liberado"}</span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </Card>

        <Card className="acs-editor">
          {!selecionada || !rascunho ? (
            <EmptyState icon="shield" title="Selecione uma conta">
              Escolha alguém na lista para ver e mudar o que essa conta pode abrir.
            </EmptyState>
          ) : (
            <>
              <div className="acs-editor__topo">
                <div>
                  <h2>{selecionada.nome}</h2>
                  <p>
                    {selecionada.email} · {rotuloNivel(nivelDaConta(selecionada))}
                    {baseDaConta(selecionada).id !== ID_SEDE ? ` · base ${baseDaConta(selecionada).nome}` : ""}
                    {selecionada.ativo === false ? " · conta desativada" : ""}
                  </p>
                  {selecionada.acessosAtualizadoEm && (
                    <p className="acs-editor__log">
                      Última mudança: {dataHora(selecionada.acessosAtualizadoEm)}
                      {selecionada.acessosAtualizadoPor?.nome ? `, por ${selecionada.acessosAtualizadoPor.nome}` : ""}
                    </p>
                  )}
                </div>
              </div>

              {!operacional ? (
                <div className="acs-info">
                  <Icon name="info" size={16} />
                  <p>
                    O nível <b>{ROLE_LABELS[selecionada.role]}</b> tem acesso fixo:{" "}
                    {selecionada.role === ROLES.COMERCIAL ? "a Central de Informações e o Tema." : "a própria disponibilidade, idiomas e foto."} Para liberar telas do
                    operacional, mude o nível para Operacional em <Link to="/usuarios">Cadastros → Usuários</Link> e volte aqui.
                  </p>
                </div>
              ) : (
                <>
                  <label className={`acs-ger ${rascunho.gerencia ? "is-on" : ""}`}>
                    <input
                      type="checkbox"
                      checked={rascunho.gerencia}
                      disabled={ehVoce}
                      onChange={(e) => setRascunho((r) => ({ ...r, gerencia: e.target.checked }))}
                    />
                    <span>
                      <b>Gerência</b>
                      <small>
                        Vê todas as telas e pode mudar os acessos de qualquer conta (supervisor, coordenação, gerente geral).
                        {ehVoce ? " Você não pode tirar a sua própria gerência." : ""}
                      </small>
                    </span>
                  </label>

                  {rascunho.gerencia ? (
                    <div className="acs-info">
                      <Icon name="shield" size={16} />
                      <p>Com a gerência marcada, a conta abre todas as telas — as marcações abaixo não valem.</p>
                    </div>
                  ) : (
                    <div className="acs-acoes">
                      <Button size="sm" icon="check" onClick={() => marcarTodas(true)}>
                        Liberar tudo
                      </Button>
                      <Button size="sm" icon="x" onClick={() => marcarTodas(false)}>
                        Bloquear tudo
                      </Button>
                      {outrasOperacional.length > 0 && (
                        <select className="ui-input acs-copiar" value="" onChange={(e) => copiarDe(e.target.value)} aria-label="Copiar acessos de outra conta">
                          <option value="">Copiar acessos de…</option>
                          {outrasOperacional.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.nome}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}

                  <div className={`acs-telas ${rascunho.gerencia ? "is-desligado" : ""}`}>
                    {GRUPOS_ACESSO.map((g) => (
                      <section key={g.titulo}>
                        <h4>{g.titulo}</h4>
                        <ul>
                          {g.areas.map((a) => {
                            const base = baseDaConta({ ...selecionada, gerencia: rascunho.gerencia });
                            const naBase = telaNaRegiao(a.chave, base);
                            const pode = rascunho.gerencia || (naBase && liberadaNoMapa(rascunho.acessos, a.chave));
                            if (!naBase) {
                              return (
                                <li key={a.chave} className="is-bloq is-fora-base">
                                  <span className="acs-tela">
                                    <b>{a.label}</b>
                                    <small>Não existe na base {base.nome} (usa dados de Salvador). Libere em Gestão → Regiões, se for o caso.</small>
                                  </span>
                                  <span className="acs-chip">fora da base</span>
                                </li>
                              );
                            }
                            return (
                              <li key={a.chave} className={pode ? "" : "is-bloq"}>
                                <span className="acs-tela">
                                  <b>
                                    {a.label}
                                    {a.protegidoNoBanco && (
                                      <span className="acs-banco" title="Os dados desta tela também ficam bloqueados no banco">
                                        <Icon name="lock" size={11} /> dados protegidos
                                      </span>
                                    )}
                                  </b>
                                  {a.detalhe && <small>{a.detalhe}</small>}
                                </span>
                                <PodeNaoPode valor={pode} onChange={(v) => marcar(a.chave, v)} disabled={rascunho.gerencia} rotulo={a.label} />
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    ))}
                  </div>
                </>
              )}

              {operacional && (
                <div className="acs-rodape">
                  <span>{sujo ? "Alterações não salvas" : "Tudo salvo"}</span>
                  <Button onClick={() => escolher(selecionada)} disabled={!sujo || salvando}>
                    Descartar
                  </Button>
                  <Button variant="primary" icon="save" onClick={salvar} loading={salvando} disabled={!sujo}>
                    Salvar acessos
                  </Button>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
};

export default ControleAcessos;
