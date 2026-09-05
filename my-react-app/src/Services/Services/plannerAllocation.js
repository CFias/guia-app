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
  const modo = String(modoDistribuicaoGuias || "")
    .trim()
    .toLowerCase();
  return modo === "prioridade" || modo === "seguir_nivel_selecionado";
};

export const normalizarPrioridade = (valor) => {
  const prioridade = toNumber(valor, 2);
  return Math.max(1, Math.min(prioridade, 5));
};

// Fator de folga do teto justo por nível de prioridade. Só é aplicado no
// modo "prioridade" — no modo "equilibrado" todo mundo usa fator 1.0,
// independente do nível cadastrado.
const FATOR_TETO_POR_PRIORIDADE = { 1: 1.0, 2: 1.15, 3: 1.3 };

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

// Nível de afinidade (0 a 100) do guia para o passeio deste item.
// 0 = "Não operar" — é tratado como exclusão dura em
// filtrarGuiasElegiveisParaServico, não apenas como desempate fraco.
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

// Mantida por compatibilidade (pode estar em uso em outro lugar do
// sistema). Não é mais usada internamente pela nova lógica de seleção,
// que lê diretamente do "estado" corrente.
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

// Elegibilidade = disponibilidade (já filtrada em guiasDisponiveis) +
// afinidade/compatibilidade com o passeio. Isso é um filtro DURO: quem
// não passa aqui não pode nem entrar na disputa pelo serviço.
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

// Processa primeiro os serviços com menos guias elegíveis disponíveis —
// evita "gastar" um guia raro num serviço fácil e depois travar num
// serviço difícil sem ninguém disponível.
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

// ---------------------------------------------------------------------
// Garantias mínimas por nível de prioridade (regra 3 do usuário):
//  - Nível 1 e 2: garante 1 serviço, desde que exista oportunidade.
//  - Nível 3: garante 1 sempre, e sobe para 2 (em dias distintos) se o
//    guia tiver oportunidade em 2 ou mais dias da semana.
// No modo "equilibrado" o nível é ignorado: todo mundo usa a garantia
// básica de nível 1/2.
// ---------------------------------------------------------------------
export const calcularMetaMinimaPrioridade = (
  guia,
  diasUteisGuia,
  modoPrioridade,
) => {
  if (!modoPrioridade) return 1;

  const prioridade = normalizarPrioridade(guia?.nivelPrioridade);

  if (prioridade >= 3) {
    return diasUteisGuia >= 2 ? 2 : 1;
  }

  return 1;
};

// Quantas semanas de histórico real (vindo da API) entram no cálculo de
// equilíbrio de médio prazo.
const NUMERO_SEMANAS_HISTORICO_PADRAO = 2;

// Tenta casar o guia do Firestore com as chaves do histórico (que vêm
// por nome normalizado, extraído da API). Testa apelido e nome
// completo — o que existir — sem exigir um campo específico.
const obterChavesNomeGuia = (guia, normalizarTexto) => {
  const chaves = [];
  if (guia?.nickname) chaves.push(normalizarTexto(guia.nickname));
  if (guia?.nome) chaves.push(normalizarTexto(guia.nome));
  return chaves.filter(Boolean);
};

