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

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import {
  ID_SEDE,
  ehSede,
  idPorRegiao,
  phoenixReserveService,
  regiaoAtual,
} from "./regiaoAtiva";
import { db } from "./firebase";
import { EXPAND } from "./plannerUtils";
import { extrairListaResposta } from "./plannerApi";

// ---------------------------------------------------------------------
// Tipos de serviço
// ---------------------------------------------------------------------
export const TIPOS_SERVICO = [
  { id: "in", nome: "Chegadas", curto: "IN", serviceType: "1", grupo: "Voos" },
  {
    id: "out",
    nome: "Saídas (OUT)",
    curto: "OUT",
    serviceType: "2",
    grupo: "Voos",
  },
  {
    id: "transfer",
    nome: "Transfers entre hotéis",
    curto: "Transfer",
    serviceType: "4",
    grupo: "Serviços",
  },
  {
    id: "passeio",
    nome: "Passeios",
    curto: "Passeios",
    serviceType: "3",
    grupo: "Serviços",
  },
];

export const nomeTipo = (id) =>
  TIPOS_SERVICO.find((t) => t.id === id)?.nome || id;

// ---------------------------------------------------------------------
// Configuração de turnos e equipe
// ---------------------------------------------------------------------
export const PAPEIS = [
  { id: "principal", nome: "Função principal", curto: "Principal" },
  { id: "sinergia", nome: "Suporte (sinergia)", curto: "Sinergia" },
];

export const CORES_TURNO = [
  "#2563eb",
  "#d97706",
  "#7c3aed",
  "#0d9488",
  "#db2777",
  "#65a30d",
];

export const DIAS_SEMANA_CURTO = [
  "Dom",
  "Seg",
  "Ter",
  "Qua",
  "Qui",
  "Sex",
  "Sáb",
];
export const DIAS_SEMANA_LONGO = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];
export const TODOS_OS_DIAS = [0, 1, 2, 3, 4, 5, 6];

export const novoId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);

export const CONFIG_PADRAO = {
  turnos: [
    {
      id: "manha",
      nome: "Manhã",
      inicio: "06:20",
      fim: "14:40",
      cor: CORES_TURNO[0],
      colaboradores: [
        {
          id: "edson",
          nome: "Edson",
          papel: "principal",
          dias: [],
          inicio: "",
          fim: "",
          obs: "",
        },
      ],
    },
    {
      id: "tarde",
      nome: "Tarde",
      inicio: "13:40",
      fim: "22:00",
      cor: CORES_TURNO[1],
      colaboradores: [
        {
          id: "emerson",
          nome: "Emerson",
          papel: "principal",
          dias: [],
          inicio: "",
          fim: "",
          obs: "",
        },
        {
          id: "ariana",
          nome: "Ariana",
          papel: "principal",
          dias: [2, 3, 4, 5],
          inicio: "13:00",
          fim: "17:00",
          obs: "Jovem Aprendiz",
        },
      ],
    },
    {
      id: "noite",
      nome: "Noite",
      inicio: "22:00",
      fim: "06:20",
      cor: CORES_TURNO[2],
      colaboradores: [
        {
          id: "ingra",
          nome: "Ingra",
          papel: "principal",
          dias: [],
          inicio: "",
          fim: "",
          obs: "",
        },
      ],
    },
    {
      id: "suporte",
      nome: "Suporte operacional",
      inicio: "09:00",
      fim: "17:00",
      cor: CORES_TURNO[3],
      colaboradores: [
        {
          id: "nathalia",
          nome: "Nathalia",
          papel: "sinergia",
          dias: [],
          inicio: "",
          fim: "",
          obs: "Sempre que necessário",
        },
        {
          id: "luanaf",
          nome: "Luana Fabiana",
          papel: "sinergia",
          dias: [],
          inicio: "",
          fim: "",
          obs: "Sempre que necessário",
        },
        {
          id: "tharcisio",
          nome: "Tharcisio",
          papel: "sinergia",
          dias: [],
          inicio: "",
          fim: "",
          obs: "Sempre que necessário",
        },
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
  return aplicarFimDeSemana({
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
            dias: Array.isArray(c.dias)
              ? c.dias.map(Number).filter((d) => d >= 0 && d <= 6)
              : [],
            inicio: horaValida(c.inicio) ? c.inicio : "",
            fim: horaValida(c.fim) ? c.fim : "",
            obs: String(c.obs || "").trim(),
            escala: normalizarEscala(c.escala),
            // função no setor (lista criada em Turnos e equipe) e a conta de
            // Atendimento ligada a esta pessoa (uid), quando houver
            funcao: String(c.funcao || ""),
            contaUid: String(c.contaUid || ""),
            // domingo de folga do mês: 1º a 4º, 5 = último (0 = nenhum)
            domingoFolga: [0, 1, 2, 3, 4, 5].includes(Number(c.domingoFolga))
              ? Number(c.domingoFolga)
              : 0,
            // horário próprio no sábado e no domingo (ex.: liderança)
            horarioFds:
              horaValida(c.horarioFds?.inicio) && horaValida(c.horarioFds?.fim)
                ? { inicio: c.horarioFds.inicio, fim: c.horarioFds.fim }
                : null,
          })),
      })),
    folguistas: (Array.isArray(base.folguistas) ? base.folguistas : [])
      .filter((f) => f && String(f.nome || "").trim())
      .map((f) => ({
        id: String(f.id || novoId()),
        nome: String(f.nome).trim(),
        obs: String(f.obs || "").trim(),
        funcao: String(f.funcao || ""),
        contaUid: String(f.contaUid || ""),
      })),
    atendimento: normalizarAtendimento(base.atendimento),
    funcoes: normalizarFuncoes(base.funcoes),
    escalaBase: normalizarEscalaBase(
      base.escalaBase || modeloBaseInferido(base),
    ),
    revezamentos: normalizarRevezamentos(base.revezamentos),
    feriados: normalizarFeriados(base.feriados),
  });
};

