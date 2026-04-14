import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT || 3001);
const AIRPORT_TOKEN =
  process.env.AIRPORT_TOKEN || "EuRMGba5TA85hKvzR5-dE37k2_UGFNKrGe1hEKGlVGQ";
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 60000);
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 12000);
const MAX_RETRIES = Number(process.env.MAX_RETRIES || 2);

const PHOENIX_ROADMAP_URL =
  process.env.PHOENIX_ROADMAP_URL ||
  "https://driversalvador.phoenix.comeialabs.com/scale/roadmap";

const AIRPORT_BASE_URL =
  "https://www.salvador-airport.com.br/pt-br/api/flights";

const PHOENIX_ROADMAP_EXPAND =
  "driver,serviceOrder,serviceOrder.vehicle,regionOrigin,regionDestination,reserveService,reserveService.service,reserveService.reserve,reserveService.reserve.customer,reserveService.schedule";

const cache = {
  arrivals: { data: null, updatedAt: 0, lastError: null },
  departures: { data: null, updatedAt: 0, lastError: null },
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isValidCache(entry) {
  return !!entry?.data && Date.now() - entry.updatedAt < CACHE_TTL_MS;
}

function buildAirportUrl(type) {
  const params = new URLSearchParams({
    token: AIRPORT_TOKEN,
    type,
  });
  return `${AIRPORT_BASE_URL}?${params.toString()}`;
}

function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function extractIso(value = "") {
  const str = String(value || "").trim();
  const match = str.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  if (match) return match[0];

  const matchDate = str.match(/^(\d{4}-\d{2}-\d{2})/);
  if (matchDate) return `${matchDate[1]}T00:00:00`;

  return "";
}

function formatHour(value = "") {
  if (!value) return "--:--";

  const iso = extractIso(value);
  if (iso) return iso.slice(11, 16);

  const str = String(value || "");
  const match = str.match(/(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : "--:--";
}

function toMinutes(value = "") {
  const hhmm = formatHour(value);
  if (!hhmm || hhmm === "--:--") return null;

  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;

  return h * 60 + m;
}

function diffMinutes(baseValue = "", compareValue = "") {
  const base = toMinutes(baseValue);
  const compare = toMinutes(compareValue);

  if (base === null || compare === null) return null;
  return compare - base;
}

function normalizeAirportPayload(payload) {
  if (!Array.isArray(payload)) return [];

  return payload.map((item) => ({
    ScheduleTime: item?.ScheduleTime || "",
    FormattedTime: item?.FormattedTime || "",
    Airport: String(item?.Airport || "").trim(),
    Airliner: String(item?.Airliner || "").trim(),
    Number: String(item?.Number || "").trim(),
    Status: String(item?.Status || "").trim(),
    StatusT: String(item?.StatusT || "").trim(),
    GateSector: String(item?.GateSector || "").trim(),
    Route: String(item?.Route || "").trim(),
    OperationTime: item?.OperationTime || "",
    AircraftType: String(item?.AircraftType || "").trim(),
    Registration: String(item?.Registration || "").trim(),
    Observations: String(item?.Observations || "").trim(),
    Stopovers: item?.Stopovers || null,
  }));
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "Luck-Conferente-Voos/1.0",
      },
      signal: controller.signal,
    });

    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function buildPhoenixRoadmapUrl(date) {
  const url = new URL(PHOENIX_ROADMAP_URL);
  url.searchParams.append("expand", PHOENIX_ROADMAP_EXPAND);
  url.searchParams.append("date", date);
  return url.toString();
}

async function fetchPhoenixRoadmap(date) {
  const url = buildPhoenixRoadmapUrl(date);
  console.log("Buscando roadmap Phoenix:", url);

  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Phoenix roadmap HTTP ${response.status} - ${body}`);
  }

  const json = await response.json();

  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.results)) return json.results;

  console.log("Roadmap Phoenix retornou formato inesperado:", json);
  return [];
}

async function fetchAirportFlights(type) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt += 1) {
    try {
      const url = buildAirportUrl(type);
      console.log(`Buscando aeroporto [${type}] tentativa ${attempt}:`, url);

      const response = await fetchWithTimeout(url, REQUEST_TIMEOUT_MS);

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Airport ${type} HTTP ${response.status} - ${body}`);
      }

      const json = await response.json();
      const normalizado = normalizeAirportPayload(json);

      console.log(`Aeroporto [${type}] retornou ${normalizado.length} voo(s)`);
      return normalizado;
    } catch (error) {
      console.error(`Erro aeroporto [${type}] tentativa ${attempt}:`, error);
      lastError = error;

      if (attempt <= MAX_RETRIES) {
        await sleep(500 * attempt);
      }
    }
  }

  throw lastError;
}

