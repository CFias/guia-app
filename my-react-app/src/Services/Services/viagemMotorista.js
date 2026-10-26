// viagemMotorista.js
//
// LINK DO DIA DO MOTORISTA (Fase 2 do painel do fornecedor)
//
// O fornecedor envia pelo WhatsApp um link por motorista e por dia:
//   /m/<token>
// O motorista abre no celular, sem login, e vê os serviços dele naquele dia,
// na ordem do horário. Em cada serviço ele marca as etapas, como num app de
// corrida — e cada toque grava a hora e a localização do celular:
//   Chegada (IN):   [Luck recepcionou] → Posicionado no aeroporto → Iniciar viagem → Finalizar
//   Saída (OUT):    Cheguei no hotel (libera X min antes) → Iniciar viagem → Cheguei ao aeroporto
//   Transfer/Passeio: Cheguei → Iniciar viagem → Finalizar
// Quando a base marca "Recepcionei" no painel do aeroporto, o celular do
// motorista toca um alerta repetido até ele confirmar.
//
// Dados (coleções globais; o documento guarda a base):
//   motorista_dia/{token}   (quem tem o link lê; o motorista só grava eventos e posição)
//     { base, data, fornecedorId, fornecedorNome, motoristaId, motoristaNome,
//       motoristaTelefone, minutosAntesCheguei, criadoEm, atualizadoEm,
//       servicos: [{ chave, escalaId, tipo, hora, veiculo, placa, descricao,
//                    pax, voos, origens, destinos, reservas: [...] }],
//       eventos: { [chave]: { posicionado|iniciado|finalizado: { em, lat, lng, precisao } } },
//       ultimaPosicao: { em, lat, lng, precisao } }
//   status_escala/{base}__{data}__{escalaId}   (o painel do aeroporto grava)
//     { base, data, escalaId, recepcionado, recepcionadoEm, recepcionadoPor,
//       embarcado, embarcadoEm, atualizadoEm }

import {
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  Timestamp,
  where,
  collection,
} from "firebase/firestore";
import { db } from "./firebase";
import { ID_SEDE, regiaoAtual } from "./regiaoAtiva";

export const COL_MOTORISTA_DIA = "motorista_dia";
export const COL_STATUS_ESCALA = "status_escala";

export const baseAtual = () => regiaoAtual()?.id || ID_SEDE;
export const idStatusEscala = (base, data, escalaId) =>
  `${base}__${data}__${escalaId}`;

