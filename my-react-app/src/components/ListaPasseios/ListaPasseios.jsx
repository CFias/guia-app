import { useEffect, useMemo, useRef, useState } from "react";
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
import "./styles.css";

import {
  gerarSemana,
  agruparRegistrosPorServico,
  ehServicoDisp,
  getTextoStatusServico,
  getClasseStatusServico,
  formatarPeriodoSemana,
  aplicarPaxDaApiNosRegistros,
  normalizarTexto,
} from "../../Services/Services/plannerUtils";

import {
  carregarSemanaApiListaPasseios,
  sincronizarPasseiosDaApiNaSemana,
} from "../../Services/Services/plannerApi";

import {
  carregarBasePlanner,
  carregarWeeklyServicesDaSemana,
  carregarModoGeradoSemana,
  salvarModoGeradoSemana,
  limparModoGeradoSemana,
  alterarStatusAlocacao as alterarStatusAlocacaoRepo,
  salvarPaxManual,
  salvarGuiaManual,
  adicionarPasseioManual as adicionarPasseioManualRepo,
  removerPasseio as removerPasseioRepo,
  aplicarPlanoDeAlocacao,
  removerGuiasSemana as removerGuiasSemanaRepo,
  limparGuiasDeServicosFechados,
} from "../../Services/Services/plannerRepository";

import {
  construirMapaAfinidade,
  construirMapaDisponibilidade,
  gerarPlanoAlocacaoSemana,
} from "../../Services/Services/plannerAllocation";

import {
  gerarResumoGuiasSemana,
  gerarMensagemGuia,
} from "../../Services/Services/plannerSummary";

import { abrirEscalaEmNovaAba } from "../../Services/Services/plannerExport";

