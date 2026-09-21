/* =========================================================
   JANELA DE DISPONIBILIDADE DOS GUIAS

   Abre na QUINTA às 00:00 e fecha na SEXTA às 23:59 (fuso de
   Salvador, America/Bahia = UTC-3, sem horário de verão).
   A escala é montada no sábado, então o que o guia informa
   nessa janela vale para as datas da SEMANA QUE VEM (segunda a domingo).

   Usa sempre o horário de Salvador — não o do celular do guia —
   pra ninguém abrir/fechar a janela mudando o relógio do aparelho.

   ⚠️ O firestore.rules repete essa mesma regra (função
   janelaAberta). Se mudar os dias/horários aqui, mude lá também.
   ========================================================= */

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

export const getEstadoJanela = (agora = new Date()) => {
  const p = partesBahia(agora);
  const hojeIso = `${p.y}-${pad(p.m)}-${pad(p.d)}`;
  const aberta = p.dow === 4 || p.dow === 5; // quinta ou sexta

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

  // Minutos até fechar (sábado 00:00). Só faz sentido com a janela aberta.
  const restanteMin = aberta
    ? (p.dow === 4 ? 2 : 1) * 1440 - (p.h * 60 + p.min)
    : 0;

  // Próxima quinta-feira (quando fechada).
  const diasAteQuinta = (4 - p.dow + 7) % 7;
  const proximaAberturaIso = somarDias(hojeIso, diasAteQuinta);

  return {
    aberta,
    hojeIso,
    semanaInicio,
    semanaFim,
    dias,
    restanteMin,
    proximaAberturaIso,
    diasAteAbrir: aberta ? 0 : diasAteQuinta,
  };
};
