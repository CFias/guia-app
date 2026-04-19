import { useEffect, useMemo, useState, useCallback } from "react";
import {
  SearchRounded,
  CalendarMonthRounded,
  RefreshRounded,
  SyncRounded,
  DirectionsBusRounded,
  BadgeRounded,
  WarningAmberRounded,
  CheckCircleRounded,
  ErrorRounded,
  KeyboardArrowDownRounded,
  KeyboardArrowUpRounded,
  FlightRounded,
} from "@mui/icons-material";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "../../Services/Services/firebase";
import "./styles.css";

const API_AEROPORTO = "https://guia-app.onrender.com";
const PHOENIX_RESERVE_SERVICE_URL =
  "https://driversalvador.phoenix.comeialabs.com/scale/reserve-service";

const PHOENIX_EXPAND =
  "service,schedule,reserve,establishmentOrigin,establishmentDestination,establishmentOrigin.region,establishmentDestination.region,reserve.partner,reserve.customer,additionalReserveServices,additionalReserveServices.additional,additionalReserveServices.provider,roadmapService,roadmapService.roadmap,auxRoadmapService.roadmap,auxRoadmapService.roadmap.serviceOrder,auxRoadmapService.roadmap.serviceOrder.vehicle,auxRoadmapService.roadmap.driver,auxRoadmapService.roadmap.guide,roadmapService.roadmap.driver,roadmapService.roadmap.guide,roadmapService.roadmap.serviceOrder,roadmapService.roadmap.serviceOrder.vehicle,reserve.pdvPayment.user";

const TABS = [
  { key: "IN", label: "IN" },
  { key: "OUT", label: "OUT" },
  { key: "PASSEIO", label: "Passeios" },
  { key: "TRANSFER", label: "Transfers" },
];

const getHojeIso = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const montarUrlPhoenixReserveService = (date, tipo = null) => {
  const params = new URLSearchParams();
  params.append("execution_date", date);
  params.append("expand", PHOENIX_EXPAND);

  if (tipo) {
    params.append("service_type[]", String(tipo));
  }

  return `${PHOENIX_RESERVE_SERVICE_URL}?${params.toString()}`;
};

const extrairListaResposta = (json) => {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.results)) return json.results;
  return [];
};

const abrirBuscaGoogleVoo = (codigoOuHorario = "") => {
  const termo = String(codigoOuHorario || "").trim();
  if (!termo) return;

  const query = encodeURIComponent(
    termo.replace(/\s*-\s*/g, " ").replace(/\s+/g, " "),
  );

  window.open(
    `https://www.google.com/search?q=${query}`,
    "_blank",
    "noopener,noreferrer",
  );
};

const extrairCodigoEscala = (roadmap = {}) =>
  String(roadmap?.code || "").trim() ||
  (roadmap?.id ? `ESCALA-${roadmap.id}` : "ESCALA-SEM-ID");

const extrairPaxBreakdown = (item = {}) => {
  const adt = Number(item?.is_adult_count || 0);
  const chd = Number(item?.is_child_count || 0);
  const inf = Number(item?.is_infant_count || item?.is_baby_count || 0);

  return {
    adt,
    chd,
    inf,
    total: adt + chd + inf,
  };
};

const formatarQuantidadeDetalhada = (adultos = 0, criancas = 0, infantes = 0) => {
  const partes = [];
  if (adultos > 0) partes.push(`${adultos} ADT`);
  if (criancas > 0) partes.push(`${criancas} CHD`);
  if (infantes > 0) partes.push(`${infantes} INF`);
  return partes.length ? partes.join(" | ") : "0 ADT";
};

const extrairNumeroVooPrincipal = (item = {}) =>
  item?.reserve?.flight_code ||
  item?.reserve?.flight?.code ||
  item?.reserve?.arrival_flight_code ||
  item?.reserve?.departure_flight_code ||
  item?.flight_code ||
  item?.flight?.code ||
  item?.flightNumber ||
  "";

const extrairHorarioVooPhoenix = (item = {}) =>
  item?.fly_hour ||
  item?.our_schedule ||
  item?.reserve?.flight?.scheduled_time ||
  item?.reserve?.flight?.arrival_time ||
  item?.reserve?.flight?.departure_time ||
  item?.presentation_hour ||
  item?.schedule?.presentation_hour ||
  "";

const extrairObservacao = (item = {}) =>
  item?.observation ||
  item?.observations ||
  item?.reserve?.observation ||
  item?.reserve?.observations ||
  "-";

const formatarDataBr = (dataIso = "") => {
  if (!dataIso) return "";
  const [ano, mes, dia] = String(dataIso).split("-");
  return `${dia}/${mes}/${ano}`;
};

const normalizarTexto = (texto = "") =>
  String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const normalizarEstrito = (texto = "") =>
  String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .trim()
    .toLowerCase();

const horarioValido = (valor = "") => {
  const v = String(valor || "").trim();
  return !!v && v !== "--:--" && v !== "00:00";
};

const formatHour = (value = "") => {
  if (!value) return "--:--";
  const match = String(value).match(/\d{2}:\d{2}/);
  const hhmm = match ? match[0] : "--:--";
  return horarioValido(hhmm) ? hhmm : "--:--";
};

const toMinutes = (value = "") => {
  const hhmm = formatHour(value);
  if (!horarioValido(hhmm)) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

const diffMinutes = (baseValue = "", compareValue = "") => {
  const base = toMinutes(baseValue);
  const compare = toMinutes(compareValue);
  if (base === null || compare === null) return null;
  return compare - base;
};

const formatarDiff = (diff) => {
  if (diff === null || diff === undefined) return "Sem comparação";
  if (Math.abs(diff) > 240) return "Sem comparação válida";
  if (diff === 0) return "No horário";
  if (diff > 0) return `${diff} min`;
  return `${Math.abs(diff)} min adiantado`;
};

const getClasse = (key = "") => {
  if (key === "ok") return "status-semaforo-verde";
  if (key === "divergencia") return "status-semaforo-amarelo";
  if (key === "critico") return "status-semaforo-vermelho";
  return "status-semaforo-cinza";
};

const getRotuloStatus = (key = "") => {
  if (key === "ok") return "OK";
  if (key === "divergencia") return "Alerta";
  if (key === "critico") return "Crítico";
  return "Sem info";
};

const normalizeAirportPayload = (payload) => {
  if (!Array.isArray(payload)) return [];
  return payload.map((item) => ({
    ScheduleTime: item?.ScheduleTime || "",
    FormattedTime: item?.FormattedTime || "",
    Airport: String(item?.Airport || "").trim(),
    Airliner: String(item?.Airliner || "").trim(),
    Number: String(item?.Number || "").trim(),
    Status: String(item?.Status || "").trim(),
    StatusT: String(item?.StatusT || "").trim(),
    Route: String(item?.Route || "").trim(),
    OperationTime: item?.OperationTime || "",
    Observations: String(item?.Observations || "").trim(),
  }));
};

const normalizeAirportStatus = (status = "") => {
  const s = normalizarTexto(status);
  if (s.includes("cancel")) return "Cancelado";
  if (s.includes("atras")) return "Atrasado";
  if (s.includes("confirm")) return "Confirmado";
  if (s.includes("previst")) return "Previsto";
  if (s.includes("embarque")) return "Embarque";
  return status || "Sem informação";
};

const extractReserveServicesFromRoadmapItem = (item = {}) => {
  const value = item?.reserveService;
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
};

const extractScaleIdFromItem = (item = {}) =>
  item?.roadmapService?.roadmap?.id ||
  item?.auxRoadmapService?.roadmap?.id ||
  item?.roadmap?.id ||
  item?.scale_id ||
  item?.escala_id ||
  null;

const extractScaleCodeFromItem = (item = {}) =>
  String(
    item?.roadmapService?.roadmap?.code ||
      item?.auxRoadmapService?.roadmap?.code ||
      item?.roadmap?.code ||
      "",
  ).trim();

const extractVehicleFromItem = (item = {}) =>
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
  "";

const extractVehicleIdentityFromItem = (item = {}) => {
  const vehicle =
    item?.roadmapService?.roadmap?.serviceOrder?.vehicle ||
    item?.auxRoadmapService?.roadmap?.serviceOrder?.vehicle ||
    item?.vehicle ||
    {};

  const raw =
    vehicle?.id ||
    vehicle?.plate ||
    vehicle?.prefix ||
    vehicle?.nickname ||
    vehicle?.name ||
    "";

  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[–—]/g, "-");
};

