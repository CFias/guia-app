import { useEffect, useMemo, useState } from "react";
import {
  CalendarMonthRounded,
  RefreshRounded,
  WarningAmberRounded,
  CheckCircleRounded,
  ErrorRounded,
  SearchRounded,
  SyncRounded,
  KeyboardArrowDownRounded,
  KeyboardArrowUpRounded,
  DirectionsBusRounded,
  FlightRounded,
  BadgeRounded,
} from "@mui/icons-material";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "../../Services/Services/firebase";
import "./styles.css";

const API_URL = "http://localhost:3001/api/conferente-voos";

const getHojeIso = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const formatarDataBr = (dataIso = "") => {
  if (!dataIso) return "";
  const [ano, mes, dia] = String(dataIso).split("-");
  return `${dia}/${mes}/${ano}`;
};

const formatarDiff = (diff) => {
  if (diff === null || diff === undefined) return "Sem comparação";
  if (diff === 0) return "No horário";
  if (diff > 0) return `${diff} min`;
  return `${Math.abs(diff)} min adiantado`;
};

const getClasse = (key = "") => {
  if (key === "ok") return "status-semaforo-verde";
  if (key === "divergencia") return "status-semaforo-amarelo";
  if (key === "critico") return "status-semaforo-vermelho";
  if (key === "sem-info") return "status-semaforo-cinza";
  return "status-semaforo-cinza";
};

