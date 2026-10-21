import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, CardHeader, EmptyState, Field, Icon, KpiTiles, Segmented } from "../ui";
import { dataBr, escalaDoDia, isoLocal, listarDatas, num, somarDias, todosDaEquipe } from "../../Services/Services/relatorioTurnos";
import {
  buscarChegadasPorVeiculo,
  buscarReserva,
  horaDe,
  listarAtendimentos,
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
              <b className="tabular">{textoMinutos(r.media)}</b>
              <span>espera média por {unidade}</span>
            </div>
            <div>
              <b className="tabular">{textoMinutos(r.mediaPax)}</b>
              <span>espera média por passageiro</span>
            </div>
            <div>
              <b className="tabular">{textoMinutos(r.mediana)}</b>
              <span>metade {ehReserva ? "das reservas" : "dos veículos"} esperou até</span>
            </div>
            <div>
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
          <div className="rtn-semana">
            <table className="rtn-esp__tab">
              <thead>
                <tr>
                  <th>{ehReserva ? "Reserva" : "Voo / veículo"}</th>
                  <th>Pax</th>
                  <th>{ini.nome}</th>
                  <th>{fim.nome}</th>
                  <th>Espera</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((x, k) => (
                  <tr key={`${x.doc.id}-${k}`}>
                    <td>
                      {ehReserva ? (
                        <>
                          <b>{x.reserva.titular || "Sem nome"}</b>
                          <small>
                            {" "}
                            · {x.reserva.codigo || "sem código"} · {variosDias ? `${dataBr(x.doc.data).slice(0, 5)} ` : ""}
                            {x.doc.hora || "--:--"} {(x.doc.voos || []).join(", ")}
                          </small>
                        </>
                      ) : (
                        <>
                          <b>
                            {variosDias ? `${dataBr(x.doc.data).slice(0, 5)} ` : ""}
                            {x.doc.hora || "--:--"} · {(x.doc.voos || []).join(", ") || "Sem voo"}
                          </b>
                          <small> · {x.doc.veiculo || "sem veículo"}</small>
                        </>
                      )}
                    </td>
                    <td className="tabular">{ehReserva ? x.reserva.pax : x.doc.pax}</td>
                    <td>{ehReserva ? quemHora(x.espera.inicio) : quemComHora(x.doc, ini.id)}</td>
                    <td>{ehReserva ? quemHora(x.espera.fim) : quemComHora(x.doc, fim.id)}</td>
                    <td className={`tabular ${x.espera.min > 60 ? "is-alerta" : x.espera.min > 30 ? "is-aviso" : ""}`}>
                      <b>{x.espera.min === null ? "sem horário" : textoMinutos(x.espera.min)}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
              <b>{resumo.comCusto.reservas}</b> com custo · {resumo.comCusto.pax} pax
            </span>
            <span className="is-sem_custo">
              <b>{resumo.semCusto.reservas}</b> sem custo · {resumo.semCusto.pax} pax
            </span>
          </div>
          <div className="rtn-semana">
            <table className="rtn-ns-tab">
              <thead>
                <tr>
                  <th>{variosDias ? "Dia / hora" : "Hora"}</th>
                  <th>Reserva</th>
                  <th>Voo / veículo</th>
                  <th>Pax</th>
                  <th>Tipo</th>
                  <th>Informado por</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((n) => (
                  <tr key={`${n.docId}-${n.chave}`}>
                    <td className="tabular">
                      {variosDias ? `${dataBr(n.data).slice(0, 5)} ` : ""}
                      {n.hora || "--:--"}
                    </td>
                    <td>
                      <b>{n.titular || "Sem nome"}</b>
                      <small>
                        {" "}
                        · {n.codigo || "sem código"}
                        {n.hotel ? ` · ${n.hotel}` : ""}
                      </small>
                    </td>
                    <td>
                      {(n.voos || []).join(", ") || n.voo || "—"}
                      <small> · {n.veiculo || "sem veículo"}</small>
                    </td>
                    <td className="tabular">
                      {n.pax}
                      <small> ({textoPax(n)})</small>
                    </td>
                    <td>
                      <span className={`rtn-ns-tag is-${n.tipo}`}>{n.tipo === "com_custo" ? "Com custo" : "Sem custo"}</span>
                    </td>
                    <td>
                      {n.porNome || "—"}
                      <small> {horaDe(n.em)}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

const AtendimentoRelatorio = ({ config, excecoes }) => {
  const [atalho, setAtalho] = useState("hoje");
  const [periodo, setPeriodo] = useState(() => ATALHOS[0].calc());
  const [recarregar, setRecarregar] = useState(0);
  const [carga, setCarga] = useState({ chave: "", docs: [], chegadas: null, erro: "" });
  const [colabSel, setColabSel] = useState(null); // relatório de um colaborador
  const [inicio, fim] = periodo;
  const chave = `${inicio}|${fim}|${recarregar}`;
  const dias = listarDatas(inicio, fim);
  const cruzar = dias.length <= MAX_CRUZAR;

  useEffect(() => {
    let vivo = true;
    const datas = listarDatas(inicio, fim);
    const phoenix =
      datas.length <= MAX_CRUZAR
        ? Promise.all(datas.map((d) => buscarChegadasPorVeiculo(d).then((g) => [d, g]))).then((pares) => Object.fromEntries(pares))
        : Promise.resolve(null);
    Promise.all([listarAtendimentos(inicio, fim), phoenix.catch(() => "erro")])
      .then(([docs, chegadas]) => {
        if (!vivo) return;
        setCarga({ chave, docs, chegadas: chegadas === "erro" ? null : chegadas, erro: chegadas === "erro" ? "O Phoenix não respondeu: os números abaixo são só das marcações." : "" });
      })
      .catch((e) => {
        console.error(e);
        if (vivo) setCarga({ chave, docs: [], chegadas: null, erro: "Não foi possível carregar as marcações." });
      });
    return () => {
      vivo = false;
    };
  }, [inicio, fim, chave]);

  const etapas = useMemo(() => config?.atendimento?.etapas || [], [config]);
  const regra = config?.atendimento?.contagem || "dividir";
  const carregando = carga.chave !== chave;
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

  const dadosSaida = rel ? { inicio, fim, etapas, rel, docs: carga.docs } : null;
  const max = rel ? Math.max(1, ...rel.linhas.map((l) => l.etapas[etapas[0]?.id]?.pax || 0)) : 1;

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
            <Button size="sm" icon="refresh" onClick={() => setRecarregar((x) => x + 1)} loading={carregando} disabled={carregando}>
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
            {rel.linhas.length === 0 ? (
              <p className="rtn-atd__vazio">Ninguém marcou atendimento neste período.</p>
            ) : (
              <div className="rtn-semana">
                <table className="rtn-atd__tab">
                  <thead>
                    <tr>
                      <th>Colaborador</th>
                      {etapas.map((e) => (
                        <th key={e.id} colSpan={2}>
                          {e.nome}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rel.linhas.map((l) => (
                      <tr key={l.id} className={l.foraDaEquipe ? "is-fora" : ""}>
                        <td>
                          <i className="rtn-dot" style={{ background: l.cor }} />
                          <button type="button" className="rtn-atd__nome" onClick={() => setColabSel(l)} title={`Relatório de ${l.nome}`}>
                            <b>{l.nome}</b>
                          </button>
                          <small> · {l.foraDaEquipe ? "fora da equipe" : l.turnoNome}</small>
                        </td>
                        {etapas.map((e, i) => {
                          const v = l.etapas[e.id];
                          return [
                            <td key={`${e.id}-p`} className="tabular rtn-atd__pax">
                              {i === 0 && <span className="rtn-atd__barra" style={{ width: `${(v.pax / max) * 100}%`, background: l.cor }} aria-hidden="true" />}
                              <b>{num(v.pax, 1)}</b> <small>· {v.veiculos} veíc.</small>
                            </td>,
                            <td key={`${e.id}-c`} className="tabular">
                              {v.pax ? pct(v.pct) : "—"}
                            </td>,
                          ];
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                <ul className="rtn-atd__pend">
                  {rel.pendentes.map((g) => (
                    <li key={`${g.data}-${g.chave}`}>
                      <b className="tabular">{inicio !== fim ? `${dataBr(g.data).slice(0, 5)} ` : ""}{g.hora || "--:--"}</b>
                      <span>
                        {g.voos.join(", ") || "Sem voo"} · {g.veiculo || "sem veículo"} · {g.pax} pax
                      </span>
                      <em>falta {g.faltando.join(" e ").toLowerCase()}</em>
                    </li>
                  ))}
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
