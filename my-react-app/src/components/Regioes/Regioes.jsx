import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, EmptyState, Field, Icon, PageHeader, useToast } from "../ui";
import { useAuth } from "../../Context/AuthContext";
import { ROLES } from "../../Context/permissions";
import { ehGerencia } from "../../Context/acessos";
import { useRegiao } from "../../Context/regiaoContext";
import { SEDE, TELAS_REGIONAIS, normalizarLinkPhoenix } from "../../Services/Services/regiaoAtiva";
import { idDaSigla, normalizarRegiao, salvarRegioes, testarPhoenix, validarRegioes } from "../../Services/Services/regioesRepository";
import { listarContas } from "../../Services/Services/acessosRepository";
import { OPCOES_TEMA, TEMAS, acharTemaPorNome } from "../PainelOperacional/placas/temasRegiao";
import BoasVindasBase from "../BoasVindas/BoasVindasBase";
import "./regioes.css";

/* =========================================================
   REGIÕES (só a gerência)
   Bases Luck que usam o sistema. Salvador é a sede (tudo). Cada outra base
   tem o link do Phoenix dela e as telas que pode usar — só telas que leem
   direto do Phoenix (cadastros, escala e custos continuam de Salvador).
   A região de cada conta é escolhida em Cadastros → Usuários.
   ========================================================= */

const NOVA = () => ({ id: "", nome: "", sigla: "", phoenix: "", telas: TELAS_REGIONAIS.map((t) => t.chave), ativa: true, nova: true });

const igual = (a, b) => JSON.stringify(a.map(normalizarRegiao)) === JSON.stringify(b.map(normalizarRegiao));

