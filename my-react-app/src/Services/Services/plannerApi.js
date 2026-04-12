// plannerApi.js

import {
    API_BASE,
    EXPAND,
    ehServicoDisp,
    obterNomeCanonico,
    deveIgnorarServico,
    extrairPrimeiroNome,
    montarChaveApiServico,
    montarChaveImportacao,
} from "./plannerUtils";

import {
    collection,
    getDocs,
    query,
    where,
    doc,
    deleteDoc,
    setDoc,
    addDoc,
} from "firebase/firestore";
import { db } from "../../Services/Services/firebase";

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

export const extrairNomeVendedor = (item) => {
    const pagamentos = Array.isArray(item?.reserve?.pdvPayment)
        ? item.reserve.pdvPayment
        : [];

    const nomes = pagamentos
        .map((pag) => pag?.user?.name || "")
        .filter((nome) => typeof nome === "string" && nome.trim());

    return nomes[0] || "";
};

export const extrairNomeOperadora = (item) =>
    item?.reserve?.partner?.fantasy_name ||
    item?.reserve?.partner?.name ||
    item?.reserve?.customer?.fantasy_name ||
    item?.reserve?.customer?.name ||
    "";

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

export const montarUrlApi = (date) => {
    const params = new URLSearchParams();
    params.append("execution_date", date);
    params.append("expand", EXPAND);
    params.append("service_type[]", "3");
    params.append("service_type[]", "4");

    return `${API_BASE}?${params.toString()}`;
};

export const encontrarServiceCatalogo = (
    serviceIdExterno,
    nomeApi,
    listaServices = [],
    normalizarTextoFn,
) => {
    const normalizar =
        typeof normalizarTextoFn === "function"
            ? normalizarTextoFn
            : (texto) =>
                String(texto || "")
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .replace(/[^\w\s-]/g, " ")
                    .replace(/\s+/g, " ")
                    .trim()
                    .toLowerCase();

    const services = Array.isArray(listaServices) ? listaServices : [];

    return (
        services.find(
            (s) => Number(s?.externalServiceId || 0) === Number(serviceIdExterno || 0),
        ) ||
        services.find((s) => {
            const nomeService = normalizar(s?.externalName || s?.nome || "");
            const nomeComparado = normalizar(nomeApi || "");

            return (
                nomeService === nomeComparado ||
                nomeComparado.startsWith(`${nomeService} `) ||
                nomeComparado.startsWith(`${nomeService} -`)
            );
        }) ||
        null
    );
};

export const carregarSemanaApiListaPasseios = async (listaSemana) => {
    const respostasApi = await Promise.all(
        listaSemana.map(async (dia) => {
            try {
                const response = await fetch(montarUrlApi(dia.date), {
                    method: "GET",
                    headers: { Accept: "application/json" },
                });

                if (!response.ok) return [];

                const json = await response.json();
                return extrairListaResposta(json);
            } catch (err) {
                console.error(`Erro ao buscar API do dia ${dia.date}:`, err);
                return [];
            }
        }),
    );

    const itensApiAgrupados = {};

    respostasApi.flat().forEach((item) => {
        const nomeOriginal = extrairNomePasseio(item);
        const externalServiceId = extrairServiceIdExterno(item);
        const date = extrairDataServico(item);
        const pax = extrairContagemPax(item);

        if (!date || !nomeOriginal) return;

        const nomeExibicao = montarNomeServicoExibicao(item);
        if (!nomeExibicao) return;
        if (deveIgnorarServico(nomeExibicao)) return;

        const chave = montarChaveApiServico({
            date,
            externalServiceId,
            serviceName: nomeExibicao,
        });

        if (!itensApiAgrupados[chave]) {
            itensApiAgrupados[chave] = {
                chave,
                date,
                serviceName: nomeExibicao,
                externalServiceId: externalServiceId || null,
                passengers: 0,
                adultCount: 0,
                childCount: 0,
                infantCount: 0,
            };
        }

        itensApiAgrupados[chave].passengers += Number(pax.total || 0);
        itensApiAgrupados[chave].adultCount += Number(pax.adultos || 0);
        itensApiAgrupados[chave].childCount += Number(pax.criancas || 0);
        itensApiAgrupados[chave].infantCount += Number(pax.infants || 0);
    });

    return Object.values(itensApiAgrupados);
};

