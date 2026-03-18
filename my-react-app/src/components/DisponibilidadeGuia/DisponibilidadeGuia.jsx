import { useEffect, useState } from "react";
import {
  collection,
  getDoc,
  getDocs,
  Timestamp,
  doc,
  updateDoc,
  setDoc,
} from "firebase/firestore";
import { db } from "../../Services/Services/firebase";
import CardSkeleton from "../CardSkeleton/CardSkeleton";
import "./styles.css";
import {
  CalendarMonthRounded,
  FilterListRounded,
  ManageAccountsRounded,
  SaveRounded,
  SearchRounded,
  TodayRounded,
} from "@mui/icons-material";

/* ===== ABREVIAÇÃO DOS DIAS ===== */
const DIA_ABREV = {
  Segunda: "Seg",
  Terça: "Ter",
  Quarta: "Qua",
  Quinta: "Qui",
  Sexta: "Sex",
  Sábado: "Sáb",
  Domingo: "Dom",
};

const nomesDiasSemana = [
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
  "Domingo",
];

const DisponibilidadeGuia = () => {
  const [guias, setGuias] = useState([]);
  const [guiaSelecionado, setGuiaSelecionado] = useState(null);
  const [filtroDias, setFiltroDias] = useState([]);

  const [diasSemana, setDiasSemana] = useState([]);
  const [selecionados, setSelecionados] = useState([]);

  const [dropdownDiasOpen, setDropdownDiasOpen] = useState(false);

  const [loadingInicial, setLoadingInicial] = useState(true);
  const [loadingSemana, setLoadingSemana] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [removendoDia, setRemovendoDia] = useState("");

  const [semanaOffset, setSemanaOffset] = useState(0);

  const [disponibilidadeSemana, setDisponibilidadeSemana] = useState([]);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    const carregarGuias = async () => {
      try {
        setLoadingInicial(true);

        const snapshot = await getDocs(collection(db, "guides"));
        const lista = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setGuias(lista);
      } finally {
        setLoadingInicial(false);
      }
    };

    carregarGuias();
  }, []);

  const toggleFiltroDia = (date) => {
    setFiltroDias((prev) =>
      prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date],
    );
  };

  const selecionarTodosDias = () => {
    if (selecionados.length === diasSemana.length) {
      setSelecionados([]);
    } else {
      setSelecionados(diasSemana);
    }
  };

  useEffect(() => {
    setDiasSemana(getSemanaAtual(semanaOffset));
  }, [semanaOffset]);

  useEffect(() => {
    const carregarDisponibilidadeSemana = async () => {
      if (!guias.length) return;

      setLoadingSemana(true);

      try {
        const semana = getSemanaAtual(semanaOffset);
        const inicio = semana[0].date;
        const fim = semana[semana.length - 1].date;

        const mapaSemana = {};
        semana.forEach((d) => (mapaSemana[d.date] = d));

        const snap = await getDocs(collection(db, "guide_availability"));
        const mapaGuias = {};

        snap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          if (!data.guideId || !Array.isArray(data.disponibilidade)) return;

          const guia = guias.find((g) => g.id === data.guideId);
          if (!guia) return;

          data.disponibilidade.forEach((d) => {
            if (d.date >= inicio && d.date <= fim && mapaSemana[d.date]) {
              if (!mapaGuias[guia.id]) {
                mapaGuias[guia.id] = {
                  guiaId: guia.id,
                  nome: guia.nome,
                  nivelPrioridade: guia.nivelPrioridade || 2,
                  dias: [],
                };
              }

              if (!mapaGuias[guia.id].dias.some((x) => x.date === d.date)) {
                mapaGuias[guia.id].dias.push(mapaSemana[d.date]);
              }
            }
          });
        });

        setDisponibilidadeSemana(Object.values(mapaGuias));
      } finally {
        setLoadingSemana(false);
      }
    };

    carregarDisponibilidadeSemana();
  }, [guias, semanaOffset]);

  const disponibilidadeFiltrada = disponibilidadeSemana.filter((g) => {
    if (busca) {
      const termo = busca.toLowerCase();

      const nomeMatch = g.nome.toLowerCase().includes(termo);

      const diaMatch = g.dias.some(
        (d) =>
          DIA_ABREV[d.day].toLowerCase().includes(termo) ||
          d.day.toLowerCase().includes(termo) ||
          d.date.includes(termo) ||
          d.date.split("-").reverse().join("/").includes(termo),
      );

      if (!nomeMatch && !diaMatch) return false;
    }

    if (filtroDias.length) {
      return g.dias.some((d) => filtroDias.includes(d.date));
    }

    return true;
  });

  const removerDataSalva = async (guiaId, date) => {
    if (!window.confirm("Remover esta data?")) return;

    try {
      setRemovendoDia(`${guiaId}_${date}`);

      const ref = doc(db, "guide_availability", guiaId);
      const snap = await getDoc(ref);

      if (!snap.exists()) return;

      const dados = snap.data();
      if (!Array.isArray(dados.disponibilidade)) return;

      const novaDisponibilidade = dados.disponibilidade.filter(
        (d) => d.date !== date,
      );

      await updateDoc(ref, {
        disponibilidade: novaDisponibilidade,
        updatedAt: Timestamp.now(),
      });

      setDisponibilidadeSemana((prev) =>
        prev.map((g) =>
          g.guiaId === guiaId
            ? {
              ...g,
              dias: g.dias.filter((d) => d.date !== date),
            }
            : g,
        ),
      );
    } catch (err) {
      console.error("Erro ao remover data:", err);
      alert("Erro ao remover a data");
    } finally {
      setRemovendoDia("");
    }
  };

  const selecionarGuia = (guia) => {
    setGuiaSelecionado(guia);
    setSelecionados([]);
  };

  const adicionarDia = (dia) => {
    if (selecionados.find((d) => d.date === dia.date)) return;
    setSelecionados([...selecionados, dia]);
    setDropdownDiasOpen(false);
  };

  const removerDia = (date) => {
    setSelecionados(selecionados.filter((d) => d.date !== date));
  };

  const salvarDisponibilidade = async () => {
    if (!guiaSelecionado || !selecionados.length) return;

    setSalvando(true);
    try {
      const ref = doc(db, "guide_availability", guiaSelecionado.id);
      const snap = await getDoc(ref);

      let disponibilidadeAtual = [];

      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data.disponibilidade)) {
          disponibilidadeAtual = data.disponibilidade;
        }
      }

      const novasDatas = selecionados.filter(
        (d) => !disponibilidadeAtual.some((x) => x.date === d.date),
      );

      const disponibilidadeFinal = [
        ...disponibilidadeAtual,
        ...novasDatas.map((d) => ({
          day: d.day,
          date: d.date,
        })),
      ];

      await setDoc(
        ref,
        {
          guideId: guiaSelecionado.id,
          guideName: guiaSelecionado.nome,
          disponibilidade: disponibilidadeFinal,
          updatedAt: Timestamp.now(),
        },
        { merge: true },
      );

      setDisponibilidadeSemana((prev) => {
        const existe = prev.find((g) => g.guiaId === guiaSelecionado.id);

        if (existe) {
          return prev.map((g) =>
            g.guiaId === guiaSelecionado.id
              ? {
                ...g,
                dias: [
                  ...g.dias,
                  ...novasDatas.filter(
                    (d) => !g.dias.some((x) => x.date === d.date),
                  ),
                ],
              }
              : g,
          );
        }

        return [
          ...prev,
          {
            guiaId: guiaSelecionado.id,
            nome: guiaSelecionado.nome,
            nivelPrioridade: guiaSelecionado.nivelPrioridade || 2,
            dias: [...novasDatas],
          },
        ];
      });

      setSelecionados([]);
    } catch (err) {
      console.error("Erro ao salvar disponibilidade:", err);
      alert("Erro ao salvar disponibilidade");
    } finally {
      setSalvando(false);
    }
  };

  const formatarIntervaloSemana = (semana) => {
    if (!semana.length) return "";

    const inicio = semana[0].date.split("-").reverse().slice(0, 2).join("/");
    const fim = semana[semana.length - 1].date
      .split("-")
      .reverse()
      .slice(0, 2)
      .join("/");

    return `${inicio} – ${fim}`;
  };

  const carregandoEstrutura = loadingInicial || loadingSemana;
  const bloqueado = salvando || loadingSemana;

  return (
    <div className="disponibilidade-guia-page">
      <div className="disponibilidade-guia-header">
        <div>
          <h2 className="disponibilidade-guia-title">
            Disponibilidade da Semana <CalendarMonthRounded fontSize="small" />
          </h2>
          <p className="disponibilidade-guia-subtitle">
            Organize os dias disponíveis por guia e acompanhe a distribuição da
            semana de forma rápida e visual.
          </p>
        </div>
      </div>

      <div className="disponibilidade-guia-grid">
        <div className="disponibilidade-guia-card disponibilidade-guia-card-large">
          <div className="disponibilidade-guia-card-header">
            <div className="disponibilidade-guia-card-title-row">
              <h3>Lançar disponibilidade</h3>
              <span className="disponibilidade-guia-badge">Disponibilidade</span>
            </div>
            <p>
              Selecione o guia, marque os dias disponíveis e salve para a semana
              atual.
            </p>
          </div>

          {loadingInicial ? (
            <CardSkeleton variant="filters" />
          ) : (
            <div className="disponibilidade-guia-form">
              <div className="disponibilidade-guia-field">
                <label htmlFor="guia-select">
                  Guia <ManageAccountsRounded fontSize="small" />
                </label>
                <select
                  id="guia-select"
                  className="disponibilidade-guia-select"
                  value={guiaSelecionado ? guiaSelecionado.id : ""}
                  onChange={(e) => {
                    const guia = guias.find((g) => g.id === e.target.value);
                    selecionarGuia(guia);
                  }}
                  disabled={bloqueado}
                >
                  <option value="">Selecionar guia</option>
                  {guias.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.nome} • P{g.nivelPrioridade || 2}
                    </option>
                  ))}
                </select>
              </div>

              {guiaSelecionado && (
                <>
                  <div className="disponibilidade-guia-field">
                    <label>
                      Dias disponíveis <TodayRounded fontSize="small" />
                    </label>

                    <div className="disponibilidade-guia-days-actions">
                      <div className="disponibilidade-guia-dropdown">
                        <div
                          className="disponibilidade-guia-dropdown-header"
                          onClick={() =>
                            !bloqueado && setDropdownDiasOpen(!dropdownDiasOpen)
                          }
                        >
                          <span>Selecionar dias</span>
                          <span className="disponibilidade-guia-dropdown-arrow">
                            ▾
                          </span>
                        </div>

                        {dropdownDiasOpen && !bloqueado && (
                          <div className="disponibilidade-guia-dropdown-list">
                            {diasSemana.map((d) => (
                              <div
                                key={d.date}
                                className="disponibilidade-guia-dropdown-item"
                                onClick={() => adicionarDia(d)}
                              >
                                {d.label}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        className="disponibilidade-guia-btn-soft"
                        onClick={selecionarTodosDias}
                        disabled={bloqueado}
                      >
                        {selecionados.length === diasSemana.length
                          ? "Remover todos"
                          : "Selecionar todos"}
                      </button>
                    </div>
                  </div>

                  <div className="disponibilidade-guia-tags">
                    {selecionados.map((d) => (
                      <div
                        key={d.date}
                        className="disponibilidade-guia-tag disponibilidade-guia-tag-day"
                      >
                        {d.label}
                        <span onClick={() => !bloqueado && removerDia(d.date)}>
                          ×
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="disponibilidade-guia-actions">
                <button
                  className={`disponibilidade-guia-btn-primary ${salvando ? "is-saving" : ""}`}
                  onClick={salvarDisponibilidade}
                  disabled={salvando || !guiaSelecionado || !selecionados.length}
                >
                  <SaveRounded fontSize="small" />
                  {salvando ? "Salvando..." : "Salvar disponibilidade"}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="disponibilidade-guia-card">
          <div className="disponibilidade-guia-card-header">
            <div className="disponibilidade-guia-card-title-row">
              <h3>Semana exibida</h3>
              <span className="disponibilidade-guia-badge">Navegação</span>
            </div>
            <p>Navegue entre semanas e acompanhe o intervalo atual.</p>
          </div>

          {loadingInicial ? (
            <CardSkeleton variant="list" rows={3} />
          ) : (
            <div className="disponibilidade-guia-week-box">
              <div className="disponibilidade-guia-week-range">
                {formatarIntervaloSemana(diasSemana)}
              </div>

              <div className="disponibilidade-guia-week-actions">
                <button
                  type="button"
                  className="disponibilidade-guia-btn-soft"
                  onClick={() => setSemanaOffset((o) => o - 1)}
                  disabled={salvando}
                >
                  ◀ Semana anterior
                </button>

                <button
                  type="button"
                  className="disponibilidade-guia-btn-soft"
                  onClick={() => setSemanaOffset(0)}
                  disabled={salvando}
                >
                  Semana atual
                </button>

                <button
                  type="button"
                  className="disponibilidade-guia-btn-soft"
                  onClick={() => setSemanaOffset((o) => o + 1)}
                  disabled={salvando}
                >
                  Próxima semana ▶
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="disponibilidade-guia-card disponibilidade-guia-card-full">
          <div className="disponibilidade-guia-card-header">
            <div className="disponibilidade-guia-card-title-row">
              <h3>Guias disponíveis nesta semana</h3>
              <span className="disponibilidade-guia-badge">
                {carregandoEstrutura ? "..." : `${disponibilidadeFiltrada.length} guia(s)`}
              </span>
            </div>
            <p>
              Consulte a disponibilidade registrada, filtre por data e remova
              dias lançados quando necessário.
            </p>
          </div>

          {carregandoEstrutura ? (
            <CardSkeleton variant="table" />
          ) : (
            <>
              <div className="disponibilidade-guia-toolbar">
                <div className="disponibilidade-guia-search">
                  <SearchRounded fontSize="small" />
                  <input
                    className="disponibilidade-guia-search-input"
                    placeholder="Buscar por guia ou data"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    disabled={salvando}
                  />
                </div>
              </div>

              <div className="disponibilidade-guia-filter-block">
                <div className="disponibilidade-guia-filter-title">
                  <FilterListRounded fontSize="small" />
                  Filtrar por data
                </div>

                <div className="disponibilidade-guia-filter-days">
                  {diasSemana.map((d) => (
                    <div
                      key={d.date}
                      className={`disponibilidade-guia-filter-tag ${filtroDias.includes(d.date) ? "active" : ""
                        }`}
                      onClick={() => !salvando && toggleFiltroDia(d.date)}
                    >
                      {DIA_ABREV[d.day]}
                      <span>{d.date.split("-").reverse().join("/")}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="disponibilidade-guia-table-wrap">
                <div className="disponibilidade-guia-table">
                  <div className="disponibilidade-guia-row disponibilidade-guia-row-header">
                    <div className="disponibilidade-guia-col disponibilidade-guia-col-guide">
                      Guia
                    </div>
                    {diasSemana.map((d) => (
                      <div
                        key={d.date}
                        className="disponibilidade-guia-col disponibilidade-guia-col-day"
                      >
                        {DIA_ABREV[d.day]}
                      </div>
                    ))}
                  </div>

                  {disponibilidadeFiltrada.length === 0 ? (
                    <div className="disponibilidade-guia-empty">
                      Nenhuma disponibilidade encontrada para os filtros atuais.
                    </div>
                  ) : (
                    disponibilidadeFiltrada.map((g) => (
                      <div key={g.guiaId} className="disponibilidade-guia-row">
                        <div className="disponibilidade-guia-col disponibilidade-guia-col-guide">
                          <div className="disponibilidade-guia-guide-wrap">
                            <span
                              className={`disponibilidade-guia-priority p-${g.nivelPrioridade || 2}`}
                            >
                              P{g.nivelPrioridade || 2}
                            </span>
                            <span>{g.nome}</span>
                          </div>
                        </div>

                        {diasSemana.map((d) => {
                          const diaGuia = g.dias.find((x) => x.date === d.date);
                          const removendoAtual =
                            removendoDia === `${g.guiaId}_${d.date}`;

                          return (
                            <div
                              key={`${g.guiaId}-${d.date}`}
                              className="disponibilidade-guia-col disponibilidade-guia-col-day"
                            >
                              {diaGuia && (
                                <div
                                  className={`disponibilidade-guia-cell-day ${removendoAtual ? "is-removing" : ""
                                    }`}
                                >
                                  {`${d.date.split("-")[2]}/${d.date.split("-")[1]}`}
                                  <button
                                    type="button"
                                    className="disponibilidade-guia-remove-day"
                                    onClick={() =>
                                      removerDataSalva(g.guiaId, d.date)
                                    }
                                    disabled={!!removendoDia || salvando}
                                  >
                                    ×
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DisponibilidadeGuia;

/* ===== FUNÇÕES AUXILIARES ===== */
const getSemanaAtual = (offset = 0) => {
  const base = new Date();
  base.setHours(12, 0, 0, 0);
  base.setDate(base.getDate() + offset * 7);

  const day = base.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(base);
  monday.setDate(base.getDate() + diffToMonday);

  return nomesDiasSemana.map((dia, index) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + index);

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const dayNumber = String(d.getDate()).padStart(2, "0");

    return {
      day: dia,
      date: `${year}-${month}-${dayNumber}`,
      label: `${dia} • ${dayNumber}/${month}/${year}`,
    };
  });
};