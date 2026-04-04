import { useEffect, useMemo, useState } from "react";
import {
  FlightTakeoffRounded,
  FlightLandRounded,
  CalendarMonthRounded,
  RefreshRounded,
  AccessTimeRounded,
  GroupsRounded,
  Inventory2Rounded,
  WarningAmberRounded,
  KeyboardArrowDownRounded,
  KeyboardArrowUpRounded,
  FilterAltRounded,
  DirectionsBusRounded,
  HotelRounded,
  SyncRounded,
  SearchRounded,
  AssignmentRounded,
  PersonRounded,
  ContentCopyRounded,
  CheckRounded,
  TourRounded,
} from "@mui/icons-material";
import jsPDF from "jspdf";
import logoLuck from "../../assets/clover.png";
import "./styles.css";

const API_BASE =
  "https://driversalvador.phoenix.comeialabs.com/scale/reserve-service";

const EXPAND =
  "service,schedule,reserve,establishmentOrigin,establishmentDestination,establishmentOrigin.region,establishmentDestination.region,reserve.partner,reserve.customer,additionalReserveServices,additionalReserveServices.additional,additionalReserveServices.provider,roadmapService,roadmapService.roadmap,auxRoadmapService.roadmap,auxRoadmapService.roadmap.serviceOrder,auxRoadmapService.roadmap.serviceOrder.vehicle,auxRoadmapService.roadmap.driver,auxRoadmapService.roadmap.guide,roadmapService.roadmap.driver,roadmapService.roadmap.guide,roadmapService.roadmap.serviceOrder,roadmapService.roadmap.serviceOrder.vehicle,reserve.pdvPayment.user";

const SERVICOS_IGNORADOS = [
  "PASSEIO PRAIA DO FORTE 4H (LTN-VOLTA)",
  "IN  - LITORAL NORTE",
  "CITY TOUR PANORAMICO",
  "VOLTA FRADES COM ITAPARICA",
  "OUT -  LITORAL NORTE",
  "COORDENADOR LTN 04H OU 08H",
  "COORDENADOR SSA 08H",
];

/**
 * Configure aqui manualmente os passeios que devem sair com ponto de apoio.
 * A chave é o nome normalizado do passeio.
 * O valor é o texto que deve sair na cópia.
 */
const PONTOS_DE_APOIO_CONFIG = {
  "tour a praia do forte e guarajuba": "Barraca do Carlinhos",
  "tour morro de sao paulo": "Sambass",
  "tour de ilhas frades e itaparica": "Manguezal",
  "praias do litoral norte": "Zoião",
  "city tour salvador saindo do litoral": "Coliseu",
  "city tour historico e panoramico": "alternar",
};

const ABAS = {
  CHEGADAS: "chegadas",
  OUTS: "outs",
  GUIAS: "guias",
};

const getHojeIso = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const montarUrlApi = (date, serviceType = null) => {
  const params = new URLSearchParams();
  params.append("execution_date", date);
  params.append("expand", EXPAND);

  if (serviceType) {
    params.append("service_type[]", String(serviceType));
  }

  return `${API_BASE}?${params.toString()}`;
};

const extrairListaResposta = (json) => {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.results)) return json.results;
  return [];
};

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

const normalizarNomePasseio = (nome = "") => {
  return normalizarTexto(nome)
    .replace(/\b4h\b/g, "")
    .replace(/\bvolta\b/g, "volta")
    .replace(/\bin\b/g, "in")
    .replace(/\bltn\b/g, "ltn")
    .replace(/\s+/g, " ")
    .trim();
};

const formatarDataBr = (dataIso) => {
  if (!dataIso) return "";
  const [ano, mes, dia] = String(dataIso).split("-");
  return `${dia}/${mes}/${ano}`;
};

const formatarHora = (valor = "") => {
  if (!valor) return "--:--";

  const str = String(valor).trim();

  if (str.includes("T")) {
    return str.slice(11, 16) || "--:--";
  }

  const match = str.match(/(\d{2}):(\d{2})/);
  if (match) return `${match[1]}:${match[2]}`;

  return "--:--";
};

const montarTextoMonitoramentoGrupo = (grupo) => {
  if (!grupo) return "";

  if (grupo.tipoServico === "TRANSFER") {
    const origemPrincipal =
      grupo.hoteisOrdenados?.[0]?.hotelOrigemAbreviado ||
      grupo.origensUnicasAbreviadas?.[0] ||
      "Origem não informada";

    const destinoPrincipal =
      grupo.hoteisOrdenados?.[0]?.hotelDestinoAbreviado ||
      grupo.destinosUnicosAbreviados?.[0] ||
      "Destino não informado";

    const total = formatarQuantidadeDetalhada(
      grupo.totalAdultos,
      grupo.totalCriancas,
      grupo.totalInfantes,
    );

    return [
      "Olá!",
      "",
      "TUDO CERTO PARA ESSE SERVIÇO ?",
      origemPrincipal,
      destinoPrincipal,
      `QUANTIDADE DE PAX: *${total}*`,
      "Favor enviar a localização em real.",
      "Equipe de Monitoramento - Luck SSA.",
    ].join("\n");
  }

  const linhas = ["Olá!", "", "TUDO CERTO PARA ESSE OUT ?"];
  linhas.push("");
  const blocos = Array.isArray(grupo.hoteisOrdenados)
    ? grupo.hoteisOrdenados
    : [];

  if (blocos.length) {
    blocos.forEach((hotel, index) => {
      const prefixo = blocos.length > 1 ? `ORIGEM ${index + 1}:` : "ORIGEM:";

      linhas.push(
        `${prefixo} ${hotel.hotelOrigemAbreviado} - *${formatarQuantidadeDetalhada(
          hotel.totalAdultos,
          hotel.totalCriancas,
          hotel.totalInfantes,
        )}* - *${hotel.horario || "--:--"}*`,
      );
    });
  } else {
    linhas.push("ORIGEM: Origem não informada");
  }

  linhas.push(
    `QUANTIDADE TOTAL DE PAX: *${formatarQuantidadeDetalhada(
      grupo.totalAdultos,
      grupo.totalCriancas,
      grupo.totalInfantes,
    )}*`,
  );
  linhas.push(`MODALIDADE DO SERVIÇO: *${grupo.modalidade || "-"}*`);
  linhas.push("");
  linhas.push("Favor enviar a localização em real.");
  linhas.push("");
  linhas.push("_Equipe de Monitoramento - Luck SSA_");

  return linhas.join("\n");
};

const copiarMonitoramentoGrupo = async (grupo) => {
  try {
    await navigator.clipboard.writeText(montarTextoMonitoramentoGrupo(grupo));
    return true;
  } catch (error) {
    console.error("Erro ao copiar monitoramento:", error);
    alert("Não foi possível copiar o monitoramento.");
    return false;
  }
};