const ListaPasseiosSemana = () => {
  const [semanaOffset, setSemanaOffset] = useState(0);
  const [semana, setSemana] = useState([]);
  const [services, setServices] = useState([]);
  const [extras, setExtras] = useState({});
  const [guias, setGuias] = useState([]);
  const [disponibilidades, setDisponibilidades] = useState([]);
  const [apiSemanaListaPasseios, setApiSemanaListaPasseios] = useState([]);
  const [resumoGuias, setResumoGuias] = useState([]);
  const [modoVisualizacao, setModoVisualizacao] = useState(true);
  const [modoGeradoSemana, setModoGeradoSemana] = useState(null);
  const [guiasDisponiveisSemServico, setGuiasDisponiveisSemServico] = useState([]);
  const [modoDistribuicaoGuias, setModoDistribuicaoGuias] =
    useState("equilibrado");
  const [usarAfinidadeGuiaPasseio, setUsarAfinidadeGuiaPasseio] =
    useState(false);

  const [novoServico, setNovoServico] = useState({});
  const [paxEditando, setPaxEditando] = useState({});

  const [loadingInicial, setLoadingInicial] = useState(true);
  const [loadingSemana, setLoadingSemana] = useState(false);
  const [processandoAcao, setProcessandoAcao] = useState(false);

  const primeiraCargaRef = useRef(true);
  const paxTimers = useRef({});

  const carregandoEstrutura = loadingInicial || loadingSemana;

  const semanaMap = useMemo(() => {
    const mapa = {};
    semana.forEach((d) => {
      mapa[d.date] = d;
    });
    return mapa;
  }, [semana]);

  const registrosPorDia = useMemo(() => {
    const mapa = {};

    semana.forEach((dia) => {
      const base = aplicarPaxDaApiNosRegistros(
        extras[dia.date] || [],
        apiSemanaListaPasseios,
      );

      mapa[dia.date] = agruparRegistrosPorServico(base);
    });

    return mapa;
  }, [semana, extras, apiSemanaListaPasseios]);

  useEffect(() => {
    const carregar = async () => {
      const initial = primeiraCargaRef.current;
      await carregarDados({ initial });
      primeiraCargaRef.current = false;
    };

    carregar();
  }, [semanaOffset]);

  useEffect(() => {
    const resumo = gerarResumoGuiasSemana({
      semana,
      guias,
      disponibilidades,
      extras: registrosPorDia,
    });

    setResumoGuias(resumo.resumoComServico || []);
    setGuiasDisponiveisSemServico(resumo.guiasDisponiveisSemServico || []);
  }, [semana, guias, disponibilidades, registrosPorDia]);

  useEffect(() => {
    return () => {
      Object.values(paxTimers.current).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const carregarDados = async ({ initial = false } = {}) => {
    try {
      if (initial) setLoadingInicial(true);
      else setLoadingSemana(true);

      const semanaAtual = gerarSemana(semanaOffset);
      setSemana(semanaAtual);

      const [base, modoGerado, apiAgrupada] = await Promise.all([
        carregarBasePlanner(),
        carregarModoGeradoSemana(semanaAtual),
        carregarSemanaApiListaPasseios(semanaAtual),
      ]);

      setServices(base.services);
      setGuias(base.guias);
      setDisponibilidades(base.disponibilidades);
      setModoDistribuicaoGuias(base.modoDistribuicaoGuias);
      setUsarAfinidadeGuiaPasseio(base.usarAfinidadeGuiaPasseio);
      setModoGeradoSemana(modoGerado);
      setApiSemanaListaPasseios(apiAgrupada);

      await sincronizarPasseiosDaApiNaSemana(semanaAtual, base.services, normalizarTexto);

      const weeklyServices = await carregarWeeklyServicesDaSemana(semanaAtual);
      setExtras(weeklyServices);
    } catch (err) {
      console.error("Erro ao carregar planner:", err);
    } finally {
      if (initial) setLoadingInicial(false);
      else setLoadingSemana(false);
    }
  };

  const atualizarSomentePlanilha = async () => {
    if (!semana.length) return;

    try {
      setLoadingSemana(true);

      await sincronizarPasseiosDaApiNaSemana(semana, services, normalizarTexto);

      const [apiAgrupada, weeklyServices] = await Promise.all([
        carregarSemanaApiListaPasseios(semana),
        carregarWeeklyServicesDaSemana(semana),
      ]);

      setApiSemanaListaPasseios(apiAgrupada);
      setExtras(weeklyServices);
    } catch (err) {
      console.error("Erro ao atualizar planilha:", err);
    } finally {
      setLoadingSemana(false);
    }
  };

  const alterarStatusAlocacao = async (registroId, status) => {
    try {
      await alterarStatusAlocacaoRepo(registroId, status);

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
        await salvarPaxManual(registroId, pax);

        setExtras((prev) => {
          const novo = { ...prev };
          Object.keys(novo).forEach((date) => {
            novo[date] = novo[date].map((r) =>
              r.id === registroId ? { ...r, passengers: Number(pax || 0) } : r,
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

    try {
      setProcessandoAcao(true);

      await salvarGuiaManual({
        registroId,
        guia,
        dia,
      });

      setExtras((prev) => {
        const novo = { ...prev };
        novo[dia.date] = (novo[dia.date] || []).map((item) =>
          item.id === registroId
            ? {
              ...item,
              guiaId: guia?.id || null,
              guiaNome: guia?.nome || null,
            }
            : item,
        );
        return novo;
      });
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

    try {
      setProcessandoAcao(true);

      await adicionarPasseioManualRepo({
        dia,
        dados,
      });

      setNovoServico((prev) => ({
        ...prev,
        [dia.date]: {},
      }));

      await carregarDados();
    } catch (err) {
      console.error("Erro ao adicionar passeio manual:", err);
    } finally {
      setProcessandoAcao(false);
    }
  };

  const removerPasseio = async (id) => {
    try {
      setProcessandoAcao(true);
      await removerPasseioRepo(id);
      await carregarDados();
    } catch (err) {
      console.error("Erro ao remover passeio:", err);
    } finally {
      setProcessandoAcao(false);
    }
  };

  const alocarGuiasSemana = async () => {
    try {
      setProcessandoAcao(true);

      if (!guias.length || !semana.length) return;

      const base = await carregarBasePlanner();
      const registrosSemanaMap = await carregarWeeklyServicesDaSemana(semana);
      const registrosSemana = Object.values(registrosSemanaMap).flat();

      const mapaAfinidade = construirMapaAfinidade(base.afinidades);
      const mapaDisponibilidade = construirMapaDisponibilidade(
        base.disponibilidades,
      );

      const { atualizacoes } = gerarPlanoAlocacaoSemana({
        semana,
        guias: base.guias.filter((g) => g.ativo),
        registrosSemana,
        mapaAfinidade,
        mapaDisponibilidade,
        servicesData: base.services,
        modoDistribuicaoGuias: base.modoDistribuicaoGuias,
        usarAfinidadeGuiaPasseio: base.usarAfinidadeGuiaPasseio,
        agruparRegistrosPorServico,
        normalizarTexto: base.normalizarTexto,
      });

      await aplicarPlanoDeAlocacao(atualizacoes);
      await salvarModoGeradoSemana(semana, base.modoDistribuicaoGuias);
      await carregarDados();
    } catch (err) {
      console.error("Erro ao alocar guias da semana:", err);
    } finally {
      setProcessandoAcao(false);
    }
  };

  const desfazerGuiasSemana = async () => {
    try {
      setProcessandoAcao(true);
      await removerGuiasSemanaRepo(semana);
      await limparModoGeradoSemana(semana);
      await carregarDados();
    } catch (err) {
      console.error("Erro ao remover guias da semana:", err);
    } finally {
      setProcessandoAcao(false);
    }
  };

  const enviarWhatsappGuiasSemana_FIRESTORE = async () => {
    if (!semana.length || !guias.length) return;

    await limparGuiasDeServicosFechados(semana);

    const inicioSemana = semana[0].date;
    const fimSemana = semana[semana.length - 1].date;

    const registrosSemana = Object.values(await carregarWeeklyServicesDaSemana(semana))
      .flat()
      .filter((r) => r.date >= inicioSemana && r.date <= fimSemana);

    const mapaGuias = {};

    registrosSemana.forEach((r) => {
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
  };

  const enviarWhatsappGuiaIndividual = (guiaResumo) => {
    const guia = guias.find((g) => g.id === guiaResumo.guiaId);
    if (!guia?.whatsapp) {
      alert("Guia sem WhatsApp cadastrado");
      return;
    }

    const texto = gerarMensagemGuia(guiaResumo, semana);

    window.open(
      `https://wa.me/55${guia.whatsapp.replace(
        /\D/g,
        "",
      )}?text=${encodeURIComponent(texto)}`,
      "_blank",
    );
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
            onClick={desfazerGuiasSemana}
            disabled={processandoAcao || carregandoEstrutura}
          >
            Desfazer escala de Guias <Undo fontSize="10" />
          </button>

          <button
            className="btn-list"
            onClick={() =>
              abrirEscalaEmNovaAba({
                semana,
                extras,
                agruparRegistrosPorServico,
                getTextoStatusServico,
                getClasseStatusServico,
              })
            }
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
              disabled={processandoAcao}
            >
              Atualizar dados (Phoenix) <RefreshRounded fontSize="10" />
            </button>

            <span className="counter-info">{formatarPeriodoSemana(semana)}</span>

            <p className="counter-info">
              Modo de distribuição:{" "}
              <strong>
                {modoDistribuicaoGuias === "seguir_nivel_selecionado"
                  ? "Prioridade"
                  : "Equilibrado"}
              </strong>
            </p>

            <p className="counter-info">
              Afinidade:{" "}
              <strong>{usarAfinidadeGuiaPasseio ? "Ativada" : "Desativada"}</strong>
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
                        <span className={`priority-pill p-${g.nivelPrioridade || 2}`}>
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
                    className={`resumo-percent ${g.ocupacao >= 80
                      ? "alta"
                      : g.ocupacao >= 50
                        ? "media"
                        : "baixa"
                      }`}
                  >
                    {g.ocupacao}%
                  </span>
                </div>

                <div className="resumo-bar">
                  <div
                    className={`resumo-bar-fill ${g.ocupacao >= 80
                      ? "alta"
                      : g.ocupacao >= 50
                        ? "media"
                        : "baixa"
                      }`}
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
                      <pre>{gerarMensagemGuia(g, semana)}</pre>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="resumo-modo-global">
            Guias que deram disponibilidade e ficaram sem serviço:{" "}
            <strong>{guiasDisponiveisSemServico.length}</strong>
          </div>
          {guiasDisponiveisSemServico.length > 0 && (

            <div className="resumo-container resumo-container-sem-servico">
              {guiasDisponiveisSemServico.map((guia) => (
                <div key={guia.guiaId} className="resumo-card resumo-card-sem-servico">
                  <div className="resumo-header">
                    <h4 className="resumo-nome">
                      <span className="resumo-nome-main">
                        {modoDistribuicaoGuias === "seguir_nivel_selecionado" && (
                          <span className={`priority-pill p-${guia.nivelPrioridade || 2}`}>
                            P{guia.nivelPrioridade || 2}
                          </span>
                        )}
                        {guia.nome}
                      </span>
                    </h4>

                    <span className="resumo-percent baixa">0%</span>
                  </div>

                  <div className="resumo-bar">
                    <div
                      className="resumo-bar-fill baixa"
                      style={{ width: "0%" }}
                    />
                  </div>

                  <p className="resumo-info">
                    Disponível em <strong>{guia.diasDisponiveis}</strong> dia(s) e ficou sem serviço
                  </p>

                  <div className="mini-chart">
                    {semana.map((dia) => {
                      const bloqueado = guia.bloqueios?.includes(dia.date);
                      const trabalhou = guia.datas?.has(dia.date);
                      const estavaDisponivel = guia.datasDisponiveis?.has(dia.date);

                      let classe = "neutro";
                      let label = `${dia.day}`;

                      if (bloqueado) {
                        classe = "bloqueado";
                        label += " • BLOQUEADO";
                      } else if (trabalhou) {
                        classe = "ativo";
                        label += " • UTILIZADO";
                      } else if (estavaDisponivel) {
                        classe = "disponivel-nao-usado";
                        label += " • DISPONÍVEL NÃO UTILIZADO";
                      } else {
                        classe = "neutro";
                        label += " • SEM DISPONIBILIDADE INFORMADA";
                      }

                      return (
                        <div
                          key={dia.date}
                          className={`mini-bar ${classe}`}
                          title={label}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          {semana.map((dia) => {
            const registrosOrdenados = registrosPorDia[dia.date] || [];

            const totalPasseios = registrosOrdenados.length;
            const passeiosComGuia = registrosOrdenados.filter(
              (r) => !!r.guiaId && r.allocationStatus !== "CLOSED",
            ).length;

            const statusDia =
              passeiosComGuia === 0
                ? "vazio"
                : passeiosComGuia < totalPasseios
                  ? "parcial"
                  : "completo";

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

                            await alterarGuiaManual(
                              item.id,
                              guia || null,
                              dia,
                              item,
                            );
                          }}
                        >
                          <option value="">Sem guia</option>

                          {guias.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.nome}
                            </option>
                          ))}
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