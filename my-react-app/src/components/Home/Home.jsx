import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, query, where } from "firebase/firestore";
import {
  ResponsiveContainer,
  LineChart,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Bar,
  Line,
} from "recharts";
import { db } from "../../Services/Services/firebase";
import "./home.css";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  FilterBar,
  Icon,
  KpiTiles,
  PageHeader,
  Segmented,
  StatusDot,
  Table,
  TableHead,
  TableRow,
} from "../ui";
import { usePhoenixStatus } from "../Shell/shellContext";

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

// cores dos gráficos: só tokens (accent + neutro)
const CHART_COLORS = ["var(--accent)", "var(--text-3)"];

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
  background: "var(--surface)",
  border: "1px solid var(--divider)",
  borderRadius: 10,
  boxShadow: "var(--shadow-pop)",
  color: "var(--text)",
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
  const [servicoCopiadoChave, setServicoCopiadoChave] = useState(null);

  const semana = useMemo(
    () => getSemanaPorOffset(semanaOffset),
    [semanaOffset],
  );
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

  // Se a semana mudar (ou clicar em atualizar de novo) enquanto uma busca
  // ainda está rodando, a resposta antiga é descartada.
  const reqApiRef = useRef(0);

  const carregarApiSemana = async () => {
    const reqId = ++reqApiRef.current;

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

      if (reqId !== reqApiRef.current) return;

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
      if (reqId === reqApiRef.current) setAtualizandoApi(false);
    }
  };

  // Puxa os dados do Phoenix sozinho ao abrir a tela e ao trocar de semana.
  // É um efeito À PARTE do carregamento do Firestore: se algo daquele lado
  // falhar (versículo, permissão, rede), o Phoenix carrega do mesmo jeito.
  useEffect(() => {
    carregarApiSemana();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inicioSemana, fimSemana]);

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
          fetch(`https://bible-api.com/${referencia}?translation=almeida`).catch(
            () => null,
          ),
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

        // O versículo é só enfeite: se falhar, não pode travar o resto da tela.
        let versiculoData = null;
        try {
          versiculoData = versiculoRes ? await versiculoRes.json() : null;
        } catch {
          versiculoData = null;
        }

        if (versiculoData?.text) {
          setVersiculo({
            texto: versiculoData.text,
            referencia: versiculoData.reference,
          });
        }

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
        const disponibilidadeSemana = Array.isArray(
          mapaDisponibilidade[guia.id],
        )
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
    else if (mediaUsoDistribuicao >= 30) statusGeralDistribuicao = "Moderada";

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
    const texto =
      `${alerta?.titulo || ""} ${alerta?.descricao || ""}`.toLowerCase();

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
    if (!data) return "Dados ainda não atualizados";
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

  // ---- Copiar UM serviço do dia (texto pronto pra enviar ao guia) ----
  const montarTextoServicoDia = (item) => {
    const nomeGuia = String(item.guiaNome || "Guia").trim();
    const primeiroNome = nomeGuia.split(/\s+/)[0] || nomeGuia;

    const [ano, mes, dia] = String(item.date || "").split("-").map(Number);
    const diasSemana = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
    const diaSemana = ano ? diasSemana[new Date(ano, mes - 1, dia).getDay()] : "";
    const quando = `${isAmanha(item.date) ? "amanhã, " : ""}*${diaSemana ? `${diaSemana}, ` : ""}${formatarDataBr(item.date)}*`;

    const detalhePax = [
      item.adultCount ? `${item.adultCount} ADT` : "",
      item.childCount ? `${item.childCount} CHD` : "",
      item.infantCount ? `${item.infantCount} INF` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    const totalPax =
      Number(item.adultCount || 0) + Number(item.childCount || 0) + Number(item.infantCount || 0);

    const partes = [
      item.guiaNome ? `Olá, ${primeiroNome}!` : "Olá!",
      "Tudo bem?",
      "",
      `Segue sua programação para ${quando}:`,
      "",
      `*${item.serviceName}*`,
      `Pax: *${totalPax}*${detalhePax ? ` (${detalhePax})` : ""}`,
      "",
      "Qualquer dúvida, estamos à disposição.",
      "Bom trabalho! 🍀",
      "",
      "_Operacional · Luck SSA_",
    ];

    return partes.join("\n");
  };

  const copiarServicoDia = async (item) => {
    try {
      await navigator.clipboard.writeText(montarTextoServicoDia(item));
      setServicoCopiadoChave(item.chave);
      setTimeout(() => {
        setServicoCopiadoChave((atual) =>
          atual === item.chave ? null : atual,
        );
      }, 1800);
    } catch (err) {
      console.error("Erro ao copiar serviço:", err);
      alert("Não foi possível copiar o serviço.");
    }
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

    if (tipo === "up") return <Icon name="trendingUp" size={16} />;
    if (tipo === "down") return <Icon name="trendingDown" size={16} />;
    return <Icon name="minus" size={16} />;
  };

  const carregandoCards = loading || atualizandoApi;

  // indicador "Phoenix · HH:MM" da barra superior: o clique chama o mesmo
  // carregarApiSemana do botão "Atualizar dados do Phoenix"
  usePhoenixStatus({
    atualizadoEm: ultimaAtualizacaoApi,
    carregando: carregandoCards,
    atualizar: carregarApiSemana,
  });

  const renderValorCard = (valor, suffix = "") =>
    carregandoCards ? "…" : `${valor}${suffix}`;

  const renderCardLoading = (texto = "Atualizando dados...") => (
    <div className="dash-loading">
      <Icon name="loader" size={16} className="ui-spin" />
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

  /* ---- números do dia selecionado (só contagem do que a tabela já mostra) ---- */
  const resumoDia = useMemo(
    () => ({
      total: servicosDoDiaBase.length,
      semGuia: servicosDoDiaBase.filter((s) => s.statusOperacional === "Sem guia").length,
      formarGrupo: servicosDoDiaBase.filter(
        (s) => !s.isDisp && s.statusGrupo === "Formar grupo",
      ).length,
      pax: servicosDoDiaBase.reduce((acc, s) => acc + Number(s.passengers || 0), 0),
    }),
    [servicosDoDiaBase],
  );

  const diaInfo = semana.find((d) => d.date === diaSelecionadoHome);
  const maiorPaxOperadora = operadorasGrafico[0]?.pax || 1;

  const tomStatusOperacional = (status) =>
    status === "Sem guia" ? "alert" : status === "Alocado" ? "accent" : "muted";

  const tomStatusGrupo = (status) =>
    status === "Formar grupo"
      ? "warning"
      : status === "Grupo formado"
        ? "accent"
        : "muted";

  const tomAlerta = (alerta) => {
    const s = getAlertaSemaforo(alerta);
    if (s === "semaforo-vermelho") return "alert";
    if (s === "semaforo-amarelo") return "warning";
    if (s === "semaforo-verde") return "accent";
    return alerta?.tipo === "critico" ? "alert" : "neutral";
  };

  const eixo = { fill: "var(--text-3)", fontSize: 12 };

  return (
    <div className="home-page dash ui-page">
      <PageHeader
        title="Operação de hoje"
        description={`Semana de ${semana[0]?.label} a ${semana[6]?.label} · demanda real do Phoenix cruzada com a escala do sistema`}
        actions={
          <>
            <Button icon="sparkles" onClick={() => navigate("/passeios")}>
              Abrir escala da semana
            </Button>
            <Button
              variant="primary"
              icon="refresh"
              onClick={carregarApiSemana}
              disabled={carregandoCards}
              loading={atualizandoApi}
            >
              {carregandoCards
                ? "Puxando dados do Phoenix..."
                : "Atualizar dados do Phoenix"}
            </Button>
          </>
        }
      />

      <FilterBar className="dash-toolbar">
        <Segmented
          ariaLabel="Visão"
          value={abaAtiva}
          onChange={setAbaAtiva}
          options={[
            { value: "operacao", label: "Operação", icon: "painel" },
            { value: "comparativo", label: "Comparativo", icon: "lineChart" },
          ]}
        />

        <div className="dash-week" role="group" aria-label="Semana">
          <Button
            iconOnly
            icon="chevronLeft"
            title="Semana anterior"
            aria-label="Semana anterior"
            onClick={() => setSemanaOffset((prev) => prev - 1)}
            disabled={carregandoCards}
          />
          <span className="dash-week__label tabular">
            {semana[0]?.label} – {semana[6]?.label}
          </span>
          <Button
            iconOnly
            icon="chevronRight"
            title="Próxima semana"
            aria-label="Próxima semana"
            onClick={() => setSemanaOffset((prev) => prev + 1)}
            disabled={carregandoCards}
          />
          {semanaOffset !== 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSemanaOffset(0)}
              disabled={carregandoCards}
            >
              Semana atual
            </Button>
          )}
        </div>

        <span className="dash-updated">
          {carregandoCards ? (
            <>
              <Icon name="loader" size={14} className="ui-spin" /> Atualizando...
            </>
          ) : abaAtiva === "comparativo" ? (
            formatarUltimaAtualizacao(ultimaAtualizacaoComparativo)
          ) : (
            formatarUltimaAtualizacao(ultimaAtualizacaoApi)
          )}
        </span>
      </FilterBar>

      {abaAtiva === "operacao" && (
        <>
          {/* ---- dias da semana ---- */}
          <div className="dash-days" role="tablist" aria-label="Dia">
            {semana.map((dia) => {
              const info = dashboard.distribuicaoSemana.find((d) => d.date === dia.date);
              const ativo = diaSelecionadoHome === dia.date;
              return (
                <button
                  key={dia.date}
                  type="button"
                  role="tab"
                  aria-selected={ativo}
                  className={`dash-day ${ativo ? "is-active" : ""}`}
                  onClick={() => setDiaSelecionadoHome(dia.date)}
                  disabled={carregandoCards}
                >
                  <span className="dash-day__nome">{dia.day}</span>
                  <span className="dash-day__data tabular">{dia.label}</span>
                  <span className="dash-day__meta tabular">
                    {carregandoCards
                      ? "…"
                      : `${info?.comGuia ?? 0}/${info?.total ?? 0} com guia`}
                    {!carregandoCards && info?.semGuia > 0 && (
                      <span className="dash-day__alerta" title={`${info.semGuia} sem guia`} />
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ---- tiles do dia (clicar filtra a tabela) ---- */}
          <KpiTiles
            items={[
              {
                key: "todos",
                label: "Serviços no dia",
                value: renderValorCard(resumoDia.total),
                hint: carregandoCards ? undefined : `${resumoDia.pax} pax`,
                onClick: () => setFiltroStatusDia("todos"),
                active: filtroStatusDia === "todos",
              },
              {
                key: "guias",
                label: "Guias escalados",
                value: renderValorCard(guiasDisponiveisNoDia.length),
              },
              {
                key: "sem_guia",
                label: "Sem guia",
                value: renderValorCard(resumoDia.semGuia),
                tone: resumoDia.semGuia ? "alert" : undefined,
                onClick: () => setFiltroStatusDia("sem_guia"),
                active: filtroStatusDia === "sem_guia",
              },
              {
                key: "formar_grupo",
                label: "Grupos a formar",
                value: renderValorCard(resumoDia.formarGrupo),
                tone: resumoDia.formarGrupo ? "warning" : undefined,
                onClick: () => setFiltroStatusDia("formar_grupo"),
                active: filtroStatusDia === "formar_grupo",
              },
            ]}
          />

          {/* ---- guias e serviços do dia ---- */}
          <Card>
            <CardHeader
              icon="calendar"
              title="Guias e serviços do dia"
              subtitle={
                diaInfo ? `${diaInfo.day} · ${formatarDataBr(diaInfo.date)}` : undefined
              }
              actions={
                <div className="dash-filters">
                  <Field label="Status">
                    <select
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
                  </Field>
                  <Field label="Guia">
                    <select
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
                  </Field>
                  <Field label="Ordenar">
                    <select
                      value={ordenacaoPaxDia}
                      onChange={(e) => setOrdenacaoPaxDia(e.target.value)}
                    >
                      <option value="maior">Maior pax</option>
                      <option value="menor">Menor pax</option>
                      <option value="nome">Nome</option>
                    </select>
                  </Field>
                </div>
              }
            />

            {carregandoCards ? (
              renderCardLoading("Atualizando serviços do dia...")
            ) : servicosDoDia.length === 0 ? (
              <EmptyState icon="calendar" title="Nenhum serviço encontrado para o dia selecionado.">
                {filtroStatusDia !== "todos" || filtroGuiaDia !== "todos"
                  ? "Há filtros aplicados — clique em “Serviços no dia” para ver todos."
                  : undefined}
              </EmptyState>
            ) : (
              <Table
                className="dash-table"
                columns="minmax(220px, 2fr) minmax(150px, 1.2fr) 64px minmax(120px, 1fr) minmax(130px, 1fr) 150px"
                minWidth={880}
              >
                <TableHead>
                  <span>Passeio</span>
                  <span>Guia</span>
                  <span className="ui-cell-end dash-pax">Pax</span>
                  <span>Status</span>
                  <span>Grupo</span>
                  <span className="ui-cell-end">Ações</span>
                </TableHead>

                {servicosDoDia.map((item) => {
                  const copiado = servicoCopiadoChave === item.chave;
                  const temGuia = !!(item.guiaId || item.guiaNome);
                  return (
                    <TableRow key={item.chave}>
                      <span>
                        <span className="ui-cell-main">{item.serviceName}</span>
                        <span className="ui-cell-sub tabular">
                          ADT {item.adultCount || 0} · CHD {item.childCount || 0} · INF{" "}
                          {item.infantCount || 0}
                        </span>
                      </span>
                      <span>
                        {item.guiaNome ? (
                          <span className="ui-cell-main">{item.guiaNome}</span>
                        ) : (
                          <StatusDot tone="alert" icon="alert">
                            Sem guia
                          </StatusDot>
                        )}
                      </span>
                      <span className="ui-cell-end ui-cell-main tabular dash-pax">
                        {item.passengers || 0}
                      </span>
                      <StatusDot tone={tomStatusOperacional(item.statusOperacional)}>
                        {item.statusOperacional}
                      </StatusDot>
                      <StatusDot tone={tomStatusGrupo(item.statusGrupo)}>
                        {item.statusGrupo}
                      </StatusDot>
                      <span className="dash-actions ui-cell-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          iconOnly
                          icon={copiado ? "check" : "copy"}
                          onClick={() => copiarServicoDia(item)}
                          title={copiado ? "Copiado!" : "Copiar serviço"}
                          aria-label={copiado ? "Copiado!" : "Copiar serviço"}
                        />
                        <Button
                          size="sm"
                          icon="message"
                          onClick={() => enviarWhatsappServico(item)}
                          disabled={!temGuia}
                          title={temGuia ? "Enviar mensagem ao guia" : "Serviço sem guia alocado"}
                        >
                          Enviar ao guia
                        </Button>
                      </span>
                    </TableRow>
                  );
                })}
              </Table>
            )}
          </Card>

          {/* ---- resumo da semana ---- */}
          <section className="dash-section">
            <h2 className="dash-section__title">Resumo da semana</h2>
            <KpiTiles
              highlightFirst={false}
              items={[
                {
                  key: "reais",
                  label: "Serviços reais",
                  icon: "compass",
                  value: renderValorCard(dashboard.totalServicosReais),
                },
                {
                  key: "comGuia",
                  label: "Serviços com guia",
                  icon: "users",
                  value: renderValorCard(dashboard.percentualServicosComGuia, "%"),
                },
                {
                  key: "paxGuia",
                  label: "Passageiros com guia",
                  icon: "user",
                  value: renderValorCard(dashboard.percentualPassageirosComGuia, "%"),
                },
                {
                  key: "operadoras",
                  label: "Operadoras na semana",
                  icon: "building",
                  value: renderValorCard(dashboard.operadorasSemana.length),
                },
              ]}
            />
          </section>

          <div className="dash-grid">
            <Card>
              <CardHeader icon="alert" title="Alertas operacionais automáticos" />
              {carregandoCards ? (
                renderCardLoading("Atualizando alertas operacionais...")
              ) : dashboard.alertas.length === 0 ? (
                <EmptyState icon="circleCheck" title="Nenhum alerta crítico detectado nesta semana." />
              ) : (
                <ul className="dash-alerts">
                  {dashboard.alertas.map((alerta, index) => (
                    <li key={`${alerta.titulo}-${index}`} className="dash-alert">
                      <StatusDot tone={tomAlerta(alerta)}>{alerta.titulo}</StatusDot>
                      <span className="dash-alert__desc">{alerta.descricao}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader
                icon="building"
                title="Operadoras com maior volume na semana"
                subtitle={carregandoCards ? undefined : `${totalPaxOperadoras} pax no total`}
              />
              {carregandoCards ? (
                renderCardLoading("Atualizando operadoras da semana...")
              ) : dashboard.operadorasSemana.length === 0 ? (
                <EmptyState icon="building" title="Nenhuma operadora identificada nesta semana." />
              ) : (
                <ul className="dash-bars">
                  {operadorasGrafico.map((operadora) => (
                    <li key={operadora.nome} className="dash-bar" title={`${operadora.nome}: ${operadora.pax} pax`}>
                      <span className="dash-bar__nome">{operadora.nome}</span>
                      <span className="dash-bar__trilho" aria-hidden="true">
                        <span
                          className="dash-bar__valor"
                          style={{ width: `${(operadora.pax / maiorPaxOperadora) * 100}%` }}
                        />
                      </span>
                      <span className="dash-bar__num tabular">
                        <strong>{operadora.pax} pax</strong>
                        <small>
                          {operadora.reservas} reserva(s) · {operadora.participacao}%
                        </small>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader icon="barChart" title="Demanda da semana" subtitle="Serviços por dia" />
              {carregandoCards ? (
                renderCardLoading("Atualizando demanda da semana...")
              ) : (
                <div className="dash-chart">
                  <ResponsiveContainer>
                    <BarChart
                      data={dashboard.distribuicaoSemana}
                      margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                      barGap={2}
                    >
                      <CartesianGrid stroke="var(--divider)" vertical={false} />
                      <XAxis dataKey="short" tick={eixo} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={eixo} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--raised)" }} />
                      <Legend wrapperStyle={{ fontSize: 12, color: "var(--text-2)" }} />
                      <Bar dataKey="total" name="Total de serviços" fill="var(--text-3)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="comGuia" name="Serviços com guia" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card>
              <CardHeader icon="users" title="Pax da semana" subtitle="Passageiros por dia" />
              {carregandoCards ? (
                renderCardLoading("Atualizando demanda da semana...")
              ) : (
                <div className="dash-chart">
                  <ResponsiveContainer>
                    <LineChart
                      data={dashboard.distribuicaoSemana}
                      margin={{ top: 8, right: 12, left: -12, bottom: 0 }}
                    >
                      <CartesianGrid stroke="var(--divider)" vertical={false} />
                      <XAxis dataKey="short" tick={eixo} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={eixo} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(value) => [`${value} pax`, "Pax"]}
                      />
                      <Line
                        type="monotone"
                        dataKey="pax"
                        name="Pax"
                        stroke="var(--accent)"
                        strokeWidth={2}
                        dot={{ r: 4, fill: "var(--accent)", stroke: "var(--surface)", strokeWidth: 2 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          <Card className="dash-verse">
            <CardHeader icon="bookOpen" title="Versículo do dia" />
            {loading ? (
              renderCardLoading("Atualizando versículo do dia...")
            ) : versiculo ? (
              <blockquote className="dash-verse__body">
                <p>“{versiculo.texto}”</p>
                <cite>{versiculo.referencia}</cite>
              </blockquote>
            ) : (
              <EmptyState icon="bookOpen" title="Não foi possível carregar o versículo." />
            )}
          </Card>
        </>
      )}

      {abaAtiva === "comparativo" && (
        <>
          <KpiTiles
            items={[
              {
                key: "servicos",
                label: "Serviços atuais",
                value: renderValorCard(dashboard.comparativoGeral.servicosAtual),
                hint: `Semana anterior: ${dashboard.comparativoGeral.servicosAnterior}`,
              },
              {
                key: "dServicos",
                label: "Delta de serviços",
                value: renderValorCard(formatarDelta(dashboard.comparativoGeral.deltaServicos)),
                hint: `${formatarDelta(dashboard.comparativoGeral.deltaPercentualServicos)}%`,
              },
              {
                key: "pax",
                label: "Pax atuais",
                value: renderValorCard(dashboard.comparativoGeral.paxAtual),
                hint: `Semana anterior: ${dashboard.comparativoGeral.paxAnterior}`,
              },
              {
                key: "dPax",
                label: "Delta de pax",
                value: renderValorCard(formatarDelta(dashboard.comparativoGeral.deltaPax)),
                hint: `${formatarDelta(dashboard.comparativoGeral.deltaPercentualPax)}%`,
              },
            ]}
          />

          <Card>
            <CardHeader
              title={
                <>
                  {renderIconeComparativo()} Leitura operacional do comparativo de pax
                </>
              }
            />
            {carregandoCards ? (
              renderCardLoading("Atualizando card...")
            ) : (
              <div className="dash-reading">
                <StatusDot tone={tomAlerta(dashboard.alertaComparativoPax)}>
                  {dashboard.alertaComparativoPax?.titulo}
                </StatusDot>
                <p>{dashboard.alertaComparativoPax?.descricao}</p>
              </div>
            )}
          </Card>

          <div className="dash-grid">
            <Card>
              <CardHeader icon="barChart" title="Serviços por dia" subtitle="Semana atual x semana anterior" />
              {carregandoCards ? (
                renderCardLoading("Atualizando card...")
              ) : (
                <div className="dash-chart">
                  <ResponsiveContainer>
                    <BarChart
                      data={dashboard.distribuicaoComparativaSemana}
                      margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                      barGap={2}
                    >
                      <CartesianGrid stroke="var(--divider)" vertical={false} />
                      <XAxis dataKey="short" tick={eixo} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={eixo} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--raised)" }} />
                      <Legend wrapperStyle={{ fontSize: 12, color: "var(--text-2)" }} />
                      <Bar dataKey="servicosAnterior" name="Semana anterior" fill="var(--text-3)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="servicosAtual" name="Semana atual" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card>
              <CardHeader icon="users" title="Pax por dia" subtitle="Semana atual x semana anterior" />
              {carregandoCards ? (
                renderCardLoading("Atualizando card...")
              ) : (
                <div className="dash-chart">
                  <ResponsiveContainer>
                    <LineChart
                      data={dashboard.distribuicaoComparativaSemana}
                      margin={{ top: 8, right: 12, left: -12, bottom: 0 }}
                    >
                      <CartesianGrid stroke="var(--divider)" vertical={false} />
                      <XAxis dataKey="short" tick={eixo} axisLine={false} tickLine={false} />
                      <YAxis tick={eixo} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 12, color: "var(--text-2)" }} />
                      <Line
                        type="monotone"
                        dataKey="paxAnterior"
                        name="Semana anterior"
                        stroke="var(--text-3)"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        dot={{ r: 4, fill: "var(--text-3)", stroke: "var(--surface)", strokeWidth: 2 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="paxAtual"
                        name="Semana atual"
                        stroke="var(--accent)"
                        strokeWidth={2}
                        dot={{ r: 4, fill: "var(--accent)", stroke: "var(--surface)", strokeWidth: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          <div className="dash-grid">
            <Card>
              <CardHeader icon="trendingUp" title="Passeios com maior variação" subtitle="Δ pax vs semana anterior" />
              {carregandoCards ? (
                renderCardLoading("Atualizando card...")
              ) : dashboard.comparativoPasseios.length === 0 ? (
                <EmptyState icon="compass" title="Sem dados comparativos de passeios." />
              ) : (
                <Table columns="minmax(180px, 2fr) 90px 90px 80px" minWidth={480}>
                  <TableHead>
                    <span>Passeio</span>
                    <span className="ui-cell-end">Serviços</span>
                    <span className="ui-cell-end">Pax</span>
                    <span className="ui-cell-end">Δ pax</span>
                  </TableHead>
                  {dashboard.comparativoPasseios.map((passeio) => (
                    <TableRow key={passeio.nome}>
                      <span>
                        <span className="ui-cell-main">{passeio.nome}</span>
                        <span className="ui-cell-sub">
                          Δ serviços: {formatarDelta(passeio.deltaServicos)}
                        </span>
                      </span>
                      <span className="ui-cell-end tabular">
                        {passeio.servicosAtual} / {passeio.servicosAnterior}
                      </span>
                      <span className="ui-cell-end tabular">
                        {passeio.paxAtual} / {passeio.paxAnterior}
                      </span>
                      <span
                        className={`ui-cell-end ui-cell-main tabular ${passeio.deltaPax < 0 ? "dash-neg" : ""}`}
                      >
                        {formatarDelta(passeio.deltaPax)}
                      </span>
                    </TableRow>
                  ))}
                </Table>
              )}
            </Card>

            <Card>
              <CardHeader icon="building" title="Operadoras da semana" />
              {carregandoCards ? (
                renderCardLoading("Atualizando card...")
              ) : dashboard.operadorasSemana.length === 0 ? (
                <EmptyState icon="building" title="Nenhuma operadora identificada nesta semana." />
              ) : (
                <Table columns="minmax(160px, 2fr) 90px 140px" minWidth={400}>
                  <TableHead>
                    <span>Operadora</span>
                    <span className="ui-cell-end">Pax</span>
                    <span className="ui-cell-end">Reservas/ocorrências</span>
                  </TableHead>
                  {dashboard.operadorasSemana.map((operadora) => (
                    <TableRow key={operadora.nome}>
                      <span className="ui-cell-main">{operadora.nome}</span>
                      <span className="ui-cell-end ui-cell-main tabular">{operadora.pax}</span>
                      <span className="ui-cell-end tabular">{operadora.reservas}</span>
                    </TableRow>
                  ))}
                </Table>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
};

export default Home;
