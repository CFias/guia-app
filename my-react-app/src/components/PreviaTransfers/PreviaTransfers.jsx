import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  StatusDot,
  Table,
  TableExpansion,
  TableHead,
  TableRow,
  pararClique,
} from "../ui";
import { usePhoenixStatus } from "../Shell/shellContext";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../Services/Services/firebase";
import "./previa.css";

const API_BASE =
  "https://driversalvador.phoenix.comeialabs.com/scale/reserve-service";

const EXPAND =
  "service,schedule,reserve,establishmentOrigin,establishmentDestination,establishmentOrigin.region,establishmentDestination.region,reserve.partner,reserve.customer,additionalReserveServices,additionalReserveServices.additional,additionalReserveServices.provider,roadmapService,roadmapService.roadmap,auxRoadmapService.roadmap.serviceOrder,auxRoadmapService.roadmap.serviceOrder.vehicle,auxRoadmapService.roadmap.driver,auxRoadmapService.roadmap.guide,roadmapService.roadmap.driver,roadmapService.roadmap.guide,roadmapService.roadmap.serviceOrder,roadmapService.roadmap.serviceOrder.vehicle,reserve.pdvPayment.user";

const SERVICE_TYPES_BASE = ["1", "2", "4"];
const SERVICE_TYPE_PASSEIO = "3";

const LS_ORDEM_BLOCOS = "previa_operacional_ordem_blocos_v3";

const ORDEM_VEICULOS = [
  "THAIS 1",
  "THAIS 2",
  "THAIS 3",
  "VAN ROSÂNGELA EG TRANSP",
  "VAN ROSÂNGELA 1 EG TRANSP",
  "VAN ROSÂNGELA 2 EG TRANSP",
  "RICARDO 1",
  "RICARDO 2",
  "RICARDO",
  "VAN FERNANDO",
  "VAN FERNANDO 1",
  "VAN FRANCISCO",
  "CLÓVIS FILHO",
  "CLÓVIS 2",
  "FABIANO",
  "VAN GOMES 14",
  "VAN GOMES 20",
  "MICRO FRANCISCO",
  "MÁRIO",
  "JOALDO",
  "JURAILTON",
  "VAN PAN 1",
  "VAN PAN 2",
  "MARCIO",
  "CÍCERO",
  "ALAN",
  "MICRO PAN 1",
  "VAN PAN 5",
  "ADEMAR",
  "JOSUÉ",
  "NETO",
  "VAN WESLEY",
  "VAN LIVIA 1",
  "VAN LIVIA 20",
  "VAN DENISE 15",
  "VAN DENISE 20",
];

const MAPA_ABREVIACOES_HOTEIS = [
  { match: "VILA GALE MARES", label: "VILA GALE MARES" },
  { match: "GRAND PALLADIUM RESORT", label: "GRAND PALLADIUM" },
  { match: "WISH HOTEL DA BAHIA", label: "WISH" },
  { match: "GRAN HOTEL STELLA MARIS", label: "GRAN STELLA" },
  { match: "VILA GALÉ MARÉS", label: "VILA GALE MARES" },
];

const getHojeIso = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const formatarDataTitulo = (dataIso) => {
  if (!dataIso) return "";
  const [ano, mes, dia] = String(dataIso).split("-");
  return `${dia}/${mes}/${ano}`;
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

const extrairDataServicoReal = (item) =>
  extrairDataIsoDeValor(
    item?.presentation_hour ||
    item?.presentation_hour_end ||
    item?.schedule?.presentation_hour ||
    item?.date ||
    item?.execution_date ||
    "",
  ) || "";

const formatarDataCurtaBr = (dataIso = "") => {
  if (!dataIso) return "";
  const [, mes, dia] = String(dataIso).split("-");
  return `${dia}/${mes}`;
};

const montarMarcadorHoje = (dataServico, dataMapa) => {
  if (!dataServico || !dataMapa) return "";

  const servicoVeioDoDiaAnterior = dataServico < dataMapa;

  if (!servicoVeioDoDiaAnterior) return "";

  return `*HOJE ${formatarDataCurtaBr(dataServico)}*`;
};

const compararDataHoraServico = (a, b) => {
  const dataA = String(a?.dataServico || "9999-99-99");
  const dataB = String(b?.dataServico || "9999-99-99");

  if (dataA !== dataB) {
    return dataA.localeCompare(dataB, "pt-BR", { sensitivity: "base" });
  }

  return String(a?.hora || "").localeCompare(String(b?.hora || ""));
};

const montarTagHojeData = (dataServico, dataOperacional) => {
  if (!dataServico || !dataOperacional) return "";

  if (dataServico === dataOperacional) {
    return `HOJE ${formatarDataTitulo(dataServico)}`;
  }

  return formatarDataTitulo(dataServico);
};

const normalizarTexto = (texto = "") =>
  String(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[|]/g, " ")
    .replace(/[-–—]/g, " ")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const normalizarNomeVeiculo = (nome = "") => normalizarTexto(nome);

const limparNumeroWhatsapp = (numero = "") => String(numero).replace(/\D/g, "");

const formatarWhatsappVisual = (numero = "") => {
  const n = limparNumeroWhatsapp(numero).slice(-11);

  if (!n) return "";
  if (n.length <= 2) return n;
  if (n.length <= 7) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
  return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
};

const lerLocalStorage = (chave, fallback = []) => {
  try {
    const bruto = localStorage.getItem(chave);
    return bruto ? JSON.parse(bruto) : fallback;
  } catch {
    return fallback;
  }
};

const salvarLocalStorage = (chave, valor) => {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch (e) {
    console.error(`Erro ao salvar ${chave}:`, e);
  }
};

const montarUrlApi = (date, serviceTypes = []) => {
  const params = new URLSearchParams();
  params.append("execution_date", date);
  params.append("expand", EXPAND);
  serviceTypes.forEach((type) => params.append("service_type[]", type));
  return `${API_BASE}?${params.toString()}`;
};

const extrairListaResposta = (json) => {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.results)) return json.results;
  return [];
};

