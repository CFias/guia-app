import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import CardSkeleton from "../../components/CardSkeleton/CardSkeleton";
import "./escala.css";
import {
  Button,
  Card,
  CardHeader,
  Drawer,
  EmptyState,
  FilterBar,
  Icon,
  KpiTiles,
  PageHeader,
  Segmented,
  StatusDot,
  Table,
  TableHead,
  TableRow,
} from "../ui";

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
  carregarHistoricoServicosReaisPorNomeGuia,
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
  servicoDispensaGuiaPorPax,
} from "../../Services/Services/plannerAllocation";

import {
  avaliarMatchIdioma,
  listarIdiomasExigidos,
  rotuloDoIdioma,
  siglaDoIdioma,
  siglasDoGuia,
} from "../../Services/Utils/idiomas";

import {
  gerarResumoGuiasSemana,
  gerarMensagemGuia,
} from "../../Services/Services/plannerSummary";

import { abrirEscalaEmNovaAba } from "../../Services/Services/plannerExport";
import { salvarEscalaNoDrive } from "../../Services/Services/googleDrive";

const ETAPAS_ROBO_ESCALA = [
  "Verificando a disponibilidade dos guias",
  "Verificando a afinidade dos guias",
  "Alocando guias",
  "Verificando equilíbrio de escala",
  "Finalizando escala",
];

// filtro "Semana" da faixa de dias (mostra todos os dias, como antes)
const TODOS_OS_DIAS = "__semana__";

const formatarDataCurta = (iso) =>
  String(iso || "").split("-").reverse().slice(0, 2).join("/");

const textoMotivoNaoAlocado = (n, paxMinimo) => {
  switch (n.motivo) {
    case "pax_baixo":
      return `${n.passengers} pax (a regra pede pelo menos ${paxMinimo})`;
    case "sem_guia_disponivel":
      return "nenhum guia disponível nesse dia";
    case "sem_guia_apto":
      return "nenhum guia disponível é apto a esse passeio";
    case "sem_match_idioma":
      return "nenhum guia disponível fala o idioma do grupo";
    case "todos_ocupados":
      return "todos os guias aptos já estão em outro serviço no dia";
    default:
      return "sem guia";
  }
};

