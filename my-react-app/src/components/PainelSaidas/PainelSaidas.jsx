import { useEffect, useMemo, useState } from "react";
import {
  FlightTakeoffRounded,
  CalendarMonthRounded,
  RefreshRounded,
  AccessTimeRounded,
  GroupsRounded,
  Inventory2Rounded,
  WarningAmberRounded,
  KeyboardArrowDownRounded,
  KeyboardArrowUpRounded,
  FilterAltRounded,
  DirectionsBusRounded,
  HotelRounded,
  SyncRounded,
  PlaceRounded,
} from "@mui/icons-material";
import "./styles.css";

const API_BASE =
  "https://driversalvador.phoenix.comeialabs.com/scale/reserve-service";

const EXPAND =
  "service,schedule,reserve,establishmentOrigin,establishmentDestination,establishmentOrigin.region,establishmentDestination.region,reserve.partner,reserve.customer,additionalReserveServices,additionalReserveServices.additional,additionalReserveServices.provider,roadmapService,roadmapService.roadmap,auxRoadmapService.roadmap.serviceOrder,auxRoadmapService.roadmap.serviceOrder.vehicle,auxRoadmapService.roadmap.driver,auxRoadmapService.roadmap.guide,roadmapService.roadmap.driver,roadmapService.roadmap.guide,roadmapService.roadmap.serviceOrder,roadmapService.roadmap.serviceOrder.vehicle,reserve.pdvPayment.user";

const getHojeIso = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const montarUrlApi = (date) => {
  const params = new URLSearchParams();
  params.append("execution_date", date);
  params.append("expand", EXPAND);
  params.append("service_type[]", "2");
  return `${API_BASE}?${params.toString()}`;
};

const extrairListaResposta = (json) => {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.results)) return json.results;
  return [];
};

const normalizarTexto = (texto = "") =>
  String(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[|]/g, " ")
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const formatarDataBr = (dataIso) => {
  if (!dataIso) return "";
  const [ano, mes, dia] = String(dataIso).split("-");
  return `${dia}/${mes}/${ano}`;
};

const formatarHora = (valor = "") => {
  if (!valor) return "--:--";

  const str = String(valor).trim();

  if (str.includes("T")) {
    return str.slice(11, 16) || "--:--";
  }

  const match = str.match(/(\d{2}):(\d{2})/);
  if (match) return `${match[1]}:${match[2]}`;

  return "--:--";
};

const extrairPax = (item) => {
  const adultos = Number(item?.is_adult_count || 0);
  const criancas = Number(item?.is_child_count || 0);
  return adultos + criancas;
};

const extrairAdultos = (item) => Number(item?.is_adult_count || 0);
const extrairCriancas = (item) => Number(item?.is_child_count || 0);
const extrairInfantes = (item) =>
  Number(item?.is_baby_count || item?.is_infant_count || 0);

const extrairCodigoReserva = (item) =>
  item?.reserve?.code ||
  item?.reserve_code ||
  item?.code ||
  item?.reserve?.id ||
  "-";

const extrairNomeCliente = (item) =>
  item?.reserve?.customer?.name ||
  item?.customer?.name ||
  item?.reserve?.holder_name ||
  item?.passenger_name ||
  "Cliente não informado";

const extrairOperadora = (item) => {
  const bruto =
    item?.reserve?.partner?.name ||
    item?.reserve?.partner?.fantasy_name ||
    item?.reserve?.partner?.company_name ||
    item?.reserve?.operator?.name ||
    item?.reserve?.agency?.name ||
    item?.partner?.name ||
    item?.operator?.name ||
    item?.agency?.name ||
    item?.reserve?.origin_operator_name ||
    item?.reserve?.seller_name ||
    item?.reserve?.pdvPayment?.user?.name ||
    "";

  const texto = String(bruto || "").trim();
  if (!texto) return "-";

  const normalizado = normalizarTexto(texto);

  if (normalizado.includes("azul")) return "AZUL";
  if (normalizado.includes("frt")) return "FRT";
  if (normalizado.includes("cvc")) return "CVC";
  if (normalizado.includes("decolar")) return "DECOLAR";
  if (normalizado.includes("orpheus")) return "ORPHEUS";
  if (normalizado.includes("visual")) return "VISUAL";
  if (normalizado.includes("hotelbeds")) return "HOTELBEDS";
  if (normalizado.includes("tui")) return "TUI";
  if (normalizado.includes("booking")) return "BOOKING";
  if (normalizado.includes("expedia")) return "EXPEDIA";

  return texto.toUpperCase();
};