const extrairAdultos = (item) => Number(item?.is_adult_count || 0);
const extrairCriancas = (item) => Number(item?.is_child_count || 0);
const extrairInfantes = (item) =>
  Number(item?.is_baby_count || item?.is_infant_count || 0);

const extrairPax = (item) =>
  extrairAdultos(item) + extrairCriancas(item) + extrairInfantes(item);

const extrairPaxDetalhado = (item) => {
  const adultos = extrairAdultos(item);
  const chd = extrairCriancas(item);
  const inf = extrairInfantes(item);
  return `${adultos}/${chd}/${inf}`;
};

const somarPaxDetalhado = (linhas = []) => {
  return linhas.reduce(
    (acc, linha) => {
      acc.adt += Number(linha.adt || 0);
      acc.chd += Number(linha.chd || 0);
      acc.inf += Number(linha.inf || 0);
      return acc;
    },
    { adt: 0, chd: 0, inf: 0 },
  );
};

const formatarPaxDetalhado = ({ adt = 0, chd = 0, inf = 0 } = {}) =>
  `${adt}/${chd}/${inf}`;

const extrairHorario = (item) => {
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
    const hora = valor.split("T")[1]?.slice(0, 5);
    return hora || "";
  }

  const match = valor.match(/\b(\d{2}:\d{2})/);
  return match?.[1] || "";
};

const formatarHoraMensagem = (hora = "") => {
  if (!hora) return "--:--";
  return String(hora).slice(0, 5);
};

const extrairVeiculo = (item) =>
  item?.roadmapService?.roadmap?.serviceOrder?.vehicle?.name ||
  item?.auxRoadmapService?.roadmap?.serviceOrder?.vehicle?.name ||
  item?.vehicle?.name ||
  item?.veiculoNome ||
  "";

const extrairMotorista = (item) =>
  item?.roadmapService?.roadmap?.driver?.name ||
  item?.auxRoadmapService?.roadmap?.driver?.name ||
  item?.driver?.name ||
  "";

const limparNomeGuia = (valor = "") => {
  const texto = String(valor || "").trim();
  if (!texto) return "";

  return texto
    .replace(/\s*-\s*GUIA\s*$/i, "")
    .replace(/\s*GUIA\s*$/i, "")
    .trim();
};

const extrairGuia = (item) => {
  const nickname =
    item?.roadmapService?.roadmap?.guide?.nickname ||
    item?.auxRoadmapService?.roadmap?.guide?.nickname ||
    item?.guide?.nickname ||
    "";

  if (nickname) return limparNomeGuia(nickname);

  const nome =
    item?.roadmapService?.roadmap?.guide?.name ||
    item?.auxRoadmapService?.roadmap?.guide?.name ||
    item?.guide?.name ||
    "";

  return limparNomeGuia(nome);
};

const extrairEscalaId = (item) =>
  item?.roadmapService?.roadmap?.id ||
  item?.auxRoadmapService?.roadmap?.id ||
  item?.roadmap?.id ||
  null;

const extrairOrigem = (item) =>
  item?.establishmentOrigin?.name ||
  item?.origin?.name ||
  item?.reserve?.origin?.name ||
  "";

const extrairDestino = (item) =>
  item?.establishmentDestination?.name ||
  item?.destination?.name ||
  item?.reserve?.destination?.name ||
  "";

const extrairPasseio = (item) =>
  item?.service?.name ||
  item?.reserve?.service?.name ||
  item?.schedule?.service?.name ||
  item?.name ||
  "PASSEIO NÃO INFORMADO";

const extrairPasseioId = (item) =>
  item?.service_id ||
  item?.service?.id ||
  item?.reserve?.service?.id ||
  item?.schedule?.service?.id ||
  null;

const isAeroporto = (texto = "") => {
  const t = normalizarTexto(texto);
  return t.includes("aeroporto") || t.includes("airport");
};

const isHotel = (texto = "") => {
  const t = normalizarTexto(texto);

  if (!t) return false;

  return (
    t.includes("hotel") ||
    t.includes("resort") ||
    t.includes("pousada") ||
    t.includes("inn") ||
    t.includes("iberostar") ||
    t.includes("sauipe") ||
    t.includes("portobello") ||
    t.includes("vila gale") ||
    t.includes("grand palladium") ||
    t.includes("catussaba") ||
    t.includes("fiesta") ||
    t.includes("ondina") ||
    t.includes("rio vermelho") ||
    t.includes("wish") ||
    t.includes("deville") ||
    t.includes("fasano") ||
    t.includes("mercure") ||
    t.includes("intercity") ||
    t.includes("the hotel") ||
    t.includes("bahiamar") ||
    t.includes("monte pascoal") ||
    t.includes("rede andrade") ||
    t.includes("gran hotel stella maris") ||
    t.includes("stella maris")
  );
};

