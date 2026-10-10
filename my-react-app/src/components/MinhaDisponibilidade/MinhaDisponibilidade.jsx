import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import Icon from "../ui/Icon";
import { definirTituloAba } from "../Shell/tituloAba";
import { db } from "../../Services/Services/firebase";
import { useAuth } from "../../Context/AuthContext";
import { getLanguages } from "../../Services/Services/languages.service";
import {
  JANELA_PADRAO,
  NOMES_DIAS,
  dataBr,
  diaAbreviado,
  formatarRestante,
  getEstadoJanela,
  somarDias,
} from "../../Services/Utils/janelaDisponibilidade";
import PaisagemNordeste from "../Auth/PaisagemNordeste";
import logo from "../../assets/clover.png";
import "./styles.css";
import "./guia-visual.css";

const iniciais = (nome = "") =>
  String(nome)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

// quanto da janela de envio já passou (0–100), só para a barra de progresso
const progressoJanela = (restanteMin, config) => {
  const ab = Number(config?.dowAbertura ?? 4);
  const fe = Number(config?.dowFechamento ?? 5);
  const totalMin = ((((fe - ab + 7) % 7) + 1) * 24 * 60) || 1;
  const pct = 100 - (Number(restanteMin || 0) / totalMin) * 100;
  return Math.max(0, Math.min(100, pct));
};

const nomePasseio = (p) =>
  p?.nome || p?.externalName || p?.name || p?.titulo || "Passeio sem nome";

const formatarWhatsapp = (valor) => {
  const n = String(valor || "").replace(/\D/g, "").slice(0, 11);
  if (n.length < 10) return valor || "—";
  const ddd = n.slice(0, 2);
  return n.length === 11
    ? `(${ddd}) ${n.slice(2, 7)}-${n.slice(7)}`
    : `(${ddd}) ${n.slice(2, 6)}-${n.slice(6)}`;
};

