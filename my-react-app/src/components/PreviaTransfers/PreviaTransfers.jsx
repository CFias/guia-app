import { useEffect, useMemo, useState } from "react";
import {
  CalendarMonthRounded,
  LocalPrintshopRounded,
  RefreshRounded,
  ViewModuleRounded,
  DirectionsBusRounded,
  Inventory2Rounded,
  GroupsRounded,
  AccessTimeRounded,
  SouthWestRounded,
  NorthEastRounded,
  SwapHorizRounded,
} from "@mui/icons-material";
import "./styles.css";

const API_BASE =
  "https://driversalvador.phoenix.comeialabs.com/scale/reserve-service";

const EXPAND =
  "service,schedule,reserve,establishmentOrigin,establishmentDestination,establishmentOrigin.region,establishmentDestination.region,reserve.partner,reserve.customer,additionalReserveServices,additionalReserveServices.additional,additionalReserveServices.provider,roadmapService,roadmapService.roadmap,auxRoadmapService.roadmap.serviceOrder,auxRoadmapService.roadmap.serviceOrder.vehicle,auxRoadmapService.roadmap.driver,auxRoadmapService.roadmap.guide,roadmapService.roadmap.driver,roadmapService.roadmap.guide,roadmapService.roadmap.serviceOrder,roadmapService.roadmap.serviceOrder.vehicle,reserve.pdvPayment.user";

const SERVICE_TYPES = ["1", "2", "4"];

/**
 * Ajuste esta ordem conforme a operação real.
 * Os nomes devem bater com os nomes dos veículos vindos da API.
 */
const ORDEM_VEICULOS = [
  "THAIS 1",
  "THAIS 2",
  "THAIS 3",
  "VAN ROSÂNGELA EG TRANSP",
  "VAN ROSÂNGELA 1 EG TRANSP",
  "VAN ROSÂNGELA 2 EG TRANSP",
  "RICARDO 1",
  "RICARDO 2",
  "RICARDO",
  "VAN FERNANDO",
  "VAN FERNANDO 1",
  "VAN FRANCISCO",
  "CLÓVIS FILHO",
  "CLÓVIS 2",
  "FABIANO",
  "VAN GOMES 14",
  "VAN GOMES 20",
  "MICRO FRANCISCO",
  "MÁRIO",
  "JOALDO",
  "JURAILTON",
  "VAN PAN 1",
  "VAN PAN 2",
  "MARCIO",
  "CÍCERO",
  "ALAN",
  "MICRO PAN 1",
  "VAN PAN 5",
  "ADEMAR",
  "JOSUÉ",
  "NETO",
  "VAN WESLEY",
  "VAN LIVIA 1",
  "VAN LIVIA 20",
  "VAN DENISE 15",
  "VAN DENISE 20",
];

const getHojeIso = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const formatarDataTitulo = (dataIso) => {
  if (!dataIso) return "";
  const [ano, mes, dia] = String(dataIso).split("-");
  return `${dia}/${mes}/${ano}`;
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

const montarUrlApi = (date) => {
  const params = new URLSearchParams();
  params.append("execution_date", date);
  params.append("expand", EXPAND);
  SERVICE_TYPES.forEach((type) => params.append("service_type[]", type));
  return `${API_BASE}?${params.toString()}`;
};

const extrairListaResposta = (json) => {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.results)) return json.results;
  return [];
};

const extrairPax = (item) => {
  const adultos = Number(item?.is_adult_count || 0);
  const criancas = Number(item?.is_child_count || 0);
  return adultos + criancas;
};

const extrairHorario = (item) => {
  const bruto =
    item?.presentation_hour ||
    item?.presentation_hour_end ||
    item?.schedule?.presentation_hour ||
    item?.date ||
    item?.execution_date ||
    "";

  if (!bruto) return "";

  const valor = String(bruto);

  if (valor.includes("T")) {
    const hora = valor.split("T")[1]?.slice(0, 5);
    return hora || "";
  }

  const match = valor.match(/\b(\d{2}:\d{2})/);
  return match?.[1] || "";
};

const extrairVeiculo = (item) =>
  item?.roadmapService?.roadmap?.serviceOrder?.vehicle?.name ||
  item?.auxRoadmapService?.roadmap?.serviceOrder?.vehicle?.name ||
  item?.vehicle?.name ||
  item?.veiculoNome ||
  "";

