import { useEffect, useMemo, useState } from "react";
import { Button, EmptyState, Field, FilterBar, Icon, KpiTiles, PageHeader, Segmented, useToast } from "../ui";
import { useAuth } from "../../Context/AuthContext";
import { NOME_TIPO } from "../../Services/Services/custosCalculo";
import {
  CATEGORIAS_OCORRENCIA,
  CATEGORIA_OCORRENCIA,
  NOME_GRAVIDADE,
  NOME_RESPONSAVEL,
  RESPONSAVEIS,
  contaContraFornecedor,
  ehPositiva,
  resumirOcorrencias,
  textoDaOcorrencia,
} from "../../Services/Services/ocorrenciasCalculo";
import {
  excluirOcorrencia,
  marcarResolvida,
  ouvirOcorrencias,
  salvarOcorrencia,
} from "../../Services/Services/ocorrenciasRepository";
import { dataCurta, diaDaSemana } from "../CustosOperacionais/custosDatas";
import FormOcorrencia from "./FormOcorrencia";
import RelatorioOcorrencias from "./RelatorioOcorrencias";
import useContextoCustos from "./useContextoCustos";
import { PERIODOS, copiarTexto, periodoDoPreset } from "./ocorrenciasUtils";
import "./ocorrencias.css";

/* =========================================================
   OCORRÊNCIAS DE FORNECEDORES
   Registro de tudo que o fornecedor gerou na operação (atraso, não
   compareceu, veículo trocado, reclamação, elogio…) com responsável,
   gravidade e impacto. Vira histórico e relatório para a gerência.
   ========================================================= */

const ABAS = [
  { value: "registros", label: "Registros", icon: "listCheck" },
  { value: "relatorio", label: "Relatório", icon: "barChart" },
];

const FILTRO_VAZIO = { fornecedor: "", categoria: "", responsavel: "", status: "", busca: "" };

const LinhaOcorrencia = ({ o, onAbrir, onAlternarStatus, onCopiar }) => {
  const cat = CATEGORIA_OCORRENCIA[o.categoria] || CATEGORIA_OCORRENCIA.outro;
  const positiva = ehPositiva(o);
  return (
    <li className={`oco-item ${positiva ? "positiva" : ""} ${o.status === "resolvida" ? "resolvida" : ""}`}>
      <button type="button" className="oco-item-corpo" onClick={() => onAbrir(o)}>
        <span className="oco-item-data">
          <strong>{dataCurta(o.data)}</strong>
          <small>
            {diaDaSemana(o.data)}
            {o.hora ? ` · ${o.hora}` : ""}
          </small>
        </span>
        <span className="oco-item-forn">
          <strong>{o.fornecedor}</strong>
          <small>
            {o.tipoServico && <span className={`oco-tipo mini tipo-${o.tipoServico}`}>{NOME_TIPO[o.tipoServico]}</span>}
            {[o.veiculo, o.servicoDescricao].filter(Boolean).join(" · ")}
          </small>
        </span>
        <span className={`oco-item-cat ${positiva ? "positiva" : ""}`}>
          <Icon name={cat.icone} size={14} />
          {cat.nome}
          {o.categoria === "atraso" && o.atrasoMin ? <em>{o.atrasoMin} min</em> : null}
        </span>
        <span className="oco-item-resp">
          {positiva ? (
            <span className="oco-muted">—</span>
          ) : (
            <>
              <span className={`oco-resp resp-${o.responsavel}`}>{NOME_RESPONSAVEL[o.responsavel]}</span>
              <span className={`oco-grav-dot grav-${o.gravidade}`}>{NOME_GRAVIDADE[o.gravidade]}</span>
            </>
          )}
        </span>
      </button>
      <span className="oco-item-acoes">
        {!positiva && (
          <button
            type="button"
            className={`oco-status ${o.status === "resolvida" ? "ok" : ""}`}
            onClick={() => onAlternarStatus(o)}
            title={o.status === "resolvida" ? "Reabrir" : "Marcar como resolvida"}
          >
            <Icon name={o.status === "resolvida" ? "circleCheck" : "clock"} size={13} />
            {o.status === "resolvida" ? "Resolvida" : "Em aberto"}
          </button>
        )}
        <button type="button" className="oco-icone" onClick={() => onCopiar(o)} title="Copiar texto pronto">
          <Icon name="copy" size={14} />
        </button>
      </span>
    </li>
  );
};

