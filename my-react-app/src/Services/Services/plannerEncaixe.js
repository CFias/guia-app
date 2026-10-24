// plannerEncaixe.js
//
// Regra de escolha do guia por "nota de encaixe" — o mesmo raciocínio do
// operacional: primeiro quem COMBINA com o serviço, depois o equilíbrio.
//
// Antes, a escolha era uma fila de critérios (idioma → mínimo → prioridade
// → quem trabalhou menos → afinidade). Como "quem trabalhou menos" vinha
// antes da afinidade, um guia 95% e um 10% no passeio contavam igual: a
// afinidade só desempatava carga idêntica.
//
// Agora cada par guia × serviço recebe uma nota que SOMA:
//   + afinidade com o passeio (vale mais em serviço complexo)
//   + fala o idioma do grupo
//   + ainda não bateu a garantia mínima da semana
//   + nível de prioridade (modo Prioridade)
//   − carga acima da média (equilíbrio vira penalidade gradual)
//   − serviço complexo com guia de afinidade baixa
// e o dia é montado pela MELHOR COMBINAÇÃO (algoritmo húngaro): maximiza
// primeiro a quantidade de serviços com guia e, depois, a soma das notas.
// Assim o guia raro não é "gasto" num serviço fácil.

import { avaliarMatchIdioma } from "../Utils/idiomas";
import { ehServicoDisp } from "./plannerUtils";

// Pesos padrão (em pontos). Podem ser sobrescritos via `pesosEscala`.
export const PESOS_ESCALA_PADRAO = {
  afinidade: 60, // afinidade 100% em serviço normal = +60
  idiomaPrincipal: 130, // fala o idioma principal do grupo (pesa mais que afinidade)
  idiomaTodos: 15, // fala todos os idiomas pedidos
  garantiaMinima: 40, // ainda não recebeu o mínimo garantido da semana
  prioridadePorNivel: 8, // modo Prioridade: por nível acima do 1
  equilibrioPorServico: 14, // modo Prioridade: por serviço acima (−) ou abaixo (+) da média
  equilibrioLimite: 80, // teto do ajuste de equilíbrio (±)
  acimaDoTeto: 30, // por serviço acima do teto do guia
  diaTrabalhado: 3, // por dia já trabalhado na semana (espalha os dias)
  afinidadeBaixaComplexo: 30, // serviço complexo com afinidade < 50%
  afinidadeMuitoBaixa: 20, // afinidade < 30% (multiplicado pelo peso do serviço)
  afinidadeSemMapa: 50, // afinidade assumida quando o mapa está desligado
  experienciaPorVez: 4, // por dia que o guia fez o passeio nas últimas 8 semanas
  experienciaMax: 20, // teto do bônus de experiência (não vira "sempre o mesmo")
  // no modo Equilibrado o equilíbrio pesa mais
  equilibrioModoEquilibrado: 40,
  // diversificar: guia apto (afinidade alta) que quase não faz o passeio,
  // quando outros já fazem muito — dá chance de variar sem perder qualidade
  diversificar: 10,
  // mesmo guia repetindo o mesmo passeio na semana (por vez)
  repetirNaSemana: 8,
};

// Serviço mais exigente pede guia mais experiente: o peso multiplica a
// afinidade (e ativa a penalidade de afinidade baixa a partir de 1.4).
export const pesoDoServico = (item = {}) => {
  const nome = String(item.serviceName || "")
    .toUpperCase()
    .trim();
  const pax = Number(item.passengers || 0);

  if (/^(IN|OUT)\b|TRANSFER|TRASLADO/.test(nome)) return 0.6;

  let peso = 1;
  if (pax >= 30) peso *= 1.5;
  else if (pax >= 15) peso *= 1.25;
  if (ehServicoDisp(item.serviceName || "")) peso *= 1.4;
  return Math.min(peso, 1.8);
};

const ehComplexo = (peso) => peso >= 1.4;

