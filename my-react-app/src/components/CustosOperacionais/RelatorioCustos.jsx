import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Icon,
  KpiTiles,
  Segmented,
  Table,
  TableHead,
  TableRow,
  useToast,
} from "../ui";
import {
  NOME_CATEGORIA,
  NOME_TIPO,
  descreverServico,
  formatarReais,
  linhasParaCsv,
  resumirPeriodo,
} from "../../Services/Services/custosCalculo";
import { calcularDiasPelaTabela, carregarCustosPeriodo } from "../../Services/Services/custosRepository";
import { baixarArquivo, dataBr, dataCurta, diaDaSemana, hojeIso, isoLocal, listarDatas, somarDias } from "./custosDatas";

const MAX_DIAS = 93;

const ATALHOS = [
  { value: "7", label: "7 dias", calc: () => [somarDias(hojeIso(), -6), hojeIso()] },
  {
    value: "semana",
    label: "Esta semana",
    calc: () => {
      const d = new Date();
      const seg = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7), 12);
      return [isoLocal(seg), hojeIso()];
    },
  },
  {
    value: "mes",
    label: "Este mês",
    calc: () => {
      const d = new Date();
      return [isoLocal(new Date(d.getFullYear(), d.getMonth(), 1, 12)), hojeIso()];
    },
  },
  {
    value: "mesPassado",
    label: "Mês passado",
    calc: () => {
      const d = new Date();
      return [isoLocal(new Date(d.getFullYear(), d.getMonth() - 1, 1, 12)), isoLocal(new Date(d.getFullYear(), d.getMonth(), 0, 12))];
    },
  },
  { value: "30", label: "30 dias", calc: () => [somarDias(hojeIso(), -29), hojeIso()] },
];

const NOME_AGRUPAMENTO = {
  tipo: (k) => NOME_TIPO[k] || k,
  categoria: (k) => NOME_CATEGORIA[k] || "Sem categoria",
};

/* ---------------- custo por dia (colunas) ---------------- */
const escalaLimpa = (max) => {
  if (max <= 0) return 100;
  const pot = 10 ** Math.floor(Math.log10(max));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * pot).find((p) => max / p <= 4) || pot * 10;
  return Math.ceil(max / passo) * passo;
};

const GraficoDias = ({ dias }) => {
  const max = escalaLimpa(Math.max(...dias.map((d) => d.total), 0));
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f));
  const [foco, setFoco] = useState(null);
  const ativo = foco !== null ? dias[foco] : null;
  const media = dias.filter((d) => d.status !== "sem-lancamento").reduce((s, d, _i, arr) => s + d.total / arr.length, 0);

  return (
    <div className="cst-graf">
      <div className="cst-graf__eixo" aria-hidden="true">
        {ticks
          .slice()
          .reverse()
          .map((t) => (
            <span key={t}>{t >= 1000 ? `${(t / 1000).toLocaleString("pt-BR")} mil` : t.toLocaleString("pt-BR")}</span>
          ))}
      </div>
      <div className="cst-graf__area" onMouseLeave={() => setFoco(null)}>
        <div className="cst-graf__grade" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} style={{ bottom: `${(t / max) * 100}%` }} />
          ))}
        </div>
        <div className="cst-graf__colunas" style={{ "--n": dias.length }}>
          {dias.map((d, i) => (
            <button
              key={d.data}
              type="button"
              className={`cst-graf__col ${d.status === "sem-lancamento" ? "is-vazio" : ""} ${foco === i ? "is-foco" : ""}`}
              onMouseEnter={() => setFoco(i)}
              onFocus={() => setFoco(i)}
              onBlur={() => setFoco(null)}
              aria-label={`${dataBr(d.data)}: ${d.status === "sem-lancamento" ? "sem lançamento" : formatarReais(d.total)}`}
            >
              <span className="cst-graf__barra" style={{ height: d.status === "sem-lancamento" ? "3px" : `${Math.max(2, (d.total / max) * 100)}%` }} />
            </button>
          ))}
        </div>
        {ativo && (
          <div className="cst-graf__dica" style={{ left: `${((foco + 0.5) / dias.length) * 100}%` }} role="status">
            <b>
              {diaDaSemana(ativo.data)} {dataCurta(ativo.data)}
            </b>
            {ativo.status === "sem-lancamento" ? (
              <span>Sem lançamento</span>
            ) : (
              <>
                <span className="tabular">{formatarReais(ativo.total)}</span>
                <small>
                  Fornecedores {formatarReais(ativo.fornecedores, { semCentavos: true })} · Guias {formatarReais(ativo.guias, { semCentavos: true })}
                </small>
                <small>
                  {ativo.servicos} serviço(s) · {ativo.status === "conferido" ? "conferido" : "rascunho"}
                  {ativo.pendencias ? ` · ${ativo.pendencias} pendência(s)` : ""}
                </small>
              </>
            )}
          </div>
        )}
      </div>
      <div className="cst-graf__datas" aria-hidden="true" style={{ "--n": dias.length }}>
        {dias.map((d, i) => (
          <span key={d.data}>{dias.length <= 16 || i % Math.ceil(dias.length / 12) === 0 ? dataCurta(d.data) : ""}</span>
        ))}
      </div>
      {media > 0 && <p className="cst-graf__nota">Média dos dias lançados: {formatarReais(media)}</p>}
    </div>
  );
};

