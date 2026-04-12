import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, query, where } from "firebase/firestore";
import {
  AutoGraphRounded,
  CalendarMonthRounded,
  RefreshRounded,
  SyncRounded,
  FactCheckRounded,
  GroupsRounded,
  InsightsRounded,
  LocalFireDepartmentRounded,
  LockRounded,
  SearchOffRounded,
  ShieldRounded,
  TravelExploreRounded,
  WarningAmberRounded,
  BusinessRounded,
  TrendingUpRounded,
  TrendingDownRounded,
  RemoveRounded,
  DashboardRounded,
} from "@mui/icons-material";
import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  BarChart,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Bar,
  Line,
} from "recharts";
import { db } from "../../Services/Services/firebase";
import logo from "../../assets/logo4.png";
import "./styles.css";

const DIAS = [
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
  "Domingo",
];

const API_BASE =
  "https://driversalvador.phoenix.comeialabs.com/scale/reserve-service";

const EXPAND =
  "service,schedule,reserve,establishmentOrigin,establishmentDestination,establishmentOrigin.region,establishmentDestination.region,reserve.partner,reserve.customer,reserve.pdvPayment,reserve.pdvPayment.user,additionalReserveServices,additionalReserveServices.additional,additionalReserveServices.provider,roadmapService,roadmapService.roadmap,auxRoadmapService.roadmap.serviceOrder,auxRoadmapService.roadmap.serviceOrder.vehicle,auxRoadmapService.roadmap.driver,auxRoadmapService.roadmap.guide,roadmapService.roadmap.driver,roadmapService.roadmap.guide,roadmapService.roadmap.serviceOrder,roadmapService.roadmap.serviceOrder.vehicle";

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
  "TERMINAL NAUTICO / HOTEL LITORAL NORTE",
  "MASSARANDUPIÓ X COSTA DO SAUIPE",
];

const TERMOS_IGNORADOS = [];

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

const CHART_COLORS = [
  "#2563eb",
  "#0ea5e9",
  "#14b8a6",
  "#22c55e",
  "#f59e0b",
  "#f97316",
  "#ef4444",
  "#a855f7",
  "#8b5cf6",
  "#06b6d4",
];

const normalizarTexto = (texto = "") =>
  String(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[|]/g, " ")
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const obterNomeCanonico = (nome = "") => {
  const normalizado = normalizarTexto(nome);
  return MAPA_NOMES_CANONICOS[normalizado] || String(nome).trim().toUpperCase();
};

const deveIgnorarServico = (nome = "") => {
  const nomeCanonico = obterNomeCanonico(nome);
  const nomeNormalizado = normalizarTexto(nomeCanonico);

  const ignoradoExato = SERVICOS_IGNORADOS.some(
    (servico) =>
      normalizarTexto(obterNomeCanonico(servico)) === nomeNormalizado,
  );

  const ignoradoPorTrecho = TERMOS_IGNORADOS.some((termo) =>
    nomeNormalizado.includes(normalizarTexto(termo)),
  );

  return ignoradoExato || ignoradoPorTrecho;
};

const LABEL_OCUPACAO = (valor) => {
  if (valor >= 90) return "Alta";
  if (valor >= 60) return "Boa";
  if (valor >= 30) return "Moderada";
  return "Baixa";
};

const truncarTexto = (texto = "", limite = 28) => {
  const valor = String(texto || "");
  if (valor.length <= limite) return valor;
  return `${valor.slice(0, limite - 1)}…`;
};

const getSemanaPorOffset = (offset = 0) => {
  const hoje = new Date();
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  base.setDate(base.getDate() + offset * 7);

  const diaSemana = base.getDay() === 0 ? 7 : base.getDay();

  const segunda = new Date(base);
  segunda.setDate(base.getDate() - (diaSemana - 1));

  return DIAS.map((dia, index) => {
    const d = new Date(segunda);
    d.setDate(segunda.getDate() + index);

    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");

    return {
      day: dia,
      date: `${yyyy}-${mm}-${dd}`,
      label: `${dd}/${mm}`,
      short: dia.slice(0, 3),
    };
  });
};

const somarDiasIso = (dataIso, dias) => {
  const [ano, mes, dia] = String(dataIso).split("-").map(Number);
  const data = new Date(ano, mes - 1, dia);
  data.setDate(data.getDate() + dias);

  const yyyy = data.getFullYear();
  const mm = String(data.getMonth() + 1).padStart(2, "0");
  const dd = String(data.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
};

const getSemanaAnterior = (semanaAtual) =>
  semanaAtual.map((dia) => ({
    ...dia,
    dateComparativa: dia.date,
    date: somarDiasIso(dia.date, -7),
  }));

const montarUrlApi = (date) => {
  const params = new URLSearchParams();
  params.append("execution_date", date);
  params.append("expand", EXPAND);
  params.append("service_type[]", "3");
  params.append("service_type[]", "4");
  return `${API_BASE}?${params.toString()}`;
};

const extrairListaResposta = (json) => {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.results)) return json.results;
  return [];
};

const extrairNomePasseio = (item) =>
  item?.service?.name ||
  item?.service?.nome ||
  item?.reserveService?.service?.name ||
  item?.name ||
  "";

const extrairModoServico = (item) => {
  return (
    item?.serviceModeAsText ||
    item?.service_mode_as_text ||
    item?.service_mode_text ||
    ""
  );
};

const ehServicoDispPorNomeOuTipo = (item) => {
  const nome = extrairNomePasseio(item);
  const tipo = Number(item?.service?.type || 0);
  return tipo === 4 || ehServicoDisp(nome);
};

const extrairServiceIdExterno = (item) =>
  Number(item?.service_id || item?.service?.id || 0) || null;

const extrairDataServico = (item) => {
  const dataHora =
    item?.presentation_hour ||
    item?.presentation_hour_end ||
    item?.date ||
    item?.execution_date ||
    "";

  return dataHora ? String(dataHora).slice(0, 10) : "";
};

const extrairContagemPax = (item) => {
  const adultos = Number(item?.is_adult_count || 0);
  const criancas = Number(item?.is_child_count || 0);
  const infants = Number(item?.is_infant_count || 0);

  return {
    adultos,
    criancas,
    infants,
    total: adultos + criancas,
  };
};

const ehServicoDisp = (nome = "") => {
  const nomeNormalizado = normalizarTexto(nome);
  return nomeNormalizado.includes("disp");
};

const extrairNomeVendedor = (item) => {
  const pagamentos = Array.isArray(item?.reserve?.pdvPayment)
    ? item.reserve.pdvPayment
    : [];

  const pagamentoComUsuario = pagamentos.find(
    (pag) => typeof pag?.user?.name === "string" && pag.user.name.trim(),
  );

  return pagamentoComUsuario?.user?.name || "";
};

const extrairNomeOperadora = (item) => {
  const nome =
    item?.reserve?.partner?.fantasy_name ||
    item?.reserve?.partner?.company_name ||
    item?.reserve?.partner?.name ||
    item?.partner?.name ||
    item?.reserve?.customer?.fantasy_name ||
    item?.reserve?.customer?.name ||
    "";

  return String(nome || "").trim();
};

const extrairPrimeiroNome = (nome = "") => {
  const limpo = String(nome).trim();
  if (!limpo) return "";
  return limpo.split(/\s+/)[0].toUpperCase();
};

const extrairResponsavelDisp = (item) => {
  const vendedor = extrairPrimeiroNome(extrairNomeVendedor(item));
  if (vendedor) return vendedor;

  const operadora = extrairPrimeiroNome(extrairNomeOperadora(item));
  if (operadora) return operadora;

  return "";
};

const montarNomeServicoExibicao = (item) => {
  const nomeBase = obterNomeCanonico(extrairNomePasseio(item));

  if (!ehServicoDisp(nomeBase)) {
    return nomeBase;
  }

  const responsavel = extrairResponsavelDisp(item);
  return responsavel ? `${nomeBase} - ${responsavel}` : nomeBase;
};

const extrairCodigoReserva = (item) =>
  item?.reserve?.code ||
  item?.reserve_code ||
  item?.code ||
  item?.reserve?.id ||
  null;

const extrairHotelReserva = (item) => {
  const hotel =
    item?.establishmentOrigin?.name ||
    item?.reserve?.hotel?.name ||
    item?.reserve?.establishmentOrigin?.name ||
    item?.hotel?.name ||
    item?.hotel ||
    "";

  return String(hotel || "").trim();
};

const hotelNaoInformado = (item) => {
  const hotel = extrairHotelReserva(item);
  if (!hotel) return true;

  const normalizado = normalizarTexto(hotel);
  return (
    normalizado === "nao informado" ||
    normalizado === "nao definido" ||
    normalizado === "sem hotel" ||
    normalizado === "hotel nao informado"
  );
};

const extrairOperadora = (item) => {
  const nome =
    item?.reserve?.partner?.fantasy_name ||
    item?.reserve?.partner?.company_name ||
    item?.reserve?.partner?.name ||
    item?.partner?.name ||
    "";

  return String(nome || "").trim() || "SEM OPERADORA";
};

const calcularDeltaPercentual = (atual, anterior) => {
  const a = Number(atual || 0);
  const b = Number(anterior || 0);

  if (b === 0 && a > 0) return 100;
  if (b === 0 && a === 0) return 0;

  return Math.round(((a - b) / b) * 100);
};

const formatarDelta = (valor) => {
  if (valor > 0) return `+${valor}`;
  return `${valor}`;
};

