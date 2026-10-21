// relatorioTurnos.js
//
// Relatório "Demanda por turno" (Custos e relatórios → Recepção por turno):
// busca no Phoenix os serviços de um período — chegadas (IN), saídas (OUT),
// transfers entre hotéis e passeios — e calcula quantas pessoas cada turno
// da equipe atende, em média, além do mapa de calor do período.
//
// Turnos e equipe são CONFIGURÁVEIS (Firestore: settings/turnos_equipe).
// Cada colaborador tem um papel no setor:
//   - "principal": a função dele é aquela (conta para "pessoas por
//     colaborador" do turno);
//   - "sinergia":  presta suporte quando necessário (não divide a conta).
// Um turno só com colaboradores de sinergia vira uma "janela de apoio".
//
// Regras do cálculo:
// - Pessoas = ADT + CHD + INF de cada reserva, sem as reservas com CLD /
//   cancelado / não escalar / dispensado (filtro geral do sistema).
// - Horário: nas chegadas vale o horário do VOO (voo "não informado" usa a
//   apresentação); nos demais serviços, a apresentação (saída do hotel).
// - Uma reserva entra em todos os turnos que estão trabalhando no horário:
//   na sobreposição de dois turnos ela conta para os dois.
// - Turno que passa da meia-noite é contado pelo dia em que COMEÇA (um voo
//   às 02h do dia 15 é do turno da noite do dia 14). A busca pega um dia a
//   mais no fim do período por isso.

import { collection, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";
import { ID_SEDE, ehSede, idPorRegiao, phoenixReserveService, regiaoAtual } from "./regiaoAtiva";
import { db } from "./firebase";
import { EXPAND } from "./plannerUtils";
import { extrairListaResposta } from "./plannerApi";

// ---------------------------------------------------------------------
// Tipos de serviço
// ---------------------------------------------------------------------
export const TIPOS_SERVICO = [
  { id: "in", nome: "Chegadas", curto: "IN", serviceType: "1", grupo: "Voos" },
  { id: "out", nome: "Saídas (OUT)", curto: "OUT", serviceType: "2", grupo: "Voos" },
  { id: "transfer", nome: "Transfers entre hotéis", curto: "Transfer", serviceType: "4", grupo: "Serviços" },
  { id: "passeio", nome: "Passeios", curto: "Passeios", serviceType: "3", grupo: "Serviços" },
];

export const nomeTipo = (id) => TIPOS_SERVICO.find((t) => t.id === id)?.nome || id;

// ---------------------------------------------------------------------
// Configuração de turnos e equipe
// ---------------------------------------------------------------------
export const PAPEIS = [
  { id: "principal", nome: "Função principal", curto: "Principal" },
  { id: "sinergia", nome: "Suporte (sinergia)", curto: "Sinergia" },
];

export const CORES_TURNO = ["#2563eb", "#d97706", "#7c3aed", "#0d9488", "#db2777", "#65a30d"];

export const DIAS_SEMANA_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const DIAS_SEMANA_LONGO = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const TODOS_OS_DIAS = [0, 1, 2, 3, 4, 5, 6];

export const novoId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);

export const CONFIG_PADRAO = {
  turnos: [
    {
      id: "manha",
      nome: "Manhã",
      inicio: "06:20",
      fim: "14:40",
      cor: CORES_TURNO[0],
      colaboradores: [{ id: "edson", nome: "Edson", papel: "principal", dias: [], inicio: "", fim: "", obs: "" }],
    },
    {
      id: "tarde",
      nome: "Tarde",
      inicio: "13:40",
      fim: "22:00",
      cor: CORES_TURNO[1],
      colaboradores: [
        { id: "emerson", nome: "Emerson", papel: "principal", dias: [], inicio: "", fim: "", obs: "" },
        { id: "ariana", nome: "Ariana", papel: "principal", dias: [2, 3, 4, 5], inicio: "13:00", fim: "17:00", obs: "Jovem Aprendiz" },
      ],
    },
    {
      id: "noite",
      nome: "Noite",
      inicio: "22:00",
      fim: "06:20",
      cor: CORES_TURNO[2],
      colaboradores: [{ id: "ingra", nome: "Ingra", papel: "principal", dias: [], inicio: "", fim: "", obs: "" }],
    },
    {
      id: "suporte",
      nome: "Suporte operacional",
      inicio: "09:00",
      fim: "17:00",
      cor: CORES_TURNO[3],
      colaboradores: [
        { id: "nathalia", nome: "Nathalia", papel: "sinergia", dias: [], inicio: "", fim: "", obs: "Sempre que necessário" },
        { id: "luanaf", nome: "Luana Fabiana", papel: "sinergia", dias: [], inicio: "", fim: "", obs: "Sempre que necessário" },
        { id: "tharcisio", nome: "Tharcisio", papel: "sinergia", dias: [], inicio: "", fim: "", obs: "Sempre que necessário" },
      ],
    },
  ],
  folguistas: [{ id: "luanap", nome: "Luana Pereira", obs: "" }],
};