// token do link: 24 caracteres aleatórios (impossível de adivinhar)
export const novoToken = () => {
  const bytes = new Uint8Array(18);
  (globalThis.crypto || window.crypto).getRandomValues(bytes);
  return (
    Array.from(bytes, (b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join(
      "",
    ) + Date.now().toString(36).slice(-6)
  );
};

export const linkDoMotorista = (token) =>
  `${window.location.origin}/m/${token}`;

/* ---------------- etapas ---------------- */

export const ETAPAS_POR_TIPO = {
  IN: [
    {
      id: "posicionado",
      acao: "Cheguei no desembarque",
      feito: "No desembarque",
      dica: "toque e escolha a porta em que você está",
    },
    {
      id: "iniciado",
      acao: "Iniciar viagem",
      feito: "Em viagem",
      dica: "toque quando sair com os passageiros",
    },
    {
      id: "finalizado",
      acao: "Finalizar viagem",
      feito: "Finalizado",
      dica: "toque ao deixar os passageiros no hotel",
    },
  ],
  OUT: [
    {
      id: "posicionado",
      acao: "Cheguei no hotel",
      feito: "No hotel",
      dica: "toque quando chegar para buscar os passageiros",
    },
    {
      id: "iniciado",
      acao: "Iniciar viagem",
      feito: "Em viagem",
      dica: "toque quando sair com os passageiros",
    },
    {
      id: "finalizado",
      acao: "Cheguei ao aeroporto",
      feito: "Finalizado",
      dica: "toque ao deixar os passageiros no aeroporto",
    },
  ],
  OUTRO: [
    {
      id: "posicionado",
      acao: "Cheguei",
      feito: "No local",
      dica: "toque quando chegar para buscar os passageiros",
    },
    {
      id: "iniciado",
      acao: "Iniciar viagem",
      feito: "Em viagem",
      dica: "toque quando sair com os passageiros",
    },
    {
      id: "finalizado",
      acao: "Finalizar",
      feito: "Finalizado",
      dica: "toque ao terminar o serviço",
    },
  ],
};
// portas do desembarque do aeroporto (o motorista escolhe ao chegar)
export const PORTAS_DESEMBARQUE = ["A", "B", "C", "D"];

export const etapasDoTipo = (tipo) =>
  ETAPAS_POR_TIPO[tipo] || ETAPAS_POR_TIPO.OUTRO;

// em que pé está o serviço: a última etapa feita e a próxima
export const situacaoDoServico = (tipo, ev = {}) => {
  const etapas = etapasDoTipo(tipo);
  const feitas = etapas.filter((e) => ev?.[e.id]?.em);
  const ultima = feitas[feitas.length - 1] || null;
  const proxima = etapas.find((e) => !ev?.[e.id]?.em) || null;
  return { etapas, ultima, proxima, concluido: !proxima };
};

/* ---------------- montagem pelo fornecedor ---------------- */

const unicos = (l) => [...new Set(l.filter(Boolean))];

// serviço do painel do fornecedor → o que o motorista precisa ver
export const servicoParaMotorista = (s) => {
  const res = s.reservasLista || [];
  return {
    chave: s.chave,
    escalaId: String(s.escalaId || ""),
    tipo: s.tipo,
    hora: s.hora || "",
    veiculo: s.veiculo || "",
    placa: s.placa || "",
    descricao: s.descricao || "",
    pax: s.pax || 0,
    voos: unicos(
      res.map((r) =>
        r.voo ? `${r.voo}${r.horaVoo ? ` ${r.horaVoo}` : ""}` : "",
      ),
    ),
    origens: unicos(res.map((r) => r.origem)),
    destinos: unicos(res.map((r) => r.destino)),
    reservas: res.slice(0, 40).map((r) => ({
      codigo: r.codigo || "",
      titular: r.titular || "",
      pax: r.pax || 0,
      adt: r.adt ?? null,
      chd: r.chd ?? null,
      inf: r.inf ?? null,
      voo: r.voo || "",
      origem: r.origem || "",
      destino: r.destino || "",
      obs: r.obs || "",
    })),
  };
};

/* ESCALA REFEITA no Phoenix: o serviço ganha outro número (outra chave), mas é
   a mesma viagem. As etapas que o motorista já marcou passam para a chave nova
   — antes elas ficavam presas à chave antiga e a tela parecia "zerada".
   Mesma viagem = mesmo tipo e (alguma reserva em comum OU mesmo horário e
   mesmo veículo). Devolve { eventos: { chaveNova: etapas }, migradas: Set(chaves antigas) }. */
export const migrarEtapas = (anteriores = [], eventos = {}, novos = []) => {
  const resultado = { eventos: {}, migradas: new Set() };
  const chavesNovas = new Set(novos.map((s) => s.chave));
  const comEtapas = anteriores.filter(
    (a) =>
      !chavesNovas.has(a.chave) && Object.keys(eventos?.[a.chave] || {}).length,
  );
  if (!comEtapas.length) return resultado;
  const codigos = (s) =>
    new Set((s.reservas || []).map((r) => r.codigo).filter(Boolean));
  novos.forEach((n) => {
    if (Object.keys(eventos?.[n.chave] || {}).length) return; // já tem etapas
    const cn = codigos(n);
    const par = comEtapas.find(
      (a) =>
        !resultado.migradas.has(a.chave) &&
        a.tipo === n.tipo &&
        ([...codigos(a)].some((c) => cn.has(c)) ||
          (a.hora &&
            a.hora === n.hora &&
            a.veiculo &&
            a.veiculo === n.veiculo)),
    );
    if (!par) return;
    resultado.eventos[n.chave] = { ...eventos[par.chave] };
    resultado.migradas.add(par.chave);
  });
  return resultado;
};

// assinatura do que o motorista vê (para só regravar quando muda)
export const assinaturaServicos = (lista = []) =>
  lista
    .map(
      (s) =>
        `${s.chave}|${s.hora}|${s.pax}|${s.destinos.join(",")}|${s.origens.join(",")}|${s.reservas.map((r) => `${r.codigo}:${r.titular}:${r.adt}/${r.chd}/${r.inf}:${r.obs?.length || 0}`).join(",")}`,
    )
    .join(";");

/* ---------------- paradas (mais de um hotel na mesma escala) ----------------
   Chegada com 2+ hotéis: depois de "Iniciar viagem", o motorista marca
   "Cheguei" em cada hotel; o último hotel FINALIZA a viagem.
   Saída com 2+ hotéis: marca "Cheguei" em cada hotel de busca (o primeiro
   vale como "Cheguei no hotel"); depois inicia a viagem e finaliza no aeroporto.
   Cada parada fica em eventos[chave]["parada_<hotel>"]. */
const slug = (t = "") =>
  String(t)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40) || "hotel";
// id da parada de um hotel no evento do motorista (o mesmo nome do Phoenix)
export const idDaParada = (nome = "") => `parada_${slug(nome)}`;
export const paradasDoServico = (s) => {
  const lista =
    s?.tipo === "IN" ? s.destinos : s?.tipo === "OUT" ? s.origens : [];
  if (!Array.isArray(lista) || lista.length < 2) return [];
  return lista.map((nome) => ({
    id: idDaParada(nome),
    nome,
    // passageiros de cada hotel (para o motorista saber quem desce/sobe ali)
    passageiros: (s.reservas || []).filter(
      (r) => (s.tipo === "IN" ? r.destino : r.origem) === nome,
    ),
  }));
};
// "2/0/1" (adultos/crianças/bebês); sem o detalhe, o total de pax
export const paxDetalhado = (r = {}) =>
  r.adt === null || r.adt === undefined
    ? `${r.pax || 0} pax`
    : `${r.adt || 0}/${r.chd || 0}/${r.inf || 0}`;

export const paradasFeitas = (s, ev = {}) =>
  paradasDoServico(s).filter((p) => ev?.[p.id]?.em);

/* Próxima ação do motorista, contando as paradas (viagem tipo Uber com
   paradas adicionais). Devolve { tipo: "etapa", etapa } ou
   { tipo: "parada", parada, indice, total, final, primeira } ou null (acabou). */
export const proximaAcao = (s, ev = {}) => {
  const st = situacaoDoServico(s.tipo, ev);
  const paradas = paradasDoServico(s);
  if (!paradas.length || st.concluido)
    return st.proxima ? { tipo: "etapa", etapa: st.proxima } : null;
  const faltam = paradas.filter((p) => !ev?.[p.id]?.em);
  const indice = paradas.length - faltam.length; // 0 = primeira parada
  if (s.tipo === "IN") {
    // desembarque e saída como sempre; depois, hotel a hotel — o último finaliza
    if (st.proxima?.id !== "finalizado")
      return { tipo: "etapa", etapa: st.proxima };
    if (!faltam.length) return { tipo: "etapa", etapa: st.proxima };
    return {
      tipo: "parada",
      parada: faltam[0],
      indice,
      total: paradas.length,
      final: faltam.length === 1,
      primeira: indice === 0,
    };
  }
  // OUT: busca hotel a hotel (o primeiro vale como "Cheguei no hotel"), depois sai para o aeroporto
  if (!ev?.iniciado?.em && faltam.length) {
    return {
      tipo: "parada",
      parada: faltam[0],
      indice,
      total: paradas.length,
      final: false,
      primeira: indice === 0,
    };
  }
  return st.proxima ? { tipo: "etapa", etapa: st.proxima } : null;
};

// o que foi marcado por último (etapa ou parada), para o "Desfazer"
export const ultimaMarcacao = (s, ev = {}) => {
  const etapas = etapasDoTipo(s.tipo).map((e) => ({
    tipo: "etapa",
    id: e.id,
    nome: e.feito,
    etapa: e,
  }));
  const paradas = paradasDoServico(s).map((p) => ({
    tipo: "parada",
    id: p.id,
    nome: `No ${p.nome}`,
    parada: p,
  }));
  const ms = (v) =>
    v?.toMillis
      ? v.toMillis()
      : v?.seconds
        ? v.seconds * 1000
        : v instanceof Date
          ? v.getTime()
          : 0;
  const feitas = [...etapas, ...paradas].filter((x) => ev?.[x.id]?.em);
  if (!feitas.length) return null;
  // finalizado ganha da parada final (mesmo horário): desfaz os dois juntos
  return feitas.sort(
    (a, b) =>
      ms(ev[b.id].em) - ms(ev[a.id].em) ||
      (a.id === "finalizado" ? -1 : b.id === "finalizado" ? 1 : 0),
  )[0];
};

export const gravarMotoristaDia = (token, dados) =>
  setDoc(
    doc(db, COL_MOTORISTA_DIA, token),
    { ...dados, atualizadoEm: Timestamp.now() },
    { merge: true },
  );

export const ouvirMotoristaDia = (token, aoMudar, aoErro) =>
  onSnapshot(
    doc(db, COL_MOTORISTA_DIA, token),
    (snap) => aoMudar(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    (e) => {
      console.error("Erro ao ler o link do motorista:", e);
      aoErro?.(e);
    },
  );

// Painel do dia / fornecedor: todos os links do dia (da base)
export const ouvirViagensDoDia = (data, aoMudar) =>
  onSnapshot(
    query(
      collection(db, COL_MOTORISTA_DIA),
      where("data", "==", data),
      where("base", "==", baseAtual()),
    ),
    (snap) => {
      const base = baseAtual();
      const porEscala = {};
      snap.docs.forEach((d) => {
        const v = d.data() || {};
        if ((v.base || ID_SEDE) !== base) return;
        (v.servicos || []).forEach((s) => {
          if (!s.escalaId) return;
          const paradas = paradasDoServico(s);
          porEscala[String(s.escalaId)] = {
            tipo: s.tipo,
            eventos: v.eventos?.[s.chave] || {},
            motoristaNome: v.motoristaNome,
            ultimaPosicao: v.ultimaPosicao || null,
            paradas: paradas.length
              ? {
                  total: paradas.length,
                  feitas: paradas.filter(
                    (p) => v.eventos?.[s.chave]?.[p.id]?.em,
                  ).length,
                }
              : null,
          };
        });
      });
      aoMudar(porEscala);
    },
    (e) => {
      console.error("Erro ao ler as viagens dos motoristas:", e);
      aoMudar({});
    },
  );

/* ---------------- gravação pelo motorista ---------------- */

export const marcarEtapaMotorista = (token, chave, etapaId, registro) =>
  setDoc(
    doc(db, COL_MOTORISTA_DIA, token),
    {
      eventos: {
        [chave]: {
          [etapaId]: registro
            ? { ...registro, em: Timestamp.now() }
            : deleteField(),
        },
      },
      ...(registro?.lat !== undefined
        ? {
            ultimaPosicao: {
              lat: registro.lat,
              lng: registro.lng,
              precisao: registro.precisao ?? null,
              em: Timestamp.now(),
            },
          }
        : {}),
      atualizadoEm: Timestamp.now(),
    },
    { merge: true },
  );

export const gravarPosicao = (token, pos) =>
  setDoc(
    doc(db, COL_MOTORISTA_DIA, token),
    {
      ultimaPosicao: {
        lat: pos.lat,
        lng: pos.lng,
        precisao: pos.precisao ?? null,
        em: Timestamp.now(),
      },
      atualizadoEm: Timestamp.now(),
    },
    { merge: true },
  );

/* ---------------- sinal do painel do aeroporto ---------------- */

// desfeito: a base desfez a recepção que o motorista já tinha recebido —
// o app dele mostra "recepção desfeita · aguarde" (desfeitoEm)
export const gravarStatusEscala = ({
  data,
  escalaId,
  recepcionado,
  recepcionadoEm,
  recepcionadoPor = "",
  embarcado,
  embarcadoEm,
  desfeito = false,
}) =>
  setDoc(
    doc(db, COL_STATUS_ESCALA, idStatusEscala(baseAtual(), data, escalaId)),
    {
      base: baseAtual(),
      data,
      escalaId: String(escalaId),
      recepcionado: !!recepcionado,
      recepcionadoEm: recepcionado ? recepcionadoEm || Timestamp.now() : null,
      recepcionadoPor: recepcionado
        ? String(recepcionadoPor || "").split(" ")[0]
        : "",
      embarcado: !!embarcado,
      embarcadoEm: embarcado ? embarcadoEm || Timestamp.now() : null,
      ...(desfeito
        ? { desfeitoEm: Timestamp.now() }
        : recepcionado
          ? { desfeitoEm: null }
          : {}),
      atualizadoEm: Timestamp.now(),
    },
    { merge: true },
  );

export const ouvirStatusEscala = (base, data, escalaId, aoMudar) =>
  onSnapshot(
    doc(db, COL_STATUS_ESCALA, idStatusEscala(base, data, escalaId)),
    (snap) => aoMudar(snap.exists() ? snap.data() : null),
    () => aoMudar(null),
  );

/* ---------------- localização ---------------- */

// posição atual do celular (resolve null se negar ou demorar)
export const pegarPosicao = () =>
  new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          precisao: Math.round(p.coords.accuracy || 0),
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  });

