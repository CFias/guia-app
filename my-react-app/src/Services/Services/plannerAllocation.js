// plannerAllocation.js

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const compareText = (a, b) =>
  String(a || "").localeCompare(String(b || ""), "pt-BR", {
    sensitivity: "base",
  });

const isModoPrioridade = (modoDistribuicaoGuias = "") => {
  const modo = String(modoDistribuicaoGuias || "").trim().toLowerCase();
  return modo === "prioridade" || modo === "seguir_nivel_selecionado";
};

export const normalizarPrioridade = (valor) => {
  const prioridade = toNumber(valor, 2);
  return Math.max(1, Math.min(prioridade, 5));
};

export const construirMapaAfinidade = (docsOuDados = []) => {
  const mapa = {};

  docsOuDados.forEach((item) => {
    if (!item) return;

    if (typeof item.data === "function" && item.id) {
      mapa[item.id] = item.data();
      return;
    }

    if (item.guideId) {
      mapa[item.guideId] = item;
    }
  });

  return mapa;
};

export const construirMapaDisponibilidade = (docsDisponibilidade = []) => {
  const mapa = {};

  docsDisponibilidade.forEach((d) => {
    if (!d?.guideId) return;
    mapa[d.guideId] = Array.isArray(d.disponibilidade) ? d.disponibilidade : [];
  });

  return mapa;
};

export const guiaDisponivelNoDia = (mapaDisponibilidade, guiaId, date) => {
  const lista = mapaDisponibilidade?.[guiaId];

  if (!Array.isArray(lista)) return false;

  const info = lista.find((d) => d.date === date);
  if (!info) return false;

  return info.status !== "BLOCKED";
};

export const getDiasDisponiveisSemana = (
  mapaDisponibilidade,
  guiaId,
  semanaRef = [],
) => {
  const lista = mapaDisponibilidade?.[guiaId];
  if (!Array.isArray(lista)) return 0;

  const datasSemana = new Set((semanaRef || []).map((d) => d.date));

  return lista.filter(
    (item) => datasSemana.has(item.date) && item.status !== "BLOCKED",
  ).length;
};

export const resolverServiceIdDoItem = (
  item,
  servicesData = [],
  normalizarTexto,
) => {
  if (item?.serviceId) return String(item.serviceId);

  if (item?.externalServiceId) {
    const byExternal = servicesData.find(
      (s) =>
        Number(s.externalServiceId || 0) ===
        Number(item.externalServiceId || 0),
    );

    if (byExternal?.id) return String(byExternal.id);
  }

  const nomeItem = normalizarTexto(item?.serviceName || "");
  if (!nomeItem) return "";

  const byName = servicesData.find((s) => {
    const nomeService = normalizarTexto(s.externalName || s.nome || "");
    return (
      nomeService === nomeItem ||
      nomeItem.startsWith(`${nomeService} `) ||
      nomeItem.startsWith(`${nomeService} -`)
    );
  });

  return byName?.id ? String(byName.id) : "";
};

export const obterNivelAfinidade = (
  mapaAfinidade,
  guiaId,
  item,
  servicesData = [],
  normalizarTexto,
) => {
  const tours = mapaAfinidade?.[guiaId]?.tours || {};
  const chaveService = resolverServiceIdDoItem(
    item,
    servicesData,
    normalizarTexto,
  );

  if (chaveService && tours[chaveService] !== undefined) {
    return Number(tours[chaveService]) || 0;
  }

  return 0;
};

export const guiaCompativelPorPasseio = (guia, item, normalizarTexto) => {
  const passeiosAptos = Array.isArray(guia?.passeios) ? guia.passeios : [];

  return passeiosAptos.some((p) => {
    const matchServiceId =
      item?.serviceId && p?.id && String(p.id) === String(item.serviceId);

    const matchExternalServiceId =
      item?.externalServiceId &&
      p?.externalServiceId &&
      Number(p.externalServiceId) === Number(item.externalServiceId);

    const nomeItemNormalizado = normalizarTexto(item?.serviceName || "");
    const nomePasseioNormalizado = normalizarTexto(
      p?.externalName || p?.nome || "",
    );

    const matchNome =
      nomePasseioNormalizado === nomeItemNormalizado ||
      nomeItemNormalizado.startsWith(`${nomePasseioNormalizado} `) ||
      nomeItemNormalizado.startsWith(`${nomePasseioNormalizado} -`);

    return matchServiceId || matchExternalServiceId || matchNome;
  });
};

export const construirEstadoInicialSemana = (guias = [], semana = []) => {
  const contadorSemana = {};
  const diasTrabalhadosSemana = {};
  const usedByDate = {};

  guias.forEach((g) => {
    contadorSemana[g.id] = 0;
    diasTrabalhadosSemana[g.id] = new Set();
  });

  semana.forEach((dia) => {
    usedByDate[dia.date] = new Set();
  });

  return {
    contadorSemana,
    diasTrabalhadosSemana,
    usedByDate,
  };
};