async function getAirportData(type, forceRefresh = false) {
  const entry = cache[type];

  if (!forceRefresh && isValidCache(entry)) {
    return entry.data;
  }

  const data = await fetchAirportFlights(type);
  entry.data = data;
  entry.updatedAt = Date.now();
  entry.lastError = null;

  return data;
}

function detectConferenceType(reserveService = {}) {
  const rawType =
    reserveService?.service_type ??
    reserveService?.serviceType ??
    reserveService?.service?.type ??
    reserveService?.service?.service_type;

  const type = String(rawType || "").trim();

  if (type === "1") return "IN";
  if (type === "2") return "OUT";

  const serviceName = normalizeText(
    reserveService?.service?.name ||
      reserveService?.service?.nickname ||
      reserveService?.service_name ||
      "",
  );

  if (serviceName.includes("in")) return "IN";
  if (serviceName.includes("out")) return "OUT";

  return "";
}

function extractReserveServicesFromRoadmapItem(item = {}) {
  const value = item?.reserveService;

  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];

  return [];
}

function extractFlightCode(item = {}) {
  return (
    item?.reserve?.flight_code ||
    item?.reserve?.flight?.code ||
    item?.reserve?.arrival_flight_code ||
    item?.reserve?.departure_flight_code ||
    item?.flight_code ||
    item?.flight?.code ||
    item?.flightNumber ||
    item?.schedule?.name ||
    ""
  );
}

function extractFlightTimeIn(item = {}) {
  return (
    item?.reserve?.flight?.arrival_time ||
    item?.reserve?.flight?.scheduled_time ||
    item?.reserve?.flight_time ||
    item?.reserve?.arrival_flight_time ||
    item?.schedule?.presentation_hour ||
    item?.presentation_hour ||
    ""
  );
}

function extractFlightTimeOut(item = {}) {
  return (
    item?.reserve?.flight?.departure_time ||
    item?.reserve?.flight?.scheduled_departure ||
    item?.reserve?.flight_time ||
    item?.reserve?.departure_flight_time ||
    item?.schedule?.presentation_hour ||
    item?.presentation_hour ||
    ""
  );
}

function extractPassengerName(item = {}) {
  return (
    item?.reserve?.customer?.name ||
    item?.customer?.name ||
    item?.reserve?.holder_name ||
    item?.passenger_name ||
    "Cliente não informado"
  );
}

function extractReservationCode(item = {}) {
  return (
    item?.reserve?.code ||
    item?.reserve_code ||
    item?.code ||
    item?.reserve?.id ||
    "-"
  );
}

function extractPax(item = {}) {
  return (
    Number(item?.is_adult_count || 0) +
    Number(item?.is_child_count || 0) +
    Number(item?.is_baby_count || item?.is_infant_count || 0)
  );
}

function extractVehicleFromRoadmapItem(item = {}) {
  return (
    item?.serviceOrder?.vehicle?.nickname ||
    item?.serviceOrder?.vehicle?.name ||
    item?.serviceOrder?.vehicle?.prefix ||
    item?.serviceOrder?.vehicle?.plate ||
    ""
  );
}

function extractDriverFromRoadmapItem(item = {}) {
  return item?.driver?.nickname || item?.driver?.name || "";
}

function extractRoadmapId(item = {}) {
  return item?.id || item?.roadmap_id || item?.roadmapId || "";
}

function normalizeDigits(value = "") {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return String(Number(digits));
}