const getAlertaComparativoPax = (atual, anterior) => {
  const delta = atual - anterior;
  const percentual = calcularDeltaPercentual(atual, anterior);

  if (delta > 0) {
    return {
      tipo: delta >= 15 ? "atencao" : "info",
      titulo: "Aumento de pax em relação à semana anterior",
      descricao: `A demanda subiu ${delta} pax (${formatarDelta(
        percentual,
      )}%) versus a semana passada.`,
      icone: "up",
    };
  }

  if (delta < 0) {
    return {
      tipo: "info",
      titulo: "Queda de pax em relação à semana anterior",
      descricao: `A demanda caiu ${Math.abs(delta)} pax (${percentual}%) versus a semana passada.`,
      icone: "down",
    };
  }

  return {
    tipo: "info",
    titulo: "Pax estável em relação à semana anterior",
    descricao:
      "A quantidade total de pax permaneceu estável em comparação com a semana passada.",
    icone: "stable",
  };
};

const tooltipStyle = {
  background: "var(--card, #111827)",
  border: "1px solid rgba(148,163,184,.22)",
  borderRadius: 12,
  boxShadow: "0 10px 30px rgba(0,0,0,.18)",
  fontSize: 12,
};

const Home = () => {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [atualizandoApi, setAtualizandoApi] = useState(false);
  const [versiculo, setVersiculo] = useState(null);

  const [guias, setGuias] = useState([]);
  const [services, setServices] = useState([]);
  const [weeklyServices, setWeeklyServices] = useState([]);
  const [availabilityDocs, setAvailabilityDocs] = useState([]);
  const [affinityDocs, setAffinityDocs] = useState([]);
  const [apiSemana, setApiSemana] = useState([]);
  const [apiSemanaAnterior, setApiSemanaAnterior] = useState([]);
  const [alertasApiBrutos, setAlertasApiBrutos] = useState([]);

  const [ultimaAtualizacaoApi, setUltimaAtualizacaoApi] = useState(null);
  const [ultimaAtualizacaoComparativo, setUltimaAtualizacaoComparativo] =
    useState(null);
  const [abaAtiva, setAbaAtiva] = useState("operacao");
  const [diaSelecionadoHome, setDiaSelecionadoHome] = useState("");

  const [filtroStatusDia, setFiltroStatusDia] = useState("todos");
  const [filtroGuiaDia, setFiltroGuiaDia] = useState("todos");
  const [ordenacaoPaxDia, setOrdenacaoPaxDia] = useState("maior");
  const [semanaOffset, setSemanaOffset] = useState(0);

  const semana = useMemo(() => getSemanaPorOffset(semanaOffset), [semanaOffset]);
  const inicioSemana = semana[0]?.date;
  const fimSemana = semana[semana.length - 1]?.date;

  const ehObservacaoCancelada = (observacao = "") => {
    const texto = normalizarTexto(String(observacao || ""));

    if (!texto) return false;

    return (
      texto === "cld" ||
      texto.includes(" cld") ||
      texto.startsWith("cld ") ||
      texto.includes("cancelado")
    );
  };

  const itemEstaCancelado = (item) => {
    const observacao =
      item?.observation ||
      item?.observations ||
      item?.notes ||
      item?.note ||
      item?.reserve?.observation ||
      item?.reserve?.observations ||
      item?.reserve?.notes ||
      item?.reserve?.note ||
      "";

    return ehObservacaoCancelada(observacao);
  };

  const extrairContagemPax = (item) => {
    if (itemEstaCancelado(item)) {
      return {
        adultos: 0,
        criancas: 0,
        infants: 0,
        total: 0,
      };
    }

    const adultos = Number(item?.is_adult_count || 0);
    const criancas = Number(item?.is_child_count || 0);
    const infants = Number(item?.is_infant_count || 0);

    return {
      adultos,
      criancas,
      infants,
      total: adultos + criancas,
    };
  };

  const carregarSemanaApi = async (listaSemana) => {
    const respostasApi = await Promise.all(
      listaSemana.map(async (dia) => {
        try {
          const response = await fetch(montarUrlApi(dia.date), {
            method: "GET",
            headers: { Accept: "application/json" },
          });

          if (!response.ok) return [];

          const json = await response.json();
          return extrairListaResposta(json);
        } catch (err) {
          console.error(`Erro ao buscar API do dia ${dia.date}:`, err);
          return [];
        }
      }),
    );



    const itensApiAgrupados = {};
    const itensBrutos = [];

    respostasApi.flat().forEach((item) => {
      if (itemEstaCancelado(item)) return;

      const nomeOriginal = extrairNomePasseio(item);
      const externalServiceId = extrairServiceIdExterno(item);
      const date = extrairDataServico(item);
      const pax = extrairContagemPax(item);

      if (!date || !nomeOriginal) return;

      const nomeExibicao = montarNomeServicoExibicao(item);
      if (!nomeExibicao) return;
      if (deveIgnorarServico(nomeExibicao)) return;

      itensBrutos.push({
        ...item,
        _date: date,
        _serviceNameCanonico: nomeExibicao,
        _externalServiceId: externalServiceId || null,
        _paxTotal: pax.total,
        _adultCount: pax.adultos,
        _childCount: pax.criancas,
        _infantCount: pax.infants,
        _serviceType: Number(item?.service?.type || 0),
        _serviceModeAsText: extrairModoServico(item),
        _isDisp: ehServicoDispPorNomeOuTipo(item),
      });

      const chave = `${date}_${Number(externalServiceId || 0)}_${normalizarTexto(
        nomeExibicao,
      )}`;

      if (!itensApiAgrupados[chave]) {
        itensApiAgrupados[chave] = {
          chave,
          date,
          serviceName: nomeExibicao,
          externalServiceId: externalServiceId || null,
          passengers: 0,
          adultCount: 0,
          childCount: 0,
          infantCount: 0,
          serviceType: Number(item?.service?.type || 0),
          serviceModeAsText: extrairModoServico(item),
          isDisp: ehServicoDispPorNomeOuTipo(item),
        };
      }

      itensApiAgrupados[chave].passengers += pax.total;
      itensApiAgrupados[chave].adultCount += pax.adultos;
      itensApiAgrupados[chave].childCount += pax.criancas;
      itensApiAgrupados[chave].infantCount += pax.infants;
    });

    return {
      agrupados: Object.values(itensApiAgrupados),
      brutos: itensBrutos,
    };
  };

  const carregarApiSemana = async () => {
    try {
      setAtualizandoApi(true);

      const semanaAnterior = getSemanaAnterior(semana);

      const [semanaAtualApi, semanaAnteriorApi] = await Promise.all([
        carregarSemanaApi(semana),
        carregarSemanaApi(semanaAnterior),
      ]);

      const listaAnteriorNormalizada = semanaAnteriorApi.agrupados.map(
        (item) => {
          const dateComparativa = somarDiasIso(item.date, 7);
          return {
            ...item,
            dateComparativa,
          };
        },
      );

      setApiSemana(semanaAtualApi.agrupados);
      setApiSemanaAnterior(listaAnteriorNormalizada);
      setAlertasApiBrutos(semanaAtualApi.brutos);
      setUltimaAtualizacaoApi(new Date());
      setUltimaAtualizacaoComparativo(new Date());

      if (!diaSelecionadoHome) {
        const hoje = new Date().toISOString().slice(0, 10);
        const existeHoje = semana.find((d) => d.date === hoje);
        setDiaSelecionadoHome(existeHoje ? hoje : semana[0]?.date || "");
      }
    } catch (error) {
      console.error("Erro ao atualizar dados do Phoenix:", error);
    } finally {
      setAtualizandoApi(false);
    }
  };

  useEffect(() => {
    const carregarTudo = async () => {
      try {
        setLoading(true);

        const listaVersiculos = [
          "psalms 23:1",
          "philippians 4:13",
          "isaiah 41:10",
          "proverbs 3:5",
          "jeremiah 29:11",
          "romans 8:28",
        ];

        const hoje = new Date().toISOString().slice(0, 10);
        const index = Number(hoje.split("-").join("")) % listaVersiculos.length;
        const referencia = listaVersiculos[index];

        const [
          versiculoRes,
          snapGuias,
          snapServices,
          snapDisponibilidade,
          snapAfinidade,
          snapWeekly,
        ] = await Promise.all([
          fetch(`https://bible-api.com/${referencia}?translation=almeida`),
          getDocs(collection(db, "guides")),
          getDocs(collection(db, "services")),
          getDocs(collection(db, "guide_availability")),
          getDocs(collection(db, "guide_tour_levels")),
          getDocs(
            query(
              collection(db, "weekly_services"),
              where("date", ">=", inicioSemana),
              where("date", "<=", fimSemana),
            ),
          ),
        ]);

        const versiculoData = await versiculoRes.json();

        setVersiculo({
          texto: versiculoData.text,
          referencia: versiculoData.reference,
        });

        setGuias(
          snapGuias.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          })),
        );

        setServices(
          snapServices.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          })),
        );

        setAvailabilityDocs(snapDisponibilidade.docs.map((d) => d.data()));
        setAffinityDocs(
          snapAfinidade.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          })),
        );

        setWeeklyServices(
          snapWeekly.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          })),
        );

        await carregarApiSemana();
      } catch (error) {
        console.error("Erro ao carregar Home:", error);
      } finally {
        setLoading(false);
      }
    };

    carregarTudo();
  }, [inicioSemana, fimSemana]);

  useEffect(() => {
    if (!semana.length) return;

    const hoje = new Date().toISOString().slice(0, 10);
    const existeHojeNaSemana = semana.some((d) => d.date === hoje);

    if (existeHojeNaSemana) {
      setDiaSelecionadoHome(hoje);
    } else {
      setDiaSelecionadoHome(semana[0]?.date || "");
    }
  }, [semana]);

  const dashboard = useMemo(() => {
    const guiasAtivos = guias.filter((g) => g.ativo !== false);
    const guiasInativos = guias.filter((g) => g.ativo === false);
    const motoguias = guias.filter((g) => g.motoguia);

    const weeklyNormalizados = weeklyServices.map((r) => {
      const nomeServico = String(r.serviceName || "").trim();

      return {
        ...r,
        _nomeCanonico: nomeServico,
        _nomeNormalizado: normalizarTexto(nomeServico),
        _externalIdNormalizado:
          r.externalServiceId !== null && r.externalServiceId !== undefined
            ? Number(r.externalServiceId)
            : null,
      };
    });

    const encontrarRelacionadosNoBanco = (apiItem) => {
      const externalIdApi =
        apiItem.externalServiceId !== null &&
          apiItem.externalServiceId !== undefined
          ? Number(apiItem.externalServiceId)
          : null;

      const nomeApiNormalizado = normalizarTexto(apiItem.serviceName || "");

      const porExternalId =
        externalIdApi !== null
          ? weeklyNormalizados.filter(
            (r) =>
              r.date === apiItem.date &&
              r._externalIdNormalizado !== null &&
              r._externalIdNormalizado === externalIdApi,
          )
          : [];

      if (porExternalId.length) return porExternalId;

      const porNome = weeklyNormalizados.filter(
        (r) =>
          r.date === apiItem.date && r._nomeNormalizado === nomeApiNormalizado,
      );

      return porNome;
    };

    const servicosExecutivos = apiSemana.map((apiItem) => {
      const listaRelacionada = encontrarRelacionadosNoBanco(apiItem);

      const abertoOuManual = listaRelacionada.filter(
        (r) => r.allocationStatus !== "CLOSED",
      );

      const fechado = listaRelacionada.some(
        (r) => r.allocationStatus === "CLOSED",
      );

      const registroComGuia =
        abertoOuManual.find((r) => !!r.guiaId) ||
        abertoOuManual.find((r) => !!r.guiaNome) ||
        null;

      const alocado = !!registroComGuia;

      return {
        ...apiItem,
        hasWeeklyRecord: listaRelacionada.length > 0,
        alocado,
        fechado,
        guiaId: registroComGuia?.guiaId || null,
        guiaNome: registroComGuia?.guiaNome || null,
      };
    });

    const totalServicosReais = servicosExecutivos.length;
    const servicosAlocados = servicosExecutivos.filter((s) => s.alocado);
    const servicosSemGuia = servicosExecutivos.filter(
      (s) => !s.alocado && !s.fechado,
    );
    const servicosFechados = servicosExecutivos.filter((s) => s.fechado);
    const gruposFormados = servicosExecutivos.filter(
      (s) => Number(s.passengers || 0) >= 8 && !s.fechado,
    );
    const gruposNaoFormados = servicosExecutivos.filter(
      (s) => Number(s.passengers || 0) < 8 && !s.fechado,
    );

    const paxTotalSemana = servicosExecutivos.reduce(
      (acc, item) => acc + Number(item.passengers || 0),
      0,
    );

    const percentualServicosComGuia = totalServicosReais
      ? Math.round((servicosAlocados.length / totalServicosReais) * 100)
      : 0;

    const percentualPassageirosComGuia = paxTotalSemana
      ? Math.round(
        (servicosAlocados.reduce(
          (acc, item) => acc + Number(item.passengers || 0),
          0,
        ) /
          paxTotalSemana) *
        100,
      )
      : 0;

    const mapaDisponibilidade = {};
    availabilityDocs.forEach((d) => {
      if (!d?.guideId || !Array.isArray(d.disponibilidade)) return;
      mapaDisponibilidade[d.guideId] = d.disponibilidade.filter(
        (item) => item.date >= inicioSemana && item.date <= fimSemana,
      );
    });

    const resumoGuias = guiasAtivos
      .map((guia) => {
        const servicos = servicosExecutivos.filter(
          (r) => r.guiaNome === guia.nome && !r.fechado,
        ).length;

        const diasDisponiveis = (mapaDisponibilidade[guia.id] || []).filter(
          (d) => d.status !== "BLOCKED",
        ).length;

        const diasBloqueados = (mapaDisponibilidade[guia.id] || []).filter(
          (d) => d.status === "BLOCKED",
        ).length;

        const ocupacao = diasDisponiveis
          ? Math.round((servicos / diasDisponiveis) * 100)
          : 0;

        return {
          id: guia.id,
          nome: guia.nome,
          nomeCurto: truncarTexto(guia.nome, 22),
          servicos,
          diasDisponiveis,
          diasBloqueados,
          ocupacao,
          prioridade: guia.nivelPrioridade || 2,
          motoguia: !!guia.motoguia,
        };
      })
      .sort((a, b) => b.ocupacao - a.ocupacao);

    const distribuicaoGuias = guiasAtivos
      .map((guia) => {
        const disponibilidadeSemana = Array.isArray(mapaDisponibilidade[guia.id])
          ? mapaDisponibilidade[guia.id]
          : [];

        const diasDisponiveisLista = disponibilidadeSemana.filter(
          (d) => d.status !== "BLOCKED",
        );

        const diasDisponiveis = diasDisponiveisLista.length;

        const diasUtilizadosSet = new Set(
          servicosExecutivos
            .filter((servico) => !servico.fechado)
            .filter(
              (servico) =>
                servico.guiaId === guia.id ||
                normalizarTexto(servico.guiaNome || "") ===
                normalizarTexto(guia.nome || ""),
            )
            .map((servico) => servico.date),
        );

        const diasUtilizados = diasUtilizadosSet.size;

        const percentualUso = diasDisponiveis
          ? Math.round((diasUtilizados / diasDisponiveis) * 100)
          : 0;

        let statusDistribuicao = "Ocioso";
        if (percentualUso >= 85) statusDistribuicao = "Muito utilizado";
        else if (percentualUso >= 60) statusDistribuicao = "Equilibrado";
        else if (percentualUso >= 30) statusDistribuicao = "Moderado";

        return {
          id: guia.id,
          nome: guia.nome,
          nomeCurto: truncarTexto(guia.nome, 26),
          diasDisponiveis,
          diasUtilizados,
          percentualUso,
          statusDistribuicao,
        };
      })
      .sort((a, b) => b.percentualUso - a.percentualUso);

    const mediaUsoDistribuicao = distribuicaoGuias.length
      ? Math.round(
        distribuicaoGuias.reduce(
          (acc, guia) => acc + Number(guia.percentualUso || 0),
          0,
        ) / distribuicaoGuias.length,
      )
      : 0;

    let statusGeralDistribuicao = "Ociosa";
    if (mediaUsoDistribuicao >= 85) statusGeralDistribuicao = "Muito carregada";
    else if (mediaUsoDistribuicao >= 60)
      statusGeralDistribuicao = "Equilibrada";
    else if (mediaUsoDistribuicao >= 30)
      statusGeralDistribuicao = "Moderada";

    const guiasSobrecarga = [...resumoGuias]
      .filter((g) => g.ocupacao >= 80)
      .sort((a, b) => b.ocupacao - a.ocupacao)
      .slice(0, 6);

    const guiasOciosos = [...resumoGuias]
      .filter((g) => g.ocupacao <= 25)
      .sort((a, b) => a.ocupacao - b.ocupacao)
      .slice(0, 6);

    const mapaPasseios = {};
    servicosExecutivos.forEach((item) => {
      const nome = item.serviceName || "Passeio";
      if (!mapaPasseios[nome]) {
        mapaPasseios[nome] = {
          nome,
          nomeCurto: truncarTexto(nome, 28),
          pax: 0,
          servicos: 0,
          comGuia: 0,
          semGuia: 0,
          fechados: 0,
        };
      }

      mapaPasseios[nome].pax += Number(item.passengers || 0);
      mapaPasseios[nome].servicos += 1;

      if (item.fechado) {
        mapaPasseios[nome].fechados += 1;
      } else if (item.alocado) {
        mapaPasseios[nome].comGuia += 1;
      } else {
        mapaPasseios[nome].semGuia += 1;
      }
    });

    const topPasseios = Object.values(mapaPasseios)
      .sort((a, b) => b.pax - a.pax)
      .slice(0, 6);

    const coberturaAfinidade = affinityDocs.length
      ? Math.round(
        (affinityDocs.length / Math.max(guiasAtivos.length, 1)) * 100,
      )
      : 0;

    const disponibilidadeMedia = (() => {
      if (!guiasAtivos.length) return 0;

      const total = guiasAtivos.reduce((acc, guia) => {
        const dias = (mapaDisponibilidade[guia.id] || []).filter(
          (d) => d.status !== "BLOCKED",
        ).length;
        return acc + dias;
      }, 0);

      return Math.round((total / guiasAtivos.length) * 10) / 10;
    })();

    const distribuicaoSemana = semana.map((dia) => {
      const servicosDia = servicosExecutivos.filter((r) => r.date === dia.date);
      return {
        ...dia,
        total: servicosDia.length,
        comGuia: servicosDia.filter((r) => r.alocado && !r.fechado).length,
        semGuia: servicosDia.filter((r) => !r.alocado && !r.fechado).length,
        pax: servicosDia.reduce(
          (acc, item) => acc + Number(item.passengers || 0),
          0,
        ),
      };
    });

    const resumoSemanaAnterior = {
      totalServicos: apiSemanaAnterior.length,
      pax: apiSemanaAnterior.reduce(
        (acc, item) => acc + Number(item.passengers || 0),
        0,
      ),
    };

    const resumoSemanaAtual = {
      totalServicos: servicosExecutivos.length,
      pax: servicosExecutivos.reduce(
        (acc, item) => acc + Number(item.passengers || 0),
        0,
      ),
    };

    const comparativoGeral = {
      servicosAtual: resumoSemanaAtual.totalServicos,
      servicosAnterior: resumoSemanaAnterior.totalServicos,
      paxAtual: resumoSemanaAtual.pax,
      paxAnterior: resumoSemanaAnterior.pax,
      deltaServicos:
        resumoSemanaAtual.totalServicos - resumoSemanaAnterior.totalServicos,
      deltaPax: resumoSemanaAtual.pax - resumoSemanaAnterior.pax,
      deltaPercentualServicos: calcularDeltaPercentual(
        resumoSemanaAtual.totalServicos,
        resumoSemanaAnterior.totalServicos,
      ),
      deltaPercentualPax: calcularDeltaPercentual(
        resumoSemanaAtual.pax,
        resumoSemanaAnterior.pax,
      ),
    };

    const distribuicaoComparativaSemana = semana.map((dia) => {
      const atual = servicosExecutivos.filter((r) => r.date === dia.date);
      const anterior = apiSemanaAnterior.filter(
        (r) => r.dateComparativa === dia.date,
      );

      const servicosAtual = atual.length;
      const servicosAnterior = anterior.length;

      const paxAtual = atual.reduce(
        (acc, item) => acc + Number(item.passengers || 0),
        0,
      );

      const paxAnterior = anterior.reduce(
        (acc, item) => acc + Number(item.passengers || 0),
        0,
      );

      return {
        ...dia,
        servicosAtual,
        servicosAnterior,
        paxAtual,
        paxAnterior,
        deltaServicos: servicosAtual - servicosAnterior,
        deltaPax: paxAtual - paxAnterior,
      };
    });

    const mapaPasseiosAtual = {};
    servicosExecutivos.forEach((item) => {
      const nome = item.serviceName || "Passeio";
      if (!mapaPasseiosAtual[nome]) {
        mapaPasseiosAtual[nome] = {
          nome,
          nomeCurto: truncarTexto(nome, 28),
          servicos: 0,
          pax: 0,
        };
      }
      mapaPasseiosAtual[nome].servicos += 1;
      mapaPasseiosAtual[nome].pax += Number(item.passengers || 0);
    });



    const mapaPasseiosAnterior = {};
    apiSemanaAnterior.forEach((item) => {
      const nome = item.serviceName || "Passeio";
      if (!mapaPasseiosAnterior[nome]) {
        mapaPasseiosAnterior[nome] = {
          nome,
          nomeCurto: truncarTexto(nome, 28),
          servicos: 0,
          pax: 0,
        };
      }
      mapaPasseiosAnterior[nome].servicos += 1;
      mapaPasseiosAnterior[nome].pax += Number(item.passengers || 0);
    });

    const comparativoPasseios = Array.from(
      new Set([
        ...Object.keys(mapaPasseiosAtual),
        ...Object.keys(mapaPasseiosAnterior),
      ]),
    )
      .map((nome) => {
        const atual = mapaPasseiosAtual[nome] || { servicos: 0, pax: 0 };
        const anterior = mapaPasseiosAnterior[nome] || { servicos: 0, pax: 0 };

        return {
          nome,
          nomeCurto: truncarTexto(nome, 30),
          servicosAtual: atual.servicos,
          servicosAnterior: anterior.servicos,
          paxAtual: atual.pax,
          paxAnterior: anterior.pax,
          deltaServicos: atual.servicos - anterior.servicos,
          deltaPax: atual.pax - anterior.pax,
        };
      })
      .sort((a, b) => Math.abs(b.deltaPax) - Math.abs(a.deltaPax))
      .slice(0, 8);

    const operadorasSemana = Object.values(
      alertasApiBrutos.reduce((acc, item) => {
        const operadora = extrairOperadora(item);
        const pax = Number(item?._paxTotal || 0);
        const chave = operadora.toUpperCase();

        if (!acc[chave]) {
          acc[chave] = {
            nome: operadora.toUpperCase(),
            nomeCurto: truncarTexto(operadora.toUpperCase(), 20),
            pax: 0,
            reservas: 0,
          };
        }

        acc[chave].pax += pax;
        acc[chave].reservas += 1;

        return acc;
      }, {}),
    )
      .sort((a, b) => b.pax - a.pax)
      .slice(0, 10);

    const alertaComparativoPax = getAlertaComparativoPax(
      comparativoGeral.paxAtual,
      comparativoGeral.paxAnterior,
    );

    const alertas = [];

    alertas.push(alertaComparativoPax);

    // if (servicosSemGuia.length > 0) {
    //   alertas.push({
    //     tipo: "critico",
    //     titulo: "Serviços reais sem guia",
    //     descricao: `${servicosSemGuia.length} serviço(s) da API ainda estão sem guia alocado nesta semana.`,
    //   });
    // }

    if (comparativoGeral.deltaServicos > 0) {
      alertas.push({
        tipo: "info",
        titulo: "Aumento de serviços vs semana anterior",
        descricao: `A semana atual está com ${formatarDelta(
          comparativoGeral.deltaServicos,
        )} serviço(s) em relação à semana passada.`,
      });
    } else if (comparativoGeral.deltaServicos < 0) {
      alertas.push({
        tipo: "info",
        titulo: "Redução de serviços vs semana anterior",
        descricao: `A semana atual está com ${Math.abs(
          comparativoGeral.deltaServicos,
        )} serviço(s) a menos em relação à semana passada.`,
      });
    }

    // if (guiasSobrecarga.length > 0) {
    //   alertas.push({
    //     tipo: "info",
    //     titulo: "Guias com alta ocupação",
    //     descricao: `${guiasSobrecarga.length} guia(s) aparecem com ocupação elevada.`,
    //   });
    // }

    // if (guiasOciosos.length > 0) {
    //   alertas.push({
    //     tipo: "info",
    //     titulo: "Capacidade ociosa detectada",
    //     descricao: `${guiasOciosos.length} guia(s) têm baixa ocupação e podem absorver mais demanda.`,
    //   });
    // }

    const reservasSemHotel = alertasApiBrutos
      .filter((item) => !deveIgnorarServico(item?._serviceNameCanonico || ""))
      .filter((item) => hotelNaoInformado(item))
      .map((item) => ({
        codigoReserva: extrairCodigoReserva(item),
        passeio:
          item?._serviceNameCanonico || extrairNomePasseio(item) || "Passeio",
      }))
      .filter((item) => item.codigoReserva)
      .slice(0, 12);

    reservasSemHotel.forEach((item) => {
      alertas.push({
        tipo: "critico",
        titulo: `Cod. da reserva ${item.codigoReserva}`,
        descricao: `Hotel "Não Informado" no passeio ${item.passeio}.`,
      });
    });

    return {
      totalServicosReais,
      servicosAlocados,
      servicosSemGuia,
      servicosFechados,
      gruposFormados,
      gruposNaoFormados,
      paxTotalSemana,
      percentualServicosComGuia,
      percentualPassageirosComGuia,
      guiasAtivos: guiasAtivos.length,
      guiasInativos: guiasInativos.length,
      motoguias: motoguias.length,
      totalServicesCatalogo: services.length,
      coberturaAfinidade,
      disponibilidadeMedia,
      distribuicaoSemana,
      resumoGuias,
      distribuicaoGuias,
      mediaUsoDistribuicao,
      statusGeralDistribuicao,
      guiasSobrecarga,
      guiasOciosos,
      topPasseios,
      alertas,
      servicosExecutivos,
      comparativoGeral,
      distribuicaoComparativaSemana,
      comparativoPasseios,
      operadorasSemana,
      alertaComparativoPax,
    };
  }, [
    guias,
    services,
    weeklyServices,
    availabilityDocs,
    affinityDocs,
    apiSemana,
    apiSemanaAnterior,
    alertasApiBrutos,
    semana,
    inicioSemana,
    fimSemana,
  ]);

  const getAlertaSemaforo = (alerta) => {
    const texto = `${alerta?.titulo || ""} ${alerta?.descricao || ""}`.toLowerCase();

    const matchPercent = texto.match(/-?\d+%/);
    const percentual = matchPercent
      ? parseInt(matchPercent[0].replace("%", ""), 10)
      : null;

    if (percentual !== null && percentual <= -15) {
      return "semaforo-vermelho";
    }

    if (percentual !== null && percentual < 0) {
      return "semaforo-amarelo";
    }

    if (percentual !== null && percentual > 0) {
      return "semaforo-verde";
    }

    if (texto.includes("queda") || texto.includes("redução")) {
      return "semaforo-amarelo";
    }

    if (texto.includes("aumento") || texto.includes("crescimento")) {
      return "semaforo-verde";
    }

    return "semaforo-neutro";
  };
  const servicosDoDiaBase = useMemo(() => {
    if (!diaSelecionadoHome) return [];

    return dashboard.servicosExecutivos
      .filter((item) => item.date === diaSelecionadoHome)
      .map((item) => {
        let statusOperacional = "Sem guia";
        if (item.fechado) statusOperacional = "Fechado";
        else if (item.alocado) statusOperacional = "Alocado";

        const isDisp = !!item.isDisp || Number(item.serviceType || 0) === 4;

        const statusGrupo = item.fechado
          ? "Fechado"
          : isDisp
            ? "Privativo"
            : Number(item.passengers || 0) >= 8
              ? "Grupo formado"
              : "Formar grupo";

        return {
          ...item,
          statusOperacional,
          statusGrupo,
          isDisp,
        };
      });
  }, [dashboard.servicosExecutivos, diaSelecionadoHome]);

  const guiasDisponiveisNoDia = useMemo(() => {
    const unicos = Array.from(
      new Set(
        servicosDoDiaBase
          .map((item) => item.guiaNome || "-")
          .filter((nome) => nome && nome !== "-"),
      ),
    );

    return unicos.sort((a, b) =>
      a.localeCompare(b, "pt-BR", { sensitivity: "base" }),
    );
  }, [servicosDoDiaBase]);


  const servicosDoDia = useMemo(() => {
    const listaFiltrada = servicosDoDiaBase.filter((item) => {
      const statusOk =
        filtroStatusDia === "todos" ||
        (filtroStatusDia === "alocado" &&
          item.statusOperacional === "Alocado") ||
        (filtroStatusDia === "sem_guia" &&
          item.statusOperacional === "Sem guia") ||
        (filtroStatusDia === "fechado" &&
          item.statusOperacional === "Fechado") ||
        (filtroStatusDia === "grupo_formado" &&
          !item.isDisp &&
          item.statusGrupo === "Grupo formado") ||
        (filtroStatusDia === "formar_grupo" &&
          !item.isDisp &&
          item.statusGrupo === "Formar grupo");

      const guiaOk =
        filtroGuiaDia === "todos" || (item.guiaNome || "-") === filtroGuiaDia;

      return statusOk && guiaOk;
    });

    const listaOrdenada = [...listaFiltrada].sort((a, b) => {
      const paxA = Number(a.passengers || 0);
      const paxB = Number(b.passengers || 0);

      if (ordenacaoPaxDia === "maior") return paxB - paxA;
      if (ordenacaoPaxDia === "menor") return paxA - paxB;

      return (a.serviceName || "").localeCompare(b.serviceName || "", "pt-BR", {
        sensitivity: "base",
      });
    });

    return listaOrdenada;
  }, [servicosDoDiaBase, filtroStatusDia, filtroGuiaDia, ordenacaoPaxDia]);

  const formatarUltimaAtualizacao = (data) => {
    if (!data) return "Dados ainda não atualizados manualmente";
    return `Última atualização: ${data.toLocaleString("pt-BR")}`;
  };

  const formatarDataBr = (dataIso) => {
    if (!dataIso) return "";
    const [ano, mes, dia] = String(dataIso).split("-");
    return `${dia}/${mes}/${ano}`;
  };

  const isAmanha = (dataIso) => {
    if (!dataIso) return false;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const amanha = new Date(hoje);
    amanha.setDate(hoje.getDate() + 1);

    const [ano, mes, dia] = String(dataIso).split("-").map(Number);
    const dataRef = new Date(ano, mes - 1, dia);
    dataRef.setHours(0, 0, 0, 0);

    return dataRef.getTime() === amanha.getTime();
  };

  const getTextoDataOperacional = (dataIso) => {
    const dataBr = formatarDataBr(dataIso);

    if (isAmanha(dataIso)) {
      return `amanhã (${dataBr})`;
    }

    return `em ${dataBr}`;
  };

  const gerarMensagemServicoGuia = (item) => {
    const nomeGuia = item.guiaNome || "Guia";
    const textoData = getTextoDataOperacional(item.date);

    if (item.statusGrupo === "Grupo formado") {
      return `
Olá, ${nomeGuia}.

Confirmamos sua programação ${textoData}: ${item.serviceName}, com previsão de ${item.passengers} passageiro(s).

Caso haja qualquer ajuste operacional, entraremos em contato.

Operacional - Luck Receptivo
`.trim();
    }

    if (item.statusGrupo === "Formar grupo") {
      return `
Olá, ${nomeGuia}.

Informamos que, até o momento, o grupo referente ao passeio ${item.serviceName}, programado ${textoData}, ainda não foi formado.

Havendo atualização operacional, enviaremos uma nova confirmação.

Operacional - Luck Receptivo
`.trim();
    }

    return `
Olá, ${nomeGuia}.

Informamos que o serviço ${item.serviceName}, previsto ${textoData}, encontra-se fechado no momento.

Qualquer atualização operacional será comunicada oportunamente.

Operacional - Luck Receptivo
`.trim();
  };

  const enviarWhatsappServico = (item) => {
    if (!item?.guiaId && !item?.guiaNome) {
      alert("Este serviço ainda não possui guia alocado.");
      return;
    }

    const guia =
      guias.find((g) => g.id === item.guiaId) ||
      guias.find(
        (g) =>
          normalizarTexto(g.nome || "") ===
          normalizarTexto(item.guiaNome || ""),
      );

    if (!guia?.whatsapp) {
      alert("O guia selecionado não possui WhatsApp cadastrado.");
      return;
    }

    const mensagem = gerarMensagemServicoGuia({
      ...item,
      guiaNome: guia.nome || item.guiaNome || "Guia",
    });

    const numero = String(guia.whatsapp).replace(/\D/g, "");

    window.open(
      `https://wa.me/55${numero}?text=${encodeURIComponent(mensagem)}`,
      "_blank",
    );
  };

  const renderIconeComparativo = () => {
    const tipo = dashboard.alertaComparativoPax?.icone;

    if (tipo === "up") return <TrendingUpRounded fontSize="small" />;
    if (tipo === "down") return <TrendingDownRounded fontSize="small" />;
    return <RemoveRounded fontSize="small" />;
  };

  const carregandoCards = loading || atualizandoApi;

  const renderValorCard = (valor, suffix = "") =>
    carregandoCards ? (
      <SyncRounded className="spin" fontSize="small" />
    ) : (
      `${valor}${suffix}`
    );

  const renderCardLoading = (texto = "Atualizando dados...") => (
    <div className="home-dashboard-empty home-dashboard-loading-inline">
      <SyncRounded className="spin" fontSize="small" />
      <span>{texto}</span>
    </div>
  );

  const totalPaxOperadoras = useMemo(
    () =>
      dashboard.operadorasSemana.reduce(
        (acc, item) => acc + Number(item.pax || 0),
        0,
      ),
    [dashboard.operadorasSemana],
  );

  const operadorasGrafico = useMemo(
    () =>
      dashboard.operadorasSemana.map((item, index) => ({
        ...item,
        participacao: totalPaxOperadoras
          ? Math.round((Number(item.pax || 0) / totalPaxOperadoras) * 100)
          : 0,
        fill: CHART_COLORS[index % CHART_COLORS.length],
      })),
    [dashboard.operadorasSemana, totalPaxOperadoras],
  );

  return (
    <div className="home-dashboard-page">
      <div className="home-dashboard-header">
        <div className="home-dashboard-brand">
          <DashboardRounded fontSize="large" />
          <div className="home-dashboard-brand-text">
            <h2>Dashboard</h2>
            <p>Demanda real do Phoenix cruzada com alocação do sistema</p>
          </div>
        </div>

        <div className="home-dashboard-week-pill">
          <CalendarMonthRounded fontSize="small" />
          <span>
            {semana[0]?.label} até {semana[6]?.label}
          </span>
        </div>
      </div>

      <div className="home-dashboard-tabs">
        <button
          className={`home-tab ${abaAtiva === "operacao" ? "active" : ""}`}
          onClick={() => setAbaAtiva("operacao")}
        >
          Operação
        </button>
        {/* <button
          className={`home-tab ${abaAtiva === "guias" ? "active" : ""}`}
          onClick={() => setAbaAtiva("guias")}
        >
          Guias
        </button>
        <button
          className={`home-tab ${abaAtiva === "passeios" ? "active" : ""}`}
          onClick={() => setAbaAtiva("passeios")}
        >
          Passeios
        </button> */}
        <button
          className={`home-tab ${abaAtiva === "comparativo" ? "active" : ""}`}
          onClick={() => setAbaAtiva("comparativo")}
        >
          Comparativo
        </button>
      </div>

      {abaAtiva === "operacao" && (
        <>
          <div className="home-live-toolbar">
            <div className="home-live-actions">
              <button
                type="button"
                className="home-refresh-btn"
                onClick={carregarApiSemana}
                disabled={carregandoCards}
              >
                <RefreshRounded
                  fontSize="small"
                  className={carregandoCards ? "spin" : ""}
                />
                {carregandoCards
                  ? "Puxando dados do Phoenix..."
                  : "Atualizar dados do Phoenix"}
              </button>
            </div>

            <div className="home-live-info">
              {carregandoCards ? (
                <>
                  <SyncRounded className="spin" fontSize="small" />{" "}
                  <span>Atualizando...</span>
                </>
              ) : (
                formatarUltimaAtualizacao(ultimaAtualizacaoApi)
              )}
            </div>
          </div>

          <div className="home-dashboard-metrics">
            <button type="button" className="home-dashboard-metric-card">
              <div className="metric-icon">
                <TravelExploreRounded fontSize="small" />
              </div>
              <div>
                <span className="metric-label">Serviços reais</span>
                <strong className="metric-value">
                  {renderValorCard(dashboard.totalServicosReais)}
                </strong>
              </div>
            </button>

            <button type="button" className="home-dashboard-metric-card">
              <div className="metric-icon">
                <FactCheckRounded fontSize="small" />
              </div>
              <div>
                <span className="metric-label">Serviços com guia (%)</span>
                <strong className="metric-value">
                  {renderValorCard(dashboard.percentualServicosComGuia, "%")}
                </strong>
              </div>
            </button>

            <button type="button" className="home-dashboard-metric-card">
              <div className="metric-icon">
                <GroupsRounded fontSize="small" />
              </div>
              <div>
                <span className="metric-label">Passageiros com guia (%)</span>
                <strong className="metric-value">
                  {renderValorCard(dashboard.percentualPassageirosComGuia, "%")}
                </strong>
              </div>
            </button>

            <button type="button" className="home-dashboard-metric-card">
              <div className="metric-icon">
                <BusinessRounded fontSize="small" />
              </div>
              <div>
                <span className="metric-label">Operadoras na semana</span>
                <strong className="metric-value">
                  {renderValorCard(dashboard.operadorasSemana.length)}
                </strong>
              </div>
            </button>
          </div>

          <div className="home-dashboard-card home-dashboard-card-full">
            <div className="home-dashboard-card-header">
              <div className="home-dashboard-card-title">
                <CalendarMonthRounded fontSize="small" />
                <h3>Serviços do dia</h3>
              </div>

              <div className="home-header-actions">
                <div className="home-week-switcher">
                  <button
                    type="button"
                    className="home-week-nav-btn"
                    onClick={() => setSemanaOffset((prev) => prev - 1)}
                    disabled={carregandoCards}
                  >
                    ← Semana anterior
                  </button>

                  <span className="home-week-range-label">
                    {semana[0]?.label} até {semana[6]?.label}
                  </span>

                  <button
                    type="button"
                    className="home-week-nav-btn"
                    onClick={() => setSemanaOffset((prev) => prev + 1)}
                    disabled={carregandoCards}
                  >
                    Próxima semana →
                  </button>

                  {semanaOffset !== 0 && (
                    <button
                      type="button"
                      className="home-week-nav-btn secondary"
                      onClick={() => setSemanaOffset(0)}
                      disabled={carregandoCards}
                    >
                      Semana atual
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  className="home-open-scale-btn"
                  onClick={() => navigate("/passeios")}
                >
                  Abrir escala da semana
                </button>
              </div>
            </div>

            {carregandoCards ? (
              renderCardLoading("Atualizando serviços do dia...")
            ) : (
              <>
                <div className="home-day-selector">
                  {semana.map((dia) => (
                    <button
                      key={dia.date}
                      type="button"
                      className={`home-day-chip ${diaSelecionadoHome === dia.date ? "active" : ""
                        }`}
                      onClick={() => setDiaSelecionadoHome(dia.date)}
                      disabled={carregandoCards}
                    >
                      {dia.day} • {dia.label}
                    </button>
                  ))}
                </div>

                <div className="home-services-filters">
                  <select
                    className="home-services-filter-select"
                    value={filtroStatusDia}
                    onChange={(e) => setFiltroStatusDia(e.target.value)}
                  >
                    <option value="todos">Todos os status</option>
                    <option value="alocado">Alocado</option>
                    <option value="sem_guia">Sem guia</option>
                    <option value="fechado">Fechado</option>
                    <option value="grupo_formado">Grupo formado</option>
                    <option value="formar_grupo">Formar grupo</option>
                  </select>

                  <select
                    className="home-services-filter-select"
                    value={filtroGuiaDia}
                    onChange={(e) => setFiltroGuiaDia(e.target.value)}
                  >
                    <option value="todos">Todos os guias</option>
                    {guiasDisponiveisNoDia.map((guia) => (
                      <option key={guia} value={guia}>
                        {guia}
                      </option>
                    ))}
                  </select>

                  <select
                    className="home-services-filter-select"
                    value={ordenacaoPaxDia}
                    onChange={(e) => setOrdenacaoPaxDia(e.target.value)}
                  >
                    <option value="maior">Ordenar por maior pax</option>
                    <option value="menor">Ordenar por menor pax</option>
                    <option value="nome">Ordenar por nome</option>
                  </select>
                </div>

                <div className="home-services-table-wrap">
                  <table className="home-services-table">
                    <thead>
                      <tr>
                        <th>Status operacional</th>
                        <th>Status do grupo</th>
                        <th>Passeio</th>
                        <th>Guia</th>
                        <th>Pax</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {servicosDoDia.length === 0 ? (
                        <tr>
                          <td colSpan="6">
                            <div className="empty-state">
                              Nenhum serviço encontrado para o dia selecionado.
                            </div>
                          </td>
                        </tr>
                      ) : (
                        servicosDoDia.map((item) => (
                          <tr key={item.chave}>
                            <td>
                              <span
                                className={`home-service-status ${item.statusOperacional === "Fechado"
                                  ? "fechado"
                                  : item.statusOperacional === "Alocado"
                                    ? "alocado"
                                    : "sem-guia"
                                  }`}
                              >
                                {item.statusOperacional}
                              </span>
                            </td>

                            <td>
                              <span
                                className={`home-service-status ${item.statusGrupo === "Fechado"
                                  ? "fechado"
                                  : item.statusGrupo === "Grupo formado"
                                    ? "alocado"
                                    : item.statusGrupo === "Privativo"
                                      ? "privativo"
                                      : "sem-guia"
                                  }`}
                              >
                                {item.statusGrupo}
                              </span>
                            </td>

                            <td>
                              <div className="home-service-main-cell">
                                <strong>{item.serviceName}</strong>
                              </div>
                            </td>

                            <td>
                              <div className="home-service-main-cell">
                                <strong>{item.guiaNome || "-"}</strong>
                              </div>
                            </td>

                            <td>
                              <div className="home-service-main-cell">
                                <small>
                                  ADT {item.adultCount || 0} • CHD{" "}
                                  {item.childCount || 0} • INF{" "}
                                  {item.infantCount || 0}
                                </small>
                              </div>
                            </td>

                            <td>
                              <button
                                type="button"
                                className="home-send-guide-btn"
                                onClick={() => enviarWhatsappServico(item)}
                                disabled={!item.guiaId && !item.guiaNome}
                                title={
                                  item.guiaId || item.guiaNome
                                    ? "Enviar mensagem ao guia"
                                    : "Serviço sem guia alocado"
                                }
                              >
                                Enviar ao guia
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          <div className="home-dashboard-grid">
            <div className="home-dashboard-card home-dashboard-card-large">
              <div className="home-dashboard-card-header">
                <div className="home-dashboard-card-title">
                  <WarningAmberRounded fontSize="small" />
                  <h3>Alertas operacionais automáticos</h3>
                </div>
              </div>

              {carregandoCards ? (
                renderCardLoading("Atualizando alertas operacionais...")
              ) : (
                <div className="home-alerts-list">
                  {dashboard.alertas.length === 0 ? (
                    <div className="empty-state">
                      Nenhum alerta crítico detectado nesta semana.
                    </div>
                  ) : (
                    dashboard.alertas.map((alerta, index) => {
                      const classeSemaforo = getAlertaSemaforo(alerta);

                      return (
                        <div
                          key={`${alerta.titulo}-${index}`}
                          className={`home-alert-item ${classeSemaforo}`}
                        >
                          <div className="home-alert-dot" />
                          <div className="home-alert-content">
                            <strong>{alerta.titulo}</strong>
                            <span>{alerta.descricao}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            <div className="home-dashboard-card home-dashboard-card-large">
              <div className="home-dashboard-card-header">
                <div className="home-dashboard-card-title">
                  <BusinessRounded fontSize="small" />
                  <h3>Operadoras com maior volume na semana</h3>
                </div>
              </div>

              {carregandoCards ? (
                renderCardLoading("Atualizando operadoras da semana...")
              ) : dashboard.operadorasSemana.length === 0 ? (
                <div className="empty-state">
                  Nenhuma operadora identificada nesta semana.
                </div>
              ) : (
                <>
                  <div style={{ width: "100%", height: 300 }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={operadorasGrafico}
                          dataKey="pax"
                          nameKey="nomeCurto"
                          innerRadius={68}
                          outerRadius={108}
                          paddingAngle={2}
                        >
                          {operadorasGrafico.map((entry, index) => (
                            <Cell
                              key={`operadora-cell-${entry.nome}-${index}`}
                              fill={entry.fill}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={tooltipStyle}
                          formatter={(value, name, props) => [
                            `${value} pax`,
                            props?.payload?.nome || name,
                          ]}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="home-dashboard-ranking">
                    {dashboard.operadorasSemana.map((operadora) => (
                      <div key={operadora.nome} className="ranking-item">
                        <div className="ranking-top">
                          <span className="ranking-name">{operadora.nome}</span>
                          <span className="ranking-badge">
                            {operadora.pax} pax
                          </span>
                        </div>

                        <div className="ranking-meta">
                          <span>
                            {operadora.reservas} reserva(s)
                          </span>
                          <span>
                            Participação:{" "}
                            {totalPaxOperadoras
                              ? Math.round(
                                (operadora.pax / totalPaxOperadoras) * 100,
                              )
                              : 0}
                            %
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="home-dashboard-card home-dashboard-card-large">
              <div className="home-dashboard-card-header">
                <div className="home-dashboard-card-title">
                  <CalendarMonthRounded fontSize="small" />
                  <h3>Demanda da semana</h3>
                </div>
              </div>

              {carregandoCards ? (
                renderCardLoading("Atualizando demanda da semana...")
              ) : (
                <div style={{ width: "100%", height: 340 }}>
                  <ResponsiveContainer>
                    <ComposedChart
                      data={dashboard.distribuicaoSemana}
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" opacity={0.18} />
                      <XAxis dataKey="short" />
                      <YAxis yAxisId="left" allowDecimals={false} />
                      <YAxis yAxisId="right" orientation="right" />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(value, name) => {
                          if (name === "Pax") return [`${value} pax`, name];
                          return [`${value}`, name];
                        }}
                      />
                      <Legend />
                      <Bar
                        yAxisId="left"
                        dataKey="total"
                        name="Total de serviços"
                        radius={[8, 8, 0, 0]}
                        fill="#2563eb"
                      />
                      <Bar
                        yAxisId="left"
                        dataKey="comGuia"
                        name="Serviços com guia"
                        radius={[8, 8, 0, 0]}
                        fill="#14b8a6"
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="pax"
                        name="Pax"
                        stroke="#f59e0b"
                        strokeWidth={3}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="home-dashboard-card home-dashboard-card-full">
              <div className="home-dashboard-card-header">
                <div className="home-dashboard-card-title">
                  <LockRounded fontSize="small" />
                  <h3>Versículo do dia</h3>
                </div>
              </div>

              {loading ? (
                renderCardLoading("Atualizando versículo do dia...")
              ) : versiculo ? (
                <div className="home-bible-card">
                  <p className="home-bible-text">"{versiculo.texto}"</p>
                  <strong className="home-bible-ref">
                    {versiculo.referencia}
                  </strong>
                </div>
              ) : (
                <div className="empty-state">
                  Não foi possível carregar o versículo.
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* {abaAtiva === "guias" && (
        <div className="home-dashboard-grid">
          <div className="home-dashboard-card home-dashboard-card-large">
            <div className="home-dashboard-card-header">
              <div className="home-dashboard-card-title">
                <AutoGraphRounded fontSize="small" />
                <h3>Balanceamento por guia</h3>
              </div>
            </div>

            {carregandoCards ? (
              renderCardLoading("Atualizando balanceamento por guia...")
            ) : dashboard.resumoGuias.length === 0 ? (
              <div className="empty-state">
                Sem dados de ocupação nesta semana.
              </div>
            ) : (
              <div style={{ width: "100%", height: 460 }}>
                <ResponsiveContainer>
                  <BarChart
                    data={dashboard.resumoGuias}
                    layout="vertical"
                    margin={{ top: 10, right: 20, left: 30, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.18} />
                    <XAxis type="number" domain={[0, 100]} />
                    <YAxis
                      type="category"
                      dataKey="nomeCurto"
                      width={140}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value, name, props) => {
                        if (name === "Ocupação (%)") {
                          return [`${value}%`, name];
                        }
                        return [value, name];
                      }}
                      labelFormatter={(label, items) =>
                        items?.[0]?.payload?.nome || label
                      }
                    />
                    <Legend />
                    <Bar
                      dataKey="ocupacao"
                      name="Ocupação (%)"
                      radius={[0, 8, 8, 0]}
                      fill="#2563eb"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="home-dashboard-card">
            <div className="home-dashboard-card-header">
              <div className="home-dashboard-card-title">
                <LocalFireDepartmentRounded fontSize="small" />
                <h3>Ranking de sobrecarga</h3>
              </div>
            </div>

            {carregandoCards ? (
              renderCardLoading("Atualizando card...")
            ) : (
              <div className="home-dashboard-ranking">
                {dashboard.guiasSobrecarga.length === 0 ? (
                  <div className="empty-state">
                    Nenhum guia em sobrecarga alta.
                  </div>
                ) : (
                  dashboard.guiasSobrecarga.map((guia) => (
                    <div key={guia.id} className="ranking-item">
                      <div className="ranking-top">
                        <span className="ranking-name">{guia.nome}</span>
                        <span className="ranking-badge">{guia.ocupacao}%</span>
                      </div>

                      <div className="ranking-bar">
                        <div
                          className="ranking-bar-fill high"
                          style={{ width: `${Math.min(guia.ocupacao, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="home-dashboard-card">
            <div className="home-dashboard-card-header">
              <div className="home-dashboard-card-title">
                <SearchOffRounded fontSize="small" />
                <h3>Ranking de ociosidade</h3>
              </div>
            </div>

            {carregandoCards ? (
              renderCardLoading("Atualizando card...")
            ) : (
              <div className="home-dashboard-ranking">
                {dashboard.guiasOciosos.length === 0 ? (
                  <div className="empty-state">
                    Nenhum guia com ociosidade relevante.
                  </div>
                ) : (
                  dashboard.guiasOciosos.map((guia) => (
                    <div key={guia.id} className="ranking-item">
                      <div className="ranking-top">
                        <span className="ranking-name">{guia.nome}</span>
                        <span className="ranking-badge">{guia.ocupacao}%</span>
                      </div>

                      <div className="ranking-bar">
                        <div
                          className="ranking-bar-fill low"
                          style={{ width: `${Math.max(guia.ocupacao, 4)}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="home-dashboard-card home-dashboard-card-full">
            <div className="home-dashboard-card-header">
              <div className="home-dashboard-card-title">
                <GroupsRounded fontSize="small" />
                <h3>Resumo de guias</h3>
              </div>
            </div>

            {carregandoCards ? (
              renderCardLoading("Atualizando card...")
            ) : (
              <div className="home-dashboard-summary-grid">
                <div className="summary-box">
                  <span className="summary-label">Guias ativos</span>
                  <strong>{dashboard.guiasAtivos}</strong>
                </div>

                <div className="summary-box">
                  <span className="summary-label">Guias inativos</span>
                  <strong>{dashboard.guiasInativos}</strong>
                </div>

                <div className="summary-box">
                  <span className="summary-label">Motoguias</span>
                  <strong>{dashboard.motoguias}</strong>
                </div>

                <div className="summary-box">
                  <span className="summary-label">Cobertura afinidade</span>
                  <strong>{dashboard.coberturaAfinidade}%</strong>
                </div>

                <div className="summary-box">
                  <span className="summary-label">Disponibilidade média</span>
                  <strong>{dashboard.disponibilidadeMedia}</strong>
                </div>
              </div>
            )}
          </div>
        </div>
      )} */}

      {/* {abaAtiva === "passeios" && (
        <div className="home-dashboard-grid">
          <div className="home-dashboard-card home-dashboard-card-large">
            <div className="home-dashboard-card-header">
              <div className="home-dashboard-card-title">
                <TravelExploreRounded fontSize="small" />
                <h3>Uso da disponibilidade dos guias</h3>
              </div>
            </div>

            {carregandoCards ? (
              renderCardLoading("Atualizando distribuição dos guias...")
            ) : dashboard.distribuicaoGuias.length === 0 ? (
              <div className="empty-state">
                Sem dados de distribuição dos guias nesta semana.
              </div>
            ) : (
              <div className="home-guias-uso-card">
                <div className="home-guias-uso-list">
                  {dashboard.distribuicaoGuias.map((guia) => (
                    <div key={guia.id} className="home-guia-uso-item">
                      <div className="home-guia-uso-top">
                        <strong className="home-guia-uso-nome">
                          {guia.nome}
                        </strong>
                        <span
                          className={`home-guia-uso-status ${guia.statusDistribuicao
                            .toLowerCase()
                            .replace(/\s+/g, "-")}`}
                        >
                          {guia.statusDistribuicao}
                        </span>
                      </div>

                      <div className="home-guia-uso-grid">
                        <div className="home-guia-uso-metric">
                          <span className="home-guia-uso-label">
                            Disponibilidade
                          </span>
                          <div className="home-guia-uso-bar">
                            <div
                              className="home-guia-uso-fill disponibilidade"
                              style={{
                                width: `${Math.min(
                                  (guia.diasDisponiveis / 7) * 100,
                                  100,
                                )}%`,
                              }}
                            />
                          </div>
                          <strong className="home-guia-uso-value">
                            {guia.diasDisponiveis} dia(s)
                          </strong>
                        </div>

                        <div className="home-guia-uso-metric">
                          <span className="home-guia-uso-label">
                            Dias utilizados
                          </span>
                          <div className="home-guia-uso-bar">
                            <div
                              className="home-guia-uso-fill utilizados"
                              style={{
                                width: `${Math.min(
                                  (guia.diasUtilizados / 7) * 100,
                                  100,
                                )}%`,
                              }}
                            />
                          </div>
                          <strong className="home-guia-uso-value">
                            {guia.diasUtilizados} dia(s)
                          </strong>
                        </div>

                        <div className="home-guia-uso-metric">
                          <span className="home-guia-uso-label">
                            Porcentagem de uso
                          </span>
                          <div className="home-guia-uso-bar">
                            <div
                              className={`home-guia-uso-fill percentual ${guia.percentualUso >= 85
                                  ? "alto"
                                  : guia.percentualUso >= 60
                                    ? "equilibrado"
                                    : guia.percentualUso >= 30
                                      ? "moderado"
                                      : "baixo"
                                }`}
                              style={{
                                width: `${Math.min(guia.percentualUso, 100)}%`,
                              }}
                            />
                          </div>
                          <strong className="home-guia-uso-value">
                            {guia.percentualUso}%
                          </strong>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="home-distribuicao-geral-box">
                  <div className="home-distribuicao-geral-top">
                    <strong>Medidor geral de distribuição</strong>
                    <span>{dashboard.statusGeralDistribuicao}</span>
                  </div>

                  <div className="home-distribuicao-geral-bar">
                    <div
                      className={`home-distribuicao-geral-fill ${dashboard.mediaUsoDistribuicao >= 85
                          ? "alto"
                          : dashboard.mediaUsoDistribuicao >= 60
                            ? "equilibrado"
                            : dashboard.mediaUsoDistribuicao >= 30
                              ? "moderado"
                              : "baixo"
                        }`}
                      style={{
                        width: `${Math.min(
                          dashboard.mediaUsoDistribuicao,
                          100,
                        )}%`,
                      }}
                    />
                  </div>

                  <div className="home-distribuicao-geral-legenda">
                    <span>0%</span>
                    <span>
                      {dashboard.mediaUsoDistribuicao}% de uso médio
                    </span>
                    <span>100%</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="home-dashboard-card home-dashboard-card-full">
            <div className="home-dashboard-card-header">
              <div className="home-dashboard-card-title">
                <InsightsRounded fontSize="small" />
                <h3>Resumo executivo dos serviços reais</h3>
              </div>
            </div>

            {carregandoCards ? (
              renderCardLoading("Atualizando card...")
            ) : (
              <div className="home-dashboard-summary-grid">
                <div className="summary-box">
                  <span className="summary-label">Serviços reais</span>
                  <strong>{renderValorCard(dashboard.totalServicosReais)}</strong>
                </div>

                <div className="summary-box">
                  <span className="summary-label">Alocados</span>
                  <strong>{dashboard.servicosAlocados.length}</strong>
                </div>

                <div className="summary-box">
                  <span className="summary-label">Sem guia</span>
                  <strong>{dashboard.servicosSemGuia.length}</strong>
                </div>

                <div className="summary-box">
                  <span className="summary-label">Fechados</span>
                  <strong>{dashboard.servicosFechados.length}</strong>
                </div>

                <div className="summary-box">
                  <span className="summary-label">Grupos formados</span>
                  <strong>{dashboard.gruposFormados.length}</strong>
                </div>

                <div className="summary-box">
                  <span className="summary-label">Grupos não formados</span>
                  <strong>{dashboard.gruposNaoFormados.length}</strong>
                </div>
              </div>
            )}
          </div>

          <div className="home-dashboard-card home-dashboard-card-full">
            <div className="home-dashboard-card-header">
              <div className="home-dashboard-card-title">
                <TravelExploreRounded fontSize="small" />
                <h3>Ranking detalhado dos passeios</h3>
              </div>
            </div>

            {carregandoCards ? (
              renderCardLoading("Atualizando ranking...")
            ) : (
              <div className="home-dashboard-ranking">
                {dashboard.topPasseios.length === 0 ? (
                  <div className="empty-state">
                    Sem volume registrado nesta semana.
                  </div>
                ) : (
                  dashboard.topPasseios.map((passeio) => (
                    <div key={passeio.nome} className="tour-item">
                      <div className="tour-top">
                        <span className="tour-name">{passeio.nome}</span>
                        <span className="tour-pax">{passeio.pax} pax</span>
                      </div>

                      <div className="tour-meta">
                        <span>{passeio.servicos} ocorrência(s)</span>
                        <span>{passeio.comGuia} com guia</span>
                        <span>{passeio.semGuia} sem guia</span>
                        <span>{passeio.fechados} fechados</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )} */}

      {abaAtiva === "comparativo" && (
        <div className="home-dashboard-grid">
          <div className="home-dashboard-card home-dashboard-card-full">
            <div className="home-dashboard-card-header">
              <div className="home-dashboard-card-title">
                <ShieldRounded fontSize="small" />
                <h3>Comparativo semanal</h3>
              </div>
            </div>

            {carregandoCards ? (
              renderCardLoading("Atualizando card...")
            ) : (
              <div className="home-dashboard-summary-grid">
                <div className="summary-box">
                  <span className="summary-label">Serviços atuais</span>
                  <strong>{dashboard.comparativoGeral.servicosAtual}</strong>
                  <small>
                    Semana anterior:{" "}
                    {dashboard.comparativoGeral.servicosAnterior}
                  </small>
                </div>

                <div className="summary-box">
                  <span className="summary-label">Delta de serviços</span>
                  <strong>
                    {formatarDelta(dashboard.comparativoGeral.deltaServicos)}
                  </strong>
                  <small>
                    {formatarDelta(
                      dashboard.comparativoGeral.deltaPercentualServicos,
                    )}
                    %
                  </small>
                </div>

                <div className="summary-box">
                  <span className="summary-label">Pax atuais</span>
                  <strong>{dashboard.comparativoGeral.paxAtual}</strong>
                  <small>
                    Semana anterior: {dashboard.comparativoGeral.paxAnterior}
                  </small>
                </div>

                <div className="summary-box">
                  <span className="summary-label">Delta de pax</span>
                  <strong>
                    {formatarDelta(dashboard.comparativoGeral.deltaPax)}
                  </strong>
                  <small>
                    {formatarDelta(
                      dashboard.comparativoGeral.deltaPercentualPax,
                    )}
                    %
                  </small>
                </div>
              </div>
            )}
          </div>

          <div className="home-dashboard-card home-dashboard-card-full">
            <div className="home-dashboard-card-header">
              <div className="home-dashboard-card-title">
                {renderIconeComparativo()}
                <h3>Leitura operacional do comparativo de pax</h3>
              </div>
            </div>

            {carregandoCards ? (
              renderCardLoading("Atualizando card...")
            ) : (
              <div
                className={`home-alert-item ${getAlertaSemaforo(
                  dashboard.alertaComparativoPax
                )}`}
              >
                <div className="home-alert-dot" />
                <div className="home-alert-content">
                  <strong>{dashboard.alertaComparativoPax?.titulo}</strong>
                  <span>{dashboard.alertaComparativoPax?.descricao}</span>
                </div>
              </div>
            )}
          </div>

          <div className="home-dashboard-card home-dashboard-card-large">
            <div className="home-dashboard-card-header">
              <div className="home-dashboard-card-title">
                <InsightsRounded fontSize="small" />
                <h3>Serviços por dia • Atual x Semana anterior</h3>
              </div>
            </div>

            {carregandoCards ? (
              renderCardLoading("Atualizando card...")
            ) : (
              <div style={{ width: "100%", height: 340 }}>
                <ResponsiveContainer>
                  <BarChart
                    data={dashboard.distribuicaoComparativaSemana}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.18} />
                    <XAxis dataKey="short" />
                    <YAxis allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                    <Bar
                      dataKey="servicosAnterior"
                      name="Semana anterior"
                      fill="#93c5fd"
                      radius={[8, 8, 0, 0]}
                    />
                    <Bar
                      dataKey="servicosAtual"
                      name="Semana atual"
                      fill="#2563eb"
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
                <GroupsRounded fontSize="small" />
                <h3>Pax por dia • Atual x Semana anterior</h3>
              </div>
            </div>

            {carregandoCards ? (
              renderCardLoading("Atualizando card...")
            ) : (
              <div style={{ width: "100%", height: 340 }}>
                <ResponsiveContainer>
                  <LineChart
                    data={dashboard.distribuicaoComparativaSemana}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.18} />
                    <XAxis dataKey="short" />
                    <YAxis />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="paxAnterior"
                      name="Semana anterior"
                      stroke="#93c5fd"
                      strokeWidth={3}
                      dot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="paxAtual"
                      name="Semana atual"
                      stroke="#f59e0b"
                      strokeWidth={3}
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="home-dashboard-card home-dashboard-card-full">
            <div className="home-dashboard-card-header">
              <div className="home-dashboard-card-title">
                <TravelExploreRounded fontSize="small" />
                <h3>Passeios com maior variação</h3>
              </div>
            </div>

            {carregandoCards ? (
              renderCardLoading("Atualizando card...")
            ) : dashboard.comparativoPasseios.length === 0 ? (
              <div className="empty-state">
                Sem dados comparativos de passeios.
              </div>
            ) : (
              <div className="home-dashboard-ranking">
                {dashboard.comparativoPasseios.map((passeio) => (
                  <div key={passeio.nome} className="ranking-item">
                    <div className="ranking-top">
                      <span className="ranking-name">{passeio.nome}</span>
                      <span className="ranking-badge">
                        Δ pax {formatarDelta(passeio.deltaPax)}
                      </span>
                    </div>

                    <div className="ranking-meta">
                      <span>
                        Serviços: {passeio.servicosAtual} /{" "}
                        {passeio.servicosAnterior}
                      </span>
                      <span>
                        Pax: {passeio.paxAtual} / {passeio.paxAnterior}
                      </span>
                      <span>
                        Δ serviços: {formatarDelta(passeio.deltaServicos)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="home-dashboard-card home-dashboard-card-full">
            <div className="home-dashboard-card-header">
              <div className="home-dashboard-card-title">
                <BusinessRounded fontSize="small" />
                <h3>Operadoras da semana</h3>
              </div>
            </div>

            {carregandoCards ? (
              renderCardLoading("Atualizando card...")
            ) : (
              <div className="home-dashboard-ranking">
                {dashboard.operadorasSemana.length === 0 ? (
                  <div className="empty-state">
                    Nenhuma operadora identificada nesta semana.
                  </div>
                ) : (
                  dashboard.operadorasSemana.map((operadora) => (
                    <div key={operadora.nome} className="ranking-item">
                      <div className="ranking-top">
                        <span className="ranking-name">{operadora.nome}</span>
                        <span className="ranking-badge">
                          {operadora.pax} pax
                        </span>
                      </div>

                      <div className="ranking-meta">
                        <span>
                          {operadora.reservas} reserva(s)/ocorrência(s)
                        </span>
                        <span>Total de pax na semana</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="home-dashboard-card home-dashboard-card-full">
            <div className="home-dashboard-card-header">
              <div className="home-dashboard-card-title">
                <CalendarMonthRounded fontSize="small" />
                <h3>Atualização do comparativo</h3>
              </div>
            </div>

            <div className="home-live-info">
              {formatarUltimaAtualizacao(ultimaAtualizacaoComparativo)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;