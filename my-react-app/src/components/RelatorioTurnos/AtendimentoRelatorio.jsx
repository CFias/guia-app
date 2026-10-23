import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, CardHeader, EmptyState, Field, Icon, KpiTiles, Segmented, useToast } from "../ui";
import { dataBr, escalaDoDia, isoLocal, listarDatas, num, somarDias, todosDaEquipe } from "../../Services/Services/relatorioTurnos";
import {
  buscarChegadasPorVeiculo,
  buscarReserva,
  eventosNovos,
  horaDe,
  listarAtendimentos,
  ouvirAtendimentos,
  regraPorVoo,
  marcasDaEtapa,
  relatorioAtendimento,
  resumoEsperas,
  resumoEsperasPorReserva,
  textoMinutos,
  nomeNoShow,
  textoPax,
} from "../../Services/Services/atendimentoAeroporto";
import { baixarExcelAtendimento, imprimirAtendimento } from "./impressaoAtendimento";
import RelatorioColaborador from "./RelatorioColaborador";
import { definirSom, somLigado, tocarNotificacao } from "../../Services/Utils/somNotificacao";

// ícone de cada etapa: ✓ = recebeu (1ª), carro = embarcou (última)
const iconeEtapa = (i, n) => (i === 0 ? "check" : i === n - 1 ? "car" : "circleCheck");

const normal = (t = "") =>
  String(t)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/* Aba "Atendimento no aeroporto" da Demanda por turno: o que cada
   colaborador marcou no painel (Recepcionei / Embarquei), em pax e %,
   cruzado com as chegadas do Phoenix — o "relatório do dia" que antes
   saía do verso das cartinhas. */

const MAX_CRUZAR = 7; // dias que dá pra cruzar com o Phoenix de uma vez
const hoje = () => isoLocal(new Date());
const ATALHOS = [
  { value: "hoje", label: "Hoje", calc: () => [hoje(), hoje()] },
  { value: "ontem", label: "Ontem", calc: () => [somarDias(hoje(), -1), somarDias(hoje(), -1)] },
  { value: "7", label: "7 dias", calc: () => [somarDias(hoje(), -6), hoje()] },
  {
    value: "mes",
    label: "Este mês",
    calc: () => {
      const d = new Date();
      return [isoLocal(new Date(d.getFullYear(), d.getMonth(), 1, 12)), hoje()];
    },
  },
];
const pct = (v) => `${num(v, v && v < 10 ? 1 : 0)}%`;
const DIAS_HISTORICO = 90;
const VEICULOS_ESPERA = 15;

// "Edson 14:32 · Ingra 14:35"
const quemComHora = (doc, etapaId) =>
  marcasDaEtapa(doc, etapaId)
    .map((m) => `${m.nome} ${horaDe(m.em)}${m.lancado && !m.horaManual ? "*" : ""}`)
    .join(" · ");

