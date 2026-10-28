/* ROTA DENTRO DO APP DO MOTORISTA (sem sair para o Maps/Waze)

   - Ponto do destino: aeroporto da base pelo cadastro; hotel pela busca
     gratuita do mapa (Photon/Nominatim, perto do aeroporto), guardado no
     celular para não buscar de novo.
   - Rota: OSRM (servidor gratuito do OpenStreetMap; se não responder, o
     espelho da FOSSGIS). Devolve o traçado, a distância, o tempo e as
     manobras ("Em 300 m, vire à direita na Av. Paralela").
   - Progresso: a posição do celular é projetada no traçado → quanto falta,
     a próxima manobra e se o motorista saiu da rota (aí recalcula).
   O tempo é o da rota (sem trânsito em tempo real). */

import { buscarNoMapa } from "./ordemHoteis";
import { rotaGoogle, temGoogle } from "./googleMapas";

// aeroportos por base (mesmos pontos da ordem dos hotéis)
export const AEROPORTOS_BASE = {
  ssa: { lat: -12.9086, lng: -38.3225, nome: "Aeroporto de Salvador" },
  nat: { lat: -5.7686, lng: -35.3761, nome: "Aeroporto de Natal" },
  bps: { lat: -16.4386, lng: -39.0809, nome: "Aeroporto de Porto Seguro" },
  ios: { lat: -14.8158, lng: -39.0333, nome: "Aeroporto de Ilhéus" },
  mcz: { lat: -9.5108, lng: -35.7917, nome: "Aeroporto de Maceió" },
  rec: { lat: -8.1265, lng: -34.9236, nome: "Aeroporto do Recife" },
  for: { lat: -3.7763, lng: -38.5326, nome: "Aeroporto de Fortaleza" },
  jpa: { lat: -7.1458, lng: -34.9503, nome: "Aeroporto de João Pessoa" },
  aju: { lat: -10.984, lng: -37.0703, nome: "Aeroporto de Aracaju" },
};
export const aeroportoDe = (base = "ssa") => AEROPORTOS_BASE[String(base || "ssa").toLowerCase()] || AEROPORTOS_BASE.ssa;

const R = 6371000;
const rad = (x) => (x * Math.PI) / 180;
export const metros = (a, b) => {
  if (!a || !b) return Infinity;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/* ---------------- ponto do destino ---------------- */

const CHAVE_GEO = "m.geo.";
const lerGeo = (nome) => {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_GEO + nome) || "null");
    return v && Number.isFinite(v.lat) ? v : null;
  } catch {
    return null;
  }
};
const guardarGeo = (nome, p) => {
  try {
    localStorage.setItem(CHAVE_GEO + nome, JSON.stringify({ lat: p.lat, lng: p.lng }));
  } catch {
    /* sem armazenamento */
  }
};
const emBusca = new Map();
export const pontoDoLugar = async (nome, base = "ssa") => {
  const n = String(nome || "").trim();
  if (!n) return null;
  const aero = aeroportoDe(base);
  if (/aeroporto|airport/i.test(n)) return { ...aero, nome: n };
  const guardado = lerGeo(n);
  if (guardado) return { ...guardado, nome: n };
  if (emBusca.has(n)) return emBusca.get(n);
  const p = buscarNoMapa(n, aero)
    .then((x) => {
      if (x) guardarGeo(n, x);
      return x ? { lat: x.lat, lng: x.lng, nome: n } : null;
    })
    .catch(() => null)
    .finally(() => emBusca.delete(n));
  emBusca.set(n, p);
  return p;
};

/* ---------------- rota (OSRM) ---------------- */

const SERVIDORES = ["https://router.project-osrm.org/route/v1/driving", "https://routing.openstreetmap.de/routed-car/route/v1/driving"];

// google: false → só o OSRM (gratuito). A rota de fundo, que só manda o
// tempo para a base, usa o OSRM; o Google fica para o mapa que o motorista abre.
export const buscarRota = async (de, para, { google = true } = {}) => {
  // com a chave do Google: rota do Google, com trânsito; se falhar (ou acabar
  // a cota do dia), OSRM
  if (google && temGoogle()) {
    try {
      const g = await rotaGoogle(de, para, montarRota);
      if (g) return g;
    } catch {
      /* segue para o OSRM */
    }
  }
  const caminho = `${de.lng},${de.lat};${para.lng},${para.lat}?overview=full&geometries=geojson&steps=true`;
  for (const base of SERVIDORES) {
    try {
      const r = await fetch(`${base}/${caminho}`, { headers: { Accept: "application/json" } });
      if (!r.ok) continue;
      const j = await r.json();
      const rota = j?.routes?.[0];
      if (!rota?.geometry?.coordinates?.length) continue;
      return montarRota(rota);
    } catch {
      /* tenta o próximo servidor */
    }
  }
  return null;
};