export const distanciaMetros = (a, b) => {
  if (!a || !b) return Infinity;
  const R = 6371000;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

// coordenadas de um hotel/aeroporto pelo nome (OpenStreetMap, gratuito; pode falhar)
const cacheGeo = new Map();
export const localizarEndereco = async (nome, cidade = "Bahia, Brasil") => {
  const q = `${nome}, ${cidade}`;
  if (cacheGeo.has(q)) return cacheGeo.get(q);
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
      { headers: { Accept: "application/json" } },
    );
    const j = await r.json();
    const ponto = j?.[0]
      ? { lat: Number(j[0].lat), lng: Number(j[0].lon) }
      : null;
    cacheGeo.set(q, ponto);
    return ponto;
  } catch {
    return null;
  }
};

export const linkGoogleMaps = (destino) =>
  `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(destino)}`;
export const linkWaze = (destino) =>
  `https://waze.com/ul?navigate=yes&q=${encodeURIComponent(destino)}`;
export const linkPosicao = (p) =>
  p ? `https://www.google.com/maps?q=${p.lat},${p.lng}` : "";

export const horaDoTimestamp = (v) => {
  const d = v?.toDate ? v.toDate() : v instanceof Date ? v : null;
  return d
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : "";
};

// milissegundos de um Timestamp do Firestore (ou de uma data)
export const msDoTimestamp = (v) =>
  v?.toMillis
    ? v.toMillis()
    : v?.seconds
      ? v.seconds * 1000
      : v instanceof Date
        ? v.getTime()
        : 0;