// ---------------------------------------------------------------------
// FIM DE SEMANA
//   Revezamento de sábado e domingo: um grupo (ex.: líder e coordenadora)
//   divide o fim de semana. Na semana do "inicio" (um sábado), o 1º do grupo
//   trabalha no sábado e o 2º no domingo; na semana seguinte, inverte (com
//   mais gente, roda: sábado = k-ésimo, domingo = o seguinte). Quem é do
//   grupo só trabalha no sábado/domingo que é dele.
//   Domingo de folga do mês: cada pessoa pode ter o seu (1º, 2º, 3º, 4º ou
//   último domingo) — nesse domingo ela folga, seja qual for o modelo.
// ---------------------------------------------------------------------
export const DOMINGOS_DO_MES = [
  { value: 0, label: "Nenhum" },
  { value: 1, label: "1º domingo" },
  { value: 2, label: "2º domingo" },
  { value: 3, label: "3º domingo" },
  { value: 4, label: "4º domingo" },
  { value: 5, label: "Último domingo" },
];
export const normalizarRevezamentos = (lista) =>
  (Array.isArray(lista) ? lista : [])
    .map((r, i) => ({
      id: String(r?.id || `rev${i + 1}`),
      nome: String(r?.nome || "")
        .trim()
        .slice(0, 40),
      membros: (Array.isArray(r?.membros) ? r.membros : [])
        .map(String)
        .filter(Boolean),
      inicio: /^\d{4}-\d{2}-\d{2}$/.test(String(r?.inicio || ""))
        ? r.inicio
        : "",
    }))
    // 1 pessoa = alterna sozinha (uma semana sábado, outra domingo)
    .filter((r) => r.membros.length >= 1 && r.inicio);

// ---------------------------------------------------------------------
// FERIADOS: cada feriado tem a sua escala — quem trabalha e em que horário.
//   { data, nome, equipe: { [pessoa]: { trabalha, inicio, fim } } }
//   Quem não está na lista do feriado segue a escala normal do dia.
// ---------------------------------------------------------------------
export const normalizarFeriados = (lista) =>
  (Array.isArray(lista) ? lista : [])
    .filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(String(f?.data || "")))
    .map((f) => ({
      data: f.data,
      nome:
        String(f.nome || "Feriado")
          .trim()
          .slice(0, 50) || "Feriado",
      equipe: Object.fromEntries(
        Object.entries(
          f.equipe && typeof f.equipe === "object" ? f.equipe : {},
        ).map(([id, v]) => [
          id,
          {
            trabalha: v?.trabalha === true,
            inicio: horaValida(v?.inicio) ? v.inicio : "",
            fim: horaValida(v?.fim) ? v.fim : "",
          },
        ]),
      ),
    }))
    .sort((a, b) => a.data.localeCompare(b.data));
export const feriadoDoDia = (config, data) =>
  (config?.feriados || []).find((f) => f.data === data) || null;
// sugestões de feriados de data fixa (nacionais + Bahia)
export const FERIADOS_FIXOS = [
  ["01-01", "Confraternização Universal"],
  ["04-21", "Tiradentes"],
  ["05-01", "Dia do Trabalho"],
  ["07-02", "Independência da Bahia"],
  ["09-07", "Independência do Brasil"],
  ["10-12", "Nossa Senhora Aparecida"],
  ["11-02", "Finados"],
  ["11-15", "Proclamação da República"],
  ["11-20", "Consciência Negra"],
  ["12-25", "Natal"],
];
// coloca em cada pessoa do revezamento a posição dela (usada no cálculo do dia)
// campos calculados em cada pessoa (não são gravados): posição no
// revezamento (fds) e a escala dela nos feriados (feriadosDela)
const aplicarFimDeSemana = (config) => {
  const fds = new Map();
  config.revezamentos.forEach((r) =>
    r.membros.forEach((id, posicao) =>
      fds.set(id, {
        grupo: r.id,
        inicio: r.inicio,
        posicao,
        tamanho: r.membros.length,
      }),
    ),
  );
  const feriadosDe = (id) => {
    const m = {};
    config.feriados.forEach((f) => {
      if (f.equipe[id]) m[f.data] = { nome: f.nome, ...f.equipe[id] };
    });
    return Object.keys(m).length ? m : null;
  };
  return {
    ...config,
    turnos: config.turnos.map((t) => ({
      ...t,
      colaboradores: t.colaboradores.map((c) => ({
        ...c,
        fds: fds.get(c.id) || null,
        feriadosDela: feriadosDe(c.id),
      })),
    })),
  };
};
// tira os campos calculados antes de gravar
const semCalculados = (config) => ({
  ...config,
  turnos: config.turnos.map((t) => ({
    ...t,
    colaboradores: t.colaboradores.map((c) => {
      const { fds: _fds, feriadosDela: _fer, ...resto } = c;
      return resto;
    }),
  })),
});
// é o n-ésimo domingo do mês? (5 = último)
export const ehDomingoDoMes = (data, n) => {
  if (!n || diaDaSemana(data) !== 0) return false;
  const dia = Number(data.slice(8));
  if (n === 5)
    return Number(somarDias(data, 7).slice(5, 7)) !== Number(data.slice(5, 7));
  return Math.ceil(dia / 7) === n;
};
// no revezamento, quem fica com o sábado (slot 0) e o domingo (slot 1) desta semana
export const turnoDoRevezamento = (fds, data) => {
  const dow = diaDaSemana(data);
  if (!fds || (dow !== 6 && dow !== 0)) return null;
  const sabado = dow === 6 ? data : somarDias(data, -1);
  const k = Math.round(diasEntre(fds.inicio, sabado) / 7);
  // sozinho: na semana do início trabalha no sábado (folga no domingo); na seguinte, inverte
  if (fds.tamanho === 1) return ((k % 2) + 2) % 2 === (dow === 6 ? 0 : 1);
  const vez =
    (((k + (dow === 0 ? 1 : 0)) % fds.tamanho) + fds.tamanho) % fds.tamanho;
  return vez === fds.posicao;
};