const abreviarHotel = (texto = "") => {
  if (!texto) return "";

  const textoNormalizado = normalizarTexto(texto);

  for (const item of MAPA_ABREVIACOES_HOTEIS) {
    if (textoNormalizado.includes(normalizarTexto(item.match))) {
      return item.label;
    }
  }

  return texto
    .replace(/\(.*?\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

const classificarTipoEscala = (item) => {
  const origem = extrairOrigem(item);
  const destino = extrairDestino(item);
  const serviceType = String(item?.service_type || item?.serviceType || "");

  if (serviceType === SERVICE_TYPE_PASSEIO) return "PASSEIO";

  const origemEhAeroporto = isAeroporto(origem);
  const destinoEhAeroporto = isAeroporto(destino);
  const origemEhHotel = isHotel(origem);
  const destinoEhHotel = isHotel(destino);

  if (origemEhAeroporto && destino) return "IN";
  if (destinoEhAeroporto && origem) return "OUT";
  if (origemEhHotel && destinoEhHotel) return "TRF";

  return "IGNORAR";
};

const extrairTextoLinhaEscala = (item, tipo) => {
  const origem = extrairOrigem(item);
  const destino = extrairDestino(item);

  if (tipo === "IN") {
    return abreviarHotel(destino || "DESTINO NÃO INFORMADO");
  }

  if (tipo === "OUT") {
    return abreviarHotel(origem || "ORIGEM NÃO INFORMADA");
  }

  if (tipo === "TRF") {
    return abreviarHotel(destino || origem || "HOTEL NÃO INFORMADO");
  }

  if (tipo === "PASSEIO") {
    return extrairPasseio(item);
  }

  return "";
};

const deveEntrarNaPrevia = (item) => {
  const veiculo = extrairVeiculo(item);
  const escalaId = extrairEscalaId(item);
  return !!String(veiculo || "").trim() && !!escalaId;
};

const ordenarHora = (a, b) => compararDataHoraServico(a, b);

const getIndiceOrdemVeiculo = (nomeVeiculo, ordemManual = []) => {
  const alvo = normalizarNomeVeiculo(nomeVeiculo);

  const idxManual = ordemManual.findIndex(
    (nome) => normalizarNomeVeiculo(nome) === alvo,
  );
  if (idxManual !== -1) return idxManual;

  const idxPadrao = ORDEM_VEICULOS.findIndex(
    (nome) => normalizarNomeVeiculo(nome) === alvo,
  );
  return idxPadrao === -1 ? 9999 : ordemManual.length + idxPadrao;
};

const dividirEmLinhas = (lista, tamanho) => {
  const linhas = [];
  for (let i = 0; i < lista.length; i += tamanho) {
    linhas.push(lista.slice(i, i + tamanho));
  }
  return linhas;
};

const extrairVeiculosFornecedor = (fornecedor) => {
  if (!Array.isArray(fornecedor?.veiculos)) return [];

  return fornecedor.veiculos
    .map((v) => {
      if (typeof v === "string") return v;
      return v?.nome || "";
    })
    .filter(Boolean);
};



const construirLinhaMensagem = (linha) => {
  const sufixoHoje = linha.marcadorHoje ? ` ${linha.marcadorHoje}` : "";

  if (linha.tipo === "PASSEIO") {
    return `${linha.passeio || linha.texto} - ${linha.guia || "SEM GUIA"} - ${linha.paxDetalhado}${sufixoHoje}`;
  }

  return `${linha.tipo} - ${formatarHoraMensagem(linha.hora)} - ${linha.texto} - ${linha.paxDetalhado}${sufixoHoje}`;
};

const montarMensagemFornecedor = ({
  gruposFornecedor,
  dataSelecionada,
  atualizado = false,
}) => {
  const linhas = [];

  linhas.push(
    atualizado
      ? `PRÉVIA ATUALIZADA ${formatarDataTitulo(dataSelecionada)}`
      : `PRÉVIA ${formatarDataTitulo(dataSelecionada)}`,
  );
  linhas.push("");

  gruposFornecedor.forEach((grupo, index) => {
    linhas.push(`*VEÍCULO: ${grupo.veiculo}*`);

    grupo.linhas.forEach((linha) => {
      linhas.push(construirLinhaMensagem(linha));
    });

    if (index < gruposFornecedor.length - 1) {
      linhas.push("");
    }
  });

  linhas.push("");
  linhas.push("Gentileza confirmar o recebimento.");
  linhas.push("");
  linhas.push("Att,");
  linhas.push("Operacional Luck.");

  return linhas.join("\n");
};

const montarMensagemPorVeiculo = ({
  grupo,
  dataSelecionada,
  atualizado = false,
}) => {
  return montarMensagemFornecedor({
    gruposFornecedor: [grupo],
    dataSelecionada,
    atualizado,
  });
};

const tipoLinhaClass = (tipo) => {
  if (tipo === "IN") return "in";
  if (tipo === "OUT") return "out";
  if (tipo === "TRF") return "trf";
  if (tipo === "PASSEIO") return "passeio";
  return "";
};

// Um só componente para dois itens do menu (mesmos dados, mesma lógica):
//   /previas  → Prévia de Serviços (KPIs + envio por veículo)
//   /planilha → Planilha operacional (secao="planilha": grade arrastável)
const PreviaEscalasPlanilha = ({ secao } = {}) => {
  const planilhaRef = useRef(null);
  const [dataSelecionada, setDataSelecionada] = useState(getHojeIso());
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState(null);
  const [itensBrutos, setItensBrutos] = useState([]);
  const [colunasPorLinha, setColunasPorLinha] = useState(5);
  const [ordemManualVeiculos, setOrdemManualVeiculos] = useState(() =>
    lerLocalStorage(LS_ORDEM_BLOCOS, []),
  );
  const [draggingVehicle, setDraggingVehicle] = useState(null);
  const [fornecedores, setFornecedores] = useState([]);
  const navigate = useNavigate();
  const [veiculoAberto, setVeiculoAberto] = useState(null); // só UI: linha expandida

  useEffect(() => {
    salvarLocalStorage(LS_ORDEM_BLOCOS, ordemManualVeiculos);
  }, [ordemManualVeiculos]);

  useEffect(() => {
    const q = query(collection(db, "providers"), where("ativo", "==", true));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const lista = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setFornecedores(lista);
      },
      (error) => {
        console.error("Erro ao carregar fornecedores:", error);
      },
    );

    return () => unsub();
  }, []);

  const carregarServicos = async () => {
    try {
      setLoading(true);
      setErro("");

      const [responseBase, responsePasseios] = await Promise.all([
        fetch(montarUrlApi(dataSelecionada, SERVICE_TYPES_BASE), {
          method: "GET",
          headers: { Accept: "application/json" },
        }),
        fetch(montarUrlApi(dataSelecionada, [SERVICE_TYPE_PASSEIO]), {
          method: "GET",
          headers: { Accept: "application/json" },
        }),
      ]);

      if (!responseBase.ok) {
        throw new Error(`Erro HTTP base ${responseBase.status}`);
      }

      if (!responsePasseios.ok) {
        throw new Error(`Erro HTTP passeios ${responsePasseios.status}`);
      }

      const jsonBase = await responseBase.json();
      const jsonPasseios = await responsePasseios.json();

      const listaBase = extrairListaResposta(jsonBase).map((item) => ({
        ...item,
        __dataMapa: dataSelecionada,
      }));
      const listaPasseios = extrairListaResposta(jsonPasseios);

      const passeiosMarcados = listaPasseios.map((item) => ({
        ...item,
        service_type: String(item?.service_type || SERVICE_TYPE_PASSEIO),
        __dataMapa: dataSelecionada,
      }));

      setItensBrutos([...listaBase, ...passeiosMarcados]);
      setUltimaAtualizacao(new Date());
    } catch (err) {
      console.error("Erro ao carregar prévia:", err);
      setErro("Não foi possível carregar os serviços da API.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarServicos();
  }, [dataSelecionada]);

  const grupos = useMemo(() => {
    const mapa = {};

    itensBrutos.filter(deveEntrarNaPrevia).forEach((item) => {
      const veiculo = extrairVeiculo(item) || "SEM VEÍCULO";
      const escalaId = extrairEscalaId(item);
      if (!escalaId) return;

      const tipo = classificarTipoEscala(item);
      if (tipo === "IGNORAR") return;

      const horaAtual = extrairHorario(item);
      const dataMapaAtual = item?.__dataMapa || dataSelecionada;
      const dataServicoAtual = extrairDataServicoReal(item) || dataMapaAtual;
      const adt = extrairAdultos(item);
      const chd = extrairCriancas(item);
      const inf = extrairInfantes(item);

      if (!mapa[veiculo]) {
        mapa[veiculo] = {
          chave: veiculo,
          veiculo,
          motorista: extrairMotorista(item),
          linhasPorEscala: {},
        };
      }

      const chaveEscala = `${tipo}_${String(escalaId)}`;

      if (!mapa[veiculo].linhasPorEscala[chaveEscala]) {
        mapa[veiculo].linhasPorEscala[chaveEscala] = {
          escalaId: chaveEscala,
          tipo,
          hora: horaAtual,
          dataServico: dataServicoAtual,
          dataMapa: dataMapaAtual,
          marcadorHoje: montarMarcadorHoje(dataServicoAtual, dataMapaAtual),
          texto:
            tipo === "PASSEIO"
              ? extrairPasseio(item)
              : extrairTextoLinhaEscala(item, tipo),
          passeioId: extrairPasseioId(item),
          passeio: extrairPasseio(item),
          pax: 0,
          adt: 0,
          chd: 0,
          inf: 0,
          paxDetalhado: "0/0/0",
          guia: extrairGuia(item) || "",
        };
      }

      mapa[veiculo].linhasPorEscala[chaveEscala].pax += extrairPax(item);
      mapa[veiculo].linhasPorEscala[chaveEscala].adt += adt;
      mapa[veiculo].linhasPorEscala[chaveEscala].chd += chd;
      mapa[veiculo].linhasPorEscala[chaveEscala].inf += inf;
      mapa[veiculo].linhasPorEscala[chaveEscala].paxDetalhado =
        formatarPaxDetalhado({
          adt: mapa[veiculo].linhasPorEscala[chaveEscala].adt,
          chd: mapa[veiculo].linhasPorEscala[chaveEscala].chd,
          inf: mapa[veiculo].linhasPorEscala[chaveEscala].inf,
        });

      const horaSalva = mapa[veiculo].linhasPorEscala[chaveEscala].hora;
      if (horaAtual && (!horaSalva || horaAtual < horaSalva)) {
        mapa[veiculo].linhasPorEscala[chaveEscala].hora = horaAtual;
      }

      const dataSalva = mapa[veiculo].linhasPorEscala[chaveEscala].dataServico;

      if (
        dataServicoAtual &&
        (!dataSalva ||
          `${dataServicoAtual} ${horaAtual || "99:99"}` <
          `${dataSalva} ${horaSalva || "99:99"}`)
      ) {
        mapa[veiculo].linhasPorEscala[chaveEscala].dataServico = dataServicoAtual;
        mapa[veiculo].linhasPorEscala[chaveEscala].dataMapa = dataMapaAtual;
        mapa[veiculo].linhasPorEscala[chaveEscala].marcadorHoje =
          montarMarcadorHoje(dataServicoAtual, dataMapaAtual);
      }
    });

    return Object.values(mapa)
      .map((grupo) => {
        const linhas = Object.values(grupo.linhasPorEscala).sort(ordenarHora);
        const paxDetalhadoTotal = somarPaxDetalhado(linhas);

        return {
          ...grupo,
          linhas,
          totalPax: linhas.reduce(
            (acc, item) => acc + Number(item.pax || 0),
            0,
          ),
          totalServicos: linhas.length,
          totalPaxDetalhado: formatarPaxDetalhado(paxDetalhadoTotal),
        };
      })
      .sort((a, b) => {
        const idxA = getIndiceOrdemVeiculo(a.veiculo, ordemManualVeiculos);
        const idxB = getIndiceOrdemVeiculo(b.veiculo, ordemManualVeiculos);

        if (idxA !== idxB) return idxA - idxB;

        return a.veiculo.localeCompare(b.veiculo, "pt-BR", {
          sensitivity: "base",
        });
      });
  }, [itensBrutos, ordemManualVeiculos]);

  useEffect(() => {
    const nomesAtuais = grupos.map((g) => g.veiculo);
    if (!nomesAtuais.length) return;

    setOrdemManualVeiculos((prev) => {
      const existentes = prev.filter((nome) =>
        nomesAtuais.some(
          (atual) =>
            normalizarNomeVeiculo(atual) === normalizarNomeVeiculo(nome),
        ),
      );

      const faltantes = nomesAtuais.filter(
        (nome) =>
          !existentes.some(
            (e) => normalizarNomeVeiculo(e) === normalizarNomeVeiculo(nome),
          ),
      );

      const nova = [...existentes, ...faltantes];

      const mudou =
        JSON.stringify(nova.map(normalizarNomeVeiculo)) !==
        JSON.stringify(prev.map(normalizarNomeVeiculo));

      return mudou ? nova : prev;
    });
  }, [grupos]);

  const grade = useMemo(
    () => dividirEmLinhas(grupos, colunasPorLinha),
    [grupos, colunasPorLinha],
  );

  const resumo = useMemo(() => {
    const servicos = grupos.reduce((acc, g) => acc + g.linhas.length, 0);
    const pax = grupos.reduce((acc, g) => acc + g.totalPax, 0);
    const totalIn = grupos.reduce(
      (acc, g) => acc + g.linhas.filter((l) => l.tipo === "IN").length,
      0,
    );
    const totalOut = grupos.reduce(
      (acc, g) => acc + g.linhas.filter((l) => l.tipo === "OUT").length,
      0,
    );
    const totalTrf = grupos.reduce(
      (acc, g) => acc + g.linhas.filter((l) => l.tipo === "TRF").length,
      0,
    );
    const totalPasseio = grupos.reduce(
      (acc, g) => acc + g.linhas.filter((l) => l.tipo === "PASSEIO").length,
      0,
    );

    return {
      veiculos: grupos.length,
      servicos,
      pax,
      totalIn,
      totalOut,
      totalTrf,
      totalPasseio,
    };
  }, [grupos]);

  const cardsEnvioPorVeiculo = useMemo(() => {
    const lista = [];

    grupos.forEach((grupo) => {
      const fornecedor = fornecedores.find((f) => {
        const veiculosFornecedor = extrairVeiculosFornecedor(f);
        return veiculosFornecedor.some(
          (v) =>
            normalizarNomeVeiculo(v) === normalizarNomeVeiculo(grupo.veiculo),
        );
      });

      if (!fornecedor || fornecedor.ativo === false) return;

      lista.push({
        chave: `${fornecedor.id}-${grupo.veiculo}`,
        fornecedor,
        grupo,
        totalServicos: grupo.linhas.length,
        totalPax: grupo.totalPax,
      });
    });

    return lista;
  }, [grupos, fornecedores]);

  // só apresentação: acha o envio (fornecedor) de cada veículo na tabela
  const envioPorVeiculo = useMemo(
    () => new Map(cardsEnvioPorVeiculo.map((c) => [c.grupo.veiculo, c])),
    [cardsEnvioPorVeiculo],
  );

  const abrirWhatsappFornecedor = (fornecedor, atualizado = false) => {
    const telefone = limparNumeroWhatsapp(fornecedor?.whatsapp || "");
    if (!telefone) {
      alert(`Fornecedor ${fornecedor?.nome || ""} sem WhatsApp cadastrado.`);
      return;
    }

    const veiculosFornecedor = extrairVeiculosFornecedor(fornecedor);

    const gruposFornecedor = grupos.filter((g) =>
      veiculosFornecedor.some(
        (v) => normalizarNomeVeiculo(v) === normalizarNomeVeiculo(g.veiculo),
      ),
    );

    if (!gruposFornecedor.length) {
      alert(`Nenhum serviço encontrado para ${fornecedor.nome} nesta data.`);
      return;
    }

    const mensagem = montarMensagemFornecedor({
      gruposFornecedor,
      dataSelecionada,
      atualizado,
    });

    const url = `https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`;
    window.open(url, "_blank");
  };

  const abrirWhatsappPorVeiculo = (fornecedor, grupo, atualizado = false) => {
    const telefone = limparNumeroWhatsapp(fornecedor?.whatsapp || "");
    if (!telefone) {
      alert(`Fornecedor ${fornecedor?.nome || ""} sem WhatsApp cadastrado.`);
      return;
    }

    if (!grupo || !grupo.linhas?.length) {
      alert("Nenhum serviço encontrado para este veículo.");
      return;
    }

    const mensagem = montarMensagemPorVeiculo({
      grupo,
      dataSelecionada,
      atualizado,
    });

    const url = `https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`;
    window.open(url, "_blank");
  };

  const envioGeral = (atualizado = false) => {
    const fornecedoresMap = {};

    fornecedores.forEach((fornecedor) => {
      const telefone = limparNumeroWhatsapp(fornecedor?.whatsapp || "");
      if (!telefone) return;

      const veiculosFornecedor = extrairVeiculosFornecedor(fornecedor);
      const gruposFornecedor = grupos.filter((g) =>
        veiculosFornecedor.some(
          (v) => normalizarNomeVeiculo(v) === normalizarNomeVeiculo(g.veiculo),
        ),
      );

      if (!gruposFornecedor.length) return;

      fornecedoresMap[fornecedor.id] = {
        fornecedor,
        gruposFornecedor,
      };
    });

    const lista = Object.values(fornecedoresMap);

    if (!lista.length) {
      alert("Nenhum fornecedor com veículo vinculado e WhatsApp cadastrado.");
      return;
    }

    lista.forEach((item, index) => {
      setTimeout(() => {
        const telefone = limparNumeroWhatsapp(item.fornecedor.whatsapp || "");
        const mensagem = montarMensagemFornecedor({
          gruposFornecedor: item.gruposFornecedor,
          dataSelecionada,
          atualizado,
        });

        const url = `https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`;
        window.open(url, "_blank");
      }, index * 1550);
    });
  };

  const moverBloco = (veiculoOrigem, veiculoDestino) => {
    if (!veiculoOrigem || !veiculoDestino) return;
    if (
      normalizarNomeVeiculo(veiculoOrigem) ===
      normalizarNomeVeiculo(veiculoDestino)
    ) {
      return;
    }

    setOrdemManualVeiculos((prev) => {
      const base = [...prev];

      const origemIndex = base.findIndex(
        (v) =>
          normalizarNomeVeiculo(v) === normalizarNomeVeiculo(veiculoOrigem),
      );
      const destinoIndex = base.findIndex(
        (v) =>
          normalizarNomeVeiculo(v) === normalizarNomeVeiculo(veiculoDestino),
      );

      if (origemIndex === -1 || destinoIndex === -1) return prev;

      const nova = [...base];
      const [item] = nova.splice(origemIndex, 1);
      nova.splice(destinoIndex, 0, item);

      return nova;
    });
  };

  // indicador "Phoenix · HH:MM" da topbar: chama o mesmo "Atualizar" da tela
  usePhoenixStatus({
    atualizadoEm: ultimaAtualizacao,
    carregando: loading,
    atualizar: carregarServicos,
  });


  // separador que não aparece na tela, mas continua no texto copiado
  // (quem seleciona a planilha e cola no WhatsApp recebe o mesmo texto de antes)
  const sep = (texto) => <span className="planilha-sep">{texto}</span>;

  const valorKpi = (valor) => (loading ? "…" : valor);

  const kpis = [
    { key: "veiculos", label: "Veículos", value: valorKpi(resumo.veiculos), icon: "truck" },
    { key: "servicos", label: "Serviços", value: valorKpi(resumo.servicos), icon: "list" },
    { key: "pax", label: "Pax", value: valorKpi(resumo.pax), icon: "users" },
    { key: "in", label: "IN", value: valorKpi(resumo.totalIn), icon: "planeLanding" },
    { key: "out", label: "OUT", value: valorKpi(resumo.totalOut), icon: "planeTakeoff" },
    { key: "trf", label: "Transfer", value: valorKpi(resumo.totalTrf), icon: "navigation" },
    { key: "passeio", label: "Passeios", value: valorKpi(resumo.totalPasseio), icon: "compass" },
  ];

  const ehPlanilha = secao === "planilha";

  const estadoVazio = erro ? (
    <EmptyState icon="alert" title={erro} />
  ) : loading ? (
    <EmptyState icon="loader" title="Atualizando prévia operacional..." />
  ) : (
    <EmptyState icon="truck" title="Nenhum serviço escalado encontrado para esta data." />
  );

  const filtroData = (
    <Field label="Data operacional" icon="calendar">
      <input
        type="date"
        value={dataSelecionada}
        onChange={(e) => setDataSelecionada(e.target.value)}
      />
    </Field>
  );

  const textoAtualizacao = loading
    ? "Atualizando..."
    : ultimaAtualizacao
      ? `Atualizado em ${ultimaAtualizacao.toLocaleString("pt-BR")}`
      : "Ainda não atualizado";

  /* ---------------- PLANILHA OPERACIONAL (/planilha) ---------------- */
  if (ehPlanilha) {
    return (
      <div className="ui-page previa-page">
        <PageHeader
          title="Planilha operacional"
          description={`Gerada automaticamente do Phoenix · ${formatarDataTitulo(dataSelecionada)} · ${loading ? "…" : resumo.veiculos} veículo(s)`}
          actions={
            <Button
              icon="refresh"
              onClick={carregarServicos}
              loading={loading}
              disabled={loading}
            >
              {loading ? "Atualizando serviços..." : "Atualizar"}
            </Button>
          }
          more={[
            { label: "Prévia e envio aos fornecedores", icon: "send", onClick: () => navigate("/previas") },
          ]}
        />

        <FilterBar>
          {filtroData}
          <Field label="Colunas" icon="grid">
            <select
              value={colunasPorLinha}
              onChange={(e) => setColunasPorLinha(Number(e.target.value))}
            >
              <option value={4}>4 colunas</option>
              <option value={5}>5 colunas</option>
              <option value={6}>6 colunas</option>
            </select>
          </Field>
          <p className="previa-atualizacao">
            <Icon name="clock" size={14} />
            {textoAtualizacao}
          </p>
        </FilterBar>

        <section id="planilha-operacional" ref={planilhaRef} className="planilha">
          {erro || loading || grupos.length === 0 ? (
            <Card>{estadoVazio}</Card>
          ) : (
            <>
              <p className="planilha-dica">
                <Icon name="grip" size={14} />
                Arraste um veículo para mudar a ordem — a ordem fica salva neste navegador.
              </p>

              {grade.map((linha, linhaIndex) => {
                const maxServicosNaLinha = Math.max(
                  ...linha.map((grupo) => grupo.linhas.length),
                  0,
                );

                const totalLinhasVisuais = maxServicosNaLinha + 1;

                return (
                  <div
                    key={`linha-${linhaIndex}`}
                    className="planilha-grid"
                    style={{
                      gridTemplateColumns: `repeat(${colunasPorLinha}, minmax(0, 1fr))`,
                    }}
                  >
                    {linha.map((grupo) => {
                      const linhasVaziasNecessarias =
                        totalLinhasVisuais - grupo.linhas.length;
                      const arrastando =
                        draggingVehicle &&
                        normalizarNomeVeiculo(draggingVehicle) ===
                          normalizarNomeVeiculo(grupo.veiculo);

                      return (
                        <div
                          key={grupo.chave}
                          className={`planilha-card ${arrastando ? "is-dragging" : ""}`}
                          draggable
                          onDragStart={() => setDraggingVehicle(grupo.veiculo)}
                          onDragEnd={() => setDraggingVehicle(null)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => {
                            moverBloco(draggingVehicle, grupo.veiculo);
                            setDraggingVehicle(null);
                          }}
                        >
                          <div className="planilha-card__topo">
                            <Icon name="grip" size={15} className="planilha-card__grip" />
                            <span className="planilha-card__titulo">
                              <strong>
                                {sep("*VEÍCULO: ")}
                                {grupo.veiculo}
                                {sep("*")}
                              </strong>
                              {/* via CSS (data-info) para não entrar no texto copiado */}
                              <small
                                className="planilha-info"
                                data-info={`${grupo.motorista || "Sem motorista"} · ${grupo.totalPax} pax`}
                              />
                            </span>
                          </div>

                          <div className="planilha-card__linhas">
                            {grupo.linhas.map((linhaItem) => {
                              const ehPasseio = linhaItem.tipo === "PASSEIO";
                              return (
                                <div
                                  key={linhaItem.escalaId}
                                  className={`planilha-linha ${tipoLinhaClass(linhaItem.tipo)}`}
                                  title={
                                    ehPasseio
                                      ? `${linhaItem.passeio || linhaItem.texto} - ${linhaItem.guia || "SEM GUIA"} - ${linhaItem.paxDetalhado}`
                                      : `${linhaItem.tipo} - ${linhaItem.hora || "--:--"} - ${linhaItem.texto} - ${linhaItem.paxDetalhado}`
                                  }
                                >
                                  {ehPasseio ? (
                                    <>
                                      <span
                                        className="planilha-tipo planilha-tipo--css"
                                        data-tipo="PAS"
                                        aria-hidden="true"
                                      />
                                      <span className="planilha-texto">
                                        {linhaItem.passeio || linhaItem.texto}
                                        {sep(" - ")}
                                        <em>{linhaItem.guia || "SEM GUIA"}</em>
                                      </span>
                                    </>
                                  ) : (
                                    <>
                                      <span className="planilha-tipo">{linhaItem.tipo}</span>
                                      {sep(" - ")}
                                      <span className="planilha-hora">
                                        {linhaItem.hora || "--:--"}
                                      </span>
                                      {sep(" - ")}
                                      <span className="planilha-texto">{linhaItem.texto}</span>
                                    </>
                                  )}
                                  {sep(" - ")}
                                  <span className="planilha-pax">{linhaItem.paxDetalhado}</span>
                                  {linhaItem.marcadorHoje && (
                                    <>
                                      {sep(" *")}
                                      <span className="planilha-hoje">
                                        {linhaItem.marcadorHoje.replace(/\*/g, "")}
                                      </span>
                                      {sep("*")}
                                    </>
                                  )}
                                </div>
                              );
                            })}

                            {Array.from({ length: linhasVaziasNecessarias }).map((_, idx) => (
                              <div
                                key={`vazia-${grupo.chave}-${idx}`}
                                className="planilha-linha vazia"
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}

                    {Array.from({
                      length: Math.max(0, colunasPorLinha - linha.length),
                    }).map((_, idx) => (
                      <div key={`coluna-vazia-${idx}`} className="planilha-card coluna-vazia">
                        <div className="planilha-card__topo">
                          <span className="planilha-card__titulo">
                            <strong>
                              {sep("*VEÍCULO: ")}-{sep("*")}
                            </strong>
                            <small>
                              SEM MOTORISTA{sep(" ")}
                              <span aria-hidden="true"> · </span>0/0/0
                            </small>
                          </span>
                        </div>

                        <div className="planilha-card__linhas">
                          {Array.from({ length: totalLinhasVisuais }).map((_, emptyIdx) => (
                            <div
                              key={`coluna-vazia-linha-${idx}-${emptyIdx}`}
                              className="planilha-linha vazia"
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </>
          )}
        </section>
      </div>
    );
  }

  /* ---------------- PRÉVIA DE SERVIÇOS (/previas) ---------------- */
  return (
    <div className="ui-page previa-page">
      <PageHeader
        title="Prévia de Serviços"
        description="Prévia por veículo, com envio consolidado ao fornecedor pelo WhatsApp."
        actions={
          <>
            <Button icon="alert" onClick={() => envioGeral(true)}>
              Enviar todas atualizadas
            </Button>
            <Button variant="primary" icon="send" onClick={() => envioGeral(false)}>
              Enviar todas as prévias
            </Button>
          </>
        }
        more={[
          {
            label: loading ? "Atualizando serviços..." : "Atualizar serviços",
            icon: "refresh",
            onClick: carregarServicos,
            disabled: loading,
          },
          { label: "Abrir planilha operacional", icon: "planilha", onClick: () => navigate("/planilha") },
        ]}
      />

      <FilterBar>
        {filtroData}
        <p className="previa-atualizacao">
          <Icon name="clock" size={14} />
          {textoAtualizacao}
        </p>
      </FilterBar>

      <KpiTiles items={kpis} className="previa-kpis" />

      <Card>
        <CardHeader
          title="Envio por veículo"
          subtitle={
            loading
              ? "Carregando..."
              : `${grupos.length} veículo(s) · ${cardsEnvioPorVeiculo.length} com fornecedor vinculado · clique na linha para ver os serviços`
          }
          icon="send"
        />

        {erro || loading || grupos.length === 0 ? (
          estadoVazio
        ) : (
          <Table
            columns="28px minmax(200px,1.4fr) minmax(150px,1fr) 80px 110px minmax(170px,1fr) 230px"
            minWidth={1000}
          >
            <TableHead>
              <span />
              <span>Veículo</span>
              <span>Motorista</span>
              <span className="ui-cell-num">Serviços</span>
              <span className="ui-cell-num">Pax</span>
              <span>Fornecedor</span>
              <span />
            </TableHead>

            {grupos.map((grupo) => {
              const envio = envioPorVeiculo.get(grupo.veiculo);
              const aberto = veiculoAberto === grupo.veiculo;
              return (
                <Fragment key={grupo.chave}>
                  <TableRow
                    expandable
                    expanded={aberto}
                    onToggle={() => setVeiculoAberto(aberto ? null : grupo.veiculo)}
                  >
                    <span className="ui-cell-main">{grupo.veiculo}</span>
                    <span>{grupo.motorista || "—"}</span>
                    <span className="ui-cell-num tabular">{grupo.totalServicos}</span>
                    <span className="ui-cell-num tabular previa-pax">
                      <strong>{grupo.totalPax}</strong>
                      <small>{grupo.totalPaxDetalhado}</small>
                    </span>
                    {envio ? (
                      <span className="previa-fornecedor">
                        <span>{envio.fornecedor.nome}</span>
                        <small className="tabular">
                          {formatarWhatsappVisual(envio.fornecedor.whatsapp || "") || "sem WhatsApp"}
                        </small>
                      </span>
                    ) : (
                      <StatusDot tone="muted">Sem fornecedor vinculado</StatusDot>
                    )}
                    <span className="ui-cell-end" onClick={pararClique}>
                      {envio && (
                        <>
                          <Button
                            size="sm"
                            icon="message"
                            onClick={() =>
                              abrirWhatsappPorVeiculo(envio.fornecedor, envio.grupo, false)
                            }
                          >
                            Enviar prévia
                          </Button>
                          <Button
                            size="sm"
                            icon="alert"
                            onClick={() =>
                              abrirWhatsappPorVeiculo(envio.fornecedor, envio.grupo, true)
                            }
                            title="Enviar prévia atualizada"
                          >
                            Atualizada
                          </Button>
                        </>
                      )}
                    </span>
                  </TableRow>

                  {aberto && (
                    <TableExpansion>
                      <ul className="previa-linhas">
                        {grupo.linhas.map((linhaItem) => (
                          <li key={linhaItem.escalaId}>
                            <span className="planilha-tipo">
                              {linhaItem.tipo === "PASSEIO" ? "PAS" : linhaItem.tipo}
                            </span>
                            <span className="planilha-hora">
                              {linhaItem.tipo === "PASSEIO" ? "" : linhaItem.hora || "--:--"}
                            </span>
                            <span className="planilha-texto">
                              {linhaItem.tipo === "PASSEIO"
                                ? `${linhaItem.passeio || linhaItem.texto} · ${linhaItem.guia || "SEM GUIA"}`
                                : linhaItem.texto}
                            </span>
                            <span className="planilha-pax">{linhaItem.paxDetalhado}</span>
                            {linhaItem.marcadorHoje && (
                              <span className="planilha-hoje">
                                {linhaItem.marcadorHoje.replace(/\*/g, "")}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </TableExpansion>
                  )}
                </Fragment>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
};

export default PreviaEscalasPlanilha;
