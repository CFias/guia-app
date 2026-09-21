import { useEffect, useMemo, useState } from "react";
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import {
  AccessTimeRounded,
  CalendarMonthRounded,
  CheckRounded,
  InfoOutlined,
  LanguageRounded,
  LocalActivityRounded,
  LockClockRounded,
  LogoutRounded,
  PersonRounded,
  StarRounded,
  TwoWheelerRounded,
  WarningAmberRounded,
} from "@mui/icons-material";
import { db } from "../../Services/Services/firebase";
import { useAuth } from "../../Context/AuthContext";
import { getLanguages } from "../../Services/Services/languages.service";
import {
  dataBr,
  diaAbreviado,
  formatarRestante,
  getEstadoJanela,
} from "../../Services/Utils/janelaDisponibilidade";
import "./styles.css";

const nomePasseio = (p) =>
  p?.nome || p?.externalName || p?.name || p?.titulo || "Passeio sem nome";

const formatarWhatsapp = (valor) => {
  const n = String(valor || "")
    .replace(/\D/g, "")
    .slice(0, 11);
  if (n.length < 10) return valor || "—";
  const ddd = n.slice(0, 2);
  return n.length === 11
    ? `(${ddd}) ${n.slice(2, 7)}-${n.slice(7)}`
    : `(${ddd}) ${n.slice(2, 6)}-${n.slice(6)}`;
};

