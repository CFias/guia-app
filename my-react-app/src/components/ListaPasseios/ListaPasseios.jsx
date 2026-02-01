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

  const criarServicoManual = async (dia) => {
    const dados = novoServico[dia.date];

    if (!dados?.serviceName || !dados?.passengers) return;

    try {
      await addDoc(collection(db, "extras"), {
        date: dia.date,
        serviceName: dados.serviceName,
        passengers: Number(dados.passengers),
        guiaId: dados.guiaId || null,
        guiaNome: guias.find((g) => g.id === dados.guiaId)?.nome || "",
        createdAt: new Date(),
      });

      // limpa os campos depois de salvar
      setNovoServico((prev) => ({
        ...prev,
        [dia.date]: {},
      }));
    } catch (err) {
      console.error("Erro ao criar serviço:", err);
    }
  };

  useEffect(() => {
    document.body.style.overflow = loading ? "hidden" : "auto";
  }, [loading]);

  const alternarVisibilidade = async (registroId, oculto) => {
    if (!registroId) return;

    await updateDoc(doc(db, "weekly_services", registroId), {
      hidden: !oculto,
    });

    setExtras((prev) => {
      const novo = { ...prev };
      Object.keys(novo).forEach((date) => {
        novo[date] = novo[date].map((r) =>
          r.id === registroId ? { ...r, hidden: !oculto } : r,
        );
      });
      return novo;
    });
  };

  const salvarOuCriarWeeklyService = async (registroId, payload) => {
    setLoading(true);
    try {
      if (registroId) {
        try {
          await updateDoc(doc(db, "weekly_services", registroId), payload);
          return;
        } catch (err) {}
      }

      await addDoc(collection(db, "weekly_services"), {
        ...payload,
        createdAt: new Date(),
      });
    } finally {
      setLoading(false);
    }
  };

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

      // ✅ agora sim, depois de existir
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

  useEffect(() => {
    const q = query(collection(db, "extras"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dados = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      setExtras(dados);
    });

    return () => unsubscribe();
  }, []);

  const statusGrupo = (pax) => {
    if (pax === null || pax === undefined) return null;

    return pax >= 8 ? (
      <span className="status ok">Grupo Formado</span>
    ) : (
      <span className="status alerta">Formar Grupo</span>
    );
  };

  const enviarWhatsappGuiasSemana_FIRESTORE = async () => {
    if (!semana.length) return;

    const inicioSemana = semana[0].date;
    const fimSemana = semana[semana.length - 1].date;

    const mapaSemana = {};
    semana.forEach((d) => (mapaSemana[d.date] = d));

    const q = query(
      collection(db, "weekly_services"),
      where("date", ">=", inicioSemana),
      where("date", "<=", fimSemana),
    );

    const snap = await getDocs(q);

    const mapaGuias = {};

    snap.docs.forEach((docSnap) => {
      const r = docSnap.data();

      if (!r.guiaId || !r.guiaNome || !r.date) return;
      if (!mapaSemana[r.date]) return;

      const guia = guias.find((g) => g.id === r.guiaId);
      if (!guia?.whatsapp) return;

      if (!mapaGuias[r.guiaId]) {
        mapaGuias[r.guiaId] = {
          nome: guia.nome,
          whatsapp: guia.whatsapp,
          datas: new Set(),
        };
      }

      const dia = mapaSemana[r.date];

      mapaGuias[r.guiaId].datas.add(
        `• ${dia.day} (${dia.date.split("-").reverse().join("/")})`,
      );
    });

    Object.values(mapaGuias).forEach((guia) => {
      if (!guia.datas.size) return;

      const texto = `
Olá, ${guia.nome}! 👋

Segue sua escala da semana:

${Array.from(guia.datas).join("\n")}

Qualquer ajuste, por favor nos avise.
Operacional - Luck Receptivo 🙌
`.trim();

      window.open(
        `https://wa.me/55${guia.whatsapp.replace(
          /\D/g,
          "",
        )}?text=${encodeURIComponent(texto)}`,
        "_blank",
      );
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
          manual: true,
        },
        { merge: true },
      );

      await carregarDados();
    } finally {
      setLoading(false);
    }
  };

  /* ===== PAX MANUAL ===== */
  const alterarPaxManual = (registroId, pax) => {
    if (!registroId) return;

    // 1️⃣ atualiza local (UI imediata)
    setPaxEditando((prev) => ({
      ...prev,
      [registroId]: pax,
    }));

    // 2️⃣ limpa debounce anterior
    if (paxTimers.current[registroId]) {
      clearTimeout(paxTimers.current[registroId]);
    }

    // 3️⃣ salva no Firestore após parar de digitar
    paxTimers.current[registroId] = setTimeout(async () => {
      try {
        await setDoc(
          doc(db, "weekly_services", registroId),
          {
            passengers: Number(pax),
          },
          { merge: true },
        );

        // sincroniza extras sem reload geral
        setExtras((prev) => {
          const novo = { ...prev };
          Object.keys(novo).forEach((date) => {
            novo[date] = novo[date].map((r) =>
              r.id === registroId ? { ...r, passengers: Number(pax) } : r,
            );
          });
          return novo;
        });
      } catch (err) {
        console.error("Erro ao salvar pax:", err);
      }
    }, 500); // 👈 ajuste aqui (300–700ms)
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
    const inicioSemana = semana[0].date;
    const fimSemana = semana[semana.length - 1].date;

    // 🔹 1. Buscar serviços alocados na semana
    const qServicos = query(
      collection(db, "weekly_services"),
      where("date", ">=", inicioSemana),
      where("date", "<=", fimSemana),
    );
    const snapServicos = await getDocs(qServicos);

    // 🔹 2. Buscar disponibilidades
    const snapDisp = await getDocs(collection(db, "guide_availability"));

    const disponibilidadePorGuia = {};
    snapDisp.docs.forEach((doc) => {
      const d = doc.data();
      if (!Array.isArray(d.disponibilidade)) return;

      const diasSemana = d.disponibilidade.filter(
        (ds) => ds.date >= inicioSemana && ds.date <= fimSemana,
      );

      disponibilidadePorGuia[d.guideId] = diasSemana.length;
    });

    // 🔹 3. Contar serviços por guia
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
          diasDisponiveis: disponibilidadePorGuia[r.guiaId] || 0,
          ocupacao: 0,
        };
      }

      contador[r.guiaId].totalServicos++;
    });

    // 🔹 4. Calcular porcentagem
    Object.values(contador).forEach((g) => {
      if (g.diasDisponiveis > 0) {
        g.ocupacao = Math.round((g.totalServicos / g.diasDisponiveis) * 100);
      }
    });

    setResumoGuias(Object.values(contador));
  };

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

          const elegiveis = guiasDisponiveis.filter(
            (g) => !usadosNoDia.has(g.id),
          );

          if (!elegiveis.length) break;

          const menorCarga = Math.min(
            ...elegiveis.map((g) => contadorSemana[g.id]),
          );

          const candidatos = elegiveis.filter(
            (g) => contadorSemana[g.id] === menorCarga,
          );

          const guiaSelecionado =
            candidatos[Math.floor(Math.random() * candidatos.length)];

          await setDoc(
            doc(db, "weekly_services", r.id),
            {
              guiaId: guiaSelecionado.id,
              guiaNome: guiaSelecionado.nome,
            },
            { merge: true },
          );

          usadosNoDia.add(guiaSelecionado.id);
          contadorSemana[guiaSelecionado.id]++;
        }
      }

      await carregarDados();
      await gerarResumoGuiasSemana();
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
      {loading && (
        <div className="loading-overlay">
          <div className="spinner"></div>
          <span>Carregando...</span>
        </div>
      )}

      <h2>Planejamento Semanal de Passeios</h2>

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
          Visualizar
        </button>
        <button className="btn-list" onClick={() => setModoVisualizacao(false)}>
          Editar
        </button>
        <button className="btn-list" onClick={alocarGuiasSemana}>
          Alocar guias da semana
        </button>
        <button className="btn-list-cld" onClick={removerGuiasSemana}>
          Remover guias
        </button>
        {/* <button className="btn-list" onClick={enviarWhatsappGuiasSemana}>
          Enviar escala por WhatsApp
        </button> */}
        <button
          className="btn-list"
          onClick={() => enviarWhatsappGuiasSemana_FIRESTORE()}
        >
          Enviar WhatsApp
        </button>
      </div>
      {resumoGuias.length > 0 && (
        <div className="resumo-guias">
          <h3>Resumo da Alocação</h3>

          <ul>
            {resumoGuias
              .sort((a, b) => b.ocupacao - a.ocupacao)
              .map((g) => (
                <li key={g.guiaId}>
                  <strong>{g.nome}</strong> — {g.totalServicos} serviço(s)
                  <span
                    style={{
                      marginLeft: 8,
                      color:
                        g.ocupacao >= 90
                          ? "red"
                          : g.ocupacao >= 70
                            ? "#e65100"
                            : "#2e7d32",
                    }}
                  >
                    ({g.ocupacao}%)
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}

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

        return (
          <div key={dia.date} className="day-card">
            <strong className="day-list">{dia.label}</strong>

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
                        value={registro?.passengers ?? ""}
                        onChange={(e) =>
                          alterarPaxManual(registro.id, e.target.value)
                        }
                      />

                      {/* GUIA */}
                      <select
                        value={registro?.guiaId || ""}
                        onChange={(e) => {
                          const guia = guias.find(
                            (g) => g.id === e.target.value,
                          );
                          alterarGuiaManual(registro.id, guia || null);
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
