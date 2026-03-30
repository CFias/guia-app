import { useEffect, useMemo, useState } from "react";
import {
  CalendarMonthRounded,
  RefreshRounded,
  AccessTimeRounded,
  GroupsRounded,
  Inventory2Rounded,
  KeyboardArrowDownRounded,
  KeyboardArrowUpRounded,
  FilterAltRounded,
  SyncRounded,
  AssignmentRounded,
  PersonRounded,
  DirectionsBusRounded,
  ContentCopyRounded,
  CheckRounded,
  SwapHorizRounded,
  LocalShippingRounded,
} from "@mui/icons-material";
import "./styles.css";

const API_BASE =
  "https://driversalvador.phoenix.comeialabs.com/scale/reserve-service";

const EXPAND =
  "service,schedule,reserve,establishmentOrigin,establishmentDestination,establishmentOrigin.region,establishmentDestination.region,reserve.partner,reserve.customer,additionalReserveServices,additionalReserveServices.additional,additionalReserveServices.provider,roadmapService,roadmapService.roadmap,auxRoadmapService.roadmap.serviceOrder,auxRoadmapService.roadmap.serviceOrder.vehicle,auxRoadmapService.roadmap.driver,auxRoadmapService.roadmap.guide,roadmapService.roadmap.driver,roadmapService.roadmap.guide,roadmapService.roadmap.serviceOrder,roadmapService.roadmap.serviceOrder.vehicle,reserve.pdvPayment.user";

const SERVICOS_IGNORADOS = [
  "PASSEIO PRAIA DO FORTE 4H (LTN-VOLTA)",
  "IN - LITORAL NORTE",
];

const TIPOS_BUSCADOS = ["2", "4"]; // 2 = OUT | 4 = transfer

const deveIgnorarServico = (nome = "") => {
  const normalizado = nome
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return SERVICOS_IGNORADOS.some((ignorado) =>
    normalizado.includes(
      ignorado
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
    )
  );
};