// configurações antigas (sem modelo da base): deduz pelo que a equipe usa
const modeloBaseInferido = (base) => {
  const modelos = (base?.turnos || []).flatMap((t) =>
    (t.colaboradores || []).map((c) => c?.escala?.modelo).filter(Boolean),
  );
  const ciclo = modelos.find((m) => m && m !== "semanal");
  return {
    modelo: ciclo && MODELOS_BASE.some((x) => x.id === ciclo) ? ciclo : "6x1",
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
    .map((f) => ({
      id: String(f?.id || "")
        .replace(/[^\w-]/g, "")
        .slice(0, 30),
      nome: String(f?.nome || "")
        .trim()
        .slice(0, 40),
    }))
    .filter((f) => f.id && f.nome);
  return Array.isArray(lista) ? l : FUNCOES_PADRAO;
};
export const nomeDaFuncao = (config, id) =>
  config?.funcoes?.find((f) => f.id === id)?.nome || "";

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
  const modelo = MODELOS_ESCALA.some((m) => m.id === e?.modelo)
    ? e.modelo
    : "semanal";
  const preset = MODELOS_ESCALA.find((m) => m.id === modelo);
  return {
    modelo,
    trabalha:
      modelo === "ciclo"
        ? inteiroEntre(e?.trabalha, 1, 14, 1)
        : preset.trabalha,
    folga: modelo === "ciclo" ? inteiroEntre(e?.folga, 1, 14, 1) : preset.folga,
    referencia: ISO_RE.test(String(e?.referencia || "")) ? e.referencia : "",
    // grupo do revezamento (0 = A, 1 = B…) e se a pessoa tem modelo próprio
    // (diferente do modelo da base) — usados pelo assistente de escala
    grupo: inteiroEntre(e?.grupo, 0, 13, 0),
    propria: e?.propria === true,
  };
};

// ---------------------------------------------------------------------
// MODELO DA BASE (assistente "Configurar escala")
//   O modelo escolhido vale para toda a equipe; quem for diferente ganha
//   modelo próprio. Nos modelos de revezamento, cada pessoa fica numa equipe
//   (A, B, C…) e a equipe A começa no dia de início.
// ---------------------------------------------------------------------
export const MODELOS_BASE = [
  {
    id: "6x1",
    nome: "6x1",
    titulo: "6 dias de trabalho, 1 folga",
    desc: "Cada pessoa tem um dia de folga fixa na semana.",
    tipo: "semanal",
    folgas: 1,
  },
  {
    id: "5x2",
    nome: "5x2",
    titulo: "5 dias de trabalho, 2 folgas",
    desc: "Duas folgas fixas por semana (ex.: sábado e domingo).",
    tipo: "semanal",
    folgas: 2,
  },
  {
    id: "12x36",
    nome: "12x36",
    titulo: "Plantão dia sim, dia não",
    desc: "Trabalha um dia, folga no outro. Duas equipes se revezam (A e B).",
    tipo: "ciclo",
    trabalha: 1,
    folga: 1,
  },
  {
    id: "24x48",
    nome: "24x48",
    titulo: "Plantão de 24h, folga de 48h",
    desc: "Trabalha um dia, folga dois. Três equipes se revezam (A, B e C).",
    tipo: "ciclo",
    trabalha: 1,
    folga: 2,
  },
  {
    id: "2x2",
    nome: "2x2",
    titulo: "2 dias de trabalho, 2 de folga",
    desc: "Duas equipes se revezam a cada dois dias.",
    tipo: "ciclo",
    trabalha: 2,
    folga: 2,
  },
  {
    id: "ciclo",
    nome: "Personalizado",
    titulo: "Ciclo do seu jeito",
    desc: "Você define quantos dias trabalha e quantos folga (ex.: 4x2, 5x1).",
    tipo: "ciclo",
    trabalha: 4,
    folga: 2,
  },
];
export const LETRAS_GRUPO = "ABCDEFGHIJKLMN";
export const normalizarEscalaBase = (b = {}) => {
  const m = MODELOS_BASE.find((x) => x.id === b?.modelo) || MODELOS_BASE[0];
  return {
    modelo: m.id,
    trabalha:
      m.id === "ciclo"
        ? inteiroEntre(b?.trabalha, 1, 14, m.trabalha)
        : m.trabalha || 0,
    folga:
      m.id === "ciclo" ? inteiroEntre(b?.folga, 1, 14, m.folga) : m.folga || 0,
    inicio: ISO_RE.test(String(b?.inicio || "")) ? b.inicio : "",
  };
};
// quantas equipes (A, B…) o revezamento precisa para ter gente todo dia
export const gruposDoCiclo = (base) => {
  const m = MODELOS_BASE.find((x) => x.id === base?.modelo);
  if (!m || m.tipo !== "ciclo") return 0;
  return Math.max(1, Math.ceil((base.trabalha + base.folga) / base.trabalha));
};
/* Escala de uma pessoa pelo modelo da base (quando ela não tem modelo próprio).
   Semanal: os dias de trabalho ficam em c.dias (a folga fixa). Revezamento:
   a equipe (grupo) define o dia em que começa. */