export const aplicarRegistrosExistentesNoEstado = (
  registrosSemana = [],
  estado,
) => {
  registrosSemana.forEach((r) => {
    if (!r?.guiaId || r.allocationStatus === "CLOSED" || !r.date) return;

    if (!estado.usedByDate[r.date]) {
      estado.usedByDate[r.date] = new Set();
    }

    estado.usedByDate[r.date].add(r.guiaId);
    estado.contadorSemana[r.guiaId] =
      Number(estado.contadorSemana[r.guiaId] || 0) + 1;

    if (!estado.diasTrabalhadosSemana[r.guiaId]) {
      estado.diasTrabalhadosSemana[r.guiaId] = new Set();
    }

    estado.diasTrabalhadosSemana[r.guiaId].add(r.date);
  });

  return estado;
};

export const filtrarGuiasDisponiveisNoDia = (
  guias = [],
  mapaDisponibilidade,
  date,
) => {
  return guias.filter(
    (g) => g?.ativo && guiaDisponivelNoDia(mapaDisponibilidade, g.id, date),
  );
};

export const calcularCargaGuia = ({
  guiaId,
  contadorSemana,
  diasTrabalhadosSemana,
  mapaDisponibilidade,
  semanaRef,
}) => {
  const diasDisponiveis = getDiasDisponiveisSemana(
    mapaDisponibilidade,
    guiaId,
    semanaRef,
  );

  const totalServicos = Number(contadorSemana?.[guiaId] || 0);
  const totalDiasTrabalhados = diasTrabalhadosSemana?.[guiaId]?.size || 0;

  return {
    diasDisponiveis,
    totalServicos,
    totalDiasTrabalhados,
    ocupacao:
      diasDisponiveis > 0
        ? totalServicos / diasDisponiveis
        : Number.POSITIVE_INFINITY,
    frequencia:
      diasDisponiveis > 0
        ? totalDiasTrabalhados / diasDisponiveis
        : Number.POSITIVE_INFINITY,
  };
};

export const filtrarGuiasElegiveisParaServico = ({
  item,
  guiasDisponiveis = [],
  usadosNoDia,
  mapaAfinidade,
  servicesData,
  usarAfinidadeGuiaPasseio,
  normalizarTexto,
}) => {
  return guiasDisponiveis.filter((g) => {
    if (usadosNoDia.has(g.id)) return false;

    if (usarAfinidadeGuiaPasseio) {
      return (
        obterNivelAfinidade(
          mapaAfinidade,
          g.id,
          item,
          servicesData,
          normalizarTexto,
        ) > 0
      );
    }

    return guiaCompativelPorPasseio(g, item, normalizarTexto);
  });
};

export const ordenarServicosPorEscassez = (
  itens = [],
  guiasDisponiveis = [],
  usadosNoDia,
  mapaAfinidade,
  servicesData,
  usarAfinidadeGuiaPasseio,
  normalizarTexto,
) => {
  return [...itens].sort((a, b) => {
    const aptosA = filtrarGuiasElegiveisParaServico({
      item: a,
      guiasDisponiveis,
      usadosNoDia,
      mapaAfinidade,
      servicesData,
      usarAfinidadeGuiaPasseio,
      normalizarTexto,
    });

    const aptosB = filtrarGuiasElegiveisParaServico({
      item: b,
      guiasDisponiveis,
      usadosNoDia,
      mapaAfinidade,
      servicesData,
      usarAfinidadeGuiaPasseio,
      normalizarTexto,
    });

    if (aptosA.length !== aptosB.length) {
      return aptosA.length - aptosB.length;
    }

    const maiorAfinidadeA = Math.max(
      0,
      ...aptosA.map((g) =>
        obterNivelAfinidade(
          mapaAfinidade,
          g.id,
          a,
          servicesData,
          normalizarTexto,
        ),
      ),
    );

    const maiorAfinidadeB = Math.max(
      0,
      ...aptosB.map((g) =>
        obterNivelAfinidade(
          mapaAfinidade,
          g.id,
          b,
          servicesData,
          normalizarTexto,
        ),
      ),
    );

    if (maiorAfinidadeB !== maiorAfinidadeA) {
      return maiorAfinidadeB - maiorAfinidadeA;
    }

    const paxA = Number(a?.passengers || 0);
    const paxB = Number(b?.passengers || 0);

    if (paxB !== paxA) {
      return paxB - paxA;
    }

    return compareText(a?.serviceName, b?.serviceName);
  });
};

const normalizarNumeroPositivo = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const getPesoOperacionalServico = (item) => {
  const pax = Number(item?.passengers || 0);

  if (pax >= 25) return 1.35;
  if (pax >= 15) return 1.2;
  if (pax >= 8) return 1.1;
  return 1;
};

const calcularMediaServicosGrupo = (guias = [], contadorSemana = {}) => {
  if (!Array.isArray(guias) || !guias.length) return 0;

  const total = guias.reduce(
    (acc, guia) => acc + Number(contadorSemana?.[guia?.id] || 0),
    0,
  );

  return total / guias.length;
};

const calcularMenorCargaDoGrupo = (guias = [], contadorSemana = {}) => {
  if (!Array.isArray(guias) || !guias.length) return 0;

  return Math.min(
    ...guias.map((guia) => Number(contadorSemana?.[guia?.id] || 0)),
  );
};