const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const horaValida = (h) => HORA_RE.test(String(h || ""));

// Deixa a configuração lida do Firestore sempre no formato esperado.
export const normalizarConfig = (bruto) => {
  const base = bruto && Array.isArray(bruto.turnos) ? bruto : CONFIG_PADRAO;
  return {
    turnos: base.turnos
      .filter((t) => t && horaValida(t.inicio) && horaValida(t.fim))
      .map((t, i) => ({
        id: String(t.id || novoId()),
        nome: String(t.nome || `Turno ${i + 1}`).trim(),
        inicio: t.inicio,
        fim: t.fim,
        cor: t.cor || CORES_TURNO[i % CORES_TURNO.length],
        colaboradores: (Array.isArray(t.colaboradores) ? t.colaboradores : [])
          .filter((c) => c && String(c.nome || "").trim())
          .map((c) => ({
            id: String(c.id || novoId()),
            nome: String(c.nome).trim(),
            papel: c.papel === "sinergia" ? "sinergia" : "principal",
            dias: Array.isArray(c.dias) ? c.dias.map(Number).filter((d) => d >= 0 && d <= 6) : [],
            inicio: horaValida(c.inicio) ? c.inicio : "",
            fim: horaValida(c.fim) ? c.fim : "",
            obs: String(c.obs || "").trim(),
            escala: normalizarEscala(c.escala),
            // função no setor (lista criada em Turnos e equipe) e a conta de
            // Atendimento ligada a esta pessoa (uid), quando houver
            funcao: String(c.funcao || ""),
            contaUid: String(c.contaUid || ""),
          })),
      })),
    folguistas: (Array.isArray(base.folguistas) ? base.folguistas : [])
      .filter((f) => f && String(f.nome || "").trim())
      .map((f) => ({ id: String(f.id || novoId()), nome: String(f.nome).trim(), obs: String(f.obs || "").trim() })),
    atendimento: normalizarAtendimento(base.atendimento),
    funcoes: normalizarFuncoes(base.funcoes),
  };
};

// Funções do setor (criadas pela equipe em Turnos e equipe)
export const FUNCOES_PADRAO = [
  { id: "recepcao", nome: "Recepção" },
  { id: "embarque", nome: "Embarque" },
  { id: "recepcao_embarque", nome: "Recepção e embarque" },
];
export const normalizarFuncoes = (lista) => {
  const l = (Array.isArray(lista) ? lista : FUNCOES_PADRAO)
    .map((f) => ({ id: String(f?.id || "").replace(/[^\w-]/g, "").slice(0, 30), nome: String(f?.nome || "").trim().slice(0, 40) }))
    .filter((f) => f.id && f.nome);
  return Array.isArray(lista) ? l : FUNCOES_PADRAO;
};
export const nomeDaFuncao = (config, id) => config?.funcoes?.find((f) => f.id === id)?.nome || "";

