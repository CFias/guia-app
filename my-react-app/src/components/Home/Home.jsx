import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, query, where } from "firebase/firestore";
import {
  AutoGraphRounded,
  CalendarMonthRounded,
  FactCheckRounded,
  GroupsRounded,
  InsightsRounded,
  LocalFireDepartmentRounded,
  LockRounded,
  SearchOffRounded,
  ShieldRounded,
  TravelExploreRounded,
  WarningAmberRounded,
} from "@mui/icons-material";
import { db } from "../../Services/Services/firebase";
import logo from "../../assets/logo4.png";
import LoadingBlock from "../LoadingOverlay/LoadingOverlay.jsx";
import "./styles.css";

const DIAS = [
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
  "Domingo",
];

const API_BASE =
  "https://driversalvador.phoenix.comeialabs.com/scale/reserve-service";

const EXPAND =
  "service,schedule,reserve,establishmentOrigin,establishmentDestination,establishmentOrigin.region,establishmentDestination.region,reserve.partner,reserve.customer,additionalReserveServices,additionalReserveServices.additional,additionalReserveServices.provider,roadmapService,roadmapService.roadmap,auxRoadmapService.roadmap.serviceOrder,auxRoadmapService.roadmap.serviceOrder.vehicle,auxRoadmapService.roadmap.driver,auxRoadmapService.roadmap.guide,roadmapService.roadmap.driver,roadmapService.roadmap.guide,roadmapService.roadmap.serviceOrder,roadmapService.roadmap.serviceOrder.vehicle,reserve.pdvPayment.user";

const SERVICOS_IGNORADOS = [
  "01 PASSEIO A ESCOLHER NO DESTINO",
  "CITY TOUR PANORAMICO",
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
];

const TERMOS_IGNORADOS = [];

const MAPA_NOMES_CANONICOS = {
  "city tour historico e panoramico": "CITY TOUR HISTORICO E PANORAMICO",
  "city tour historico panoramico": "CITY TOUR HISTORICO E PANORAMICO",
  "tour de ilhas frades e itaparica": "TOUR DE ILHAS - FRADES E ITAPARICA",
  "ilhas frades + itaparica": "TOUR DE ILHAS - FRADES E ITAPARICA",
  "ilhas frades itaparica": "TOUR DE ILHAS - FRADES E ITAPARICA",
  "volta frades com itaparica": "VOLTA FRADES COM ITAPARICA",
  "city tour panoramico": "CITY TOUR PANORAMICO",
  "city tour historico": "CITY TOUR HISTORICO",
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

const obterNomeCanonico = (nome = "") => {
  const normalizado = normalizarTexto(nome);
  return MAPA_NOMES_CANONICOS[normalizado] || String(nome).trim().toUpperCase();
};

const deveIgnorarServico = (nome = "") => {
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

const LABEL_OCUPACAO = (valor) => {
  if (valor >= 90) return "Alta";
  if (valor >= 60) return "Boa";
  if (valor >= 30) return "Moderada";
  return "Baixa";
};

const NIVEL_RISCO = (valor) => {
  if (valor >= 80) return "Crítico";
  if (valor >= 55) return "Alto";
  if (valor >= 30) return "Moderado";
  return "Baixo";
};

const getSemanaAtual = () => {
  const hoje = new Date();
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
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
      label: `${dd}/${mm}`,
      short: dia.slice(0, 3),
    };
  });
};

const montarUrlApi = (date) => {
  const params = new URLSearchParams();
  params.append("execution_date", date);
  params.append("expand", EXPAND);
  params.append("service_type[]", "3");
  return `${API_BASE}?${params.toString()}`;
};

const extrairListaResposta = (json) => {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.results)) return json.results;
  return [];
};

const extrairNomePasseio = (item) =>
  item?.service?.name ||
  item?.service?.nome ||
  item?.reserveService?.service?.name ||
  item?.name ||
  "";

const extrairServiceIdExterno = (item) =>
  Number(item?.service_id || item?.service?.id || 0) || null;

const extrairDataServico = (item) => {
  const dataHora =
    item?.presentation_hour ||
    item?.presentation_hour_end ||
    item?.date ||
    item?.execution_date ||
    "";

  return dataHora ? String(dataHora).slice(0, 10) : "";
};

const extrairContagemPax = (item) => {
  const adultos = Number(item?.is_adult_count || 0);
  const criancas = Number(item?.is_child_count || 0);
  const infants = Number(item?.is_infant_count || 0);

  return {
    adultos,
    criancas,
    infants,
    total: adultos + criancas,
  };
};