const calcularLimiteEquilibrioPrioridade = ({
  elegiveis = [],
  contadorSemana,
  margemMaxima = 1,
}) => {
  const media = calcularMediaServicosGrupo(elegiveis, contadorSemana);
  const menorCarga = calcularMenorCargaDoGrupo(elegiveis, contadorSemana);

  return Math.max(media + margemMaxima, menorCarga + margemMaxima);
};

const calcularGap = (alvo, atual) => {
  return normalizarNumeroPositivo(alvo) - Number(atual || 0);
};

const calcularMinimoAceitavelGuia = ({
  guiaId,
  metasSemana = {},
  oportunidadesSemana = {},
  diasUteisSemana = {},
}) => {
  const meta = normalizarNumeroPositivo(metasSemana?.[guiaId]);
  const oportunidades = Number(oportunidadesSemana?.[guiaId] || 0);
  const diasUteis = Number(diasUteisSemana?.[guiaId] || 0);

  if (oportunidades <= 0 || diasUteis <= 0) return 0;

  if (meta >= 2.6 && diasUteis >= 4 && oportunidades >= 2) return 2;
  return 1;
};

const construirMetricasEquilibrioSemana = ({
  semana = [],
  guias = [],
  registrosSemana = [],
  mapaAfinidade = {},
  mapaDisponibilidade = {},
  servicesData = [],
  usarAfinidadeGuiaPasseio = false,
  agruparRegistrosPorServico,
  normalizarTexto,
}) => {
  const oportunidadesSemana = {};
  const diasDisponiveisSemana = {};
  const diasUteisSemanaMap = {};
  const pesoOportunidadeSemana = {};
  let totalPesoServicosPendentesSemana = 0;

  guias.forEach((guia) => {
    oportunidadesSemana[guia.id] = 0;
    diasUteisSemanaMap[guia.id] = new Set();
    diasDisponiveisSemana[guia.id] = getDiasDisponiveisSemana(
      mapaDisponibilidade,
      guia.id,
      semana,
    );
    pesoOportunidadeSemana[guia.id] = 0;
  });

  for (const dia of semana) {
    const registrosDia = registrosSemana.filter((r) => r.date === dia.date);
    const registrosAgrupados = agruparRegistrosPorServico(registrosDia);

    if (!registrosAgrupados.length) continue;

    const guiasDisponiveis = filtrarGuiasDisponiveisNoDia(
      guias,
      mapaDisponibilidade,
      dia.date,
    );

    if (!guiasDisponiveis.length) continue;

    const itensPendentes = registrosAgrupados.filter((item) => {
      if (!item?.id) return false;
      if (item.guiaId) return false;
      if (item.allocationStatus === "CLOSED") return false;
      return true;
    });

    for (const item of itensPendentes) {
      const pesoServico = getPesoOperacionalServico(item);
      totalPesoServicosPendentesSemana += pesoServico;

      const elegiveis = filtrarGuiasElegiveisParaServico({
        item,
        guiasDisponiveis,
        usadosNoDia: new Set(),
        mapaAfinidade,
        servicesData,
        usarAfinidadeGuiaPasseio,
        normalizarTexto,
      });

      elegiveis.forEach((guia) => {
        oportunidadesSemana[guia.id] =
          Number(oportunidadesSemana[guia.id] || 0) + 1;
        pesoOportunidadeSemana[guia.id] =
          Number(pesoOportunidadeSemana[guia.id] || 0) + pesoServico;
        diasUteisSemanaMap[guia.id].add(dia.date);
      });
    }
  }

  const diasUteisSemana = {};
  guias.forEach((guia) => {
    diasUteisSemana[guia.id] = diasUteisSemanaMap[guia.id]?.size || 0;
  });

  const pesosMeta = {};
  let somaPesosMeta = 0;

  guias.forEach((guia) => {
    const diasUteis = Number(diasUteisSemana[guia.id] || 0);
    const pesoOportunidade = Number(pesoOportunidadeSemana[guia.id] || 0);

    const peso = diasUteis * 0.7 + pesoOportunidade * 0.3;

    pesosMeta[guia.id] = peso;
    somaPesosMeta += peso;
  });

  const metasSemana = {};
  const minimosSemana = {};

  guias.forEach((guia) => {
    if (!somaPesosMeta || !totalPesoServicosPendentesSemana) {
      metasSemana[guia.id] = 0;
      minimosSemana[guia.id] = 0;
      return;
    }

    metasSemana[guia.id] =
      (Number(pesosMeta[guia.id] || 0) / somaPesosMeta) *
      totalPesoServicosPendentesSemana;

    minimosSemana[guia.id] = calcularMinimoAceitavelGuia({
      guiaId: guia.id,
      metasSemana,
      oportunidadesSemana,
      diasUteisSemana,
    });
  });

  return {
    totalPesoServicosPendentesSemana,
    oportunidadesSemana,
    diasDisponiveisSemana,
    diasUteisSemana,
    pesoOportunidadeSemana,
    metasSemana,
    minimosSemana,
  };
};