// ---------------------------------------------------------------------
// MODELOS DE ESCALA (por colaborador)
//   semanal   → trabalha nos dias da semana marcados (c.dias; vazio = todos)
//   ciclo     → trabalha N dias e folga M, a partir de um dia em que trabalha
//               (12x36 = 1/1 · plantão 24x48 = 1/2 · 2x2 = 2/2 · personalizado)
// Folguistas não têm dia fixo: entram pela grade da semana ("cobre").
// Folgas, trocas e coberturas do dia a dia ficam nas EXCEÇÕES
// (settings/turnos_excecoes[__base]) e valem por cima do modelo.
// ---------------------------------------------------------------------
export const MODELOS_ESCALA = [
  { id: "semanal", nome: "Dias da semana (folga fixa)", trabalha: 0, folga: 0 },
  { id: "12x36", nome: "12x36 (dia sim, dia não)", trabalha: 1, folga: 1 },
  { id: "24x48", nome: "Plantão 24x48", trabalha: 1, folga: 2 },
  { id: "2x2", nome: "2x2 (2 dias sim, 2 não)", trabalha: 2, folga: 2 },
  { id: "ciclo", nome: "Ciclo personalizado", trabalha: 0, folga: 0 },
];
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const inteiroEntre = (v, min, max, padrao) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : padrao;
};
export const normalizarEscala = (e = {}) => {
  const modelo = MODELOS_ESCALA.some((m) => m.id === e?.modelo) ? e.modelo : "semanal";
  const preset = MODELOS_ESCALA.find((m) => m.id === modelo);
  return {
    modelo,
    trabalha: modelo === "ciclo" ? inteiroEntre(e?.trabalha, 1, 14, 1) : preset.trabalha,
    folga: modelo === "ciclo" ? inteiroEntre(e?.folga, 1, 14, 1) : preset.folga,
    referencia: ISO_RE.test(String(e?.referencia || "")) ? e.referencia : "",
  };
};

// ---------------------------------------------------------------------
// ATENDIMENTO NO AEROPORTO (painel do colaborador)
//   etapas: o que cada colaborador marca por veículo (padrão: recepcionou
//           e embarcou — o verso da "cartinha")
//   contagem: "dividir" (2 pessoas na mesma etapa dividem os pax do veículo)
//             ou "total" (cada uma conta o veículo inteiro, como na cartinha)
// ---------------------------------------------------------------------
export const ETAPAS_PADRAO = [
  { id: "recepcao", nome: "Recepcionou", acao: "Recepcionei" },
  { id: "embarque", nome: "Embarcou", acao: "Embarquei" },
];
export const normalizarAtendimento = (a = {}) => {
  const etapas = (Array.isArray(a?.etapas) ? a.etapas : ETAPAS_PADRAO)
    .map((x, i) => ({
      id: String(x?.id || `etapa${i + 1}`).replace(/[^\w-]/g, "").slice(0, 24) || `etapa${i + 1}`,
      nome: String(x?.nome || "").trim().slice(0, 30),
      acao: String(x?.acao || x?.nome || "").trim().slice(0, 30),
    }))
    .filter((x) => x.nome);
  return {
    ativo: a?.ativo !== false,
    etapas: etapas.length ? etapas : ETAPAS_PADRAO,
    contagem: a?.contagem === "total" ? "total" : "dividir",
    // marcar só dentro do próprio turno (fora dele, o painel avisa e pede confirmação)
    avisarForaDoTurno: a?.avisarForaDoTurno !== false,
  };
};

// Problemas que impedem salvar (texto para mostrar na tela).
export const validarConfig = (config) => {
  const erros = [];
  if (!config.turnos.length) erros.push("Cadastre pelo menos um turno.");
  if (config.atendimento && !config.atendimento.etapas.some((e) => e.nome.trim())) erros.push("Atendimento: informe pelo menos uma etapa.");
  config.turnos.forEach((t, i) => {
    const nome = t.nome?.trim() || `Turno ${i + 1}`;
    if (!t.nome?.trim()) erros.push(`O turno ${i + 1} está sem nome.`);
    if (!horaValida(t.inicio) || !horaValida(t.fim)) erros.push(`${nome}: horário inválido.`);
    else if (t.inicio === t.fim) erros.push(`${nome}: início e fim iguais.`);
    t.colaboradores.forEach((c) => {
      if (!c.nome?.trim()) erros.push(`${nome}: tem colaborador sem nome.`);
      if ((c.inicio || c.fim) && !(horaValida(c.inicio) && horaValida(c.fim))) {
        erros.push(`${nome}: horário próprio de ${c.nome || "colaborador"} incompleto.`);
      }
      if (c.escala && c.escala.modelo !== "semanal" && !c.escala.referencia) {
        erros.push(`${nome}: informe um dia em que ${c.nome || "o colaborador"} trabalha (escala ${c.escala.modelo}).`);
      }
    });
  });
  return erros;
};

