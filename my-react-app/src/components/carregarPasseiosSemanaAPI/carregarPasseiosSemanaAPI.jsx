import { getSemana } from "../../utils/getSemana";

const EXPAND = "service,schedule,reserve,establishmentOrigin,establishmentDestination,establishmentOrigin.region,establishmentDestination.region,reserve.partner,reserve.customer,additionalReserveServices,additionalReserveServices.additional,additionalReserveServices.provider,roadmapService,roadmapService.roadmap,auxRoadmapService.roadmap.serviceOrder,auxRoadmapService.roadmap.serviceOrder.vehicle,auxRoadmapService.roadmap.driver,auxRoadmapService.roadmap.guide,roadmapService.roadmap.driver,roadmapService.roadmap.guide,roadmapService.roadmap.serviceOrder,roadmapService.roadmap.serviceOrder.vehicle,reserve.pdvPayment.user";

const montarUrl = (date) =>
    `https://driversalvador.phoenix.comeialabs.com/scale/reserve-service?execution_date=${date}&expand=${encodeURIComponent(EXPAND)}&service_type[]=3`;

export const carregarPasseiosSemanaAPI = async (offsetSemana = 0) => {
    const semana = getSemana(offsetSemana);

    const respostas = await Promise.all(
        semana.map(async (dia) => {
            const res = await fetch(montarUrl(dia.date));
            const json = await res.json();

            const mapa = {};

            (Array.isArray(json) ? json : json.data || []).forEach((item) => {
                const nomePasseio = item?.service?.name?.trim();
                const pax = Number(
                    item?.reserve?.pax ??
                    item?.reserve?.passengers ??
                    item?.pax ??
                    0
                );

                if (!nomePasseio) return;

                if (!mapa[nomePasseio]) {
                    mapa[nomePasseio] = 0;
                }

                mapa[nomePasseio] += pax;
            });

            return {
                day: dia.day,
                date: dia.date,
                label: dia.label,
                services: Object.entries(mapa).map(([nome, totalPax]) => ({
                    nome,
                    totalPax,
                })),
            };
        })
    );

    return respostas; 
};
