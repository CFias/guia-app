import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Icon,
  SearchInput,
  Segmented,
  Table,
  TableHead,
  TableRow,
  useToast,
} from "../ui";
import {
  CASADO_PADRAO,
  CATEGORIAS,
  NOME_CATEGORIA,
  NOME_TIPO,
  chaveTexto,
  formatarReais,
  lerValorDigitado,
  listaDeFornecedores,
  normalizarRegrasCasado,
  normalizarRegras,
  ondeDaTarifa,
  SUFIXO_COBRANCA,
  regiaoCanonica,
} from "../../Services/Services/custosCalculo";
import { salvarConfigCustos } from "../../Services/Services/custosRepository";
import { FormGuia, FormTarifa } from "./FormulariosTarifa";
import FiltroVeiculo from "./FiltroVeiculo";

const ORDEM_TIPOS = ["IN", "OUT", "TRF", "PASSEIO", "APOIO", "SERVICO"];
const TITULO_TIPO = {
  IN: "Chegada (IN) — aeroporto → hotel",
  OUT: "Saída (OUT) — hotel → aeroporto",
  TRF: "Transfer — hotel → hotel",
  PASSEIO: "Passeios",
  APOIO: "Apoio de passeio (por trecho)",
  SERVICO: "Serviços de parceiros",
};

/* Tabela de tarifas (settings/custos):
   - por fornecedor: tipo de serviço + região/passeio + categoria → valor
     cheio e valor casado. Fornecedor vazio = vale para todos (tabela geral);
     a tarifa do fornecedor tem prioridade sobre a geral.
   - guias: valor de referência (o valor real é confirmado no dia)
   - serviço casado: regiões e intervalo */

const GERAL = "__geral__";

/* ---------------- no-show e adicional de idioma ---------------- */
const RegrasCobranca = ({ regras, onSalvar, salvando }) => {
  const [r, setR] = useState(() => ({
    noShowIn: String(regras.noShowIn),
    noShowOut: String(regras.noShowOut),
    noShowTrf: String(regras.noShowTrf),
    adicionalIdioma: String(regras.adicionalIdioma),
  }));
  const [erro, setErro] = useState("");
  const campo = (k) => (e) => setR((p) => ({ ...p, [k]: e.target.value }));

  const salvar = () => {
    const vals = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, lerValorDigitado(v)]));
    if (Object.values(vals).some((v) => v === null || v > 300)) return setErro("Use números em %, de 0 a 300.");
    setErro("");
    onSalvar(normalizarRegras(vals));
  };

  return (
    <Card className="cst-card cst-casado">
      <CardHeader
        icon="sliders"
        title="No-show e adicional de guia"
        subtitle="No-show: o passageiro não se apresentou. O fornecedor recebe esta porcentagem do valor do serviço."
      />
      <div className="cst-casado__corpo">
        <div className="cst-form__tripla">
          <Field label="No-show na chegada (IN) — %" hint="Aeroporto → hotel. Padrão: 50%.">
            <input inputMode="decimal" value={r.noShowIn} onChange={campo("noShowIn")} />
          </Field>
          <Field label="No-show na saída (OUT) — %" hint="Hotel → aeroporto. Padrão: 100% (integral).">
            <input inputMode="decimal" value={r.noShowOut} onChange={campo("noShowOut")} />
          </Field>
          <Field label="No-show em transfer — %" hint="Hotel → hotel. Padrão: 100%.">
            <input inputMode="decimal" value={r.noShowTrf} onChange={campo("noShowTrf")} />
          </Field>
        </div>
        <Field
          label="Adicional de idioma do guia — %"
          hint="Passeio regular com passageiro de outro idioma (ex.: espanhol): o guia recebe a referência + esta porcentagem. A tabela MI (guiamento todo em outro idioma) tem valores próprios em Guias."
        >
          <input inputMode="decimal" value={r.adicionalIdioma} onChange={campo("adicionalIdioma")} />
        </Field>
        {erro && (
          <p className="cst-erro" role="alert">
            {erro}
          </p>
        )}
        <div>
          <Button variant="primary" icon="save" onClick={salvar} loading={salvando}>
            Salvar regras
          </Button>
        </div>
      </div>
    </Card>
  );
};

