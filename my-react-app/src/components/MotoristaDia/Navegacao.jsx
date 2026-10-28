import { useEffect, useRef, useState } from "react";
import Icon from "../ui/Icon";
import MapaRota from "./MapaRota";
import MapaGoogle from "./MapaGoogle";
import { temGoogle } from "../../Services/Services/googleMapas";
import {
  buscarRota,
  iconeManobra,
  metros,
  pontoDoLugar,
  progressoNaRota,
  textoDistancia,
  textoManobra,
  textoTempo,
} from "../../Services/Services/rotaNavegacao";
import { linkGoogleMaps, linkWaze } from "../../Services/Services/viagemMotorista";

/* NAVEGAÇÃO DENTRO DO APP: tela cheia com o mapa, a rota traçada, a próxima
   manobra ("Em 300 m, vire à direita na Av. Paralela"), quanto falta e o
   botão da etapa (Cheguei…) — o motorista não precisa sair do app.
   Saiu da rota: recalcula. Voz opcional (fala a manobra perto dela). */

const FORA_DA_ROTA_M = 70;
const RECALCULO_MIN_MS = 20000;
const RECALCULO_GOOGLE_MS = 45000;

const falar = (texto) => {
  try {
    const u = new window.SpeechSynthesisUtterance(texto);
    u.lang = "pt-BR";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    /* sem voz neste aparelho */
  }
};

// última rota calculada nesta sessão: reabrir o mapa para o mesmo destino
// não pede outra (no Google, cada rota conta na cota)
let ultimaRota = null; // { destinoNome, rota, em }
const ROTA_VALE_MS = 10 * 60 * 1000;
const rotaGuardada = (nome) => (ultimaRota && ultimaRota.destinoNome === nome && Date.now() - ultimaRota.em < ROTA_VALE_MS ? ultimaRota.rota : null);

