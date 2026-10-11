// historicoEscala.js
//
// O que o Phoenix mostra que JÁ ACONTECEU: qual guia fez qual passeio em
// qual dia. Serve para três coisas:
//  1) carga recente de cada guia (equilíbrio da escala) — contando cada
//     dia + passeio + guia UMA vez (o Phoenix devolve uma linha por
//     reserva; antes cada reserva contava como um serviço);
//  2) experiência recente do guia com cada passeio (bônus na escala);
//  3) sugestões para o Mapa de afinidade e aviso de guias do Phoenix que
//     não batem com o cadastro.

import {
  extrairGuiaEscalado,
  extrairNomePasseio,
  extrairServiceIdExterno,
} from "./plannerApi";
import {
  deveIgnorarServico,
  normalizarTexto,
  obterNomeCanonico,
} from "./plannerUtils";
import { resolverServiceIdDoItem } from "./plannerAllocation";

export const SEMANAS_CARGA = 4;
// semana imediatamente anterior pesa mais
export const PESOS_SEMANA_CARGA = [1, 0.75, 0.5, 0.25];
export const SEMANAS_EXPERIENCIA = 8;

const isoLocal = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const somarDias = (iso, dias) => {
  const [a, m, d] = iso.split("-").map(Number);
  const data = new Date(a, m - 1, d, 12);
  data.setDate(data.getDate() + dias);
  return isoLocal(data);
};

// Datas das N semanas antes de `inicioSemana` (segunda da semana gerada).
export const datasAntesDe = (inicioSemana, semanas = SEMANAS_EXPERIENCIA) =>
  Array.from({ length: semanas * 7 }, (_, i) =>
    somarDias(inicioSemana, -(semanas * 7) + i),
  );

