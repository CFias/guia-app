import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AssessmentRounded,
  CalendarMonthRounded,
  RefreshRounded,
  SyncRounded,
  ManageAccountsRounded,
  TravelExploreRounded,
  FlightTakeoffRounded,
  FlightLandRounded,
  SwapHorizRounded,
  GroupsRounded,
  FilterAltRounded,
  TimelineRounded,
  InsightsRounded,
  SearchRounded,
  KeyboardArrowDownRounded,
  KeyboardArrowUpRounded,
  CompareArrowsRounded,
  RouteRounded,
} from "@mui/icons-material";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ComposedChart,
} from "recharts";
import "./styles.css";

const API_BASE =
  "https://driversalvador.phoenix.comeialabs.com/scale/reserve-service";

const EXPAND =
  "service,schedule,reserve,establishmentOrigin,establishmentDestination,establishmentOrigin.region,establishmentDestination.region,reserve.partner,reserve.customer,additionalReserveServices,additionalReserveServices.additional,additionalReserveServices.provider,roadmapService,roadmapService.roadmap,auxRoadmapService.roadmap.serviceOrder,auxRoadmapService.roadmap.serviceOrder.vehicle,auxRoadmapService.roadmap.driver,auxRoadmapService.roadmap.guide,roadmapService.roadmap.driver,roadmapService.roadmap.guide,roadmapService.roadmap.serviceOrder,roadmapService.roadmap.serviceOrder.vehicle,reserve.pdvPayment.user";

const ABAS = {
  GUIAS: "guias",
  PASSEIOS: "passeios",
  TRANSFERS: "transfers",
};

const TRANSFER_TIPOS = {
  IN: "IN",
  OUT: "OUT",
  TRANSFER: "TRANSFER",
};

const REGIOES = {
  TODAS: "TODAS",
  SALVADOR: "SALVADOR",
  LITORAL: "LITORAL",
};

const CHART_COLORS = [
  "#2563eb",
  "#0ea5e9",
  "#14b8a6",
  "#22c55e",
  "#f59e0b",
  "#f97316",
  "#ef4444",
  "#8b5cf6",
  "#a855f7",
  "#06b6d4",
];

const tooltipStyle = {
  background: "var(--card, #111827)",
  border: "1px solid rgba(148,163,184,.22)",
  borderRadius: 12,
  boxShadow: "0 10px 30px rgba(0,0,0,.18)",
  fontSize: 12,
};

const SERVICOS_IGNORADOS = [
  "01 PASSEIO A ESCOLHER NO DESTINO",
  "VOLTA FRADES COM ITAPARICA",
  "STAFF MSC - PORTO SALVADOR",
  "COORDENAÇÃO MSC - PORTO SALVADOR",
  "PASSEIO PRAIA DO FORTE 4H (LTN-VOLTA)",
  "COMBO FLEX 03 PASSEIOS",
  "PRAIA DO FORTE E GUARAJUBA",
  "PRAIAS DO LITORAL",
  "CITY TOUR SAINDO DO LITORAL",
  "CITY TOUR HISTÓRICO + PANORÂMICO",
  "PASSEIO À PRAIA DO FORTE (SHUTTLE)",
  "TRANSFER - MORRO DE SÃO PAULO / SALVADOR (SEMI TERRESTRE)",
  "TRANSFER - SALVADOR / MORRO DE SÃO PAULO (SEMI TERRESTRE)",
  "TRANSFER - SALVADOR / MORRO DE SÃO PAULO (CATAMARÃ)",
  "TRANSFER - MORRO DE SÃO PAULO / SALVADOR (CATAMARÃ)",
  "HOTEL SALVADOR / HOTEL LITORAL NORTE",
  "HOTEL SALVADOR X HOTEL LENÇOIS",
  "HOTEL SALVADOR/ TERMINAL NAUTICO",
  "TERMINAL NAUTICO / HOTEL SALVADOR",
  "HOTEL LITORAL NORTE / HOTEL SALVADOR",
  "HOTEL SALVADOR / HOTEL SALVADOR",
];

const MAPA_NOMES_CANONICOS = {
  "city tour historico e panoramico": "CITY TOUR HISTORICO E PANORAMICO",
  "city tour historico panoramico": "CITY TOUR HISTORICO E PANORAMICO",
  "tour de ilhas frades e itaparica": "TOUR DE ILHAS - FRADES E ITAPARICA",
  "ilhas frades + itaparica": "TOUR DE ILHAS - FRADES E ITAPARICA",
  "ilhas frades itaparica": "TOUR DE ILHAS - FRADES E ITAPARICA",
  "volta frades com itaparica": "VOLTA FRADES COM ITAPARICA",
  "city tour panoramico": "CITY TOUR PANORAMICO",
  "city tour historico": "CITY TOUR HISTORICO",
};

const rangeOptions = [
  { label: "Últimos 7 dias", dias: 7 },
  { label: "Últimos 15 dias", dias: 15 },
  { label: "Últimos 30 dias", dias: 30 },
  { label: "Últimos 60 dias", dias: 60 },
];

const normalizarTexto = (texto = "") =>
  String(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[|]/g, " ")
    .replace(/[-–—]/g, " ")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const obterNomeCanonico = (nome = "") => {
  const normalizado = normalizarTexto(nome);
  return (
    MAPA_NOMES_CANONICOS[normalizado] ||
    String(nome || "")
      .trim()
      .toUpperCase()
  );
};

const deveIgnorarServico = (nome = "") => {
  const canonico = obterNomeCanonico(nome);
  const alvo = normalizarTexto(canonico);
  return SERVICOS_IGNORADOS.some(
    (item) => normalizarTexto(obterNomeCanonico(item)) === alvo,
  );
};

const getHojeIso = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const getDiasAtrasIso = (dias = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - dias);
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

const formatarPeriodoTitulo = (inicio, fim) => {
  if (!inicio || !fim) return "";
  return `${formatarDataBr(inicio)} até ${formatarDataBr(fim)}`;
};

const listarDatasNoPeriodo = (inicio, fim) => {
  if (!inicio || !fim) return [];
  const [ai, mi, di] = inicio.split("-").map(Number);
  const [af, mf, df] = fim.split("-").map(Number);
  const cursor = new Date(ai, mi - 1, di);
  const limite = new Date(af, mf - 1, df);
  const datas = [];

  while (cursor <= limite) {
    const yyyy = cursor.getFullYear();
    const mm = String(cursor.getMonth() + 1).padStart(2, "0");
    const dd = String(cursor.getDate()).padStart(2, "0");
    datas.push(`${yyyy}-${mm}-${dd}`);
    cursor.setDate(cursor.getDate() + 1);
  }

  return datas;
};

const diferencaDias = (inicio, fim) => {
  if (!inicio || !fim) return 0;
  const a = new Date(`${inicio}T00:00:00`);
  const b = new Date(`${fim}T00:00:00`);
  return Math.round((b - a) / 86400000) + 1;
};

