/* =========================================================
   JANELA DE DISPONIBILIDADE DOS GUIAS

   O dia de abertura (00:00) e o dia de fechamento (23:59:59) são
   CONFIGURÁVEIS pelo operacional, em Configurações → Escala
   (guardados em settings/scale: janelaDisponibilidadeAbertura e
   janelaDisponibilidadeFechamento — 0 = domingo ... 6 = sábado,
   igual ao Date.getDay() do JavaScript). Padrão: quinta a sexta.

   A janela sempre cobre dias inteiros, no fuso de Salvador,
   America/Bahia = UTC-3, sem horário de verão. A escala é montada
   no sábado, então o que o guia informa vale para as datas da
   SEMANA QUE VEM (segunda a domingo) — isso não muda com a janela.

   Usa sempre o horário de Salvador — não o do celular do guia —
   pra ninguém abrir/fechar a janela mudando o relógio do aparelho.

   ⚠️ O firestore.rules repete essa mesma regra (função
   janelaAberta, lendo a mesma configuração). Se mudar a fórmula
   aqui, mude lá também.
   ========================================================= */

// Config padrão: abre quinta (4), fecha sexta (5).
export const JANELA_PADRAO = { dowAbertura: 4, dowFechamento: 5 };

export const NOMES_DIAS_COMPLETO = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

// Sanitiza o que veio do Firestore: precisa ser um inteiro 0–6, senão cai
// no padrão daquele lado da janela (nunca quebra a tela por um dado ruim).
const normalizarDow = (valor, padrao) => {
  const n = Number(valor);
  return Number.isInteger(n) && n >= 0 && n <= 6 ? n : padrao;
};

export const normalizarConfigJanela = (config) => ({
  dowAbertura: normalizarDow(config?.dowAbertura, JANELA_PADRAO.dowAbertura),
  dowFechamento: normalizarDow(
    config?.dowFechamento,
    JANELA_PADRAO.dowFechamento,
  ),
});

// Quantos dias a janela cobre, incluindo o de abertura e o de fechamento —
// ex.: quinta→sexta = 2 dias; sexta→quinta = 7 dias (a semana toda).
const duracaoJanelaDias = ({ dowAbertura, dowFechamento }) =>
  ((dowFechamento - dowAbertura + 7) % 7) + 1;

// Texto pronto pra tela: "quinta-feira (00h) até sexta-feira (23h59)".
export const rotuloJanela = (config) => {
  const { dowAbertura, dowFechamento } = normalizarConfigJanela(config);
  return `${NOMES_DIAS_COMPLETO[dowAbertura]} (00h) até ${NOMES_DIAS_COMPLETO[dowFechamento]} (23h59)`;
};

const TZ = "America/Bahia";

export const NOMES_DIAS = [
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
  "Domingo",
];

const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const formatador = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
  hourCycle: "h23",
});

const pad = (n) => String(n).padStart(2, "0");

const partesBahia = (data) => {
  const o = {};
  formatador.formatToParts(data).forEach((p) => {
    o[p.type] = p.value;
  });
  return {
    y: Number(o.year),
    m: Number(o.month),
    d: Number(o.day),
    h: Number(o.hour),
    min: Number(o.minute),
    dow: DOW[o.weekday], // 0 = domingo ... 6 = sábado
  };
};

// Soma dias a uma data "YYYY-MM-DD" (aritmética de calendário, sem fuso).
export const somarDias = (iso, n) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

export const dataBr = (iso) => iso.split("-").reverse().slice(0, 2).join("/");

export const diaAbreviado = (iso) =>
  ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][
    new Date(`${iso}T12:00:00Z`).getUTCDay()
  ];

export const formatarRestante = (minutos) => {
  const dias = Math.floor(minutos / 1440);
  const horas = Math.floor((minutos % 1440) / 60);
  const min = minutos % 60;
  if (dias > 0) return `${dias} dia${dias > 1 ? "s" : ""} e ${horas}h`;
  if (horas > 0) return `${horas}h${min ? ` ${min}min` : ""}`;
  return `${Math.max(min, 1)} min`;
};

export const getEstadoJanela = (agora = new Date(), configBruta) => {
  const { dowAbertura, dowFechamento } = normalizarConfigJanela(configBruta);
  const duracao = duracaoJanelaDias({ dowAbertura, dowFechamento });

  const p = partesBahia(agora);
  const hojeIso = `${p.y}-${pad(p.m)}-${pad(p.d)}`;

  // "Distância" de hoje até o dia de abertura, dentro do ciclo de 7 dias.
  const diasDesdeAbertura = (p.dow - dowAbertura + 7) % 7;
  const aberta = diasDesdeAbertura < duracao;

  // Semana de referência: SEMPRE a semana que vem (segunda a domingo),
  // qualquer que seja o dia de hoje. Ou seja: o que se preenche nesta semana
  // (quinta e sexta) vale para as datas da semana seguinte.
  const diasDesdeSegunda = (p.dow + 6) % 7; // segunda = 0 ... domingo = 6
  const segundaAtual = somarDias(hojeIso, -diasDesdeSegunda);
  const semanaInicio = somarDias(segundaAtual, 7);
  const semanaFim = somarDias(semanaInicio, 6);

  const dias = NOMES_DIAS.map((day, i) => ({
    day,
    date: somarDias(semanaInicio, i),
  }));

  // Minutos até fechar (início do dia seguinte ao de fechamento). Só faz
  // sentido com a janela aberta.
  const diasAteFecharAHoje = duracao - 1 - diasDesdeAbertura;
  const restanteMin = aberta
    ? (diasAteFecharAHoje + 1) * 1440 - (p.h * 60 + p.min)
    : 0;

  // Próxima abertura (quando fechada).
  const diasAteAbrir = (dowAbertura - p.dow + 7) % 7;
  const proximaAberturaIso = somarDias(hojeIso, diasAteAbrir);

  return {
    aberta,
    hojeIso,
    semanaInicio,
    semanaFim,
    dias,
    restanteMin,
    proximaAberturaIso,
    diasAteAbrir: aberta ? 0 : diasAteAbrir,
    dowAbertura,
    dowFechamento,
    rotulo: rotuloJanela({ dowAbertura, dowFechamento }),
    nomeDiaAbertura: NOMES_DIAS_COMPLETO[dowAbertura],
    nomeDiaFechamento: NOMES_DIAS_COMPLETO[dowFechamento],
  };
};