const somarDiasIso = (dataIso, dias = 0) => {
  if (!dataIso) return "";
  const [ano, mes, dia] = String(dataIso).split("-").map(Number);
  const data = new Date(ano, (mes || 1) - 1, dia || 1);
  data.setDate(data.getDate() + dias);

  const yyyy = data.getFullYear();
  const mm = String(data.getMonth() + 1).padStart(2, "0");
  const dd = String(data.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const extrairDataIsoDeValor = (valor = "") => {
  if (!valor) return "";
  const str = String(valor).trim();

  const matchIso = str.match(/^(\d{4}-\d{2}-\d{2})/);
  if (matchIso) return matchIso[1];

  const matchBr = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (matchBr) {
    const [, dd, mm, yyyy] = matchBr;
    return `${yyyy}-${mm}-${dd}`;
  }

  return "";
};

const extrairDataRealServico = (item) =>
  extrairDataIsoDeValor(
    item?.presentation_hour ||
    item?.presentation_hour_end ||
    item?.schedule?.presentation_hour ||
    item?.date ||
    item?.execution_date ||
    "",
  ) || "";

const extrairDataReserva = (item) =>
  extrairDataIsoDeValor(
    item?.reserve?.date ||
    item?.reserve?.created_at ||
    item?.reserve?.updated_at ||
    item?.date ||
    item?.execution_date ||
    "",
  ) || "";

const compararDataHora = (dataA, horaA, dataB, horaB) => {
  const chaveA = `${dataA || "9999-99-99"} ${horaA || "99:99"}`;
  const chaveB = `${dataB || "9999-99-99"} ${horaB || "99:99"}`;
  return chaveA.localeCompare(chaveB, "pt-BR", { sensitivity: "base" });
};

const somarPaxDetalhadoReservas = (reservas = []) =>
  reservas.reduce(
    (acc, item) => {
      acc.adultos += Number(item?.adultos || 0);
      acc.criancas += Number(item?.criancas || 0);
      acc.infantes += Number(item?.infantes || 0);
      acc.total += Number(item?.pax || 0);
      return acc;
    },
    { adultos: 0, criancas: 0, infantes: 0, total: 0 },
  );

const abreviarHotel = (nome = "") => {
  const texto = String(nome || "").trim();
  if (!texto) return "HOTEL NÃO INFORMADO";

  const limpo = texto
    .replace(/\bpousada\b/gi, "Pous.")
    .replace(/\bresort\b/gi, "Resort")
    .replace(/\bapart\b/gi, "Apart")
    .replace(/\bapartamento\b/gi, "Apto.")
    .replace(/\bcondom[ií]nio\b/gi, "Cond.")
    .replace(/\bporto\b/gi, "Porto")
    .replace(/\bpraia\b/gi, "Praia")
    .replace(/\s+/g, " ")
    .trim();

  return limpo.length > 34 ? `${limpo.slice(0, 34).trim()}…` : limpo;
};

const getBadgeAlertaServicoHoje = (grupo, dataMapa) => {
  if (!grupo?.dataServicoReal || !dataMapa) return false;
  return grupo.dataServicoReal !== dataMapa;
};

const SERVICOS_IGNORADOS_NORMALIZADOS = SERVICOS_IGNORADOS.map((item) =>
  normalizarNomePasseio(item),
);

const PONTOS_DE_APOIO_CONFIG_NORMALIZADO = Object.entries(
  PONTOS_DE_APOIO_CONFIG,
).reduce((acc, [chave, valor]) => {
  acc[normalizarNomePasseio(chave)] = valor;
  return acc;
}, {});

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

const ordenarHora = (a, b) => String(a || "").localeCompare(String(b || ""));
const extrairAdultos = (item) => Number(item?.is_adult_count || 0);
const extrairCriancas = (item) => Number(item?.is_child_count || 0);
const extrairInfantes = (item) =>
  Number(item?.is_baby_count || item?.is_infant_count || 0);
const extrairPax = (item) =>
  extrairAdultos(item) + extrairCriancas(item) + extrairInfantes(item);

const formatarQuantidadeDetalhada = (
  adultos = 0,
  criancas = 0,
  infantes = 0,
) => {
  const partes = [];
  if (adultos > 0) partes.push(`${adultos} ADT`);
  if (criancas > 0) partes.push(`${criancas} CHD`);
  if (infantes > 0) partes.push(`${infantes} INF`);
  return partes.length ? partes.join(" | ") : "0 ADT";
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

const extrairObservacao = (item) =>
  item?.observation ||
  item?.observations ||
  item?.notes ||
  item?.note ||
  item?.reserve?.observation ||
  item?.reserve?.observations ||
  item?.reserve?.notes ||
  item?.reserve?.note ||
  item?.serviceOrder?.observation ||
  item?.serviceOrder?.notes ||
  "-";

const extrairHotel = (item) =>
  item?.establishmentOrigin?.name ||
  item?.origin?.name ||
  item?.reserve?.origin?.name ||
  item?.hotel?.name ||
  "Hotel não informado";

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

const extrairRegiao = (item) => {
  const bruto =
    item?.establishmentOrigin?.region?.name ||
    item?.establishmentOrigin?.region?.title ||
    item?.establishmentOrigin?.region?.description ||
    item?.origin?.region?.name ||
    item?.reserve?.origin?.region?.name ||
    item?.establishmentOriginRegion?.name ||
    "";

  const texto = String(bruto || "").trim();
  if (!texto) return "Região não informada";

  const normalizado = normalizarTexto(texto);
  if (normalizado.includes("litoral")) return "Litoral";
  if (normalizado.includes("salvador")) return "Salvador";

  return texto;
};

const extrairPresentationHour = (item) =>
  item?.presentation_hour ||
  item?.schedule?.presentation_hour ||
  item?.presentation_hour_end ||
  item?.date ||
  item?.execution_date ||
  "";

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

const extrairVeiculoOut = (item) =>
  item?.roadmapService?.roadmap?.serviceOrder?.vehicle?.prefix ||
  item?.roadmapService?.roadmap?.serviceOrder?.vehicle?.name ||
  item?.roadmapService?.roadmap?.serviceOrder?.vehicle?.plate ||
  item?.auxRoadmapService?.roadmap?.serviceOrder?.vehicle?.prefix ||
  item?.auxRoadmapService?.roadmap?.serviceOrder?.vehicle?.name ||
  item?.auxRoadmapService?.roadmap?.serviceOrder?.vehicle?.plate ||
  item?.vehicle?.prefix ||
  item?.vehicle?.name ||
  item?.vehicle?.plate ||
  "FORA DE ESCALA";

const extrairVeiculoEscalado = (item) =>
  item?.roadmapService?.roadmap?.serviceOrder?.vehicle?.nickname ||
  item?.auxRoadmapService?.roadmap?.serviceOrder?.vehicle?.nickname ||
  item?.roadmapService?.roadmap?.serviceOrder?.vehicle?.name ||
  item?.auxRoadmapService?.roadmap?.serviceOrder?.vehicle?.name ||
  item?.roadmapService?.roadmap?.serviceOrder?.vehicle?.prefix ||
  item?.auxRoadmapService?.roadmap?.serviceOrder?.vehicle?.prefix ||
  item?.roadmapService?.roadmap?.serviceOrder?.vehicle?.plate ||
  item?.auxRoadmapService?.roadmap?.serviceOrder?.vehicle?.plate ||
  item?.vehicle?.nickname ||
  item?.vehicle?.name ||
  item?.vehicle?.prefix ||
  item?.vehicle?.plate ||
  "Sem veículo";

const extrairNumeroVoo = (item) =>
  item?.schedule?.name ||
  item?.reserve?.flight_code ||
  item?.reserve?.flight?.code ||
  item?.reserve?.arrival_flight_code ||
  item?.flight_code ||
  item?.flight?.code ||
  item?.flightNumber ||
  "";

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

  if (valor.includes("T")) return valor.split("T")[1]?.slice(0, 5) || "";

  const match = valor.match(/\b(\d{2}:\d{2})/);
  return match?.[1] || "";
};

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

const extrairAdicionais = (item) => {
  if (!Array.isArray(item?.additionalReserveServices)) return "-";

  const adicionais = item.additionalReserveServices
    .map(
      (add) => add?.additional?.name || add?.provider?.name || add?.name || "",
    )
    .filter(Boolean);

  return adicionais.length ? adicionais.join(", ") : "-";
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
  if (cancelado) return { status: "Cancelado", diferencaMinutos: null };

  const previsto = extrairHoraMinutos(horarioPrevistoChegada);
  const atualizado =
    extrairHoraMinutos(horarioRealChegada) ??
    extrairHoraMinutos(horarioAtualizadoChegada);

  if (pousado && atualizado !== null && previsto !== null) {
    const diff = atualizado - previsto;
    if (diff > 0)
      return { status: "Pousado com atraso", diferencaMinutos: diff };
    if (diff < 0)
      return { status: "Pousado antecipado", diferencaMinutos: diff };
    return { status: "Pousado no horário", diferencaMinutos: 0 };
  }

  if (previsto !== null && atualizado !== null) {
    const diff = atualizado - previsto;
    if (diff > 0) return { status: "Atrasado", diferencaMinutos: diff };
    if (diff < 0) return { status: "Antecipado", diferencaMinutos: diff };
    return { status: "No horário", diferencaMinutos: 0 };
  }

  if (horarioDecolagem || horarioPrevistoChegada) {
    return { status: "Programado", diferencaMinutos: null };
  }

  return { status: "Sem informação", diferencaMinutos: null };
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
  if (diferencaMinutos > 0) return `${diferencaMinutos} min de atraso`;
  if (diferencaMinutos < 0)
    return `${Math.abs(diferencaMinutos)} min adiantado`;
  return "No horário";
};

const somarReservas = (reservas = []) =>
  reservas.reduce(
    (acc, reserva) => {
      acc.totalPax += Number(reserva.pax || 0);
      acc.totalCriancas += Number(reserva.criancas || 0);
      acc.totalInfantes += Number(reserva.infantes || 0);
      acc.totalReservas += 1;
      return acc;
    },
    {
      totalPax: 0,
      totalCriancas: 0,
      totalInfantes: 0,
      totalReservas: 0,
    },
  );

const normalizarCodigoVoo = (valor = "") =>
  String(valor).toUpperCase().replace(/\s+/g, "").replace("-", "");

const deveIgnorarServico = (nome = "") => {
  const normalizado = nome
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return SERVICOS_IGNORADOS.some((ignorado) =>
    normalizado.includes(
      ignorado
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, ""),
    ),
  );
};

const extrairGuiaEscalado = (item) =>
  item?.roadmapService?.roadmap?.guide?.nickname ||
  item?.roadmapService?.roadmap?.guide?.name ||
  item?.auxRoadmapService?.roadmap?.guide?.nickname ||
  item?.auxRoadmapService?.roadmap?.guide?.name ||
  "";

const extrairNomePasseio = (item) =>
  item?.service?.nickname ||
  item?.service?.name ||
  item?.service_name ||
  "Passeio não informado";

const extrairVeiculoGuia = (item) =>
  item?.roadmapService?.roadmap?.serviceOrder?.vehicle?.nickname ||
  item?.roadmapService?.roadmap?.serviceOrder?.vehicle?.name ||
  item?.auxRoadmapService?.roadmap?.serviceOrder?.vehicle?.nickname ||
  item?.auxRoadmapService?.roadmap?.serviceOrder?.vehicle?.name ||
  item?.vehicle?.nickname ||
  item?.vehicle?.name ||
  item?.vehicle?.plate ||
  "Veículo não informado";

const extrairFornecedor = (item) =>
  item?.roadmapService?.roadmap?.driver?.nickname ||
  item?.roadmapService?.roadmap?.driver?.name ||
  item?.auxRoadmapService?.roadmap?.driver?.nickname ||
  item?.auxRoadmapService?.roadmap?.driver?.name ||
  "Fornecedor não informado";

const extrairFornecedorNickname = (item) =>
  item?.roadmapService?.roadmap?.driver?.nickname ||
  item?.auxRoadmapService?.roadmap?.driver?.nickname ||
  item?.roadmapService?.roadmap?.driver?.name ||
  item?.auxRoadmapService?.roadmap?.driver?.name ||
  item?.driver?.nickname ||
  item?.driver?.name ||
  "Fornecedor não informado";

const extrairVeiculoPrincipalOut = (item) =>
  item?.roadmapService?.roadmap?.serviceOrder?.vehicle?.nickname ||
  item?.auxRoadmapService?.roadmap?.serviceOrder?.vehicle?.nickname ||
  item?.roadmapService?.roadmap?.serviceOrder?.vehicle?.name ||
  item?.auxRoadmapService?.roadmap?.serviceOrder?.vehicle?.name ||
  item?.vehicle?.nickname ||
  item?.vehicle?.name ||
  item?.vehicle?.plate ||
  "FORA DE ESCALA";

const extrairPrimeiroHorarioValido = (lista = []) => {
  const horarios = lista
    .map((item) => formatarHora(item))
    .filter((h) => h && h !== "--:--")
    .sort(ordenarHora);

  return horarios[0] || "--:--";
};

const extrairNumeroEscala = (item) =>
  item?.roadmapService?.roadmap?.id ||
  item?.auxRoadmapService?.roadmap?.id ||
  item?.roadmap?.id ||
  item?.scale_id ||
  item?.escala_id ||
  "Sem escala";

const extrairVooRetornoTexto = (item) => {
  const codigo =
    item?.reserve?.flight?.code ||
    item?.reserve?.flight_code ||
    item?.schedule?.name ||
    item?.flight?.code ||
    item?.flight_code ||
    "-";

  const horario =
    formatarHora(
      item?.reserve?.flight?.departure_time ||
      item?.reserve?.flight?.scheduled_departure ||
      item?.reserve?.departure_flight_time ||
      item?.flight?.departure_time ||
      item?.flight?.scheduled_departure ||
      item?.fly_hour ||
      "",
    ) || "--:--";

  if (codigo === "-" && horario === "--:--") return "-";
  if (codigo === "-") return horario;
  if (horario === "--:--") return codigo;

  return `${codigo} • ${horario}`;
};

const abrirBuscaVooPratica = (item) => {
  const codigo =
    item?.reserve?.flight?.code ||
    item?.reserve?.flight_code ||
    item?.flight?.code ||
    item?.flight_code ||
    item?.schedule?.name ||
    "";

  const codigoLimpo = String(codigo || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

  if (!codigoLimpo) return;

  window.open(
    `https://www.google.com/search?q=${encodeURIComponent(codigoLimpo)}`,
    "_blank",
    "noopener,noreferrer",
  );
};

const extrairHorarioApresentacao = (item) =>
  formatarHora(
    item?.presentation_hour ||
    item?.schedule?.presentation_hour ||
    item?.our_schedule ||
    item?.fly_hour ||
    "",
  );

const obterPontoDeApoio = (nomePasseio = "") => {
  const chave = normalizarTexto(nomePasseio);
  return (
    PONTOS_DE_APOIO_CONFIG_NORMALIZADO[normalizarNomePasseio(chave)] ||
    PONTOS_DE_APOIO_CONFIG_NORMALIZADO[normalizarNomePasseio(nomePasseio)] ||
    ""
  );
};

const extrairTipoOutOuTransfer = (item) => {
  const tipoBruto =
    item?.service_type ??
    item?.serviceType ??
    item?.service?.type ??
    item?.service?.service_type;

  const tipo = String(tipoBruto || "").trim();

  if (tipo === "2") return "OUT";
  if (tipo === "4") return "TRANSFER";

  const nomeServico = normalizarTexto(extrairNomePasseio(item));
  if (nomeServico.includes("out")) return "OUT";
  return "TRANSFER";
};

const carregarImagemComoDataURL = (src) =>
  new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }

    const img = new Image();
    img.crossOrigin = "Anonymous";

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch (error) {
        console.error("Erro ao converter logo:", error);
        resolve(null);
      }
    };

    img.onerror = () => resolve(null);
    img.src = src;
  });

const quebrarTextoCentralizado = (doc, texto = "", larguraMax = 220) => {
  const linhas = doc.splitTextToSize(String(texto || ""), larguraMax);
  return Array.isArray(linhas) ? linhas : [String(texto || "")];
};

const extrairTextoVooPlaca = (voo = "") =>
  String(voo || "")
    .trim()
    .toUpperCase() || "VOO NÃO INFORMADO";

const extrairTextoNomePlaca = (nome = "") => {
  if (!nome) return "NOME NÃO INFORMADO";

  const partes = String(nome)
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean);

  if (partes.length <= 2) {
    return partes.join(" ").toUpperCase();
  }

  const segundaPalavra = String(partes[1] || "").toLowerCase();
  const conectores = ["de", "da", "do", "dos", "das"];

  if (conectores.includes(segundaPalavra) && partes.length >= 3) {
    return partes.slice(0, 3).join(" ").toUpperCase();
  }

  return partes.slice(0, 2).join(" ").toUpperCase();
};

const desenharMolduraProfissional = ({ doc, config }) => {
  const largura = doc.internal.pageSize.getWidth();
  const altura = doc.internal.pageSize.getHeight();

  doc.setFillColor(...(config?.fundoPlaca || [246, 248, 246]));
  doc.rect(0, 0, largura, altura, "F");

  doc.setFillColor(...(config?.fundoHeader || [255, 255, 255]));
  doc.roundedRect(12, 12, largura - 24, 30, 4, 4, "F");

  doc.setDrawColor(...(config?.linhaDivisoria || [220, 232, 225]));
  doc.setLineWidth(0.6);
  doc.line(14, 52, largura - 14, 52);

  doc.line(18, altura - 24, largura - 18, altura - 24);

  return { largura, altura };
};

const desenharLogoProfissional = ({
  doc,
  logoDataUrl,
  config,
  larguraMax = 52,
  alturaMax = 24,
  margemDireita = 14,
  margemInferior = 10,
}) => {
  if (config?.mostrarLogoNasPlacas && logoDataUrl) {
    try {
      const props = doc.getImageProperties(logoDataUrl);

      const larguraOriginal = props?.width || 1;
      const alturaOriginal = props?.height || 1;
      const formato = String(
        props?.fileType || props?.format || "PNG",
      ).toUpperCase();

      const proporcao = larguraOriginal / alturaOriginal;

      const larguraMax = 50;
      const alturaMax = 50;

      let larguraFinal = larguraMax;
      let alturaFinal = larguraFinal / proporcao;

      if (alturaFinal > alturaMax) {
        alturaFinal = alturaMax;
        larguraFinal = alturaFinal * proporcao;
      }

      const x = largura - larguraFinal - 18;
      const y = 14;

      doc.addImage(logoDataUrl, formato, x, y, larguraFinal, alturaFinal);
    } catch (error) {
      console.error("Erro ao desenhar logo no cabeçalho da coleção:", error);
    }
  }
};

const desenharSeloRecepcao = ({ doc, config }) => {
  doc.setTextColor(...(config?.corTexto || [55, 65, 81]));
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("RECEPÇÃO AEROPORTO", 18, 22);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Luck Receptivo", 18, 28);

  doc.setDrawColor(...(config?.corDestaque || [0, 133, 102]));
  doc.setLineWidth(1.4);
  doc.line(18, 32, 44, 32);
};

const desenharTextoVooTopo = ({ doc, voo, config }) => {
  const largura = doc.internal.pageSize.getWidth();

  doc.setTextColor(...(config?.corTexto || [55, 65, 81]));
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("VOO", largura / 2, 23, { align: "center" });

  doc.setTextColor(...(config?.corTexto || [55, 65, 81]));
  doc.setFont("helvetica", "bold");
  doc.setFontSize(40);
  doc.text(extrairTextoVooPlaca(voo), largura / 2, 39, {
    align: "center",
  });
};

