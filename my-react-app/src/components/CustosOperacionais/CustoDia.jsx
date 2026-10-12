import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Icon,
  KpiTiles,
  SearchInput,
  Segmented,
  StatusDot,
  Table,
  TableHead,
  TableRow,
  useToast,
} from "../ui";
import { useAuth } from "../../Context/AuthContext";
import {
  NOME_CATEGORIA,
  NOME_TIPO,
  calcularLinha,
  chaveTexto,
  detectarApoios,
  detectarCasados,
  formatarReais,
  linhasParaCsv,
  linhasParaGravar,
  listaDeFornecedores,
  mapaFornecedorPorVeiculo,
  recomendarTrocas,
  retratoDaLinha,
  servicoDoRetrato,
} from "../../Services/Services/custosCalculo";
import {
  buscarServicosDoDia,
  excluirLinha,
  fixarCategoriaVeiculo,
  gravarLancamento,
  gravarRetratos,
  marcarStatusDia,
  ouvirCustosDia,
  registrarRegioes,
  salvarVinculoVeiculo,
} from "../../Services/Services/custosRepository";
import CampoValor from "./CampoValor";
import CardsPorVeiculo from "./CardsPorVeiculo";
import CardRecomendacoes from "./Recomendacoes";
import DetalheServico from "./DetalheServico";
import {
  baixarArquivo,
  dataBr,
  diaDaSemanaLongo,
  gravarPreferencia,
  hojeIso,
  idDoCardVeiculo,
  lerPreferencia,
  somarDias,
} from "./custosDatas";

const LS_VISAO = "custos_dia_visao";

const COLUNAS = "70px minmax(210px, 1.7fr) minmax(190px, 1.3fr) 168px minmax(180px, 1.2fr) 112px 44px";

const ORIGEM_TEXTO = {
  lancado: "Lançado",
  tarifa: "Tabela",
  "tarifa-casada": "Tabela · casado",
  "sem-tarifa": "Sem tarifa",
};

const textoBusca = (l) =>
  chaveTexto(
    [l.descricao, l.regiaoTexto, l.veiculo, l.placa, l.motorista, l.fornecedor, l.guiaNome, l.hoteis?.join(" "), l.passeio].join(" "),
  );

/* ---------------- célula do valor do fornecedor ---------------- */
const CelulaFornecedor = ({ linha, onSalvar }) => {
  const lancado = linha.origemValor === "lancado";
  return (
    <div className="cst-cel-valor">
      <CampoValor
        key={`${linha.chave}-${lancado ? linha.valorFornecedor : "auto"}`}
        valor={lancado ? linha.valorFornecedor : null}
        placeholder={
          linha.tarifaAplicada !== null
            ? linha.tarifaAplicada.toLocaleString("pt-BR", { minimumFractionDigits: 2 })
            : "Sem tarifa"
        }
        destaque={linha.origemValor === "sem-tarifa"}
        ariaLabel={`Valor do fornecedor — ${linha.descricao}`}
        onSalvar={onSalvar}
      />
      <span className={`cst-origem cst-origem--${linha.origemValor}`}>
        {ORIGEM_TEXTO[linha.origemValor]}
        {lancado && linha.tarifaCheia !== null && linha.valorFornecedor !== linha.tarifaCheia
          ? ` · tabela ${formatarReais(linha.tarifaCheia, { semCentavos: true })}`
          : ""}
        {linha.economia > 0 && <b className="cst-eco"> −{formatarReais(linha.economia, { semCentavos: true })}</b>}
        {linha.acimaDaTabela > 0 && <b className="cst-acima"> +{formatarReais(linha.acimaDaTabela, { semCentavos: true })}</b>}
      </span>
    </div>
  );
};