export const escalaPelaBase = (base, grupo = 0) => {
  const b = normalizarEscalaBase(base);
  const m = MODELOS_BASE.find((x) => x.id === b.modelo);
  if (m.tipo === "semanal")
    return normalizarEscala({ modelo: "semanal", grupo: 0 });
  const id = ["12x36", "24x48", "2x2"].includes(b.modelo) ? b.modelo : "ciclo";
  const referencia = b.inicio ? somarDias(b.inicio, grupo * b.trabalha) : "";
  return normalizarEscala({
    modelo: id,
    trabalha: b.trabalha,
    folga: b.folga,
    referencia,
    grupo,
  });
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
      id:
        String(x?.id || `etapa${i + 1}`)
          .replace(/[^\w-]/g, "")
          .slice(0, 24) || `etapa${i + 1}`,
      nome: String(x?.nome || "")
        .trim()
        .slice(0, 30),
      acao: String(x?.acao || x?.nome || "")
        .trim()
        .slice(0, 30),
    }))
    .filter((x) => x.nome);
  return {
    ativo: a?.ativo !== false,
    etapas: etapas.length ? etapas : ETAPAS_PADRAO,
    contagem: a?.contagem === "total" ? "total" : "dividir",
    // marcar só dentro do próprio turno (fora dele, o painel avisa e pede confirmação)
    avisarForaDoTurno: a?.avisarForaDoTurno !== false,
    // veículo com mais de uma reserva: a recepção é marcada reserva a reserva
    // (quando todas chegam, o veículo fica recepcionado sozinho)
    recepcaoPorReserva: a?.recepcaoPorReserva !== false,
    // funções que recebem os passageiros (ex.: Concierge). Vazio = o sistema
    // escolhe pelo nome da função ("concierge", "recepção")
    funcoesRecepcao: Array.isArray(a?.funcoesRecepcao)
      ? [...new Set(a.funcoesRecepcao.map(String).filter(Boolean))].slice(0, 30)
      : [],
    // quem não sai no relatório de recebimento (Demanda por turno → Atendimento)
    ocultos: Array.isArray(a?.ocultos)
      ? [...new Set(a.ocultos.map(String).filter(Boolean))].slice(0, 200)
      : [],
    // fornecedores que separam a escala por voo (ex.: Morro de São Paulo) e os veículos deles
    porVoo: {
      fornecedores: Array.isArray(a?.porVoo?.fornecedores)
        ? [
            ...new Set(
              a.porVoo.fornecedores
                .map((x) => String(x).trim())
                .filter(Boolean),
            ),
          ].slice(0, 50)
        : [],
      veiculos: Array.isArray(a?.porVoo?.veiculos)
        ? [...new Set(a.porVoo.veiculos.map(String).filter(Boolean))].slice(
            0,
            500,
          )
        : [],
    },
  };
};

// Problemas que impedem salvar (texto para mostrar na tela).
export const validarConfig = (config) => {
  const erros = [];
  if (!config.turnos.length) erros.push("Cadastre pelo menos um turno.");
  if (
    config.atendimento &&
    !config.atendimento.etapas.some((e) => e.nome.trim())
  )
    erros.push("Atendimento: informe pelo menos uma etapa.");
  config.turnos.forEach((t, i) => {
    const nome = t.nome?.trim() || `Turno ${i + 1}`;
    if (!t.nome?.trim()) erros.push(`O turno ${i + 1} está sem nome.`);
    if (!horaValida(t.inicio) || !horaValida(t.fim))
      erros.push(`${nome}: horário inválido.`);
    else if (t.inicio === t.fim) erros.push(`${nome}: início e fim iguais.`);
    t.colaboradores.forEach((c) => {
      if (!c.nome?.trim()) erros.push(`${nome}: tem colaborador sem nome.`);
      if ((c.inicio || c.fim) && !(horaValida(c.inicio) && horaValida(c.fim))) {
        erros.push(
          `${nome}: horário próprio de ${c.nome || "colaborador"} incompleto.`,
        );
      }
      if (c.escala && c.escala.modelo !== "semanal" && !c.escala.referencia) {
        erros.push(
          `${nome}: informe um dia em que ${c.nome || "o colaborador"} trabalha (escala ${c.escala.modelo}).`,
        );
      }
    });
  });
  return erros;
};

// Cada base tem a sua equipe: Salvador em settings/turnos_equipe, as outras
// em settings/turnos_equipe__<id> (regiaoAtiva.js → idPorRegiao).
const REF_CONFIG = (r) =>
  doc(
    db,
    "settings",
    r ? idPorRegiao("turnos_equipe", r) : idPorRegiao("turnos_equipe"),
  );

// Base nova começa com os mesmos horários, sem ninguém na equipe.
export const configPadraoDaRegiao = () =>
  ehSede()
    ? CONFIG_PADRAO
    : {
        turnos: CONFIG_PADRAO.turnos.map((t) => ({ ...t, colaboradores: [] })),
        folguistas: [],
      };

// r (opcional): outra base — ex.: a gerência criando conta de Atendimento
export const carregarConfigTurnos = async (r) => {
  const snap = await getDoc(REF_CONFIG(r));
  return normalizarConfig(snap.exists() ? snap.data() : configPadraoDaRegiao());
};

export const salvarConfigTurnos = async (config) => {
  const limpo = normalizarConfig(config);
  await setDoc(REF_CONFIG(), {
    ...semCalculados(limpo),
    updatedAt: new Date(),
  });
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
  return consecutivo && seq.length > 2
    ? `${curto[0]} a ${curto[curto.length - 1]}`
    : curto.join(", ");
};

export const num = (v, casas = 1) =>
  Number(v || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: casas,
  });

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
  hora(
    item?.presentation_hour ||
      item?.presentation_hour_end ||
      item?.schedule?.presentation_hour ||
      "",
  );

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
  String(
    item?.service?.name ||
      item?.service_name ||
      item?.serviceName ||
      item?.name ||
      "Serviço",
  )
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

