// atendimentoAeroporto.js
//
// ATENDIMENTO NO AEROPORTO — substitui a "cartinha" (no verso, quem
// recepcionou e quem embarcou cada grupo). As chegadas (IN) do Phoenix são
// agrupadas por VEÍCULO (escala do Phoenix; sem escala, por voo) e cada
// colaborador marca, no painel dele, as etapas que fez (padrão: Recepcionou /
// Embarcou — configurável em Demanda por turno → Turnos e equipe).
//
// Firestore: atendimentos[__base]/{AAAA-MM-DD}__{chave do veículo}
//   { data, chave, veiculo, motorista, voos[], hora, pax, reservas,
//     marcas: { <etapa>: { <uid ou colaborador>: { nome, colaboradorId, em, por } } },
//     atualizadoEm }
// A contagem (pax por colaborador, % do dia) é feita no relatório
// (Demanda por turno → Atendimento no aeroporto), com a regra configurada.

import { Timestamp, deleteField, getDocs, onSnapshot, query, setDoc, where } from "firebase/firestore";
import { colBase, docBase } from "./dadosBase";
import { phoenixReserveService } from "./regiaoAtiva";
import { EXPAND } from "./plannerUtils";
import { extrairListaResposta } from "./plannerApi";
import { paraMinutos } from "./relatorioTurnos";
import { chaveDoVeiculo, normalizarTexto } from "./custosCalculo";

export const COL_ATENDIMENTOS = "atendimentos";

const texto = (v) => String(v || "").replace(/\s+/g, " ").trim();
const hora = (valor) => {
  const str = String(valor || "").trim();
  if (!str) return "";
  if (str.includes("T")) return str.slice(11, 16);
  const m = str.match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : "";
};

const roadmap = (i) => i?.roadmapService?.roadmap || i?.auxRoadmapService?.roadmap || i?.roadmap || null;
const veiculoDo = (i) => {
  const v = roadmap(i)?.serviceOrder?.vehicle || i?.vehicle || {};
  return texto(v.nickname || v.name || v.prefix || v.plate);
};
const motoristaDo = (i) => texto(roadmap(i)?.driver?.nickname || roadmap(i)?.driver?.name || i?.driver?.nickname || i?.driver?.name);
const vooDo = (i) =>
  texto(i?.schedule?.name || i?.reserve?.flight_code || i?.reserve?.flight?.code || i?.reserve?.arrival_flight_code || i?.flight_code || i?.flight?.code).toUpperCase();
const horaVooDo = (i) => {
  const h = hora(i?.fly_hour || i?.reserve?.flight_time || i?.reserve?.flight?.scheduled_time || i?.reserve?.arrival_flight_time || i?.flight_time || i?.flight?.scheduled_time);
  return h && h !== "00:00" ? h : hora(i?.presentation_hour || i?.schedule?.presentation_hour);
};
const adtDo = (i) => Number(i?.is_adult_count || 0);
const chdDo = (i) => Number(i?.is_child_count || 0);
const infDo = (i) => Number(i?.is_baby_count || i?.is_infant_count || 0);
const paxDo = (i) => adtDo(i) + chdDo(i) + infDo(i);
const titularDo = (i) => texto(i?.reserve?.customer?.name || i?.customer?.name || i?.reserve?.holder_name || i?.passenger_name);
const hotelDo = (i) => texto(i?.establishmentDestination?.name || i?.establishment_destination?.name || i?.destination?.name);
// operadora (parceiro da reserva) ou, sem parceiro, quem vendeu (comercial)
const operadoraDo = (i) =>
  texto(i?.reserve?.partner?.fantasy_name || i?.reserve?.partner?.name || (Array.isArray(i?.reserve?.pdvPayment) ? i.reserve.pdvPayment.map((p) => p?.user?.name).find(Boolean) : ""));
const servicoDo = (i) => texto(i?.service?.name || i?.schedule?.service?.name);
const codigoDo = (i) => texto(i?.reserve?.code || i?.reserve_code || i?.code || i?.reserve?.id);

// chave segura para id de documento
export const chaveSegura = (t = "") =>
  String(t)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w-]+/g, "_")
    .slice(0, 80) || "sem_chave";

/* EXCEÇÃO POR VOO (fornecedores marcados, ex.: o terceirizado de Morro de
   São Paulo): todos os carros do fornecedor saem com o MESMO número de escala,
   mas com voos diferentes. Para esses, cada voo vira um grupo à parte
   (esc_<escala>__v_<voo>) com o horário do próprio voo — assim a chegada das
   13h aparece para o turno da tarde, e não junto com a das 10h.
   atendimento.porVoo = { fornecedores: [nomes], veiculos: [chaves do veículo] }
   (os veículos são calculados quando a gerência salva, porque a conta de
   atendimento não lê o cadastro de fornecedores). mapaFornecedor (opcional):
   chave do veículo → fornecedor, para quem pode ler o cadastro. */