// Calcula, para cada guia, quantas oportunidades elegíveis ele teria na
// semana (serviços que ele PODERIA fazer, considerando disponibilidade +
// afinidade), em quantos dias distintos, e a garantia mínima do seu
// nível. Isso roda uma vez no início — a alocação em si é quem decide,
// serviço a serviço, quem efetivamente recebe cada vaga.
const construirMetricasSemana = ({
  semana = [],
  guias = [],
  registrosSemana = [],
  mapaAfinidade = {},
  mapaDisponibilidade = {},
  servicesData = [],
  usarAfinidadeGuiaPasseio = false,
  modoDistribuicaoGuias = "equilibrado",
  agruparRegistrosPorServico,
  normalizarTexto,
  historicoPorGuia = {},
  numeroSemanasHistorico = NUMERO_SEMANAS_HISTORICO_PADRAO,
}) => {
  const modoPrioridade = isModoPrioridade(modoDistribuicaoGuias);

  const oportunidadesSemana = {};
  const diasUteisSemanaSet = {};

  guias.forEach((g) => {
    oportunidadesSemana[g.id] = 0;
    diasUteisSemanaSet[g.id] = new Set();
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

    itensPendentes.forEach((item) => {
      const elegiveis = filtrarGuiasElegiveisParaServico({
        item,
        guiasDisponiveis,
        usadosNoDia: new Set(),
        mapaAfinidade,
        servicesData,
        usarAfinidadeGuiaPasseio,
        normalizarTexto,
      });

      elegiveis.forEach((g) => {
        oportunidadesSemana[g.id] = Number(oportunidadesSemana[g.id] || 0) + 1;
        diasUteisSemanaSet[g.id].add(dia.date);
      });
    });
  }

  const diasUteisSemana = {};
  guias.forEach((g) => {
    diasUteisSemana[g.id] = diasUteisSemanaSet[g.id]?.size || 0;
  });

  const minimosSemana = {};
  guias.forEach((g) => {
    minimosSemana[g.id] =
      Number(oportunidadesSemana[g.id] || 0) > 0
        ? calcularMetaMinimaPrioridade(g, diasUteisSemana[g.id], modoPrioridade)
        : 0;
  });

  const guiasComOportunidade = guias.filter(
    (g) => Number(oportunidadesSemana[g.id] || 0) > 0,
  );

  // Média semanal real de cada guia nas últimas N semanas (histórico
  // vindo da API do próprio sistema, casado por nome). Não afeta a
  // garantia mínima da semana atual — só entra no equilíbrio/desempate.
  const historicoMedioSemanalPorGuia = {};
  guias.forEach((g) => {
    const chaves = obterChavesNomeGuia(g, normalizarTexto);
    const totalHistorico = chaves.length
      ? Math.max(
          ...chaves.map((chave) => Number(historicoPorGuia?.[chave] || 0)),
        )
      : 0;

    historicoMedioSemanalPorGuia[g.id] =
      numeroSemanasHistorico > 0 ? totalHistorico / numeroSemanasHistorico : 0;
  });

  return {
    modoPrioridade,
    oportunidadesSemana,
    diasUteisSemana,
    minimosSemana,
    guiasComOportunidade,
    historicoMedioSemanalPorGuia,
  };
};

// Indicadores "ao vivo" de um guia no momento da decisão: quanto ele já
// tem, quanto falta pro mínimo do nível dele, e qual o teto justo atual
// (média corrente entre quem tem oportunidade, com folga maior para
// prioridade mais alta — regra "não pode ter muito mais serviço que os
// outros níveis"). A garantia mínima olha só a semana atual; o
// equilíbrio/desempate usa "carga recente" (semana atual + média das
// últimas semanas de histórico real), pra não repetir sempre os mesmos.
const calcularIndicadoresGuia = ({ guia, estado, metricasSemana }) => {
  const atual = Number(estado.contadorSemana[guia.id] || 0);
  const diasTrabalhados = estado.diasTrabalhadosSemana[guia.id]?.size || 0;
  const oportunidades = Number(
    metricasSemana.oportunidadesSemana[guia.id] || 0,
  );
  const diasUteis = Number(metricasSemana.diasUteisSemana[guia.id] || 0);
  const minimo = Number(metricasSemana.minimosSemana[guia.id] || 0);
  const historicoMedioSemanal = Number(
    metricasSemana.historicoMedioSemanalPorGuia?.[guia.id] || 0,
  );

  const cargaRecente = atual + historicoMedioSemanal;

  const grupo = metricasSemana.guiasComOportunidade || [];
  const mediaCargaRecenteGrupo = grupo.length
    ? grupo.reduce((acc, gg) => {
        const atualGg = Number(estado.contadorSemana[gg.id] || 0);
        const historicoGg = Number(
          metricasSemana.historicoMedioSemanalPorGuia?.[gg.id] || 0,
        );
        return acc + atualGg + historicoGg;
      }, 0) / grupo.length
    : 0;

  const prioridade = normalizarPrioridade(guia?.nivelPrioridade);
  const fatorTeto = metricasSemana.modoPrioridade
    ? FATOR_TETO_POR_PRIORIDADE[Math.min(prioridade, 3)] || 1.15
    : 1.0;

  const teto = Math.max(minimo, mediaCargaRecenteGrupo * fatorTeto);

  return {
    atual,
    cargaRecente,
    diasTrabalhados,
    oportunidades,
    diasUteis,
    minimo,
    teto,
    mediaGeral: mediaCargaRecenteGrupo,
    prioridade,
    abaixoDoMinimo: oportunidades > 0 && atual < minimo,
    excedente: Math.max(0, cargaRecente - teto),
  };
};

// Ordena os guias elegíveis para UM serviço específico, seguindo as
// regras (nessa ordem de desempate):
//   1) quem ainda não bateu a garantia mínima do próprio nível (só
//      semana atual) entra na frente de quem já bateu;
//   2) nível de prioridade mais alto sempre à frente — MAS só enquanto
//      os dois candidatos ainda estiverem dentro de uma folga razoável
//      da média do grupo (carga recente <= média + 1). Carga recente =
//      semana atual + média das últimas semanas de histórico real.
//      Assim que alguém passa dessa folga, a prioridade para de valer
//      pra ele e a distribuição cai no critério 3 — isso é o que impede
//      um nível mais alto (ou qualquer guia) disparar muito à frente;
//   3) quem tem MENOS carga recente entra na frente — é o que garante
//      equilíbrio real entre pares do mesmo nível, olhando também as
//      últimas semanas, não só a atual;
//   4) afinidade (nível de aptidão) ajuda a desempatar;
//   5) menos dias trabalhados na semana — ajuda a espalhar por dias
//      diferentes, não só por contagem total;
//   6) nome, para desempate determinístico.
export const ordenarGuiasParaServico = ({
  elegiveis = [],
  item,
  mapaAfinidade,
  servicesData,
  estado,
  metricasSemana,
  usarAfinidadeGuiaPasseio = false,
  normalizarTexto,
}) => {
  const candidatos = elegiveis.map((guia) => ({
    guia,
    afinidade: usarAfinidadeGuiaPasseio
      ? obterNivelAfinidade(
          mapaAfinidade,
          guia.id,
          item,
          servicesData,
          normalizarTexto,
        )
      : 0,
    indicadores: calcularIndicadoresGuia({ guia, estado, metricasSemana }),
  }));

  // margem de folga acima da média geral em que o nível de prioridade
  // ainda "vale" como desempate — acima disso, cai pro equilíbrio puro.
  const MARGEM_FOLGA_PRIORIDADE = 1;

  candidatos.sort((a, b) => {
    if (a.indicadores.abaixoDoMinimo !== b.indicadores.abaixoDoMinimo) {
      return a.indicadores.abaixoDoMinimo ? -1 : 1;
    }

    const prioridadeAindaVale =
      metricasSemana.modoPrioridade &&
      a.indicadores.cargaRecente <=
        a.indicadores.mediaGeral + MARGEM_FOLGA_PRIORIDADE &&
      b.indicadores.cargaRecente <=
        b.indicadores.mediaGeral + MARGEM_FOLGA_PRIORIDADE;

    if (
      prioridadeAindaVale &&
      b.indicadores.prioridade !== a.indicadores.prioridade
    ) {
      return b.indicadores.prioridade - a.indicadores.prioridade;
    }

    if (a.indicadores.cargaRecente !== b.indicadores.cargaRecente) {
      return a.indicadores.cargaRecente - b.indicadores.cargaRecente;
    }

    if (usarAfinidadeGuiaPasseio && b.afinidade !== a.afinidade) {
      return b.afinidade - a.afinidade;
    }

    if (a.indicadores.diasTrabalhados !== b.indicadores.diasTrabalhados) {
      return a.indicadores.diasTrabalhados - b.indicadores.diasTrabalhados;
    }

    return compareText(a.guia?.nome, b.guia?.nome);
  });

  return candidatos.map((c) => c.guia);
};

// Filtra os elegíveis para o serviço e devolve o primeiro da ordenação
// acima — ou seja, o guia que deve receber esse serviço.
export const selecionarGuiaParaServico = ({
  item,
  guiasDisponiveis = [],
  usadosNoDia,
  mapaAfinidade,
  servicesData,
  estado,
  metricasSemana,
  usarAfinidadeGuiaPasseio = false,
  normalizarTexto,
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

  const ordenados = ordenarGuiasParaServico({
    elegiveis,
    item,
    mapaAfinidade,
    servicesData,
    estado,
    metricasSemana,
    usarAfinidadeGuiaPasseio,
    normalizarTexto,
  });

  return ordenados[0] || null;
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
          override?.guiaId !== undefined
            ? override.guiaId
            : item.guiaId || null,
        guiaNomeFinal:
          override?.guiaNome !== undefined
            ? override.guiaNome
            : item.guiaNome || null,
      });
    });
  }

  return itens;
};