const paxDoItem = (item) =>
  Number(item?.is_adult_count || 0) +
  Number(item?.is_child_count || 0) +
  Number(item?.is_baby_count || item?.is_infant_count || 0);

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
export const buscarServicosPeriodo = async (
  inicio,
  fim,
  tipos,
  onProgresso,
  paralelo = 4,
) => {
  const datas = listarDatas(inicio, somarDias(fim, 1));
  const tarefas = datas.flatMap((data) =>
    tipos.map((tipo) => ({ data, tipo })),
  );
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
        const r = await fetch(urlServico(data, st), {
          headers: { Accept: "application/json" },
        });
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

  await Promise.all(
    Array.from({ length: Math.min(paralelo, tarefas.length) }, trabalhar),
  );
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
  passaMeiaNoite(janela) && reg.min < paraMinutos(janela.fim)
    ? somarDias(reg.data, -1)
    : reg.data;

const media = (n, d) => (d ? n / d : 0);

export const ehApoio = (turno) =>
  !turno.colaboradores.some((c) => c.papel === "principal");

// janela de trabalho de um colaborador (a dele ou a do turno)
// horário da pessoa (no dia, quando informado: feriado e fim de semana têm horário próprio)
export const janelaDo = (c, turno, data) => {
  if (data) {
    const fer = c.feriadosDela?.[data];
    if (fer?.trabalha && fer.inicio && fer.fim)
      return { inicio: fer.inicio, fim: fer.fim };
    if (c.horarioFds && [0, 6].includes(diaDaSemana(data)))
      return { ...c.horarioFds };
  }
  return c.inicio && c.fim
    ? { inicio: c.inicio, fim: c.fim }
    : { inicio: turno.inicio, fim: turno.fim };
};

// diferença em dias entre duas datas ISO
const diasEntre = (a, b) => Math.round((paraData(b) - paraData(a)) / 86400000);

// pelo MODELO de escala (sem exceções)
export const trabalhaPeloModelo = (c, data) => {
  const fer = c?.feriadosDela?.[data];
  if (fer) return fer.trabalha;
  if (c?.domingoFolga && ehDomingoDoMes(data, c.domingoFolga)) return false;
  const rev = turnoDoRevezamento(c?.fds, data);
  if (rev !== null) return rev;
  const e = c?.escala || { modelo: "semanal" };
  if (e.modelo === "semanal")
    return !c.dias?.length || c.dias.includes(diaDaSemana(data));
  if (!e.referencia) return false;
  const ciclo = e.trabalha + e.folga;
  const pos = ((diasEntre(e.referencia, data) % ciclo) + ciclo) % ciclo;
  return pos < e.trabalha;
};

// ---------------------------------------------------------------------
// OCORRÊNCIAS E FÉRIAS
//   No dia: atestado e falta (não trabalha) e atraso (trabalha, com os
//   minutos). Ficam em excecoes.dias[data][pessoa] = { tipo, minutos, obs }.
//   Férias: período por pessoa em excecoes.ferias [{ id, pessoaId, inicio,
//   fim, obs }]. Um lançamento do dia vale mais que as férias.
// ---------------------------------------------------------------------
export const OCORRENCIAS = [
  {
    id: "atestado",
    nome: "Atestado",
    curto: "At",
    ausente: true,
    cor: "#0369a1",
  },
  { id: "falta", nome: "Falta", curto: "Fa", ausente: true, cor: "#b42318" },
  { id: "atraso", nome: "Atraso", curto: "!", ausente: false, cor: "#b45309" },
];
export const FERIAS = {
  id: "ferias",
  nome: "Férias",
  curto: "Fé",
  cor: "#0f766e",
};
export const nomeOcorrencia = (tipo) =>
  tipo === "ferias"
    ? FERIAS.nome
    : OCORRENCIAS.find((o) => o.id === tipo)?.nome || "";
export const AUSENCIAS = ["folga", "ferias", "atestado", "falta"];

export const normalizarFerias = (lista) =>
  (Array.isArray(lista) ? lista : [])
    .filter(
      (f) =>
        f &&
        f.pessoaId &&
        /^\d{4}-\d{2}-\d{2}$/.test(f.inicio || "") &&
        /^\d{4}-\d{2}-\d{2}$/.test(f.fim || ""),
    )
    .map((f) => ({
      id: String(f.id || `${f.pessoaId}_${f.inicio}`),
      pessoaId: String(f.pessoaId),
      inicio: f.inicio <= f.fim ? f.inicio : f.fim,
      fim: f.inicio <= f.fim ? f.fim : f.inicio,
      obs: String(f.obs || "").slice(0, 200),
    }))
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
export const feriasNaData = (excecoes, data, id) =>
  (excecoes?.ferias || []).find(
    (f) => f.pessoaId === id && f.inicio <= data && data <= f.fim,
  ) || null;

// exceção do dia para o colaborador: { tipo: "folga" } | { tipo: "trabalha" } | { tipo: "cobre", turnoId }
// | { tipo: "atestado" | "falta" | "atraso", minutos?, obs? } | { tipo: "ferias" } (pelo período)
export const excecaoDoDia = (excecoes, data, id) => {
  const x = excecoes?.dias?.[data]?.[id];
  if (x) return x;
  const f = feriasNaData(excecoes, data, id);
  return f
    ? {
        tipo: "ferias",
        inicio: f.inicio,
        fim: f.fim,
        obs: f.obs,
        periodo: true,
      }
    : null;
};
const excecaoDe = excecaoDoDia;

// trabalha neste dia? (modelo + exceção)
export const trabalhaNaData = (c, data, excecoes) => {
  const x = excecaoDe(excecoes, data, c.id);
  if (x && ["folga", "ferias", "atestado", "falta"].includes(x.tipo))
    return false;
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
      .map((c) => ({
        id: c.id,
        nome: c.nome,
        papel: c.papel,
        janela: janelaDo(c, t, data),
        cobrindo: "",
        folguista: false,
      }));
    (config.folguistas || []).forEach((f) => {
      const x = excecaoDe(excecoes, data, f.id);
      if (x?.tipo === "cobre" && x.turnoId === t.id) {
        pessoas.push({
          id: f.id,
          nome: f.nome,
          papel: "principal",
          janela: { inicio: t.inicio, fim: t.fim },
          cobrindo: x.cobrindo || "",
          folguista: true,
        });
      }
    });
    // colaborador de outro turno cobrindo este (troca de turno)
    config.turnos.forEach((outro) =>
      outro.colaboradores.forEach((c) => {
        const x = excecaoDe(excecoes, data, c.id);
        if (outro.id !== t.id && x?.tipo === "cobre" && x.turnoId === t.id) {
          pessoas.push({
            id: c.id,
            nome: c.nome,
            papel: c.papel,
            janela: { inicio: t.inicio, fim: t.fim },
            cobrindo: x.cobrindo || "",
            folguista: false,
          });
        }
      }),
    );
    return { turno: t, pessoas };
  });