const extrairContatoPax = (item) =>
  item?.reserve?.customer?.phone ||
  item?.reserve?.customer?.telephone ||
  item?.reserve?.customer?.cellphone ||
  item?.reserve?.customer?.mobile ||
  item?.customer?.phone ||
  item?.customer?.telephone ||
  item?.customer?.cellphone ||
  item?.customer?.mobile ||
  item?.reserve?.holder_phone ||
  item?.reserve?.holder_whatsapp ||
  item?.reserve?.phone ||
  item?.reserve?.whatsapp ||
  "-";

const formatarContato = (valor = "") => {
  const numeros = String(valor).replace(/\D/g, "");

  if (!numeros) return "-";
  if (numeros.length <= 10) {
    if (numeros.length < 10) return valor || "-";
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 6)}-${numeros.slice(6)}`;
  }

  if (numeros.length === 11) {
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`;
  }

  return valor || "-";
};

const extrairObservacao = (item) =>
  item?.observation ||
  item?.observations ||
  item?.notes ||
  item?.note ||
  item?.reserve?.observation ||
  item?.reserve?.observations ||
  item?.reserve?.notes ||
  item?.reserve?.note ||
  item?.serviceOrder?.observation ||
  item?.serviceOrder?.notes ||
  "-";

const extrairHotel = (item) =>
  item?.establishmentOrigin?.name ||
  item?.origin?.name ||
  item?.reserve?.origin?.name ||
  item?.hotel?.name ||
  "Hotel não informado";

const extrairOrigem = (item) =>
  item?.establishmentOrigin?.name ||
  item?.origin?.name ||
  item?.reserve?.origin?.name ||
  "Origem não informada";

const extrairDestino = (item) =>
  item?.establishmentDestination?.name ||
  item?.destination?.name ||
  item?.reserve?.destination?.name ||
  "Destino não informado";

const extrairRegiao = (item) => {
  const bruto =
    item?.establishmentOrigin?.region?.name ||
    item?.establishmentOrigin?.region?.title ||
    item?.establishmentOrigin?.region?.description ||
    item?.origin?.region?.name ||
    item?.reserve?.origin?.region?.name ||
    item?.establishmentOriginRegion?.name ||
    "";

  const texto = String(bruto || "").trim();
  if (!texto) return "Região não informada";

  const normalizado = normalizarTexto(texto);

  if (normalizado.includes("litoral")) return "Litoral";
  if (normalizado.includes("salvador")) return "Salvador";

  return texto;
};

const formatarPaxDetalhado = (adultos = 0, criancas = 0, infantes = 0) => {
  const partes = [];

  if (adultos > 0) partes.push(`${adultos} ADT`);
  if (criancas > 0) partes.push(`${criancas} CHD`);
  if (infantes > 0) partes.push(`${infantes} INF`);

  if (partes.length === 0) return "0 ADT";

  return partes.join(" | ");
};

const extrairPresentationHour = (item) =>
  item?.presentation_hour ||
  item?.schedule?.presentation_hour ||
  item?.presentation_hour_end ||
  item?.date ||
  item?.execution_date ||
  "";

const extrairMotorista = (item) =>
  item?.roadmapService?.roadmap?.driver?.name ||
  item?.auxRoadmapService?.roadmap?.driver?.name ||
  item?.driver?.name ||
  "NÃO DEFINIDO";

