import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, EmptyState, Icon, PageHeader, Segmented, useToast } from "../ui";
import { useAuth } from "../../Context/AuthContext";
import { descreverServico } from "../../Services/Services/custosCalculo";
import { NIVEIS, REGRA, REGRAS, placarDoDia, textoDoChecklist, verificarProntidao } from "../../Services/Services/prontidaoCalculo";
import {
  buscarDadosProntidao,
  chaveVerificado,
  marcarVerificado,
  ouvirVerificados,
} from "../../Services/Services/prontidaoRepository";
import { salvarOcorrencia } from "../../Services/Services/ocorrenciasRepository";
import { dataBr, dataCurta, diaDaSemanaLongo, hojeIso, somarDias } from "../CustosOperacionais/custosDatas";
import FormOcorrencia from "../Ocorrencias/FormOcorrencia";
import useContextoCustos from "../Ocorrencias/useContextoCustos";
import { copiarTexto } from "../Ocorrencias/ocorrenciasUtils";
import "../Ocorrencias/ocorrencias.css";
import "./prontidao.css";

/* =========================================================
   PRONTIDÃO DO DIA (D-1)
   O robô confere todos os serviços do dia escolhido (amanhã, por padrão)
   e aponta o que está fora do eixo. A equipe marca como verificado o
   que já tratou, até o checklist zerar.
   ========================================================= */

const DIAS = [
  { value: 0, label: "Hoje" },
  { value: 1, label: "Amanhã" },
  { value: 2, label: "Depois de amanhã" },
];

const ATUALIZAR_A_CADA_MS = 10 * 60 * 1000;

const horaAgora = (d) => d?.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) || "";

const horaDoTimestamp = (ts) => {
  const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : null;
  return d ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
};

const Anel = ({ pct, tom }) => {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <svg className={`pdt-anel tom-${tom}`} viewBox="0 0 84 84" role="img" aria-label={`${pct}% dos serviços sem pendência`}>
      <circle cx="42" cy="42" r={r} className="trilho" />
      <circle cx="42" cy="42" r={r} className="valor" strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 42 42)" />
      <text x="42" y="47" textAnchor="middle">
        {pct}%
      </text>
    </svg>
  );
};

