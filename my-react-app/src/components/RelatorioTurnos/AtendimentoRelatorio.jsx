import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, CardHeader, EmptyState, Field, Icon, KpiTiles, Segmented } from "../ui";
import { dataBr, escalaDoDia, isoLocal, listarDatas, num, somarDias, todosDaEquipe } from "../../Services/Services/relatorioTurnos";
import { buscarChegadasPorVeiculo, listarAtendimentos, relatorioAtendimento } from "../../Services/Services/atendimentoAeroporto";
import { baixarExcelAtendimento, imprimirAtendimento } from "./impressaoAtendimento";

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

const AtendimentoRelatorio = ({ config, excecoes }) => {
  const [atalho, setAtalho] = useState("hoje");
  const [periodo, setPeriodo] = useState(() => ATALHOS[0].calc());
  const [recarregar, setRecarregar] = useState(0);
  const [carga, setCarga] = useState({ chave: "", docs: [], chegadas: null, erro: "" });
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
        Ligue em “Turnos e equipe” → Atendimento no aeroporto.
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
            ]}
          />

          <Card>
            <CardHeader
              icon="users"
              title="Por colaborador"
              subtitle={`Pax e % de cada um em cada etapa (${dataBr(inicio)}${inicio !== fim ? ` a ${dataBr(fim)}` : ""}). ${
                regra === "total" ? "Regra: cada um conta o veículo inteiro." : "Regra: 2 pessoas no mesmo veículo dividem os pax."
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
                          <b>{l.nome}</b>
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
        </>
      )}
    </div>
  );
};

export default AtendimentoRelatorio;
