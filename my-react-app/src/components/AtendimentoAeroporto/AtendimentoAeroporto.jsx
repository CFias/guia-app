import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { onSnapshot, query, where } from "firebase/firestore";
import Icon from "../ui/Icon";
import { useAuth } from "../../Context/AuthContext";
import { ROLES } from "../../Context/permissions";
import { colBase } from "../../Services/Services/dadosBase";
import { definirTituloAba } from "../Shell/tituloAba";
import AvaliacaoSistema from "../Atividade/AvaliacaoSistema";
import { registrarAcao } from "../../Services/Services/atividadeRepository";
import {
  carregarConfigTurnos,
  carregarExcecoes,
  dataBr,
  dentro,
  escalaDoDia,
  isoLocal,
  num,
  somarDias,
  todosDaEquipe,
} from "../../Services/Services/relatorioTurnos";
import {
  COL_ATENDIMENTOS,
  buscarChegadasPorVeiculo,
  contarAtendimentos,
  esperaDoDoc,
  horaDe,
  marcarEtapa,
  marcasDaEtapa,
  textoMinutos,
  textoPax,
  vincularDocs,
} from "../../Services/Services/atendimentoAeroporto";
import "./atendimento.css";

/* PAINEL DO AEROPORTO (conta "Atendimento" ou Operacional).
   As chegadas do dia (Phoenix), por veículo. Em cada veículo o colaborador
   toca nas etapas que fez — "Recepcionei", "Embarquei" (configurável). Isso
   substitui a assinatura no verso da cartinha. As marcas aparecem na hora
   para todos (tempo real) e alimentam o relatório da Demanda por turno.
   O Operacional pode marcar em nome de um colaborador (ex.: lançar cartinhas). */

const hoje = () => isoLocal(new Date());
const semAcento = (t = "") =>
  String(t)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
const pl = (n, um, varios) => `${num(n, 0)} ${Math.round(n) === 1 ? um : varios}`;