/* ---------------- regras do casado ---------------- */
const RegrasCasado = ({ regras, regioes, onSalvar, salvando }) => {
  const [r, setR] = useState(() => ({
    ativo: regras.ativo,
    regioes: [...regras.regioes],
    minHoras: String(regras.minHoras).replace(".", ","),
    maxHoras: String(regras.maxHoras).replace(".", ","),
    duracaoPasseioHoras: String(regras.duracaoPasseioHoras).replace(".", ","),
  }));
  const [nova, setNova] = useState("");
  const [erro, setErro] = useState("");

  const adicionar = () => {
    const reg = regiaoCanonica(nova);
    if (reg && !r.regioes.includes(reg)) setR((p) => ({ ...p, regioes: [...p.regioes, reg] }));
    setNova("");
  };

  const salvar = () => {
    const min = lerValorDigitado(r.minHoras);
    const max = lerValorDigitado(r.maxHoras);
    const passeio = lerValorDigitado(r.duracaoPasseioHoras);
    if (min === null || max === null || min > max) return setErro("Confira o intervalo: o mínimo precisa ser menor que o máximo.");
    if (passeio === null || passeio <= 0) return setErro("Informe quantas horas um passeio ocupa o veículo.");
    setErro("");
    onSalvar(normalizarRegrasCasado({ ...r, minHoras: min, maxHoras: max, duracaoPasseioHoras: passeio }));
  };

  const sugestoes = regioes.filter((x) => !r.regioes.includes(x));

  return (
    <Card className="cst-card cst-casado">
      <CardHeader
        icon="refresh"
        title="Serviço casado"
        subtitle="Um veículo que faz uma chegada (IN) para a região e, dentro do intervalo, uma saída (OUT) da mesma região — do mesmo hotel ou de outro."
      />
      <div className="cst-casado__corpo">
        <label className="cst-check">
          <input type="checkbox" checked={r.ativo} onChange={(e) => setR((p) => ({ ...p, ativo: e.target.checked }))} />
          <span>
            Reconhecer serviços casados
            <small>Desligado, nenhum serviço usa o valor casado automaticamente.</small>
          </span>
        </label>

        <Field label="Regiões em que vale o casado">
          <div className="cst-chips">
            {r.regioes.map((reg) => (
              <span key={reg} className="cst-chip">
                {reg}
                <button
                  type="button"
                  aria-label={`Tirar ${reg}`}
                  onClick={() => setR((p) => ({ ...p, regioes: p.regioes.filter((x) => x !== reg) }))}
                >
                  <Icon name="x" size={12} />
                </button>
              </span>
            ))}
            {!r.regioes.length && <span className="cst-ajuda">Nenhuma região.</span>}
          </div>
          <div className="cst-casado__add">
            <input
              list="cst-lista-regioes-c"
              value={nova}
              onChange={(e) => setNova(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  adicionar();
                }
              }}
              placeholder="Adicionar região"
            />
            <datalist id="cst-lista-regioes-c">
              {sugestoes.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            <Button icon="plus" onClick={adicionar} disabled={!nova.trim()}>
              Adicionar
            </Button>
          </div>
        </Field>

        <div className="cst-form__dupla">
          <Field label="Margem mínima (horas)" hint="Deslocamento tranquilo, sem risco de atraso. Vale também entre serviços do mesmo veículo no recomendador.">
            <input inputMode="decimal" value={r.minHoras} onChange={(e) => setR((p) => ({ ...p, minHoras: e.target.value }))} />
          </Field>
          <Field label="Margem máxima do casado (horas)" hint="Ex.: IN 10:00 e OUT até 13:00 = 3. Passou disso, não é casado.">
            <input inputMode="decimal" value={r.maxHoras} onChange={(e) => setR((p) => ({ ...p, maxHoras: e.target.value }))} />
          </Field>
        </div>
        <Field label="Um passeio ocupa o veículo por (horas)" hint="O recomendador não coloca transfer num veículo que está em passeio. Entre serviços em Salvador ele exige 1h de folga.">
          <input inputMode="decimal" value={r.duracaoPasseioHoras} onChange={(e) => setR((p) => ({ ...p, duracaoPasseioHoras: e.target.value }))} />
        </Field>

        <p className="cst-ajuda">
          O valor casado de cada serviço vem da tarifa (coluna “Casado”). Quando o par está no mesmo veículo no Phoenix, o custo do dia já usa o valor casado; quando estão em veículos diferentes, o recomendador sugere a troca — conferindo se o outro veículo está livre no horário e se comporta o grupo.
        </p>
        {erro && (
          <p className="cst-erro" role="alert">
            {erro}
          </p>
        )}
        <div>
          <Button variant="primary" icon="save" onClick={salvar} loading={salvando}>
            Salvar regra do casado
          </Button>
        </div>
      </div>
    </Card>
  );
};