export const chaveSeparadaPorVoo = (escala, voo) => `esc_${escala}__v_${chaveSegura(voo || "sem_voo")}`;
export const regraPorVoo = (atendimento, mapaFornecedor = null) => {
  const fornecedores = (atendimento?.porVoo?.fornecedores || []).map((f) => normalizarTexto(f)).filter(Boolean);
  const veiculos = new Set(atendimento?.porVoo?.veiculos || []);
  if (!fornecedores.length && !veiculos.size) return null;
  return (i) => {
    const so = roadmap(i)?.serviceOrder || {};
    const v = so.vehicle || i?.vehicle || {};
    const id = v.id ?? so.vehicle_id ?? "";
    const nome = v.name || so.vehicle_name || v.nickname || "";
    const k1 = chaveDoVeiculo(id !== "" && id !== null ? String(id) : "", nome);
    const k2 = chaveDoVeiculo("", nome);
    if (veiculos.has(k1) || veiculos.has(k2)) return true;
    const f = mapaFornecedor && (mapaFornecedor[k1] || mapaFornecedor[k2]);
    if (f && fornecedores.includes(normalizarTexto(f))) return true;
    // o nome do fornecedor no apelido do veículo (ex.: "MORRO TUR 2")
    const apelido = normalizarTexto(`${v.nickname || ""} ${v.name || ""}`);
    return fornecedores.some((n) => n.length >= 3 && apelido.includes(n));
  };
};

/* Chegadas do dia agrupadas por veículo.
   [{ chave, veiculo, motorista, voos[], hora, min, pax,
      reservas: [{ codigo, titular, pax, adt, chd, inf, voo, hotel }] }] */
export const buscarChegadasPorVeiculo = async (data, { porVoo = null } = {}) => {
  const p = new URLSearchParams();
  p.append("execution_date", data);
  p.append("expand", EXPAND);
  p.append("service_type[]", "1");
  const r = await fetch(`${phoenixReserveService()}?${p.toString()}`, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`O Phoenix respondeu com erro ${r.status}.`);
  const itens = extrairListaResposta(await r.json());
  const grupos = new Map();
  itens.forEach((i) => {
    const pax = paxDo(i);
    if (!pax) return;
    const escala = roadmap(i)?.id;
    const veiculo = veiculoDo(i);
    const voo = vooDo(i);
    const h = horaVooDo(i);
    // com escala do Phoenix: o veículo da escala; sem escala: o voo (aguardando veículo).
    // fornecedor da exceção: a escala é dividida por voo
    const separa = !!(escala && porVoo && porVoo(i));
    const chave = escala ? (separa ? chaveSeparadaPorVoo(escala, voo) : `esc_${escala}`) : `voo_${voo || "sem_voo"}_${h}`;
    const g = grupos.get(chave) || {
      chave,
      escalaId: escala || null,
      porVoo: separa,
      veiculo: escala ? veiculo || "Veículo da escala" : "",
      motorista: escala ? motoristaDo(i) : "",
      voos: new Set(),
      hora: h,
      pax: 0,
      reservas: [],
    };
    if (voo) g.voos.add(voo);
    if (h && (!g.hora || h < g.hora)) g.hora = h;
    g.pax += pax;
    g.reservas.push({ codigo: codigoDo(i), titular: titularDo(i), pax, adt: adtDo(i), chd: chdDo(i), inf: infDo(i), voo, hotel: hotelDo(i), operadora: operadoraDo(i), servico: servicoDo(i) });
    grupos.set(chave, g);
  });
  return [...grupos.values()]
    .map((g) => ({ ...g, voos: [...g.voos], min: paraMinutos(g.hora) ?? 9999 }))
    .sort((a, b) => a.min - b.min || a.chave.localeCompare(b.chave));
};

export const idAtendimento = (data, chave) => `${data}__${chaveSegura(chave)}`;

/* Liga cada veículo do Phoenix ao documento de marcas dele.
   Quem marca ANTES de o Phoenix escalar o veículo grava no grupo do voo
   (voo_<voo>_<hora>); depois que a escala sai, o grupo vira esc_<id>. Para a
   marca não "sumir", o veículo herda o documento do voo (mesmo voo e hora).
   Devolve Map(chave do grupo → { id, doc, herdado }). */
export const vincularDocs = (grupos = [], docs = [], data) => {
  const porId = new Map(docs.map((d) => [d.id, d]));
  const doVoo = docs.filter((d) => String(d.chave || "").startsWith("voo_"));
  const mapa = new Map();
  grupos.forEach((g) => {
    const id = idAtendimento(data, g.chave);
    if (porId.has(id)) return mapa.set(g.chave, { id, doc: porId.get(id), herdado: false });
    if (g.escalaId) {
      const antigo = doVoo.find((d) => (d.voos || []).some((v) => g.voos.includes(v)) && (!d.hora || !g.hora || d.hora === g.hora));
      if (antigo) return mapa.set(g.chave, { id: antigo.id, doc: antigo, herdado: true });
    }
    mapa.set(g.chave, { id, doc: null, herdado: false });
  });
  return mapa;
};

// "2 ADT · 1 CHD · 1 INF"
export const textoPax = (r = {}) =>
  [
    [r.adt, "ADT"],
    [r.chd, "CHD"],
    [r.inf, "INF"],
  ]
    .filter(([n]) => Number(n) > 0)
    .map(([n, t]) => `${n} ${t}`)
    .join(" · ") || `${r.pax || 0} pax`;

// o que fica guardado de cada reserva (para a busca e o histórico)
const resumoReserva = (r) => ({
  codigo: r.codigo || "",
  titular: r.titular || "",
  hotel: r.hotel || "",
  voo: r.voo || "",
  pax: Number(r.pax) || 0,
  adt: Number(r.adt) || 0,
  chd: Number(r.chd) || 0,
  inf: Number(r.inf) || 0,
  operadora: r.operadora || "",
  servico: r.servico || "",
});

