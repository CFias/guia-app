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
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  GuiaAvatar,
  Icon,
  KpiTiles,
  PageHeader,
  SearchInput,
  Table,
  TableHead,
  TableRow,
} from "../ui";

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

  // marca todos os dias que o guia ainda não tem lançados (ou limpa)
  const selecionarTodosDias = () => {
    const lancados =
      disponibilidadeSemana.find((g) => g.guiaId === guiaSelecionado?.id)?.dias.map((d) => d.date) || [];
    const livres = diasSemana.filter((d) => !lancados.includes(d.date));
    setSelecionados(selecionados.length >= livres.length ? [] : livres);
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

  // resumo da semana: quantos guias por dia
  const guiasPorDia = Object.fromEntries(
    diasSemana.map((d) => [
      d.date,
      disponibilidadeSemana.filter((g) => g.dias.some((x) => x.date === d.date)).length,
    ]),
  );
  const totalDias = disponibilidadeSemana.reduce((s, g) => s + g.dias.length, 0);
  const ordenadosPorCobertura = [...diasSemana].sort((a, b) => guiasPorDia[b.date] - guiasPorDia[a.date]);
  const diaMais = ordenadosPorCobertura[0];
  const diaMenos = ordenadosPorCobertura[ordenadosPorCobertura.length - 1];
  const rotuloDia = (d) => (d ? `${DIA_ABREV[d.day]} ${d.date.slice(8, 10)}/${d.date.slice(5, 7)}` : "—");
  const hojeIso = (() => {
    const h = new Date();
    return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}-${String(h.getDate()).padStart(2, "0")}`;
  })();

  const linhasOrdenadas = [...disponibilidadeFiltrada].sort(
    (a, b) =>
      (a.nivelPrioridade || 2) - (b.nivelPrioridade || 2) ||
      String(a.nome).localeCompare(String(b.nome), "pt-BR", { sensitivity: "base" }),
  );

  const diaMarcado = (d) => selecionados.some((x) => x.date === d.date);
  const alternarDia = (d) => (diaMarcado(d) ? removerDia(d.date) : adicionarDia(d));

  return (
    <div className="ui-page disp">
      <PageHeader
        title="Disponibilidade da semana"
        description="Lance os dias disponíveis de cada guia e veja a cobertura da semana."
        actions={
          <div className="disp-semana" role="group" aria-label="Semana exibida">
            <Button
              iconOnly
              icon="chevronLeft"
              onClick={() => setSemanaOffset((o) => o - 1)}
              disabled={salvando}
              title="Semana anterior"
              aria-label="Semana anterior"
            />
            <span className="disp-semana__rotulo">
              <Icon name="calendar" size={15} />
              <b className="tabular">{formatarIntervaloSemana(diasSemana)}</b>
              {semanaOffset === 0 && <em>esta semana</em>}
              {semanaOffset === 1 && <em>próxima</em>}
            </span>
            <Button
              iconOnly
              icon="chevronRight"
              onClick={() => setSemanaOffset((o) => o + 1)}
              disabled={salvando}
              title="Próxima semana"
              aria-label="Próxima semana"
            />
            {semanaOffset !== 0 && (
              <Button variant="ghost" onClick={() => setSemanaOffset(0)} disabled={salvando}>
                Semana atual
              </Button>
            )}
          </div>
        }
      />

      <KpiTiles
        items={[
          { key: "guias", label: "Guias com disponibilidade", value: carregandoEstrutura ? "…" : disponibilidadeSemana.length, icon: "users" },
          { key: "dias", label: "Dias lançados", value: carregandoEstrutura ? "…" : totalDias, icon: "calendarCheck" },
          {
            key: "mais",
            label: `Mais coberto · ${rotuloDia(diaMais)}`,
            value: carregandoEstrutura ? "…" : `${diaMais ? guiasPorDia[diaMais.date] : 0} guia(s)`,
            icon: "trendingUp",
          },
          {
            key: "menos",
            label: `Menos coberto · ${rotuloDia(diaMenos)}`,
            value: carregandoEstrutura ? "…" : `${diaMenos ? guiasPorDia[diaMenos.date] : 0} guia(s)`,
            icon: "trendingDown",
          },
        ]}
      />

      <Card>
        <CardHeader
          icon="plus"
          title="Lançar disponibilidade"
          subtitle="Escolha o guia, marque os dias da semana exibida e salve. Os dias já lançados continuam."
        />
        {loadingInicial ? (
          <CardSkeleton variant="filters" />
        ) : (
          <div className="disp-lancar">
            <Field label="Guia" icon="user" className="disp-lancar__guia">
              <select
                value={guiaSelecionado ? guiaSelecionado.id : ""}
                onChange={(e) => selecionarGuia(guias.find((g) => g.id === e.target.value) || null)}
                disabled={bloqueado}
              >
                <option value="">Selecionar guia</option>
                {[...guias]
                  .filter((g) => g.ativo !== false)
                  .sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"))
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.nome} · P{g.nivelPrioridade || 2}
                    </option>
                  ))}
              </select>
            </Field>

            <div className="ui-field disp-lancar__dias">
              <span className="ui-field__label">
                <Icon name="calendar" size={13} />
                Dias disponíveis
                {guiaSelecionado && (
                  <button type="button" className="disp-link" onClick={selecionarTodosDias} disabled={bloqueado}>
                    {selecionados.length ? "Limpar" : "Marcar todos"}
                  </button>
                )}
              </span>
              <div className="disp-dias" role="group" aria-label="Dias disponíveis">
                {diasSemana.map((d) => {
                  const ativo = diaMarcado(d);
                  const jaTem = guiaSelecionado
                    ? disponibilidadeSemana
                      .find((g) => g.guiaId === guiaSelecionado.id)
                      ?.dias.some((x) => x.date === d.date)
                    : false;
                  return (
                    <button
                      key={d.date}
                      type="button"
                      className={`disp-dia ${ativo ? "is-on" : ""} ${jaTem ? "is-lancado" : ""} ${d.date === hojeIso ? "is-hoje" : ""}`}
                      onClick={() => alternarDia(d)}
                      disabled={!guiaSelecionado || bloqueado || jaTem}
                      aria-pressed={ativo}
                      title={jaTem ? "Já lançado para este guia" : d.label}
                    >
                      <small>{DIA_ABREV[d.day]}</small>
                      <b className="tabular">{d.date.slice(8, 10)}</b>
                      {jaTem && <Icon name="check" size={11} />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="disp-lancar__acao">
              <Button
                variant="primary"
                icon="save"
                onClick={salvarDisponibilidade}
                loading={salvando}
                disabled={salvando || !guiaSelecionado || !selecionados.length}
              >
                {salvando
                  ? "Salvando..."
                  : selecionados.length
                    ? `Salvar ${selecionados.length} dia(s)`
                    : "Salvar disponibilidade"}
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          icon="users"
          title="Guias disponíveis na semana"
          subtitle="Toque no dia do cabeçalho para filtrar; passe o mouse num dia lançado para remover."
          actions={
            <SearchInput
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar guia ou data"
              disabled={salvando}
            />
          }
        />

        {carregandoEstrutura ? (
          <CardSkeleton variant="table" />
        ) : (
          <Table columns="minmax(210px, 1.6fr) repeat(7, minmax(74px, 1fr))" minWidth={860} compact className="disp-tabela">
            <TableHead>
              <span>
                Guia <em className="disp-cont">{linhasOrdenadas.length}</em>
              </span>
              {diasSemana.map((d) => {
                const ativo = filtroDias.includes(d.date);
                return (
                  <button
                    key={d.date}
                    type="button"
                    className={`disp-col ${ativo ? "is-on" : ""} ${d.date === hojeIso ? "is-hoje" : ""}`}
                    onClick={() => !salvando && toggleFiltroDia(d.date)}
                    aria-pressed={ativo}
                    title={ativo ? "Tirar o filtro deste dia" : "Mostrar só quem está disponível neste dia"}
                  >
                    <b>{DIA_ABREV[d.day]}</b>
                    <small className="tabular">
                      {d.date.slice(8, 10)}/{d.date.slice(5, 7)} · {guiasPorDia[d.date]}
                    </small>
                  </button>
                );
              })}
            </TableHead>

            {linhasOrdenadas.length === 0 ? (
              <EmptyState icon="calendar" title="Nenhuma disponibilidade encontrada.">
                {busca || filtroDias.length ? "Tente limpar a busca ou os filtros de dia." : "Lance os dias acima."}
              </EmptyState>
            ) : (
              linhasOrdenadas.map((g) => (
                <TableRow key={g.guiaId}>
                  <span className="disp-guia">
                    <span className={`disp-prioridade p-${g.nivelPrioridade || 2}`} title={`Prioridade ${g.nivelPrioridade || 2}`}>
                      P{g.nivelPrioridade || 2}
                    </span>
                    <GuiaAvatar className="ui-cell-main" nome={g.nome} id={g.guiaId} tamanho={28} />
                    <small className="disp-guia__qtd tabular">{g.dias.length}/7</small>
                  </span>
                  {diasSemana.map((d) => {
                    const tem = g.dias.some((x) => x.date === d.date);
                    const removendo = removendoDia === `${g.guiaId}_${d.date}`;
                    return (
                      <span
                        key={d.date}
                        className={`disp-celula ${filtroDias.includes(d.date) ? "is-filtro" : ""}`}
                      >
                        {tem ? (
                          <span className={`disp-livre ${removendo ? "is-removendo" : ""}`}>
                            <Icon name="check" size={13} />
                            <span className="tabular">{d.date.slice(8, 10)}</span>
                            <button
                              type="button"
                              className="disp-remover"
                              onClick={() => removerDataSalva(g.guiaId, d.date)}
                              disabled={!!removendoDia || salvando}
                              title="Remover este dia"
                              aria-label={`Remover ${DIA_ABREV[d.day]} de ${g.nome}`}
                            >
                              <Icon name="x" size={11} />
                            </button>
                          </span>
                        ) : (
                          <span className="disp-vazio" aria-label="Sem disponibilidade">
                            —
                          </span>
                        )}
                      </span>
                    );
                  })}
                </TableRow>
              ))
            )}
          </Table>
        )}
      </Card>
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