const calcularIndicadoresOperacionaisGuia = ({
  guiaId,
  contadorSemana,
  metasSemana = {},
  minimosSemana = {},
  oportunidadesSemana = {},
  diasUteisSemana = {},
}) => {
  const atual = Number(contadorSemana?.[guiaId] || 0);
  const meta = normalizarNumeroPositivo(metasSemana?.[guiaId]);
  const minimo = normalizarNumeroPositivo(minimosSemana?.[guiaId]);
  const oportunidades = Number(oportunidadesSemana?.[guiaId] || 0);
  const diasUteis = Number(diasUteisSemana?.[guiaId] || 0);

  return {
    atual,
    meta,
    minimo,
    oportunidades,
    diasUteis,
    gapMinimo: calcularGap(minimo, atual),
    gapMeta: calcularGap(meta, atual),
    abaixoDoMinimo: atual < minimo,
    abaixoDaMeta: atual < meta,
    zerado: atual === 0,
  };
};

const calcularPontuacaoPrioridade = ({
  guia,
  item,
  mapaAfinidade,
  servicesData,
  contadorSemana,
  diasTrabalhadosSemana,
  mapaDisponibilidade,
  semanaRef,
  usarAfinidadeGuiaPasseio,
  normalizarTexto,
  elegiveis = [],
  metasSemana = {},
  minimosSemana = {},
  oportunidadesSemana = {},
  diasUteisSemana = {},
}) => {
  const prioridade = normalizarPrioridade(guia?.nivelPrioridade);
  const afinidade = usarAfinidadeGuiaPasseio
    ? obterNivelAfinidade(
        mapaAfinidade,
        guia.id,
        item,
        servicesData,
        normalizarTexto,
      )
    : 0;

  const carga = calcularCargaGuia({
    guiaId: guia.id,
    contadorSemana,
    diasTrabalhadosSemana,
    mapaDisponibilidade,
    semanaRef,
  });

  const indicadores = calcularIndicadoresOperacionaisGuia({
    guiaId: guia.id,
    contadorSemana,
    metasSemana,
    minimosSemana,
    oportunidadesSemana,
    diasUteisSemana,
  });

  const limiteEquilibrio = calcularLimiteEquilibrioPrioridade({
    elegiveis,
    contadorSemana,
    margemMaxima: 1,
  });

  const excedente = Math.max(
    0,
    indicadores.atual - Math.max(indicadores.meta + 0.75, limiteEquilibrio),
  );

  const score =
    indicadores.gapMinimo * 5000 +
    indicadores.gapMeta * 2200 +
    (indicadores.zerado ? 420 : 0) +
    prioridade * 260 +
    afinidade * 140 -
    excedente * 900 -
    carga.frequencia * 50 -
    carga.ocupacao * 45 -
    carga.totalDiasTrabalhados * 10 -
    carga.totalServicos * 18;

  return {
    prioridade,
    afinidade,
    carga,
    excedente,
    score,
    ...indicadores,
  };
};

export const ordenarGuiasParaServico = ({
  elegiveis = [],
  item,
  mapaAfinidade,
  servicesData,
  contadorSemana,
  diasTrabalhadosSemana,
  mapaDisponibilidade,
  semanaRef,
  modoDistribuicaoGuias,
  usarAfinidadeGuiaPasseio,
  normalizarTexto,
  metasSemana = {},
  minimosSemana = {},
  oportunidadesSemana = {},
  diasUteisSemana = {},
}) => {
  const modoPrioridade = isModoPrioridade(modoDistribuicaoGuias);

  return [...elegiveis].sort((a, b) => {
    const afinidadeA = usarAfinidadeGuiaPasseio
      ? obterNivelAfinidade(
          mapaAfinidade,
          a.id,
          item,
          servicesData,
          normalizarTexto,
        )
      : 0;

    const afinidadeB = usarAfinidadeGuiaPasseio
      ? obterNivelAfinidade(
          mapaAfinidade,
          b.id,
          item,
          servicesData,
          normalizarTexto,
        )
      : 0;

    const cargaA = calcularCargaGuia({
      guiaId: a.id,
      contadorSemana,
      diasTrabalhadosSemana,
      mapaDisponibilidade,
      semanaRef,
    });

    const cargaB = calcularCargaGuia({
      guiaId: b.id,
      contadorSemana,
      diasTrabalhadosSemana,
      mapaDisponibilidade,
      semanaRef,
    });

    const opA = calcularIndicadoresOperacionaisGuia({
      guiaId: a.id,
      contadorSemana,
      metasSemana,
      minimosSemana,
      oportunidadesSemana,
      diasUteisSemana,
    });

    const opB = calcularIndicadoresOperacionaisGuia({
      guiaId: b.id,
      contadorSemana,
      metasSemana,
      minimosSemana,
      oportunidadesSemana,
      diasUteisSemana,
    });

    if (!modoPrioridade) {
      if (opB.gapMinimo !== opA.gapMinimo) {
        return opB.gapMinimo - opA.gapMinimo;
      }

      if (opB.gapMeta !== opA.gapMeta) {
        return opB.gapMeta - opA.gapMeta;
      }

      if (usarAfinidadeGuiaPasseio && afinidadeB !== afinidadeA) {
        return afinidadeB - afinidadeA;
      }

      if (cargaA.frequencia !== cargaB.frequencia) {
        return cargaA.frequencia - cargaB.frequencia;
      }

      if (cargaA.ocupacao !== cargaB.ocupacao) {
        return cargaA.ocupacao - cargaB.ocupacao;
      }

      if (cargaA.totalDiasTrabalhados !== cargaB.totalDiasTrabalhados) {
        return cargaA.totalDiasTrabalhados - cargaB.totalDiasTrabalhados;
      }

      if (cargaA.totalServicos !== cargaB.totalServicos) {
        return cargaA.totalServicos - cargaB.totalServicos;
      }

      return compareText(a?.nome, b?.nome);
    }

    const metaA = calcularPontuacaoPrioridade({
      guia: a,
      item,
      mapaAfinidade,
      servicesData,
      contadorSemana,
      diasTrabalhadosSemana,
      mapaDisponibilidade,
      semanaRef,
      usarAfinidadeGuiaPasseio,
      normalizarTexto,
      elegiveis,
      metasSemana,
      minimosSemana,
      oportunidadesSemana,
      diasUteisSemana,
    });

    const metaB = calcularPontuacaoPrioridade({
      guia: b,
      item,
      mapaAfinidade,
      servicesData,
      contadorSemana,
      diasTrabalhadosSemana,
      mapaDisponibilidade,
      semanaRef,
      usarAfinidadeGuiaPasseio,
      normalizarTexto,
      elegiveis,
      metasSemana,
      minimosSemana,
      oportunidadesSemana,
      diasUteisSemana,
    });

    if (metaB.score !== metaA.score) {
      return metaB.score - metaA.score;
    }

    if (metaB.gapMinimo !== metaA.gapMinimo) {
      return metaB.gapMinimo - metaA.gapMinimo;
    }

    if (metaB.gapMeta !== metaA.gapMeta) {
      return metaB.gapMeta - metaA.gapMeta;
    }

    if (metaB.prioridade !== metaA.prioridade) {
      return metaB.prioridade - metaA.prioridade;
    }

    if (usarAfinidadeGuiaPasseio && metaB.afinidade !== metaA.afinidade) {
      return metaB.afinidade - metaA.afinidade;
    }

    if (metaA.excedente !== metaB.excedente) {
      return metaA.excedente - metaB.excedente;
    }

    if (metaA.carga.frequencia !== metaB.carga.frequencia) {
      return metaA.carga.frequencia - metaB.carga.frequencia;
    }

    if (metaA.carga.ocupacao !== metaB.carga.ocupacao) {
      return metaA.carga.ocupacao - metaB.carga.ocupacao;
    }

    if (metaA.carga.totalServicos !== metaB.carga.totalServicos) {
      return metaA.carga.totalServicos - metaB.carga.totalServicos;
    }

    return compareText(a?.nome, b?.nome);
  });
};