// marca ou desmarca uma etapa para alguém (quem = { id, nome, colaboradorId }).
// docId: grava num documento herdado (marcado antes da escala) — aí só as marcas mudam.
// lancado: o Operacional marcou em nome da pessoa; horaManual ("HH:MM"): o horário
// real da cartinha (sem ele, o lançamento não entra no tempo de espera).
export const marcarEtapa = async ({ data, grupo, etapa, quem, por, marcar, docId, lancado = false, horaManual = "" }) => {
  const proprio = idAtendimento(data, grupo.chave);
  const herdado = docId && docId !== proprio;
  const ref = docBase(COL_ATENDIMENTOS, herdado ? docId : proprio);
  const resumo = herdado ? { atualizadoEm: Timestamp.now() } : {
    data,
    chave: grupo.chave,
    veiculo: grupo.veiculo || "",
    motorista: grupo.motorista || "",
    voos: grupo.voos || [],
    hora: grupo.hora || "",
    pax: grupo.pax || 0,
    reservas: (grupo.reservas || []).map(resumoReserva),
    atualizadoEm: Timestamp.now(),
  };
  await setDoc(
    ref,
    {
      ...resumo,
      marcas: {
        [etapa]: {
          [quem.id]: marcar
            ? {
              nome: quem.nome || "",
              colaboradorId: quem.colaboradorId || "",
              em: horaManual ? Timestamp.fromDate(new Date(`${data}T${horaManual}:00`)) : Timestamp.now(),
              por: por || "",
              ...(lancado ? { lancado: true, horaManual: !!horaManual } : {}),
            }
            : deleteField(),
        },
      },
    },
    { merge: true },
  );
};

// ---------------------------------------------------------------------
// NO SHOW (por reserva): "sem custo" ou "com custo" (cobrado do cliente /
// operadora). Fica no documento do veículo, em noShow.{chave da reserva}.
// Os pax do no show saem da contagem de quem recepcionou/embarcou.
// ---------------------------------------------------------------------
export const TIPOS_NO_SHOW = [
  { id: "sem_custo", nome: "No show sem custo", curto: "Sem custo" },
  { id: "com_custo", nome: "No show com custo", curto: "Com custo" },
];
/* Relato padronizado do no show, para colar no grupo:
   Ocorrência: No-show / Reserva / Operadora/Comercial / Serviço / Descrição /
   Custo para a base:(✅ ) Sim ( ) Não */
export const DESCRICAO_NO_SHOW = "Esperamos mais de 45 minutos, foram realizadas tentativas de contato, porém sem retorno.";
export const textoRelatoNoShow = ({ reserva = {}, tipo, descricao = DESCRICAO_NO_SHOW }) => {
  const com = tipo === "com_custo";
  return [
    "Ocorrência: No-show",
    `Reserva: ${reserva.codigo || reserva.titular || "—"}`,
    `Operadora/Comercial: ${reserva.operadora || "—"}`,
    `Serviço: ${reserva.servico || "IN"}`,
    `Descrição: ${String(descricao || DESCRICAO_NO_SHOW).trim()}`,
    `Custo para a base:(${com ? "✅ " : " "}) Sim (${com ? " " : "✅ "}) Não`,
  ].join("\n");
};
export const nomeNoShow = (tipo) => TIPOS_NO_SHOW.find((t) => t.id === tipo)?.nome || "No show";
export const chaveReserva = (r = {}, i = 0) => chaveSegura(r.codigo || `${r.titular || "reserva"}_${i}`);
const entradasNoShow = (doc) => Object.entries(doc?.noShow || {}).filter(([, v]) => v && typeof v === "object" && v.tipo);
export const paxNoShow = (doc) => entradasNoShow(doc).reduce((s, [, v]) => s + (Number(v.pax) || 0), 0);
export const paxEfetivo = (doc) => Math.max(0, (Number(doc?.pax) || 0) - paxNoShow(doc));
// no show de uma reserva (pelo código; sem código, pelo nome)
export const noShowDaReserva = (doc, r, i = 0) => {
  if (!doc?.noShow) return null;
  const direto = doc.noShow[chaveReserva(r, i)];
  if (direto?.tipo) return direto;
  const achado = entradasNoShow(doc).find(([, v]) => (r.codigo && v.codigo === r.codigo) || (!r.codigo && v.titular === r.titular));
  return achado ? achado[1] : null;
};

/* Marca (tipo) ou desmarca (tipo = null) o no show de uma reserva do veículo.
   quem = { id, nome } de quem informou; docId: documento herdado (marcado antes da escala). */
export const marcarNoShow = async ({ data, grupo, reserva, indice = 0, tipo, quem, por, docId }) => {
  const proprio = idAtendimento(data, grupo.chave);
  const herdado = docId && docId !== proprio;
  const ref = docBase(COL_ATENDIMENTOS, herdado ? docId : proprio);
  const resumo = herdado
    ? { atualizadoEm: Timestamp.now() }
    : {
      data,
      chave: grupo.chave,
      veiculo: grupo.veiculo || "",
      motorista: grupo.motorista || "",
      voos: grupo.voos || [],
      hora: grupo.hora || "",
      pax: grupo.pax || 0,
      reservas: (grupo.reservas || []).map(resumoReserva),
      atualizadoEm: Timestamp.now(),
    };
  await setDoc(
    ref,
    {
      ...resumo,
      noShow: {
        [chaveReserva(reserva, indice)]: tipo
          ? {
            tipo,
            ...resumoReserva(reserva),
            porNome: quem?.nome || "",
            colaboradorId: quem?.id || "",
            por: por || "",
            em: Timestamp.now(),
          }
          : deleteField(),
      },
    },
    { merge: true },
  );
};