const extractDriverFromItem = (item = {}) =>
  item?.roadmapService?.roadmap?.driver?.nickname ||
  item?.auxRoadmapService?.roadmap?.driver?.nickname ||
  item?.roadmapService?.roadmap?.driver?.name ||
  item?.auxRoadmapService?.roadmap?.driver?.name ||
  item?.driver?.nickname ||
  item?.driver?.name ||
  "";

const extractOriginFromItem = (item = {}) =>
  item?.establishmentOrigin?.name ||
  item?.origin?.name ||
  item?.reserve?.origin?.name ||
  item?.regionOrigin?.name ||
  "-";

const extractDestinationFromItem = (item = {}) =>
  item?.establishmentDestination?.name ||
  item?.destination?.name ||
  item?.reserve?.destination?.name ||
  item?.regionDestination?.name ||
  "-";

const flattenRoadmapReserveServices = (roadmaps = []) => {
  const rows = [];

  (Array.isArray(roadmaps) ? roadmaps : []).forEach((roadmap, roadmapIndex) => {
    const reserveServices = extractReserveServicesFromRoadmapItem(roadmap);

    reserveServices.forEach((reserveService, reserveIndex) => {
      if (!reserveService || typeof reserveService !== "object") return;

      rows.push({
        __rowId:
          reserveService?.id ||
          `${roadmap?.id || "rm"}_${roadmapIndex}_${reserveIndex}`,
        roadmap,
        reserveService,
      });
    });
  });

  return rows;
};

const extractScaleIdFromReserveService = (reserveService = {}, roadmap = {}) =>
  reserveService?.roadmapService?.roadmap?.id ||
  reserveService?.auxRoadmapService?.roadmap?.id ||
  reserveService?.roadmap?.id ||
  reserveService?.scale_id ||
  reserveService?.escala_id ||
  roadmap?.id ||
  null;

const extractScaleCodeFromReserveService = (reserveService = {}, roadmap = {}) =>
  String(
    reserveService?.roadmapService?.roadmap?.code ||
      reserveService?.auxRoadmapService?.roadmap?.code ||
      reserveService?.roadmap?.code ||
      roadmap?.code ||
      "",
  ).trim();

const extractVehicleFromReserveService = (reserveService = {}, roadmap = {}) =>
  reserveService?.roadmapService?.roadmap?.serviceOrder?.vehicle?.nickname ||
  reserveService?.auxRoadmapService?.roadmap?.serviceOrder?.vehicle?.nickname ||
  reserveService?.roadmapService?.roadmap?.serviceOrder?.vehicle?.name ||
  reserveService?.auxRoadmapService?.roadmap?.serviceOrder?.vehicle?.name ||
  reserveService?.roadmapService?.roadmap?.serviceOrder?.vehicle?.prefix ||
  reserveService?.auxRoadmapService?.roadmap?.serviceOrder?.vehicle?.prefix ||
  reserveService?.roadmapService?.roadmap?.serviceOrder?.vehicle?.plate ||
  reserveService?.auxRoadmapService?.roadmap?.serviceOrder?.vehicle?.plate ||
  roadmap?.serviceOrder?.vehicle?.nickname ||
  roadmap?.serviceOrder?.vehicle?.name ||
  roadmap?.serviceOrder?.vehicle?.prefix ||
  roadmap?.serviceOrder?.vehicle?.plate ||
  "";

const extractDriverFromReserveService = (reserveService = {}, roadmap = {}) =>
  reserveService?.roadmapService?.roadmap?.driver?.nickname ||
  reserveService?.auxRoadmapService?.roadmap?.driver?.nickname ||
  reserveService?.roadmapService?.roadmap?.driver?.name ||
  reserveService?.auxRoadmapService?.roadmap?.driver?.name ||
  roadmap?.driver?.nickname ||
  roadmap?.driver?.name ||
  "";

const extractVehicleIdentity = (reserveService = {}, roadmap = {}) => {
  const vehicle =
    reserveService?.roadmapService?.roadmap?.serviceOrder?.vehicle ||
    reserveService?.auxRoadmapService?.roadmap?.serviceOrder?.vehicle ||
    roadmap?.serviceOrder?.vehicle ||
    {};

  const raw =
    vehicle?.id ||
    vehicle?.plate ||
    vehicle?.prefix ||
    vehicle?.nickname ||
    vehicle?.name ||
    "";

  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[–—]/g, "-");
};

const sortReservasByHora = (reservas = []) =>
  [...reservas].sort((a, b) => {
    const ma = toMinutes(a?.horarioPhoenix || a?.hora || "") ?? 999999;
    const mb = toMinutes(b?.horarioPhoenix || b?.hora || "") ?? 999999;
    return ma - mb;
  });

const extractPassengerName = (item = {}) =>
  item?.reserve?.customer?.name ||
  item?.customer?.name ||
  item?.reserve?.holder_name ||
  item?.passenger_name ||
  "Cliente não informado";

const extractReservationCode = (item = {}) =>
  item?.reserve?.code ||
  item?.reserve_code ||
  item?.code ||
  item?.reserve?.id ||
  "-";

const extractPaxBreakdown = (item = {}) => {
  const adt = Number(item?.is_adult_count || 0);
  const chd = Number(item?.is_child_count || 0);
  const inf = Number(item?.is_infant_count || item?.is_baby_count || 0);
  return {
    adt,
    chd,
    inf,
    total: adt + chd + inf,
  };
};

const extractFlightCode = (item = {}) =>
  item?.reserve?.flight_code ||
  item?.reserve?.flight?.code ||
  item?.reserve?.arrival_flight_code ||
  item?.reserve?.departure_flight_code ||
  item?.flight_code ||
  item?.flight?.code ||
  item?.flightNumber ||
  "";

const extractPhoenixFlightTime = (item = {}) =>
  item?.fly_hour ||
  item?.our_schedule ||
  item?.reserve?.flight?.scheduled_time ||
  item?.reserve?.flight?.arrival_time ||
  item?.reserve?.flight?.departure_time ||
  item?.presentation_hour ||
  item?.schedule?.presentation_hour ||
  "";