export const selecionarGuiaParaServico = ({
  item,
  guiasDisponiveis = [],
  usadosNoDia,
  mapaAfinidade,
  servicesData,
  contadorSemana,
  diasTrabalhadosSemana,
  mapaDisponibilidade,
  semanaRef,
  modoDistribuicaoGuias = "equilibrado",
  usarAfinidadeGuiaPasseio = false,
  normalizarTexto,
  metasSemana = {},
  minimosSemana = {},
  oportunidadesSemana = {},
  diasUteisSemana = {},
}) => {
  const elegiveis = filtrarGuiasElegiveisParaServico({
    item,
    guiasDisponiveis,
    usadosNoDia,
    mapaAfinidade,
    servicesData,
    usarAfinidadeGuiaPasseio,
    normalizarTexto,
  });

  if (!elegiveis.length) return null;

  const abaixoDoMinimo = elegiveis.filter((g) => {
    const indicadores = calcularIndicadoresOperacionaisGuia({
      guiaId: g.id,
      contadorSemana,
      metasSemana,
      minimosSemana,
      oportunidadesSemana,
      diasUteisSemana,
    });

    return indicadores.abaixoDoMinimo && indicadores.oportunidades > 0;
  });

  const abaixoDaMeta = elegiveis.filter((g) => {
    const indicadores = calcularIndicadoresOperacionaisGuia({
      guiaId: g.id,
      contadorSemana,
      metasSemana,
      minimosSemana,
      oportunidadesSemana,
      diasUteisSemana,
    });

    return indicadores.abaixoDaMeta && indicadores.oportunidades > 0;
  });

  const grupoAlvo =
    abaixoDoMinimo.length > 0
      ? abaixoDoMinimo
      : abaixoDaMeta.length > 0
        ? abaixoDaMeta
        : elegiveis;

  const candidatosOrdenados = ordenarGuiasParaServico({
    elegiveis: grupoAlvo,
    item,
    mapaAfinidade,
    servicesData,
    contadorSemana,
    diasTrabalhadosSemana,
    mapaDisponibilidade,
    semanaRef,
    modoDistribuicaoGuias,
    usarAfinidadeGuiaPasseio,
    normalizarTexto,
    metasSemana,
    minimosSemana,
    oportunidadesSemana,
    diasUteisSemana,
  });

  return candidatosOrdenados[0] || null;
};

