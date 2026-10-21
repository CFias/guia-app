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

import { Timestamp, deleteField, getDocs, query, setDoc, where } from "firebase/firestore";
import { colBase, docBase } from "./dadosBase";
import { phoenixReserveService } from "./regiaoAtiva";
import { EXPAND } from "./plannerUtils";
import { extrairListaResposta } from "./plannerApi";
import { paraMinutos } from "./relatorioTurnos";

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
const codigoDo = (i) => texto(i?.reserve?.code || i?.reserve_code || i?.code || i?.reserve?.id);

// chave segura para id de documento
export const chaveSegura = (t = "") =>
  String(t)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w-]+/g, "_")
    .slice(0, 80) || "sem_chave";

/* Chegadas do dia agrupadas por veículo.
   [{ chave, veiculo, motorista, voos[], hora, min, pax,
      reservas: [{ codigo, titular, pax, adt, chd, inf, voo, hotel }] }] */
export const buscarChegadasPorVeiculo = async (data) => {
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
    // com escala do Phoenix: o veículo da escala; sem escala: o voo (aguardando veículo)
    const chave = escala ? `esc_${escala}` : `voo_${voo || "sem_voo"}_${h}`;
    const g = grupos.get(chave) || {
      chave,
      escalaId: escala || null,
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
    g.reservas.push({ codigo: codigoDo(i), titular: titularDo(i), pax, adt: adtDo(i), chd: chdDo(i), inf: infDo(i), voo, hotel: hotelDo(i) });
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

// atendimentos de um dia ou período (por data)
export const listarAtendimentos = async (inicio, fim = inicio) => {
  const snap = await getDocs(query(colBase(COL_ATENDIMENTOS), where("data", ">=", inicio), where("data", "<=", fim)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
      porEtapa[e.id].pax += Number(d.pax) || 0;
      porEtapa[e.id].veiculos += 1;
      const parte = regra === "total" ? Number(d.pax) || 0 : (Number(d.pax) || 0) / marcas.length;
      marcas.forEach(([id, m]) => {
        const chave = m.colaboradorId || id;
        const p = pessoas.get(chave) || { id: chave, nome: m.nome || "Sem nome", colaboradorId: m.colaboradorId || "", etapas: {} };
        const x = p.etapas[e.id] || { pax: 0, veiculos: 0 };
        x.pax += parte;
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
        const marcas = mapa.get(g.chave)?.doc?.marcas || {};
        const faltando = etapas.filter((x) => !Object.keys(marcas[x.id] || {}).length);
        etapas.forEach((x) => {
          if (!faltando.includes(x)) phoenix.porEtapa[x.id] += g.pax;
        });
        if (faltando.length) pendentes.push({ ...g, data, faltando: faltando.map((x) => x.nome) });
      });
    });
    pendentes = pendentes.sort((a, b) => a.data.localeCompare(b.data) || a.min - b.min);
  }
  return { linhas, porEtapa, phoenix, pendentes, regra };
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
      espera: doc ? esperaDoDoc(doc, etapas) : null,
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
      totalEtapa[e.id] += Number(d.pax) || 0;
      const minha = marcas.find(([k, v]) => (v.colaboradorId || k) === id);
      if (!minha) return;
      const pax = regra === "total" ? Number(d.pax) || 0 : (Number(d.pax) || 0) / marcas.length;
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
  };
};
