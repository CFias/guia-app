import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deleteField,
  doc,
  FieldPath,
  onSnapshot,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../Services/Services/firebase";
import {
  LeaderboardRounded,
  CalendarMonthRounded,
  SearchRounded,
  LocalShippingRounded,
  PrintRounded,
  RefreshRounded,
  SyncRounded,
  ViewColumnRounded,
  WarningAmberRounded,
  CloseRounded,
  ArrowUpwardRounded,
  ArrowDownwardRounded,
  EmojiEventsRounded,
  DirectionsBusRounded,
  EditRounded,
  CheckRounded,
  SaveRounded,
  LinkOffRounded,
  KeyboardArrowDownRounded,
  KeyboardArrowUpRounded,
} from "@mui/icons-material";
import "./styles.css";

/* =========================================================
   SERVIÇOS POR FORNECEDOR

   Fonte: API do Phoenix (mesmo endpoint das outras telas).
   Cada "serviço" = uma escala (roadmap) de um veículo, igual à
   Prévia de Transfers — várias reservas na mesma escala contam
   como 1 serviço.

   O Phoenix não informa o dono do veículo (o cadastro lá só tem
   id, placa e nome). Por isso o vínculo veículo → fornecedor é
   feito UMA VEZ nesta tela, pelo ID do veículo no Phoenix — o nome
   pode mudar ("- PLOTADA", "(15)") que o vínculo continua.

   Fica salvo no Firestore em settings/vinculos_veiculos_fornecedor
   (vale pra equipe toda):
     vinculos: { "<id do veículo>": { fornecedor, veiculoNome, placa } }

   A tela SUGERE o fornecedor pelo nome, mas nunca aplica sozinha.
   ========================================================= */

const API_BASE =
  "https://driversalvador.phoenix.comeialabs.com/scale/reserve-service";

const EXPAND =
  "service,schedule,reserve,establishmentOrigin,establishmentDestination,establishmentOrigin.region,establishmentDestination.region,reserve.partner,reserve.customer,roadmapService,roadmapService.roadmap,auxRoadmapService.roadmap.serviceOrder,auxRoadmapService.roadmap.serviceOrder.vehicle,auxRoadmapService.roadmap.driver,auxRoadmapService.roadmap.guide,roadmapService.roadmap.driver,roadmapService.roadmap.guide,roadmapService.roadmap.serviceOrder,roadmapService.roadmap.serviceOrder.vehicle";

const SERVICE_TYPES_BASE = ["1", "2", "4"];
const SERVICE_TYPE_PASSEIO = "3";

const MAX_DIAS_PERIODO = 93; // ~3 meses (cada dia = 2 chamadas na API)
const DATAS_EM_PARALELO = 3;

const TODOS = "TODOS";

const TIPOS = ["IN", "OUT", "TRF", "PASSEIO"];
const TIPO_LABEL = {
  IN: "IN",
  OUT: "OUT",
  TRF: "Transfer",
  PASSEIO: "Passeio",
};

const LS_COLUNAS = "servicos_fornecedor_colunas_v1";
const LS_DESMARCADOS = "servicos_fornecedor_veiculos_desmarcados_v2";
const DOC_VINCULOS = ["settings", "vinculos_veiculos_fornecedor"];
const PENDENTES = "__PENDENTES__";
const PLACA_GENERICA = "AAA0000";

const COLUNAS_DETALHE = [
  { id: "data", label: "Data" },
  { id: "hora", label: "Hora" },
  { id: "tipo", label: "Tipo" },
  { id: "servico", label: "Serviço / Hotel" },
  { id: "veiculo", label: "Veículo" },
  { id: "motorista", label: "Motorista" },
  { id: "guia", label: "Guia" },
  { id: "reservas", label: "Reservas" },
  { id: "pax", label: "Pax" },
  { id: "paxDetalhado", label: "ADT/CHD/INF" },
];

const COLUNAS_PADRAO = [
  "data",
  "hora",
  "tipo",
  "servico",
  "veiculo",
  "motorista",
  "pax",
];

/* ---------------- datas ---------------- */

const toIso = (d) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const hojeIso = () => toIso(new Date());

const diasAtrasIso = (dias) => {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return toIso(d);
};

const ATALHOS_PERIODO = [
  { id: "hoje", label: "Hoje", calc: () => [hojeIso(), hojeIso()] },
  {
    id: "ontem",
    label: "Ontem",
    calc: () => [diasAtrasIso(1), diasAtrasIso(1)],
  },
  { id: "7", label: "7 dias", calc: () => [diasAtrasIso(6), hojeIso()] },
  { id: "15", label: "15 dias", calc: () => [diasAtrasIso(14), hojeIso()] },
  { id: "30", label: "30 dias", calc: () => [diasAtrasIso(29), hojeIso()] },
  {
    id: "mes",
    label: "Este mês",
    calc: () => {
      const d = new Date();
      return [toIso(new Date(d.getFullYear(), d.getMonth(), 1)), hojeIso()];
    },
  },
  {
    id: "mesPassado",
    label: "Mês passado",
    calc: () => {
      const d = new Date();
      return [
        toIso(new Date(d.getFullYear(), d.getMonth() - 1, 1)),
        toIso(new Date(d.getFullYear(), d.getMonth(), 0)),
      ];
    },
  },
];

