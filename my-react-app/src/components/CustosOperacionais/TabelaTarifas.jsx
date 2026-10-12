import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  CardHeader,
  Drawer,
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
  TIPOS_CUSTO,
  chaveTexto,
  formatarReais,
  lerValorDigitado,
  listaDeFornecedores,
  normalizarRegrasCasado,
  normalizarTarifa,
  normalizarTarifaGuia,
  regiaoCanonica,
} from "../../Services/Services/custosCalculo";
import { salvarConfigCustos } from "../../Services/Services/custosRepository";

/* Tabela de tarifas (settings/custos):
   - por fornecedor: tipo de serviço + região/passeio + categoria → valor
     cheio e valor casado. Fornecedor vazio = vale para todos (tabela geral);
     a tarifa do fornecedor tem prioridade sobre a geral.
   - guias: valor de referência (o valor real é confirmado no dia)
   - serviço casado: regiões e intervalo */

const GERAL = "__geral__";

const valorTexto = (v) =>
  v === null || v === undefined ? "" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ondeDaTarifa = (t) => {
  if (t.tipo === "PASSEIO") return t.servico || "Qualquer passeio";
  if (t.tipo === "APOIO") return `Por trecho · ${t.regiao || "qualquer região"}${t.servico ? ` · ${t.servico}` : ""}`;
  if (t.tipo === "TRF") return `${t.regiao || "Qualquer região"} → ${t.regiaoDestino || "qualquer região"}`;
  if (t.tipo === "IN") return `Aeroporto → ${t.regiao || "qualquer região"}`;
  return `${t.regiao || "Qualquer região"} → Aeroporto`;
};