// traçado + distância acumulada em cada ponto + manobras com a posição no traçado
export const montarRota = (rota) => {
  const pontos = rota.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
  const acum = [0];
  for (let i = 1; i < pontos.length; i++) acum.push(acum[i - 1] + metros(pontos[i - 1], pontos[i]));
  const total = acum[acum.length - 1] || rota.distance || 0;
  const passos = [];
  let ate = 0;
  (rota.legs?.[0]?.steps || []).forEach((st) => {
    passos.push({
      inicio: ate, // distância no traçado em que a manobra acontece
      tipo: st.maneuver?.type || "",
      lado: st.maneuver?.modifier || "",
      saida: st.maneuver?.exit || null,
      rua: st.name || st.ref || "",
      local: st.maneuver?.location ? { lng: st.maneuver.location[0], lat: st.maneuver.location[1] } : null,
    });
    ate += Number(st.distance || 0);
  });
  return { pontos, acum, total, duracao: Number(rota.duration || 0), passos, fonte: "osm", comTransito: false };
};

/* ---------------- progresso na rota ---------------- */

// projeção de p no segmento a→b (em metros, plano local — bom para poucos km)
const projetar = (p, a, b) => {
  const kx = Math.cos(rad(a.lat)) * 111320;
  const ky = 110540;
  const ax = 0;
  const ay = 0;
  const bx = (b.lng - a.lng) * kx;
  const by = (b.lat - a.lat) * ky;
  const px = (p.lng - a.lng) * kx;
  const py = (p.lat - a.lat) * ky;
  const l2 = bx * bx + by * by;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * bx + (py - ay) * by) / l2)) : 0;
  const qx = bx * t;
  const qy = by * t;
  return { t, dist: Math.hypot(px - qx, py - qy) };
};

export const progressoNaRota = (rota, pos) => {
  if (!rota || !pos) return null;
  let melhor = { dist: Infinity, i: 0, t: 0 };
  for (let i = 0; i < rota.pontos.length - 1; i++) {
    const pr = projetar(pos, rota.pontos[i], rota.pontos[i + 1]);
    if (pr.dist < melhor.dist) melhor = { dist: pr.dist, i, t: pr.t };
  }
  const seg = (rota.acum[melhor.i + 1] ?? rota.acum[melhor.i]) - rota.acum[melhor.i];
  const andado = rota.acum[melhor.i] + seg * melhor.t;
  const falta = Math.max(0, rota.total - andado);
  const proximo = rota.passos.find((p) => p.inicio > andado + 5 && p.tipo !== "depart") || null;
  return {
    foraDaRota: melhor.dist,
    andado,
    faltaM: falta,
    faltaS: rota.total ? (rota.duracao * falta) / rota.total : 0,
    proximo,
    ateProximo: proximo ? Math.max(0, proximo.inicio - andado) : falta,
  };
};

/* ---------------- texto das manobras ---------------- */

const LADO = {
  left: "à esquerda",
  right: "à direita",
  "slight left": "levemente à esquerda",
  "slight right": "levemente à direita",
  "sharp left": "acentuadamente à esquerda",
  "sharp right": "acentuadamente à direita",
  straight: "em frente",
  uturn: "o retorno",
};
export const textoManobra = (p) => {
  if (!p) return "Siga até o destino";
  if (p.texto) return p.texto; // frase pronta do Google
  const lado = LADO[p.lado] || "";
  const naRua = p.rua ? ` na ${p.rua}` : "";
  switch (p.tipo) {
    case "arrive":
      return "Você chegou ao destino";
    case "roundabout":
    case "rotary":
    case "roundabout turn":
      return `Na rotatória, pegue a ${p.saida || 1}ª saída${naRua}`;
    case "exit roundabout":
    case "exit rotary":
      return `Saia da rotatória${naRua}`;
    case "merge":
      return `Entre ${lado || "na via"}${naRua}`;
    case "on ramp":
      return `Pegue o acesso ${lado}${naRua}`.replace(/\s+/g, " ");
    case "off ramp":
      return `Pegue a saída ${lado}${naRua}`.replace(/\s+/g, " ");
    case "fork":
      return `Na bifurcação, mantenha-se ${lado || "na pista"}${naRua}`;
    case "end of road":
      return `No fim da via, vire ${lado}${naRua}`;
    case "continue":
    case "new name":
      return p.lado === "uturn" ? `Faça o retorno${naRua}` : `Continue ${lado && p.lado !== "straight" ? lado : "em frente"}${naRua}`;
    default:
      if (p.lado === "uturn") return `Faça o retorno${naRua}`;
      if (p.lado === "straight") return `Siga em frente${naRua}`;
      return `Vire ${lado || "na via"}${naRua}`;
  }
};
export const iconeManobra = (p) => {
  if (!p) return "navigation";
  if (p.tipo === "arrive") return "flag";
  if (p.tipo === "roundabout" || p.tipo === "rotary") return "refresh";
  if (p.lado === "uturn") return "undo";
  if (/left/.test(p.lado)) return "cornerUpLeft";
  if (/right/.test(p.lado)) return "cornerUpRight";
  return "arrowUp";
};
export const textoDistancia = (m) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1).replace(".", ",")} km` : `${Math.max(10, Math.round(m / 10) * 10)} m`);
export const textoTempo = (s) => {
  const min = Math.max(1, Math.round(s / 60));
  return min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}` : `${min} min`;
};
