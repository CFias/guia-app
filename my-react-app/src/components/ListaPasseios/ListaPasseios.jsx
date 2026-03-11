import { useEffect, useRef, useState } from "react";
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
  Undo,
  Visibility,
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

  const carregarDados = async () => {
    setLoading(true);
    try {
      const semanaAtual = gerarSemana(semanaOffset);
      setSemana(semanaAtual);

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

      if (configSnap.exists()) {
        const configData = configSnap.data();
        setModoDistribuicaoGuias(
          configData.modoDistribuicaoGuias || "equilibrado"
        );
      } else {
        setModoDistribuicaoGuias("equilibrado");
      }

      const mapa = {};

      for (const dia of semanaAtual) {
        const q = query(
          collection(db, "weekly_services"),
          where("date", "==", dia.date)
        );
        const snap = await getDocs(q);
        mapa[dia.date] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }

      setExtras(mapa);
    } catch (err) {
      console.error("Erro ao carregar dados:", err);
    } finally {
      setLoading(false);
    }
  };

  const encontrarRegistroDoPasseio = (registrosDia, passeio) => {
    return registrosDia.find(
      (r) =>
        (passeio.manual && r.id === passeio.id) ||
        (!passeio.manual && r.serviceId === passeio.serviceId)
    );
  };

  const criarRegistroBase = async ({
    passeio,
    dia,
    passengers = 0,
    guia = null,
    allocationStatus = "OPEN",
    manual = false,
  }) => {
    const docRef = await addDoc(collection(db, "weekly_services"), {
      serviceId: passeio.serviceId || null,
      serviceName: passeio.nome,
      passengers: Number(passengers || 0),
      guiaId: guia?.id || null,
      guiaNome: guia?.nome || null,
      date: dia.date,
      day: dia.day,
      manual,
      allocationStatus,
      createdAt: new Date(),
    });

    const novoRegistro = {
      id: docRef.id,
      serviceId: passeio.serviceId || null,
      serviceName: passeio.nome,
      passengers: Number(passengers || 0),
      guiaId: guia?.id || null,
      guiaNome: guia?.nome || null,
      date: dia.date,
      day: dia.day,
      manual,
      allocationStatus,
    };

    setExtras((prev) => {
      const novo = { ...prev };

      if (!novo[dia.date]) novo[dia.date] = [];

      const jaExiste = novo[dia.date].some(
        (r) =>
          (!manual &&
            r.serviceId &&
            r.serviceId === (passeio.serviceId || null)) ||
          (manual && r.id === docRef.id)
      );

      if (!jaExiste) {
        novo[dia.date] = [...novo[dia.date], novoRegistro];
      }

      return novo;
    });

    return novoRegistro;
  };

  const ordenarGuiasEquilibrado = (guiasElegiveis, contadorSemana) => {
    return [...guiasElegiveis].sort((a, b) => {
      const cargaA = contadorSemana[a.id] || 0;
      const cargaB = contadorSemana[b.id] || 0;

      if (cargaA !== cargaB) {
        return cargaA - cargaB;
      }

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

      if (scoreA !== scoreB) {
        return scoreA - scoreB;
      }

      if (cargaA !== cargaB) {
        return cargaA - cargaB;
      }

      if (prioridadeA !== prioridadeB) {
        return prioridadeB - prioridadeA;
      }

      return (a.nome || "").localeCompare(b.nome || "", "pt-BR", {
        sensitivity: "base",
      });
    });
  };

  const alterarStatusAlocacao = async (registroId, status) => {
    if (!registroId) return;

    try {
      const dadosUpdate = {
        allocationStatus: status,
      };

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
      return <span className="status fechado">Passeio Fechado</span>;
    }

    const totalPax = Number(pax || 0);

    return totalPax >= 8 ? (
      <span className="status ok">Grupo Formado</span>
    ) : (
      <span className="status alerta">Formar Grupo</span>
    );
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

    const mapaSemana = {};
    semana.forEach((d) => {
      mapaSemana[d.date] = d;
    });

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
        if (!mapaSemana[r.date]) return;
        if (!r.serviceId && !r.manual) return;
        if (!r.guiaNome && !r.guiaId) return;

        const guia = guias.find((g) => g.id === r.guiaId);
        if (!guia?.whatsapp) return;

        if (!mapaGuias[r.guiaId]) {
          mapaGuias[r.guiaId] = {
            nome: guia.nome || r.guiaNome || "Guia",
            whatsapp: guia.whatsapp,
            datas: new Set(),
          };
        }

        const dia = mapaSemana[r.date];
        mapaGuias[r.guiaId].datas.add(
          `• ${dia.day} (${dia.date.split("-").reverse().join("/")})`
        );
      });

      const listaGuias = Object.values(mapaGuias).filter(
        (g) => g.datas.size > 0
      );

      listaGuias.forEach((guia, index) => {
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
          {
            passengers: Number(pax),
          },
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
        passengers: Number(dados.pax || 0),
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

  const getCargaSemanal = (guiaId) => {
    const guiaResumo = resumoGuias.find((g) => g.guiaId === guiaId);
    return guiaResumo?.ocupacao || 0;
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
        const registrosDia = extras[dia.date] || [];

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
              realocados: 0,
              trabalhandoBloqueado: false,
              abaixoMedia: false,
              indiceEquilibrio: 0,
              scorePrioridade: 0,
            };
          }

          const guiaResumo = contador[r.guiaId];

          guiaResumo.totalServicos++;
          guiaResumo.datas.add(r.date);

          if (r.manual === true) {
            guiaResumo.realocados++;
          }

          if (bloqueiosMap[r.guiaId]?.includes(r.date)) {
            guiaResumo.trabalhandoBloqueado = true;
          }
        });
      });

      let resumo = Object.values(contador);

      resumo.forEach((g) => {
        const dias = Number(g.diasDisponiveis) || 0;
        const total = Number(g.totalServicos) || 0;

        if (dias > 0) {
          g.ocupacao = Math.round((total / dias) * 100);
        } else {
          g.ocupacao = 0;
        }

        if (!Number.isFinite(g.ocupacao)) {
          g.ocupacao = 0;
        }

        g.sobrecarga = g.ocupacao >= 90;
      });

      const ocupacoesValidas = resumo
        .map((g) => g.ocupacao)
        .filter((o) => Number.isFinite(o));

      const mediaEquipe =
        ocupacoesValidas.length > 0
          ? ocupacoesValidas.reduce((acc, o) => acc + o, 0) /
          ocupacoesValidas.length
          : 0;

      resumo.forEach((g) => {
        g.abaixoMedia = g.ocupacao < mediaEquipe - 15;
        g.indiceEquilibrio = Math.abs(g.ocupacao - mediaEquipe);

        if (!Number.isFinite(g.indiceEquilibrio)) {
          g.indiceEquilibrio = 0;
        }
      });

      resumo.sort((a, b) => b.ocupacao - a.ocupacao);

      resumo = resumo.map((g) => ({
        ...g,
        datas: new Set(g.datas),
      }));

      setResumoGuias(resumo);
    } catch (err) {
      console.error("Erro ao gerar resumo dos guias:", err);
    }
  };

  const formatarPeriodoSemana = () => {
    if (!semana.length) return "";

    const inicio = semana[0].date;
    const fim = semana[6].date;

    const formatar = (data) => {
      const [ano, mes, dia] = data.split("-");
      return `${dia}/${mes}/${ano}`;
    };

    return `${formatar(inicio)} até ${formatar(fim)}`;
  };

  const alocarGuiasSemana = async () => {
    setLoading(true);
    try {
      if (!guias.length || !services.length || !semana.length) return;

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

        const passeiosFixos = services.filter((s) =>
          (s.frequencia || []).includes(dia.day)
        );

        const qReg = query(
          collection(db, "weekly_services"),
          where("date", "==", dia.date)
        );
        const snapReg = await getDocs(qReg);

        const registrosDia = snapReg.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        const usadosNoDia = new Set();
        registrosDia.forEach((r) => {
          if (r.guiaId && r.allocationStatus !== "CLOSED") {
            usadosNoDia.add(r.guiaId);
          }
        });

        for (const p of passeiosFixos) {
          const jaExiste = registrosDia.some((r) => r.serviceId === p.id);

          if (!jaExiste) {
            const docRef = await addDoc(collection(db, "weekly_services"), {
              serviceId: p.id,
              serviceName: p.nome,
              passengers: 0,
              modalidade: "regular",
              date: dia.date,
              day: dia.day,
              createdAt: new Date(),
              allocationStatus: "OPEN",
            });

            registrosDia.push({
              id: docRef.id,
              serviceId: p.id,
              serviceName: p.nome,
              guiaId: null,
              guiaNome: null,
              passengers: 0,
              day: dia.day,
              date: dia.date,
              manual: false,
              allocationStatus: "OPEN",
            });
          }
        }

        for (const r of registrosDia) {
          if (!r?.id) continue;
          if (r.guiaId || r.manual) continue;
          if (r.allocationStatus === "CLOSED") continue;

          const elegiveis = guiasDisponiveis.filter((g) => {
            if (usadosNoDia.has(g.id)) return false;

            const passeiosAptos = Array.isArray(g.passeios) ? g.passeios : [];
            return passeiosAptos.some((p) => p.id === r.serviceId);
          });

          if (!elegiveis.length) continue;

          let candidatosOrdenados = [];

          if (modoDistribuicaoGuias === "seguir_nivel_selecionado") {
            candidatosOrdenados = ordenarGuiasPorPrioridade(
              elegiveis,
              contadorSemana
            );
          } else {
            candidatosOrdenados = ordenarGuiasEquilibrado(
              elegiveis,
              contadorSemana
            );
          }

          const guiaSelecionado = candidatosOrdenados[0];
          if (!guiaSelecionado) continue;

          await setDoc(
            doc(db, "weekly_services", r.id),
            {
              guiaId: guiaSelecionado.id,
              guiaNome: guiaSelecionado.nome,
            },
            { merge: true }
          );

          usadosNoDia.add(guiaSelecionado.id);
          contadorSemana[guiaSelecionado.id]++;
        }
      }

      await carregarDados();
    } catch (err) {
      console.error("Erro ao alocar guias da semana:", err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusGuiaNoDia = (guiaId, data, registrosDia) => {
    const registroDisp = disponibilidades.find((d) => d.guideId === guiaId);

    if (!registroDisp?.disponibilidade) {
      return { status: "NO_DATA" };
    }

    const dispDia = registroDisp.disponibilidade.find((d) => d.date === data);

    if (dispDia?.status === "BLOCKED") {
      return { status: "BLOCKED" };
    }

    const jaUsado = registrosDia.some(
      (r) => r.guiaId === guiaId && r.allocationStatus !== "CLOSED"
    );

    if (jaUsado) {
      return { status: "USED" };
    }

    return { status: "AVAILABLE" };
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
        <p className="counter-info">
          Modo de distribuição:{" "}
          <strong>
            {modoDistribuicaoGuias === "seguir_nivel_selecionado"
              ? "Prioridade"
              : "Equilibrado"}
          </strong>
        </p>

        <div className="week-indicator">
          <span>{formatarPeriodoSemana()}</span>
        </div>

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
        </div>

        <div className="mode-toggle">
          <button className="btn-list" onClick={() => setModoVisualizacao(true)}>
            Visualizar <Visibility fontSize="10" />
          </button>

          <button
            className="btn-list-edt"
            onClick={() => setModoVisualizacao(false)}
          >
            Editar <ModeEdit fontSize="10" />
          </button>

          <button className="btn-list" onClick={alocarGuiasSemana}>
            Gerar escala de Guias <ManageAccounts fontSize="10" />
          </button>

          <button className="btn-list-cld" onClick={removerGuiasSemana}>
            Desfazer escala de Guias <Undo fontSize="10" />
          </button>

          <button
            className="btn-list"
            onClick={enviarWhatsappGuiasSemana_FIRESTORE}
          >
            Enviar todos os Bloqueios <Send fontSize="10" />
          </button>
        </div>
      </div>

      <div className="resumo-modo-global">
        {modoDistribuicaoGuias === "seguir_nivel_selecionado"
          ? "Escala gerada com regra de prioridade"
          : "Escala gerada com regra equilibrada"}
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

            {Number.isFinite(g.variacao) && g.variacao !== 0 && (
              <div className={`variacao ${g.variacao > 0 ? "up" : "down"}`}>
                {g.variacao > 0 ? "▲" : "▼"} {Math.abs(g.variacao)}%
              </div>
            )}

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

            {g.injusto && (
              <span className="alerta-distribuicao">⚖️ Distribuição desigual</span>
            )}
          </div>
        ))}
      </div>

      {semana.map((dia) => {
        const passeiosFixos = services.filter((s) =>
          (s.frequencia || []).includes(dia.day)
        );

        const registrosDia = extras[dia.date] || [];

        const passeiosDoDia = [
          ...passeiosFixos.map((p) => ({
            id: p.id,
            nome: p.nome,
            serviceId: p.id,
            manual: false,
          })),
          ...registrosDia
            .filter((r) => r.manual)
            .map((r) => ({
              id: r.id,
              nome: r.serviceName,
              serviceId: null,
              manual: true,
            })),
        ];

        const totalPasseios = passeiosDoDia.length;

        const passeiosComGuia = passeiosDoDia.filter((p) => {
          const registro = encontrarRegistroDoPasseio(registrosDia, p);
          return !!registro?.guiaId && registro?.allocationStatus !== "CLOSED";
        }).length;

        let statusDia = "vazio";

        if (passeiosComGuia === 0) {
          statusDia = "vazio";
        } else if (passeiosComGuia < totalPasseios) {
          statusDia = "parcial";
        } else {
          statusDia = "completo";
        }

        return (
          <div key={dia.date} className="day-card">
            <strong className={`day-list ${statusDia}`}>
              {dia.label}
              <span className="day-status">
                - Passeios com Guias:{passeiosComGuia} - Total de Passeios:
                {totalPasseios}
              </span>
            </strong>

            {passeiosDoDia.map((p) => {
              const registro = encontrarRegistroDoPasseio(registrosDia, p);

              return (
                <div key={p.id} className="passeio-item">
                  <span className="passeio-name">{p.nome}</span>

                  {modoVisualizacao ? (
                    <>
                      <span className="passeio-pax">
                        {registro?.passengers || 0} pax
                      </span>
                      {statusGrupo(
                        registro?.passengers,
                        registro?.allocationStatus
                      )}
                      <span className="guia-name-aloc">
                        {registro?.guiaNome || "-"}
                      </span>
                    </>
                  ) : (
                    <>
                      <input
                        type="number"
                        min="0"
                        value={
                          registro
                            ? paxEditando[registro.id] ??
                            registro.passengers ??
                            0
                            : 0
                        }
                        onChange={async (e) => {
                          const novoPax = e.target.value;

                          if (!registro) {
                            await criarRegistroBase({
                              passeio: p,
                              dia,
                              passengers: Number(novoPax),
                              guia: null,
                              allocationStatus: "OPEN",
                              manual: false,
                            });
                            return;
                          }

                          alterarPaxManual(registro.id, novoPax);
                        }}
                      />

                      <select
                        value={registro?.allocationStatus || "OPEN"}
                        onChange={async (e) => {
                          const novoStatus = e.target.value;

                          if (!registro) {
                            await criarRegistroBase({
                              passeio: p,
                              dia,
                              passengers: 0,
                              guia: null,
                              allocationStatus: novoStatus,
                              manual: false,
                            });
                            return;
                          }

                          await alterarStatusAlocacao(registro.id, novoStatus);
                        }}
                      >
                        <option value="OPEN">Aberto</option>
                        <option value="CLOSED">Fechado</option>
                      </select>

                      <select
                        value={registro?.guiaId || ""}
                        onChange={async (e) => {
                          const guia = guias.find((g) => g.id === e.target.value);

                          if (registro?.allocationStatus === "CLOSED") {
                            alert(
                              "Não é possível alocar guia em um serviço fechado."
                            );
                            return;
                          }

                          if (!registro) {
                            await criarRegistroBase({
                              passeio: p,
                              dia,
                              passengers: 0,
                              guia: guia || null,
                              allocationStatus: "OPEN",
                              manual: false,
                            });
                            return;
                          }

                          await alterarGuiaManual(
                            registro.id,
                            guia || null,
                            dia,
                            registro
                          );
                        }}
                      >
                        <option value="">Sem guia</option>

                        {guias.map((g) => {
                          const status = getStatusGuiaNoDia(
                            g.id,
                            dia.date,
                            registrosDia
                          );
                          const carga = getCargaSemanal(g.id);

                          let label = g.nome;

                          if (status.status === "AVAILABLE") {
                            label += ` 🟢 (${carga}%)`;
                          }

                          if (status.status === "USED") {
                            label += ` 🔒 (Já alocado)`;
                          }

                          if (status.status === "BLOCKED") {
                            label += ` 🔴 (Bloqueado)`;
                          }

                          if (status.status === "NO_DATA") {
                            label += ` ⚫ (Sem disponibilidade)`;
                          }

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

                      {registro?.manual && (
                        <button
                          className="btn-remove"
                          onClick={() => removerPasseio(registro.id)}
                        >
                          🗑️
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })}

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