const extrairMotorista = (item) =>
  item?.roadmapService?.roadmap?.driver?.name ||
  item?.auxRoadmapService?.roadmap?.driver?.name ||
  item?.driver?.name ||
  "";

const extrairGuia = (item) =>
  item?.roadmapService?.roadmap?.guide?.name ||
  item?.auxRoadmapService?.roadmap?.guide?.name ||
  item?.guide?.name ||
  "";

const extrairEscalaId = (item) =>
  item?.roadmapService?.roadmap?.id ||
  item?.auxRoadmapService?.roadmap?.id ||
  item?.roadmap?.id ||
  null;

const extrairOrigem = (item) =>
  item?.establishmentOrigin?.name ||
  item?.origin?.name ||
  item?.reserve?.origin?.name ||
  "";

const extrairDestino = (item) =>
  item?.establishmentDestination?.name ||
  item?.destination?.name ||
  item?.reserve?.destination?.name ||
  "";

const isAeroporto = (texto = "") => {
  const t = normalizarTexto(texto);
  return t.includes("aeroporto") || t.includes("airport");
};

const isHotel = (texto = "") => {
  const t = normalizarTexto(texto);

  if (!t) return false;

  return (
    t.includes("hotel") ||
    t.includes("resort") ||
    t.includes("pousada") ||
    t.includes("inn") ||
    t.includes("iberostar") ||
    t.includes("sauipe") ||
    t.includes("portobello") ||
    t.includes("vila gale") ||
    t.includes("grand palladium") ||
    t.includes("catussaba") ||
    t.includes("fiesta") ||
    t.includes("ondina") ||
    t.includes("rio vermelho") ||
    t.includes("wish") ||
    t.includes("deville") ||
    t.includes("fasano") ||
    t.includes("mercure") ||
    t.includes("intercity") ||
    t.includes("the hotel") ||
    t.includes("bahiamar") ||
    t.includes("monte pascoal") ||
    t.includes("rede andrade")
  );
};

const classificarTipoEscala = (item) => {
  const origem = extrairOrigem(item);
  const destino = extrairDestino(item);

  const origemEhAeroporto = isAeroporto(origem);
  const destinoEhAeroporto = isAeroporto(destino);
  const origemEhHotel = isHotel(origem);
  const destinoEhHotel = isHotel(destino);

  if (origemEhAeroporto && destino) return "IN";
  if (destinoEhAeroporto && origem) return "OUT";
  if (origemEhHotel && destinoEhHotel) return "TRF";

  return "IGNORAR";
};

const extrairTextoLinhaEscala = (item, tipo) => {
  const origem = extrairOrigem(item);
  const destino = extrairDestino(item);

  if (tipo === "IN") {
    return destino || "DESTINO NÃO INFORMADO";
  }

  if (tipo === "OUT") {
    return origem || "ORIGEM NÃO INFORMADA";
  }

  if (tipo === "TRF") {
    return `${origem || "ORIGEM"} X ${destino || "DESTINO"}`;
  }

  return "";
};

const deveEntrarNaPrevia = (item) => {
  const veiculo = extrairVeiculo(item);
  const escalaId = extrairEscalaId(item);
  return !!String(veiculo || "").trim() && !!escalaId;
};

const ordenarHora = (a, b) =>
  String(a.hora || "").localeCompare(String(b.hora || ""));

const tipoLinhaClass = (tipo) => {
  if (tipo === "IN") return "in";
  if (tipo === "OUT") return "out";
  if (tipo === "TRF") return "trf";
  return "";
};

const normalizarNomeVeiculo = (nome = "") =>
  normalizarTexto(nome).replace(/\*/g, "").replace(/\s+/g, " ").trim();

const getIndiceOrdemVeiculo = (nomeVeiculo) => {
  const alvo = normalizarNomeVeiculo(nomeVeiculo);
  const idx = ORDEM_VEICULOS.findIndex(
    (nome) => normalizarNomeVeiculo(nome) === alvo,
  );
  return idx === -1 ? 9999 : idx;
};