// todos os no shows dos documentos, para relatórios
export const listaNoShow = (docs = []) =>
  docs
    .flatMap((d) =>
      entradasNoShow(d).map(([chave, v]) => ({
        ...v,
        chave,
        data: d.data,
        hora: d.hora || "",
        voos: d.voos || [],
        veiculo: d.veiculo || "",
        docId: d.id,
      })),
    )
    .sort((a, b) => a.data.localeCompare(b.data) || String(a.hora).localeCompare(String(b.hora)));

export const resumoNoShow = (docs = []) => {
  const l = listaNoShow(docs);
  const por = (tipo) => l.filter((n) => n.tipo === tipo);
  return {
    lista: l,
    reservas: l.length,
    pax: l.reduce((s, n) => s + (Number(n.pax) || 0), 0),
    semCusto: { reservas: por("sem_custo").length, pax: por("sem_custo").reduce((s, n) => s + (Number(n.pax) || 0), 0) },
    comCusto: { reservas: por("com_custo").length, pax: por("com_custo").reduce((s, n) => s + (Number(n.pax) || 0), 0) },
  };
};

// atendimentos de um dia ou período (por data)
export const listarAtendimentos = async (inicio, fim = inicio) => {
  const snap = await getDocs(query(colBase(COL_ATENDIMENTOS), where("data", ">=", inicio), where("data", "<=", fim)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};


/* PAINEL DE CHEGADAS (Painel Operacional): o documento de marcas de um
   veículo num voo — pela escala (esc_<id>), pela escala separada por voo
   (esc_<id>__v_<voo>) ou, sem escala, pelo voo (voo_<voo>_<hora>). */
export const docDoVeiculoNoVoo = (docs = [], escalaIds = [], voo = "") => {
  const porChave = new Map(docs.map((d) => [d.chave, d]));
  for (const id of escalaIds.filter(Boolean)) {
    const separado = porChave.get(chaveSeparadaPorVoo(id, voo));
    if (separado) return separado;
    const normal = porChave.get(`esc_${id}`);
    if (normal) return normal;
  }
  return null;
};
export const docsDoVooSemEscala = (docs = [], voo = "") => {
  const v = String(voo || "").trim().toUpperCase();
  return docs.filter((d) => String(d.chave || "").startsWith("voo_") && (d.voos || []).some((x) => String(x).trim().toUpperCase() === v));
};
// situação das etapas de um documento: [{ id, nome, marcas: [{ nome, data }] }]
export const etapasDoDoc = (doc, etapas = []) => etapas.map((e) => ({ id: e.id, nome: e.nome, marcas: doc ? marcasDaEtapa(doc, e.id) : [] }));

/* Os mesmos atendimentos em TEMPO REAL: chama aoMudar(docs, snap) a cada
   marcação feita no painel. Devolve a função que para de ouvir. */
export const ouvirAtendimentos = (inicio, fim, aoMudar, aoErrar) =>
  onSnapshot(
    query(colBase(COL_ATENDIMENTOS), where("data", ">=", inicio), where("data", "<=", fim)),
    (snap) => aoMudar(snap.docs.map((d) => ({ id: d.id, ...d.data() })), snap),
    (e) => aoErrar?.(e),
  );

/* O que é NOVO entre duas leituras (para o "ao vivo" e o som):
   marcas de etapa, recepções por reserva e no shows que apareceram.
   antes/depois: listas de documentos. Desmarcações não viram aviso. */
export const eventosNovos = (antes = [], depois = [], etapas = []) => {
  const velhos = new Map(antes.map((d) => [d.id, d]));
  const nomeEtapa = (id) => etapas.find((e) => e.id === id)?.nome || id;
  const veiculoDe = (d) => [d.veiculo, d.hora].filter(Boolean).join(" · ") || "Veículo";
  const out = [];
  depois.forEach((d) => {
    const v = velhos.get(d.id) || {};
    Object.entries(d.marcas || {}).forEach(([etapa, pessoas]) =>
      Object.entries(pessoas || {}).forEach(([id, m]) => {
        if (!m || typeof m !== "object" || v.marcas?.[etapa]?.[id]) return;
        out.push({
          id: `${d.id}|m|${etapa}|${id}`,
          etapa: Math.max(0, etapas.findIndex((e) => e.id === etapa)),
          nEtapas: etapas.length,
          tipo: m.auto ? "completo" : "marca",
          quem: m.nome || "",
          texto: m.auto ? `${veiculoDe(d)}: ${nomeEtapa(etapa).toLowerCase()} completo` : `${m.nome || "Alguém"} · ${nomeEtapa(etapa)}`,
          detalhe: m.auto ? `${m.nome || ""}${m.paxReservas ? ` · ${m.paxReservas} pax` : ""}` : `${veiculoDe(d)} · ${Number(d.pax) || 0} pax`,
          em: paraDate(m.em),
        });
      }),
    );
    Object.entries(d.recepcoes || {}).forEach(([k, r]) => {
      if (!r?.em || v.recepcoes?.[k]) return;
      out.push({
        id: `${d.id}|r|${k}`,
        tipo: "reserva",
        quem: r.nome || "",
        texto: `${r.nome || "Alguém"} recebeu ${r.titular || r.codigo || "uma reserva"}`,
        detalhe: `${veiculoDe(d)}${r.pax ? ` · ${r.pax} pax` : ""}`,
        em: paraDate(r.em),
      });
    });
    Object.entries(d.noShow || {}).forEach(([k, n]) => {
      if (!n?.tipo || v.noShow?.[k]?.tipo) return;
      out.push({
        id: `${d.id}|n|${k}`,
        tipo: "noshow",
        quem: n.porNome || "",
        texto: `${nomeNoShow(n.tipo)} · ${n.titular || n.codigo || "reserva"}`,
        detalhe: `${veiculoDe(d)}${n.porNome ? ` · por ${n.porNome}` : ""}`,
        em: paraDate(n.em),
      });
    });
  });
  return out.sort((a, b) => (b.em?.getTime() || 0) - (a.em?.getTime() || 0));
};

/* Conta pax por pessoa e etapa.
   regra "dividir": pax / quantos marcaram a etapa; "total": cada um conta tudo.
   Devolve { pessoas: Map(id → { id, nome, colaboradorId, etapas: {e: {pax, veiculos}} }),
             porEtapa: { e: { pax (com alguém), veiculos } } } */
export const contarAtendimentos = (docs = [], etapas = [], regra = "dividir") => {
  const pessoas = new Map();
  const porEtapa = Object.fromEntries(etapas.map((e) => [e.id, { pax: 0, veiculos: 0 }]));
  docs.forEach((d) => {
    etapas.forEach((e) => {
      const marcas = Object.entries(d.marcas?.[e.id] || {}).filter(([, v]) => v && typeof v === "object");
      if (!marcas.length) return;
      porEtapa[e.id].pax += paxEfetivo(d);
      porEtapa[e.id].veiculos += 1;
      const parte = regra === "total" ? paxEfetivo(d) : paxEfetivo(d) / marcas.length;
      marcas.forEach(([id, m]) => {
        // recepção por reserva: cada um fica com os pax das reservas que recebeu
        const parteDele = typeof m.paxReservas === "number" ? m.paxReservas : parte;
        const chave = m.colaboradorId || id;
        const p = pessoas.get(chave) || { id: chave, nome: m.nome || "Sem nome", colaboradorId: m.colaboradorId || "", etapas: {} };
        const x = p.etapas[e.id] || { pax: 0, veiculos: 0 };
        x.pax += parteDele;
        x.veiculos += 1;
        p.etapas[e.id] = x;
        pessoas.set(chave, p);
      });
    });
  });
  return { pessoas, porEtapa };
};

/* Relatório do atendimento (dia ou período).
   docs: atendimentos do período; equipe: todosDaEquipe(config);
   chegadas (opcional): { [data]: grupos do Phoenix } — cruza o que chegou com
   o que foi marcado (cobertura e pendentes); escalados (opcional): ids de quem
   estava na escala (aparecem mesmo com zero).
   % de cada pessoa = pax dela na etapa ÷ pax com a etapa marcada. */
export const relatorioAtendimento = ({ docs = [], etapas = [], regra = "dividir", equipe = [], chegadas = null, escalados = [] }) => {
  const { pessoas, porEtapa } = contarAtendimentos(docs, etapas, regra);
  const daEquipe = new Map(equipe.map((c) => [c.id, c]));
  escalados.forEach((id) => {
    if (!pessoas.has(id) && daEquipe.has(id)) pessoas.set(id, { id, nome: daEquipe.get(id).nome, colaboradorId: id, etapas: {} });
  });
  const primeira = etapas[0]?.id;
  const linhas = [...pessoas.values()]
    .map((p) => {
      const c = daEquipe.get(p.colaboradorId || p.id);
      const e = Object.fromEntries(
        etapas.map((x) => {
          const v = p.etapas[x.id] || { pax: 0, veiculos: 0 };
          return [x.id, { ...v, pct: porEtapa[x.id]?.pax ? (v.pax / porEtapa[x.id].pax) * 100 : 0 }];
        }),
      );
      return { id: p.id, nome: c?.nome || p.nome, turnoNome: c?.turnoNome || "—", cor: c?.cor || "#94a3b8", foraDaEquipe: !c, etapas: e };
    })
    .sort((a, b) => (b.etapas[primeira]?.pax || 0) - (a.etapas[primeira]?.pax || 0) || a.nome.localeCompare(b.nome, "pt-BR"));

  let phoenix = null;
  let pendentes = [];
  if (chegadas) {
    phoenix = { pax: 0, veiculos: 0, porEtapa: Object.fromEntries(etapas.map((x) => [x.id, 0])) };
    Object.entries(chegadas).forEach(([data, grupos]) => {
      const docsDoDia = docs.filter((d) => d.data === data);
      const mapa = vincularDocs(grupos, docsDoDia, data);
      grupos.forEach((g) => {
        phoenix.pax += g.pax;
        phoenix.veiculos += 1;
        const doc = mapa.get(g.chave)?.doc;
        const marcas = doc?.marcas || {};
        // veículo em que todas as reservas foram no show: nada a marcar
        const todosNoShow = doc && g.reservas.length > 0 && g.reservas.every((r, i) => noShowDaReserva(doc, r, i));
        const faltando = todosNoShow ? [] : etapas.filter((x) => !Object.keys(marcas[x.id] || {}).length);
        etapas.forEach((x) => {
          if (!faltando.includes(x)) phoenix.porEtapa[x.id] += g.pax;
        });
        if (faltando.length) pendentes.push({ ...g, data, faltando: faltando.map((x) => x.nome) });
      });
    });
    pendentes = pendentes.sort((a, b) => a.data.localeCompare(b.data) || a.min - b.min);
  }
  return { linhas, porEtapa, phoenix, pendentes, regra, noShow: resumoNoShow(docs) };
};

// ---------------------------------------------------------------------
// Horários das marcas e tempo de espera (recepção → embarque)
// ---------------------------------------------------------------------
const paraDate = (v) => (v?.toDate ? v.toDate() : v instanceof Date ? v : v ? new Date(v) : null);
export const horaDe = (v) => {
  const d = paraDate(v);
  return d ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
};
// horário vale para a espera? (lançado pelo Operacional sem horário da cartinha = não)
const horarioConfiavel = (m) => !m?.lancado || m?.horaManual === true;

// quem marcou a etapa (o primeiro a marcar vale como o horário da etapa)
export const marcasDaEtapa = (doc, etapaId) =>
  Object.entries(doc?.marcas?.[etapaId] || {})
    .filter(([, v]) => v && typeof v === "object")
    .map(([id, v]) => ({ id, ...v, data: paraDate(v.em) }))
    .sort((a, b) => (a.data?.getTime() || 0) - (b.data?.getTime() || 0));

/* Espera de um veículo: da 1ª marca da primeira etapa (recepção) até a 1ª
   marca da última etapa (embarque). null quando falta uma das duas. */
export const esperaDoDoc = (doc, etapas = []) => {
  if (etapas.length < 2) return null;
  const ini = marcasDaEtapa(doc, etapas[0].id);
  const fim = marcasDaEtapa(doc, etapas[etapas.length - 1].id);
  if (!ini.length || !fim.length) return null;
  const a = ini[0];
  const b = fim[0];
  const confiavel = horarioConfiavel(a) && horarioConfiavel(b) && a.data && b.data;
  const min = confiavel ? Math.round((b.data - a.data) / 60000) : null;
  return { inicio: a, fim: b, min: min !== null && min >= 0 ? min : null, quemInicio: ini, quemFim: fim };
};

export const FAIXAS_ESPERA = [
  { id: "15", nome: "Até 15 min", ate: 15 },
  { id: "30", nome: "15 a 30 min", ate: 30 },
  { id: "60", nome: "30 a 60 min", ate: 60 },
  { id: "mais", nome: "Mais de 1 hora", ate: Infinity },
];

/* Resumo do tempo de espera do período.
   { veiculos: [{ doc, espera }], media, mediana, maior, faixas, semHorario } */
export const resumoEsperas = (docs = [], etapas = []) => {
  const veiculos = docs
    .map((doc) => ({ doc, espera: esperaDoDoc(doc, etapas) }))
    .filter((x) => x.espera);
  const com = veiculos.filter((x) => x.espera.min !== null);
  const mins = com.map((x) => x.espera.min).sort((a, b) => a - b);
  const pax = com.reduce((s, x) => s + (Number(x.doc.pax) || 0), 0);
  return {
    veiculos: veiculos.sort((a, b) => (b.espera.min ?? -1) - (a.espera.min ?? -1)),
    media: mins.length ? mins.reduce((s, m) => s + m, 0) / mins.length : null,
    mediaPax: pax ? com.reduce((s, x) => s + x.espera.min * (Number(x.doc.pax) || 0), 0) / pax : null,
    mediana: mins.length ? mins[Math.floor((mins.length - 1) / 2)] : null,
    maior: com.length ? com.reduce((a, b) => (b.espera.min > a.espera.min ? b : a)) : null,
    faixas: FAIXAS_ESPERA.map((f, i) => ({
      ...f,
      veiculos: mins.filter((m) => m <= f.ate && (i === 0 || m > FAIXAS_ESPERA[i - 1].ate)).length,
    })),
    semHorario: veiculos.length - com.length,
  };
};

export const textoMinutos = (min) => {
  if (min === null || min === undefined) return "—";
  const m = Math.round(min);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
};

// ---------------------------------------------------------------------
// Busca de reserva / passageiro (período ou histórico)
// ---------------------------------------------------------------------
const semAcento = (t = "") =>
  String(t)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/* Procura por código da reserva ou nome do titular.
   docs: atendimentos; chegadas (opcional): { data: grupos do Phoenix } — cobre
   veículos ainda sem marcação e documentos antigos sem a lista de reservas.
   Devolve [{ data, hora, voos, veiculo, motorista, reserva, doc, espera }] */
export const buscarReserva = ({ termo, docs = [], chegadas = null, etapas = [] }) => {
  const t = semAcento(termo);
  if (t.length < 2) return [];
  const bateReserva = (r) => semAcento(`${r.codigo} ${r.titular}`).includes(t);
  // nome do colaborador: traz as reservas dos veículos que ele marcou
  const doColaborador = (doc) =>
    etapas.filter((e) => Object.values(doc?.marcas?.[e.id] || {}).some((m) => m && semAcento(m.nome).includes(t))).map((e) => e.id);
  let docAtual = null;
  const bate = (r) => bateReserva(r) || (docAtual && doColaborador(docAtual).length > 0);
  const achados = [];
  const vistos = new Set();
  const incluir = (data, g, r, doc) => {
    const chave = `${doc?.id || `${data}_${g.chave}`}|${r.codigo || r.titular}`;
    if (vistos.has(chave)) return;
    vistos.add(chave);
    achados.push({
      data,
      hora: g.hora || doc?.hora || "",
      voos: g.voos || doc?.voos || [],
      veiculo: g.veiculo || doc?.veiculo || "",
      motorista: g.motorista || doc?.motorista || "",
      paxVeiculo: g.pax || doc?.pax || 0,
      reserva: r,
      doc: doc || null,
      noShow: doc ? noShowDaReserva(doc, r) : null,
      recepcao: doc ? recepcaoDaReserva(doc, r) : null,
      espera: doc ? esperaDaReserva(doc, r, etapas) : null,
      // etapas em que o colaborador buscado aparece (quando a busca foi por ele)
      etapasDoColaborador: doc && !bateReserva(r) ? doColaborador(doc) : [],
    });
  };
  Object.entries(chegadas || {}).forEach(([data, grupos]) => {
    const mapa = vincularDocs(grupos, docs.filter((d) => d.data === data), data);
    grupos.forEach((g) => {
      docAtual = mapa.get(g.chave)?.doc || null;
      g.reservas.filter(bate).forEach((r) => incluir(data, g, r, docAtual));
    });
  });
  docs.forEach((d) => {
    docAtual = d;
    (Array.isArray(d.reservas) ? d.reservas : []).filter(bate).forEach((r) => incluir(d.data, {}, r, d));
  });
  return achados.sort((a, b) => b.data.localeCompare(a.data) || String(a.hora).localeCompare(String(b.hora)));
};

// ---------------------------------------------------------------------
// Relatório de UM colaborador (período)
// ---------------------------------------------------------------------
/* id: colaboradorId (ou o id da marca). Devolve
   { etapas: { e: { pax, veiculos, pct } }, dias: [{ data, etapas: { e: { pax, veiculos } } }],
     veiculos: [{ doc, etapas: [{ id, pax, em, lancado }], espera }], esperaMedia, totalVeiculos } */
export const relatorioDoColaborador = ({ docs = [], etapas = [], regra = "dividir", id }) => {
  const porEtapa = Object.fromEntries(etapas.map((e) => [e.id, { pax: 0, veiculos: 0 }]));
  const totalEtapa = Object.fromEntries(etapas.map((e) => [e.id, 0]));
  const dias = new Map();
  const veiculos = [];
  docs.forEach((d) => {
    const meu = [];
    etapas.forEach((e) => {
      const marcas = Object.entries(d.marcas?.[e.id] || {}).filter(([, v]) => v && typeof v === "object");
      if (!marcas.length) return;
      totalEtapa[e.id] += paxEfetivo(d);
      const minha = marcas.find(([k, v]) => (v.colaboradorId || k) === id);
      if (!minha) return;
      const pax =
        typeof minha[1].paxReservas === "number" ? minha[1].paxReservas : regra === "total" ? paxEfetivo(d) : paxEfetivo(d) / marcas.length;
      porEtapa[e.id].pax += pax;
      porEtapa[e.id].veiculos += 1;
      const dia = dias.get(d.data) || { data: d.data, etapas: Object.fromEntries(etapas.map((x) => [x.id, { pax: 0, veiculos: 0 }])) };
      dia.etapas[e.id].pax += pax;
      dia.etapas[e.id].veiculos += 1;
      dias.set(d.data, dia);
      meu.push({ id: e.id, pax, em: minha[1].em, lancado: !!minha[1].lancado && !minha[1].horaManual, dividido: marcas.length > 1 });
    });
    if (meu.length) veiculos.push({ doc: d, etapas: meu, espera: esperaDoDoc(d, etapas) });
  });
  const comEspera = veiculos.filter((v) => v.espera?.min !== null && v.espera?.min !== undefined);
  return {
    etapas: Object.fromEntries(etapas.map((e) => [e.id, { ...porEtapa[e.id], pct: totalEtapa[e.id] ? (porEtapa[e.id].pax / totalEtapa[e.id]) * 100 : 0 }])),
    dias: [...dias.values()].sort((a, b) => a.data.localeCompare(b.data)),
    veiculos: veiculos.sort((a, b) => a.doc.data.localeCompare(b.doc.data) || String(a.doc.hora).localeCompare(String(b.doc.hora))),
    esperaMedia: comEspera.length ? comEspera.reduce((s, v) => s + v.espera.min, 0) / comEspera.length : null,
    totalVeiculos: veiculos.length,
    // no shows que esta pessoa informou
    noShows: listaNoShow(docs).filter((n) => n.colaboradorId === id),
  };
};

// ---------------------------------------------------------------------
// RECEPÇÃO POR RESERVA (veículo com mais de uma reserva)
//   recepcoes.{chave da reserva} = { nome, colaboradorId, em, por, lancado,
//   horaManual, codigo, titular, pax }. Quando todas as reservas (menos as
//   de no show) estão recepcionadas, a etapa principal do veículo (a 1ª,
//   "Recepcionou") é marcada sozinha: uma marca por pessoa, com os pax das
//   reservas que ela recebeu (paxReservas) e a hora da última reserva.
// ---------------------------------------------------------------------
const entradasRecepcao = (doc) => Object.entries(doc?.recepcoes || {}).filter(([, v]) => v && typeof v === "object" && v.em);
export const recepcaoDaReserva = (doc, r, i = 0) => {
  if (!doc?.recepcoes) return null;
  const direto = doc.recepcoes[chaveReserva(r, i)];
  if (direto?.em) return direto;
  const achado = entradasRecepcao(doc).find(([, v]) => (r.codigo && v.codigo === r.codigo) || (!r.codigo && v.titular === r.titular));
  return achado ? achado[1] : null;
};
const quando = (v) => (v?.toDate ? v.toDate() : v instanceof Date ? v : v ? new Date(v) : null);

export const marcarRecepcaoReservas = async ({ data, grupo, doc, docId, alvo = [], marcar = true, quem, por, etapaId, lancado = false, horaManual = "" }) => {
  const proprio = idAtendimento(data, grupo.chave);
  const herdado = docId && docId !== proprio;
  const ref = docBase(COL_ATENDIMENTOS, herdado ? docId : proprio);
  const em = horaManual ? Timestamp.fromDate(new Date(`${data}T${horaManual}:00`)) : Timestamp.now();
  // como as recepções ficam depois desta mudança
  const recep = Object.fromEntries(entradasRecepcao(doc));
  const mudancas = {};
  alvo.forEach(({ r, i }) => {
    const k = chaveReserva(r, i);
    if (marcar) {
      if (recep[k]) return;
      recep[k] = {
        nome: quem?.nome || "",
        colaboradorId: quem?.id || "",
        em,
        por: por || "",
        ...(lancado ? { lancado: true, horaManual: !!horaManual } : {}),
        ...resumoReserva(r),
      };
      mudancas[k] = recep[k];
    } else if (recep[k]) {
      delete recep[k];
      mudancas[k] = deleteField();
    }
  });
  // reservas que contam (no show não precisa ser recepcionada)
  const ativas = (grupo.reservas || []).map((r, i) => ({ r, i })).filter(({ r, i }) => !noShowDaReserva(doc, r, i));
  const completo = ativas.length > 0 && ativas.every(({ r, i }) => recep[chaveReserva(r, i)]);
  const novas = {};
  if (completo) {
    const ultima = Object.values(recep).reduce((m, v) => (quando(v.em) > quando(m.em) ? v : m));
    Object.values(recep).forEach((v) => {
      const id = v.colaboradorId || v.nome || "sem_id";
      const atual = novas[id] || { nome: v.nome, colaboradorId: v.colaboradorId, em: ultima.em, por: ultima.por || "", auto: true, paxReservas: 0 };
      atual.paxReservas += Number(v.pax) || 0;
      if (ultima.lancado) Object.assign(atual, { lancado: true, horaManual: !!ultima.horaManual });
      novas[id] = atual;
    });
  }
  const marcasEtapa = {};
  Object.keys(doc?.marcas?.[etapaId] || {}).forEach((k) => {
    if (!novas[k]) marcasEtapa[k] = deleteField();
  });
  Object.assign(marcasEtapa, novas);
  const resumo = herdado
    ? { atualizadoEm: Timestamp.now() }
    : {
      data,
      chave: grupo.chave,
      veiculo: grupo.veiculo || "",
      motorista: grupo.motorista || "",
      voos: grupo.voos || [],
      hora: grupo.hora || "",
      pax: grupo.pax || 0,
      reservas: (grupo.reservas || []).map(resumoReserva),
      atualizadoEm: Timestamp.now(),
    };
  await setDoc(ref, { ...resumo, ...(Object.keys(mudancas).length ? { recepcoes: mudancas } : {}), marcas: { [etapaId]: marcasEtapa } }, { merge: true });
  return completo;
};

// espera de UMA reserva: da recepção dela (ou do veículo) ao embarque do veículo
export const esperaDaReserva = (doc, r, etapas = [], i = 0) => {
  if (etapas.length < 2 || !doc) return null;
  const fim = marcasDaEtapa(doc, etapas[etapas.length - 1].id)[0];
  const rec = recepcaoDaReserva(doc, r, i);
  const ini = rec ? { ...rec, data: quando(rec.em) } : marcasDaEtapa(doc, etapas[0].id)[0];
  if (!ini || !fim) return null;
  const confiavel = (m) => !m?.lancado || m?.horaManual === true;
  const min = confiavel(ini) && confiavel(fim) && ini.data && fim.data ? Math.round((fim.data - ini.data) / 60000) : null;
  return { inicio: ini, fim, min: min !== null && min >= 0 ? min : null, porReserva: !!rec };
};

/* Espera reserva a reserva no período (relatório detalhado).
   { reservas: [{ doc, reserva, espera }], media, mediaPax, mediana, maior, faixas, semHorario } */
export const resumoEsperasPorReserva = (docs = [], etapas = []) => {
  const itens = [];
  docs.forEach((doc) =>
    (Array.isArray(doc.reservas) ? doc.reservas : []).forEach((r, i) => {
      if (noShowDaReserva(doc, r, i)) return;
      const espera = esperaDaReserva(doc, r, etapas, i);
      if (espera) itens.push({ doc, reserva: r, espera });
    }),
  );
  const com = itens.filter((x) => x.espera.min !== null);
  const mins = com.map((x) => x.espera.min).sort((a, b) => a - b);
  const pax = com.reduce((s, x) => s + (Number(x.reserva.pax) || 0), 0);
  return {
    reservas: itens.sort((a, b) => (b.espera.min ?? -1) - (a.espera.min ?? -1)),
    media: mins.length ? mins.reduce((s, m) => s + m, 0) / mins.length : null,
    mediaPax: pax ? com.reduce((s, x) => s + x.espera.min * (Number(x.reserva.pax) || 0), 0) / pax : null,
    mediana: mins.length ? mins[Math.floor((mins.length - 1) / 2)] : null,
    maior: com.length ? com.reduce((a, b) => (b.espera.min > a.espera.min ? b : a)) : null,
    faixas: FAIXAS_ESPERA.map((f, i) => ({ ...f, veiculos: mins.filter((m) => m <= f.ate && (i === 0 || m > FAIXAS_ESPERA[i - 1].ate)).length })),
    semHorario: itens.length - com.length,
  };
};
