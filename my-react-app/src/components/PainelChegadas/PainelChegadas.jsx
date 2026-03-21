import { useEffect, useMemo, useState } from "react";
import {
  FlightLandRounded,
  CalendarMonthRounded,
  RefreshRounded,
  AccessTimeRounded,
  GroupsRounded,
  Inventory2Rounded,
  AirplanemodeActiveRounded,
  WarningAmberRounded,
  KeyboardArrowDownRounded,
  KeyboardArrowUpRounded,
  FilterAltRounded,
  ConnectingAirportsRounded,
  SearchRounded,
  SyncRounded,
} from "@mui/icons-material";
import "./styles.css";

const API_BASE =
  "https://driversalvador.phoenix.comeialabs.com/scale/reserve-service";

const EXPAND =
  "service,schedule,reserve,establishmentOrigin,establishmentDestination,establishmentOrigin.region,establishmentDestination.region,reserve.partner,reserve.customer,additionalReserveServices,additionalReserveServices.additional,additionalReserveServices.provider,roadmapService,roadmapService.roadmap,auxRoadmapService.roadmap.serviceOrder,auxRoadmapService.roadmap.serviceOrder.vehicle,auxRoadmapService.roadmap.driver,auxRoadmapService.roadmap.guide,roadmapService.roadmap.driver,roadmapService.roadmap.guide,roadmapService.roadmap.serviceOrder,roadmapService.roadmap.serviceOrder.vehicle,reserve.pdvPayment.user";

const getHojeIso = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const abrirBuscaGoogleVoo = (codigoVoo) => {
  if (!codigoVoo) return;

  const query = encodeURIComponent(String(codigoVoo).replace(/\s*-\s*/g, " "));
  window.open(
    `https://www.google.com/search?q=${query}`,
    "_blank",
    "noopener,noreferrer",
  );
};

const formatarDataBr = (dataIso) => {
  if (!dataIso) return "";
  const [ano, mes, dia] = String(dataIso).split("-");
  return `${dia}/${mes}/${ano}`;
};

const normalizarTexto = (texto = "") =>
  String(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[|]/g, " ")
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const montarUrlApi = (date) => {
  const params = new URLSearchParams();
  params.append("execution_date", date);
  params.append("expand", EXPAND);
  params.append("service_type[]", "1");
  return `${API_BASE}?${params.toString()}`;
};

const extrairListaResposta = (json) => {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.results)) return json.results;
  return [];
};

const extrairPax = (item) => {
  const adultos = Number(item?.is_adult_count || 0);
  const criancas = Number(item?.is_child_count || 0);
  return adultos + criancas;
};

const extrairAdultos = (item) => Number(item?.is_adult_count || 0);
const extrairCriancas = (item) => Number(item?.is_child_count || 0);
const extrairInfantes = (item) =>
  Number(item?.is_baby_count || item?.is_infant_count || 0);

const extrairResumoPax = (item) => {
  const adt = extrairAdultos(item);
  const chd = extrairCriancas(item);
  const inf = extrairInfantes(item);
  return `ADT ${adt} | CHD ${chd} | INF ${inf}`;
};

const extrairCodigoReserva = (item) =>
  item?.reserve?.code ||
  item?.reserve_code ||
  item?.code ||
  item?.reserve?.id ||
  "-";

const extrairNomeCliente = (item) =>
  item?.reserve?.customer?.name ||
  item?.customer?.name ||
  item?.reserve?.holder_name ||
  item?.passenger_name ||
  "Cliente não informado";

const extrairDestino = (item) =>
  item?.establishmentDestination?.name ||
  item?.destination?.name ||
  item?.reserve?.destination?.name ||
  "Destino não informado";

