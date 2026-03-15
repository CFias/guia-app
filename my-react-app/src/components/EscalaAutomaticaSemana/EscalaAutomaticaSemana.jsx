import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../Services/Services/firebase";
import { getSemana } from "../../utils/getSemana";
import "./styles.css";

const EXPAND =
    "service,schedule,reserve,establishmentOrigin,establishmentDestination,establishmentOrigin.region,establishmentDestination.region,reserve.partner,reserve.customer,additionalReserveServices,additionalReserveServices.additional,additionalReserveServices.provider,roadmapService,roadmapService.roadmap,auxRoadmapService.roadmap.serviceOrder,auxRoadmapService.roadmap.serviceOrder.vehicle,auxRoadmapService.roadmap.driver,auxRoadmapService.roadmap.guide,roadmapService.roadmap.driver,roadmapService.roadmap.guide,roadmapService.roadmap.serviceOrder,roadmapService.roadmap.serviceOrder.vehicle,reserve.pdvPayment.user";

const API_BASE =
    "https://driversalvador.phoenix.comeialabs.com/scale/reserve-service";

const normalizarTexto = (texto = "") =>
    String(texto)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

const extrairListaResposta = (json) => {
    if (Array.isArray(json)) return json;
    if (Array.isArray(json?.data)) return json.data;
    if (Array.isArray(json?.results)) return json.results;
    return [];
};

const extrairNomePasseio = (item) => {
    return (
        item?.service?.name ||
        item?.service?.nome ||
        item?.reserveService?.service?.name ||
        item?.name ||
        ""
    );
};

const extrairPax = (item) => {
    const valor =
        item?.reserve?.pax ??
        item?.reserve?.passengers ??
        item?.reserve?.quantity ??
        item?.passengers ??
        item?.pax ??
        item?.quantity ??
        0;

    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : 0;
};

const montarUrl = (date) => {
    const params = new URLSearchParams();
    params.append("execution_date", date);
    params.append("expand", EXPAND);
    params.append("service_type[]", "3");

    return `${API_BASE}?${params.toString()}`;
};

const buscarPasseiosPorDia = async (date) => {
    const response = await fetch(montarUrl(date), {
        method: "GET",
        headers: {
            Accept: "application/json",
            // Se sua API exigir token, adicione aqui:
            // Authorization: `Bearer ${SEU_TOKEN}`,
        },
    });

    if (!response.ok) {
        throw new Error(`Erro ao buscar ${date}: ${response.status}`);
    }

    const json = await response.json();
    const lista = extrairListaResposta(json);

    const mapa = {};

    lista.forEach((item) => {
        const nome = extrairNomePasseio(item);
        const nomeNormalizado = normalizarTexto(nome);
        const pax = extrairPax(item);

        if (!nomeNormalizado) return;

        if (!mapa[nomeNormalizado]) {
            mapa[nomeNormalizado] = {
                nomeOriginal: nome.trim(),
                totalPax: 0,
                registros: [],
            };
        }

        mapa[nomeNormalizado].totalPax += pax;
        mapa[nomeNormalizado].registros.push(item);
    });

    return Object.values(mapa).map((item) => ({
        nome: item.nomeOriginal,
        totalPax: item.totalPax,
        registros: item.registros,
    }));
};

const buscarCatalogoServicos = async () => {
    const snap = await getDocs(collection(db, "services"));

    return snap.docs
        .map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
        }))
        .filter((item) => item.ativo !== false);
};

const buscarGuias = async () => {
    const snap = await getDocs(collection(db, "guides"));

    return snap.docs
        .map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
        }))
        .filter((item) => item.ativo !== false);
};

const encontrarServicoNoCatalogo = (nomeApi, services) => {
    const alvo = normalizarTexto(nomeApi);

    return (
        services.find((s) => normalizarTexto(s.externalName || s.nome) === alvo) ||
        null
    );
};

const encontrarGuiasAptos = (serviceApi, matchedService, guides) => {
    const nomeApiNormalizado = normalizarTexto(serviceApi.nome);

    return guides.filter((guia) => {
        const passeios = Array.isArray(guia.passeios) ? guia.passeios : [];

        return passeios.some((p) => {
            if (matchedService?.id && p?.id === matchedService.id) return true;

            const nomePasseio = normalizarTexto(
                p?.externalName || p?.nome || p?.name || ""
            );

            return nomePasseio === nomeApiNormalizado;
        });
    });
};