/* =========================================================
   TELA
   ========================================================= */
const TabelaTarifas = ({ config, vinculos, fornecedores, passeios, prefill, onPrefillUsado }) => {
  const { mostrarToast } = useToast();
  const [secao, setSecao] = useState("fornecedores");
  const [fornecedorSel, setFornecedorSel] = useState("");
  const [busca, setBusca] = useState("");
  const [veiculoSel, setVeiculoSel] = useState("");
  const [tipoSel, setTipoSel] = useState("");
  const [editando, setEditando] = useState(null); // tarifa (ou {} nova)
  const [editandoGuia, setEditandoGuia] = useState(null);
  const [salvando, setSalvando] = useState(false);

  // veio do "Criar tarifa" do custo do dia
  useEffect(() => {
    if (!prefill) return;
    setSecao("fornecedores");
    setEditando({ ...prefill, id: undefined });
    onPrefillUsado?.();
  }, [prefill, onPrefillUsado]);

  const nomesFornecedores = useMemo(
    () => listaDeFornecedores(vinculos, fornecedores, config.tarifas),
    [vinculos, fornecedores, config.tarifas],
  );
  const regioes = config.regioesConhecidas;

  const gravar = async (patch, mensagem) => {
    try {
      setSalvando(true);
      await salvarConfigCustos(patch);
      mostrarToast(mensagem);
      return true;
    } catch (e) {
      console.error(e);
      mostrarToast("Não foi possível salvar. Tente de novo.");
      return false;
    } finally {
      setSalvando(false);
    }
  };

  const salvarTarifa = async (t) => {
    const lista = config.tarifas.some((x) => x.id === t.id)
      ? config.tarifas.map((x) => (x.id === t.id ? t : x))
      : [...config.tarifas, t];
    if (await gravar({ tarifas: lista }, "Tarifa salva")) setEditando(null);
  };

  const excluirTarifa = (t) => {
    if (!window.confirm(`Excluir a tarifa "${ondeDaTarifa(t)}" de ${t.fornecedor || "todos os fornecedores"}?`)) return;
    gravar({ tarifas: config.tarifas.filter((x) => x.id !== t.id) }, "Tarifa excluída");
  };

  const duplicarTarifa = (t) => setEditando({ ...t, id: undefined });

  const salvarGuia = async (t) => {
    const lista = config.tarifasGuia.some((x) => x.id === t.id)
      ? config.tarifasGuia.map((x) => (x.id === t.id ? t : x))
      : [...config.tarifasGuia, t];
    if (await gravar({ tarifasGuia: lista }, "Referência salva")) setEditandoGuia(null);
  };

  const excluirGuia = (t) => {
    if (!window.confirm("Excluir esta referência de guia?")) return;
    gravar({ tarifasGuia: config.tarifasGuia.filter((x) => x.id !== t.id) }, "Referência excluída");
  };

  // filtros de fornecedor e busca (base das contagens dos chips)
  const tarifasBase = useMemo(() => {
    const termo = chaveTexto(busca);
    return config.tarifas.filter((t) => {
      if (fornecedorSel === GERAL && t.fornecedor) return false;
      if (fornecedorSel && fornecedorSel !== GERAL && chaveTexto(t.fornecedor) !== chaveTexto(fornecedorSel)) return false;
      if (termo && !chaveTexto([t.fornecedor, ondeDaTarifa(t), NOME_CATEGORIA[t.categoria], NOME_TIPO[t.tipo], t.obs].join(" ")).includes(termo)) return false;
      return true;
    });
  }, [config.tarifas, fornecedorSel, busca]);

  const contagemVeiculo = useMemo(() => {
    const c = { __total: 0 };
    tarifasBase.forEach((t) => {
      if (tipoSel && t.tipo !== tipoSel) return;
      c.__total += 1;
      c[t.categoria || ""] = (c[t.categoria || ""] || 0) + 1;
    });
    return c;
  }, [tarifasBase, tipoSel]);

  const contagemTipo = useMemo(() => {
    const c = {};
    tarifasBase.forEach((t) => {
      if (veiculoSel && (veiculoSel === "qualquer" ? t.categoria : t.categoria !== veiculoSel)) return;
      c[t.tipo] = (c[t.tipo] || 0) + 1;
    });
    return c;
  }, [tarifasBase, veiculoSel]);

  const tarifasVisiveis = useMemo(() => {
    return tarifasBase
      .filter((t) => {
        if (tipoSel && t.tipo !== tipoSel) return false;
        if (veiculoSel === "qualquer" && t.categoria) return false;
        if (veiculoSel && veiculoSel !== "qualquer" && t.categoria !== veiculoSel) return false;
        return true;
      })
      .sort(
        (a, b) =>
          ORDEM_TIPOS.indexOf(a.tipo) - ORDEM_TIPOS.indexOf(b.tipo) ||
          ondeDaTarifa(a).localeCompare(ondeDaTarifa(b), "pt-BR") ||
          CATEGORIAS.findIndex((c) => c.valor === a.categoria) - CATEGORIAS.findIndex((c) => c.valor === b.categoria) ||
          (a.fornecedor || "").localeCompare(b.fornecedor || "", "pt-BR"),
      );
  }, [tarifasBase, tipoSel, veiculoSel]);

  // agrupado por tipo de serviço, na ordem IN, OUT, transfer…
  const gruposTarifas = useMemo(() => {
    const m = new Map();
    tarifasVisiveis.forEach((t) => {
      if (!m.has(t.tipo)) m.set(t.tipo, []);
      m.get(t.tipo).push(t);
    });
    return ORDEM_TIPOS.filter((k) => m.has(k)).map((k) => ({ tipo: k, tarifas: m.get(k) }));
  }, [tarifasVisiveis]);

  const limparFiltros = () => {
    setVeiculoSel("");
    setTipoSel("");
    setBusca("");
    setFornecedorSel("");
  };
  const temFiltro = !!(veiculoSel || tipoSel || busca || fornecedorSel);

  return (
    <div className="cst-tarifas">
      <Segmented
        size="sm"
        ariaLabel="Tipo de tabela"
        value={secao}
        onChange={setSecao}
        options={[
          { value: "fornecedores", label: "Fornecedores", icon: "truck", count: config.tarifas.length },
          { value: "guias", label: "Guias", icon: "user", count: config.tarifasGuia.length },
          { value: "casado", label: "Regras", icon: "sliders" },
        ]}
      />

      {secao === "fornecedores" && (
        <Card className="cst-card">
          <CardHeader
            icon="tag"
            title="Tarifas dos fornecedores"
            subtitle="A tarifa do próprio fornecedor vale primeiro; sem ela, vale a tabela geral (todos os fornecedores)."
            actions={
              <Button variant="primary" icon="plus" onClick={() => setEditando({ fornecedor: fornecedorSel && fornecedorSel !== GERAL ? fornecedorSel : "" })}>
                Nova tarifa
              </Button>
            }
          />
          <div className="cst-filtros">
            <Field className="cst-filtros__forn">
              <select value={fornecedorSel} onChange={(e) => setFornecedorSel(e.target.value)} aria-label="Fornecedor">
                <option value="">Todas as tarifas</option>
                <option value={GERAL}>Tabela geral (todos os fornecedores)</option>
                {nomesFornecedores.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Field>
            <SearchInput value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Região, passeio, categoria…" />
          </div>
          <div className="cst-filtros cst-filtros--chips">
            <FiltroVeiculo valor={veiculoSel} onChange={setVeiculoSel} contagem={contagemVeiculo} />
            <div className="cst-fv" role="group" aria-label="Filtrar por tipo de serviço">
              <span className="cst-fv__rotulo">Serviço</span>
              {[{ v: "", n: "Todos" }, ...ORDEM_TIPOS.map((k) => ({ v: k, n: NOME_TIPO[k] }))].map((o) => (
                <button
                  key={o.v || "todos"}
                  type="button"
                  className={`cst-fv__chip ${tipoSel === o.v ? "is-ativo" : ""}`}
                  aria-pressed={tipoSel === o.v}
                  disabled={o.v && !contagemTipo[o.v]}
                  onClick={() => setTipoSel(tipoSel === o.v ? "" : o.v)}
                >
                  {o.n}
                  <span className="cst-fv__n tabular">{o.v ? contagemTipo[o.v] || 0 : Object.values(contagemTipo).reduce((a, b) => a + b, 0)}</span>
                </button>
              ))}
            </div>
            {temFiltro && (
              <Button variant="ghost" size="sm" icon="x" onClick={limparFiltros}>
                Limpar filtros
              </Button>
            )}
          </div>

          {config.tarifas.length === 0 ? (
            <EmptyState
              icon="tag"
              title="Nenhuma tarifa cadastrada"
              action={
                <Button icon="plus" onClick={() => setEditando({})}>
                  Cadastrar a primeira
                </Button>
              }
            >
              Ex.: IN Aeroporto → SALVADOR · Carro · R$ 90 e Van · R$ 200. Sem tarifa, o custo do dia pede o valor serviço a serviço.
            </EmptyState>
          ) : tarifasVisiveis.length === 0 ? (
            <EmptyState icon="filter" title="Nenhuma tarifa com esse filtro" />
          ) : (
            <div className="cst-tl">
              {gruposTarifas.map((g) => (
                <section key={g.tipo} className="cst-tl__grupo">
                  <header className="cst-tl__cab">
                    <span className={`ui-tag cst-tipo cst-tipo--${g.tipo}`}>{NOME_TIPO[g.tipo]}</span>
                    <h3>{TITULO_TIPO[g.tipo]}</h3>
                    <small>{g.tarifas.length} tarifa(s)</small>
                    <button
                      type="button"
                      className="cst-tf__nova"
                      onClick={() =>
                        setEditando({
                          fornecedor: fornecedorSel && fornecedorSel !== GERAL ? fornecedorSel : "",
                          tipo: g.tipo,
                          categoria: veiculoSel && veiculoSel !== "qualquer" ? veiculoSel : "",
                        })
                      }
                    >
                      <Icon name="plus" size={13} /> nova
                    </button>
                  </header>
                  <Table columns="minmax(220px, 1.8fr) minmax(130px, 0.9fr) 130px 150px 170px 104px" minWidth={900} compact>
                    <TableHead>
                      <span>{g.tipo === "PASSEIO" ? "Passeio" : g.tipo === "SERVICO" ? "Serviço" : "Trajeto"}</span>
                      <span>Fornecedor</span>
                      <span>Veículo</span>
                      <span className="ui-cell-end">Valor</span>
                      <span className="ui-cell-end">Casado</span>
                      <span />
                    </TableHead>
                    {g.tarifas.map((t) => (
                      <TableRow key={t.id} onClick={() => setEditando(t)} title="Clique para editar">
                        <span className="cst-tl__onde">
                          <span className="ui-cell-main">{ondeDaTarifa(t)}</span>
                          {t.obs && <span className="ui-cell-sub">{t.obs}</span>}
                        </span>
                        <span className={t.fornecedor ? "cst-tl__forn" : "cst-geral"}>{t.fornecedor || "Todos"}</span>
                        <span>
                          {t.categoria ? (
                            <span className={`cst-cat-chip cst-cat-chip--${t.categoria}`}>{NOME_CATEGORIA[t.categoria]}</span>
                          ) : (
                            <span className="cst-vazio">Qualquer</span>
                          )}
                        </span>
                        <span className="ui-cell-num cst-tl__valor">
                          {formatarReais(t.valor)}
                          {SUFIXO_COBRANCA[t.cobranca] && <small> {SUFIXO_COBRANCA[t.cobranca]}</small>}
                        </span>
                        <span className="ui-cell-num">
                          {t.valorCasado !== null ? (
                            <>
                              {formatarReais(t.valorCasado)}
                              {t.valor ? (
                                <small className="cst-eco"> −{Math.round((1 - t.valorCasado / t.valor) * 100)}%</small>
                              ) : null}
                            </>
                          ) : (
                            <span className="cst-vazio">—</span>
                          )}
                        </span>
                        <span className="ui-cell-end cst-acoes" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" iconOnly icon="pencil" title="Editar" onClick={() => setEditando(t)} />
                          <Button variant="ghost" size="sm" iconOnly icon="copy" title="Duplicar" onClick={() => duplicarTarifa(t)} />
                          <Button variant="ghost" size="sm" iconOnly icon="trash" title="Excluir" onClick={() => excluirTarifa(t)} />
                        </span>
                      </TableRow>
                    ))}
                  </Table>
                </section>
              ))}
            </div>
          )}
        </Card>
      )}

      {secao === "guias" && (
        <Card className="cst-card">
          <CardHeader
            icon="user"
            title="Referência de valor dos guias"
            subtitle="Sugestão que aparece no custo do dia. Como o valor costuma ser negociado, cada guia fica “a confirmar” até alguém lançar o valor pago."
            actions={
              <Button variant="primary" icon="plus" onClick={() => setEditandoGuia({})}>
                Nova referência
              </Button>
            }
          />
          {config.tarifasGuia.length === 0 ? (
            <EmptyState icon="user" title="Nenhuma referência cadastrada">
              Ex.: Passeio Praia do Forte · R$ 250; transfer com micro-ônibus · R$ 120.
            </EmptyState>
          ) : (
            <Table columns="100px 110px minmax(200px, 1.6fr) 130px 130px 84px" minWidth={740}>
              <TableHead>
                <span>Tabela</span>
                <span>Tipo</span>
                <span>Passeio</span>
                <span>Categoria</span>
                <span className="ui-cell-end">Referência</span>
                <span />
              </TableHead>
              {config.tarifasGuia.map((t) => (
                <TableRow key={t.id}>
                  <span>{t.tabela === "mi" ? <span className="cst-mod">MI</span> : "Regular"}</span>
                  <span>{t.tipo ? <span className={`ui-tag cst-tipo cst-tipo--${t.tipo}`}>{NOME_TIPO[t.tipo]}</span> : <span className="cst-vazio">Qualquer</span>}</span>
                  <span>
                    {t.servico || <span className="cst-vazio">Qualquer</span>}
                    {t.obs && <span className="ui-cell-sub">{t.obs}</span>}
                  </span>
                  <span>{t.categoria ? NOME_CATEGORIA[t.categoria] : <span className="cst-vazio">Qualquer</span>}</span>
                  <span className="ui-cell-num">{formatarReais(t.valor)}</span>
                  <span className="ui-cell-end cst-acoes">
                    <Button variant="ghost" size="sm" iconOnly icon="pencil" title="Editar" onClick={() => setEditandoGuia(t)} />
                    <Button variant="ghost" size="sm" iconOnly icon="trash" title="Excluir" onClick={() => excluirGuia(t)} />
                  </span>
                </TableRow>
              ))}
            </Table>
          )}
        </Card>
      )}

      {secao === "casado" && (
        <>
          <RegrasCobranca
            key={JSON.stringify(config.regras)}
            regras={config.regras}
            salvando={salvando}
            onSalvar={(regras) => gravar({ regras }, "Regras salvas")}
          />
          <RegrasCasado
            key={JSON.stringify(config.casado)}
            regras={config.casado}
            regioes={regioes.length ? regioes : CASADO_PADRAO.regioes}
            salvando={salvando}
            onSalvar={(regras) => gravar({ casado: regras }, "Regra do casado salva")}
          />
        </>
      )}

      {editando && (
        <FormTarifa
          key={editando.id || `nova-${editando._ts || ""}`}
          inicial={editando.id ? editando : { ...editando, _nova: true }}
          fornecedores={nomesFornecedores}
          regioes={regioes}
          passeios={passeios}
          servicosConhecidos={config.servicosConhecidos}
          salvando={salvando}
          onFechar={() => setEditando(null)}
          onSalvar={salvarTarifa}
          onExcluir={async (t) => {
            if (await gravar({ tarifas: config.tarifas.filter((x) => x.id !== t.id) }, "Tarifa excluída")) setEditando(null);
          }}
        />
      )}
      {editandoGuia && (
        <FormGuia
          key={editandoGuia.id || "nova"}
          inicial={editandoGuia.id ? editandoGuia : { ...editandoGuia, _nova: true }}
          passeios={passeios}
          salvando={salvando}
          onFechar={() => setEditandoGuia(null)}
          onSalvar={salvarGuia}
          onExcluir={async (t) => {
            if (await gravar({ tarifasGuia: config.tarifasGuia.filter((x) => x.id !== t.id) }, "Referência excluída")) setEditandoGuia(null);
          }}
        />
      )}
    </div>
  );
};

export default TabelaTarifas;