function extractFlightNumberForMatch(code = "") {
  const digits = String(code || "").replace(/\D/g, "");
  if (!digits) return "";
  const last4 = digits.slice(-4);
  return String(Number(last4));
}

function classifyDifference(diff) {
  if (diff === null) {
    return {
      key: "sem-info",
      label: "Sem comparação",
      severity: 0,
    };
  }

  const abs = Math.abs(diff);

  if (abs <= 10) {
    return {
      key: "ok",
      label: "Ok",
      severity: 1,
    };
  }

  if (abs <= 30) {
    return {
      key: "divergencia",
      label: "Divergência",
      severity: 2,
    };
  }

  return {
    key: "critico",
    label: "Crítico",
    severity: 3,
  };
}

function buildAirportMap(airportFlights = []) {
  return airportFlights.reduce((acc, flight) => {
    const number = normalizeDigits(flight?.Number || "");
    if (!number) return acc;
    if (!acc[number]) acc[number] = [];
    acc[number].push(flight);
    return acc;
  }, {});
}

function findBestAirportMatch({ flightCode, systemTime, airportMap }) {
  const normalizedFlightNumber = extractFlightNumberForMatch(flightCode);
  const candidates = airportMap[normalizedFlightNumber] || [];

  if (!candidates.length) {
    return {
      normalizedFlightNumber,
      bestMatch: null,
      candidates: [],
    };
  }

  const bestMatch = [...candidates].sort((a, b) => {
    const diffA = Math.abs(
      diffMinutes(systemTime, a?.ScheduleTime || a?.OperationTime || "") ??
        9999,
    );

    const diffB = Math.abs(
      diffMinutes(systemTime, b?.ScheduleTime || b?.OperationTime || "") ??
        9999,
    );

    return diffA - diffB;
  })[0];

  return {
    normalizedFlightNumber,
    bestMatch,
    candidates,
  };
}

function normalizeAirportStatus(status = "") {
  const s = normalizeText(status);

  if (s.includes("cancel")) return { key: "cancelado", label: "Cancelado" };
  if (s.includes("atras")) return { key: "atrasado", label: "Atrasado" };
  if (s.includes("confirm")) return { key: "confirmado", label: "Confirmado" };
  if (s.includes("previst") || s.includes("expect")) {
    return { key: "previsto", label: "Previsto" };
  }

  return { key: "sem-info", label: status || "Sem informação" };
}

function buildRoadmapConferenceRows(roadmaps = []) {
  const rows = [];

  for (const roadmap of Array.isArray(roadmaps) ? roadmaps : []) {
    const reserveServices = extractReserveServicesFromRoadmapItem(roadmap);

    if (!Array.isArray(reserveServices) || reserveServices.length === 0) {
      continue;
    }

    for (const reserveService of reserveServices) {
      if (!reserveService || typeof reserveService !== "object") continue;

      const tipo = detectConferenceType(reserveService);
      if (!tipo) continue;

      rows.push({
        tipo,
        roadmapId: extractRoadmapId(roadmap),
        escalaId: extractRoadmapId(roadmap),
        veiculo: extractVehicleFromRoadmapItem(roadmap),
        motorista: extractDriverFromRoadmapItem(roadmap),
        raw: reserveService,
      });
    }
  }

  return rows;
}

