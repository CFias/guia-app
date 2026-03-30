// plannerAllocation.js

const toNumber = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

const compareText = (a, b) =>
    String(a || "").localeCompare(String(b || ""), "pt-BR", {
        sensitivity: "base",
    });

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
}) => {
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

        const prioridadeA = normalizarPrioridade(a?.nivelPrioridade);
        const prioridadeB = normalizarPrioridade(b?.nivelPrioridade);

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

        if (usarAfinidadeGuiaPasseio && afinidadeB !== afinidadeA) {
            return afinidadeB - afinidadeA;
        }

        if (prioridadeB !== prioridadeA) {
            return prioridadeB - prioridadeA;
        }

        if (modoDistribuicaoGuias === "equilibrado") {
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
        } else if (modoDistribuicaoGuias === "seguir_nivel_selecionado") {
            if (cargaA.totalServicos !== cargaB.totalServicos) {
                return cargaA.totalServicos - cargaB.totalServicos;
            }

            if (cargaA.frequencia !== cargaB.frequencia) {
                return cargaA.frequencia - cargaB.frequencia;
            }

            if (cargaA.ocupacao !== cargaB.ocupacao) {
                return cargaA.ocupacao - cargaB.ocupacao;
            }
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

    const candidatosOrdenados = ordenarGuiasParaServico({
        elegiveis,
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
            });

            if (!guiaSelecionado) continue;

            atualizacoes.push({
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

    return {
        atualizacoes,
        estadoFinal: estado,
    };
};