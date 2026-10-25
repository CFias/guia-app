/* ORDEM DOS HOTÉIS numa escala com mais de um hotel (viagem com paradas).

   Sempre a partir do aeroporto:
   - CHEGADA (IN): aeroporto → hotel mais perto → … → hotel mais longe (finaliza);
   - SAÍDA (OUT): hotel mais longe → … → hotel mais perto → aeroporto.

   Cada hotel ganha um ponto no mapa pela busca gratuita do OpenStreetMap
   (Photon e, se não achar, Nominatim), perto do aeroporto da base. O ponto
   fica guardado em hoteis_geo/{base}__{hotel}: cada hotel é buscado UMA vez
   e serve para todo mundo depois. A distância é em linha reta — para ordenar
   paradas na mesma região é o suficiente. Hotel que não for achado fica no
   fim, na ordem que veio do Phoenix (o motorista ainda tem "Cheguei aqui
   antes" para marcar fora da ordem). */
import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import { regiaoAtual } from "./regiaoAtiva";

export const COL_HOTEIS_GEO = "hoteis_geo";

// aeroportos das bases (ponto de partida); base nova sem ponto: busca pelo nome
const AEROPORTOS = {
  SSA: { lat: -12.9086, lng: -38.3225, nome: "Aeroporto de Salvador" },
  NAT: { lat: -5.7686, lng: -35.3761, nome: "Aeroporto de Natal" },
  BPS: { lat: -16.4386, lng: -39.0809, nome: "Aeroporto de Porto Seguro" },
  IOS: { lat: -14.8158, lng: -39.0333, nome: "Aeroporto de Ilhéus" },
  MCZ: { lat: -9.5108, lng: -35.7917, nome: "Aeroporto de Maceió" },
  REC: { lat: -8.1265, lng: -34.9236, nome: "Aeroporto do Recife" },
  FOR: { lat: -3.7763, lng: -38.5326, nome: "Aeroporto de Fortaleza" },
  JPA: { lat: -7.1458, lng: -34.9503, nome: "Aeroporto de João Pessoa" },
  AJU: { lat: -10.984, lng: -37.0703, nome: "Aeroporto de Aracaju" },
};
const POR_NOME = {
  salvador: "SSA",
  natal: "NAT",
  "porto seguro": "BPS",
  ilheus: "IOS",
  maceio: "MCZ",
  recife: "REC",
  fortaleza: "FOR",
  "joao pessoa": "JPA",
  aracaju: "AJU",
};

const semAcento = (t = "") =>
  String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
export const chaveHotel = (nome = "") =>
  semAcento(nome)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80) || "hotel";

const cacheAeroporto = new Map();
export const aeroportoDaBase = async (regiao = regiaoAtual()) => {
  const sigla = String(regiao?.sigla || "").toUpperCase();
  const pelaSigla =
    AEROPORTOS[sigla] || AEROPORTOS[POR_NOME[semAcento(regiao?.nome)]];
  if (pelaSigla) return pelaSigla;
  const chave = regiao?.id || regiao?.nome || "";
  if (cacheAeroporto.has(chave)) return cacheAeroporto.get(chave);
  const ponto = await buscarNoMapa(`Aeroporto ${regiao?.nome || ""}`, null);
  cacheAeroporto.set(chave, ponto);
  return ponto;
};