// Cada base tem a sua equipe: Salvador em settings/turnos_equipe, as outras
// em settings/turnos_equipe__<id> (regiaoAtiva.js → idPorRegiao).
const REF_CONFIG = (r) => doc(db, "settings", r ? idPorRegiao("turnos_equipe", r) : idPorRegiao("turnos_equipe"));

// Base nova começa com os mesmos horários, sem ninguém na equipe.
export const configPadraoDaRegiao = () =>
  ehSede()
    ? CONFIG_PADRAO
    : { turnos: CONFIG_PADRAO.turnos.map((t) => ({ ...t, colaboradores: [] })), folguistas: [] };

// r (opcional): outra base — ex.: a gerência criando conta de Atendimento
export const carregarConfigTurnos = async (r) => {
  const snap = await getDoc(REF_CONFIG(r));
  return normalizarConfig(snap.exists() ? snap.data() : configPadraoDaRegiao());
};

export const salvarConfigTurnos = async (config) => {
  const limpo = normalizarConfig(config);
  await setDoc(REF_CONFIG(), { ...limpo, updatedAt: new Date() });
  return limpo;
};

// ---------------------------------------------------------------------
// Datas e horas
// ---------------------------------------------------------------------
export const isoLocal = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const paraData = (iso) => {
  const [a, m, d] = String(iso).split("-").map(Number);
  return new Date(a, (m || 1) - 1, d || 1, 12);
};

export const somarDias = (iso, n) => {
  const d = paraData(iso);
  d.setDate(d.getDate() + n);
  return isoLocal(d);
};

export const listarDatas = (inicio, fim) => {
  if (!inicio || !fim || inicio > fim) return [];
  const datas = [];
  let atual = inicio;
  while (atual <= fim && datas.length < 400) {
    datas.push(atual);
    atual = somarDias(atual, 1);
  }
  return datas;
};

export const diaDaSemana = (iso) => paraData(iso).getDay();

export const dataBr = (iso = "") => {
  const [a, m, d] = String(iso).split("-");
  return a ? `${d}/${m}/${a}` : "";
};

export const dataCurta = (iso = "") => dataBr(iso).slice(0, 5);

export const paraMinutos = (hhmm) => {
  const m = String(hhmm || "").match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export const horaTexto = (hhmm) => String(hhmm || "").replace(":", "h");

// dentro da janela [inicio, fim) — se fim < inicio, a janela passa da meia-noite
export const dentro = (min, inicio, fim) => {
  const a = paraMinutos(inicio);
  const b = paraMinutos(fim);
  if (a === null || b === null) return false;
  return a <= b ? min >= a && min < b : min >= a || min < b;
};

export const duracaoMin = (inicio, fim) => {
  const a = paraMinutos(inicio);
  const b = paraMinutos(fim);
  return b > a ? b - a : 24 * 60 - a + b;
};

// "seg a sex" (dias da semana) ou o nome do modelo (12x36, 2x2…)
export const textoEscala = (c = {}) => {
  const m = c.escala?.modelo;
  if (!m || m === "semanal") return textoDias(c.dias || []);
  if (m === "ciclo") return `${c.escala.trabalha}x${c.escala.folga} (ciclo)`;
  return m === "24x48" ? "plantão 24x48" : m;
};

export const textoDias = (dias = []) => {
  if (!dias.length || dias.length === 7) return "todos os dias";
  const seq = [...dias].sort((a, b) => a - b);
  const consecutivo = seq.every((d, i) => i === 0 || d === seq[i - 1] + 1);
  const curto = seq.map((d) => DIAS_SEMANA_CURTO[d].toLowerCase());
  return consecutivo && seq.length > 2 ? `${curto[0]} a ${curto[curto.length - 1]}` : curto.join(", ");
};

export const num = (v, casas = 1) =>
  Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: casas });

// ---------------------------------------------------------------------
// Leitura dos serviços do Phoenix
// ---------------------------------------------------------------------
const hora = (valor) => {
  const str = String(valor || "").trim();
  if (!str) return "";
  if (str.includes("T")) return str.slice(11, 16);
  const m = str.match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : "";
};

