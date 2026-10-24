import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./styles.css";
import "./escala.css";
import {
  Button,
  Card,
  CardHeader,
  Drawer,
  EmptyState,
  FilterBar,
  Icon,
  IdiomaTag,
  KpiTiles,
  PageHeader,
  PrioridadeSinal,
  Segmented,
  StatusDot,
  Table,
  TableHead,
  TableRow,
  useToast,
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
} from "../../Services/Services/plannerApi";

import {
  alternarServicoForaDaEscala,
  carregarServicosForaDaEscala,
} from "../../Services/Services/servicosEscala";
import { buscarDatas } from "../../Services/Services/servicosPhoenix";
import {
  SEMANAS_EXPERIENCIA,
  cargaHistoricaPorGuia,
  datasAntesDe,
  experienciaPorGuia,
  extrairEntradasHistorico,
  guiasPhoenixSemCadastro,
} from "../../Services/Services/historicoEscala";
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
  salvarPlanilhaHistoricoDrive,
} from "../../Services/Services/plannerRepository";

import {
  construirMapaAfinidade,
  construirMapaDisponibilidade,
  gerarPlanoAlocacaoSemana,
  resolverServiceIdDoItem,
  servicoDispensaGuiaPorPax,
} from "../../Services/Services/plannerAllocation";

import {
  listarIdiomasExigidos,
  rotuloDoIdioma,
  siglaDoIdioma,
} from "../../Services/Utils/idiomas";

import {
  gerarResumoGuiasSemana,
  gerarMensagemGuia,
} from "../../Services/Services/plannerSummary";

import { abrirEscalaEmNovaAba } from "../../Services/Services/plannerExport";
import { salvarEscalaNoDrive } from "../../Services/Services/googleDrive";
import GuiaAvatar from "../ui/GuiaAvatar";
import SeletorGuia from "./SeletorGuia";
import {
  chavePasseio,
  construirAprendizado,
  resumoDoAprendizado,
} from "../../Services/Services/escalaAprendizado";
import {
  carregarEdicoesEscala,
  registrarEdicaoEscala,
} from "../../Services/Services/escalaAprendizadoRepository";
import { opcoesDeGuiaParaServico } from "../../Services/Services/escalaSugestao";

const ETAPAS_ROBO_ESCALA = [
  "Verificando a disponibilidade dos guias",
  "Verificando a afinidade e o que a equipe costuma escolher",
  "Alocando guias",
  "Verificando equilíbrio de escala",
  "Finalizando escala",
];