const normalizarTexto = (texto = "") =>
  String(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const obterCapacidadeVeiculo = (fornecedores = [], nomeVeiculo = "") => {
  const chave = normalizarTexto(nomeVeiculo);
  if (!chave) return null;

  for (const fornecedor of fornecedores) {
    const veiculos = Array.isArray(fornecedor.veiculos)
      ? fornecedor.veiculos
      : [];

    for (const veiculo of veiculos) {
      if (typeof veiculo === "string") {
        if (normalizarTexto(veiculo) === chave) {
          return null;
        }
      } else {
        const nome = veiculo?.nome || "";
        if (normalizarTexto(nome) === chave) {
          const capacidade = veiculo?.capacidade;
          return capacidade !== undefined &&
            capacidade !== null &&
            capacidade !== ""
            ? Number(capacidade)
            : null;
        }
      }
    }
  }

  return null;
};

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const validarServicoEscalado = (item, fornecedores = []) => {
  const reservas = Array.isArray(item?.reservas) ? item.reservas : [];
  const veiculo = item?.veiculo || "";
  const totalPax = Number(item?.totalPax || 0);
  const capacidade = obterCapacidadeVeiculo(fornecedores, veiculo);

  const itens = [];
  let status = "ok";

  if (item?.matchEncontrado) {
    itens.push("Voo localizado na API do aeroporto");
  } else {
    itens.push("Voo não encontrado na API do aeroporto");
    status = "critico";
  }

  if (!veiculo) {
    itens.push("Serviço sem veículo escalado");
    if (status !== "critico") status = "divergencia";
  } else if (capacidade === null || Number.isNaN(capacidade)) {
    itens.push("Veículo sem capacidade cadastrada");
    if (status !== "critico") status = "divergencia";
  } else if (totalPax > capacidade) {
    itens.push(`OVER de ${totalPax - capacidade} pax`);
    status = "critico";
  } else {
    itens.push("Capacidade do veículo compatível");
  }

  if (!reservas.length) {
    itens.push("Serviço sem reservas vinculadas");
    if (status === "ok") status = "divergencia";
  }

  return {
    status,
    veiculo,
    capacidade,
    totalPax,
    itens,
  };
};

function BlocoResumo({ resumo }) {
  return (
    <div className="painel-chegadas-card">
      <div className="painel-chegadas-card-header">
        <div className="painel-chegadas-card-title-row">
          <h3>
            <BadgeRounded fontSize="small" />
            Resumo do Robô
          </h3>
        </div>
      </div>

      <div className="painel-chegadas-kpis">
        <div className="painel-chegadas-kpi">
          <div className="painel-chegadas-kpi-icon">
            <DirectionsBusRounded fontSize="small" />
          </div>
          <div>
            <span>Serviços</span>
            <strong>{resumo?.totalServicos || 0}</strong>
          </div>
        </div>

        <div className="painel-chegadas-kpi">
          <div className="painel-chegadas-kpi-icon">
            <CheckCircleRounded fontSize="small" />
          </div>
          <div>
            <span>OK</span>
            <strong>{resumo?.ok || 0}</strong>
          </div>
        </div>

        <div className="painel-chegadas-kpi">
          <div className="painel-chegadas-kpi-icon">
            <WarningAmberRounded fontSize="small" />
          </div>
          <div>
            <span>Alerta</span>
            <strong>{resumo?.divergencia || 0}</strong>
          </div>
        </div>

        <div className="painel-chegadas-kpi">
          <div className="painel-chegadas-kpi-icon">
            <ErrorRounded fontSize="small" />
          </div>
          <div>
            <span>Crítico</span>
            <strong>{resumo?.critico || 0}</strong>
          </div>
        </div>

        <div className="painel-chegadas-kpi">
          <div className="painel-chegadas-kpi-icon">
            <SearchRounded fontSize="small" />
          </div>
          <div>
            <span>Sem match</span>
            <strong>{resumo?.semMatch || 0}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

function ListaServicosEscalados({
  lista,
  roboRodando,
  indiceAtualRobo,
  filaServicos,
  resultadoPorServico,
}) {
  const [expandidos, setExpandidos] = useState({});

  const toggle = (id) => {
    setExpandidos((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="painel-chegadas-card painel-chegadas-card-full">
      <div className="painel-chegadas-card-header">
        <div className="painel-chegadas-card-title-row">
          <h3>
            <DirectionsBusRounded fontSize="small" />
            Serviços escalados
          </h3>
          <span className="painel-chegadas-badge">
            {lista.length} serviço(s)
          </span>
        </div>
        <p>
          Diagnóstico unificado por escala do Phoenix, considerando voo, veículo
          e capacidade.
        </p>
      </div>

      {!lista.length ? (
        <div className="painel-chegadas-inline-empty">
          <WarningAmberRounded fontSize="small" />
          <span>Nenhum serviço escalado encontrado.</span>
        </div>
      ) : (
        <div className="painel-chegadas-list">
          {lista.map((item) => {
            const expandido = !!expandidos[item.id];
            const roboId = item?.__roboId || item.id;
            const roboResultado = resultadoPorServico[roboId];
            const estaAnalisando =
              roboRodando && filaServicos[indiceAtualRobo]?.__roboId === roboId;

            return (
              <div className="painel-chegadas-flight-card" key={item.id}>
                <div
                  className="painel-chegadas-flight-top-trigger"
                  role="button"
                  tabIndex={0}
                  onClick={() => toggle(item.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggle(item.id);
                    }
                  }}
                >
                  <div className="painel-chegadas-flight-main">
                    <div className="painel-chegadas-flight-code-wrap">
                      <strong className="painel-chegadas-flight-code">
                        ESCALA {item.escalaId || "-"}
                      </strong>

                      {!roboResultado && (
                        <span
                          className={`painel-chegadas-status ${getClasse(
                            item.classificacao?.key,
                          )}`}
                        >
                          {item.classificacao?.label || "Sem info"}
                        </span>
                      )}

                      {!!roboResultado && (
                        <span
                          className={`painel-chegadas-status ${getClasse(
                            roboResultado.status,
                          )}`}
                        >
                          {roboResultado.status === "ok"
                            ? "OK"
                            : roboResultado.status === "divergencia"
                              ? "Alerta"
                              : "Crítico"}
                        </span>
                      )}

                      {estaAnalisando && (
                        <span className="painel-chegadas-status status-semaforo-amarelo">
                          Analisando...
                        </span>
                      )}
                    </div>

                    <div className="painel-chegadas-flight-meta">
                      <span>Tipo: {item.tipo || "-"}</span>
                      <span>Voo: {item.vooSistema || "-"}</span>
                      <span>Veículo: {item.veiculo || "-"}</span>
                      <span>Motorista: {item.motorista || "-"}</span>
                      <span>Pax: {item.totalPax || 0}</span>
                      <span>Phoenix: {item.horarioPhoenix || "--:--"}</span>
                      <span>
                        API previsto: {item.horarioAeroportoPrevisto || "--:--"}
                      </span>
                      <span>
                        API operacional:{" "}
                        {item.horarioAeroportoOperacional || "--:--"}
                      </span>
                      <span>
                        Diferença: {formatarDiff(item.diferencaMinutos)}
                      </span>
                      <span>
                        Status API: {item.statusAeroportoLabel || "-"}
                      </span>
                      <span>Match: {item.matchEncontrado ? "Sim" : "Não"}</span>
                    </div>
                  </div>

                  <div className="painel-chegadas-expand-icon">
                    {expandido ? (
                      <KeyboardArrowUpRounded fontSize="small" />
                    ) : (
                      <KeyboardArrowDownRounded fontSize="small" />
                    )}
                  </div>
                </div>

                {expandido && (
                  <div className="painel-chegadas-flight-expanded">
                    <div className="painel-chegadas-driver-block">
                      <div className="painel-chegadas-driver-header">
                        <div className="painel-chegadas-driver-title">
                          <FlightRounded fontSize="small" />
                          <strong>{item.companhia || "-"}</strong>
                        </div>
                      </div>

                      <div className="painel-chegadas-driver-meta">
                        <span>Escala: {item.escalaId || "-"}</span>
                        <span>Tipo: {item.tipo || "-"}</span>
                        <span>Voo: {item.vooSistema || "-"}</span>
                        <span>Veículo: {item.veiculo || "-"}</span>
                        <span>Motorista: {item.motorista || "-"}</span>
                        <span>Pax total: {item.totalPax || 0}</span>
                        <span>
                          Origem/Destino: {item.aeroportoOrigemDestino || "-"}
                        </span>
                      </div>

                      {!!roboResultado?.itens?.length && (
                        <div className="painel-chegadas-driver-meta">
                          {roboResultado.itens.map((texto, idx) => (
                            <span key={`${roboId}_item_${idx}`}>⚠ {texto}</span>
                          ))}
                          <span>
                            Capacidade:{" "}
                            {roboResultado.capacidade ?? "Não cadastrada"}
                          </span>
                        </div>
                      )}

                      <div className="painel-chegadas-reservations">
                        {(item.reservas || []).map((r, idx) => (
                          <div
                            className="painel-chegadas-reservation-item"
                            key={`${r.reserva}_${idx}`}
                          >
                            <strong>{r.cliente}</strong>
                            <span>Reserva: {r.reserva}</span>
                            <span>Pax: {r.pax}</span>
                            <span>Voo reserva: {r.vooReserva || "-"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function RoboConferenteVoos() {
  const [dataSelecionada, setDataSelecionada] = useState(getHojeIso());
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [fornecedores, setFornecedores] = useState([]);
  const [roboRodando, setRoboRodando] = useState(false);
  const [indiceAtualRobo, setIndiceAtualRobo] = useState(-1);
  const [resultadoPorServico, setResultadoPorServico] = useState({});
  const [payload, setPayload] = useState({
    summary: {},
    data: { servicos: [] },
  });

  const carregar = async () => {
    try {
      setLoading(true);
      setErro("");

      const response = await fetch(`${API_URL}?date=${dataSelecionada}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      const contentType = response.headers.get("content-type") || "";
      let json = null;
      let textoErro = "";

      if (contentType.includes("application/json")) {
        json = await response.json();
      } else {
        textoErro = await response.text();
      }

      if (!response.ok) {
        throw new Error(
          json?.detalhe ||
            json?.erro ||
            textoErro ||
            `Erro HTTP ${response.status}`,
        );
      }

      setPayload({
        summary: json?.summary || {},
        data: json?.data || { servicos: [] },
      });

      setResultadoPorServico({});
      setIndiceAtualRobo(-1);
      setRoboRodando(false);
    } catch (error) {
      console.error("Erro ao carregar conferente:", error);
      setErro(error.message || "Não foi possível executar o robô conferente.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregar();
  }, [dataSelecionada]);

  useEffect(() => {
    const q = query(collection(db, "providers"));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const lista = snapshot.docs.map((docItem) => ({
          id: docItem.id,
          ...docItem.data(),
        }));
        setFornecedores(lista);
      },
      (error) => {
        console.error("Erro ao carregar providers do Firestore:", error);
      },
    );

    return () => unsub();
  }, []);

  const servicosBase = useMemo(
    () =>
      (Array.isArray(payload.data?.servicos) ? payload.data.servicos : []).map(
        (item, index) => ({
          ...item,
          __roboId: item?.id || `servico_${index}`,
        }),
      ),
    [payload.data?.servicos],
  );

  const filaServicos = useMemo(() => servicosBase, [servicosBase]);

  const rodarRoboServicoPorServico = async () => {
    if (!filaServicos.length || roboRodando) return;

    setRoboRodando(true);
    setIndiceAtualRobo(-1);
    setResultadoPorServico({});

    for (let i = 0; i < filaServicos.length; i += 1) {
      const item = filaServicos[i];
      const roboId = item.__roboId;

      setIndiceAtualRobo(i);

      const resultado = validarServicoEscalado(item, fornecedores);

      setResultadoPorServico((prev) => ({
        ...prev,
        [roboId]: resultado,
      }));

      await esperar(280);
    }

    setIndiceAtualRobo(-1);
    setRoboRodando(false);
  };

  return (
    <div className="painel-chegadas-page">
      <div className="painel-chegadas-header">
        <div>
          <h2 className="painel-chegadas-title">
            <SearchRounded fontSize="small" />
            Robô Conferente Operacional
          </h2>
          <p className="painel-chegadas-subtitle">
            Auditoria por serviço escalado do Phoenix, consolidando voo,
            veículo, capacidade e diagnóstico operacional completo.
          </p>
        </div>
      </div>

      <div className="painel-chegadas-grid">
        <div className="painel-chegadas-card painel-chegadas-card-large">
          <div className="painel-chegadas-card-header">
            <div className="painel-chegadas-card-title-row">
              <h3>Parâmetros</h3>
              <span className="painel-chegadas-badge">
                {formatarDataBr(dataSelecionada)}
              </span>
            </div>
          </div>

          <div className="painel-chegadas-toolbar">
            <div className="painel-chegadas-field">
              <label>
                <CalendarMonthRounded fontSize="small" />
                Data da conferência
              </label>
              <input
                className="painel-chegadas-input"
                type="date"
                value={dataSelecionada}
                onChange={(e) => setDataSelecionada(e.target.value)}
                disabled={loading || roboRodando}
              />
            </div>

            <button
              type="button"
              className="painel-chegadas-google-btn"
              onClick={carregar}
              disabled={loading || roboRodando}
            >
              {loading ? (
                <SyncRounded className="spin" fontSize="small" />
              ) : (
                <RefreshRounded fontSize="small" />
              )}
              Atualizar conferência
            </button>

            <button
              type="button"
              className="painel-chegadas-google-btn"
              onClick={rodarRoboServicoPorServico}
              disabled={loading || roboRodando || !filaServicos.length}
            >
              {roboRodando ? (
                <SyncRounded className="spin" fontSize="small" />
              ) : (
                <SearchRounded fontSize="small" />
              )}
              {roboRodando ? "Rodando robô..." : "Rodar robô"}
            </button>
          </div>
        </div>

        <BlocoResumo resumo={payload.summary} />

        {erro ? (
          <div className="painel-chegadas-card painel-chegadas-card-full">
            <div className="painel-chegadas-inline-empty">
              <ErrorRounded fontSize="small" />
              <span>{erro}</span>
            </div>
          </div>
        ) : null}

        <ListaServicosEscalados
          lista={servicosBase}
          roboRodando={roboRodando}
          indiceAtualRobo={indiceAtualRobo}
          filaServicos={filaServicos}
          resultadoPorServico={resultadoPorServico}
        />
      </div>
    </div>
  );
}