const horaDoVooInformada = (item) => {
  const h = hora(
    item?.fly_hour ||
    item?.reserve?.flight_time ||
    item?.reserve?.flight?.scheduled_time ||
    item?.reserve?.arrival_flight_time ||
    item?.flight_time ||
    item?.flight?.scheduled_time,
  );
  return h && h !== "00:00" ? h : "";
};

const horaApresentacao = (item) =>
  hora(item?.presentation_hour || item?.presentation_hour_end || item?.schedule?.presentation_hour || "");

const numeroVoo = (item) =>
  String(
    item?.schedule?.name ||
    item?.reserve?.flight_code ||
    item?.reserve?.flight?.code ||
    item?.reserve?.arrival_flight_code ||
    item?.flight_code ||
    item?.flight?.code ||
    "",
  )
    .trim()
    .toUpperCase();

const nomeServico = (item) =>
  String(item?.service?.name || item?.service_name || item?.serviceName || item?.name || "Serviço")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

const paxDoItem = (item) =>
  Number(item?.is_adult_count || 0) + Number(item?.is_child_count || 0) + Number(item?.is_baby_count || item?.is_infant_count || 0);

export const lerRegistro = (item, dataExecucao, tipo) => {
  const horaVoo = tipo === "in" ? horaDoVooInformada(item) : "";
  const h = horaVoo || horaApresentacao(item);
  const min = paraMinutos(h);
  if (min === null) return null;
  const servico = nomeServico(item);
  const voo = tipo === "in" || tipo === "out" ? numeroVoo(item) : "";
  return {
    tipo,
    data: dataExecucao,
    hora: h,
    min,
    pelaApresentacao: tipo === "in" && !horaVoo,
    pax: paxDoItem(item),
    servico,
    voo,
    // agrupamento: voo (IN/OUT) ou serviço + horário
    grupo: voo || `${servico} ${h}`,
    reserva: String(item?.reserve?.code || item?.reserve?.id || item?.id || ""),
  };
};

const urlServico = (data, serviceType) => {
  const p = new URLSearchParams();
  p.append("execution_date", data);
  p.append("expand", EXPAND);
  p.append("service_type[]", serviceType);
  return `${phoenixReserveService()}?${p.toString()}`;
};

