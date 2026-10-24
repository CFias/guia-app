import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import Icon from "../ui/Icon";
import CartaoInstalar from "../ui/CartaoInstalar";
import { definirTituloAba } from "../Shell/tituloAba";
import {
  distanciaMetros,
  etapasDoTipo,
  gravarInscricaoNasEscalas,
  gravarRetorno,
  gravarPosicao,
  inscreverPush,
  lembrarLinkDoApp,
  msDoTimestamp,
  pushDisponivel,
  registrarServiceWorker,
  horaDoTimestamp,
  linkGoogleMaps,
  linkWaze,
  localizarEndereco,
  marcarEtapaMotorista,
  PORTAS_DESEMBARQUE,
  ouvirMotoristaDia,
  ouvirStatusEscala,
  pegarPosicao,
  situacaoDoServico,
} from "../../Services/Services/viagemMotorista";
import { useTheme } from "../../Context/ThemeContext";
import "./motorista.css";

/* LINK DO DIA DO MOTORISTA (/m/:token — sem login).
   Os serviços do motorista no dia, um de cada vez, com um botão grande para
   a próxima etapa (Cheguei / Posicionado → Iniciar viagem → Finalizar). Cada
   toque grava a hora e a localização. Chegada: quando a base recepciona os
   passageiros, o celular toca um aviso repetido até o motorista confirmar.
   Em viagem: rota no Maps/Waze e, perto do destino, o card "Chegando". */

const NOME_TIPO = { IN: "Chegada", OUT: "Saída", TRF: "Transfer", PASSEIO: "Passeio" };
const ICONE_TIPO = { IN: "planeLanding", OUT: "planeTakeoff", PASSEIO: "compass" };
const PERTO_METROS = 400;
const POSICAO_A_CADA = 60 * 1000;

const minutosDe = (hhmm) => {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  return Number.isFinite(h) ? h * 60 + (m || 0) : null;
};
const agoraEmMinutos = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};
const isoHoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const textoMin = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// destino da etapa atual: OUT antes de sair = hotel; em viagem = destino final
const destinoAgora = (s, ev) => {
  const emViagem = !!ev?.iniciado?.em;
  if (s.tipo === "OUT") return emViagem ? s.destinos[0] || "Aeroporto de Salvador" : s.origens[0] || "";
  if (s.tipo === "IN") return emViagem ? s.destinos[0] || "" : s.origens[0] || "Aeroporto de Salvador";
  return emViagem ? s.destinos[0] || "" : s.origens[0] || "";
};

/* ---------------- som do aviso (WebAudio, sem arquivo) ---------------- */
let audioCtx = null;
const prepararSom = () => {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    audioCtx = audioCtx || new AC();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return true;
  } catch {
    return false;
  }
};
const bip = () => {
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime;
  [0, 0.22, 0.44].forEach((d, i) => {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "sine";
    o.frequency.value = i === 2 ? 1175 : 880;
    g.gain.setValueAtTime(0.0001, t0 + d);
    g.gain.exponentialRampToValueAtTime(0.35, t0 + d + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.18);
    o.connect(g).connect(audioCtx.destination);
    o.start(t0 + d);
    o.stop(t0 + d + 0.2);
  });
};