const ordenarGrupos = (a, b) => {
  const idxA = getIndiceOrdemVeiculo(a.veiculo);
  const idxB = getIndiceOrdemVeiculo(b.veiculo);

  if (idxA !== idxB) return idxA - idxB;

  return a.veiculo.localeCompare(b.veiculo, "pt-BR", {
    sensitivity: "base",
  });
};

const dividirEmLinhas = (lista, tamanho) => {
  const linhas = [];
  for (let i = 0; i < lista.length; i += tamanho) {
    linhas.push(lista.slice(i, i + tamanho));
  }
  return linhas;
};

const PreviaEscalasPlanilha = () => {
  const [dataSelecionada, setDataSelecionada] = useState(getHojeIso());
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState(null);
  const [itensBrutos, setItensBrutos] = useState([]);
  const [colunasPorLinha, setColunasPorLinha] = useState(5);

  const carregarServicos = async () => {
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
      console.error("Erro ao carregar prévia:", err);
      setErro("Não foi possível carregar os serviços da API.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarServicos();
  }, [dataSelecionada]);

  const grupos = useMemo(() => {
    const mapa = {};

    itensBrutos.filter(deveEntrarNaPrevia).forEach((item) => {
      const veiculo = extrairVeiculo(item) || "SEM VEÍCULO";
      const escalaId = extrairEscalaId(item);

      if (!escalaId) return;

      const tipo = classificarTipoEscala(item);
      if (tipo === "IGNORAR") return;

      const chaveGrupo = veiculo;
      const horaAtual = extrairHorario(item);

      if (!mapa[chaveGrupo]) {
        mapa[chaveGrupo] = {
          chave: chaveGrupo,
          veiculo,
          motorista: extrairMotorista(item),
          linhasPorEscala: {},
        };
      }

      const chaveEscala = String(escalaId);

      if (!mapa[chaveGrupo].linhasPorEscala[chaveEscala]) {
        mapa[chaveGrupo].linhasPorEscala[chaveEscala] = {
          escalaId,
          tipo,
          hora: horaAtual,
          texto: extrairTextoLinhaEscala(item, tipo),
          pax: 0,
          guia: extrairGuia(item) || "",
        };
      }

      mapa[chaveGrupo].linhasPorEscala[chaveEscala].pax += extrairPax(item);

      const horaSalva = mapa[chaveGrupo].linhasPorEscala[chaveEscala].hora;
      if (horaAtual && (!horaSalva || horaAtual < horaSalva)) {
        mapa[chaveGrupo].linhasPorEscala[chaveEscala].hora = horaAtual;
      }

      if (!mapa[chaveGrupo].motorista) {
        mapa[chaveGrupo].motorista = extrairMotorista(item);
      }
    });

    return Object.values(mapa)
      .map((grupo) => {
        const linhas = Object.values(grupo.linhasPorEscala).sort(ordenarHora);

        return {
          ...grupo,
          linhas,
          totalPax: linhas.reduce(
            (acc, item) => acc + Number(item.pax || 0),
            0,
          ),
        };
      })
      .sort(ordenarGrupos);
  }, [itensBrutos]);

  const grade = useMemo(
    () => dividirEmLinhas(grupos, colunasPorLinha),
    [grupos, colunasPorLinha],
  );

  const resumo = useMemo(() => {
    const servicos = grupos.reduce((acc, g) => acc + g.linhas.length, 0);
    const pax = grupos.reduce((acc, g) => acc + g.totalPax, 0);
    const totalIn = grupos.reduce(
      (acc, g) => acc + g.linhas.filter((l) => l.tipo === "IN").length,
      0,
    );
    const totalOut = grupos.reduce(
      (acc, g) => acc + g.linhas.filter((l) => l.tipo === "OUT").length,
      0,
    );
    const totalTrf = grupos.reduce(
      (acc, g) => acc + g.linhas.filter((l) => l.tipo === "TRF").length,
      0,
    );

    return {
      veiculos: grupos.length,
      servicos,
      pax,
      totalIn,
      totalOut,
      totalTrf,
    };
  }, [grupos]);

  return (
    <div className="previa-operacional-page">
      <div className="previa-operacional-header">
        <div>
          <h2 className="previa-operacional-title">
            <ViewModuleRounded fontSize="small" />
            Prévia Operacional por Veículo
          </h2>
          <p className="previa-operacional-subtitle">
            Estrutura automática por escala, organizada em formato planilha e
            alinhada ao padrão visual do sistema.
          </p>
        </div>
      </div>

      <div className="previa-operacional-grid">
        <div className="previa-operacional-card previa-operacional-card-large">
          <div className="previa-operacional-card-header">
            <div className="previa-operacional-card-title-row">
              <h3>Parâmetros da prévia</h3>
              <span className="previa-operacional-badge">
                {formatarDataTitulo(dataSelecionada)}
              </span>
            </div>
            <p>
              Defina a data operacional, ajuste a quantidade de colunas e
              atualize a prévia.
            </p>
          </div>

          <div className="previa-operacional-toolbar">
            <div className="previa-operacional-field">
              <label>
                <CalendarMonthRounded fontSize="small" />
                Data operacional
              </label>
              <input
                className="previa-operacional-input"
                type="date"
                value={dataSelecionada}
                onChange={(e) => setDataSelecionada(e.target.value)}
              />
            </div>

            <div className="previa-operacional-field small">
              <label>
                <ViewModuleRounded fontSize="small" />
                Colunas
              </label>
              <select
                className="previa-operacional-input"
                value={colunasPorLinha}
                onChange={(e) => setColunasPorLinha(Number(e.target.value))}
              >
                <option value={4}>4 colunas</option>
                <option value={5}>5 colunas</option>
                <option value={6}>6 colunas</option>
              </select>
            </div>

            <div className="previa-operacional-actions">
              <button
                type="button"
                className="previa-operacional-btn-primary"
                onClick={carregarServicos}
                disabled={loading}
              >
                <RefreshRounded fontSize="small" />
                {loading ? "Atualizando..." : "Atualizar"}
              </button>

              <button
                type="button"
                className="previa-operacional-btn-soft"
                onClick={() => window.print()}
              >
                <LocalPrintshopRounded fontSize="small" />
                Imprimir
              </button>
            </div>
          </div>
        </div>

        <div className="previa-operacional-card">
          <div className="previa-operacional-card-header">
            <div className="previa-operacional-card-title-row">
              <h3>Última atualização</h3>
            </div>
            <p>Horário da última leitura realizada na API.</p>
          </div>

          <div className="previa-operacional-stats single">
            <div className="previa-operacional-stat">
              <div className="previa-operacional-stat-icon">
                <AccessTimeRounded fontSize="small" />
              </div>
              <div>
                <span>Atualizado em</span>
                <strong className="small-value">
                  {ultimaAtualizacao
                    ? ultimaAtualizacao.toLocaleString("pt-BR")
                    : "--"}
                </strong>
              </div>
            </div>
          </div>
        </div>

        <div className="previa-operacional-card previa-operacional-card-full">
          <div className="previa-operacional-card-header">
            <div className="previa-operacional-card-title-row">
              <h3>Indicadores operacionais</h3>
              <span className="previa-operacional-badge">resumo</span>
            </div>
            <p>
              Quantidade total de veículos, serviços consolidados, pax e divisão
              por tipo operacional.
            </p>
          </div>

          <div className="previa-operacional-kpis">
            <div className="previa-operacional-kpi">
              <div className="previa-operacional-kpi-icon">
                <DirectionsBusRounded fontSize="small" />
              </div>
              <div>
                <span>Veículos</span>
                <strong>{resumo.veiculos}</strong>
              </div>
            </div>

            <div className="previa-operacional-kpi">
              <div className="previa-operacional-kpi-icon">
                <Inventory2Rounded fontSize="small" />
              </div>
              <div>
                <span>Serviços</span>
                <strong>{resumo.servicos}</strong>
              </div>
            </div>

            <div className="previa-operacional-kpi">
              <div className="previa-operacional-kpi-icon">
                <GroupsRounded fontSize="small" />
              </div>
              <div>
                <span>Pax</span>
                <strong>{resumo.pax}</strong>
              </div>
            </div>

            <div className="previa-operacional-kpi">
              <div className="previa-operacional-kpi-icon in">
                <SouthWestRounded fontSize="small" />
              </div>
              <div>
                <span>IN</span>
                <strong>{resumo.totalIn}</strong>
              </div>
            </div>

            <div className="previa-operacional-kpi">
              <div className="previa-operacional-kpi-icon out">
                <NorthEastRounded fontSize="small" />
              </div>
              <div>
                <span>OUT</span>
                <strong>{resumo.totalOut}</strong>
              </div>
            </div>

            <div className="previa-operacional-kpi">
              <div className="previa-operacional-kpi-icon trf">
                <SwapHorizRounded fontSize="small" />
              </div>
              <div>
                <span>Transfer</span>
                <strong>{resumo.totalTrf}</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="previa-operacional-card previa-operacional-card-full">
          <div className="previa-operacional-card-header">
            <div className="previa-operacional-card-title-row">
              <h3>Planilha operacional automática</h3>
              <span className="previa-operacional-badge">
                {formatarDataTitulo(dataSelecionada)}
              </span>
            </div>
            <p>
              Consolidada por escala, agrupada por veículo e exibida em blocos
              maiores para leitura mais próxima da planilha original.
            </p>
          </div>

          {erro ? (
            <div className="previa-operacional-empty">{erro}</div>
          ) : grupos.length === 0 && !loading ? (
            <div className="previa-operacional-empty">
              Nenhum serviço escalado encontrado para esta data.
            </div>
          ) : (
            <div className="previa-operacional-sheet-wrap">
              <div className="previa-operacional-sheet-header">
                <div className="previa-operacional-sheet-logo">OP</div>
                <h1>{formatarDataTitulo(dataSelecionada)}</h1>

                {loading && (
                  <div className="previa-operacional-sheet-loading">
                    <div className="previa-operacional-sheet-loading-bar" />
                    <span>Carregando serviços...</span>
                  </div>
                )}
              </div>

              <div className="previa-operacional-sheet-body">
                {grade.map((linha, linhaIndex) => (
                  <div
                    key={`linha-${linhaIndex}`}
                    className="previa-operacional-sheet-grid"
                    style={{
                      gridTemplateColumns: `repeat(${colunasPorLinha}, minmax(0, 1fr))`,
                    }}
                  >
                    {linha.map((grupo) => (
                      <div
                        key={grupo.chave}
                        className="previa-operacional-coluna"
                      >
                        <div className="previa-operacional-coluna-topo">
                          <div className="previa-operacional-coluna-titulo">
                            *VEÍCULO: {grupo.veiculo}*
                          </div>

                          <div className="previa-operacional-coluna-subtitulo">
                            <span>{grupo.motorista || "SEM MOTORISTA"}</span>
                          </div>
                        </div>

                        <div className="previa-operacional-coluna-linhas">
                          {grupo.linhas.map((linhaItem) => (
                            <div
                              key={linhaItem.escalaId}
                              className={`previa-operacional-linha ${tipoLinhaClass(
                                linhaItem.tipo,
                              )}`}
                            >
                              <span className="texto-linha">
                                {linhaItem.tipo} - {linhaItem.hora || "--:--"} -{" "}
                                {linhaItem.texto} - {linhaItem.pax}/0
                              </span>

                              {linhaItem.guia ? (
                                <span className="extra-linha">
                                  GUIA {linhaItem.guia}
                                </span>
                              ) : null}
                            </div>
                          ))}

                          {Array.from({
                            length: Math.max(0, 12 - grupo.linhas.length),
                          }).map((_, idx) => (
                            <div
                              key={`vazia-${idx}`}
                              className="previa-operacional-linha vazia"
                            />
                          ))}
                        </div>
                      </div>
                    ))}

                    {Array.from({
                      length: Math.max(0, colunasPorLinha - linha.length),
                    }).map((_, idx) => (
                      <div
                        key={`coluna-vazia-${idx}`}
                        className="previa-operacional-coluna coluna-vazia"
                      >
                        <div className="previa-operacional-coluna-topo">
                          <div className="previa-operacional-coluna-titulo">
                            *VEÍCULO: -*
                          </div>
                          <div className="previa-operacional-coluna-subtitulo">
                            <span>SEM MOTORISTA</span>
                          </div>
                        </div>

                        <div className="previa-operacional-coluna-linhas">
                          {Array.from({ length: 12 }).map((__, i) => (
                            <div
                              key={`linha-vazia-${i}`}
                              className="previa-operacional-linha vazia"
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PreviaEscalasPlanilha;