// Busca os tipos escolhidos em todas as datas (+1 dia no fim).
export const buscarServicosPeriodo = async (inicio, fim, tipos, onProgresso, paralelo = 4) => {
  const datas = listarDatas(inicio, somarDias(fim, 1));
  const tarefas = datas.flatMap((data) => tipos.map((tipo) => ({ data, tipo })));
  const registros = [];
  const falhas = new Set();
  let erros = 0;
  let feitas = 0;
  let proxima = 0;

  const trabalhar = async () => {
    while (proxima < tarefas.length) {
      const { data, tipo } = tarefas[proxima];
      proxima += 1;
      const st = TIPOS_SERVICO.find((t) => t.id === tipo)?.serviceType;
      try {
        const r = await fetch(urlServico(data, st), { headers: { Accept: "application/json" } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        extrairListaResposta(await r.json()).forEach((item) => {
          const reg = lerRegistro(item, data, tipo);
          if (reg && reg.pax > 0) registros.push(reg);
        });
      } catch (err) {
        console.error(`Erro ao buscar ${tipo} de ${data}:`, err);
        falhas.add(data);
        erros += 1;
      }
      feitas += 1;
      onProgresso?.(feitas, tarefas.length);
    }
  };

  await Promise.all(Array.from({ length: Math.min(paralelo, tarefas.length) }, trabalhar));
  if (tarefas.length && erros === tarefas.length) {
    throw new Error("O Phoenix não respondeu em nenhuma data.");
  }
  return { registros, falhas: [...falhas].sort() };
};

// ---------------------------------------------------------------------
// Cálculo
// ---------------------------------------------------------------------
const passaMeiaNoite = (t) => paraMinutos(t.fim) < paraMinutos(t.inicio);

// Dia em que começa o turno (ou a janela) que atendeu o registro
const diaDoTurno = (reg, janela) =>
  passaMeiaNoite(janela) && reg.min < paraMinutos(janela.fim) ? somarDias(reg.data, -1) : reg.data;

const media = (n, d) => (d ? n / d : 0);

export const ehApoio = (turno) => !turno.colaboradores.some((c) => c.papel === "principal");

// janela de trabalho de um colaborador (a dele ou a do turno)
export const janelaDo = (c, turno) => (c.inicio && c.fim ? { inicio: c.inicio, fim: c.fim } : { inicio: turno.inicio, fim: turno.fim });

// diferença em dias entre duas datas ISO
const diasEntre = (a, b) => Math.round((paraData(b) - paraData(a)) / 86400000);

// pelo MODELO de escala (sem exceções)
export const trabalhaPeloModelo = (c, data) => {
  const e = c?.escala || { modelo: "semanal" };
  if (e.modelo === "semanal") return !c.dias?.length || c.dias.includes(diaDaSemana(data));
  if (!e.referencia) return false;
  const ciclo = e.trabalha + e.folga;
  const pos = ((diasEntre(e.referencia, data) % ciclo) + ciclo) % ciclo;
  return pos < e.trabalha;
};

// exceção do dia para o colaborador: { tipo: "folga" } | { tipo: "trabalha" } | { tipo: "cobre", turnoId }
const excecaoDe = (excecoes, data, id) => excecoes?.dias?.[data]?.[id] || null;

// trabalha neste dia? (modelo + exceção)
export const trabalhaNaData = (c, data, excecoes) => {
  const x = excecaoDe(excecoes, data, c.id);
  if (x?.tipo === "folga") return false;
  if (x?.tipo === "trabalha") return true;
  // cobrindo outro turno: neste dia está lá (escalaDoDia põe no turno coberto)
  if (x?.tipo === "cobre") return false;
  return trabalhaPeloModelo(c, data);
};

/* Escala de um dia: quem trabalha em cada turno (com folguistas cobrindo).
   [{ turno, pessoas: [{ id, nome, papel, janela, cobrindo, folguista }] }] */
export const escalaDoDia = (config, excecoes, data) =>
  config.turnos.map((t) => {
    const pessoas = t.colaboradores
      .filter((c) => trabalhaNaData(c, data, excecoes))
      .map((c) => ({ id: c.id, nome: c.nome, papel: c.papel, janela: janelaDo(c, t), cobrindo: "", folguista: false }));
    (config.folguistas || []).forEach((f) => {
      const x = excecaoDe(excecoes, data, f.id);
      if (x?.tipo === "cobre" && x.turnoId === t.id) {
        pessoas.push({ id: f.id, nome: f.nome, papel: "principal", janela: { inicio: t.inicio, fim: t.fim }, cobrindo: x.cobrindo || "", folguista: true });
      }
    });
    // colaborador de outro turno cobrindo este (troca de turno)
    config.turnos.forEach((outro) =>
      outro.colaboradores.forEach((c) => {
        const x = excecaoDe(excecoes, data, c.id);
        if (outro.id !== t.id && x?.tipo === "cobre" && x.turnoId === t.id) {
          pessoas.push({ id: c.id, nome: c.nome, papel: c.papel, janela: { inicio: t.inicio, fim: t.fim }, cobrindo: x.cobrindo || "", folguista: false });
        }
      }),
    );
    return { turno: t, pessoas };
  });

// todos (colaboradores + folguistas), para listas e contas de atendimento
export const todosDaEquipe = (config) => [
  ...config.turnos.flatMap((t) =>
    t.colaboradores.map((c) => ({ ...c, turnoId: t.id, turnoNome: t.nome, cor: t.cor, folguista: false, funcaoNome: nomeDaFuncao(config, c.funcao) })),
  ),
  ...(config.folguistas || []).map((f) => ({ ...f, papel: "principal", turnoId: "", turnoNome: "Folguista", cor: "#64748b", folguista: true })),
];

// ---------- exceções da escala (folgas, trocas, coberturas) ----------
const REF_EXCECOES = () => doc(db, "settings", idPorRegiao("turnos_excecoes"));
export const carregarExcecoes = async () => {
  const snap = await getDoc(REF_EXCECOES());
  const d = snap.exists() ? snap.data() : {};
  return { dias: d?.dias && typeof d.dias === "object" ? d.dias : {} };
};
// guarda só os últimos 120 dias e os futuros
export const salvarExcecoes = async (excecoes) => {
  const limite = somarDias(isoLocal(new Date()), -120);
  const dias = Object.fromEntries(
    Object.entries(excecoes?.dias || {})
      .filter(([d, v]) => d >= limite && v && Object.keys(v).length)
      .map(([d, v]) => [d, v]),
  );
  await setDoc(REF_EXCECOES(), { dias, updatedAt: new Date() });
  return { dias };
};

export const calcularRelatorio = ({ registros = [], inicio, fim, config, excecoes = null }) => {
  const turnos = config.turnos;
  const dias = listarDatas(inicio, fim);
  const noPeriodo = new Set(dias);
  const nDias = dias.length;
  const vazio = () => ({ pax: 0, reservas: 0, grupos: new Set() });

  const porTurnoDia = Object.fromEntries(turnos.map((t) => [t.id, Object.fromEntries(dias.map((d) => [d, vazio()]))]));
  const porDia = Object.fromEntries(
    dias.map((d) => [d, { pax: 0, reservas: 0, porTipo: {}, porHora: Array(24).fill(0), porTurno: {}, registros: [] }]),
  );
  const porHora = Array(24).fill(0);
  const semanaHora = Array.from({ length: 7 }, () => Array(24).fill(0));
  const porTipo = {};
  const colabs = [];
  turnos.forEach((t) =>
    t.colaboradores.forEach((c) => colabs.push({ c, t, janela: janelaDo(c, t), pax: 0 })),
  );
  let troca = 0;
  let pelaApresentacao = 0;
  let totalPax = 0;
  let totalReservas = 0;

  registros.forEach((reg) => {
    const doDia = noPeriodo.has(reg.data);
    if (doDia) {
      const d = porDia[reg.data];
      d.pax += reg.pax;
      d.reservas += 1;
      d.porTipo[reg.tipo] = (d.porTipo[reg.tipo] || 0) + reg.pax;
      d.porHora[Math.floor(reg.min / 60)] += reg.pax;
      d.registros.push(reg);
      porHora[Math.floor(reg.min / 60)] += reg.pax;
      semanaHora[diaDaSemana(reg.data)][Math.floor(reg.min / 60)] += reg.pax;
      porTipo[reg.tipo] = porTipo[reg.tipo] || { pax: 0, reservas: 0 };
      porTipo[reg.tipo].pax += reg.pax;
      porTipo[reg.tipo].reservas += 1;
      totalPax += reg.pax;
      totalReservas += 1;
      if (reg.pelaApresentacao) pelaApresentacao += 1;
    }

    let principais = 0;
    turnos.forEach((t) => {
      if (!dentro(reg.min, t.inicio, t.fim)) return;
      const dia = diaDoTurno(reg, t);
      if (!noPeriodo.has(dia)) return;
      const acc = porTurnoDia[t.id][dia];
      acc.pax += reg.pax;
      acc.reservas += 1;
      acc.grupos.add(`${reg.data}|${reg.tipo}|${reg.grupo}`);
      porDia[dia].porTurno[t.id] = (porDia[dia].porTurno[t.id] || 0) + reg.pax;
      if (!ehApoio(t)) principais += 1;
    });
    if (principais > 1 && doDia) troca += reg.pax;

    colabs.forEach((x) => {
      if (!dentro(reg.min, x.janela.inicio, x.janela.fim)) return;
      const dia = diaDoTurno(reg, x.janela);
      if (!noPeriodo.has(dia) || !trabalhaNaData(x.c, dia, excecoes)) return;
      x.pax += reg.pax;
    });
  });

  // quantas vezes cada dia da semana aparece no período
  const ocorrencias = Array(7).fill(0);
  dias.forEach((d) => (ocorrencias[diaDaSemana(d)] += 1));

  const resumoTurnos = turnos.map((t) => {
    const serie = dias.map((d) => {
      const a = porTurnoDia[t.id][d];
      const principaisNoDia = t.colaboradores.filter((c) => c.papel === "principal" && trabalhaNaData(c, d, excecoes)).length;
      return { data: d, pax: a.pax, reservas: a.reservas, grupos: a.grupos.size, principais: principaisNoDia };
    });
    const soma = serie.reduce((acc, s) => ({ pax: acc.pax + s.pax, reservas: acc.reservas + s.reservas, grupos: acc.grupos + s.grupos }), {
      pax: 0,
      reservas: 0,
      grupos: 0,
    });
    const ordenada = [...serie].sort((a, b) => b.pax - a.pax);
    const horas = duracaoMin(t.inicio, t.fim) / 60;
    const semana = Array.from({ length: 7 }, () => ({ pax: 0, n: 0 }));
    serie.forEach((s) => {
      const w = diaDaSemana(s.data);
      semana[w].pax += s.pax;
      semana[w].n += 1;
    });
    const comPrincipal = serie.filter((s) => s.principais > 0);
    return {
      ...t,
      apoio: ehApoio(t),
      principais: t.colaboradores.filter((c) => c.papel === "principal"),
      sinergia: t.colaboradores.filter((c) => c.papel === "sinergia"),
      totalPax: soma.pax,
      mediaPax: media(soma.pax, nDias),
      mediaReservas: media(soma.reservas, nDias),
      mediaGrupos: media(soma.grupos, nDias),
      paxPorHora: media(media(soma.pax, nDias), horas),
      porPrincipal: comPrincipal.length ? comPrincipal.reduce((a, s) => a + s.pax / s.principais, 0) / comPrincipal.length : null,
      horas,
      maior: ordenada[0] || null,
      menor: ordenada[ordenada.length - 1] || null,
      semana: semana.map((s) => (s.n ? s.pax / s.n : null)),
      serie,
    };
  });

  const colaboradores = colabs.map((x) => {
    const diasTrab = dias.filter((d) => trabalhaNaData(x.c, d, excecoes)).length;
    return {
      id: x.c.id,
      nome: x.c.nome,
      papel: x.c.papel,
      obs: x.c.obs,
      turnoId: x.t.id,
      turnoNome: x.t.nome,
      cor: x.t.cor,
      janela: x.janela,
      dias: x.c.dias,
      escala: x.c.escala,
      diasNoPeriodo: diasTrab,
      totalPax: x.pax,
      mediaPax: media(x.pax, diasTrab),
    };
  });

  const calendario = dias.map((d) => ({ data: d, ...porDia[d] }));

  return {
    inicio,
    fim,
    dias,
    nDias,
    totalPax,
    totalReservas,
    mediaPaxDia: media(totalPax, nDias),
    pelaApresentacao,
    porTipo,
    turnos: resumoTurnos,
    colaboradores,
    folguistas: config.folguistas,
    troca: { pax: troca, mediaPax: media(troca, nDias) },
    porHora: porHora.map((p) => media(p, nDias)),
    semanaHora: semanaHora.map((linha, w) => linha.map((p) => (ocorrencias[w] ? p / ocorrencias[w] : null))),
    calendario,
  };
};

// Detalhe de um dia (para o painel lateral do mapa de calor)
export const detalharDia = (relatorio, data) => {
  const dia = relatorio.calendario.find((d) => d.data === data);
  if (!dia) return null;
  const agrupar = (chave) => {
    const m = new Map();
    dia.registros.forEach((r) => {
      const k = chave(r);
      if (!k) return;
      const a = m.get(k) || { nome: k, pax: 0, reservas: 0, tipo: r.tipo, hora: r.hora };
      a.pax += r.pax;
      a.reservas += 1;
      if (r.hora < a.hora) a.hora = r.hora;
      m.set(k, a);
    });
    return [...m.values()].sort((a, b) => b.pax - a.pax);
  };
  return {
    ...dia,
    servicos: agrupar((r) => r.servico),
    voos: agrupar((r) => (r.voo ? `${r.voo}` : "")),
    turnos: relatorio.turnos.map((t) => ({ id: t.id, nome: t.nome, cor: t.cor, inicio: t.inicio, fim: t.fim, pax: dia.porTurno[t.id] || 0 })),
  };
};

// ---------- contas de Atendimento (para montar a equipe) ----------
// A conta é criada em Usuários sem vínculo; aqui (Turnos e equipe) a pessoa
// ganha função, turno e folga fixa. Lê só contas de nível "atendimento" da base.
export const carregarContasAtendimento = async () => {
  const filtros = [where("role", "==", "atendimento")];
  if (!ehSede()) filtros.push(where("regiao", "==", regiaoAtual().id));
  const snap = await getDocs(query(collection(db, "users"), ...filtros));
  return snap.docs
    .map((d) => ({ uid: d.id, ...d.data() }))
    .filter((u) => u.ativo !== false && (!ehSede() || !u.regiao || u.regiao === ID_SEDE))
    .sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
};