/* ---------------- ranking em barras ---------------- */
const Ranking = ({ itens, nome = (k) => k, mostrarCasados = false, vazio = "Nada no período." }) => {
  const max = Math.max(1, ...itens.map((i) => i.valor));
  if (!itens.length) return <p className="cst-nada">{vazio}</p>;
  return (
    <ul className="cst-barras">
      {itens.map((g) => (
        <li key={g.chave}>
          <div className="cst-barras__topo">
            <span>{nome(g.chave)}</span>
            <b className="tabular">{formatarReais(g.valor)}</b>
          </div>
          <div className="cst-barras__trilho" aria-hidden="true">
            <span style={{ width: `${(g.valor / max) * 100}%` }} />
          </div>
          <small>
            {g.servicos} serviço(s)
            {g.porPax ? ` · ${g.reservas} reserva(s)` : ""}
            {g.pax ? ` · ${g.pax} pax` : ""}
            {mostrarCasados && g.casados ? ` · ${g.casados} casado(s)` : ""}
            {g.economia ? ` · economia ${formatarReais(g.economia, { semCentavos: true })}` : ""}
            {g.pendentes ? ` · ${g.pendentes} a confirmar` : ""}
          </small>
        </li>
      ))}
    </ul>
  );
};

/* =========================================================
   TELA
   ========================================================= */