/* =====================================================================
   APP DO MOTORISTA — link FIXO por motorista (instala uma vez no celular)
   motorista_app/{tokenApp} = { base, fornecedorId, fornecedorNome, motoristaId,
     motoristaNome, dias: { "AAAA-MM-DD": <token do link do dia> }, atualizadoEm }
   O fornecedor manda sempre o mesmo link (/m/<tokenApp>); a página acha o dia
   de hoje (ou o próximo) sozinha. Links de um dia só continuam funcionando.
   ===================================================================== */
export const COL_MOTORISTA_APP = "motorista_app";

export const gravarMotoristaApp = (tokenApp, dados, data, tokenDia) =>
  setDoc(
    doc(db, COL_MOTORISTA_APP, tokenApp),
    {
      ...dados,
      ...(data && tokenDia ? { dias: { [data]: tokenDia } } : {}),
      atualizadoEm: Timestamp.now(),
    },
    { merge: true },
  );

export const ouvirMotoristaApp = (tokenApp, aoMudar) =>
  onSnapshot(
    doc(db, COL_MOTORISTA_APP, tokenApp),
    (snap) => aoMudar(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    () => aoMudar(null),
  );

// o dia que o app abre: hoje; senão o próximo; senão o último
export const diaDoApp = (dias = {}, hoje) => {
  const datas = Object.keys(dias || {}).sort();
  if (dias[hoje]) return hoje;
  return datas.find((d) => d > hoje) || datas[datas.length - 1] || null;
};

/* =====================================================================
   NOTIFICAÇÃO PUSH (app fechado / tela apagada)
   O celular do motorista se inscreve (Web Push, chave VAPID) e a inscrição
   fica em push_escala/{base}__{data}__{escalaId}.inscricoes.{aparelho}.
   Quando a base marca "Recepcionei", o painel do aeroporto lê essas
   inscrições e pede ao backend (Render) para enviar o push.
   Configuração: VITE_VAPID_PUBLIC_KEY (Vercel) e VAPID_PUBLIC_KEY /
   VAPID_PRIVATE_KEY / VAPID_SUBJECT (Render).
   ===================================================================== */
export const COL_PUSH_ESCALA = "push_escala";
export const VAPID_PUBLICA = import.meta.env?.VITE_VAPID_PUBLIC_KEY || "";
export const API_PUSH =
  import.meta.env?.VITE_API_URL || "https://guia-app.onrender.com";
export const pushDisponivel = () =>
  !!VAPID_PUBLICA &&
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

const base64ParaBytes = (b64) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

export const registrarServiceWorker = async () => {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
    return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (e) {
    console.error("Service worker não registrado:", e);
    return null;
  }
};

const idDoAparelho = () => {
  try {
    let id = localStorage.getItem("m.aparelho");
    if (!id) {
      id = novoToken().slice(0, 16);
      localStorage.setItem("m.aparelho", id);
    }
    return id;
  } catch {
    return "aparelho";
  }
};

// pede a permissão e devolve a inscrição de push deste celular (ou null)
export const inscreverPush = async () => {
  if (!pushDisponivel()) return null;
  try {
    const permissao =
      Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;
    if (permissao !== "granted") return null;
    const reg =
      (await registrarServiceWorker()) || (await navigator.serviceWorker.ready);
    const atual = await reg.pushManager.getSubscription();
    const sub =
      atual ||
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ParaBytes(VAPID_PUBLICA),
      }));
    return JSON.parse(JSON.stringify(sub));
  } catch (e) {
    console.error("Não foi possível ativar as notificações:", e);
    return null;
  }
};