const Regioes = () => {
  const { user, perfil, role } = useAuth();
  const { regioes } = useRegiao();
  const { mostrarToast } = useToast();
  const souGerencia = ehGerencia(perfil);

  const [rascunho, setRascunho] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erros, setErros] = useState([]);
  const [testes, setTestes] = useState({}); // índice → { carregando, ok, texto }
  const [contas, setContas] = useState([]);
  const [previaBoasVindas, setPreviaBoasVindas] = useState(null); // região da prévia

  // o rascunho começa do que está salvo (e acompanha enquanto não há edição)
  const regioesSalvas = useRef([]);
  useEffect(() => {
    const anteriores = regioesSalvas.current;
    regioesSalvas.current = regioes;
    setRascunho((atual) => (atual === null || igual(atual, anteriores) ? regioes.map((r) => ({ ...r })) : atual));
  }, [regioes]);

  useEffect(() => {
    if (!souGerencia) return;
    listarContas()
      .then(setContas)
      .catch(() => setContas([]));
  }, [souGerencia]);

  const contasPorRegiao = useMemo(() => {
    const m = {};
    contas
      .filter((c) => c.role === ROLES.OPERACIONAL)
      .forEach((c) => {
        const id = c.regiao || SEDE.id;
        m[id] = (m[id] || 0) + 1;
      });
    return m;
  }, [contas]);

  if (role !== ROLES.OPERACIONAL) return null;
  if (!souGerencia) {
    return (
      <div className="reg ui-page">
        <PageHeader title="Regiões" description="Bases Luck que usam o sistema." />
        <EmptyState icon="lock" title="Só a gerência cadastra as bases" />
      </div>
    );
  }
  if (!rascunho) return <EmptyState icon="loader" title="Carregando…" />;

  const sujo = !igual(rascunho, regioes);

  const mudar = (i, campo, valor) =>
    setRascunho((lista) => lista.map((r, j) => (j === i ? { ...r, [campo]: valor } : r)));

  const alternarTela = (i, chave) =>
    setRascunho((lista) =>
      lista.map((r, j) => {
        if (j !== i) return r;
        const tem = r.telas.includes(chave);
        return { ...r, telas: tem ? r.telas.filter((c) => c !== chave) : [...r.telas, chave] };
      }),
    );

  const remover = (i) => {
    const r = rascunho[i];
    const n = contasPorRegiao[r.id] || 0;
    const aviso = n
      ? `${n} conta(s) estão na base ${r.nome}. Elas ficam sem acesso até você mudar a região delas em Cadastros → Usuários. Remover mesmo assim?`
      : `Remover a base ${r.nome || "nova"}?`;
    if (!window.confirm(aviso)) return;
    setRascunho((lista) => lista.filter((_, j) => j !== i));
    setTestes({});
  };

  const testar = async (i) => {
    setTestes((t) => ({ ...t, [i]: { carregando: true } }));
    const res = await testarPhoenix(rascunho[i].phoenix);
    setTestes((t) => ({ ...t, [i]: res }));
  };

  const salvar = async () => {
    // base nova ganha o id pela sigla; base já salva mantém o id (as contas apontam para ele)
    const lista = rascunho.map((r) => ({ ...r, id: r.nova || !r.id ? idDaSigla(r.sigla, r.nome) : r.id }));
    const problemas = validarRegioes(lista.map(normalizarRegiao));
    setErros(problemas);
    if (problemas.length) return;
    setSalvando(true);
    try {
      const salvas = await salvarRegioes(lista, user.uid);
      setRascunho(salvas.map((r) => ({ ...r })));
      mostrarToast("Regiões salvas");
    } catch (e) {
      console.error(e);
      mostrarToast("Não foi possível salvar. Confira a conexão e o firestore.rules.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="reg ui-page">
      <PageHeader
        title="Regiões"
        description="Bases Luck que usam o sistema e de qual Phoenix vêm os dados de cada uma. A região de cada conta é escolhida em Cadastros → Usuários."
        actions={
          <Button icon="plus" onClick={() => setRascunho((l) => [...l, NOVA()])}>
            Adicionar base
          </Button>
        }
      />

      <Card className="reg-card reg-card--sede">
        <div className="reg-card__topo">
          <span className="reg-sigla">{SEDE.sigla}</span>
          <div>
            <h2>{SEDE.nome}</h2>
            <p>Sede: todas as telas, cadastros, escala e custos.</p>
          </div>
          <span className="reg-contas">{contasPorRegiao[SEDE.id] || 0} conta(s) do Operacional</span>
        </div>
        <p className="reg-link">
          <Icon name="globe" size={13} /> {SEDE.phoenix}
        </p>
      </Card>

      {rascunho.length === 0 && (
        <EmptyState icon="mapPin" title="Nenhuma outra base cadastrada">
          Clique em Adicionar base e informe o Phoenix da base: o nome que vem depois de "driver" no link (driverrecife → recife).
        </EmptyState>
      )}

      {rascunho.map((r, i) => {
        const teste = testes[i];
        const link = normalizarLinkPhoenix(r.phoenix);
        return (
          <Card key={r.id || `nova-${i}`} className={`reg-card ${r.ativa ? "" : "is-inativa"}`}>
            <div className="reg-card__topo">
              <span className="reg-sigla">{r.sigla || "—"}</span>
              <div>
                <h2>{r.nome || "Nova base"}</h2>
                <p>{r.ativa ? `${r.telas.length} tela(s) liberada(s)` : "Desativada: as contas desta base ficam sem acesso"}</p>
              </div>
              {!r.nova && <span className="reg-contas">{contasPorRegiao[r.id] || 0} conta(s) do Operacional</span>}
            </div>

            <div className="reg-campos">
              <Field label="Nome da base">
                <input className="ui-input" value={r.nome} placeholder="Natal" onChange={(e) => mudar(i, "nome", e.target.value)} />
              </Field>
              <Field label="Sigla" hint={r.nova ? "" : "A sigla pode mudar; o vínculo das contas continua."}>
                <input
                  className="ui-input reg-input-sigla"
                  value={r.sigla}
                  maxLength={5}
                  placeholder="NAT"
                  onChange={(e) => mudar(i, "sigla", e.target.value.toUpperCase())}
                />
              </Field>
              <Field label="Link do Phoenix da base" grow hint={link && link !== r.phoenix.trim() ? `Vai ser usado: ${link}` : "Digite só o nome da base (ex.: recife) ou cole o link completo."}>
                <div className="reg-link-linha">
                  <input
                    className="ui-input"
                    value={r.phoenix}
                    placeholder="recife"
                    onChange={(e) => {
                      mudar(i, "phoenix", e.target.value);
                      setTestes((t) => ({ ...t, [i]: undefined }));
                    }}
                  />
                  <Button size="sm" icon="activity" onClick={() => testar(i)} loading={teste?.carregando} disabled={!link}>
                    Testar
                  </Button>
                </div>
              </Field>
            </div>
            {teste && !teste.carregando && (
              <p className={`reg-teste ${teste.ok ? "is-ok" : "is-erro"}`}>
                <Icon name={teste.ok ? "circleCheck" : "alert"} size={14} /> {teste.texto}
              </p>
            )}

            <Field
              label="Tema das placas"
              hint={(() => {
                const auto = acharTemaPorNome(r);
                if (r.tema) return `Desenhos de ${TEMAS[r.tema]?.cidade} e do Nordeste; mensagem "bem-vindo(a) ${TEMAS[r.tema]?.preposicao || "a"} ${TEMAS[r.tema]?.cidade}".`;
                return auto
                  ? `Automático: ${TEMAS[auto].cidade} (pelo nome da base).`
                  : "Sem tema pelo nome: as placas usam o nome da base e só os desenhos do Nordeste.";
              })()}
            >
              <select className="ui-input reg-tema" value={r.tema || ""} onChange={(e) => mudar(i, "tema", e.target.value)}>
                <option value="">Automático (pelo nome da base)</option>
                {OPCOES_TEMA.filter((o) => o.id !== "ssa").map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            <div className="reg-telas">
              <h4>Telas que a base usa</h4>
              <ul>
                {TELAS_REGIONAIS.map((t) => (
                  <li key={t.chave}>
                    <label className={`reg-tela ${r.telas.includes(t.chave) ? "is-on" : ""}`}>
                      <input type="checkbox" checked={r.telas.includes(t.chave)} onChange={() => alternarTela(i, t.chave)} />
                      <span>
                        <b>{t.label}</b>
                        <small>{t.detalhe}</small>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>

            <div className="reg-card__rodape">
              <label className="reg-ativa">
                <input type="checkbox" checked={r.ativa} onChange={(e) => mudar(i, "ativa", e.target.checked)} />
                Base ativa
              </label>
              <span className="reg-card__acoes">
                <Button size="sm" variant="ghost" icon="eye" onClick={() => setPreviaBoasVindas(normalizarRegiao(r))} title="Como a conta desta base é recebida nas 2 primeiras entradas">
                  Ver boas-vindas
                </Button>
                <Button size="sm" variant="ghost" icon="trash" onClick={() => remover(i)}>
                  Remover
                </Button>
              </span>
            </div>
          </Card>
        );
      })}

      {erros.length > 0 && (
        <div className="reg-erros" role="alert">
          {erros.map((e) => (
            <p key={e}>
              <Icon name="alert" size={14} /> {e}
            </p>
          ))}
        </div>
      )}

      <div className="reg-rodape">
        <span>{sujo ? "Alterações não salvas" : "Tudo salvo"}</span>
        <Button
          onClick={() => {
            setRascunho(regioes.map((r) => ({ ...r })));
            setErros([]);
          }}
          disabled={!sujo || salvando}
        >
          Descartar
        </Button>
        <Button variant="primary" icon="save" onClick={salvar} loading={salvando} disabled={!sujo}>
          Salvar regiões
        </Button>
      </div>

      {previaBoasVindas && <BoasVindasBase previa regiaoPrevia={previaBoasVindas} onFechar={() => setPreviaBoasVindas(null)} />}

      <p className="reg-nota">
        <Icon name="info" size={13} /> Para colocar uma pessoa numa base, edite a conta em <Link to="/usuarios">Cadastros → Usuários</Link>. A gerência
        troca de base pelo seletor no topo da tela.
      </p>
    </div>
  );
};

export default Regioes;