const Ocorrencias = () => {
  const { perfil, user } = useAuth();
  const { mostrarToast } = useToast();
  const contexto = useContextoCustos();

  const [aba, setAba] = useState("registros");
  const [preset, setPreset] = useState("mes");
  const [periodo, setPeriodo] = useState(() => periodoDoPreset("mes"));
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState(FILTRO_VAZIO);
  const [form, setForm] = useState(null); // null | { ocorrencia? }
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!periodo.inicio || !periodo.fim || periodo.inicio > periodo.fim) return undefined;
    setCarregando(true);
    return ouvirOcorrencias(periodo.inicio, periodo.fim, (l) => {
      setLista(l);
      setCarregando(false);
    });
  }, [periodo.inicio, periodo.fim]);

  const escolherPreset = (v) => {
    setPreset(v);
    setPeriodo(periodoDoPreset(v));
  };

  const mudarData = (campo, valor) => {
    setPreset("");
    setPeriodo((p) => ({ ...p, [campo]: valor }));
  };

  const resumo = useMemo(() => resumirOcorrencias(lista), [lista]);

  const fornecedoresNaLista = useMemo(
    () =>
      Array.from(new Map(lista.map((o) => [o.fornecedorKey, o.fornecedor])).entries()).sort((a, b) =>
        a[1].localeCompare(b[1], "pt-BR"),
      ),
    [lista],
  );

  const filtrada = useMemo(() => {
    const termo = filtro.busca.trim().toLowerCase();
    return lista
      .filter((o) => !filtro.fornecedor || o.fornecedorKey === filtro.fornecedor)
      .filter((o) => !filtro.categoria || o.categoria === filtro.categoria)
      .filter((o) => !filtro.responsavel || (!ehPositiva(o) && o.responsavel === filtro.responsavel))
      .filter((o) =>
        !filtro.status ? true : filtro.status === "contra" ? contaContraFornecedor(o) : !ehPositiva(o) && o.status === filtro.status,
      )
      .filter(
        (o) =>
          !termo ||
          `${o.fornecedor} ${o.veiculo} ${o.motorista} ${o.servicoDescricao} ${o.descricao} ${o.guia}`
            .toLowerCase()
            .includes(termo),
      )
      .sort((a, b) => `${b.data} ${b.hora}`.localeCompare(`${a.data} ${a.hora}`));
  }, [lista, filtro]);

  const setF = (patch) => setFiltro((p) => ({ ...p, ...patch }));
  const filtrando = Object.values(filtro).some(Boolean);

  const salvar = async (campos) => {
    setSalvando(true);
    try {
      await salvarOcorrencia(form?.ocorrencia?.id || null, campos, perfil, user?.uid);
      mostrarToast?.(form?.ocorrencia?.id ? "Ocorrência atualizada" : "Ocorrência registrada");
      setForm(null);
      // registro fora do período na tela: mostra o período dele
      if (campos.data && (campos.data < periodo.inicio || campos.data > periodo.fim)) {
        setPreset("");
        setPeriodo({ inicio: campos.data, fim: campos.data > periodo.fim ? campos.data : periodo.fim });
      }
    } catch (e) {
      console.error(e);
      alert("Não foi possível salvar a ocorrência. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (o) => {
    try {
      await excluirOcorrencia(o.id);
      mostrarToast?.("Ocorrência excluída");
      setForm(null);
    } catch (e) {
      console.error(e);
      alert("Não foi possível excluir.");
    }
  };

  const alternarStatus = (o) =>
    marcarResolvida(o.id, o.status !== "resolvida", undefined, perfil, user?.uid).catch((e) => {
      console.error(e);
      alert("Não foi possível atualizar o status.");
    });

  const copiar = async (o) => {
    if (await copiarTexto(textoDaOcorrencia(o))) mostrarToast?.("Texto copiado");
  };

  const kpis = [
    {
      key: "total",
      label: "Ocorrências",
      value: resumo.negativas,
      icon: "alert",
      hint: resumo.elogios ? `+ ${resumo.elogios} elogio(s)` : undefined,
      active: !filtro.status && !filtro.categoria,
      onClick: () => setF({ status: "", categoria: "" }),
      loading: carregando,
    },
    {
      key: "contra",
      label: "Falha do fornecedor",
      value: resumo.contraFornecedor,
      icon: "truck",
      active: filtro.status === "contra",
      onClick: () => setF({ status: filtro.status === "contra" ? "" : "contra", categoria: "" }),
      loading: carregando,
    },
    {
      key: "graves",
      label: "Graves",
      value: resumo.graves,
      icon: "flag",
      tone: resumo.graves ? "alert" : undefined,
      loading: carregando,
    },
    {
      key: "abertas",
      label: "Em aberto",
      value: resumo.abertas,
      icon: "clock",
      tone: resumo.abertas ? "warning" : undefined,
      active: filtro.status === "aberta",
      onClick: () => setF({ status: filtro.status === "aberta" ? "" : "aberta", categoria: "" }),
      loading: carregando,
    },
    {
      key: "atraso",
      label: "Atraso médio",
      value: resumo.atrasos ? `${resumo.mediaAtraso} min` : "—",
      icon: "clock",
      hint: resumo.atrasos ? `${resumo.atrasos} atraso(s)` : undefined,
      loading: carregando,
    },
    {
      key: "elogios",
      label: "Elogios",
      value: resumo.elogios,
      icon: "star",
      active: filtro.categoria === "elogio",
      onClick: () => setF({ categoria: filtro.categoria === "elogio" ? "" : "elogio", status: "" }),
      loading: carregando,
    },
  ];

  return (
    <div className="ui-page oco-page">
      <PageHeader
        title="Ocorrências de fornecedores"
        description="Atrasos, faltas, veículo trocado, reclamações e elogios — com quem foi o responsável e o impacto. Vira histórico de cada fornecedor e relatório para a gerência."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setForm({})}>
            Registrar ocorrência
          </Button>
        }
      />

      <div className="oco-topo">
        <Segmented ariaLabel="Seções" value={aba} onChange={setAba} options={ABAS} />
        <div className="oco-periodo">
          <Segmented size="sm" ariaLabel="Período" value={preset} onChange={escolherPreset} options={PERIODOS} />
          <span className="oco-datas">
            <input
              type="date"
              className="ui-input"
              value={periodo.inicio}
              onChange={(e) => mudarData("inicio", e.target.value)}
              aria-label="Início"
            />
            <span>até</span>
            <input
              type="date"
              className="ui-input"
              value={periodo.fim}
              onChange={(e) => mudarData("fim", e.target.value)}
              aria-label="Fim"
            />
          </span>
        </div>
      </div>

      {aba === "registros" && (
        <>
          <KpiTiles items={kpis} />

          <FilterBar>
            <Field label="Fornecedor" icon="truck">
              <select value={filtro.fornecedor} onChange={(e) => setF({ fornecedor: e.target.value })}>
                <option value="">Todos</option>
                {fornecedoresNaLista.map(([k, n]) => (
                  <option key={k} value={k}>
                    {n}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ocorrência" icon="alert">
              <select value={filtro.categoria} onChange={(e) => setF({ categoria: e.target.value })}>
                <option value="">Todas</option>
                {CATEGORIAS_OCORRENCIA.map((c) => (
                  <option key={c.valor} value={c.valor}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Responsável" icon="user">
              <select value={filtro.responsavel} onChange={(e) => setF({ responsavel: e.target.value })}>
                <option value="">Todos</option>
                {RESPONSAVEIS.map((r) => (
                  <option key={r.valor} value={r.valor}>
                    {r.nome}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Buscar" icon="search" grow>
              <input
                type="search"
                value={filtro.busca}
                onChange={(e) => setF({ busca: e.target.value })}
                placeholder="Veículo, motorista, hotel, descrição…"
              />
            </Field>
            {filtrando && (
              <button type="button" className="oco-link oco-limpar" onClick={() => setFiltro(FILTRO_VAZIO)}>
                Limpar filtros
              </button>
            )}
          </FilterBar>

          {carregando ? (
            <EmptyState icon="loader" title="Carregando ocorrências…" />
          ) : !lista.length ? (
            <EmptyState
              icon="clipboardCheck"
              title="Nenhuma ocorrência neste período"
              action={
                <Button icon="plus" onClick={() => setForm({})}>
                  Registrar a primeira
                </Button>
              }
            >
              Quando um fornecedor atrasar, faltar ou receber um elogio, registre aqui — o histórico vira relatório.
            </EmptyState>
          ) : !filtrada.length ? (
            <EmptyState icon="filter" title="Nada com esses filtros" />
          ) : (
            <>
              <p className="oco-contagem">
                {filtrada.length} registro(s){filtrando ? ` de ${lista.length}` : ""}
              </p>
              <ul className="oco-lista">
                {filtrada.map((o) => (
                  <LinhaOcorrencia
                    key={o.id}
                    o={o}
                    onAbrir={(x) => setForm({ ocorrencia: x })}
                    onAlternarStatus={alternarStatus}
                    onCopiar={copiar}
                  />
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {aba === "relatorio" && (
        <RelatorioOcorrencias lista={lista} periodo={periodo} carregando={carregando} contexto={contexto} />
      )}

      {form && (
        <FormOcorrencia
          ocorrencia={form.ocorrencia}
          inicial={form.inicial}
          contexto={contexto}
          onFechar={() => setForm(null)}
          onSalvar={salvar}
          onExcluir={excluir}
          salvando={salvando}
        />
      )}
    </div>
  );
};

export default Ocorrencias;