const EscalaAutomaticaSemana = () => {
    const [offsetSemana, setOffsetSemana] = useState(0);
    const [dadosSemana, setDadosSemana] = useState([]);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState("");

    const semana = useMemo(() => getSemana(offsetSemana), [offsetSemana]);

    const carregarDados = async () => {
        try {
            setLoading(true);
            setErro("");

            const [services, guides] = await Promise.all([
                buscarCatalogoServicos(),
                buscarGuias(),
            ]);

            const resultadosSemana = await Promise.all(
                semana.map(async (dia) => {
                    const passeiosApi = await buscarPasseiosPorDia(dia.date);

                    const passeiosEnriquecidos = passeiosApi.map((serviceApi) => {
                        const serviceCatalogo = encontrarServicoNoCatalogo(
                            serviceApi.nome,
                            services
                        );

                        const guiasAptos = encontrarGuiasAptos(
                            serviceApi,
                            serviceCatalogo,
                            guides
                        );

                        return {
                            ...serviceApi,
                            serviceId: serviceCatalogo?.id || null,
                            serviceCatalogo,
                            cadastrado: !!serviceCatalogo,
                            guiasAptos,
                        };
                    });

                    return {
                        ...dia,
                        services: passeiosEnriquecidos.sort((a, b) =>
                            a.nome.localeCompare(b.nome, "pt-BR")
                        ),
                    };
                })
            );

            setDadosSemana(resultadosSemana);
        } catch (err) {
            console.error("Erro ao carregar escala automática:", err);
            setErro(
                "Não foi possível carregar os passeios da semana. Verifique a API, autenticação e liberação de CORS."
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        carregarDados();
    }, [offsetSemana]);

    const totalPaxSemana = useMemo(() => {
        return dadosSemana.reduce((acc, dia) => {
            const somaDia = (dia.services || []).reduce(
                (subtotal, servico) => subtotal + Number(servico.totalPax || 0),
                0
            );
            return acc + somaDia;
        }, 0);
    }, [dadosSemana]);

    const totalPasseiosSemana = useMemo(() => {
        return dadosSemana.reduce(
            (acc, dia) => acc + (Array.isArray(dia.services) ? dia.services.length : 0),
            0
        );
    }, [dadosSemana]);

    return (
        <div className="escala-auto-container">
            <div className="escala-auto-header">
                <div>
                    <h2>Escala Automática de Guias</h2>
                    <p>
                        Passeios encontrados automaticamente entre segunda e domingo, com
                        total de pax por dia.
                    </p>
                </div>

                <div className="escala-auto-actions">
                    <button onClick={() => setOffsetSemana((prev) => prev - 1)}>
                        Semana anterior
                    </button>

                    <button onClick={() => setOffsetSemana(0)}>Semana atual</button>

                    <button onClick={() => setOffsetSemana((prev) => prev + 1)}>
                        Próxima semana
                    </button>

                    <button onClick={carregarDados}>Atualizar</button>
                </div>
            </div>

            <div className="escala-auto-resumo">
                <div className="resumo-card">
                    <span>Período</span>
                    <strong>
                        {semana[0]?.dateObj?.toLocaleDateString("pt-BR")} até{" "}
                        {semana[6]?.dateObj?.toLocaleDateString("pt-BR")}
                    </strong>
                </div>

                <div className="resumo-card">
                    <span>Total de passeios</span>
                    <strong>{totalPasseiosSemana}</strong>
                </div>

                <div className="resumo-card">
                    <span>Total de pax</span>
                    <strong>{totalPaxSemana}</strong>
                </div>
            </div>

            {loading && <div className="escala-loading">Carregando semana...</div>}

            {!loading && erro && <div className="escala-erro">{erro}</div>}

            {!loading && !erro && (
                <div className="escala-auto-lista">
                    {dadosSemana.map((dia) => (
                        <div key={dia.date} className="dia-card">
                            <div className="dia-card-header">
                                <h3>{dia.label}</h3>
                                <span>{dia.services.length} passeio(s)</span>
                            </div>

                            {dia.services.length === 0 ? (
                                <div className="dia-vazio">
                                    Nenhum passeio encontrado para esta data.
                                </div>
                            ) : (
                                <div className="tabela-wrapper">
                                    <table className="escala-tabela">
                                        <thead>
                                            <tr>
                                                <th>Passeio</th>
                                                <th>Pax</th>
                                                <th>Status cadastro</th>
                                                <th>Guias aptos</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {dia.services.map((servico, index) => (
                                                <tr key={`${dia.date}-${servico.nome}-${index}`}>
                                                    <td>
                                                        <div className="service-cell">
                                                            <strong>{servico.nome}</strong>
                                                            {servico.serviceCatalogo?.descricao ? (
                                                                <small>{servico.serviceCatalogo.descricao}</small>
                                                            ) : null}
                                                        </div>
                                                    </td>

                                                    <td>{servico.totalPax}</td>

                                                    <td>
                                                        <span
                                                            className={`status-badge ${servico.cadastrado ? "ok" : "warn"
                                                                }`}
                                                        >
                                                            {servico.cadastrado
                                                                ? "Cadastrado"
                                                                : "Não encontrado no catálogo"}
                                                        </span>
                                                    </td>

                                                    <td>
                                                        {servico.guiasAptos.length === 0 ? (
                                                            <span className="guia-vazio">
                                                                Nenhum guia apto
                                                            </span>
                                                        ) : (
                                                            <div className="guia-tags">
                                                                {servico.guiasAptos.map((guia) => (
                                                                    <span key={guia.id} className="guia-tag">
                                                                        {guia.nome}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    ); 
};

export default EscalaAutomaticaSemana;
