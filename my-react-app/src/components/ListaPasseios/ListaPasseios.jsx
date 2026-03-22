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
  RefreshRounded,
} from "@mui/icons-material";
import CardSkeleton from "../../components/CardSkeleton/CardSkeleton";

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
  "service,schedule,reserve,establishmentOrigin,establishmentDestination,establishmentOrigin.region,establishmentDestination.region,reserve.partner,reserve.customer,reserve.pdvPayment,reserve.pdvPayment.user,additionalReserveServices,additionalReserveServices.additional,additionalReserveServices.provider,roadmapService,roadmapService.roadmap,auxRoadmapService.roadmap.serviceOrder,auxRoadmapService.roadmap.serviceOrder.vehicle,auxRoadmapService.roadmap.driver,auxRoadmapService.roadmap.guide,roadmapService.roadmap.driver,roadmapService.roadmap.guide,roadmapService.roadmap.serviceOrder,roadmapService.roadmap.serviceOrder.vehicle";

const SERVICOS_IGNORADOS = [
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

const ehServicoDisp = (nome = "") => {
  const nomeNormalizado = normalizarTexto(nome);
  return nomeNormalizado.includes("disp");
};

const extrairNomeVendedor = (item) => {
  const pagamentos = Array.isArray(item?.reserve?.pdvPayment)
    ? item.reserve.pdvPayment
    : [];

  const nomes = pagamentos
    .map((pag) => pag?.user?.name || "")
    .filter((nome) => typeof nome === "string" && nome.trim());

  return nomes[0] || "";
};

const extrairNomeOperadora = (item) => {
  return (
    item?.reserve?.partner?.fantasy_name ||
    item?.reserve?.partner?.name ||
    item?.reserve?.customer?.fantasy_name ||
    item?.reserve?.customer?.name ||
    ""
  );
};

const extrairPrimeiroNome = (nome = "") => {
  const limpo = String(nome).trim();
  if (!limpo) return "";
  return limpo.split(/\s+/)[0].toUpperCase();
};

const extrairResponsavelDisp = (item) => {
  const vendedor = extrairPrimeiroNome(extrairNomeVendedor(item));
  if (vendedor) return vendedor;

  const operadora = extrairPrimeiroNome(extrairNomeOperadora(item));
  if (operadora) return operadora;

  return "";
};

const montarNomeServicoExibicao = (item) => {
  const nomeBase = obterNomeCanonico(extrairNomePasseio(item));

  if (!ehServicoDisp(nomeBase)) {
    return nomeBase;
  }

  const responsavel = extrairResponsavelDisp(item);

  return responsavel ? `${nomeBase} - ${responsavel}` : nomeBase;
};

const montarChaveImportacao = ({ date, externalServiceId, serviceName }) => {
  return `${date}_${Number(externalServiceId || 0)}_${normalizarTexto(
    serviceName || "",
  )}`;
};

const montarUrlApi = (date) => {
  const params = new URLSearchParams();
  params.append("execution_date", date);
  params.append("expand", EXPAND);

  params.append("service_type[]", "3");
  params.append("service_type[]", "4");

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

    const passageirosRegistro = Number(r.passengers ?? 0);
    const adultos = Number(r.adultCount ?? 0);
    const criancas = Number(r.childCount ?? 0);
    const infants = Number(r.infantCount ?? 0);
    const totalDetalhadoRegistro = adultos + criancas + infants;

    // ✅ mantém o maior valor confiável do registro
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

        // ✅ aqui também usa o maior total confiável
        passengers: Math.max(Number(item.passengers ?? 0), totalDetalhado),
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

const encontrarServiceCatalogo = (serviceIdExterno, nomeApi, listaServices) => {
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

    const nomeItemNormalizado = normalizarTexto(item.serviceName || "");
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

      if (faixaB !== faixaA) return faixaB - faixaA;
      if (nivelB !== nivelA) return nivelB - nivelA;

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
  const [paxEditando, setPaxEditando] = useState({});
  const [novoServico, setNovoServico] = useState({});
  const [disponibilidades, setDisponibilidades] = useState([]);
  const [modoGeradoSemana, setModoGeradoSemana] = useState(null);
  const [apiSemanaListaPasseios, setApiSemanaListaPasseios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modoDistribuicaoGuias, setModoDistribuicaoGuias] =
    useState("equilibrado");

  const [loadingInicial, setLoadingInicial] = useState(true);
  const [loadingSemana, setLoadingSemana] = useState(false);
  const [processandoAcao, setProcessandoAcao] = useState(false);

  const primeiraCargaRef = useRef(true);
  const paxTimers = useRef({});

  useEffect(() => {
    const carregar = async () => {
      const initial = primeiraCargaRef.current;
      await carregarDados({ initial, showSkeleton: true });
      primeiraCargaRef.current = false;
    };

    carregar();
  }, [semanaOffset]);

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

  const carregandoEstrutura = loadingInicial || loadingSemana;

  const getTextoStatusServico = (item) => {
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

  const getClasseStatusServico = (item) => {
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

  const atualizarSomentePlanilha = async () => {
    if (!semana.length) return;

    setLoadingSemana(true);

    try {
      await sincronizarPasseiosDaApiNaSemana(semana, services);

      const [apiAgrupada, resultadosFirestore] = await Promise.all([
        carregarSemanaApiListaPasseios(semana),
        Promise.all(
          semana.map(async (dia) => {
            const q = query(
              collection(db, "weekly_services"),
              where("date", "==", dia.date),
            );

            const snap = await getDocs(q);

            return {
              date: dia.date,
              items: snap.docs.map((d) => ({
                id: d.id,
                ...d.data(),
              })),
            };
          }),
        ),
      ]);

      const mapa = {};
      resultadosFirestore.forEach((item) => {
        mapa[item.date] = item.items;
      });

      setApiSemanaListaPasseios(apiAgrupada);
      setExtras(mapa);
    } catch (err) {
      console.error("Erro ao atualizar planilha:", err);
    } finally {
      setLoadingSemana(false);
    }
  };

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
          aplicarPaxDaApiNosRegistros(extras[dia.date] || []),
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
          dadosEscala.push({
            data: dia.label,
            passeio: item.serviceName || "-",
            guia: item.guiaNome || "-",
            pax: Number(item.passengers || 0),
            status: getTextoStatusServico(item),
            statusClass: getClasseStatusServico(item),
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

            .status-privativo {
              color: #3730a3;
              background: #eef2ff;
              font-weight: 700;
            }
          </style>
        </head>
        <body>
          <h1>Escala Semanal de Passeios</h1>

          <div class="toolbar">
            <button onclick="window.print()">Imprimir / Salvar em PDF</button>
            <button onclick="exportarExcel()">Exportar Excel</button>
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

  const montarChaveApiServico = ({ date, externalServiceId, serviceName }) => {
    return `${date}_${Number(externalServiceId || 0)}_${normalizarTexto(
      serviceName || "",
    )}`;
  };

  const carregarSemanaApiListaPasseios = async (listaSemana) => {
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

  const carregarDados = async ({
    initial = false,
    showSkeleton = true,
  } = {}) => {
    if (showSkeleton) {
      if (initial) setLoadingInicial(true);
      else setLoadingSemana(true);
    }

    try {
      const semanaAtual = gerarSemana(semanaOffset);
      setSemana(semanaAtual);

      await carregarModoGeradoSemana(semanaAtual);

      const [servSnap, guiasSnap, configSnap, dispSnap, apiAgrupada] =
        await Promise.all([
          getDocs(collection(db, "services")),
          getDocs(collection(db, "guides")),
          getDoc(doc(db, "settings", "scale")),
          getDocs(collection(db, "guide_availability")),
          carregarSemanaApiListaPasseios(semanaAtual),
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
      setApiSemanaListaPasseios(apiAgrupada);

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
      if (showSkeleton) {
        if (initial) setLoadingInicial(false);
        else setLoadingSemana(false);
      }
    }
  };

  const aplicarPaxDaApiNosRegistros = (registros) => {
    const mapaApi = {};

    apiSemanaListaPasseios.forEach((item) => {
      const chave = montarChaveApiServico({
        date: item.date,
        externalServiceId: item.externalServiceId,
        serviceName: item.serviceName,
      });

      mapaApi[chave] = item;
    });

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

    setProcessandoAcao(true);
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

      await carregarDados({ showSkeleton: false });
    } catch (err) {
      console.error("Erro ao alterar guia manualmente:", err);
    } finally {
      setProcessandoAcao(false);
    }
  };

  const adicionarPasseioManual = async (dia) => {
    const dados = novoServico[dia.date];

    if (!dados?.nome) {
      alert("Informe o nome do serviço");
      return;
    }

    setProcessandoAcao(true);
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

      await carregarDados({ showSkeleton: false });
    } catch (err) {
      console.error("Erro ao adicionar passeio manual:", err);
    } finally {
      setProcessandoAcao(false);
    }
  };

  const removerPasseio = async (id) => {
    setProcessandoAcao(true);
    try {
      await deleteDoc(doc(db, "weekly_services", id));
      await carregarDados({ showSkeleton: false });
    } catch (err) {
      console.error("Erro ao remover passeio:", err);
    } finally {
      setProcessandoAcao(false);
    }
  };

  const statusGrupo = (item) => {
    if (item?.allocationStatus === "CLOSED") {
      return (
        <span className="status fechado">
          <Lock fontSize="10" /> Passeio Fechado
        </span>
      );
    }

    if (ehServicoDisp(item?.serviceName || "")) {
      return <span className="status privativo">Privativo</span>;
    }

    return Number(item?.passengers || 0) >= 8 ? (
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
    setProcessandoAcao(true);

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
      await carregarDados({ showSkeleton: false });
    } catch (err) {
      console.error("Erro ao alocar guias da semana:", err);
    } finally {
      setProcessandoAcao(false);
    }
  };

  const removerGuiasSemana = async () => {
    setProcessandoAcao(true);
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
      await carregarDados({ showSkeleton: false });
    } catch (err) {
      console.error("Erro ao remover guias da semana:", err);
    } finally {
      setProcessandoAcao(false);
    }
  };

  const renderResumoSkeleton = () => (
    <div className="planner-summary-skeleton">
      <CardSkeleton variant="list" rows={4} />
    </div>
  );

  const renderDiasSkeleton = () => (
    <div className="planner-days-skeleton">
      {[0, 1, 2].map((item) => (
        <div key={item} className="day-card">
          <CardSkeleton variant="list" rows={5} />
        </div>
      ))}
    </div>
  );

  return (
    <div className="page-container">
      <div className="planner-header-row">
        <h2>Planejamento Semanal de Passeios</h2>

        {(processandoAcao || loadingSemana) && (
          <div className="planner-status-pill">
            {processandoAcao
              ? "Processando alterações..."
              : "Atualizando semana..."}
          </div>
        )}
      </div>

      <div className="header-tours">
        <div className="mode-toggle">
          <button
            className="btn-list"
            onClick={() => setModoVisualizacao(true)}
            disabled={processandoAcao || carregandoEstrutura}
          >
            Visualizar <Visibility fontSize="10" />
          </button>

          <button
            className="btn-list-edt"
            onClick={() => setModoVisualizacao(false)}
            disabled={processandoAcao || carregandoEstrutura}
          >
            Editar escala <ModeEdit fontSize="10" />
          </button>

          <button
            className="btn-list-gerar"
            onClick={alocarGuiasSemana}
            disabled={processandoAcao || carregandoEstrutura}
          >
            Gerar escala de Guias <ManageAccounts fontSize="10" />
          </button>

          <button
            className="btn-list-cld"
            onClick={removerGuiasSemana}
            disabled={processandoAcao || carregandoEstrutura}
          >
            Desfazer escala de Guias <Undo fontSize="10" />
          </button>

          <button
            className="btn-list"
            onClick={abrirEscalaEmNovaAba}
            disabled={processandoAcao || carregandoEstrutura}
          >
            Abrir planilha
          </button>

          <button
            className="btn-list-send"
            onClick={enviarWhatsappGuiasSemana_FIRESTORE}
            disabled={processandoAcao || carregandoEstrutura}
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
              disabled={processandoAcao}
            >
              ⬅ Semana anterior
            </button>

            <button
              className="btn-list"
              onClick={() => setSemanaOffset(0)}
              disabled={processandoAcao}
            >
              Semana atual
            </button>

            <button
              className="btn-list"
              onClick={() => setSemanaOffset((o) => o + 1)}
              disabled={processandoAcao}
            >
              Semana seguinte ➡
            </button>
            <button
              className="btn-list"
              onClick={atualizarSomentePlanilha}
              disabled={loading || processandoAcao}
            >
              Atualizar dados (Phoenix) <RefreshRounded fontSize="10" />
            </button>

            <span className="counter-info">{formatarPeriodoSemana()}</span>
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
      </div>

      <div className="resumo-modo-global">
        {modoGeradoSemana
          ? modoGeradoSemana === "seguir_nivel_selecionado"
            ? "Essa escala foi gerada com a regra: Prioridade"
            : "Essa escala foi gerada com a regra: Equilibrada"
          : "Escala ainda não gerada para esta semana"}{" "}
        <Warning fontSize="10" className="icon-warning" />
      </div>

      {carregandoEstrutura ? (
        <>
          {renderResumoSkeleton()}
          {renderDiasSkeleton()}
        </>
      ) : (
        <>
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

                    {g.sobrecarga && (
                      <span className="indicador-alerta">●</span>
                    )}
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
                      disabled={processandoAcao}
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
              aplicarPaxDaApiNosRegistros(extras[dia.date] || []),
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
                    key={`${dia.date}-${item.externalServiceId || item.id}-${item.serviceName}`}
                    className="passeio-item"
                  >
                    <span className="passeio-name">{item.serviceName}</span>

                    <span className="guia-name-aloc">
                      {item.guiaNome || "-"}
                    </span>

                    {modoVisualizacao ? (
                      <>
                        <span className="passeio-pax-1">
                          {item.passengers || 0} pax
                          <small>
                            {" "}
                            ({item.adultCount || 0} ADT / {item.childCount || 0}{" "}
                            CHD / {item.infantCount || 0} INF)
                          </small>
                        </span>
                        {statusGrupo(item)}
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
                          disabled={processandoAcao}
                        />

                        <select
                          value={item.allocationStatus || "OPEN"}
                          onChange={(e) =>
                            alterarStatusAlocacao(item.id, e.target.value)
                          }
                          disabled={processandoAcao}
                        >
                          <option value="OPEN">Aberto</option>
                          <option value="CLOSED">Fechado</option>
                        </select>

                        <select
                          value={item.guiaId || ""}
                          disabled={processandoAcao}
                          onChange={async (e) => {
                            const guia = guias.find(
                              (g) => g.id === e.target.value,
                            );

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
                              <option
                                key={g.id}
                                value={g.id}
                                disabled={disabled}
                              >
                                {label}
                              </option>
                            );
                          })}
                        </select>

                        {item.manual && (
                          <button
                            className="btn-remove"
                            onClick={() => removerPasseio(item.id)}
                            disabled={processandoAcao}
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
                      disabled={processandoAcao}
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
                      disabled={processandoAcao}
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
                      disabled={processandoAcao}
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
                      disabled={processandoAcao}
                    >
                      ➕
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
};

export default ListaPasseiosSemana;