export const atualizarEstadoAposAlocacao = ({
  guiaSelecionado,
  date,
  contadorSemana,
  diasTrabalhadosSemana,
  usedByDate,
}) => {
  if (!guiaSelecionado?.id || !date) return;

  if (!usedByDate[date]) {
    usedByDate[date] = new Set();
  }

  usedByDate[date].add(guiaSelecionado.id);

  contadorSemana[guiaSelecionado.id] =
    Number(contadorSemana[guiaSelecionado.id] || 0) + 1;

  if (!diasTrabalhadosSemana[guiaSelecionado.id]) {
    diasTrabalhadosSemana[guiaSelecionado.id] = new Set();
  }

  diasTrabalhadosSemana[guiaSelecionado.id].add(date);
};

const upsertAtualizacao = (atualizacoes, payload) => {
  const index = atualizacoes.findIndex(
    (item) => item.registroId === payload.registroId,
  );

  if (index >= 0) {
    atualizacoes[index] = {
      ...atualizacoes[index],
      ...payload,
    };
    return;
  }

  atualizacoes.push(payload);
};

const construirMapaAtualizacoes = (atualizacoes = []) => {
  const mapa = {};

  atualizacoes.forEach((item) => {
    if (!item?.registroId) return;
    mapa[item.registroId] = item;
  });

  return mapa;
};

const coletarItensProjetadosSemana = ({
  semana = [],
  registrosSemana = [],
  agruparRegistrosPorServico,
  atualizacoes = [],
}) => {
  const mapaAtualizacoes = construirMapaAtualizacoes(atualizacoes);
  const itens = [];

  for (const dia of semana) {
    const registrosDia = registrosSemana.filter((r) => r.date === dia.date);
    const agrupados = agruparRegistrosPorServico(registrosDia);

    agrupados.forEach((item) => {
      const override = mapaAtualizacoes[item.id];

      itens.push({
        ...item,
        date: dia.date,
        guiaIdFinal:
          override?.guiaId !== undefined ? override.guiaId : item.guiaId || null,
        guiaNomeFinal:
          override?.guiaNome !== undefined
            ? override.guiaNome
            : item.guiaNome || null,
      });
    });
  }

  return itens;
};

const construirMapaContagemGuiaDia = (itensProjetados = []) => {
  const mapa = {};

  itensProjetados.forEach((item) => {
    if (!item?.guiaIdFinal || !item?.date) return;
    if (item.allocationStatus === "CLOSED") return;

    if (!mapa[item.guiaIdFinal]) {
      mapa[item.guiaIdFinal] = {};
    }

    mapa[item.guiaIdFinal][item.date] =
      Number(mapa[item.guiaIdFinal][item.date] || 0) + 1;
  });

  return mapa;
};

const removerUsoProjetadoDoDia = ({
  guiaId,
  date,
  contagemGuiaDia,
  usedByDate,
  diasTrabalhadosSemana,
}) => {
  if (!guiaId || !date) return;

  if (!contagemGuiaDia[guiaId]) {
    contagemGuiaDia[guiaId] = {};
  }

  const atual = Number(contagemGuiaDia[guiaId][date] || 0);
  const proximo = Math.max(0, atual - 1);
  contagemGuiaDia[guiaId][date] = proximo;

  if (proximo <= 0) {
    delete contagemGuiaDia[guiaId][date];
    usedByDate[date]?.delete(guiaId);
    diasTrabalhadosSemana[guiaId]?.delete(date);
  }
};

const adicionarUsoProjetadoNoDia = ({
  guiaId,
  date,
  contagemGuiaDia,
  usedByDate,
  diasTrabalhadosSemana,
}) => {
  if (!guiaId || !date) return;

  if (!contagemGuiaDia[guiaId]) {
    contagemGuiaDia[guiaId] = {};
  }

  contagemGuiaDia[guiaId][date] =
    Number(contagemGuiaDia[guiaId][date] || 0) + 1;

  if (!usedByDate[date]) {
    usedByDate[date] = new Set();
  }
  usedByDate[date].add(guiaId);

  if (!diasTrabalhadosSemana[guiaId]) {
    diasTrabalhadosSemana[guiaId] = new Set();
  }
  diasTrabalhadosSemana[guiaId].add(date);
};