// onSairPara(app): o motorista foi para o Maps/Waze (a base fica sabendo)
const Navegacao = ({ destinoNome, base = "ssa", titulo = "", acao = null, onFechar, onSairPara }) => {
  const [pos, setPos] = useState(null);
  const [gps, setGps] = useState("buscando"); // buscando | ok | negado | erro
  const [destino, setDestino] = useState(undefined); // undefined = buscando; null = não achou
  const [rota, setRota] = useState(() => rotaGuardada(destinoNome));
  const [rotaErro, setRotaErro] = useState(false);
  const [voz, setVoz] = useState(() => {
    try {
      return localStorage.getItem("m.voz") === "1";
    } catch {
      return false;
    }
  });
  // mapa do Google quando a chave está configurada; se falhar, o do OpenStreetMap
  const [usarGoogle, setUsarGoogle] = useState(temGoogle);
  const ultimoCalculo = useRef(rotaGuardada(destinoNome) ? ultimaRota.em : 0);
  const foraSeguidas = useRef(0);
  const falados = useRef(new Set());

  // GPS
  useEffect(() => {
    if (!navigator.geolocation) {
      setGps("erro");
      return undefined;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setGps("ok");
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude, rumo: Number.isFinite(p.coords.heading) ? p.coords.heading : null, precisao: p.coords.accuracy });
      },
      (e) => setGps(e?.code === 1 ? "negado" : "erro"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // tela acesa enquanto navega
  useEffect(() => {
    let trava = null;
    const pedir = async () => {
      try {
        trava = await navigator.wakeLock?.request?.("screen");
      } catch {
        /* sem wake lock */
      }
    };
    pedir();
    const voltar = () => document.visibilityState === "visible" && pedir();
    document.addEventListener("visibilitychange", voltar);
    return () => {
      document.removeEventListener("visibilitychange", voltar);
      trava?.release?.().catch?.(() => { });
    };
  }, []);

  // ponto do destino
  useEffect(() => {
    let vivo = true;
    setDestino(undefined);
    setRota(rotaGuardada(destinoNome));
    pontoDoLugar(destinoNome, base).then((p) => vivo && setDestino(p || null));
    return () => {
      vivo = false;
    };
  }, [destinoNome, base]);

  const prog = rota && pos ? progressoNaRota(rota, pos) : null;

  // rota: calcula quando tem posição e destino; recalcula se sair dela
  useEffect(() => {
    if (!pos || !destino) return;
    const agora = Date.now();
    if (rota) {
      const fora = prog && prog.foraDaRota > Math.max(FORA_DA_ROTA_M, (pos.precisao || 0) * 1.5);
      foraSeguidas.current = fora ? foraSeguidas.current + 1 : 0;
      // rota do Google conta na cota: recalcula com menos frequência
      const intervalo = rota.fonte === "google" ? RECALCULO_GOOGLE_MS : RECALCULO_MIN_MS;
      if (foraSeguidas.current < 2 || agora - ultimoCalculo.current < intervalo) return;
    } else if (agora - ultimoCalculo.current < 8000) return;
    ultimoCalculo.current = agora;
    foraSeguidas.current = 0;
    buscarRota(pos, destino).then((r) => {
      if (r) {
        ultimaRota = { destinoNome, rota: r, em: Date.now() };
        setRota(r);
        setRotaErro(false);
        falados.current = new Set();
      } else setRotaErro(true);
    });
  }, [pos, destino]); // eslint-disable-line react-hooks/exhaustive-deps

  // voz: anuncia a manobra a ~250 m e de novo a ~40 m
  useEffect(() => {
    if (!voz || !prog?.proximo) return;
    const k = `${prog.proximo.inicio}`;
    const texto = textoManobra(prog.proximo);
    if (prog.ateProximo <= 250 && prog.ateProximo > 60 && !falados.current.has(`${k}|longe`)) {
      falados.current.add(`${k}|longe`);
      falar(`Em ${textoDistancia(prog.ateProximo)}, ${texto}`);
    } else if (prog.ateProximo <= 40 && !falados.current.has(`${k}|perto`)) {
      falados.current.add(`${k}|perto`);
      falar(texto);
    }
  }, [voz, prog?.proximo?.inicio, Math.round((prog?.ateProximo || 0) / 20)]); // eslint-disable-line react-hooks/exhaustive-deps

  const alternarVoz = () => {
    const novo = !voz;
    setVoz(novo);
    try {
      localStorage.setItem("m.voz", novo ? "1" : "0");
    } catch {
      /* sem armazenamento */
    }
    if (novo) falar("Voz ligada");
  };

  // sem rota (servidor fora do ar): linha reta como referência
  const retaM = pos && destino ? metros(pos, destino) : null;
  const faltaM = prog ? prog.faltaM : retaM !== null ? retaM * 1.3 : null;
  const faltaS = prog ? prog.faltaS : faltaM !== null ? (faltaM / 1000 / 35) * 3600 : null;
  const chegada = faltaS !== null ? new Date(Date.now() + faltaS * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
  const chegou = faltaM !== null && faltaM < 60;

  return (
    <div className="mt-nav-tela" role="dialog" aria-modal="true" aria-label={`Rota até ${destinoNome}`}>
      {usarGoogle ? (
        <MapaGoogle posicao={pos} rumo={pos?.rumo} destino={destino || null} rota={rota} margem={{ topo: 96, baixo: 200 }} onFalha={() => setUsarGoogle(false)} />
      ) : (
        <MapaRota posicao={pos} rumo={pos?.rumo} destino={destino || null} rota={rota} margem={{ topo: 96, baixo: 200 }} />
      )}

      {/* topo: próxima manobra */}
      <div className="mt-nav-tela__topo">
        <button type="button" className="mt-nav-tela__fechar" onClick={onFechar} aria-label="Fechar o mapa">
          <Icon name="x" size={20} />
        </button>
        <div className="mt-nav-tela__manobra">
          {gps === "negado" ? (
            <p>
              <b>Localização bloqueada</b>
              <small>Libere a localização para este app nas configurações do celular.</small>
            </p>
          ) : destino === null ? (
            <p>
              <b>Não achamos “{destinoNome}” no mapa</b>
              <small>Use o Maps ou o Waze para este destino.</small>
            </p>
          ) : !pos || destino === undefined ? (
            <p>
              <b>{!pos ? "Procurando o GPS…" : "Achando o destino…"}</b>
              <small>{destinoNome}</small>
            </p>
          ) : chegou ? (
            <>
              <span className="mt-nav-tela__seta is-chegou">
                <Icon name="flag" size={26} />
              </span>
              <p>
                <b>Você chegou</b>
                <small>{destinoNome}</small>
              </p>
            </>
          ) : prog ? (
            <>
              <span className="mt-nav-tela__seta">
                <Icon name={iconeManobra(prog.proximo)} size={28} />
              </span>
              <p>
                <em className="tabular">{textoDistancia(prog.ateProximo)}</em>
                <b>{textoManobra(prog.proximo)}</b>
              </p>
            </>
          ) : (
            <p>
              <b>{rotaErro ? "Rota indisponível agora" : "Traçando a rota…"}</b>
              <small>{rotaErro ? "Mostrando a direção em linha reta. Tentando de novo." : destinoNome}</small>
            </p>
          )}
        </div>
        <button type="button" className={`mt-nav-tela__voz ${voz ? "is-on" : ""}`} onClick={alternarVoz} aria-label={voz ? "Desligar a voz" : "Ligar a voz"} aria-pressed={voz}>
          <Icon name={voz ? "volume" : "volumeOff"} size={20} />
        </button>
      </div>

      {/* rodapé: quanto falta + a etapa */}
      <div className="mt-nav-tela__baixo">
        <div className="mt-nav-tela__resumo">
          <span className="mt-nav-tela__tempo tabular">{faltaS !== null ? textoTempo(faltaS) : "—"}</span>
          <span className="mt-nav-tela__info">
            <b className="tabular">
              {faltaM !== null ? textoDistancia(faltaM) : ""}
              {chegada ? ` · chegada ${chegada}` : ""}
              {!prog && faltaM !== null ? " (aprox.)" : ""}
            </b>
            <small>
              {titulo ? `${titulo} · ` : ""}
              {destinoNome}
            </small>
          </span>
        </div>
        <div className="mt-nav-tela__acoes">
          {acao && (
            <button type="button" className="mt-nav-tela__acao" onClick={acao.onClick} disabled={acao.disabled}>
              <Icon name={acao.icone || "mapPin"} size={18} /> {acao.rotulo}
            </button>
          )}
          <span className="mt-nav-tela__fora">
            <a href={linkGoogleMaps(destinoNome)} target="_blank" rel="noopener noreferrer" onClick={() => onSairPara?.("Google Maps")}>
              Maps
            </a>
            <a href={linkWaze(destinoNome)} target="_blank" rel="noopener noreferrer" onClick={() => onSairPara?.("Waze")}>
              Waze
            </a>
          </span>
        </div>
        <small className="mt-nav-tela__nota">{rota?.comTransito ? "Tempo com o trânsito de agora (Google)." : "Tempo pela rota, sem trânsito em tempo real."}</small>
      </div>
    </div>
  );
};

export default Navegacao;