// todos (colaboradores + folguistas), para listas e contas de atendimento
export const todosDaEquipe = (config) => [
  ...config.turnos.flatMap((t) =>
    t.colaboradores.map((c) => ({
      ...c,
      turnoId: t.id,
      turnoNome: t.nome,
      cor: t.cor,
      folguista: false,
      funcaoNome: nomeDaFuncao(config, c.funcao),
    })),
  ),
  ...(config.folguistas || []).map((f) => ({
    ...f,
    papel: "principal",
    turnoId: "",
    turnoNome: "Folguista",
    cor: "#64748b",
    folguista: true,
    funcaoNome: nomeDaFuncao(config, f.funcao),
  })),
];

// ---------- exceções da escala (folgas, trocas, coberturas) ----------
const REF_EXCECOES = () => doc(db, "settings", idPorRegiao("turnos_excecoes"));
export const carregarExcecoes = async () => {
  const snap = await getDoc(REF_EXCECOES());
  const d = snap.exists() ? snap.data() : {};
  return {
    dias: d?.dias && typeof d.dias === "object" ? d.dias : {},
    ferias: normalizarFerias(d?.ferias),
  };
};
// guarda os últimos 120 dias e os futuros; ocorrências (atestado, falta,
// atraso) e férias ficam 400 dias, para o relatório do ano
export const salvarExcecoes = async (excecoes) => {
  const hojeIso = isoLocal(new Date());
  const limite = somarDias(hojeIso, -120);
  const limiteOcorr = somarDias(hojeIso, -400);
  const ehOcorr = (x) => OCORRENCIAS.some((o) => o.id === x?.tipo);
  const dias = Object.fromEntries(
    Object.entries(excecoes?.dias || {})
      .map(([d, v]) => [
        d,
        d >= limite
          ? v
          : d >= limiteOcorr
            ? Object.fromEntries(
                Object.entries(v || {}).filter(([, x]) => ehOcorr(x)),
              )
            : {},
      ])
      .filter(([, v]) => v && Object.keys(v).length),
  );
  const ferias = normalizarFerias(excecoes?.ferias).filter(
    (f) => f.fim >= limiteOcorr,
  );
  await setDoc(REF_EXCECOES(), { dias, ferias, updatedAt: new Date() });
  return { dias, ferias };
};

/* Relatório de ocorrências do período, por pessoa: atestados, faltas,
   atrasos (minutos) e dias de férias, com a lista de cada uma. */
export const relatorioOcorrencias = ({
  equipe = [],
  excecoes,
  inicio,
  fim,
}) => {
  const datas = listarDatas(inicio, fim);
  const linhas = equipe.map((c) => {
    const r = {
      id: c.id,
      nome: c.nome,
      funcaoNome: c.funcaoNome || "",
      turnoNome: c.turnoNome || "",
      atestado: 0,
      falta: 0,
      atraso: 0,
      minutosAtraso: 0,
      ferias: 0,
      lista: [],
    };
    datas.forEach((d) => {
      const x = excecaoDoDia(excecoes, d, c.id);
      if (!x) return;
      if (x.tipo === "ferias") {
        r.ferias += 1;
        return;
      }
      if (!OCORRENCIAS.some((o) => o.id === x.tipo)) return;
      r[x.tipo] += 1;
      if (x.tipo === "atraso") r.minutosAtraso += Number(x.minutos) || 0;
      r.lista.push({
        data: d,
        tipo: x.tipo,
        minutos: Number(x.minutos) || 0,
        obs: x.obs || "",
      });
    });
    // períodos de férias que tocam o período (para a coluna "Dias")
    (excecoes?.ferias || [])
      .filter((f) => f.pessoaId === c.id && f.inicio <= fim && f.fim >= inicio)
      .forEach((f) =>
        r.lista.push({
          data: f.inicio,
          ate: f.fim,
          tipo: "ferias",
          minutos: 0,
          obs: f.obs || "",
        }),
      );
    r.lista.sort((a, b) => a.data.localeCompare(b.data));
    return r;
  });
  const com = linhas.filter(
    (l) => l.atestado || l.falta || l.atraso || l.ferias,
  );
  const total = com.reduce(
    (t, l) => ({
      atestado: t.atestado + l.atestado,
      falta: t.falta + l.falta,
      atraso: t.atraso + l.atraso,
      minutosAtraso: t.minutosAtraso + l.minutosAtraso,
      ferias: t.ferias + l.ferias,
    }),
    { atestado: 0, falta: 0, atraso: 0, minutosAtraso: 0, ferias: 0 },
  );
  return {
    linhas: com.sort(
      (a, b) =>
        b.falta + b.atestado + b.atraso - (a.falta + a.atestado + a.atraso) ||
        a.nome.localeCompare(b.nome),
    ),
    total,
  };
};

/* ---------- quem recebe os passageiros ----------
   Só quem recebe entra na conta "por pessoa" da Demanda (o concierge, não
   toda a equipe da escala). Vale a escolha salva em Configurar escala →
   atendimento.funcoesRecepcao; sem escolha, as funções com "concierge" ou
   "recep" no nome. Quem marcou "Recepcionei" no painel do aeroporto também
   conta, naquele dia, mesmo sem a função. */
const NOME_RECEBE = /concierge|recep/i;
export const funcoesQueRecebem = (config) => {
  const salvas = config?.atendimento?.funcoesRecepcao || [];
  const existentes = new Set((config?.funcoes || []).map((f) => f.id));
  const validas = salvas.filter((id) => existentes.has(id));
  if (validas.length) return { ids: new Set(validas), automatico: false };
  return {
    ids: new Set(
      (config?.funcoes || [])
        .filter((f) => NOME_RECEBE.test(f.nome))
        .map((f) => f.id),
    ),
    automatico: true,
  };
};

/* Recebido x esperado, dia a dia, pela escala REAL (folgas, trocas,
   coberturas e folguistas da tela Escala da equipe) e pelas marcas
   de "Recepcionei" do painel do aeroporto. */
