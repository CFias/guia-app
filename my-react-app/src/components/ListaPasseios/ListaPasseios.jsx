import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  deleteDoc,
  doc,
  query,
  where,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../Services/Services/firebase";
import "./styles.css";
import * as XLSX from "xlsx";
import {
  ManageAccounts,
  ModeEdit,
  Send,
  WhatsApp,
  Undo,
  Visibility,
  Warning,
  Groups,
  Lock,
} from "@mui/icons-material";
import LoadingBlock from "../../components/LoadingOverlay/LoadingOverlay";

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

const TERMOS_IGNORADOS = [
  // "PANORAMICO",
];

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

const montarUrlApi = (date) => {
  const params = new URLSearchParams();
  params.append("execution_date", date);
  params.append("expand", EXPAND);
  params.append("service_type[]", "3");
  return `${API_BASE}?${params.toString()}`;
};

const agruparRegistrosPorServico = (registros) => {
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

    const adultos = Number(r.adultCount ?? 0);
    const criancas = Number(r.childCount ?? 0);
    const infants = Number(r.infantCount ?? 0);

    mapa[chave].adultCount += adultos;
    mapa[chave].childCount += criancas;
    mapa[chave].infantCount += infants;

    if (adultos === 0 && criancas === 0 && infants === 0) {
      mapa[chave].passengers += Number(r.passengers ?? 0);
    }

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
        passengers:
          totalDetalhado > 0 ? totalDetalhado : Number(item.passengers ?? 0),
      };
    })
    .sort((a, b) =>
      (a.serviceName || "").localeCompare(b.serviceName || "", "pt-BR", {
        sensitivity: "base",
      }),
    );
};

const getFaixaAfinidade = (nivel) => {
  if (nivel >= 81) return 5;
  if (nivel >= 61) return 4;
  if (nivel >= 41) return 3;
  if (nivel >= 1) return 2;
  return 0;
};

const construirMapaDisponibilidade = (docsDisponibilidade) => {
  const mapa = {};
  docsDisponibilidade.forEach((d) => {
    mapa[d.guideId] = Array.isArray(d.disponibilidade) ? d.disponibilidade : [];
  });
  return mapa;
};

const guiaDisponivelNoDia = (mapaDisponibilidade, guiaId, date) => {
  const lista = mapaDisponibilidade[guiaId];
  if (!Array.isArray(lista)) return false;

  const info = lista.find((d) => d.date === date);
  if (!info) return false;

  return info.status !== "BLOCKED";
};

const getDiasDisponiveisSemana = (mapaDisponibilidade, guiaId, semanaRef) => {
  const lista = mapaDisponibilidade[guiaId];
  if (!Array.isArray(lista)) return 0;

  const datasSemana = new Set((semanaRef || []).map((d) => d.date));

  return lista.filter(
    (item) => datasSemana.has(item.date) && item.status !== "BLOCKED",
  ).length;
};

const getOcupacaoProporcional = (
  contadorSemana,
  mapaDisponibilidade,
  guiaId,
  semanaRef,
) => {
  const servicos = Number(contadorSemana[guiaId] || 0);
  const diasDisponiveis = getDiasDisponiveisSemana(
    mapaDisponibilidade,
    guiaId,
    semanaRef,
  );

  if (!diasDisponiveis) return Number.POSITIVE_INFINITY;
  return servicos / diasDisponiveis;
};

const getDiasTrabalhadosCount = (diasTrabalhadosSemana, guiaId) => {
  return diasTrabalhadosSemana[guiaId]?.size || 0;
};

const getScoreEquilibrio = ({
  guia,
  contadorSemana,
  diasTrabalhadosSemana,
  mapaDisponibilidade,
  semanaRef,
}) => {
  const diasDisponiveis = getDiasDisponiveisSemana(
    mapaDisponibilidade,
    guia.id,
    semanaRef,
  );

  const diasTrabalhados = getDiasTrabalhadosCount(
    diasTrabalhadosSemana,
    guia.id,
  );
  const servicos = Number(contadorSemana[guia.id] || 0);

  const ocupacao = diasDisponiveis > 0 ? servicos / diasDisponiveis : 999;
  const frequenciaDias =
    diasDisponiveis > 0 ? diasTrabalhados / diasDisponiveis : 999;

  return {
    diasDisponiveis,
    diasTrabalhados,
    servicos,
    ocupacao,
    frequenciaDias,
  };
};

const ordenarServicosPorEscassez = (
  itens,
  guiasDisponiveis,
  usadosNoDia,
  mapaAfinidade,
  servicesData,
) => {
  const itensComEscassez = itens.map((item) => {
    const aptos = guiasDisponiveis.filter((g) => {
      if (usadosNoDia.has(g.id)) return false;

      const nivel = obterNivelAfinidade(
        mapaAfinidade,
        g.id,
        item,
        servicesData,
      );
      return nivel > 0;
    });

    const maiorNivel = aptos.length
      ? Math.max(
          ...aptos.map((g) =>
            Number(
              obterNivelAfinidade(mapaAfinidade, g.id, item, servicesData) || 0,
            ),
          ),
        )
      : 0;

    return {
      ...item,
      _quantidadeAptos: aptos.length,
      _maiorNivel: maiorNivel,
    };
  });

  return itensComEscassez.sort((a, b) => {
    if (a._quantidadeAptos !== b._quantidadeAptos) {
      return a._quantidadeAptos - b._quantidadeAptos;
    }

    if (b._maiorNivel !== a._maiorNivel) {
      return b._maiorNivel - a._maiorNivel;
    }

    return (a.serviceName || "").localeCompare(b.serviceName || "", "pt-BR", {
      sensitivity: "base",
    });
  });
};

const resolverServiceIdDoItem = (item, servicesData) => {
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

  const byName = servicesData.find(
    (s) => normalizarTexto(s.externalName || s.nome || "") === nomeItem,
  );

  return byName?.id ? String(byName.id) : "";
};

const obterNivelAfinidade = (mapaAfinidade, guiaId, item, servicesData) => {
  const tours = mapaAfinidade?.[guiaId]?.tours || {};
  const chaveService = resolverServiceIdDoItem(item, servicesData);

  if (chaveService && tours[chaveService] !== undefined) {
    return Number(tours[chaveService]) || 0;
  }

  return 0;
};

const guiaCompativelPorPasseio = (guia, item) => {
  const passeiosAptos = Array.isArray(guia.passeios) ? guia.passeios : [];

  return passeiosAptos.some((p) => {
    const matchServiceId =
      item.serviceId && p?.id && String(p.id) === String(item.serviceId);

    const matchExternalServiceId =
      item.externalServiceId &&
      p?.externalServiceId &&
      Number(p.externalServiceId) === Number(item.externalServiceId);

    const matchNome =
      normalizarTexto(p?.externalName || p?.nome || "") ===
      normalizarTexto(item.serviceName || "");

    return matchServiceId || matchExternalServiceId || matchNome;
  });
};