// a escala sempre mostra a semana inteira; os cards de dia só rolam a
// tela até o dia escolhido (e destacam ele por um instante)
const idAncoraDia = (date) => `escala-dia-${date}`;

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
    case "fora_do_mapa":
      return "o passeio não está no Mapa de afinidade — coloque no mapa ou tire da escala";
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
  const [diaDestacado, setDiaDestacado] = useState(null);
  const { mostrarToast } = useToast();
  // "Por guia": guia escolhido no card — os dias e linhas dele ficam marcados
  const [guiaFoco, setGuiaFoco] = useState(null);
  const [diaEmVista, setDiaEmVista] = useState(null);
  const destaqueTimer = useRef(null);
  // depois de um clique, o dia clicado fica marcado até a rolagem terminar
  const diaClicadoRef = useRef(null);
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
  const [drivePlanilhaId, setDrivePlanilhaId] = useState("");

  // edições manuais (o que a escala aprende) e experiência recente dos
  // guias com cada passeio (Phoenix, 8 semanas) — usada no seletor
  const [edicoesEscala, setEdicoesEscala] = useState([]);
  const [experienciaSemana, setExperienciaSemana] = useState({ inicio: null, dados: null });
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);

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

  // o que a equipe ensinou editando a escala (critério secundário do robô)
  const aprendizado = useMemo(() => construirAprendizado(edicoesEscala), [edicoesEscala]);
  const resumoAprendizado = useMemo(
    () => resumoDoAprendizado(aprendizado, (id) => guias.find((g) => g.id === id)?.nome),
    [aprendizado, guias],
  );
  const mapaAfinidadeTela = useMemo(() => construirMapaAfinidade(afinidades), [afinidades]);
  const mapaDisponibilidadeTela = useMemo(
    () => construirMapaDisponibilidade(disponibilidades),
    [disponibilidades],
  );
  // serviços de cada guia na semana e quem já está em qual passeio no dia
  const { cargaSemanaPorGuia, ocupadosPorDia } = useMemo(() => {
    const carga = {};
    const ocupados = {};
    Object.entries(registrosPorDia).forEach(([date, lista]) => {
      ocupados[date] = {};
      (lista || []).forEach((r) => {
        if (!r?.guiaId || r.allocationStatus === "CLOSED") return;
        carga[r.guiaId] = (carga[r.guiaId] || 0) + 1;
        ocupados[date][r.guiaId] = r.serviceName;
      });
    });
    return { cargaSemanaPorGuia: carga, ocupadosPorDia: ocupados };
  }, [registrosPorDia]);

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
      // a lista de serviços fora da escala precisa estar pronta antes de
      // ler a semana (ela decide o que entra)
      await carregarServicosForaDaEscala();
      const [base, modoGerado, apiAgrupada, weeklyServices, edicoes] = await Promise.all(
        [
          carregarBasePlanner(),
          carregarModoGeradoSemana(semanaAtual),
          carregarSemanaApiListaPasseios(semanaAtual),
          carregarWeeklyServicesDaSemana(semanaAtual),
          carregarEdicoesEscala(),
        ],
      );
      setEdicoesEscala(edicoes);

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
      setDrivePlanilhaId(base.driveEscalaPlanilhaId || "");
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

  // experiência recente (Phoenix, 8 semanas) para o seletor do modo de
  // edição — busca uma vez por semana, em segundo plano
  const carregarExperienciaDaSemana = async () => {
    const inicio = semana[0]?.date;
    if (!inicio || experienciaSemana.inicio === inicio || carregandoHistorico) return;
    setCarregandoHistorico(true);
    try {
      const entradas = extrairEntradasHistorico(
        await buscarDatas(datasAntesDe(inicio, SEMANAS_EXPERIENCIA), null, 8),
      );
      setExperienciaSemana({
        inicio,
        dados: experienciaPorGuia({ entradas, guias: guias.filter((g) => g.ativo), servicesData: services }),
      });
    } catch (err) {
      console.error("Histórico do Phoenix indisponível:", err);
      setExperienciaSemana({ inicio, dados: null });
    } finally {
      setCarregandoHistorico(false);
    }
  };

  const entrarNaEdicao = () => {
    setModoVisualizacao(false);
    carregarExperienciaDaSemana();
  };

  const opcoesDoSeletor = (dia, item) =>
    opcoesDeGuiaParaServico({
      item,
      date: dia.date,
      guias,
      mapaDisponibilidade: mapaDisponibilidadeTela,
      mapaAfinidade: mapaAfinidadeTela,
      servicesData: services,
      normalizarTexto,
      ocupadosNoDia: ocupadosPorDia[dia.date] || {},
      cargaSemana: cargaSemanaPorGuia,
      experienciaPorGuiaId: experienciaSemana.inicio === semana[0]?.date ? experienciaSemana.dados : null,
      aprendizado,
    });

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

      // a escala aprende com a troca (quem saiu, quem entrou, em qual passeio)
      const edicao = {
        date: dia.date,
        day: dia.day,
        passeio: chavePasseio(
          resolverServiceIdDoItem(registro, services, normalizarTexto),
          registro?.serviceName,
          normalizarTexto,
        ),
        serviceName: registro?.serviceName || "",
        idiomas: listarIdiomasExigidos(registro?.idiomas),
        pax: registro?.passengers,
        de: registro?.guiaId ? { id: registro.guiaId, nome: registro.guiaNome } : null,
        para: guia ? { id: guia.id, nome: guia.nome } : null,
        origem: !registro?.guiaId ? "vazio" : modoGeradoSemana ? "robo" : "manual",
      };
      registrarEdicaoEscala(edicao);
      setEdicoesEscala((prev) => [
        ...prev,
        {
          ...edicao,
          deId: edicao.de?.id || null,
          deNome: edicao.de?.nome || null,
          paraId: edicao.para?.id || null,
          paraNome: edicao.para?.nome || null,
        },
      ]);

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
      // muda com frequência: os registros da semana e o histórico real do
      // Phoenix das 8 semanas anteriores (carga das últimas 4, com peso, e
      // experiência de cada guia com cada passeio).
      const inicioSemana = semana[0]?.date;
      const [registrosSemanaMap, entradasHistorico] = await Promise.all([
        carregarWeeklyServicesDaSemana(semana),
        buscarDatas(datasAntesDe(inicioSemana, SEMANAS_EXPERIENCIA), null, 8)
          .then(extrairEntradasHistorico)
          .catch((err) => {
            console.error("Histórico do Phoenix indisponível:", err);
            return null;
          }),
      ]);
      const registrosSemana = Object.values(registrosSemanaMap).flat();
      const guiasAtivos = guias.filter((g) => g.ativo);

      avancarEtapaRobo(1);
      const mapaAfinidade = construirMapaAfinidade(afinidades);
      const mapaDisponibilidade =
        construirMapaDisponibilidade(disponibilidades);

      const cargaHistoricaPorGuiaId = entradasHistorico
        ? cargaHistoricaPorGuia({
            entradas: entradasHistorico,
            guias: guiasAtivos,
            inicioSemana,
            mapaDisponibilidade,
          })
        : null;
      const experienciaPorGuiaId = entradasHistorico
        ? experienciaPorGuia({ entradas: entradasHistorico, guias: guiasAtivos, servicesData: services })
        : {};
      const guiasSemCadastro = entradasHistorico
        ? guiasPhoenixSemCadastro({ entradas: entradasHistorico, guias })
        : [];

      avancarEtapaRobo(2);
      const { atualizacoes, naoAlocados, avisosIdioma } = gerarPlanoAlocacaoSemana({
        semana,
        guias: guiasAtivos,
        registrosSemana,
        mapaAfinidade,
        mapaDisponibilidade,
        servicesData: services,
        modoDistribuicaoGuias,
        usarAfinidadeGuiaPasseio,
        agruparRegistrosPorServico,
        normalizarTexto,
        cargaHistoricaPorGuiaId,
        experienciaPorGuiaId,
        modoIdioma,
        paxMinimoParaGuia,
        aprendizado,
      });
      if (entradasHistorico) setExperienciaSemana({ inicio: inicioSemana, dados: experienciaPorGuiaId });

      avancarEtapaRobo(3);
      await aplicarPlanoDeAlocacao(atualizacoes);

      // por que o robô escolheu cada guia (mostrado embaixo do nome)
      const motivosPorRegistro = {};
      atualizacoes.forEach((a) => {
        if (a.motivos?.length) {
          motivosPorRegistro[a.registroId] = { guiaId: a.guiaId, texto: a.motivos.join(" · ") };
        }
      });

      setRelatorioEscala({
        motivosPorRegistro,
        guiasSemCadastro,
        semHistorico: !entradasHistorico,
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

      const envio = await salvarEscalaNoDrive({
        semana,
        extras,
        agruparRegistrosPorServico,
        getTextoStatusServico,
        getClasseStatusServico,
        pastaId: driveFolderId,
        clientId: driveClientId,
        planilhaId: drivePlanilhaId,
      });

      // primeira vez (ou a planilha antiga foi apagada): guarda a nova para a equipe
      if (envio.planilhaId !== drivePlanilhaId) {
        setDrivePlanilhaId(envio.planilhaId);
        try {
          await salvarPlanilhaHistoricoDrive(envio.planilhaId);
        } catch (errSalvar) {
          console.error("Erro ao guardar a planilha de histórico:", errSalvar);
        }
      }

      mostrarToast(
        envio.atualizouPeriodo
          ? `Aba ${envio.periodo} atualizada na planilha de histórico`
          : `Semana ${envio.periodo} lançada na planilha de histórico`,
      );
      window.open(envio.url, "_blank");
    } catch (err) {
      console.error("Erro ao salvar escala no Drive:", err);

      if (err.message === "SEM_CLIENT_ID") {
        alert(
          "O acesso ao Google Drive ainda não foi configurado. " +
            "Cole o Client ID em Configurações → Escala → Google Drive.",
        );
      } else if (err.message === "ESCOPO_INCOMPLETO") {
        alert(
          "Para lançar a escala na planilha de histórico, marque também o acesso às Planilhas Google " +
            "na tela de permissão do Google e tente de novo.",
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

  // Esqueleto com o mesmo desenho da tela pronta: 6 indicadores, as abas,
  // a faixa de dias e os cards de dia com a tabela (passeio, guia, pax,
  // grupo) — a tela não "pula" quando os dados chegam.
  const LARGURAS_PASSEIO = ["62%", "48%", "70%", "54%", "40%"];
  const renderEsqueletoEscala = () => (
    <div className="escala-sk" aria-busy="true" aria-label="Carregando a escala">
      <div className="ui-kpis">
        {[0, 1, 2, 3, 4, 5].map((k) => (
          <div key={k} className="ui-kpi">
            <span className="ui-sk ui-sk--valor" />
            <span className="ui-sk ui-sk--fina" style={{ width: "70%" }} />
          </div>
        ))}
      </div>
      <span className="ui-sk escala-sk__abas" />
      <div className="escala-dias escala-sk__dias">
        <div className="escala-dia escala-sk__dia is-largo">
          <span className="ui-sk" style={{ width: "60%" }} />
          <span className="ui-sk ui-sk--fina" style={{ width: "80%" }} />
        </div>
        {[0, 1, 2, 3, 4, 5, 6].map((d) => (
          <div key={d} className="escala-dia escala-sk__dia">
            <span className="ui-sk" style={{ width: "55%" }} />
            <span className="ui-sk ui-sk--fina" style={{ width: "75%" }} />
          </div>
        ))}
      </div>
      {[5, 4].map((linhas, c) => (
        <Card key={c} className="escala-dia-card">
          <div className="ui-card__head">
            <div className="ui-card__titles escala-sk__titulos">
              <span className="ui-sk" style={{ width: 210, height: 16 }} />
              <span className="ui-sk ui-sk--fina" style={{ width: 300 }} />
            </div>
          </div>
          <Table
            columns="minmax(220px,2fr) minmax(150px,1.2fr) minmax(130px,1fr) minmax(140px,1fr) 40px"
            minWidth={760}
          >
            <TableHead>
              <span>Passeio</span>
              <span>Guia</span>
              <span>Pax</span>
              <span>Grupo</span>
              <span />
            </TableHead>
            {Array.from({ length: linhas }, (_, i) => (
              <TableRow key={i}>
                <span className="escala-sk__cel">
                  <span className="ui-sk" style={{ width: LARGURAS_PASSEIO[(i + c) % 5] }} />
                </span>
                <span className="escala-sk__cel is-linha">
                  <span className="ui-sk escala-sk__avatar" />
                  <span className="ui-sk" style={{ width: "58%" }} />
                </span>
                <span className="escala-sk__cel">
                  <span className="ui-sk" style={{ width: 52 }} />
                  <span className="ui-sk ui-sk--fina" style={{ width: 110 }} />
                </span>
                <span className="escala-sk__cel">
                  <span className="ui-sk ui-sk--pilula" />
                </span>
                <span />
              </TableRow>
            ))}
          </Table>
        </Card>
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

  // marca na faixa de dias qual dia está aparecendo na tela agora
  const chaveDiasSemana = semana.map((d) => d.date).join("|");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;
    const cards = Array.from(document.querySelectorAll(".escala-dia-card[data-dia]"));
    if (!cards.length) return undefined;
    const visiveis = new Map();
    const observador = new IntersectionObserver(
      (entradas) => {
        entradas.forEach((e) => {
          if (e.isIntersecting) visiveis.set(e.target.dataset.dia, e.boundingClientRect.top);
          else visiveis.delete(e.target.dataset.dia);
        });
        if (diaClicadoRef.current) return;
        const primeiro = [...visiveis.entries()].sort((a, b) => a[1] - b[1])[0];
        setDiaEmVista(primeiro ? primeiro[0] : null);
      },
      { rootMargin: "-170px 0px -45% 0px" },
    );
    cards.forEach((c) => observador.observe(c));
    return () => observador.disconnect();
  }, [abaEscala, chaveDiasSemana, carregandoEstrutura]);

  useEffect(() => () => clearTimeout(destaqueTimer.current), []);

  const guiaFocoObj =
    abaEscala === "guia" && guiaFoco
      ? resumoGuias.find((g) => g.guiaId === guiaFoco) || null
      : null;

  // clique no card do guia: marca os dias dele e desce até o primeiro
  const focarGuia = (g) => {
    if (guiaFoco === g.guiaId) {
      setGuiaFoco(null);
      return;
    }
    setGuiaFoco(g.guiaId);
    const primeiro = semana.find((d) => g.datas?.has(d.date));
    if (primeiro) setTimeout(() => irParaDia(primeiro.date), 30);
  };

  const irParaDia = (date) => {
    const alvo = document.getElementById(idAncoraDia(date));
    if (!alvo) return;
    // rola só a área de rolagem do app (scrollIntoView também mexia na
    // moldura da página); desconta a barra do topo e a faixa de dias
    let area = alvo.parentElement;
    while (area && area !== document.body) {
      const { overflowY } = getComputedStyle(area);
      if (/(auto|scroll)/.test(overflowY) && area.scrollHeight > area.clientHeight) break;
      area = area.parentElement;
    }
    const faixa = document.querySelector(".escala-dias");
    const alturaTopo =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--topbar-h")) || 56;
    const desconto = alturaTopo + (faixa ? faixa.offsetHeight : 80) + 12;
    if (area && area !== document.body) {
      const topo = alvo.getBoundingClientRect().top - desconto + area.scrollTop;
      area.scrollTo({ top: topo, behavior: "smooth" });
    } else {
      const topo = alvo.getBoundingClientRect().top - desconto + window.scrollY;
      window.scrollTo({ top: topo, behavior: "smooth" });
    }
    setDiaDestacado(date);
    setDiaEmVista(date);
    diaClicadoRef.current = date;
    clearTimeout(destaqueTimer.current);
    destaqueTimer.current = setTimeout(() => {
      setDiaDestacado(null);
      diaClicadoRef.current = null;
    }, 1800);
  };

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

  // Tira o serviço da escala (vai para Configurações → Serviços fora da
  // escala): some da tabela e o robô deixa de alocar guia nele.
  const ocultarServico = async (item) => {
    const nome = item.serviceName;
    const ok = window.confirm(
      `Ocultar "${nome}" da escala?\n\nEle vai para Configurações → Escala → Serviços fora da escala: ` +
        "deixa de aparecer aqui e não recebe guia. Dá para desfazer lá ou no Mapa de afinidade.",
    );
    if (!ok) return;
    try {
      setProcessandoAcao(true);
      const lista = await carregarServicosForaDaEscala();
      await alternarServicoForaDaEscala(nome, lista, true);
      // recalcula as tabelas da semana já sem o serviço
      setExtras((prev) => ({ ...prev }));
      mostrarToast(`${nome} saiu da escala`);
    } catch (err) {
      console.error("Erro ao ocultar serviço:", err);
      alert("Não foi possível ocultar o serviço.");
    } finally {
      setProcessandoAcao(false);
    }
  };

  const botaoOcultar = (item) => (
    <Button
      variant="ghost"
      size="sm"
      iconOnly
      icon="eyeOff"
      className="escala-ocultar"
      title="Ocultar este serviço da escala (Serviços fora da escala)"
      aria-label={`Ocultar ${item.serviceName} da escala`}
      onClick={() => ocultarServico(item)}
      disabled={processandoAcao || gerandoEscala}
    />
  );

  const renderItemDia = (dia, item) => (
    <TableRow
      key={`${dia.date}-${item.externalServiceId || item.id}-${item.serviceName}`}
      className={`${item.allocationStatus === "CLOSED" ? "escala-fechado" : ""} ${
        guiaFoco && item.guiaId === guiaFoco ? "escala-linha-foco" : ""
      }`}
    >
      <span>
        <span className="escala-passeio">
          <span className="ui-cell-main">{item.serviceName}</span>
          {listarIdiomasExigidos(item.idiomas).map((id) => (
            <IdiomaTag
              key={id}
              idioma={id}
              qtd={item.idiomas[id]}
              title={`Passageiros em ${rotuloDoIdioma(id)} (${item.idiomas[id]} pax)`}
            />
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
      </span>

      {modoVisualizacao ? (
        <>
          <span>
            {item.guiaNome ? (
              <>
                <GuiaAvatar className="ui-cell-main" nome={item.guiaNome} id={item.guiaId} tamanho={24} />
                {relatorioEscala?.motivosPorRegistro?.[item.id]?.guiaId === item.guiaId && (
                  <span className="ui-cell-sub escala-motivo" title="Por que o robô escolheu esse guia">
                    {relatorioEscala.motivosPorRegistro[item.id].texto}
                  </span>
                )}
              </>
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
          <span className="ui-cell-end">{!item.manual && botaoOcultar(item)}</span>
        </>
      ) : (
        <>
          <SeletorGuia
            item={item}
            rotuloDia={dia.label}
            calcularOpcoes={() => opcoesDoSeletor(dia, item)}
            onEscolher={(guia) => alterarGuiaManual(item.id, guia || null, dia, item)}
            disabled={processandoAcao || gerandoEscala || item.allocationStatus === "CLOSED"}
            carregandoHistorico={carregandoHistorico}
          />
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
            {!item.manual && botaoOcultar(item)}
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

  // faixa de dias + tabelas da semana inteira (usada em "Por dia" e "Por guia")
  const renderSemanaDias = () => (
    <>
              <nav className="escala-dias" aria-label="Ir para o dia">
                {guiaFocoObj ? (
                  <div className="escala-todos is-guia" title="Guia marcado nas tabelas">
                    <span className="escala-todos__icone">
                      <Icon name="user" size={18} />
                    </span>
                    <span className="escala-todos__texto">
                      <span className="escala-todos__nome">{guiaFocoObj.nome}</span>
                      <span className="escala-todos__meta tabular">
                        {guiaFocoObj.totalServicos} serviço{guiaFocoObj.totalServicos === 1 ? "" : "s"}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="escala-todos__limpar"
                      onClick={() => setGuiaFoco(null)}
                      aria-label="Desmarcar guia"
                      title="Desmarcar guia"
                    >
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                ) : (
                <div className="escala-todos" title="A escala mostra sempre a semana inteira">
                  <span className="escala-todos__icone">
                    <Icon name="calendar" size={18} />
                  </span>
                  <span className="escala-todos__texto">
                    <span className="escala-todos__nome">Semana inteira</span>
                    <span className="escala-todos__meta tabular">
                      {totaisSemana.comGuia}/{totaisSemana.total - totaisSemana.fechados} com guia
                    </span>
                    {/* um traço por dia: status de cada dia da semana */}
                    <span className="escala-todos__dias" aria-hidden="true">
                      {semana.map((dia) => {
                        const i = infoDia(dia.date);
                        const estado =
                          i.total - i.fechados === 0 ? "vazio" : i.semGuia > 0 ? "falta" : "ok";
                        return <span key={dia.date} className={`is-${estado}`} />;
                      })}
                    </span>
                  </span>
                </div>
                )}
                {semana.map((dia) => {
                  const i = infoDia(dia.date);
                  const emVista = diaEmVista === dia.date;
                  return (
                    <button
                      key={dia.date}
                      type="button"
                      aria-current={emVista ? "true" : undefined}
                      className={`escala-dia ${emVista ? "is-em-vista" : ""} ${
                        dia.date === hojeIso ? "is-hoje" : ""
                      } ${
                        guiaFocoObj
                          ? guiaFocoObj.datas?.has(dia.date)
                            ? "is-do-guia"
                            : "is-fora-do-guia"
                          : ""
                      }`}
                      onClick={() => irParaDia(dia.date)}
                      title={`Ir para ${dia.label}`}
                    >
                      <span className="escala-dia__nome">
                        {dia.day}
                        <span className="escala-dia__data tabular">
                          {dia.date === hojeIso ? "hoje" : formatarDataCurta(dia.date)}
                        </span>
                        <Icon name="arrowDown" size={12} className="escala-dia__ir" />
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
              </nav>

              {semana.map((dia) => {
                const registrosOrdenados = registrosPorDia[dia.date] || [];
                const i = infoDia(dia.date);

                return (
                  <Card
                    key={dia.date}
                    id={idAncoraDia(dia.date)}
                    data-dia={dia.date}
                    className={`escala-dia-card ${diaDestacado === dia.date ? "is-destacado" : ""} ${
                      guiaFocoObj?.datas?.has(dia.date) ? "is-do-guia" : ""
                    }`}
                  >
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
                            ? "minmax(220px,2fr) minmax(150px,1.2fr) minmax(130px,1fr) minmax(140px,1fr) 40px"
                            : "minmax(220px,2fr) minmax(200px,1.4fr) 90px 120px 48px"
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
            hint: drivePlanilhaId ? "planilha de histórico" : driveFolderId ? "cria na pasta configurada" : "cria no seu Drive",
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
              <Button icon="pencil" onClick={entrarNaEdicao} disabled={travado}>
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
          <span className="escala-todos__label tabular">{formatarPeriodoSemana(semana)}</span>
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
            {relatorioEscala.semHistorico && (
              <p className="escala-relatorio-nota">
                <Icon name="alert" size={14} />
                O histórico do Phoenix não respondeu: a escala saiu sem considerar as últimas
                semanas (carga e experiência).
              </p>
            )}
            {relatorioEscala.guiasSemCadastro?.length > 0 && (
              <p className="escala-relatorio-nota">
                <Icon name="user" size={14} />
                <span>
                  Guias do Phoenix que não batem com o cadastro (o histórico deles não entrou):{" "}
                  <b>
                    {relatorioEscala.guiasSemCadastro
                      .slice(0, 8)
                      .map((g) => g.nome)
                      .join(", ")}
                  </b>
                  {relatorioEscala.guiasSemCadastro.length > 8 &&
                    ` e mais ${relatorioEscala.guiasSemCadastro.length - 8}`}
                  . Ajuste o apelido no cadastro do guia para ficar igual ao do Phoenix.
                </span>
              </p>
            )}
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
          {renderEsqueletoEscala()}
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
          {abaEscala === "dia" && renderSemanaDias()}

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
                    <Card
                      key={g.guiaId}
                      className={`escala-guia is-clicavel ${guiaFoco === g.guiaId ? "is-foco" : ""}`}
                      role="button"
                      tabIndex={0}
                      aria-pressed={guiaFoco === g.guiaId}
                      title="Ver os dias e serviços deste guia na semana"
                      onClick={() => focarGuia(g)}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          focarGuia(g);
                        }
                      }}
                    >
                      <div className="escala-guia__topo">
                        <span className="escala-guia__nome">
                          <PrioridadeSinal nivel={g.nivelPrioridade} />
                          {index === 0 && (
                            <Icon name="star" size={14} className="escala-guia__top" title="Maior ocupação" />
                          )}
                          <GuiaAvatar nome={g.nome} id={g.guiaId || g.id} tamanho={22} />
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
                        <span
                          className="escala-tooltip-wrap"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
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
                          <PrioridadeSinal nivel={guia.nivelPrioridade} />
                          <GuiaAvatar nome={guia.nome} id={guia.guiaId} tamanho={22} />
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

              {/* serviços da semana, dia a dia, para conferir o guia escolhido */}
              <div className="escala-foco-cab">
                <h3 className="escala-subtitulo">Serviços da semana</h3>
                {guiaFocoObj ? (
                  <span className="escala-foco-aviso">
                    <Icon name="user" size={14} />
                    <span>
                      <b>{guiaFocoObj.nome}</b> trabalha em{" "}
                      {semana
                        .filter((d) => guiaFocoObj.datas?.has(d.date))
                        .map((d) => d.day)
                        .join(", ") || "nenhum dia"}{" "}
                      — dias e serviços dele estão marcados
                    </span>
                    <button type="button" onClick={() => setGuiaFoco(null)}>
                      Limpar
                    </button>
                  </span>
                ) : (
                  <span className="ui-cell-sub">
                    Clique no card de um guia para marcar os dias e os serviços dele.
                  </span>
                )}
              </div>
              {renderSemanaDias()}
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
        <section className="escala-aprendeu">
          <h4>
            <Icon name="sparkles" size={14} /> O que a escala aprendeu com a equipe
          </h4>
          {resumoAprendizado.total === 0 ? (
            <p className="ui-cell-sub">
              Ainda nada. Cada vez que alguém troca o guia de um passeio no modo de edição, a escala
              guarda quem saiu e quem entrou. Com o tempo, o robô passa a se parecer com as escolhas
              da equipe.
            </p>
          ) : (
            <>
              <p className="ui-cell-sub">
                {resumoAprendizado.total} troca{resumoAprendizado.total === 1 ? "" : "s"} nos últimos
                6 meses. Vale como critério secundário: ajuda a desempatar, mas idioma,
                disponibilidade, prioridade e equilíbrio continuam na frente. Trocas recentes pesam
                mais.
              </p>
              {resumoAprendizado.preferidos.length > 0 && (
                <>
                  <h5>Costuma escolher</h5>
                  <ul>
                    {resumoAprendizado.preferidos.map((p) => (
                      <li key={`${p.passeio}-${p.guia}`}>
                        <b>{p.guia}</b> no {p.passeio} <span className="tabular">({p.vezes}×)</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {resumoAprendizado.trocas.length > 0 && (
                <>
                  <h5>Trocas que se repetem</h5>
                  <ul>
                    {resumoAprendizado.trocas.map((t) => (
                      <li key={`${t.de}-${t.para}`}>
                        {t.de} → <b>{t.para}</b> <span className="tabular">({t.vezes}×)</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </section>
        <p className="escala-dica">
          Depois de mudar uma regra, volte aqui e use “Gerar novamente” para aplicar na semana.
        </p>
      </Drawer>
    </div>
  );
};

export default ListaPasseiosSemana;