const getPeriodoComparativo = (inicio, fim) => {
  const dias = Math.max(diferencaDias(inicio, fim), 1);
  const fimAnterior = new Date(`${inicio}T00:00:00`);
  fimAnterior.setDate(fimAnterior.getDate() - 1);
  const inicioAnterior = new Date(fimAnterior);
  inicioAnterior.setDate(inicioAnterior.getDate() - (dias - 1));

  const toIso = (date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  return {
    inicio: toIso(inicioAnterior),
    fim: toIso(fimAnterior),
  };
};

const formatarNumero = (valor = 0) =>
  Number(valor || 0).toLocaleString("pt-BR");

const calcularDeltaPercentual = (atual, anterior) => {
  const a = Number(atual || 0);
  const b = Number(anterior || 0);
  if (b === 0 && a > 0) return 100;
  if (b === 0 && a === 0) return 0;
  return Math.round(((a - b) / b) * 100);
};

const formatarDelta = (valor = 0) => (valor > 0 ? `+${valor}` : `${valor}`);

const extrairListaResposta = (json) => {
  if (Array.isArray(json)) return json;

  const candidatos = [
    json?.data,
    json?.results,
    json?.rows,
    json?.items,
    json?.content,
    json?.data?.data,
    json?.data?.results,
    json?.payload,
    json?.payload?.data,
  ];

  for (const item of candidatos) {
    if (Array.isArray(item)) return item;
  }

  return [];
};

const montarUrlApi = (date) => {
  const params = new URLSearchParams();
  params.append("execution_date", date);
  params.append("expand", EXPAND);
  params.append("service_type[]", "1");
  params.append("service_type[]", "2");
  params.append("service_type[]", "3");
  params.append("service_type[]", "4");
  return `${API_BASE}?${params.toString()}`;
};

const extrairNomePasseio = (item) =>
  item?.service?.name ||
  item?.service?.nome ||
  item?.reserveService?.service?.name ||
  item?.name ||
  "";

const extrairIdServico = (item) => {
  const bruto =
    item?.service_id ||
    item?.service?.id ||
    item?.reserveService?.service?.id ||
    item?.reserveService?.service_id ||
    item?.reserve?.service_id ||
    null;

  return bruto !== null && bruto !== undefined && bruto !== ""
    ? String(bruto)
    : "SEM_ID_SERVICO";
};

const extrairDataServico = (item) => {
  const dataHora =
    item?.presentation_hour ||
    item?.presentation_hour_end ||
    item?.date ||
    item?._executionDate ||
    item?.execution_date ||
    "";

  return dataHora ? String(dataHora).slice(0, 10) : "";
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
  const match = valor.match(/\b(\d{2}:\d{2})/);
  return match?.[1] || "";
};

const extrairContagemPax = (item) => {
  const pegar = (...valores) => {
    for (const valor of valores) {
      if (valor === null || valor === undefined || valor === "") continue;
      const numero = Number(valor);
      if (Number.isFinite(numero)) return numero;
    }
    return 0;
  };

  const adultos = pegar(
    item?.is_adult_count,
    item?.adult_count,
    item?.adults,
    item?.reserve?.is_adult_count,
    item?.reserve?.adult_count,
    item?.reserve?.adults,
  );

  const criancas = pegar(
    item?.is_child_count,
    item?.child_count,
    item?.children,
    item?.reserve?.is_child_count,
    item?.reserve?.child_count,
    item?.reserve?.children,
  );

  const infants = pegar(
    item?.is_infant_count,
    item?.infant_count,
    item?.reserve?.is_infant_count,
    item?.reserve?.infant_count,
  );

  const totalDireto = pegar(
    item?.passengers,
    item?.passenger_count,
    item?.pax,
    item?.reserve?.passengers,
    item?.reserve?.passenger_count,
    item?.reserve?.pax,
  );

  const totalCalculado = Number(adultos) + Number(criancas) + Number(infants);

  return {
    adultos: Number(adultos || 0),
    criancas: Number(criancas || 0),
    infants: Number(infants || 0),
    total: Math.max(Number(totalDireto || 0), totalCalculado),
  };
};

const extrairOperadora = (item) => {
  const bruto =
    item?.reserve?.partner?.fantasy_name ||
    item?.reserve?.partner?.company_name ||
    item?.reserve?.partner?.name ||
    item?.partner?.name ||
    item?.reserve?.operator?.name ||
    item?.reserve?.agency?.name ||
    item?.reserve?.origin_operator_name ||
    item?.reserve?.seller_name ||
    item?.reserve?.customer?.fantasy_name ||
    item?.reserve?.customer?.name ||
    "";

  const texto = String(bruto || "").trim();
  if (!texto) return "SEM OPERADORA";

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

const extrairGuiaApi = (item) => {
  const nome =
    item?.roadmapService?.roadmap?.guide?.nickname ||
    item?.auxRoadmapService?.roadmap?.guide?.nickname ||
    item?.roadmapService?.roadmap?.guide?.name ||
    item?.auxRoadmapService?.roadmap?.guide?.name ||
    item?.guide?.nickname ||
    item?.guide?.name ||
    "";

  return String(nome || "")
    .replace(/\s*-\s*GUIA\s*$/i, "")
    .replace(/\s*GUIA\s*$/i, "")
    .trim();
};

const extrairVeiculo = (item) =>
  item?.roadmapService?.roadmap?.driver?.nickname ||
  item?.auxRoadmapService?.roadmap?.driver?.nickname ||
  item?.roadmapService?.roadmap?.serviceOrder?.vehicle?.name ||
  item?.auxRoadmapService?.roadmap?.serviceOrder?.vehicle?.name ||
  item?.vehicle?.name ||
  "Não informado";

const extrairRegiao = (item) => {
  const bruto =
    item?.establishmentOrigin?.region?.name ||
    item?.origin?.region?.name ||
    item?.reserve?.origin?.region?.name ||
    item?.establishmentDestination?.region?.name ||
    item?.destination?.region?.name ||
    item?.reserve?.destination?.region?.name ||
    "";

  const texto = String(bruto || "").trim();
  if (!texto) return "REGIÃO NÃO INFORMADA";

  const normalizado = normalizarTexto(texto);
  if (normalizado.includes("litoral")) return "LITORAL";
  if (normalizado.includes("salvador")) return "SALVADOR";
  return texto.toUpperCase();
};

const extrairOrigem = (item) =>
  item?.establishmentOrigin?.name ||
  item?.origin?.name ||
  item?.reserve?.origin?.name ||
  "Origem não informada";

const extrairDestino = (item) =>
  item?.establishmentDestination?.name ||
  item?.destination?.name ||
  item?.reserve?.destination?.name ||
  "Destino não informado";

const classificarTransfer = (item) => {
  const serviceType = Number(item?.service_type || item?.service?.type || 0);
  const origem = normalizarTexto(extrairOrigem(item));
  const destino = normalizarTexto(extrairDestino(item));
  const nome = normalizarTexto(extrairNomePasseio(item));

  if (serviceType === 1 || origem.includes("aero") || nome.includes("in "))
    return TRANSFER_TIPOS.IN;
  if (serviceType === 2 || destino.includes("aero") || nome.includes("out "))
    return TRANSFER_TIPOS.OUT;
  return TRANSFER_TIPOS.TRANSFER;
};

const ehPasseio = (item) => {
  const tipo = Number(item?.service_type || item?.service?.type || 0);
  return tipo === 3 || tipo === 4;
};

const renderCardLoading = (texto = "Carregando...") => (
  <div className="home-card-loading">
    <SyncRounded className="spin" fontSize="small" />
    <span>{texto}</span>
  </div>
);

/**
 * Consolida RESERVAS em SERVIÇOS reais.
 * A unificação é por:
 * - data
 * - passeio
 * - guia
 * - service_id
 *
 * Isso faz exatamente o que você pediu:
 * olhar todas as reservas do passeio na data
 * e unificar em um único serviço com guia + passeio + quantidade.
 */
const consolidarServicosPhoenix = (lista = []) => {
  const mapa = new Map();

  lista.forEach((item) => {
    const data = extrairDataServico(item);
    if (!data) return;

    const passeio = obterNomeCanonico(
      extrairNomePasseio(item) || classificarTransfer(item),
    );
    const guia = extrairGuiaApi(item) || "SEM_GUIA";
    const serviceId = extrairIdServico(item);
    const tipo = ehPasseio(item) ? "PASSEIO" : classificarTransfer(item);

    // chave do serviço consolidado
    const chave = [
      data,
      normalizarTexto(passeio),
      normalizarTexto(guia),
      serviceId,
      tipo,
    ].join("|");

    const paxInfo = extrairContagemPax(item);

    if (!mapa.has(chave)) {
      mapa.set(chave, {
        chave,
        data,
        horario: extrairHorarioServico(item),
        guia,
        tipo,
        serviceId,
        servico: passeio,
        operadora: extrairOperadora(item),
        veiculo: extrairVeiculo(item),
        regiao: extrairRegiao(item),
        origem: extrairOrigem(item),
        destino: extrairDestino(item),
        pax: 0,
        reservas: 0,
        adultos: 0,
        criancas: 0,
        infants: 0,
      });
    }

    const atual = mapa.get(chave);
    atual.pax += Number(paxInfo.total || 0);
    atual.adultos += Number(paxInfo.adultos || 0);
    atual.criancas += Number(paxInfo.criancas || 0);
    atual.infants += Number(paxInfo.infants || 0);
    atual.reservas += 1;

    const horarioExistente = atual.horario || "99:99";
    const horarioNovo = extrairHorarioServico(item) || "99:99";
    if (horarioNovo < horarioExistente) {
      atual.horario = extrairHorarioServico(item);
    }
  });

  return Array.from(mapa.values()).sort((a, b) =>
    `${a.data} ${a.horario || ""}`.localeCompare(
      `${b.data} ${b.horario || ""}`,
    ),
  );
};

const TooltipTimelineGuias = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const ponto = payload[0]?.payload;
  const detalhes = ponto?.detalhes || [];

  return (
    <div style={tooltipStyle}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 11, marginBottom: 8 }}>
        <strong>{ponto?.servicos || 0}</strong> serviço(s) com guia escalado
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          maxWidth: 380,
        }}
      >
        {detalhes.slice(0, 12).map((item, index) => (
          <div
            key={`${item.guia}_${item.servico}_${item.serviceId}_${index}`}
            style={{ fontSize: 11 }}
          >
            <strong>{item.guia}</strong> — {item.servico}
            {" · "}
            <strong>{item.pax}</strong> pax
            {item.horario ? ` (${item.horario})` : ""}
          </div>
        ))}
        {detalhes.length > 12 && (
          <div style={{ fontSize: 11, opacity: 0.75 }}>
            +{detalhes.length - 12} item(ns)
          </div>
        )}
      </div>
    </div>
  );
};

