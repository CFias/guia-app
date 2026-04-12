// plannerUtils.js

export const DIAS = [
    "Segunda",
    "Terça",
    "Quarta",
    "Quinta",
    "Sexta",
    "Sábado",
    "Domingo",
];

export const API_BASE =
    "https://driversalvador.phoenix.comeialabs.com/scale/reserve-service";

export const EXPAND =
    "service,schedule,reserve,establishmentOrigin,establishmentDestination,establishmentOrigin.region,establishmentDestination.region,reserve.partner,reserve.customer,reserve.pdvPayment,reserve.pdvPayment.user,additionalReserveServices,additionalReserveServices.additional,additionalReserveServices.provider,roadmapService,roadmapService.roadmap,auxRoadmapService.roadmap.serviceOrder,auxRoadmapService.roadmap.serviceOrder.vehicle,auxRoadmapService.roadmap.driver,auxRoadmapService.roadmap.guide,roadmapService.roadmap.driver,roadmapService.roadmap.guide,roadmapService.roadmap.serviceOrder,roadmapService.roadmap.serviceOrder.vehicle";

export const SERVICOS_IGNORADOS = [
    "01 PASSEIO A ESCOLHER NO DESTINO",
    "VOLTA FRADES COM ITAPARICA",
    "STAFF MSC - PORTO SALVADOR",
    "COORDENAÇÃO MSC - PORTO SALVADOR",
    "PASSEIO PRAIA DO FORTE 4H (LTN-VOLTA)",
    "COMBO FLEX 03 PASSEIOS",
    "PRAIA DO FORTE E GUARAJUBA",
    "PRAIAS DO LITORAL",
    "CITY TOUR SAINDO DO LITORAL",
    "CITY TOUR HISTÓRICO + PANORÂMICO",
    "PASSEIO À PRAIA DO FORTE (SHUTTLE)",
    "TRANSFER - MORRO DE SÃO PAULO / SALVADOR (SEMI TERRESTRE)",
    "TRANSFER - SALVADOR / MORRO DE SÃO PAULO (SEMI TERRESTRE)",
    "TRANSFER - SALVADOR / MORRO DE SÃO PAULO (CATAMARÃ)",
    "TRANSFER - MORRO DE SÃO PAULO / SALVADOR (CATAMARÃ)",
    "HOTEL SALVADOR / HOTEL LITORAL NORTE",
    "HOTEL SALVADOR X HOTEL LENÇOIS",
    "HOTEL SALVADOR/ TERMINAL NAUTICO",
    "TERMINAL NAUTICO / HOTEL SALVADOR",
    "HOTEL LITORAL NORTE / HOTEL SALVADOR",
    "HOTEL SALVADOR / HOTEL SALVADOR",
    "TERMINAL NAUTICO / HOTEL LITORAL NORTE",
    "MASSARANDUPIÓ X COSTA DO SAUIPE",
];

export const TERMOS_IGNORADOS = [
    // "PANORAMICO",
];

export const MAPA_NOMES_CANONICOS = {
    "city tour historico e panoramico": "CITY TOUR HISTORICO E PANORAMICO",
    "city tour historico panoramico": "CITY TOUR HISTORICO E PANORAMICO",

    "tour de ilhas frades e itaparica": "TOUR DE ILHAS - FRADES E ITAPARICA",
    "ilhas frades + itaparica": "TOUR DE ILHAS - FRADES E ITAPARICA",
    "ilhas frades itaparica": "TOUR DE ILHAS - FRADES E ITAPARICA",

    "volta frades com itaparica": "VOLTA FRADES COM ITAPARICA",

    "city tour panoramico": "CITY TOUR PANORAMICO",
    "city tour historico": "CITY TOUR HISTORICO",
};