const listarDatas = (inicio, fim) => {
  if (!inicio || !fim || inicio > fim) return [];
  const [ai, mi, di] = inicio.split("-").map(Number);
  const [af, mf, df] = fim.split("-").map(Number);
  const cursor = new Date(ai, mi - 1, di);
  const limite = new Date(af, mf - 1, df);
  const datas = [];
  while (cursor <= limite) {
    datas.push(toIso(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return datas;
};

const formatarDataBr = (iso = "") => {
  if (!iso) return "";
  const [a, m, d] = String(iso).split("-");
  return `${d}/${m}/${a}`;
};

const formatarDataCurta = (iso = "") => {
  if (!iso) return "";
  const [, m, d] = String(iso).split("-");
  return `${d}/${m}`;
};

const formatarNumero = (n = 0) => Number(n || 0).toLocaleString("pt-BR");

/* ---------------- texto ---------------- */

const normalizarTexto = (texto = "") =>
  String(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[|*]/g, " ")
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const escaparHtml = (valor = "") =>
  String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/* ---------------- API Phoenix ---------------- */

const montarUrlApi = (date, serviceTypes) => {
  const params = new URLSearchParams();
  params.append("execution_date", date);
  params.append("expand", EXPAND);
  serviceTypes.forEach((t) => params.append("service_type[]", t));
  return `${API_BASE}?${params.toString()}`;
};

const extrairListaResposta = (json) => {
  if (Array.isArray(json)) return json;
  const candidatos = [json?.data, json?.results, json?.rows, json?.items];
  for (const c of candidatos) if (Array.isArray(c)) return c;
  return [];
};

const buscarJson = async (url) => {
  const resp = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return extrairListaResposta(await resp.json());
};

const buscarDia = async (date) => {
  const [base, passeios] = await Promise.all([
    buscarJson(montarUrlApi(date, SERVICE_TYPES_BASE)),
    buscarJson(montarUrlApi(date, [SERVICE_TYPE_PASSEIO])),
  ]);

  return [
    ...base.map((item) => ({ ...item, __dataMapa: date, __passeio: false })),
    ...passeios.map((item) => ({ ...item, __dataMapa: date, __passeio: true })),
  ];
};

/* ---------------- extratores ---------------- */

const extrairVeiculo = (item) =>
  item?.roadmapService?.roadmap?.serviceOrder?.vehicle?.name ||
  item?.auxRoadmapService?.roadmap?.serviceOrder?.vehicle?.name ||
  item?.vehicle?.name ||
  "";

const extrairObjVeiculo = (item) =>
  item?.roadmapService?.roadmap?.serviceOrder?.vehicle ||
  item?.auxRoadmapService?.roadmap?.serviceOrder?.vehicle ||
  item?.vehicle ||
  null;

const extrairVeiculoId = (item) => {
  const id =
    extrairObjVeiculo(item)?.id ??
    item?.roadmapService?.roadmap?.serviceOrder?.vehicle_id ??
    item?.auxRoadmapService?.roadmap?.serviceOrder?.vehicle_id ??
    null;
  return id !== null && id !== undefined && id !== "" ? String(id) : "";
};

const extrairPlaca = (item) =>
  String(extrairObjVeiculo(item)?.plate || "").trim().toUpperCase();

// Chave do veículo: o id do Phoenix. Só cai no nome se o id não vier.
const chaveVeiculoItem = (item, nome) => {
  const id = extrairVeiculoId(item);
  return id || `nome-${normalizarTexto(nome).replace(/[^a-z0-9]+/g, "-")}`;
};

const extrairEscalaId = (item) =>
  item?.roadmapService?.roadmap?.id ||
  item?.auxRoadmapService?.roadmap?.id ||
  item?.roadmap?.id ||
  null;

const extrairMotorista = (item) =>
  item?.roadmapService?.roadmap?.driver?.nickname ||
  item?.roadmapService?.roadmap?.driver?.name ||
  item?.auxRoadmapService?.roadmap?.driver?.nickname ||
  item?.auxRoadmapService?.roadmap?.driver?.name ||
  "";

const extrairGuia = (item) =>
  String(
    item?.roadmapService?.roadmap?.guide?.nickname ||
    item?.auxRoadmapService?.roadmap?.guide?.nickname ||
    item?.roadmapService?.roadmap?.guide?.name ||
    item?.auxRoadmapService?.roadmap?.guide?.name ||
    "",
  )
    .replace(/\s*-?\s*GUIA\s*$/i, "")
    .trim();

const extrairOrigem = (item) => item?.establishmentOrigin?.name || "";
const extrairDestino = (item) => item?.establishmentDestination?.name || "";
const extrairNomeServico = (item) =>
  item?.service?.name || item?.schedule?.service?.name || "";

const valorHorario = (item) =>
  String(
    item?.presentation_hour ||
    item?.presentation_hour_end ||
    item?.schedule?.presentation_hour ||
    item?.date ||
    "",
  );

const extrairDataReal = (item) => {
  const m = valorHorario(item).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
};

const extrairHora = (item) => {
  const m = valorHorario(item).match(/(\d{2}:\d{2})/);
  return m ? m[1] : "";
};

const num = (...valores) => {
  for (const v of valores) {
    if (v === null || v === undefined || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
};

const extrairPax = (item) => {
  const adt = num(item?.is_adult_count, item?.adult_count, item?.adults);
  const chd = num(item?.is_child_count, item?.child_count, item?.children);
  const inf = num(item?.is_baby_count, item?.is_infant_count, item?.infants);
  return { adt, chd, inf, total: adt + chd + inf };
};

const ehAeroporto = (texto = "") => {
  const t = normalizarTexto(texto);
  return t.includes("aeroporto") || t.includes("airport");
};

const classificarTipo = (item) => {
  if (item.__passeio) return "PASSEIO";
  if (ehAeroporto(extrairOrigem(item))) return "IN";
  if (ehAeroporto(extrairDestino(item))) return "OUT";
  const st = String(item?.service_type || "");
  if (st === "1") return "IN";
  if (st === "2") return "OUT";
  return "TRF";
};

const descreverServico = (item, tipo) => {
  if (tipo === "PASSEIO") return extrairNomeServico(item) || "Passeio";
  if (tipo === "IN") return extrairDestino(item) || extrairNomeServico(item);
  if (tipo === "OUT") return extrairOrigem(item) || extrairNomeServico(item);
  const origem = extrairOrigem(item);
  const destino = extrairDestino(item);
  if (origem && destino) return `${origem} → ${destino}`;
  return destino || origem || extrairNomeServico(item) || "Transfer";
};

/* Reservas → serviços (1 por escala). O mesmo roadmap pode aparecer em
   duas datas consultadas (serviço da madrugada), por isso a chave não
   leva a data: fica a data real mais cedo. */
const consolidarServicos = (itens, inicio, fim) => {
  const mapa = new Map();

  itens.forEach((item) => {
    const veiculo = String(extrairVeiculo(item) || "").trim();
    const escalaId = extrairEscalaId(item);
    if (!veiculo || !escalaId) return;

    const tipo = classificarTipo(item);
    const chave = `${tipo}_${escalaId}`;
    const data = extrairDataReal(item) || item.__dataMapa;
    const hora = extrairHora(item);
    const pax = extrairPax(item);

    if (!mapa.has(chave)) {
      mapa.set(chave, {
        chave,
        escalaId,
        tipo,
        data,
        hora,
        veiculo,
        veiculoKey: chaveVeiculoItem(item, veiculo),
        veiculoId: extrairVeiculoId(item),
        placa: extrairPlaca(item),
        motorista: extrairMotorista(item),
        guia: extrairGuia(item),
        servico: descreverServico(item, tipo),
        servicosNomes: new Set(),
        reservas: 0,
        adt: 0,
        chd: 0,
        inf: 0,
        pax: 0,
      });
    }

    const s = mapa.get(chave);
    s.reservas += 1;
    s.adt += pax.adt;
    s.chd += pax.chd;
    s.inf += pax.inf;
    s.pax += pax.total;
    if (tipo !== "PASSEIO") {
      const desc = descreverServico(item, tipo);
      if (desc) s.servicosNomes.add(desc);
    }
    if (!s.motorista) s.motorista = extrairMotorista(item);
    if (!s.guia) s.guia = extrairGuia(item);

    if (`${data} ${hora || "99:99"}` < `${s.data} ${s.hora || "99:99"}`) {
      s.data = data;
      s.hora = hora;
    }
  });

  return Array.from(mapa.values())
    .filter((s) => s.data >= inicio && s.data <= fim)
    .map((s) => {
      const nomes = Array.from(s.servicosNomes);
      return {
        ...s,
        servico:
          nomes.length > 1
            ? `${nomes[0]} +${nomes.length - 1}`
            : nomes[0] || s.servico,
        servicoCompleto: nomes.length ? nomes.join(" · ") : s.servico,
        servicosNomes: undefined,
      };
    })
    .sort((a, b) =>
      `${a.data} ${a.hora}`.localeCompare(`${b.data} ${b.hora}`),
    );
};

/* ---------------- sugestão de fornecedor ----------------
   Só SUGERE (nunca aplica). Tira do nome o tipo do veículo (VAN,
   MICRO, SPIN...), números e sufixos (PLOTADA, APOIO, TRANSP...) e
   usa a 1ª palavra que sobra:
     THAIS 1 / THAIS 2 / THAIS 3   → THAIS
     VAN FERNANDO - PLOTADA (15)   → FERNANDO
   Quando há outros veículos com a mesma palavra (ex.: dois
   FERNANDO), a tela avisa pra você conferir antes de confirmar. */

const PALAVRAS_TIPO = new Set([
  "van", "vans", "micro", "microonibus", "onibus", "bus",
  "carro", "sedan", "minivan", "sprinter", "executivo", "executiva",
  "spin", "doblo", "veiculo", "frota", "4x4", "suv", "jardineira",
]);

const PALAVRAS_IGNORADAS = new Set([
  "transp", "transporte", "transportes", "turismo", "tur", "ltda", "me",
  "eireli", "eg", "de", "da", "do", "das", "dos", "e", "o", "a",
  "lugares", "lug", "pax", "plotada", "plotado", "apoio", "reserva",
]);

const tokensSignificativos = (nome = "") =>
  normalizarTexto(nome)
    .replace(/[^a-z0-9 ]/g, " ")
    .split(" ")
    .map((t) => t.replace(/\d+$/, "")) // "thais1" → "thais"
    .filter(
      (t) =>
        t.length > 1 && !PALAVRAS_TIPO.has(t) && !PALAVRAS_IGNORADAS.has(t),
    );

const grupoAutomatico = (nomeVeiculo = "") => {
  const tokens = tokensSignificativos(nomeVeiculo);
  if (!tokens.length) {
    // nome sem parte "pessoal" (ex.: "ÔNIBUS 4"): o veículo vira o próprio grupo
    return {
      chave: normalizarTexto(nomeVeiculo) || "sem nome",
      nome: String(nomeVeiculo || "SEM NOME").trim().toUpperCase(),
    };
  }
  const chave = tokens[0];

  // nome de exibição: a palavra original (com acento) do veículo
  const original = String(nomeVeiculo)
    .split(/\s+/)
    .find((p) => normalizarTexto(p).replace(/[^a-z0-9]/g, "").replace(/\d+$/, "") === chave);

  return {
    chave,
    nome: (original || chave).replace(/\d+$/, "").toUpperCase(),
  };
};

const chaveFornecedor = (nome = "") => normalizarTexto(nome);

const lerSet = (chave) => {
  try {
    const v = JSON.parse(localStorage.getItem(chave) || "[]");
    return new Set(Array.isArray(v) ? v : []);
  } catch {
    return new Set();
  }
};

const salvarSet = (chave, set) => {
  try {
    localStorage.setItem(chave, JSON.stringify(Array.from(set)));
  } catch {
    /* ignora */
  }
};

const lerColunas = () => {
  try {
    const salvo = JSON.parse(localStorage.getItem(LS_COLUNAS) || "null");
    if (Array.isArray(salvo) && salvo.length) return salvo;
  } catch {
    /* ignora */
  }
  return COLUNAS_PADRAO;
};

const valorCelula = (s, coluna) => {
  switch (coluna) {
    case "data":
      return formatarDataBr(s.data);
    case "hora":
      return s.hora || "--:--";
    case "tipo":
      return TIPO_LABEL[s.tipo];
    case "servico":
      return s.servicoCompleto;
    case "veiculo":
      return s.veiculo;
    case "motorista":
      return s.motorista || "—";
    case "guia":
      return s.guia || "—";
    case "reservas":
      return formatarNumero(s.reservas);
    case "pax":
      return formatarNumero(s.pax);
    case "paxDetalhado":
      return `${s.adt}/${s.chd}/${s.inf}`;
    default:
      return "";
  }
};

/* Cabeçalho ordenável do ranking */
const Th = ({ campo, ordem, onOrdenar, className = "", children }) => (
  <th
    className={`sf-th-sort ${className} ${ordem.campo === campo ? "ativo" : ""}`}
    onClick={() => onOrdenar(campo)}
  >
    {children}
    {ordem.campo === campo &&
      (ordem.dir === "asc" ? (
        <ArrowUpwardRounded className="sf-sort-icon" />
      ) : (
        <ArrowDownwardRounded className="sf-sort-icon" />
      ))}
  </th>
);

const placaVisivel = (placa) =>
  placa && placa !== PLACA_GENERICA ? placa : "";

/* ========================================================= */

const ServicosFornecedor = () => {
  const [inicio, setInicio] = useState(diasAtrasIso(6));
  const [fim, setFim] = useState(hojeIso());
  const [atalhoAtivo, setAtalhoAtivo] = useState("7");

  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progresso, setProgresso] = useState({ feitos: 0, total: 0 });
  const [erro, setErro] = useState("");
  const [datasComFalha, setDatasComFalha] = useState([]);

  const [busca, setBusca] = useState("");
  const [modoRanking, setModoRanking] = useState("fornecedor"); // | "veiculo"
  const [fornecedorSel, setFornecedorSel] = useState(TODOS);
  const [veiculoDetalhe, setVeiculoDetalhe] = useState(TODOS);
  const [tipoDetalhe, setTipoDetalhe] = useState(TODOS);
  const [colunas, setColunas] = useState(lerColunas);
  const [seletorColunasAberto, setSeletorColunasAberto] = useState(false);
  const [ordem, setOrdem] = useState({ campo: "total", dir: "desc" });
  const [modoImpressao, setModoImpressao] = useState("resumo");

  // seleção (guarda os DESMARCADOS: veículo novo já entra marcado)
  const [desmarcados, setDesmarcados] = useState(() => lerSet(LS_DESMARCADOS));
  const [painelVeiculosAberto, setPainelVeiculosAberto] = useState(true);

  // vínculos veículo (id Phoenix) → fornecedor
  const [vinculos, setVinculos] = useState({});
  const [vinculosCarregados, setVinculosCarregados] = useState(false);
  const [salvandoVinculo, setSalvandoVinculo] = useState(false);
  const [editandoVeiculo, setEditandoVeiculo] = useState(null);
  const [renomeandoGrupo, setRenomeandoGrupo] = useState(null);
  const [textoEdicao, setTextoEdicao] = useState("");
  const [textosPendentes, setTextosPendentes] = useState({});

  const cacheRef = useRef(new Map()); // data -> itens
  const requisicaoRef = useRef(0);
  const painelRef = useRef(null);

  /* ---------- vínculos (Firestore) ---------- */
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, ...DOC_VINCULOS),
      (snap) => {
        setVinculos(snap.exists() ? snap.data()?.vinculos || {} : {});
        setVinculosCarregados(true);
      },
      (error) => {
        console.error("Erro ao carregar vínculos de veículos:", error);
        setVinculosCarregados(true);
      },
    );
    return () => unsub();
  }, []);

  const executarGravacao = async (fn) => {
    try {
      setSalvandoVinculo(true);
      await fn();
    } catch (error) {
      console.error("Erro ao salvar vínculo:", error);
      alert("Não foi possível salvar o vínculo. Tente de novo.");
    } finally {
      setSalvandoVinculo(false);
    }
  };

  // entradas: { chaveVeiculo: { fornecedor, veiculoNome, placa } }
  const gravarVinculos = (entradas) => {
    setVinculos((prev) => ({ ...prev, ...entradas })); // otimista
    return executarGravacao(() =>
      setDoc(
        doc(db, ...DOC_VINCULOS),
        { vinculos: entradas, updatedAt: Timestamp.now() },
        { merge: true },
      ),
    );
  };

  const removerVinculo = (chave) => {
    setVinculos((prev) => {
      const novo = { ...prev };
      delete novo[chave];
      return novo;
    });
    return executarGravacao(() =>
      updateDoc(
        doc(db, ...DOC_VINCULOS),
        new FieldPath("vinculos", chave),
        deleteField(),
        "updatedAt",
        Timestamp.now(),
      ),
    );
  };

  /* ---------- período ---------- */
  const datasPeriodo = useMemo(() => listarDatas(inicio, fim), [inicio, fim]);
  const periodoInvalido = !datasPeriodo.length;
  const periodoGrandeDemais = datasPeriodo.length > MAX_DIAS_PERIODO;

  const carregar = useCallback(
    async ({ forcar = false } = {}) => {
      if (!datasPeriodo.length || datasPeriodo.length > MAX_DIAS_PERIODO)
        return;

      const idReq = ++requisicaoRef.current;
      const cache = cacheRef.current;
      if (forcar) datasPeriodo.forEach((d) => cache.delete(d));

      const faltando = datasPeriodo.filter((d) => !cache.has(d));
      const falhas = [];

      setErro("");
      setLoading(true);
      setProgresso({ feitos: 0, total: faltando.length });

      let feitos = 0;
      const fila = [...faltando];

      const trabalhador = async () => {
        while (fila.length) {
          const data = fila.shift();
          try {
            cache.set(data, await buscarDia(data));
          } catch (e) {
            console.error(`Falha ao buscar ${data}:`, e);
            falhas.push(data);
          }
          feitos += 1;
          if (idReq === requisicaoRef.current) {
            setProgresso({ feitos, total: faltando.length });
          }
        }
      };

      await Promise.all(
        Array.from({ length: DATAS_EM_PARALELO }, () => trabalhador()),
      );

      if (idReq !== requisicaoRef.current) return; // período mudou no meio

      setItens(datasPeriodo.flatMap((d) => cache.get(d) || []));
      setDatasComFalha(falhas.sort());
      if (falhas.length === datasPeriodo.length) {
        setErro("Não foi possível carregar os serviços da API.");
      }
      setLoading(false);
    },
    [datasPeriodo],
  );

  // pequeno atraso pra não disparar a cada clique no calendário
  useEffect(() => {
    const t = setTimeout(() => carregar(), 350);
    return () => clearTimeout(t);
  }, [carregar]);

  const aplicarAtalho = (atalho) => {
    const [i, f] = atalho.calc();
    setInicio(i);
    setFim(f);
    setAtalhoAtivo(atalho.id);
  };

  /* ---------- processamento ---------- */
  const servicos = useMemo(
    () => consolidarServicos(itens, inicio, fim),
    [itens, inicio, fim],
  );

  // nome de exibição de cada fornecedor (pela chave normalizada)
  const nomesFornecedores = useMemo(() => {
    const mapa = new Map();
    Object.values(vinculos).forEach((v) => {
      const nome = String(v?.fornecedor || "").trim();
      if (nome && !mapa.has(chaveFornecedor(nome))) {
        mapa.set(chaveFornecedor(nome), nome);
      }
    });
    return mapa;
  }, [vinculos]);

  const listaNomesFornecedores = useMemo(
    () =>
      Array.from(nomesFornecedores.values()).sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      ),
    [nomesFornecedores],
  );

  const fornecedorDoVeiculo = useCallback(
    (chave) => {
      const nome = String(vinculos[chave]?.fornecedor || "").trim();
      if (!nome) return null;
      const key = chaveFornecedor(nome);
      return { chave: key, nome: nomesFornecedores.get(key) || nome };
    },
    [vinculos, nomesFornecedores],
  );

  const servicosComFornecedor = useMemo(
    () =>
      servicos.map((s) => {
        const f = fornecedorDoVeiculo(s.veiculoKey);
        return {
          ...s,
          fornecedorKey: f?.chave || PENDENTES,
          fornecedorNome: f?.nome || "Sem fornecedor definido",
          selecionado: !desmarcados.has(s.veiculoKey),
        };
      }),
    [servicos, fornecedorDoVeiculo, desmarcados],
  );

  // veículos que rodaram no período (nome mais recente de cada id)
  const veiculosPeriodo = useMemo(() => {
    const mapa = new Map();
    servicosComFornecedor.forEach((s) => {
      const atual = mapa.get(s.veiculoKey) || {
        chave: s.veiculoKey,
        id: s.veiculoId,
        total: 0,
      };
      atual.nome = s.veiculo; // servicos vêm em ordem de data → fica o mais recente
      atual.placa = s.placa || atual.placa || "";
      atual.fornecedorKey = s.fornecedorKey;
      atual.fornecedorNome = s.fornecedorNome;
      atual.total += 1;
      mapa.set(s.veiculoKey, atual);
    });
    return Array.from(mapa.values()).sort((a, b) =>
      a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }),
    );
  }, [servicosComFornecedor]);

  const pendentes = useMemo(() => {
    const lista = veiculosPeriodo.filter((v) => v.fornecedorKey === PENDENTES);

    return lista
      .map((v) => {
        const palavra = grupoAutomatico(v.nome).chave;

        // veículos JÁ vinculados com a mesma palavra no nome
        const vinculadosParecidos = Object.entries(vinculos)
          .filter(
            ([chave, x]) =>
              chave !== v.chave &&
              x?.fornecedor &&
              grupoAutomatico(x.veiculoNome || "").chave === palavra,
          )
          .map(([, x]) => ({ veiculo: x.veiculoNome, fornecedor: x.fornecedor }));

        const pendentesParecidos = lista.filter(
          (o) => o.chave !== v.chave && grupoAutomatico(o.nome).chave === palavra,
        );

        const candidatos = new Map();
        vinculadosParecidos.forEach((x) =>
          candidatos.set(chaveFornecedor(x.fornecedor), nomesFornecedores.get(chaveFornecedor(x.fornecedor)) || x.fornecedor),
        );
        if (nomesFornecedores.has(palavra)) {
          candidatos.set(palavra, nomesFornecedores.get(palavra));
        }

        const sugestoes = candidatos.size
          ? Array.from(candidatos.values())
          : [grupoAutomatico(v.nome).nome];

        let nivel = "ok";
        if (candidatos.size > 1) nivel = "conflito";
        else if (!candidatos.size && pendentesParecidos.length) nivel = "confira";

        return {
          ...v,
          sugestoes,
          nivel,
          parecidos: [
            ...vinculadosParecidos.map((x) => `${x.veiculo} → ${x.fornecedor}`),
            ...pendentesParecidos.map((o) => `${o.nome} (sem fornecedor)`),
          ],
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [veiculosPeriodo, vinculos, nomesFornecedores]);

  const grupos = useMemo(() => {
    const mapa = new Map();
    veiculosPeriodo
      .filter((v) => v.fornecedorKey !== PENDENTES)
      .forEach((v) => {
        if (!mapa.has(v.fornecedorKey)) {
          mapa.set(v.fornecedorKey, {
            chave: v.fornecedorKey,
            nome: v.fornecedorNome,
            veiculos: [],
            total: 0,
          });
        }
        const g = mapa.get(v.fornecedorKey);
        g.veiculos.push(v);
        g.total += v.total;
      });

    return Array.from(mapa.values())
      .map((g) => ({
        ...g,
        qtdMarcados: g.veiculos.filter((v) => !desmarcados.has(v.chave)).length,
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [veiculosPeriodo, desmarcados]);

  const totalVeiculos = veiculosPeriodo.length;
  const totalVeiculosMarcados = veiculosPeriodo.filter(
    (v) => !desmarcados.has(v.chave),
  ).length;
  const veiculosForaDoRelatorio = veiculosPeriodo
    .filter((v) => desmarcados.has(v.chave))
    .map((v) => v.nome);
  const servicosPendentes = pendentes.reduce((a, v) => a + v.total, 0);

  const servicosSel = useMemo(
    () => servicosComFornecedor.filter((s) => s.selecionado),
    [servicosComFornecedor],
  );

  // base do ranking: por fornecedor só entra veículo com fornecedor definido
  const servicosRanking = useMemo(
    () =>
      modoRanking === "veiculo"
        ? servicosSel
        : servicosSel.filter((s) => s.fornecedorKey !== PENDENTES),
    [servicosSel, modoRanking],
  );

  /* ---------- seleção de veículos ---------- */
  const atualizarDesmarcados = (fn) =>
    setDesmarcados((prev) => {
      const novo = new Set(prev);
      fn(novo);
      salvarSet(LS_DESMARCADOS, novo);
      return novo;
    });

  const alternarVeiculo = (chave) =>
    atualizarDesmarcados((set) => {
      if (set.has(chave)) set.delete(chave);
      else set.add(chave);
    });

  const alternarLista = (veiculos) => {
    const todosMarcados = veiculos.every((v) => !desmarcados.has(v.chave));
    atualizarDesmarcados((set) =>
      veiculos.forEach((v) =>
        todosMarcados ? set.add(v.chave) : set.delete(v.chave),
      ),
    );
  };

  const marcarTodos = (marcar) =>
    atualizarDesmarcados((set) =>
      veiculosPeriodo.forEach((v) =>
        marcar ? set.delete(v.chave) : set.add(v.chave),
      ),
    );

  /* ---------- ações de vínculo ---------- */
  const vincular = (veiculo, nomeFornecedor) => {
    const digitado = String(nomeFornecedor || "").trim().toUpperCase();
    if (!digitado) return;
    // reaproveita a grafia de um fornecedor que já existe
    const nome = nomesFornecedores.get(chaveFornecedor(digitado)) || digitado;
    gravarVinculos({
      [veiculo.chave]: {
        fornecedor: nome,
        veiculoNome: veiculo.nome,
        placa: veiculo.placa || "",
      },
    });
    setEditandoVeiculo(null);
    setTextosPendentes((prev) => {
      const novo = { ...prev };
      delete novo[veiculo.chave];
      return novo;
    });
  };

  const desvincular = (veiculo) => {
    if (
      !window.confirm(
        `Tirar ${veiculo.nome} do fornecedor ${veiculo.fornecedorNome}? Ele volta para "sem fornecedor definido".`,
      )
    )
      return;
    removerVinculo(veiculo.chave);
  };

  // renomeia o fornecedor em TODOS os vínculos (inclusive veículos fora do período)
  const renomearFornecedor = (grupo, novoNome) => {
    setRenomeandoGrupo(null);
    const nome = String(novoNome || "").trim().toUpperCase();
    if (!nome || nome === grupo.nome) return;

    const existente = nomesFornecedores.get(chaveFornecedor(nome));
    if (
      existente &&
      chaveFornecedor(nome) !== grupo.chave &&
      !window.confirm(
        `Já existe o fornecedor ${existente}. Juntar os veículos de ${grupo.nome} nele?`,
      )
    )
      return;

    const entradas = {};
    Object.entries(vinculos).forEach(([chave, v]) => {
      if (chaveFornecedor(v?.fornecedor) === grupo.chave) {
        entradas[chave] = { ...v, fornecedor: existente || nome };
      }
    });
    gravarVinculos(entradas);
    if (fornecedorSel === grupo.chave) setFornecedorSel(chaveFornecedor(nome));
  };

  const irParaPendentes = () => {
    setPainelVeiculosAberto(true);
    setTimeout(
      () => painelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      50,
    );
  };

  /* ---------- ranking geral ---------- */
  const rankingGeral = useMemo(() => {
    const porVeiculo = modoRanking === "veiculo";
    const mapa = new Map();

    servicosRanking.forEach((s) => {
      const chave = porVeiculo ? s.veiculoKey : s.fornecedorKey;
      if (!mapa.has(chave)) {
        mapa.set(chave, {
          id: chave,
          nome: porVeiculo ? s.veiculo : s.fornecedorNome,
          fornecedorKey: s.fornecedorKey,
          fornecedorNome: s.fornecedorNome,
          IN: 0,
          OUT: 0,
          TRF: 0,
          PASSEIO: 0,
          total: 0,
          pax: 0,
          veiculos: new Set(),
          dias: new Set(),
        });
      }
      const r = mapa.get(chave);
      if (porVeiculo) r.nome = s.veiculo; // nome mais recente
      r[s.tipo] += 1;
      r.total += 1;
      r.pax += s.pax;
      r.veiculos.add(s.veiculo);
      r.dias.add(s.data);
    });

    const totalGeral = servicosRanking.length || 1;

    return Array.from(mapa.values())
      .map((r) => ({
        ...r,
        veiculos: Array.from(r.veiculos).sort((a, b) =>
          a.localeCompare(b, "pt-BR", { numeric: true }),
        ),
        qtdVeiculos: r.veiculos.size,
        qtdDias: r.dias.size,
        dias: undefined,
        share: (r.total / totalGeral) * 100,
      }))
      .sort((a, b) => b.total - a.total || b.pax - a.pax)
      .map((r, i) => ({ ...r, posicao: i + 1 }));
  }, [servicosRanking, modoRanking]);

  const termoBusca = normalizarTexto(busca);

  const rankingExibido = useMemo(() => {
    const lista = rankingGeral.filter((r) => {
      if (!termoBusca) return true;
      return (
        normalizarTexto(r.nome).includes(termoBusca) ||
        normalizarTexto(r.fornecedorNome).includes(termoBusca) ||
        r.veiculos.some((v) => normalizarTexto(v).includes(termoBusca))
      );
    });

    const { campo, dir } = ordem;
    const fator = dir === "asc" ? 1 : -1;
    return [...lista].sort((a, b) => {
      if (campo === "nome")
        return fator * a.nome.localeCompare(b.nome, "pt-BR", { numeric: true });
      if (campo === "posicao") return fator * (a.posicao - b.posicao);
      return fator * ((a[campo] || 0) - (b[campo] || 0)) || a.posicao - b.posicao;
    });
  }, [rankingGeral, termoBusca, ordem]);

  const maiorTotal = rankingGeral[0]?.total || 1;

  const kpis = useMemo(() => {
    const porTipo = TIPOS.reduce((acc, t) => ({ ...acc, [t]: 0 }), {});
    let pax = 0;
    const fornecedoresSet = new Set();
    const veiculosSet = new Set();
    servicosRanking.forEach((s) => {
      porTipo[s.tipo] += 1;
      pax += s.pax;
      veiculosSet.add(s.veiculoKey);
      if (s.fornecedorKey !== PENDENTES) fornecedoresSet.add(s.fornecedorKey);
    });
    return {
      total: servicosRanking.length,
      pax,
      porTipo,
      fornecedores: fornecedoresSet.size,
      veiculos: veiculosSet.size,
      mediaDia: datasPeriodo.length
        ? servicosRanking.length / datasPeriodo.length
        : 0,
    };
  }, [servicosRanking, datasPeriodo]);

  // painel: filtra pela busca
  const casaBusca = (v) =>
    !termoBusca ||
    normalizarTexto(`${v.nome} ${v.placa} ${v.id}`).includes(termoBusca);

  const pendentesPainel = pendentes.filter(casaBusca);
  const gruposPainel = grupos.filter(
    (g) =>
      !termoBusca ||
      normalizarTexto(g.nome).includes(termoBusca) ||
      g.veiculos.some(casaBusca),
  );

  /* ---------- detalhe do fornecedor ---------- */
  const grupoAtual = useMemo(() => {
    if (fornecedorSel === TODOS) return null;
    if (fornecedorSel === PENDENTES) {
      return {
        chave: PENDENTES,
        nome: "Sem fornecedor definido",
        veiculos: pendentes,
        qtdMarcados: pendentes.filter((v) => !desmarcados.has(v.chave)).length,
      };
    }
    return grupos.find((g) => g.chave === fornecedorSel) || null;
  }, [fornecedorSel, grupos, pendentes, desmarcados]);

  const rankingFornecedores = useMemo(() => {
    const cont = new Map();
    servicosSel
      .filter((s) => s.fornecedorKey !== PENDENTES)
      .forEach((s) => cont.set(s.fornecedorKey, (cont.get(s.fornecedorKey) || 0) + 1));
    return Array.from(cont.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([chave], i) => ({ chave, posicao: i + 1 }));
  }, [servicosSel]);

  const posicaoAtual = rankingFornecedores.find(
    (r) => r.chave === fornecedorSel,
  )?.posicao;

  const servicosDoGrupo = useMemo(
    () =>
      fornecedorSel === TODOS
        ? []
        : servicosSel.filter((s) => s.fornecedorKey === fornecedorSel),
    [servicosSel, fornecedorSel],
  );

  const resumoSelecionado = useMemo(() => {
    const porTipo = TIPOS.reduce((acc, t) => ({ ...acc, [t]: 0 }), {});
    const porVeiculo = new Map();
    let pax = 0;
    const dias = new Set();

    servicosDoGrupo.forEach((s) => {
      porTipo[s.tipo] += 1;
      pax += s.pax;
      dias.add(s.data);
      const atual = porVeiculo.get(s.veiculoKey) || { nome: s.veiculo, qtd: 0 };
      atual.nome = s.veiculo;
      atual.qtd += 1;
      porVeiculo.set(s.veiculoKey, atual);
    });

    return {
      total: servicosDoGrupo.length,
      porTipo,
      pax,
      dias: dias.size,
      porVeiculo: Array.from(porVeiculo.entries())
        .map(([chave, v]) => ({ chave, ...v }))
        .sort((a, b) => b.qtd - a.qtd),
    };
  }, [servicosDoGrupo]);

  const servicosDetalheExibidos = useMemo(
    () =>
      servicosDoGrupo.filter((s) => {
        if (tipoDetalhe !== TODOS && s.tipo !== tipoDetalhe) return false;
        if (veiculoDetalhe !== TODOS && s.veiculoKey !== veiculoDetalhe)
          return false;
        if (!termoBusca) return true;
        return normalizarTexto(
          [s.servicoCompleto, s.veiculo, s.motorista, s.guia].join(" "),
        ).includes(termoBusca);
      }),
    [servicosDoGrupo, tipoDetalhe, veiculoDetalhe, termoBusca],
  );

  const colunasVisiveis = COLUNAS_DETALHE.filter((c) => colunas.includes(c.id));

  const alternarColuna = (id) => {
    setColunas((prev) => {
      const nova = prev.includes(id)
        ? prev.filter((c) => c !== id)
        : COLUNAS_DETALHE.map((c) => c.id).filter(
          (c) => prev.includes(c) || c === id,
        );
      if (!nova.length) return prev; // pelo menos 1 coluna
      try {
        localStorage.setItem(LS_COLUNAS, JSON.stringify(nova));
      } catch {
        /* ignora */
      }
      return nova;
    });
  };

  const selecionarFornecedor = (chave, veiculoKey = TODOS) => {
    setFornecedorSel(chave);
    setVeiculoDetalhe(veiculoKey);
    setTipoDetalhe(TODOS);
  };

  const alternarOrdem = (campo) =>
    setOrdem((prev) =>
      prev.campo === campo
        ? { campo, dir: prev.dir === "desc" ? "asc" : "desc" }
        : { campo, dir: campo === "nome" || campo === "posicao" ? "asc" : "desc" },
    );

  /* ---------- impressão ---------- */
  const imprimirRelatorio = () => {
    const periodo =
      inicio === fim
        ? formatarDataBr(inicio)
        : `${formatarDataBr(inicio)} a ${formatarDataBr(fim)}`;
    const geradoEm = new Date().toLocaleString("pt-BR");
    const porVeiculo = modoRanking === "veiculo";

    const tabelaDetalhe = (lista) => `
      <table>
        <thead><tr>${colunasVisiveis
        .map((c) => `<th>${escaparHtml(c.label)}</th>`)
        .join("")}</tr></thead>
        <tbody>${lista.length
        ? lista
          .map(
            (s) =>
              `<tr>${colunasVisiveis
                .map(
                  (c) =>
                    `<td${["reservas", "pax", "paxDetalhado"].includes(c.id)
                      ? ' class="num"'
                      : ""
                    }>${escaparHtml(valorCelula(s, c.id))}</td>`,
                )
                .join("")}</tr>`,
          )
          .join("")
        : `<tr><td colspan="${colunasVisiveis.length}" class="vazio">Nenhum serviço no período.</td></tr>`
      }</tbody>
      </table>`;

    const kpisHtml = (resumo, extra = "") => `
      <div class="kpis">
        <div><span>Serviços</span><strong>${formatarNumero(resumo.total)}</strong></div>
        ${TIPOS.map(
      (t) =>
        `<div><span>${TIPO_LABEL[t]}</span><strong>${formatarNumero(
          resumo.porTipo[t],
        )}</strong></div>`,
    ).join("")}
        <div><span>Pax</span><strong>${formatarNumero(resumo.pax)}</strong></div>
        ${extra}
      </div>`;

    let corpo = "";

    if (grupoAtual) {
      const veicsGrupo = grupoAtual.veiculos.filter(
        (v) => !desmarcados.has(v.chave),
      );
      corpo = `
        <h2>${escaparHtml(grupoAtual.nome)}</h2>
        <p class="sub">${posicaoAtual
          ? `${posicaoAtual}º de ${rankingFornecedores.length} no ranking geral · `
          : ""
        }Veículos: ${escaparHtml(veicsGrupo.map((v) => v.nome).join(", ") || "—")}</p>
        ${kpisHtml(resumoSelecionado)}
        ${resumoSelecionado.porVeiculo.length > 1
          ? `<p class="sub"><strong>Por veículo:</strong> ${resumoSelecionado.porVeiculo
            .map((v) => `${escaparHtml(v.nome)} (${v.qtd})`)
            .join(" · ")}</p>`
          : ""
        }
        ${tipoDetalhe !== TODOS || veiculoDetalhe !== TODOS || termoBusca
          ? `<p class="sub">Filtro aplicado: ${escaparHtml(
            [
              veiculoDetalhe !== TODOS
                ? resumoSelecionado.porVeiculo.find((v) => v.chave === veiculoDetalhe)?.nome
                : "",
              tipoDetalhe !== TODOS ? TIPO_LABEL[tipoDetalhe] : "",
              termoBusca ? `busca "${busca}"` : "",
            ]
              .filter(Boolean)
              .join(" · "),
          )} — ${servicosDetalheExibidos.length} serviço(s)</p>`
          : ""
        }
        ${tabelaDetalhe(servicosDetalheExibidos)}`;
    } else {
      const linhasRanking = rankingExibido
        .map(
          (r) => `<tr>
            <td class="num">${r.posicao}º</td>
            <td>${escaparHtml(r.nome)}<div class="mini">${escaparHtml(
            porVeiculo ? r.fornecedorNome : r.veiculos.join(", "),
          )}</div></td>
            ${TIPOS.map((t) => `<td class="num">${formatarNumero(r[t])}</td>`).join("")}
            <td class="num"><strong>${formatarNumero(r.total)}</strong></td>
            <td class="num">${formatarNumero(r.pax)}</td>
            <td class="num">${r.share.toFixed(1)}%</td>
          </tr>`,
        )
        .join("");

      corpo = `
        ${kpisHtml(
        kpis,
        `<div><span>Fornecedores</span><strong>${kpis.fornecedores}</strong></div>
           <div><span>Veículos</span><strong>${kpis.veiculos}</strong></div>`,
      )}
        <h2>Ranking geral por ${porVeiculo ? "veículo" : "fornecedor"}</h2>
        ${termoBusca ? `<p class="sub">Busca: "${escaparHtml(busca)}"</p>` : ""}
        <table>
          <thead><tr>
            <th>#</th><th>${porVeiculo ? "Veículo / fornecedor" : "Fornecedor / veículos"}</th>
            ${TIPOS.map((t) => `<th>${TIPO_LABEL[t]}</th>`).join("")}
            <th>Total</th><th>Pax</th><th>%</th>
          </tr></thead>
          <tbody>${linhasRanking ||
        '<tr><td colspan="9" class="vazio">Nenhum serviço no período.</td></tr>'
        }</tbody>
        </table>
        ${!porVeiculo && servicosPendentes
          ? `<p class="aviso">${servicosPendentes} serviço(s) de ${pendentes.length} veículo(s) sem fornecedor definido não entram neste ranking: ${escaparHtml(
            pendentes.map((v) => v.nome).join(", "),
          )}</p>`
          : ""
        }
        ${modoImpressao === "completo"
          ? rankingExibido
            .map((r) => {
              const lista = servicosRanking.filter((s) =>
                porVeiculo ? s.veiculoKey === r.id : s.fornecedorKey === r.id,
              );
              return `<section class="quebra">
                    <h2>${r.posicao}º · ${escaparHtml(r.nome)}</h2>
                    <p class="sub">${formatarNumero(r.total)} serviço(s) · ${formatarNumero(
                r.pax,
              )} pax · ${TIPOS.map(
                (t) => `${TIPO_LABEL[t]}: ${r[t]}`,
              ).join(" · ")}</p>
                    ${tabelaDetalhe(lista)}
                  </section>`;
            })
            .join("")
          : ""
        }`;
    }

    const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<title>Serviços por fornecedor — ${escaparHtml(periodo)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Montserrat, Arial, sans-serif; color: #1a1a1a; margin: 24px; font-size: 11px; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #017b64; padding-bottom: 10px; margin-bottom: 16px; }
  header h1 { margin: 0; font-size: 17px; }
  header .meta { text-align: right; color: #555; line-height: 1.6; }
  h2 { font-size: 13px; margin: 18px 0 6px; }
  .sub { margin: 0 0 8px; color: #555; }
  .mini { color: #777; font-size: 9px; margin-top: 2px; }
  .kpis { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 14px; }
  .kpis div { border: 1px solid #ddd; border-radius: 8px; padding: 6px 12px; min-width: 80px; }
  .kpis span { display: block; color: #666; font-size: 9px; text-transform: uppercase; letter-spacing: .04em; }
  .kpis strong { font-size: 15px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  th { background: #017b64; color: #fff; text-align: left; padding: 6px; font-size: 10px; }
  td { padding: 5px 6px; border-bottom: 1px solid #e5e5e5; vertical-align: top; }
  tr:nth-child(even) td { background: #f6f8f8; }
  .num { text-align: right; white-space: nowrap; }
  .vazio { text-align: center; color: #888; padding: 14px; }
  .aviso { background: #fff7e0; border: 1px solid #f0d78a; padding: 8px 10px; border-radius: 6px; }
  .quebra { break-before: page; }
  @page { size: A4 ${grupoAtual || modoImpressao === "completo" ? "landscape" : "portrait"}; margin: 12mm; }
  @media print { body { margin: 0; } th { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head>
<body>
  <header>
    <div>
      <h1>Serviços por fornecedor</h1>
      <div class="sub">Operacional SSA · Fonte: Phoenix</div>
    </div>
    <div class="meta">Período: <strong>${escaparHtml(periodo)}</strong><br/>
      Veículos no relatório: ${totalVeiculosMarcados} de ${totalVeiculos}<br/>
      Gerado em ${escaparHtml(geradoEm)}</div>
  </header>
  ${datasComFalha.length
        ? `<p class="aviso">Atenção: não foi possível carregar ${datasComFalha.length} dia(s) — ${escaparHtml(
          datasComFalha.map(formatarDataCurta).join(", "),
        )}. Os números podem estar incompletos.</p>`
        : ""
      }
  ${corpo}
  ${veiculosForaDoRelatorio.length
        ? `<p class="sub" style="margin-top:14px">Veículos desmarcados (fora deste relatório): ${escaparHtml(
          veiculosForaDoRelatorio.join(", "),
        )}</p>`
        : ""
      }
  <script>window.onload = function () { window.print(); };</script>
</body></html>`;

    const janela = window.open("", "_blank");
    if (!janela) {
      alert("Libere os pop-ups deste site para imprimir o relatório.");
      return;
    }
    janela.document.open();
    janela.document.write(html);
    janela.document.close();
  };

  /* ---------- render ---------- */
  const percentual = progresso.total
    ? Math.round((progresso.feitos / progresso.total) * 100)
    : 0;

  const semVeiculosMarcados = totalVeiculos > 0 && totalVeiculosMarcados === 0;

  const checkboxLista = (veiculos, titulo) => {
    const marcados = veiculos.filter((v) => !desmarcados.has(v.chave)).length;
    return (
      <input
        type="checkbox"
        checked={veiculos.length > 0 && marcados === veiculos.length}
        ref={(el) => {
          if (el) el.indeterminate = marcados > 0 && marcados < veiculos.length;
        }}
        onChange={() => alternarLista(veiculos)}
        title={titulo}
      />
    );
  };

  const infoVeiculo = (v) => (
    <span className="sf-veic-info">
      {placaVisivel(v.placa) && <span>{v.placa}</span>}
      {v.id && <span>id {v.id}</span>}
    </span>
  );

  return (
    <div className="servicos-fornecedor-page">
      <div className="sf-header">
        <div>
          <h2 className="sf-title">
            Serviços por Fornecedor <LeaderboardRounded fontSize="small" />
          </h2>
          <p className="sf-subtitle">
            Todos os veículos escalados no Phoenix. O fornecedor de cada
            veículo é definido uma vez aqui, pelo ID do veículo. Cada escala
            conta como 1 serviço.
          </p>
        </div>

        <div className="sf-header-actions">
          {!grupoAtual && (
            <select
              className="sf-select-mini"
              value={modoImpressao}
              onChange={(e) => setModoImpressao(e.target.value)}
              title="O que vai no relatório impresso"
            >
              <option value="resumo">Relatório: só ranking</option>
              <option value="completo">Relatório: ranking + serviços</option>
            </select>
          )}
          <button
            type="button"
            className="sf-btn"
            onClick={() => carregar({ forcar: true })}
            disabled={loading || periodoInvalido || periodoGrandeDemais}
          >
            {loading ? (
              <SyncRounded className="sf-spin" fontSize="small" />
            ) : (
              <RefreshRounded fontSize="small" />
            )}
            Atualizar
          </button>
          <button
            type="button"
            className="sf-btn sf-btn-primary"
            onClick={imprimirRelatorio}
            disabled={
              loading || periodoInvalido || periodoGrandeDemais || semVeiculosMarcados
            }
          >
            <PrintRounded fontSize="small" />
            Imprimir relatório
          </button>
        </div>
      </div>

      {/* ===== FILTROS ===== */}
      <section className="sf-card">
        <div className="sf-filtros-grid">
          <label className="sf-field">
            <span>
              <CalendarMonthRounded fontSize="small" /> Início
            </span>
            <input
              type="date"
              value={inicio}
              max={fim}
              onChange={(e) => {
                setInicio(e.target.value);
                setAtalhoAtivo("");
              }}
            />
          </label>

          <label className="sf-field">
            <span>
              <CalendarMonthRounded fontSize="small" /> Fim
            </span>
            <input
              type="date"
              value={fim}
              min={inicio}
              onChange={(e) => {
                setFim(e.target.value);
                setAtalhoAtivo("");
              }}
            />
          </label>

          <label className="sf-field">
            <span>
              <LocalShippingRounded fontSize="small" /> Fornecedor
            </span>
            <select
              value={fornecedorSel}
              onChange={(e) => selecionarFornecedor(e.target.value)}
            >
              <option value={TODOS}>Todos (ranking geral)</option>
              {grupos.map((g) => (
                <option key={g.chave} value={g.chave}>
                  {g.nome} ({g.veiculos.length} veíc.)
                  {g.qtdMarcados === 0 ? " — fora do relatório" : ""}
                </option>
              ))}
              {pendentes.length > 0 && (
                <option value={PENDENTES}>
                  ⚠ Sem fornecedor definido ({pendentes.length})
                </option>
              )}
            </select>
          </label>

          <label className="sf-field">
            <span>
              <SearchRounded fontSize="small" /> Buscar
            </span>
            <div className="sf-input-wrap">
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder={
                  grupoAtual
                    ? "Serviço, hotel, veículo, motorista, guia..."
                    : "Fornecedor, veículo ou placa..."
                }
              />
              {busca && (
                <button
                  type="button"
                  className="sf-clear"
                  onClick={() => setBusca("")}
                  aria-label="Limpar busca"
                >
                  <CloseRounded fontSize="small" />
                </button>
              )}
            </div>
          </label>
        </div>

        <div className="sf-atalhos">
          {ATALHOS_PERIODO.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`sf-chip ${atalhoAtivo === a.id ? "ativo" : ""}`}
              onClick={() => aplicarAtalho(a)}
            >
              {a.label}
            </button>
          ))}
          <span className="sf-periodo-info">{datasPeriodo.length} dia(s)</span>
        </div>

        {periodoInvalido && (
          <p className="sf-alerta erro">A data de início é depois da data final.</p>
        )}
        {periodoGrandeDemais && (
          <p className="sf-alerta erro">
            Período muito longo ({datasPeriodo.length} dias). O máximo é{" "}
            {MAX_DIAS_PERIODO} dias para não sobrecarregar a API.
          </p>
        )}

        {loading && (
          <div className="sf-progresso">
            <div className="sf-progresso-barra">
              <div style={{ width: `${percentual}%` }} />
            </div>
            <span>
              Carregando dias do Phoenix… {progresso.feitos}/{progresso.total}
            </span>
          </div>
        )}
      </section>

      {erro && <p className="sf-alerta erro">{erro}</p>}

      {datasComFalha.length > 0 && !erro && (
        <p className="sf-alerta">
          <WarningAmberRounded fontSize="small" />
          Não foi possível carregar {datasComFalha.length} dia(s):{" "}
          {datasComFalha.map(formatarDataCurta).join(", ")}. Clique em
          Atualizar para tentar de novo.
        </p>
      )}

      {pendentes.length > 0 && vinculosCarregados && (
        <div className="sf-alerta">
          <WarningAmberRounded fontSize="small" />
          <span>
            <strong>
              {pendentes.length} veículo(s) sem fornecedor definido
            </strong>{" "}
            ({servicosPendentes} serviço(s)) — não entram no ranking por
            fornecedor.
          </span>
          <button type="button" className="sf-link" onClick={irParaPendentes}>
            Definir agora
          </button>
        </div>
      )}

      {/* ===== VEÍCULOS: vínculo + seleção ===== */}
      <section className="sf-card" ref={painelRef}>
        <div className="sf-card-head">
          <button
            type="button"
            className="sf-head-toggle"
            onClick={() => setPainelVeiculosAberto((v) => !v)}
          >
            <DirectionsBusRounded fontSize="small" />
            <h3>Veículos e fornecedores</h3>
            <span className="sf-contador">
              {totalVeiculosMarcados} de {totalVeiculos} no relatório
            </span>
            {painelVeiculosAberto ? (
              <KeyboardArrowUpRounded fontSize="small" />
            ) : (
              <KeyboardArrowDownRounded fontSize="small" />
            )}
          </button>

          {painelVeiculosAberto && totalVeiculos > 0 && (
            <div className="sf-head-actions">
              {salvandoVinculo && (
                <span className="sf-muted">
                  <SyncRounded className="sf-spin" fontSize="inherit" /> salvando…
                </span>
              )}
              <button type="button" className="sf-chip" onClick={() => marcarTodos(true)}>
                Marcar todos
              </button>
              <button type="button" className="sf-chip" onClick={() => marcarTodos(false)}>
                Desmarcar todos
              </button>
            </div>
          )}
        </div>

        <datalist id="sf-fornecedores-lista">
          {listaNomesFornecedores.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>

        {painelVeiculosAberto &&
          (!totalVeiculos ? (
            <div className="sf-vazio">
              {loading ? "Carregando…" : "Nenhum veículo escalado no período."}
            </div>
          ) : (
            <>
              <p className="sf-muted sf-dica">
                Os checkboxes definem quem entra no ranking e no relatório. O
                fornecedor de cada veículo fica salvo pelo ID do Phoenix e vale
                pra equipe toda — mesmo que o nome do veículo mude.
              </p>

              {/* ---- pendentes ---- */}
              {pendentesPainel.length > 0 && (
                <div className="sf-pendentes">
                  <div className="sf-pendentes-head">
                    {checkboxLista(pendentesPainel, "Marcar/desmarcar todos os pendentes")}
                    <strong>Sem fornecedor definido</strong>
                    <span className="sf-muted">
                      confirme a sugestão ou digite o fornecedor
                    </span>
                  </div>

                  <ul className="sf-pendentes-lista">
                    {pendentesPainel.map((v) => (
                      <li key={v.chave} className={`nivel-${v.nivel}`}>
                        <label className="sf-pend-veic">
                          <input
                            type="checkbox"
                            checked={!desmarcados.has(v.chave)}
                            onChange={() => alternarVeiculo(v.chave)}
                          />
                          <span>
                            <strong>{v.nome}</strong>
                            {infoVeiculo(v)}
                          </span>
                          <span className="sf-veic-total" title="Serviços no período">
                            {v.total}
                          </span>
                        </label>

                        <div className="sf-pend-acoes">
                          {v.nivel !== "conflito" &&
                            v.sugestoes.map((s) => (
                              <button
                                key={s}
                                type="button"
                                className="sf-sugestao"
                                onClick={() => vincular(v, s)}
                                title={`Vincular ${v.nome} ao fornecedor ${s}`}
                              >
                                <CheckRounded fontSize="inherit" /> {s}
                                {!nomesFornecedores.has(chaveFornecedor(s)) && (
                                  <small>novo</small>
                                )}
                              </button>
                            ))}
                          <input
                            className="sf-input-inline"
                            list="sf-fornecedores-lista"
                            placeholder={
                              v.nivel === "conflito" ? "Qual fornecedor?" : "Outro…"
                            }
                            value={textosPendentes[v.chave] || ""}
                            onChange={(e) =>
                              setTextosPendentes((prev) => ({
                                ...prev,
                                [v.chave]: e.target.value,
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter")
                                vincular(v, textosPendentes[v.chave]);
                            }}
                          />
                          <button
                            type="button"
                            className="sf-icon-btn ok"
                            title="Salvar"
                            disabled={!String(textosPendentes[v.chave] || "").trim()}
                            onClick={() => vincular(v, textosPendentes[v.chave])}
                          >
                            <SaveRounded fontSize="inherit" />
                          </button>
                        </div>

                        {v.parecidos.length > 0 && (
                          <div className="sf-parecidos">
                            {v.nivel === "conflito" && (
                              <strong>
                                Nome parecido com veículos de fornecedores
                                diferentes — escolha qual:{" "}
                              </strong>
                            )}
                            {v.nivel === "confira" && (
                              <strong>
                                Confira: pode ser outro fornecedor com o mesmo
                                nome.{" "}
                              </strong>
                            )}
                            {v.nivel === "ok" && <span>Parecidos: </span>}
                            {v.parecidos.join(" · ")}
                            {v.nivel === "conflito" && (
                              <span className="sf-conflito-opcoes">
                                {v.sugestoes.map((s) => (
                                  <button
                                    key={s}
                                    type="button"
                                    className="sf-sugestao"
                                    onClick={() => vincular(v, s)}
                                  >
                                    <CheckRounded fontSize="inherit" /> {s}
                                  </button>
                                ))}
                              </span>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* ---- fornecedores ---- */}
              {gruposPainel.length > 0 && (
                <div className="sf-grupos-grid">
                  {gruposPainel.map((g) => (
                    <div
                      key={g.chave}
                      className={`sf-grupo ${g.qtdMarcados ? "" : "desligado"}`}
                    >
                      <div className="sf-grupo-head">
                        {checkboxLista(
                          g.veiculos,
                          "Marcar/desmarcar todos os veículos deste fornecedor",
                        )}
                        {renomeandoGrupo === g.chave ? (
                          <input
                            className="sf-input-inline"
                            autoFocus
                            list="sf-fornecedores-lista"
                            value={textoEdicao}
                            onChange={(e) => setTextoEdicao(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") renomearFornecedor(g, textoEdicao);
                              if (e.key === "Escape") setRenomeandoGrupo(null);
                            }}
                          />
                        ) : (
                          <strong
                            className="sf-grupo-nome"
                            onClick={() => selecionarFornecedor(g.chave)}
                            title="Ver serviços deste fornecedor"
                          >
                            {g.nome}
                          </strong>
                        )}
                        <span className="sf-grupo-total">{g.total}</span>
                        {renomeandoGrupo === g.chave ? (
                          <button
                            type="button"
                            className="sf-icon-btn ok"
                            title="Salvar nome"
                            onClick={() => renomearFornecedor(g, textoEdicao)}
                          >
                            <CheckRounded fontSize="inherit" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="sf-icon-btn"
                            title="Renomear fornecedor"
                            onClick={() => {
                              setRenomeandoGrupo(g.chave);
                              setTextoEdicao(g.nome);
                            }}
                          >
                            <EditRounded fontSize="inherit" />
                          </button>
                        )}
                      </div>

                      <ul className="sf-grupo-veiculos">
                        {g.veiculos.map((v) => (
                          <li key={v.chave}>
                            {editandoVeiculo === v.chave ? (
                              <div className="sf-mover">
                                <span className="sf-muted">
                                  Fornecedor de {v.nome}:
                                </span>
                                <input
                                  className="sf-input-inline"
                                  list="sf-fornecedores-lista"
                                  autoFocus
                                  value={textoEdicao}
                                  onChange={(e) => setTextoEdicao(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") vincular(v, textoEdicao);
                                    if (e.key === "Escape") setEditandoVeiculo(null);
                                  }}
                                />
                                <button
                                  type="button"
                                  className="sf-icon-btn ok"
                                  title="Salvar"
                                  onClick={() => vincular(v, textoEdicao)}
                                >
                                  <CheckRounded fontSize="inherit" />
                                </button>
                                <button
                                  type="button"
                                  className="sf-icon-btn"
                                  title="Cancelar"
                                  onClick={() => setEditandoVeiculo(null)}
                                >
                                  <CloseRounded fontSize="inherit" />
                                </button>
                              </div>
                            ) : (
                              <>
                                <label>
                                  <input
                                    type="checkbox"
                                    checked={!desmarcados.has(v.chave)}
                                    onChange={() => alternarVeiculo(v.chave)}
                                  />
                                  <span className="sf-veic-nome">
                                    {v.nome}
                                    {infoVeiculo(v)}
                                  </span>
                                </label>
                                <span className="sf-veic-total">{v.total}</span>
                                <button
                                  type="button"
                                  className="sf-icon-btn"
                                  title="Mudar o fornecedor deste veículo"
                                  onClick={() => {
                                    setEditandoVeiculo(v.chave);
                                    setTextoEdicao(g.nome);
                                  }}
                                >
                                  <EditRounded fontSize="inherit" />
                                </button>
                                <button
                                  type="button"
                                  className="sf-icon-btn"
                                  title="Tirar do fornecedor"
                                  onClick={() => desvincular(v)}
                                >
                                  <LinkOffRounded fontSize="inherit" />
                                </button>
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              {!pendentesPainel.length && !gruposPainel.length && (
                <div className="sf-vazio">Nada encontrado para essa busca.</div>
              )}
            </>
          ))}
      </section>

      {/* ===== VISÃO GERAL / RANKING ===== */}
      {!grupoAtual && (
        <>
          <div className="sf-kpis">
            <div className="sf-kpi destaque">
              <span>Serviços</span>
              <strong>{formatarNumero(kpis.total)}</strong>
              <small>{kpis.mediaDia.toFixed(1)} / dia</small>
            </div>
            {TIPOS.map((t) => (
              <div key={t} className={`sf-kpi tipo-${t.toLowerCase()}`}>
                <span>{TIPO_LABEL[t]}</span>
                <strong>{formatarNumero(kpis.porTipo[t])}</strong>
              </div>
            ))}
            <div className="sf-kpi">
              <span>Pax</span>
              <strong>{formatarNumero(kpis.pax)}</strong>
            </div>
            <div className="sf-kpi">
              <span>Fornecedores</span>
              <strong>{kpis.fornecedores}</strong>
              <small>{kpis.veiculos} veículo(s)</small>
            </div>
          </div>

          <section className="sf-card">
            <div className="sf-card-head">
              <h3>
                <EmojiEventsRounded fontSize="small" /> Ranking geral
              </h3>
              <div className="sf-segmentado">
                <button
                  type="button"
                  className={modoRanking === "fornecedor" ? "ativo" : ""}
                  onClick={() => setModoRanking("fornecedor")}
                >
                  Por fornecedor
                </button>
                <button
                  type="button"
                  className={modoRanking === "veiculo" ? "ativo" : ""}
                  onClick={() => setModoRanking("veiculo")}
                >
                  Por veículo
                </button>
              </div>
            </div>

            {loading && !rankingGeral.length ? (
              <div className="sf-vazio">Carregando…</div>
            ) : semVeiculosMarcados ? (
              <div className="sf-vazio">
                Nenhum veículo marcado. Marque veículos acima para montar o ranking.
              </div>
            ) : !rankingExibido.length ? (
              <div className="sf-vazio">
                {termoBusca
                  ? "Nada encontrado para essa busca."
                  : modoRanking === "fornecedor" && pendentes.length
                    ? "Nenhum veículo com fornecedor definido ainda. Defina os fornecedores acima."
                    : "Nenhum serviço no período."}
              </div>
            ) : (
              <div className="sf-table-wrap">
                <table className="sf-table sf-ranking">
                  <thead>
                    <tr>
                      <Th ordem={ordem} onOrdenar={alternarOrdem} campo="posicao" className="num">#</Th>
                      <Th ordem={ordem} onOrdenar={alternarOrdem} campo="nome">
                        {modoRanking === "veiculo" ? "Veículo" : "Fornecedor"}
                      </Th>
                      {modoRanking === "fornecedor" && (
                        <Th ordem={ordem} onOrdenar={alternarOrdem} campo="qtdVeiculos" className="num">Veíc.</Th>
                      )}
                      {TIPOS.map((t) => (
                        <Th key={t} ordem={ordem} onOrdenar={alternarOrdem} campo={t} className="num">
                          {TIPO_LABEL[t]}
                        </Th>
                      ))}
                      <Th ordem={ordem} onOrdenar={alternarOrdem} campo="total" className="num">Total</Th>
                      <Th ordem={ordem} onOrdenar={alternarOrdem} campo="pax" className="num">Pax</Th>
                      <Th ordem={ordem} onOrdenar={alternarOrdem} campo="share">Participação</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankingExibido.map((r) => (
                      <tr
                        key={r.id}
                        onClick={() =>
                          modoRanking === "veiculo"
                            ? selecionarFornecedor(r.fornecedorKey, r.id)
                            : selecionarFornecedor(r.id)
                        }
                      >
                        <td className="num">
                          <span
                            className={`sf-pos ${r.posicao <= 3 ? `top${r.posicao}` : ""}`}
                          >
                            {r.posicao}º
                          </span>
                        </td>
                        <td>
                          <strong>{r.nome}</strong>
                          {modoRanking === "veiculo" &&
                            r.fornecedorKey === PENDENTES && (
                              <span className="sf-tag">sem fornecedor</span>
                            )}
                          <div className="sf-muted sf-veic-lista">
                            {modoRanking === "veiculo"
                              ? `${r.fornecedorKey === PENDENTES ? "—" : r.fornecedorNome} · ${r.qtdDias} dia(s)`
                              : `${r.veiculos.join(", ")} · ${r.qtdDias} dia(s)`}
                          </div>
                        </td>
                        {modoRanking === "fornecedor" && (
                          <td className="num">{r.qtdVeiculos}</td>
                        )}
                        {TIPOS.map((t) => (
                          <td key={t} className={`num ${r[t] ? "" : "zero"}`}>
                            {formatarNumero(r[t])}
                          </td>
                        ))}
                        <td className="num">
                          <strong>{formatarNumero(r.total)}</strong>
                        </td>
                        <td className="num">{formatarNumero(r.pax)}</td>
                        <td className="sf-share-cell">
                          <div className="sf-share">
                            <div style={{ width: `${(r.total / maiorTotal) * 100}%` }} />
                          </div>
                          <span>{r.share.toFixed(1)}%</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {/* ===== DETALHE DO FORNECEDOR ===== */}
      {grupoAtual && (
        <>
          <div className="sf-detalhe-head">
            <div>
              <h3>{grupoAtual.nome}</h3>
              <span className="sf-muted">
                {posicaoAtual
                  ? `${posicaoAtual}º de ${rankingFornecedores.length} no ranking geral · `
                  : ""}
                {resumoSelecionado.dias} dia(s) com serviço no período
              </span>
            </div>
            <button
              type="button"
              className="sf-btn"
              onClick={() => selecionarFornecedor(TODOS)}
            >
              <EmojiEventsRounded fontSize="small" /> Voltar ao ranking
            </button>
          </div>

          {grupoAtual.qtdMarcados === 0 && (
            <p className="sf-alerta">
              <WarningAmberRounded fontSize="small" />
              Nenhum veículo deste fornecedor está marcado — marque no painel
              de veículos para ele entrar no relatório.
            </p>
          )}

          <div className="sf-kpis">
            <div className="sf-kpi destaque">
              <span>Serviços</span>
              <strong>{formatarNumero(resumoSelecionado.total)}</strong>
            </div>
            {TIPOS.map((t) => (
              <div key={t} className={`sf-kpi tipo-${t.toLowerCase()}`}>
                <span>{TIPO_LABEL[t]}</span>
                <strong>{formatarNumero(resumoSelecionado.porTipo[t])}</strong>
              </div>
            ))}
            <div className="sf-kpi">
              <span>Pax</span>
              <strong>{formatarNumero(resumoSelecionado.pax)}</strong>
            </div>
          </div>

          {resumoSelecionado.porVeiculo.length > 0 && (
            <div className="sf-veiculos">
              <button
                type="button"
                className={`sf-veiculo-chip ${veiculoDetalhe === TODOS ? "ativo" : ""}`}
                onClick={() => setVeiculoDetalhe(TODOS)}
              >
                Todos <strong>{resumoSelecionado.total}</strong>
              </button>
              {resumoSelecionado.porVeiculo.map((v) => (
                <button
                  type="button"
                  key={v.chave}
                  className={`sf-veiculo-chip ${veiculoDetalhe === v.chave ? "ativo" : ""}`}
                  onClick={() => setVeiculoDetalhe(v.chave)}
                >
                  {v.nome} <strong>{v.qtd}</strong>
                </button>
              ))}
            </div>
          )}

          <section className="sf-card">
            <div className="sf-card-head">
              <div className="sf-atalhos sem-margem">
                {[TODOS, ...TIPOS].map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`sf-chip ${tipoDetalhe === t ? "ativo" : ""}`}
                    onClick={() => setTipoDetalhe(t)}
                  >
                    {t === TODOS ? "Todos" : TIPO_LABEL[t]}{" "}
                    <small>
                      {t === TODOS
                        ? resumoSelecionado.total
                        : resumoSelecionado.porTipo[t]}
                    </small>
                  </button>
                ))}
              </div>

              <div className="sf-colunas-wrap">
                <button
                  type="button"
                  className="sf-btn"
                  onClick={() => setSeletorColunasAberto((v) => !v)}
                >
                  <ViewColumnRounded fontSize="small" /> Colunas
                </button>
                {seletorColunasAberto && (
                  <div className="sf-colunas-pop">
                    {COLUNAS_DETALHE.map((c) => (
                      <label key={c.id}>
                        <input
                          type="checkbox"
                          checked={colunas.includes(c.id)}
                          onChange={() => alternarColuna(c.id)}
                        />
                        {c.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {!servicosDetalheExibidos.length ? (
              <div className="sf-vazio">
                {loading ? "Carregando…" : "Nenhum serviço encontrado."}
              </div>
            ) : (
              <div className="sf-table-wrap">
                <table className="sf-table">
                  <thead>
                    <tr>
                      {colunasVisiveis.map((c) => (
                        <th
                          key={c.id}
                          className={
                            ["reservas", "pax", "paxDetalhado"].includes(c.id)
                              ? "num"
                              : ""
                          }
                        >
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {servicosDetalheExibidos.map((s) => (
                      <tr key={s.chave}>
                        {colunasVisiveis.map((c) => (
                          <td
                            key={c.id}
                            className={
                              ["reservas", "pax", "paxDetalhado"].includes(c.id)
                                ? "num"
                                : ""
                            }
                          >
                            {c.id === "tipo" ? (
                              <span className={`sf-tipo tipo-${s.tipo.toLowerCase()}`}>
                                {TIPO_LABEL[s.tipo]}
                              </span>
                            ) : (
                              valorCelula(s, c.id)
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      {colunasVisiveis.map((c, i) => (
                        <td
                          key={c.id}
                          className={
                            ["reservas", "pax", "paxDetalhado"].includes(c.id)
                              ? "num"
                              : ""
                          }
                        >
                          {i === 0
                            ? `${servicosDetalheExibidos.length} serviço(s)`
                            : c.id === "pax"
                              ? formatarNumero(
                                servicosDetalheExibidos.reduce((a, s) => a + s.pax, 0),
                              )
                              : c.id === "reservas"
                                ? formatarNumero(
                                  servicosDetalheExibidos.reduce((a, s) => a + s.reservas, 0),
                                )
                                : ""}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default ServicosFornecedor;