const extractObservationFlightCode = (item = {}) => {
  const obs = String(item?.observation || "");
  const match = obs.match(/\b([A-Z]{2}\d{3,4})\b/i);
  return match ? match[1].toUpperCase() : "";
};

const extractVehicleDisplay = (roadmap = {}) =>
  roadmap?.serviceOrder?.vehicle?.nickname ||
  roadmap?.serviceOrder?.vehicle?.name ||
  roadmap?.serviceOrder?.vehicle?.prefix ||
  roadmap?.serviceOrder?.vehicle?.plate ||
  "";

const buildScaleLabel = (roadmap = {}) =>
  roadmap?.code ||
  roadmap?.serviceOrder?.vehicle?.name ||
  roadmap?.serviceOrder?.vehicle?.plate ||
  `ESCALA ${roadmap?.id || "-"}`;

const extractDriverDisplay = (roadmap = {}) =>
  roadmap?.driver?.nickname || roadmap?.driver?.name || "";

const extractRoadmapId = (roadmap = {}) =>
  roadmap?.id || roadmap?.roadmap_id || roadmap?.roadmapId || "";

const extractOriginLabel = (roadmap = {}) => roadmap?.regionOrigin?.name || "";

const extractDestinationLabel = (roadmap = {}) =>
  roadmap?.regionDestination?.name || "";

const isAirportLike = (texto = "") => {
  const t = normalizarTexto(texto);
  return t.includes("aeroporto") || t.includes("airport");
};

const classifyServiceType = (reserveService = {}, roadmap = {}) => {
  const rawType =
    reserveService?.service?.type ??
    reserveService?.service_type ??
    reserveService?.serviceType;

  const type = String(rawType || "").trim();
  const serviceName = normalizarTexto(
    reserveService?.service?.name || reserveService?.service_name || "",
  );

  if (type === "1") return "IN";
  if (type === "2") return "OUT";
  if (type === "3") return "PASSEIO";
  if (type === "4") return "TRANSFER";

  if (serviceName.includes("tour") || serviceName.includes("passeio")) {
    return "PASSEIO";
  }

  const origin = extractOriginLabel(roadmap);
  const destination = extractDestinationLabel(roadmap);

  if (isAirportLike(origin)) return "IN";
  if (isAirportLike(destination)) return "OUT";
  return "TRANSFER";
};

const extractFlightNumberOnly = (value = "") => {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return String(Number(digits));
};

const buildAirportMapByNumber = (airportFlights = []) => {
  const map = new Map();
  airportFlights.forEach((flight) => {
    const n = extractFlightNumberOnly(flight?.Number || "");
    if (!n) return;
    if (!map.has(n)) map.set(n, []);
    map.get(n).push(flight);
  });
  return map;
};

const gerarVariacoesVeiculo = (nome = "") => {
  const bruto = String(nome || "").trim();
  const normalizado = normalizarEstrito(bruto);
  const apenasNumeros = bruto.replace(/\D/g, "");
  const tokens = String(bruto)
    .toUpperCase()
    .split(/[\s\-_/().]+/)
    .filter(Boolean);

  return Array.from(
    new Set(
      [
        bruto,
        normalizado,
        apenasNumeros,
        tokens.join(""),
        tokens.slice(-2).join(""),
        tokens.slice(-1).join(""),
      ].filter(Boolean),
    ),
  );
};

const buildVehicleIndex = (fornecedores = []) => {
  const index = new Map();

  fornecedores.forEach((fornecedor) => {
    const veiculos = Array.isArray(fornecedor?.veiculos)
      ? fornecedor.veiculos
      : [];

    veiculos.forEach((veiculo) => {
      const nome =
        typeof veiculo === "string"
          ? veiculo
          : veiculo?.nome ||
          veiculo?.name ||
          veiculo?.prefix ||
          veiculo?.placa ||
          veiculo?.plate ||
          "";

      const capacidade =
        typeof veiculo === "string"
          ? null
          : veiculo?.capacidade !== undefined &&
            veiculo?.capacidade !== null &&
            veiculo?.capacidade !== ""
            ? Number(veiculo.capacidade)
            : null;

      const payload = {
        nome,
        capacidade: Number.isFinite(capacidade) ? capacidade : null,
      };

      gerarVariacoesVeiculo(nome).forEach((key) => {
        if (!key) return;
        if (!index.has(key)) index.set(key, payload);
      });
    });
  });

  return index;
};

const extrairNumeroVooPhoenix = (item = {}) =>
  item?.schedule?.name ||
  item?.reserve?.flight_code ||
  item?.reserve?.flight?.code ||
  item?.reserve?.arrival_flight_code ||
  item?.reserve?.departure_flight_code ||
  item?.flight_code ||
  item?.flight?.code ||
  item?.flightNumber ||
  "";

const formatarCodigoVooExibicao = (codigo = "") => {
  const bruto = String(codigo || "").trim().toUpperCase();
  if (!bruto) return "-";

  const semEspacos = bruto.replace(/\s+/g, "").replace(/[–—]/g, "-");
  const match = semEspacos.match(/^([A-Z]{2})(\d{3,5})$/);

  if (match) {
    return `${match[1]} - ${match[2]}`;
  }

  const matchFlex = semEspacos.match(/^([A-Z]{2})[- ]?(\d{3,5})$/);
  if (matchFlex) {
    return `${matchFlex[1]} - ${matchFlex[2]}`;
  }

  return bruto.replace(/-/g, " - ");
};