const AtendimentoAeroporto = () => {
  const { user, perfil, role, logout } = useAuth();
  const ehOperacional = role === ROLES.OPERACIONAL;
  const [data, setData] = useState(hoje);
  const [config, setConfig] = useState(null);
  const [excecoes, setExcecoes] = useState({ dias: {} });
  const [carga, setCarga] = useState({ data: "", grupos: [], erro: "" });
  const [docs, setDocs] = useState({ data: "", lista: [] });
  // o Operacional lança por várias pessoas: começa no dia todo
  const [filtroTurno, setFiltroTurno] = useState(() => (ehOperacional ? "todos" : "meu"));
  const [filtro, setFiltro] = useState("pendentes"); // pendentes | todos | meus
  const [busca, setBusca] = useState("");
  const [emNomeDe, setEmNomeDe] = useState(""); // operacional: colaborador escolhido
  const [horaManual, setHoraManual] = useState(""); // operacional: horário da cartinha
  const [abertos, setAbertos] = useState(() => new Set()); // veículos com as reservas abertas
  const alternarAberto = (chave) =>
    setAbertos((a) => {
      const n = new Set(a);
      if (n.has(chave)) n.delete(chave);
      else n.add(chave);
      return n;
    });
  const [salvando, setSalvando] = useState("");
  const [recarregar, setRecarregar] = useState(0);

  useEffect(() => {
    definirTituloAba("Atendimento no aeroporto");
  }, []);

  // equipe, escala e regras
  useEffect(() => {
    let vivo = true;
    Promise.all([carregarConfigTurnos(), carregarExcecoes().catch(() => ({ dias: {} }))])
      .then(([c, e]) => {
        if (!vivo) return;
        setConfig(c);
        setExcecoes(e);
      })
      .catch(() => vivo && setConfig(null));
    return () => {
      vivo = false;
    };
  }, []);

  // chegadas do Phoenix (por veículo)
  useEffect(() => {
    let vivo = true;
    buscarChegadasPorVeiculo(data)
      .then((grupos) => vivo && setCarga({ data, grupos, erro: "" }))
      .catch((e) => vivo && setCarga({ data, grupos: [], erro: e?.message || "Não foi possível ler o Phoenix." }));
    return () => {
      vivo = false;
    };
  }, [data, recarregar]);

  // marcas do dia, em tempo real
  useEffect(
    () =>
      onSnapshot(
        query(colBase(COL_ATENDIMENTOS), where("data", "==", data)),
        (snap) => setDocs({ data, lista: snap.docs.map((d) => ({ id: d.id, ...d.data() })) }),
        (e) => console.error("Erro ao ler atendimentos:", e),
      ),
    [data],
  );

  const equipe = useMemo(() => (config ? todosDaEquipe(config) : []), [config]);
  const etapas = config?.atendimento?.etapas || [];
  const regra = config?.atendimento?.contagem || "dividir";

  // quem está marcando
  const eu = ehOperacional
    ? equipe.find((c) => c.id === emNomeDe) || null
    : equipe.find((c) => c.id === perfil?.colaboradorId) || (perfil?.colaboradorId ? { id: perfil.colaboradorId, nome: perfil.colaboradorNome || perfil.nome } : null);
  const quem = eu ? { id: eu.id, nome: eu.nome, colaboradorId: eu.id } : null;

  // meu turno no dia
  const escala = useMemo(() => (config ? escalaDoDia(config, excecoes, data) : []), [config, excecoes, data]);
  const meuTurno = eu ? escala.map((e) => ({ ...e, eu: e.pessoas.find((p) => p.id === eu.id) })).find((e) => e.eu) : null;
  const janela = meuTurno?.eu?.janela || null;

  const grupos = carga.data === data ? carga.grupos : null;
  const lista = docs.data === data ? docs.lista : [];
  const vinculos = useMemo(() => vincularDocs(grupos || [], lista, data), [grupos, lista, data]);
  const marcasDe = (g) => vinculos.get(g.chave)?.doc?.marcas || {};
  const totalPax = (grupos || []).reduce((s, g) => s + g.pax, 0);
  const completo = (g) => etapas.every((e) => Object.keys(marcasDe(g)[e.id] || {}).length > 0);

  const visiveis = (grupos || []).filter((g) => {
    if (filtroTurno === "meu" && janela && !dentro(g.min, janela.inicio, janela.fim)) return false;
    if (filtro === "pendentes" && completo(g)) return false;
    if (filtro === "meus" && !etapas.some((e) => quem && marcasDe(g)[e.id]?.[quem.id])) return false;
    const t = semAcento(busca.trim());
    if (t && !semAcento(`${g.voos.join(" ")} ${g.veiculo} ${g.motorista} ${g.reservas.map((r) => `${r.titular} ${r.codigo} ${r.hotel}`).join(" ")}`).includes(t)) return false;
    return true;
  });

  // meus números do dia
  const meus = useMemo(() => {
    if (!quem) return null;
    const { pessoas } = contarAtendimentos(lista, etapas, regra);
    return pessoas.get(quem.id) || null;
  }, [lista, etapas, regra, quem]);

  const alternar = async (g, etapa) => {
    if (!quem) return;
    const marcado = !!marcasDe(g)[etapa.id]?.[quem.id];
    if (!marcado && config?.atendimento?.avisarForaDoTurno && janela && !dentro(g.min, janela.inicio, janela.fim)) {
      if (!window.confirm(`Este veículo (${g.hora}) está fora do seu turno (${janela.inicio}–${janela.fim}). Marcar mesmo assim?`)) return;
    }
    setSalvando(`${g.chave}|${etapa.id}`);
    try {
      await marcarEtapa({
        data,
        grupo: g,
        etapa: etapa.id,
        quem,
        por: user?.uid,
        marcar: !marcado,
        docId: vinculos.get(g.chave)?.id,
        lancado: ehOperacional,
        horaManual: ehOperacional ? horaManual : "",
      });
      if (!marcado) registrarAcao(`atendimento_${etapa.id}`, `${etapa.nome} (aeroporto)`, `${g.voos.join(", ")} · ${g.pax} pax`);
    } catch (e) {
      console.error(e);
      alert("Não foi possível salvar. Confira a conexão.");
    } finally {
      setSalvando("");
    }
  };

  const nomeDoDia = data === hoje() ? "Hoje" : data === somarDias(hoje(), -1) ? "Ontem" : data === somarDias(hoje(), 1) ? "Amanhã" : dataBr(data);

  return (
    <div className="atd">
      <header className="atd-topo">
        <div className="atd-topo__linha">
          <span className="atd-topo__icone">
            <Icon name="planeLanding" size={20} />
          </span>
          <div className="atd-topo__titulo">
            <strong>Atendimento no aeroporto</strong>
            <small>{eu ? `${eu.nome}${meuTurno ? ` · ${meuTurno.turno.nome} ${janela.inicio}–${janela.fim}` : " · sem turno neste dia"}` : ehOperacional ? "Escolha em nome de quem marcar" : "Conta sem colaborador vinculado"}</small>
          </div>
          <span className="atd-topo__acoes">
            <AvaliacaoSistema variante="botao" className="atd-btn-leve atd-avaliar" />
            {ehOperacional ? (
              <Link to="/recepcao-turnos" className="atd-btn-leve">
                <Icon name="barChart" size={15} /> Relatório
              </Link>
            ) : (
              <Link to="/atendimento/sobre" className="atd-btn-leve" title="Sobre a FiaSystem">
                <Icon name="info" size={15} />
              </Link>
            )}
            <button type="button" className="atd-btn-leve" onClick={logout} title="Sair">
              <Icon name="logout" size={15} />
            </button>
          </span>
        </div>

        {ehOperacional && (
          <label className="atd-em-nome">
            <span>Marcar em nome de</span>
            <select className="ui-input" value={emNomeDe} onChange={(e) => setEmNomeDe(e.target.value)}>
              <option value="">Escolha o colaborador…</option>
              {equipe.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} · {c.turnoNome}
                </option>
              ))}
            </select>
          </label>
        )}
        {ehOperacional && (
          <label className="atd-em-nome atd-hora-manual">
            <span>Horário da cartinha (opcional)</span>
            <span className="atd-hora-manual__linha">
              <input type="time" className="ui-input" value={horaManual} onChange={(e) => setHoraManual(e.target.value)} />
              {horaManual && (
                <button type="button" className="atd-btn-leve" onClick={() => setHoraManual("")}>
                  Agora
                </button>
              )}
            </span>
            <small>Sem horário, a marca fica com a hora do lançamento e não entra no tempo de espera.</small>
          </label>
        )}

        <div className="atd-dias" role="tablist" aria-label="Dia">
          {[somarDias(hoje(), -1), hoje(), somarDias(hoje(), 1)].map((d) => (
            <button key={d} type="button" role="tab" aria-selected={d === data} className={d === data ? "is-on" : ""} onClick={() => setData(d)}>
              {d === hoje() ? "Hoje" : d < hoje() ? "Ontem" : "Amanhã"}
              <small>{dataBr(d).slice(0, 5)}</small>
            </button>
          ))}
        </div>

        {quem && etapas.length > 0 && (
          <div className="atd-meus">
            {etapas.map((e) => {
              const v = meus?.etapas?.[e.id];
              return (
                <div key={e.id} className="atd-meus__item">
                  <b>{num(v?.pax || 0, 1)}</b>
                  <span>
                    pax · {e.nome.toLowerCase()}
                    <small>{totalPax ? `${num(((v?.pax || 0) / totalPax) * 100, 0)}% do dia` : "—"}</small>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </header>

      <main className="atd-corpo">
        <div className="atd-filtros">
          <label className="atd-busca">
            <Icon name="search" size={15} />
            <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Voo, nome do passageiro, veículo…" />
          </label>
          <div className="atd-chips">
            {janela && (
              <>
                <button type="button" className={filtroTurno === "meu" ? "is-on" : ""} onClick={() => setFiltroTurno("meu")}>
                  Meu turno
                </button>
                <button type="button" className={filtroTurno === "todos" ? "is-on" : ""} onClick={() => setFiltroTurno("todos")}>
                  Dia todo
                </button>
                <i />
              </>
            )}
            {[
              ["pendentes", "Pendentes"],
              ["todos", "Todos"],
              ["meus", "Os meus"],
            ].map(([v, r]) => (
              <button key={v} type="button" className={filtro === v ? "is-on" : ""} onClick={() => setFiltro(v)}>
                {r}
              </button>
            ))}
          </div>
        </div>

        {!config ? (
          <p className="atd-vazio">
            <Icon name="loader" size={18} className="ui-spin" /> Carregando…
          </p>
        ) : !grupos ? (
          <p className="atd-vazio">
            <Icon name="loader" size={18} className="ui-spin" /> Buscando as chegadas de {nomeDoDia.toLowerCase()} no Phoenix…
          </p>
        ) : carga.erro ? (
          <div className="atd-vazio">
            <Icon name="alert" size={18} /> {carga.erro}
            <button type="button" className="atd-btn-leve" onClick={() => setRecarregar((x) => x + 1)}>
              Tentar de novo
            </button>
          </div>
        ) : visiveis.length === 0 ? (
          <p className="atd-vazio">
            <Icon name="circleCheck" size={18} />{" "}
            {grupos.length === 0
              ? `Nenhuma chegada ${nomeDoDia === "Hoje" ? "hoje" : `em ${nomeDoDia.toLowerCase()}`}.`
              : filtro === "pendentes"
                ? "Nada pendente por aqui."
                : "Nenhum veículo com esse filtro."}
          </p>
        ) : (
          <ul className="atd-lista">
            {visiveis.map((g) => {
              const m = marcasDe(g);
              const feito = completo(g);
              return (
                <li key={g.chave} className={`atd-carro ${feito ? "is-feito" : ""}`}>
                  <div className="atd-carro__topo">
                    <span className="atd-carro__hora">{g.hora || "--:--"}</span>
                    <span className="atd-carro__voos">
                      {g.voos.length ? g.voos.map((v) => <b key={v}>{v}</b>) : <b>Sem voo</b>}
                    </span>
                    <span className="atd-carro__pax">
                      <Icon name="users" size={14} /> {g.pax}
                    </span>
                  </div>
                  <div className="atd-carro__veiculo">
                    <Icon name="truck" size={14} />
                    {g.veiculo ? (
                      <>
                        <b>{g.veiculo}</b>
                        {g.motorista && <span> · {g.motorista}</span>}
                      </>
                    ) : (
                      <em>Ainda sem veículo na escala</em>
                    )}
                  </div>
                  {vinculos.get(g.chave)?.herdado && (
                    <small className="atd-carro__herdado">
                      <Icon name="info" size={12} /> Marcado pelo voo, antes de o Phoenix escalar o veículo
                    </small>
                  )}
                  <button
                    type="button"
                    className={`atd-carro__reservas-btn ${abertos.has(g.chave) ? "is-aberto" : ""}`}
                    onClick={() => alternarAberto(g.chave)}
                    aria-expanded={abertos.has(g.chave)}
                  >
                    <span className="atd-carro__nomes">
                      {g.reservas
                        .slice(0, 3)
                        .map((r) => `${r.titular || r.codigo}${r.pax > 1 ? ` (${r.pax})` : ""}`)
                        .join(" · ")}
                      {g.reservas.length > 3 ? ` · +${g.reservas.length - 3}` : ""}
                    </span>
                    <span className="atd-carro__reservas-acao">
                      {g.reservas.length} reserva{g.reservas.length === 1 ? "" : "s"}
                      <Icon name="chevronDown" size={14} />
                    </span>
                  </button>
                  {abertos.has(g.chave) && (
                    <ul className="atd-reservas">
                      {g.reservas.map((r, i) => (
                        <li key={`${r.codigo}-${i}`}>
                          <div className="atd-reservas__topo">
                            <b>{r.titular || "Sem nome"}</b>
                            <span className="atd-reservas__pax">{r.pax} pax</span>
                          </div>
                          <div className="atd-reservas__info">
                            {r.codigo && <span className="atd-reservas__codigo">{r.codigo}</span>}
                            <span>
                              <Icon name="mapPin" size={12} /> {r.hotel || "Hotel não informado"}
                            </span>
                            {g.voos.length > 1 && r.voo && <span>Voo {r.voo}</span>}
                          </div>
                          <small className="atd-reservas__det">{textoPax(r)}</small>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="atd-etapas">
                    {etapas.map((e) => {
                      const quemMarcou = marcasDaEtapa({ marcas: m }, e.id);
                      const meu = !!(quem && m[e.id]?.[quem.id]);
                      const ocupado = salvando === `${g.chave}|${e.id}`;
                      return (
                        <div key={e.id} className="atd-etapa">
                          <button
                            type="button"
                            className={`atd-etapa__btn ${meu ? "is-meu" : ""}`}
                            onClick={() => alternar(g, e)}
                            disabled={!quem || ocupado}
                            aria-pressed={meu}
                          >
                            <Icon name={ocupado ? "loader" : meu ? "circleCheck" : "circle"} size={16} className={ocupado ? "ui-spin" : undefined} />
                            {e.acao || e.nome}
                          </button>
                          <small className="atd-etapa__quem">
                            {quemMarcou.length ? quemMarcou.map((x) => `${x.nome} ${horaDe(x.em)}`).join(", ") : "ninguém ainda"}
                          </small>
                        </div>
                      );
                    })}
                  </div>
                  {(() => {
                    const esp = esperaDoDoc({ marcas: m }, etapas);
                    return esp?.min !== null && esp?.min !== undefined ? (
                      <small className="atd-carro__espera">
                        <Icon name="clock" size={12} /> {textoMinutos(esp.min)} entre {etapas[0].nome.toLowerCase()} e {etapas[etapas.length - 1].nome.toLowerCase()}
                      </small>
                    ) : null;
                  })()}
                </li>
              );
            })}
          </ul>
        )}
        {grupos && grupos.length > 0 && (
          <p className="atd-rodape">
            {pl(grupos.length, "veículo", "veículos")} · {pl(totalPax, "pax", "pax")} em {nomeDoDia.toLowerCase()} · {pl(grupos.filter(completo).length, "concluído", "concluídos")}
          </p>
        )}
      </main>
    </div>
  );
};

export default AtendimentoAeroporto;