function groupConferenceRowsByScale(rows = []) {
  const grouped = {};

  for (const row of rows) {
    const escalaId = String(row.escalaId || row.roadmapId || "sem-escala");
    const key = `${row.tipo}__${escalaId}`;

    if (!grouped[key]) {
      grouped[key] = {
        id: key,
        escalaId,
        tipo: row.tipo,
        vooSistema: row.vooSistema,
        numeroNormalizado: row.numeroNormalizado,
        horarioPhoenix: row.horarioPhoenix,
        horarioAeroportoPrevisto: row.horarioAeroportoPrevisto,
        horarioAeroportoOperacional: row.horarioAeroportoOperacional,
        diferencaMinutos: row.diferencaMinutos,
        classificacao: row.classificacao,
        matchEncontrado: row.matchEncontrado,
        statusAeroporto: row.statusAeroporto,
        statusAeroportoLabel: row.statusAeroportoLabel,
        aeroportoOrigemDestino: row.aeroportoOrigemDestino,
        companhia: row.companhia,
        observacoes: row.observacoes,
        reservas: [],
        totalPax: 0,
        veiculo: row.veiculo || "",
        motorista: row.motorista || "",
      };
    }

    grouped[key].reservas.push({
      reserva: row.reserva,
      cliente: row.cliente,
      pax: row.pax,
      veiculo: row.veiculo || "",
      vooReserva: row.vooSistema || "",
    });

    grouped[key].totalPax += Number(row.pax || 0);

    if (!grouped[key].veiculo && row.veiculo) {
      grouped[key].veiculo = row.veiculo;
    }

    if (!grouped[key].motorista && row.motorista) {
      grouped[key].motorista = row.motorista;
    }

    if (!grouped[key].vooSistema && row.vooSistema) {
      grouped[key].vooSistema = row.vooSistema;
    }

    if (
      (row.classificacao?.severity || 0) >
      (grouped[key].classificacao?.severity || 0)
    ) {
      grouped[key].classificacao = row.classificacao;
      grouped[key].diferencaMinutos = row.diferencaMinutos;
      grouped[key].horarioPhoenix = row.horarioPhoenix;
      grouped[key].horarioAeroportoPrevisto = row.horarioAeroportoPrevisto;
      grouped[key].horarioAeroportoOperacional =
        row.horarioAeroportoOperacional;
      grouped[key].statusAeroporto = row.statusAeroporto;
      grouped[key].statusAeroportoLabel = row.statusAeroportoLabel;
      grouped[key].aeroportoOrigemDestino = row.aeroportoOrigemDestino;
      grouped[key].companhia = row.companhia;
      grouped[key].observacoes = row.observacoes;
      grouped[key].matchEncontrado = row.matchEncontrado;
    }
  }

  return Object.values(grouped).sort((a, b) => {
    if ((b.classificacao?.severity || 0) !== (a.classificacao?.severity || 0)) {
      return (
        (b.classificacao?.severity || 0) - (a.classificacao?.severity || 0)
      );
    }

    return String(a.escalaId).localeCompare(String(b.escalaId));
  });
}

function buildConferenceRowsFromOperationalRows({ rows, airportFlights }) {
  const airportMap = buildAirportMap(airportFlights);

  const built = rows.map((row) => {
    const item = row.raw || {};
    const flightCode = extractFlightCode(item);

    const systemTimeRaw =
      row.tipo === "IN"
        ? extractFlightTimeIn(item)
        : extractFlightTimeOut(item);

    const systemTime =
      systemTimeRaw && systemTimeRaw !== ""
        ? systemTimeRaw
        : item?.schedule?.presentation_hour || "";

    const { normalizedFlightNumber, bestMatch } = findBestAirportMatch({
      flightCode,
      systemTime,
      airportMap,
    });

    const horarioValido = (valor = "") => {
      const hora = String(valor || "").trim();
      return hora && hora !== "--:--" && hora !== "00:00";
    };

    const airportScheduled = bestMatch?.ScheduleTime || "";
    const airportOperational = bestMatch?.OperationTime || "";
    const diff = systemTime
      ? diffMinutes(systemTime, airportOperational || airportScheduled)
      : null;

    const classification = bestMatch
      ? {
          key: "ok",
          label: "Voo localizado",
          severity: 1,
        }
      : {
          key: "divergencia",
          label: "Voo não localizado",
          severity: 2,
        };

    const status = normalizeAirportStatus(bestMatch?.Status || "");

    return {
      id: `${row.tipo}_${row.roadmapId}_${extractReservationCode(item)}`,
      escalaId: row.roadmapId || "",
      tipo: row.tipo,
      vooSistema:
        String(flightCode || "")
          .trim()
          .toUpperCase() || "SEM VOO",
      numeroNormalizado: normalizedFlightNumber || "",
      horarioPhoenix: formatHour(systemTime),
      horarioAeroportoPrevisto: formatHour(airportScheduled),
      horarioAeroportoOperacional: formatHour(airportOperational),
      diferencaMinutos: diff,
      classificacao: classification,
      matchEncontrado: !!bestMatch,
      statusAeroporto: bestMatch?.Status || "",
      statusAeroportoLabel: status.label,
      aeroportoOrigemDestino: bestMatch?.Airport || "-",
      companhia: bestMatch?.Airliner || "-",
      observacoes: bestMatch?.Observations || "",
      reserva: extractReservationCode(item),
      cliente: extractPassengerName(item),
      pax: extractPax(item),
      motorista: row.motorista || "",
      veiculo: row.veiculo || "",
    };
  });

  return groupConferenceRowsByScale(built);
}