export const sincronizarPasseiosDaApiNaSemana = async (
    semanaAtual,
    servicesData,
    normalizarTexto,
) => {
    for (const dia of semanaAtual) {
        try {
            const response = await fetch(montarUrlApi(dia.date), {
                method: "GET",
                headers: { Accept: "application/json" },
            });

            if (!response.ok) {
                console.error(`Erro API ${dia.date}: ${response.status}`);
                continue;
            }

            const json = await response.json();
            const lista = extrairListaResposta(json);
            const agregados = {};

            lista.forEach((item) => {
                const serviceIdExterno = extrairServiceIdExterno(item);
                const nomeOriginal = extrairNomePasseio(item);
                const dataServico = extrairDataServico(item);
                const pax = extrairContagemPax(item);

                if (!serviceIdExterno || !dataServico) return;
                if (dataServico !== dia.date) return;

                const ehDispItem = ehServicoDisp(nomeOriginal);

                const nomeFinal = ehDispItem
                    ? montarNomeServicoExibicao(item)
                    : obterNomeCanonico(nomeOriginal);

                if (!nomeFinal) return;
                if (deveIgnorarServico(nomeFinal)) return;

                const chave = montarChaveImportacao({
                    date: dataServico,
                    externalServiceId: serviceIdExterno,
                    serviceName: nomeFinal,
                });

                if (!agregados[chave]) {
                    agregados[chave] = {
                        serviceIdExterno,
                        nome: nomeFinal,
                        date: dataServico,
                        totalPax: 0,
                        totalAdultos: 0,
                        totalCriancas: 0,
                        totalInfants: 0,
                    };
                }

                agregados[chave].totalPax += Number(pax.total || 0);
                agregados[chave].totalAdultos += Number(pax.adultos || 0);
                agregados[chave].totalCriancas += Number(pax.criancas || 0);
                agregados[chave].totalInfants += Number(pax.infants || 0);
            });

            const qDia = query(
                collection(db, "weekly_services"),
                where("date", "==", dia.date),
            );

            const snapDia = await getDocs(qDia);

            const registrosExistentes = snapDia.docs.map((d) => ({
                id: d.id,
                ref: d.ref,
                ...d.data(),
            }));

            const importadosDoDia = registrosExistentes.filter(
                (r) => r.importedFromApi === true && r.manual !== true,
            );

            for (const passeioApi of Object.values(agregados)) {
                const chaveAtual = montarChaveImportacao({
                    date: passeioApi.date,
                    externalServiceId: passeioApi.serviceIdExterno,
                    serviceName: passeioApi.nome,
                });

                const serviceCatalogo = encontrarServiceCatalogo(
                    passeioApi.serviceIdExterno,
                    passeioApi.nome,
                    servicesData,
                    normalizarTexto,
                );

                const duplicados = importadosDoDia.filter((r) => {
                    const chaveRegistro = montarChaveImportacao({
                        date: r.date,
                        externalServiceId: r.externalServiceId,
                        serviceName: r.serviceName,
                    });

                    return chaveRegistro === chaveAtual;
                });

                const principal = duplicados[0] || null;
                const duplicadosExtras = duplicados.slice(1);

                for (const dup of duplicadosExtras) {
                    await deleteDoc(doc(db, "weekly_services", dup.id));
                }

                const totalDetalhado =
                    Number(passeioApi.totalAdultos || 0) +
                    Number(passeioApi.totalCriancas || 0) +
                    Number(passeioApi.totalInfants || 0);

                const totalFinal = Math.max(
                    Number(passeioApi.totalPax || 0),
                    totalDetalhado,
                );

                const payload = {
                    serviceId: serviceCatalogo?.id || null,
                    externalServiceId: passeioApi.serviceIdExterno,
                    serviceName: passeioApi.nome,
                    passengers: totalFinal,
                    adultCount: Number(passeioApi.totalAdultos || 0),
                    childCount: Number(passeioApi.totalCriancas || 0),
                    infantCount: Number(passeioApi.totalInfants || 0),
                    date: passeioApi.date,
                    day: dia.day,
                    manual: false,
                    importedFromApi: true,
                    updatedAt: new Date(),
                };

                if (principal) {
                    await setDoc(doc(db, "weekly_services", principal.id), payload, {
                        merge: true,
                    });
                } else {
                    await addDoc(collection(db, "weekly_services"), {
                        ...payload,
                        guiaId: null,
                        guiaNome: null,
                        allocationStatus: "OPEN",
                        createdAt: new Date(),
                    });
                }
            }

            const chavesVindasApi = Object.values(agregados).map((p) =>
                montarChaveImportacao({
                    date: p.date,
                    externalServiceId: p.serviceIdExterno,
                    serviceName: p.nome,
                }),
            );

            const obsoletos = importadosDoDia.filter((r) => {
                const chaveRegistro = montarChaveImportacao({
                    date: r.date,
                    externalServiceId: r.externalServiceId,
                    serviceName: r.serviceName,
                });

                return !chavesVindasApi.includes(chaveRegistro);
            });

            for (const antigo of obsoletos) {
                await deleteDoc(doc(db, "weekly_services", antigo.id));
            }
        } catch (err) {
            console.error(`Erro ao sincronizar API no dia ${dia.date}:`, err);
        }
    }
};