const extrairOperadora = (item) => {
  const bruto =
    item?.reserve?.partner?.name ||
    item?.reserve?.partner?.fantasy_name ||
    item?.reserve?.partner?.company_name ||
    item?.reserve?.operator?.name ||
    item?.reserve?.agency?.name ||
    item?.partner?.name ||
    item?.operator?.name ||
    item?.agency?.name ||
    item?.reserve?.origin_operator_name ||
    item?.reserve?.seller_name ||
    item?.reserve?.pdvPayment?.user?.name ||
    "";

  const texto = String(bruto || "").trim();
  if (!texto) return "-";

  const normalizado = normalizarTexto(texto);

  if (normalizado.includes("azul")) return "AZUL";
  if (normalizado.includes("frt")) return "FRT";
  if (normalizado.includes("cvc")) return "CVC";
  if (normalizado.includes("decolar")) return "DECOLAR";
  if (normalizado.includes("orpheus")) return "ORPHEUS";
  if (normalizado.includes("visual")) return "VISUAL";
  if (normalizado.includes("hotelbeds")) return "HOTELBEDS";
  if (normalizado.includes("tui")) return "TUI";
  if (normalizado.includes("booking")) return "BOOKING";
  if (normalizado.includes("expedia")) return "EXPEDIA";

  return texto.toUpperCase();
};

const extrairContatoPax = (item) =>
  item?.reserve?.customer?.phone ||
  item?.reserve?.customer?.telephone ||
  item?.reserve?.customer?.cellphone ||
  item?.reserve?.customer?.mobile ||
  item?.customer?.phone ||
  item?.customer?.telephone ||
  item?.customer?.cellphone ||
  item?.customer?.mobile ||
  item?.reserve?.holder_phone ||
  item?.reserve?.holder_whatsapp ||
  item?.reserve?.phone ||
  item?.reserve?.whatsapp ||
  "-";

const formatarContato = (valor = "") => {
  const numeros = String(valor).replace(/\D/g, "");

  if (!numeros) return "-";
  if (numeros.length <= 10) {
    if (numeros.length < 10) return valor || "-";
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 6)}-${numeros.slice(6)}`;
  }

  if (numeros.length === 11) {
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`;
  }

  return valor || "-";
};

const extrairAdicionais = (item) => {
  if (!Array.isArray(item?.additionalReserveServices)) return "-";

  const adicionais = item.additionalReserveServices
    .map(
      (add) => add?.additional?.name || add?.provider?.name || add?.name || "",
    )
    .filter(Boolean);

  if (!adicionais.length) return "-";

  return adicionais.join(", ");
};

const extrairHorarioServico = (item) => {
  const bruto =
    item?.presentation_hour ||
    item?.presentation_hour_end ||
    item?.schedule?.presentation_hour ||
    item?.date ||
    item?.execution_date ||
    "";

  if (!bruto) return "";

  const valor = String(bruto);

  if (valor.includes("T")) {
    return valor.split("T")[1]?.slice(0, 5) || "";
  }

  const match = valor.match(/\b(\d{2}:\d{2})/);
  return match?.[1] || "";
};

const extrairEscalaId = (item) =>
  item?.roadmapService?.roadmap?.id ||
  item?.auxRoadmapService?.roadmap?.id ||
  item?.roadmap?.id ||
  null;

const extrairMotorista = (item) =>
  item?.roadmapService?.roadmap?.driver?.name ||
  item?.auxRoadmapService?.roadmap?.driver?.name ||
  item?.driver?.name ||
  "Não definido";

const extrairNumeroVoo = (item) =>
  item?.schedule?.name ||
  item?.reserve?.flight_code ||
  item?.reserve?.flight?.code ||
  item?.reserve?.arrival_flight_code ||
  item?.flight_code ||
  item?.flight?.code ||
  item?.flightNumber ||
  "";

const extrairHorarioPrevistoVoo = (item) =>
  item?.reserve?.flight_time ||
  item?.reserve?.flight?.scheduled_time ||
  item?.reserve?.arrival_flight_time ||
  item?.flight_time ||
  item?.flight?.scheduled_time ||
  extrairHorarioServico(item) ||
  "";

const extrairHorarioAtualizadoVoo = (item) =>
  item?.reserve?.flight_updated_time ||
  item?.reserve?.flight?.updated_time ||
  item?.reserve?.arrival_flight_updated_time ||
  item?.reserve?.flight?.estimated_time ||
  item?.reserve?.flight?.estimated_arrival ||
  item?.flight_updated_time ||
  item?.flight?.updated_time ||
  item?.flight?.estimated_time ||
  item?.flight?.estimated_arrival ||
  "";