// Nota de um guia para um serviço + os motivos (para explicar a escolha).
export const notaDeEncaixe = ({
  guia,
  item,
  afinidade = 0, // 0–100 (do mapa de afinidade)
  usarAfinidade = false,
  exigidos = [], // idiomas pedidos pelo serviço (vazio = não exige)
  indicadores, // de calcularIndicadoresGuia
  modoPrioridade = false,
  experiencia = 0, // dias que o guia fez o passeio nas últimas 8 semanas
  experienciaMaisAlta = 0, // maior experiência entre os candidatos do dia
  repeticoesNaSemana = 0, // quantas vezes já faz esse passeio nesta semana
  aprendido = null, // { pontos, motivo } — o que a equipe costuma fazer (escalaAprendizado.js)
  pesos = PESOS_ESCALA_PADRAO,
}) => {
  const p = { ...PESOS_ESCALA_PADRAO, ...pesos };
  const peso = pesoDoServico(item);
  const afinidadeUsada = usarAfinidade
    ? Number(afinidade) || 0
    : p.afinidadeSemMapa;
  const motivos = [];
  let nota = 0;

  // 1) combina com o passeio
  nota += (afinidadeUsada / 100) * p.afinidade * peso;
  if (usarAfinidade) motivos.push(`afinidade ${Math.round(afinidadeUsada)}%`);
  if (usarAfinidade && ehComplexo(peso) && afinidadeUsada < 50) {
    nota -= p.afinidadeBaixaComplexo;
    motivos.push("serviço exigente com afinidade baixa");
  }
  if (usarAfinidade && afinidadeUsada < 30)
    nota -= p.afinidadeMuitoBaixa * peso;

  // 1b) experiência recente com o passeio (histórico do Phoenix)
  if (experiencia > 0) {
    nota += Math.min(p.experienciaMax, experiencia * p.experienciaPorVez);
    motivos.push(`fez esse passeio ${experiencia}× nas últimas 8 semanas`);
  }

  // 1c) diversificar: apto, mas quase nunca escalado nesse passeio, enquanto
  //     outro guia concentra — varia sem abrir mão da aptidão
  if (
    usarAfinidade &&
    afinidadeUsada >= 70 &&
    experiencia === 0 &&
    experienciaMaisAlta >= 3
  ) {
    nota += p.diversificar;
    motivos.push("apto e pouco escalado nesse passeio (diversifica)");
  }
  if (repeticoesNaSemana > 0) nota -= repeticoesNaSemana * p.repetirNaSemana;

  // 1d) o que a equipe costuma fazer nas edições (critério secundário)
  if (aprendido?.pontos) {
    nota += aprendido.pontos;
    if (aprendido.motivo && aprendido.pontos > 0)
      motivos.push(aprendido.motivo);
  }

  // 2) idioma do grupo
  if (exigidos.length) {
    const match = avaliarMatchIdioma(guia, exigidos);
    if (match.cobrePrincipal) {
      nota += p.idiomaPrincipal;
      motivos.push("fala o idioma do grupo");
    }
    if (match.cobreTodos) nota += p.idiomaTodos;
  }

  // 3) garantia mínima da semana — de preferência num serviço mais simples
  //    (o bônus diminui conforme o serviço fica mais exigente)
  if (indicadores?.abaixoDoMinimo) {
    nota += p.garantiaMinima / Math.max(peso, 0.6);
    const minimo = Math.max(1, Number(indicadores.minimo) || 1);
    motivos.push(
      `garantia: ainda não tem ${minimo} serviço${minimo === 1 ? "" : "s"} na semana`,
    );
  }

  // 4) prioridade (só enquanto o guia não disparou à frente da média)
  if (
    modoPrioridade &&
    indicadores &&
    indicadores.cargaRecente <= indicadores.mediaGeral + 1
  ) {
    nota += (Math.max(1, indicadores.prioridade) - 1) * p.prioridadePorNivel;
  }

  // 5) equilíbrio: penalidade gradual (ou bônus para quem está abaixo)
  if (indicadores) {
    const desvio = indicadores.cargaRecente - indicadores.mediaGeral;
    const porServico = modoPrioridade
      ? p.equilibrioPorServico
      : p.equilibrioModoEquilibrado;
    const ajuste = Math.max(
      -p.equilibrioLimite,
      Math.min(p.equilibrioLimite, -desvio * porServico),
    );
    nota += ajuste;
    if (desvio <= -1) motivos.push("está abaixo da média de serviços");
    nota -= (indicadores.excedente || 0) * p.acimaDoTeto;
    nota -= (indicadores.diasTrabalhados || 0) * p.diaTrabalhado;
  }

  return { nota, motivos, peso };
};

// ---------------------------------------------------------------------
// Algoritmo húngaro (atribuição de custo mínimo), matriz n × m com n ≤ m.
// Devolve para cada linha a coluna atribuída.
// ---------------------------------------------------------------------
const hungaro = (custo) => {
  const n = custo.length;
  const m = custo[0]?.length || 0;
  const INF = Number.POSITIVE_INFINITY;
  const u = new Array(n + 1).fill(0);
  const v = new Array(m + 1).fill(0);
  const p = new Array(m + 1).fill(0);
  const way = new Array(m + 1).fill(0);

  for (let i = 1; i <= n; i += 1) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(m + 1).fill(INF);
    const usado = new Array(m + 1).fill(false);
    do {
      usado[j0] = true;
      const i0 = p[j0];
      let delta = INF;
      let j1 = 0;
      for (let j = 1; j <= m; j += 1) {
        if (usado[j]) continue;
        const cur = custo[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= m; j += 1) {
        if (usado[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }

  const resultado = new Array(n).fill(-1);
  for (let j = 1; j <= m; j += 1) if (p[j]) resultado[p[j] - 1] = j - 1;
  return resultado;
};

// Melhor combinação do dia.
//  notas[i][j] = nota do guia j no serviço i, ou null se ele não pode.
// Cada serviço recebe no máximo 1 guia e cada guia no máximo 1 serviço.
// Primeiro maximiza QUANTOS serviços ficam com guia; depois, a soma das notas.
export const melhorCombinacaoDoDia = (notas) => {
  const n = notas.length;
  const m = notas[0]?.length || 0;
  if (!n || !m) return [];

  const COBERTURA = 100000; // vale mais que qualquer diferença de nota
  const PROIBIDO = 1e9;
  const transpor = n > m;
  const linhas = transpor ? m : n;
  const colunas = transpor ? n : m;

  const custo = Array.from({ length: linhas }, (_, a) =>
    Array.from({ length: colunas }, (_, b) => {
      const nota = transpor ? notas[b][a] : notas[a][b];
      return nota === null || nota === undefined
        ? PROIBIDO
        : -(COBERTURA + nota);
    }),
  );

  const atrib = hungaro(custo);
  const pares = [];
  atrib.forEach((col, lin) => {
    if (col < 0) return;
    const [i, j] = transpor ? [col, lin] : [lin, col];
    const nota = notas[i][j];
    if (nota === null || nota === undefined) return;
    pares.push({ servico: i, guia: j, nota });
  });
  return pares;
};