const normalizarTexto = (valor = "") =>
  String(valor || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const getHojeIso = () => {
  const hoje = new Date();
  const yyyy = hoje.getFullYear();
  const mm = String(hoje.getMonth() + 1).padStart(2, "0");
  const dd = String(hoje.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const formatarDataBr = (dataIso) => {
  if (!dataIso) return "";
  const [ano, mes, dia] = String(dataIso).split("-");
  return `${dia}/${mes}/${ano}`;
};

const formatarHora = (valor = "") => {
  const texto = String(valor || "").trim();
  if (!texto) return "--:--";

  if (texto.includes("T")) return texto.slice(11, 16);

  const match = texto.match(/(\d{2}):(\d{2})/);
  if (match) return `${match[1]}:${match[2]}`;

  return "--:--";
};

const extrairListaResposta = (json) => {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.results)) return json.results;
  return [];
};

const montarUrlApi = (data) => {
  const params = new URLSearchParams();
  params.append("execution_date", data);
  params.append("expand", EXPAND);

  TIPOS_BUSCADOS.forEach((tipo) => {
    params.append("service_type[]", tipo);
  });

  return `${API_BASE}?${params.toString()}`;
};

const extrairGuiaEscalado = (item) =>
  item?.roadmapService?.roadmap?.guide?.nickname ||
  item?.roadmapService?.roadmap?.guide?.name ||
  item?.auxRoadmapService?.roadmap?.guide?.nickname ||
  item?.auxRoadmapService?.roadmap?.guide?.name ||
  "";

const extrairNomePasseio = (item) =>
  item?.service?.nickname ||
  item?.service?.name ||
  item?.service_name ||
  "Serviço não informado";

const extrairVeiculo = (item) =>
  item?.roadmapService?.roadmap?.serviceOrder?.vehicle?.name ||
  item?.auxRoadmapService?.roadmap?.serviceOrder?.vehicle?.name ||
  item?.vehicle?.name ||
  item?.vehicle?.plate ||
  "Veículo não informado";

const extrairFornecedor = (item) =>
  item?.roadmapService?.roadmap?.driver?.nickname ||
  item?.roadmapService?.roadmap?.driver?.name ||
  item?.auxRoadmapService?.roadmap?.driver?.nickname ||
  item?.auxRoadmapService?.roadmap?.driver?.name ||
  "Fornecedor não informado";

const extrairReservaCodigo = (item) =>
  item?.reserve?.code || item?.reserve_id || item?.id || "-";

const extrairNomePax = (item) =>
  item?.reserve?.customer?.name ||
  item?.reserve?.holder_name ||
  "Pax não informado";

const extrairHotel = (item) =>
  item?.establishmentOrigin?.name ||
  item?.reserve?.origin?.name ||
  "Hotel não informado";

const extrairHorarioApresentacao = (item) =>
  formatarHora(
    item?.presentation_hour ||
      item?.schedule?.presentation_hour ||
      item?.our_schedule ||
      item?.fly_hour ||
      ""
  );

const extrairObservacao = (item) =>
  item?.observation ||
  item?.reserve?.observation ||
  item?.reserve?.notes ||
  "-";

const extrairAdultos = (item) => Number(item?.is_adult_count || 0);
const extrairCriancas = (item) => Number(item?.is_child_count || 0);
const extrairInfantes = (item) =>
  Number(item?.is_baby_count || item?.is_infant_count || 0);

const extrairQuantidade = (item) =>
  extrairAdultos(item) + extrairCriancas(item) + extrairInfantes(item);

const formatarQuantidadeDetalhada = (item) => {
  const adt = extrairAdultos(item);
  const chd = extrairCriancas(item);
  const inf = extrairInfantes(item);

  const partes = [];
  if (adt > 0) partes.push(`${adt} ADT`);
  if (chd > 0) partes.push(`${chd} CHD`);
  if (inf > 0) partes.push(`${inf} INF`);

  if (!partes.length) return "0 ADT";
  return partes.join(" | ");
};

const extrairModalidade = (item) => {
  return String(item?.serviceModeAsText || "").trim() || "Não informado";
};

const extrairTipoLinha = (item) => {
  const tipo = String(
    item?.service_type || item?.serviceType || item?.service?.type || ""
  );

  if (tipo === "2") return "OUT";
  if (tipo === "4") return "TRANSFER";

  const nome = normalizarTexto(extrairNomePasseio(item));
  if (nome.includes("OUT")) return "OUT";
  return "TRANSFER";
};

const ordenarHora = (a, b) => String(a || "").localeCompare(String(b || ""));

export default function ResumoOperacionalGuias() {
  const [dataSelecionada, setDataSelecionada] = useState(getHojeIso());
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState(null);
  const [itensBrutos, setItensBrutos] = useState([]);
  const [filtroGuia, setFiltroGuia] = useState("todos");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [gruposExpandidos, setGruposExpandidos] = useState({});
  const [copiado, setCopiado] = useState(false);

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
    } catch (error) {
      console.error("Erro ao carregar serviços da API:", error);
      setErro("Não foi possível carregar os serviços da API.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarServicos();
  }, [dataSelecionada]);

  const gruposBase = useMemo(() => {
    const somenteComGuia = itensBrutos.filter((item) => {
      const guia = extrairGuiaEscalado(item);
      return String(guia || "").trim();
    });

    const mapa = {};

    somenteComGuia.forEach((item, index) => {
      const guia = extrairGuiaEscalado(item);
      const passeio = extrairNomePasseio(item);
      const veiculo = extrairVeiculo(item);
      const fornecedor = extrairFornecedor(item);
      const modalidade = extrairModalidade(item);
      const tipoLinha = extrairTipoLinha(item);

      if (!mapa[guia]) {
        mapa[guia] = {
          id: guia,
          guia,
          servicos: [],
        };
      }

      const chaveServico = `${tipoLinha}__${passeio}__${modalidade}__${veiculo}__${fornecedor}`;

      let servicoExistente = mapa[guia].servicos.find(
        (s) => s.chave === chaveServico
      );

      if (!servicoExistente) {
        servicoExistente = {
          chave: chaveServico,
          passeio,
          veiculo,
          fornecedor,
          modalidade,
          tipoLinha,
          reservas: [],
        };
        mapa[guia].servicos.push(servicoExistente);
      }

      servicoExistente.reservas.push({
        id: `${extrairReservaCodigo(item)}_${index}`,
        nomePax: extrairNomePax(item),
        numeroReserva: extrairReservaCodigo(item),
        quantidade: extrairQuantidade(item),
        quantidadeDetalhada: formatarQuantidadeDetalhada(item),
        hotel: extrairHotel(item),
        horarioApresentacao: extrairHorarioApresentacao(item),
        observacao: extrairObservacao(item),
      });
    });

    return Object.values(mapa)
      .map((grupo) => {
        const servicosOrdenados = grupo.servicos
          .map((servico) => ({
            ...servico,
            totalPax: servico.reservas.reduce(
              (acc, reserva) => acc + Number(reserva.quantidade || 0),
              0
            ),
            primeiraHora:
              servico.reservas
                .map((r) => r.horarioApresentacao)
                .sort(ordenarHora)[0] || "--:--",
          }))
          .sort((a, b) => {
            const horaCompare = ordenarHora(a.primeiraHora, b.primeiraHora);
            if (horaCompare !== 0) return horaCompare;
            return String(a.passeio).localeCompare(String(b.passeio), "pt-BR");
          });

        return {
          ...grupo,
          servicos: servicosOrdenados,
          modalidadePrincipal: servicosOrdenados[0]?.modalidade || "Não informado",
          fornecedorPrincipal:
            servicosOrdenados[0]?.fornecedor || "Não informado",
          tipoPrincipal: servicosOrdenados[0]?.tipoLinha || "Não informado",
          totalServicos: servicosOrdenados.length,
          totalPax: servicosOrdenados.reduce(
            (acc, servico) => acc + Number(servico.totalPax || 0),
            0
          ),
          totalReservas: servicosOrdenados.reduce(
            (acc, servico) => acc + servico.reservas.length,
            0
          ),
        };
      })
      .sort((a, b) => String(a.guia).localeCompare(String(b.guia), "pt-BR"));
  }, [itensBrutos]);

  const guiasDisponiveis = useMemo(() => {
    return gruposBase.map((item) => item.guia);
  }, [gruposBase]);

  const gruposFiltrados = useMemo(() => {
    let lista = gruposBase;

    if (filtroGuia !== "todos") {
      lista = lista.filter((item) => item.guia === filtroGuia);
    }

    if (filtroTipo === "todos") return lista;

    return lista
      .map((grupo) => {
        const servicosFiltrados = grupo.servicos.filter(
          (servico) => servico.tipoLinha === filtroTipo
        );

        return {
          ...grupo,
          servicos: servicosFiltrados,
          modalidadePrincipal:
            servicosFiltrados[0]?.modalidade || "Não informado",
          fornecedorPrincipal:
            servicosFiltrados[0]?.fornecedor || "Não informado",
          tipoPrincipal: servicosFiltrados[0]?.tipoLinha || "Não informado",
          totalServicos: servicosFiltrados.length,
          totalPax: servicosFiltrados.reduce(
            (acc, servico) => acc + Number(servico.totalPax || 0),
            0
          ),
          totalReservas: servicosFiltrados.reduce(
            (acc, servico) => acc + servico.reservas.length,
            0
          ),
        };
      })
      .filter((grupo) => grupo.servicos.length > 0);
  }, [gruposBase, filtroGuia, filtroTipo]);

  const resumo = useMemo(() => {
    return {
      guias: gruposFiltrados.length,
      servicos: gruposFiltrados.reduce((acc, item) => acc + item.totalServicos, 0),
      pax: gruposFiltrados.reduce((acc, item) => acc + item.totalPax, 0),
      reservas: gruposFiltrados.reduce(
        (acc, item) => acc + item.totalReservas,
        0
      ),
    };
  }, [gruposFiltrados]);

  const toggleGrupo = (id) => {
    setGruposExpandidos((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const montarResumoTexto = () => {
    const linhas = [
      "Olá, equipe! 🍀",
      "",
      `Lista operacional em ${formatarDataBr(dataSelecionada)}:`,
      "",
    ];

    gruposFiltrados.forEach((grupo) => {
      grupo.servicos.forEach((servico) => {
        if (deveIgnorarServico(servico.passeio)) return;

        linhas.push(`*${servico.passeio}*`);
        linhas.push(`TIPO: ${servico.tipoLinha}`);
        linhas.push(`MODALIDADE: ${servico.modalidade}`);
        linhas.push(`GUIA: ${grupo.guia}`);
        linhas.push(`QUANTIDADE DE PAX: ${servico.totalPax}`);
        linhas.push(`VEÍCULO: ${servico.veiculo}`);
        linhas.push(`PONTO DE APOIO:`);
        linhas.push("");
        linhas.push("--");
        linhas.push("");
      });
    });

    linhas.push("Pontos de apoio informados! 🍀");

    return linhas.join("\n");
  };

  const copiarResumo = async () => {
    try {
      await navigator.clipboard.writeText(montarResumoTexto());
      setCopiado(true);

      setTimeout(() => {
        setCopiado(false);
      }, 2000);
    } catch (error) {
      console.error("Erro ao copiar resumo:", error);
      alert("Não foi possível copiar o resumo.");
    }
  };

  return (
    <div className="painel-outs-page">
      <div className="painel-outs-header">
        <div>
          <h2 className="painel-outs-title">
            <SwapHorizRounded fontSize="small" />
            Resumo operacional por guia
          </h2>
          <p className="painel-outs-subtitle">
            Visualização operacional dos guias escalados com OUTs, transfers,
            veículos, modalidade e reservas do dia.
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
            <p>Selecione a data e atualize a leitura operacional.</p>
          </div>

          <div className="painel-outs-toolbar">
            <div className="painel-outs-field">
              <label>
                <CalendarMonthRounded fontSize="small" />
                Data operacional
              </label>
              <input
                type="date"
                className="painel-outs-input"
                value={dataSelecionada}
                onChange={(e) => setDataSelecionada(e.target.value)}
              />
            </div>

            <div className="painel-outs-field">
              <label>
                <FilterAltRounded fontSize="small" />
                Filtrar guia
              </label>
              <select
                className="painel-outs-input"
                value={filtroGuia}
                onChange={(e) => setFiltroGuia(e.target.value)}
              >
                <option value="todos">Todos</option>
                {guiasDisponiveis.map((guia) => (
                  <option key={guia} value={guia}>
                    {guia}
                  </option>
                ))}
              </select>
            </div>

            <div className="painel-outs-field">
              <label>
                <FilterAltRounded fontSize="small" />
                Tipo
              </label>
              <select
                className="painel-outs-input"
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value)}
              >
                <option value="todos">OUTs + Transfers</option>
                <option value="OUT">Somente OUTs</option>
                <option value="TRANSFER">Somente Transfers</option>
              </select>
            </div>

            <div className="painel-outs-actions">
              <button
                type="button"
                className="painel-outs-btn-primary"
                onClick={carregarServicos}
                disabled={loading}
              >
                <RefreshRounded
                  fontSize="small"
                  className={loading ? "spin" : ""}
                />
                {loading ? "Atualizando..." : "Atualizar"}
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
              <span className="painel-outs-badge">guias escalados</span>
            </div>
            <p>Consolidação dos guias, serviços, reservas e pax.</p>
          </div>

          <div className="painel-outs-kpis">
            <div className="painel-outs-kpi">
              <div className="painel-outs-kpi-icon">
                <PersonRounded fontSize="small" />
              </div>
              <div>
                <span>Guias</span>
                <strong>
                  {loading ? (
                    <SyncRounded className="spin" fontSize="small" />
                  ) : (
                    resumo.guias
                  )}
                </strong>
              </div>
            </div>

            <div className="painel-outs-kpi">
              <div className="painel-outs-kpi-icon">
                <LocalShippingRounded fontSize="small" />
              </div>
              <div>
                <span>Serviços</span>
                <strong>
                  {loading ? (
                    <SyncRounded className="spin" fontSize="small" />
                  ) : (
                    resumo.servicos
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
          </div>
        </div>

        <div className="painel-outs-card painel-outs-card-full">
          <div className="painel-outs-card-header">
            <div className="painel-outs-card-title-row">
              <h3>Guias escalados</h3>

              <div className="resumo-guia-header-actions">
                <span className="painel-outs-badge">
                  {loading ? "Carregando..." : `${gruposFiltrados.length} guia(s)`}
                </span>

                <button
                  type="button"
                  className={`resumo-copy-btn ${copiado ? "success" : ""}`}
                  onClick={copiarResumo}
                  disabled={loading || !gruposFiltrados.length}
                >
                  {copiado ? (
                    <CheckRounded fontSize="small" />
                  ) : (
                    <ContentCopyRounded fontSize="small" />
                  )}
                  {copiado ? "Copiado!" : "Copiar resumo"}
                </button>
              </div>
            </div>

            <p>
              No card fechado: título = guia, subtítulo = primeiro serviço. No
              cabeçalho do item ficam motorista, modalidade, reservas e pax.
            </p>
          </div>

          {erro ? (
            <div className="painel-outs-empty centered">{erro}</div>
          ) : loading ? (
            <div className="painel-outs-empty centered">
              <SyncRounded className="spin" fontSize="small" />
              <span>Atualizando serviços...</span>
            </div>
          ) : gruposFiltrados.length === 0 ? (
            <div className="painel-outs-empty centered">
              Nenhum guia escalado encontrado.
            </div>
          ) : (
            <div className="painel-outs-list">
              {gruposFiltrados.map((grupo) => {
                const expandido = !!gruposExpandidos[grupo.id];
                const primeiroPasseio = grupo.servicos[0]?.passeio || "-";

                return (
                  <div key={grupo.id} className="painel-outs-item">
                    <button
                      type="button"
                      className="painel-outs-item-top resumo-guia-top"
                      onClick={() => toggleGrupo(grupo.id)}
                    >
                      <div className="painel-outs-item-main">
                        <div className="painel-outs-item-title-wrap resumo-guia-title-wrap">
                          <div className="painel-outs-item-title resumo-guia-title">
                            {grupo.guia}
                          </div>

                          <div className="painel-outs-item-subtitle resumo-guia-subtitle">
                            {primeiroPasseio}
                          </div>
                        </div>

                        <div className="painel-outs-item-meta resumo-guia-meta">
                          <span className="resumo-chip resumo-chip-provider">
                            Motorista: {grupo.fornecedorPrincipal}
                          </span>

                          <span className="resumo-chip resumo-chip-guide">
                            Modalidade: {grupo.modalidadePrincipal}
                          </span>

                          <span className="resumo-chip resumo-chip-muted">
                            Reservas: {grupo.totalReservas}
                          </span>

                          <span className="resumo-chip resumo-chip-pax">
                            Pax: {grupo.totalPax}
                          </span>
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
                      <div className="painel-outs-item-expanded resumo-guia-expanded">
                        <div className="resumo-guia-servicos">
                          {grupo.servicos.map((servico) => (
                            <div
                              key={servico.chave}
                              className="painel-outs-hotel-block resumo-guia-servico-bloco"
                            >
                              <div className="painel-outs-hotel-header resumo-guia-servico-header">
                                <div className="painel-outs-hotel-title">
                                  <DirectionsBusRounded fontSize="small" />
                                  <strong>{servico.passeio}</strong>
                                </div>

                                <div className="resumo-guia-servico-chips">
                                  <span className="painel-outs-hotel-time">
                                    {servico.primeiraHora}
                                  </span>

                                  <span className="resumo-chip resumo-chip-provider">
                                    {servico.tipoLinha}
                                  </span>

                                  <span className="resumo-chip resumo-chip-guide">
                                    {servico.modalidade}
                                  </span>

                                  <span className="resumo-chip resumo-chip-vehicle">
                                    {servico.veiculo}
                                  </span>

                                  <span className="resumo-chip resumo-chip-provider">
                                    {servico.fornecedor}
                                  </span>

                                  <span className="resumo-chip resumo-chip-pax">
                                    {servico.totalPax} pax
                                  </span>
                                </div>
                              </div>

                              <div className="painel-outs-reservas resumo-guia-reservas">
                                {servico.reservas.map((reserva) => (
                                  <div
                                    key={reserva.id}
                                    className="painel-outs-reserva-card resumo-guia-reserva-card"
                                  >
                                    <div className="resumo-guia-reserva-top">
                                      <div className="resumo-guia-pax-nome">
                                        {reserva.nomePax}
                                      </div>

                                      <span className="resumo-guia-reserva-codigo">
                                        {reserva.numeroReserva}
                                      </span>
                                    </div>

                                    <div className="painel-outs-reserva-grid resumo-guia-reserva-grid">
                                      <div className="painel-outs-info">
                                        <span className="painel-outs-info-label">
                                          Quantidade
                                        </span>
                                        <strong>
                                          {reserva.quantidadeDetalhada}
                                        </strong>
                                      </div>

                                      <div className="painel-outs-info">
                                        <span className="painel-outs-info-label">
                                          Hotel
                                        </span>
                                        <strong>{reserva.hotel}</strong>
                                      </div>

                                      <div className="painel-outs-info">
                                        <span className="painel-outs-info-label">
                                          Horário de apresentação
                                        </span>
                                        <strong>
                                          {reserva.horarioApresentacao}
                                        </strong>
                                      </div>
                                    </div>

                                    <div className="painel-outs-observacao resumo-guia-obs">
                                      <div className="painel-outs-observacao-title">
                                        OBS
                                      </div>
                                      <p>{reserva.observacao || "-"}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
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
}   