const ListaPasseiosSemana = () => {
  const navigate = useNavigate();
  // estado só de interface (abas, dia aberto, drawer de regras)
  const [abaEscala, setAbaEscala] = useState("dia");
  const [diaSelecionado, setDiaSelecionado] = useState(null);
  const [drawerRegras, setDrawerRegras] = useState(false);
  const [semanaOffset, setSemanaOffset] = useState(0);
  const [semana, setSemana] = useState([]);
  const [services, setServices] = useState([]);
  const [extras, setExtras] = useState({});
  const [guias, setGuias] = useState([]);
  const [disponibilidades, setDisponibilidades] = useState([]);
  const [afinidades, setAfinidades] = useState([]);
  const [apiSemanaListaPasseios, setApiSemanaListaPasseios] = useState([]);
  const [modoVisualizacao, setModoVisualizacao] = useState(true);
  const [modoGeradoSemana, setModoGeradoSemana] = useState(null);
  const [modoDistribuicaoGuias, setModoDistribuicaoGuias] =
    useState("equilibrado");
  const [usarAfinidadeGuiaPasseio, setUsarAfinidadeGuiaPasseio] =
    useState(false);
  const [modoIdioma, setModoIdioma] = useState("preferencial");
  const [paxMinimoParaGuia, setPaxMinimoParaGuia] = useState(2);
  // Resultado da última geração automática: o que ficou sem guia e por quê,
  // e serviços que ficaram com guia que não fala o idioma do grupo.
  const [relatorioEscala, setRelatorioEscala] = useState(null);
  const [enviandoDrive, setEnviandoDrive] = useState(false);
  const [driveFolderId, setDriveFolderId] = useState("");
  const [driveClientId, setDriveClientId] = useState("");

  const [novoServico, setNovoServico] = useState({});
  const [paxEditando, setPaxEditando] = useState({});

  const [loadingInicial, setLoadingInicial] = useState(true);
  const [loadingSemana, setLoadingSemana] = useState(false);
  const [processandoAcao, setProcessandoAcao] = useState(false);

  const [gerandoEscala, setGerandoEscala] = useState(false);
  const [etapaRoboAtual, setEtapaRoboAtual] = useState("");
  const [indiceEtapaRobo, setIndiceEtapaRobo] = useState(0);
  const [animacaoPontos, setAnimacaoPontos] = useState("");

  const primeiraCargaRef = useRef(true);
  const paxTimers = useRef({});
  const roboDotsIntervalRef = useRef(null);
  // Guarda qual semana foi pedida por último, para descartar respostas
  // atrasadas da sincronização em segundo plano caso o usuário já tenha
  // trocado de semana antes dela terminar.
  const ultimaSemanaSolicitadaRef = useRef(null);

  const carregandoEstrutura = loadingInicial || loadingSemana;

  const modoPrioridadeAtivo =
    modoDistribuicaoGuias === "prioridade" ||
    modoDistribuicaoGuias === "seguir_nivel_selecionado";

  const modoGeradoPrioridade =
    modoGeradoSemana === "prioridade" ||
    modoGeradoSemana === "seguir_nivel_selecionado";

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

  // Resumo dos guias é um valor derivado — recalcula sozinho quando os
  // dados mudam, sem precisar de um estado + efeito extra (menos um
  // ciclo de render a cada atualização).
  const { resumoGuias, guiasDisponiveisSemServico } = useMemo(() => {
    const resumo = gerarResumoGuiasSemana({
      semana,
      guias,
      disponibilidades,
      extras: registrosPorDia,
    });

    return {
      resumoGuias: resumo.resumoComServico || [],
      guiasDisponiveisSemServico: resumo.guiasDisponiveisSemServico || [],
    };
  }, [semana, guias, disponibilidades, registrosPorDia]);

  useEffect(() => {
    const carregar = async () => {
      const initial = primeiraCargaRef.current;
      await carregarDados({ initial });
      primeiraCargaRef.current = false;
    };

    carregar();
  }, [semanaOffset]);

  useEffect(() => {
    return () => {
      Object.values(paxTimers.current).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    if (!gerandoEscala) {
      setAnimacaoPontos("");
      if (roboDotsIntervalRef.current) {
        clearInterval(roboDotsIntervalRef.current);
        roboDotsIntervalRef.current = null;
      }
      return;
    }

    roboDotsIntervalRef.current = setInterval(() => {
      setAnimacaoPontos((prev) => {
        if (prev === "...") return "";
        return `${prev}.`;
      });
    }, 420);

    return () => {
      if (roboDotsIntervalRef.current) {
        clearInterval(roboDotsIntervalRef.current);
        roboDotsIntervalRef.current = null;
      }
    };
  }, [gerandoEscala]);

  const iniciarRoboEscala = () => {
    setGerandoEscala(true);
    setIndiceEtapaRobo(0);
    setEtapaRoboAtual(ETAPAS_ROBO_ESCALA[0]);
  };

  const avancarEtapaRobo = (indice) => {
    const idx = Math.max(0, Math.min(indice, ETAPAS_ROBO_ESCALA.length - 1));
    setIndiceEtapaRobo(idx);
    setEtapaRoboAtual(ETAPAS_ROBO_ESCALA[idx]);
  };

  const finalizarRoboEscala = () => {
    setGerandoEscala(false);
    setIndiceEtapaRobo(0);
    setEtapaRoboAtual("");
    setAnimacaoPontos("");
  };

  // Recarrega só os registros da semana (extras), sem repetir a
  // sincronização com o Phoenix nem os dados base. Usado depois de
  // ações pontuais (adicionar/remover passeio, gerar/desfazer escala)
  // que não precisam refazer o carregamento inteiro.
  const recarregarExtras = async (semanaAlvo = semana) => {
    if (!semanaAlvo.length) return;

    try {
      const weeklyServices = await carregarWeeklyServicesDaSemana(semanaAlvo);
      setExtras(weeklyServices);
    } catch (err) {
      console.error("Erro ao recarregar serviços da semana:", err);
    }
  };

  const carregarDados = async ({ initial = false } = {}) => {
    try {
      if (initial) setLoadingInicial(true);
      else setLoadingSemana(true);

      setRelatorioEscala(null); // relatório é da semana que foi gerada

      const semanaAtual = gerarSemana(semanaOffset);
      const chaveSemana = semanaAtual.map((d) => d.date).join("|");
      ultimaSemanaSolicitadaRef.current = chaveSemana;

      setSemana(semanaAtual);

      // Base, modo gerado, lista da API e os registros já salvos da
      // semana são buscados em paralelo — a tela é liberada assim que
      // isso chegar, sem esperar a sincronização com o Phoenix.
      const [base, modoGerado, apiAgrupada, weeklyServices] = await Promise.all(
        [
          carregarBasePlanner(),
          carregarModoGeradoSemana(semanaAtual),
          carregarSemanaApiListaPasseios(semanaAtual),
          carregarWeeklyServicesDaSemana(semanaAtual),
        ],
      );

      setServices(base.services);
      setGuias(base.guias);
      setDisponibilidades(base.disponibilidades);
      setAfinidades(base.afinidades || []);
      setModoDistribuicaoGuias(base.modoDistribuicaoGuias);
      setUsarAfinidadeGuiaPasseio(base.usarAfinidadeGuiaPasseio);
      setModoIdioma(base.modoIdioma);
      setPaxMinimoParaGuia(base.paxMinimoParaGuia);
      setDriveFolderId(base.driveFolderId || "");
      setDriveClientId(base.driveClientId || "");
      setModoGeradoSemana(modoGerado);
      setApiSemanaListaPasseios(apiAgrupada);
      setExtras(weeklyServices);

      if (initial) setLoadingInicial(false);
      else setLoadingSemana(false);

      // Sincronização com o Phoenix roda em segundo plano: não trava a
      // tela, e só atualiza a lista de novo se o usuário ainda estiver
      // na mesma semana quando ela terminar.
      sincronizarPasseiosDaApiNaSemana(
        semanaAtual,
        base.services,
        normalizarTexto,
      )
        .then(() => carregarWeeklyServicesDaSemana(semanaAtual))
        .then((atualizado) => {
          if (ultimaSemanaSolicitadaRef.current === chaveSemana) {
            setExtras(atualizado);
          }
        })
        .catch((err) => {
          console.error("Erro ao sincronizar passeios da API:", err);
        });
    } catch (err) {
      console.error("Erro ao carregar planner:", err);
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

      await recarregarExtras();
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
      await recarregarExtras();
    } catch (err) {
      console.error("Erro ao remover passeio:", err);
    } finally {
      setProcessandoAcao(false);
    }
  };

  const alocarGuiasSemana = async () => {
    try {
      setProcessandoAcao(true);
      iniciarRoboEscala();

      if (!guias.length || !semana.length) return;

      avancarEtapaRobo(0);
      // Base (guias, serviços, disponibilidade, afinidade e configuração)
      // já está carregada em memória — só busca fresco o que realmente
      // muda com frequência: os registros da semana e o histórico real
      // das duas semanas anteriores (equilíbrio de médio prazo), direto
      // da API do sistema.
      const semanaAnterior1 = gerarSemana(semanaOffset - 1);
      const semanaAnterior2 = gerarSemana(semanaOffset - 2);
      const datasHistorico = [...semanaAnterior1, ...semanaAnterior2].map(
        (d) => d.date,
      );

      const [registrosSemanaMap, historicoPorGuia] = await Promise.all([
        carregarWeeklyServicesDaSemana(semana),
        carregarHistoricoServicosReaisPorNomeGuia(datasHistorico),
      ]);
      const registrosSemana = Object.values(registrosSemanaMap).flat();

      avancarEtapaRobo(1);
      const mapaAfinidade = construirMapaAfinidade(afinidades);
      const mapaDisponibilidade =
        construirMapaDisponibilidade(disponibilidades);

      avancarEtapaRobo(2);
      const { atualizacoes, naoAlocados, avisosIdioma } = gerarPlanoAlocacaoSemana({
        semana,
        guias: guias.filter((g) => g.ativo),
        registrosSemana,
        mapaAfinidade,
        mapaDisponibilidade,
        servicesData: services,
        modoDistribuicaoGuias,
        usarAfinidadeGuiaPasseio,
        agruparRegistrosPorServico,
        normalizarTexto,
        historicoPorGuia,
        numeroSemanasHistorico: 2,
        modoIdioma,
        paxMinimoParaGuia,
      });

      avancarEtapaRobo(3);
      await aplicarPlanoDeAlocacao(atualizacoes);

      setRelatorioEscala({
        alocados: atualizacoes.length,
        naoAlocados,
        avisosIdioma,
        paxMinimoParaGuia,
      });

      avancarEtapaRobo(4);
      await salvarModoGeradoSemana(semana, modoDistribuicaoGuias);
      setModoGeradoSemana(modoDistribuicaoGuias);
      await recarregarExtras();
    } catch (err) {
      console.error("Erro ao alocar guias da semana:", err);
    } finally {
      finalizarRoboEscala();
      setProcessandoAcao(false);
    }
  };

  const desfazerGuiasSemana = async () => {
    try {
      setProcessandoAcao(true);
      await removerGuiasSemanaRepo(semana);
      await limparModoGeradoSemana(semana);
      setModoGeradoSemana(null);
      setRelatorioEscala(null);
      await recarregarExtras();
    } catch (err) {
      console.error("Erro ao remover guias da semana:", err);
    } finally {
      setProcessandoAcao(false);
    }
  };

  const salvarNoDrive = async () => {
    try {
      setEnviandoDrive(true);

      const arquivo = await salvarEscalaNoDrive({
        semana,
        extras,
        agruparRegistrosPorServico,
        getTextoStatusServico,
        pastaId: driveFolderId,
        clientId: driveClientId,
      });

      if (arquivo?.webViewLink) {
        window.open(arquivo.webViewLink, "_blank");
      }
    } catch (err) {
      console.error("Erro ao salvar escala no Drive:", err);

      if (err.message === "SEM_CLIENT_ID") {
        alert(
          "O acesso ao Google Drive ainda não foi configurado. " +
            "Cole o Client ID em Configurações → Escala → Google Drive.",
        );
      } else if (err.message === "PERMISSAO_NEGADA") {
        // a pessoa cancelou o popup de permissão do Google — não precisa de alerta
      } else {
        alert(err.message || "Não foi possível salvar a escala no Drive. Tente de novo.");
      }
    } finally {
      setEnviandoDrive(false);
    }
  };

  const enviarWhatsappGuiasSemana_FIRESTORE = async () => {
    if (!semana.length || !guias.length) return;

    await limparGuiasDeServicosFechados(semana);

    const inicioSemana = semana[0].date;
    const fimSemana = semana[semana.length - 1].date;

    const registrosSemana = Object.values(
      await carregarWeeklyServicesDaSemana(semana),
    )
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
        <StatusDot tone="muted" icon="shield">
          Passeio fechado
        </StatusDot>
      );
    }

    if (ehServicoDisp(item?.serviceName || "")) {
      return <StatusDot tone="neutral">Privativo</StatusDot>;
    }

    return Number(item?.passengers || 0) >= 8 ? (
      <StatusDot tone="accent" icon="users">
        Grupo formado
      </StatusDot>
    ) : (
      <StatusDot tone="warning" icon="alert">
        Formar grupo
      </StatusDot>
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

  /* ---------- números para os KPIs e a faixa de dias (só contagem) ---------- */
  const travado = processandoAcao || carregandoEstrutura || gerandoEscala;
  const travadoSemana = processandoAcao || gerandoEscala;

  const infoDia = (date) => {
    const lista = registrosPorDia[date] || [];
    const abertos = lista.filter((r) => r.allocationStatus !== "CLOSED");
    return {
      total: lista.length,
      comGuia: abertos.filter((r) => !!r.guiaId).length,
      semGuia: abertos.filter((r) => !r.guiaId).length,
      fechados: lista.length - abertos.length,
    };
  };

  const totaisSemana = semana.reduce(
    (acc, dia) => {
      const i = infoDia(dia.date);
      acc.total += i.total;
      acc.comGuia += i.comGuia;
      acc.semGuia += i.semGuia;
      acc.fechados += i.fechados;
      return acc;
    },
    { total: 0, comGuia: 0, semGuia: 0, fechados: 0 },
  );

  const hojeIso = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  const diaAtivo =
    diaSelecionado === TODOS_OS_DIAS ||
    semana.some((d) => d.date === diaSelecionado)
      ? diaSelecionado
      : semana.some((d) => d.date === hojeIso)
        ? hojeIso
        : TODOS_OS_DIAS;

  const diasVisiveis =
    diaAtivo === TODOS_OS_DIAS ? semana : semana.filter((d) => d.date === diaAtivo);

  const rotuloModo = modoPrioridadeAtivo ? "Prioridade" : "Equilibrado";
  const rotuloIdioma =
    {
      preferencial: "Preferencial",
      obrigatorio: "Obrigatório",
      desligado: "Desligado",
    }[modoIdioma] || "Preferencial";
  const rotuloPax =
    Number(paxMinimoParaGuia) > 1 ? `${paxMinimoParaGuia} pax` : "qualquer pax";

  const statusTexto = gerandoEscala
    ? `Robô em execução: ${etapaRoboAtual}${animacaoPontos}`
    : processandoAcao
      ? "Processando alterações..."
      : loadingSemana
        ? "Atualizando semana..."
        : "";

  const abrirPlanilha = () =>
    abrirEscalaEmNovaAba({
      semana,
      extras,
      agruparRegistrosPorServico,
      getTextoStatusServico,
      getClasseStatusServico,
    });

  const classeMiniDia = (g, date) => {
    if (g.bloqueios?.includes(date)) return "is-bloqueado";
    if (g.datas?.has(date)) return "is-servico";
    if (g.datasDisponiveis?.has(date)) return "is-disponivel";
    return "";
  };

  const tituloMiniDia = (g, dia) => {
    if (g.bloqueios?.includes(dia.date)) return `${dia.day} • BLOQUEADO`;
    if (g.datas?.has(dia.date)) return `${dia.day} • UTILIZADO`;
    if (g.datasDisponiveis?.has(dia.date)) return `${dia.day} • DISPONÍVEL NÃO UTILIZADO`;
    return `${dia.day} • SEM SERVIÇO`;
  };

  const renderItemDia = (dia, item) => (
    <TableRow
      key={`${dia.date}-${item.externalServiceId || item.id}-${item.serviceName}`}
      className={item.allocationStatus === "CLOSED" ? "escala-fechado" : ""}
    >
      <span>
        <span className="escala-passeio">
          <span className="ui-cell-main">{item.serviceName}</span>
          {listarIdiomasExigidos(item.idiomas).map((id) => (
            <span
              key={id}
              className="ui-chip escala-idioma"
              title={`Passageiros em ${rotuloDoIdioma(id)} (${item.idiomas[id]} pax)`}
            >
              {siglaDoIdioma(id)}
            </span>
          ))}
        </span>
        {!item.guiaId && servicoDispensaGuiaPorPax(item, paxMinimoParaGuia) && (
          <span
            className="ui-cell-sub"
            title={`Menos de ${paxMinimoParaGuia} pax: a escala automática não aloca guia`}
          >
            {item.passengers} pax · sem guia pela regra de pax mínimo
          </span>
        )}
        {diaAtivo === TODOS_OS_DIAS && <span className="ui-cell-sub">{dia.day}</span>}
      </span>

      {modoVisualizacao ? (
        <>
          <span>
            {item.guiaNome ? (
              <span className="ui-cell-main">{item.guiaNome}</span>
            ) : item.allocationStatus === "CLOSED" ? (
              <span className="ui-cell-sub">—</span>
            ) : (
              <StatusDot tone="alert" icon="alert">
                Sem guia
              </StatusDot>
            )}
          </span>
          <span>
            <span className="ui-cell-main tabular">{item.passengers || 0} pax</span>
            <span className="ui-cell-sub tabular">
              {item.adultCount || 0} ADT / {item.childCount || 0} CHD / {item.infantCount || 0} INF
            </span>
          </span>
          {statusGrupo(item)}
          <span />
        </>
      ) : (
        <>
          <span className="ui-field">
            <select
              value={item.guiaId || ""}
              disabled={processandoAcao || gerandoEscala}
              aria-label="Guia"
              onChange={async (e) => {
                const guia = guias.find((g) => g.id === e.target.value);

                await alterarGuiaManual(item.id, guia || null, dia, item);
              }}
            >
              <option value="">Sem guia</option>

              {guias.map((g) => {
                const exigidos = listarIdiomasExigidos(item.idiomas);
                const falaIdioma =
                  exigidos.length > 0 && avaliarMatchIdioma(g, exigidos).cobrePrincipal;
                const siglas = siglasDoGuia(g);

                return (
                  <option key={g.id} value={g.id}>
                    {falaIdioma ? "✔ " : ""}
                    {g.nome}
                    {siglas.length ? ` (${siglas.join("/")})` : ""}
                  </option>
                );
              })}
            </select>
          </span>
          <span className="ui-field">
            <input
              type="number"
              min="0"
              aria-label="Pax"
              value={paxEditando[item.id] ?? item.passengers ?? 0}
              onChange={(e) => alterarPaxManual(item.id, e.target.value)}
              disabled={processandoAcao || gerandoEscala}
            />
          </span>
          <span className="ui-field">
            <select
              value={item.allocationStatus || "OPEN"}
              aria-label="Status do passeio"
              onChange={(e) => alterarStatusAlocacao(item.id, e.target.value)}
              disabled={processandoAcao || gerandoEscala}
            >
              <option value="OPEN">Aberto</option>
              <option value="CLOSED">Fechado</option>
            </select>
          </span>
          <span className="ui-cell-end">
            {item.manual && (
              <Button
                variant="danger"
                size="sm"
                iconOnly
                icon="trash"
                title="Remover passeio manual"
                aria-label="Remover passeio manual"
                onClick={() => removerPasseio(item.id)}
                disabled={processandoAcao || gerandoEscala}
              />
            )}
          </span>
        </>
      )}
    </TableRow>
  );

  return (
    <div className="page-container escala ui-page">
      <PageHeader
        title="Gerar Escala"
        description={`Planejamento semanal de passeios e guias · ${formatarPeriodoSemana(semana)}`}
        more={[
          { label: "Abrir planilha", icon: "external", onClick: abrirPlanilha, disabled: travado },
          {
            label: enviandoDrive ? "Enviando..." : "Salvar no Drive",
            icon: "cloudUpload",
            onClick: salvarNoDrive,
            disabled: travado || enviandoDrive,
            hint: driveFolderId ? "pasta configurada" : "seu Drive",
          },
          {
            label: "Atualizar dados (Phoenix)",
            icon: "refresh",
            onClick: atualizarSomentePlanilha,
            disabled: travadoSemana,
          },
        ]}
        actions={
          <>
            <Button icon="undo" onClick={desfazerGuiasSemana} disabled={travado}>
              Desfazer escala
            </Button>
            {modoVisualizacao ? (
              <Button icon="pencil" onClick={() => setModoVisualizacao(false)} disabled={travado}>
                Editar escala
              </Button>
            ) : (
              <Button icon="eye" onClick={() => setModoVisualizacao(true)} disabled={travado}>
                Visualizar
              </Button>
            )}
            <Button
              icon="sparkles"
              onClick={alocarGuiasSemana}
              disabled={travado}
              loading={gerandoEscala}
            >
              {modoGeradoSemana ? "Gerar novamente" : "Gerar escala de guias"}
            </Button>
            <Button
              variant="primary"
              icon="message"
              onClick={enviarWhatsappGuiasSemana_FIRESTORE}
              disabled={travado}
            >
              Enviar todos os bloqueios
            </Button>
          </>
        }
      />

      {/* ---- semana + regras ---- */}
      <FilterBar className="escala-toolbar">
        <div className="escala-semana" role="group" aria-label="Semana">
          <Button
            iconOnly
            icon="chevronLeft"
            title="Semana anterior"
            aria-label="Semana anterior"
            onClick={() => setSemanaOffset((o) => o - 1)}
            disabled={travadoSemana}
          />
          <span className="escala-semana__label tabular">{formatarPeriodoSemana(semana)}</span>
          <Button
            iconOnly
            icon="chevronRight"
            title="Semana seguinte"
            aria-label="Semana seguinte"
            onClick={() => setSemanaOffset((o) => o + 1)}
            disabled={travadoSemana}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSemanaOffset(0)}
            disabled={travadoSemana || semanaOffset === 0}
          >
            Semana atual
          </Button>
        </div>

        <button
          type="button"
          className="escala-regras"
          onClick={() => setDrawerRegras(true)}
          title="Ver as regras da escala automática"
        >
          <Icon name="sliders" size={14} />
          <span>
            Modo <strong>{rotuloModo}</strong> · Afinidade{" "}
            <strong>{usarAfinidadeGuiaPasseio ? "ativada" : "desativada"}</strong> · Idioma{" "}
            <strong>{rotuloIdioma}</strong> · Guia a partir de <strong>{rotuloPax}</strong>
          </span>
          <Icon name="chevronRight" size={14} />
        </button>
      </FilterBar>

      <div className={`escala-status ${modoGeradoSemana ? "" : "is-pendente"}`}>
        <Icon name={modoGeradoSemana ? "circleCheck" : "info"} size={15} />
        <span>
          {modoGeradoSemana
            ? modoGeradoPrioridade
              ? "Essa escala foi gerada com a regra: Prioridade"
              : "Essa escala foi gerada com a regra: Equilibrada"
            : "Escala ainda não gerada para esta semana"}
        </span>
        {statusTexto && (
          <span className="escala-status__acao">
            <Icon name="loader" size={14} className="ui-spin" /> {statusTexto}
          </span>
        )}
      </div>

      {/* ---- robô ---- */}
      {gerandoEscala && (
        <Card className="escala-robo">
          <div className="escala-robo__topo">
            <span className="escala-robo__orb" aria-hidden="true">
              <Icon name="sparkles" size={20} />
            </span>
            <div>
              <span className="escala-robo__kicker">Robô de alocação ativo</span>
              <h3 className="escala-robo__titulo">
                {etapaRoboAtual}
                {animacaoPontos}
              </h3>
              <p className="escala-robo__texto">
                O sistema está analisando disponibilidade, afinidade, distribuição e equilíbrio
                da escala para montar a melhor alocação possível da semana.
              </p>
            </div>
          </div>
          <ol className="escala-robo__etapas">
            {ETAPAS_ROBO_ESCALA.map((etapa, index) => {
              const concluida = index < indiceEtapaRobo;
              const ativa = index === indiceEtapaRobo;
              return (
                <li
                  key={etapa}
                  className={`${concluida ? "is-feita" : ""} ${ativa ? "is-ativa" : ""}`}
                >
                  <span className="escala-robo__bullet">
                    {concluida ? <Icon name="check" size={12} /> : index + 1}
                  </span>
                  {etapa}
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      {/* ---- resultado da geração automática ---- */}
      {relatorioEscala && !carregandoEstrutura && (
        <Card>
          <CardHeader
            icon="clipboardCheck"
            title="Resultado da geração automática"
            subtitle={`${relatorioEscala.alocados} serviço(s) receberam guia.${
              relatorioEscala.naoAlocados.length === 0 &&
              relatorioEscala.avisosIdioma.length === 0
                ? " Nenhuma pendência."
                : ""
            }`}
            actions={
              <Button size="sm" variant="ghost" onClick={() => setRelatorioEscala(null)}>
                Fechar
              </Button>
            }
          />
          <div className="escala-relatorio">
            {relatorioEscala.avisosIdioma.length > 0 && (
              <div>
                <h4 className="escala-relatorio__titulo is-aviso">Guia sem o idioma do grupo</h4>
                <ul>
                  {relatorioEscala.avisosIdioma.map((v) => (
                    <li key={v.registroId}>
                      {formatarDataCurta(v.date)} · <b>{v.serviceName}</b> → {v.guiaNome} — pede{" "}
                      {v.idiomas.map(siglaDoIdioma).join("/")}, falta{" "}
                      {v.faltantes.map(siglaDoIdioma).join("/")}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {relatorioEscala.naoAlocados.length > 0 && (
              <div>
                <h4 className="escala-relatorio__titulo is-alerta">Ficaram sem guia</h4>
                <ul>
                  {relatorioEscala.naoAlocados.map((n) => (
                    <li key={`${n.registroId}-${n.motivo}`}>
                      {formatarDataCurta(n.date)} · <b>{n.serviceName}</b>
                      {n.idiomas?.length > 0 && ` (${n.idiomas.map(siglaDoIdioma).join("/")})`} —{" "}
                      {textoMotivoNaoAlocado(n, relatorioEscala.paxMinimoParaGuia)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
      )}

      {carregandoEstrutura ? (
        <>
          {renderResumoSkeleton()}
          {renderDiasSkeleton()}
        </>
      ) : (
        <>
          <KpiTiles
            items={[
              { key: "total", label: "Passeios na semana", value: totaisSemana.total },
              { key: "comGuia", label: "Com guia", value: totaisSemana.comGuia },
              {
                key: "semGuia",
                label: "Sem guia",
                value: totaisSemana.semGuia,
                tone: totaisSemana.semGuia ? "alert" : undefined,
              },
              { key: "fechados", label: "Fechados", value: totaisSemana.fechados },
              { key: "guias", label: "Guias escalados", value: resumoGuias.length },
              {
                key: "livres",
                label: "Disponíveis sem serviço",
                value: guiasDisponiveisSemServico.length,
              },
            ]}
          />

          {totaisSemana.total === 0 && (
            <Card>
              <EmptyState
                icon="sparkles"
                title="Nenhum passeio nesta semana"
                action={
                  <Button icon="refresh" onClick={atualizarSomentePlanilha} disabled={travadoSemana}>
                    Atualizar dados (Phoenix)
                  </Button>
                }
              >
                Os passeios vêm do Phoenix. Atualize para buscar de novo.
              </EmptyState>
            </Card>
          )}

          <Segmented
            ariaLabel="Visão da escala"
            value={abaEscala}
            onChange={setAbaEscala}
            options={[
              { value: "dia", label: "Por dia", icon: "calendar" },
              { value: "guia", label: "Por guia", icon: "users", count: resumoGuias.length },
            ]}
          />

          {/* ===== POR DIA ===== */}
          {abaEscala === "dia" && (
            <>
              <div className="escala-dias" role="tablist" aria-label="Dia">
                <button
                  type="button"
                  role="tab"
                  aria-selected={diaAtivo === TODOS_OS_DIAS}
                  className={`escala-dia ${diaAtivo === TODOS_OS_DIAS ? "is-active" : ""}`}
                  onClick={() => setDiaSelecionado(TODOS_OS_DIAS)}
                >
                  <span className="escala-dia__nome">Semana</span>
                  <span className="escala-dia__meta tabular">
                    {totaisSemana.comGuia}/{totaisSemana.total} com guia
                  </span>
                </button>
                {semana.map((dia) => {
                  const i = infoDia(dia.date);
                  const ativo = diaAtivo === dia.date;
                  return (
                    <button
                      key={dia.date}
                      type="button"
                      role="tab"
                      aria-selected={ativo}
                      className={`escala-dia ${ativo ? "is-active" : ""}`}
                      onClick={() => setDiaSelecionado(dia.date)}
                    >
                      <span className="escala-dia__nome">
                        {dia.day}
                        <span className="escala-dia__data tabular">{formatarDataCurta(dia.date)}</span>
                      </span>
                      <span className="escala-dia__meta tabular">
                        {i.comGuia}/{i.total - i.fechados} com guia
                        {i.semGuia > 0 && (
                          <span className="escala-dia__alerta" title={`${i.semGuia} sem guia`} />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>

              {diasVisiveis.map((dia) => {
                const registrosOrdenados = registrosPorDia[dia.date] || [];
                const i = infoDia(dia.date);

                return (
                  <Card key={dia.date} className="escala-dia-card">
                    <CardHeader
                      icon="calendar"
                      title={dia.label}
                      subtitle={`Passeios com guia: ${i.comGuia} · Total de passeios: ${i.total}${
                        i.fechados ? ` · Fechados: ${i.fechados}` : ""
                      }`}
                    />

                    {registrosOrdenados.length === 0 && modoVisualizacao ? (
                      <EmptyState icon="compass" title="Nenhum passeio neste dia." />
                    ) : (
                      <Table
                        columns={
                          modoVisualizacao
                            ? "minmax(220px,2fr) minmax(150px,1.2fr) minmax(130px,1fr) minmax(140px,1fr) 8px"
                            : "minmax(220px,2fr) minmax(170px,1.3fr) 90px 120px 48px"
                        }
                        minWidth={760}
                      >
                        <TableHead>
                          <span>Passeio</span>
                          <span>Guia</span>
                          <span>Pax</span>
                          <span>{modoVisualizacao ? "Grupo" : "Status"}</span>
                          <span />
                        </TableHead>

                        {registrosOrdenados.map((item) => renderItemDia(dia, item))}

                        {!modoVisualizacao && (
                          <TableRow className="escala-add">
                            <span className="ui-field">
                              <input
                                type="text"
                                placeholder="Nome do serviço"
                                aria-label="Nome do serviço"
                                value={novoServico[dia.date]?.nome || ""}
                                disabled={processandoAcao || gerandoEscala}
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
                            </span>
                            <span className="ui-field">
                              <select
                                value={novoServico[dia.date]?.guiaId || ""}
                                aria-label="Guia"
                                disabled={processandoAcao || gerandoEscala}
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
                            </span>
                            <span className="ui-field">
                              <input
                                type="number"
                                min="0"
                                placeholder="Pax"
                                aria-label="Pax"
                                value={novoServico[dia.date]?.pax || ""}
                                disabled={processandoAcao || gerandoEscala}
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
                            </span>
                            <span className="ui-cell-sub">Passeio manual</span>
                            <span className="ui-cell-end">
                              <Button
                                variant="primary"
                                size="sm"
                                iconOnly
                                icon="plus"
                                title="Adicionar passeio"
                                aria-label="Adicionar passeio"
                                onClick={() => adicionarPasseioManual(dia)}
                                disabled={processandoAcao || gerandoEscala}
                              />
                            </span>
                          </TableRow>
                        )}
                      </Table>
                    )}
                  </Card>
                );
              })}
            </>
          )}

          {/* ===== POR GUIA ===== */}
          {abaEscala === "guia" && (
            <>
              {resumoGuias.length === 0 ? (
                <Card>
                  <EmptyState icon="users" title="Nenhum guia com serviço nesta semana." />
                </Card>
              ) : (
                <div className="escala-guias">
                  {resumoGuias.map((g, index) => (
                    <Card key={g.guiaId} className="escala-guia">
                      <div className="escala-guia__topo">
                        <span className="escala-guia__nome">
                          {modoPrioridadeAtivo && (
                            <span className="ui-chip" title="Nível de prioridade">
                              P{g.nivelPrioridade || 2}
                            </span>
                          )}
                          {index === 0 && (
                            <Icon name="star" size={14} className="escala-guia__top" title="Maior ocupação" />
                          )}
                          {g.nome}
                          {g.sobrecarga && (
                            <span className="escala-dia__alerta" title="Sobrecarga (90% ou mais)" />
                          )}
                        </span>
                        <span
                          className={`escala-guia__pct tabular ${g.ocupacao >= 80 ? "is-alta" : ""}`}
                        >
                          {g.ocupacao}%
                        </span>
                      </div>

                      <div className="escala-guia__barra" aria-hidden="true">
                        <span style={{ width: `${Math.min(g.ocupacao, 100)}%` }} />
                      </div>

                      <div className="escala-guia__rodape">
                        <span className="ui-cell-sub">
                          {g.totalServicos} serviço(s) · {g.diasDisponiveis} dia(s) disponível(is)
                        </span>
                        <div className="escala-guia__dias">
                          {semana.map((dia) => (
                            <span
                              key={dia.date}
                              className={`escala-mini ${classeMiniDia(g, dia.date)}`}
                              title={tituloMiniDia(g, dia)}
                            >
                              {dia.day.slice(0, 1)}
                            </span>
                          ))}
                        </div>
                        <span className="escala-tooltip-wrap">
                          <Button
                            size="sm"
                            icon="send"
                            onClick={() => enviarWhatsappGuiaIndividual(g)}
                            disabled={processandoAcao || gerandoEscala}
                          >
                            Enviar
                          </Button>
                          <span className="escala-tooltip" role="tooltip">
                            <pre>{gerarMensagemGuia(g, semana)}</pre>
                          </span>
                        </span>
                      </div>
                    </Card>
                  ))}
                </div>
              )}

              <h3 className="escala-subtitulo">
                Guias que deram disponibilidade e ficaram sem serviço:{" "}
                <strong>{guiasDisponiveisSemServico.length}</strong>
              </h3>

              {guiasDisponiveisSemServico.length > 0 && (
                <div className="escala-guias">
                  {guiasDisponiveisSemServico.map((guia) => (
                    <Card key={guia.guiaId} className="escala-guia is-livre">
                      <div className="escala-guia__topo">
                        <span className="escala-guia__nome">
                          {modoPrioridadeAtivo && (
                            <span className="ui-chip">P{guia.nivelPrioridade || 2}</span>
                          )}
                          {guia.nome}
                        </span>
                        <span className="escala-guia__pct tabular">0%</span>
                      </div>
                      <div className="escala-guia__rodape">
                        <span className="ui-cell-sub">
                          Disponível em <strong>{guia.diasDisponiveis}</strong> dia(s) e ficou sem
                          serviço
                        </span>
                        <div className="escala-guia__dias">
                          {semana.map((dia) => (
                            <span
                              key={dia.date}
                              className={`escala-mini ${classeMiniDia(guia, dia.date)}`}
                              title={tituloMiniDia(guia, dia)}
                            >
                              {dia.day.slice(0, 1)}
                            </span>
                          ))}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ---- regras da escala (somente leitura; editadas em Configurações) ---- */}
      <Drawer
        open={drawerRegras}
        onClose={() => setDrawerRegras(false)}
        title="Regras da escala automática"
        subtitle="São as regras usadas pelo robô ao gerar a escala."
        footer={
          <>
            <Button onClick={() => setDrawerRegras(false)}>Fechar</Button>
            <Button variant="primary" icon="settings" onClick={() => navigate("/configuracoes")}>
              Alterar em Configurações
            </Button>
          </>
        }
      >
        <dl className="escala-regras-lista">
          <div>
            <dt>Modo de distribuição</dt>
            <dd>{rotuloModo}</dd>
          </div>
          <div>
            <dt>Afinidade guia × passeio</dt>
            <dd>{usarAfinidadeGuiaPasseio ? "Ativada" : "Desativada"}</dd>
          </div>
          <div>
            <dt>Idioma dos passageiros</dt>
            <dd>{rotuloIdioma}</dd>
          </div>
          <div>
            <dt>Guia a partir de</dt>
            <dd>{rotuloPax}</dd>
          </div>
        </dl>
        <p className="escala-dica">
          Depois de mudar uma regra, volte aqui e use “Gerar novamente” para aplicar na semana.
        </p>
      </Drawer>
    </div>
  );
};

export default ListaPasseiosSemana;