function buildSummary(rows = []) {
  return {
    totalServicos: rows.length,
    ok: rows.filter((r) => r.classificacao?.key === "ok").length,
    divergencia: rows.filter((r) => r.classificacao?.key === "divergencia")
      .length,
    critico: rows.filter((r) => r.classificacao?.key === "critico").length,
    semMatch: rows.filter((r) => !r.matchEncontrado).length,
  };
}

app.get("/health", (req, res) => {
  return res.json({
    ok: true,
    service: "robo-conferente-voos",
    now: new Date().toISOString(),
  });
});

app.get("/api/aeroporto/arrivals", async (req, res) => {
  try {
    const data = await getAirportData("arrivals");
    return res.json({ ok: true, total: data.length, data });
  } catch (error) {
    console.error("Erro arrivals:", error);
    return res.status(502).json({
      ok: false,
      erro: "Falha ao consultar arrivals",
      detalhe: error?.message || "Erro desconhecido",
    });
  }
});

app.get("/api/aeroporto/departures", async (req, res) => {
  try {
    const data = await getAirportData("departures");
    return res.json({ ok: true, total: data.length, data });
  } catch (error) {
    console.error("Erro departures:", error);
    return res.status(502).json({
      ok: false,
      erro: "Falha ao consultar departures",
      detalhe: error?.message || "Erro desconhecido",
    });
  }
});

app.get("/api/conferente-voos", async (req, res) => {
  try {
    const date = String(req.query.date || "").trim();

    if (!date) {
      return res.status(400).json({
        ok: false,
        erro: "Informe a data no formato YYYY-MM-DD.",
      });
    }

    const [roadmaps, airportArrivals, airportDepartures] = await Promise.all([
      fetchPhoenixRoadmap(date),
      getAirportData("arrivals"),
      getAirportData("departures"),
    ]);

    const operationalRows = buildRoadmapConferenceRows(roadmaps);

    const rowsIn = operationalRows.filter((r) => r.tipo === "IN");
    const rowsOut = operationalRows.filter((r) => r.tipo === "OUT");

    const conferenciasIn = buildConferenceRowsFromOperationalRows({
      rows: rowsIn,
      airportFlights: airportArrivals,
    });

    const conferenciasOut = buildConferenceRowsFromOperationalRows({
      rows: rowsOut,
      airportFlights: airportDepartures,
    });

    const servicos = [...conferenciasIn, ...conferenciasOut].sort((a, b) => {
      if (
        (b.classificacao?.severity || 0) !== (a.classificacao?.severity || 0)
      ) {
        return (
          (b.classificacao?.severity || 0) - (a.classificacao?.severity || 0)
        );
      }
      return String(a.escalaId).localeCompare(String(b.escalaId));
    });

    return res.json({
      ok: true,
      date,
      summary: buildSummary(servicos),
      data: {
        servicos,
      },
    });
  } catch (error) {
    console.error("Erro conferente /api/conferente-voos:", error);
    return res.status(500).json({
      ok: false,
      erro: "Falha ao executar o robô conferente.",
      detalhe: error?.message || "Erro desconhecido",
      stack: process.env.NODE_ENV !== "production" ? error?.stack : undefined,
    });
  }
});

app.listen(PORT, () => {
  console.log(`🔥 Backend conferente rodando em http://localhost:${PORT}`);
});