// em que semana (0 = a imediatamente anterior) cai a data
const semanaAntes = (iso, inicioSemana) => {
  const [a1, m1, d1] = iso.split("-").map(Number);
  const [a2, m2, d2] = inicioSemana.split("-").map(Number);
  const dias = Math.round(
    (Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000,
  );
  return Math.floor((dias - 1) / 7);
};

// chaves pelas quais o guia aparece no Phoenix (apelido e nome)
export const chavesNomeGuia = (guia) =>
  [guia?.nickname, guia?.nome]
    .map((n) => normalizarTexto(n || ""))
    .filter(Boolean);

// Linhas do Phoenix → uma entrada por dia + passeio + guia (sem repetir
// reservas). Só entra o que tem guia e o que não está fora da escala.
export const extrairEntradasHistorico = (respostasPorData = {}) => {
  const vistas = new Set();
  const entradas = [];
  Object.entries(respostasPorData).forEach(([date, itens]) => {
    (itens || []).forEach((item) => {
      const guiaNome = String(extrairGuiaEscalado(item) || "").trim();
      const nomeApi = extrairNomePasseio(item);
      if (!guiaNome || !nomeApi) return;
      const serviceName = obterNomeCanonico(nomeApi);
      if (deveIgnorarServico(serviceName)) return;
      const externalServiceId = extrairServiceIdExterno(item) || null;
      const guiaChave = normalizarTexto(guiaNome);
      const servicoChave = externalServiceId
        ? `id_${externalServiceId}`
        : normalizarTexto(serviceName);
      const chave = `${date}|${guiaChave}|${servicoChave}`;
      if (vistas.has(chave)) return;
      vistas.add(chave);
      entradas.push({
        date,
        guiaNome,
        guiaChave,
        serviceName,
        externalServiceId,
      });
    });
  });
  return entradas;
};

// guia do cadastro → entradas dele
const entradasDoGuia = (entradas, guia) => {
  const chaves = new Set(chavesNomeGuia(guia));
  return entradas.filter((e) => chaves.has(e.guiaChave));
};

// Carga semanal recente de cada guia (por id): média das últimas
// SEMANAS_CARGA semanas, com peso maior para as mais recentes. Quando há
// disponibilidade registrada no período, compara serviços com os dias em
// que o guia estava disponível (quem deu pouca disponibilidade não parece
// "folgado").
export const cargaHistoricaPorGuia = ({
  entradas = [],
  guias = [],
  inicioSemana,
  mapaDisponibilidade = {},
}) => {
  const pesos = PESOS_SEMANA_CARGA.slice(0, SEMANAS_CARGA);
  const somaPesos = pesos.reduce((a, b) => a + b, 0);
  const inicioJanela = somarDias(inicioSemana, -SEMANAS_CARGA * 7);

  const porGuia = {};
  guias.forEach((g) => {
    const servicosSemana = pesos.map(() => 0);
    entradasDoGuia(entradas, g).forEach((e) => {
      const k = semanaAntes(e.date, inicioSemana);
      if (k >= 0 && k < pesos.length) servicosSemana[k] += 1;
    });

    const dispSemana = pesos.map(() => 0);
    let temDisponibilidade = false;
    (mapaDisponibilidade[g.id] || []).forEach((d) => {
      if (!d?.date || d.date < inicioJanela || d.date >= inicioSemana) return;
      temDisponibilidade = true;
      if (d.status === "BLOCKED") return;
      const k = semanaAntes(d.date, inicioSemana);
      if (k >= 0 && k < pesos.length) dispSemana[k] += 1;
    });

    porGuia[g.id] = {
      media:
        pesos.reduce((a, w, k) => a + w * servicosSemana[k], 0) / somaPesos,
      servicosPonderados: pesos.reduce(
        (a, w, k) => a + w * servicosSemana[k],
        0,
      ),
      diasPonderados: pesos.reduce((a, w, k) => a + w * dispSemana[k], 0),
      temDisponibilidade,
    };
  });

  // dias disponíveis por semana, em média, entre quem tem esse dado
  const comDisp = Object.values(porGuia).filter(
    (v) => v.temDisponibilidade && v.diasPonderados > 0,
  );
  const mediaDiasSemana = comDisp.length
    ? comDisp.reduce((a, v) => a + v.diasPonderados / somaPesos, 0) /
      comDisp.length
    : 0;

  const carga = {};
  Object.entries(porGuia).forEach(([id, v]) => {
    carga[id] =
      v.temDisponibilidade && v.diasPonderados > 0 && mediaDiasSemana > 0
        ? (v.servicosPonderados / v.diasPonderados) * mediaDiasSemana
        : v.media;
  });
  return carga;
};

// Quantos dias cada guia fez cada passeio no período (por id do guia e
// id do passeio no cadastro).
export const experienciaPorGuia = ({
  entradas = [],
  guias = [],
  servicesData = [],
}) => {
  const resultado = {};
  guias.forEach((g) => {
    const porPasseio = {};
    entradasDoGuia(entradas, g).forEach((e) => {
      const id = resolverServiceIdDoItem(e, servicesData, normalizarTexto);
      if (!id) return;
      porPasseio[id] = (porPasseio[id] || 0) + 1;
    });
    resultado[g.id] = porPasseio;
  });
  return resultado;
};

// Guias que aparecem no Phoenix e não batem com nenhum nome/apelido do
// cadastro — o histórico deles fica zerado até corrigir.
export const guiasPhoenixSemCadastro = ({ entradas = [], guias = [] }) => {
  const conhecidas = new Set(guias.flatMap(chavesNomeGuia));
  const desconhecidos = {};
  entradas.forEach((e) => {
    if (conhecidas.has(e.guiaChave)) return;
    if (!desconhecidos[e.guiaChave])
      desconhecidos[e.guiaChave] = { nome: e.guiaNome, vezes: 0 };
    desconhecidos[e.guiaChave].vezes += 1;
  });
  return Object.values(desconhecidos).sort((a, b) => b.vezes - a.vezes);
};

// Nível de afinidade sugerido pela quantidade de vezes que o guia fez o
// passeio no período (nunca sugere baixar: não ter feito não prova nada).
export const nivelSugeridoPeloHistorico = (vezes = 0) => {
  if (vezes >= 8) return 90;
  if (vezes >= 5) return 80;
  if (vezes >= 3) return 70;
  if (vezes >= 2) return 60;
  if (vezes >= 1) return 50;
  return 0;
};
