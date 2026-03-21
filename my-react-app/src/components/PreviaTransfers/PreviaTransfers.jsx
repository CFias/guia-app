import { useEffect, useMemo, useState } from "react";
import {
  CalendarMonthRounded,
  LocalPrintshopRounded,
  RefreshRounded,
  ViewModuleRounded,
  DirectionsBusRounded,
  Inventory2Rounded,
  GroupsRounded,
  AccessTimeRounded,
  SouthWestRounded,
  NorthEastRounded,
  SwapHorizRounded,
  DragIndicatorRounded,
  WhatsApp,
  WarningAmberRounded,
  RouteRounded,
  SyncRounded,
} from "@mui/icons-material";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../Services/Services/firebase";
import "./styles.css";

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

const ordenarHora = (a, b) =>
  String(a.hora || "").localeCompare(String(b.hora || ""));

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
  if (linha.tipo === "PASSEIO") {
    return `${linha.passeio || linha.texto} - ${linha.guia || "SEM GUIA"} - ${linha.paxDetalhado}`;
  }

  return `${linha.tipo} - ${formatarHoraMensagem(linha.hora)} - ${linha.texto} - ${linha.paxDetalhado}`;
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
    linhas.push(`VEÍCULO: ${grupo.veiculo}`);

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

const PreviaEscalasPlanilha = () => {
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

      const listaBase = extrairListaResposta(jsonBase);
      const listaPasseios = extrairListaResposta(jsonPasseios);

      const passeiosMarcados = listaPasseios.map((item) => ({
        ...item,
        service_type: String(item?.service_type || SERVICE_TYPE_PASSEIO),
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

      if (!mapa[veiculo].motorista) {
        mapa[veiculo].motorista = extrairMotorista(item);
      }

      if (
        tipo === "PASSEIO" &&
        !mapa[veiculo].linhasPorEscala[chaveEscala].guia
      ) {
        mapa[veiculo].linhasPorEscala[chaveEscala].guia =
          extrairGuia(item) || "";
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

  return (
    <div className="previa-operacional-page">
      <div className="previa-operacional-header">
        <div>
          <h2 className="previa-operacional-title">
            <ViewModuleRounded fontSize="small" />
            Prévia de Serviços
          </h2>
          <p className="previa-operacional-subtitle">
            Estrutura automática por escala, com passeios consumidos em chamada
            separada e envio consolidado por fornecedor.
          </p>
        </div>
      </div>

      <div className="previa-operacional-grid">
        <div className="previa-operacional-card previa-operacional-card-large">
          <div className="previa-operacional-card-header">
            <div className="previa-operacional-card-title-row">
              <h3>Parâmetros da prévia</h3>
              <span className="previa-operacional-badge">
                {formatarDataTitulo(dataSelecionada)}
              </span>
            </div>
          </div>

          <div className="previa-operacional-toolbar">
            <div className="previa-operacional-field">
              <label>
                <CalendarMonthRounded fontSize="small" />
                Data operacional
              </label>
              <input
                className="previa-operacional-input"
                type="date"
                value={dataSelecionada}
                onChange={(e) => setDataSelecionada(e.target.value)}
              />
            </div>

            <div className="previa-operacional-field small">
              <label>
                <ViewModuleRounded fontSize="small" />
                Colunas
              </label>
              <select
                className="previa-operacional-input"
                value={colunasPorLinha}
                onChange={(e) => setColunasPorLinha(Number(e.target.value))}
              >
                <option value={4}>4 colunas</option>
                <option value={5}>5 colunas</option>
                <option value={6}>6 colunas</option>
              </select>
            </div>

            <div className="previa-operacional-actions">
              <button
                type="button"
                className="previa-operacional-btn-primary"
                onClick={carregarServicos}
                disabled={loading}
              >
                <RefreshRounded
                  fontSize="small"
                  className={loading ? "spin" : ""}
                />
                {loading ? "Atualizando serviços..." : "Atualizar"}
              </button>

              {/* <button
                type="button"
                className="previa-operacional-btn-soft"
                onClick={() => window.print()}
              >
                <LocalPrintshopRounded fontSize="small" />
                Imprimir
              </button> */}

              <button
                type="button"
                className="previa-operacional-btn-soft whatsapp"
                onClick={() => envioGeral(false)}
              >
                <WhatsApp fontSize="small" />
                Enviar todas as prévias
              </button>

              <button
                type="button"
                className="previa-operacional-btn-soft warning"
                onClick={() => envioGeral(true)}
              >
                <WarningAmberRounded fontSize="small" />
                Enviar todas as prévias atualizadas
              </button>
            </div>
          </div>
        </div>

        <div className="previa-operacional-card">
          <div className="previa-operacional-card-header">
            <div className="previa-operacional-card-title-row">
              <h3>Última atualização</h3>
            </div>
          </div>

          <div className="previa-operacional-stats single">
            <div className="previa-operacional-stat">
              <div className="previa-operacional-stat-icon">
                <AccessTimeRounded fontSize="small" />
              </div>
              <div>
                <span>Atualizado em</span>
                <strong className="small-value">
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
        </div>

        <div className="previa-operacional-card previa-operacional-card-full">
          <div className="previa-operacional-card-header">
            <div className="previa-operacional-card-title-row">
              <h3>Indicadores operacionais</h3>
              <span className="previa-operacional-badge">resumo</span>
            </div>
          </div>

          <div className="previa-operacional-kpis">
            <div className="previa-operacional-kpi">
              <div className="previa-operacional-kpi-icon">
                <DirectionsBusRounded fontSize="small" />
              </div>
              <div>
                <span>Veículos</span>
                <strong>
                  {loading ? <SyncRounded className="spin" /> : resumo.veiculos}
                </strong>
              </div>
            </div>

            <div className="previa-operacional-kpi">
              <div className="previa-operacional-kpi-icon">
                <Inventory2Rounded fontSize="small" />
              </div>
              <div>
                <span>Serviços</span>
                <strong>
                  {loading ? <SyncRounded className="spin" /> : resumo.servicos}
                </strong>
              </div>
            </div>

            <div className="previa-operacional-kpi">
              <div className="previa-operacional-kpi-icon">
                <GroupsRounded fontSize="small" />
              </div>
              <div>
                <span>Pax</span>
                <strong>
                  {loading ? <SyncRounded className="spin" /> : resumo.pax}
                </strong>
              </div>
            </div>

            <div className="previa-operacional-kpi">
              <div className="previa-operacional-kpi-icon in">
                <SouthWestRounded fontSize="small" />
              </div>
              <div>
                <span>IN</span>
                <strong>
                  {loading ? <SyncRounded className="spin" /> : resumo.totalIn}
                </strong>
              </div>
            </div>

            <div className="previa-operacional-kpi">
              <div className="previa-operacional-kpi-icon out">
                <NorthEastRounded fontSize="small" />
              </div>
              <div>
                <span>OUT</span>
                <strong>
                  {loading ? <SyncRounded className="spin" /> : resumo.totalOut}
                </strong>
              </div>
            </div>

            <div className="previa-operacional-kpi">
              <div className="previa-operacional-kpi-icon trf">
                <SwapHorizRounded fontSize="small" />
              </div>
              <div>
                <span>Transfer</span>
                <strong>
                  {loading ? <SyncRounded className="spin" /> : resumo.totalTrf}
                </strong>
              </div>
            </div>

            <div className="previa-operacional-kpi">
              <div className="previa-operacional-kpi-icon passeio">
                <RouteRounded fontSize="small" />
              </div>
              <div>
                <span>Passeios</span>
                <strong>
                  {loading ? (
                    <SyncRounded className="spin" />
                  ) : (
                    resumo.totalPasseio
                  )}
                </strong>
              </div>
            </div>
          </div>
        </div>

        {cardsEnvioPorVeiculo.length > 0 && !loading && (
          <div className="previa-operacional-card previa-operacional-card-full">
            <div className="previa-operacional-card-header">
              <div className="previa-operacional-card-title-row">
                <h3>Enviar prévia individualmente</h3>
                <span className="previa-operacional-badge">
                  {cardsEnvioPorVeiculo.length} veículo(s)
                </span>
              </div>
              <p>Versão compacta por veículo, mantendo ação rápida.</p>
            </div>

            <div className="envio-veiculo-grid compacto">
              {cardsEnvioPorVeiculo.map((item) => (
                <div key={item.chave} className="envio-veiculo-card compacto">
                  <div className="envio-veiculo-top compacto">
                    <div>
                      <strong className="envio-veiculo-titulo">
                        {item.grupo.veiculo}
                      </strong>
                      <span className="envio-veiculo-motorista">
                        {item.grupo.motorista || "SEM MOTORISTA"}
                      </span>
                    </div>

                    <span className="envio-veiculo-badge">
                      {item.totalServicos}
                    </span>
                  </div>

                  <div className="envio-veiculo-fornecedor compacto">
                    <strong>{item.fornecedor.nome}</strong>
                    <small>
                      {formatarWhatsappVisual(item.fornecedor.whatsapp || "")}
                    </small>
                  </div>

                  <div className="envio-veiculo-preview compacto">
                    {item.grupo.linhas.slice(0, 2).map((linha) => (
                      <div
                        key={`${item.chave}-${linha.escalaId}`}
                        className="envio-veiculo-preview-linha"
                      >
                        {linha.tipo === "PASSEIO"
                          ? `${linha.passeio || linha.texto} - ${linha.guia || "SEM GUIA"} - ${linha.paxDetalhado}`
                          : `${linha.tipo} - ${linha.hora || "--:--"} - ${linha.texto} - ${linha.paxDetalhado}`}
                      </div>
                    ))}

                    {item.grupo.linhas.length > 2 && (
                      <div className="envio-veiculo-preview-more">
                        + {item.grupo.linhas.length - 2}
                      </div>
                    )}
                  </div>

                  <div className="envio-veiculo-actions compacto">
                    <button
                      type="button"
                      className="previa-operacional-btn-soft whatsapp"
                      onClick={() =>
                        abrirWhatsappPorVeiculo(
                          item.fornecedor,
                          item.grupo,
                          false,
                        )
                      }
                    >
                      <WhatsApp fontSize="small" />
                    </button>

                    <button
                      type="button"
                      className="previa-operacional-btn-soft warning"
                      onClick={() =>
                        abrirWhatsappPorVeiculo(
                          item.fornecedor,
                          item.grupo,
                          true,
                        )
                      }
                    >
                      <WarningAmberRounded fontSize="small" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="previa-operacional-card previa-operacional-card-full">
          <div className="previa-operacional-card-header">
            <div className="previa-operacional-card-title-row">
              <h3>Planilha operacional automática</h3>
              <span className="previa-operacional-badge">
                {loading
                  ? "Carregando..."
                  : formatarDataTitulo(dataSelecionada)}
              </span>
            </div>
          </div>

          {erro ? (
            <div className="previa-operacional-empty">{erro}</div>
          ) : loading ? (
            <div className="previa-operacional-empty">
              <SyncRounded className="spin" fontSize="small" />
              <span style={{ marginLeft: 8 }}>
                Atualizando prévia operacional...
              </span>
            </div>
          ) : grupos.length === 0 ? (
            <div className="previa-operacional-empty">
              Nenhum serviço escalado encontrado para esta data.
            </div>
          ) : (
            <div className="previa-operacional-sheet-wrap">
              <div className="previa-operacional-sheet-header">
                <div className="previa-operacional-sheet-logo">OP</div>
                <h1>{formatarDataTitulo(dataSelecionada)}</h1>
              </div>

              <div className="previa-operacional-sheet-body">
                {grade.map((linha, linhaIndex) => {
                  const maxServicosNaLinha = Math.max(
                    ...linha.map((grupo) => grupo.linhas.length),
                    0,
                  );

                  const totalLinhasVisuais = maxServicosNaLinha + 1;

                  return (
                    <div
                      key={`linha-${linhaIndex}`}
                      className="previa-operacional-sheet-grid"
                      style={{
                        gridTemplateColumns: `repeat(${colunasPorLinha}, minmax(0, 1fr))`,
                      }}
                    >
                      {linha.map((grupo) => {
                        const linhasVaziasNecessarias =
                          totalLinhasVisuais - grupo.linhas.length;

                        return (
                          <div
                            key={grupo.chave}
                            className={`previa-operacional-coluna ${
                              draggingVehicle &&
                              normalizarNomeVeiculo(draggingVehicle) ===
                                normalizarNomeVeiculo(grupo.veiculo)
                                ? "dragging"
                                : ""
                            }`}
                            draggable
                            onDragStart={() =>
                              setDraggingVehicle(grupo.veiculo)
                            }
                            onDragEnd={() => setDraggingVehicle(null)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => {
                              moverBloco(draggingVehicle, grupo.veiculo);
                              setDraggingVehicle(null);
                            }}
                          >
                            <div className="previa-operacional-coluna-topo">
                              <div className="previa-operacional-coluna-titulo">
                                <DragIndicatorRounded fontSize="small" />
                                *VEÍCULO: {grupo.veiculo}*
                              </div>
                            </div>

                            <div className="previa-operacional-coluna-linhas">
                              {grupo.linhas.map((linhaItem) => (
                                <div
                                  key={linhaItem.escalaId}
                                  className={`previa-operacional-linha ${tipoLinhaClass(
                                    linhaItem.tipo,
                                  )}`}
                                >
                                  <span className="texto-linha">
                                    {linhaItem.tipo === "PASSEIO"
                                      ? `${linhaItem.passeio || linhaItem.texto} - ${linhaItem.guia || "SEM GUIA"} - ${linhaItem.paxDetalhado}`
                                      : `${linhaItem.tipo} - ${linhaItem.hora || "--:--"} - ${linhaItem.texto} - ${linhaItem.paxDetalhado}`}
                                  </span>
                                </div>
                              ))}

                              {Array.from({
                                length: linhasVaziasNecessarias,
                              }).map((_, idx) => (
                                <div
                                  key={`vazia-${grupo.chave}-${idx}`}
                                  className="previa-operacional-linha vazia"
                                />
                              ))}
                            </div>
                          </div>
                        );
                      })}

                      {Array.from({
                        length: Math.max(0, colunasPorLinha - linha.length),
                      }).map((_, idx) => (
                        <div
                          key={`coluna-vazia-${idx}`}
                          className="previa-operacional-coluna coluna-vazia"
                        >
                          <div className="previa-operacional-coluna-topo">
                            <div className="previa-operacional-coluna-titulo">
                              *VEÍCULO: -*
                            </div>
                            <div className="previa-operacional-coluna-subtitulo">
                              <span>SEM MOTORISTA</span>
                              <strong>0/0/0</strong>
                            </div>
                          </div>

                          <div className="previa-operacional-coluna-linhas">
                            {Array.from({ length: totalLinhasVisuais }).map(
                              (_, emptyIdx) => (
                                <div
                                  key={`coluna-vazia-linha-${idx}-${emptyIdx}`}
                                  className="previa-operacional-linha vazia"
                                />
                              ),
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PreviaEscalasPlanilha;