// ---------------------------------------------------------------------
// Passe final de garantia mínima: depois da alocação gulosa dia a dia,
// alguns guias podem ter ficado abaixo da garantia do próprio nível
// (ex.: nível 3 que só pegou 1 dia mas tinha oportunidade em 2). Este
// passe tenta "roubar" um serviço de quem está acima do próprio teto
// justo e passar para quem está abaixo do mínimo — sempre em um dia
// diferente dos que o destinatário já trabalha, pra garantir que a
// regra de "mais de 1 dia" realmente vire um dia novo, não uma troca
// boba dentro do mesmo dia.
// ---------------------------------------------------------------------
const rebalancearGarantiasDePrioridade = ({
  semana = [],
  guias = [],
  registrosSemana = [],
  atualizacoes = [],
  estado,
  mapaAfinidade = {},
  servicesData = [],
  usarAfinidadeGuiaPasseio = false,
  agruparRegistrosPorServico,
  normalizarTexto,
  metricasSemana,
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

  const obterCandidatosAbaixoDoMinimo = () =>
    guias
      .filter((g) => g?.id && g.ativo)
      .map((g) => ({
        guia: g,
        indicadores: calcularIndicadoresGuia({
          guia: g,
          estado,
          metricasSemana,
        }),
      }))
      .filter((c) => c.indicadores.abaixoDoMinimo)
      .sort((a, b) => {
        // quem tem zero serviço vem antes de quem só falta o "dia extra"
        if ((a.indicadores.atual === 0) !== (b.indicadores.atual === 0)) {
          return a.indicadores.atual === 0 ? -1 : 1;
        }

        if (
          metricasSemana.modoPrioridade &&
          b.indicadores.prioridade !== a.indicadores.prioridade
        ) {
          return b.indicadores.prioridade - a.indicadores.prioridade;
        }

        return compareText(a.guia?.nome, b.guia?.nome);
      })
      .map((c) => c.guia);

  // Reprocessa a lista de quem está abaixo do mínimo a cada troca feita,
  // já que uma troca muda os indicadores de todo mundo.
  let candidatos = obterCandidatosAbaixoDoMinimo();
  let tentativasSemProgresso = 0;

  while (candidatos.length && tentativasSemProgresso < candidatos.length) {
    const guiaAlvo = candidatos[0];

    const candidatosSwap = itensProjetados
      .filter((item) => {
        if (!item?.id || !item?.date) return false;
        if (item.allocationStatus === "CLOSED") return false;
        if (!item.guiaIdFinal) return false;
        if (item.guiaIdFinal === guiaAlvo.id) return false;

        // não faz sentido dar um dia que o próprio guia alvo já trabalha
        if (estado.diasTrabalhadosSemana[guiaAlvo.id]?.has(item.date)) {
          return false;
        }

        const doador = guiaById[item.guiaIdFinal];
        if (!doador?.id) return false;

        const indicadoresDoador = calcularIndicadoresGuia({
          guia: doador,
          estado,
          metricasSemana,
        });

        // só tira de quem está acima do próprio teto (tem folga de sobra)
        if (indicadoresDoador.excedente <= 0) return false;
        if (indicadoresDoador.atual <= Math.max(indicadoresDoador.minimo, 1)) {
          return false;
        }

        const usadosNoDiaSemDoador = new Set(
          estado.usedByDate[item.date] || [],
        );
        usadosNoDiaSemDoador.delete(doador.id);

        const recipientElegivel = filtrarGuiasElegiveisParaServico({
          item,
          guiasDisponiveis: [guiaAlvo],
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
        const indicadoresDoador = calcularIndicadoresGuia({
          guia: doador,
          estado,
          metricasSemana,
        });

        const afinidadeNovoGuia = usarAfinidadeGuiaPasseio
          ? obterNivelAfinidade(
              mapaAfinidade,
              guiaAlvo.id,
              item,
              servicesData,
              normalizarTexto,
            )
          : 0;

        return { item, doador, indicadoresDoador, afinidadeNovoGuia };
      })
      .sort((a, b) => {
        if (b.indicadoresDoador.excedente !== a.indicadoresDoador.excedente) {
          return b.indicadoresDoador.excedente - a.indicadoresDoador.excedente;
        }

        if (
          usarAfinidadeGuiaPasseio &&
          b.afinidadeNovoGuia !== a.afinidadeNovoGuia
        ) {
          return b.afinidadeNovoGuia - a.afinidadeNovoGuia;
        }

        return compareText(a.item?.serviceName, b.item?.serviceName);
      });

    if (!candidatosSwap.length) {
      // não tem doador viável pra esse guia agora — tira ele da fila e
      // tenta o próximo, mas conta como "tentativa sem progresso" pra
      // não entrar num loop infinito quando ninguém mais pode ser trocado.
      candidatos = candidatos.slice(1);
      tentativasSemProgresso += 1;
      continue;
    }

    const { item: itemEscolhido, doador } = candidatosSwap[0];

    upsertAtualizacao(atualizacoes, {
      registroId: itemEscolhido.id,
      guiaId: guiaAlvo.id,
      guiaNome: guiaAlvo.nome,
      date: itemEscolhido.date,
      serviceName: itemEscolhido.serviceName,
      externalServiceId: itemEscolhido.externalServiceId || null,
    });

    estado.contadorSemana[doador.id] = Math.max(
      0,
      Number(estado.contadorSemana[doador.id] || 0) - 1,
    );
    estado.usedByDate[itemEscolhido.date]?.delete(doador.id);
    if (
      !itensProjetados.some(
        (i) =>
          i !== itemEscolhido &&
          i.guiaIdFinal === doador.id &&
          i.date === itemEscolhido.date,
      )
    ) {
      estado.diasTrabalhadosSemana[doador.id]?.delete(itemEscolhido.date);
    }

    estado.contadorSemana[guiaAlvo.id] =
      Number(estado.contadorSemana[guiaAlvo.id] || 0) + 1;
    if (!estado.usedByDate[itemEscolhido.date]) {
      estado.usedByDate[itemEscolhido.date] = new Set();
    }
    estado.usedByDate[itemEscolhido.date].add(guiaAlvo.id);
    if (!estado.diasTrabalhadosSemana[guiaAlvo.id]) {
      estado.diasTrabalhadosSemana[guiaAlvo.id] = new Set();
    }
    estado.diasTrabalhadosSemana[guiaAlvo.id].add(itemEscolhido.date);

    itemEscolhido.guiaIdFinal = guiaAlvo.id;
    itemEscolhido.guiaNomeFinal = guiaAlvo.nome;

    // progresso feito: recalcula do zero quem ainda está abaixo do mínimo
    candidatos = obterCandidatosAbaixoDoMinimo();
    tentativasSemProgresso = 0;
  }

  return { atualizacoes, estado };
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
  // Histórico real (nome normalizado do guia -> total de serviços nas
  // últimas semanas), vindo direto da API do sistema. Opcional — se não
  // for passado, o comportamento é idêntico ao de antes (equilíbrio só
  // dentro da semana atual).
  historicoPorGuia = {},
  numeroSemanasHistorico = NUMERO_SEMANAS_HISTORICO_PADRAO,
}) => {
  const estado = aplicarRegistrosExistentesNoEstado(
    registrosSemana,
    construirEstadoInicialSemana(guias, semana),
  );

  const metricasSemana = construirMetricasSemana({
    semana,
    guias,
    registrosSemana,
    mapaAfinidade,
    mapaDisponibilidade,
    servicesData,
    usarAfinidadeGuiaPasseio,
    modoDistribuicaoGuias,
    agruparRegistrosPorServico,
    normalizarTexto,
    historicoPorGuia,
    numeroSemanasHistorico,
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
        estado,
        metricasSemana,
        usarAfinidadeGuiaPasseio,
        normalizarTexto,
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

  rebalancearGarantiasDePrioridade({
    semana,
    guias,
    registrosSemana,
    atualizacoes,
    estado,
    mapaAfinidade,
    servicesData,
    usarAfinidadeGuiaPasseio,
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