// embutido: dentro do painel do fornecedor que é o próprio motorista (sem o topo).
// diaLocal: os serviços já carregados no painel — a tela abre na hora, sem
// esperar o documento do link; garantirToken cria o link no primeiro toque.
// diasApp: no app (link fixo do motorista) — { lista: [datas], atual, aoTrocar }
const MotoristaDia = ({ token: tokenProp, embutido = false, diaLocal = null, garantirToken = null, diasApp = null }) => {
  const { token: tokenRota } = useParams();
  const token = tokenProp || tokenRota || "";
  const { theme, toggleTheme } = useTheme() || {};
  const [docDia, setDocDia] = useState(undefined); // undefined = carregando; null = link inválido
  const dia = diaLocal
    ? { ...diaLocal, eventos: docDia?.eventos || {}, ultimaPosicao: docDia?.ultimaPosicao || null }
    : docDia;
  const [status, setStatus] = useState({}); // escalaId → status do painel do aeroporto
  const [avisosAtivos, setAvisosAtivos] = useState(false);
  const [salvando, setSalvando] = useState("");
  const [abertas, setAbertas] = useState(() => new Set());
  const [vistos, setVistos] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(`m.vistos.${token || "proprio"}`) || "[]"));
    } catch {
      return new Set();
    }
  });
  const [minuto, setMinuto] = useState(agoraEmMinutos);
  const [posicao, setPosicao] = useState(null);
  const [alvo, setAlvo] = useState(null); // { chave, ponto, nome }
  const [aviso, setAviso] = useState("");
  const wakeRef = useRef(null);

  useEffect(() => {
    if (!embutido) definirTituloAba("Meus serviços");
  }, [embutido]);

  useEffect(() => (token ? ouvirMotoristaDia(token, setDocDia, () => setDocDia(null)) : undefined), [token]);

  useEffect(() => {
    const t = setInterval(() => setMinuto(agoraEmMinutos()), 20000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!aviso) return undefined;
    const t = setTimeout(() => setAviso(""), 3500);
    return () => clearTimeout(t);
  }, [aviso]);

  const servicos = useMemo(() => [...(dia?.servicos || [])].sort((a, b) => String(a.hora).localeCompare(String(b.hora))), [dia]);
  const eventos = dia?.eventos || {};
  const ehHoje = dia?.data === isoHoje();

  // sinal do painel do aeroporto (só as chegadas)
  const escalasIn = servicos
    .filter((s) => s.tipo === "IN" && s.escalaId)
    .map((s) => s.escalaId)
    .join("|");
  useEffect(() => {
    if (!dia || !escalasIn) return undefined;
    const paradas = escalasIn.split("|").map((id) => ouvirStatusEscala(dia.base || "ssa", dia.data, id, (st) => setStatus((x) => ({ ...x, [id]: st }))));
    return () => paradas.forEach((p) => p?.());
  }, [dia?.base, dia?.data, escalasIn]); // eslint-disable-line react-hooks/exhaustive-deps

  // chegadas recepcionadas que o motorista ainda não confirmou → aviso repetido.
  // A confirmação vale para AQUELA recepção (chave + hora): se a base desfizer
  // e recepcionar de novo, avisa de novo. Já posicionado também recebe o aviso
  // (é a hora de encostar); só não avisa depois de iniciar a viagem.
  const chaveDoAviso = (s) => `${s.chave}|${msDoTimestamp(status[s.escalaId]?.recepcionadoEm)}`;
  const pendentesDeAviso = servicos.filter(
    (s) => s.tipo === "IN" && status[s.escalaId]?.recepcionado && !eventos[s.chave]?.iniciado?.em && !eventos[s.chave]?.finalizado?.em && !vistos.has(chaveDoAviso(s)),
  );
  const alerta = pendentesDeAviso[0] || null;
  useEffect(() => {
    if (!alerta) return undefined;
    const tocar = () => {
      bip();
      try {
        navigator.vibrate?.([400, 200, 400]);
      } catch {
        /* sem vibração */
      }
    };
    tocar();
    const t = setInterval(tocar, 2500);
    return () => clearInterval(t);
  }, [alerta ? chaveDoAviso(alerta) : ""]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- retorno para a base (ícones no card do painel do aeroporto) ----
  const retornar = (s, campos) => {
    if (!dia || s.tipo !== "IN" || !s.escalaId) return;
    gravarRetorno(dia.base || "ssa", dia.data, s.escalaId, { motoristaNome: dia.motoristaNome || "", ...campos });
  };
  // abriu o app: a base vê que este motorista usa a ferramenta
  const conectados = useRef(new Set());
  useEffect(() => {
    if (!dia || !ehHoje) return;
    servicos.forEach((s) => {
      const k = `${dia.data}|${s.chave}`;
      if (s.tipo !== "IN" || conectados.current.has(k)) return;
      conectados.current.add(k);
      retornar(s, { conectadoEm: new Date() });
    });
  }, [dia?.data, escalasIn, ehHoje]); // eslint-disable-line react-hooks/exhaustive-deps
  // o aviso apareceu na tela do motorista: a base vê "Motorista viu o aviso"
  const avisosRetornados = useRef(new Set());
  useEffect(() => {
    if (!alerta) return;
    const k = chaveDoAviso(alerta);
    if (avisosRetornados.current.has(k)) return;
    avisosRetornados.current.add(k);
    retornar(alerta, { avisadoEm: new Date(), recepcaoMs: msDoTimestamp(status[alerta.escalaId]?.recepcionadoEm) });
  }, [alerta ? chaveDoAviso(alerta) : ""]); // eslint-disable-line react-hooks/exhaustive-deps

  // o navegador só deixa tocar som depois de um toque na tela: destrava no primeiro toque
  useEffect(() => {
    const destravar = () => prepararSom();
    document.addEventListener("pointerdown", destravar, { once: true });
    return () => document.removeEventListener("pointerdown", destravar);
  }, []);

  const marcarVisto = (chave) =>
    setVistos((v) => {
      const n = new Set(v).add(chave);
      try {
        localStorage.setItem(`m.vistos.${token || "proprio"}`, JSON.stringify([...n]));
      } catch {
        /* sem armazenamento */
      }
      return n;
    });

  // serviço em andamento (o primeiro não concluído) e a viagem em curso
  const atual = servicos.find((s) => !situacaoDoServico(s.tipo, eventos[s.chave]).concluido) || null;
  const emViagem = atual && eventos[atual.chave]?.iniciado?.em && !eventos[atual.chave]?.finalizado?.em ? atual : null;

  // em viagem: posição a cada minuto (para a Luck) e o destino no mapa (para o card "Chegando")
  useEffect(() => {
    if (!emViagem || !navigator.geolocation) return undefined;
    let ultimoEnvio = 0;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude, precisao: Math.round(p.coords.accuracy || 0) };
        setPosicao(pos);
        if (Date.now() - ultimoEnvio > POSICAO_A_CADA) {
          ultimoEnvio = Date.now();
          if (token) gravarPosicao(token, pos).catch(() => {});
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 20000, timeout: 30000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [emViagem?.chave, token]); // eslint-disable-line react-hooks/exhaustive-deps

  const destinoViagem = emViagem ? destinoAgora(emViagem, eventos[emViagem.chave]) : "";
  useEffect(() => {
    if (!emViagem || !destinoViagem) return undefined;
    let vivo = true;
    localizarEndereco(destinoViagem).then((ponto) => vivo && setAlvo(ponto ? { chave: emViagem.chave, ponto, nome: destinoViagem } : null));
    return () => {
      vivo = false;
    };
  }, [emViagem?.chave, destinoViagem]); // eslint-disable-line react-hooks/exhaustive-deps
  const distancia = emViagem && alvo?.chave === emViagem.chave ? distanciaMetros(posicao, alvo.ponto) : Infinity;
  const chegando = distancia < PERTO_METROS;

  // ---- app no celular: notificação com o app fechado e "instalar" ----
  const [push, setPush] = useState(() => (typeof Notification !== "undefined" && Notification.permission === "granted" ? "ok" : ""));
  useEffect(() => {
    registrarServiceWorker();
    if (embutido) lembrarLinkDoApp(`${window.location.origin}/fornecedor`);
  }, [embutido]);
  // com a permissão já dada, a inscrição acompanha as chegadas do dia
  useEffect(() => {
    if (push !== "ok" || !dia || !escalasIn) return;
    inscreverPush().then((sub) => sub && gravarInscricaoNasEscalas(sub, dia.base || "ssa", dia.data, escalasIn.split("|")));
  }, [push, dia?.base, dia?.data, escalasIn]); // eslint-disable-line react-hooks/exhaustive-deps

  const ativarAvisos = async () => {
    const ok = prepararSom();
    if (ok) bip();
    if (pushDisponivel()) {
      const sub = await inscreverPush();
      setPush(sub ? "ok" : "negado");
      if (sub && dia && escalasIn) gravarInscricaoNasEscalas(sub, dia.base || "ssa", dia.data, escalasIn.split("|"));
    }
    try {
      wakeRef.current = await navigator.wakeLock?.request?.("screen");
    } catch {
      /* sem bloqueio de tela */
    }
    pegarPosicao(); // já pede a permissão de localização
    setAvisosAtivos(true);
  };
  // a tela volta a ficar acesa quando o motorista volta para o app
  useEffect(() => {
    if (!avisosAtivos) return undefined;
    const voltar = async () => {
      if (document.visibilityState === "visible") {
        try {
          wakeRef.current = await navigator.wakeLock?.request?.("screen");
        } catch {
          /* ok */
        }
      }
    };
    document.addEventListener("visibilitychange", voltar);
    return () => document.removeEventListener("visibilitychange", voltar);
  }, [avisosAtivos]);

  // chegada (IN): "Cheguei no desembarque" pergunta a porta antes de gravar
  const [portaPara, setPortaPara] = useState(null); // { s, etapa }
  const marcar = async (s, etapa, desfazer = false, extra = null) => {
    if (!desfazer && !extra && s.tipo === "IN" && etapa.id === "posicionado") {
      setPortaPara({ s, etapa });
      return;
    }
    setPortaPara(null);
    setSalvando(`${s.chave}|${etapa.id}`);
    try {
      if (desfazer) {
        if (!window.confirm(`Desfazer "${etapa.feito}"?`)) return;
        await marcarEtapaMotorista(token, s.chave, etapa.id, null);
        retornar(s, { [`${etapa.id}Em`]: null, ...(etapa.id === "posicionado" ? { porta: null } : {}) });
      } else {
        // localização e link em paralelo (o link do fornecedor pode ainda não existir)
        const [pos, t] = await Promise.all([pegarPosicao(), token ? token : garantirToken?.()]);
        if (!t) throw new Error("sem link");
        await marcarEtapaMotorista(t, s.chave, etapa.id, { ...(pos ? pos : { semLocalizacao: true }), ...(extra || {}) });
        retornar(s, { [`${etapa.id}Em`]: new Date(), ...(extra?.porta ? { porta: extra.porta } : {}) });
        if (etapa.id === "posicionado" && status[s.escalaId]?.recepcionado) marcarVisto(chaveDoAviso(s));
        const feito = extra?.porta ? `Porta ${extra.porta}` : etapa.feito;
        setAviso(pos ? `${feito} · localização enviada` : `${feito} · sem localização (permita o acesso à localização)`);
      }
    } catch (e) {
      console.error(e);
      window.alert("Não foi possível salvar. Confira a internet e tente de novo.");
    } finally {
      setSalvando("");
    }
  };

  /* ---------------- estados de carga ---------------- */
  if (dia === undefined) {
    return (
      <div className="mt mt--centro">
        <Icon name="loader" size={22} className="ui-spin" /> Carregando seus serviços…
      </div>
    );
  }
  if (!dia) {
    return (
      <div className="mt mt--centro">
        <Icon name="alert" size={26} />
        <b>Link inválido</b>
        <span>Peça ao seu fornecedor para enviar o link de novo.</span>
      </div>
    );
  }

  const cardServico = (s, destaque) => {
    const ev = eventos[s.chave] || {};
    const st = situacaoDoServico(s.tipo, ev);
    const etapas = etapasDoTipo(s.tipo);
    const rec = s.tipo === "IN" ? status[s.escalaId] : null;
    const min = minutosDe(s.hora);
    const liberaEm = s.tipo === "OUT" && min !== null ? Math.max(0, min - (dia.minutosAntesCheguei ?? 60)) : null;
    const travado = st.proxima?.id === "posicionado" && liberaEm !== null && ehHoje && minuto < liberaEm;
    const dest = destinoAgora(s, ev);
    const aberto = abertas.has(s.chave);
    return (
      <li key={s.chave} className={`mt-serv is-${String(s.tipo).toLowerCase()} ${st.concluido ? "is-ok" : ""} ${destaque ? "is-atual" : ""}`}>
        <div className="mt-serv__cab">
          <span className="mt-serv__hora">{s.hora || "--:--"}</span>
          <span className="mt-serv__tipo">
            <Icon name={ICONE_TIPO[s.tipo] || "car"} size={13} /> {NOME_TIPO[s.tipo] || s.tipo}
          </span>
          <span className="mt-serv__pax">
            <Icon name="users" size={13} /> {s.pax}
          </span>
        </div>
        <b className="mt-serv__desc">{s.descricao}</b>
        <div className="mt-serv__meta">
          <span>
            <Icon name="car" size={12} /> {s.veiculo}
            {s.placa ? ` · ${s.placa}` : ""}
          </span>
          {s.voos.length > 0 && (
            <span>
              <Icon name="planeLanding" size={12} /> {s.voos.join(", ")}
            </span>
          )}
        </div>

        {s.tipo === "IN" && !st.concluido && (
          <div className={`mt-rec ${rec?.recepcionado ? "is-ok" : ""}`}>
            <Icon name={rec?.recepcionado ? "circleCheck" : "clock"} size={14} />
            {rec?.recepcionado ? (
              <span>
                <b>Passageiros recepcionados</b> {horaDoTimestamp(rec.recepcionadoEm)}
                {rec.recepcionadoPor ? ` · ${rec.recepcionadoPor}` : ""}
                {rec.embarcado ? " · embarcados" : ""}
              </span>
            ) : (
              <span>Aguardando a Luck recepcionar os passageiros no desembarque</span>
            )}
          </div>
        )}

        <ol className="mt-passos">
          {etapas.map((e, k) => {
            const ok = !!ev[e.id]?.em;
            const prox = st.proxima?.id === e.id;
            return (
              <li key={e.id} className={`${ok ? "is-ok" : ""} ${prox ? "is-prox" : ""}`}>
                <span>{ok ? <Icon name="check" size={11} /> : k + 1}</span>
                <small>
                  {ok ? (ev[e.id]?.porta ? `Porta ${ev[e.id].porta}` : e.feito) : e.acao}
                  {ok && <em>{horaDoTimestamp(ev[e.id].em)}</em>}
                </small>
              </li>
            );
          })}
        </ol>

        {!st.concluido && (
          <>
            {dest && (
              <div className="mt-nav">
                <span>
                  <Icon name="mapPin" size={13} /> {ev.iniciado?.em ? "Destino" : s.tipo === "IN" ? "Embarque" : "Buscar em"}: <b>{dest}</b>
                </span>
                <span className="mt-nav__btns">
                  <a href={linkGoogleMaps(dest)} target="_blank" rel="noopener noreferrer">
                    Maps
                  </a>
                  <a href={linkWaze(dest)} target="_blank" rel="noopener noreferrer">
                    Waze
                  </a>
                </span>
              </div>
            )}
            <button
              type="button"
              className={`mt-botao is-${st.proxima.id}`}
              onClick={() => marcar(s, st.proxima)}
              disabled={!!salvando || travado}
            >
              <span className="mt-botao__ic">
                {salvando === `${s.chave}|${st.proxima.id}` ? <Icon name="loader" size={18} className="ui-spin" /> : <Icon name={travado ? "lock" : st.proxima.id === "iniciado" ? "navigation" : st.proxima.id === "finalizado" ? "flag" : "mapPin"} size={18} />}
              </span>
              <span className="mt-botao__txt">
                <b>{st.proxima.acao}</b>
                <small>{travado ? `libera às ${textoMin(liberaEm)} (${dia.minutosAntesCheguei ?? 60} min antes)` : st.proxima.dica}</small>
              </span>
            </button>
          </>
        )}
        {st.ultima && (
          <button type="button" className="mt-desfazer" onClick={() => marcar(s, st.ultima, true)} disabled={!!salvando}>
            <Icon name="undo" size={12} /> Desfazer "{st.ultima.feito}"
          </button>
        )}

        {s.reservas.length > 0 && (
          <>
            <button
              type="button"
              className="mt-res-btn"
              onClick={() =>
                setAbertas((a) => {
                  const n = new Set(a);
                  if (n.has(s.chave)) n.delete(s.chave);
                  else n.add(s.chave);
                  return n;
                })
              }
              aria-expanded={aberto}
            >
              {aberto ? "Fechar passageiros" : `Ver passageiros (${s.reservas.length})`} <Icon name="chevronDown" size={13} />
            </button>
            {aberto && (
              <ul className="mt-res">
                {s.reservas.map((r, i) => (
                  <li key={i}>
                    <b>{r.titular || "Sem nome"}</b> · {r.pax} pax{r.voo ? ` · ${r.voo}` : ""}
                    <small>
                      {r.origem || "—"} → {r.destino || "—"}
                    </small>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </li>
    );
  };

  const proximos = servicos.filter((s) => s !== atual && !situacaoDoServico(s.tipo, eventos[s.chave]).concluido);
  const concluidos = servicos.filter((s) => situacaoDoServico(s.tipo, eventos[s.chave]).concluido);

  return (
    <div className={`mt ${embutido ? "mt--embutido" : ""}`}>
      {!embutido && (
      <header className="mt-topo">
        <span className="mt-topo__ic">
          <Icon name="car" size={18} />
        </span>
        <span className="mt-topo__txt">
          <b>Olá, {String(dia.motoristaNome || "motorista").split(" ")[0]}</b>
          <small>
            {new Date(`${dia.data}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" })} · {dia.fornecedorNome} · Luck Receptivo
          </small>
        </span>
        {toggleTheme && (
          <button type="button" className="mt-topo__tema" onClick={toggleTheme} aria-label={theme === "light" ? "Usar tema escuro" : "Usar tema claro"} title={theme === "light" ? "Tema escuro" : "Tema claro"}>
            <Icon name={theme === "light" ? "moon" : "sun"} size={16} />
          </button>
        )}
      </header>
      )}

      <main className="mt-corpo">
        {diasApp && diasApp.lista.length > 1 && (
          <div className="mt-dias" role="tablist" aria-label="Dia">
            {diasApp.lista.map((d) => (
              <button key={d} type="button" role="tab" aria-selected={d === diasApp.atual} className={d === diasApp.atual ? "is-on" : ""} onClick={() => diasApp.aoTrocar(d)}>
                {d === isoHoje() ? "Hoje" : new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}
              </button>
            ))}
          </div>
        )}

        {!embutido && <CartaoInstalar chave="motorista.instalarAdiado" />}

        {push === "negado" && (
          <p className="mt-nota">
            <Icon name="bell" size={14} /> As notificações estão bloqueadas neste celular. Libere nas configurações do navegador para receber o aviso com a tela
            apagada.
          </p>
        )}

        {!avisosAtivos && (
          <button type="button" className="mt-ativar" onClick={ativarAvisos}>
            <Icon name="bell" size={18} />
            <span>
              <b>Toque para ativar os avisos</b>
              <small>Som quando o passageiro for recepcionado, tela sempre acesa e localização. Deixe esta tela aberta.</small>
            </span>
          </button>
        )}

        {!ehHoje && (
          <p className="mt-nota">
            <Icon name="info" size={14} /> Estes serviços são de {new Date(`${dia.data}T12:00:00`).toLocaleDateString("pt-BR")}. Os botões funcionam no dia.
          </p>
        )}

        {servicos.length === 0 ? (
          <div className="mt-vazio">
            <Icon name="circleCheck" size={22} />
            <b>Nenhum serviço para você neste dia.</b>
          </div>
        ) : (
          <>
            {atual ? (
              <section>
                <h2 className="mt-secao">Agora</h2>
                <ul className="mt-lista">{cardServico(atual, true)}</ul>
              </section>
            ) : (
              <div className="mt-vazio is-ok">
                <Icon name="circleCheck" size={26} />
                <b>Todos os serviços finalizados. Bom descanso!</b>
              </div>
            )}
            {proximos.length > 0 && (
              <section>
                <h2 className="mt-secao">Depois ({proximos.length})</h2>
                <ul className="mt-lista">{proximos.map((s) => cardServico(s, false))}</ul>
              </section>
            )}
            {concluidos.length > 0 && (
              <section>
                <h2 className="mt-secao">Finalizados ({concluidos.length})</h2>
                <ul className="mt-lista is-feitos">{concluidos.map((s) => cardServico(s, false))}</ul>
              </section>
            )}
          </>
        )}
      </main>

      {/* chegando ao destino */}
      {chegando && emViagem && !alerta && (
        <div className="mt-chegando" role="status">
          <Icon name="mapPin" size={18} />
          <span>
            <b>Você está chegando</b>
            <small>{alvo?.nome}</small>
          </span>
          <button type="button" onClick={() => marcar(emViagem, etapasDoTipo(emViagem.tipo)[2])} disabled={!!salvando}>
            {etapasDoTipo(emViagem.tipo)[2].acao}
          </button>
        </div>
      )}

      {/* aviso repetido: passageiro recepcionado (compacto) */}
      {alerta && (() => {
        const jaChegou = !!eventos[alerta.chave]?.posicionado?.em;
        const primeiroNome = String(dia.motoristaNome || "").trim().split(" ")[0];
        return (
          <div className="mt-alerta" role="alertdialog" aria-modal="true" aria-label="Passageiros recepcionados">
            <div className="mt-alerta__caixa">
              <div className="mt-alerta__topo">
                <span className="mt-alerta__ic">
                  <Icon name="bell" size={18} />
                </span>
                <span>
                  <small>Passageiros recepcionados</small>
                  <b>{jaChegou ? `${primeiroNome || "Pronto"}, os passageiros estão indo até você` : `${primeiroNome ? `${primeiroNome}, posicione` : "Posicione"} no desembarque`}</b>
                </span>
              </div>
              <div className="mt-alerta__rota">
                <Icon name="mapPin" size={14} />
                <span>
                  <b>{alerta.descricao || `${alerta.origens?.[0] || "Aeroporto"} → ${alerta.destinos?.[0] || "destino não informado"}`}</b>
                  <small>
                    {alerta.hora ? `${alerta.hora} · ` : ""}
                    {alerta.voos.length ? `${alerta.voos.join(", ")} · ` : ""}
                    {alerta.pax} pax · {alerta.veiculo}
                  </small>
                </span>
              </div>
              <div className="mt-alerta__acoes">
                <button
                  type="button"
                  className="mt-alerta__btn"
                  onClick={() => {
                    if (!jaChegou) retornar(alerta, { acaminhoEm: new Date(), recepcaoMs: msDoTimestamp(status[alerta.escalaId]?.recepcionadoEm) });
                    marcarVisto(chaveDoAviso(alerta));
                  }}
                >
                  {jaChegou ? "Ok" : "Estou a caminho"}
                </button>
                {!jaChegou && (
                  <button type="button" className="mt-alerta__btn is-primario" onClick={() => marcar(alerta, etapasDoTipo("IN")[0])} disabled={!!salvando}>
                    <Icon name="mapPin" size={15} /> Cheguei
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* em qual porta do desembarque o motorista está */}
      {portaPara && (
        <div className="mt-porta" role="dialog" aria-modal="true" aria-label="Em qual porta você está?">
          <button type="button" className="mt-porta__fundo" onClick={() => setPortaPara(null)} aria-label="Fechar" />
          <div className="mt-porta__caixa">
            <b>Em qual porta do desembarque você está?</b>
            <small>A base vê a porta e leva os passageiros até você.</small>
            <div className="mt-porta__opcoes">
              {PORTAS_DESEMBARQUE.map((p) => (
                <button key={p} type="button" onClick={() => marcar(portaPara.s, portaPara.etapa, false, { porta: p })} disabled={!!salvando}>
                  <small>Porta</small>
                  {p}
                </button>
              ))}
            </div>
            <button type="button" className="mt-porta__cancelar" onClick={() => setPortaPara(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {aviso && (
        <div className="mt-toast" role="status">
          <Icon name="circleCheck" size={15} /> {aviso}
        </div>
      )}
    </div>
  );
};

export default MotoristaDia;