const getElegiveisParaItem = ({
  item,
  guias,
  usedByDate,
  mapaDisponibilidade,
  usarAfinidadeGuiaPasseio,
  mapaAfinidade,
  servicesData,
}) => {
  return guias.filter((g) => {
    if (usedByDate[item.date]?.has(g.id)) return false;
    if (!guiaDisponivelNoDia(mapaDisponibilidade, g.id, item.date)) {
      return false;
    }

    if (usarAfinidadeGuiaPasseio) {
      const nivel = obterNivelAfinidade(
        mapaAfinidade,
        g.id,
        item,
        servicesData,
      );
      return nivel > 0;
    }

    return guiaCompativelPorPasseio(g, item);
  });
};

const escolherProximoServico = ({
  pendentes,
  guias,
  usedByDate,
  mapaDisponibilidade,
  usarAfinidadeGuiaPasseio,
  mapaAfinidade,
  servicesData,
}) => {
  const avaliados = pendentes.map((item) => {
    const elegiveis = getElegiveisParaItem({
      item,
      guias,
      usedByDate,
      mapaDisponibilidade,
      usarAfinidadeGuiaPasseio,
      mapaAfinidade,
      servicesData,
    });

    const maiorNivel = usarAfinidadeGuiaPasseio
      ? elegiveis.length
        ? Math.max(
            ...elegiveis.map((g) =>
              Number(
                obterNivelAfinidade(mapaAfinidade, g.id, item, servicesData) ||
                  0,
              ),
            ),
          )
        : 0
      : 0;

    return {
      item,
      elegiveis,
      quantidadeAptos: elegiveis.length,
      maiorNivel,
    };
  });

  const comCandidatos = avaliados.filter((x) => x.quantidadeAptos > 0);
  if (!comCandidatos.length) return null;

  comCandidatos.sort((a, b) => {
    if (a.quantidadeAptos !== b.quantidadeAptos) {
      return a.quantidadeAptos - b.quantidadeAptos;
    }

    if (usarAfinidadeGuiaPasseio && b.maiorNivel !== a.maiorNivel) {
      return b.maiorNivel - a.maiorNivel;
    }

    const paxA = Number(a.item.passengers || 0);
    const paxB = Number(b.item.passengers || 0);
    if (paxB !== paxA) return paxB - paxA;

    return (a.item.serviceName || "").localeCompare(
      b.item.serviceName || "",
      "pt-BR",
      { sensitivity: "base" },
    );
  });

  return comCandidatos[0];
};

const ordenarGuiasComAfinidade = (
  elegiveis,
  contadorSemana,
  workedInWeek,
  diasTrabalhadosSemana,
  item,
  mapaAfinidade,
  servicesData,
  modoDistribuicaoGuias,
  mapaDisponibilidade,
  semanaRef,
) => {
  return [...elegiveis].sort((a, b) => {
    const nivelA = Number(
      obterNivelAfinidade(mapaAfinidade, a.id, item, servicesData) || 0,
    );
    const nivelB = Number(
      obterNivelAfinidade(mapaAfinidade, b.id, item, servicesData) || 0,
    );

    const faixaA = getFaixaAfinidade(nivelA);
    const faixaB = getFaixaAfinidade(nivelB);

    const eqA = getScoreEquilibrio({
      guia: a,
      contadorSemana,
      diasTrabalhadosSemana,
      mapaDisponibilidade,
      semanaRef,
    });

    const eqB = getScoreEquilibrio({
      guia: b,
      contadorSemana,
      diasTrabalhadosSemana,
      mapaDisponibilidade,
      semanaRef,
    });

    const prioridadeA = Number(a.nivelPrioridade || 2);
    const prioridadeB = Number(b.nivelPrioridade || 2);

    const workedA = workedInWeek.has(a.id) ? 1 : 0;
    const workedB = workedInWeek.has(b.id) ? 1 : 0;

    if (modoDistribuicaoGuias === "equilibrado") {
      // 1. menos dias trabalhados proporcionalmente à disponibilidade
      if (eqA.frequenciaDias !== eqB.frequenciaDias) {
        return eqA.frequenciaDias - eqB.frequenciaDias;
      }

      // 2. menor ocupação proporcional de serviços
      if (eqA.ocupacao !== eqB.ocupacao) {
        return eqA.ocupacao - eqB.ocupacao;
      }

      // 3. menos dias absolutos trabalhados
      if (eqA.diasTrabalhados !== eqB.diasTrabalhados) {
        return eqA.diasTrabalhados - eqB.diasTrabalhados;
      }

      // 4. menos serviços absolutos
      if (eqA.servicos !== eqB.servicos) {
        return eqA.servicos - eqB.servicos;
      }

      // 5. afinidade entra como desempate, não como regra principal
      if (faixaB !== faixaA) return faixaB - faixaA;
      if (nivelB !== nivelA) return nivelB - nivelA;

      // 6. quem ainda não trabalhou leva pequena vantagem
      if (workedA !== workedB) return workedA - workedB;
    } else {
      // modo prioridade
      // 1. prioridade do guia
      if (prioridadeB !== prioridadeA) return prioridadeB - prioridadeA;

      // 2. ainda equilibrar pelos dias usados
      if (eqA.frequenciaDias !== eqB.frequenciaDias) {
        return eqA.frequenciaDias - eqB.frequenciaDias;
      }

      if (eqA.ocupacao !== eqB.ocupacao) {
        return eqA.ocupacao - eqB.ocupacao;
      }

      if (eqA.diasTrabalhados !== eqB.diasTrabalhados) {
        return eqA.diasTrabalhados - eqB.diasTrabalhados;
      }

      if (eqA.servicos !== eqB.servicos) {
        return eqA.servicos - eqB.servicos;
      }

      // 3. afinidade ainda conta, mas depois da prioridade e equilíbrio
      if (faixaB !== faixaA) return faixaB - faixaA;
      if (nivelB !== nivelA) return nivelB - nivelA;

      if (workedA !== workedB) return workedA - workedB;
    }

    return (a.nome || "").localeCompare(b.nome || "", "pt-BR", {
      sensitivity: "base",
    });
  });
};

const ordenarGuiasSemAfinidade = (
  elegiveis,
  contadorSemana,
  workedInWeek,
  diasTrabalhadosSemana,
  modoDistribuicaoGuias,
  mapaDisponibilidade,
  semanaRef,
) => {
  return [...elegiveis].sort((a, b) => {
    const eqA = getScoreEquilibrio({
      guia: a,
      contadorSemana,
      diasTrabalhadosSemana,
      mapaDisponibilidade,
      semanaRef,
    });

    const eqB = getScoreEquilibrio({
      guia: b,
      contadorSemana,
      diasTrabalhadosSemana,
      mapaDisponibilidade,
      semanaRef,
    });

    const prioridadeA = Number(a.nivelPrioridade || 2);
    const prioridadeB = Number(b.nivelPrioridade || 2);

    const workedA = workedInWeek.has(a.id) ? 1 : 0;
    const workedB = workedInWeek.has(b.id) ? 1 : 0;

    if (modoDistribuicaoGuias === "equilibrado") {
      if (eqA.frequenciaDias !== eqB.frequenciaDias) {
        return eqA.frequenciaDias - eqB.frequenciaDias;
      }

      if (eqA.ocupacao !== eqB.ocupacao) {
        return eqA.ocupacao - eqB.ocupacao;
      }

      if (eqA.diasTrabalhados !== eqB.diasTrabalhados) {
        return eqA.diasTrabalhados - eqB.diasTrabalhados;
      }

      if (eqA.servicos !== eqB.servicos) {
        return eqA.servicos - eqB.servicos;
      }

      if (workedA !== workedB) return workedA - workedB;
    } else {
      if (prioridadeB !== prioridadeA) return prioridadeB - prioridadeA;

      if (eqA.frequenciaDias !== eqB.frequenciaDias) {
        return eqA.frequenciaDias - eqB.frequenciaDias;
      }

      if (eqA.ocupacao !== eqB.ocupacao) {
        return eqA.ocupacao - eqB.ocupacao;
      }

      if (eqA.diasTrabalhados !== eqB.diasTrabalhados) {
        return eqA.diasTrabalhados - eqB.diasTrabalhados;
      }

      if (eqA.servicos !== eqB.servicos) {
        return eqA.servicos - eqB.servicos;
      }

      if (workedA !== workedB) return workedA - workedB;
    }

    return (a.nome || "").localeCompare(b.nome || "", "pt-BR", {
      sensitivity: "base",
    });
  });
};