const desenharNomePremium = ({ doc, nome, config }) => {
  const largura = doc.internal.pageSize.getWidth();
  const altura = doc.internal.pageSize.getHeight();

  const texto = extrairTextoNomePlaca(nome);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...(config?.corTexto || [40, 40, 40]));

  // 🔥 COMEÇA GRANDE (impacto visual)
  let fontSize = 95;

  let linhas = doc.splitTextToSize(texto, largura - 40);

  // 🔽 Reduz até caber em no máximo 2 linhas
  while (linhas.length > 2 && fontSize > 40) {
    fontSize -= 2;
    doc.setFontSize(fontSize);
    linhas = doc.splitTextToSize(texto, largura - 40);
  }

  doc.setFontSize(fontSize);

  // 🎯 CENTRALIZAÇÃO REAL (vertical + horizontal)
  const espacamento = fontSize * 0.40;
  const alturaBloco = (linhas.length - 1) * espacamento;

  let y = altura / 2 - alturaBloco / 2;

  linhas.slice(0, 2).forEach((linha) => {
    doc.text(linha, largura / 2, y, { align: "center" });
    y += espacamento;
  });
};

const desenharDataDiscreta = ({ doc, data, config }) => {
  const altura = doc.internal.pageSize.getHeight();
  const textoData = formatarDataPlaca(data);

  if (!textoData) return;

  doc.setTextColor(...(config?.corData || [90, 90, 90]));
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(`Data: ${textoData}`, 16, altura - 7);
};

const desenharRodapeElegante = ({ doc, config }) => {
  const altura = doc.internal.pageSize.getHeight();

  doc.setTextColor(...(config?.corData || [90, 90, 90]));
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("Operacional • Luck Receptivo", 16, altura - 13);
};

const desenharPlacaIndividual = ({
  doc,
  reserva,
  voo,
  data,
  config,
  logoDataUrl,
}) => {
  const { largura, altura } = desenharCabecalhoPadraoPlaca({
    doc,
    voo,
    config,
    logoDataUrl,
  });

  const nomePlaca = extrairTextoNomePlaca(reserva?.cliente || "");

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...(config?.corTexto || [65, 74, 95]));

  let fontSize = 60;
  let linhas = quebrarTextoCentralizado(doc, nomePlaca, largura - 60);

  while (linhas.length > 2 && fontSize > 24) {
    fontSize -= 2;
    doc.setFontSize(fontSize);
    linhas = quebrarTextoCentralizado(doc, nomePlaca, largura - 60);
  }

  doc.setFontSize(fontSize);

  const centroY = (34 + (altura - 14)) / 2 + 4;
  const espacamentoLinhas = fontSize * 0.42;

  if (linhas.length === 1) {
    doc.text(linhas[0], largura / 2, centroY, { align: "center" });
  } else {
    const blocoAltura = (linhas.length - 1) * espacamentoLinhas;
    let linhaY = centroY - blocoAltura / 2;

    linhas.slice(0, 2).forEach((linha) => {
      doc.text(linha, largura / 2, linhaY, { align: "center" });
      linhaY += espacamentoLinhas;
    });
  }

  desenharRodapePadraoPlaca({
    doc,
    data,
    config,
  });
};

const desenharCabecalhoColecao = ({ doc, voo, data, config, logoDataUrl }) => {
  return desenharCabecalhoPadraoPlaca({
    doc,
    voo,
    config,
    logoDataUrl,
  });
};

const desenharItemColecao = ({
  doc,
  nome,
  indice,
  inicioY,
  totalPorPagina,
  config,
}) => {
  const larguraPagina = doc.internal.pageSize.getWidth();
  const margemX = 14;
  const larguraUtil = larguraPagina - margemX * 2;
  const areaUtil = 150;

  const alturaBox = areaUtil / totalPorPagina;
  const posY = inicioY + indice * alturaBox;

  const nomePlaca = extrairTextoNomePlaca(nome);

  // fundo
  doc.setFillColor(255, 255, 255);
  doc.rect(margemX, posY, larguraUtil, alturaBox, "F");

  // borda
  doc.setDrawColor(...(config?.bordaPlaca || [196, 196, 196]));
  doc.setLineWidth(0.5);
  doc.rect(margemX, posY, larguraUtil, alturaBox);

  // 🔥 PADDING PADRÃO (aqui está o segredo)
  const paddingHorizontal = 20;

  let fontSize = totalPorPagina >= 5 ? 44 : totalPorPagina === 4 ? 50 : 58;

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...(config?.corTexto || [65, 74, 95]));
  doc.setFontSize(fontSize);

  let linhas = doc.splitTextToSize(nomePlaca, larguraUtil - paddingHorizontal * 2);

  // limita a 2 linhas
  while (linhas.length > 2 && fontSize > 20) {
    fontSize -= 2;
    doc.setFontSize(fontSize);
    linhas = doc.splitTextToSize(nomePlaca, larguraUtil - paddingHorizontal * 2);
  }

  if (linhas.length > 2) {
    linhas = linhas.slice(0, 2);
  }

  // 🔥 CENTRALIZAÇÃO REAL DO BLOCO
  const lineHeight = fontSize * 0.4;
  const blocoAltura = linhas.length * lineHeight;

  const centroY = posY + alturaBox / 2;

  let yTexto = centroY - blocoAltura / 2 + lineHeight * 0.8;

  linhas.forEach((linha) => {
    doc.text(linha, larguraPagina / 2, yTexto, {
      align: "center",
    });
    yTexto += lineHeight;
  });
};
const formatarDataPlaca = (dataIso = "") => {
  if (!dataIso) return "";
  const [ano, mes, dia] = String(dataIso).split("-");
  return `${dia}/${mes}/${ano}`;
};

const desenharCabecalhoPadraoPlaca = ({ doc, voo, config, logoDataUrl }) => {
  const largura = doc.internal.pageSize.getWidth();
  const altura = doc.internal.pageSize.getHeight();

  const margemX = 14;
  const larguraUtil = largura - margemX * 2;

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, largura, altura, "F");

  if (config?.mostrarLogoNasPlacas && logoDataUrl) {
    try {
      const props = doc.getImageProperties(logoDataUrl);
      const larguraOriginal = props?.width || 1;
      const alturaOriginal = props?.height || 1;
      const formato = String(
        props?.fileType || props?.format || "PNG",
      ).toUpperCase();

      const proporcao = larguraOriginal / alturaOriginal;

      const larguraMax = 25;
      const alturaMax = 25;

      let larguraFinal = larguraMax;
      let alturaFinal = larguraFinal / proporcao;

      if (alturaFinal > alturaMax) {
        alturaFinal = alturaMax;
        larguraFinal = alturaFinal * proporcao;
      }

      const xLogo = margemX + 1;
      const yLogo = 8;

      doc.addImage(
        logoDataUrl,
        formato,
        xLogo,
        yLogo,
        larguraFinal,
        alturaFinal,
      );
    } catch (error) {
      console.error("Erro ao desenhar logo:", error);
    }
  }

  doc.setTextColor(...(config?.corTitulo || [65, 74, 95]));
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("LUCK RECEPTIVO", margemX + 22, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("Base SSA", margemX + 22, 25);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("VOO", largura - 48, 13);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(30);
  doc.text(extrairTextoVooPlaca(voo), largura - 18, 28, {
    align: "right",
  });

  doc.setDrawColor(...(config?.linhaDivisoria || [90, 90, 90]));
  doc.setLineWidth(0.8);
  doc.line(margemX, 34, largura - margemX, 34);

  return {
    largura,
    altura,
    margemX,
    larguraUtil,
  };
};

const desenharRodapePadraoPlaca = ({ doc, data, config }) => {
  const largura = doc.internal.pageSize.getWidth();
  const altura = doc.internal.pageSize.getHeight();
  const margemX = 14;

  doc.setDrawColor(...(config?.linhaDivisoria || [90, 90, 90]));
  doc.setLineWidth(0.8);
  doc.line(margemX, altura - 14, largura - margemX, altura - 14);

  doc.setTextColor(...(config?.corData || [90, 90, 90]));
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("Operacional • Luck Receptivo", margemX, altura - 9);
  doc.text(`Data: ${formatarDataPlaca(data)}`, margemX, altura - 4);
};