const rebalancearGuiasSemServicoAoFinal = ({
  semana = [],
  guias = [],
  registrosSemana = [],
  atualizacoes = [],
  estado,
  mapaAfinidade = {},
  mapaDisponibilidade = {},
  servicesData = [],
  usarAfinidadeGuiaPasseio = false,
  modoDistribuicaoGuias = "equilibrado",
  agruparRegistrosPorServico,
  normalizarTexto,
  metricasSemana = {},
}) => {
  const guiaById = {};
  guias.forEach((g) => {
    if (g?.id) guiaById[g.id] = g;
  });

  const itensProjetados = coletarItensProjetadosSemana({
    semana,
    registrosSemana,
    agruparRegistrosPorServico,
    atualizacoes,
  });

  const contagemGuiaDia = construirMapaContagemGuiaDia(itensProjetados);

  const guiasSemServico = guias
    .filter((guia) => {
      if (!guia?.id || !guia.ativo) return false;

      const indicadores = calcularIndicadoresOperacionaisGuia({
        guiaId: guia.id,
        contadorSemana: estado.contadorSemana,
        metasSemana: metricasSemana.metasSemana,
        minimosSemana: metricasSemana.minimosSemana,
        oportunidadesSemana: metricasSemana.oportunidadesSemana,
        diasUteisSemana: metricasSemana.diasUteisSemana,
      });

      return indicadores.oportunidades > 0 && indicadores.atual === 0;
    })
    .sort((a, b) => {
      const ia = calcularIndicadoresOperacionaisGuia({
        guiaId: a.id,
        contadorSemana: estado.contadorSemana,
        metasSemana: metricasSemana.metasSemana,
        minimosSemana: metricasSemana.minimosSemana,
        oportunidadesSemana: metricasSemana.oportunidadesSemana,
        diasUteisSemana: metricasSemana.diasUteisSemana,
      });

      const ib = calcularIndicadoresOperacionaisGuia({
        guiaId: b.id,
        contadorSemana: estado.contadorSemana,
        metasSemana: metricasSemana.metasSemana,
        minimosSemana: metricasSemana.minimosSemana,
        oportunidadesSemana: metricasSemana.oportunidadesSemana,
        diasUteisSemana: metricasSemana.diasUteisSemana,
      });

      if (ib.gapMinimo !== ia.gapMinimo) {
        return ib.gapMinimo - ia.gapMinimo;
      }

      if (ib.gapMeta !== ia.gapMeta) {
        return ib.gapMeta - ia.gapMeta;
      }

      if (isModoPrioridade(modoDistribuicaoGuias)) {
        const prioridadeA = normalizarPrioridade(a?.nivelPrioridade);
        const prioridadeB = normalizarPrioridade(b?.nivelPrioridade);
        if (prioridadeB !== prioridadeA) {
          return prioridadeB - prioridadeA;
        }
      }

      return compareText(a?.nome, b?.nome);
    });

  for (const guiaSemServico of guiasSemServico) {
    let itemEscolhido = null;
    let guiaDoadorId = null;

    const candidatosSwap = itensProjetados
      .filter((item) => {
        if (!item?.id || !item?.date) return false;
        if (item.allocationStatus === "CLOSED") return false;
        if (!item.guiaIdFinal) return false;
        if (item.guiaIdFinal === guiaSemServico.id) return false;

        const guiaDoador = guiaById[item.guiaIdFinal];
        if (!guiaDoador?.id) return false;

        const indicadoresDoador = calcularIndicadoresOperacionaisGuia({
          guiaId: guiaDoador.id,
          contadorSemana: estado.contadorSemana,
          metasSemana: metricasSemana.metasSemana,
          minimosSemana: metricasSemana.minimosSemana,
          oportunidadesSemana: metricasSemana.oportunidadesSemana,
          diasUteisSemana: metricasSemana.diasUteisSemana,
        });

        // Só aceita tirar de quem está mais carregado
        if (indicadoresDoador.atual <= 1) return false;

        const protecaoDoador = Math.max(indicadoresDoador.minimo, 1);
        if (indicadoresDoador.atual <= protecaoDoador) return false;

        const usadosNoDiaSemDoador = new Set(estado.usedByDate[item.date] || []);
        usadosNoDiaSemDoador.delete(guiaDoador.id);

        const recipientElegivel = filtrarGuiasElegiveisParaServico({
          item,
          guiasDisponiveis: [guiaSemServico],
          usadosNoDia: usadosNoDiaSemDoador,
          mapaAfinidade,
          servicesData,
          usarAfinidadeGuiaPasseio,
          normalizarTexto,
        });

        return recipientElegivel.length > 0;
      })
      .map((item) => {
        const doador = guiaById[item.guiaIdFinal];
        const indicadoresDoador = calcularIndicadoresOperacionaisGuia({
          guiaId: doador.id,
          contadorSemana: estado.contadorSemana,
          metasSemana: metricasSemana.metasSemana,
          minimosSemana: metricasSemana.minimosSemana,
          oportunidadesSemana: metricasSemana.oportunidadesSemana,
          diasUteisSemana: metricasSemana.diasUteisSemana,
        });

        const afinidadeNovoGuia = usarAfinidadeGuiaPasseio
          ? obterNivelAfinidade(
              mapaAfinidade,
              guiaSemServico.id,
              item,
              servicesData,
              normalizarTexto,
            )
          : 0;

        return {
          item,
          doador,
          indicadoresDoador,
          afinidadeNovoGuia,
          excessoDoador:
            indicadoresDoador.atual -
            Math.max(indicadoresDoador.minimo, indicadoresDoador.meta, 1),
        };
      })
      .sort((a, b) => {
        if (b.excessoDoador !== a.excessoDoador) {
          return b.excessoDoador - a.excessoDoador;
        }

        if (b.indicadoresDoador.atual !== a.indicadoresDoador.atual) {
          return b.indicadoresDoador.atual - a.indicadoresDoador.atual;
        }

        if (usarAfinidadeGuiaPasseio && b.afinidadeNovoGuia !== a.afinidadeNovoGuia) {
          return b.afinidadeNovoGuia - a.afinidadeNovoGuia;
        }

        return compareText(a.item?.serviceName, b.item?.serviceName);
      });

    if (!candidatosSwap.length) {
      continue;
    }

    itemEscolhido = candidatosSwap[0].item;
    guiaDoadorId = candidatosSwap[0].doador.id;

    upsertAtualizacao(atualizacoes, {
      registroId: itemEscolhido.id,
      guiaId: guiaSemServico.id,
      guiaNome: guiaSemServico.nome,
      date: itemEscolhido.date,
      serviceName: itemEscolhido.serviceName,
      externalServiceId: itemEscolhido.externalServiceId || null,
    });

    estado.contadorSemana[guiaDoadorId] = Math.max(
      0,
      Number(estado.contadorSemana[guiaDoadorId] || 0) - 1,
    );

    estado.contadorSemana[guiaSemServico.id] =
      Number(estado.contadorSemana[guiaSemServico.id] || 0) + 1;

    removerUsoProjetadoDoDia({
      guiaId: guiaDoadorId,
      date: itemEscolhido.date,
      contagemGuiaDia,
      usedByDate: estado.usedByDate,
      diasTrabalhadosSemana: estado.diasTrabalhadosSemana,
    });

    adicionarUsoProjetadoNoDia({
      guiaId: guiaSemServico.id,
      date: itemEscolhido.date,
      contagemGuiaDia,
      usedByDate: estado.usedByDate,
      diasTrabalhadosSemana: estado.diasTrabalhadosSemana,
    });

    itemEscolhido.guiaIdFinal = guiaSemServico.id;
    itemEscolhido.guiaNomeFinal = guiaSemServico.nome;
  }

  return {
    atualizacoes,
    estado,
  };
};