/* ---------------- formulário de tarifa (fornecedor) ---------------- */
const FormTarifa = ({ inicial, fornecedores, regioes, passeios, onFechar, onSalvar, salvando }) => {
  const [f, setF] = useState(() => ({
    fornecedor: inicial.fornecedor || "",
    tipo: inicial.tipo || "IN",
    regiao: inicial.regiao || "",
    regiaoDestino: inicial.regiaoDestino || "",
    servico: inicial.servico || "",
    categoria: inicial.categoria || "",
    valor: valorTexto(inicial.valor),
    valorCasado: valorTexto(inicial.valorCasado),
    obs: inicial.obs || "",
  }));
  const [erro, setErro] = useState("");
  const set = (campo) => (e) => setF((p) => ({ ...p, [campo]: e.target.value }));

  const salvar = () => {
    const valor = lerValorDigitado(f.valor);
    const valorCasado = f.valorCasado.trim() && f.tipo !== "APOIO" && f.tipo !== "PASSEIO" ? lerValorDigitado(f.valorCasado) : null;
    if (valor === null) return setErro("Informe o valor da tarifa.");
    if (f.valorCasado.trim() && valorCasado === null) return setErro("Valor casado inválido.");
    if (valorCasado !== null && valorCasado > valor) return setErro("O valor casado deveria ser menor que o valor cheio.");
    setErro("");
    onSalvar(
      normalizarTarifa({
        ...inicial,
        ...f,
        servico: f.tipo === "PASSEIO" || f.tipo === "APOIO" ? f.servico : "",
        regiao: f.tipo === "PASSEIO" ? "" : f.regiao,
        regiaoDestino: f.tipo === "TRF" ? f.regiaoDestino : "",
        valor,
        valorCasado,
        id: inicial._nova ? undefined : inicial.id,
      }),
    );
  };

  const ehPasseio = f.tipo === "PASSEIO";
  const ehTrf = f.tipo === "TRF";
  const ehApoio = f.tipo === "APOIO";

  return (
    <Drawer
      open
      title={inicial._nova ? "Nova tarifa" : "Editar tarifa"}
      subtitle="Quanto o fornecedor cobra por este tipo de serviço."
      onClose={onFechar}
      onSave={salvar}
      saveLabel="Salvar tarifa"
      saving={salvando}
    >
      <div className="cst-form">
        <Field label="Fornecedor" hint="“Todos os fornecedores” vale quando o fornecedor não tem tarifa própria.">
          <input list="cst-lista-fornecedores" value={f.fornecedor} onChange={set("fornecedor")} placeholder="Todos os fornecedores" />
          <datalist id="cst-lista-fornecedores">
            {fornecedores.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </Field>

        <Field label="Tipo de serviço">
          <select value={f.tipo} onChange={set("tipo")}>
            {TIPOS_CUSTO.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.nome}
              </option>
            ))}
          </select>
        </Field>

        {ehPasseio ? (
          <Field label="Passeio" hint="Vazio = qualquer passeio.">
            <input list="cst-lista-passeios" value={f.servico} onChange={set("servico")} placeholder="Qualquer passeio" />
            <datalist id="cst-lista-passeios">
              {passeios.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </Field>
        ) : (
          <>
            <Field
              label={
                f.tipo === "IN"
                  ? "Região do hotel (destino)"
                  : f.tipo === "OUT"
                    ? "Região do hotel (origem)"
                    : ehApoio
                      ? "Região do hotel (onde o apoio busca)"
                      : "Região de origem"
              }
              hint="Como o Phoenix chama a região (ex.: SALVADOR, LITORAL NORTE). Vazio = qualquer região."
            >
              <input list="cst-lista-regioes" value={f.regiao} onChange={set("regiao")} placeholder="Qualquer região" />
            </Field>
            {ehApoio && (
              <Field label="Passeio (opcional)" hint="Vazio = vale para qualquer passeio.">
                <input list="cst-lista-passeios" value={f.servico} onChange={set("servico")} placeholder="Qualquer passeio" />
                <datalist id="cst-lista-passeios">
                  {passeios.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </Field>
            )}
            {ehTrf && (
              <Field label="Região de destino">
                <input list="cst-lista-regioes" value={f.regiaoDestino} onChange={set("regiaoDestino")} placeholder="Qualquer região" />
              </Field>
            )}
            <datalist id="cst-lista-regioes">
              {regioes.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </>
        )}

        <Field label="Categoria do veículo">
          <div className="cst-opcoes">
            <button type="button" className={`cst-opcao ${!f.categoria ? "is-ativa" : ""}`} onClick={() => setF((p) => ({ ...p, categoria: "" }))}>
              Qualquer
            </button>
            {CATEGORIAS.map((c) => (
              <button
                key={c.valor}
                type="button"
                className={`cst-opcao ${f.categoria === c.valor ? "is-ativa" : ""}`}
                aria-pressed={f.categoria === c.valor}
                onClick={() => setF((p) => ({ ...p, categoria: c.valor }))}
              >
                {c.nome}
              </button>
            ))}
          </div>
        </Field>

        <div className="cst-form__dupla">
          <Field label={ehApoio ? "Valor por trecho (R$)" : "Valor (R$)"} hint={ehApoio ? "Ida e volta = 2 trechos." : undefined}>
            <input inputMode="decimal" value={f.valor} onChange={set("valor")} placeholder="0,00" />
          </Field>
          {!ehApoio && !ehPasseio && (
            <Field label="Valor casado (R$)" hint="Cada perna do casado. Vazio = sem desconto.">
              <input inputMode="decimal" value={f.valorCasado} onChange={set("valorCasado")} placeholder="—" />
            </Field>
          )}
        </div>

        <Field label="Observação">
          <input value={f.obs} onChange={set("obs")} placeholder="Ex.: inclui pedágio" />
        </Field>

        {erro && (
          <p className="cst-erro" role="alert">
            {erro}
          </p>
        )}
      </div>
    </Drawer>
  );
};

/* ---------------- formulário de referência de guia ---------------- */
const FormGuia = ({ inicial, passeios, onFechar, onSalvar, salvando }) => {
  const [f, setF] = useState(() => ({
    tipo: inicial.tipo || "",
    servico: inicial.servico || "",
    categoria: inicial.categoria || "",
    valor: valorTexto(inicial.valor),
    obs: inicial.obs || "",
  }));
  const [erro, setErro] = useState("");
  const set = (campo) => (e) => setF((p) => ({ ...p, [campo]: e.target.value }));

  const salvar = () => {
    const valor = lerValorDigitado(f.valor);
    if (valor === null) return setErro("Informe o valor de referência.");
    setErro("");
    onSalvar(normalizarTarifaGuia({ ...inicial, ...f, servico: f.tipo === "PASSEIO" || !f.tipo ? f.servico : "", valor, id: inicial._nova ? undefined : inicial.id }));
  };

  return (
    <Drawer
      open
      title={inicial._nova ? "Nova referência de guia" : "Editar referência de guia"}
      subtitle="Valor sugerido. O valor pago de verdade é confirmado no dia."
      onClose={onFechar}
      onSave={salvar}
      saveLabel="Salvar"
      saving={salvando}
    >
      <div className="cst-form">
        <Field label="Tipo de serviço">
          <select value={f.tipo} onChange={set("tipo")}>
            <option value="">Qualquer serviço</option>
            {TIPOS_CUSTO.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.nome}
              </option>
            ))}
          </select>
        </Field>
        {(f.tipo === "PASSEIO" || !f.tipo) && (
          <Field label="Passeio" hint="Vazio = qualquer passeio.">
            <input list="cst-lista-passeios-g" value={f.servico} onChange={set("servico")} placeholder="Qualquer passeio" />
            <datalist id="cst-lista-passeios-g">
              {passeios.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </Field>
        )}
        <Field label="Categoria do veículo">
          <select value={f.categoria} onChange={set("categoria")}>
            <option value="">Qualquer</option>
            {CATEGORIAS.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.nome}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Valor de referência (R$)">
          <input inputMode="decimal" value={f.valor} onChange={set("valor")} placeholder="0,00" />
        </Field>
        <Field label="Observação">
          <input value={f.obs} onChange={set("obs")} placeholder="Ex.: diária de passeio inteiro" />
        </Field>
        {erro && (
          <p className="cst-erro" role="alert">
            {erro}
          </p>
        )}
      </div>
    </Drawer>
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

  const tarifasVisiveis = useMemo(() => {
    const termo = chaveTexto(busca);
    return config.tarifas
      .filter((t) => {
        if (fornecedorSel === GERAL && t.fornecedor) return false;
        if (fornecedorSel && fornecedorSel !== GERAL && chaveTexto(t.fornecedor) !== chaveTexto(fornecedorSel)) return false;
        if (termo && !chaveTexto([t.fornecedor, ondeDaTarifa(t), NOME_CATEGORIA[t.categoria], t.obs].join(" ")).includes(termo)) return false;
        return true;
      })
      .sort(
        (a, b) =>
          (a.fornecedor || "").localeCompare(b.fornecedor || "", "pt-BR") ||
          ["IN", "OUT", "TRF", "PASSEIO", "APOIO"].indexOf(a.tipo) - ["IN", "OUT", "TRF", "PASSEIO", "APOIO"].indexOf(b.tipo) ||
          ondeDaTarifa(a).localeCompare(ondeDaTarifa(b), "pt-BR") ||
          CATEGORIAS.findIndex((c) => c.valor === a.categoria) - CATEGORIAS.findIndex((c) => c.valor === b.categoria),
      );
  }, [config.tarifas, fornecedorSel, busca]);

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
          { value: "casado", label: "Serviço casado", icon: "refresh" },
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
            <Table columns="minmax(150px, 1fr) 90px minmax(220px, 1.6fr) 120px 120px 120px 116px" minWidth={940}>
              <TableHead>
                <span>Fornecedor</span>
                <span>Tipo</span>
                <span>Trajeto / passeio</span>
                <span>Categoria</span>
                <span className="ui-cell-end">Valor</span>
                <span className="ui-cell-end">Casado</span>
                <span />
              </TableHead>
              {tarifasVisiveis.map((t) => (
                <TableRow key={t.id}>
                  <span className={t.fornecedor ? "ui-cell-main" : "cst-geral"}>{t.fornecedor || "Todos os fornecedores"}</span>
                  <span>
                    <span className={`ui-tag cst-tipo cst-tipo--${t.tipo}`}>{NOME_TIPO[t.tipo]}</span>
                  </span>
                  <span>
                    {ondeDaTarifa(t)}
                    {t.obs && <span className="ui-cell-sub">{t.obs}</span>}
                  </span>
                  <span>{t.categoria ? NOME_CATEGORIA[t.categoria] : <span className="cst-vazio">Qualquer</span>}</span>
                  <span className="ui-cell-num">{formatarReais(t.valor)}</span>
                  <span className="ui-cell-num">{t.valorCasado !== null ? formatarReais(t.valorCasado) : <span className="cst-vazio">—</span>}</span>
                  <span className="ui-cell-end cst-acoes">
                    <Button variant="ghost" size="sm" iconOnly icon="pencil" title="Editar" onClick={() => setEditando(t)} />
                    <Button variant="ghost" size="sm" iconOnly icon="copy" title="Duplicar" onClick={() => duplicarTarifa(t)} />
                    <Button variant="ghost" size="sm" iconOnly icon="trash" title="Excluir" onClick={() => excluirTarifa(t)} />
                  </span>
                </TableRow>
              ))}
            </Table>
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
            <Table columns="110px minmax(200px, 1.6fr) 130px 130px 84px" minWidth={640}>
              <TableHead>
                <span>Tipo</span>
                <span>Passeio</span>
                <span>Categoria</span>
                <span className="ui-cell-end">Referência</span>
                <span />
              </TableHead>
              {config.tarifasGuia.map((t) => (
                <TableRow key={t.id}>
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
        <RegrasCasado
          key={JSON.stringify(config.casado)}
          regras={config.casado}
          regioes={regioes.length ? regioes : CASADO_PADRAO.regioes}
          salvando={salvando}
          onSalvar={(regras) => gravar({ casado: regras }, "Regra do casado salva")}
        />
      )}

      {editando && (
        <FormTarifa
          key={editando.id || `nova-${editando._ts || ""}`}
          inicial={editando.id ? editando : { ...editando, _nova: true }}
          fornecedores={nomesFornecedores}
          regioes={regioes}
          passeios={passeios}
          salvando={salvando}
          onFechar={() => setEditando(null)}
          onSalvar={salvarTarifa}
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
        />
      )}
    </div>
  );
};

export default TabelaTarifas;