const ListaPasseiosSemana = () => {
  const [semanaOffset, setSemanaOffset] = useState(0);
  const [semana, setSemana] = useState([]);
  const [services, setServices] = useState([]);
  const [extras, setExtras] = useState({});
  const [guias, setGuias] = useState([]);
  const [modoVisualizacao, setModoVisualizacao] = useState(true);
  const [resumoGuias, setResumoGuias] = useState([]);
  const [loading, setLoading] = useState(false);
  const [paxEditando, setPaxEditando] = useState({});
  const [novoServico, setNovoServico] = useState({});
  const [disponibilidades, setDisponibilidades] = useState([]);
  const [modoGeradoSemana, setModoGeradoSemana] = useState(null);
  const [modoDistribuicaoGuias, setModoDistribuicaoGuias] =
    useState("equilibrado");

  const paxTimers = useRef({});

  useEffect(() => {
    carregarDados();
  }, [semanaOffset]);

  useEffect(() => {
    document.body.style.overflow = loading ? "hidden" : "auto";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [loading]);

  useEffect(() => {
    if (semana.length && guias.length) {
      gerarResumoGuiasSemana();
    }
  }, [extras, semana, guias]);

  useEffect(() => {
    return () => {
      Object.values(paxTimers.current).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const abrirEscalaEmNovaAba = () => {
    try {
      const novaAba = window.open("", "_blank");

      if (!novaAba) {
        alert("O navegador bloqueou a abertura da nova aba.");
        return;
      }

      const dadosEscala = [];

      semana.forEach((dia) => {
        const registrosOrdenados = agruparRegistrosPorServico(
          extras[dia.date] || [],
        );

        if (!registrosOrdenados.length) {
          dadosEscala.push({
            data: dia.label,
            passeio: "-",
            guia: "-",
            pax: "-",
            status: "-",
          });
          return;
        }

        registrosOrdenados.forEach((item) => {
          let status = "Sem status";
          let statusClass = "";

          if (item.allocationStatus === "CLOSED") {
            status = "Passeio Fechado";
            statusClass = "status-fechado";
          } else if (Number(item.passengers || 0) >= 8) {
            status = "Grupo Formado";
            statusClass = "status-formado";
          } else {
            status = "Formar Grupo";
            statusClass = "status-alerta";
          }

          dadosEscala.push({
            data: dia.label,
            passeio: item.serviceName || "-",
            guia: item.guiaNome || "-",
            pax: Number(item.passengers || 0),
            status,
            statusClass,
          });
        });
      });

      let htmlLinhas = "";
      let i = 0;

      while (i < dadosEscala.length) {
        const dataAtual = dadosEscala[i].data;
        let grupo = [];

        while (i < dadosEscala.length && dadosEscala[i].data === dataAtual) {
          grupo.push(dadosEscala[i]);
          i++;
        }

        grupo.forEach((linha, index) => {
          htmlLinhas += `
          <tr>
            ${
              index === 0
                ? `<td rowspan="${grupo.length}" class="data-cell">${linha.data}</td>`
                : ""
            }
            <td>${linha.passeio}</td>
            <td>${linha.guia}</td>
            <td>${linha.pax}</td>
            <td class="${linha.statusClass || ""}">${linha.status}</td>
          </tr>
        `;
        });
      }

      const dadosJson = JSON.stringify(dadosEscala);

      novaAba.document.write(`
      <html>
        <head>
          <title>Escala Semanal de Passeios</title>
          <script src="https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js"></script>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 24px;
              background: #ebebeb;
              color: #222;
              display: flex;
              align-items: center;
              justify-content: center;
              flex-direction: column;
            }

            h1 {
              margin-bottom: 18px;
              font-size: 16px;
            }

            .toolbar {
              margin-bottom: 18px;
              display: flex;
              gap: 12px;
              flex-wrap: wrap;
            }

            button {
              background: #107c41;
              color: white;
              border: none;
              border-radius: 8px;
              padding: 12px 18px;
              cursor: pointer;
              font-size: 12px;
              font-weight: 600;
            }

            button:hover {
              opacity: 0.92;
            }

            .table-wrap {
              overflow-x: auto;
              border-radius: 12px;
            
            }

            table {
              border-collapse: collapse;
            }

            tr {
              transition: background-color 0.2s;
              padding: 0;
            }

            thead {
              background: #107c41;
              color: white;
            }

            th {
              border: 1px solid #d9d9d9;
              padding: 6px 6px;
              text-align: left;
              font-size: 12px;
              letter-spacing: 0.02em;
            }

            td {
              border: 1px solid #d9d9d9;
              padding: 6px 6px;
              text-align: left;
              font-size: 12px;
              line-height: 1.5;
              vertical-align: top;
            }

            .data-cell {
              font-weight: 700;
              font-size: 18px;
              background: #f1f7f2;
              white-space: nowrap;
            }

            tbody tr:nth-child(even) {
              background: #fafafa;
            }

            tbody tr:hover {
              background: #eef7ee;
            }

            .status-fechado {
              color: #b42318;
              background: #fcd9d6;
              font-weight: 700;
            }

            .status-formado {
              color: #027a48;
              background: #d1fae5;
              font-weight: 700;
            }

            .status-alerta {
              color: #b54708;
              font-weight: 700;
            }
          </style>
        </head>
        <body>
          <h1>Escala Semanal de Passeios</h1>

          <div class="toolbar">
            <button onclick="window.print()">Imprimir / Salvar em PDF</button>
          
          </div>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>DATA</th>
                  <th>PASSEIOS</th>
                  <th>GUIAS</th>
                  <th>QUANTIDADE DE PAX</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                ${htmlLinhas}
              </tbody>
            </table>
          </div>

          <script>
            const dadosEscala = ${dadosJson};

            function exportarExcel() {
              try {
                const linhas = [
                  ["DATA", "PASSEIOS", "GUIAS", "QUANTIDADE DE PAX", "STATUS"]
                ];

                const merges = [];
                let rowIndex = 1;
                let i = 0;

                while (i < dadosEscala.length) {
                  const dataAtual = dadosEscala[i].data;
                  let grupo = [];

                  while (i < dadosEscala.length && dadosEscala[i].data === dataAtual) {
                    grupo.push(dadosEscala[i]);
                    i++;
                  }

                  const inicioBloco = rowIndex;

                  grupo.forEach((item, index) => {
                    linhas.push([
                      index === 0 ? item.data : "",
                      item.passeio,
                      item.guia,
                      item.pax,
                      item.status
                    ]);
                    rowIndex++;
                  });

                  const fimBloco = rowIndex - 1;

                  if (fimBloco > inicioBloco) {
                    merges.push({
                      s: { r: inicioBloco, c: 0 },
                      e: { r: fimBloco, c: 0 }
                    });
                  }
                }

                const worksheet = XLSX.utils.aoa_to_sheet(linhas);

                worksheet["!cols"] = [
                  { wch: 24 },
                  { wch: 42 },
                  { wch: 24 },
                  { wch: 20 },
                  { wch: 20 }
                ];

                worksheet["!merges"] = merges;

                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, "Escala Semanal");

                XLSX.writeFile(workbook, "escala_semanal.xlsx");
              } catch (err) {
                console.error("Erro ao exportar Excel:", err);
                alert("Erro ao exportar Excel.");
              }
            }
          </script>
        </body>
      </html>
    `);

      novaAba.document.close();
    } catch (err) {
      console.error("Erro ao abrir escala em nova aba:", err);
    }
  };

  const semanaMap = useMemo(() => {
    const mapa = {};
    semana.forEach((d) => {
      mapa[d.date] = d;
    });
    return mapa;
  }, [semana]);

  const getSemanaKey = (semanaRef) => {
    if (!semanaRef?.length) return null;
    return `${semanaRef[0].date}_${semanaRef[semanaRef.length - 1].date}`;
  };

  const carregarModoGeradoSemana = async (semanaRef) => {
    const semanaKey = getSemanaKey(semanaRef);
    if (!semanaKey) {
      setModoGeradoSemana(null);
      return;
    }

    try {
      const snap = await getDoc(doc(db, "weekly_scale_meta", semanaKey));
      setModoGeradoSemana(
        snap.exists() ? snap.data().modoDistribuicaoGerado || null : null,
      );
    } catch (err) {
      console.error("Erro ao carregar modo gerado da semana:", err);
      setModoGeradoSemana(null);
    }
  };

  const salvarModoGeradoSemana = async (semanaRef, modo) => {
    const semanaKey = getSemanaKey(semanaRef);
    if (!semanaKey) return;

    try {
      await setDoc(
        doc(db, "weekly_scale_meta", semanaKey),
        {
          semanaInicio: semanaRef[0].date,
          semanaFim: semanaRef[semanaRef.length - 1].date,
          modoDistribuicaoGerado: modo,
          updatedAt: new Date(),
        },
        { merge: true },
      );
      setModoGeradoSemana(modo);
    } catch (err) {
      console.error("Erro ao salvar modo gerado da semana:", err);
    }
  };

  const limparModoGeradoSemana = async (semanaRef) => {
    const semanaKey = getSemanaKey(semanaRef);
    if (!semanaKey) return;

    try {
      await setDoc(
        doc(db, "weekly_scale_meta", semanaKey),
        {
          modoDistribuicaoGerado: null,
          updatedAt: new Date(),
        },
        { merge: true },
      );
      setModoGeradoSemana(null);
    } catch (err) {
      console.error("Erro ao limpar modo gerado da semana:", err);
    }
  };

  const encontrarServiceCatalogo = (
    serviceIdExterno,
    nomeApi,
    listaServices,
  ) => {
    return (
      listaServices.find(
        (s) =>
          Number(s.externalServiceId || 0) === Number(serviceIdExterno || 0),
      ) ||
      listaServices.find(
        (s) =>
          normalizarTexto(s.externalName || s.nome || "") ===
          normalizarTexto(nomeApi),
      ) ||
      null
    );
  };

  const sincronizarPasseiosDaApiNaSemana = async (
    semanaAtual,
    servicesData,
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
          const nome = extrairNomePasseio(item);
          const dataServico = extrairDataServico(item);
          const pax = extrairContagemPax(item);

          if (!serviceIdExterno || !dataServico) return;
          if (dataServico !== dia.date) return;

          const nomeCanonico = obterNomeCanonico(nome);
          if (deveIgnorarServico(nomeCanonico)) return;

          const chave = `${dataServico}_${nomeCanonico}`;

          if (!agregados[chave]) {
            agregados[chave] = {
              serviceIdExterno,
              nome: nomeCanonico,
              date: dataServico,
              totalPax: 0,
              totalAdultos: 0,
              totalCriancas: 0,
              totalInfants: 0,
            };
          }

          agregados[chave].totalPax += pax.total;
          agregados[chave].totalAdultos += pax.adultos;
          agregados[chave].totalCriancas += pax.criancas;
          agregados[chave].totalInfants += pax.infants;
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
          const serviceCatalogo = encontrarServiceCatalogo(
            passeioApi.serviceIdExterno,
            passeioApi.nome,
            servicesData,
          );

          const duplicados = importadosDoDia.filter(
            (r) =>
              Number(r.externalServiceId || 0) ===
              Number(passeioApi.serviceIdExterno || 0),
          );

          const principal = duplicados[0] || null;
          const duplicadosExtras = duplicados.slice(1);

          for (const dup of duplicadosExtras) {
            await deleteDoc(doc(db, "weekly_services", dup.id));
          }

          const payload = {
            serviceId: serviceCatalogo?.id || null,
            externalServiceId: passeioApi.serviceIdExterno,
            serviceName: passeioApi.nome,
            passengers: Number(passeioApi.totalPax || 0),
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

        const idsVindosApi = Object.values(agregados).map((p) =>
          Number(p.serviceIdExterno),
        );

        const obsoletos = importadosDoDia.filter(
          (r) => !idsVindosApi.includes(Number(r.externalServiceId || 0)),
        );

        for (const antigo of obsoletos) {
          await deleteDoc(doc(db, "weekly_services", antigo.id));
        }
      } catch (err) {
        console.error(`Erro ao sincronizar API no dia ${dia.date}:`, err);
      }
    }
  };

  const carregarDados = async () => {
    setLoading(true);
    try {
      const semanaAtual = gerarSemana(semanaOffset);
      setSemana(semanaAtual);

      await carregarModoGeradoSemana(semanaAtual);

      const [servSnap, guiasSnap, configSnap, dispSnap] = await Promise.all([
        getDocs(collection(db, "services")),
        getDocs(collection(db, "guides")),
        getDoc(doc(db, "settings", "scale")),
        getDocs(collection(db, "guide_availability")),
      ]);

      const servicesData = servSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      const guiasData = guiasSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const disponibilidadesData = dispSnap.docs.map((d) => d.data());

      setServices(servicesData);
      setGuias(guiasData);
      setDisponibilidades(disponibilidadesData);

      setModoDistribuicaoGuias(
        configSnap.exists()
          ? configSnap.data().modoDistribuicaoGuias || "equilibrado"
          : "equilibrado",
      );

      await sincronizarPasseiosDaApiNaSemana(semanaAtual, servicesData);

      const mapa = {};

      for (const dia of semanaAtual) {
        const q = query(
          collection(db, "weekly_services"),
          where("date", "==", dia.date),
        );
        const snap = await getDocs(q);

        const listaDia = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        mapa[dia.date] = listaDia;
      }

      setExtras(mapa);
    } catch (err) {
      console.error("Erro ao carregar dados:", err);
    } finally {
      setLoading(false);
    }
  };

  const limparDuplicadosSemana = async () => {
    for (const dia of semana) {
      const q = query(
        collection(db, "weekly_services"),
        where("date", "==", dia.date),
      );

      const snap = await getDocs(q);
      const lista = snap.docs.map((d) => ({
        id: d.id,
        ref: d.ref,
        ...d.data(),
      }));

      const mapa = {};

      for (const item of lista) {
        const nomeCanonico = obterNomeCanonico(item.serviceName || "");
        const chave = `${item.date}_${nomeCanonico}`;

        if (!mapa[chave]) {
          mapa[chave] = item;
        } else {
          await deleteDoc(item.ref);
        }
      }
    }

    await carregarDados();
  };

  const alterarStatusAlocacao = async (registroId, status) => {
    if (!registroId) return;

    try {
      const dadosUpdate = { allocationStatus: status };

      if (status === "CLOSED") {
        dadosUpdate.guiaId = null;
        dadosUpdate.guiaNome = null;
      }

      await setDoc(doc(db, "weekly_services", registroId), dadosUpdate, {
        merge: true,
      });

      setExtras((prev) => {
        const novo = { ...prev };

        Object.keys(novo).forEach((date) => {
          novo[date] = novo[date].map((r) =>
            r.id === registroId
              ? {
                  ...r,
                  allocationStatus: status,
                  ...(status === "CLOSED" && {
                    guiaId: null,
                    guiaNome: null,
                  }),
                }
              : r,
          );
        });

        return novo;
      });
    } catch (err) {
      console.error("Erro ao alterar status:", err);
    }
  };

  const alterarPaxManual = (registroId, pax) => {
    if (!registroId) return;

    setPaxEditando((prev) => ({
      ...prev,
      [registroId]: pax,
    }));

    if (paxTimers.current[registroId]) {
      clearTimeout(paxTimers.current[registroId]);
    }

    paxTimers.current[registroId] = setTimeout(async () => {
      try {
        await setDoc(
          doc(db, "weekly_services", registroId),
          { passengers: Number(pax) },
          { merge: true },
        );

        setExtras((prev) => {
          const novo = { ...prev };
          Object.keys(novo).forEach((date) => {
            novo[date] = novo[date].map((r) =>
              r.id === registroId ? { ...r, passengers: Number(pax) } : r,
            );
          });
          return novo;
        });

        setPaxEditando((prev) => {
          const novo = { ...prev };
          delete novo[registroId];
          return novo;
        });
      } catch (err) {
        console.error("Erro ao salvar pax:", err);
      }
    }, 400);
  };

  const alterarGuiaManual = async (registroId, guia, dia, registro) => {
    if (!registroId) return;

    if (registro?.allocationStatus === "CLOSED") {
      alert("Não é possível alocar guia em um serviço fechado.");
      return;
    }

    setLoading(true);
    try {
      await setDoc(
        doc(db, "weekly_services", registroId),
        {
          guiaId: guia?.id || null,
          guiaNome: guia?.nome || null,
          day: dia.day,
          date: dia.date,
          manual: false,
          updatedAt: new Date(),
        },
        { merge: true },
      );

      await carregarDados();
    } catch (err) {
      console.error("Erro ao alterar guia manualmente:", err);
    } finally {
      setLoading(false);
    }
  };

  const adicionarPasseioManual = async (dia) => {
    const dados = novoServico[dia.date];

    if (!dados?.nome) {
      alert("Informe o nome do serviço");
      return;
    }

    setLoading(true);
    try {
      await addDoc(collection(db, "weekly_services"), {
        serviceName: dados.nome,
        serviceId: null,
        externalServiceId: null,
        passengers: Number(dados.pax || 0),
        adultCount: 0,
        childCount: 0,
        infantCount: 0,
        guiaId: dados.guiaId || null,
        guiaNome: dados.guiaNome || null,
        date: dia.date,
        day: dia.day,
        manual: true,
        createdAt: new Date(),
        allocationStatus: "OPEN",
      });

      setNovoServico((prev) => ({
        ...prev,
        [dia.date]: {},
      }));

      await carregarDados();
    } catch (err) {
      console.error("Erro ao adicionar passeio manual:", err);
    } finally {
      setLoading(false);
    }
  };

  const removerPasseio = async (id) => {
    setLoading(true);
    try {
      await deleteDoc(doc(db, "weekly_services", id));
      await carregarDados();
    } catch (err) {
      console.error("Erro ao remover passeio:", err);
    } finally {
      setLoading(false);
    }
  };

  const statusGrupo = (pax, allocationStatus) => {
    if (allocationStatus === "CLOSED") {
      return (
        <span className="status fechado">
          <Lock fontSize="10" /> Passeio Fechado
        </span>
      );
    }

    return Number(pax || 0) >= 8 ? (
      <span className="status ok">
        <Groups fontSize="10" /> Grupo Formado
      </span>
    ) : (
      <span className="status alerta">
        <Warning fontSize="10" /> Formar Grupo
      </span>
    );
  };

  const getCargaSemanal = (guiaId) => {
    const guiaResumo = resumoGuias.find((g) => g.guiaId === guiaId);
    return guiaResumo?.ocupacao || 0;
  };

  const getStatusGuiaNoDia = (guiaId, data, registrosDia) => {
    const registroDisp = disponibilidades.find((d) => d.guideId === guiaId);

    if (!registroDisp?.disponibilidade) return { status: "NO_DATA" };

    const dispDia = registroDisp.disponibilidade.find((d) => d.date === data);

    if (dispDia?.status === "BLOCKED") return { status: "BLOCKED" };

    const jaUsado = registrosDia.some(
      (r) => r.guiaId === guiaId && r.allocationStatus !== "CLOSED",
    );

    if (jaUsado) return { status: "USED" };

    return { status: "AVAILABLE" };
  };

  const limparGuiasDeServicosFechados = async () => {
    const inicioSemana = semana[0]?.date;
    const fimSemana = semana[semana.length - 1]?.date;
    if (!inicioSemana || !fimSemana) return;

    try {
      const q = query(
        collection(db, "weekly_services"),
        where("date", ">=", inicioSemana),
        where("date", "<=", fimSemana),
      );

      const snap = await getDocs(q);

      for (const docSnap of snap.docs) {
        const r = docSnap.data();

        if (r.allocationStatus === "CLOSED" && (r.guiaId || r.guiaNome)) {
          await updateDoc(docSnap.ref, {
            guiaId: null,
            guiaNome: null,
          });
        }
      }
    } catch (err) {
      console.error("Erro ao limpar guias de serviços fechados:", err);
    }
  };

  const enviarWhatsappGuiasSemana_FIRESTORE = async () => {
    if (!semana.length || !guias.length) return;

    await limparGuiasDeServicosFechados();

    const inicioSemana = semana[0].date;
    const fimSemana = semana[semana.length - 1].date;

    try {
      const q = query(
        collection(db, "weekly_services"),
        where("date", ">=", inicioSemana),
        where("date", "<=", fimSemana),
      );

      const snap = await getDocs(q);

      const mapaGuias = {};

      snap.docs.forEach((docSnap) => {
        const r = docSnap.data();

        if (!r || !r.date || !r.guiaId) return;
        if (r.allocationStatus === "CLOSED") return;
        if (!semanaMap[r.date]) return;
        if (!r.serviceName) return;

        const guia = guias.find((g) => g.id === r.guiaId);
        if (!guia?.whatsapp) return;

        if (!mapaGuias[r.guiaId]) {
          mapaGuias[r.guiaId] = {
            nome: guia.nome || r.guiaNome || "Guia",
            whatsapp: guia.whatsapp,
            datas: new Set(),
          };
        }

        const dia = semanaMap[r.date];
        mapaGuias[r.guiaId].datas.add(
          `• ${dia.day} (${dia.date.split("-").reverse().join("/")})`,
        );
      });

      Object.values(mapaGuias)
        .filter((g) => g.datas.size > 0)
        .forEach((guia, index) => {
          const texto = `
Olá, ${guia.nome}! 🍀

Segue sua escala da semana:

${Array.from(guia.datas).join("\n")}

Gentilmente, confirme o recebimento.
Operacional - Luck Receptivo 🍀
`.trim();

          setTimeout(() => {
            window.open(
              `https://wa.me/55${guia.whatsapp.replace(
                /\D/g,
                "",
              )}?text=${encodeURIComponent(texto)}`,
              "_blank",
            );
          }, index * 2200);
        });
    } catch (err) {
      console.error("Erro ao enviar WhatsApp da semana:", err);
    }
  };

  const enviarWhatsappGuiaIndividual = (guiaResumo) => {
    const guia = guias.find((g) => g.id === guiaResumo.guiaId);
    if (!guia?.whatsapp) {
      alert("Guia sem WhatsApp cadastrado");
      return;
    }

    const texto = gerarMensagemGuia(guiaResumo);

    window.open(
      `https://wa.me/55${guia.whatsapp.replace(
        /\D/g,
        "",
      )}?text=${encodeURIComponent(texto)}`,
      "_blank",
    );
  };

  const gerarMensagemGuia = (guiaResumo) => {
    if (!guiaResumo?.datas || guiaResumo.datas.size === 0) return "";

    const datasOrdenadas = Array.from(guiaResumo.datas).sort();

    const listaDatas = datasOrdenadas
      .map((data) => {
        const diaObj = semana.find((d) => d.date === data);
        if (!diaObj) return null;
        return `• ${diaObj.day} (${data.split("-").reverse().join("/")})`;
      })
      .filter(Boolean)
      .join("\n");

    return `
Olá, ${guiaResumo.nome}! 🍀

Segue sua escala da semana:

${listaDatas}

Gentilmente, confirme o recebimento.
Operacional - Luck Receptivo 🍀
`.trim();
  };

  const gerarResumoGuiasSemana = async () => {
    if (!semana.length || !guias.length) {
      setResumoGuias([]);
      return;
    }

    const inicioSemana = semana[0].date;
    const fimSemana = semana[semana.length - 1].date;

    try {
      const snapDisp = await getDocs(collection(db, "guide_availability"));

      const disponibilidadeMap = {};
      const bloqueiosMap = {};

      snapDisp.docs.forEach((docSnap) => {
        const d = docSnap.data();
        if (!Array.isArray(d.disponibilidade)) return;

        const diasSemana = d.disponibilidade.filter(
          (ds) => ds.date >= inicioSemana && ds.date <= fimSemana,
        );

        disponibilidadeMap[d.guideId] = diasSemana.length;
        bloqueiosMap[d.guideId] = diasSemana
          .filter((ds) => ds.status === "BLOCKED")
          .map((ds) => ds.date);
      });

      const contador = {};

      semana.forEach((dia) => {
        const registrosDia = agruparRegistrosPorServico(extras[dia.date] || []);

        registrosDia.forEach((r) => {
          if (!r.guiaId) return;
          if (r.allocationStatus === "CLOSED") return;

          if (!contador[r.guiaId]) {
            const guia = guias.find((g) => g.id === r.guiaId);

            contador[r.guiaId] = {
              guiaId: r.guiaId,
              nome: guia?.nome || "Guia",
              nivelPrioridade: guia?.nivelPrioridade || 2,
              totalServicos: 0,
              diasDisponiveis: disponibilidadeMap[r.guiaId] || 0,
              bloqueios: bloqueiosMap[r.guiaId] || [],
              ocupacao: 0,
              sobrecarga: false,
              datas: new Set(),
            };
          }

          contador[r.guiaId].totalServicos++;
          contador[r.guiaId].datas.add(r.date);
        });
      });

      let resumo = Object.values(contador);

      resumo.forEach((g) => {
        const dias = Number(g.diasDisponiveis) || 0;
        const total = Number(g.totalServicos) || 0;
        g.ocupacao = dias > 0 ? Math.round((total / dias) * 100) : 0;
        if (!Number.isFinite(g.ocupacao)) g.ocupacao = 0;
        g.sobrecarga = g.ocupacao >= 90;
      });

      resumo.sort((a, b) => b.ocupacao - a.ocupacao);

      setResumoGuias(
        resumo.map((g) => ({
          ...g,
          datas: new Set(g.datas),
        })),
      );
    } catch (err) {
      console.error("Erro ao gerar resumo dos guias:", err);
    }
  };

  const formatarPeriodoSemana = () => {
    if (!semana.length) return "";

    const formatar = (data) => {
      const [ano, mes, dia] = data.split("-");
      return `${dia}/${mes}/${ano}`;
    };

    return `${formatar(semana[0].date)} até ${formatar(semana[6].date)}`;
  };

  const alocarGuiasSemana = async () => {
    setLoading(true);

    try {
      if (!guias.length || !semana.length) return;

      const inicioSemana = semana[0].date;
      const fimSemana = semana[semana.length - 1].date;

      const snapSettings = await getDoc(doc(db, "settings", "scale"));
      const settings = snapSettings.exists() ? snapSettings.data() : {};

      const usarAfinidadeGuiaPasseio =
        settings.usarAfinidadeGuiaPasseio || false;

      const [snapAfinidade, snapDisp, snapSemana] = await Promise.all([
        getDocs(collection(db, "guide_tour_levels")),
        getDocs(collection(db, "guide_availability")),
        getDocs(
          query(
            collection(db, "weekly_services"),
            where("date", ">=", inicioSemana),
            where("date", "<=", fimSemana),
          ),
        ),
      ]);

      const mapaAfinidade = {};
      snapAfinidade.docs.forEach((d) => {
        mapaAfinidade[d.id] = d.data();
      });

      const disponibilidadeDocs = snapDisp.docs.map((d) => d.data());
      const mapaDisponibilidade =
        construirMapaDisponibilidade(disponibilidadeDocs);

      const registrosSemana = snapSemana.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      const contadorSemana = {};
      const diasTrabalhadosSemana = {};
      guias.forEach((g) => {
        contadorSemana[g.id] = 0;
        diasTrabalhadosSemana[g.id] = new Set();
      });

      const workedInWeek = new Set();
      const usedByDate = {};
      semana.forEach((d) => {
        usedByDate[d.date] = new Set();
      });

      registrosSemana.forEach((r) => {
        if (!r.guiaId || r.allocationStatus === "CLOSED" || !r.date) return;

        if (!usedByDate[r.date]) usedByDate[r.date] = new Set();
        usedByDate[r.date].add(r.guiaId);

        workedInWeek.add(r.guiaId);
        contadorSemana[r.guiaId] = Number(contadorSemana[r.guiaId] || 0) + 1;

        if (!diasTrabalhadosSemana[r.guiaId]) {
          diasTrabalhadosSemana[r.guiaId] = new Set();
        }
        diasTrabalhadosSemana[r.guiaId].add(r.date);
      });

      for (const dia of semana) {
        const qReg = query(
          collection(db, "weekly_services"),
          where("date", "==", dia.date),
        );
        const snapReg = await getDocs(qReg);

        const registrosDia = snapReg.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        const registrosAgrupados = agruparRegistrosPorServico(registrosDia);
        if (!registrosAgrupados.length) continue;

        const guiasDisponiveis = guias.filter((g) =>
          guiaDisponivelNoDia(mapaDisponibilidade, g.id, dia.date),
        );

        if (!guiasDisponiveis.length) continue;

        const usadosNoDia = new Set(usedByDate[dia.date] || []);

        const itensPendentes = registrosAgrupados.filter((item) => {
          if (!item?.id) return false;
          if (item.guiaId) return false;
          if (item.allocationStatus === "CLOSED") return false;
          return true;
        });

        const itensOrdenados = usarAfinidadeGuiaPasseio
          ? ordenarServicosPorEscassez(
              itensPendentes,
              guiasDisponiveis,
              usadosNoDia,
              mapaAfinidade,
              services,
            )
          : itensPendentes;

        for (const item of itensOrdenados) {
          if (usadosNoDia.size >= guiasDisponiveis.length) break;

          let elegiveis = guiasDisponiveis.filter((g) => {
            if (usadosNoDia.has(g.id)) return false;

            if (usarAfinidadeGuiaPasseio) {
              const nivel = obterNivelAfinidade(
                mapaAfinidade,
                g.id,
                item,
                services,
              );
              return nivel > 0;
            }

            return guiaCompativelPorPasseio(g, item);
          });

          if (!elegiveis.length) continue;

          const candidatosOrdenados = usarAfinidadeGuiaPasseio
            ? ordenarGuiasComAfinidade(
                elegiveis,
                contadorSemana,
                workedInWeek,
                diasTrabalhadosSemana,
                item,
                mapaAfinidade,
                services,
                modoDistribuicaoGuias,
                mapaDisponibilidade,
                semana,
              )
            : ordenarGuiasSemAfinidade(
                elegiveis,
                contadorSemana,
                workedInWeek,
                diasTrabalhadosSemana,
                modoDistribuicaoGuias,
                mapaDisponibilidade,
                semana,
              );

          const guiaSelecionado = candidatosOrdenados[0];
          if (!guiaSelecionado) continue;

          await setDoc(
            doc(db, "weekly_services", item.id),
            {
              guiaId: guiaSelecionado.id,
              guiaNome: guiaSelecionado.nome,
              updatedAt: new Date(),
            },
            { merge: true },
          );

          usadosNoDia.add(guiaSelecionado.id);
          usedByDate[dia.date].add(guiaSelecionado.id);
          workedInWeek.add(guiaSelecionado.id);
          contadorSemana[guiaSelecionado.id] =
            Number(contadorSemana[guiaSelecionado.id] || 0) + 1;

          if (!diasTrabalhadosSemana[guiaSelecionado.id]) {
            diasTrabalhadosSemana[guiaSelecionado.id] = new Set();
          }
          diasTrabalhadosSemana[guiaSelecionado.id].add(dia.date);
        }
      }

      await salvarModoGeradoSemana(semana, modoDistribuicaoGuias);
      await carregarDados();
    } catch (err) {
      console.error("Erro ao alocar guias da semana:", err);
    } finally {
      setLoading(false);
    }
  };

  const removerGuiasSemana = async () => {
    setLoading(true);
    try {
      for (const dia of semana) {
        const q = query(
          collection(db, "weekly_services"),
          where("date", "==", dia.date),
        );
        const snap = await getDocs(q);

        for (const docSnap of snap.docs) {
          const data = docSnap.data();
          if (!data.guiaId && !data.guiaNome) continue;

          await updateDoc(docSnap.ref, {
            guiaId: null,
            guiaNome: null,
            manual: false,
            updatedAt: new Date(),
          });
        }
      }

      await limparModoGeradoSemana(semana);
      await carregarDados();
    } catch (err) {
      console.error("Erro ao remover guias da semana:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <LoadingBlock loading={loading} text="Processando escala..." />

      <h2>Planejamento Semanal de Passeios</h2>

      <div className="header-tours">
        <div className="mode-toggle">
          <button
            className="btn-list"
            onClick={() => setModoVisualizacao(true)}
          >
            Visualizar <Visibility fontSize="10" />
          </button>

          <button
            className="btn-list-edt"
            onClick={() => setModoVisualizacao(false)}
          >
            Editar escala <ModeEdit fontSize="10" />
          </button>

          <button className="btn-list" onClick={alocarGuiasSemana}>
            Gerar escala de Guias <ManageAccounts fontSize="10" />
          </button>

          <button className="btn-list-cld" onClick={removerGuiasSemana}>
            Desfazer escala de Guias <Undo fontSize="10" />
          </button>
          <button className="btn-list" onClick={abrirEscalaEmNovaAba}>
            Abrir planilha
          </button>
          <button
            className="btn-list-send"
            onClick={enviarWhatsappGuiasSemana_FIRESTORE}
          >
            Enviar todos os Bloqueios{" "}
            <WhatsApp className="icon-zap" fontSize="10" />
          </button>
        </div>

        <div className="topic">
          <div className="week-controls">
            <button
              className="btn-list"
              onClick={() => setSemanaOffset((o) => o - 1)}
            >
              ⬅ Semana anterior
            </button>

            <button className="btn-list" onClick={() => setSemanaOffset(0)}>
              Semana atual
            </button>

            <button
              className="btn-list"
              onClick={() => setSemanaOffset((o) => o + 1)}
            >
              Semana seguinte ➡
            </button>

            <span className="counter-info">{formatarPeriodoSemana()}</span>
          </div>

          <p className="counter-info">
            Modo de distribuição:{" "}
            <strong>
              {modoDistribuicaoGuias === "seguir_nivel_selecionado"
                ? "Prioridade"
                : "Equilibrado"}
            </strong>
          </p>
        </div>
      </div>

      <div className="resumo-modo-global">
        {modoGeradoSemana
          ? modoGeradoSemana === "seguir_nivel_selecionado"
            ? "Essa escala foi gerada com a regra: Prioridade"
            : "Essa escala foi gerada com a regra: Equilibrada"
          : "Escala ainda não gerada para esta semana"}{" "}
        <Warning fontSize="10" className="icon-warning" />
      </div>

      <div className="resumo-container">
        {resumoGuias.map((g, index) => (
          <div key={g.guiaId} className="resumo-card">
            <div className="resumo-header">
              <h4 className="resumo-nome">
                <span className="resumo-nome-main">
                  {modoDistribuicaoGuias === "seguir_nivel_selecionado" && (
                    <span
                      className={`priority-pill p-${g.nivelPrioridade || 2}`}
                    >
                      P{g.nivelPrioridade || 2}
                    </span>
                  )}
                  {index === 0 && <span className="medalha">🏆</span>}
                  {g.nome}
                </span>

                {g.sobrecarga && <span className="indicador-alerta">●</span>}
              </h4>

              <span
                className={`resumo-percent 
                  ${g.ocupacao >= 80 ? "alta" : ""}
                  ${g.ocupacao >= 50 && g.ocupacao < 80 ? "media" : ""}
                  ${g.ocupacao < 50 ? "baixa" : ""}
                `}
              >
                {g.ocupacao}%
              </span>
            </div>

            <div className="resumo-bar">
              <div
                className={`resumo-bar-fill 
                  ${g.ocupacao >= 80 ? "alta" : ""}
                  ${g.ocupacao >= 50 && g.ocupacao < 80 ? "media" : ""}
                  ${g.ocupacao < 50 ? "baixa" : ""}
                `}
                style={{ width: `${g.ocupacao}%` }}
              />
            </div>

            <p className="resumo-info">{g.totalServicos} serviços</p>

            <div className="mini-chart">
              {semana.map((dia) => (
                <div
                  key={dia.date}
                  className={`mini-bar ${g.datas?.has(dia.date) ? "ativo" : ""}`}
                />
              ))}

              <div className="whatsapp-wrapper">
                <button
                  className="btn-whatsapp-guia"
                  onClick={() => enviarWhatsappGuiaIndividual(g)}
                >
                  <Send fontSize="12" /> Enviar
                </button>

                <div className="resumo-tooltip">
                  <pre>{gerarMensagemGuia(g)}</pre>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {semana.map((dia) => {
        const registrosOrdenados = agruparRegistrosPorServico(
          extras[dia.date] || [],
        );

        const totalPasseios = registrosOrdenados.length;
        const passeiosComGuia = registrosOrdenados.filter(
          (r) => !!r.guiaId && r.allocationStatus !== "CLOSED",
        ).length;

        let statusDia = "vazio";
        if (passeiosComGuia === 0) statusDia = "vazio";
        else if (passeiosComGuia < totalPasseios) statusDia = "parcial";
        else statusDia = "completo";

        return (
          <div key={dia.date} className="day-card">
            <strong className={`day-list ${statusDia}`}>
              {dia.label}
              <span className="day-status">
                {" "}
                - Passeios com Guia: {passeiosComGuia} - Total de Passeios:{" "}
                {totalPasseios}
              </span>
            </strong>

            {registrosOrdenados.map((item) => (
              <div
                key={`${dia.date}-${item.externalServiceId || item.id}`}
                className="passeio-item"
              >
                <span className="passeio-name">{item.serviceName}</span>

                <span className="guia-name-aloc">{item.guiaNome || "-"}</span>
                {modoVisualizacao ? (
                  <>
                    <span className="passeio-pax-1">
                      {item.passengers || 0} pax
                      <small>
                        {" "}
                        ({item.adultCount || 0} ADT / {item.childCount || 0} CHD
                        / {item.infantCount || 0} INF)
                      </small>
                    </span>
                    {statusGrupo(item.passengers, item.allocationStatus)}
                  </>
                ) : (
                  <>
                    <input
                      type="number"
                      min="0"
                      value={paxEditando[item.id] ?? item.passengers ?? 0}
                      onChange={(e) =>
                        alterarPaxManual(item.id, e.target.value)
                      }
                    />

                    <select
                      value={item.allocationStatus || "OPEN"}
                      onChange={(e) =>
                        alterarStatusAlocacao(item.id, e.target.value)
                      }
                    >
                      <option value="OPEN">Aberto</option>
                      <option value="CLOSED">Fechado</option>
                    </select>

                    <select
                      value={item.guiaId || ""}
                      onChange={async (e) => {
                        const guia = guias.find((g) => g.id === e.target.value);

                        if (item.allocationStatus === "CLOSED") {
                          alert(
                            "Não é possível alocar guia em um serviço fechado.",
                          );
                          return;
                        }

                        await alterarGuiaManual(
                          item.id,
                          guia || null,
                          dia,
                          item,
                        );
                      }}
                    >
                      <option value="">Sem guia</option>

                      {guias.map((g) => {
                        const status = getStatusGuiaNoDia(
                          g.id,
                          dia.date,
                          registrosOrdenados,
                        );
                        const carga = getCargaSemanal(g.id);

                        let label = g.nome;

                        if (status.status === "AVAILABLE")
                          label += ` 🟢 (${carga}%)`;
                        if (status.status === "USED")
                          label += ` 🔒 (Já alocado)`;
                        if (status.status === "BLOCKED")
                          label += ` 🔴 (Bloqueado)`;
                        if (status.status === "NO_DATA")
                          label += ` ⚫ (Sem disponibilidade)`;

                        const disabled =
                          status.status === "BLOCKED" ||
                          status.status === "USED" ||
                          status.status === "NO_DATA";

                        return (
                          <option key={g.id} value={g.id} disabled={disabled}>
                            {label}
                          </option>
                        );
                      })}
                    </select>

                    {item.manual && (
                      <button
                        className="btn-remove"
                        onClick={() => removerPasseio(item.id)}
                      >
                        🗑️
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}

            {!modoVisualizacao && (
              <div className="passeio-item passeio-add">
                <input
                  type="text"
                  placeholder="Nome do serviço"
                  value={novoServico[dia.date]?.nome || ""}
                  onChange={(e) =>
                    setNovoServico((prev) => ({
                      ...prev,
                      [dia.date]: {
                        ...prev[dia.date],
                        nome: e.target.value,
                      },
                    }))
                  }
                />

                <input
                  type="number"
                  min="0"
                  placeholder="Pax"
                  value={novoServico[dia.date]?.pax || ""}
                  onChange={(e) =>
                    setNovoServico((prev) => ({
                      ...prev,
                      [dia.date]: {
                        ...prev[dia.date],
                        pax: e.target.value,
                      },
                    }))
                  }
                />

                <select
                  value={novoServico[dia.date]?.guiaId || ""}
                  onChange={(e) => {
                    const guia = guias.find((g) => g.id === e.target.value);
                    setNovoServico((prev) => ({
                      ...prev,
                      [dia.date]: {
                        ...prev[dia.date],
                        guiaId: guia?.id || null,
                        guiaNome: guia?.nome || null,
                      },
                    }));
                  }}
                >
                  <option value="">Selecione o guia</option>
                  {guias.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.nome}
                    </option>
                  ))}
                </select>

                <button
                  className="btn-add"
                  onClick={() => adicionarPasseioManual(dia)}
                >
                  ➕
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ListaPasseiosSemana;