export const gerarPlanoAlocacaoSemana = ({
  semana = [],
  guias = [],
  registrosSemana = [],
  mapaAfinidade = {},
  mapaDisponibilidade = {},
  servicesData = [],
  modoDistribuicaoGuias = "equilibrado",
  usarAfinidadeGuiaPasseio = false,
  agruparRegistrosPorServico,
  normalizarTexto,
}) => {
  const estado = aplicarRegistrosExistentesNoEstado(
    registrosSemana,
    construirEstadoInicialSemana(guias, semana),
  );

  const metricasSemana = construirMetricasEquilibrioSemana({
    semana,
    guias,
    registrosSemana,
    mapaAfinidade,
    mapaDisponibilidade,
    servicesData,
    usarAfinidadeGuiaPasseio,
    agruparRegistrosPorServico,
    normalizarTexto,
  });

  const atualizacoes = [];

  for (const dia of semana) {
    const registrosDia = registrosSemana.filter((r) => r.date === dia.date);
    const registrosAgrupados = agruparRegistrosPorServico(registrosDia);

    if (!registrosAgrupados.length) continue;

    const guiasDisponiveis = filtrarGuiasDisponiveisNoDia(
      guias,
      mapaDisponibilidade,
      dia.date,
    );

    if (!guiasDisponiveis.length) continue;

    const usadosNoDia = new Set(estado.usedByDate[dia.date] || []);

    const itensPendentes = registrosAgrupados.filter((item) => {
      if (!item?.id) return false;
      if (item.guiaId) return false;
      if (item.allocationStatus === "CLOSED") return false;
      return true;
    });

    const itensOrdenados = ordenarServicosPorEscassez(
      itensPendentes,
      guiasDisponiveis,
      usadosNoDia,
      mapaAfinidade,
      servicesData,
      usarAfinidadeGuiaPasseio,
      normalizarTexto,
    );

    for (const item of itensOrdenados) {
      if (usadosNoDia.size >= guiasDisponiveis.length) break;

      const guiaSelecionado = selecionarGuiaParaServico({
        item,
        guiasDisponiveis,
        usadosNoDia,
        mapaAfinidade,
        servicesData,
        contadorSemana: estado.contadorSemana,
        diasTrabalhadosSemana: estado.diasTrabalhadosSemana,
        mapaDisponibilidade,
        semanaRef: semana,
        modoDistribuicaoGuias,
        usarAfinidadeGuiaPasseio,
        normalizarTexto,
        metasSemana: metricasSemana.metasSemana,
        minimosSemana: metricasSemana.minimosSemana,
        oportunidadesSemana: metricasSemana.oportunidadesSemana,
        diasUteisSemana: metricasSemana.diasUteisSemana,
      });

      if (!guiaSelecionado) continue;

      upsertAtualizacao(atualizacoes, {
        registroId: item.id,
        guiaId: guiaSelecionado.id,
        guiaNome: guiaSelecionado.nome,
        date: dia.date,
        serviceName: item.serviceName,
        externalServiceId: item.externalServiceId || null,
      });

      atualizarEstadoAposAlocacao({
        guiaSelecionado,
        date: dia.date,
        contadorSemana: estado.contadorSemana,
        diasTrabalhadosSemana: estado.diasTrabalhadosSemana,
        usedByDate: estado.usedByDate,
      });

      usadosNoDia.add(guiaSelecionado.id);
    }
  }

  rebalancearGuiasSemServicoAoFinal({
    semana,
    guias,
    registrosSemana,
    atualizacoes,
    estado,
    mapaAfinidade,
    mapaDisponibilidade,
    servicesData,
    usarAfinidadeGuiaPasseio,
    modoDistribuicaoGuias,
    agruparRegistrosPorServico,
    normalizarTexto,
    metricasSemana,
  });

  return {
    atualizacoes,
    estadoFinal: estado,
    metricasSemana,
  };
};