const RelatoriosOperacionaisApiOnly = () => {
  const [abaAtiva, setAbaAtiva] = useState(ABAS.GUIAS);
  const [periodoInicio, setPeriodoInicio] = useState(getDiasAtrasIso(6));
  const [periodoFim, setPeriodoFim] = useState(getHojeIso());
  const [filtrosAbertos, setFiltrosAbertos] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingAtualizar, setLoadingAtualizar] = useState(false);
  const [erro, setErro] = useState("");

  const [apiAtual, setApiAtual] = useState([]);
  const [apiComparativa, setApiComparativa] = useState([]);

  const [filtroBusca, setFiltroBusca] = useState("");
  const [filtroGuia, setFiltroGuia] = useState("TODOS");
  const [filtroPasseioGuia, setFiltroPasseioGuia] = useState("TODOS");
  const [filtroVeiculoGuia, setFiltroVeiculoGuia] = useState("TODOS");
  const [filtroPasseio, setFiltroPasseio] = useState("TODOS");
  const [filtroOperadoraPasseio, setFiltroOperadoraPasseio] = useState("TODAS");
  const [mostrarSomenteSemGrupo, setMostrarSomenteSemGrupo] = useState(false);
  const [filtroTransferTipo, setFiltroTransferTipo] = useState("TODOS");
  const [filtroTransferRegiao, setFiltroTransferRegiao] = useState(
    REGIOES.TODAS,
  );
  const [filtroOperadora, setFiltroOperadora] = useState("TODAS");

  const carregarApiPorDatas = useCallback(async (datas) => {
    const respostas = await Promise.all(
      datas.map(async (date) => {
        const response = await fetch(montarUrlApi(date));
        if (!response.ok) {
          throw new Error(`Falha ao buscar Phoenix na data ${date}.`);
        }
        const json = await response.json();
        const lista = extrairListaResposta(json);
        return lista.map((item) => ({ ...item, _executionDate: date }));
      }),
    );

    return respostas.flat();
  }, []);

  const carregarDados = useCallback(
    async ({ silent = false } = {}) => {
      try {
        setErro("");
        if (silent) setLoadingAtualizar(true);
        else setLoading(true);

        const periodoComparativo = getPeriodoComparativo(
          periodoInicio,
          periodoFim,
        );
        const datasAtuais = listarDatasNoPeriodo(periodoInicio, periodoFim);
        const datasComparativas = listarDatasNoPeriodo(
          periodoComparativo.inicio,
          periodoComparativo.fim,
        );

        const [listaAtual, listaComparativa] = await Promise.all([
          carregarApiPorDatas(datasAtuais),
          carregarApiPorDatas(datasComparativas),
        ]);

        setApiAtual(listaAtual);
        setApiComparativa(listaComparativa);
      } catch (error) {
        console.error("Erro ao carregar relatórios do Phoenix:", error);
        setErro(error?.message || "Erro ao carregar relatórios do Phoenix.");
      } finally {
        setLoading(false);
        setLoadingAtualizar(false);
      }
    },
    [carregarApiPorDatas, periodoFim, periodoInicio],
  );

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  const apiServicosPeriodo = useMemo(
    () => consolidarServicosPhoenix(apiAtual),
    [apiAtual],
  );

  const apiServicosComparativo = useMemo(
    () => consolidarServicosPhoenix(apiComparativa),
    [apiComparativa],
  );

  const resumoComparativo = useMemo(() => {
    const totalPaxAtual = apiServicosPeriodo.reduce(
      (acc, item) => acc + Number(item.pax || 0),
      0,
    );
    const totalPaxAnterior = apiServicosComparativo.reduce(
      (acc, item) => acc + Number(item.pax || 0),
      0,
    );

    return {
      paxAtual: totalPaxAtual,
      paxAnterior: totalPaxAnterior,
      deltaPax: totalPaxAtual - totalPaxAnterior,
      deltaPaxPercentual: calcularDeltaPercentual(
        totalPaxAtual,
        totalPaxAnterior,
      ),
      servicosAtual: apiServicosPeriodo.length,
      servicosAnterior: apiServicosComparativo.length,
      deltaServicos: apiServicosPeriodo.length - apiServicosComparativo.length,
      deltaServicosPercentual: calcularDeltaPercentual(
        apiServicosPeriodo.length,
        apiServicosComparativo.length,
      ),
    };
  }, [apiServicosComparativo, apiServicosPeriodo]);

  const timelineDemanda = useMemo(() => {
    const mapa = {};

    apiServicosPeriodo.forEach((item) => {
      if (!mapa[item.data]) {
        mapa[item.data] = {
          date: item.data,
          label: formatarDataBr(item.data),
          pax: 0,
          servicos: 0,
          passeios: 0,
          transfers: 0,
        };
      }

      mapa[item.data].pax += Number(item.pax || 0);
      mapa[item.data].servicos += 1;
      if (item.tipo === "PASSEIO") mapa[item.data].passeios += 1;
      else mapa[item.data].transfers += 1;
    });

    return listarDatasNoPeriodo(periodoInicio, periodoFim).map((data) => ({
      date: data,
      label: formatarDataBr(data),
      pax: mapa[data]?.pax || 0,
      servicos: mapa[data]?.servicos || 0,
      passeios: mapa[data]?.passeios || 0,
      transfers: mapa[data]?.transfers || 0,
    }));
  }, [apiServicosPeriodo, periodoFim, periodoInicio]);

  const timelineGuias = useMemo(() => {
    const mapa = {};

    apiServicosPeriodo.forEach((item) => {
      if (!item.guia || item.guia === "SEM_GUIA") return;

      if (!mapa[item.data]) {
        mapa[item.data] = {
          date: item.data,
          label: formatarDataBr(item.data),
          servicos: 0,
          detalhes: [],
        };
      }

      mapa[item.data].servicos += 1;
      mapa[item.data].detalhes.push({
        guia: item.guia,
        servico: item.servico,
        horario: item.horario,
        serviceId: item.serviceId,
        pax: item.pax,
      });
    });

    return listarDatasNoPeriodo(periodoInicio, periodoFim).map((data) => ({
      date: data,
      label: formatarDataBr(data),
      servicos: mapa[data]?.servicos || 0,
      detalhes: mapa[data]?.detalhes || [],
    }));
  }, [apiServicosPeriodo, periodoFim, periodoInicio]);

  const guiasReport = useMemo(() => {
    const mapa = new Map();

    apiServicosPeriodo.forEach((item) => {
      if (!item.guia || item.guia === "SEM_GUIA") return;

      if (!mapa.has(item.guia)) {
        mapa.set(item.guia, {
          id: item.guia,
          nome: item.guia,
          detalhes: [],
        });
      }

      mapa.get(item.guia).detalhes.push(item);
    });

    return Array.from(mapa.values())
      .map((guia) => ({
        ...guia,
        totalServicos: guia.detalhes.length,
        passeios: guia.detalhes.filter((d) => d.tipo === "PASSEIO").length,
        inCount: guia.detalhes.filter((d) => d.tipo === TRANSFER_TIPOS.IN)
          .length,
        outCount: guia.detalhes.filter((d) => d.tipo === TRANSFER_TIPOS.OUT)
          .length,
        transferCount: guia.detalhes.filter(
          (d) => d.tipo === TRANSFER_TIPOS.TRANSFER,
        ).length,
        diasAtivos: new Set(guia.detalhes.map((d) => d.data)).size,
        totalVeiculos: new Set(guia.detalhes.map((d) => d.veiculo)).size,
      }))
      .sort(
        (a, b) =>
          b.totalServicos - a.totalServicos ||
          a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }),
      );
  }, [apiServicosPeriodo]);

  const passeiosBase = useMemo(() => {
    const mapa = new Map();

    apiServicosPeriodo
      .filter((item) => item.tipo === "PASSEIO")
      .forEach((item) => {
        const nome = item.servico;
        if (!nome || deveIgnorarServico(nome)) return;

        if (!mapa.has(nome)) {
          mapa.set(nome, {
            nome,
            detalhes: [],
          });
        }

        mapa.get(nome).detalhes.push({
          date: item.data,
          horario: item.horario,
          pax: item.pax,
          operadora: item.operadora,
          guia: item.guia === "SEM_GUIA" ? "Sem guia" : item.guia,
          regiao: item.regiao,
          serviceId: item.serviceId,
          reservas: item.reservas,
        });
      });

    return Array.from(mapa.values())
      .map((item) => {
        const detalhes = item.detalhes.sort((a, b) =>
          `${a.date} ${a.horario}`.localeCompare(`${b.date} ${b.horario}`),
        );

        const timelineMap = {};
        detalhes.forEach((detalhe) => {
          if (!timelineMap[detalhe.date]) {
            timelineMap[detalhe.date] = {
              date: detalhe.date,
              label: formatarDataBr(detalhe.date),
              pax: 0,
              ocorrencias: 0,
              naoFormouGrupo: 0,
              formouGrupo: 0,
            };
          }

          timelineMap[detalhe.date].pax += Number(detalhe.pax || 0);
          timelineMap[detalhe.date].ocorrencias += 1;
          if (detalhe.pax >= 8) timelineMap[detalhe.date].formouGrupo += 1;
          else timelineMap[detalhe.date].naoFormouGrupo += 1;
        });

        const ocorrencias = detalhes.length;
        const formouGrupo = detalhes.filter((d) => d.pax >= 8).length;
        const naoFormouGrupo = detalhes.filter((d) => d.pax < 8).length;

        return {
          ...item,
          detalhes,
          ocorrencias,
          diasOperados: new Set(detalhes.map((d) => d.date)).size,
          pax: detalhes.reduce((acc, d) => acc + Number(d.pax || 0), 0),
          formouGrupo,
          naoFormouGrupo,
          taxaFormacao:
            ocorrencias > 0 ? Math.round((formouGrupo / ocorrencias) * 100) : 0,
          timeline: Object.values(timelineMap).sort((a, b) =>
            String(a.date).localeCompare(String(b.date)),
          ),
        };
      })
      .sort(
        (a, b) =>
          b.pax - a.pax ||
          a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }),
      );
  }, [apiServicosPeriodo]);

  const transfersBase = useMemo(() => {
    return apiServicosPeriodo
      .filter((item) => item.tipo !== "PASSEIO")
      .map((item, index) => ({
        id: `${item.data}_${index}_${item.tipo}`,
        date: item.data,
        horario: item.horario,
        tipo: item.tipo,
        regiao: item.regiao,
        origem: item.origem,
        destino: item.destino,
        operadora: item.operadora,
        pax: Number(item.pax || 0),
        guia: item.guia === "SEM_GUIA" ? "Sem guia" : item.guia,
        veiculo: item.veiculo,
        serviceName: item.servico,
        serviceId: item.serviceId,
      }))
      .sort((a, b) =>
        `${a.date} ${a.horario}`.localeCompare(`${b.date} ${b.horario}`),
      );
  }, [apiServicosPeriodo]);

  const opcoesGuia = useMemo(
    () => ["TODOS", ...guiasReport.map((item) => item.nome)],
    [guiasReport],
  );

  const opcoesPasseiosDeGuias = useMemo(() => {
    const unicos = Array.from(
      new Set(
        guiasReport.flatMap((item) => item.detalhes.map((d) => d.servico)),
      ),
    ).sort();
    return ["TODOS", ...unicos];
  }, [guiasReport]);

  const opcoesVeiculosGuias = useMemo(() => {
    const unicos = Array.from(
      new Set(
        guiasReport.flatMap((item) => item.detalhes.map((d) => d.veiculo)),
      ),
    ).sort();
    return ["TODOS", ...unicos];
  }, [guiasReport]);

  const opcoesPasseios = useMemo(
    () => ["TODOS", ...passeiosBase.map((item) => item.nome)],
    [passeiosBase],
  );

  const opcoesOperadorasPasseio = useMemo(() => {
    const unicas = Array.from(
      new Set(
        passeiosBase.flatMap((item) => item.detalhes.map((d) => d.operadora)),
      ),
    ).sort();
    return ["TODAS", ...unicas];
  }, [passeiosBase]);

  const opcoesOperadorasTransfer = useMemo(() => {
    const unicas = Array.from(
      new Set(transfersBase.map((item) => item.operadora)),
    ).sort();
    return ["TODAS", ...unicas];
  }, [transfersBase]);

  const guiasFiltrados = useMemo(() => {
    return guiasReport
      .map((guia) => {
        const detalhesFiltrados = guia.detalhes.filter((detalhe) => {
          const matchBusca =
            !filtroBusca ||
            normalizarTexto(guia.nome).includes(normalizarTexto(filtroBusca)) ||
            normalizarTexto(detalhe.servico).includes(
              normalizarTexto(filtroBusca),
            ) ||
            normalizarTexto(detalhe.veiculo).includes(
              normalizarTexto(filtroBusca),
            );

          const matchGuia = filtroGuia === "TODOS" || guia.nome === filtroGuia;
          const matchPasseio =
            filtroPasseioGuia === "TODOS" ||
            detalhe.servico === filtroPasseioGuia;
          const matchVeiculo =
            filtroVeiculoGuia === "TODOS" ||
            detalhe.veiculo === filtroVeiculoGuia;

          return matchBusca && matchGuia && matchPasseio && matchVeiculo;
        });

        return {
          ...guia,
          detalhes: detalhesFiltrados,
          totalServicos: detalhesFiltrados.length,
          passeios: detalhesFiltrados.filter((d) => d.tipo === "PASSEIO")
            .length,
          inCount: detalhesFiltrados.filter((d) => d.tipo === TRANSFER_TIPOS.IN)
            .length,
          outCount: detalhesFiltrados.filter(
            (d) => d.tipo === TRANSFER_TIPOS.OUT,
          ).length,
          transferCount: detalhesFiltrados.filter(
            (d) => d.tipo === TRANSFER_TIPOS.TRANSFER,
          ).length,
          diasAtivos: new Set(detalhesFiltrados.map((d) => d.data)).size,
          totalVeiculos: new Set(detalhesFiltrados.map((d) => d.veiculo)).size,
        };
      })
      .filter((item) => item.totalServicos > 0)
      .sort(
        (a, b) =>
          b.totalServicos - a.totalServicos ||
          a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }),
      );
  }, [
    filtroBusca,
    filtroGuia,
    filtroPasseioGuia,
    filtroVeiculoGuia,
    guiasReport,
  ]);

  const passeiosFiltrados = useMemo(() => {
    return passeiosBase
      .map((item) => {
        const detalhesFiltrados = item.detalhes.filter((detalhe) => {
          const matchBusca =
            !filtroBusca ||
            normalizarTexto(item.nome).includes(normalizarTexto(filtroBusca)) ||
            normalizarTexto(detalhe.operadora).includes(
              normalizarTexto(filtroBusca),
            ) ||
            normalizarTexto(detalhe.guia).includes(
              normalizarTexto(filtroBusca),
            );

          const matchPasseio =
            filtroPasseio === "TODOS" || item.nome === filtroPasseio;
          const matchOperadora =
            filtroOperadoraPasseio === "TODAS" ||
            detalhe.operadora === filtroOperadoraPasseio;

          return matchBusca && matchPasseio && matchOperadora;
        });

        const timelineMap = {};
        detalhesFiltrados.forEach((detalhe) => {
          if (!timelineMap[detalhe.date]) {
            timelineMap[detalhe.date] = {
              date: detalhe.date,
              label: formatarDataBr(detalhe.date),
              pax: 0,
              ocorrencias: 0,
              naoFormouGrupo: 0,
              formouGrupo: 0,
            };
          }

          timelineMap[detalhe.date].pax += Number(detalhe.pax || 0);
          timelineMap[detalhe.date].ocorrencias += 1;
          if (detalhe.pax >= 8) timelineMap[detalhe.date].formouGrupo += 1;
          else timelineMap[detalhe.date].naoFormouGrupo += 1;
        });

        const ocorrencias = detalhesFiltrados.length;
        const formouGrupo = detalhesFiltrados.filter((d) => d.pax >= 8).length;
        const naoFormouGrupo = detalhesFiltrados.filter(
          (d) => d.pax < 8,
        ).length;

        return {
          ...item,
          detalhes: detalhesFiltrados,
          ocorrencias,
          diasOperados: new Set(detalhesFiltrados.map((d) => d.date)).size,
          pax: detalhesFiltrados.reduce(
            (acc, d) => acc + Number(d.pax || 0),
            0,
          ),
          formouGrupo,
          naoFormouGrupo,
          taxaFormacao:
            ocorrencias > 0 ? Math.round((formouGrupo / ocorrencias) * 100) : 0,
          timeline: Object.values(timelineMap).sort((a, b) =>
            String(a.date).localeCompare(String(b.date)),
          ),
        };
      })
      .filter((item) => item.ocorrencias > 0)
      .filter((item) => !mostrarSomenteSemGrupo || item.naoFormouGrupo > 0)
      .sort(
        (a, b) =>
          b.pax - a.pax ||
          a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }),
      );
  }, [
    filtroBusca,
    filtroOperadoraPasseio,
    filtroPasseio,
    mostrarSomenteSemGrupo,
    passeiosBase,
  ]);

  const transfersFiltrados = useMemo(() => {
    return transfersBase.filter((item) => {
      const matchBusca =
        !filtroBusca ||
        normalizarTexto(item.serviceName).includes(
          normalizarTexto(filtroBusca),
        ) ||
        normalizarTexto(item.operadora).includes(
          normalizarTexto(filtroBusca),
        ) ||
        normalizarTexto(item.origem).includes(normalizarTexto(filtroBusca)) ||
        normalizarTexto(item.destino).includes(normalizarTexto(filtroBusca)) ||
        normalizarTexto(item.guia).includes(normalizarTexto(filtroBusca));

      const matchTipo =
        filtroTransferTipo === "TODOS" || item.tipo === filtroTransferTipo;
      const matchRegiao =
        filtroTransferRegiao === REGIOES.TODAS ||
        item.regiao === filtroTransferRegiao;
      const matchOperadora =
        filtroOperadora === "TODAS" || item.operadora === filtroOperadora;

      return matchBusca && matchTipo && matchRegiao && matchOperadora;
    });
  }, [
    filtroBusca,
    filtroOperadora,
    filtroTransferRegiao,
    filtroTransferTipo,
    transfersBase,
  ]);

  const graficoPasseios = useMemo(() => {
    return passeiosFiltrados.slice(0, 12).map((item) => ({
      nome: item.nome.length > 28 ? `${item.nome.slice(0, 28)}…` : item.nome,
      pax: item.pax,
      formouGrupo: item.formouGrupo,
      naoFormouGrupo: item.naoFormouGrupo,
    }));
  }, [passeiosFiltrados]);

  const graficoTransfersOperadora = useMemo(() => {
    const mapa = {};
    transfersFiltrados.forEach((item) => {
      if (!mapa[item.operadora]) {
        mapa[item.operadora] = {
          operadora: item.operadora,
          IN: 0,
          OUT: 0,
          TRANSFER: 0,
        };
      }
      mapa[item.operadora][item.tipo] += Number(item.pax || 0);
    });

    return Object.values(mapa)
      .sort((a, b) => b.IN + b.OUT + b.TRANSFER - (a.IN + a.OUT + a.TRANSFER))
      .slice(0, 12);
  }, [transfersFiltrados]);

  const graficoTransfersMix = useMemo(() => {
    const base = [
      { name: "IN", value: 0 },
      { name: "OUT", value: 0 },
      { name: "TRANSFER", value: 0 },
    ];

    transfersFiltrados.forEach((item) => {
      const alvo = base.find((b) => b.name === item.tipo);
      if (alvo) alvo.value += Number(item.pax || 0);
    });

    return base;
  }, [transfersFiltrados]);

  const cardsResumo = useMemo(() => {
    return [
      {
        titulo: "Pax no período",
        valor: formatarNumero(resumoComparativo.paxAtual),
        subtitulo: `${formatarDelta(resumoComparativo.deltaPax)} (${formatarDelta(
          resumoComparativo.deltaPaxPercentual,
        )}%) vs período anterior`,
        destaque:
          resumoComparativo.deltaPax > 0
            ? "positivo"
            : resumoComparativo.deltaPax < 0
              ? "negativo"
              : "neutro",
      },
      {
        titulo: "Serviços no período",
        valor: formatarNumero(resumoComparativo.servicosAtual),
        subtitulo: `${formatarDelta(resumoComparativo.deltaServicos)} (${formatarDelta(
          resumoComparativo.deltaServicosPercentual,
        )}%) vs período anterior`,
        destaque:
          resumoComparativo.deltaServicos > 0
            ? "positivo"
            : resumoComparativo.deltaServicos < 0
              ? "negativo"
              : "neutro",
      },
      {
        titulo: "Guias escalados",
        valor: formatarNumero(guiasReport.length),
        subtitulo: "Guias encontrados no Phoenix no período",
        destaque: guiasReport.length > 0 ? "positivo" : "neutro",
      },
      {
        titulo: "Passeios sem grupo",
        valor: formatarNumero(
          passeiosBase.reduce((acc, item) => acc + item.naoFormouGrupo, 0),
        ),
        subtitulo: "Ocorrências com menos de 8 pax no período",
        destaque: passeiosBase.some((item) => item.naoFormouGrupo > 0)
          ? "alerta"
          : "positivo",
      },
    ];
  }, [guiasReport.length, passeiosBase, resumoComparativo]);

  return (
    <div className="home-page relatorios-page">
      <div className="home-page-header relatorios-header">
        <div>
          <h2 className="home-page-title">
            Relatórios Operacionais <AssessmentRounded fontSize="small" />
          </h2>
          <p className="home-page-subtitle">
            Visão 100% Phoenix com filtros por período, guias, passeios e
            transfers.
          </p>
        </div>

        <div className="home-page-actions">
          <button
            type="button"
            className="home-refresh-btn"
            onClick={() => carregarDados({ silent: true })}
            disabled={loadingAtualizar || loading}
          >
            {loadingAtualizar ? (
              <SyncRounded className="spin" fontSize="small" />
            ) : (
              <RefreshRounded fontSize="small" />
            )}
            {loadingAtualizar ? "Atualizando..." : "Atualizar"}
          </button>
        </div>
      </div>

      <div className="home-dashboard-card home-dashboard-card-full relatorios-filtros-card">
        <div className="home-dashboard-card-header">
          <div className="home-dashboard-card-title">
            <FilterAltRounded fontSize="small" />
            <h3>Período e filtros</h3>
          </div>

          <button
            type="button"
            className="home-collapse-btn"
            onClick={() => setFiltrosAbertos((prev) => !prev)}
          >
            {filtrosAbertos ? (
              <KeyboardArrowUpRounded />
            ) : (
              <KeyboardArrowDownRounded />
            )}
          </button>
        </div>

        {filtrosAbertos && (
          <>
            <div className="home-filters-grid relatorios-filtros-grid">
              <label className="home-filter-field">
                <span>
                  <CalendarMonthRounded fontSize="small" /> Início
                </span>
                <input
                  type="date"
                  value={periodoInicio}
                  max={periodoFim}
                  onChange={(e) => setPeriodoInicio(e.target.value)}
                />
              </label>

              <label className="home-filter-field">
                <span>
                  <CalendarMonthRounded fontSize="small" /> Fim
                </span>
                <input
                  type="date"
                  value={periodoFim}
                  min={periodoInicio}
                  onChange={(e) => setPeriodoFim(e.target.value)}
                />
              </label>

              <label className="home-filter-field">
                <span>
                  <SearchRounded fontSize="small" /> Busca geral
                </span>
                <input
                  type="text"
                  placeholder="Guia, passeio, operadora, veículo..."
                  value={filtroBusca}
                  onChange={(e) => setFiltroBusca(e.target.value)}
                />
              </label>

              <div className="relatorios-range-shortcuts">
                {rangeOptions.map((option) => (
                  <button
                    key={option.dias}
                    type="button"
                    className="home-chip-btn"
                    onClick={() => {
                      setPeriodoInicio(getDiasAtrasIso(option.dias - 1));
                      setPeriodoFim(getHojeIso());
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="relatorios-tabs-nav">
              <button
                type="button"
                className={`relatorios-tab-btn ${abaAtiva === ABAS.GUIAS ? "active" : ""}`}
                onClick={() => setAbaAtiva(ABAS.GUIAS)}
              >
                <ManageAccountsRounded fontSize="small" /> Guias
              </button>
              <button
                type="button"
                className={`relatorios-tab-btn ${abaAtiva === ABAS.PASSEIOS ? "active" : ""}`}
                onClick={() => setAbaAtiva(ABAS.PASSEIOS)}
              >
                <TravelExploreRounded fontSize="small" /> Passeios
              </button>
              <button
                type="button"
                className={`relatorios-tab-btn ${abaAtiva === ABAS.TRANSFERS ? "active" : ""}`}
                onClick={() => setAbaAtiva(ABAS.TRANSFERS)}
              >
                <SwapHorizRounded fontSize="small" /> Transfers
              </button>
            </div>

            <div className="home-filters-grid relatorios-filtros-grid relatorios-filtros-especificos">
              {abaAtiva === ABAS.GUIAS && (
                <>
                  <label className="home-filter-field">
                    <span>
                      <ManageAccountsRounded fontSize="small" /> Guia
                    </span>
                    <select
                      value={filtroGuia}
                      onChange={(e) => setFiltroGuia(e.target.value)}
                    >
                      {opcoesGuia.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="home-filter-field">
                    <span>
                      <TravelExploreRounded fontSize="small" /> Serviço
                    </span>
                    <select
                      value={filtroPasseioGuia}
                      onChange={(e) => setFiltroPasseioGuia(e.target.value)}
                    >
                      {opcoesPasseiosDeGuias.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="home-filter-field">
                    <span>
                      <RouteRounded fontSize="small" /> Veículo
                    </span>
                    <select
                      value={filtroVeiculoGuia}
                      onChange={(e) => setFiltroVeiculoGuia(e.target.value)}
                    >
                      {opcoesVeiculosGuias.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}

              {abaAtiva === ABAS.PASSEIOS && (
                <>
                  <label className="home-filter-field">
                    <span>
                      <TravelExploreRounded fontSize="small" /> Passeio
                    </span>
                    <select
                      value={filtroPasseio}
                      onChange={(e) => setFiltroPasseio(e.target.value)}
                    >
                      {opcoesPasseios.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="home-filter-field">
                    <span>
                      <GroupsRounded fontSize="small" /> Operadora
                    </span>
                    <select
                      value={filtroOperadoraPasseio}
                      onChange={(e) =>
                        setFiltroOperadoraPasseio(e.target.value)
                      }
                    >
                      {opcoesOperadorasPasseio.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="home-filter-checkbox">
                    <input
                      type="checkbox"
                      checked={mostrarSomenteSemGrupo}
                      onChange={(e) =>
                        setMostrarSomenteSemGrupo(e.target.checked)
                      }
                    />
                    <span>Somente passeios sem formação de grupo</span>
                  </label>
                </>
              )}

              {abaAtiva === ABAS.TRANSFERS && (
                <>
                  <label className="home-filter-field">
                    <span>
                      <CompareArrowsRounded fontSize="small" /> Tipo
                    </span>
                    <select
                      value={filtroTransferTipo}
                      onChange={(e) => setFiltroTransferTipo(e.target.value)}
                    >
                      <option value="TODOS">Todos</option>
                      <option value={TRANSFER_TIPOS.IN}>IN</option>
                      <option value={TRANSFER_TIPOS.OUT}>OUT</option>
                      <option value={TRANSFER_TIPOS.TRANSFER}>TRANSFER</option>
                    </select>
                  </label>

                  <label className="home-filter-field">
                    <span>
                      <FlightLandRounded fontSize="small" /> Região
                    </span>
                    <select
                      value={filtroTransferRegiao}
                      onChange={(e) => setFiltroTransferRegiao(e.target.value)}
                    >
                      <option value={REGIOES.TODAS}>Todas</option>
                      <option value={REGIOES.SALVADOR}>Salvador</option>
                      <option value={REGIOES.LITORAL}>Litoral Norte</option>
                    </select>
                  </label>

                  <label className="home-filter-field">
                    <span>
                      <GroupsRounded fontSize="small" /> Operadora
                    </span>
                    <select
                      value={filtroOperadora}
                      onChange={(e) => setFiltroOperadora(e.target.value)}
                    >
                      {opcoesOperadorasTransfer.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {erro && (
        <div className="home-alert-item critico">
          <strong>Falha ao carregar relatórios</strong>
          <span>{erro}</span>
        </div>
      )}

      <div className="home-kpis-grid relatorios-kpis-grid">
        {cardsResumo.map((card) => (
          <div key={card.titulo} className={`home-kpi-card ${card.destaque}`}>
            <div className="home-kpi-card-header">
              <span>{card.titulo}</span>
              <InsightsRounded fontSize="small" />
            </div>
            <strong>{card.valor}</strong>
            <small>{card.subtitulo}</small>
          </div>
        ))}
      </div>

      <div className="home-dashboard-grid">
        {abaAtiva === ABAS.GUIAS && (
          <>
            <div className="home-dashboard-card home-dashboard-card-large">
              <div className="home-dashboard-card-header">
                <div className="home-dashboard-card-title">
                  <TimelineRounded fontSize="small" />
                  <h3>Linha do tempo de serviços com guia</h3>
                </div>
              </div>

              <div className="home-dashboard-card-subtitle">
                {formatarPeriodoTitulo(periodoInicio, periodoFim)}
              </div>

              {loading ? (
                renderCardLoading("Carregando linha do tempo de guias...")
              ) : (
                <div style={{ width: "100%", height: 340 }}>
                  <ResponsiveContainer>
                    <LineChart
                      data={timelineGuias}
                      margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" opacity={0.18} />
                      <XAxis dataKey="label" />
                      <YAxis allowDecimals={false} />
                      <Tooltip content={<TooltipTimelineGuias />} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="servicos"
                        name="Serviços com guia"
                        stroke={CHART_COLORS[0]}
                        strokeWidth={3}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="home-dashboard-card home-dashboard-card-full">
              <div className="home-dashboard-card-header">
                <div className="home-dashboard-card-title">
                  <ManageAccountsRounded fontSize="small" />
                  <h3>Balanço por guia — Phoenix</h3>
                </div>
              </div>

              {loading ? (
                renderCardLoading("Carregando balanço de guias...")
              ) : (
                <div className="home-table-wrap">
                  <table className="home-table">
                    <thead>
                      <tr>
                        <th>Guia</th>
                        <th>Serviços</th>
                        <th>Passeios</th>
                        <th>IN</th>
                        <th>OUT</th>
                        <th>Transfer</th>
                        <th>Dias ativos</th>
                        <th>Veículos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {guiasFiltrados.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="empty-state">
                            Nenhum guia encontrado no Phoenix para os filtros
                            selecionados.
                          </td>
                        </tr>
                      ) : (
                        guiasFiltrados.map((item) => (
                          <tr key={item.id}>
                            <td>{item.nome}</td>
                            <td>{item.totalServicos}</td>
                            <td>{item.passeios}</td>
                            <td>{item.inCount}</td>
                            <td>{item.outCount}</td>
                            <td>{item.transferCount}</td>
                            <td>{item.diasAtivos}</td>
                            <td>{item.totalVeiculos}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {abaAtiva === ABAS.PASSEIOS && (
          <>
            <div className="home-dashboard-card home-dashboard-card-large">
              <div className="home-dashboard-card-header">
                <div className="home-dashboard-card-title">
                  <TravelExploreRounded fontSize="small" />
                  <h3>Passeios com maior volume</h3>
                </div>
              </div>

              {loading ? (
                renderCardLoading("Carregando gráfico de passeios...")
              ) : (
                <div style={{ width: "100%", height: 340 }}>
                  <ResponsiveContainer>
                    <BarChart
                      data={graficoPasseios}
                      layout="vertical"
                      margin={{ top: 10, right: 20, left: 40, bottom: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" opacity={0.18} />
                      <XAxis type="number" allowDecimals={false} />
                      <YAxis type="category" dataKey="nome" width={180} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend />
                      <Bar
                        dataKey="pax"
                        name="Pax"
                        radius={[0, 8, 8, 0]}
                        fill={CHART_COLORS[0]}
                      />
                      <Bar
                        dataKey="naoFormouGrupo"
                        name="Sem grupo"
                        radius={[0, 8, 8, 0]}
                        fill={CHART_COLORS[6]}
                      />
                      <Bar
                        dataKey="formouGrupo"
                        name="Com grupo"
                        radius={[0, 8, 8, 0]}
                        fill={CHART_COLORS[2]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="home-dashboard-card home-dashboard-card-large">
              <div className="home-dashboard-card-header">
                <div className="home-dashboard-card-title">
                  <TimelineRounded fontSize="small" />
                  <h3>Linha do tempo do passeio</h3>
                </div>
              </div>

              {loading ? (
                renderCardLoading("Carregando linha do tempo...")
              ) : (
                <div style={{ width: "100%", height: 340 }}>
                  <ResponsiveContainer>
                    <LineChart
                      data={passeiosFiltrados[0]?.timeline || []}
                      margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" opacity={0.18} />
                      <XAxis dataKey="label" />
                      <YAxis allowDecimals={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="pax"
                        name="Pax"
                        stroke={CHART_COLORS[0]}
                        strokeWidth={3}
                        dot={{ r: 3 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="ocorrencias"
                        name="Serviços"
                        stroke={CHART_COLORS[4]}
                        strokeWidth={3}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="home-dashboard-card home-dashboard-card-full">
              <div className="home-dashboard-card-header">
                <div className="home-dashboard-card-title">
                  <GroupsRounded fontSize="small" />
                  <h3>Balanço de passeios — Phoenix</h3>
                </div>
              </div>

              {loading ? (
                renderCardLoading("Carregando balanço de passeios...")
              ) : (
                <div className="home-table-wrap">
                  <table className="home-table">
                    <thead>
                      <tr>
                        <th>Passeio</th>
                        <th>Serviços</th>
                        <th>Dias operados</th>
                        <th>Pax</th>
                        <th>Grupo formado</th>
                        <th>Não formou grupo</th>
                        <th>Taxa de formação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {passeiosFiltrados.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="empty-state">
                            Nenhum passeio encontrado no Phoenix para os filtros
                            selecionados.
                          </td>
                        </tr>
                      ) : (
                        passeiosFiltrados.map((item) => (
                          <tr key={item.nome}>
                            <td>{item.nome}</td>
                            <td>{item.ocorrencias}</td>
                            <td>{item.diasOperados}</td>
                            <td>{formatarNumero(item.pax)}</td>
                            <td>{item.formouGrupo}</td>
                            <td>
                              <span
                                className={`status-pill ${
                                  item.naoFormouGrupo > 0 ? "alerta" : "ok"
                                }`}
                              >
                                {item.naoFormouGrupo}
                              </span>
                            </td>
                            <td>{item.taxaFormacao}%</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {abaAtiva === ABAS.TRANSFERS && (
          <>
            <div className="home-dashboard-card home-dashboard-card-large">
              <div className="home-dashboard-card-header">
                <div className="home-dashboard-card-title">
                  <TimelineRounded fontSize="small" />
                  <h3>Comparativo de demanda</h3>
                </div>
              </div>

              <div className="home-dashboard-card-subtitle">
                {formatarPeriodoTitulo(periodoInicio, periodoFim)}
              </div>

              {loading ? (
                renderCardLoading("Carregando comparativo...")
              ) : (
                <div style={{ width: "100%", height: 320 }}>
                  <ResponsiveContainer>
                    <ComposedChart
                      data={timelineDemanda}
                      margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" opacity={0.18} />
                      <XAxis dataKey="label" />
                      <YAxis yAxisId="left" allowDecimals={false} />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        allowDecimals={false}
                      />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend />
                      <Bar
                        yAxisId="left"
                        dataKey="pax"
                        name="Pax"
                        radius={[8, 8, 0, 0]}
                        fill={CHART_COLORS[0]}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="servicos"
                        name="Serviços"
                        stroke={CHART_COLORS[4]}
                        strokeWidth={3}
                        dot={{ r: 3 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="home-dashboard-card home-dashboard-card-large">
              <div className="home-dashboard-card-header">
                <div className="home-dashboard-card-title">
                  <FlightTakeoffRounded fontSize="small" />
                  <h3>Pax por operadora</h3>
                </div>
              </div>

              {loading ? (
                renderCardLoading("Carregando operadoras...")
              ) : (
                <div style={{ width: "100%", height: 340 }}>
                  <ResponsiveContainer>
                    <BarChart
                      data={graficoTransfersOperadora}
                      margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" opacity={0.18} />
                      <XAxis
                        dataKey="operadora"
                        angle={-20}
                        textAnchor="end"
                        interval={0}
                        height={70}
                      />
                      <YAxis allowDecimals={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend />
                      <Bar
                        dataKey="IN"
                        stackId="a"
                        name="IN"
                        fill={CHART_COLORS[0]}
                        radius={[8, 8, 0, 0]}
                      />
                      <Bar
                        dataKey="OUT"
                        stackId="a"
                        name="OUT"
                        fill={CHART_COLORS[4]}
                        radius={[8, 8, 0, 0]}
                      />
                      <Bar
                        dataKey="TRANSFER"
                        stackId="a"
                        name="TRANSFER"
                        fill={CHART_COLORS[2]}
                        radius={[8, 8, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="home-dashboard-card home-dashboard-card-large">
              <div className="home-dashboard-card-header">
                <div className="home-dashboard-card-title">
                  <CompareArrowsRounded fontSize="small" />
                  <h3>Mix operacional</h3>
                </div>
              </div>

              {loading ? (
                renderCardLoading("Carregando mix operacional...")
              ) : (
                <div style={{ width: "100%", height: 340 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={graficoTransfersMix}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={75}
                        outerRadius={115}
                        paddingAngle={3}
                      >
                        {graficoTransfersMix.map((entry, index) => (
                          <Cell
                            key={entry.name}
                            fill={CHART_COLORS[index % CHART_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="home-dashboard-card home-dashboard-card-full">
              <div className="home-dashboard-card-header">
                <div className="home-dashboard-card-title">
                  <SwapHorizRounded fontSize="small" />
                  <h3>Detalhamento de transfers — Phoenix</h3>
                </div>
              </div>

              {loading ? (
                renderCardLoading("Carregando detalhamento de transfers...")
              ) : (
                <div className="home-table-wrap">
                  <table className="home-table">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Hora</th>
                        <th>Tipo</th>
                        <th>Região</th>
                        <th>Serviço</th>
                        <th>Origem</th>
                        <th>Destino</th>
                        <th>Guia</th>
                        <th>Operadora</th>
                        <th>Pax</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transfersFiltrados.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="empty-state">
                            Nenhum transfer encontrado no Phoenix para os
                            filtros selecionados.
                          </td>
                        </tr>
                      ) : (
                        transfersFiltrados.map((item) => (
                          <tr key={item.id}>
                            <td>{formatarDataBr(item.date)}</td>
                            <td>{item.horario || "--:--"}</td>
                            <td>
                              <span className="status-pill neutro">
                                {item.tipo}
                              </span>
                            </td>
                            <td>{item.regiao}</td>
                            <td>{item.serviceName}</td>
                            <td>{item.origem}</td>
                            <td>{item.destino}</td>
                            <td>{item.guia}</td>
                            <td>{item.operadora}</td>
                            <td>{item.pax}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {(loading || loadingAtualizar) && !erro && (
        <div className="home-alert-item info">
          <strong>Atualizando relatórios</strong>
          <span>Carregando dados do Phoenix para o período selecionado.</span>
        </div>
      )}
    </div>
  );
};

export default RelatoriosOperacionaisApiOnly;
