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
  "PASSEIO À PRAIA DO FORTE (SHUTTLE)"
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
    (servico) => normalizarTexto(obterNomeCanonico(servico)) === nomeNormalizado
  );

  const ignoradoPorTrecho = TERMOS_IGNORADOS.some((termo) =>
    nomeNormalizado.includes(normalizarTexto(termo))
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

    // só usa passengers bruto quando não existe detalhamento
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
        passengers: totalDetalhado > 0 ? totalDetalhado : Number(item.passengers ?? 0),
      };
    })
    .sort((a, b) =>
      (a.serviceName || "").localeCompare(b.serviceName || "", "pt-BR", {
        sensitivity: "base",
      })
    );
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
        snap.exists() ? snap.data().modoDistribuicaoGerado || null : null
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
        { merge: true }
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
        { merge: true }
      );
      setModoGeradoSemana(null);
    } catch (err) {
      console.error("Erro ao limpar modo gerado da semana:", err);
    }
  };

  const encontrarServiceCatalogo = (serviceIdExterno, nomeApi, listaServices) => {
    return (
      listaServices.find(
        (s) =>
          Number(s.externalServiceId || 0) === Number(serviceIdExterno || 0)
      ) ||
      listaServices.find(
        (s) =>
          normalizarTexto(s.externalName || s.nome || "") ===
          normalizarTexto(nomeApi)
      ) ||
      null
    );
  };

  const sincronizarPasseiosDaApiNaSemana = async (semanaAtual, servicesData) => {
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
          where("date", "==", dia.date)
        );
        const snapDia = await getDocs(qDia);

        const registrosExistentes = snapDia.docs.map((d) => ({
          id: d.id,
          ref: d.ref,
          ...d.data(),
        }));

        const importadosDoDia = registrosExistentes.filter(
          (r) => r.importedFromApi === true && r.manual !== true
        );

        for (const passeioApi of Object.values(agregados)) {
          const serviceCatalogo = encontrarServiceCatalogo(
            passeioApi.serviceIdExterno,
            passeioApi.nome,
            servicesData
          );

          const duplicados = importadosDoDia.filter(
            (r) =>
              Number(r.externalServiceId || 0) ===
              Number(passeioApi.serviceIdExterno || 0)
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
          Number(p.serviceIdExterno)
        );

        const obsoletos = importadosDoDia.filter(
          (r) => !idsVindosApi.includes(Number(r.externalServiceId || 0))
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

      const servicesData = servSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const guiasData = guiasSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const disponibilidadesData = dispSnap.docs.map((d) => d.data());

      setServices(servicesData);
      setGuias(guiasData);
      setDisponibilidades(disponibilidadesData);

      setModoDistribuicaoGuias(
        configSnap.exists()
          ? configSnap.data().modoDistribuicaoGuias || "equilibrado"
          : "equilibrado"
      );

      await sincronizarPasseiosDaApiNaSemana(semanaAtual, servicesData);

      const mapa = {};

      for (const dia of semanaAtual) {
        const q = query(
          collection(db, "weekly_services"),
          where("date", "==", dia.date)
        );
        const snap = await getDocs(q);

        const listaDia = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        console.log(
          "DUP CHECK",
          dia.date,
          listaDia.map((r) => ({
            id: r.id,
            nome: r.serviceName,
            externalServiceId: r.externalServiceId,
            pax: r.passengers,
          }))
        );

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
        where("date", "==", dia.date)
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

  const ordenarGuiasEquilibrado = (guiasElegiveis, contadorSemana) => {
    return [...guiasElegiveis].sort((a, b) => {
      const cargaA = contadorSemana[a.id] || 0;
      const cargaB = contadorSemana[b.id] || 0;

      if (cargaA !== cargaB) return cargaA - cargaB;

      return (a.nome || "").localeCompare(b.nome || "", "pt-BR", {
        sensitivity: "base",
      });
    });
  };

  const ordenarGuiasPorPrioridade = (guiasElegiveis, contadorSemana) => {
    return [...guiasElegiveis].sort((a, b) => {
      const prioridadeA = Number(a.nivelPrioridade || 2);
      const prioridadeB = Number(b.nivelPrioridade || 2);

      const cargaA = Number(contadorSemana[a.id] || 0);
      const cargaB = Number(contadorSemana[b.id] || 0);

      if (cargaA === 0 && cargaB > 0) return -1;
      if (cargaB === 0 && cargaA > 0) return 1;

      const scoreA = cargaA / prioridadeA;
      const scoreB = cargaB / prioridadeB;

      if (scoreA !== scoreB) return scoreA - scoreB;
      if (cargaA !== cargaB) return cargaA - cargaB;
      if (prioridadeA !== prioridadeB) return prioridadeB - prioridadeA;

      return (a.nome || "").localeCompare(b.nome || "", "pt-BR", {
        sensitivity: "base",
      });
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
              : r
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
          { merge: true }
        );

        setExtras((prev) => {
          const novo = { ...prev };
          Object.keys(novo).forEach((date) => {
            novo[date] = novo[date].map((r) =>
              r.id === registroId ? { ...r, passengers: Number(pax) } : r
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
        },
        { merge: true }
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
      (r) => r.guiaId === guiaId && r.allocationStatus !== "CLOSED"
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
        where("date", "<=", fimSemana)
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
        where("date", "<=", fimSemana)
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
          `• ${dia.day} (${dia.date.split("-").reverse().join("/")})`
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
                ""
              )}?text=${encodeURIComponent(texto)}`,
              "_blank"
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
        ""
      )}?text=${encodeURIComponent(texto)}`,
      "_blank"
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
          (ds) => ds.date >= inicioSemana && ds.date <= fimSemana
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
        }))
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

      const contadorSemana = {};
      guias.forEach((g) => {
        contadorSemana[g.id] = 0;
      });

      const snapDisp = await getDocs(collection(db, "guide_availability"));
      const disponibilidadesSemana = snapDisp.docs
        .map((d) => d.data())
        .filter(
          (d) =>
            Array.isArray(d.disponibilidade) &&
            d.disponibilidade.some(
              (ds) => ds.date >= inicioSemana && ds.date <= fimSemana
            )
        );

      for (const dia of semana) {
        const qReg = query(
          collection(db, "weekly_services"),
          where("date", "==", dia.date)
        );
        const snapReg = await getDocs(qReg);

        const registrosDia = snapReg.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        const registrosAgrupados = agruparRegistrosPorServico(registrosDia);

        if (!registrosAgrupados.length) continue;

        const guiasDisponiveis = guias.filter((g) =>
          disponibilidadesSemana.some(
            (d) =>
              d.guideId === g.id &&
              d.disponibilidade.some(
                (ds) => ds.date === dia.date && ds.status !== "BLOCKED"
              )
          )
        );

        if (!guiasDisponiveis.length) continue;

        const usadosNoDia = new Set();

        registrosAgrupados.forEach((r) => {
          if (r.guiaId && r.allocationStatus !== "CLOSED") {
            usadosNoDia.add(r.guiaId);
          }
        });

        for (const item of registrosAgrupados) {
          if (!item?.id) continue;
          if (item.guiaId) continue;
          if (item.allocationStatus === "CLOSED") continue;

          const elegiveis = guiasDisponiveis.filter((g) => {
            if (usadosNoDia.has(g.id)) return false;

            const passeiosAptos = Array.isArray(g.passeios) ? g.passeios : [];

            return passeiosAptos.some((p) => {
              const matchServiceId =
                item.serviceId &&
                p?.id &&
                String(p.id) === String(item.serviceId);

              const matchExternalServiceId =
                item.externalServiceId &&
                p?.externalServiceId &&
                Number(p.externalServiceId) === Number(item.externalServiceId);

              const matchNome =
                normalizarTexto(p?.externalName || p?.nome || "") ===
                normalizarTexto(item.serviceName || "");

              return matchServiceId || matchExternalServiceId || matchNome;
            });
          });

          if (!elegiveis.length) continue;

          const candidatosOrdenados =
            modoDistribuicaoGuias === "seguir_nivel_selecionado"
              ? ordenarGuiasPorPrioridade(elegiveis, contadorSemana)
              : ordenarGuiasEquilibrado(elegiveis, contadorSemana);

          const guiaSelecionado = candidatosOrdenados[0];
          if (!guiaSelecionado) continue;

          await setDoc(
            doc(db, "weekly_services", item.id),
            {
              guiaId: guiaSelecionado.id,
              guiaNome: guiaSelecionado.nome,
              updatedAt: new Date(),
            },
            { merge: true }
          );

          usadosNoDia.add(guiaSelecionado.id);
          contadorSemana[guiaSelecionado.id]++;
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
          where("date", "==", dia.date)
        );
        const snap = await getDocs(q);

        for (const docSnap of snap.docs) {
          const data = docSnap.data();
          if (!data.guiaId) continue;

          await updateDoc(docSnap.ref, {
            guiaId: null,
            guiaNome: null,
            manual: false,
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
          <button className="btn-list" onClick={() => setModoVisualizacao(true)}>
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
            ? "Essa escala foi gerada com regra de Prioridade"
            : "Essa escala foi gerada com regra de Equilibrada"
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
                    <span className={`priority-pill p-${g.nivelPrioridade || 2}`}>
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
          extras[dia.date] || []
        );

        const totalPasseios = registrosOrdenados.length;
        const passeiosComGuia = registrosOrdenados.filter(
          (r) => !!r.guiaId && r.allocationStatus !== "CLOSED"
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
              <div key={`${dia.date}-${item.externalServiceId || item.id}`} className="passeio-item">
                <span className="passeio-name">{item.serviceName}</span>

                {modoVisualizacao ? (
                  <>
                    <span className="passeio-pax">
                      {item.passengers || 0} pax
                      <small>
                        {" "}
                        ({item.adultCount || 0} ADT / {item.childCount || 0} CHD / {item.infantCount || 0} INF)
                      </small>
                    </span>
                    {statusGrupo(item.passengers, item.allocationStatus)}
                    <span className="guia-name-aloc">{item.guiaNome || "-"}</span>
                  </>
                ) : (
                  <>
                    <input
                      type="number"
                      min="0"
                      value={paxEditando[item.id] ?? item.passengers ?? 0}
                      onChange={(e) => alterarPaxManual(item.id, e.target.value)}
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
                            "Não é possível alocar guia em um serviço fechado."
                          );
                          return;
                        }

                        await alterarGuiaManual(item.id, guia || null, dia, item);
                      }}
                    >
                      <option value="">Sem guia</option>

                      {guias.map((g) => {
                        const status = getStatusGuiaNoDia(
                          g.id,
                          dia.date,
                          registrosOrdenados
                        );
                        const carga = getCargaSemanal(g.id);

                        let label = g.nome;

                        if (status.status === "AVAILABLE") label += ` 🟢 (${carga}%)`;
                        if (status.status === "USED") label += ` 🔒 (Já alocado)`;
                        if (status.status === "BLOCKED") label += ` 🔴 (Bloqueado)`;
                        if (status.status === "NO_DATA") label += ` ⚫ (Sem disponibilidade)`;

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