const abrirBuscaGoogleVooPhoenix = (codigo = "") => {
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

const findVehicleMatch = (vehicleIndex, vehicleName = "") => {
  const keys = gerarVariacoesVeiculo(vehicleName);
  for (const key of keys) {
    if (vehicleIndex.has(key)) {
      return {
        match: vehicleIndex.get(key),
        triedKeys: keys,
      };
    }
  }
  return {
    match: null,
    triedKeys: keys,
  };
};

const normalizeScaleCode = (value = "") =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

const normalizeVehicleKey = (value = "") =>
  normalizarEstrito(value || "");

const extrairCodigoEscalaRobusto = (roadmap = {}, reserveService = {}) => {
  const bruto =
    roadmap?.code ||
    roadmap?.roadmap_code ||
    reserveService?.roadmap?.code ||
    reserveService?.roadmap_code ||
    reserveService?.scale_code ||
    reserveService?.reserve?.scale_code ||
    reserveService?.serviceOrder?.roadmap_code ||
    reserveService?.service_order?.roadmap_code ||
    "";

  const normalizado = String(bruto || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[–—]/g, "-");

  if (normalizado) return normalizado;

  const roadmapId =
    roadmap?.id ||
    roadmap?.roadmap_id ||
    reserveService?.roadmap_id ||
    reserveService?.roadmap?.id ||
    "";

  return roadmapId ? `ESCALA-${roadmapId}` : "ESCALA-SEM-ID";
};

const extrairEscalaLabel = (roadmap = {}, reserveService = {}) =>
  String(
    roadmap?.code ||
      roadmap?.roadmap_code ||
      reserveService?.roadmap?.code ||
      reserveService?.roadmap_code ||
      reserveService?.scale_code ||
      reserveService?.reserve?.scale_code ||
      reserveService?.serviceOrder?.roadmap_code ||
      reserveService?.service_order?.roadmap_code ||
      roadmap?.id ||
      reserveService?.roadmap_id ||
      "ESCALA-SEM-ID",
  ).trim();

const extrairVeiculoIdentidade = (roadmap = {}) => {
  const vehicle = roadmap?.serviceOrder?.vehicle || {};

  const idSeguro =
    vehicle?.id ||
    vehicle?.vehicle_id ||
    vehicle?.plate ||
    vehicle?.prefix ||
    vehicle?.nickname ||
    vehicle?.name ||
    "";

  return String(idSeguro || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[–—]/g, "-");
};

const extrairVeiculoDisplayRobusto = (roadmap = {}) =>
  roadmap?.serviceOrder?.vehicle?.nickname ||
  roadmap?.serviceOrder?.vehicle?.name ||
  roadmap?.serviceOrder?.vehicle?.prefix ||
  roadmap?.serviceOrder?.vehicle?.plate ||
  roadmap?.vehicle?.nickname ||
  roadmap?.vehicle?.name ||
  roadmap?.vehicle?.prefix ||
  roadmap?.vehicle?.plate ||
  "";

const mergeGruposOperacionais = (grupos = []) => {
  const merged = new Map();

  grupos.forEach((grupo) => {
    const key = [
      grupo?.tipo || "SEM-TIPO",
      grupo?.escalaCodigoNormalizado || "SEM-ESCALA",
      grupo?.veiculoIdentidade || grupo?.veiculoKey || "SEM-VEICULO",
    ].join("__");

    if (!merged.has(key)) {
      merged.set(key, {
        ...grupo,
        reservas: [...(grupo?.reservas || [])],
        observacoesEscala: [...(grupo?.observacoesEscala || [])],
        roadmapsRelacionados: [...(grupo?.roadmapsRelacionados || [])],
        paxBreakdown: {
          adt: Number(grupo?.paxBreakdown?.adt || 0),
          chd: Number(grupo?.paxBreakdown?.chd || 0),
          inf: Number(grupo?.paxBreakdown?.inf || 0),
        },
        totalPax: Number(grupo?.totalPax || 0),
      });
      return;
    }

    const atual = merged.get(key);

    atual.totalPax += Number(grupo?.totalPax || 0);
    atual.paxBreakdown.adt += Number(grupo?.paxBreakdown?.adt || 0);
    atual.paxBreakdown.chd += Number(grupo?.paxBreakdown?.chd || 0);
    atual.paxBreakdown.inf += Number(grupo?.paxBreakdown?.inf || 0);

    atual.reservas.push(...(grupo?.reservas || []));

    atual.observacoesEscala = Array.from(
      new Set([...(atual.observacoesEscala || []), ...(grupo?.observacoesEscala || [])]),
    );

    atual.roadmapsRelacionados = Array.from(
      new Set([...(atual.roadmapsRelacionados || []), ...(grupo?.roadmapsRelacionados || [])]),
    );

    if (!atual.vooPrincipal && grupo?.vooPrincipal) {
      atual.vooPrincipal = grupo.vooPrincipal;
    }

    const horarioAtual = toMinutes(atual?.horarioPhoenix || "");
    const horarioNovo = toMinutes(grupo?.horarioPhoenix || "");

    if (
      (!atual.horarioPhoenix || atual.horarioPhoenix === "--:--") &&
      grupo?.horarioPhoenix
    ) {
      atual.horarioPhoenix = grupo.horarioPhoenix;
    } else if (
      horarioNovo !== null &&
      (horarioAtual === null || horarioNovo < horarioAtual)
    ) {
      atual.horarioPhoenix = grupo.horarioPhoenix;
    }
  });

  return Array.from(merged.values()).map((grupo) => ({
    ...grupo,
    reservas: sortReservasPorHorario(
      (grupo?.reservas || []).filter(
        (r, idx, arr) =>
          arr.findIndex(
            (x) =>
              String(x?.reserva || "") === String(r?.reserva || "") &&
              String(x?.cliente || "") === String(r?.cliente || "") &&
              String(x?.hora || "") === String(r?.hora || ""),
          ) === idx,
      ),
    ),
    quantidadeReservas: (grupo?.reservas || []).length,
  }));
};

const extrairModalidade = (reserveService = {}) =>
  reserveService?.serviceModeAsText ||
  reserveService?.service_mode_as_text ||
  reserveService?.service_mode ||
  reserveService?.mode ||
  reserveService?.reserve?.serviceModeAsText ||
  reserveService?.reserve?.service_mode_as_text ||
  "Não informado";

const extrairContatoReserva = (reserveService = {}) =>
  reserveService?.reserve?.customer?.phone ||
  reserveService?.reserve?.customer?.telephone ||
  reserveService?.reserve?.customer?.cellphone ||
  reserveService?.reserve?.phone ||
  reserveService?.reserve?.telephone ||
  reserveService?.reserve?.cellphone ||
  reserveService?.customer?.phone ||
  reserveService?.customer?.telephone ||
  reserveService?.customer?.cellphone ||
  "-";

const extrairHoraPrincipalReserva = (reserveService = {}) =>
  formatHour(
    reserveService?.presentation_hour ||
      reserveService?.presentation_hour_end ||
      reserveService?.schedule?.presentation_hour ||
      reserveService?.schedule?.presentation_hour_end ||
      reserveService?.fly_hour ||
      reserveService?.our_schedule ||
      reserveService?.reserve?.flight?.scheduled_time ||
      reserveService?.reserve?.flight?.arrival_time ||
      reserveService?.reserve?.flight?.departure_time ||
      "",
  );

const sortReservasPorHorario = (reservas = []) =>
  [...reservas].sort((a, b) => {
    const ma = toMinutes(a?.hora || "") ?? 999999;
    const mb = toMinutes(b?.hora || "") ?? 999999;
    return ma - mb;
  });

const findBestAirportMatch = ({
  flightCode,
  observationFlightCode,
  systemTime,
  airportFlights,
  airportMapByNumber,
}) => {
  const explicitNumber = extractFlightNumberOnly(flightCode);
  const observationNumber = extractFlightNumberOnly(observationFlightCode);

  if (explicitNumber && airportMapByNumber.has(explicitNumber)) {
    const candidates = airportMapByNumber.get(explicitNumber);
    return {
      bestMatch: candidates[0] || null,
      matchMode: "flight_number",
      triedKeys: [explicitNumber],
    };
  }

  if (observationNumber && airportMapByNumber.has(observationNumber)) {
    const candidates = airportMapByNumber.get(observationNumber);
    return {
      bestMatch: candidates[0] || null,
      matchMode: "observation_flight_number",
      triedKeys: [observationNumber],
    };
  }

  const baseMinutes = toMinutes(systemTime);
  if (baseMinutes === null) {
    return {
      bestMatch: null,
      matchMode: "none",
      triedKeys: [],
    };
  }

  const timedCandidates = airportFlights
    .map((flight) => {
      const op = formatHour(flight?.OperationTime || "");
      const sch = formatHour(flight?.ScheduleTime || "");
      const compare = horarioValido(op) ? op : sch;
      const diff = diffMinutes(systemTime, compare);
      return { flight, diff };
    })
    .filter((item) => item.diff !== null && Math.abs(item.diff) <= 20)
    .sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff));

  if (timedCandidates.length) {
    return {
      bestMatch: timedCandidates[0].flight,
      matchMode: "time_window",
      triedKeys: [formatHour(systemTime)],
    };
  }

  return {
    bestMatch: null,
    matchMode: "none",
    triedKeys: [
      explicitNumber,
      observationNumber,
      formatHour(systemTime),
    ].filter(Boolean),
  };
};