const MinhaDisponibilidade = () => {
  const { perfil, user, logout } = useAuth();
  const guideId = perfil?.guideId;

  const [aba, setAba] = useState("disponibilidade");

  // Relógio: reavalia a janela a cada 30 s (abre/fecha sozinha, sem recarregar).
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  const janela = useMemo(() => getEstadoJanela(agora), [agora]);

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
    () =>
      new Set(salvos.filter((s) => datasSemana.has(s.date)).map((s) => s.date)),
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
    const agoraMesmo = getEstadoJanela(new Date());
    if (!agoraMesmo.aberta) {
      setAgora(new Date());
      setMsg({
        tipo: "erro",
        texto:
          "A janela de envio acabou de fechar. Suas alterações não foram salvas.",
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
        antes.size === 0
          ? "envio"
          : depois.size === 0
            ? "cancelamento"
            : "alteracao";
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
      setMsgIdiomas({
        tipo: "ok",
        texto: "Idiomas salvos! O operacional foi avisado.",
      });
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

  const proximosSalvos = salvos.filter((s) => s.date >= janela.hojeIso);
  const intervalo = `${dataBr(janela.semanaInicio)} a ${dataBr(janela.semanaFim)}`;
  const todosMarcados = janela.dias.every((d) => marcadas.has(d.date));

  return (
    <div className="minha-disp-page">
      <header className="minha-disp-topo">
        <div>
          <h1>
            <CalendarMonthRounded /> Olá, {perfil?.nome?.split(" ")[0]}!
          </h1>
          <p>Informe seus dias disponíveis e confira seu perfil.</p>
        </div>
        <button type="button" className="minha-disp-sair" onClick={logout}>
          <LogoutRounded fontSize="small" />
          Sair
        </button>
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
              <CalendarMonthRounded fontSize="small" /> Disponibilidade
            </button>
            <button
              type="button"
              className={aba === "perfil" ? "ativa" : ""}
              onClick={() => setAba("perfil")}
            >
              <PersonRounded fontSize="small" /> Meu perfil
            </button>
          </nav>

          {/* ===================== DISPONIBILIDADE ===================== */}
          {aba === "disponibilidade" && (
            <>
              <section
                className={`minha-disp-janela ${janela.aberta ? "aberta" : "fechada"}`}
              >
                <div className="minha-disp-janela-titulo">
                  {janela.aberta ? (
                    <AccessTimeRounded fontSize="small" />
                  ) : (
                    <LockClockRounded fontSize="small" />
                  )}
                  <strong>
                    {janela.aberta
                      ? `Envio aberto — fecha em ${formatarRestante(janela.restanteMin)}`
                      : "Envio fechado"}
                  </strong>
                </div>
                <p>
                  {janela.aberta
                    ? "Você pode enviar, alterar ou remover datas até sexta-feira às 23h59."
                    : `Reabre na quinta-feira (${dataBr(janela.proximaAberturaIso)}) às 00h${
                        janela.diasAteAbrir > 0
                          ? `, em ${janela.diasAteAbrir} dia${janela.diasAteAbrir > 1 ? "s" : ""}`
                          : ""
                      }.`}
                </p>
                <p className="minha-disp-janela-info">
                  <InfoOutlined fontSize="inherit" /> O envio é feito da quinta
                  (00h) à sexta-feira (23h59), com as datas da semana que vem
                  (segunda a domingo). A escala será montada aos sábados e os
                  bloqueios serão enviados a você.
                </p>
              </section>

              <section className="minha-disp-alerta">
                <WarningAmberRounded fontSize="small" />
                <p>
                  <strong>
                    Marque apenas os dias em que você está totalmente livre.
                  </strong>{" "}
                  Se você tem algum compromisso no dia, mesmo que parcial, não
                  marque.
                </p>
              </section>

              {erroCarga ? (
                <div className="minha-disp-card minha-disp-aviso">
                  {erroCarga}
                </div>
              ) : (
                <>
                  <section className="minha-disp-card">
                    <div>
                      <h2>Semana que vem: {intervalo}</h2>
                      <p className="minha-disp-nota">
                        {janela.aberta
                          ? "Toque só nos dias em que você está totalmente livre."
                          : "O envio dos dias da semana que vem abre na quinta-feira."}
                      </p>
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
                                <span className="nome">{d.day}</span>
                                <span className="data">{dataBr(d.date)}</span>
                                {ativo && (
                                  <CheckRounded
                                    fontSize="small"
                                    className="check"
                                  />
                                )}
                              </button>
                            );
                          })}
                        </div>

                        <div className="minha-disp-acoes">
                          <button
                            type="button"
                            className="minha-disp-btn ghost"
                            onClick={marcarTodos}
                            disabled={!podeEditar}
                          >
                            {todosMarcados ? "Desmarcar todos" : "Marcar todos"}
                          </button>
                          <button
                            type="button"
                            className="minha-disp-btn primary"
                            onClick={salvar}
                            disabled={!alterado || salvando}
                          >
                            {salvando ? "Salvando..." : "Salvar"}
                          </button>
                        </div>

                        {alterado && !salvando && (
                          <p className="minha-disp-nota">
                            Você tem alterações não salvas.
                          </p>
                        )}
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
                      <p className={`minha-disp-msg ${msg.tipo}`}>
                        {msg.texto}
                      </p>
                    )}
                  </section>

                  <section className="minha-disp-card">
                    <h2>Todos os dias que você já informou</h2>
                    {proximosSalvos.length === 0 ? (
                      <p className="minha-disp-vazio">
                        Nenhum dia marcado ainda.
                      </p>
                    ) : (
                      <div className="minha-disp-chips">
                        {proximosSalvos.map((s) => (
                          <span key={s.date} className="minha-disp-chip">
                            {diaAbreviado(s.date)} {dataBr(s.date)}
                          </span>
                        ))}
                      </div>
                    )}
                    {atualizadoEm && (
                      <p className="minha-disp-nota">
                        Última atualização:{" "}
                        {atualizadoEm.toLocaleString("pt-BR")}
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
                <InfoOutlined fontSize="inherit" /> Você pode atualizar os seus
                idiomas. O restante é mantido pelo operacional e não pode ser
                alterado por aqui — se algo estiver errado, fale com a equipe.
              </p>

              {erroPerfil || !guia ? (
                <div className="minha-disp-card minha-disp-aviso">
                  Não foi possível carregar seu perfil agora.
                </div>
              ) : (
                <>
                  <section className="minha-disp-card">
                    <h2>
                      <PersonRounded fontSize="small" /> {guia.nome}
                    </h2>
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
                              <TwoWheelerRounded fontSize="inherit" /> Motoguia
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
                      <LanguageRounded fontSize="small" /> Idiomas que eu guio
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
                            {ativo && <CheckRounded fontSize="inherit" />}
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
                      <StarRounded fontSize="small" /> Portfólio e diferencial
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
                      <LocalActivityRounded fontSize="small" /> Catálogo de
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
                            <strong>{nomePasseio(p)}</strong>
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