/* Tempo entre a recepção (1ª etapa) e o embarque (última etapa) */
const TempoEspera = ({ docs, etapas }) => {
  const [todos, setTodos] = useState(false);
  // "veiculo": enxuto (quando todos os pax do veículo foram recepcionados)
  // "reserva": quanto cada reserva esperou de fato
  const [modo, setModo] = useState("veiculo");
  const porVeiculo = useMemo(() => resumoEsperas(docs, etapas), [docs, etapas]);
  const porRes = useMemo(() => resumoEsperasPorReserva(docs, etapas), [docs, etapas]);
  const ehReserva = modo === "reserva";
  const r = ehReserva ? porRes : porVeiculo;
  const itens = ehReserva ? porRes.reservas : porVeiculo.veiculos;
  const ini = etapas[0];
  const fim = etapas[etapas.length - 1];
  const maxFaixa = Math.max(1, ...r.faixas.map((f) => f.veiculos));
  const lista = todos ? itens : itens.slice(0, VEICULOS_ESPERA);
  const variosDias = new Set(docs.map((d) => d.data)).size > 1;
  const unidade = ehReserva ? "reserva" : "veículo";
  const quemHora = (m) => (m ? `${m.nome || ""} ${horaDe(m.em)}${m.lancado && !m.horaManual ? "*" : ""}` : "—");
  return (
    <Card>
      <CardHeader
        icon="clock"
        title={`Tempo entre ${ini.nome.toLowerCase()} e ${fim.nome.toLowerCase()}`}
        subtitle={
          ehReserva
            ? `Quanto cada reserva esperou de fato: da hora em que ela foi ${ini.nome.toLowerCase()} até o "${fim.acao || fim.nome}" do veículo.`
            : `Enxuto, por veículo: da hora em que todos os pax do veículo foram ${ini.nome.toLowerCase()}s até o "${fim.acao || fim.nome}".`
        }
        actions={
          <Segmented
            size="sm"
            ariaLabel="Tempo de espera"
            value={modo}
            onChange={(v) => {
              setModo(v);
              setTodos(false);
            }}
            options={[
              { value: "veiculo", label: "Por veículo", count: porVeiculo.veiculos.length },
              { value: "reserva", label: "Por reserva", count: porRes.reservas.length },
            ]}
          />
        }
      />
      {itens.length === 0 ? (
        <p className="rtn-atd__vazio">Nenhum {unidade} com as duas etapas marcadas neste período.</p>
      ) : (
        <div className="rtn-esp">
          <div className="rtn-esp__kpis">
            <div>
              <Icon name="clock" size={16} />
              <b className="tabular">{textoMinutos(r.media)}</b>
              <span>espera média por {unidade}</span>
            </div>
            <div>
              <Icon name="users" size={16} />
              <b className="tabular">{textoMinutos(r.mediaPax)}</b>
              <span>espera média por passageiro</span>
            </div>
            <div>
              <Icon name="activity" size={16} />
              <b className="tabular">{textoMinutos(r.mediana)}</b>
              <span>metade {ehReserva ? "das reservas" : "dos veículos"} esperou até</span>
            </div>
            <div className={r.maior?.espera.min > 60 ? "is-alerta" : ""}>
              <Icon name="alert" size={16} />
              <b className="tabular">{textoMinutos(r.maior?.espera.min)}</b>
              <span>
                maior espera
                {r.maior ? ` · ${ehReserva ? r.maior.reserva.titular || r.maior.reserva.codigo : (r.maior.doc.voos || []).join(", ") || r.maior.doc.veiculo || ""}` : ""}
              </span>
            </div>
          </div>
          <ul className="rtn-barras rtn-esp__faixas">
            {r.faixas.map((f) => (
              <li key={f.id}>
                <div className="rtn-barras__topo">
                  <span>{f.nome}</span>
                  <b className="tabular">{f.veiculos}</b>
                </div>
                <div className="rtn-barras__trilho" aria-hidden="true">
                  <span style={{ width: `${(f.veiculos / maxFaixa) * 100}%`, background: f.id === "mais" ? "var(--alert)" : f.id === "60" ? "var(--warning)" : "var(--accent)" }} />
                </div>
              </li>
            ))}
          </ul>
          <ul className="rtn-lista rtn-lista--esp">
            {lista.map((x, k) => {
              const ini_ = ehReserva ? quemHora(x.espera.inicio) : quemComHora(x.doc, ini.id);
              const fim_ = ehReserva ? quemHora(x.espera.fim) : quemComHora(x.doc, fim.id);
              const tom = x.espera.min > 60 ? "is-alerta" : x.espera.min > 30 ? "is-aviso" : "is-ok";
              return (
                <li key={`${x.doc.id}-${k}`} className="rtn-lista__item">
                  <span className="rtn-lista__hora tabular">
                    {variosDias && <small>{dataBr(x.doc.data).slice(0, 5)}</small>}
                    {x.doc.hora || "--:--"}
                  </span>
                  <span className="rtn-lista__principal">
                    {ehReserva ? (
                      <>
                        <b>{x.reserva.titular || "Sem nome"}</b>
                        <small>
                          {x.reserva.codigo || "sem código"} · {(x.doc.voos || []).join(", ")} · {x.reserva.pax} pax
                        </small>
                      </>
                    ) : (
                      <>
                        <b>
                          <Icon name="planeLanding" size={12} /> {(x.doc.voos || []).join(", ") || "Sem voo"}
                        </b>
                        <small>
                          <Icon name="car" size={11} /> {x.doc.veiculo || "sem veículo"} · {x.doc.pax} pax
                        </small>
                      </>
                    )}
                  </span>
                  <span className="rtn-esp__passos">
                    <span title={`${ini.nome}: ${ini_}`}>
                      <i className="rtn-ic is-rec">
                        <Icon name="check" size={12} />
                      </i>
                      <small>{ini_}</small>
                    </span>
                    <Icon name="arrowRight" size={13} className="rtn-esp__seta" />
                    <span title={`${fim.nome}: ${fim_}`}>
                      <i className="rtn-ic is-emb">
                        <Icon name="car" size={12} />
                      </i>
                      <small>{fim_}</small>
                    </span>
                  </span>
                  <span className={`rtn-esp__pilula tabular ${tom}`}>{x.espera.min === null ? "sem horário" : textoMinutos(x.espera.min)}</span>
                </li>
              );
            })}
          </ul>
          <div className="rtn-esp__rodape">
            {r.semHorario > 0 && (
              <small>
                * {r.semHorario} {unidade}(s) lançado(s) pelo Operacional sem o horário da cartinha não entram no tempo de espera.
              </small>
            )}
            {itens.length > VEICULOS_ESPERA && (
              <Button size="sm" variant="ghost" onClick={() => setTodos((v) => !v)}>
                {todos ? "Mostrar menos" : `Ver todos (${itens.length})`}
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
};

/* No show do período: com custo / sem custo, por reserva */
const NoShowCard = ({ resumo, variosDias }) => {
  const [filtro, setFiltro] = useState("");
  const lista = resumo.lista.filter((n) => !filtro || n.tipo === filtro);
  return (
    <Card>
      <CardHeader
        icon="x"
        title={`No show (${resumo.reservas})`}
        subtitle="Reservas informadas no painel do aeroporto. Os pax de no show não contam para quem recepcionou e embarcou."
        actions={
          resumo.reservas > 0 ? (
            <Segmented
              size="sm"
              ariaLabel="Tipo de no show"
              value={filtro}
              onChange={setFiltro}
              options={[
                { value: "", label: "Todos", count: resumo.reservas },
                { value: "com_custo", label: "Com custo", count: resumo.comCusto.reservas },
                { value: "sem_custo", label: "Sem custo", count: resumo.semCusto.reservas },
              ]}
            />
          ) : null
        }
      />
      {resumo.reservas === 0 ? (
        <p className="rtn-atd__vazio">Nenhum no show informado neste período.</p>
      ) : (
        <>
          <div className="rtn-ns-resumo">
            <span className="is-com_custo">
              <i className="rtn-ic is-falta"><Icon name="coins" size={12} /></i>
              <b>{resumo.comCusto.reservas}</b> com custo · {resumo.comCusto.pax} pax
            </span>
            <span className="is-sem_custo">
              <i className="rtn-ic is-aviso"><Icon name="x" size={12} /></i>
              <b>{resumo.semCusto.reservas}</b> sem custo · {resumo.semCusto.pax} pax
            </span>
          </div>
          <ul className="rtn-lista">
            {lista.map((n) => (
              <li key={`${n.docId}-${n.chave}`} className={`rtn-lista__item is-${n.tipo}`}>
                <i className={`rtn-ic ${n.tipo === "com_custo" ? "is-falta" : "is-aviso"}`}>
                  <Icon name="x" size={13} />
                </i>
                <span className="rtn-lista__hora tabular">
                  {variosDias && <small>{dataBr(n.data).slice(0, 5)}</small>}
                  {n.hora || "--:--"}
                </span>
                <span className="rtn-lista__principal">
                  <b>{n.titular || "Sem nome"}</b>
                  <small>
                    {n.codigo || "sem código"}
                    {n.hotel ? ` · ${n.hotel}` : ""}
                  </small>
                </span>
                <span className="rtn-lista__meta">
                  <span>
                    <Icon name="planeLanding" size={12} /> {(n.voos || []).join(", ") || n.voo || "—"}
                  </span>
                  <span>
                    <Icon name="car" size={12} /> {n.veiculo || "sem veículo"}
                  </span>
                  <span>
                    <Icon name="users" size={12} /> {n.pax} <small>({textoPax(n)})</small>
                  </span>
                </span>
                <span className="rtn-lista__fim">
                  <span className={`rtn-ns-tag is-${n.tipo}`}>{n.tipo === "com_custo" ? "Com custo" : "Sem custo"}</span>
                  <small>
                    <Icon name="user" size={11} /> {n.porNome || "—"} {horaDe(n.em)}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
};

/* Busca de reserva ou passageiro: no período escolhido ou no histórico */
const BuscaReserva = ({ docs, chegadas, etapas, inicio, fim, equipe = [], onAbrirColaborador }) => {
  const [termo, setTermo] = useState("");
  const [escopo, setEscopo] = useState("periodo");
  const [hist, setHist] = useState({ chave: "", docs: [], erro: "" });
  const fimHist = hoje();
  const chaveHist = escopo === "historico" ? `${somarDias(fimHist, -DIAS_HISTORICO)}|${fimHist}` : "";

  useEffect(() => {
    if (!chaveHist) return;
    let vivo = true;
    const [a, b] = chaveHist.split("|");
    listarAtendimentos(a, b)
      .then((lista) => vivo && setHist({ chave: chaveHist, docs: lista, erro: "" }))
      .catch((e) => {
        console.error(e);
        if (vivo) setHist({ chave: chaveHist, docs: [], erro: "Não foi possível ler o histórico." });
      });
    return () => {
      vivo = false;
    };
  }, [chaveHist]);

  const carregandoHist = escopo === "historico" && hist.chave !== chaveHist;
  const achados = useMemo(() => {
    if (termo.trim().length < 2 || carregandoHist) return [];
    return escopo === "historico"
      ? buscarReserva({ termo, docs: hist.docs, etapas })
      : buscarReserva({ termo, docs, chegadas, etapas });
  }, [termo, escopo, hist, docs, chegadas, etapas, carregandoHist]);
  const ultima = etapas[etapas.length - 1];
  // o termo é o nome de alguém da equipe? oferece o relatório dele
  const colaboradores = termo.trim().length >= 2 ? equipe.filter((c) => normal(c.nome).includes(normal(termo))) : [];

  return (
    <Card>
      <CardHeader
        icon="search"
        title="Buscar reserva, passageiro ou colaborador"
        subtitle={`Quem recepcionou e quem ${ultima ? ultima.nome.toLowerCase() : "embarcou"} cada reserva, com os horários.`}
      />
      <div className="rtn-busca">
        <div className="rtn-busca__linha">
          <label className="rtn-busca__campo">
            <Icon name="search" size={15} />
            <input type="search" value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Reserva, passageiro ou colaborador" />
          </label>
          <Segmented
            size="sm"
            ariaLabel="Onde buscar"
            value={escopo}
            onChange={setEscopo}
            options={[
              { value: "periodo", label: inicio === fim ? `Em ${dataBr(inicio).slice(0, 5)}` : "No período" },
              { value: "historico", label: `Histórico (${DIAS_HISTORICO} dias)` },
            ]}
          />
        </div>
        {colaboradores.length > 0 && (
          <div className="rtn-busca__colabs">
            <span>Colaborador:</span>
            {colaboradores.map((c) => (
              <button key={c.id} type="button" className="rtn-chip is-on" onClick={() => onAbrirColaborador?.(c)}>
                <Icon name="barChart" size={12} /> Relatório de {c.nome}
              </button>
            ))}
          </div>
        )}
        {termo.trim().length >= 2 &&
          (carregandoHist ? (
            <p className="rtn-atd__vazio">
              <Icon name="loader" size={16} className="ui-spin" /> Lendo o histórico…
            </p>
          ) : hist.erro && escopo === "historico" ? (
            <p className="rtn-atd__vazio">{hist.erro}</p>
          ) : achados.length === 0 ? (
            <p className="rtn-atd__vazio">
              Nada encontrado {escopo === "historico" ? `nos últimos ${DIAS_HISTORICO} dias` : "neste período"}.
              {escopo === "periodo" && " Tente no histórico."}
            </p>
          ) : (
            <ul className="rtn-busca__lista">
              {achados.slice(0, 50).map((a, i) => (
                <li key={`${a.data}-${a.reserva.codigo}-${i}`}>
                  <div className="rtn-busca__topo">
                    <b>{a.reserva.titular || "Sem nome"}</b>
                    {a.reserva.codigo && <span className="rtn-busca__codigo">{a.reserva.codigo}</span>}
                    {a.noShow && (
                      <span className={`rtn-ns-tag is-${a.noShow.tipo}`}>
                        {nomeNoShow(a.noShow.tipo)} · {a.noShow.porNome || "—"} {horaDe(a.noShow.em)}
                      </span>
                    )}
                    <span className="rtn-busca__quando">
                      {dataBr(a.data)} · {a.hora || "--:--"} · {a.voos.join(", ") || "sem voo"}
                    </span>
                  </div>
                  <div className="rtn-busca__info">
                    <span>
                      <Icon name="mapPin" size={12} /> {a.reserva.hotel || "Hotel não informado"}
                    </span>
                    <span>
                      <Icon name="users" size={12} /> {a.reserva.pax} pax ({textoPax(a.reserva)})
                    </span>
                    <span>
                      <Icon name="truck" size={12} /> {a.veiculo || "sem veículo"}
                      {a.motorista ? ` · ${a.motorista}` : ""}
                    </span>
                  </div>
                  <dl className="rtn-busca__etapas">
                    {etapas.map((e) => {
                      const q =
                        e.id === etapas[0]?.id && a.recepcao
                          ? `${a.recepcao.nome} ${horaDe(a.recepcao.em)} (na reserva)`
                          : a.doc
                            ? quemComHora(a.doc, e.id)
                            : "";
                      return (
                        <div key={e.id} className={`${e.id === ultima?.id ? "is-final" : ""} ${a.etapasDoColaborador.includes(e.id) ? "is-achado" : ""}`}>
                          <dt>{e.nome}</dt>
                          <dd>{q || <em>não marcado</em>}</dd>
                        </div>
                      );
                    })}
                    {etapas.length > 1 && (
                      <div>
                        <dt>Espera</dt>
                        <dd className="tabular">{a.espera?.min !== null && a.espera?.min !== undefined ? textoMinutos(a.espera.min) : "—"}</dd>
                      </div>
                    )}
                  </dl>
                </li>
              ))}
              {achados.length > 50 && <li className="rtn-busca__mais">Mostrando 50 de {achados.length}. Refine a busca.</li>}
            </ul>
          ))}
      </div>
    </Card>
  );
};

const ATUALIZAR_PHOENIX_MS = 5 * 60 * 1000; // chegadas do Phoenix: a cada 5 min (período com hoje)
const MAX_EVENTOS = 30;

/* Ao vivo: o que a equipe acabou de marcar no painel do aeroporto */
const AoVivo = ({ eventos, em, som, onSom }) => {
  const [todos, setTodos] = useState(false);
  const lista = todos ? eventos : eventos.slice(0, 5);
  return (
    <Card className="rtn-vivo">
      <div className="rtn-vivo__topo">
        <span className="rtn-vivo__selo">
          <i aria-hidden="true" /> Ao vivo
        </span>
        <span className="rtn-vivo__quando">{em ? `Atualizado às ${em.toLocaleTimeString("pt-BR")}` : "Conectando…"}</span>
        <button type="button" className={`rtn-vivo__som ${som ? "is-on" : ""}`} onClick={onSom} aria-pressed={som} title={som ? "Desligar o som" : "Ligar o som"}>
          <Icon name="bell" size={14} /> {som ? "Som ligado" : "Som desligado"}
        </button>
      </div>
      {eventos.length === 0 ? (
        <p className="rtn-vivo__vazio">As marcações aparecem aqui assim que a equipe marcar no painel.</p>
      ) : (
        <ul className="rtn-vivo__lista">
          {lista.map((e) => (
            <li key={e.id} className={`is-${e.tipo}`}>
              <i className={`rtn-ic ${e.tipo === "noshow" ? "is-falta" : e.tipo === "marca" && e.etapa > 0 && e.etapa === e.nEtapas - 1 ? "is-emb" : "is-rec"}`}>
                <Icon
                  name={e.tipo === "noshow" ? "x" : e.tipo === "reserva" ? "check" : e.tipo === "completo" ? "circleCheck" : iconeEtapa(e.etapa || 0, e.nEtapas || 2)}
                  size={12}
                />
              </i>
              <time>{e.em ? e.em.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""}</time>
              <span>
                <b>{e.texto}</b>
                <small>{e.detalhe}</small>
              </span>
            </li>
          ))}
          {eventos.length > 5 && (
            <li className="rtn-vivo__mais">
              <button type="button" onClick={() => setTodos((x) => !x)}>
                {todos ? "Mostrar menos" : `Ver todas (${eventos.length})`}
              </button>
            </li>
          )}
        </ul>
      )}
    </Card>
  );
};

const iniciaisDe = (nome = "") =>
  String(nome)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] || "")
    .join("")
    .toUpperCase() || "?";
const marcouAlgo = (l, etapas) => etapas.some((e) => l.etapas[e.id]?.pax || l.etapas[e.id]?.veiculos);

const AtendimentoRelatorio = ({ config, excecoes, onSalvarOcultos }) => {
  const { mostrarToast } = useToast();
  const [atalho, setAtalho] = useState("hoje");
  const [periodo, setPeriodo] = useState(() => ATALHOS[0].calc());
  const [recarregar, setRecarregar] = useState(0);
  const [colabSel, setColabSel] = useState(null); // relatório de um colaborador
  const [inicio, fim] = periodo;
  const chavePeriodo = `${inicio}|${fim}`;
  const dias = listarDatas(inicio, fim);
  const cruzar = dias.length <= MAX_CRUZAR;
  const etapas = useMemo(() => config?.atendimento?.etapas || [], [config]);
  const etapasRef = useRef(etapas);
  useEffect(() => {
    etapasRef.current = etapas;
  }, [etapas]);

  // marcações em TEMPO REAL: cada marca feita no painel chega aqui na hora
  const [marcas, setMarcas] = useState({ periodo: "", docs: [], erro: "", em: null });
  const [eventos, setEventos] = useState({ periodo: "", lista: [] });
  const [som, setSom] = useState(somLigado);
  useEffect(() => {
    const per = `${inicio}|${fim}`;
    let anteriores = null;
    return ouvirAtendimentos(
      inicio,
      fim,
      (docs) => {
        if (anteriores) {
          const novos = eventosNovos(anteriores, docs, etapasRef.current);
          if (novos.length) {
            setEventos((ev) => ({ periodo: per, lista: [...novos, ...(ev.periodo === per ? ev.lista : [])].slice(0, MAX_EVENTOS) }));
            tocarNotificacao();
            mostrarToast(novos.length > 1 ? `${novos[0].texto} (+${novos.length - 1})` : novos[0].texto);
          }
        }
        anteriores = docs;
        setMarcas({ periodo: per, docs, erro: "", em: new Date() });
      },
      (e) => {
        console.error(e);
        setMarcas({ periodo: per, docs: [], erro: "Não foi possível carregar as marcações.", em: null });
      },
    );
  }, [inicio, fim, mostrarToast]);
  const alternarSom = () => {
    const novo = !som;
    definirSom(novo);
    setSom(novo);
    if (novo) tocarNotificacao({ forcar: true });
  };

  // chegadas do Phoenix (até 7 dias): no "Atualizar" e, com hoje no período, a cada 5 min
  const porVoo = useMemo(() => regraPorVoo(config?.atendimento), [config]);
  const [phx, setPhx] = useState({ periodo: "", rec: -1, chegadas: null, erro: "" });
  useEffect(() => {
    let vivo = true;
    const per = `${inicio}|${fim}`;
    const datas = listarDatas(inicio, fim);
    const phoenix =
      datas.length <= MAX_CRUZAR
        ? Promise.all(datas.map((d) => buscarChegadasPorVeiculo(d, { porVoo }).then((g) => [d, g]))).then((pares) => Object.fromEntries(pares))
        : Promise.resolve(null);
    phoenix
      .then((chegadas) => vivo && setPhx({ periodo: per, rec: recarregar, chegadas, erro: "" }))
      .catch(() => {
        // falhou: mantém as chegadas que já estavam na tela (se for o mesmo período)
        if (vivo)
          setPhx((p) => ({ periodo: per, rec: recarregar, chegadas: p.periodo === per ? p.chegadas : null, erro: "O Phoenix não respondeu: os números abaixo são só das marcações." }));
      });
    return () => {
      vivo = false;
    };
  }, [inicio, fim, recarregar, porVoo]);
  useEffect(() => {
    if (fim < hoje()) return undefined;
    const t = setInterval(() => setRecarregar((x) => x + 1), ATUALIZAR_PHOENIX_MS);
    return () => clearInterval(t);
  }, [fim]);

  const carregando = marcas.periodo !== chavePeriodo || phx.periodo !== chavePeriodo;
  const atualizando = !carregando && phx.rec !== recarregar;
  const carga = useMemo(
    () => ({ docs: marcas.docs, chegadas: phx.chegadas, erro: marcas.erro || phx.erro }),
    [marcas, phx],
  );
  const regra = config?.atendimento?.contagem || "dividir";
  const equipe = useMemo(() => (config ? todosDaEquipe(config) : []), [config]);
  const rel = useMemo(() => {
    if (carregando || !config) return null;
    const escalados = inicio === fim ? escalaDoDia(config, excecoes, inicio).flatMap((e) => e.pessoas.map((p) => p.id)) : [];
    return relatorioAtendimento({ docs: carga.docs, etapas, regra, equipe, chegadas: carga.chegadas, escalados });
  }, [carregando, config, carga, etapas, regra, equipe, excecoes, inicio, fim]);

  const escolher = (v) => {
    setAtalho(v);
    setPeriodo(ATALHOS.find((a) => a.value === v).calc());
  };
  const mudarData = (qual) => (e) => {
    const v = e.target.value;
    if (!v) return;
    setAtalho("");
    setPeriodo((p) => (qual === 0 ? [v, p[1] < v ? v : p[1]] : [p[0] > v ? v : p[0], v]));
  };

  // quem sai no relatório: sem os ocultos (configuração) e, se quiser, só quem marcou
  const ocultos = useMemo(() => new Set(config?.atendimento?.ocultos || []), [config]);
  const [soQuemMarcou, setSoQuemMarcou] = useState(true);
  const [verOcultos, setVerOcultos] = useState(false);
  const [todasPend, setTodasPend] = useState(false);
  const [salvandoOculto, setSalvandoOculto] = useState("");
  const relSaida = useMemo(
    () => (rel ? { ...rel, linhas: rel.linhas.filter((l) => !ocultos.has(l.id) && (!soQuemMarcou || marcouAlgo(l, etapas))) } : null),
    [rel, ocultos, soQuemMarcou, etapas],
  );
  const listaOcultos = rel ? rel.linhas.filter((l) => ocultos.has(l.id)) : [];
  const semMarca = rel ? rel.linhas.filter((l) => !ocultos.has(l.id) && !marcouAlgo(l, etapas)).length : 0;
  const linhasTela = rel ? [...relSaida.linhas, ...(verOcultos ? listaOcultos : [])] : [];
  const alternarOculto = async (l) => {
    if (!onSalvarOcultos) return;
    setSalvandoOculto(l.id);
    try {
      const atual = config?.atendimento?.ocultos || [];
      await onSalvarOcultos(ocultos.has(l.id) ? atual.filter((x) => x !== l.id) : [...atual, l.id]);
    } finally {
      setSalvandoOculto("");
    }
  };
  const dadosSaida = relSaida ? { inicio, fim, etapas, rel: relSaida, docs: carga.docs } : null;

  if (config && config.atendimento?.ativo === false) {
    return (
      <EmptyState icon="planeLanding" title="O painel do aeroporto está desligado">
        Ligue em “Configurar escala” → Aeroporto.
      </EmptyState>
    );
  }

  return (
    <div className="rtn-atd">
      <Card className="rtn-filtro">
        <div className="rtn-filtro__linha">
          <Segmented size="sm" ariaLabel="Período" value={atalho} onChange={escolher} options={ATALHOS} />
          <div className="rtn-filtro__datas">
            <Field label="De">
              <input type="date" className="ui-input" value={inicio} onChange={mudarData(0)} />
            </Field>
            <Field label="Até">
              <input type="date" className="ui-input" value={fim} onChange={mudarData(1)} />
            </Field>
          </div>
        </div>
        <div className="rtn-filtro__linha">
          <span className="rtn-atd__dica">
            <Icon name="smartphone" size={14} /> A equipe marca no celular, em <Link to="/atendimento">/atendimento</Link> (conta de nível Atendimento).
          </span>
          <span className="rtn-atd__acoes">
            <select
              className="ui-input rtn-atd__colab"
              value=""
              onChange={(e) => setColabSel(equipe.find((c) => c.id === e.target.value) || null)}
              aria-label="Relatório de um colaborador"
            >
              <option value="">Relatório por colaborador…</option>
              {equipe.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} · {c.turnoNome}
                </option>
              ))}
            </select>
            <Button size="sm" icon="refresh" onClick={() => setRecarregar((x) => x + 1)} loading={carregando || atualizando} disabled={carregando || atualizando} title="Busca de novo as chegadas no Phoenix (as marcações já chegam sozinhas)">
              Atualizar
            </Button>
            <Button size="sm" icon="download" onClick={() => baixarExcelAtendimento(dadosSaida)} disabled={!rel}>
              Excel
            </Button>
            <Button size="sm" variant="primary" icon="printer" onClick={() => imprimirAtendimento(dadosSaida)} disabled={!rel}>
              {inicio === fim ? "Relatório do dia" : "Imprimir / PDF"}
            </Button>
          </span>
        </div>
      </Card>

      {!carregando && (
        <AoVivo eventos={eventos.periodo === chavePeriodo ? eventos.lista : []} em={marcas.em} som={som} onSom={alternarSom} />
      )}

      {carga.erro && !carregando && (
        <div className="rtn-faixa rtn-faixa--aviso" role="status">
          <Icon name="alert" size={16} /> {carga.erro}
        </div>
      )}
      {!cruzar && (
        <div className="rtn-faixa" role="status">
          <Icon name="info" size={16} /> Períodos de mais de {MAX_CRUZAR} dias mostram só as marcações (sem cruzar com o Phoenix nem listar pendentes).
        </div>
      )}

      {!rel ? (
        <p className="rtn-atd__carregando">
          <Icon name="loader" size={16} className="ui-spin" /> Carregando marcações{cruzar ? " e chegadas do Phoenix" : ""}…
        </p>
      ) : (
        <>
          <KpiTiles
            items={[
              ...(rel.phoenix ? [{ key: "phx", label: "Chegaram (Phoenix)", value: num(rel.phoenix.pax, 0), hint: `${rel.phoenix.veiculos} veículos`, icon: "planeLanding" }] : []),
              ...etapas.map((e) => ({
                key: e.id,
                label: `${e.nome} (marcado)`,
                value: num(rel.porEtapa[e.id]?.pax || 0, 0),
                hint: rel.phoenix?.pax
                  ? `${pct((rel.phoenix.porEtapa[e.id] / rel.phoenix.pax) * 100)} dos pax do Phoenix · ${rel.porEtapa[e.id]?.veiculos || 0} veíc.`
                  : `${rel.porEtapa[e.id]?.veiculos || 0} veículos`,
                icon: "circleCheck",
              })),
              ...(rel.phoenix ? [{ key: "pend", label: "Veículos pendentes", value: rel.pendentes.length, hint: "sem alguma etapa marcada", icon: "alert", tone: rel.pendentes.length ? "warning" : undefined }] : []),
              {
                key: "ns",
                label: "No show",
                value: rel.noShow.reservas,
                hint: rel.noShow.reservas ? `${rel.noShow.pax} pax · ${rel.noShow.comCusto.reservas} com custo · ${rel.noShow.semCusto.reservas} sem custo` : "nenhum no período",
                icon: "x",
                tone: rel.noShow.comCusto.reservas ? "alert" : undefined,
              },
            ]}
          />

          <Card>
            <CardHeader
              icon="users"
              title="Por colaborador"
              subtitle={`Pax e % de cada um em cada etapa (${dataBr(inicio)}${inicio !== fim ? ` a ${dataBr(fim)}` : ""}). ${regra === "total" ? "Regra: cada um conta o veículo inteiro." : "Regra: 2 pessoas no mesmo veículo dividem os pax."
                }`}
            />
            <div className="rtn-atd__opc">
              <label className="rtn-atd__check">
                <input type="checkbox" checked={soQuemMarcou} onChange={(e) => setSoQuemMarcou(e.target.checked)} />
                Só quem marcou{semMarca ? ` (${semMarca} sem marcação)` : ""}
              </label>
              {listaOcultos.length > 0 && (
                <button type="button" className="rtn-atd__ocultos" onClick={() => setVerOcultos((x) => !x)}>
                  <Icon name="eyeOff" size={13} /> {listaOcultos.length} fora do relatório{verOcultos ? " · esconder" : " · ver"}
                </button>
              )}
              <span className="rtn-atd__opc-dica">A tabela, a impressão e o Excel saem do mesmo jeito.</span>
            </div>
            {linhasTela.length === 0 ? (
              <p className="rtn-atd__vazio">{rel.linhas.some((l) => marcouAlgo(l, etapas)) ? "Todos que marcaram estão fora do relatório." : "Ninguém marcou atendimento neste período."}</p>
            ) : (
              <div className="rtn-colabs" style={{ "--n": etapas.length }}>
                <div className="rtn-colabs__cab" aria-hidden="true">
                  <span>Colaborador</span>
                  {etapas.map((e, k) => (
                    <span key={e.id}>
                      <i className={`rtn-ic is-${k === 0 ? "rec" : k === etapas.length - 1 ? "emb" : "meio"}`}>
                        <Icon name={iconeEtapa(k, etapas.length)} size={12} />
                      </i>
                      {e.nome}
                    </span>
                  ))}
                  <span />
                </div>
                {linhasTela.map((l) => {
                  const oculto = ocultos.has(l.id);
                  return (
                    <div key={l.id} className={`rtn-colab ${l.foraDaEquipe ? "is-fora" : ""} ${oculto ? "is-oculto" : ""}`}>
                      <span className="rtn-atd__quem">
                        <span className="rtn-atd__avatar" style={{ "--c": l.cor }}>
                          {iniciaisDe(l.nome)}
                        </span>
                        <span>
                          <button type="button" className="rtn-atd__nome" onClick={() => setColabSel(l)} title={`Relatório de ${l.nome}`}>
                            <b>{l.nome}</b>
                          </button>
                          <small>{oculto ? "fora do relatório" : l.foraDaEquipe ? "fora da equipe" : l.turnoNome}</small>
                        </span>
                      </span>
                      {etapas.map((e, k) => {
                        const v = l.etapas[e.id];
                        const maxEtapa = Math.max(1, ...relSaida.linhas.map((x) => x.etapas[e.id]?.pax || 0));
                        return (
                          <span key={e.id} className={`rtn-colab__etapa ${v.pax ? "" : "is-zero"}`} title={`${e.nome}: ${num(v.pax, 1)} pax · ${v.veiculos} veículo(s)${v.pax ? ` · ${pct(v.pct)} do dia` : ""}`}>
                            <i className={`rtn-ic is-${k === 0 ? "rec" : k === etapas.length - 1 ? "emb" : "meio"} ${v.pax ? "" : "is-off"}`}>
                              <Icon name={iconeEtapa(k, etapas.length)} size={13} />
                            </i>
                            <span className="rtn-colab__num">
                              <b className="tabular">{num(v.pax, 1)}</b>
                              <small>
                                pax · {v.veiculos} <Icon name="car" size={11} />
                              </small>
                            </span>
                            <span className="rtn-colab__barra" aria-hidden="true">
                              <span style={{ width: `${(v.pax / maxEtapa) * 100}%`, background: l.cor }} />
                            </span>
                            <span className="rtn-colab__pct tabular">{v.pax ? pct(v.pct) : "—"}</span>
                          </span>
                        );
                      })}
                      <span className="rtn-atd__acao">
                        {onSalvarOcultos && (
                          <button
                            type="button"
                            onClick={() => alternarOculto(l)}
                            disabled={salvandoOculto === l.id}
                            title={oculto ? "Voltar a mostrar no relatório" : "Tirar do relatório (tela, impressão e Excel)"}
                            aria-label={oculto ? `Mostrar ${l.nome} no relatório` : `Ocultar ${l.nome} do relatório`}
                          >
                            <Icon name={salvandoOculto === l.id ? "loader" : oculto ? "eye" : "eyeOff"} size={15} className={salvandoOculto === l.id ? "ui-spin" : undefined} />
                          </button>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {rel.phoenix && (
            <Card>
              <CardHeader
                icon="alert"
                title={`Veículos sem marcação (${rel.pendentes.length})`}
                subtitle="Chegadas do Phoenix em que falta alguma etapa. Peça para quem atendeu marcar no painel."
              />
              {rel.pendentes.length === 0 ? (
                <p className="rtn-atd__vazio">
                  <Icon name="circleCheck" size={16} /> Tudo marcado.
                </p>
              ) : (
                <ul className="rtn-pend">
                  {(todasPend ? rel.pendentes : rel.pendentes.slice(0, 8)).map((g) => (
                    <li key={`${g.data}-${g.chave}`}>
                      <span className="rtn-pend__hora tabular">
                        {inicio !== fim && <small>{dataBr(g.data).slice(0, 5)}</small>}
                        {g.hora || "--:--"}
                      </span>
                      <span className="rtn-pend__info">
                        <span className="rtn-pend__voos">
                          {(g.voos.length ? g.voos : ["Sem voo"]).map((v) => (
                            <span key={v} className="rtn-pend__voo">
                              <Icon name="planeLanding" size={12} /> {v}
                            </span>
                          ))}
                        </span>
                        <span className="rtn-pend__veic">
                          <Icon name="car" size={13} /> {g.veiculo || "sem veículo"}
                          <span className="rtn-pend__pax">
                            <Icon name="users" size={12} /> {g.pax}
                          </span>
                        </span>
                      </span>
                      <span className="rtn-pend__etapas">
                        {etapas.map((e, k) => {
                          const falta = g.faltando.includes(e.nome);
                          return (
                            <i key={e.id} className={`rtn-ic ${falta ? "is-falta" : `is-${k === 0 ? "rec" : k === etapas.length - 1 ? "emb" : "meio"}`}`} title={`${e.nome}: ${falta ? "falta marcar" : "marcado"}`}>
                              <Icon name={falta ? "x" : iconeEtapa(k, etapas.length)} size={12} />
                            </i>
                          );
                        })}
                      </span>
                    </li>
                  ))}
                  {rel.pendentes.length > 8 && (
                    <li className="rtn-pend__mais">
                      <Button size="sm" variant="ghost" onClick={() => setTodasPend((x) => !x)}>
                        {todasPend ? "Mostrar menos" : `Ver todos (${rel.pendentes.length})`}
                      </Button>
                    </li>
                  )}
                </ul>
              )}
            </Card>
          )}

          <NoShowCard resumo={rel.noShow} variosDias={inicio !== fim} />

          {etapas.length > 1 && <TempoEspera docs={carga.docs} etapas={etapas} />}

          <BuscaReserva
            docs={carga.docs}
            chegadas={carga.chegadas}
            etapas={etapas}
            inicio={inicio}
            fim={fim}
            equipe={equipe}
            onAbrirColaborador={setColabSel}
          />
        </>
      )}
      {colabSel && (
        <RelatorioColaborador
          key={colabSel.id}
          pessoa={colabSel}
          docsFiltro={carga.docs}
          inicioFiltro={inicio}
          fimFiltro={fim}
          etapas={etapas}
          regra={regra}
          onClose={() => setColabSel(null)}
        />
      )}
    </div>
  );
};

export default AtendimentoRelatorio;