// distância em km (linha reta)
export const distanciaKm = (a, b) => {
  if (!a || !b) return Infinity;
  const r = (x) => (x * Math.PI) / 180;
  const dLat = r(b.lat - a.lat);
  const dLng = r(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};

// variações do nome que ajudam a busca: "VILA GALE MARES (RESORT)" → "Vila Gale Mares Resort", "Vila Gale Mares"
const variacoes = (nome = "") => {
  const limpo = String(nome)
    .replace(/[()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const semParenteses = String(nome)
    .replace(/\(.*?\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const semPalavras = semParenteses
    .replace(/\b(hotel|resort|pousada|all inclusive|by [a-z]+)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return [
    ...new Set(
      [limpo, semParenteses, `${semParenteses} hotel`, semPalavras].filter(
        (v) => v && v.length >= 3,
      ),
    ),
  ];
};

const LIMITE_KM = 250; // resultado longe demais da base é de outro lugar
const buscarPhoton = async (q, centro) => {
  const p = new URLSearchParams({ q, limit: "3" });
  if (centro) {
    p.set("lat", String(centro.lat));
    p.set("lon", String(centro.lng));
  }
  const r = await fetch(`https://photon.komoot.io/api/?${p}`, {
    headers: { Accept: "application/json" },
  });
  if (!r.ok) return null;
  const j = await r.json();
  const achados = (j?.features || [])
    .map((f) => ({
      lng: Number(f?.geometry?.coordinates?.[0]),
      lat: Number(f?.geometry?.coordinates?.[1]),
    }))
    .filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lng));
  return (
    achados.find((x) => !centro || distanciaKm(centro, x) <= LIMITE_KM) || null
  );
};
const buscarNominatim = async (q, centro) => {
  const p = new URLSearchParams({
    format: "json",
    limit: "3",
    q,
    countrycodes: "br",
  });
  if (centro) {
    p.set(
      "viewbox",
      `${centro.lng - 2.5},${centro.lat + 2.5},${centro.lng + 2.5},${centro.lat - 2.5}`,
    );
    p.set("bounded", "1");
  }
  const r = await fetch(`https://nominatim.openstreetmap.org/search?${p}`, {
    headers: { Accept: "application/json" },
  });
  if (!r.ok) return null;
  const j = await r.json();
  const achados = (Array.isArray(j) ? j : [])
    .map((x) => ({ lat: Number(x.lat), lng: Number(x.lon) }))
    .filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lng));
  return (
    achados.find((x) => !centro || distanciaKm(centro, x) <= LIMITE_KM) || null
  );
};
const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
export const buscarNoMapa = async (nome, centro) => {
  for (const q of variacoes(nome)) {
    try {
      const a = await buscarPhoton(q, centro);
      if (a) return { ...a, fonte: "photon", busca: q };
    } catch {
      /* sem resposta: tenta o próximo */
    }
  }
  for (const q of variacoes(nome).slice(0, 2)) {
    try {
      await esperar(1100); // Nominatim: no máximo 1 busca por segundo
      const b = await buscarNominatim(`${q}, Brasil`, centro);
      if (b) return { ...b, fonte: "nominatim", busca: q };
    } catch {
      /* segue */
    }
  }
  return null;
};

/* ---------------- guardado no Firestore (cada hotel uma vez) ---------------- */

export const carregarHoteisGeo = async (base = regiaoAtual().id) => {
  try {
    const snap = await getDocs(
      query(collection(db, COL_HOTEIS_GEO), where("base", "==", base)),
    );
    return Object.fromEntries(snap.docs.map((d) => [d.data().chave, d.data()]));
  } catch (e) {
    console.error("Pontos dos hotéis:", e);
    return {};
  }
};

const salvarHotelGeo = (base, nome, ponto) =>
  setDoc(doc(db, COL_HOTEIS_GEO, `${base}__${chaveHotel(nome)}`), {
    base,
    chave: chaveHotel(nome),
    nome: String(nome).slice(0, 120),
    lat: ponto ? ponto.lat : null,
    lng: ponto ? ponto.lng : null,
    achado: !!ponto,
    fonte: ponto?.fonte || "",
    em: Timestamp.now(),
  }).catch((e) => console.error("Ponto do hotel não guardado:", e));

// hotéis buscados nesta sessão (não repete a busca enquanto a tela está aberta)
const buscando = new Map();
const TENTAR_DE_NOVO_DIAS = 7; // hotel não achado: tenta de novo depois de uma semana

/* Garante o ponto de cada hotel da lista: lê o guardado, busca o que falta
   (um por vez) e devolve { [chaveHotel]: { lat, lng } | null }. */
export const pontosDosHoteis = async (nomes = [], base = regiaoAtual().id) => {
  const unicos = [...new Set(nomes.filter(Boolean))];
  if (!unicos.length) return {};
  const guardados = await carregarHoteisGeo(base);
  const aeroporto = await aeroportoDaBase();
  const resultado = {};
  const velho = (x) =>
    !x?.achado &&
    (!x?.em?.toMillis ||
      Date.now() - x.em.toMillis() > TENTAR_DE_NOVO_DIAS * 864e5);
  for (const nome of unicos) {
    const k = chaveHotel(nome);
    const g = guardados[k];
    if (g && !velho(g)) {
      resultado[k] = g.achado ? { lat: g.lat, lng: g.lng } : null;
      continue;
    }
    const chaveBusca = `${base}|${k}`;
    if (!buscando.has(chaveBusca)) {
      buscando.set(
        chaveBusca,
        buscarNoMapa(nome, aeroporto).then((p) => {
          salvarHotelGeo(base, nome, p);
          return p;
        }),
      );
    }
    const p = await buscando.get(chaveBusca);
    resultado[k] = p ? { lat: p.lat, lng: p.lng } : null;
  }
  return resultado;
};

/* Ordena os hotéis do serviço (formato do link do motorista) a partir do
   aeroporto. Devolve o serviço com destinos (IN) ou origens (OUT) na ordem
   da viagem e ordemHoteis: "auto" | "parcial" (algum não achado) | "sem"
   (nenhum achado: fica a ordem do Phoenix). Sem ordemHoteis = ainda buscando. */
export const ordenarHoteisDoServico = (s, pontos = {}, aeroporto = null) => {
  const campo =
    s?.tipo === "IN" ? "destinos" : s?.tipo === "OUT" ? "origens" : null;
  const lista = campo ? s[campo] || [] : [];
  if (!campo || lista.length < 2 || !aeroporto) return s;
  const comDist = lista.map((nome, i) => {
    const p = pontos[chaveHotel(nome)];
    return { nome, i, km: p ? distanciaKm(aeroporto, p) : null };
  });
  const achados = comDist.filter((x) => x.km !== null);
  // pontos já buscados e nenhum achado: segue a ordem do Phoenix
  if (!achados.length)
    return Object.keys(pontos).length ? { ...s, ordemHoteis: "sem" } : s;
  // chegada: do mais perto ao mais longe; saída: do mais longe ao mais perto
  achados.sort(
    (a, b) => (s.tipo === "IN" ? a.km - b.km : b.km - a.km) || a.i - b.i,
  );
  const faltando = comDist.filter((x) => x.km === null);
  const ordem = [...achados, ...faltando];
  return {
    ...s,
    [campo]: ordem.map((x) => x.nome),
    ordemHoteis: faltando.length ? "parcial" : "auto",
    kmHoteis: Object.fromEntries(
      ordem.filter((x) => x.km !== null).map((x) => [x.nome, Math.round(x.km)]),
    ),
  };
};

// todos os hotéis que precisam de ponto (serviços com 2+ hotéis)
export const hoteisParaOrdenar = (servicos = []) =>
  servicos.flatMap((s) => {
    const lista =
      s?.tipo === "IN" ? s.destinos : s?.tipo === "OUT" ? s.origens : [];
    return Array.isArray(lista) && lista.length > 1 ? lista : [];
  });