const calcularRecepcao = ({
  config,
  excecoes,
  dias,
  chegadas,
  atendimentos,
}) => {
  // demanda de cada turno por dia, só com as CHEGADAS (é o que o concierge recebe)
  const noPeriodo = new Set(dias);
  const porTurnoDia = Object.fromEntries(config.turnos.map((t) => [t.id, {}]));
  chegadas.forEach((reg) => {
    config.turnos.forEach((t) => {
      if (!dentro(reg.min, t.inicio, t.fim)) return;
      const dia = diaDoTurno(reg, t);
      if (!noPeriodo.has(dia)) return;
      const x = porTurnoDia[t.id][dia] || { pax: 0 };
      x.pax += reg.pax;
      porTurnoDia[t.id][dia] = x;
    });
  });
  const equipe = todosDaEquipe(config);
  const daEquipe = new Map(equipe.map((c) => [c.id, c]));
  const { ids: receptoras, automatico } = funcoesQueRecebem(config);
  const etapa = config?.atendimento?.etapas?.[0] || null;
  const regra = config?.atendimento?.contagem || "dividir";
  const temAtendimento = !!(etapa && atendimentos && atendimentos.length);

  // recebido de fato, por pessoa e dia (1ª etapa = recepção)
  const recebidoDia = new Map(); // `${id}|${data}` → pax
  const marcaramNoDia = new Map(); // data → Set(ids)
  if (temAtendimento) {
    const porData = new Map();
    atendimentos.forEach((d) =>
      porData.set(d.data, [...(porData.get(d.data) || []), d]),
    );
    porData.forEach((docs, data) => {
      const { pessoas } = contarAtendimentosSimples(docs, etapa.id, regra);
      pessoas.forEach((pax, id) => {
        recebidoDia.set(`${id}|${data}`, pax);
        if (!marcaramNoDia.has(data)) marcaramNoDia.set(data, new Set());
        marcaramNoDia.get(data).add(id);
      });
    });
  }
  const recebe = (id, data) =>
    receptoras.has(daEquipe.get(id)?.funcao || "") ||
    !!marcaramNoDia.get(data)?.has(id);

  const porTurno = Object.fromEntries(
    config.turnos.map((t) => [
      t.id,
      { somaPorPessoa: 0, diasComQuem: 0, diasSemNinguem: 0 },
    ]),
  );
  const pessoas = new Map(); // id → acumulado
  const acc = (id) => {
    if (!pessoas.has(id)) {
      const c = daEquipe.get(id);
      pessoas.set(id, {
        id,
        nome: c?.nome || "Fora da equipe",
        funcaoNome: c?.funcaoNome || "",
        turnoNome: c?.turnoNome || "—",
        cor: c?.cor || "#94a3b8",
        diasEscalado: 0,
        demanda: 0,
        esperado: 0,
        recebido: 0,
        diasComMarca: 0,
      });
    }
    return pessoas.get(id);
  };

  dias.forEach((data) => {
    const escala = escalaDoDia(config, excecoes, data);
    const naEscala = new Set();
    escala.forEach(({ turno, pessoas: lista }) => {
      if (ehApoio(turno)) return;
      const quem = [...new Set(lista.map((p) => p.id))].filter((id) =>
        recebe(id, data),
      );
      quem.forEach((id) => naEscala.add(id));
      const pax = porTurnoDia[turno.id]?.[data]?.pax || 0;
      const t = porTurno[turno.id];
      if (quem.length) {
        t.somaPorPessoa += pax / quem.length;
        t.diasComQuem += 1;
      } else if (pax > 0) t.diasSemNinguem += 1;
      quem.forEach((id) => {
        const p = acc(id);
        p.diasEscalado += 1;
        p.demanda += pax;
        p.esperado += pax / quem.length;
      });
    });
    // marcou a recepção sem estar na escala do dia (troca não lançada etc.)
    (marcaramNoDia.get(data) || new Set()).forEach((id) => {
      if (!naEscala.has(id))
        acc(id).foraDaEscala = (acc(id).foraDaEscala || 0) + 1;
    });
  });
  // quem tem a função mas não pegou nenhum dia no período (ex.: folguista sem cobertura)
  equipe.forEach((c) => {
    if (receptoras.has(c.funcao || "")) acc(c.id);
  });
  // recebido de fato no período
  recebidoDia.forEach((pax, chave) => {
    const [id, data] = chave.split("|");
    if (!dias.includes(data)) return;
    const p = acc(id);
    p.recebido += pax;
    p.diasComMarca += 1;
  });

  const linhas = [...pessoas.values()]
    .map((p) => ({
      ...p,
      mediaDemanda: media(p.demanda, p.diasEscalado),
      mediaEsperado: media(p.esperado, p.diasEscalado),
      mediaRecebido: media(p.recebido, p.diasEscalado || p.diasComMarca),
      pctDoEsperado: p.esperado ? (p.recebido / p.esperado) * 100 : null,
    }))
    .sort(
      (a, b) =>
        b.recebido - a.recebido ||
        b.esperado - a.esperado ||
        a.nome.localeCompare(b.nome, "pt-BR"),
    );
  const idsNaConta = new Set(linhas.map((l) => l.id));
  const foraDaConta = equipe
    .filter((c) => !idsNaConta.has(c.id))
    .map((c) => ({
      id: c.id,
      nome: c.nome,
      funcaoNome: c.funcaoNome || "sem função",
    }));
  const nomesFuncoes = (config.funcoes || [])
    .filter((f) => receptoras.has(f.id))
    .map((f) => f.nome);

  return {
    temAtendimento,
    automatico,
    funcoes: [...receptoras],
    nomesFuncoes,
    linhas,
    foraDaConta,
    porTurno: Object.fromEntries(
      Object.entries(porTurno).map(([id, t]) => [
        id,
        {
          porPessoa: t.diasComQuem ? t.somaPorPessoa / t.diasComQuem : null,
          diasSemNinguem: t.diasSemNinguem,
        },
      ]),
    ),
    totalRecebido: linhas.reduce((a, l) => a + l.recebido, 0),
    totalChegadas: chegadas
      .filter((r) => noPeriodo.has(r.data))
      .reduce((a, r) => a + r.pax, 0),
  };
};