const extrairVeiculo = (item) =>
  item?.roadmapService?.roadmap?.serviceOrder?.vehicle?.prefix ||
  item?.roadmapService?.roadmap?.serviceOrder?.vehicle?.name ||
  item?.roadmapService?.roadmap?.serviceOrder?.vehicle?.plate ||
  item?.auxRoadmapService?.roadmap?.serviceOrder?.vehicle?.prefix ||
  item?.auxRoadmapService?.roadmap?.serviceOrder?.vehicle?.name ||
  item?.auxRoadmapService?.roadmap?.serviceOrder?.vehicle?.plate ||
  item?.vehicle?.prefix ||
  item?.vehicle?.name ||
  item?.vehicle?.plate ||
  "FORA DE ESCALA";

const extrairEscalaId = (item) =>
  item?.roadmapService?.roadmap?.id ||
  item?.auxRoadmapService?.roadmap?.id ||
  item?.roadmap?.id ||
  null;

const ordenarHora = (a, b) => String(a || "").localeCompare(String(b || ""));

const PainelOuts = () => {
  const [dataSelecionada, setDataSelecionada] = useState(getHojeIso());
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState(null);
  const [itensBrutos, setItensBrutos] = useState([]);
  const [filtroVeiculo, setFiltroVeiculo] = useState("todos");
  const [gruposExpandidos, setGruposExpandidos] = useState({});

  const carregarOuts = async () => {
    try {
      setLoading(true);
      setErro("");

      const response = await fetch(montarUrlApi(dataSelecionada), {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`Erro HTTP ${response.status}`);
      }

      const json = await response.json();
      const lista = extrairListaResposta(json);

      setItensBrutos(lista);
      setUltimaAtualizacao(new Date());
    } catch (err) {
      console.error("Erro ao carregar OUTs:", err);
      setErro("Não foi possível carregar os serviços de saída.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarOuts();
  }, [dataSelecionada]);

  const gruposBase = useMemo(() => {
    const mapa = {};

    itensBrutos.forEach((item, index) => {
      const veiculo = extrairVeiculo(item);
      const presentationHour = extrairPresentationHour(item);
      const horario = formatarHora(presentationHour);
      const motorista = extrairMotorista(item);
      const origem = extrairOrigem(item);
      const regiao = extrairRegiao(item);
      const grupoKey = `${veiculo}__${horario}`;

      if (!mapa[grupoKey]) {
        mapa[grupoKey] = {
          id: grupoKey,
          veiculo,
          horario,
          presentationHourOriginal: presentationHour,
          motorista,
          origem,
          regiao,
          reservas: [],
        };
      }

      mapa[grupoKey].reservas.push({
        id: `${extrairCodigoReserva(item)}_${index}`,
        hotel: extrairHotel(item),
        horarioHotel: horario,
        reserva: extrairCodigoReserva(item),
        cliente: extrairNomeCliente(item),
        pax: extrairPax(item),
        adultos: extrairAdultos(item),
        criancas: extrairCriancas(item),
        infantes: extrairInfantes(item),
        operadora: extrairOperadora(item),
        telefone: formatarContato(extrairContatoPax(item)),
        observacao: extrairObservacao(item),
        origem,
        regiao,
        destino: extrairDestino(item),
        escalaId: extrairEscalaId(item),
      });
    });

    return Object.values(mapa)
      .map((grupo) => {
        const hoteisMap = {};

        grupo.reservas.forEach((reserva) => {
          const chaveHotel = `${reserva.hotel}__${reserva.horarioHotel}`;

          if (!hoteisMap[chaveHotel]) {
            hoteisMap[chaveHotel] = {
              id: chaveHotel,
              hotel: reserva.hotel,
              horario: reserva.horarioHotel,
              regiao: reserva.regiao,
              reservas: [],
            };
          }

          hoteisMap[chaveHotel].reservas.push(reserva);
        });

        const hoteis = Object.values(hoteisMap).sort((a, b) =>
          ordenarHora(a.horario, b.horario),
        );

        return {
          ...grupo,
          hoteis,
          totalReservas: grupo.reservas.length,
          totalPax: grupo.reservas.reduce(
            (acc, item) => acc + Number(item.pax || 0),
            0,
          ),
        };
      })
      .sort((a, b) => {
        const horaCompare = ordenarHora(a.horario, b.horario);
        if (horaCompare !== 0) return horaCompare;
        return String(a.veiculo).localeCompare(String(b.veiculo), "pt-BR", {
          sensitivity: "base",
        });
      });
  }, [itensBrutos]);

  const veiculosDisponiveis = useMemo(() => {
    return [...new Set(gruposBase.map((item) => item.veiculo))].sort((a, b) =>
      String(a).localeCompare(String(b), "pt-BR", { sensitivity: "base" }),
    );
  }, [gruposBase]);

  const gruposFiltrados = useMemo(() => {
    if (filtroVeiculo === "todos") return gruposBase;
    return gruposBase.filter((grupo) => grupo.veiculo === filtroVeiculo);
  }, [gruposBase, filtroVeiculo]);

  const resumo = useMemo(() => {
    return {
      veiculos: gruposBase.length,
      reservas: gruposBase.reduce((acc, g) => acc + g.totalReservas, 0),
      pax: gruposBase.reduce((acc, g) => acc + g.totalPax, 0),
      hoteis: gruposBase.reduce((acc, g) => acc + g.hoteis.length, 0),
      semVeiculo: gruposBase.filter((g) =>
        normalizarTexto(g.veiculo).includes("nao definido"),
      ).length,
    };
  }, [gruposBase]);

  const toggleExpandirGrupo = (grupoId) => {
    setGruposExpandidos((prev) => ({
      ...prev,
      [grupoId]: !prev[grupoId],
    }));
  };

  return (
    <div className="painel-outs-page">
      <div className="painel-outs-header">
        <div>
          <h2 className="painel-outs-title">
            <FlightTakeoffRounded fontSize="small" />
            Painel de OUT's
          </h2>
          <p className="painel-outs-subtitle">
            Organização operacional por veículo e horário de apresentação, com
            região, hotel do pax, nome do pax, reservas, operadora, telefone e
            observações.
          </p>
        </div>
      </div>

      <div className="painel-outs-grid">
        <div className="painel-outs-card painel-outs-card-large">
          <div className="painel-outs-card-header">
            <div className="painel-outs-card-title-row">
              <h3>Parâmetros</h3>
              <span className="painel-outs-badge">
                {formatarDataBr(dataSelecionada)}
              </span>
            </div>
            <p>Selecione a data operacional e atualize a leitura dos OUT's.</p>
          </div>

          <div className="painel-outs-toolbar">
            <div className="painel-outs-field">
              <label>
                <CalendarMonthRounded fontSize="small" />
                Data operacional
              </label>
              <input
                className="painel-outs-input"
                type="date"
                value={dataSelecionada}
                onChange={(e) => setDataSelecionada(e.target.value)}
              />
            </div>

            <div className="painel-outs-field">
              <label>
                <FilterAltRounded fontSize="small" />
                Filtrar veículo
              </label>
              <select
                className="painel-outs-input"
                value={filtroVeiculo}
                onChange={(e) => setFiltroVeiculo(e.target.value)}
              >
                <option value="todos">Todos</option>
                {veiculosDisponiveis.map((veiculo) => (
                  <option key={veiculo} value={veiculo}>
                    {veiculo}
                  </option>
                ))}
              </select>
            </div>

            <div className="painel-outs-actions">
              <button
                type="button"
                className="painel-outs-btn-primary"
                onClick={carregarOuts}
                disabled={loading}
              >
                <RefreshRounded
                  fontSize="small"
                  className={loading ? "spin" : ""}
                />
                {loading ? "Atualizando OUT's..." : "Atualizar"}
              </button>
            </div>
          </div>
        </div>

        <div className="painel-outs-card">
          <div className="painel-outs-card-header">
            <div className="painel-outs-card-title-row">
              <h3>Última atualização</h3>
            </div>
            <p>Horário da última leitura da API.</p>
          </div>

          <div className="painel-outs-stat">
            <div className="painel-outs-stat-icon">
              <AccessTimeRounded fontSize="small" />
            </div>
            <div>
              <span>Atualizado em</span>
              <strong>
                {loading ? (
                  <SyncRounded className="spin" fontSize="small" />
                ) : ultimaAtualizacao ? (
                  ultimaAtualizacao.toLocaleString("pt-BR")
                ) : (
                  "--"
                )}
              </strong>
            </div>
          </div>
        </div>

        <div className="painel-outs-card painel-outs-card-full">
          <div className="painel-outs-card-header">
            <div className="painel-outs-card-title-row">
              <h3>Resumo do dia</h3>
              <span className="painel-outs-badge">outs</span>
            </div>
            <p>Leitura consolidada dos serviços agrupados por veículo.</p>
          </div>

          <div className="painel-outs-kpis">
            <div className="painel-outs-kpi">
              <div className="painel-outs-kpi-icon">
                <DirectionsBusRounded fontSize="small" />
              </div>
              <div>
                <span>Veículos</span>
                <strong>
                  {loading ? (
                    <SyncRounded className="spin" fontSize="small" />
                  ) : (
                    resumo.veiculos
                  )}
                </strong>
              </div>
            </div>

            <div className="painel-outs-kpi">
              <div className="painel-outs-kpi-icon">
                <Inventory2Rounded fontSize="small" />
              </div>
              <div>
                <span>Reservas</span>
                <strong>
                  {loading ? (
                    <SyncRounded className="spin" fontSize="small" />
                  ) : (
                    resumo.reservas
                  )}
                </strong>
              </div>
            </div>

            <div className="painel-outs-kpi">
              <div className="painel-outs-kpi-icon">
                <GroupsRounded fontSize="small" />
              </div>
              <div>
                <span>Pax</span>
                <strong>
                  {loading ? (
                    <SyncRounded className="spin" fontSize="small" />
                  ) : (
                    resumo.pax
                  )}
                </strong>
              </div>
            </div>

            <div className="painel-outs-kpi">
              <div className="painel-outs-kpi-icon">
                <HotelRounded fontSize="small" />
              </div>
              <div>
                <span>Hotéis</span>
                <strong>
                  {loading ? (
                    <SyncRounded className="spin" fontSize="small" />
                  ) : (
                    resumo.hoteis
                  )}
                </strong>
              </div>
            </div>

            <div className="painel-outs-kpi">
              <div className="painel-outs-kpi-icon alerta">
                <WarningAmberRounded fontSize="small" />
              </div>
              <div>
                <span>Sem veículo</span>
                <strong>
                  {loading ? (
                    <SyncRounded className="spin" fontSize="small" />
                  ) : (
                    resumo.semVeiculo
                  )}
                </strong>
              </div>
            </div>
          </div>
        </div>

        <div className="painel-outs-card painel-outs-card-full">
          <div className="painel-outs-card-header">
            <div className="painel-outs-card-title-row">
              <h3>Todos os OUT's</h3>
              <span className="painel-outs-badge">
                {loading
                  ? "Carregando..."
                  : `${gruposFiltrados.length} agrupamento(s)`}
              </span>
            </div>
            <p>
              Lista completa dos serviços agrupados por veículo e horário de
              apresentação, com região, hotel e nome do pax.
            </p>
          </div>

          {erro ? (
            <div className="painel-outs-empty">{erro}</div>
          ) : loading ? (
            <div className="painel-outs-empty">
              <SyncRounded className="spin" fontSize="small" />
              <span style={{ marginLeft: 8 }}>Atualizando OUT's...</span>
            </div>
          ) : gruposFiltrados.length === 0 ? (
            <div className="painel-outs-empty">
              Nenhum agrupamento encontrado para esta data/filtro.
            </div>
          ) : (
            <div className="painel-outs-list">
              {gruposFiltrados.map((grupo) => {
                const expandido = !!gruposExpandidos[grupo.id];

                return (
                  <div key={grupo.id} className="painel-outs-item">
                    <button
                      type="button"
                      className="painel-outs-item-top"
                      onClick={() => toggleExpandirGrupo(grupo.id)}
                    >
                      <div className="painel-outs-item-main">
                        <div className="painel-outs-item-title-wrap">
                          <span className="painel-outs-item-time">
                            {grupo.horario}
                          </span>
                          <div className="painel-outs-item-title">
                            {grupo.veiculo}
                          </div>
                        </div>

                        <div className="painel-outs-item-meta">
                          <span>{grupo.totalReservas} reserva(s)</span>
                          <span>{grupo.totalPax} pax</span>
                          <span>{grupo.hoteis.length} hotel(is)</span>
                          <span>{grupo.regiao}</span>
                          <span>{grupo.origem}</span>
                        </div>
                      </div>

                      <div className="painel-outs-expand-icon">
                        {expandido ? (
                          <KeyboardArrowUpRounded />
                        ) : (
                          <KeyboardArrowDownRounded />
                        )}
                      </div>
                    </button>

                    {expandido && (
                      <div className="painel-outs-item-expanded">
                        {grupo.hoteis.map((hotelGrupo) => (
                          <div
                            key={hotelGrupo.id}
                            className="painel-outs-hotel-block"
                          >
                            <div className="painel-outs-hotel-header">
                              <div className="painel-outs-hotel-title">
                                <HotelRounded fontSize="small" />
                                <strong>{hotelGrupo.hotel}</strong>
                              </div>

                              <div
                                style={{
                                  display: "flex",
                                  gap: 8,
                                  alignItems: "center",
                                  flexWrap: "wrap",
                                }}
                              >
                                <div className="painel-outs-hotel-time">
                                  {hotelGrupo.horario}
                                </div>
                                <div className="painel-outs-hotel-time">
                                  <PlaceRounded fontSize="small" />
                                  <span style={{ marginLeft: 4 }}>
                                    {hotelGrupo.regiao}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="painel-outs-reservas">
                              {hotelGrupo.reservas.map((reserva) => (
                                <div
                                  key={reserva.id}
                                  className="painel-outs-reserva-card"
                                >
                                  <div className="painel-outs-reserva-grid">
                                    <div className="painel-outs-info">
                                      <span className="painel-outs-info-label">
                                        Nome do Pax
                                      </span>
                                      <strong>{reserva.cliente}</strong>
                                    </div>

                                    <div className="painel-outs-info">
                                      <span className="painel-outs-info-label">
                                        Hotel
                                      </span>
                                      <strong>{reserva.hotel}</strong>
                                    </div>

                                    <div className="painel-outs-info">
                                      <span className="painel-outs-info-label">
                                        Região
                                      </span>
                                      <strong>{reserva.regiao}</strong>
                                    </div>

                                    <div className="painel-outs-info">
                                      <span className="painel-outs-info-label">
                                        Reserva
                                      </span>
                                      <strong>{reserva.reserva}</strong>
                                    </div>
                                    <div className="painel-outs-info">
                                      <span className="painel-outs-info-label">
                                        Pax
                                      </span>
                                      <strong>
                                        {formatarPaxDetalhado(
                                          reserva.adultos,
                                          reserva.criancas,
                                          reserva.infantes
                                        )}
                                      </strong>
                                    </div>

                                    <div className="painel-outs-info">
                                      <span className="painel-outs-info-label">
                                        Operadora
                                      </span>
                                      <strong>{reserva.operadora}</strong>
                                    </div>

                                    <div className="painel-outs-info">
                                      <span className="painel-outs-info-label">
                                        Telefone
                                      </span>
                                      <strong>{reserva.telefone}</strong>
                                    </div>
                                  </div>

                                  <div className="painel-outs-observacao">
                                    <div className="painel-outs-observacao-title">
                                      Observação
                                    </div>
                                    <p>{reserva.observacao || "-"}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PainelOuts;