const MinhaDisponibilidade = () => {
  useEffect(() => {
    definirTituloAba("Minha disponibilidade");
  }, []);

  const { perfil, user, logout } = useAuth();
  const guideId = perfil?.guideId;

  const [aba, setAba] = useState("disponibilidade");

  // Relógio: reavalia a janela a cada 30 s (abre/fecha sozinha, sem recarregar).
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // Dias em que a janela abre/fecha: configurados pelo operacional em
  // Configurações → Escala. Carrega uma vez (independe do guia).
  const [janelaConfig, setJanelaConfig] = useState(JANELA_PADRAO);
  const [whatsappOperacao, setWhatsappOperacao] = useState("");
  useEffect(() => {
    let ativo = true;
    getDoc(doc(db, "settings", "scale"))
      .then((snap) => {
        if (!ativo || !snap.exists()) return;
        const data = snap.data();
        if (data.whatsappOperacao) setWhatsappOperacao(String(data.whatsappOperacao));
        if (
          data.janelaDisponibilidadeAbertura !== undefined ||
          data.janelaDisponibilidadeFechamento !== undefined
        ) {
          setJanelaConfig({
            dowAbertura:
              data.janelaDisponibilidadeAbertura ?? JANELA_PADRAO.dowAbertura,
            dowFechamento:
              data.janelaDisponibilidadeFechamento ??
              JANELA_PADRAO.dowFechamento,
          });
        }
      })
      .catch((err) =>
        console.error("Erro ao carregar janela de disponibilidade:", err),
      );
    return () => {
      ativo = false;
    };
  }, []);

  const janela = useMemo(
    () => getEstadoJanela(agora, janelaConfig),
    [agora, janelaConfig],
  );

  /* ---------- disponibilidade ---------- */
  const [salvos, setSalvos] = useState([]); // [{ day, date }]
  const [atualizadoEm, setAtualizadoEm] = useState(null);
  const [loading, setLoading] = useState(Boolean(guideId));
  const [erroCarga, setErroCarga] = useState("");
  // null = sem edição pendente (mostra o que está salvo).
  // { semana, datas: Set } = edição em curso, presa à semana em que foi feita
  // (se a janela fechar ou a semana mudar, a edição antiga é ignorada).
  const [edicao, setEdicao] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState(null);

  // Histórico: passador de semana à parte, independente da semana editável
  // acima. offset 0 = semana atual (a que contém hoje); negativo = semanas
  // passadas. Não avança além da semana atual — a semana que vem já tem
  // seu próprio editor logo ali em cima.
  const [offsetHistorico, setOffsetHistorico] = useState(0);

  /* ---------- perfil (somente leitura) ---------- */
  const [guia, setGuia] = useState(null);
  const [passeiosAptos, setPasseiosAptos] = useState([]);
  const [erroPerfil, setErroPerfil] = useState(false);

  /* ---------- idiomas (o guia mesmo preenche) ---------- */
  const [idiomasDisponiveis, setIdiomasDisponiveis] = useState([]);
  // null = sem edição pendente (mostra o que está salvo)
  const [idiomasEdicao, setIdiomasEdicao] = useState(null);
  const [salvandoIdiomas, setSalvandoIdiomas] = useState(false);
  const [msgIdiomas, setMsgIdiomas] = useState(null);

  useEffect(() => {
    if (!guideId) return;

    let ativo = true;
    (async () => {
      const langs = await getLanguages();
      if (ativo) setIdiomasDisponiveis(langs.map((l) => l.label));

      const [disp, guiaSnap, niveisSnap, servicosSnap] =
        await Promise.allSettled([
          getDoc(doc(db, "guide_availability", guideId)),
          getDoc(doc(db, "guides", guideId)),
          getDoc(doc(db, "guide_tour_levels", guideId)),
          getDocs(collection(db, "services")),
        ]);

      if (!ativo) return;

      if (disp.status === "fulfilled") {
        if (disp.value.exists()) {
          const data = disp.value.data();
          setSalvos(
            Array.isArray(data.disponibilidade) ? data.disponibilidade : [],
          );
          setAtualizadoEm(data.updatedAt?.toDate?.() ?? null);
        }
      } else {
        console.error("Erro ao carregar disponibilidade:", disp.reason);
        setErroCarga("Não foi possível carregar sua disponibilidade.");
      }

      if (
        guiaSnap.status === "fulfilled" &&
        niveisSnap.status === "fulfilled" &&
        servicosSnap.status === "fulfilled"
      ) {
        setGuia(guiaSnap.value.exists() ? guiaSnap.value.data() : null);

        // "Apto" = tem nível > 0 no mapa de afinidade (mesma regra do operacional).
        const niveis = niveisSnap.value.exists()
          ? niveisSnap.value.data()?.tours || {}
          : {};
        setPasseiosAptos(
          servicosSnap.value.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((p) => p.ativo !== false && Number(niveis[p.id] || 0) > 0)
            .sort((a, b) =>
              nomePasseio(a).localeCompare(nomePasseio(b), "pt-BR", {
                sensitivity: "base",
              }),
            ),
        );
      } else {
        setErroPerfil(true);
      }

      setLoading(false);
    })();

    return () => {
      ativo = false;
    };
  }, [guideId]);

  /* ---------- semana alvo ---------- */
  const datasSemana = useMemo(
    () => new Set(janela.dias.map((d) => d.date)),
    [janela.dias],
  );

  const salvasNaSemana = useMemo(
    () => new Set(salvos.filter((s) => datasSemana.has(s.date)).map((s) => s.date)),
    [salvos, datasSemana],
  );

  const edicaoAtiva =
    edicao && janela.aberta && edicao.semana === janela.semanaInicio
      ? edicao.datas
      : null;
  const marcadas = edicaoAtiva ?? salvasNaSemana;
  const alterado = edicaoAtiva !== null;
  const podeEditar = janela.aberta && !salvando;

  const alternar = (dia) => {
    if (!podeEditar) return;
    setMsg(null);
    const proximo = new Set(marcadas);
    if (proximo.has(dia.date)) proximo.delete(dia.date);
    else proximo.add(dia.date);
    setEdicao({ semana: janela.semanaInicio, datas: proximo });
  };

  const marcarTodos = () => {
    if (!podeEditar) return;
    setMsg(null);
    const todos = janela.dias.every((d) => marcadas.has(d.date));
    setEdicao({
      semana: janela.semanaInicio,
      datas: todos ? new Set() : new Set(janela.dias.map((d) => d.date)),
    });
  };

  const salvar = async () => {
    if (!alterado || !guideId) return;

    // Confere de novo na hora de salvar (a janela pode ter fechado no meio).
    const agoraMesmo = getEstadoJanela(new Date(), janelaConfig);
    if (!agoraMesmo.aberta) {
      setAgora(new Date());
      setMsg({
        tipo: "erro",
        texto: "A janela de envio acabou de fechar. Suas alterações não foram salvas.",
      });
      return;
    }

    try {
      setSalvando(true);
      setMsg(null);

      const antes = salvasNaSemana;
      const depois = marcadas;
      const adicionados = [...depois].filter((d) => !antes.has(d)).sort();
      const removidos = [...antes].filter((d) => !depois.has(d)).sort();

      // Mantém as datas de outras semanas; só a semana alvo é substituída.
      const outras = salvos.filter((s) => !datasSemana.has(s.date));
      const novas = janela.dias
        .filter((d) => depois.has(d.date))
        .map((d) => ({ day: d.day, date: d.date }));
      const final = [...outras, ...novas].sort((a, b) =>
        a.date.localeCompare(b.date),
      );

      const tipo =
        antes.size === 0 ? "envio" : depois.size === 0 ? "cancelamento" : "alteracao";
      const guideName = perfil.guideName || perfil.nome;

      // Disponibilidade + notificação no mesmo lote: ou grava as duas, ou nenhuma.
      const lote = writeBatch(db);
      lote.set(
        doc(db, "guide_availability", guideId),
        {
          guideId,
          guideName,
          disponibilidade: final,
          updatedAt: Timestamp.now(),
          updatedBy: user.uid,
        },
        { merge: true },
      );
      lote.set(doc(collection(db, "notificacoes")), {
        tipo,
        origem: "guia",
        guideId,
        guideName,
        semanaInicio: janela.semanaInicio,
        semanaFim: janela.semanaFim,
        adicionados,
        removidos,
        total: depois.size,
        createdAt: serverTimestamp(),
      });
      await lote.commit();

      setSalvos(final);
      setAtualizadoEm(new Date());
      setEdicao(null);
      setMsg({
        tipo: "ok",
        texto:
          tipo === "cancelamento"
            ? "Datas removidas. O operacional foi avisado."
            : "Disponibilidade salva! O operacional foi avisado.",
      });
    } catch (err) {
      console.error("Erro ao salvar disponibilidade:", err);
      setMsg({
        tipo: "erro",
        texto:
          err.code === "permission-denied"
            ? "Não foi possível salvar: a janela de envio está fechada."
            : "Não foi possível salvar. Verifique a conexão e tente de novo.",
      });
    } finally {
      setSalvando(false);
    }
  };

  /* ---------- idiomas ---------- */
  const idiomasSalvos = useMemo(
    () => (Array.isArray(guia?.idiomas) ? guia.idiomas : []),
    [guia],
  );
  const idiomasMarcados = idiomasEdicao ?? idiomasSalvos;
  const idiomasAlterados = idiomasEdicao !== null;

  // Opções = lista oficial + qualquer idioma já cadastrado que não esteja nela
  // (assim nada que o operacional cadastrou some ao salvar).
  const opcoesIdiomas = useMemo(
    () => [...new Set([...idiomasDisponiveis, ...idiomasSalvos])],
    [idiomasDisponiveis, idiomasSalvos],
  );

  const alternarIdioma = (idioma) => {
    if (salvandoIdiomas) return;
    setMsgIdiomas(null);
    setIdiomasEdicao(
      idiomasMarcados.includes(idioma)
        ? idiomasMarcados.filter((i) => i !== idioma)
        : [...idiomasMarcados, idioma],
    );
  };

  const salvarIdiomas = async () => {
    if (!idiomasAlterados || !guideId) return;

    try {
      setSalvandoIdiomas(true);
      setMsgIdiomas(null);

      // mantém a ordem da lista oficial
      const depois = opcoesIdiomas.filter((i) => idiomasMarcados.includes(i));
      const adicionados = depois.filter((i) => !idiomasSalvos.includes(i));
      const removidos = idiomasSalvos.filter((i) => !depois.includes(i));

      // Idiomas + notificação no mesmo lote: ou grava as duas, ou nenhuma.
      const lote = writeBatch(db);
      lote.update(doc(db, "guides", guideId), {
        idiomas: depois,
        updatedAt: serverTimestamp(),
      });
      lote.set(doc(collection(db, "notificacoes")), {
        tipo: "idiomas",
        origem: "guia",
        guideId,
        guideName: perfil.guideName || perfil.nome,
        adicionados,
        removidos,
        total: depois.length,
        createdAt: serverTimestamp(),
      });
      await lote.commit();

      setGuia((g) => ({ ...g, idiomas: depois }));
      setIdiomasEdicao(null);
      setMsgIdiomas({ tipo: "ok", texto: "Idiomas salvos! O operacional foi avisado." });
    } catch (err) {
      console.error("Erro ao salvar idiomas:", err);
      setMsgIdiomas({
        tipo: "erro",
        texto: "Não foi possível salvar. Verifique a conexão e tente de novo.",
      });
    } finally {
      setSalvandoIdiomas(false);
    }
  };

  // Segunda-feira da semana que contém "hoje" — base para navegar o histórico.
  const segundaDestaSemana = useMemo(() => {
    const dowHoje = new Date(`${janela.hojeIso}T12:00:00Z`).getUTCDay(); // 0=dom..6=sáb
    const diasDesdeSegunda = (dowHoje + 6) % 7;
    return somarDias(janela.hojeIso, -diasDesdeSegunda);
  }, [janela.hojeIso]);

  // Dias (com o que já foi enviado marcado) da semana do histórico em exibição.
  const semanaHistorico = useMemo(() => {
    const inicio = somarDias(segundaDestaSemana, offsetHistorico * 7);
    const salvosNaSemana = new Set(
      salvos
        .filter((s) => s.date >= inicio && s.date <= somarDias(inicio, 6))
        .map((s) => s.date),
    );

    return {
      inicio,
      fim: somarDias(inicio, 6),
      dias: NOMES_DIAS.map((day, i) => {
        const date = somarDias(inicio, i);
        return { day, date, marcado: salvosNaSemana.has(date) };
      }),
    };
  }, [segundaDestaSemana, offsetHistorico, salvos]);

  const historicoEhSemanaAtual = offsetHistorico === 0;
  // offset 1 = semana que vem (mesma que janela.semanaInicio) — é o teto,
  // não faz sentido navegar além dela.
  const podeAvancarHistorico = offsetHistorico < 1;

  const intervalo = `${dataBr(janela.semanaInicio)} a ${dataBr(janela.semanaFim)}`;

  // Lembrete: menos de 6 h para fechar e nada enviado para a semana que vem.
  const prazoApertado =
    janela.aberta && Number(janela.restanteMin) <= 360 && salvasNaSemana.size === 0 && !alterado;

  // Repetir a semana anterior: mesmos dias da semana (seg..dom) marcados na
  // semana que antecede a semana alvo.
  const diasSemanaAnterior = useMemo(() => {
    const inicioAnterior = somarDias(janela.semanaInicio, -7);
    const fimAnterior = somarDias(janela.semanaInicio, -1);
    const marcadosAntes = new Set(
      salvos.filter((s) => s.date >= inicioAnterior && s.date <= fimAnterior).map((s) => s.date),
    );
    return janela.dias.filter((d) => marcadosAntes.has(somarDias(d.date, -7)));
  }, [salvos, janela.semanaInicio, janela.dias]);

  const repetirSemanaAnterior = () => {
    if (!podeEditar || !diasSemanaAnterior.length) return;
    setMsg(null);
    setEdicao({
      semana: janela.semanaInicio,
      datas: new Set(diasSemanaAnterior.map((d) => d.date)),
    });
  };

  const linkWhatsappOperacao = (() => {
    const n = String(whatsappOperacao).replace(/\D/g, "");
    if (n.length < 10) return "";
    const numero = n.length <= 11 ? `55${n}` : n;
    const texto = encodeURIComponent(
      `Olá! Aqui é ${perfil?.nome?.split(" ")[0] || "o guia"}, da Luck. `,
    );
    return `https://wa.me/${numero}?text=${texto}`;
  })();
  const todosMarcados = janela.dias.every((d) => marcadas.has(d.date));

  return (
    <div className="minha-disp-page">
      <header className="guia-hero">
        <PaisagemNordeste className="guia-hero__paisagem" />

        <div className="guia-hero__barra">
          <span className="guia-hero__marca">
            <img src={logo} alt="" />
            Luck SSA · Área do guia
          </span>
          <span className="guia-hero__acoes">
            {linkWhatsappOperacao && (
              <a
                className="minha-disp-sair guia-hero__whats"
                href={linkWhatsappOperacao}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon name="message" size={16} />
                Falar com a operação
              </a>
            )}
            <Link to="/guia/sobre" className="minha-disp-sair" title="Sobre a FiaSystem">
              <Icon name="info" size={16} />
              Sobre
            </Link>
            <button type="button" className="minha-disp-sair" onClick={logout}>
              <Icon name="logout" size={16} />
              Sair
            </button>
          </span>
        </div>

        <div className="guia-hero__pessoa">
          <span className="guia-hero__avatar" aria-hidden="true">
            {iniciais(perfil?.nome)}
          </span>
          <div>
            <h1>Olá, {perfil?.nome?.split(" ")[0]}!</h1>
            <p>Informe seus dias disponíveis e confira seu perfil.</p>
          </div>
        </div>

        {guideId && !loading && (
          <div className="guia-hero__resumo">
            <div className={`guia-resumo ${janela.aberta ? "is-aberto" : "is-fechado"}`}>
              <Icon name="clock" size={16} />
              <span>
                <small>Envio</small>
                <strong>
                  {janela.aberta
                    ? `Aberto · ${formatarRestante(janela.restanteMin)}`
                    : `Abre ${janela.nomeDiaAbertura.toLowerCase()}`}
                </strong>
              </span>
            </div>
            <div className="guia-resumo">
              <Icon name="calendarCheck" size={16} />
              <span>
                <small>Semana que vem</small>
                <strong>
                  {marcadas.size} de {janela.dias.length} dias
                </strong>
              </span>
            </div>
            <div className="guia-resumo">
              <Icon name="compass" size={16} />
              <span>
                <small>Passeios aptos</small>
                <strong>{passeiosAptos.length}</strong>
              </span>
            </div>
          </div>
        )}
      </header>

      {!guideId ? (
        <div className="minha-disp-card minha-disp-aviso">
          Seu acesso ainda não está vinculado a um cadastro de guia. Fale com o
          operacional para concluir a configuração.
        </div>
      ) : loading ? (
        <div className="minha-disp-card">Carregando...</div>
      ) : (
        <>
          <nav className="minha-disp-abas">
            <button
              type="button"
              className={aba === "disponibilidade" ? "ativa" : ""}
              onClick={() => setAba("disponibilidade")}
            >
              <Icon name="calendar" size={16} /> Disponibilidade
            </button>
            <button
              type="button"
              className={aba === "perfil" ? "ativa" : ""}
              onClick={() => setAba("perfil")}
            >
              <Icon name="user" size={16} /> Meu perfil
            </button>
          </nav>

          {/* ===================== DISPONIBILIDADE ===================== */}
          {aba === "disponibilidade" && (
            <>
              <section
                className={`minha-disp-janela ${janela.aberta ? "aberta" : "fechada"} ${prazoApertado ? "guia-prazo-apertado" : ""}`}
              >
                {prazoApertado && (
                  <p className="guia-lembrete" role="alert">
                    <Icon name="alert" size={16} />
                    Você ainda não enviou sua disponibilidade da semana que vem.
                  </p>
                )}
                <div className="minha-disp-janela-titulo">
                  {janela.aberta ? (
                    <Icon name="clock" size={16} />
                  ) : (
                    <Icon name="clock" size={16} />
                  )}
                  <strong>
                    {janela.aberta
                      ? `Envio aberto — fecha em ${formatarRestante(janela.restanteMin)}`
                      : `Envio fechado — abre ${janela.nomeDiaAbertura.toLowerCase()}`}
                  </strong>
                </div>
                <p>
                  {janela.aberta
                    ? `Você pode enviar, alterar ou remover datas até ${janela.nomeDiaFechamento.toLowerCase()} às 23h59.`
                    : `Reabre ${janela.nomeDiaAbertura.toLowerCase()} (${dataBr(janela.proximaAberturaIso)}) às 00h${
                        janela.diasAteAbrir > 0
                          ? `, em ${janela.diasAteAbrir} dia${janela.diasAteAbrir > 1 ? "s" : ""}`
                          : ""
                      }.`}
                </p>
                {janela.aberta && (
                  <div
                    className="guia-janela-barra"
                    role="progressbar"
                    aria-label="Tempo da janela de envio"
                    aria-valuenow={Math.round(progressoJanela(janela.restanteMin, janelaConfig))}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <span style={{ width: `${progressoJanela(janela.restanteMin, janelaConfig)}%` }} />
                  </div>
                )}
                <p className="minha-disp-janela-info">
                  <Icon name="info" size={14} /> O envio é feito de{" "}
                  {janela.rotulo.toLowerCase()}, com as datas da semana que
                  vem (segunda a domingo). A escala será montada aos sábados
                  e os bloqueios serão enviados a você.
                </p>
              </section>

              <section className="minha-disp-alerta">
                <Icon name="alert" size={16} />
                <p>
                  <strong>Marque apenas os dias em que você está totalmente livre.</strong>{" "}
                  Se você tem algum compromisso no dia, mesmo que parcial, não
                  marque.
                </p>
              </section>

              {erroCarga ? (
                <div className="minha-disp-card minha-disp-aviso">{erroCarga}</div>
              ) : (
                <>
                  <section className="minha-disp-card guia-semana">
                    <div className="guia-semana__topo">
                      <div>
                      <h2>
                        <Icon name="calendar" size={16} /> Semana que vem: {intervalo}
                      </h2>
                      <p className="minha-disp-nota">
                        {janela.aberta
                          ? "Toque só nos dias em que você está totalmente livre."
                          : "O envio dos dias da semana que vem abre na quinta-feira."}
                      </p>
                      </div>
                      <span className="guia-contador" aria-label={`${marcadas.size} de ${janela.dias.length} dias marcados`}>
                        <strong>{marcadas.size}</strong>/{janela.dias.length}
                      </span>
                    </div>

                    {janela.aberta ? (
                      <>
                        <div className="minha-disp-dias">
                          {janela.dias.map((d) => {
                            const ativo = marcadas.has(d.date);
                            return (
                              <button
                                key={d.date}
                                type="button"
                                className={`minha-disp-dia ${ativo ? "ativo" : ""}`}
                                onClick={() => alternar(d)}
                                disabled={!podeEditar}
                                aria-pressed={ativo}
                              >
                                <span className="guia-dia__check" aria-hidden="true">
                                  {ativo && <Icon name="check" size={13} />}
                                </span>
                                <span className="nome">{d.day}</span>
                                <span className="data">{dataBr(d.date)}</span>
                                <span className="guia-dia__estado">
                                  {ativo ? "Livre" : "Toque para marcar"}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        {diasSemanaAnterior.length > 0 && (
                          <button
                            type="button"
                            className="guia-repetir"
                            onClick={repetirSemanaAnterior}
                            disabled={!podeEditar}
                          >
                            <Icon name="history" size={15} />
                            Repetir a semana anterior
                            <span>
                              {diasSemanaAnterior.map((d) => diaAbreviado(d.date)).join(" · ")}
                            </span>
                          </button>
                        )}

                        {!alterado && salvasNaSemana.size > 0 && (
                          <div className="guia-enviado">
                            <Icon name="circleCheck" size={16} />
                            <span>
                              <strong>
                                Enviado:{" "}
                                {janela.dias
                                  .filter((d) => salvasNaSemana.has(d.date))
                                  .map((d) => `${diaAbreviado(d.date)} ${dataBr(d.date).slice(0, 2)}`)
                                  .join(" · ")}
                              </strong>
                              <small>
                                {salvasNaSemana.size} dia(s)
                                {atualizadoEm
                                  ? ` · às ${atualizadoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} de ${atualizadoEm.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`
                                  : ""}
                              </small>
                            </span>
                          </div>
                        )}

                        <div className={`minha-disp-acoes ${alterado ? "guia-acoes-fixas" : ""}`}>
                          {alterado && !salvando && (
                            <span className="guia-acoes-fixas__aviso">
                              <Icon name="info" size={14} /> Alterações não salvas
                            </span>
                          )}
                          <button
                            type="button"
                            className="minha-disp-btn ghost"
                            onClick={marcarTodos}
                            disabled={!podeEditar}
                          >
                            <Icon name={todosMarcados ? "x" : "listCheck"} size={15} />
                            {todosMarcados ? "Desmarcar todos" : "Marcar todos"}
                          </button>
                          <button
                            type="button"
                            className="minha-disp-btn primary"
                            onClick={salvar}
                            disabled={!alterado || salvando}
                          >
                            <Icon name={salvando ? "loader" : "save"} size={15} className={salvando ? "ui-spin" : undefined} />
                            {salvando ? "Salvando..." : "Salvar"}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="minha-disp-chips">
                        {salvasNaSemana.size === 0 ? (
                          <p className="minha-disp-vazio">
                            Nenhum dia enviado para a semana que vem ainda.
                          </p>
                        ) : (
                          janela.dias
                            .filter((d) => salvasNaSemana.has(d.date))
                            .map((d) => (
                              <span key={d.date} className="minha-disp-chip">
                                {diaAbreviado(d.date)} {dataBr(d.date)}
                              </span>
                            ))
                        )}
                      </div>
                    )}

                    {msg && (
                      <p className={`minha-disp-msg ${msg.tipo}`}>{msg.texto}</p>
                    )}
                  </section>

                  <section className="minha-disp-card">
                    <h2>
                      <Icon name="history" size={16} /> Histórico
                    </h2>

                    <div className="minha-disp-semana-nav">
                      <button
                        type="button"
                        onClick={() => setOffsetHistorico((o) => o - 1)}
                        aria-label="Semana anterior"
                      >
                        <Icon name="chevronLeft" size={16} />
                      </button>
                      <div>
                        <strong>
                          {historicoEhSemanaAtual
                            ? "Esta semana"
                            : offsetHistorico === 1
                              ? "Semana que vem"
                              : `${dataBr(semanaHistorico.inicio)} – ${dataBr(semanaHistorico.fim)}`}
                        </strong>
                        {offsetHistorico >= 0 && (
                          <span>
                            {dataBr(semanaHistorico.inicio)} – {dataBr(semanaHistorico.fim)}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setOffsetHistorico((o) => o + 1)}
                        disabled={!podeAvancarHistorico}
                        aria-label="Próxima semana"
                      >
                        <Icon name="chevronRight" size={16} />
                      </button>
                    </div>

                    <div className="guia-calendario" role="list">
                      {semanaHistorico.dias.map((d) => (
                        <span
                          key={d.date}
                          role="listitem"
                          className={`guia-calendario__dia ${d.marcado ? "is-marcado" : ""} ${d.date === janela.hojeIso ? "is-hoje" : ""}`}
                          title={d.marcado ? "Disponível" : "Não marcado"}
                        >
                          <small>{diaAbreviado(d.date)}</small>
                          <strong>{dataBr(d.date).slice(0, 2)}</strong>
                          {d.marcado ? <Icon name="check" size={12} /> : <span className="guia-calendario__vazio" />}
                        </span>
                      ))}
                    </div>

                    {semanaHistorico.dias.some((d) => d.marcado) ? (
                      <p className="minha-disp-nota">
                        {semanaHistorico.dias.filter((d) => d.marcado).length} dia(s)
                        marcado(s) nessa semana.
                      </p>
                    ) : (
                      <p className="minha-disp-vazio">
                        Nenhum dia marcado nessa semana.
                      </p>
                    )}

                    {atualizadoEm && (
                      <p className="minha-disp-nota">
                        Última atualização: {atualizadoEm.toLocaleString("pt-BR")}
                      </p>
                    )}
                  </section>
                </>
              )}
            </>
          )}

          {/* ===================== PERFIL (somente leitura) ===================== */}
          {aba === "perfil" && (
            <>
              <p className="minha-disp-somente-leitura">
                <Icon name="info" size={14} /> Você pode atualizar os seus
                idiomas. O restante é mantido pelo operacional e não pode ser
                alterado por aqui — se algo estiver errado, fale com a equipe.
              </p>

              {erroPerfil || !guia ? (
                <div className="minha-disp-card minha-disp-aviso">
                  Não foi possível carregar seu perfil agora.
                </div>
              ) : (
                <>
                  <section className="minha-disp-card guia-perfil">
                    <div className="guia-perfil__topo">
                      <span className="guia-hero__avatar guia-hero__avatar--grande" aria-hidden="true">
                        {iniciais(guia.nome)}
                      </span>
                      <div>
                        <h2>{guia.nome}</h2>
                        <p className="minha-disp-nota">Guia Luck Receptivo · Salvador</p>
                      </div>
                    </div>
                    <div className="guia-perfil__numeros">
                      <span>
                        <strong>{idiomasSalvos.length}</strong>
                        <small>idioma(s)</small>
                      </span>
                      <span>
                        <strong>{passeiosAptos.length}</strong>
                        <small>passeio(s) apto(s)</small>
                      </span>
                      <span>
                        <strong>{guia.motoguia ? "Sim" : "Não"}</strong>
                        <small>motoguia</small>
                      </span>
                    </div>
                    <dl className="minha-disp-dados">
                      <div>
                        <dt>WhatsApp</dt>
                        <dd>{formatarWhatsapp(guia.whatsapp)}</dd>
                      </div>
                      <div>
                        <dt>Atuação</dt>
                        <dd>
                          {guia.motoguia ? (
                            <span className="minha-disp-tag">
                              <Icon name="bike" size={14} /> Motoguia
                            </span>
                          ) : (
                            "Guia"
                          )}
                        </dd>
                      </div>
                    </dl>
                  </section>

                  <section className="minha-disp-card">
                    <h2>
                      <Icon name="languages" size={16} /> Idiomas que eu guio
                    </h2>
                    <p className="minha-disp-nota">
                      Toque para marcar ou desmarcar os idiomas em que você
                      conduz passeios.
                    </p>

                    <div className="minha-disp-chips">
                      {opcoesIdiomas.map((idioma) => {
                        const ativo = idiomasMarcados.includes(idioma);
                        return (
                          <button
                            key={idioma}
                            type="button"
                            className={`minha-disp-idioma ${ativo ? "ativo" : ""}`}
                            onClick={() => alternarIdioma(idioma)}
                            disabled={salvandoIdiomas}
                            aria-pressed={ativo}
                          >
                            {ativo && <Icon name="check" size={14} />}
                            {idioma}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      className="minha-disp-btn primary"
                      onClick={salvarIdiomas}
                      disabled={!idiomasAlterados || salvandoIdiomas}
                    >
                      {salvandoIdiomas ? "Salvando..." : "Salvar idiomas"}
                    </button>

                    {idiomasAlterados && !salvandoIdiomas && (
                      <p className="minha-disp-nota">
                        Você tem alterações não salvas.
                      </p>
                    )}
                    {msgIdiomas && (
                      <p className={`minha-disp-msg ${msgIdiomas.tipo}`}>
                        {msgIdiomas.texto}
                      </p>
                    )}
                  </section>

                  <section className="minha-disp-card">
                    <h2>
                      <Icon name="star" size={16} /> Portfólio e diferencial
                    </h2>
                    {guia.diferencial ? (
                      <p className="minha-disp-texto">{guia.diferencial}</p>
                    ) : (
                      <p className="minha-disp-vazio">
                        Ainda não há um diferencial cadastrado para você.
                      </p>
                    )}
                  </section>

                  <section className="minha-disp-card">
                    <h2>
                      <Icon name="ticket" size={16} /> Catálogo de
                      passeios aptos
                      <span className="minha-disp-contador">
                        {passeiosAptos.length}
                      </span>
                    </h2>
                    {passeiosAptos.length === 0 ? (
                      <p className="minha-disp-vazio">
                        Nenhum passeio liberado para você ainda.
                      </p>
                    ) : (
                      <ul className="minha-disp-passeios">
                        {passeiosAptos.map((p) => (
                          <li key={p.id}>
                            <strong>
                              <Icon name="compass" size={15} /> {nomePasseio(p)}
                            </strong>
                            {p.descricao && <p>{p.descricao}</p>}
                            {(Array.isArray(p.frequencia)
                              ? p.frequencia.length > 0
                              : p.frequencia) && (
                              <span className="minha-disp-freq">
                                {Array.isArray(p.frequencia)
                                  ? p.frequencia.join(" · ")
                                  : p.frequencia}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default MinhaDisponibilidade;