const extrairHorarioRealVoo = (item) =>
  item?.reserve?.flight_real_time ||
  item?.reserve?.flight?.actual_time ||
  item?.reserve?.flight?.actual_arrival ||
  item?.reserve?.arrival_flight_real_time ||
  item?.flight_real_time ||
  item?.flight?.actual_time ||
  item?.flight?.actual_arrival ||
  "";

const extrairHorarioDecolagemVoo = (item) =>
  item?.reserve?.departure_flight_time ||
  item?.reserve?.flight?.departure_time ||
  item?.reserve?.flight?.scheduled_departure ||
  item?.flight?.departure_time ||
  item?.flight?.scheduled_departure ||
  "";

const extrairFlagCancelado = (item) => {
  const bruto =
    item?.reserve?.flight_status ||
    item?.reserve?.flight?.status ||
    item?.flight_status ||
    item?.flight?.status ||
    item?.reserve?.flight?.situation ||
    item?.flight?.situation ||
    "";

  return normalizarTexto(bruto).includes("cancel");
};

const extrairFlagPousado = (item) => {
  const bruto =
    item?.reserve?.flight_status ||
    item?.reserve?.flight?.status ||
    item?.flight_status ||
    item?.flight?.status ||
    item?.reserve?.flight?.situation ||
    item?.flight?.situation ||
    "";

  const status = normalizarTexto(bruto);

  return (
    status.includes("land") ||
    status.includes("arriv") ||
    status.includes("pous")
  );
};

const extrairModalidadeServico = (item) => {
  const texto = String(item?.serviceModeAsText || "").trim();

  if (!texto) return "-";

  const normalizado = normalizarTexto(texto);

  if (normalizado.includes("execut")) return "EXECUTIVO";
  if (normalizado.includes("priv")) return "PRIVATIVO";
  if (normalizado.includes("regular")) return "REGULAR";

  return texto.toUpperCase();
};

const extrairHoraMinutos = (valor) => {
  if (!valor) return null;

  const str = String(valor);

  if (str.includes("T")) {
    const hora = str.slice(11, 16);
    const [h, m] = hora.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
  }

  const match = str.match(/(\d{2}):(\d{2})/);
  if (!match) return null;

  const h = Number(match[1]);
  const m = Number(match[2]);

  if (Number.isNaN(h) || Number.isNaN(m)) return null;

  return h * 60 + m;
};

const calcularStatusVooPorHorario = ({
  horarioDecolagem,
  horarioPrevistoChegada,
  horarioAtualizadoChegada,
  horarioRealChegada,
  cancelado = false,
  pousado = false,
}) => {
  if (cancelado) {
    return {
      status: "Cancelado",
      diferencaMinutos: null,
    };
  }

  const previsto = extrairHoraMinutos(horarioPrevistoChegada);
  const atualizado =
    extrairHoraMinutos(horarioRealChegada) ??
    extrairHoraMinutos(horarioAtualizadoChegada);

  if (pousado && atualizado !== null && previsto !== null) {
    const diff = atualizado - previsto;

    if (diff > 0) {
      return {
        status: "Pousado com atraso",
        diferencaMinutos: diff,
      };
    }

    if (diff < 0) {
      return {
        status: "Pousado antecipado",
        diferencaMinutos: diff,
      };
    }

    return {
      status: "Pousado no horário",
      diferencaMinutos: 0,
    };
  }

  if (previsto !== null && atualizado !== null) {
    const diff = atualizado - previsto;

    if (diff > 0) {
      return {
        status: "Atrasado",
        diferencaMinutos: diff,
      };
    }

    if (diff < 0) {
      return {
        status: "Antecipado",
        diferencaMinutos: diff,
      };
    }

    return {
      status: "No horário",
      diferencaMinutos: 0,
    };
  }

  if (horarioDecolagem || horarioPrevistoChegada) {
    return {
      status: "Programado",
      diferencaMinutos: null,
    };
  }

  return {
    status: "Sem informação",
    diferencaMinutos: null,
  };
};