export const normalizarTexto = (texto = "") =>
    String(texto)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[|]/g, " ")
        .replace(/[-–—]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

export const obterNomeCanonico = (nome = "") => {
    const normalizado = normalizarTexto(nome);
    return MAPA_NOMES_CANONICOS[normalizado] || String(nome).trim().toUpperCase();
};

export const deveIgnorarServico = (nome = "") => {
    const nomeCanonico = obterNomeCanonico(nome);
    const nomeNormalizado = normalizarTexto(nomeCanonico);

    const ignoradoExato = SERVICOS_IGNORADOS.some(
        (servico) =>
            normalizarTexto(obterNomeCanonico(servico)) === nomeNormalizado,
    );

    const ignoradoPorTrecho = TERMOS_IGNORADOS.some((termo) =>
        nomeNormalizado.includes(normalizarTexto(termo)),
    );

    return ignoradoExato || ignoradoPorTrecho;
};

export const gerarSemana = (offset = 0) => {
    const hoje = new Date();
    const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    base.setDate(base.getDate() + offset * 7);

    const diaSemana = base.getDay() === 0 ? 7 : base.getDay();
    const segunda = new Date(base);
    segunda.setDate(base.getDate() - (diaSemana - 1));

    return DIAS.map((dia, index) => {
        const d = new Date(segunda);
        d.setDate(segunda.getDate() + index);

        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");

        return {
            day: dia,
            date: `${yyyy}-${mm}-${dd}`,
            label: `${dia} — ${dd}/${mm}/${yyyy}`,
        };
    });
};

export const formatarPeriodoSemana = (semana = []) => {
    if (!semana.length) return "";

    const formatar = (data) => {
        const [ano, mes, dia] = data.split("-");
        return `${dia}/${mes}/${ano}`;
    };

    return `${formatar(semana[0].date)} até ${formatar(
        semana[semana.length - 1].date,
    )}`;
};

export const getSemanaKey = (semanaRef = []) => {
    if (!Array.isArray(semanaRef) || semanaRef.length === 0) return null;

    const inicio = semanaRef[0]?.date;
    const fim = semanaRef[semanaRef.length - 1]?.date;

    if (!inicio || !fim) return null;

    return `${inicio}_${fim}`;
};

export const mapearRegistrosPorData = (semana = [], registrosLista = []) => {
    const mapa = {};

    semana.forEach((dia) => {
        mapa[dia.date] = [];
    });

    registrosLista.forEach((item) => {
        if (!item?.date) return;

        if (!mapa[item.date]) {
            mapa[item.date] = [];
        }

        mapa[item.date].push(item);
    });

    return mapa;
};

export const extrairListaResposta = (json) => {
    if (Array.isArray(json)) return json;

    const candidatos = [
        json?.data,
        json?.results,
        json?.rows,
        json?.items,
        json?.content,
        json?.data?.data,
        json?.data?.results,
        json?.payload,
        json?.payload?.data,
    ];

    for (const item of candidatos) {
        if (Array.isArray(item)) return item;
    }

    return [];
};

export const extrairNomePasseio = (item) =>
    item?.service?.name ||
    item?.service?.nome ||
    item?.reserveService?.service?.name ||
    item?.name ||
    "";

export const extrairServiceIdExterno = (item) =>
    Number(item?.service_id || item?.service?.id || 0) || null;

export const extrairDataServico = (item) => {
    const dataHora =
        item?.presentation_hour ||
        item?.presentation_hour_end ||
        item?.date ||
        item?.execution_date ||
        "";

    return dataHora ? String(dataHora).slice(0, 10) : "";
};

export const extrairContagemPax = (item) => {
    const toNumber = (valor) => {
        const n = Number(valor);
        return Number.isFinite(n) ? n : 0;
    };

    const pegarPrimeiroNumeroValido = (...valores) => {
        for (const valor of valores) {
            if (valor === null || valor === undefined || valor === "") continue;
            const numero = Number(valor);
            if (Number.isFinite(numero)) return numero;
        }
        return 0;
    };

    const adultos = pegarPrimeiroNumeroValido(
        item?.is_adult_count,
        item?.adult_count,
        item?.adults,
        item?.reserve?.is_adult_count,
        item?.reserve?.adult_count,
        item?.reserve?.adults,
        item?.reserveService?.is_adult_count,
        item?.reserveService?.adult_count,
        item?.reserveService?.adults,
    );

    const criancas = pegarPrimeiroNumeroValido(
        item?.is_child_count,
        item?.child_count,
        item?.children,
        item?.reserve?.is_child_count,
        item?.reserve?.child_count,
        item?.reserve?.children,
        item?.reserveService?.is_child_count,
        item?.reserveService?.child_count,
        item?.reserveService?.children,
    );

    const infants = pegarPrimeiroNumeroValido(
        item?.is_infant_count,
        item?.infant_count,
        item?.infants,
        item?.reserve?.is_infant_count,
        item?.reserve?.infant_count,
        item?.reserve?.infants,
        item?.reserveService?.is_infant_count,
        item?.reserveService?.infant_count,
        item?.reserveService?.infants,
    );

    const totalCalculado =
        toNumber(adultos) + toNumber(criancas) + toNumber(infants);

    const totalDireto = pegarPrimeiroNumeroValido(
        item?.passengers,
        item?.passenger_count,
        item?.pax,
        item?.quantity_pax,
        item?.reserve?.passengers,
        item?.reserve?.passenger_count,
        item?.reserve?.pax,
        item?.reserve?.quantity_pax,
        item?.reserveService?.passengers,
        item?.reserveService?.passenger_count,
        item?.reserveService?.pax,
        item?.reserveService?.quantity_pax,
    );

    const total = Math.max(totalDireto, totalCalculado);

    return {
        adultos: toNumber(adultos),
        criancas: toNumber(criancas),
        infants: toNumber(infants),
        total: toNumber(total),
    };
};

export const ehServicoDisp = (nome = "") => {
    const nomeNormalizado = normalizarTexto(nome);
    return nomeNormalizado.includes("disp");
};

export const extrairNomeVendedor = (item) => {
    const pagamentos = Array.isArray(item?.reserve?.pdvPayment)
        ? item.reserve.pdvPayment
        : [];

    const nomes = pagamentos
        .map((pag) => pag?.user?.name || "")
        .filter((nome) => typeof nome === "string" && nome.trim());

    return nomes[0] || "";
};

export const extrairNomeOperadora = (item) => {
    return (
        item?.reserve?.partner?.fantasy_name ||
        item?.reserve?.partner?.name ||
        item?.reserve?.customer?.fantasy_name ||
        item?.reserve?.customer?.name ||
        ""
    );
};

export const extrairPrimeiroNome = (nome = "") => {
    const limpo = String(nome).trim();
    if (!limpo) return "";
    return limpo.split(/\s+/)[0].toUpperCase();
};

export const extrairResponsavelDisp = (item) => {
    const vendedor = extrairPrimeiroNome(extrairNomeVendedor(item));
    if (vendedor) return vendedor;

    const operadora = extrairPrimeiroNome(extrairNomeOperadora(item));
    if (operadora) return operadora;

    return "";
};

export const montarNomeServicoExibicao = (item) => {
    const nomeBase = obterNomeCanonico(extrairNomePasseio(item));

    if (!ehServicoDisp(nomeBase)) {
        return nomeBase;
    }

    const responsavel = extrairResponsavelDisp(item);

    return responsavel ? `${nomeBase} - ${responsavel}` : nomeBase;
};

export const montarChaveImportacao = ({ date, externalServiceId, serviceName }) =>
    `${date}_${Number(externalServiceId || 0)}_${normalizarTexto(
        serviceName || "",
    )}`;

export const montarChaveApiServico = ({ date, externalServiceId, serviceName }) =>
    `${date}_${Number(externalServiceId || 0)}_${normalizarTexto(
        serviceName || "",
    )}`;

export const encontrarServiceCatalogo = (
    serviceIdExterno,
    nomeApi,
    listaServices = [],
) => {
    return (
        listaServices.find(
            (s) => Number(s.externalServiceId || 0) === Number(serviceIdExterno || 0),
        ) ||
        listaServices.find((s) => {
            const nomeService = normalizarTexto(s.externalName || s.nome || "");
            const nomeComparado = normalizarTexto(nomeApi || "");

            return (
                nomeService === nomeComparado ||
                nomeComparado.startsWith(`${nomeService} `) ||
                nomeComparado.startsWith(`${nomeService} -`)
            );
        }) ||
        null
    );
};

export const agruparRegistrosPorServico = (registros = []) => {
    const mapa = {};

    registros.forEach((r) => {
        if (!r?.date) return;

        const nomeOriginal = r.serviceName || "";
        const nomeCanonico = obterNomeCanonico(nomeOriginal);

        if (deveIgnorarServico(nomeCanonico)) return;

        const chave = `${r.date}_${nomeCanonico}`;

        if (!mapa[chave]) {
            mapa[chave] = {
                id: r.id,
                serviceId: r.serviceId || null,
                externalServiceId: r.externalServiceId || null,
                serviceName: nomeCanonico,
                originalNames: new Set(),
                passengers: 0,
                adultCount: 0,
                childCount: 0,
                infantCount: 0,
                guiaId: r.guiaId || null,
                guiaNome: r.guiaNome || null,
                date: r.date,
                day: r.day,
                manual: !!r.manual,
                importedFromApi: !!r.importedFromApi,
                allocationStatus: r.allocationStatus || "OPEN",
            };
        }

        mapa[chave].originalNames.add(nomeOriginal);

        const passageirosRegistro = Number(r.passengers ?? 0);
        const adultos = Number(r.adultCount ?? 0);
        const criancas = Number(r.childCount ?? 0);
        const infants = Number(r.infantCount ?? 0);
        const totalDetalhadoRegistro = adultos + criancas + infants;

        mapa[chave].passengers += Math.max(
            passageirosRegistro,
            totalDetalhadoRegistro,
        );

        mapa[chave].adultCount += adultos;
        mapa[chave].childCount += criancas;
        mapa[chave].infantCount += infants;

        if (!mapa[chave].guiaId && r.guiaId) {
            mapa[chave].guiaId = r.guiaId;
            mapa[chave].guiaNome = r.guiaNome || null;
            mapa[chave].id = r.id;
        }

        if (r.manual) mapa[chave].manual = true;

        if (r.allocationStatus === "CLOSED") {
            mapa[chave].allocationStatus = "CLOSED";
        }
    });

    return Object.values(mapa)
        .map((item) => {
            const totalDetalhado =
                Number(item.adultCount ?? 0) +
                Number(item.childCount ?? 0) +
                Number(item.infantCount ?? 0);

            return {
                ...item,
                originalNames: Array.from(item.originalNames),
                passengers: Math.max(Number(item.passengers ?? 0), totalDetalhado),
            };
        })
        .sort((a, b) =>
            (a.serviceName || "").localeCompare(b.serviceName || "", "pt-BR", {
                sensitivity: "base",
            }),
        );
};

export const construirMapaApiPorChave = (apiSemanaListaPasseios = []) => {
    const mapaApi = {};

    apiSemanaListaPasseios.forEach((item) => {
        const chave = montarChaveApiServico({
            date: item.date,
            externalServiceId: item.externalServiceId,
            serviceName: item.serviceName,
        });

        mapaApi[chave] = item;
    });

    return mapaApi;
};

export const aplicarPaxDaApiNosRegistros = (
    registros = [],
    apiSemanaListaPasseios = [],
) => {
    const mapaApi = construirMapaApiPorChave(apiSemanaListaPasseios);

    return registros.map((r) => {
        const chave = montarChaveApiServico({
            date: r.date,
            externalServiceId: r.externalServiceId,
            serviceName: r.serviceName,
        });

        const apiMatch = mapaApi[chave];

        if (!apiMatch) return r;

        return {
            ...r,
            passengers: Number(apiMatch.passengers || 0),
            adultCount: Number(apiMatch.adultCount || 0),
            childCount: Number(apiMatch.childCount || 0),
            infantCount: Number(apiMatch.infantCount || 0),
        };
    });
};

export const getTextoStatusServico = (item) => {
    if (item?.allocationStatus === "CLOSED") {
        return "Passeio Fechado";
    }

    if (ehServicoDisp(item?.serviceName || "")) {
        return "Privativo";
    }

    return Number(item?.passengers || 0) >= 8
        ? "Grupo Formado"
        : "Formar Grupo";
};

export const getClasseStatusServico = (item) => {
    if (item?.allocationStatus === "CLOSED") {
        return "status-fechado";
    }

    if (ehServicoDisp(item?.serviceName || "")) {
        return "status-privativo";
    }

    return Number(item?.passengers || 0) >= 8
        ? "status-formado"
        : "status-alerta";
};