export default function PainelOperacionalUnificado() {
  const [abaAtiva, setAbaAtiva] = useState(ABAS.CHEGADAS);
  const [dataSelecionada, setDataSelecionada] = useState(getHojeIso());

  const [loadingInicial, setLoadingInicial] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState("");
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState(null);

  const [itensChegadas, setItensChegadas] = useState([]);
  const [itensOuts, setItensOuts] = useState([]);
  const [itensGuias, setItensGuias] = useState([]);

  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroEscala, setFiltroEscala] = useState("todos");
  const [voosExpandidos, setVoosExpandidos] = useState({});

  const [filtroVeiculo, setFiltroVeiculo] = useState("todos");
  const [gruposExpandidosOut, setGruposExpandidosOut] = useState({});

  const [filtroGuia, setFiltroGuia] = useState("todos");
  const [gruposExpandidosGuia, setGruposExpandidosGuia] = useState({});

  const [copiado, setCopiado] = useState(false);
  const [configPlacas, setConfigPlacas] = useState(() => {
    try {
      const salvo = localStorage.getItem("painel_operacional_config_placas");
      return salvo
        ? { ...JSON.parse(salvo), logoUrl: logoLuck }
        : {
          repetirCabecalhoVooAoQuebrarPagina: true,
          mostrarLogoNasPlacas: true,
          quantidadePorPaginaColecao: 5,
          fundoPlaca: [255, 255, 255],
          fundoHeader: [238, 238, 238],
          bordaPlaca: [196, 196, 196],
          linhaDivisoria: [90, 90, 90],
          corTitulo: [65, 74, 95],
          corTexto: [65, 74, 95],
          corDestaque: [65, 74, 95],
          corData: [90, 90, 90],
        };
    } catch {
      return {
        repetirCabecalhoVooAoQuebrarPagina: true,
        mostrarLogoNasPlacas: true,
        quantidadePorPaginaColecao: 5,
        fundoPlaca: [255, 255, 255],
        fundoHeader: [238, 238, 238],
        bordaPlaca: [196, 196, 196],
        linhaDivisoria: [90, 90, 90],
        corTitulo: [65, 74, 95],
        corTexto: [65, 74, 95],
        corDestaque: [65, 74, 95],
        corData: [90, 90, 90],
      };
    }
  });

  const carregando = loadingInicial || atualizando;

  const carregarDados = async (aba = abaAtiva, manual = false) => {
    try {
      if (manual) setAtualizando(true);
      else setLoadingInicial(true);

      setErro("");

      if (aba === ABAS.CHEGADAS) {
        const response = await fetch(montarUrlApi(dataSelecionada, 1), {
          method: "GET",
          headers: { Accept: "application/json" },
        });

        if (!response.ok) {
          throw new Error(`Erro HTTP ${response.status}`);
        }

        const json = await response.json();
        setItensChegadas(extrairListaResposta(json));
      } else if (aba === ABAS.OUTS) {
        const [responseOuts, responseTransfers] = await Promise.all([
          fetch(montarUrlApi(dataSelecionada, 2), {
            method: "GET",
            headers: { Accept: "application/json" },
          }),
          fetch(montarUrlApi(dataSelecionada, 4), {
            method: "GET",
            headers: { Accept: "application/json" },
          }),
        ]);

        if (!responseOuts.ok) {
          throw new Error(`Erro HTTP ${responseOuts.status} ao carregar OUTs`);
        }

        if (!responseTransfers.ok) {
          throw new Error(
            `Erro HTTP ${responseTransfers.status} ao carregar Transfers`,
          );
        }

        const [jsonOuts, jsonTransfers] = await Promise.all([
          responseOuts.json(),
          responseTransfers.json(),
        ]);

        const listaOuts = extrairListaResposta(jsonOuts).map((item) => ({
          ...item,
          __tipoPainel: "OUT",
          __dataMapa: dataSelecionada,
        }));

        const listaTransfers = extrairListaResposta(jsonTransfers).map(
          (item) => ({
            ...item,
            __tipoPainel: "TRANSFER",
            __dataMapa: dataSelecionada,
          }),
        );

        setItensOuts([...listaOuts, ...listaTransfers]);
      } else {
        const response = await fetch(montarUrlApi(dataSelecionada, null), {
          method: "GET",
          headers: { Accept: "application/json" },
        });

        if (!response.ok) {
          throw new Error(`Erro HTTP ${response.status}`);
        }

        const json = await response.json();
        setItensGuias(extrairListaResposta(json));
      }

      setUltimaAtualizacao(new Date());
    } catch (err) {
      console.error("Erro ao carregar dados:", err);
      setErro("Não foi possível carregar os dados da API.");
    } finally {
      setLoadingInicial(false);
      setAtualizando(false);
    }
  };

  useEffect(() => {
    localStorage.setItem(
      "painel_operacional_config_placas",
      JSON.stringify(configPlacas),
    );
  }, [configPlacas]);

  useEffect(() => {
    carregarDados(abaAtiva, false);
  }, [abaAtiva, dataSelecionada]);

  const voosBase = useMemo(() => {
    const mapa = {};

    itensChegadas.forEach((item, index) => {
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
        resumoPax: formatarQuantidadeDetalhada(
          extrairAdultos(item),
          extrairCriancas(item),
          extrairInfantes(item),
        ),
        criancas: extrairCriancas(item),
        infantes: extrairInfantes(item),
        escalaId: extrairEscalaId(item),
        motorista: extrairMotorista(item),
        veiculo: extrairVeiculoEscalado(item),
        observacao: extrairObservacao(item),
      });
    });

    return Object.values(mapa).sort((a, b) =>
      ordenarHora(a.horarioPrevisto, b.horarioPrevisto),
    );
  }, [itensChegadas]);

  const voos = useMemo(() => {
    return voosBase.map((voo) => {
      const calculoStatus = calcularStatusVooPorHorario({
        horarioDecolagem: voo.horarioDecolagem,
        horarioPrevistoChegada: voo.horarioPrevisto,
        horarioAtualizadoChegada: voo.horarioAtualizado,
        horarioRealChegada: voo.horarioReal,
        cancelado: voo.cancelado,
        pousado: voo.pousado,
      });

      const reservasEscaladas = voo.reservas.filter(
        (reserva) => reserva.escalaId,
      );
      const reservasNaoEscaladas = voo.reservas.filter(
        (reserva) => !reserva.escalaId,
      );

      const gruposPorVeiculo = Object.values(
        reservasEscaladas.reduce((acc, reserva) => {
          const chaveVeiculo = reserva.veiculo || "Sem veículo";

          if (!acc[chaveVeiculo]) {
            acc[chaveVeiculo] = {
              veiculo: chaveVeiculo,
              motorista: reserva.motorista || "Não definido",
              reservas: [],
              totalPax: 0,
              totalReservas: 0,
              totalCriancas: 0,
              totalInfantes: 0,
            };
          }

          acc[chaveVeiculo].reservas.push(reserva);
          acc[chaveVeiculo].totalPax += Number(reserva.pax || 0);
          acc[chaveVeiculo].totalReservas += 1;
          acc[chaveVeiculo].totalCriancas += Number(reserva.criancas || 0);
          acc[chaveVeiculo].totalInfantes += Number(reserva.infantes || 0);

          if (
            (!acc[chaveVeiculo].motorista ||
              acc[chaveVeiculo].motorista === "Não definido") &&
            reserva.motorista
          ) {
            acc[chaveVeiculo].motorista = reserva.motorista;
          }

          return acc;
        }, {}),
      ).sort((a, b) =>
        String(a.veiculo).localeCompare(String(b.veiculo), "pt-BR", {
          sensitivity: "base",
        }),
      );

      const totaisNaoEscalados = somarReservas(reservasNaoEscaladas);
      const possuiReservasEscaladas = reservasEscaladas.length > 0;
      const possuiReservasNaoEscaladas = reservasNaoEscaladas.length > 0;
      const totalmenteNaoEscalado =
        reservasNaoEscaladas.length > 0 && reservasEscaladas.length === 0;

      return {
        ...voo,
        totalPax: voo.reservas.reduce((acc, r) => acc + Number(r.pax || 0), 0),
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
        gruposPorVeiculo,
        reservasNaoEscaladas,
        totaisNaoEscalados,
        possuiReservasEscaladas,
        possuiReservasNaoEscaladas,
        totalmenteNaoEscalado,
      };
    });
  }, [voosBase]);

  const voosFiltrados = useMemo(() => {
    let lista = voos;

    if (filtroStatus !== "todos")
      lista = lista.filter((v) => v.statusKey === filtroStatus);
    if (filtroEscala === "com-escaladas")
      lista = lista.filter((v) => v.possuiReservasEscaladas);
    if (filtroEscala === "com-nao-escaladas")
      lista = lista.filter((v) => v.possuiReservasNaoEscaladas);
    if (filtroEscala === "somente-nao-escalados")
      lista = lista.filter((v) => v.totalmenteNaoEscalado);

    return lista.sort((a, b) =>
      ordenarHora(a.horarioPrevisto, b.horarioPrevisto),
    );
  }, [voos, filtroStatus, filtroEscala]);

  const resumoChegadas = useMemo(
    () => ({
      voos: voos.length,
      reservas: voos.reduce((acc, v) => acc + v.totalReservas, 0),
      pax: voos.reduce((acc, v) => acc + v.totalPax, 0),
      alterados: voos.filter((v) =>
        [
          "atrasado",
          "antecipado",
          "cancelado",
          "pousado-atrasado",
          "pousado-antecipado",
        ].includes(v.statusKey),
      ).length,
      veiculos: new Set(
        voos.flatMap((voo) => voo.gruposPorVeiculo.map((g) => g.veiculo)),
      ).size,
    }),
    [voos],
  );

  const gruposOutBase = useMemo(() => {
    const mapa = {};

    itensOuts.forEach((item, index) => {
      const escalaId = extrairNumeroEscala(item);
      const fornecedor = extrairFornecedorNickname(item);
      const veiculo = extrairVeiculoPrincipalOut(item);
      const modalidade = extrairModalidadeServico(item);
      const tipoServico = extrairTipoOutOuTransfer(item);

      const hotelOrigem = extrairOrigem(item);
      const hotelDestino = extrairDestino(item);

      const hotelOrigemAbreviado = abreviarHotel(hotelOrigem);
      const hotelDestinoAbreviado = abreviarHotel(hotelDestino);

      const horarioApresentacao = formatarHora(extrairPresentationHour(item));
      const dataServicoReal =
        extrairDataRealServico(item) || item?.__dataMapa || "";
      const dataReserva =
        extrairDataReserva(item) || dataServicoReal || item?.__dataMapa || "";

      const contato = formatarContato(extrairContatoPax(item));
      const nomePax = extrairNomeCliente(item);
      const reservaCodigo = extrairCodigoReserva(item);
      const quantidade = extrairPax(item);
      const adultos = extrairAdultos(item);
      const criancas = extrairCriancas(item);
      const infantes = extrairInfantes(item);
      const observacao = extrairObservacao(item);
      const vooRetorno = extrairVooRetornoTexto(item);
      const dataMapa = item?.__dataMapa || dataSelecionada;

      const grupoKey = `${escalaId}__${fornecedor}__${tipoServico}__${modalidade}`;

      if (!mapa[grupoKey]) {
        mapa[grupoKey] = {
          id: grupoKey,
          escalaId,
          fornecedor,
          veiculo,
          modalidade,
          tipoServico,
          dataMapa,
          reservas: [],
        };
      }

      mapa[grupoKey].reservas.push({
        id: `${reservaCodigo}_${index}`,
        raw: item,
        reserva: reservaCodigo,
        cliente: nomePax,
        telefone: contato,
        observacao,
        vooRetorno,
        modalidade,
        tipoServico,
        pax: quantidade,
        adultos,
        criancas,
        infantes,
        hotelOrigem,
        hotelDestino,
        hotelOrigemAbreviado,
        hotelDestinoAbreviado,
        horarioHotel: horarioApresentacao,
        dataServicoReal,
        dataReserva,
      });
    });

    return Object.values(mapa)
      .map((grupo) => {
        const reservasOrdenadas = [...grupo.reservas].sort((a, b) =>
          compararDataHora(
            a.dataServicoReal,
            a.horarioHotel,
            b.dataServicoReal,
            b.horarioHotel,
          ),
        );

        const hoteisMap = {};

        reservasOrdenadas.forEach((reserva) => {
          const chaveHotel =
            grupo.tipoServico === "TRANSFER"
              ? `${reserva.dataServicoReal}__${reserva.horarioHotel}__${reserva.hotelOrigem}__${reserva.hotelDestino}`
              : `${reserva.dataServicoReal}__${reserva.horarioHotel}__${reserva.hotelOrigem}`;

          if (!hoteisMap[chaveHotel]) {
            hoteisMap[chaveHotel] = {
              id: chaveHotel,
              dataServicoReal: reserva.dataServicoReal,
              horario: reserva.horarioHotel,
              hotel:
                grupo.tipoServico === "TRANSFER"
                  ? `${reserva.hotelOrigem} → ${reserva.hotelDestino}`
                  : reserva.hotelOrigem,
              hotelOrigem: reserva.hotelOrigem,
              hotelDestino: reserva.hotelDestino,
              hotelOrigemAbreviado: reserva.hotelOrigemAbreviado,
              hotelDestinoAbreviado: reserva.hotelDestinoAbreviado,
              reservas: [],
            };
          }

          hoteisMap[chaveHotel].reservas.push(reserva);
        });

        const hoteisOrdenados = Object.values(hoteisMap)
          .map((hotel) => {
            const totais = somarPaxDetalhadoReservas(hotel.reservas);
            return {
              ...hotel,
              totalPax: totais.total,
              totalAdultos: totais.adultos,
              totalCriancas: totais.criancas,
              totalInfantes: totais.infantes,
            };
          })
          .sort((a, b) =>
            compararDataHora(
              a.dataServicoReal,
              a.horario,
              b.dataServicoReal,
              b.horario,
            ),
          );

        const totaisGrupo = somarPaxDetalhadoReservas(reservasOrdenadas);

        const dataServicoRealPrincipal =
          hoteisOrdenados[0]?.dataServicoReal ||
          reservasOrdenadas[0]?.dataServicoReal ||
          grupo.dataMapa ||
          "";

        const primeiroHorario =
          hoteisOrdenados[0]?.horario ||
          reservasOrdenadas[0]?.horarioHotel ||
          "--:--";

        const origensUnicasAbreviadas = [
          ...new Set(
            reservasOrdenadas
              .map((item) => item.hotelOrigemAbreviado)
              .filter(Boolean),
          ),
        ];

        const destinosUnicosAbreviados = [
          ...new Set(
            reservasOrdenadas
              .map((item) => item.hotelDestinoAbreviado)
              .filter(Boolean),
          ),
        ];

        return {
          ...grupo,
          reservas: reservasOrdenadas,
          hoteis: hoteisOrdenados,
          hoteisOrdenados,
          hotelPrincipal:
            grupo.tipoServico === "TRANSFER"
              ? `${hoteisOrdenados[0]?.hotelOrigemAbreviado || "Origem"} → ${hoteisOrdenados[0]?.hotelDestinoAbreviado || "Destino"}`
              : hoteisOrdenados[0]?.hotelOrigemAbreviado ||
              "Hotel não informado",
          primeiroHorario,
          dataServicoReal: dataServicoRealPrincipal,
          totalReservas: reservasOrdenadas.length,
          totalPax: totaisGrupo.total,
          totalAdultos: totaisGrupo.adultos,
          totalCriancas: totaisGrupo.criancas,
          totalInfantes: totaisGrupo.infantes,
          origensUnicasAbreviadas,
          // destinosUnicosAbreviadas,
          alertaServicoHoje: getBadgeAlertaServicoHoje(
            { dataServicoReal: dataServicoRealPrincipal },
            grupo.dataMapa,
          ),
        };
      })
      .sort((a, b) =>
        compararDataHora(
          a.dataServicoReal,
          a.primeiroHorario,
          b.dataServicoReal,
          b.primeiroHorario,
        ),
      );
  }, [itensOuts, dataSelecionada]);

  const veiculosDisponiveis = useMemo(
    () =>
      [...new Set(gruposOutBase.map((item) => item.veiculo))].sort((a, b) =>
        String(a).localeCompare(String(b), "pt-BR", { sensitivity: "base" }),
      ),
    [gruposOutBase],
  );

  const gruposOutFiltrados = useMemo(() => {
    let lista = gruposOutBase;

    if (filtroVeiculo !== "todos") {
      lista = lista.filter((grupo) => grupo.veiculo === filtroVeiculo);
    }

    return [...lista].sort((a, b) =>
      compararDataHora(
        a.dataServicoReal,
        a.primeiroHorario,
        b.dataServicoReal,
        b.primeiroHorario,
      ),
    );
  }, [gruposOutBase, filtroVeiculo]);

  const gruposGuiasBase = useMemo(() => {
    const somenteComGuia = itensGuias.filter((item) => {
      const guia = extrairGuiaEscalado(item);
      return String(guia || "").trim();
    });

    const mapaGuias = {};

    somenteComGuia.forEach((item, index) => {
      const guia = extrairGuiaEscalado(item);
      const passeio = extrairNomePasseio(item);
      const veiculo = extrairVeiculoGuia(item);
      const fornecedor = extrairFornecedor(item);

      if (!mapaGuias[guia]) {
        mapaGuias[guia] = {
          id: guia,
          guia,
          passeiosMap: {},
        };
      }

      if (!mapaGuias[guia].passeiosMap[passeio]) {
        mapaGuias[guia].passeiosMap[passeio] = {
          passeio,
          veiculosMap: {},
        };
      }

      if (!mapaGuias[guia].passeiosMap[passeio].veiculosMap[veiculo]) {
        mapaGuias[guia].passeiosMap[passeio].veiculosMap[veiculo] = {
          veiculo,
          fornecedor,
          reservas: [],
        };
      }

      mapaGuias[guia].passeiosMap[passeio].veiculosMap[veiculo].reservas.push({
        id: `${extrairCodigoReserva(item)}_${index}`,
        nomePax: extrairNomeCliente(item),
        numeroReserva: extrairCodigoReserva(item),
        quantidade:
          extrairAdultos(item) + extrairCriancas(item) + extrairInfantes(item),
        quantidadeDetalhada: formatarQuantidadeDetalhada(
          extrairAdultos(item),
          extrairCriancas(item),
          extrairInfantes(item),
        ),
        hotel: extrairHotel(item),
        horarioApresentacao: extrairHorarioApresentacao(item),
        contato: formatarContato(extrairContatoPax(item)),
        observacao: extrairObservacao(item),
      });
    });

    return Object.values(mapaGuias)
      .map((grupo) => {
        const passeios = Object.values(grupo.passeiosMap)
          .map((passeioItem) => {
            const veiculos = Object.values(passeioItem.veiculosMap)
              .map((veiculoItem) => ({
                ...veiculoItem,
                totalPax: veiculoItem.reservas.reduce(
                  (acc, reserva) => acc + Number(reserva.quantidade || 0),
                  0,
                ),
                totalReservas: veiculoItem.reservas.length,
                primeiraHora:
                  veiculoItem.reservas
                    .map((r) => r.horarioApresentacao)
                    .sort(ordenarHora)[0] || "--:--",
              }))
              .sort((a, b) => {
                if (b.totalPax !== a.totalPax) return b.totalPax - a.totalPax;
                return ordenarHora(a.primeiraHora, b.primeiraHora);
              });

            const totalPaxPasseio = veiculos.reduce(
              (acc, v) => acc + v.totalPax,
              0,
            );
            const totalReservasPasseio = veiculos.reduce(
              (acc, v) => acc + v.totalReservas,
              0,
            );

            return {
              passeio: passeioItem.passeio,
              veiculos,
              totalPaxPasseio,
              totalReservasPasseio,
              totalVeiculos: veiculos.length,
              primeiraHoraPasseio:
                veiculos.map((v) => v.primeiraHora).sort(ordenarHora)[0] ||
                "--:--",
              pontoDeApoio: obterPontoDeApoio(passeioItem.passeio),
            };
          })
          .sort((a, b) => {
            const horaCompare = ordenarHora(
              a.primeiraHoraPasseio,
              b.primeiraHoraPasseio,
            );
            if (horaCompare !== 0) return horaCompare;
            return String(a.passeio).localeCompare(String(b.passeio), "pt-BR");
          });

        const passeiosNomes = passeios.map((p) => p.passeio);
        const totalVeiculosUtilizados = new Set(
          passeios.flatMap((p) => p.veiculos.map((v) => v.veiculo)),
        ).size;

        return {
          ...grupo,
          passeios,
          passeiosNomes,
          passeiosResumo: passeiosNomes.join(" | "),
          totalPasseios: passeios.length,
          totalVeiculosUtilizados,
          totalPax: passeios.reduce((acc, p) => acc + p.totalPaxPasseio, 0),
          totalReservas: passeios.reduce(
            (acc, p) => acc + p.totalReservasPasseio,
            0,
          ),
        };
      })
      .sort((a, b) => String(a.guia).localeCompare(String(b.guia), "pt-BR"));
  }, [itensGuias]);

  const guiasDisponiveis = useMemo(
    () => gruposGuiasBase.map((item) => item.guia),
    [gruposGuiasBase],
  );

  const gruposGuiasFiltrados = useMemo(() => {
    if (filtroGuia === "todos") return gruposGuiasBase;
    return gruposGuiasBase.filter((item) => item.guia === filtroGuia);
  }, [gruposGuiasBase, filtroGuia]);

  const resumoGuias = useMemo(
    () => ({
      guias: gruposGuiasBase.length,
      veiculos: new Set(
        gruposGuiasBase.flatMap((item) =>
          item.passeios.flatMap((passeio) =>
            passeio.veiculos.map((veiculo) => veiculo.veiculo),
          ),
        ),
      ).size,
      pax: gruposGuiasBase.reduce((acc, item) => acc + item.totalPax, 0),
      reservas: gruposGuiasBase.reduce(
        (acc, item) => acc + item.totalReservas,
        0,
      ),
    }),
    [gruposGuiasBase],
  );

  const formatarNomeVeiculo = (nome) => {
    if (!nome) return "-";

    const nomeBase = String(nome).split("-")[0].trim();
    const partes = nomeBase.split(/\s+/).filter(Boolean);

    return partes.slice(0, 2).join(" ").toUpperCase();
  };

  const formatarNomeGuia = (nome) => {
    if (!nome) return "-";

    return String(nome)
      .replace(/\s*-\s*GUIA\s*$/i, "")
      .trim()
      .toUpperCase();
  };

  const formatarNomePasseio = (nome) => {
    if (!nome) return "-";
    return String(nome).trim().toUpperCase();
  };

  const formatarTextoApoio = (texto) => {
    if (!texto) return "";
    return String(texto).trim().toUpperCase();
  };

  const montarResumoTexto = () => {
    const linhas = [
      `LISTA DE PASSEIOS: ${formatarDataBr(dataSelecionada)}`,
      "",
    ];

    gruposGuiasFiltrados.forEach((grupo) => {
      grupo.passeios.forEach((passeio) => {
        if (deveIgnorarServico(passeio.passeio)) return;

        const veiculosOrdenados = [...(passeio.veiculos || [])].sort((a, b) => {
          if ((b.totalPax || 0) !== (a.totalPax || 0)) {
            return (b.totalPax || 0) - (a.totalPax || 0);
          }
          return ordenarHora(a.primeiraHora, b.primeiraHora);
        });

        const veiculoPrincipal = formatarNomeVeiculo(
          veiculosOrdenados[0]?.veiculo,
        );

        const veiculoApoio =
          veiculosOrdenados.length > 1
            ? formatarNomeVeiculo(
              veiculosOrdenados[veiculosOrdenados.length - 1]?.veiculo,
            )
            : "";

        const pontoDeApoio = formatarTextoApoio(passeio.pontoDeApoio);
        const nomePasseio = formatarNomePasseio(passeio.passeio);
        const nomeGuia = formatarNomeGuia(grupo.guia);

        linhas.push(`*${nomePasseio}*`);
        linhas.push(`GUIA: ${nomeGuia}`);
        linhas.push(`PAX: ${passeio.totalPaxPasseio || 0}`);

        linesPushIfValue(
          linhas,
          `VEÍCULO PRINCIPAL: ${veiculoPrincipal}`,
          veiculoPrincipal && veiculoPrincipal !== "-",
        );

        linesPushIfValue(
          linhas,
          `VEÍCULO DE APOIO: ${veiculoApoio}`,
          veiculoApoio && veiculoApoio !== "-",
        );

        linesPushIfValue(
          linhas,
          `PONTO DE APOIO: ${pontoDeApoio}`,
          pontoDeApoio,
        );

        linhas.push("");
        linhas.push("");
      });
    });

    linhas.push("PONTOS DE APOIO INFORMADOS!🍀");

    return linhas.join("\n").trim();
  };

  const copiarResumo = async () => {
    try {
      await navigator.clipboard.writeText(montarResumoTexto());
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch (error) {
      console.error("Erro ao copiar resumo:", error);
      alert("Não foi possível copiar o resumo.");
    }
  };

  const toggleExpandirVoo = (codigoVoo) => {
    setVoosExpandidos((prev) => ({ ...prev, [codigoVoo]: !prev[codigoVoo] }));
  };

  const toggleExpandirGrupoOut = (grupoId) => {
    setGruposExpandidosOut((prev) => ({ ...prev, [grupoId]: !prev[grupoId] }));
  };

  const toggleExpandirGrupoGuia = (grupoId) => {
    setGruposExpandidosGuia((prev) => ({ ...prev, [grupoId]: !prev[grupoId] }));
  };

  const gerarPdfPlacasIndividuais = async (voo) => {
    try {
      if (!voo?.reservas?.length) return;

      const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });

      const logoDataUrl = await carregarImagemComoDataURL(logoLuck);

      voo.reservas.forEach((reserva, index) => {
        if (index > 0) doc.addPage();

        desenharPlacaIndividual({
          doc,
          reserva,
          voo: voo.voo,
          data: dataSelecionada,
          config: configPlacas,
          logoDataUrl,
        });
      });

      doc.save(
        `placas-individuais-${String(voo.voo || "voo").replace(/\s+/g, "-")}.pdf`,
      );
    } catch (error) {
      console.error("Erro ao gerar PDF individual:", error);
      alert("Não foi possível gerar o PDF das placas individuais.");
    }
  };

  const gerarPdfPlacasColecao = async (voo) => {
    try {
      if (!voo?.reservas?.length) return;

      const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });

      const logoDataUrl = await carregarImagemComoDataURL(logoLuck);
      const porPagina = Number(configPlacas?.quantidadePorPaginaColecao || 5);
      const inicioYBase = 44;

      voo.reservas.forEach((reserva, index) => {
        const indiceNaPagina = index % porPagina;
        const novaPagina = index > 0 && indiceNaPagina === 0;

        if (novaPagina) {
          doc.addPage();
        }

        if (
          indiceNaPagina === 0 &&
          (index === 0 || configPlacas.repetirCabecalhoVooAoQuebrarPagina)
        ) {
          desenharCabecalhoColecao({
            doc,
            voo: voo.voo,
            data: dataSelecionada,
            config: configPlacas,
            logoDataUrl,
          });

          desenharRodapePadraoPlaca({
            doc,
            data: dataSelecionada,
            config: configPlacas,
          });
        }

        desenharItemColecao({
          doc,
          nome: reserva?.cliente || "-",
          indice: indiceNaPagina,
          inicioY: inicioYBase,
          totalPorPagina: porPagina,
          config: configPlacas,
        });
      });

      doc.save(
        `placas-colecao-${String(voo.voo || "voo").replace(/\s+/g, "-")}.pdf`,
      );
    } catch (error) {
      console.error("Erro ao gerar PDF coleção:", error);
      alert("Não foi possível gerar o PDF da coleção de placas.");
    }
  };

  return (
    <div className="painel-chegadas-page">
      <div className="painel-chegadas-top-status">
        {carregando && (
          <>
            <SyncRounded className="spin" fontSize="small" />
            <span>Atualizando...</span>
          </>
        )}
      </div>

      <div className="painel-chegadas-header">
        <div>
          <h2 className="painel-chegadas-title">
            <AssignmentRounded fontSize="small" />
            Painel Operacional
          </h2>
          <p className="painel-chegadas-subtitle">
            Componente único com navegação entre Chegadas, OUT's e Passeios.
          </p>
        </div>
      </div>

      <div className="painel-chegadas-grid">
        <div className="painel-chegadas-card painel-chegadas-tabs-card">
          <div className="painel-chegadas-card-header">
            <div className="painel-chegadas-card-title-row">
              <h3>Navegação</h3>
              <span className="painel-chegadas-badge">painel unificado</span>
            </div>
            <p>Alterne entre Chegadas, OUT's e Passeios no mesmo ambiente.</p>
          </div>

          <div className="painel-chegadas-tabs">
            <button
              type="button"
              className={`painel-chegadas-tab ${abaAtiva === ABAS.CHEGADAS ? "active" : ""}`}
              onClick={() => setAbaAtiva(ABAS.CHEGADAS)}
              disabled={carregando}
            >
              <FlightLandRounded fontSize="small" />
              Chegadas
            </button>

            <button
              type="button"
              className={`painel-chegadas-tab ${abaAtiva === ABAS.OUTS ? "active" : ""}`}
              onClick={() => setAbaAtiva(ABAS.OUTS)}
              disabled={carregando}
            >
              <FlightTakeoffRounded fontSize="small" />
              OUT's
            </button>

            <button
              type="button"
              className={`painel-chegadas-tab ${abaAtiva === ABAS.GUIAS ? "active" : ""}`}
              onClick={() => setAbaAtiva(ABAS.GUIAS)}
              disabled={carregando}
            >
              <TourRounded fontSize="small" />
              Passeios
            </button>
          </div>
        </div>

        <div className="painel-chegadas-card painel-chegadas-card-large">
          <div className="painel-chegadas-card-header">
            <div className="painel-chegadas-card-title-row">
              <h3>Parâmetros</h3>
              <span className="painel-chegadas-badge">
                {formatarDataBr(dataSelecionada)}
              </span>
            </div>
            <p>
              Selecione a data operacional e atualize a leitura da aba atual.
            </p>
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
                disabled={carregando}
              />
            </div>

            {abaAtiva === ABAS.CHEGADAS && (
              <>
                <div className="painel-chegadas-field">
                  <label>
                    <FilterAltRounded fontSize="small" />
                    Filtrar status do voo
                  </label>
                  <select
                    className="painel-chegadas-input"
                    value={filtroStatus}
                    onChange={(e) => setFiltroStatus(e.target.value)}
                    disabled={carregando}
                  >
                    <option value="todos">Todos</option>
                    <option value="programado">Programado</option>
                    <option value="no-horario">No horário</option>
                    <option value="atrasado">Atrasado</option>
                    <option value="antecipado">Antecipado</option>
                    <option value="cancelado">Cancelado</option>
                    <option value="pousado">Pousado</option>
                    <option value="pousado-atrasado">Pousado com atraso</option>
                    <option value="pousado-antecipado">
                      Pousado antecipado
                    </option>
                    <option value="sem-info">Sem informação</option>
                  </select>
                </div>

                <div className="painel-chegadas-field">
                  <label>
                    <FilterAltRounded fontSize="small" />
                    Filtrar escala
                  </label>
                  <select
                    className="painel-chegadas-input"
                    value={filtroEscala}
                    onChange={(e) => setFiltroEscala(e.target.value)}
                    disabled={carregando}
                  >
                    <option value="todos">Todos</option>
                    <option value="com-escaladas">
                      Com reservas escaladas
                    </option>
                    <option value="com-nao-escaladas">
                      Com reservas não escaladas
                    </option>
                    <option value="somente-nao-escalados">
                      Somente totalmente não escalados
                    </option>
                  </select>
                </div>
              </>
            )}

            {/* {abaAtiva === ABAS.OUTS && (
              <>
       
                <div className="painel-chegadas-card painel-chegadas-card-full">
                  <div className="painel-chegadas-card-header">
                    <div className="painel-chegadas-card-title-row">
                      <h3>Resumo do dia</h3>
                      <span className="painel-chegadas-badge">
                        outs + transfers
                      </span>
                    </div>
                  </div>

                  <div className="painel-chegadas-kpis">
                    <div className="painel-chegadas-kpi">
                      <div className="painel-chegadas-kpi-icon">
                        <DirectionsBusRounded fontSize="small" />
                      </div>
                      <div>
                        <span>Grupos</span>
                        <strong>
                          {carregando ? (
                            <SyncRounded className="spin" fontSize="small" />
                          ) : (
                            gruposOutBase.length
                          )}
                        </strong>
                      </div>
                    </div>

                    <div className="painel-chegadas-kpi">
                      <div className="painel-chegadas-kpi-icon">
                        <FlightTakeoffRounded fontSize="small" />
                      </div>
                      <div>
                        <span>OUTs</span>
                        <strong>
                          {carregando ? (
                            <SyncRounded className="spin" fontSize="small" />
                          ) : (
                            gruposOutBase.filter((g) => g.tipoServico === "OUT")
                              .length
                          )}
                        </strong>
                      </div>
                    </div>

                    <div className="painel-chegadas-kpi">
                      <div className="painel-chegadas-kpi-icon">
                        <DirectionsBusRounded fontSize="small" />
                      </div>
                      <div>
                        <span>Transfers</span>
                        <strong>
                          {carregando ? (
                            <SyncRounded className="spin" fontSize="small" />
                          ) : (
                            gruposOutBase.filter(
                              (g) => g.tipoServico === "TRANSFER",
                            ).length
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
                          {carregando ? (
                            <SyncRounded className="spin" fontSize="small" />
                          ) : (
                            gruposOutBase.reduce(
                              (acc, g) => acc + g.totalReservas,
                              0,
                            )
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
                          {carregando ? (
                            <SyncRounded className="spin" fontSize="small" />
                          ) : (
                            gruposOutBase.reduce(
                              (acc, g) => acc + g.totalPax,
                              0,
                            )
                          )}
                        </strong>
                      </div>
                    </div>

                    <div className="painel-chegadas-kpi">
                      <div className="painel-chegadas-kpi-icon">
                        <HotelRounded fontSize="small" />
                      </div>
                      <div>
                        <span>Hotéis</span>
                        <strong>
                          {carregando ? (
                            <SyncRounded className="spin" fontSize="small" />
                          ) : (
                            gruposOutBase.reduce(
                              (acc, g) => acc + g.hoteis.length,
                              0,
                            )
                          )}
                        </strong>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="painel-chegadas-card painel-chegadas-card-full">
                  <div className="painel-chegadas-card-header">
                    <div className="painel-chegadas-card-title-row">
                      <h3>
                        Mapa de OUT + Transfer -{" "}
                        <span className="painel-chegadas-badge">
                          {formatarDataBr(dataSelecionada)}
                        </span>
                      </h3>
                      <span className="painel-chegadas-badge">
                        {gruposOutFiltrados.length} grupo(s)
                      </span>
                    </div>
                  </div>

                  <div className="painel-chegadas-panel-body">
                    {carregando ? (
                      <div className="painel-chegadas-inline-loading">
                        <SyncRounded className="spin" fontSize="small" />
                        <span>Atualizando serviços do dia...</span>
                      </div>
                    ) : !gruposOutFiltrados.length ? (
                      <div className="painel-chegadas-inline-empty">
                        <WarningAmberRounded fontSize="small" />
                        <span>
                          Nenhum grupo encontrado para a data selecionada.
                        </span>
                      </div>
                    ) : (
                      <div className="painel-chegadas-list">
                        {gruposOutFiltrados.map((grupo) => {
                          const expandido = !!gruposExpandidosOut[grupo.id];

                          return (
                            <div
                              className="painel-chegadas-flight-card"
                              key={grupo.id}
                            >
                              <div className="painel-chegadas-flight-top">
                                <div
                                  className="painel-chegadas-flight-top-trigger"
                                  role="button"
                                  tabIndex={0}
                                  onClick={() =>
                                    toggleExpandirGrupoOut(grupo.id)
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      toggleExpandirGrupoOut(grupo.id);
                                    }
                                  }}
                                >
                                  <div className="painel-chegadas-flight-main">
                                    <div className="painel-chegadas-flight-code-wrap">
                                      <strong className="painel-chegadas-flight-code">
                                        {grupo.tipoServico} -{" "}
                                        {grupo.hotelPrincipal}
                                      </strong>

                                      {grupo.alertaServicoHoje && (
                                        <span className="painel-chegadas-status atrasado">
                                          O SERVIÇO SERÁ REALIZADO HOJE
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="painel-chegadas-flight-meta">
                                    <span>
                                      Data:{" "}
                                      {formatarDataBr(grupo.dataServicoReal)}
                                    </span>
                                    <span>Hora: {grupo.primeiroHorario}</span>
                                    <span>Escala: {grupo.escalaId}</span>
                                    <span>Fornecedor: {grupo.fornecedor}</span>
                                    <span>Modalidade: {grupo.modalidade}</span>
                                    <span>
                                      Pax:{" "}
                                      {formatarQuantidadeDetalhada(
                                        grupo.totalAdultos,
                                        grupo.totalCriancas,
                                        grupo.totalInfantes,
                                      )}
                                    </span>
                                  </div>

                                  <div className="painel-chegadas-expand-icon">
                                    {expandido ? (
                                      <KeyboardArrowUpRounded fontSize="small" />
                                    ) : (
                                      <KeyboardArrowDownRounded fontSize="small" />
                                    )}
                                  </div>
                                </div>

                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    flexWrap: "wrap",
                                    marginTop: 10,
                                  }}
                                >
                                  <button
                                    type="button"
                                    className="painel-chegadas-google-btn"
                                    onClick={async () => {
                                      const ok =
                                        await copiarMonitoramentoGrupo(grupo);
                                      if (ok) {
                                        setCopiado(true);
                                        setTimeout(
                                          () => setCopiado(false),
                                          1800,
                                        );
                                      }
                                    }}
                                  >
                                    {copiado ? (
                                      <CheckRounded fontSize="small" />
                                    ) : (
                                      <ContentCopyRounded fontSize="small" />
                                    )}
                                    Copiar monitoramento
                                  </button>
                                </div>
                              </div>

                              {expandido && (
                                <div className="painel-chegadas-flight-expanded">
                                  {grupo.hoteisOrdenados.map(
                                    (hotel, hotelIndex) => (
                                      <div
                                        key={hotel.id}
                                        className="painel-chegadas-driver-block"
                                      >
                                        <div className="painel-chegadas-driver-header">
                                          <div className="painel-chegadas-driver-title">
                                            <HotelRounded fontSize="small" />
                                            <strong>
                                              {grupo.tipoServico === "TRANSFER"
                                                ? `${hotel.hotelOrigemAbreviado} → ${hotel.hotelDestinoAbreviado}`
                                                : `${grupo.hoteisOrdenados.length > 1 ? `Origem ${hotelIndex + 1}: ` : ""}${hotel.hotelOrigemAbreviado}`}
                                            </strong>
                                          </div>

                                          <div className="painel-chegadas-driver-meta">
                                            <span>
                                              Data:{" "}
                                              {formatarDataBr(
                                                hotel.dataServicoReal,
                                              )}
                                            </span>
                                            <span>Hora: {hotel.horario}</span>
                                            <span>
                                              Tipo: {grupo.tipoServico}
                                            </span>
                                            <span>
                                              Modalidade: {grupo.modalidade}
                                            </span>
                                            <span>
                                              Pax:{" "}
                                              {formatarQuantidadeDetalhada(
                                                hotel.totalAdultos,
                                                hotel.totalCriancas,
                                                hotel.totalInfantes,
                                              )}
                                            </span>
                                          </div>
                                        </div>

                                        <div className="painel-chegadas-table-wrap">
                                          <table className="painel-chegadas-table">
                                            <thead>
                                              <tr>
                                                <th>Data</th>
                                                <th>Hora</th>
                                                <th>Reserva</th>
                                                <th>Contato</th>
                                                <th>Nome do Pax</th>
                                                <th>Qtd. Pax</th>
                                                <th>Origem</th>
                                                {grupo.tipoServico ===
                                                  "TRANSFER" && (
                                                  <th>Destino</th>
                                                )}
                                                <th>Voo Retorno</th>
                                                <th>Modalidade</th>
                                                <th>Buscar</th>
                                                <th>OBS</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {hotel.reservas.map((reserva) => (
                                                <tr key={reserva.id}>
                                                  <td>
                                                    {formatarDataBr(
                                                      reserva.dataServicoReal,
                                                    )}
                                                  </td>
                                                  <td>
                                                    {reserva.horarioHotel}
                                                  </td>
                                                  <td>{reserva.reserva}</td>
                                                  <td>{reserva.telefone}</td>
                                                  <td>{reserva.cliente}</td>
                                                  <td>
                                                    {formatarQuantidadeDetalhada(
                                                      reserva.adultos,
                                                      reserva.criancas,
                                                      reserva.infantes,
                                                    )}
                                                  </td>
                                                  <td>
                                                    {
                                                      reserva.hotelOrigemAbreviado
                                                    }
                                                  </td>
                                                  {grupo.tipoServico ===
                                                    "TRANSFER" && (
                                                    <td>
                                                      {
                                                        reserva.hotelDestinoAbreviado
                                                      }
                                                    </td>
                                                  )}
                                                  <td>{reserva.vooRetorno}</td>
                                                  <td>{reserva.modalidade}</td>
                                                  <td>
                                                    <button
                                                      type="button"
                                                      className="painel-chegadas-google-btn"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        abrirBuscaVooPratica(
                                                          reserva.raw,
                                                        );
                                                      }}
                                                    >
                                                      <SearchRounded fontSize="small" />
                                                      Buscar voo
                                                    </button>
                                                  </td>
                                                  <td>
                                                    {reserva.observacao || "-"}
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>
                                    ),
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )} */}

            {abaAtiva === ABAS.GUIAS && (
              <div className="painel-chegadas-field">
                <label>
                  <FilterAltRounded fontSize="small" />
                  Filtrar guia
                </label>
                <select
                  className="painel-chegadas-input"
                  value={filtroGuia}
                  onChange={(e) => setFiltroGuia(e.target.value)}
                  disabled={carregando}
                >
                  <option value="todos">Todos</option>
                  {guiasDisponiveis.map((guia) => (
                    <option key={guia} value={guia}>
                      {guia}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="painel-chegadas-actions">
              <button
                type="button"
                className="painel-chegadas-btn-primary"
                onClick={() => carregarDados(abaAtiva, true)}
                disabled={carregando}
              >
                <RefreshRounded
                  fontSize="small"
                  className={atualizando ? "spin" : ""}
                />
                {atualizando ? "Atualizando..." : "Atualizar"}
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
                {carregando ? (
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

        {erro ? (
          <div className="painel-chegadas-card painel-chegadas-card-full">
            <div className="painel-chegadas-empty">
              <WarningAmberRounded fontSize="small" />
              <span>{erro}</span>
            </div>
          </div>
        ) : null}

        {abaAtiva === ABAS.CHEGADAS && (
          <>
            <div className="painel-chegadas-card painel-chegadas-card-full">
              <div className="painel-chegadas-card-header">
                <div className="painel-chegadas-card painel-chegadas-card-full">
                  <div className="painel-chegadas-card-header">
                    <div className="painel-chegadas-card-title-row">
                      <h3>Configurações das placas PDF</h3>
                      <span className="painel-chegadas-badge">chegadas</span>
                    </div>
                    <p>
                      Ajuste o comportamento da impressão individual e da
                      coleção.
                    </p>
                  </div>

                  <div className="painel-chegadas-toolbar">
                    <div className="painel-chegadas-field">
                      <label>Qtd. por página na coleção</label>
                      <select
                        className="painel-chegadas-input"
                        value={configPlacas.quantidadePorPaginaColecao}
                        onChange={(e) =>
                          setConfigPlacas((prev) => ({
                            ...prev,
                            quantidadePorPaginaColecao: Number(e.target.value),
                          }))
                        }
                      >
                        <option value={2}>2</option>
                        <option value={3}>3</option>
                        <option value={4}>4</option>
                        <option value={5}>5</option>
                        <option value={6}>6</option>
                      </select>
                    </div>

                    <div className="painel-chegadas-field">
                      <label>Mostrar logo</label>
                      <select
                        className="painel-chegadas-input"
                        value={
                          configPlacas.mostrarLogoNasPlacas ? "sim" : "nao"
                        }
                        onChange={(e) =>
                          setConfigPlacas((prev) => ({
                            ...prev,
                            mostrarLogoNasPlacas: e.target.value === "sim",
                          }))
                        }
                      >
                        <option value="sim">Sim</option>
                        <option value="nao">Não</option>
                      </select>
                    </div>

                    <div className="painel-chegadas-field">
                      <label>Repetir cabeçalho do voo em nova página</label>
                      <select
                        className="painel-chegadas-input"
                        value={
                          configPlacas.repetirCabecalhoVooAoQuebrarPagina
                            ? "sim"
                            : "nao"
                        }
                        onChange={(e) =>
                          setConfigPlacas((prev) => ({
                            ...prev,
                            repetirCabecalhoVooAoQuebrarPagina:
                              e.target.value === "sim",
                          }))
                        }
                      >
                        <option value="sim">Sim</option>
                        <option value="nao">Não</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="painel-chegadas-kpis">
                <div className="painel-chegadas-kpi">
                  <div className="painel-chegadas-kpi-icon">
                    <FlightLandRounded fontSize="small" />
                  </div>
                  <div>
                    <span>Voos</span>
                    <strong>
                      {carregando ? (
                        <SyncRounded className="spin" fontSize="small" />
                      ) : (
                        resumoChegadas.voos
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
                      {carregando ? (
                        <SyncRounded className="spin" fontSize="small" />
                      ) : (
                        resumoChegadas.reservas
                      )}
                    </strong>
                  </div>
                </div>

                <div className="painel-chegadas-kpi">
                  <div className="painel-chegadas-kpi-icon">
                    <DirectionsBusRounded fontSize="small" />
                  </div>
                  <div>
                    <span>Veículos</span>
                    <strong>
                      {carregando ? (
                        <SyncRounded className="spin" fontSize="small" />
                      ) : (
                        resumoChegadas.veiculos
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
                      {carregando ? (
                        <SyncRounded className="spin" fontSize="small" />
                      ) : (
                        resumoChegadas.pax
                      )}
                    </strong>
                  </div>
                </div>

                <div className="painel-chegadas-kpi">
                  <div className="painel-chegadas-kpi-icon">
                    <WarningAmberRounded fontSize="small" />
                  </div>
                  <div>
                    <span>Alterados</span>
                    <strong>
                      {carregando ? (
                        <SyncRounded className="spin" fontSize="small" />
                      ) : (
                        resumoChegadas.alterados
                      )}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="painel-chegadas-card painel-chegadas-card-full">
              <div className="painel-chegadas-card-header">
                <div className="painel-chegadas-card-title-row">
                  <h3>Serviços do dia</h3>
                  <span className="painel-chegadas-badge">
                    {voosFiltrados.length} voo(s)
                  </span>
                </div>
              </div>

              <div className="painel-chegadas-panel-body">
                {carregando ? (
                  <div className="painel-chegadas-inline-loading">
                    <SyncRounded className="spin" fontSize="small" />
                    <span>Atualizando serviços do dia...</span>
                  </div>
                ) : !voosFiltrados.length ? (
                  <div className="painel-chegadas-inline-empty">
                    <WarningAmberRounded fontSize="small" />
                    <span>Nenhum voo encontrado para a data selecionada.</span>
                  </div>
                ) : (
                  <div className="painel-chegadas-list">
                    {voosFiltrados.map((voo) => {
                      const expandido = !!voosExpandidos[voo.vooKey];

                      return (
                        <div
                          className="painel-chegadas-flight-card"
                          key={voo.vooKey}
                        >
                          <button
                            type="button"
                            className="painel-chegadas-flight-top"
                            onClick={() => toggleExpandirVoo(voo.vooKey)}
                          >
                            <div className="painel-chegadas-flight-main">
                              <div className="painel-chegadas-flight-code-wrap">
                                <strong className="painel-chegadas-flight-code">
                                  {voo.voo}
                                </strong>
                                <span
                                  className={`painel-chegadas-status ${voo.statusKey}`}
                                >
                                  {voo.statusLabel}
                                </span>
                              </div>

                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  flexWrap: "wrap",
                                }}
                              >
                                <button
                                  type="button"
                                  className="painel-chegadas-google-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    abrirBuscaGoogleVoo(voo.voo);
                                  }}
                                >
                                  <SearchRounded fontSize="small" />
                                  Buscar voo
                                </button>

                                <button
                                  type="button"
                                  className="painel-chegadas-google-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    gerarPdfPlacasIndividuais(voo);
                                  }}
                                >
                                  <AssignmentRounded fontSize="small" />
                                  Placas individuais
                                </button>

                                <button
                                  type="button"
                                  className="painel-chegadas-google-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    gerarPdfPlacasColecao(voo);
                                  }}
                                >
                                  <Inventory2Rounded fontSize="small" />
                                  Placa coleção
                                </button>
                              </div>
                            </div>

                            <div className="painel-chegadas-flight-meta">
                              <span>
                                Previsto: {formatarHora(voo.horarioPrevisto)}
                              </span>
                              {voo.variacaoTexto ? (
                                <span>{voo.variacaoTexto}</span>
                              ) : null}
                              <span>Reservas: {voo.totalReservas}</span>
                              <span>Pax: {voo.totalPax}</span>
                            </div>

                            <div className="painel-chegadas-expand-icon">
                              {expandido ? (
                                <KeyboardArrowUpRounded fontSize="small" />
                              ) : (
                                <KeyboardArrowDownRounded fontSize="small" />
                              )}
                            </div>
                          </button>

                          {expandido && (
                            <div className="painel-chegadas-flight-expanded">
                              {voo.gruposPorVeiculo.map((grupo) => (
                                <div
                                  key={grupo.veiculo}
                                  className="painel-chegadas-driver-block"
                                >
                                  <div className="painel-chegadas-driver-header">
                                    <div className="painel-chegadas-driver-title">
                                      <DirectionsBusRounded fontSize="small" />
                                      <strong>{grupo.veiculo}</strong>
                                    </div>

                                    <div className="painel-chegadas-driver-meta">
                                      <span>Motorista: {grupo.motorista}</span>
                                      <span>
                                        Modalidade:{" "}
                                        {grupo.reservas[0]?.modalidadeServico ||
                                          "Não informado"}
                                      </span>
                                      <span>
                                        Reservas: {grupo.totalReservas}
                                      </span>
                                      <span>Pax: {grupo.totalPax}</span>
                                    </div>
                                  </div>

                                  <div className="painel-chegadas-table-wrap">
                                    <table className="painel-chegadas-table">
                                      <thead>
                                        <tr>
                                          <th>Cliente</th>
                                          <th>Reserva</th>
                                          <th>Pax</th>
                                          <th>Operadora</th>
                                          <th>Modalidade</th>
                                          <th>Contato</th>
                                          <th>Destino</th>
                                          <th>OBS</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {grupo.reservas.map((reserva) => (
                                          <tr key={reserva.id}>
                                            <td>{reserva.cliente}</td>
                                            <td>{reserva.codigoReserva}</td>
                                            <td>{reserva.resumoPax}</td>
                                            <td>{reserva.operadora}</td>
                                            <td>
                                              {reserva.modalidadeServico ||
                                                "Não informado"}
                                            </td>
                                            <td>{reserva.contatoPax}</td>
                                            <td>{reserva.destino}</td>
                                            <td>{reserva.observacao || "-"}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              ))}

                              {voo.reservasNaoEscaladas.length > 0 && (
                                <div className="painel-chegadas-driver-block nao-escalado">
                                  <div className="painel-chegadas-driver-header">
                                    <div className="painel-chegadas-driver-title">
                                      <WarningAmberRounded fontSize="small" />
                                      <strong>Reservas não escaladas</strong>
                                    </div>

                                    <div className="painel-chegadas-driver-meta">
                                      <span>
                                        Reservas:{" "}
                                        {voo.totaisNaoEscalados.totalReservas}
                                      </span>
                                      <span>
                                        Pax: {voo.totaisNaoEscalados.totalPax}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="painel-chegadas-table-wrap">
                                    <table className="painel-chegadas-table">
                                      <thead>
                                        <tr>
                                          <th>Cliente</th>
                                          <th>Reserva</th>
                                          <th>Pax</th>
                                          <th>Operadora</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {voo.reservasNaoEscaladas.map(
                                          (reserva) => (
                                            <tr key={reserva.id}>
                                              <td>{reserva.cliente}</td>
                                              <td>{reserva.codigoReserva}</td>
                                              <td>{reserva.resumoPax}</td>
                                              <td>{reserva.operadora}</td>
                                            </tr>
                                          ),
                                        )}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {abaAtiva === ABAS.OUTS && (
          <>
            <div className="painel-chegadas-card painel-chegadas-card-full">
              <div className="painel-chegadas-card-header">
                <div className="painel-chegadas-card-title-row">
                  <h3>Resumo do dia</h3>
                  <span className="painel-chegadas-badge">
                    outs + transfers
                  </span>
                </div>
              </div>

              <div className="painel-chegadas-kpis">
                <div className="painel-chegadas-kpi">
                  <div className="painel-chegadas-kpi-icon">
                    <DirectionsBusRounded fontSize="small" />
                  </div>
                  <div>
                    <span>Grupos</span>
                    <strong>
                      {carregando ? (
                        <SyncRounded className="spin" fontSize="small" />
                      ) : (
                        gruposOutBase.length
                      )}
                    </strong>
                  </div>
                </div>

                <div className="painel-chegadas-kpi">
                  <div className="painel-chegadas-kpi-icon">
                    <FlightTakeoffRounded fontSize="small" />
                  </div>
                  <div>
                    <span>OUTs</span>
                    <strong>
                      {carregando ? (
                        <SyncRounded className="spin" fontSize="small" />
                      ) : (
                        gruposOutBase.filter((g) => g.tipoServico === "OUT")
                          .length
                      )}
                    </strong>
                  </div>
                </div>

                <div className="painel-chegadas-kpi">
                  <div className="painel-chegadas-kpi-icon">
                    <DirectionsBusRounded fontSize="small" />
                  </div>
                  <div>
                    <span>Transfers</span>
                    <strong>
                      {carregando ? (
                        <SyncRounded className="spin" fontSize="small" />
                      ) : (
                        gruposOutBase.filter(
                          (g) => g.tipoServico === "TRANSFER",
                        ).length
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
                      {carregando ? (
                        <SyncRounded className="spin" fontSize="small" />
                      ) : (
                        gruposOutBase.reduce(
                          (acc, g) => acc + g.totalReservas,
                          0,
                        )
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
                      {carregando ? (
                        <SyncRounded className="spin" fontSize="small" />
                      ) : (
                        gruposOutBase.reduce((acc, g) => acc + g.totalPax, 0)
                      )}
                    </strong>
                  </div>
                </div>

                <div className="painel-chegadas-kpi">
                  <div className="painel-chegadas-kpi-icon">
                    <HotelRounded fontSize="small" />
                  </div>
                  <div>
                    <span>Hotéis</span>
                    <strong>
                      {carregando ? (
                        <SyncRounded className="spin" fontSize="small" />
                      ) : (
                        gruposOutBase.reduce(
                          (acc, g) => acc + g.hoteis.length,
                          0,
                        )
                      )}
                    </strong>
                  </div>
                </div>
              </div>
              <div className="painel-chegadas-field">
                <label>
                  <FilterAltRounded fontSize="small" />
                  Filtrar veículo
                </label>
                <select
                  className="painel-chegadas-input"
                  value={filtroVeiculo}
                  onChange={(e) => setFiltroVeiculo(e.target.value)}
                  disabled={carregando}
                >
                  <option value="todos">Todos</option>
                  {veiculosDisponiveis.map((veiculo) => (
                    <option key={veiculo} value={veiculo}>
                      {veiculo}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="painel-chegadas-card painel-chegadas-card-full">
              <div className="painel-chegadas-card-header">
                <div className="painel-chegadas-card-title-row">
                  <h3>
                    Mapa de OUT + Transfer -{" "}
                    <span className="painel-chegadas-badge">
                      {formatarDataBr(dataSelecionada)}
                    </span>
                  </h3>
                  <span className="painel-chegadas-badge">
                    {gruposOutFiltrados.length} grupo(s)
                  </span>
                </div>
              </div>

              <div className="painel-chegadas-panel-body">
                {carregando ? (
                  <div className="painel-chegadas-inline-loading">
                    <SyncRounded className="spin" fontSize="small" />
                    <span>Atualizando serviços do dia...</span>
                  </div>
                ) : !gruposOutFiltrados.length ? (
                  <div className="painel-chegadas-inline-empty">
                    <WarningAmberRounded fontSize="small" />
                    <span>
                      Nenhum grupo encontrado para a data selecionada.
                    </span>
                  </div>
                ) : (
                  <div className="painel-chegadas-list">
                    {gruposOutFiltrados.map((grupo) => {
                      const expandido = !!gruposExpandidosOut[grupo.id];

                      return (
                        <div
                          className="painel-chegadas-flight-card"
                          key={grupo.id}
                        >
                          <div className="painel-chegadas-flight-top">
                            <div
                              className="painel-chegadas-flight-top-trigger"
                              role="button"
                              tabIndex={0}
                              onClick={() => toggleExpandirGrupoOut(grupo.id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  toggleExpandirGrupoOut(grupo.id);
                                }
                              }}
                            >
                              <div className="painel-chegadas-flight-main">
                                <div className="painel-chegadas-flight-code-wrap">
                                  <strong className="painel-chegadas-flight-code">
                                    {grupo.tipoServico} - {grupo.hotelPrincipal}
                                  </strong>

                                  {grupo.alertaServicoHoje && (
                                    <span className="painel-chegadas-status atrasado">
                                      O SERVIÇO SERÁ REALIZADO HOJE
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="painel-chegadas-flight-meta">
                                <span>
                                  Data: {formatarDataBr(grupo.dataServicoReal)}
                                </span>
                                <span>Hora: {grupo.primeiroHorario}</span>
                                <span>Escala: {grupo.escalaId}</span>
                                <span>Fornecedor: {grupo.fornecedor}</span>
                                <span>Modalidade: {grupo.modalidade}</span>
                                <span>
                                  Pax:{" "}
                                  {formatarQuantidadeDetalhada(
                                    grupo.totalAdultos,
                                    grupo.totalCriancas,
                                    grupo.totalInfantes,
                                  )}
                                </span>
                              </div>

                              <div className="painel-chegadas-expand-icon">
                                {expandido ? (
                                  <KeyboardArrowUpRounded fontSize="small" />
                                ) : (
                                  <KeyboardArrowDownRounded fontSize="small" />
                                )}
                              </div>
                            </div>

                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                flexWrap: "wrap",
                                marginTop: 10,
                              }}
                            >
                              <button
                                type="button"
                                className="painel-chegadas-google-btn"
                                onClick={async () => {
                                  const ok =
                                    await copiarMonitoramentoGrupo(grupo);
                                  if (ok) {
                                    setCopiado(true);
                                    setTimeout(() => setCopiado(false), 1800);
                                  }
                                }}
                              >
                                {copiado ? (
                                  <CheckRounded fontSize="small" />
                                ) : (
                                  <ContentCopyRounded fontSize="small" />
                                )}
                                Copiar monitoramento
                              </button>
                            </div>
                          </div>

                          {expandido && (
                            <div className="painel-chegadas-flight-expanded">
                              {grupo.hoteisOrdenados.map(
                                (hotel, hotelIndex) => (
                                  <div
                                    key={hotel.id}
                                    className="painel-chegadas-driver-block"
                                  >
                                    <div className="painel-chegadas-driver-header">
                                      <div className="painel-chegadas-driver-title">
                                        <HotelRounded fontSize="small" />
                                        <strong>
                                          {grupo.tipoServico === "TRANSFER"
                                            ? `${hotel.hotelOrigemAbreviado} → ${hotel.hotelDestinoAbreviado}`
                                            : `${grupo.hoteisOrdenados.length > 1 ? `Origem ${hotelIndex + 1}: ` : ""}${hotel.hotelOrigemAbreviado}`}
                                        </strong>
                                      </div>

                                      <div className="painel-chegadas-driver-meta">
                                        <span>
                                          Data:{" "}
                                          {formatarDataBr(
                                            hotel.dataServicoReal,
                                          )}
                                        </span>
                                        <span>Hora: {hotel.horario}</span>
                                        <span>Tipo: {grupo.tipoServico}</span>
                                        <span>
                                          Modalidade: {grupo.modalidade}
                                        </span>
                                        <span>
                                          Pax:{" "}
                                          {formatarQuantidadeDetalhada(
                                            hotel.totalAdultos,
                                            hotel.totalCriancas,
                                            hotel.totalInfantes,
                                          )}
                                        </span>
                                      </div>
                                    </div>

                                    <div className="painel-chegadas-table-wrap">
                                      <table className="painel-chegadas-table">
                                        <thead>
                                          <tr>
                                            <th>Data</th>
                                            <th>Hora</th>
                                            <th>Reserva</th>
                                            <th>Contato</th>
                                            <th>Nome do Pax</th>
                                            <th>Qtd. Pax</th>
                                            <th>Origem</th>
                                            {grupo.tipoServico ===
                                              "TRANSFER" && <th>Destino</th>}
                                            <th>Voo Retorno</th>
                                            <th>Modalidade</th>
                                            <th>Buscar</th>
                                            <th>OBS</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {hotel.reservas.map((reserva) => (
                                            <tr key={reserva.id}>
                                              <td>
                                                {formatarDataBr(
                                                  reserva.dataServicoReal,
                                                )}
                                              </td>
                                              <td>{reserva.horarioHotel}</td>
                                              <td>{reserva.reserva}</td>
                                              <td>{reserva.telefone}</td>
                                              <td>{reserva.cliente}</td>
                                              <td>
                                                {formatarQuantidadeDetalhada(
                                                  reserva.adultos,
                                                  reserva.criancas,
                                                  reserva.infantes,
                                                )}
                                              </td>
                                              <td>
                                                {reserva.hotelOrigemAbreviado}
                                              </td>
                                              {grupo.tipoServico ===
                                                "TRANSFER" && (
                                                  <td>
                                                    {
                                                      reserva.hotelDestinoAbreviado
                                                    }
                                                  </td>
                                                )}
                                              <td>{reserva.vooRetorno}</td>
                                              <td>{reserva.modalidade}</td>
                                              <td>
                                                <button
                                                  type="button"
                                                  className="painel-chegadas-google-btn"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    abrirBuscaVooPratica(
                                                      reserva.raw,
                                                    );
                                                  }}
                                                >
                                                  <SearchRounded fontSize="small" />
                                                  Buscar voo
                                                </button>
                                              </td>
                                              <td>
                                                {reserva.observacao || "-"}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                ),
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {abaAtiva === ABAS.GUIAS && (
          <>
            <div className="painel-chegadas-card painel-chegadas-card-full">
              <div className="painel-chegadas-card-header">
                <div className="painel-chegadas-card-title-row">
                  <h3>Resumo do dia</h3>
                  <span className="painel-chegadas-badge">guias escalados</span>
                </div>
              </div>

              <div className="painel-chegadas-kpis">
                <div className="painel-chegadas-kpi">
                  <div className="painel-chegadas-kpi-icon">
                    <PersonRounded fontSize="small" />
                  </div>
                  <div>
                    <span>Guias</span>
                    <strong>
                      {carregando ? (
                        <SyncRounded className="spin" fontSize="small" />
                      ) : (
                        resumoGuias.guias
                      )}
                    </strong>
                  </div>
                </div>

                <div className="painel-chegadas-kpi">
                  <div className="painel-chegadas-kpi-icon">
                    <DirectionsBusRounded fontSize="small" />
                  </div>
                  <div>
                    <span>Veículos</span>
                    <strong>
                      {carregando ? (
                        <SyncRounded className="spin" fontSize="small" />
                      ) : (
                        resumoGuias.veiculos
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
                      {carregando ? (
                        <SyncRounded className="spin" fontSize="small" />
                      ) : (
                        resumoGuias.reservas
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
                      {carregando ? (
                        <SyncRounded className="spin" fontSize="small" />
                      ) : (
                        resumoGuias.pax
                      )}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="painel-chegadas-card painel-chegadas-card-full">
              <div className="painel-chegadas-card-header">
                <div className="painel-chegadas-card-title-row">
                  <h3>Serviços do dia</h3>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <span className="painel-chegadas-badge">
                      {gruposGuiasFiltrados.length} guia(s)
                    </span>

                    <button
                      type="button"
                      className={`painel-chegadas-btn-secondary painel-chegadas-copy-btn ${copiado ? "success" : ""}`}
                      onClick={copiarResumo}
                      disabled={carregando || !gruposGuiasFiltrados.length}
                    >
                      {copiado ? (
                        <CheckRounded fontSize="small" />
                      ) : carregando ? (
                        <SyncRounded className="spin" fontSize="small" />
                      ) : (
                        <ContentCopyRounded fontSize="small" />
                      )}
                      {copiado
                        ? "Copiado!"
                        : carregando
                          ? "Carregando..."
                          : "Copiar resumo"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="painel-chegadas-panel-body">
                {carregando ? (
                  <div className="painel-chegadas-inline-loading">
                    <SyncRounded className="spin" fontSize="small" />
                    <span>Atualizando serviços do dia...</span>
                  </div>
                ) : !gruposGuiasFiltrados.length ? (
                  <div className="painel-chegadas-inline-empty">
                    <WarningAmberRounded fontSize="small" />
                    <span>Nenhum guia encontrado para a data selecionada.</span>
                  </div>
                ) : (
                  <div className="painel-chegadas-list">
                    {gruposGuiasFiltrados.map((grupo) => {
                      const expandido = !!gruposExpandidosGuia[grupo.id];

                      return (
                        <div
                          className="painel-chegadas-flight-card"
                          key={grupo.id}
                        >
                          <button
                            type="button"
                            className="painel-chegadas-flight-top"
                            onClick={() => toggleExpandirGrupoGuia(grupo.id)}
                          >
                            <div className="painel-chegadas-flight-main">
                              <div className="painel-chegadas-flight-code-wrap">
                                <strong className="painel-chegadas-flight-code">
                                  {grupo.guia}
                                </strong>
                              </div>
                            </div>

                            <div className="painel-chegadas-flight-meta">
                              <span>
                                {grupo.passeiosResumo || "Sem passeio"}
                              </span>
                              <span>Passeios: {grupo.totalPasseios}</span>
                              <span>
                                Veículos: {grupo.totalVeiculosUtilizados}
                              </span>
                              <span>Pax: {grupo.totalPax}</span>
                            </div>

                            <div className="painel-chegadas-expand-icon">
                              {expandido ? (
                                <KeyboardArrowUpRounded fontSize="small" />
                              ) : (
                                <KeyboardArrowDownRounded fontSize="small" />
                              )}
                            </div>
                          </button>

                          {expandido && (
                            <div className="painel-chegadas-flight-expanded">
                              {grupo.passeios.map((passeio) => (
                                <div
                                  key={`${grupo.id}_${passeio.passeio}`}
                                  className="painel-chegadas-driver-block"
                                >
                                  <div className="painel-chegadas-driver-header">
                                    <div className="painel-chegadas-driver-title">
                                      <DirectionsBusRounded fontSize="small" />
                                      <strong>{passeio.passeio}</strong>
                                    </div>

                                    <div className="painel-chegadas-driver-meta">
                                      <span>
                                        Veículos: {passeio.totalVeiculos}
                                      </span>
                                      <span>
                                        Reservas: {passeio.totalReservasPasseio}
                                      </span>
                                      <span>
                                        Pax: {passeio.totalPaxPasseio}
                                      </span>
                                      {passeio.pontoDeApoio ? (
                                        <span>
                                          Ponto de apoio: {passeio.pontoDeApoio}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>

                                  <div
                                    className="painel-chegadas-driver-meta"
                                    style={{
                                      padding: "0 14px 12px 14px",
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    {passeio.veiculos.map((veiculo) => (
                                      <span
                                        key={`${grupo.id}_${passeio.passeio}_${veiculo.veiculo}`}
                                      >
                                        {veiculo.veiculo} • {veiculo.totalPax}{" "}
                                        pax
                                      </span>
                                    ))}
                                  </div>

                                  {passeio.veiculos.map((veiculo) => (
                                    <div
                                      key={`${grupo.id}_${passeio.passeio}_${veiculo.veiculo}_bloco`}
                                      className="painel-chegadas-table-wrap"
                                      style={{ marginBottom: 12 }}
                                    >
                                      <div
                                        className="painel-chegadas-driver-meta"
                                        style={{ padding: "0 14px 10px 14px" }}
                                      >
                                        <span>
                                          <strong>Veículo:</strong>{" "}
                                          {veiculo.veiculo}
                                        </span>
                                        <span>
                                          <strong>Fornecedor:</strong>{" "}
                                          {veiculo.fornecedor}
                                        </span>
                                        <span>
                                          <strong>Primeiro horário:</strong>{" "}
                                          {veiculo.primeiraHora}
                                        </span>
                                      </div>

                                      <table className="painel-chegadas-table">
                                        <thead>
                                          <tr>
                                            <th>Nome do Pax</th>
                                            <th>Reserva</th>
                                            <th>Contato</th>
                                            <th>Quantidade</th>
                                            <th>Hotel</th>
                                            <th>Horário</th>
                                            <th>OBS</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {veiculo.reservas.map((reserva) => (
                                            <tr key={reserva.id}>
                                              <td>{reserva.nomePax}</td>
                                              <td>{reserva.numeroReserva}</td>
                                              <td>{reserva.contato}</td>
                                              <td>
                                                {reserva.quantidadeDetalhada}
                                              </td>
                                              <td>{reserva.hotel}</td>
                                              <td>
                                                {reserva.horarioApresentacao}
                                              </td>
                                              <td>
                                                {reserva.observacao || "-"}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  ))}
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
          </>
        )}
      </div>
    </div>
  );
}

function linesPushIfValue(arr, value, condition = true) {
  if (condition) arr.push(value);
}