const classificarStatusVoo = (status = "") => {
  const s = normalizarTexto(status);

  if (s.includes("cancel")) return "cancelado";
  if (s.includes("atras")) return "atrasado";
  if (s.includes("delay")) return "atrasado";
  if (s.includes("antecip")) return "antecipado";
  if (s.includes("pousado com atraso")) return "pousado-atrasado";
  if (s.includes("pousado antecipado")) return "pousado-antecipado";
  if (s.includes("pousado no horario")) return "pousado";
  if (s.includes("pousado")) return "pousado";
  if (s.includes("land")) return "pousado";
  if (s.includes("arriv")) return "pousado";
  if (s.includes("no horario")) return "no-horario";
  if (s.includes("program")) return "programado";
  if (s.includes("sem informacao")) return "sem-info";

  return "programado";
};

const labelStatusVoo = (status = "") => {
  const key = classificarStatusVoo(status);

  if (key === "cancelado") return "Cancelado";
  if (key === "atrasado") return "Atrasado";
  if (key === "antecipado") return "Antecipado";
  if (key === "pousado-atrasado") return "Pousado com atraso";
  if (key === "pousado-antecipado") return "Pousado antecipado";
  if (key === "pousado") return "Pousado";
  if (key === "no-horario") return "No horário";
  if (key === "sem-info") return "Sem informação";
  return "Programado";
};

const formatarVariacaoVoo = (diferencaMinutos) => {
  if (diferencaMinutos === null || diferencaMinutos === undefined) return "";

  if (diferencaMinutos > 0) {
    return `${diferencaMinutos} min de atraso`;
  }

  if (diferencaMinutos < 0) {
    return `${Math.abs(diferencaMinutos)} min adiantado`;
  }

  return "No horário";
};

const ordenarHora = (a, b) => String(a || "").localeCompare(String(b || ""));
const normalizarCodigoVoo = (valor = "") =>
  String(valor).toUpperCase().replace(/\s+/g, "").replace("-", "");