const Home = () => {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [atualizandoApi, setAtualizandoApi] = useState(false);
  const [versiculo, setVersiculo] = useState(null);

  const [guias, setGuias] = useState([]);
  const [services, setServices] = useState([]);
  const [weeklyServices, setWeeklyServices] = useState([]);
  const [availabilityDocs, setAvailabilityDocs] = useState([]);
  const [affinityDocs, setAffinityDocs] = useState([]);
  const [apiSemana, setApiSemana] = useState([]);

  const [ultimaAtualizacaoApi, setUltimaAtualizacaoApi] = useState(null);
  const [abaAtiva, setAbaAtiva] = useState("operacao");
  const [diaSelecionadoHome, setDiaSelecionadoHome] = useState("");

  const [filtroStatusDia, setFiltroStatusDia] = useState("todos");
  const [filtroGuiaDia, setFiltroGuiaDia] = useState("todos");
  const [ordenacaoPaxDia, setOrdenacaoPaxDia] = useState("maior");

  const semana = useMemo(() => getSemanaAtual(), []);
  const inicioSemana = semana[0]?.date;
  const fimSemana = semana[semana.length - 1]?.date;

  const carregarApiSemana = async () => {
    try {
      setAtualizandoApi(true);

      const respostasApi = await Promise.all(
        semana.map(async (dia) => {
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
        const nome = extrairNomePasseio(item);
        const externalServiceId = extrairServiceIdExterno(item);
        const date = extrairDataServico(item);
        const pax = extrairContagemPax(item);

        if (!date || !nome) return;
        if (date < inicioSemana || date > fimSemana) return;

        const nomeCanonico = obterNomeCanonico(nome);
        if (deveIgnorarServico(nomeCanonico)) return;

        const chave = externalServiceId
          ? `${date}_id_${externalServiceId}`
          : `${date}_nome_${normalizarTexto(nomeCanonico)}`;

        if (!itensApiAgrupados[chave]) {
          itensApiAgrupados[chave] = {
            chave,
            date,
            serviceName: nomeCanonico,
            externalServiceId: externalServiceId || null,
            passengers: 0,
            adultCount: 0,
            childCount: 0,
            infantCount: 0,
          };
        }

        itensApiAgrupados[chave].passengers += pax.total;
        itensApiAgrupados[chave].adultCount += pax.adultos;
        itensApiAgrupados[chave].childCount += pax.criancas;
        itensApiAgrupados[chave].infantCount += pax.infants;
      });

      const listaFinal = Object.values(itensApiAgrupados);
      setApiSemana(listaFinal);
      setUltimaAtualizacaoApi(new Date());

      if (!diaSelecionadoHome) {
        const hoje = new Date().toISOString().slice(0, 10);
        const existeHoje = semana.find((d) => d.date === hoje);
        setDiaSelecionadoHome(existeHoje ? hoje : semana[0]?.date || "");
      }
    } catch (error) {
      console.error("Erro ao atualizar dados do Phoenix:", error);
    } finally {
      setAtualizandoApi(false);
    }
  };

  useEffect(() => {
    const carregarTudo = async () => {
      try {
        setLoading(true);

        const listaVersiculos = [
          "psalms 23:1",
          "philippians 4:13",
          "isaiah 41:10",
          "proverbs 3:5",
          "jeremiah 29:11",
          "romans 8:28",
        ];

        const hoje = new Date().toISOString().slice(0, 10);
        const index = Number(hoje.split("-").join("")) % listaVersiculos.length;
        const referencia = listaVersiculos[index];

        const [
          versiculoRes,
          snapGuias,
          snapServices,
          snapDisponibilidade,
          snapAfinidade,
          snapWeekly,
        ] = await Promise.all([
          fetch(`https://bible-api.com/${referencia}?translation=almeida`),
          getDocs(collection(db, "guides")),
          getDocs(collection(db, "services")),
          getDocs(collection(db, "guide_availability")),
          getDocs(collection(db, "guide_tour_levels")),
          getDocs(
            query(
              collection(db, "weekly_services"),
              where("date", ">=", inicioSemana),
              where("date", "<=", fimSemana),
            ),
          ),
        ]);

        const versiculoData = await versiculoRes.json();

        setVersiculo({
          texto: versiculoData.text,
          referencia: versiculoData.reference,
        });

        setGuias(
          snapGuias.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          })),
        );

        setServices(
          snapServices.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          })),
        );

        setAvailabilityDocs(snapDisponibilidade.docs.map((d) => d.data()));
        setAffinityDocs(
          snapAfinidade.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          })),
        );

        setWeeklyServices(
          snapWeekly.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          })),
        );

        await carregarApiSemana();
      } catch (error) {
        console.error("Erro ao carregar Home:", error);
      } finally {
        setLoading(false);
      }
    };

    carregarTudo();
  }, [inicioSemana, fimSemana]);

  const dashboard = useMemo(() => {
    const guiasAtivos = guias.filter((g) => g.ativo !== false);
    const guiasInativos = guias.filter((g) => g.ativo === false);
    const motoguias = guias.filter((g) => g.motoguia);

    const weeklyNormalizados = weeklyServices.map((r) => {
      const nomeCanonico = obterNomeCanonico(r.serviceName || "");

      return {
        ...r,
        _nomeCanonico: nomeCanonico,
        _nomeNormalizado: normalizarTexto(nomeCanonico),
        _externalIdNormalizado:
          r.externalServiceId !== null && r.externalServiceId !== undefined
            ? Number(r.externalServiceId)
            : null,
      };
    });

    const encontrarRelacionadosNoBanco = (apiItem) => {
      const externalIdApi =
        apiItem.externalServiceId !== null &&
        apiItem.externalServiceId !== undefined
          ? Number(apiItem.externalServiceId)
          : null;

      const nomeApiNormalizado = normalizarTexto(
        obterNomeCanonico(apiItem.serviceName || ""),
      );

      const porExternalId =
        externalIdApi !== null
          ? weeklyNormalizados.filter(
              (r) =>
                r.date === apiItem.date &&
                r._externalIdNormalizado !== null &&
                r._externalIdNormalizado === externalIdApi,
            )
          : [];

      if (porExternalId.length) return porExternalId;

      const porNome = weeklyNormalizados.filter(
        (r) =>
          r.date === apiItem.date && r._nomeNormalizado === nomeApiNormalizado,
      );

      return porNome;
    };

    const servicosExecutivos = apiSemana.map((apiItem) => {
      const listaRelacionada = encontrarRelacionadosNoBanco(apiItem);

      const abertoOuManual = listaRelacionada.filter(
        (r) => r.allocationStatus !== "CLOSED",
      );

      const fechado = listaRelacionada.some(
        (r) => r.allocationStatus === "CLOSED",
      );

      const registroComGuia =
        abertoOuManual.find((r) => !!r.guiaId) ||
        abertoOuManual.find((r) => !!r.guiaNome) ||
        null;

      const alocado = !!registroComGuia;

      return {
        ...apiItem,
        hasWeeklyRecord: listaRelacionada.length > 0,
        alocado,
        fechado,
        guiaId: registroComGuia?.guiaId || null,
        guiaNome: registroComGuia?.guiaNome || null,
      };
    });

    const totalServicosReais = servicosExecutivos.length;
    const servicosAlocados = servicosExecutivos.filter((s) => s.alocado);
    const servicosSemGuia = servicosExecutivos.filter(
      (s) => !s.alocado && !s.fechado,
    );
    const servicosFechados = servicosExecutivos.filter((s) => s.fechado);
    const gruposFormados = servicosExecutivos.filter(
      (s) => Number(s.passengers || 0) >= 8 && !s.fechado,
    );
    const gruposNaoFormados = servicosExecutivos.filter(
      (s) => Number(s.passengers || 0) < 8 && !s.fechado,
    );

    const paxTotalSemana = servicosExecutivos.reduce(
      (acc, item) => acc + Number(item.passengers || 0),
      0,
    );

    const paxSemGuia = servicosSemGuia.reduce(
      (acc, item) => acc + Number(item.passengers || 0),
      0,
    );

    const percentualServicosComGuia = totalServicosReais
      ? Math.round((servicosAlocados.length / totalServicosReais) * 100)
      : 0;

    const percentualPassageirosComGuia = paxTotalSemana
      ? Math.round(((paxTotalSemana - paxSemGuia) / paxTotalSemana) * 100)
      : 0;

    const mapaDisponibilidade = {};
    availabilityDocs.forEach((d) => {
      if (!d?.guideId || !Array.isArray(d.disponibilidade)) return;
      mapaDisponibilidade[d.guideId] = d.disponibilidade.filter(
        (item) => item.date >= inicioSemana && item.date <= fimSemana,
      );
    });

    const resumoGuias = guiasAtivos
      .map((guia) => {
        const servicos = servicosExecutivos.filter(
          (r) => r.guiaNome === guia.nome && !r.fechado,
        ).length;

        const diasDisponiveis = (mapaDisponibilidade[guia.id] || []).filter(
          (d) => d.status !== "BLOCKED",
        ).length;

        const diasBloqueados = (mapaDisponibilidade[guia.id] || []).filter(
          (d) => d.status === "BLOCKED",
        ).length;

        const ocupacao = diasDisponiveis
          ? Math.round((servicos / diasDisponiveis) * 100)
          : 0;

        return {
          id: guia.id,
          nome: guia.nome,
          servicos,
          diasDisponiveis,
          diasBloqueados,
          ocupacao,
          prioridade: guia.nivelPrioridade || 2,
          motoguia: !!guia.motoguia,
        };
      })
      .sort((a, b) => b.ocupacao - a.ocupacao);

    const guiasSobrecarga = [...resumoGuias]
      .filter((g) => g.ocupacao >= 80)
      .sort((a, b) => b.ocupacao - a.ocupacao)
      .slice(0, 6);

    const guiasOciosos = [...resumoGuias]
      .filter((g) => g.ocupacao <= 25)
      .sort((a, b) => a.ocupacao - b.ocupacao)
      .slice(0, 6);

    const mapaPasseios = {};
    servicosExecutivos.forEach((item) => {
      const nome = item.serviceName || "Passeio";
      if (!mapaPasseios[nome]) {
        mapaPasseios[nome] = {
          nome,
          pax: 0,
          servicos: 0,
          comGuia: 0,
          semGuia: 0,
          fechados: 0,
          paxSemGuia: 0,
        };
      }

      mapaPasseios[nome].pax += Number(item.passengers || 0);
      mapaPasseios[nome].servicos += 1;

      if (item.fechado) {
        mapaPasseios[nome].fechados += 1;
      } else if (item.alocado) {
        mapaPasseios[nome].comGuia += 1;
      } else {
        mapaPasseios[nome].semGuia += 1;
        mapaPasseios[nome].paxSemGuia += Number(item.passengers || 0);
      }
    });

    const topPasseios = Object.values(mapaPasseios)
      .sort((a, b) => b.pax - a.pax)
      .slice(0, 6);

    const passeiosMaisRisco = Object.values(mapaPasseios)
      .map((p) => {
        const risco =
          p.semGuia * 25 +
          p.paxSemGuia * 1.2 +
          p.fechados * 10 +
          (p.servicos > 0 ? ((p.semGuia / p.servicos) * 100) / 2 : 0);

        return {
          ...p,
          risco: Math.round(risco),
        };
      })
      .sort((a, b) => b.risco - a.risco)
      .slice(0, 6);

    const coberturaAfinidade = affinityDocs.length
      ? Math.round(
          (affinityDocs.length / Math.max(guiasAtivos.length, 1)) * 100,
        )
      : 0;

    const disponibilidadeMedia = (() => {
      if (!guiasAtivos.length) return 0;

      const total = guiasAtivos.reduce((acc, guia) => {
        const dias = (mapaDisponibilidade[guia.id] || []).filter(
          (d) => d.status !== "BLOCKED",
        ).length;
        return acc + dias;
      }, 0);

      return Math.round((total / guiasAtivos.length) * 10) / 10;
    })();

    const distribuicaoSemana = semana.map((dia) => {
      const servicosDia = servicosExecutivos.filter((r) => r.date === dia.date);
      return {
        ...dia,
        total: servicosDia.length,
        comGuia: servicosDia.filter((r) => r.alocado && !r.fechado).length,
        semGuia: servicosDia.filter((r) => !r.alocado && !r.fechado).length,
        pax: servicosDia.reduce(
          (acc, item) => acc + Number(item.passengers || 0),
          0,
        ),
      };
    });

    const maiorVolumeDia = Math.max(
      ...distribuicaoSemana.map((d) => d.total),
      1,
    );
    const maiorPaxDia = Math.max(...distribuicaoSemana.map((d) => d.pax), 1);

    const alertas = [];

    if (servicosSemGuia.length > 0) {
      alertas.push({
        tipo: "critico",
        titulo: "Serviços reais sem guia",
        descricao: `${servicosSemGuia.length} serviço(s) da API ainda estão sem guia alocado nesta semana.`,
      });
    }

    if (paxSemGuia > 0) {
      alertas.push({
        tipo: "critico",
        titulo: "Pax sem guia",
        descricao: `${paxSemGuia} passageiro(s) estão em serviços ainda sem guia alocado.`,
      });
    }

    if (percentualServicosComGuia < 80) {
      alertas.push({
        tipo: "atencao",
        titulo: "Serviços com guia abaixo do ideal",
        descricao: `O percentual atual está em ${percentualServicosComGuia}%.`,
      });
    }

    if (percentualPassageirosComGuia < 80) {
      alertas.push({
        tipo: "atencao",
        titulo: "Passageiros com guia abaixo do ideal",
        descricao: `O percentual atual está em ${percentualPassageirosComGuia}%.`,
      });
    }

    if (guiasSobrecarga.length > 0) {
      alertas.push({
        tipo: "info",
        titulo: "Guias com alta ocupação",
        descricao: `${guiasSobrecarga.length} guia(s) aparecem com ocupação elevada.`,
      });
    }

    if (guiasOciosos.length > 0) {
      alertas.push({
        tipo: "info",
        titulo: "Capacidade ociosa detectada",
        descricao: `${guiasOciosos.length} guia(s) têm baixa ocupação e podem absorver mais demanda.`,
      });
    }

    return {
      totalServicosReais,
      servicosAlocados,
      servicosSemGuia,
      servicosFechados,
      gruposFormados,
      gruposNaoFormados,
      paxTotalSemana,
      paxSemGuia,
      percentualServicosComGuia,
      percentualPassageirosComGuia,
      guiasAtivos: guiasAtivos.length,
      guiasInativos: guiasInativos.length,
      motoguias: motoguias.length,
      totalServicesCatalogo: services.length,
      coberturaAfinidade,
      disponibilidadeMedia,
      distribuicaoSemana,
      maiorVolumeDia,
      maiorPaxDia,
      resumoGuias,
      guiasSobrecarga,
      guiasOciosos,
      topPasseios,
      passeiosMaisRisco,
      alertas,
      servicosExecutivos,
    };
  }, [
    guias,
    services,
    weeklyServices,
    availabilityDocs,
    affinityDocs,
    apiSemana,
    semana,
    inicioSemana,
    fimSemana,
  ]);

  const servicosDoDiaBase = useMemo(() => {
    if (!diaSelecionadoHome) return [];

    return dashboard.servicosExecutivos
      .filter((item) => item.date === diaSelecionadoHome)
      .map((item) => {
        let statusOperacional = "Sem guia";
        if (item.fechado) statusOperacional = "Fechado";
        else if (item.alocado) statusOperacional = "Alocado";

        const statusGrupo = item.fechado
          ? "Fechado"
          : Number(item.passengers || 0) >= 8
            ? "Grupo formado"
            : "Formar grupo";

        return {
          ...item,
          statusOperacional,
          statusGrupo,
        };
      });
  }, [dashboard.servicosExecutivos, diaSelecionadoHome]);

  const guiasDisponiveisNoDia = useMemo(() => {
    const unicos = Array.from(
      new Set(
        servicosDoDiaBase
          .map((item) => item.guiaNome || "-")
          .filter((nome) => nome && nome !== "-"),
      ),
    );

    return unicos.sort((a, b) =>
      a.localeCompare(b, "pt-BR", { sensitivity: "base" }),
    );
  }, [servicosDoDiaBase]);

  const servicosDoDia = useMemo(() => {
    const listaFiltrada = servicosDoDiaBase.filter((item) => {
      const statusOk =
        filtroStatusDia === "todos" ||
        (filtroStatusDia === "alocado" &&
          item.statusOperacional === "Alocado") ||
        (filtroStatusDia === "sem_guia" &&
          item.statusOperacional === "Sem guia") ||
        (filtroStatusDia === "fechado" &&
          item.statusOperacional === "Fechado") ||
        (filtroStatusDia === "grupo_formado" &&
          item.statusGrupo === "Grupo formado") ||
        (filtroStatusDia === "formar_grupo" &&
          item.statusGrupo === "Formar grupo");

      const guiaOk =
        filtroGuiaDia === "todos" || (item.guiaNome || "-") === filtroGuiaDia;

      return statusOk && guiaOk;
    });

    const listaOrdenada = [...listaFiltrada].sort((a, b) => {
      const paxA = Number(a.passengers || 0);
      const paxB = Number(b.passengers || 0);

      if (ordenacaoPaxDia === "maior") return paxB - paxA;
      if (ordenacaoPaxDia === "menor") return paxA - paxB;

      return (a.serviceName || "").localeCompare(b.serviceName || "", "pt-BR", {
        sensitivity: "base",
      });
    });

    return listaOrdenada;
  }, [servicosDoDiaBase, filtroStatusDia, filtroGuiaDia, ordenacaoPaxDia]);

  const formatarUltimaAtualizacao = (data) => {
    if (!data) return "Dados ainda não atualizados manualmente";
    return `Última atualização: ${data.toLocaleString("pt-BR")}`;
  };

  const gerarMensagemServicoGuia = (item) => {
    const nomeGuia = item.guiaNome || "Guia";
    const textoData = getTextoDataOperacional(item.date);

    if (item.statusGrupo === "Grupo formado") {
      return `
Olá, ${nomeGuia}.

Confirmamos sua programação ${textoData}: ${item.serviceName}, com previsão de ${item.passengers} passageiro(s).

Caso haja qualquer ajuste operacional, entraremos em contato.

Operacional - Luck Receptivo
`.trim();
    }

    if (item.statusGrupo === "Formar grupo") {
      return `
Olá, ${nomeGuia}.

Informamos que, até o momento, o grupo referente ao passeio ${item.serviceName}, programado ${textoData}, ainda não foi formado.

Havendo atualização operacional, enviaremos uma nova confirmação.

Operacional - Luck Receptivo
`.trim();
    }

    return `
Olá, ${nomeGuia}.

Informamos que o serviço ${item.serviceName}, previsto ${textoData}, encontra-se fechado no momento.

Qualquer atualização operacional será comunicada oportunamente.

Operacional - Luck Receptivo
`.trim();
  };

  const enviarWhatsappServico = (item) => {
    if (!item?.guiaId && !item?.guiaNome) {
      alert("Este serviço ainda não possui guia alocado.");
      return;
    }

    const guia =
      guias.find((g) => g.id === item.guiaId) ||
      guias.find(
        (g) =>
          normalizarTexto(g.nome || "") ===
          normalizarTexto(item.guiaNome || ""),
      );

    if (!guia?.whatsapp) {
      alert("O guia selecionado não possui WhatsApp cadastrado.");
      return;
    }

    const mensagem = gerarMensagemServicoGuia({
      ...item,
      guiaNome: guia.nome || item.guiaNome || "Guia",
    });

    const numero = String(guia.whatsapp).replace(/\D/g, "");

    window.open(
      `https://wa.me/55${numero}?text=${encodeURIComponent(mensagem)}`,
      "_blank",
    );
  };

  const formatarDataBr = (dataIso) => {
    if (!dataIso) return "";
    const [ano, mes, dia] = String(dataIso).split("-");
    return `${dia}/${mes}/${ano}`;
  };

  const isAmanha = (dataIso) => {
    if (!dataIso) return false;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const amanha = new Date(hoje);
    amanha.setDate(hoje.getDate() + 1);

    const [ano, mes, dia] = String(dataIso).split("-").map(Number);
    const dataRef = new Date(ano, mes - 1, dia);
    dataRef.setHours(0, 0, 0, 0);

    return dataRef.getTime() === amanha.getTime();
  };

  const getTextoDataOperacional = (dataIso) => {
    const dataBr = formatarDataBr(dataIso);

    if (isAmanha(dataIso)) {
      return `amanhã (${dataBr})`;
    }

    return `em ${dataBr}`;
  };

  return (
    <div className="home-dashboard-page">
      <LoadingBlock loading={loading} text="Carregando..." respectSidebar />

      <div className="home-dashboard-header">
        <div className="home-dashboard-brand">
          <img
            className="home-dashboard-logo"
            src={logo}
            alt="Operacional SSA"
          />
          <div className="home-dashboard-brand-text">
            <h2>Painel Operacional</h2>
            <p>Demanda real do Phoenix cruzada com alocação do sistema</p>
          </div>
        </div>

        <div className="home-dashboard-week-pill">
          <CalendarMonthRounded fontSize="small" />
          <span>
            {semana[0]?.label} até {semana[6]?.label}
          </span>
        </div>
      </div>

      <div className="home-dashboard-tabs">
        <button
          className={`home-tab ${abaAtiva === "operacao" ? "active" : ""}`}
          onClick={() => setAbaAtiva("operacao")}
        >
          Operação
        </button>
        <button
          className={`home-tab ${abaAtiva === "guias" ? "active" : ""}`}
          onClick={() => setAbaAtiva("guias")}
        >
          Guias
        </button>
        <button
          className={`home-tab ${abaAtiva === "passeios" ? "active" : ""}`}
          onClick={() => setAbaAtiva("passeios")}
        >
          Passeios
        </button>
        <button
          className={`home-tab ${abaAtiva === "risco" ? "active" : ""}`}
          onClick={() => setAbaAtiva("risco")}
        >
          Risco
        </button>
      </div>

      {abaAtiva === "operacao" && (
        <>
          <div className="home-live-toolbar">
            <div className="home-live-actions">
              <button
                type="button"
                className="home-refresh-btn"
                onClick={carregarApiSemana}
                disabled={atualizandoApi}
              >
                {atualizandoApi
                  ? "Atualizando Phoenix..."
                  : "Atualizar dados do Phoenix"}
              </button>
            </div>

            <div className="home-live-info">
              {formatarUltimaAtualizacao(ultimaAtualizacaoApi)}
            </div>
          </div>

          <div className="home-dashboard-metrics">
            <button type="button" className="home-dashboard-metric-card">
              <div className="metric-icon">
                <TravelExploreRounded fontSize="small" />
              </div>
              <div>
                <span className="metric-label">Serviços reais</span>
                <strong className="metric-value">
                  {dashboard.totalServicosReais}
                </strong>
              </div>
            </button>

            <button type="button" className="home-dashboard-metric-card">
              <div className="metric-icon">
                <FactCheckRounded fontSize="small" />
              </div>
              <div>
                <span className="metric-label">Serviços com guia (%)</span>
                <strong className="metric-value">
                  {dashboard.percentualServicosComGuia}%
                </strong>
              </div>
            </button>

            <button type="button" className="home-dashboard-metric-card">
              <div className="metric-icon">
                <GroupsRounded fontSize="small" />
              </div>
              <div>
                <span className="metric-label">Passageiros com guia (%)</span>
                <strong className="metric-value">
                  {dashboard.percentualPassageirosComGuia}%
                </strong>
              </div>
            </button>

            <button type="button" className="home-dashboard-metric-card">
              <div className="metric-icon">
                <InsightsRounded fontSize="small" />
              </div>
              <div>
                <span className="metric-label">Pax sem guia</span>
                <strong className="metric-value">{dashboard.paxSemGuia}</strong>
              </div>
            </button>
          </div>

          <div className="home-dashboard-card home-dashboard-card-full">
            <div className="home-dashboard-card-header">
              <div className="home-dashboard-card-title">
                <CalendarMonthRounded fontSize="small" />
                <h3>Serviços do dia</h3>
              </div>

              <button
                type="button"
                className="home-open-scale-btn"
                onClick={() => navigate("/passeios")}
              >
                Abrir escala da semana
              </button>
            </div>

            <div className="home-day-selector">
              {semana.map((dia) => (
                <button
                  key={dia.date}
                  type="button"
                  className={`home-day-chip ${
                    diaSelecionadoHome === dia.date ? "active" : ""
                  }`}
                  onClick={() => setDiaSelecionadoHome(dia.date)}
                >
                  {dia.day} • {dia.label}
                </button>
              ))}
            </div>

            <div className="home-services-filters">
              <select
                className="home-services-filter-select"
                value={filtroStatusDia}
                onChange={(e) => setFiltroStatusDia(e.target.value)}
              >
                <option value="todos">Todos os status</option>
                <option value="alocado">Alocado</option>
                <option value="sem_guia">Sem guia</option>
                <option value="fechado">Fechado</option>
                <option value="grupo_formado">Grupo formado</option>
                <option value="formar_grupo">Formar grupo</option>
              </select>

              <select
                className="home-services-filter-select"
                value={filtroGuiaDia}
                onChange={(e) => setFiltroGuiaDia(e.target.value)}
              >
                <option value="todos">Todos os guias</option>
                {guiasDisponiveisNoDia.map((guia) => (
                  <option key={guia} value={guia}>
                    {guia}
                  </option>
                ))}
              </select>

              <select
                className="home-services-filter-select"
                value={ordenacaoPaxDia}
                onChange={(e) => setOrdenacaoPaxDia(e.target.value)}
              >
                <option value="maior">Ordenar por maior pax</option>
                <option value="menor">Ordenar por menor pax</option>
                <option value="nome">Ordenar por nome</option>
              </select>
            </div>

            <div className="home-services-table-wrap">
              <table className="home-services-table">
                <thead>
                  <tr>
                    <th>Status operacional</th>
                    <th>Status do grupo</th>
                    <th>Passeio</th>
                    <th>Guia</th>
                    <th>Pax</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {servicosDoDia.length === 0 ? (
                    <tr>
                      <td colSpan="6">
                        <div className="empty-state">
                          Nenhum serviço encontrado para o dia selecionado.
                        </div>
                      </td>
                    </tr>
                  ) : (
                    servicosDoDia.map((item) => (
                      <tr key={item.chave}>
                        <td>
                          <span
                            className={`home-service-status ${
                              item.statusOperacional === "Fechado"
                                ? "fechado"
                                : item.statusOperacional === "Alocado"
                                  ? "alocado"
                                  : "sem-guia"
                            }`}
                          >
                            {item.statusOperacional}
                          </span>
                        </td>

                        <td>
                          <span
                            className={`home-group-status ${
                              item.statusGrupo === "Fechado"
                                ? "fechado"
                                : item.statusGrupo === "Grupo formado"
                                  ? "formado"
                                  : "alerta"
                            }`}
                          >
                            {item.statusGrupo}
                          </span>
                        </td>

                        <td>{item.serviceName}</td>
                        <td>{item.guiaNome || "-"}</td>
                        <td>
                          {item.passengers}
                          <small className="home-service-pax-detail">
                            {" "}
                            ({item.adultCount || 0} ADT / {item.childCount || 0}{" "}
                            CHD / {item.infantCount || 0} INF)
                          </small>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="home-send-guide-btn"
                            onClick={() => enviarWhatsappServico(item)}
                            disabled={!item.guiaId && !item.guiaNome}
                            title={
                              item.guiaId || item.guiaNome
                                ? "Enviar mensagem ao guia"
                                : "Serviço sem guia alocado"
                            }
                          >
                            Enviar ao guia
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="home-dashboard-grid">
            <div className="home-dashboard-card home-dashboard-card-large">
              <div className="home-dashboard-card-header">
                <div className="home-dashboard-card-title">
                  <WarningAmberRounded fontSize="small" />
                  <h3>Alertas operacionais automáticos</h3>
                </div>
              </div>

              <div className="home-alerts-list">
                {dashboard.alertas.length === 0 ? (
                  <div className="empty-state">
                    Nenhum alerta crítico detectado nesta semana.
                  </div>
                ) : (
                  dashboard.alertas.map((alerta, index) => (
                    <div
                      key={`${alerta.titulo}-${index}`}
                      className={`home-alert-item ${alerta.tipo}`}
                    >
                      <strong>{alerta.titulo}</strong>
                      <span>{alerta.descricao}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="home-dashboard-card home-dashboard-card-large">
              <div className="home-dashboard-card-header">
                <div className="home-dashboard-card-title">
                  <CalendarMonthRounded fontSize="small" />
                  <h3>Demanda real da semana</h3>
                </div>
              </div>

              <div className="home-week-chart advanced">
                {dashboard.distribuicaoSemana.map((dia) => (
                  <div key={dia.date} className="chart-col">
                    <div className="chart-bars advanced">
                      <div
                        className="chart-bar chart-bar-total"
                        style={{
                          height: `${Math.max(
                            (dia.total / dashboard.maiorVolumeDia) * 180,
                            dia.total > 0 ? 16 : 8,
                          )}px`,
                        }}
                        title={`${dia.total} serviços`}
                      />
                      <div
                        className="chart-bar chart-bar-guided"
                        style={{
                          height: `${Math.max(
                            (dia.comGuia / dashboard.maiorVolumeDia) * 180,
                            dia.comGuia > 0 ? 12 : 6,
                          )}px`,
                        }}
                        title={`${dia.comGuia} com guia`}
                      />
                      <div
                        className="chart-bar chart-bar-pax"
                        style={{
                          height: `${Math.max(
                            (dia.pax / dashboard.maiorPaxDia) * 180,
                            dia.pax > 0 ? 12 : 6,
                          )}px`,
                        }}
                        title={`${dia.pax} pax`}
                      />
                    </div>
                    <strong>{dia.short}</strong>
                    <span>{dia.total} serv.</span>
                    <small>{dia.comGuia} c/ guia</small>
                    <small>{dia.pax} pax</small>
                  </div>
                ))}
              </div>

              <div className="chart-legend">
                <span>
                  <i className="legend-box total" /> Total de serviços
                </span>
                <span>
                  <i className="legend-box guided" /> Serviços com guia
                </span>
                <span>
                  <i className="legend-box pax" /> Pax do dia
                </span>
              </div>
            </div>

            <div className="home-dashboard-card home-dashboard-card-full">
              <div className="home-dashboard-card-header">
                <div className="home-dashboard-card-title">
                  <LockRounded fontSize="small" />
                  <h3>Versículo do dia</h3>
                </div>
              </div>

              {versiculo ? (
                <div className="home-bible-card">
                  <p className="home-bible-text">"{versiculo.texto}"</p>
                  <strong className="home-bible-ref">
                    {versiculo.referencia}
                  </strong>
                </div>
              ) : (
                <div className="empty-state">
                  Não foi possível carregar o versículo.
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {abaAtiva === "guias" && (
        <div className="home-dashboard-grid">
          <div className="home-dashboard-card home-dashboard-card-large">
            <div className="home-dashboard-card-header">
              <div className="home-dashboard-card-title">
                <AutoGraphRounded fontSize="small" />
                <h3>Balanceamento por guia</h3>
              </div>
            </div>

            <div className="home-dashboard-ranking">
              {dashboard.resumoGuias.length === 0 ? (
                <div className="empty-state">
                  Sem dados de ocupação nesta semana.
                </div>
              ) : (
                dashboard.resumoGuias.map((guia) => (
                  <div key={guia.id} className="ranking-item">
                    <div className="ranking-top">
                      <span className="ranking-name">
                        {guia.nome}
                        {guia.motoguia && (
                          <em className="inline-badge">Motoguia</em>
                        )}
                      </span>
                      <span className="ranking-badge">
                        {guia.ocupacao}% • {LABEL_OCUPACAO(guia.ocupacao)}
                      </span>
                    </div>

                    <div className="ranking-bar">
                      <div
                        className={`ranking-bar-fill ${
                          guia.ocupacao >= 80 ? "high" : "low"
                        }`}
                        style={{ width: `${Math.min(guia.ocupacao, 100)}%` }}
                      />
                    </div>

                    <div className="ranking-meta">
                      <span>{guia.servicos} serviço(s)</span>
                      <span>{guia.diasDisponiveis} dia(s) disponíveis</span>
                      <span>{guia.diasBloqueados} bloqueado(s)</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="home-dashboard-card">
            <div className="home-dashboard-card-header">
              <div className="home-dashboard-card-title">
                <LocalFireDepartmentRounded fontSize="small" />
                <h3>Ranking de sobrecarga</h3>
              </div>
            </div>

            <div className="home-dashboard-ranking">
              {dashboard.guiasSobrecarga.length === 0 ? (
                <div className="empty-state">
                  Nenhum guia em sobrecarga alta.
                </div>
              ) : (
                dashboard.guiasSobrecarga.map((guia) => (
                  <div key={guia.id} className="ranking-item">
                    <div className="ranking-top">
                      <span className="ranking-name">{guia.nome}</span>
                      <span className="ranking-badge">{guia.ocupacao}%</span>
                    </div>

                    <div className="ranking-bar">
                      <div
                        className="ranking-bar-fill high"
                        style={{ width: `${Math.min(guia.ocupacao, 100)}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="home-dashboard-card">
            <div className="home-dashboard-card-header">
              <div className="home-dashboard-card-title">
                <SearchOffRounded fontSize="small" />
                <h3>Ranking de ociosidade</h3>
              </div>
            </div>

            <div className="home-dashboard-ranking">
              {dashboard.guiasOciosos.length === 0 ? (
                <div className="empty-state">
                  Nenhum guia com ociosidade relevante.
                </div>
              ) : (
                dashboard.guiasOciosos.map((guia) => (
                  <div key={guia.id} className="ranking-item">
                    <div className="ranking-top">
                      <span className="ranking-name">{guia.nome}</span>
                      <span className="ranking-badge">{guia.ocupacao}%</span>
                    </div>

                    <div className="ranking-bar">
                      <div
                        className="ranking-bar-fill low"
                        style={{ width: `${Math.max(guia.ocupacao, 4)}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {abaAtiva === "passeios" && (
        <div className="home-dashboard-grid">
          <div className="home-dashboard-card home-dashboard-card-large">
            <div className="home-dashboard-card-header">
              <div className="home-dashboard-card-title">
                <TravelExploreRounded fontSize="small" />
                <h3>Passeios com maior volume real</h3>
              </div>
            </div>

            <div className="home-dashboard-ranking">
              {dashboard.topPasseios.length === 0 ? (
                <div className="empty-state">
                  Sem volume registrado nesta semana.
                </div>
              ) : (
                dashboard.topPasseios.map((passeio) => (
                  <div key={passeio.nome} className="tour-item">
                    <div className="tour-top">
                      <span className="tour-name">{passeio.nome}</span>
                      <span className="tour-pax">{passeio.pax} pax</span>
                    </div>

                    <div className="tour-bar">
                      <div
                        className="tour-bar-fill"
                        style={{
                          width: `${Math.max(
                            (passeio.pax /
                              Math.max(
                                ...dashboard.topPasseios.map((t) => t.pax),
                                1,
                              )) *
                              100,
                            8,
                          )}%`,
                        }}
                      />
                    </div>

                    <div className="tour-meta">
                      <span>{passeio.servicos} ocorrência(s)</span>
                      <span>{passeio.comGuia} com guia</span>
                      <span>{passeio.semGuia} sem guia</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="home-dashboard-card home-dashboard-card-full">
            <div className="home-dashboard-card-header">
              <div className="home-dashboard-card-title">
                <InsightsRounded fontSize="small" />
                <h3>Resumo executivo dos serviços reais</h3>
              </div>
            </div>

            <div className="home-dashboard-summary-grid">
              <div className="summary-box">
                <span className="summary-label">Serviços reais</span>
                <strong>{dashboard.totalServicosReais}</strong>
              </div>

              <div className="summary-box">
                <span className="summary-label">Alocados</span>
                <strong>{dashboard.servicosAlocados.length}</strong>
              </div>

              <div className="summary-box">
                <span className="summary-label">Sem guia</span>
                <strong>{dashboard.servicosSemGuia.length}</strong>
              </div>

              <div className="summary-box">
                <span className="summary-label">Fechados</span>
                <strong>{dashboard.servicosFechados.length}</strong>
              </div>

              <div className="summary-box">
                <span className="summary-label">Grupos formados</span>
                <strong>{dashboard.gruposFormados.length}</strong>
              </div>

              <div className="summary-box">
                <span className="summary-label">Grupos não formados</span>
                <strong>{dashboard.gruposNaoFormados.length}</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {abaAtiva === "risco" && (
        <div className="home-dashboard-grid">
          <div className="home-dashboard-card">
            <div className="home-dashboard-card-header">
              <div className="home-dashboard-card-title">
                <ShieldRounded fontSize="small" />
                <h3>Indicadores de risco</h3>
              </div>
            </div>

            <div className="home-dashboard-summary-grid single-column">
              <div className="summary-box">
                <span className="summary-label">Serviços com guia (%)</span>
                <strong>{dashboard.percentualServicosComGuia}%</strong>
              </div>

              <div className="summary-box">
                <span className="summary-label">Passageiros com guia (%)</span>
                <strong>{dashboard.percentualPassageirosComGuia}%</strong>
              </div>

              <div className="summary-box">
                <span className="summary-label">Pax sem guia</span>
                <strong>{dashboard.paxSemGuia}</strong>
              </div>

              <div className="summary-box">
                <span className="summary-label">Cobertura afinidade</span>
                <strong>{dashboard.coberturaAfinidade}%</strong>
              </div>
            </div>
          </div>

          <div className="home-dashboard-card home-dashboard-card-large">
            <div className="home-dashboard-card-header">
              <div className="home-dashboard-card-title">
                <WarningAmberRounded fontSize="small" />
                <h3>Passeios com maior risco operacional</h3>
              </div>
            </div>

            <div className="home-dashboard-ranking">
              {dashboard.passeiosMaisRisco.length === 0 ? (
                <div className="empty-state">Nenhum risco calculado.</div>
              ) : (
                dashboard.passeiosMaisRisco.map((passeio) => (
                  <div key={passeio.nome} className="ranking-item">
                    <div className="ranking-top">
                      <span className="ranking-name">{passeio.nome}</span>
                      <span className="ranking-badge">
                        {passeio.risco} • {NIVEL_RISCO(passeio.risco)}
                      </span>
                    </div>

                    <div className="ranking-bar">
                      <div
                        className="ranking-bar-fill high"
                        style={{ width: `${Math.min(passeio.risco, 100)}%` }}
                      />
                    </div>

                    <div className="ranking-meta">
                      <span>{passeio.semGuia} sem guia</span>
                      <span>{passeio.paxSemGuia} pax sem guia</span>
                      <span>{passeio.servicos} total</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;