/* ---------------- célula do guia ---------------- */
const CelulaGuia = ({ linha, onSalvar, onAbrir }) => {
  if (linha.guiaStatus === "verificar") {
    return (
      <button type="button" className="cst-link-alerta" onClick={onAbrir}>
        <Icon name="alert" size={14} />
        {NOME_CATEGORIA[linha.categoria]} sem guia no Phoenix — teve guia?
      </button>
    );
  }
  if (!linha.guiaNome) return <span className="cst-vazio">—</span>;
  return (
    <div className="cst-cel-valor">
      <span className="cst-guia-nome" title={linha.guiaNome}>
        <Icon name="user" size={13} />
        {linha.guiaNome}
      </span>
      <CampoValor
        key={`${linha.chave}-g-${linha.guiaValor ?? "x"}`}
        valor={linha.guiaValor}
        placeholder={
          linha.guiaReferencia !== null
            ? `ref. ${linha.guiaReferencia.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
            : "Valor pago"
        }
        destaque={linha.guiaStatus === "a-confirmar"}
        ariaLabel={`Valor pago ao guia ${linha.guiaNome}`}
        onSalvar={onSalvar}
      />
    </div>
  );
};

/* ---------------- custo por fornecedor (do dia) ---------------- */
const CardPorFornecedor = ({ linhas }) => {
  const grupos = useMemo(() => {
    const m = new Map();
    linhas.forEach((l) => {
      const k = l.fornecedor || "Sem fornecedor";
      const g = m.get(k) || { nome: k, servicos: 0, valor: 0, semValor: 0 };
      g.servicos += 1;
      g.valor += l.valorFornecedor || 0;
      if (l.valorFornecedor === null) g.semValor += 1;
      m.set(k, g);
    });
    return Array.from(m.values()).sort((a, b) => b.valor - a.valor);
  }, [linhas]);
  const max = Math.max(1, ...grupos.map((g) => g.valor));

  return (
    <Card className="cst-card">
      <CardHeader icon="truck" title="Por fornecedor" subtitle="Valor dos fornecedores no dia (sem guias)." />
      <ul className="cst-barras">
        {grupos.map((g) => (
          <li key={g.nome}>
            <div className="cst-barras__topo">
              <span className={g.nome === "Sem fornecedor" ? "cst-alerta-texto" : ""}>{g.nome}</span>
              <b className="tabular">{formatarReais(g.valor)}</b>
            </div>
            <div className="cst-barras__trilho" aria-hidden="true">
              <span style={{ width: `${(g.valor / max) * 100}%` }} />
            </div>
            <small>
              {g.servicos} serviço(s){g.semValor ? ` · ${g.semValor} sem valor` : ""}
            </small>
          </li>
        ))}
      </ul>
    </Card>
  );
};

/* =========================================================
   TELA
   ========================================================= */
const CustoDia = ({ config, pronto, vinculos, fornecedores, onCriarTarifa }) => {
  const { perfil } = useAuth();
  const { mostrarToast } = useToast();

  const [data, setData] = useState(hojeIso);
  const [recarga, setRecarga] = useState(0);
  const [phoenix, setPhoenix] = useState({ data: null, estado: "carregando", servicos: [], semEscala: 0, erro: "" });
  const [dia, setDia] = useState({ data: null, doc: null });
  const [filtro, setFiltro] = useState("todos");
  const [fornecedorSel, setFornecedorSel] = useState("");
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState(null);
  const [visao, setVisao] = useState(() => lerPreferencia(LS_VISAO, "lista"));
  const [destaqueVeiculo, setDestaqueVeiculo] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const regioesEnviadas = useRef(new Set());

  /* ---------- Phoenix ---------- */
  useEffect(() => {
    let vivo = true;
    setPhoenix((p) => ({ ...p, data, estado: "carregando", erro: "" }));
    buscarServicosDoDia(data)
      .then(({ servicos, semEscala }) => vivo && setPhoenix({ data, estado: "ok", servicos, semEscala, erro: "" }))
      .catch((e) => vivo && setPhoenix({ data, estado: "erro", servicos: [], semEscala: 0, erro: e?.message || "Falha" }));
    return () => {
      vivo = false;
    };
  }, [data, recarga]);

  /* ---------- lançamentos do dia ---------- */
  useEffect(() => ouvirCustosDia(data, (doc) => setDia({ data, doc })), [data]);

  const docDia = dia.data === data ? dia.doc : undefined;
  const salvas = useMemo(() => docDia?.linhas || {}, [docDia]);
  const phoenixOk = phoenix.data === data && phoenix.estado === "ok";
  const carregando = (phoenix.data !== data || phoenix.estado === "carregando") || docDia === undefined;

  /* ---------- cálculo ---------- */
  const fornecedorPorVeiculo = useMemo(() => mapaFornecedorPorVeiculo(vinculos, fornecedores), [vinculos, fornecedores]);
  const nomesFornecedores = useMemo(
    () => listaDeFornecedores(vinculos, fornecedores, config.tarifas),
    [vinculos, fornecedores, config.tarifas],
  );

  // sem Phoenix, mostra o que foi salvo
  const servicos = useMemo(() => {
    if (phoenixOk) return phoenix.servicos;
    return Object.values(salvas)
      .filter((l) => l && !l.removido && l.chave)
      .map(servicoDoRetrato)
      .sort((a, b) => `${a.hora}${a.chave}`.localeCompare(`${b.hora}${b.chave}`));
  }, [phoenixOk, phoenix.servicos, salvas]);

  const pares = useMemo(() => detectarCasados(servicos, config.casado), [servicos, config.casado]);
  const apoios = useMemo(() => detectarApoios(servicos), [servicos]);
  const ctx = useMemo(() => ({ fornecedorPorVeiculo, config, pares, apoios }), [fornecedorPorVeiculo, config, pares, apoios]);

  const linhas = useMemo(
    () => servicos.map((s) => calcularLinha(s, salvas[s.chave]?.manual, ctx)),
    [servicos, salvas, ctx],
  );
  const porChave = useMemo(() => new Map(linhas.map((l) => [l.chave, l])), [linhas]);

  // linhas salvas que não estão mais no Phoenix (cancelados / mudaram de escala)
  const foraDoPhoenix = useMemo(() => {
    if (!phoenixOk) return [];
    const atuais = new Set(phoenix.servicos.map((s) => s.chave));
    return Object.values(salvas).filter((l) => l?.chave && !atuais.has(l.chave));
  }, [phoenixOk, phoenix.servicos, salvas]);

  /* ---------- sincronização (grava o retrato calculado) ---------- */
  useEffect(() => {
    if (!pronto || !phoenixOk || docDia === undefined) return undefined;
    const mudou = linhasParaGravar(linhas, salvas);
    const removidas = foraDoPhoenix.filter((l) => !l.removido).map((l) => l.chave);
    if (!Object.keys(mudou).length && !removidas.length) return undefined;
    const t = setTimeout(() => {
      gravarRetratos(data, mudou, removidas).catch((e) => console.error("Erro ao gravar custos do dia:", e));
    }, 700);
    return () => clearTimeout(t);
  }, [pronto, phoenixOk, docDia, linhas, salvas, foraDoPhoenix, data]);

  // regiões que aparecem no Phoenix viram sugestão nas tarifas
  useEffect(() => {
    if (!pronto || !phoenixOk) return;
    const conhecidas = new Set(config.regioesConhecidas);
    const novas = new Set();
    phoenix.servicos.forEach((s) =>
      [...s.regioes, ...s.regioesDestino].forEach((r) => {
        if (r && !conhecidas.has(r) && !regioesEnviadas.current.has(r)) novas.add(r);
      }),
    );
    if (!novas.size) return;
    novas.forEach((r) => regioesEnviadas.current.add(r));
    registrarRegioes(Array.from(novas)).catch(() => {});
  }, [pronto, phoenixOk, phoenix.servicos, config.regioesConhecidas]);

  /* ---------- lançamentos ---------- */
  const lancar = async (chave, patch, extras = {}) => {
    const linha = porChave.get(chave);
    if (!linha) return;
    const manualAtual = { ...(salvas[chave]?.manual || {}) };
    Object.entries(patch).forEach(([k, v]) => {
      if (v === null || v === undefined || v === "") delete manualAtual[k];
      else manualAtual[k] = v;
    });
    try {
      setSalvando(true);
      if (extras.vinculo !== undefined) {
        await salvarVinculoVeiculo(linha.veiculoKey, { fornecedor: extras.vinculo, veiculoNome: linha.veiculo, placa: linha.placa });
      }
      if (extras.categoria !== undefined) await fixarCategoriaVeiculo(linha.veiculoKey, extras.categoria);
      // recalcula já com o lançamento, para o relatório não esperar a sincronização
      const fpv = extras.vinculo !== undefined ? { ...fornecedorPorVeiculo, [linha.veiculoKey]: extras.vinculo } : fornecedorPorVeiculo;
      const cfg =
        extras.categoria !== undefined
          ? { ...config, categoriasVeiculo: { ...config.categoriasVeiculo, [linha.veiculoKey]: extras.categoria } }
          : config;
      const nova = calcularLinha(servicos.find((s) => s.chave === chave), manualAtual, { fornecedorPorVeiculo: fpv, config: cfg, pares, apoios });
      await gravarLancamento(data, chave, patch, perfil, retratoDaLinha(nova));
      return true;
    } catch (e) {
      console.error(e);
      mostrarToast("Não foi possível salvar. Tente de novo.");
      return false;
    } finally {
      setSalvando(false);
    }
  };

  const salvarDetalhe = async (patch, extras) => {
    const ok = await lancar(aberta, patch, extras);
    if (ok) {
      setAberta(null);
      mostrarToast("Lançamento salvo");
    }
  };

  const conferido = docDia?.status === "conferido";
  const alternarConferido = async () => {
    try {
      await marcarStatusDia(data, conferido ? "rascunho" : "conferido", perfil);
      mostrarToast(conferido ? "Dia reaberto" : "Dia marcado como conferido");
    } catch {
      mostrarToast("Não foi possível alterar o status do dia.");
    }
  };

  /* ---------- números ---------- */
  const totais = useMemo(() => {
    const t = { fornecedores: 0, guias: 0, economia: 0, pax: 0, casados: 0, pendentes: 0, guiaAConfirmar: 0, guiaRef: 0, comGuia: 0 };
    linhas.forEach((l) => {
      t.fornecedores += l.valorFornecedor || 0;
      t.guias += l.guiaValor || 0;
      t.economia += l.economia || 0;
      t.pax += l.pax || 0;
      if (l.casado) t.casados += 1;
      if (l.pendencias.length) t.pendentes += 1;
      if (l.guiaStatus === "a-confirmar") {
        t.guiaAConfirmar += 1;
        t.guiaRef += l.guiaReferencia || 0;
      }
      if (l.guiaNome || l.guiaStatus === "verificar") t.comGuia += 1;
    });
    return t;
  }, [linhas]);

  const economiaCasados = linhas.filter((l) => l.motivoEconomia === "casado").reduce((s, l) => s + l.economia, 0);
  // recomendador: trocas entre veículos que formam casado (pela tabela)
  const recomendacoes = useMemo(
    () => (pronto ? recomendarTrocas(servicos, { fornecedorPorVeiculo, config, apoios }) : []),
    [pronto, servicos, fornecedorPorVeiculo, config, apoios],
  );
  const recPorServico = useMemo(() => new Map(recomendacoes.map((r) => [r.x.chave, r])), [recomendacoes]);
  const economiaPossivel = recomendacoes.reduce((s, r) => s + r.economia, 0);

  const trocarVisao = (v) => {
    setVisao(v);
    gravarPreferencia(LS_VISAO, v);
  };

  const irParaVeiculo = (veiculoKey) => {
    trocarVisao("veiculos");
    setDestaqueVeiculo(veiculoKey);
    setTimeout(() => document.getElementById(idDoCardVeiculo(veiculoKey))?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    setTimeout(() => setDestaqueVeiculo(null), 2400);
  };

  const copiar = async (texto) => {
    try {
      await navigator.clipboard.writeText(texto);
      mostrarToast("Recomendação copiada");
    } catch {
      mostrarToast("Não foi possível copiar.");
    }
  };

  const visiveis = useMemo(() => {
    const termo = chaveTexto(busca);
    return linhas.filter((l) => {
      if (filtro === "pendentes" && !l.pendencias.length) return false;
      if (filtro === "casados" && !l.casado) return false;
      if (filtro === "guia" && !(l.guiaNome || l.guiaStatus === "verificar")) return false;
      if (filtro === "recomendacao" && !recPorServico.has(l.chave)) return false;
      if (fornecedorSel && (l.fornecedor || "__sem__") !== fornecedorSel) return false;
      if (termo && !textoBusca(l).includes(termo)) return false;
      return true;
    });
  }, [linhas, filtro, fornecedorSel, busca, recPorServico]);

  const exportar = () => {
    baixarArquivo(linhasParaCsv(linhas.map((l) => ({ ...l, calc: l }))), `custos-${data}.csv`);
  };

  const linhaAberta = aberta ? porChave.get(aberta) : null;

  return (
    <div className="cst-dia">
      {/* barra do dia */}
      <div className="cst-barra-dia">
        <div className="cst-navdia">
          <Button iconOnly icon="chevronLeft" title="Dia anterior" onClick={() => setData(somarDias(data, -1))} />
          <label className="cst-navdia__data">
            <span className="cst-navdia__semana">{diaDaSemanaLongo(data)}</span>
            <input type="date" value={data} onChange={(e) => e.target.value && setData(e.target.value)} aria-label="Data" />
          </label>
          <Button iconOnly icon="chevronRight" title="Próximo dia" onClick={() => setData(somarDias(data, 1))} />
          {data !== hojeIso() && (
            <Button variant="ghost" size="sm" onClick={() => setData(hojeIso())}>
              Hoje
            </Button>
          )}
        </div>
        <div className="cst-barra-dia__acoes">
          <StatusDot tone={conferido ? "accent" : "muted"} icon={conferido ? "circleCheck" : undefined}>
            {conferido ? `Conferido${docDia?.conferidoPor ? ` por ${docDia.conferidoPor}` : ""}` : "Rascunho"}
          </StatusDot>
          <Button icon="refresh" onClick={() => setRecarga((n) => n + 1)} loading={phoenix.estado === "carregando" && phoenix.data === data}>
            Atualizar do Phoenix
          </Button>
          <Button icon="download" onClick={exportar} disabled={!linhas.length}>
            CSV
          </Button>
          <Button variant={conferido ? "secondary" : "primary"} icon={conferido ? "undo" : "check"} onClick={alternarConferido} disabled={!linhas.length}>
            {conferido ? "Reabrir dia" : "Marcar como conferido"}
          </Button>
        </div>
      </div>

      {phoenix.data === data && phoenix.estado === "erro" && (
        <div className="cst-faixa cst-faixa--alerta" role="status">
          <Icon name="alert" size={16} />
          <span>
            Não foi possível falar com o Phoenix ({phoenix.erro}). {linhas.length ? "Mostrando o que foi salvo deste dia." : "Ainda não há nada salvo deste dia."}
          </span>
        </div>
      )}
      {phoenixOk && phoenix.semEscala > 0 && (
        <div className="cst-faixa" role="status">
          <Icon name="info" size={16} />
          <span>
            {phoenix.semEscala} reserva(s) deste dia ainda sem veículo no Phoenix — entram no custo quando forem escaladas.
          </span>
        </div>
      )}

      <KpiTiles
        items={[
          {
            key: "total",
            label: "Custo do dia",
            value: formatarReais(totais.fornecedores + totais.guias),
            hint: `Fornecedores ${formatarReais(totais.fornecedores, { semCentavos: true })} · Guias ${formatarReais(totais.guias, { semCentavos: true })}`,
            icon: "coins",
            loading: carregando,
          },
          {
            key: "servicos",
            label: "Serviços",
            value: linhas.length,
            hint: `${totais.pax} pax · ${totais.casados} casado(s)`,
            icon: "truck",
            loading: carregando,
          },
          {
            key: "economia",
            label: "Economia",
            value: formatarReais(totais.economia, { semCentavos: true }),
            hint:
              economiaPossivel > 0
                ? `+ ${formatarReais(economiaPossivel, { semCentavos: true })} possível com ${recomendacoes.length} troca(s)`
                : "casados e valores abaixo da tabela",
            icon: "trendingDown",
            loading: carregando,
          },
          {
            key: "pendencias",
            label: "Pendências",
            value: totais.pendentes,
            hint: "sem fornecedor, tarifa, categoria ou guia",
            icon: "alert",
            tone: totais.pendentes ? "warning" : undefined,
            active: filtro === "pendentes",
            onClick: () => setFiltro(filtro === "pendentes" ? "todos" : "pendentes"),
            loading: carregando,
          },
          {
            key: "guias",
            label: "Guias a confirmar",
            value: totais.guiaAConfirmar,
            hint: totais.guiaRef ? `referência ${formatarReais(totais.guiaRef, { semCentavos: true })}` : "valor negociado de cada guia",
            icon: "user",
            tone: totais.guiaAConfirmar ? "warning" : undefined,
            active: filtro === "guia",
            onClick: () => setFiltro(filtro === "guia" ? "todos" : "guia"),
            loading: carregando,
          },
        ]}
      />

      <div className="cst-grade">
        <Card className="cst-card cst-card--tabela">
          <div className="cst-filtros">
            <Segmented
              size="sm"
              ariaLabel="Filtro"
              value={filtro}
              onChange={setFiltro}
              options={[
                { value: "todos", label: "Todos", count: linhas.length },
                { value: "pendentes", label: "Pendências", count: totais.pendentes },
                { value: "casados", label: "Casados", count: totais.casados },
                { value: "guia", label: "Com guia", count: totais.comGuia },
                ...(recomendacoes.length ? [{ value: "recomendacao", label: "Com recomendação", count: recomendacoes.length }] : []),
              ]}
            />
            <Field className="cst-filtros__forn">
              <select value={fornecedorSel} onChange={(e) => setFornecedorSel(e.target.value)} aria-label="Fornecedor">
                <option value="">Todos os fornecedores</option>
                <option value="__sem__">Sem fornecedor</option>
                {nomesFornecedores.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </Field>
            <SearchInput value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Hotel, veículo, guia…" />
            <Segmented
              size="sm"
              ariaLabel="Visualização"
              value={visao}
              onChange={trocarVisao}
              options={[
                { value: "lista", label: "Lista", icon: "list" },
                { value: "veiculos", label: "Por veículo", icon: "grid" },
              ]}
            />
          </div>

          {carregando ? (
            <div className="cst-sk" aria-label="Carregando serviços">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="cst-sk__linha">
                  <span className="ui-sk ui-sk--fina" style={{ width: 48 }} />
                  <span className="ui-sk ui-sk--barra" style={{ width: "34%" }} />
                  <span className="ui-sk ui-sk--barra" style={{ width: "22%" }} />
                  <span className="ui-sk ui-sk--botao" style={{ width: 120 }} />
                </div>
              ))}
            </div>
          ) : linhas.length === 0 ? (
            <EmptyState icon="calendar" title="Nenhum serviço com veículo neste dia">
              Os serviços aparecem aqui assim que forem escalados no Phoenix.
            </EmptyState>
          ) : visiveis.length === 0 ? (
            <EmptyState icon="filter" title="Nada com esse filtro" />
          ) : visao === "veiculos" ? (
            <CardsPorVeiculo
              linhas={visiveis}
              porChave={porChave}
              recPorServico={recPorServico}
              destaque={destaqueVeiculo}
              onAbrir={setAberta}
              onCopiar={copiar}
            />
          ) : (
            <Table columns={COLUNAS} minWidth={1080} className="cst-tabela">
              <TableHead>
                <span>Hora</span>
                <span>Serviço</span>
                <span>Veículo · fornecedor</span>
                <span>Fornecedor</span>
                <span>Guia</span>
                <span className="ui-cell-end">Total</span>
                <span />
              </TableHead>
              {visiveis.map((l) => (
                <TableRow key={l.chave} className={l.pendencias.length ? "cst-linha--pendente" : ""}>
                  <span className="cst-hora">
                    <b className="tabular">{l.hora || "--:--"}</b>
                    <span className={`ui-tag cst-tipo cst-tipo--${l.tipo}`}>{NOME_TIPO[l.tipo]}</span>
                  </span>
                  <span className="cst-servico">
                    <span className="ui-cell-main" title={l.hoteis?.join(", ")}>
                      {l.descricao}
                    </span>
                    <span className="ui-cell-sub">
                      {[l.regiaoTexto, `${l.pax} pax`].filter(Boolean).join(" · ")}
                      {l.casado && (
                        <span className="cst-chip-casado" title={l.parCasado ? `Par: ${porChave.get(l.parCasado)?.descricao || ""}` : "Marcado como casado"}>
                          <Icon name="refresh" size={11} />
                          Casado{l.parCasado && porChave.get(l.parCasado) ? ` · ${porChave.get(l.parCasado).tipo} ${porChave.get(l.parCasado).hora}` : ""}
                        </span>
                      )}
                      {l.apoio && <span className="cst-chip-apoio">Apoio · {l.trechos} trecho(s)</span>}
                      {recPorServico.has(l.chave) && (
                        <button
                          type="button"
                          className="cst-chip-rec"
                          onClick={() => irParaVeiculo(l.veiculoKey)}
                          title="Ver a recomendação no card do veículo"
                        >
                          <Icon name="sparkles" size={11} />
                          {recPorServico.get(l.chave).tipo === "troca" ? "Trocar com" : "Passar para"} {recPorServico.get(l.chave).para.veiculo} · −
                          {formatarReais(recPorServico.get(l.chave).economia, { semCentavos: true })}
                        </button>
                      )}
                    </span>
                  </span>
                  <span className="cst-veiculo">
                    <span className="ui-cell-main">{l.veiculo}</span>
                    <span className="ui-cell-sub">
                      {l.fornecedor ? (
                        <span className="cst-forn" title={l.fornecedor}>{l.fornecedor}</span>
                      ) : (
                        <button type="button" className="cst-link-alerta" onClick={() => setAberta(l.chave)}>
                          Definir fornecedor
                        </button>
                      )}
                      {l.categoria ? (
                        <span className="ui-chip cst-cat">{NOME_CATEGORIA[l.categoria]}</span>
                      ) : (
                        <button type="button" className="cst-link-alerta" onClick={() => setAberta(l.chave)}>
                          Categoria?
                        </button>
                      )}
                    </span>
                  </span>
                  <CelulaFornecedor linha={l} onSalvar={(v) => lancar(l.chave, { valor: v })} />
                  <CelulaGuia linha={l} onSalvar={(v) => lancar(l.chave, { guiaValor: v })} onAbrir={() => setAberta(l.chave)} />
                  <span className="ui-cell-num cst-total">
                    {l.valorFornecedor === null && !l.guiaValor ? <span className="cst-vazio">—</span> : formatarReais(l.total)}
                  </span>
                  <span className="ui-cell-end">
                    <Button variant="ghost" size="sm" iconOnly icon="pencil" title="Detalhes e ajustes" onClick={() => setAberta(l.chave)} />
                  </span>
                </TableRow>
              ))}
            </Table>
          )}
        </Card>

        <div className="cst-lateral">
          {config.casado.ativo && !carregando && (
            <CardRecomendacoes
              recomendacoes={recomendacoes}
              casadosHoje={Math.round(linhas.filter((l) => l.casado).length / 2)}
              economiaCasados={economiaCasados}
              regras={config.casado}
              onAbrir={setAberta}
              onCopiar={copiar}
            />
          )}
          {!carregando && linhas.length > 0 && <CardPorFornecedor linhas={linhas} />}
          {foraDoPhoenix.length > 0 && (
            <Card className="cst-card">
              <CardHeader icon="alert" title="Saíram do Phoenix" subtitle="Estavam salvos neste dia e não aparecem mais (cancelados ou mudaram de escala). Não entram no custo." />
              <ul className="cst-fora">
                {foraDoPhoenix.map((l) => (
                  <li key={l.chave}>
                    <span>
                      <b className="tabular">{l.hora}</b> {NOME_TIPO[l.tipo]} · {l.veiculo}
                      {l.manual?.valor !== undefined && <small> · lançado {formatarReais(l.manual.valor)}</small>}
                    </span>
                    <Button variant="ghost" size="sm" icon="trash" onClick={() => excluirLinha(data, l.chave)}>
                      Excluir
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <p className="cst-rodape">
        {dataBr(data)} · valores em branco usam a tabela de tarifas; o que você digita vale só para este serviço. O guia só entra no custo depois de lançado.
      </p>

      {linhaAberta && (
        <DetalheServico
          key={linhaAberta.chave}
          linha={linhaAberta}
          manual={salvas[linhaAberta.chave]?.manual || {}}
          fornecedores={nomesFornecedores}
          onFechar={() => setAberta(null)}
          onSalvar={salvarDetalhe}
          onCriarTarifa={(p) => {
            setAberta(null);
            onCriarTarifa(p);
          }}
          salvando={salvando}
        />
      )}
    </div>
  );
};

export default CustoDia;