const RelatorioCustos = ({ config, pronto, vinculos, fornecedores }) => {
  const { mostrarToast } = useToast();
  const [atalho, setAtalho] = useState("mes");
  const [periodo, setPeriodo] = useState(() => ATALHOS.find((a) => a.value === "mes").calc());
  const [docs, setDocs] = useState(null);
  const [erro, setErro] = useState("");
  const [recarga, setRecarga] = useState(0);
  const [agrupamento, setAgrupamento] = useState("tipo");
  const [calculando, setCalculando] = useState(null); // {feitos, total}

  const [inicio, fim] = periodo;
  const datas = useMemo(() => listarDatas(inicio, fim), [inicio, fim]);
  const periodoGrande = datas.length > MAX_DIAS;

  useEffect(() => {
    if (!datas.length || periodoGrande) return undefined;
    let vivo = true;
    setDocs(null);
    setErro("");
    carregarCustosPeriodo(datas)
      .then((d) => vivo && setDocs(d))
      .catch((e) => {
        console.error(e);
        if (vivo) {
          setErro("Não foi possível carregar os custos do período.");
          setDocs([]);
        }
      });
    return () => {
      vivo = false;
    };
  }, [datas, periodoGrande, recarga]);

  const resumo = useMemo(() => (docs ? resumirPeriodo(docs, datas) : null), [docs, datas]);
  const t = resumo?.total;
  const carregando = !resumo;

  const escolherAtalho = (valor) => {
    setAtalho(valor);
    setPeriodo(ATALHOS.find((a) => a.value === valor).calc());
  };

  const mudarData = (qual) => (e) => {
    const v = e.target.value;
    if (!v) return;
    setAtalho("");
    setPeriodo((p) => (qual === 0 ? [v, p[1] < v ? v : p[1]] : [p[0] > v ? v : p[0], v]));
  };

  // só dias que já passaram (ou hoje): os futuros ainda podem mudar no Phoenix
  const faltantes = useMemo(() => (resumo ? resumo.diasSemLancamento.filter((d) => d <= hojeIso()) : []), [resumo]);

  const calcularFaltantes = useCallback(async () => {
    if (!faltantes.length) return;
    if (!window.confirm(`Calcular ${faltantes.length} dia(s) sem lançamento pela tabela de tarifas? Os dados vêm do Phoenix e ficam como rascunho.`)) return;
    setCalculando({ feitos: 0, total: faltantes.length });
    const { falhas } = await calcularDiasPelaTabela(faltantes, { config, vinculos, fornecedores }, (feitos, total) =>
      setCalculando({ feitos, total }),
    );
    setCalculando(null);
    mostrarToast(falhas.length ? `${falhas.length} dia(s) sem resposta do Phoenix` : "Dias calculados");
    setRecarga((n) => n + 1);
  }, [faltantes, config, vinculos, fornecedores, mostrarToast]);

  const exportar = () => {
    if (!resumo) return;
    baixarArquivo(linhasParaCsv(resumo.linhas), `custos-${inicio}-a-${fim}.csv`);
  };

  const agrupado = resumo
    ? { tipo: resumo.porTipo, categoria: resumo.porCategoria, regiao: resumo.porRegiao }[agrupamento]
    : [];

  const acima = useMemo(
    () => (resumo ? resumo.linhas.filter((l) => l.calc.acimaDaTabela > 0).sort((a, b) => b.calc.acimaDaTabela - a.calc.acimaDaTabela) : []),
    [resumo],
  );

  return (
    <div className="cst-relatorio">
      <div className="cst-barra-dia">
        <div className="cst-periodo">
          <Segmented size="sm" ariaLabel="Período" value={atalho} onChange={escolherAtalho} options={ATALHOS} />
          <div className="cst-periodo__datas">
            <Field label="De">
              <input type="date" value={inicio} onChange={mudarData(0)} />
            </Field>
            <Field label="Até">
              <input type="date" value={fim} onChange={mudarData(1)} />
            </Field>
          </div>
        </div>
        <div className="cst-barra-dia__acoes">
          <Button icon="refresh" onClick={() => setRecarga((n) => n + 1)} disabled={carregando}>
            Atualizar
          </Button>
          <Button icon="download" onClick={exportar} disabled={!resumo?.linhas.length}>
            Exportar CSV
          </Button>
        </div>
      </div>

      {periodoGrande ? (
        <EmptyState icon="calendar" title="Período grande demais">
          Escolha até {MAX_DIAS} dias.
        </EmptyState>
      ) : (
        <>
          {erro && (
            <div className="cst-faixa cst-faixa--alerta" role="status">
              <Icon name="alert" size={16} />
              <span>{erro}</span>
            </div>
          )}

          {resumo && faltantes.length > 0 && (
            <div className="cst-faixa cst-faixa--aviso" role="status">
              <Icon name="calendar" size={16} />
              <span>
                <b>{faltantes.length} dia(s)</b> do período ainda sem lançamento — ninguém abriu o custo desses dias. Dá para calcular pela tabela agora (fica como rascunho).
              </span>
              <Button size="sm" icon="sparkles" onClick={calcularFaltantes} loading={!!calculando} disabled={!pronto}>
                {calculando ? `Calculando ${calculando.feitos}/${calculando.total}` : "Calcular pela tabela"}
              </Button>
            </div>
          )}

          <KpiTiles
            items={[
              {
                key: "total",
                label: "Custo operacional",
                value: t ? formatarReais(t.total, { semCentavos: true }) : "",
                hint: t ? `${t.servicos} serviços · ${t.pax} pax` : "",
                icon: "coins",
                loading: carregando,
              },
              {
                key: "forn",
                label: "Fornecedores",
                value: t ? formatarReais(t.fornecedores, { semCentavos: true }) : "",
                hint: t && t.semValor ? `${t.semValor} serviço(s) sem valor` : "veículos e motoristas",
                icon: "truck",
                tone: t?.semValor ? "warning" : undefined,
                loading: carregando,
              },
              {
                key: "guias",
                label: "Guias",
                value: t ? formatarReais(t.guias, { semCentavos: true }) : "",
                hint: t && t.guiasAConfirmar ? `+ ${t.guiasAConfirmar} a confirmar (ref. ${formatarReais(t.guiasAConfirmarRef, { semCentavos: true })})` : "valores lançados",
                icon: "user",
                tone: t?.guiasAConfirmar ? "warning" : undefined,
                loading: carregando,
              },
              {
                key: "economia",
                label: "Economia",
                value: t ? formatarReais(t.economia + t.noShowEconomia, { semCentavos: true }) : "",
                hint: t
                  ? `casados ${formatarReais(t.economiaCasado, { semCentavos: true })} · negociado ${formatarReais(t.economiaNegociada, { semCentavos: true })}${t.noShowEconomia ? ` · no-show ${formatarReais(t.noShowEconomia, { semCentavos: true })}` : ""}`
                  : "",
                icon: "trendingDown",
                loading: carregando,
              },
              {
                key: "pax",
                label: "Custo por pax",
                value: t ? formatarReais(t.custoPorPax) : "",
                hint: t ? `${t.diasComLancamento}/${datas.length} dias lançados · ${t.diasConferidos} conferidos` : "",
                icon: "users",
                loading: carregando,
              },
            ]}
          />

          {resumo && resumo.total.servicos === 0 && !faltantes.length ? (
            <EmptyState icon="barChart" title="Sem custos lançados neste período">
              Abra o Custo do dia para que os serviços sejam calculados.
            </EmptyState>
          ) : (
            <div className="cst-rel-grade">
              <Card className="cst-card cst-rel-dias">
                <CardHeader icon="barChart" title="Custo por dia" subtitle="Fornecedores + guias lançados. Passe o mouse para ver o detalhe." />
                {resumo ? <GraficoDias dias={resumo.porDia} /> : <div className="ui-sk ui-sk--barra cst-sk-graf" />}
              </Card>

              <Card className="cst-card">
                <CardHeader icon="truck" title="Por fornecedor" subtitle="Valor, serviços e economia com casados." />
                {resumo ? <Ranking itens={resumo.porFornecedor} mostrarCasados /> : <div className="ui-sk ui-sk--barra" />}
              </Card>

              <Card className="cst-card">
                <CardHeader
                  icon="list"
                  title="Para onde vai o custo"
                  actions={
                    <Segmented
                      size="sm"
                      ariaLabel="Agrupar por"
                      value={agrupamento}
                      onChange={setAgrupamento}
                      options={[
                        { value: "tipo", label: "Tipo" },
                        { value: "categoria", label: "Veículo" },
                        { value: "regiao", label: "Região" },
                      ]}
                    />
                  }
                />
                {resumo ? (
                  <Ranking itens={agrupado} nome={NOME_AGRUPAMENTO[agrupamento] || ((k) => k)} />
                ) : (
                  <div className="ui-sk ui-sk--barra" />
                )}
              </Card>

              <Card className="cst-card">
                <CardHeader icon="user" title="Guias" subtitle="Valores pagos lançados; “a confirmar” ainda sem valor." />
                {resumo ? <Ranking itens={resumo.porGuia} vazio="Nenhum guia em serviço de transfer/passeio no período." /> : <div className="ui-sk ui-sk--barra" />}
              </Card>

              <Card className="cst-card">
                <CardHeader icon="alert" title="Condições especiais" subtitle="No-show, parceiros por passageiro e adicionais de guia." />
                {resumo ? (
                  <dl className="cst-cond">
                    <div>
                      <dt>No-show</dt>
                      <dd>
                        <span>
                          <b className="tabular">{t.noShowQtd}</b> serviço(s){t.noShowInQtd ? ` · ${t.noShowInQtd} chegada(s)` : ""}
                        </span>
                        <small>
                          Pago {formatarReais(t.noShowPago)} · deixou de pagar <b className="cst-eco">{formatarReais(t.noShowEconomia)}</b>
                        </small>
                      </dd>
                    </div>
                    {resumo.porParceiro.map((p) => (
                      <div key={p.chave}>
                        <dt>Parceiro — {p.chave}</dt>
                        <dd>
                          <span>
                            <b className="tabular">{p.reservas}</b> reserva(s) · <b className="tabular">{p.pax}</b> pax
                          </span>
                          <small>
                            {p.servicos} saída(s) · pago {formatarReais(p.valor)}
                            {p.pax ? ` · ${formatarReais(p.valor / p.pax)} por pax` : ""}
                          </small>
                        </dd>
                      </div>
                    ))}
                    <div>
                      <dt>Guia — tabela MI</dt>
                      <dd>
                        <span>
                          <b className="tabular">{t.guiaMiQtd}</b> serviço(s)
                        </span>
                        <small>Pago {formatarReais(t.guiaMiValor)}</small>
                      </dd>
                    </div>
                    <div>
                      <dt>Guia — adicional de idioma</dt>
                      <dd>
                        <span>
                          <b className="tabular">{t.guiaIdiomaQtd}</b> serviço(s)
                        </span>
                        <small>
                          Pago {formatarReais(t.guiaIdiomaValor)} · adicional {formatarReais(t.guiaAdicional)}
                        </small>
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <div className="ui-sk ui-sk--barra" />
                )}
              </Card>

              {acima.length > 0 && (
                <Card className="cst-card cst-rel-acima">
                  <CardHeader
                    icon="trendingUp"
                    title="Cobrado acima da tabela"
                    subtitle={`${acima.length} serviço(s) · ${formatarReais(t.acimaDaTabela)} a mais que a tarifa. Confira se a tabela está desatualizada.`}
                  />
                  <Table columns="96px 70px minmax(200px, 1.6fr) minmax(140px, 1fr) 110px 110px" minWidth={720} compact>
                    <TableHead>
                      <span>Data</span>
                      <span>Tipo</span>
                      <span>Serviço</span>
                      <span>Fornecedor</span>
                      <span className="ui-cell-end">Tabela</span>
                      <span className="ui-cell-end">Cobrado</span>
                    </TableHead>
                    {acima.slice(0, 20).map((l) => (
                      <TableRow key={`${l.data}-${l.chave}`}>
                        <span className="tabular">
                          {dataCurta(l.data)} {l.hora}
                        </span>
                        <span>
                          <span className={`ui-tag cst-tipo cst-tipo--${l.tipo}`}>{NOME_TIPO[l.tipo]}</span>
                        </span>
                        <span>{descreverServico(l)}</span>
                        <span>{l.calc.fornecedor || "—"}</span>
                        <span className="ui-cell-num">{formatarReais(l.calc.tarifaCheia)}</span>
                        <span className="ui-cell-num cst-acima">{formatarReais(l.calc.valorFornecedor)}</span>
                      </TableRow>
                    ))}
                  </Table>
                </Card>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default RelatorioCustos;