const PainelChegadas = () => {
  const [dataSelecionada, setDataSelecionada] = useState(getHojeIso());
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState(null);
  const [itensBrutos, setItensBrutos] = useState([]);
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [voosExpandidos, setVoosExpandidos] = useState({});

  const carregarChegadas = async () => {
    try {
      setLoading(true);
      setErro("");

      const response = await fetch(montarUrlApi(dataSelecionada), {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`Erro HTTP ${response.status}`);
      }

      const json = await response.json();
      const lista = extrairListaResposta(json);

      setItensBrutos(lista);
      setUltimaAtualizacao(new Date());
    } catch (err) {
      console.error("Erro ao carregar chegadas:", err);
      setErro("Não foi possível carregar os serviços de chegada.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarChegadas();
  }, [dataSelecionada]);

  const voosBase = useMemo(() => {
    const mapa = {};

    itensBrutos.forEach((item, index) => {
      const vooBruto = extrairNumeroVoo(item);
      if (!String(vooBruto || "").trim()) return;

      const vooExibicao = String(vooBruto).trim().toUpperCase();
      const vooNormalizado = normalizarCodigoVoo(vooExibicao);

      if (!mapa[vooNormalizado]) {
        mapa[vooNormalizado] = {
          voo: vooExibicao,
          vooKey: vooNormalizado,
          horarioPrevisto:
            extrairHorarioPrevistoVoo(item) || extrairHorarioServico(item),
          horarioAtualizado: extrairHorarioAtualizadoVoo(item),
          horarioReal: extrairHorarioRealVoo(item),
          horarioDecolagem: extrairHorarioDecolagemVoo(item),
          cancelado: extrairFlagCancelado(item),
          pousado: extrairFlagPousado(item),
          reservas: [],
        };
      }

      mapa[vooNormalizado].reservas.push({
        id: `${extrairCodigoReserva(item)}_${index}`,
        codigoReserva: extrairCodigoReserva(item),
        cliente: extrairNomeCliente(item),
        contatoPax: formatarContato(extrairContatoPax(item)),
        destino: extrairDestino(item),
        operadora: extrairOperadora(item),
        modalidadeServico: extrairModalidadeServico(item),
        adicionais: extrairAdicionais(item),
        pax: extrairPax(item),
        resumoPax: extrairResumoPax(item),
        criancas: extrairCriancas(item),
        infantes: extrairInfantes(item),
        possuiCrianca: extrairCriancas(item) > 0,
        possuiInfante: extrairInfantes(item) > 0,
        escalaId: extrairEscalaId(item),
        motorista: extrairMotorista(item),
      });

      if (!mapa[vooNormalizado].horarioPrevisto) {
        mapa[vooNormalizado].horarioPrevisto =
          extrairHorarioPrevistoVoo(item) || extrairHorarioServico(item);
      }

      if (!mapa[vooNormalizado].horarioAtualizado) {
        mapa[vooNormalizado].horarioAtualizado =
          extrairHorarioAtualizadoVoo(item);
      }

      if (!mapa[vooNormalizado].horarioReal) {
        mapa[vooNormalizado].horarioReal = extrairHorarioRealVoo(item);
      }

      if (!mapa[vooNormalizado].horarioDecolagem) {
        mapa[vooNormalizado].horarioDecolagem =
          extrairHorarioDecolagemVoo(item);
      }

      if (!mapa[vooNormalizado].cancelado) {
        mapa[vooNormalizado].cancelado = extrairFlagCancelado(item);
      }

      if (!mapa[vooNormalizado].pousado) {
        mapa[vooNormalizado].pousado = extrairFlagPousado(item);
      }
    });

    return Object.values(mapa).sort((a, b) =>
      ordenarHora(a.horarioPrevisto, b.horarioPrevisto),
    );
  }, [itensBrutos]);

  const voos = useMemo(() => {
    return voosBase
      .map((voo) => {
        const calculoStatus = calcularStatusVooPorHorario({
          horarioDecolagem: voo.horarioDecolagem,
          horarioPrevistoChegada: voo.horarioPrevisto,
          horarioAtualizadoChegada: voo.horarioAtualizado,
          horarioRealChegada: voo.horarioReal,
          cancelado: voo.cancelado,
          pousado: voo.pousado,
        });

        const reservasPorMotorista = Object.values(
          voo.reservas.reduce((acc, reserva) => {
            const chaveMotorista = reserva.motorista || "Não definido";

            if (!acc[chaveMotorista]) {
              acc[chaveMotorista] = {
                motorista: chaveMotorista,
                reservas: [],
                totalPax: 0,
                totalReservas: 0,
                totalCriancas: 0,
                totalInfantes: 0,
              };
            }

            acc[chaveMotorista].reservas.push(reserva);
            acc[chaveMotorista].totalPax += Number(reserva.pax || 0);
            acc[chaveMotorista].totalReservas += 1;
            acc[chaveMotorista].totalCriancas += Number(reserva.criancas || 0);
            acc[chaveMotorista].totalInfantes += Number(reserva.infantes || 0);

            return acc;
          }, {}),
        ).sort((a, b) =>
          String(a.motorista).localeCompare(String(b.motorista), "pt-BR", {
            sensitivity: "base",
          }),
        );

        return {
          ...voo,
          totalPax: voo.reservas.reduce(
            (acc, r) => acc + Number(r.pax || 0),
            0,
          ),
          totalReservas: voo.reservas.length,
          totalCriancas: voo.reservas.reduce(
            (acc, r) => acc + Number(r.criancas || 0),
            0,
          ),
          totalInfantes: voo.reservas.reduce(
            (acc, r) => acc + Number(r.infantes || 0),
            0,
          ),
          statusBruto: calculoStatus.status,
          statusKey: classificarStatusVoo(calculoStatus.status),
          statusLabel: labelStatusVoo(calculoStatus.status),
          diferencaMinutos: calculoStatus.diferencaMinutos,
          variacaoTexto: formatarVariacaoVoo(calculoStatus.diferencaMinutos),
          reservasPorMotorista,
        };
      })
      .sort((a, b) => ordenarHora(a.horarioPrevisto, b.horarioPrevisto));
  }, [voosBase]);

  const voosAlterados = useMemo(() => {
    return voos.filter((v) =>
      [
        "atrasado",
        "cancelado",
        "antecipado",
        "pousado-atrasado",
        "pousado-antecipado",
      ].includes(v.statusKey),
    );
  }, [voos]);

  const voosFiltrados = useMemo(() => {
    if (filtroStatus === "todos") return voos;
    return voos.filter((v) => v.statusKey === filtroStatus);
  }, [voos, filtroStatus]);

  const resumo = useMemo(() => {
    return {
      voos: voos.length,
      reservas: voos.reduce((acc, v) => acc + v.totalReservas, 0),
      pax: voos.reduce((acc, v) => acc + v.totalPax, 0),
      criancas: voos.reduce((acc, v) => acc + v.totalCriancas, 0),
      infantes: voos.reduce((acc, v) => acc + v.totalInfantes, 0),
      alterados: voos.filter((v) =>
        [
          "atrasado",
          "antecipado",
          "cancelado",
          "pousado-atrasado",
          "pousado-antecipado",
        ].includes(v.statusKey),
      ).length,
    };
  }, [voos]);

  const toggleExpandirVoo = (codigoVoo) => {
    setVoosExpandidos((prev) => ({
      ...prev,
      [codigoVoo]: !prev[codigoVoo],
    }));
  };

  return (
    <div className="painel-chegadas-page">
      <div className="painel-chegadas-header">
        <div>
          <h2 className="painel-chegadas-title">
            <FlightLandRounded fontSize="small" />
            Painel de Chegadas
          </h2>
          <p className="painel-chegadas-subtitle">
            Monitoramento de voos, pax previstos, reservas vinculadas,
            operadora, modalidade do serviço, adicionais e motorista responsável
            por escala.
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
            <p>Selecione a data operacional e atualize a leitura dos voos.</p>
          </div>

          <div className="painel-chegadas-toolbar">
            <div className="painel-chegadas-field">
              <label>
                <CalendarMonthRounded fontSize="small" />
                Data operacional
              </label>
              <input
                className="painel-chegadas-input"
                type="date"
                value={dataSelecionada}
                onChange={(e) => setDataSelecionada(e.target.value)}
              />
            </div>

            <div className="painel-chegadas-field">
              <label>
                <FilterAltRounded fontSize="small" />
                Filtrar status do voo
              </label>
              <select
                className="painel-chegadas-input"
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value)}
              >
                <option value="todos">Todos</option>
                <option value="programado">Programado</option>
                <option value="no-horario">No horário</option>
                <option value="atrasado">Atrasado</option>
                <option value="antecipado">Antecipado</option>
                <option value="cancelado">Cancelado</option>
                <option value="pousado">Pousado</option>
                <option value="pousado-atrasado">Pousado com atraso</option>
                <option value="pousado-antecipado">Pousado antecipado</option>
                <option value="sem-info">Sem informação</option>
              </select>
            </div>

            <div className="painel-chegadas-actions">
              <button
                type="button"
                className="painel-chegadas-btn-primary"
                onClick={carregarChegadas}
                disabled={loading}
              >
                <RefreshRounded
                  fontSize="small"
                  className={loading ? "spin" : ""}
                />
                {loading ? "Atualizando..." : "Atualizar"}
              </button>
            </div>
          </div>
        </div>

        <div className="painel-chegadas-card">
          <div className="painel-chegadas-card-header">
            <div className="painel-chegadas-card-title-row">
              <h3>Última atualização</h3>
            </div>
            <p>Horário da última leitura da API.</p>
          </div>

          <div className="painel-chegadas-stat">
            <div className="painel-chegadas-stat-icon">
              <AccessTimeRounded fontSize="small" />
            </div>
            <div>
              <span>Atualizado em</span>
              <strong>
                {loading ? (
                  <SyncRounded className="spin" fontSize="small" />
                ) : ultimaAtualizacao ? (
                  ultimaAtualizacao.toLocaleString("pt-BR")
                ) : (
                  "--"
                )}
              </strong>
            </div>
          </div>
        </div>

        {!loading && voosAlterados.length > 0 && (
          <div className="painel-chegadas-card painel-chegadas-card-full">
            <div className="painel-chegadas-card-header">
              <div className="painel-chegadas-card-title-row">
                <h3>Voos com atenção imediata</h3>
                <span className="painel-chegadas-badge alerta">
                  {voosAlterados.length} alerta(s)
                </span>
              </div>
              <p>
                Destaque visual para voos atrasados, antecipados ou cancelados
                no topo do painel.
              </p>
            </div>

            <div className="painel-chegadas-alerts">
              {voosAlterados.map((voo) => (
                <div
                  key={`alerta-${voo.voo}`}
                  className={`painel-chegadas-alert ${voo.statusKey}`}
                >
                  <div className="painel-chegadas-alert-main">
                    <strong>{voo.voo}</strong>
                    <span>{voo.statusLabel}</span>
                  </div>

                  <div className="painel-chegadas-alert-meta">
                    <span>Previsto: {voo.horarioPrevisto || "--:--"}</span>
                    <span>
                      Atualizado:{" "}
                      {voo.horarioAtualizado || voo.horarioReal || "--:--"}
                    </span>
                    {voo.variacaoTexto ? (
                      <span>{voo.variacaoTexto}</span>
                    ) : null}
                    <span>{voo.totalPax} pax</span>
                    <span>{voo.totalReservas} reserva(s)</span>
                    <span>CHD: {voo.totalCriancas}</span>
                    <span>INF: {voo.totalInfantes}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="painel-chegadas-card painel-chegadas-card-full">
          <div className="painel-chegadas-card-header">
            <div className="painel-chegadas-card-title-row">
              <h3>Resumo do dia</h3>
              <span className="painel-chegadas-badge">chegadas</span>
            </div>
            <p>Leitura consolidada dos voos previstos na operação.</p>
          </div>

          <div className="painel-chegadas-kpis">
            <div className="painel-chegadas-kpi">
              <div className="painel-chegadas-kpi-icon">
                <AirplanemodeActiveRounded fontSize="small" />
              </div>
              <div>
                <span>Voos</span>
                <strong>
                  {loading ? (
                    <SyncRounded className="spin" fontSize="small" />
                  ) : (
                    resumo.voos
                  )}
                </strong>
              </div>
            </div>

            <div className="painel-chegadas-kpi">
              <div className="painel-chegadas-kpi-icon">
                <Inventory2Rounded fontSize="small" />
              </div>
              <div>
                <span>Reservas</span>
                <strong>
                  {loading ? (
                    <SyncRounded className="spin" fontSize="small" />
                  ) : (
                    resumo.reservas
                  )}
                </strong>
              </div>
            </div>

            <div className="painel-chegadas-kpi">
              <div className="painel-chegadas-kpi-icon">
                <GroupsRounded fontSize="small" />
              </div>
              <div>
                <span>Pax</span>
                <strong>
                  {loading ? (
                    <SyncRounded className="spin" fontSize="small" />
                  ) : (
                    resumo.pax
                  )}
                </strong>
              </div>
            </div>

            <div className="painel-chegadas-kpi">
              <div className="painel-chegadas-kpi-icon">
                <GroupsRounded fontSize="small" />
              </div>
              <div>
                <span>Crianças</span>
                <strong>
                  {loading ? (
                    <SyncRounded className="spin" fontSize="small" />
                  ) : (
                    resumo.criancas
                  )}
                </strong>
              </div>
            </div>

            <div className="painel-chegadas-kpi">
              <div className="painel-chegadas-kpi-icon">
                <GroupsRounded fontSize="small" />
              </div>
              <div>
                <span>Infantes</span>
                <strong>
                  {loading ? (
                    <SyncRounded className="spin" fontSize="small" />
                  ) : (
                    resumo.infantes
                  )}
                </strong>
              </div>
            </div>

            <div className="painel-chegadas-kpi">
              <div className="painel-chegadas-kpi-icon alerta">
                <WarningAmberRounded fontSize="small" />
              </div>
              <div>
                <span>Voos alterados</span>
                <strong>
                  {loading ? (
                    <SyncRounded className="spin" fontSize="small" />
                  ) : (
                    resumo.alterados
                  )}
                </strong>
              </div>
            </div>
          </div>
        </div>

        <div className="painel-chegadas-card painel-chegadas-card-full">
          <div className="painel-chegadas-card-header">
            <div className="painel-chegadas-card-title-row">
              <h3>Todos os Voos</h3>
              <span className="painel-chegadas-badge">
                {loading ? "Carregando..." : `${voosFiltrados.length} voo(s)`}
              </span>
            </div>
            <p>
              Cada bloco exibe o voo, status calculado, horários, total de pax,
              reservas, operadora, modalidade do serviço, adicionais e grupos
              por motorista.
            </p>
          </div>

          {erro ? (
            <div className="painel-chegadas-empty">{erro}</div>
          ) : loading ? (
            <div className="painel-chegadas-empty">
              <SyncRounded className="spin" fontSize="small" />
              <span style={{ marginLeft: 8 }}>Atualizando chegadas...</span>
            </div>
          ) : voosFiltrados.length === 0 ? (
            <div className="painel-chegadas-empty">
              Nenhum voo encontrado para esta data/filtro.
            </div>
          ) : (
            <div className="painel-chegadas-list">
              {voosFiltrados.map((voo) => {
                const expandido = !!voosExpandidos[voo.voo];

                return (
                  <div key={voo.voo} className="painel-chegadas-flight-card">
                    <button
                      type="button"
                      className="painel-chegadas-flight-top"
                      onClick={() => toggleExpandirVoo(voo.voo)}
                    >
                      <div className="painel-chegadas-flight-main">
                        <div className="painel-chegadas-flight-code-wrap">
                          <div className="painel-chegadas-flight-code">
                            {voo.voo}
                          </div>

                          <button
                            type="button"
                            className="painel-chegadas-google-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              abrirBuscaGoogleVoo(voo.voo);
                            }}
                            title={`Buscar ${voo.voo} no Google`}
                          >
                            <SearchRounded fontSize="small" />
                            <span>Buscar no Google</span>
                          </button>
                        </div>

                        <span
                          className={`painel-chegadas-status ${voo.statusKey}`}
                        >
                          {voo.statusLabel}
                        </span>
                      </div>

                      <div className="painel-chegadas-flight-meta">
                        {voo.horarioDecolagem ? (
                          <span>Decolagem: {voo.horarioDecolagem}</span>
                        ) : null}
                        <span>Previsto: {voo.horarioPrevisto || "--:--"}</span>
                        <span>
                          Atualizado:{" "}
                          {voo.horarioAtualizado || voo.horarioReal || "--:--"}
                        </span>
                        {voo.variacaoTexto ? (
                          <span>{voo.variacaoTexto}</span>
                        ) : null}
                        <span>{voo.totalPax} pax</span>
                        <span>{voo.totalReservas} reserva(s)</span>
                        <span>CHD: {voo.totalCriancas}</span>
                        <span>INF: {voo.totalInfantes}</span>
                      </div>

                      <div className="painel-chegadas-expand-icon">
                        {expandido ? (
                          <KeyboardArrowUpRounded />
                        ) : (
                          <KeyboardArrowDownRounded />
                        )}
                      </div>
                    </button>

                    {expandido && (
                      <div className="painel-chegadas-flight-expanded">
                        {voo.reservasPorMotorista.map((grupoMotorista) => (
                          <div
                            key={`${voo.voo}-${grupoMotorista.motorista}`}
                            className="painel-chegadas-driver-block"
                          >
                            <div className="painel-chegadas-driver-header">
                              <div className="painel-chegadas-driver-title">
                                <ConnectingAirportsRounded fontSize="small" />
                                <strong>{grupoMotorista.motorista}</strong>
                              </div>

                              <div className="painel-chegadas-driver-meta">
                                <span>
                                  {grupoMotorista.totalReservas} reserva(s)
                                </span>
                                <span>{grupoMotorista.totalPax} pax</span>
                                <span>CHD: {grupoMotorista.totalCriancas}</span>
                                <span>INF: {grupoMotorista.totalInfantes}</span>
                              </div>
                            </div>

                            <div className="painel-chegadas-table-wrap">
                              <table className="painel-chegadas-table">
                                <thead>
                                  <tr>
                                    <th>Reserva</th>
                                    <th>Cliente</th>
                                    <th>Contato Pax</th>
                                    <th>Operadora</th>
                                    <th>Modalidade</th>
                                    <th>Destino</th>
                                    <th>Pax</th>
                                    <th>Escala</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {grupoMotorista.reservas.map((reserva) => (
                                    <tr key={reserva.id}>
                                      <td>{reserva.codigoReserva}</td>
                                      <td>{reserva.cliente}</td>
                                      <td>{reserva.contatoPax}</td>
                                      <td>{reserva.operadora}</td>
                                      <td>{reserva.modalidadeServico}</td>
                                      <td>{reserva.destino}</td>
                                      <td>{reserva.resumoPax}</td>
                                      <td>{reserva.escalaId || "-"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PainelChegadas;