// pax recebidos por pessoa numa etapa (mesma regra do relatório de atendimento)
const contarAtendimentosSimples = (docs, etapaId, regra) => {
  const pessoas = new Map();
  docs.forEach((d) => {
    const marcas = Object.entries(d.marcas?.[etapaId] || {}).filter(
      ([, v]) => v && typeof v === "object",
    );
    if (!marcas.length) return;
    // igual a paxEfetivo (atendimentoAeroporto): tira os no show do veículo
    const noShow = Object.values(d.noShow || {}).reduce(
      (s, v) =>
        s + (v && typeof v === "object" && v.tipo ? Number(v.pax) || 0 : 0),
      0,
    );
    const pax = Math.max(0, (Number(d.pax) || 0) - noShow);
    const parte = regra === "total" ? pax : pax / marcas.length;
    marcas.forEach(([id, m]) => {
      const chave = m.colaboradorId || id;
      const deles = typeof m.paxReservas === "number" ? m.paxReservas : parte;
      pessoas.set(chave, (pessoas.get(chave) || 0) + deles);
    });
  });
  return { pessoas };
};

export const calcularRelatorio = ({
  registros = [],
  inicio,
  fim,
  config,
  excecoes = null,
  atendimentos = null,
  chegadas = null,
}) => {
  const turnos = config.turnos;
  const dias = listarDatas(inicio, fim);
  const noPeriodo = new Set(dias);
  const nDias = dias.length;
  const vazio = () => ({ pax: 0, reservas: 0, grupos: new Set() });

  const porTurnoDia = Object.fromEntries(
    turnos.map((t) => [
      t.id,
      Object.fromEntries(dias.map((d) => [d, vazio()])),
    ]),
  );
  const porDia = Object.fromEntries(
    dias.map((d) => [
      d,
      {
        pax: 0,
        reservas: 0,
        porTipo: {},
        porHora: Array(24).fill(0),
        porTurno: {},
        registros: [],
      },
    ]),
  );
  const porHora = Array(24).fill(0);
  const semanaHora = Array.from({ length: 7 }, () => Array(24).fill(0));
  const porTipo = {};
  const colabs = [];
  turnos.forEach((t) =>
    t.colaboradores.forEach((c) =>
      colabs.push({ c, t, janela: janelaDo(c, t), pax: 0 }),
    ),
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
      const principaisNoDia = t.colaboradores.filter(
        (c) => c.papel === "principal" && trabalhaNaData(c, d, excecoes),
      ).length;
      return {
        data: d,
        pax: a.pax,
        reservas: a.reservas,
        grupos: a.grupos.size,
        principais: principaisNoDia,
      };
    });
    const soma = serie.reduce(
      (acc, s) => ({
        pax: acc.pax + s.pax,
        reservas: acc.reservas + s.reservas,
        grupos: acc.grupos + s.grupos,
      }),
      {
        pax: 0,
        reservas: 0,
        grupos: 0,
      },
    );
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
      porPrincipal: comPrincipal.length
        ? comPrincipal.reduce((a, s) => a + s.pax / s.principais, 0) /
          comPrincipal.length
        : null,
      horas,
      maior: ordenada[0] || null,
      menor: ordenada[ordenada.length - 1] || null,
      semana: semana.map((s) => (s.n ? s.pax / s.n : null)),
      serie,
    };
  });

  const colaboradores = colabs.map((x) => {
    const diasTrab = dias.filter((d) =>
      trabalhaNaData(x.c, d, excecoes),
    ).length;
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
  // conta do concierge: sempre pelas chegadas (null = chegadas não buscadas)
  const recepcao = chegadas
    ? calcularRecepcao({ config, excecoes, dias, chegadas, atendimentos })
    : null;

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
    recepcao,
    folguistas: config.folguistas,
    troca: { pax: troca, mediaPax: media(troca, nDias) },
    porHora: porHora.map((p) => media(p, nDias)),
    semanaHora: semanaHora.map((linha, w) =>
      linha.map((p) => (ocorrencias[w] ? p / ocorrencias[w] : null)),
    ),
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
      const a = m.get(k) || {
        nome: k,
        pax: 0,
        reservas: 0,
        tipo: r.tipo,
        hora: r.hora,
      };
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
    turnos: relatorio.turnos.map((t) => ({
      id: t.id,
      nome: t.nome,
      cor: t.cor,
      inicio: t.inicio,
      fim: t.fim,
      pax: dia.porTurno[t.id] || 0,
    })),
  };
};

// ---------- contas que podem entrar na escala ----------
// Operacional (inclui a gerência) e Atendimento, da base em uso. Guia e
// Comercial não entram. Reaproveita a conta que a pessoa já tem: não é
// preciso criar outra só para a escala.
export const NIVEIS_ESCALA = ["operacional", "atendimento"];
export const carregarContasEquipe = async () => {
  const listas = await Promise.all(
    NIVEIS_ESCALA.map((role) => {
      const filtros = [where("role", "==", role)];
      if (!ehSede()) filtros.push(where("regiao", "==", regiaoAtual().id));
      return getDocs(query(collection(db, "users"), ...filtros)).catch((e) => {
        console.error(`Contas (${role}):`, e);
        return { docs: [] };
      });
    }),
  );
  return listas
    .flatMap((snap) => snap.docs.map((d) => ({ uid: d.id, ...d.data() })))
    .filter(
      (u) =>
        u.ativo !== false &&
        (!ehSede() || !u.regiao || u.regiao === ID_SEDE || u.gerencia === true),
    )
    .sort((a, b) =>
      String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"),
    );
};
// compatibilidade (nome antigo)
export const carregarContasAtendimento = carregarContasEquipe;
