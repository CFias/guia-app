/* GOOGLE MAPS no app do motorista (opcional — precisa da chave)

   Com a variável VITE_GOOGLE_MAPS_KEY configurada (Vercel → Settings →
   Environment Variables, e no .env local):
   - o mapa da navegação é o do Google (Maps JavaScript API);
   - a rota vem da Routes API do Google, com o TRÂNSITO de agora e as
     manobras em português.
   Sem a chave (ou se o Google não responder), o app segue com o mapa e a
   rota do OpenStreetMap — nada quebra. */

export const CHAVE_GOOGLE = String(import.meta.env?.VITE_GOOGLE_MAPS_KEY || "").trim();
export const temGoogle = () => !!CHAVE_GOOGLE;

/* PARA FICAR GRATUITO
   1. No Google Cloud, a cota diária de cada API fica abaixo da faixa grátis
      (Maps JavaScript API ~300 carregamentos/dia; Routes API ~150 rotas/dia).
      Passou da cota, o Google recusa e o app volta para o OpenStreetMap.
   2. Aqui, cada celular tem um teto por dia (protege contra um aparelho
      que fique abrindo/recalculando sem parar) e o mapa é criado uma vez
      só por sessão (abrir e fechar a navegação não conta de novo). */
const TETO_DIA = { mapa: 25, rota: 40 };
const hojeTxt = () => new Date().toISOString().slice(0, 10);
export const usarCota = (tipo) => {
  try {
    const k = `m.gcota.${tipo}`;
    const v = JSON.parse(localStorage.getItem(k) || "{}");
    const n = v.dia === hojeTxt() ? v.n : 0;
    if (n >= TETO_DIA[tipo]) return false;
    localStorage.setItem(k, JSON.stringify({ dia: hojeTxt(), n: n + 1 }));
    return true;
  } catch {
    return true;
  }
};

/* ---------------- carregar o Maps JavaScript API (uma vez) ---------------- */

let carregando = null;
export const carregarGoogleMaps = () => {
  if (!CHAVE_GOOGLE) return Promise.reject(new Error("sem chave"));
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
  if (carregando) return carregando;
  carregando = new Promise((ok, falha) => {
    const nome = `__gmapsPronto${Date.now()}`;
    const t = setTimeout(() => falha(new Error("Google Maps demorou para carregar")), 15000);
    window[nome] = () => {
      clearTimeout(t);
      delete window[nome];
      if (window.google?.maps?.Map) ok(window.google.maps);
      else falha(new Error("Google Maps não carregou"));
    };
    // chave recusada (domínio não liberado, API desligada, sem faturamento)
    window.gm_authFailure = () => {
      clearTimeout(t);
      falha(new Error("chave do Google recusada"));
    };
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(CHAVE_GOOGLE)}&language=pt-BR&region=BR&v=weekly&callback=${nome}`;
    s.async = true;
    s.onerror = () => {
      clearTimeout(t);
      falha(new Error("Google Maps sem conexão"));
    };
    document.head.appendChild(s);
  }).catch((e) => {
    carregando = null; // tenta de novo na próxima vez
    throw e;
  });
  return carregando;
};

/* ---------------- rota pela Routes API (com trânsito) ---------------- */

// polyline codificada do Google → [{lat, lng}]
export const decodificarPolyline = (txt = "") => {
  const pontos = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  while (i < txt.length) {
    for (const eixo of ["lat", "lng"]) {
      let resultado = 0;
      let deslocamento = 0;
      let b;
      do {
        b = txt.charCodeAt(i++) - 63;
        resultado |= (b & 0x1f) << deslocamento;
        deslocamento += 5;
      } while (b >= 0x20);
      const d = resultado & 1 ? ~(resultado >> 1) : resultado >> 1;
      if (eixo === "lat") lat += d;
      else lng += d;
    }
    pontos.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return pontos;
};

const segundos = (v) => Number(String(v || "0").replace("s", "")) || 0;

// manobra do Google → o mesmo formato das do OSRM (para a seta e a voz)
const DE_GOOGLE = {
  TURN_LEFT: ["turn", "left"],
  TURN_RIGHT: ["turn", "right"],
  TURN_SLIGHT_LEFT: ["turn", "slight left"],
  TURN_SLIGHT_RIGHT: ["turn", "slight right"],
  TURN_SHARP_LEFT: ["turn", "sharp left"],
  TURN_SHARP_RIGHT: ["turn", "sharp right"],
  UTURN_LEFT: ["turn", "uturn"],
  UTURN_RIGHT: ["turn", "uturn"],
  STRAIGHT: ["continue", "straight"],
  RAMP_LEFT: ["on ramp", "left"],
  RAMP_RIGHT: ["on ramp", "right"],
  FORK_LEFT: ["fork", "left"],
  FORK_RIGHT: ["fork", "right"],
  MERGE: ["merge", ""],
  ROUNDABOUT_LEFT: ["roundabout", "left"],
  ROUNDABOUT_RIGHT: ["roundabout", "right"],
  ROUNDABOUT_CLOCKWISE: ["roundabout", "right"],
  ROUNDABOUT_COUNTERCLOCKWISE: ["roundabout", "left"],
  DEPART: ["depart", ""],
  NAME_CHANGE: ["new name", "straight"],
  FERRY: ["continue", "straight"],
};

export const rotaGoogle = async (de, para, montarRota) => {
  if (!CHAVE_GOOGLE || !usarCota("rota")) return null;
  const local = (p) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
  const r = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": CHAVE_GOOGLE,
      "X-Goog-FieldMask":
        "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps.distanceMeters,routes.legs.steps.navigationInstruction,routes.legs.steps.startLocation",
    },
    body: JSON.stringify({
      origin: local(de),
      destination: local(para),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      languageCode: "pt-BR",
      units: "METRIC",
    }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  const rota = j?.routes?.[0];
  const pontos = decodificarPolyline(rota?.polyline?.encodedPolyline || "");
  if (pontos.length < 2) return null;
  // no formato que montarRota (OSRM) entende
  const steps = (rota.legs?.[0]?.steps || []).map((st) => {
    const [type, modifier] = DE_GOOGLE[st.navigationInstruction?.maneuver] || ["turn", ""];
    const ll = st.startLocation?.latLng;
    return {
      distance: Number(st.distanceMeters || 0),
      name: "",
      texto: st.navigationInstruction?.instructions || "",
      maneuver: { type, modifier, location: ll ? [ll.longitude, ll.latitude] : null },
    };
  });
  steps.push({ distance: 0, name: "", maneuver: { type: "arrive", modifier: "", location: [para.lng, para.lat] } });
  const montada = montarRota({
    geometry: { coordinates: pontos.map((p) => [p.lng, p.lat]) },
    distance: Number(rota.distanceMeters || 0),
    duration: segundos(rota.duration),
    legs: [{ steps }],
  });
  // o Google já manda a frase pronta ("Vire à direita na Av. Paralela")
  montada.passos.forEach((p, i) => {
    if (steps[i]?.texto) p.texto = steps[i].texto.split("\n")[0];
  });
  return { ...montada, fonte: "google", comTransito: true };
};

/* ---------------- tema escuro do mapa do Google ---------------- */
export const ESTILO_ESCURO = [
  { elementType: "geometry", stylers: [{ color: "#1d2330" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9aa4b5" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1d2330" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2c3444" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3b4558" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0f1a2a" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#232a38" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];