const Apontamento = ({ a, verificado, onVerificar, onDesfazer, onOcorrencia, salvando }) => {
  const [aberto, setAberto] = useState(false);
  const temLinhas = (a.linhas || []).length > 0;
  return (
    <li className={`pdt-item nivel-${a.nivel} ${verificado ? "verificado" : ""}`}>
      <div className="pdt-item-corpo">
        <div className="pdt-item-texto">
          <strong>{a.titulo}</strong>
          {a.detalhe && <span className="pdt-item-detalhe">{a.detalhe}</span>}
          {temLinhas && (
            <>
              <ul className={`pdt-linhas ${aberto || a.linhas.length <= 3 ? "" : "fechado"}`}>
                {(aberto ? a.linhas : a.linhas.slice(0, 3)).map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
              {a.linhas.length > 3 && (
                <button type="button" className="oco-link" onClick={() => setAberto((v) => !v)}>
                  {aberto ? "mostrar menos" : `+ ${a.linhas.length - 3}`}
                </button>
              )}
            </>
          )}
          {verificado ? (
            <span className="pdt-verificado-por">
              <Icon name="circleCheck" size={13} /> Verificado{verificado.por ? ` por ${verificado.por}` : ""}
              {horaDoTimestamp(verificado.em) ? ` às ${horaDoTimestamp(verificado.em)}` : ""}
              {verificado.nota ? ` — ${verificado.nota}` : ""}
            </span>
          ) : (
            a.dica && <span className="pdt-dica">{a.dica}</span>
          )}
        </div>
        <div className="pdt-item-acoes">
          {verificado ? (
            <button type="button" className="oco-link" onClick={() => onDesfazer(a)} disabled={salvando}>
              desfazer
            </button>
          ) : (
            <button type="button" className="pdt-ok" onClick={() => onVerificar(a)} disabled={salvando}>
              <Icon name="check" size={14} /> Verificado
            </button>
          )}
          {a.fornecedor && a.servicos.length > 0 && !verificado && (
            <button
              type="button"
              className="oco-icone"
              title="Registrar ocorrência deste fornecedor"
              onClick={() => onOcorrencia(a)}
            >
              <Icon name="flag" size={14} />
            </button>
          )}
        </div>
      </div>
    </li>
  );
};

const Prontidao = () => {
  const { perfil, user } = useAuth();
  const { mostrarToast } = useToast();
  const contexto = useContextoCustos();

  const [offset, setOffset] = useState(1);
  const [data, setData] = useState(() => somarDias(hojeIso(), 1));
  const [dados, setDados] = useState(null); // { data, itens, guias, … }
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [atualizadoEm, setAtualizadoEm] = useState(null);
  const [verificadosBrutos, setVerificadosBrutos] = useState({});
  const [filtroNivel, setFiltroNivel] = useState("");
  const [mostrarVerificados, setMostrarVerificados] = useState(false);
  const [salvandoId, setSalvandoId] = useState("");
  const [ocorrencia, setOcorrencia] = useState(null);
  const [salvandoOcorrencia, setSalvandoOcorrencia] = useState(false);

  const carregar = useCallback(
    async ({ silencioso = false } = {}) => {
      if (!silencioso) setCarregando(true);
      setErro("");
      try {
        const d = await buscarDadosProntidao(data);
        setDados({ data, ...d });
        setAtualizadoEm(new Date());
      } catch (e) {
        console.error(e);
        setErro("Não foi possível consultar o Phoenix agora. Tente atualizar em instantes.");
      } finally {
        setCarregando(false);
      }
    },
    [data],
  );

  useEffect(() => {
    carregar();
    const t = setInterval(() => carregar({ silencioso: true }), ATUALIZAR_A_CADA_MS);
    return () => clearInterval(t);
  }, [carregar]);

  useEffect(() => ouvirVerificados(data, setVerificadosBrutos), [data]);

  const resultado = useMemo(() => {
    if (!dados || dados.data !== data || !contexto.pronto) return null;
    return verificarProntidao({
      data,
      itens: dados.itens,
      config: contexto.config,
      vinculos: contexto.vinculos,
      fornecedores: contexto.fornecedores,
      guias: dados.guias,
      disponibilidades: dados.disponibilidades,
      alertasFornecedor: dados.alertasFornecedor,
    });
  }, [dados, data, contexto.pronto, contexto.config, contexto.vinculos, contexto.fornecedores]);

  // verificados por id do apontamento (no Firestore a chave é "segura")
  const verificados = useMemo(() => {
    if (!resultado) return {};
    const m = {};
    resultado.apontamentos.forEach((a) => {
      const v = verificadosBrutos[chaveVerificado(a.id)];
      if (v) m[a.id] = v;
    });
    return m;
  }, [resultado, verificadosBrutos]);

  const placar = resultado ? placarDoDia(resultado, verificados) : null;

  const visiveis = useMemo(() => {
    if (!resultado) return [];
    return resultado.apontamentos.filter(
      (a) => (!filtroNivel || a.nivel === filtroNivel) && (mostrarVerificados || !verificados[a.id]),
    );
  }, [resultado, filtroNivel, mostrarVerificados, verificados]);

  const grupos = useMemo(() => {
    const m = new Map();
    visiveis.forEach((a) => {
      if (!m.has(a.regra)) m.set(a.regra, []);
      m.get(a.regra).push(a);
    });
    return REGRAS.filter((r) => m.has(r.valor)).map((r) => ({ ...r, itens: m.get(r.valor) }));
  }, [visiveis]);

  const escolherDia = (n) => {
    setOffset(n);
    setData(somarDias(hojeIso(), n));
    setFiltroNivel("");
  };

  const mudarData = (valor) => {
    if (!valor) return;
    const n = DIAS.find((d) => somarDias(hojeIso(), d.value) === valor)?.value;
    setOffset(n ?? null);
    setData(valor);
    setFiltroNivel("");
  };

  const verificar = async (a, valor) => {
    setSalvandoId(a.id);
    try {
      await marcarVerificado(data, a.id, valor, perfil);
    } catch (e) {
      console.error(e);
      mostrarToast("Não foi possível salvar. Tente de novo.");
    } finally {
      setSalvandoId("");
    }
  };

  const dataTexto = `${diaDaSemanaLongo(data).toLowerCase()} ${dataCurta(data)}`;

  const copiarResumo = async () => {
    if (!resultado) return;
    if (await copiarTexto(textoDoChecklist(resultado, verificados, { dataTexto }))) mostrarToast("Resumo copiado — cole no grupo");
  };

  const abrirOcorrencia = (a) => {
    const s = resultado?.porChave.get(a.servicos[0]);
    setOcorrencia(
      s
        ? {
            data: s.data,
            hora: s.hora || "",
            tipoServico: s.tipoFinal,
            servicoDescricao: descreverServico(s),
            servicoChave: s.chave,
            escalaId: s.escalaId || "",
            fornecedor: s.fornecedor || a.fornecedor || "",
            veiculo: s.veiculo,
            veiculoKey: s.veiculoKey,
            placa: s.placa || "",
            motorista: s.motorista || "",
            guia: s.guiaPhoenix || "",
            pax: s.pax,
          }
        : { data, fornecedor: a.fornecedor || "" },
    );
  };

  const salvarNovaOcorrencia = async (campos) => {
    setSalvandoOcorrencia(true);
    try {
      await salvarOcorrencia(null, campos, perfil, user?.uid);
      mostrarToast("Ocorrência registrada");
      setOcorrencia(null);
    } catch (e) {
      console.error(e);
      alert("Não foi possível salvar a ocorrência.");
    } finally {
      setSalvandoOcorrencia(false);
    }
  };

  const tom = !placar ? "neutro" : placar.criticos ? "critico" : placar.atencao ? "atencao" : "ok";
  const manchete = !placar
    ? ""
    : placar.criticos
      ? `${placar.criticos} ponto(s) crítico(s) para resolver`
      : placar.atencao
        ? `${placar.atencao} ponto(s) para confirmar`
        : "Tudo pronto para o dia";

  const carregandoTudo = (carregando && !resultado) || !contexto.pronto;

  return (
    <div className="ui-page pdt-page">
      <PageHeader
        title="Prontidão do dia"
        description="O robô confere todos os serviços do dia e aponta o que está fora do eixo. Marque como verificado o que já foi tratado — a meta é zerar antes de encerrar o expediente."
        actions={
          <>
            <Button icon="copy" onClick={copiarResumo} disabled={!resultado}>
              Copiar resumo
            </Button>
            <Button icon="refresh" onClick={() => carregar()} loading={carregando} disabled={carregando}>
              Conferir agora
            </Button>
          </>
        }
      />

      <div className="pdt-dias">
        <Segmented ariaLabel="Dia" value={offset} onChange={escolherDia} options={DIAS} />
        <input type="date" className="ui-input pdt-data" value={data} onChange={(e) => mudarData(e.target.value)} aria-label="Data" />
        {atualizadoEm && (
          <span className="oco-muted">
            Conferido às {horaAgora(atualizadoEm)} · confere de novo sozinho a cada 10 min
          </span>
        )}
      </div>

      {erro && (
        <p className="oco-erro">
          <Icon name="alert" size={14} /> {erro}
        </p>
      )}

      {carregandoTudo ? (
        <EmptyState icon="loader" title={`Conferindo os serviços de ${dataBr(data)}…`}>
          Reservas do Phoenix, fornecedores, guias, disponibilidade e ocorrências recentes.
        </EmptyState>
      ) : resultado && placar ? (
        <>
          <section className={`pdt-placar tom-${tom}`}>
            <Anel pct={placar.percentual} tom={tom} />
            <div className="pdt-placar-texto">
              <span className="pdt-placar-dia">
                {diaDaSemanaLongo(data)}, {dataBr(data)}
              </span>
              <strong>{manchete}</strong>
              <span className="oco-muted">
                {resultado.resumo.servicos} serviço(s) · {resultado.resumo.reservas} reserva(s) · {resultado.resumo.pax} pax ·{" "}
                {placar.servicosOk} serviço(s) sem nenhuma pendência
              </span>
            </div>
            <div className="pdt-contadores" role="group" aria-label="Filtrar por nível">
              {NIVEIS.map((n) => {
                const qtd = placar[n.valor === "critico" ? "criticos" : n.valor];
                return (
                  <button
                    key={n.valor}
                    type="button"
                    className={`pdt-contador nivel-${n.valor} ${filtroNivel === n.valor ? "ativo" : ""}`}
                    onClick={() => setFiltroNivel(filtroNivel === n.valor ? "" : n.valor)}
                    aria-pressed={filtroNivel === n.valor}
                  >
                    <strong>{qtd}</strong>
                    <span>{n.nome}</span>
                  </button>
                );
              })}
              <label className="pdt-contador verificados">
                <input type="checkbox" checked={mostrarVerificados} onChange={(e) => setMostrarVerificados(e.target.checked)} />
                <strong>{placar.verificados}</strong>
                <span>Verificados</span>
              </label>
            </div>
          </section>

          {!grupos.length ? (
            <EmptyState icon="circleCheck" title={placar.total ? "Nada pendente com esse filtro" : "Nenhum ponto fora do eixo"}>
              {placar.total
                ? `${placar.verificados} de ${placar.total} apontamento(s) já verificados.`
                : "O robô não encontrou nada para conferir neste dia."}
            </EmptyState>
          ) : (
            <div className="pdt-grupos">
              {grupos.map((g) => (
                <section key={g.valor} className="pdt-grupo">
                  <header>
                    <Icon name={REGRA[g.valor].icone} size={16} />
                    <h3>{g.nome}</h3>
                    <span className="pdt-grupo-qtd">{g.itens.length}</span>
                  </header>
                  <ul>
                    {g.itens.map((a) => (
                      <Apontamento
                        key={a.id}
                        a={a}
                        verificado={verificados[a.id]}
                        salvando={salvandoId === a.id}
                        onVerificar={(x) => verificar(x, true)}
                        onDesfazer={(x) => verificar(x, false)}
                        onOcorrencia={abrirOcorrencia}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      ) : null}

      {ocorrencia && (
        <FormOcorrencia
          inicial={ocorrencia}
          contexto={contexto}
          onFechar={() => setOcorrencia(null)}
          onSalvar={salvarNovaOcorrencia}
          salvando={salvandoOcorrencia}
        />
      )}
    </div>
  );
};

export default Prontidao;