const buildGroupedServices = (items = []) => {
  const grouped = new Map();

  (Array.isArray(items) ? items : []).forEach((item, index) => {
    if (!item || typeof item !== "object") return;

    const tipo = classifyServiceType(item);

    const escalaId = extractScaleIdFromItem(item);
    const escalaCodigoBruto = extractScaleCodeFromItem(item);
    const escalaCodigo =
      String(escalaCodigoBruto || "").trim() ||
      (escalaId ? `ESCALA-${escalaId}` : "ESCALA-SEM-ID");

    const veiculo = extractVehicleFromItem(item);
    const veiculoIdentidade =
      extractVehicleIdentityFromItem(item) ||
      normalizeVehicleKey(veiculo) ||
      "SEM-VEICULO";

    const motorista = extractDriverFromItem(item);
    const origem = extractOriginFromItem(item);
    const destino = extractDestinationFromItem(item);

    const pax = extractPaxBreakdown(item);
    const voo = extrairNumeroVooPhoenix(item);
    const horarioPhoenix = formatHour(extrairHorarioVooPhoenix(item));
    const observacao = extrairObservacao(item);
    const modalidade = extrairModalidade(item);

    const key = `${escalaId || escalaCodigo}__${veiculoIdentidade}__${tipo}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        id: key,
        escalaId: escalaId || "",
        escalaCodigo,
        escalaLabel: escalaCodigo,
        tipo,
        veiculo,
        veiculoIdentidade,
        motorista,
        origem,
        destino,
        modalidade,
        reservas: [],
        totalPax: 0,
        paxBreakdown: { adt: 0, chd: 0, inf: 0 },
        serviceName: item?.service?.name || item?.service_name || "-",
        vooPrincipal: "",
        horarioPhoenix: "",
        observacoesEscala: [],
      });
    }

    const grupo = grouped.get(key);

    grupo.totalPax += pax.total;
    grupo.paxBreakdown.adt += pax.adt;
    grupo.paxBreakdown.chd += pax.chd;
    grupo.paxBreakdown.inf += pax.inf;

    if (!grupo.vooPrincipal && voo) {
      grupo.vooPrincipal = String(voo).trim().toUpperCase();
    }

    const horaGrupo = toMinutes(grupo.horarioPhoenix || "");
    const horaAtual = toMinutes(horarioPhoenix || "");
    if (horaAtual !== null && (horaGrupo === null || horaAtual < horaGrupo)) {
      grupo.horarioPhoenix = horarioPhoenix;
    }

    if (observacao && observacao !== "-" && !grupo.observacoesEscala.includes(observacao)) {
      grupo.observacoesEscala.push(observacao);
    }

    grupo.reservas.push({
      id: item?.id || `res_${index}`,
      raw: item,
      reserva: extractReservationCode(item),
      cliente: extractPassengerName(item),
      contato: extrairContatoReserva(item),
      pax: pax.total,
      adultos: pax.adt,
      criancas: pax.chd,
      infantes: pax.inf,
      paxLabel: formatarQuantidadeDetalhada(pax.adt, pax.chd, pax.inf),
      vooReserva: String(voo || "").trim().toUpperCase() || "-",
      horarioPhoenix: horarioPhoenix || "--:--",
      modalidade,
      observacao,
      origem,
      destino,
    });
  });

  return Array.from(grouped.values())
    .map((grupo) => ({
      ...grupo,
      reservas: sortReservasByHora(grupo.reservas),
      quantidadeReservas: grupo.reservas.length,
    }))
    .sort((a, b) => {
      const ea = String(a.escalaCodigo || "");
      const eb = String(b.escalaCodigo || "");
      const byEscala = ea.localeCompare(eb, "pt-BR", { sensitivity: "base" });
      if (byEscala !== 0) return byEscala;

      return String(a.veiculo || "").localeCompare(String(b.veiculo || ""), "pt-BR", {
        sensitivity: "base",
      });
    });
};
const buildDiagnostico = ({
  item,
  vehicleIndex,
  airportFlights,
  airportMapByNumber,
}) => {
  const reservas = Array.isArray(item?.reservas) ? item.reservas : [];
  const veiculo = item?.veiculo || "";
  const totalPax = Number(item?.totalPax || 0);

  const { match: vehicleMatch } = findVehicleMatch(vehicleIndex, veiculo);

  const capacidade =
    vehicleMatch?.capacidade !== undefined ? vehicleMatch.capacidade : null;

  const motivos = [];
  const alertas = [];
  const detalhes = [];

  let airportMatch = null;
  let matchMode = "none";
  let flightKeys = [];
  let diff = null;
  let horarioAeroportoPrevisto = "--:--";
  let horarioAeroportoOperacional = "--:--";
  let statusAeroportoLabel = "-";
  let companhia = "-";
  let aeroportoOrigemDestino = "-";

  const vooPhoenix = String(item?.vooPrincipal || "").trim().toUpperCase();
  const horarioPhoenix = item?.horarioPhoenix || "";

  if (item.tipo === "IN" || item.tipo === "OUT") {
    if (!vooPhoenix && !horarioPhoenix) {
      alertas.push(
        "Escala sem número de voo e sem horário de voo no Phoenix. Não foi possível validar o voo.",
      );
    } else {
      const result = findBestAirportMatch({
        flightCode: vooPhoenix,
        observationFlightCode: "",
        systemTime: horarioPhoenix,
        airportFlights,
        airportMapByNumber,
      });

      airportMatch = result?.bestMatch || null;
      matchMode = result?.matchMode || "none";
      flightKeys = result?.triedKeys || [];

      if (!airportMatch) {
        detalhes.push(
          vooPhoenix
            ? `Voo ${formatarCodigoVooExibicao(vooPhoenix)} identificado no Phoenix, mas não retornado pela API do aeroporto.`
            : `Horário ${horarioPhoenix || "--:--"} identificado no Phoenix, mas sem retorno correspondente na API do aeroporto.`,
        );
      } else {
        horarioAeroportoPrevisto = formatHour(airportMatch?.ScheduleTime || "");
        horarioAeroportoOperacional = formatHour(airportMatch?.OperationTime || "");
        statusAeroportoLabel = normalizeAirportStatus(airportMatch?.Status || "");
        companhia = airportMatch?.Airliner || "-";
        aeroportoOrigemDestino = airportMatch?.Airport || "-";

        detalhes.push(
          matchMode === "flight_number"
            ? `Voo ${formatarCodigoVooExibicao(vooPhoenix)} validado na API do aeroporto.`
            : matchMode === "observation_flight_number"
              ? `Voo validado pela observação operacional.`
              : `Voo validado por janela de horário (${horarioPhoenix || "--:--"}).`,
        );

        const horarioCorretoAeroporto = horarioValido(horarioAeroportoOperacional)
          ? horarioAeroportoOperacional
          : horarioAeroportoPrevisto;

        if (horarioValido(horarioPhoenix) && horarioValido(horarioCorretoAeroporto)) {
          diff = diffMinutes(horarioPhoenix, horarioCorretoAeroporto);

          if (diff !== null && Math.abs(diff) > 30 && Math.abs(diff) <= 240) {
            alertas.push(
              `Diferença entre Phoenix e aeroporto: ${formatarDiff(diff)}.`,
            );
          } else if (diff !== null) {
            detalhes.push(`Horário compatível entre Phoenix e aeroporto (${formatarDiff(diff)}).`);
          }
        }
      }
    }
  }

  if (!veiculo) {
    alertas.push("Serviço sem veículo escalado.");
  } else if (capacidade === null || Number.isNaN(capacidade)) {
    alertas.push(`Veículo escalado (${veiculo}) sem capacidade cadastrada.`);
  } else if (totalPax > capacidade) {
    motivos.push(
      `OVER detectado no veículo ${veiculo}: ${totalPax} pax para capacidade ${capacidade}. Excesso de ${totalPax - capacidade} pax.`,
    );
  } else {
    detalhes.push(`Capacidade compatível no veículo: ${totalPax}/${capacidade}.`);
  }

   if (!reservas.length) {
    alertas.push("Bloco operacional sem reservas vinculadas.");
  } else {
    detalhes.push(
      `Bloco operacional ${item.escalaCodigo} / ${item.veiculo || "-"} com ${reservas.length} reserva(s) e ${totalPax} pax.`,
    );
  }

  if (reservas.length > 1) {
    detalhes.push(
      `Mais de uma reserva foi consolidada no mesmo veículo e na mesma escala para validar a lotação real do carro.`,
    );
  }

  let status = "ok";
  let resumo = "Bloco operacional validado.";

  if (motivos.length) {
    status = "critico";
    resumo = motivos[0];
  } else if (
    alertas.some((texto) =>
      String(texto).includes("Diferença entre Phoenix e aeroporto"),
    )
  ) {
    status = "divergencia";
    resumo = alertas.find((texto) =>
      String(texto).includes("Diferença entre Phoenix e aeroporto"),
    );
  } else if (alertas.length) {
    status = "ok";
    resumo = alertas[0];
  } else if (detalhes.length) {
    resumo = detalhes[0];
  }

  return {
    status,
    resumo,
    motivos,
    alertas,
    detalhes,
    capacidade,
    totalPax,
    matchEncontrado: !!airportMatch,
    matchMode,
    chavesTentadas: flightKeys,
    horarioAeroportoPrevisto,
    horarioAeroportoOperacional,
    diferencaMinutos: diff,
    statusAeroportoLabel,
    companhia,
    aeroportoOrigemDestino,
  };
};

const buildSummary = (rows = []) => ({
  totalServicos: rows.length,
  ok: rows.filter((r) => r?.diagnostico?.status === "ok").length,
  divergencia: rows.filter((r) => r?.diagnostico?.status === "divergencia")
    .length,
  critico: rows.filter((r) => r?.diagnostico?.status === "critico").length,
  semMatch: rows.filter(
    (r) =>
      (r.tipo === "IN" || r.tipo === "OUT") && !r?.diagnostico?.matchEncontrado,
  ).length,
});

function BlocoResumo({ resumo, abaAtiva }) {
  return (
    <div className="previa-operacional-card">
      <div className="previa-operacional-card-header">
        <div className="previa-operacional-card-title-row">
          <h3>
            <BadgeRounded fontSize="small" />
            Resumo do Robô — {abaAtiva}
          </h3>
        </div>
      </div>

      <div
        className="previa-operacional-kpis"
        style={{ gridTemplateColumns: "repeat(5, minmax(110px,1fr))" }}
      >
        {[
          [
            "Serviços",
            resumo?.totalServicos || 0,
            <DirectionsBusRounded fontSize="small" />,
          ],
          ["OK", resumo?.ok || 0, <CheckCircleRounded fontSize="small" />],
          [
            "Alerta",
            resumo?.divergencia || 0,
            <WarningAmberRounded fontSize="small" />,
          ],
          ["Crítico", resumo?.critico || 0, <ErrorRounded fontSize="small" />],
          [
            "Sem match",
            resumo?.semMatch || 0,
            <SearchRounded fontSize="small" />,
          ],
        ].map(([label, value, icon]) => (
          <div className="previa-operacional-kpi" key={label}>
            <div className="previa-operacional-kpi-icon">{icon}</div>
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TabsTipoServico({ abaAtiva, setAbaAtiva, contagemPorAba }) {
  return (
    <div className="previa-operacional-actions" style={{ marginBottom: 18 }}>
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={
            abaAtiva === tab.key
              ? "previa-operacional-btn-primary"
              : "previa-operacional-btn-soft"
          }
          onClick={() => setAbaAtiva(tab.key)}
        >
          {tab.label} ({contagemPorAba[tab.key] || 0})
        </button>
      ))}
    </div>
  );
}

const getCardSemaforoStyle = (status = "") => {
  if (status === "ok") {
    return {
      border: "1px solid color-mix(in srgb, var(--p3) 26%, transparent 74%)",
      boxShadow: "inset 4px 0 0 var(--p3)",
      background:
        "linear-gradient(90deg, color-mix(in srgb, var(--p3) 12%, transparent 88%) 0%, var(--card) 12%, var(--card) 100%)",
    };
  }

  if (status === "divergencia") {
    return {
      border: "1px solid rgba(245, 158, 11, 0.26)",
      boxShadow: "inset 4px 0 0 #f59e0b",
      background:
        "linear-gradient(90deg, rgba(245, 158, 11, 0.12) 0%, var(--card) 12%, var(--card) 100%)",
    };
  }

  if (status === "critico") {
    return {
      border: "1px solid rgba(239, 68, 68, 0.26)",
      boxShadow: "inset 4px 0 0 #ef4444",
      background:
        "linear-gradient(90deg, rgba(239, 68, 68, 0.12) 0%, var(--card) 12%, var(--card) 100%)",
    };
  }

  return {
    border: "1px solid var(--border)",
    boxShadow: "inset 4px 0 0 #94a3b8",
    background:
      "linear-gradient(90deg, rgba(148, 163, 184, 0.10) 0%, var(--card) 12%, var(--card) 100%)",
  };
};

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
    <div className="previa-operacional-card previa-operacional-card-full">
      <div className="previa-operacional-card-header">
        <div className="previa-operacional-card-title-row">
          <h3>
            <DirectionsBusRounded fontSize="small" />
            Serviços escalados
          </h3>
          <span className="previa-operacional-badge">
            {lista.length} serviço(s)
          </span>
        </div>
       <p>
  Conferência consolidada por veículo escalado + número da escala, mantendo
  as reservas agrupadas no mesmo bloco operacional.
</p>
      </div>

      {!lista.length ? (
        <div className="previa-operacional-empty">
          Nenhum serviço encontrado nessa aba.
        </div>
      ) : (
        <div className="painel-chegadas-list">
          {lista.map((item) => {
            const expandido = !!expandidos[item.id];
            const roboId = item?.__roboId || item.id;
            const roboResultado =
              resultadoPorServico[roboId] || item?.diagnostico;
            const estaAnalisando =
              roboRodando && filaServicos[indiceAtualRobo]?.__roboId === roboId;

            const statusFinal = roboResultado?.status || "sem-info";
            const resumoFinal = roboResultado?.resumo || "Sem diagnóstico";

            return (
              <div
                key={item.id}
                className="painel-chegadas-flight-card"
                style={getCardSemaforoStyle(statusFinal)}
              >
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
                        {item.escalaCodigo || item.escalaLabel || `ESCALA ${item.escalaId || "-"}`}
                      </strong>

                      <span className={`painel-chegadas-status ${getClasse(statusFinal)}`}>
                        {getRotuloStatus(statusFinal)}
                      </span>

                      {estaAnalisando && (
                        <span className="painel-chegadas-status status-semaforo-amarelo">
                          Analisando...
                        </span>
                      )}
                    </div>

                    <div className="painel-chegadas-scale-summary">
                      {resumoFinal}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                        marginBottom: 10,
                      }}
                    >
                      {(item.tipo === "IN" || item.tipo === "OUT") && (
                        <button
                          type="button"
                          className="painel-chegadas-google-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            abrirBuscaGoogleVooPhoenix(item.vooPrincipal);
                          }}
                        >
                          <SearchRounded fontSize="small" />
                          Buscar voo
                        </button>
                      )}
                    </div>

                    <div className="painel-chegadas-flight-meta">
                      <span>Tipo: {item.tipo}</span>
                      <span>Serviço: {item.serviceName || "-"}</span>
                      <span>Escala: {item.escalaCodigo || "-"}</span>

                      {(item.tipo === "IN" || item.tipo === "OUT") && (
                        <>
                          <span>Voo: {formatarCodigoVooExibicao(item.vooPrincipal)}</span>
                          {horarioValido(item.horarioPhoenix) && (
                            <span>Phoenix: {item.horarioPhoenix}</span>
                          )}
                          <span>API previsto: {roboResultado?.horarioAeroportoPrevisto || "--:--"}</span>
                          <span>API operacional: {roboResultado?.horarioAeroportoOperacional || "--:--"}</span>
                          <span>Diferença: {formatarDiff(roboResultado?.diferencaMinutos)}</span>
                          <span>Status API: {roboResultado?.statusAeroportoLabel || "-"}</span>
                          <span>Match: {roboResultado?.matchEncontrado ? "Sim" : "Não"}</span>
                        </>
                      )}

                      <span>Veículo: {item.veiculo || "-"}</span>
                      <span>Motorista: {item.motorista || "-"}</span>
                      <span>Pax escala: {item.totalPax || 0}</span>
                      <span>
                        ADT/CHD/INF: {item.paxBreakdown.adt}/{item.paxBreakdown.chd}/{item.paxBreakdown.inf}
                      </span>
                    </div>

                    <div className="painel-chegadas-scale-summary">
                      {resumoFinal}
                    </div>

                    <div className="painel-chegadas-flight-meta">

                      {/* TIPO */}
                      <span>Tipo: {item.tipo}</span>

                      {/* ESCALA */}
                      <span>Escala: {item.escalaCodigo}</span>

                      {/* 🚀 VOO (PRINCIPAL) */}
                      {(item.tipo === "IN" || item.tipo === "OUT") && (
                        <span style={{ fontWeight: 600 }}>
                          ✈ {item.vooPrincipal || "Sem voo"}
                        </span>
                      )}

                      {/* ⏱ HORÁRIO */}
                      {horarioValido(item.horarioPhoenix) && (
                        <span>Phoenix: {item.horarioPhoenix}</span>
                      )}

                      {/* 🚨 ALERTA DE DIFERENÇA (SÓ SE EXISTIR) */}
                      {roboResultado?.diferencaMinutos !== null &&
                        Math.abs(roboResultado.diferencaMinutos) > 30 && (
                          <span className="robo-chip-alerta">
                            ⚠ Diferença: {formatarDiff(roboResultado.diferencaMinutos)}
                          </span>
                        )}

                      {/* ❌ CRÍTICO */}
                      {statusFinal === "critico" && (
                        <span className="robo-chip-critico">
                          ❌ {roboResultado?.resumo}
                        </span>
                      )}

                      {/* VEÍCULO */}
                      <span>🚐 {item.veiculo || "-"}</span>

                      {/* PAX */}
                      <span>
                        👥 {item.totalPax} pax
                      </span>

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
                          <strong>
                            {roboResultado?.companhia ||
                              item.serviceName ||
                              item.tipo ||
                              "-"}
                          </strong>
                        </div>
                      </div>

                      <div className="painel-chegadas-driver-meta">
                        <span>
                          Escala: {item.escalaLabel || item.escalaId || "-"}
                        </span>
                        <span>Tipo: {item.tipo || "-"}</span>
                        <span>Veículo: {item.veiculo || "-"}</span>
                        <span>Motorista: {item.motorista || "-"}</span>
                        <span>Pax total da escala: {item.totalPax || 0}</span>
                        <span>
                          Capacidade identificada:{" "}
                          {roboResultado?.capacidade ?? "Não cadastrada"}
                        </span>
                      </div>

                      {!!roboResultado?.motivos?.length && (
                        <div className="painel-chegadas-driver-meta">
                          {roboResultado.motivos.map((texto, idx) => (
                            <span
                              key={`${roboId}_motivo_${idx}`}
                              className="robo-chip-critico"
                            >
                              ✖ {texto}
                            </span>
                          ))}
                        </div>
                      )}

                      {!!roboResultado?.alertas?.length && (
                        <div className="painel-chegadas-driver-meta">
                          {roboResultado.alertas.map((texto, idx) => (
                            <span
                              key={`${roboId}_alerta_${idx}`}
                              className="robo-chip-alerta"
                            >
                              ⚠ {texto}
                            </span>
                          ))}
                        </div>
                      )}

                      {!!roboResultado?.detalhes?.length && (
                        <div className="painel-chegadas-driver-meta">
                          {roboResultado.detalhes.map((texto, idx) => (
                            <span
                              key={`${roboId}_detalhe_${idx}`}
                              className="robo-chip-ok"
                            >
                              • {texto}
                            </span>
                          ))}
                        </div>
                      )}

                      {!!roboResultado?.chavesTentadas?.length &&
                        !roboResultado?.matchEncontrado && (
                          <div className="painel-chegadas-driver-meta">
                            <span>
                              Critérios tentados para localizar voo:{" "}
                              {roboResultado.chavesTentadas.join(", ")}
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
                            <span>ADT/CHD/INF: {r.paxLabel}</span>
                            <span>Voo reserva: {formatarCodigoVooExibicao(r.vooReserva)}</span>
                            <span>Horário Phoenix: {r.horarioPhoenix || "--:--"}</span>
                            <span>OBS: {r.observacao || "-"}</span>
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

export default function RoboConferenteOperacional() {
  const [dataSelecionada, setDataSelecionada] = useState(getHojeIso());
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [fornecedores, setFornecedores] = useState([]);
  const [abaAtiva, setAbaAtiva] = useState("IN");
  const [roboRodando, setRoboRodando] = useState(false);
  const [indiceAtualRobo, setIndiceAtualRobo] = useState(-1);
  const [resultadoPorServico, setResultadoPorServico] = useState({});
  const [airportData, setAirportData] = useState({
    arrivals: [],
    departures: [],
  });
 const [servicosPhoenix, setServicosPhoenix] = useState([]);

const carregar = useCallback(async () => {
  try {
    setLoading(true);
    setErro("");

    const [respPhoenix, respArrivals, respDepartures] = await Promise.all([
      fetch(montarUrlPhoenixReserveService(dataSelecionada), {
        method: "GET",
        headers: { Accept: "application/json" },
      }),
      fetch(`${API_AEROPORTO}/api/aeroporto/arrivals`, {
        method: "GET",
        headers: { Accept: "application/json" },
      }),
      fetch(`${API_AEROPORTO}/api/aeroporto/departures`, {
        method: "GET",
        headers: { Accept: "application/json" },
      }),
    ]);

    if (!respPhoenix.ok) {
      const txt = await respPhoenix.text().catch(() => "");
      throw new Error(`Falha ao consultar Phoenix. ${txt}`);
    }

    if (!respArrivals.ok || !respDepartures.ok) {
      throw new Error("Falha ao consultar dados do aeroporto.");
    }

    const jsonPhoenix = await respPhoenix.json();
    const jsonArrivals = await respArrivals.json();
    const jsonDepartures = await respDepartures.json();

    const listaServicos = extrairListaResposta(jsonPhoenix);

    setServicosPhoenix(listaServicos);
    setAirportData({
      arrivals: normalizeAirportPayload(jsonArrivals?.data || []),
      departures: normalizeAirportPayload(jsonDepartures?.data || []),
    });

    setResultadoPorServico({});
    setIndiceAtualRobo(-1);
    setRoboRodando(false);
  } catch (error) {
    console.error("Erro ao carregar conferente:", error);
    setErro(error.message || "Não foi possível carregar os dados do robô.");
  } finally {
    setLoading(false);
  }
}, [dataSelecionada]);

  useEffect(() => {
    carregar();
  }, [carregar]);

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

  const vehicleIndex = useMemo(
    () => buildVehicleIndex(fornecedores),
    [fornecedores],
  );

  const arrivalsByNumber = useMemo(
    () => buildAirportMapByNumber(airportData.arrivals),
    [airportData.arrivals],
  );

  const departuresByNumber = useMemo(
    () => buildAirportMapByNumber(airportData.departures),
    [airportData.departures],
  );

const servicosAgrupados = useMemo(
  () => buildGroupedServices(servicosPhoenix),
  [servicosPhoenix],
);

  const servicosBase = useMemo(() => {
    return servicosAgrupados.map((item, index) => ({
      ...item,
      __roboId: item?.id || `servico_${index}`,
      diagnostico: buildDiagnostico({
        item,
        vehicleIndex,
        airportFlights:
          item.tipo === "IN" ? airportData.arrivals : airportData.departures,
        airportMapByNumber:
          item.tipo === "IN" ? arrivalsByNumber : departuresByNumber,
      }),
    }));
  }, [
    servicosAgrupados,
    vehicleIndex,
    airportData.arrivals,
    airportData.departures,
    arrivalsByNumber,
    departuresByNumber,
  ]);

  const contagemPorAba = useMemo(() => {
    const counts = { IN: 0, OUT: 0, PASSEIO: 0, TRANSFER: 0 };
    servicosBase.forEach((item) => {
      counts[item.tipo] = (counts[item.tipo] || 0) + 1;
    });
    return counts;
  }, [servicosBase]);

  const listaFiltrada = useMemo(
    () => servicosBase.filter((item) => item.tipo === abaAtiva),
    [servicosBase, abaAtiva],
  );

  const resumoAba = useMemo(() => buildSummary(listaFiltrada), [listaFiltrada]);

  const rodarRoboServicoPorServico = async () => {
    if (!listaFiltrada.length || roboRodando) return;

    setRoboRodando(true);
    setIndiceAtualRobo(-1);

    for (let i = 0; i < listaFiltrada.length; i += 1) {
      const item = listaFiltrada[i];
      const roboId = item.__roboId;

      setIndiceAtualRobo(i);
      setResultadoPorServico((prev) => ({
        ...prev,
        [roboId]: item.diagnostico,
      }));

      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    setIndiceAtualRobo(-1);
    setRoboRodando(false);
  };

  return (
    <div className="previa-operacional-page robo-conferente-page">
      <div className="previa-operacional-header">
        <h2 className="previa-operacional-title">
          <SearchRounded fontSize="small" />
          Robô Conferente Operacional
        </h2>
        <p className="previa-operacional-subtitle">
          Estilo alinhado ao padrão do sistema e regra de over calculada por
          escala operacional.
        </p>
      </div>

      <TabsTipoServico
        abaAtiva={abaAtiva}
        setAbaAtiva={setAbaAtiva}
        contagemPorAba={contagemPorAba}
      />

      <div className="previa-operacional-grid robo-conferente-grid">
        <div className="previa-operacional-card previa-operacional-card-large">
          <div className="previa-operacional-card-header">
            <div className="previa-operacional-card-title-row">
              <h3>Parâmetros</h3>
              <span className="previa-operacional-badge">
                {formatarDataBr(dataSelecionada)}
              </span>
            </div>
          </div>

          <div className="previa-operacional-toolbar">
            <div className="previa-operacional-field">
              <label>
                <CalendarMonthRounded fontSize="small" />
                Data da conferência
              </label>
              <input
                className="previa-operacional-input"
                type="date"
                value={dataSelecionada}
                onChange={(e) => setDataSelecionada(e.target.value)}
                disabled={loading || roboRodando}
              />
            </div>

            <div className="previa-operacional-actions">
              <button
                type="button"
                className="previa-operacional-btn-primary"
                onClick={carregar}
                disabled={loading || roboRodando}
              >
                {loading ? (
                  <SyncRounded className="spin" fontSize="small" />
                ) : (
                  <RefreshRounded fontSize="small" />
                )}
                Atualizar dados
              </button>

              <button
                type="button"
                className="previa-operacional-btn-soft"
                onClick={rodarRoboServicoPorServico}
                disabled={loading || roboRodando || !listaFiltrada.length}
              >
                {roboRodando ? (
                  <SyncRounded className="spin" fontSize="small" />
                ) : (
                  <SearchRounded fontSize="small" />
                )}
                {roboRodando ? "Rodando robô..." : `Rodar robô — ${abaAtiva}`}
              </button>
            </div>
          </div>
        </div>

        <BlocoResumo resumo={resumoAba} abaAtiva={abaAtiva} />
      </div>

      {erro ? (
        <div className="previa-operacional-card" style={{ marginTop: 18 }}>
          <div className="previa-operacional-empty">{erro}</div>
        </div>
      ) : null}

      <div style={{ marginTop: 18 }}>
        <ListaServicosEscalados
          lista={listaFiltrada}
          roboRodando={roboRodando}
          indiceAtualRobo={indiceAtualRobo}
          filaServicos={listaFiltrada}
          resultadoPorServico={resultadoPorServico}
        />
      </div>
    </div>
  );
}
