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
  onSnapshot,
} from "firebase/firestore";
import { db } from "../../Services/Services/firebase";
import "./styles.css";
import {
  ManageAccounts,
  ModeEdit,
  Send,
  SendOutlined,
  SendRounded,
  Undo,
  Visibility,
} from "@mui/icons-material";

const DIAS = [
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
  "Domingo",
];
import LoadingBlock from "../../components/LoadingOverlay/LoadingOverlay";

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
  const [mostrarResumo, setMostrarResumo] = useState(false);

  const paxTimers = useRef({});



  useEffect(() => {
    carregarDados();
  }, [semanaOffset]);

  const carregarDados = async () => {
    setLoading(true);
    try {
      const semanaAtual = gerarSemana(semanaOffset);
      setSemana(semanaAtual);

      const servSnap = await getDocs(collection(db, "services"));
      setServices(servSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      const guiasSnap = await getDocs(collection(db, "guides"));
      setGuias(guiasSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      const mapa = {};
      for (const dia of semanaAtual) {
        const q = query(
          collection(db, "weekly_services"),
          where("date", "==", dia.date),
        );
        const snap = await getDocs(q);
        mapa[dia.date] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }
      setExtras(mapa);
    } finally {
      setLoading(false);
    }
  };

  const alterarStatusAlocacao = async (registroId, status) => {
    if (!registroId) return;

    try {
      const dadosUpdate = {
        allocationStatus: status,
      };

      // 🔴 Se fechar, remove guia automaticamente
      if (status === "CLOSED") {
        dadosUpdate.guiaId = null;
        dadosUpdate.guiaNome = null;
      }

      await setDoc(
        doc(db, "weekly_services", registroId),
        dadosUpdate,
        { merge: true }
      );

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

  useEffect(() => {
    document.body.style.overflow = loading ? "hidden" : "auto";
  }, [loading]);

  const removerPasseio = async (id) => {
    setLoading(true);
    try {
      await deleteDoc(doc(db, "weekly_services", id));
      await carregarDados();
    } finally {
      setLoading(false);
    }
  };

  const weeklyServices = semana.map((dia) => {
    const registros = extras[dia.date] || [];

    const servicesValidos = registros.filter((r) => {
      if (!r.guiaId || !r.serviceId) return false;

      const servico = services.find((s) => s.id === r.serviceId);
      if (!servico) return false;

      if (!servico.frequencia?.includes(r.day)) return false;

      return true;
    });

    return {
      day: dia.day,
      date: dia.date,
      services: servicesValidos.map((r) => {
        const guia = guias.find((g) => g.id === r.guiaId);

        return {
          guideId: r.guiaId,
          guideName: r.guiaNome,
          guideWhatsapp: guia?.whatsapp || null,
        };
      }),
    };
  });

  const statusGrupo = (pax) => {
    if (pax === null || pax === undefined) return null;

    return pax >= 8 ? (
      <span className="status ok">Grupo Formado</span>
    ) : (
      <span className="status alerta">Formar Grupo</span>
    );
  };

  const enviarWhatsappGuiasSemana_FIRESTORE = async () => {
    if (!semana.length || !guias.length) return;

    const inicioSemana = semana[0].date;
    const fimSemana = semana[semana.length - 1].date;

    const mapaSemana = {};
    semana.forEach((d) => (mapaSemana[d.date] = d));

    const q = query(
      collection(db, "weekly_services"),
      where("date", ">=", inicioSemana),
      where("date", "<=", fimSemana)
    );

    const snap = await getDocs(q);

    const mapaGuias = {};

    snap.docs.forEach((docSnap) => {
      const r = docSnap.data();

      // 🔴 1️⃣ Registro precisa ser válido
      if (!r || !r.date || !r.guiaId) return;

      // 🔴 2️⃣ Ignora CLOSED
      if (r.allocationStatus === "CLOSED") return;

      // 🔴 3️⃣ Precisa estar dentro da semana atual
      if (!mapaSemana[r.date]) return;

      // 🔴 4️⃣ Precisa ter serviço válido
      if (!r.serviceId && !r.manual) return;

      const guia = guias.find((g) => g.id === r.guiaId);
      if (!guia?.whatsapp) return;

      if (!mapaGuias[r.guiaId]) {
        mapaGuias[r.guiaId] = {
          nome: guia.nome || r.guiaNome || "Guia",
          whatsapp: guia.whatsapp,
          datas: new Set(), // 🔵 evita duplicidade automaticamente
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
Olá, querido(a) ${guia.nome}! 🍀

Segue sua escala da semana:

${Array.from(guia.datas).join("\n")}

Gentilmente, confirme o recebimento.
Operacional - Luck Receptivo 🍀
`.trim();

      setTimeout(() => {
        window.open(
          `https://wa.me/55${guia.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(
            texto
          )}`,
          "_blank"
        );
      }, index * 2500);
    });
  };

  /* ===== GUIA MANUAL ===== */
  const alterarGuiaManual = async (registroId, guia, dia) => {
    if (!registroId) return;

    setLoading(true);
    try {
      await setDoc(
        doc(db, "weekly_services", registroId),
        {
          guiaId: guia?.id || null,
          guiaNome: guia?.nome || null,
          day: dia.day,
          date: dia.date,
          manual: false, // ✅ FIXO NÃO É MANUAL
        },
        { merge: true }
      );

      await carregarDados();
    } finally {
      setLoading(false);
    }
  };


  /* ===== PAX MANUAL ===== */
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
        allocationStatus: "OPEN", // ✅ novo
      });


      // 🔄 limpa o formulário daquele dia
      setNovoServico((prev) => ({
        ...prev,
        [dia.date]: {},
      }));

      // 🔄 recarrega para exibir na tabela
      await carregarDados();
    } catch (err) {
      console.error("Erro ao adicionar passeio manual:", err);
    } finally {
      setLoading(false);
    }
  };

  const gerarResumoGuiasSemana = async () => {
    if (!semana.length || !guias.length) {
      setResumoGuias([]);
      return;
    }

    const inicioSemana = semana[0].date;
    const fimSemana = semana[semana.length - 1].date;

    // 🔹 1️⃣ Buscar serviços da semana
    const qServicos = query(
      collection(db, "weekly_services"),
      where("date", ">=", inicioSemana),
      where("date", "<=", fimSemana)
    );

    const snapServicos = await getDocs(qServicos);

    // 🔹 2️⃣ Buscar disponibilidades
    const snapDisp = await getDocs(collection(db, "guide_availability"));

    const disponibilidadeMap = {};
    const bloqueiosMap = {};

    snapDisp.docs.forEach((doc) => {
      const d = doc.data();
      if (!Array.isArray(d.disponibilidade)) return;

      const diasSemana = d.disponibilidade.filter(
        (ds) => ds.date >= inicioSemana && ds.date <= fimSemana
      );

      disponibilidadeMap[d.guideId] = diasSemana.length;

      // 🔴 Capturar bloqueios reais
      bloqueiosMap[d.guideId] = diasSemana
        .filter((ds) => ds.status === "BLOCKED")
        .map((ds) => ds.date);
    });

    // 🔹 3️⃣ Contar serviços
    const contador = {};

    snapServicos.docs.forEach((docSnap) => {
      const r = docSnap.data();
      if (!r.guiaId) return;

      if (!contador[r.guiaId]) {
        const guia = guias.find((g) => g.id === r.guiaId);

        contador[r.guiaId] = {
          guiaId: r.guiaId,
          nome: guia?.nome || "Guia",
          totalServicos: 0,
          diasDisponiveis: disponibilidadeMap[r.guiaId] || 0,
          bloqueios: bloqueiosMap[r.guiaId] || [],
          ocupacao: 0,
          sobrecarga: false,
          datas: new Set(), // 🔥 adiciona isso
        };
      }

      contador[r.guiaId].totalServicos++;
      contador[r.guiaId].datas.add(r.date);
    });

    let resumo = Object.values(contador);

    resumo.forEach((g) => {
      if (g.diasDisponiveis > 0) {
        g.ocupacao = Math.round(
          (g.totalServicos / g.diasDisponiveis) * 100
        );
      }

      g.sobrecarga = g.ocupacao >= 90;
    });

    // 🏆 ordenar
    resumo.sort((a, b) => b.ocupacao - a.ocupacao);
    resumo = resumo.map((g) => ({
      ...g,
      datas: new Set(g.datas), // mantém Set funcional
    }));
    setResumoGuias(resumo);
  };

  useEffect(() => {
    if (semana.length && guias.length) {
      gerarResumoGuiasSemana();
    }
  }, [extras, semana, guias]);

  const alocarGuiasSemana = async () => {
    setLoading(true);
    try {
      if (!guias.length || !services.length || !semana.length) return;

      const inicioSemana = semana[0].date;
      const fimSemana = semana[semana.length - 1].date;

      const contadorSemana = {};
      guias.forEach((g) => (contadorSemana[g.id] = 0));

      const snapDisp = await getDocs(collection(db, "guide_availability"));
      const disponibilidades = snapDisp.docs
        .map((d) => d.data())
        .filter(
          (d) =>
            Array.isArray(d.disponibilidade) &&
            d.disponibilidade.some(
              (ds) => ds.date >= inicioSemana && ds.date <= fimSemana,
            ),
        );

      for (const dia of semana) {
        const guiasDisponiveis = guias.filter((g) =>
          disponibilidades.some(
            (d) =>
              d.guideId === g.id &&
              d.disponibilidade.some((ds) => ds.date === dia.date),
          ),
        );

        if (!guiasDisponiveis.length) continue;

        const passeiosFixos = services.filter((s) =>
          (s.frequencia || []).includes(dia.day),
        );

        const qReg = query(
          collection(db, "weekly_services"),
          where("date", "==", dia.date),
        );
        const snapReg = await getDocs(qReg);

        const registrosDia = snapReg.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        const usadosNoDia = new Set();
        registrosDia.forEach((r) => {
          if (r.guiaId) usadosNoDia.add(r.guiaId);
        });

        for (const p of passeiosFixos) {
          if (!registrosDia.some((r) => r.serviceId === p.id)) {
            const docRef = await addDoc(collection(db, "weekly_services"), {
              serviceId: p.id,
              serviceName: p.nome,
              passengers: 0,
              modalidade: "regular",
              date: dia.date,
              day: dia.day,
              createdAt: new Date(),
              allocationStatus: "OPEN", // ✅ novo
            });


            registrosDia.push({
              id: docRef.id,
              serviceId: p.id,
              guiaId: null,
            });
          }
        }

        for (const r of registrosDia) {
          if (r.guiaId || r.manual) continue;

          // 🚫 se estiver fechado, não aloca
          if (r.allocationStatus === "CLOSED") continue;

          const elegiveis = guiasDisponiveis.filter((g) => {
            if (usadosNoDia.has(g.id)) return false;

            const passeiosAptos = Array.isArray(g.passeios) ? g.passeios : [];
            return passeiosAptos.some((p) => p.id === r.serviceId);
          });

          if (!elegiveis.length) continue;

          const menorCarga = Math.min(...elegiveis.map((g) => contadorSemana[g.id]));
          const candidatos = elegiveis.filter(
            (g) => contadorSemana[g.id] === menorCarga
          );

          const guiaSelecionado =
            candidatos[Math.floor(Math.random() * candidatos.length)];

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
      await gerarResumoGuiasSemana();
      setMostrarResumo(true);
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
          if (!data.guiaId) continue;

          await updateDoc(docSnap.ref, {
            guiaId: null,
            guiaNome: null,
            manual: false,
          });
        }
      }
      await carregarDados();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <LoadingBlock
        loading={loading}
        text="Processando escala..."
      />

      <h2>Planejamento Semanal de Passeios</h2>
      <div className="header-tours">
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
            Editar <ModeEdit fontSize="10" />
          </button>
          <button className="btn-list" onClick={alocarGuiasSemana}>
            Gerar escala de Guias <ManageAccounts fontSize="10" />
          </button>
          <button className="btn-list-cld" onClick={removerGuiasSemana}>
            Desfazer escala de Guias <Undo fontSize="10" />
          </button>
          {/* <button className="btn-list" onClick={enviarWhatsappGuiasSemana}>
          Enviar escala por WhatsApp
          </button> */}
          <button className="btn-list" onClick={enviarWhatsappGuiasSemana_FIRESTORE}>
            Enviar Bloqueios <Send fontSize="10" />
          </button>
        </div>
      </div>

      <div className="resumo-container">
        {resumoGuias.map((g, index) => (
          <div key={g.guiaId} className="resumo-card">

            <div className="resumo-header">
              <h4>
                {index === 0 && <span className="medalha">🏆</span>}
                {g.nome}
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

            {/* 📈 VARIAÇÃO */}
            {g.variacao !== 0 && (
              <div className={`variacao ${g.variacao > 0 ? "up" : "down"}`}>
                {g.variacao > 0 ? "▲" : "▼"} {Math.abs(g.variacao)}%
              </div>
            )}

            <p className="resumo-info">
              {g.totalServicos} serviços
            </p>

            {/* 📊 Mini gráfico semanal */}
            <div className="mini-chart">
              {semana.map((dia) => (
                <div
                  key={dia.date}
                  className={`mini-bar ${g.datas?.has(dia.date) ? "ativo" : ""
                    }`}
                />
              ))}
            </div>

            {g.injusto && (
              <span className="alerta-distribuicao">
                ⚖️ Distribuição desigual
              </span>
            )}
          </div>
        ))}
      </div>


      {semana.map((dia) => {
        const passeiosFixos = services.filter((s) =>
          (s.frequencia || []).includes(dia.day),
        );

        const registrosDia = extras[dia.date] || [];

        // 🔹 une fixos + manuais
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

        // 🔹 STATUS DO DIA
        const totalPasseios = passeiosDoDia.length;

        const passeiosComGuia = passeiosDoDia.filter((p) => {
          const registro = registrosDia.find(
            (r) =>
              (p.manual && r.id === p.id) ||
              (!p.manual && r.serviceId === p.serviceId),
          );

          return !!registro?.guiaId;
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
                {passeiosComGuia}/{totalPasseios}
              </span>
            </strong>

            {passeiosDoDia.map((p) => {
              const registro = registrosDia.find(
                (r) =>
                  (p.manual && r.id === p.id) ||
                  (!p.manual && r.serviceId === p.serviceId),
              );

              return (
                <div key={p.id} className="passeio-item">
                  {/* NOME */}
                  <span className="passeio-name">{p.nome}</span>

                  {modoVisualizacao ? (
                    <>
                      <span className="passeio-pax">
                        {registro?.passengers || 0} pax
                      </span>
                      {statusGrupo(registro?.passengers)}
                      <span className="guia-name-aloc">
                        {registro?.guiaNome || "-"}
                      </span>
                    </>
                  ) : (
                    <>
                      {/* PAX */}
                      <input
                        type="number"
                        min="0"
                        value={
                          registro
                            ? paxEditando[registro.id] ?? registro.passengers ?? ""
                            : ""
                        }
                        onChange={async (e) => {
                          const novoPax = e.target.value;

                          // 🔹 Se ainda não existe registro, cria primeiro
                          if (!registro) {
                            const docRef = await addDoc(collection(db, "weekly_services"), {
                              serviceId: p.serviceId || null,
                              serviceName: p.nome,
                              passengers: Number(novoPax),
                              guiaId: null,
                              guiaNome: null,
                              date: dia.date,
                              day: dia.day,
                              manual: false,
                              allocationStatus: "OPEN",
                              createdAt: new Date(),
                            });

                            await carregarDados();
                            return;
                          }

                          // 🔹 Se já existe, usa sua função normal
                          alterarPaxManual(registro.id, novoPax);
                        }}
                      />

                      {/* STATUS OPEN/CLOSED */}
                      <select
                        value={registro?.allocationStatus || "OPEN"}
                        onChange={(e) =>
                          alterarStatusAlocacao(registro.id, e.target.value)
                        }
                      >
                        <option value="OPEN">Aberto</option>
                        <option value="CLOSED">Fechado</option>
                      </select>

                      {/* GUIA */}
                      <select
                        value={registro?.guiaId || ""}
                        onChange={async (e) => {
                          const guia = guias.find((g) => g.id === e.target.value);

                          // 🔹 Se ainda não existe registro, cria primeiro
                          if (!registro) {
                            const docRef = await addDoc(collection(db, "weekly_services"), {
                              serviceId: p.serviceId || null,
                              serviceName: p.nome,
                              passengers: 0,
                              guiaId: guia?.id || null,
                              guiaNome: guia?.nome || null,
                              date: dia.date,
                              day: dia.day,
                              manual: false,
                              allocationStatus: "OPEN",
                              createdAt: new Date(),
                            });

                            await carregarDados();
                            return;
                          }

                          // 🔹 Se já existe, apenas atualiza
                          alterarGuiaManual(registro.id, guia || null, dia);
                        }}
                      >
                        <option value="">Sem guia</option>
                        {guias.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.nome}
                          </option>
                        ))}
                      </select>

                      {/* 🗑️ REMOVER (SÓ MANUAL) */}
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

            {/* ➕ ADICIONAR PASSEIO MANUAL */}
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