// guarda a inscrição nas chegadas do motorista (uma por escala)
export const gravarInscricaoNasEscalas = (
  inscricao,
  base,
  data,
  escalaIds = [],
) =>
  Promise.all(
    escalaIds.map((escalaId) =>
      setDoc(
        doc(db, COL_PUSH_ESCALA, idStatusEscala(base, data, escalaId)),
        {
          base,
          data,
          escalaId: String(escalaId),
          inscricoes: { [idDoAparelho()]: inscricao },
          atualizadoEm: Timestamp.now(),
        },
        { merge: true },
      ).catch((e) => console.error("Inscrição de push não gravada:", e)),
    ),
  );

// painel do aeroporto: avisa os celulares inscritos nessa escala
/* "Testar aviso": manda para ESTE celular uma notificação igual à de
   "passageiros recepcionados", daqui a `atrasoSeg` segundos (dá tempo de
   bloquear a tela ou abrir outro app). Devolve { ok } ou { ok: false, motivo }:
   "sem-suporte" (navegador/iPhone sem o app instalado), "bloqueado"
   (notificações negadas), "servidor" (não deu para falar com o servidor). */
export const testarAviso = async ({ atrasoSeg = 10, nome = "" } = {}) => {
  if (!pushDisponivel()) return { ok: false, motivo: "sem-suporte" };
  if (
    typeof Notification !== "undefined" &&
    Notification.permission === "denied"
  )
    return { ok: false, motivo: "bloqueado" };
  const sub = await inscreverPush();
  if (!sub)
    return {
      ok: false,
      motivo:
        Notification.permission === "denied" ? "bloqueado" : "sem-suporte",
    };
  try {
    const r = await fetch(`${API_PUSH}/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription: sub,
        titulo: "Teste · Passageiros recepcionados",
        corpo: `${nome ? `${nome}, ` : ""}se este aviso apareceu com o app fechado, está tudo certo neste celular.`,
        tag: "teste-aviso",
        url: "/",
        atrasoSeg,
      }),
    });
    if (!r.ok) return { ok: false, motivo: "servidor" };
    return { ok: true, atrasoSeg };
  } catch {
    return { ok: false, motivo: "servidor" };
  }
};

export const enviarPushDaEscala = async ({ data, escalaId, titulo, corpo }) => {
  try {
    const snap = await getDoc(
      doc(db, COL_PUSH_ESCALA, idStatusEscala(baseAtual(), data, escalaId)),
    );
    const inscricoes = Object.values(
      snap.exists() ? snap.data()?.inscricoes || {} : {},
    );
    await Promise.all(
      inscricoes.map((subscription) =>
        fetch(`${API_PUSH}/push`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscription,
            titulo,
            corpo,
            tag: `rec-${escalaId}`,
            url: "/",
          }),
        }).catch(() => null),
      ),
    );
    return inscricoes.length;
  } catch (e) {
    console.error("Push não enviado:", e);
    return 0;
  }
};

// o link que a notificação abre (o service worker lê daqui)
export const lembrarLinkDoApp = async (url) => {
  try {
    const cache = await window.caches.open("luck-motorista-config");
    await cache.put("/__ultimo-link", new Response(url));
  } catch {
    /* navegador sem Cache API */
  }
};

/* App do motorista na tela inicial. O manifest precisa ser um ARQUIVO de
   verdade (/motorista.webmanifest): com o manifest montado na hora (blob:), o
   Chrome não consegue criar o app de verdade (WebAPK) — só um atalho, que não
   aparece na lista de apps do Android nem tem notificação própria.
   O app abre em /m/ e vai para o último link do motorista neste celular. */
const CHAVE_ULTIMO_LINK = "m.ultimoLink";
export const lembrarLinkDoMotorista = (token) => {
  try {
    if (token) localStorage.setItem(CHAVE_ULTIMO_LINK, token);
  } catch {
    /* sem armazenamento */
  }
};
export const ultimoLinkDoMotorista = () => {
  try {
    return localStorage.getItem(CHAVE_ULTIMO_LINK) || "";
  } catch {
    return "";
  }
};
export const definirManifestDoMotorista = () => {
  try {
    let link = document.querySelector('link[rel="manifest"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "manifest";
      document.head.appendChild(link);
    }
    link.href = "/motorista.webmanifest";
  } catch {
    /* fica o manifest padrão */
  }
};

/* =====================================================================
   RETORNO DO MOTORISTA PARA A BASE (painel do aeroporto)
   retorno_escala/{base}__{data}__{escalaId} — o app do motorista grava (sem
   login) só nas chegadas: abriu o app, viu o aviso de recepcionado, está a
   caminho, posicionado, em viagem, finalizado. O painel do aeroporto lê
   tudo do dia numa consulta só e mostra os ícones no card do veículo.
   ===================================================================== */
export const COL_RETORNO_ESCALA = "retorno_escala";

export const gravarRetorno = (base, data, escalaId, campos) =>
  setDoc(
    doc(db, COL_RETORNO_ESCALA, idStatusEscala(base, data, escalaId)),
    {
      base,
      data,
      escalaId: String(escalaId),
      ...campos,
      atualizadoEm: Timestamp.now(),
    },
    { merge: true },
  ).catch((e) => console.error("Retorno do motorista não gravado:", e));

export const ouvirRetornosDoDia = (data, aoMudar) =>
  onSnapshot(
    query(
      collection(db, COL_RETORNO_ESCALA),
      where("data", "==", data),
      where("base", "==", baseAtual()),
    ),
    (snap) => {
      const porEscala = {};
      snap.docs.forEach((d) => {
        const v = d.data() || {};
        if (v.escalaId) porEscala[String(v.escalaId)] = v;
      });
      aoMudar(porEscala);
    },
    (e) => {
      console.error("Erro ao ler o retorno dos motoristas:", e);
      aoMudar({});
    },
  );

// o que mostrar no card do aeroporto a partir do retorno e da recepção
// (frase com o nome do motorista: "Clóvis chegou na porta B")
export const leituraDoRetorno = (r, recepcaoMs = 0) => {
  if (!r) return null;
  const nome =
    String(r.motoristaNome || "")
      .trim()
      .split(" ")[0] || "Motorista";
  const hora = (v) => horaDoTimestamp(v);
  if (r.finalizadoEm)
    return {
      id: "finalizado",
      icone: "circleCheck",
      texto: `${nome} finalizou a viagem`,
      hora: hora(r.finalizadoEm),
    };
  if (r.iniciadoEm)
    return {
      id: "iniciado",
      icone: "navigation",
      texto: `${nome} em viagem`,
      hora: hora(r.iniciadoEm),
    };
  if (r.posicionadoEm)
    return {
      id: "posicionado",
      icone: "mapPin",
      texto: r.porta
        ? `${nome} chegou na porta ${r.porta}`
        : `${nome} chegou no desembarque`,
      hora: hora(r.posicionadoEm),
    };
  const daRecepcao = (campo) =>
    r[campo] && (!recepcaoMs || Number(r.recepcaoMs || 0) >= recepcaoMs);
  if (daRecepcao("acaminhoEm"))
    return {
      id: "acaminho",
      icone: "car",
      texto: `${nome} está a caminho`,
      hora: hora(r.acaminhoEm),
    };
  if (daRecepcao("avisadoEm"))
    return {
      id: "viu",
      icone: "eye",
      texto: `${nome} viu o aviso`,
      hora: hora(r.avisadoEm),
    };
  if (recepcaoMs)
    return {
      id: "avisando",
      icone: "bell",
      texto: `Avisando ${nome}…`,
      hora: "",
    };
  if (r.conectadoEm)
    return {
      id: "conectado",
      icone: "phone",
      texto: `${nome} está com o app`,
      hora: "",
    };
  return null;
};
