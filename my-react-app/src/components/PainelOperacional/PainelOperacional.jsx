import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

import {
  collection,
  doc,
  setDoc,
  query,
  where,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import { db } from "../../Services/Services/firebase";

import jsPDF from "jspdf";
import logoLuck from "../../assets/clover.png";
import "./painel.css";
import {
  Button,
  Card,
  CardHeader,
  Drawer,
  EmptyState,
  Field,
  FilterBar,
  Icon,
  KpiTiles,
  PageHeader,
  Segmented,
  StatusDot,
  Table,
  TableExpansion,
  TableHead,
  TableRow,
} from "../ui";
import { usePhoenixStatus } from "../Shell/shellContext";

// status do voo → tom e ícone (atrasado/cancelado em --alert)
// ícones da linha de OUT/Transfer (só apresentação)
const iconeTipoServico = (tipo = "") =>
  tipo === "TRANSFER" ? "navigation" : tipo === "IN" ? "planeLanding" : "planeTakeoff";

const iconeModalidade = (modalidade = "") => {
  const m = String(modalidade).toUpperCase();
  if (m.includes("PRIV")) return "user";
  if (m.includes("EXEC")) return "star";
  return "users";
};

const fornecedorInformado = (nome = "") => {
  const n = String(nome || "").trim().toLowerCase();
  return !!n && !n.includes("não informado") && !n.includes("nao informado");
};

const tomStatusVoo = (statusKey) => {
  switch (statusKey) {
    case "atrasado":
    case "pousado-atrasado":
    case "cancelado":
      return { tone: "alert", icon: "alert" };
    case "antecipado":
    case "pousado-antecipado":
      return { tone: "warning", icon: statusKey === "antecipado" ? "clock" : "planeLanding" };
    case "pousado":
      return { tone: "neutral", icon: "planeLanding" };
    case "no-horario":
      return { tone: "accent", icon: "circleCheck" };
    default:
      return { tone: "muted", icon: "clock" };
  }
};

const API_BASE =
  "https://driversalvador.phoenix.comeialabs.com/scale/reserve-service";

/* ---------------------------------------------------------
   Painel de chegadas do aeroporto de Salvador (mesmo backend
   que o Robô Conferente usa). Só é consultado quando a data
   do painel é HOJE, para conferir o status real dos voos.
   --------------------------------------------------------- */
const API_AEROPORTO = "https://guia-app.onrender.com";
const AEROPORTO_INTERVALO_MS = 5 * 60 * 1000; // atualiza sozinho a cada 5 min

// "G3 1234", "G31234", "AD-4512", "4512" → "4512".
// O código da companhia (2 caracteres, ex.: G3, 2Z) pode ter dígito,
// então ele sai antes de pegar só os números.
const numeroDoVoo = (valor = "") => {
  let texto = String(valor || "").toUpperCase().replace(/[\s-]+/g, "");
  if (/^([A-Z][A-Z0-9]|[0-9][A-Z])\d/.test(texto)) texto = texto.slice(2);
  const digitos = texto.replace(/\D/g, "");
  return digitos ? String(Number(digitos)) : "";
};

const normalizarChegadasAeroporto = (payload) =>
  (Array.isArray(payload) ? payload : []).map((item) => ({
    numero: numeroDoVoo(item?.Number),
    numeroBruto: String(item?.Number || "").trim(),
    companhia: String(item?.Airliner || "").trim(),
    origem: String(item?.Airport || item?.Route || "").trim(),
    previsto: item?.ScheduleTime || item?.FormattedTime || "",
    operacao: item?.OperationTime || "",
    status: String(item?.StatusT || item?.Status || "").trim(),
  }));

// mapa número do voo → lista de voos do painel do aeroporto
const indexarChegadasAeroporto = (lista = []) => {
  const mapa = new Map();
  lista.forEach((voo) => {
    if (!voo.numero) return;
    if (!mapa.has(voo.numero)) mapa.set(voo.numero, []);
    mapa.get(voo.numero).push(voo);
  });
  return mapa;
};

// mesmo número pode aparecer mais de uma vez: fica o de horário previsto mais próximo
const acharVooNoAeroporto = (mapa, codigoVoo, horarioPrevisto) => {
  const candidatos = mapa.get(numeroDoVoo(codigoVoo)) || [];
  if (candidatos.length <= 1) return candidatos[0] || null;

  const alvo = extrairHoraMinutos(horarioPrevisto);
  if (alvo === null) return candidatos[0];

  return [...candidatos].sort((a, b) => {
    const da = Math.abs((extrairHoraMinutos(a.previsto) ?? 9999) - alvo);
    const db = Math.abs((extrairHoraMinutos(b.previsto) ?? 9999) - alvo);
    return da - db;
  })[0];
};

const situacaoAeroporto = (status = "") => {
  const s = normalizarTexto(status);
  return {
    cancelado: s.includes("cancel"),
    pousado:
      s.includes("pous") ||
      s.includes("aterr") ||
      s.includes("chegou") ||
      s.includes("desembar") ||
      s.includes("landed") ||
      s.includes("arrived"),
  };
};

const EXPAND =
  "service,schedule,reserve,establishmentOrigin,establishmentDestination,establishmentOrigin.region,establishmentDestination.region,reserve.partner,reserve.customer,additionalReserveServices,additionalReserveServices.additional,additionalReserveServices.provider,roadmapService,roadmapService.roadmap,auxRoadmapService.roadmap,auxRoadmapService.roadmap.serviceOrder,auxRoadmapService.roadmap.serviceOrder.vehicle,auxRoadmapService.roadmap.driver,auxRoadmapService.roadmap.guide,roadmapService.roadmap.driver,roadmapService.roadmap.guide,roadmapService.roadmap.serviceOrder,roadmapService.roadmap.serviceOrder.vehicle,reserve.pdvPayment.user";

const SERVICOS_IGNORADOS = [
  "PASSEIO PRAIA DO FORTE 4H (LTN-VOLTA)",
  "IN  - LITORAL NORTE",
  "CITY TOUR PANORAMICO",
  "VOLTA FRADES COM ITAPARICA",
  "OUT -  LITORAL NORTE",
  "OUT - SALVADOR",
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

const resolverQuantidadePorPaginaColecao = (
  totalNomes,
  quantidadeSelecionada,
) => {
  const qtdSelecionada = Number(quantidadeSelecionada || 5);
  const total = Number(totalNomes || 0);

  if ([1, 2, 3, 4, 5, 6].includes(total)) {
    return total;
  }

  return qtdSelecionada;
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

  const ehTransfer = grupo.tipoServico === "TRANSFER";

  const linhas = [
    "Olá!",
    "",
    ehTransfer
      ? "TUDO CERTO PARA ESSE SERVIÇO ?"
      : "TUDO CERTO PARA ESSE OUT ?",
    "",
  ];

  const blocos = Array.isArray(grupo.hoteisOrdenados)
    ? grupo.hoteisOrdenados
    : [];

  const montarLinhasPassageiros = (reservas = []) => {
    const linhasPassageiros = [];

    reservas.forEach((reserva, index) => {
      const nome = String(
        reserva?.cliente || "PASSAGEIRO NÃO INFORMADO",
      ).trim();
      const telefone = String(reserva?.telefone || "").trim();
      const codigoReserva = String(reserva?.reserva || "").trim();
      const quantidade = formatarQuantidadeDetalhada(
        reserva?.adultos,
        reserva?.criancas,
        reserva?.infantes,
      );

      const partes = [`${index + 1}. ${nome}`];

      if (quantidade && quantidade !== "0 ADT") {
        partes.push(`(${quantidade})`);
      }

      if (telefone && telefone !== "-") {
        partes.push(`— ${telefone}`);
      }

      linhasPassageiros.push(partes.join(" "));
      linhasPassageiros.push(`-RESERVA: ${codigoReserva}`);
      linhasPassageiros.push("");
    });

    return linhasPassageiros;
  };

  if (blocos.length) {
    const mostrarContadorHotel = blocos.length > 1;

    blocos.forEach((hotel, index) => {
      const tituloHotel = mostrarContadorHotel
        ? `HOTEL ${index + 1}:`
        : "HOTEL:";

      const nomeLocal = ehTransfer
        ? `${hotel.hotelOrigemAbreviado || "ORIGEM NÃO INFORMADA"} → ${hotel.hotelDestinoAbreviado || "DESTINO NÃO INFORMADO"}`
        : hotel.hotelOrigemAbreviado || "HOTEL NÃO INFORMADO";

      linhas.push(
        `${tituloHotel} ${nomeLocal}* - *${hotel.horario || "--:--"}*`,
      );

      linhas.push(
        `QTD PAX: *${formatarQuantidadeDetalhada(
          hotel.totalAdultos,
          hotel.totalCriancas,
          hotel.totalInfantes,
        )}*`,
      );

      linhas.push("");
      linhas.push("PASSAGEIROS:");

      const linhasPassageiros = montarLinhasPassageiros(hotel.reservas);
      if (linhasPassageiros.length) {
        linhasPassageiros.forEach((linha) => linhas.push(linha));
      } else {
        linhas.push("-");
        linhas.push("");
      }
    });
  } else {
    linhas.push("HOTEL: HOTEL NÃO INFORMADO* - *--:--*");
    linhas.push("QTD PAX: *0 ADT*");
    linhas.push("");
    linhas.push("PASSAGEIROS:");
    linhas.push("-");
    linhas.push("");
  }

  linhas.push(`MODALIDADE: *${grupo.modalidade || "-"}*`);
  linhas.push("");
  linhas.push("Favor enviar a localização em real.");
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
  // "pousado ..." antes de "atras"/"antecip": senão "Pousado antecipado"
  // virava "Antecipado" e "Pousado com atraso" virava "Atrasado"
  if (s.includes("pousado com atraso")) return "pousado-atrasado";
  if (s.includes("pousado antecipado")) return "pousado-antecipado";
  if (s.includes("atras")) return "atrasado";
  if (s.includes("delay")) return "atrasado";
  if (s.includes("antecip")) return "antecipado";
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

  const conectores = ["de", "da", "do", "dos", "das"];
  const segundaPalavra = String(partes[1] || "").toLowerCase();

  if (conectores.includes(segundaPalavra) && partes.length >= 3) {
    return partes.slice(0, 3).join(" ").toUpperCase();
  }

  return partes.slice(0, 2).join(" ").toUpperCase();
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

  const paddingHorizontal = 20;

  let fontSize = totalPorPagina >= 5 ? 44 : totalPorPagina === 4 ? 50 : 58;

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...(config?.corTexto || [65, 74, 95]));
  doc.setFontSize(fontSize);

  let linhas = doc.splitTextToSize(
    nomePlaca,
    larguraUtil - paddingHorizontal * 2,
  );

  while (linhas.length > 2 && fontSize > 20) {
    fontSize -= 2;
    doc.setFontSize(fontSize);
    linhas = doc.splitTextToSize(
      nomePlaca,
      larguraUtil - paddingHorizontal * 2,
    );
  }

  if (linhas.length > 2) {
    linhas = linhas.slice(0, 2);
  }

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

// Chave estável do grupo pra usar como identificador do documento no
// Firestore — troca "/" por "-" porque documentId não pode conter barra.
const montarChaveMonitoramento = (dataMapa, grupoId) =>
  `${dataMapa}__${grupoId}`.replace(/\//g, "-");

export default function PainelOperacionalUnificado() {
  const [abaAtiva, setAbaAtiva] = useState(ABAS.CHEGADAS);
  const [dataSelecionada, setDataSelecionada] = useState(getHojeIso());

  const [loadingInicial, setLoadingInicial] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState("");
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState(null);

  // painel do aeroporto (só para a data de hoje)
  const [chegadasAeroporto, setChegadasAeroporto] = useState([]);
  const [aeroporto, setAeroporto] = useState({
    carregando: false,
    erro: "",
    atualizadoEm: null,
  });

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
  const [grupoOutCopiado, setGrupoOutCopiado] = useState(null);

  // ---- Buscador de reservas ----
  const [termoBusca, setTermoBusca] = useState("");

  // ---- Monitoramento (checkbox verde nos cards de OUT/Transfer) ----
  // Agora vive no Firestore (coleção "painel_out_monitoramento"), com
  // sincronização em tempo real — marcar num computador reflete em
  // qualquer outro que esteja com a tela aberta, sem precisar recarregar.
  const [monitoradosOut, setMonitoradosOut] = useState({});

  // ---- Placas nominais personalizadas / edição por reserva ----
  const [popupPlacaAberto, setPopupPlacaAberto] = useState(false);
  const [placaPersonalizadaNome, setPlacaPersonalizadaNome] = useState("");
  const [placaPersonalizadaVoo, setPlacaPersonalizadaVoo] = useState("");
  const [placaEmEdicao, setPlacaEmEdicao] = useState(null);
  const [drawerConfigPlacas, setDrawerConfigPlacas] = useState(false);
  const [nomesPlacaOverride, setNomesPlacaOverride] = useState({});

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

  // Observa em tempo real quem já foi monitorado na data selecionada —
  // qualquer alteração feita por outro computador chega aqui sozinha.
  useEffect(() => {
    if (!dataSelecionada) return undefined;

    const q = query(
      collection(db, "painel_out_monitoramento"),
      where("data", "==", dataSelecionada),
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const mapa = {};
        snap.forEach((docSnap) => {
          const dados = docSnap.data();
          if (dados?.grupoId) {
            mapa[dados.grupoId] = !!dados.monitorado;
          }
        });
        setMonitoradosOut(mapa);
      },
      (error) => {
        console.error("Erro ao observar monitoramento:", error);
      },
    );

    return () => unsubscribe();
  }, [dataSelecionada]);

  useEffect(() => {
    carregarDados(abaAtiva, false);
  }, [abaAtiva, dataSelecionada]);

  const ehHoje = dataSelecionada === getHojeIso();

  const carregarAeroporto = useCallback(async () => {
    if (!ehHoje) {
      setChegadasAeroporto([]);
      setAeroporto({ carregando: false, erro: "", atualizadoEm: null });
      return;
    }

    setAeroporto((prev) => ({ ...prev, carregando: true, erro: "" }));
    try {
      const resp = await fetch(`${API_AEROPORTO}/api/aeroporto/arrivals`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      setChegadasAeroporto(normalizarChegadasAeroporto(json?.data || json));
      setAeroporto({ carregando: false, erro: "", atualizadoEm: new Date() });
    } catch (err) {
      console.error("Erro ao consultar o painel do aeroporto:", err);
      setAeroporto((prev) => ({
        ...prev,
        carregando: false,
        erro: "Não foi possível consultar o painel do aeroporto agora.",
      }));
    }
  }, [ehHoje]);

  // Chegadas + hoje: consulta ao abrir e a cada 5 minutos
  useEffect(() => {
    if (abaAtiva !== ABAS.CHEGADAS || !ehHoje) {
      if (!ehHoje) carregarAeroporto(); // limpa os dados de outro dia
      return undefined;
    }
    carregarAeroporto();
    const timer = setInterval(carregarAeroporto, AEROPORTO_INTERVALO_MS);
    return () => clearInterval(timer);
  }, [abaAtiva, ehHoje, carregarAeroporto]);

  const indiceAeroporto = useMemo(
    () => indexarChegadasAeroporto(chegadasAeroporto),
    [chegadasAeroporto],
  );

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
    return voosBase.map((vooPhoenix) => {
      // Hoje: completa com o painel do aeroporto o que o Phoenix não traz
      // (horário de operação, cancelado, pousado). Phoenix tem prioridade.
      const noAeroporto = ehHoje
        ? acharVooNoAeroporto(indiceAeroporto, vooPhoenix.voo, vooPhoenix.horarioPrevisto)
        : null;
      const situacao = situacaoAeroporto(noAeroporto?.status);
      const voo = noAeroporto
        ? {
          ...vooPhoenix,
          horarioAtualizado: vooPhoenix.horarioAtualizado || noAeroporto.operacao,
          cancelado: vooPhoenix.cancelado || situacao.cancelado,
          pousado: vooPhoenix.pousado || situacao.pousado,
          aeroporto: noAeroporto,
        }
        : vooPhoenix;

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
  }, [voosBase, ehHoje, indiceAeroporto]);

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

  // ---- Buscador de reservas (Chegadas + OUT's/Transfers + Passeios) ----
  const resultadosBusca = useMemo(() => {
    const termo = normalizarTexto(termoBusca);
    if (!termo) return [];

    const fonte =
      abaAtiva === ABAS.CHEGADAS
        ? itensChegadas
        : abaAtiva === ABAS.OUTS
          ? itensOuts
          : itensGuias;

    const resultados = [];

    fonte.forEach((item, index) => {
      const cliente = extrairNomeCliente(item);
      const codigo = extrairCodigoReserva(item);

      const combina =
        normalizarTexto(cliente).includes(termo) ||
        normalizarTexto(String(codigo)).includes(termo);

      if (!combina) return;

      const tipo =
        abaAtiva === ABAS.CHEGADAS
          ? "Chegada"
          : abaAtiva === ABAS.OUTS
            ? extrairTipoOutOuTransfer(item)
            : "Passeio";

      const fornecedor =
        abaAtiva === ABAS.CHEGADAS
          ? extrairMotorista(item)
          : abaAtiva === ABAS.OUTS
            ? extrairFornecedorNickname(item)
            : extrairFornecedor(item);

      const origem =
        abaAtiva === ABAS.GUIAS ? extrairHotel(item) : extrairOrigem(item);

      const destino =
        abaAtiva === ABAS.GUIAS
          ? extrairNomePasseio(item)
          : extrairDestino(item);

      const pax = formatarQuantidadeDetalhada(
        extrairAdultos(item),
        extrairCriancas(item),
        extrairInfantes(item),
      );

      const observacao = extrairObservacao(item);

      const numeroVoo =
        abaAtiva === ABAS.CHEGADAS
          ? extrairNumeroVoo(item) || "Voo não informado"
          : "";

      const horarioChegada =
        abaAtiva === ABAS.CHEGADAS
          ? formatarHora(extrairHorarioPrevistoVoo(item))
          : "";

      // OUT's: horário de busca do passageiro na origem (para o aeroporto)
      // e voo de retorno informado na reserva.
      const horarioBusca =
        abaAtiva === ABAS.OUTS
          ? formatarHora(extrairPresentationHour(item))
          : abaAtiva === ABAS.GUIAS
            ? extrairHorarioApresentacao(item)
            : "";

      const vooRetorno =
        abaAtiva === ABAS.OUTS ? extrairVooRetornoTexto(item) : "";

      resultados.push({
        id: `${abaAtiva}_${codigo}_${index}`,
        tipo,
        cliente,
        codigo,
        fornecedor,
        origem,
        destino,
        numeroVoo,
        horarioChegada,
        horarioBusca,
        vooRetorno,
        pax,
        observacao,
      });
    });

    return resultados.slice(0, 30);
  }, [termoBusca, abaAtiva, itensChegadas, itensOuts, itensGuias]);

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

        const principal = veiculosOrdenados[0];

        const veiculoPrincipal = formatarNomeVeiculo(principal?.veiculo);

        const veiculoApoio =
          veiculosOrdenados.length > 1
            ? formatarNomeVeiculo(
              veiculosOrdenados[veiculosOrdenados.length - 1]?.veiculo,
            )
            : "";

        const pontoDeApoio = formatarTextoApoio(passeio.pontoDeApoio);
        const nomePasseio = formatarNomePasseio(passeio.passeio);
        const nomeGuia = formatarNomeGuia(grupo.guia);

        // Motoguia: quando o veículo e/ou o motorista do trecho principal
        // têm o mesmo nome do guia, o guia é quem está dirigindo.
        const nomeGuiaNormalizado = normalizarTexto(grupo.guia);
        const veiculoNormalizado = normalizarTexto(principal?.veiculo);
        const fornecedorNormalizado = normalizarTexto(principal?.fornecedor);

        const ehMotoguia =
          Boolean(nomeGuiaNormalizado) &&
          ((veiculoNormalizado &&
            (veiculoNormalizado.includes(nomeGuiaNormalizado) ||
              nomeGuiaNormalizado.includes(veiculoNormalizado))) ||
            (fornecedorNormalizado &&
              (fornecedorNormalizado.includes(nomeGuiaNormalizado) ||
                nomeGuiaNormalizado.includes(fornecedorNormalizado))));

        linhas.push(`*${nomePasseio}*`);
        linhas.push(`${ehMotoguia ? "MOTOGUIA" : "GUIA"}: ${nomeGuia}`);
        linhas.push(`PAX: ${passeio.totalPaxPasseio || 0}`);

        if (!ehMotoguia) {
          linesPushIfValue(
            linhas,
            `VEÍCULO PRINCIPAL: ${veiculoPrincipal}`,
            veiculoPrincipal && veiculoPrincipal !== "-",
          );
        }

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

  // ---- Monitoramento OUT/Transfer (persistido no Firestore) ----
  const salvarMonitoramento = async (grupoId, monitorado) => {
    try {
      await setDoc(
        doc(
          db,
          "painel_out_monitoramento",
          montarChaveMonitoramento(dataSelecionada, grupoId),
        ),
        {
          data: dataSelecionada,
          grupoId,
          monitorado,
          atualizadoEm: Timestamp.now(),
        },
        { merge: true },
      );
    } catch (error) {
      console.error("Erro ao salvar monitoramento:", error);
      // desfaz a atualização otimista se a escrita falhar
      setMonitoradosOut((prev) => ({ ...prev, [grupoId]: !monitorado }));
      alert("Não foi possível salvar o monitoramento. Tente novamente.");
    }
  };

  const toggleMonitoradoOut = (grupoId) => {
    const novoValor = !monitoradosOut[grupoId];
    // atualização otimista: reflete na hora, e o listener em tempo real
    // confirma (ou corrige) assim que o Firestore responder.
    setMonitoradosOut((prev) => ({ ...prev, [grupoId]: novoValor }));
    salvarMonitoramento(grupoId, novoValor);
  };

  const marcarComoMonitorado = (grupoId) => {
    if (monitoradosOut[grupoId]) return;
    setMonitoradosOut((prev) => ({ ...prev, [grupoId]: true }));
    salvarMonitoramento(grupoId, true);
  };

  // ---- Placas nominais: nome exibido considerando edição manual ----
  const obterNomePlaca = (reserva) =>
    nomesPlacaOverride[reserva?.id] || reserva?.cliente || "-";

  const abrirEdicaoPlaca = (reserva, voo) => {
    setPlacaEmEdicao({
      reservaId: reserva.id,
      codigoReserva: reserva.codigoReserva,
      voo: voo?.voo || "",
      nome: obterNomePlaca(reserva),
    });
  };

  const salvarEdicaoPlaca = () => {
    if (!placaEmEdicao) return;
    setNomesPlacaOverride((prev) => ({
      ...prev,
      [placaEmEdicao.reservaId]: placaEmEdicao.nome,
    }));
    setPlacaEmEdicao(null);
  };

  const gerarPdfPlacaUnica = async (dadosPlaca) => {
    try {
      const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });

      const logoDataUrl = await carregarImagemComoDataURL(logoLuck);

      desenharPlacaIndividual({
        doc,
        reserva: { cliente: dadosPlaca.nome },
        voo: dadosPlaca.voo,
        data: dataSelecionada,
        config: configPlacas,
        logoDataUrl,
      });

      doc.save(
        `placa-${String(dadosPlaca.nome || "passageiro").replace(/\s+/g, "-")}.pdf`,
      );
    } catch (error) {
      console.error("Erro ao gerar PDF da placa individual:", error);
      alert("Não foi possível gerar o PDF da placa.");
    }
  };

  const abrirPopupNovaPlaca = () => {
    setPlacaPersonalizadaNome("");
    setPlacaPersonalizadaVoo("");
    setPopupPlacaAberto(true);
  };

  const gerarPlacaPersonalizada = async () => {
    if (!placaPersonalizadaNome.trim()) return;
    await gerarPdfPlacaUnica({
      nome: placaPersonalizadaNome,
      voo: placaPersonalizadaVoo,
    });
    setPopupPlacaAberto(false);
    setPlacaPersonalizadaNome("");
    setPlacaPersonalizadaVoo("");
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
          reserva: { ...reserva, cliente: obterNomePlaca(reserva) },
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

      const totalNomes = voo.reservas.length;
      const porPagina = resolverQuantidadePorPaginaColecao(
        totalNomes,
        configPlacas?.quantidadePorPaginaColecao,
      );

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
          nome: obterNomePlaca(reserva) || "-",
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

  // indicador "Phoenix · HH:MM" da topbar: chama o mesmo "Atualizar" da tela
  usePhoenixStatus({
    atualizadoEm: ultimaAtualizacao,
    carregando,
    atualizar: () => {
      carregarDados(abaAtiva, true);
      if (abaAtiva === ABAS.CHEGADAS) carregarAeroporto();
    },
  });

  const valorKpi = (valor) => (carregando ? "…" : valor);

  const totaisOut = {
    outs: gruposOutBase.filter((g) => g.tipoServico === "OUT").length,
    transfers: gruposOutBase.filter((g) => g.tipoServico === "TRANSFER").length,
    reservas: gruposOutBase.reduce((acc, g) => acc + g.totalReservas, 0),
    pax: gruposOutBase.reduce((acc, g) => acc + g.totalPax, 0),
    hoteis: gruposOutBase.reduce((acc, g) => acc + g.hoteis.length, 0),
    monitorados: gruposOutBase.filter((g) => monitoradosOut[g.id]).length,
  };

  const nomeAba =
    abaAtiva === ABAS.CHEGADAS
      ? "Chegadas"
      : abaAtiva === ABAS.OUTS
        ? "OUT's e Transfers"
        : "Passeios";

  const contagemAba = (aba) => {
    if (aba !== abaAtiva || carregando) return undefined;
    if (aba === ABAS.CHEGADAS) return voosFiltrados.length;
    if (aba === ABAS.OUTS) return gruposOutFiltrados.length;
    return gruposGuiasFiltrados.length;
  };

  const renderCarregando = (texto = "Atualizando serviços do dia...") => (
    <div className="painel-op-loading">
      <Icon name="loader" size={16} className="ui-spin" />
      <span>{texto}</span>
    </div>
  );

  return (
    <div className="painel-op ui-page">
      <PageHeader
        title="Painel Operacional"
        description="Chegadas, OUT's e passeios do dia, direto do Phoenix."
        more={[
          abaAtiva === ABAS.CHEGADAS && {
            label: "Configurações das placas PDF",
            icon: "sliders",
            onClick: () => setDrawerConfigPlacas(true),
          },
        ].filter(Boolean)}
        actions={
          <>
            {abaAtiva === ABAS.CHEGADAS && (
              <Button icon="plus" onClick={abrirPopupNovaPlaca}>
                Nova placa personalizada
              </Button>
            )}
            <Button
              icon="refresh"
              onClick={() => {
                carregarDados(abaAtiva, true);
                if (abaAtiva === ABAS.CHEGADAS) carregarAeroporto();
              }}
              disabled={carregando}
              loading={atualizando}
            >
              {atualizando ? "Atualizando..." : "Atualizar"}
            </Button>
            {abaAtiva === ABAS.GUIAS && (
              <Button
                variant="primary"
                icon={copiado ? "check" : "copy"}
                onClick={copiarResumo}
                disabled={carregando || !gruposGuiasFiltrados.length}
                title="Copia a lista de passeios do dia (guia, pax, veículos e ponto de apoio)"
              >
                {copiado ? "Copiado!" : carregando ? "Carregando..." : "Copiar resumo"}
              </Button>
            )}
          </>
        }
      />

      <Segmented
        ariaLabel="Tipo de serviço"
        value={abaAtiva}
        onChange={setAbaAtiva}
        options={[
          {
            value: ABAS.CHEGADAS,
            label: "Chegadas",
            icon: "planeLanding",
            count: contagemAba(ABAS.CHEGADAS),
            disabled: carregando,
          },
          {
            value: ABAS.OUTS,
            label: "OUT's",
            icon: "planeTakeoff",
            count: contagemAba(ABAS.OUTS),
            disabled: carregando,
          },
          {
            value: ABAS.GUIAS,
            label: "Passeios",
            icon: "compass",
            count: contagemAba(ABAS.GUIAS),
            disabled: carregando,
          },
        ]}
      />

      <FilterBar>
        <Field label="Data operacional" icon="calendar">
          <input
            type="date"
            value={dataSelecionada}
            onChange={(e) => setDataSelecionada(e.target.value)}
            disabled={carregando}
          />
        </Field>

        <Field label="Buscar reserva (nome ou código)" icon="search" grow>
          <input
            type="text"
            value={termoBusca}
            onChange={(e) => setTermoBusca(e.target.value)}
            placeholder="Ex: João Silva ou 123456"
          />
        </Field>

        {abaAtiva === ABAS.CHEGADAS && (
          <>
            <Field label="Status do voo" icon="filter">
              <select
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
                <option value="pousado-antecipado">Pousado antecipado</option>
                <option value="sem-info">Sem informação</option>
              </select>
            </Field>

            <Field label="Escala" icon="filter">
              <select
                value={filtroEscala}
                onChange={(e) => setFiltroEscala(e.target.value)}
                disabled={carregando}
              >
                <option value="todos">Todos</option>
                <option value="com-escaladas">Com reservas escaladas</option>
                <option value="com-nao-escaladas">Com reservas não escaladas</option>
                <option value="somente-nao-escalados">Somente totalmente não escalados</option>
              </select>
            </Field>
          </>
        )}

        {abaAtiva === ABAS.OUTS && (
          <Field label="Veículo" icon="truck">
            <select
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
          </Field>
        )}

        {abaAtiva === ABAS.GUIAS && (
          <Field label="Guia" icon="user">
            <select
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
          </Field>
        )}

        <span className="painel-op-updated">
          {carregando ? (
            <>
              <Icon name="loader" size={14} className="ui-spin" /> Atualizando...
            </>
          ) : ultimaAtualizacao ? (
            `Atualizado em ${ultimaAtualizacao.toLocaleString("pt-BR")}`
          ) : (
            "Ainda não atualizado"
          )}
          {abaAtiva === ABAS.CHEGADAS && (
            <span className="painel-op-aeroporto">
              {!ehHoje ? (
                "Status do aeroporto: só para hoje"
              ) : aeroporto.carregando ? (
                <>
                  <Icon name="loader" size={13} className="ui-spin" /> Consultando aeroporto...
                </>
              ) : aeroporto.erro ? (
                <span className="painel-op-alerta-texto">{aeroporto.erro}</span>
              ) : aeroporto.atualizadoEm ? (
                `Aeroporto SSA · ${aeroporto.atualizadoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
              ) : null}
            </span>
          )}
        </span>
      </FilterBar>

      {erro ? (
        <div className="painel-op-erro" role="alert">
          <Icon name="alert" size={16} />
          <span>{erro}</span>
        </div>
      ) : null}

      {/* ===== RESULTADOS DA BUSCA ===== */}
      {termoBusca.trim() ? (
        <Card>
          <CardHeader
            icon="search"
            title="Resultados da busca"
            subtitle={`Busca restrita à aba atual: ${nomeAba} · ${resultadosBusca.length} encontrado(s)`}
          />
          {!resultadosBusca.length ? (
            <EmptyState icon="search" title={`Nenhuma reserva encontrada para "${termoBusca}".`} />
          ) : (
            <Table
              columns={
                abaAtiva === ABAS.GUIAS
                  ? "90px minmax(150px,1.4fr) 110px minmax(120px,1fr) minmax(130px,1fr) minmax(130px,1fr) 90px 80px minmax(120px,1fr)"
                  : "90px minmax(150px,1.4fr) 110px minmax(120px,1fr) minmax(130px,1fr) minmax(130px,1fr) 90px 100px 80px minmax(120px,1fr)"
              }
              minWidth={1180}
            >
              <TableHead>
                <span>Tipo</span>
                <span>Cliente</span>
                <span>Reserva</span>
                <span>Fornecedor</span>
                <span>Origem</span>
                <span>Destino</span>
                {abaAtiva === ABAS.CHEGADAS && (
                  <>
                    <span>Voo</span>
                    <span>Chegada</span>
                  </>
                )}
                {abaAtiva === ABAS.OUTS && (
                  <>
                    <span>Busca</span>
                    <span>Voo de retorno</span>
                  </>
                )}
                {abaAtiva === ABAS.GUIAS && <span>Busca no hotel</span>}
                <span>Pax</span>
                <span>OBS</span>
              </TableHead>
              {resultadosBusca.map((resultado) => (
                <TableRow key={resultado.id}>
                  <span className="ui-tag">{resultado.tipo}</span>
                  <span className="ui-cell-main">{resultado.cliente}</span>
                  <span className="tabular">{resultado.codigo}</span>
                  <span>{resultado.fornecedor}</span>
                  <span>{resultado.origem}</span>
                  <span>{resultado.destino}</span>
                  {abaAtiva === ABAS.CHEGADAS && (
                    <>
                      <span>{resultado.numeroVoo}</span>
                      <span className="tabular">{resultado.horarioChegada}</span>
                    </>
                  )}
                  {abaAtiva === ABAS.OUTS && (
                    <>
                      <span className="tabular">{resultado.horarioBusca}</span>
                      <span>{resultado.vooRetorno}</span>
                    </>
                  )}
                  {abaAtiva === ABAS.GUIAS && (
                    <span className="tabular">{resultado.horarioBusca}</span>
                  )}
                  <span className="tabular">{resultado.pax}</span>
                  <span className="painel-op-obs">{resultado.observacao || "-"}</span>
                </TableRow>
              ))}
            </Table>
          )}
        </Card>
      ) : null}

      {/* ===== CHEGADAS ===== */}
      {abaAtiva === ABAS.CHEGADAS && (
        <>
          <KpiTiles
            items={[
              { key: "voos", label: "Voos", value: valorKpi(resumoChegadas.voos) },
              { key: "reservas", label: "Reservas", value: valorKpi(resumoChegadas.reservas) },
              { key: "veiculos", label: "Veículos", value: valorKpi(resumoChegadas.veiculos) },
              { key: "pax", label: "Pax", value: valorKpi(resumoChegadas.pax) },
              {
                key: "alterados",
                label: "Voos alterados",
                value: valorKpi(resumoChegadas.alterados),
                tone: resumoChegadas.alterados ? "alert" : undefined,
                hint: "atraso, antecipação ou cancelamento",
              },
            ]}
          />

          {carregando ? (
            <Card>{renderCarregando()}</Card>
          ) : !voosFiltrados.length ? (
            <Card>
              <EmptyState icon="planeLanding" title="Nenhum voo encontrado para a data selecionada." />
            </Card>
          ) : (
            <Table
              columns="20px minmax(150px,1.2fr) 82px 120px minmax(150px,1fr) 70px minmax(150px,1.2fr) 44px"
              minWidth={900}
            >
              <TableHead>
                <span />
                <span>Voo</span>
                <span>Previsto</span>
                <span>Estimado</span>
                <span>Status</span>
                <span className="ui-cell-end painel-op-pax">Pax</span>
                <span>Fornecedor</span>
                <span />
              </TableHead>

              {voosFiltrados.map((voo) => {
                const expandido = !!voosExpandidos[voo.vooKey];
                const tom = tomStatusVoo(voo.statusKey);
                const estimadoBruto = formatarHora(voo.horarioReal || voo.horarioAtualizado);
                const estimado = estimadoBruto && estimadoBruto !== "--:--" ? estimadoBruto : "";
                const fornecedores = voo.gruposPorVeiculo;
                return (
                  <Fragment key={voo.vooKey}>
                    <TableRow
                      expandable
                      expanded={expandido}
                      onToggle={() => toggleExpandirVoo(voo.vooKey)}
                    >
                      <span>
                        <span className="ui-cell-main">{voo.voo}</span>
                        <span className="ui-cell-sub">
                          {voo.totalReservas} reserva(s)
                          {voo.reservasNaoEscaladas.length > 0 && (
                            <span className="painel-op-alerta-texto">
                              {" · "}
                              {voo.reservasNaoEscaladas.length} sem escala
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="tabular">{formatarHora(voo.horarioPrevisto) || "--:--"}</span>
                      <span>
                        <span className="tabular">{estimado || "—"}</span>
                        {voo.variacaoTexto ? (
                          <span className="ui-cell-sub">{voo.variacaoTexto}</span>
                        ) : null}
                      </span>
                      <span>
                        <StatusDot tone={tom.tone} icon={tom.icon}>
                          {voo.statusLabel}
                        </StatusDot>
                        {voo.aeroporto ? (
                          <span className="ui-cell-sub" title="Painel do aeroporto de Salvador">
                            Aeroporto: {voo.aeroporto.status || "sem status"}
                          </span>
                        ) : ehHoje && chegadasAeroporto.length > 0 ? (
                          <span className="ui-cell-sub">Não está no painel do aeroporto</span>
                        ) : null}
                      </span>
                      <span className="ui-cell-end ui-cell-main tabular painel-op-pax">{voo.totalPax}</span>
                      <span>
                        {fornecedores.length ? (
                          <>
                            <span className="ui-cell-main">{fornecedores[0].motorista}</span>
                            <span className="ui-cell-sub">
                              {fornecedores.length} veículo(s)
                            </span>
                          </>
                        ) : (
                          <StatusDot tone="alert">Sem escala</StatusDot>
                        )}
                      </span>
                      <Button
                        variant="ghost"
                        iconOnly
                        size="sm"
                        icon="search"
                        title={`Buscar ${voo.voo} no Google`}
                        aria-label="Buscar voo"
                        onClick={(e) => {
                          e.stopPropagation();
                          abrirBuscaGoogleVoo(voo.voo);
                        }}
                      />
                    </TableRow>

                    {expandido && (
                      <TableExpansion>
                        <div className="painel-op-acoes">
                          <Button
                            size="sm"
                            icon="search"
                            onClick={() => abrirBuscaGoogleVoo(voo.voo)}
                          >
                            Buscar voo
                          </Button>
                          <Button
                            size="sm"
                            icon="fileText"
                            onClick={() => gerarPdfPlacasIndividuais(voo)}
                          >
                            Placas individuais
                          </Button>
                          <Button
                            size="sm"
                            icon="printer"
                            onClick={() => gerarPdfPlacasColecao(voo)}
                          >
                            Placa coleção
                          </Button>
                        </div>

                        {voo.gruposPorVeiculo.map((grupo, i) => (
                          <section key={grupo.veiculo} className="painel-op-bloco is-fornecedor">
                            <header className="painel-op-forn">
                              <span className="painel-op-forn__icone" aria-hidden="true">
                                <Icon name="truck" size={19} />
                              </span>
                              <span className="painel-op-forn__texto">
                                <span className="painel-op-forn__rotulo">
                                  Fornecedor · veículo {i + 1} de {voo.gruposPorVeiculo.length}
                                </span>
                                <strong className="painel-op-forn__nome">{grupo.motorista}</strong>
                                <span className="painel-op-forn__sub">
                                  {grupo.veiculo} · Modalidade:{" "}
                                  {grupo.reservas[0]?.modalidadeServico || "Não informado"}
                                </span>
                              </span>
                              <span className="painel-op-forn__totais tabular">
                                <Icon name="users" size={15} />
                                <span>
                                  <strong>{grupo.totalPax} pax</strong> · {grupo.totalReservas} reserva(s)
                                </span>
                              </span>
                            </header>

                            <Table
                              columns="minmax(140px,1.3fr) 100px 80px minmax(100px,1fr) 96px 124px minmax(120px,1fr) minmax(90px,1fr) 116px"
                              minWidth={1000}
                              compact
                            >
                              <TableHead>
                                <span>Cliente</span>
                                <span>Reserva</span>
                                <span>Pax</span>
                                <span>Operadora</span>
                                <span>Modalidade</span>
                                <span>Contato</span>
                                <span>Destino</span>
                                <span>OBS</span>
                                <span className="ui-cell-end">Placa</span>
                              </TableHead>
                              {grupo.reservas.map((reserva) => (
                                <TableRow key={reserva.id}>
                                  <span className="ui-cell-main">{obterNomePlaca(reserva)}</span>
                                  <span className="tabular">{reserva.codigoReserva}</span>
                                  <span className="tabular">{reserva.resumoPax}</span>
                                  <span>{reserva.operadora}</span>
                                  <span>{reserva.modalidadeServico || "Não informado"}</span>
                                  <span className="tabular">{reserva.contatoPax}</span>
                                  <span>{reserva.destino}</span>
                                  <span className="painel-op-obs">{reserva.observacao || "-"}</span>
                                  <span className="ui-cell-end">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      icon="pencil"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        abrirEdicaoPlaca(reserva, voo);
                                      }}
                                    >
                                      Editar placa
                                    </Button>
                                  </span>
                                </TableRow>
                              ))}
                            </Table>
                          </section>
                        ))}

                        {voo.reservasNaoEscaladas.length > 0 && (
                          <section className="painel-op-bloco is-alerta">
                            <header className="painel-op-bloco__head">
                              <div>
                                <span className="painel-op-bloco__fornecedor">
                                  <Icon name="alert" size={15} /> Reservas não escaladas
                                </span>
                              </div>
                              <span className="painel-op-bloco__totais tabular">
                                {voo.totaisNaoEscalados.totalReservas} reserva(s) ·{" "}
                                {voo.totaisNaoEscalados.totalPax} pax
                              </span>
                            </header>
                            <Table
                              columns="minmax(160px,1.4fr) 120px 90px minmax(130px,1fr) 120px"
                              minWidth={640}
                              compact
                            >
                              <TableHead>
                                <span>Cliente</span>
                                <span>Reserva</span>
                                <span>Pax</span>
                                <span>Operadora</span>
                                <span className="ui-cell-end">Placa</span>
                              </TableHead>
                              {voo.reservasNaoEscaladas.map((reserva) => (
                                <TableRow key={reserva.id}>
                                  <span className="ui-cell-main">{obterNomePlaca(reserva)}</span>
                                  <span className="tabular">{reserva.codigoReserva}</span>
                                  <span className="tabular">{reserva.resumoPax}</span>
                                  <span>{reserva.operadora}</span>
                                  <span className="ui-cell-end">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      icon="pencil"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        abrirEdicaoPlaca(reserva, voo);
                                      }}
                                    >
                                      Editar placa
                                    </Button>
                                  </span>
                                </TableRow>
                              ))}
                            </Table>
                          </section>
                        )}
                      </TableExpansion>
                    )}
                  </Fragment>
                );
              })}
            </Table>
          )}
        </>
      )}

      {/* ===== OUT's + TRANSFERS ===== */}
      {abaAtiva === ABAS.OUTS && (
        <>
          <KpiTiles
            items={[
              { key: "grupos", label: "Grupos", value: valorKpi(gruposOutBase.length) },
              { key: "outs", label: "OUTs", value: valorKpi(totaisOut.outs) },
              { key: "transfers", label: "Transfers", value: valorKpi(totaisOut.transfers) },
              { key: "reservas", label: "Reservas", value: valorKpi(totaisOut.reservas) },
              { key: "pax", label: "Pax", value: valorKpi(totaisOut.pax) },
              { key: "hoteis", label: "Hotéis", value: valorKpi(totaisOut.hoteis) },
              {
                key: "monitorados",
                label: "Monitorados",
                value: valorKpi(`${totaisOut.monitorados} / ${gruposOutBase.length}`),
              },
            ]}
          />

          {carregando ? (
            <Card>{renderCarregando()}</Card>
          ) : !gruposOutFiltrados.length ? (
            <Card>
              <EmptyState icon="planeTakeoff" title="Nenhum grupo encontrado para a data selecionada." />
            </Card>
          ) : (
            <Table
              columns="20px minmax(200px,1.3fr) 104px 84px minmax(220px,1.4fr) 112px 150px 132px 104px"
              minWidth={1210}
            >
              <TableHead>
                <span />
                <span>Serviço · hotel</span>
                <span>Data / hora</span>
                <span>Escala</span>
                <span>Fornecedor</span>
                <span>Modalidade</span>
                <span>Pax</span>
                <span>Monitorado</span>
                <span />
              </TableHead>

              {gruposOutFiltrados.map((grupo) => {
                const expandido = !!gruposExpandidosOut[grupo.id];
                const monitorado = !!monitoradosOut[grupo.id];
                const copiadoGrupo = grupoOutCopiado === grupo.id;
                return (
                  <Fragment key={grupo.id}>
                    <TableRow
                      expandable
                      expanded={expandido}
                      onToggle={() => toggleExpandirGrupoOut(grupo.id)}
                      className={monitorado ? "painel-op-monitorado" : ""}
                    >
                      <span>
                        <span className="painel-op-servico">
                          <span className="ui-tag painel-op-tag">
                            <Icon name={iconeTipoServico(grupo.tipoServico)} size={12} />
                            {grupo.tipoServico === "TRANSFER" ? "TRF" : grupo.tipoServico}
                          </span>
                          <span className="ui-cell-main">{grupo.hotelPrincipal}</span>
                        </span>
                        {grupo.alertaServicoHoje && (
                          <span className="ui-cell-sub painel-op-alerta-texto">
                            O serviço será realizado hoje ({formatarDataBr(grupo.dataServicoReal)})
                          </span>
                        )}
                      </span>
                      <span className="painel-op-quando tabular">
                        <span className="painel-op-hora">
                          <Icon name="clock" size={14} />
                          {grupo.primeiroHorario}
                        </span>
                        <span className="ui-cell-sub">
                          {formatarDataBr(grupo.dataServicoReal)}
                        </span>
                      </span>
                      <span
                        className={`painel-op-escala tabular ${grupo.escalaId && !/sem/i.test(grupo.escalaId) ? "" : "is-vazia"}`}
                        title="Escala no Phoenix"
                      >
                        <Icon name="clipboardCheck" size={14} />
                        {grupo.escalaId}
                      </span>
                      {fornecedorInformado(grupo.fornecedor) ? (
                        <span className="painel-op-fornecedor-cel">
                          <span className="painel-op-fornecedor-cel__icone" aria-hidden="true">
                            <Icon name="truck" size={16} />
                          </span>
                          <span className="painel-op-fornecedor-cel__texto">
                            <strong>{grupo.fornecedor}</strong>
                            <span>{grupo.veiculo}</span>
                          </span>
                        </span>
                      ) : (
                        <span className="painel-op-fornecedor-cel is-pendente">
                          <span className="painel-op-fornecedor-cel__icone" aria-hidden="true">
                            <Icon name="alert" size={16} />
                          </span>
                          <span className="painel-op-fornecedor-cel__texto">
                            <strong>{grupo.fornecedor}</strong>
                            <span>{grupo.veiculo}</span>
                          </span>
                        </span>
                      )}
                      <span className="painel-op-com-icone">
                        {grupo.modalidade && grupo.modalidade !== "-" && (
                          <Icon name={iconeModalidade(grupo.modalidade)} size={14} />
                        )}
                        {grupo.modalidade}
                      </span>
                      <span className="painel-op-com-icone tabular">
                        <Icon name="users" size={14} />
                        {formatarQuantidadeDetalhada(
                          grupo.totalAdultos,
                          grupo.totalCriancas,
                          grupo.totalInfantes,
                        )}
                      </span>
                      <label
                        className={`painel-op-monitor ${monitorado ? "is-on" : ""}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={monitorado}
                          onChange={() => toggleMonitoradoOut(grupo.id)}
                        />
                        <Icon name={monitorado ? "eye" : "eyeOff"} size={14} />
                        Monitorado
                      </label>
                      <span className="ui-cell-end">
                        <Button
                          size="sm"
                          icon={copiadoGrupo ? "check" : "copy"}
                          title="Copiar monitoramento"
                          onClick={async (e) => {
                            e.stopPropagation();
                            const ok = await copiarMonitoramentoGrupo(grupo);
                            if (ok) {
                              setGrupoOutCopiado(grupo.id);
                              marcarComoMonitorado(grupo.id);
                              setTimeout(
                                () =>
                                  setGrupoOutCopiado((atual) =>
                                    atual === grupo.id ? null : atual,
                                  ),
                                1800,
                              );
                            }
                          }}
                        >
                          {copiadoGrupo ? "Copiado!" : "Copiar"}
                        </Button>
                      </span>
                    </TableRow>

                    {expandido && (
                      <TableExpansion>
                        {grupo.hoteisOrdenados.map((hotel, hotelIndex) => (
                          <section key={hotel.id} className="painel-op-bloco">
                            <header className="painel-op-bloco__head">
                              <div>
                                <span className="painel-op-bloco__fornecedor">
                                  <Icon name="building" size={15} />{" "}
                                  {grupo.tipoServico === "TRANSFER"
                                    ? `${hotel.hotelOrigemAbreviado} → ${hotel.hotelDestinoAbreviado}`
                                    : `${grupo.hoteisOrdenados.length > 1 ? `Origem ${hotelIndex + 1}: ` : ""}${hotel.hotelOrigemAbreviado}`}
                                </span>
                                <span className="painel-op-bloco__sub">
                                  {formatarDataBr(hotel.dataServicoReal)} · {hotel.horario} · Tipo:{" "}
                                  {grupo.tipoServico} · Modalidade: {grupo.modalidade}
                                </span>
                              </div>
                              <span className="painel-op-bloco__totais tabular">
                                Pax{" "}
                                {formatarQuantidadeDetalhada(
                                  hotel.totalAdultos,
                                  hotel.totalCriancas,
                                  hotel.totalInfantes,
                                )}
                              </span>
                            </header>

                            <Table
                              columns={
                                grupo.tipoServico === "TRANSFER"
                                  ? "90px 64px 110px 120px minmax(140px,1.3fr) 80px minmax(110px,1fr) minmax(110px,1fr) 110px 100px 120px minmax(100px,1fr)"
                                  : "90px 64px 110px 120px minmax(140px,1.3fr) 80px minmax(110px,1fr) 110px 100px 120px minmax(100px,1fr)"
                              }
                              minWidth={1280}
                              compact
                            >
                              <TableHead>
                                <span>Data</span>
                                <span>Hora</span>
                                <span>Reserva</span>
                                <span>Contato</span>
                                <span>Nome do pax</span>
                                <span>Qtd. pax</span>
                                <span>Origem</span>
                                {grupo.tipoServico === "TRANSFER" && <span>Destino</span>}
                                <span>Voo retorno</span>
                                <span>Modalidade</span>
                                <span>Buscar</span>
                                <span>OBS</span>
                              </TableHead>
                              {hotel.reservas.map((reserva) => (
                                <TableRow key={reserva.id}>
                                  <span className="tabular">{formatarDataBr(reserva.dataServicoReal)}</span>
                                  <span className="tabular">{reserva.horarioHotel}</span>
                                  <span className="tabular">{reserva.reserva}</span>
                                  <span className="tabular">{reserva.telefone}</span>
                                  <span className="ui-cell-main">{reserva.cliente}</span>
                                  <span className="tabular">
                                    {formatarQuantidadeDetalhada(
                                      reserva.adultos,
                                      reserva.criancas,
                                      reserva.infantes,
                                    )}
                                  </span>
                                  <span>{reserva.hotelOrigemAbreviado}</span>
                                  {grupo.tipoServico === "TRANSFER" && (
                                    <span>{reserva.hotelDestinoAbreviado}</span>
                                  )}
                                  <span>{reserva.vooRetorno}</span>
                                  <span>{reserva.modalidade}</span>
                                  <span>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      icon="search"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        abrirBuscaVooPratica(reserva.raw);
                                      }}
                                    >
                                      Buscar voo
                                    </Button>
                                  </span>
                                  <span className="painel-op-obs">{reserva.observacao || "-"}</span>
                                </TableRow>
                              ))}
                            </Table>
                          </section>
                        ))}
                      </TableExpansion>
                    )}
                  </Fragment>
                );
              })}
            </Table>
          )}
        </>
      )}

      {/* ===== PASSEIOS (guias escalados) ===== */}
      {abaAtiva === ABAS.GUIAS && (
        <>
          <KpiTiles
            items={[
              { key: "guias", label: "Guias", value: valorKpi(resumoGuias.guias) },
              { key: "veiculos", label: "Veículos", value: valorKpi(resumoGuias.veiculos) },
              { key: "reservas", label: "Reservas", value: valorKpi(resumoGuias.reservas) },
              { key: "pax", label: "Pax", value: valorKpi(resumoGuias.pax) },
            ]}
          />

          {carregando ? (
            <Card>{renderCarregando()}</Card>
          ) : !gruposGuiasFiltrados.length ? (
            <Card>
              <EmptyState icon="compass" title="Nenhum guia encontrado para a data selecionada." />
            </Card>
          ) : (
            <Table
              columns="20px minmax(150px,1fr) minmax(220px,2fr) 90px 90px 80px"
              minWidth={760}
            >
              <TableHead>
                <span />
                <span>Guia</span>
                <span>Passeios</span>
                <span className="ui-cell-end">Passeios</span>
                <span className="ui-cell-end">Veículos</span>
                <span className="ui-cell-end">Pax</span>
              </TableHead>

              {gruposGuiasFiltrados.map((grupo) => {
                const expandido = !!gruposExpandidosGuia[grupo.id];
                return (
                  <Fragment key={grupo.id}>
                    <TableRow
                      expandable
                      expanded={expandido}
                      onToggle={() => toggleExpandirGrupoGuia(grupo.id)}
                    >
                      <span className="ui-cell-main">{grupo.guia}</span>
                      <span className="painel-op-resumo">{grupo.passeiosResumo || "Sem passeio"}</span>
                      <span className="ui-cell-end tabular">{grupo.totalPasseios}</span>
                      <span className="ui-cell-end tabular">{grupo.totalVeiculosUtilizados}</span>
                      <span className="ui-cell-end ui-cell-main tabular">{grupo.totalPax}</span>
                    </TableRow>

                    {expandido && (
                      <TableExpansion>
                        {grupo.passeios.map((passeio) => (
                          <section key={`${grupo.id}_${passeio.passeio}`} className="painel-op-bloco">
                            <header className="painel-op-bloco__head">
                              <div>
                                <span className="painel-op-bloco__fornecedor">
                                  <Icon name="compass" size={15} /> {passeio.passeio}
                                </span>
                                <span className="painel-op-bloco__sub">
                                  {passeio.veiculos
                                    .map((v) => `${v.veiculo} · ${v.totalPax} pax`)
                                    .join("   |   ")}
                                  {passeio.pontoDeApoio
                                    ? ` · Ponto de apoio: ${passeio.pontoDeApoio}`
                                    : ""}
                                </span>
                              </div>
                              <span className="painel-op-bloco__totais tabular">
                                {passeio.totalVeiculos} veículo(s) · {passeio.totalReservasPasseio}{" "}
                                reserva(s) · {passeio.totalPaxPasseio} pax
                              </span>
                            </header>

                            {passeio.veiculos.map((veiculo, i) => (
                              <div
                                key={`${grupo.id}_${passeio.passeio}_${veiculo.veiculo}_bloco`}
                                className="painel-op-veiculo is-fornecedor"
                              >
                                <header className="painel-op-forn">
                                  <span className="painel-op-forn__icone" aria-hidden="true">
                                    <Icon name="truck" size={19} />
                                  </span>
                                  <span className="painel-op-forn__texto">
                                    <span className="painel-op-forn__rotulo">
                                      Fornecedor · veículo {i + 1} de {passeio.veiculos.length}
                                    </span>
                                    <strong className="painel-op-forn__nome">{veiculo.fornecedor}</strong>
                                    <span className="painel-op-forn__sub">
                                      {veiculo.veiculo} · Primeiro horário: {veiculo.primeiraHora}
                                    </span>
                                  </span>
                                </header>
                                <Table
                                  columns="minmax(150px,1.4fr) 110px 130px 100px minmax(140px,1.2fr) 80px minmax(110px,1fr)"
                                  minWidth={900}
                                  compact
                                >
                                  <TableHead>
                                    <span>Nome do pax</span>
                                    <span>Reserva</span>
                                    <span>Contato</span>
                                    <span>Quantidade</span>
                                    <span>Hotel</span>
                                    <span>Horário</span>
                                    <span>OBS</span>
                                  </TableHead>
                                  {veiculo.reservas.map((reserva) => (
                                    <TableRow key={reserva.id}>
                                      <span className="ui-cell-main">{reserva.nomePax}</span>
                                      <span className="tabular">{reserva.numeroReserva}</span>
                                      <span className="tabular">{reserva.contato}</span>
                                      <span className="tabular">{reserva.quantidadeDetalhada}</span>
                                      <span>{reserva.hotel}</span>
                                      <span className="tabular">{reserva.horarioApresentacao}</span>
                                      <span className="painel-op-obs">{reserva.observacao || "-"}</span>
                                    </TableRow>
                                  ))}
                                </Table>
                              </div>
                            ))}
                          </section>
                        ))}
                      </TableExpansion>
                    )}
                  </Fragment>
                );
              })}
            </Table>
          )}
        </>
      )}

      {/* ===== DRAWERS ===== */}
      <Drawer
        open={drawerConfigPlacas}
        onClose={() => setDrawerConfigPlacas(false)}
        title="Configurações das placas PDF"
        subtitle="Valem para a impressão individual e a coleção. Salvas neste navegador."
        footer={
          <Button variant="primary" icon="check" onClick={() => setDrawerConfigPlacas(false)}>
            Pronto
          </Button>
        }
      >
        <Field label="Qtd. por página na coleção">
          <select
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
        </Field>

        <Field label="Mostrar logo">
          <select
            value={configPlacas.mostrarLogoNasPlacas ? "sim" : "nao"}
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
        </Field>

        <Field label="Repetir cabeçalho do voo em nova página">
          <select
            value={configPlacas.repetirCabecalhoVooAoQuebrarPagina ? "sim" : "nao"}
            onChange={(e) =>
              setConfigPlacas((prev) => ({
                ...prev,
                repetirCabecalhoVooAoQuebrarPagina: e.target.value === "sim",
              }))
            }
          >
            <option value="sim">Sim</option>
            <option value="nao">Não</option>
          </select>
        </Field>
        <p className="painel-op-dica">As mudanças valem na hora — não precisa salvar.</p>
      </Drawer>

      <Drawer
        open={popupPlacaAberto}
        onClose={() => setPopupPlacaAberto(false)}
        title="Nova placa personalizada"
        subtitle="Gera um PDF com uma placa avulsa."
        footer={
          <>
            <Button onClick={() => setPopupPlacaAberto(false)}>Cancelar</Button>
            <Button
              variant="primary"
              icon="fileText"
              onClick={gerarPlacaPersonalizada}
              disabled={!placaPersonalizadaNome.trim()}
            >
              Gerar PDF da placa
            </Button>
          </>
        }
      >
        <Field label="Nome do passageiro">
          <input
            value={placaPersonalizadaNome}
            onChange={(e) => setPlacaPersonalizadaNome(e.target.value)}
            placeholder="Ex: João Silva"
          />
        </Field>
        <Field label="Voo (opcional)">
          <input
            value={placaPersonalizadaVoo}
            onChange={(e) => setPlacaPersonalizadaVoo(e.target.value)}
            placeholder="Ex: G3 1234"
          />
        </Field>
      </Drawer>

      <Drawer
        open={!!placaEmEdicao}
        onClose={() => setPlacaEmEdicao(null)}
        title="Editar placa da reserva"
        subtitle={
          placaEmEdicao
            ? `Reserva ${placaEmEdicao.codigoReserva} • Voo ${placaEmEdicao.voo || "-"}`
            : undefined
        }
        footer={
          <>
            <Button icon="fileText" onClick={() => gerarPdfPlacaUnica(placaEmEdicao)}>
              Gerar PDF agora
            </Button>
            <Button variant="primary" icon="check" onClick={salvarEdicaoPlaca}>
              Salvar nome
            </Button>
          </>
        }
      >
        {placaEmEdicao && (
          <Field label="Nome que aparecerá na placa">
            <input
              value={placaEmEdicao.nome}
              onChange={(e) =>
                setPlacaEmEdicao((prev) => ({
                  ...prev,
                  nome: e.target.value,
                }))
              }
            />
          </Field>
        )}
      </Drawer>
    </div>
  );
}

function linesPushIfValue(arr, value, condition = true) {
  if (condition) arr.push(value);
}
