// artePlaca.js
//
// Camada de fundo da placa (A4 deitado, em mm): trevo da Luck bem
// transparente, moldura e o desenho em traço fino (farol, igreja,
// Pelourinho, orla, fitinhas do Bonfim). Sai como um SVG só:
// - a pré-visualização mostra o SVG direto;
// - o PDF recebe esse SVG convertido em imagem (JPEG, 200 dpi) — uma vez por
//   modelo; os textos são escritos por cima pelo jsPDF, nítidos.

import logoLuck from "../../../assets/clover.png";
import { DESENHOS_SVG } from "./desenhosSvg";
import { DESENHOS_NORDESTE, azulejo } from "./desenhosNordeste";
import { DESENHOS_REGIOES } from "./desenhosRegioes";
import { temaDaRegiao } from "./temasRegiao";

const TODOS_DESENHOS = { ...DESENHOS_SVG, ...DESENHOS_NORDESTE, ...DESENHOS_REGIOES };

export const LARGURA = 297;
export const ALTURA = 210;

const COR_TRACO = { marcado: "#6c737a", leve: "#9aa0a6", "bem-leve": "#c3c7cb" };
const COR_FITA_TEXTO = { marcado: "#7d848b", leve: "#a9afb5", "bem-leve": "#ced2d6" };

// margens que dependem do modelo (usadas também pelo layout do texto)
export const margensDoModelo = (modelo = {}) => {
  const temMoldura = modelo.moldura && modelo.moldura !== "nenhuma";
  const fitasLaterais = modelo.desenho === "fitinhas" && modelo.posicao === "laterais";
  return {
    temMoldura,
    x: fitasLaterais ? 32 : temMoldura ? 17 : 14,
    topo: temMoldura ? 14 : 10,
    base: temMoldura ? 11 : 6,
  };
};

// espaço que o desenho ocupa embaixo (o nome fica acima dele)
export const reservaInferior = (modelo = {}) => {
  const { base } = margensDoModelo(modelo);
  const d = modelo.desenho;
  if (!d || d === "nenhum") return base + 8;
  if (d === "fitinhas") return modelo.posicao === "laterais" ? base + 8 : base + 48;
  if (d === "azulejos") return base + 44;
  if (TODOS_DESENHOS[d]?.faixa) return base + 54;
  if (modelo.posicao === "base") return base + (d === "orla" ? 64 : d === "pelourinho" ? 56 : 62);
  return base + 56; // canto: o nome sobe um pouco para não encostar no desenho
};

const esc = (t = "") =>
  String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---------- fitinhas ----------
// A fita é o contorno de uma faixa que acompanha uma curva, com largura que
// "torce" de leve e a ponta em V. Preenchida de branco (ou cinza bem claro)
// para as fitas da frente esconderem as de trás.
// a cidade da fita é a da base em uso
export const textosFita = () => ["LUCK", "DESDE 1960", temaDaRegiao().cidade.toUpperCase(), "BEM-VINDOS"];

const ponto = (s, t) => {
  const [p0, p1, p2, p3] = s;
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
};

const amostrar = (segmentos, porSegmento = 32) => {
  const pts = [];
  segmentos.forEach((s, i) => {
    for (let k = i === 0 ? 0 : 1; k <= porSegmento; k += 1) pts.push(ponto(s, k / porSegmento));
  });
  return pts;
};

const polilinha = (pts) => pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" ");

let contadorFita = 0;

const fita = ({ pts, largura, torcao = 2, texto = "", tamanhoTexto, cor, corTexto, espessura, fundo = "#ffffff", inicioTexto = "8%", pontaInicio = false }) => {
  const n = pts.length;
  const ladoA = [];
  const ladoB = [];
  pts.forEach((p, i) => {
    const ant = pts[Math.max(0, i - 1)];
    const prox = pts[Math.min(n - 1, i + 1)];
    let dx = prox[0] - ant[0];
    let dy = prox[1] - ant[1];
    const m = Math.hypot(dx, dy) || 1;
    dx /= m;
    dy /= m;
    const t = i / (n - 1);
    const meia = (largura / 2) * (0.74 + 0.26 * Math.abs(Math.cos(t * Math.PI * torcao)));
    ladoA.push([p[0] - dy * meia, p[1] + dx * meia]);
    ladoB.push([p[0] + dy * meia, p[1] - dx * meia]);
  });
  const ponta = (a, b) => {
    const dir = [a[0] - b[0], a[1] - b[1]];
    const md = Math.hypot(dir[0], dir[1]) || 1;
    return [a[0] - (dir[0] / md) * largura * 0.55, a[1] - (dir[1] / md) * largura * 0.55];
  };
  const vFim = ponta(pts[n - 1], pts[n - 2]);
  const contorno = pontaInicio
    ? [ponta(pts[0], pts[1]), ...ladoA, vFim, ...ladoB.reverse()]
    : [...ladoA, vFim, ...ladoB.reverse()];

  let saida = `<path d="${polilinha(contorno)} Z" fill="${fundo}" stroke="${cor}" stroke-width="${espessura}" stroke-linejoin="round"/>`;
  if (texto) {
    contadorFita += 1;
    const id = `fita${contadorFita}`;
    saida +=
      `<path id="${id}" d="${polilinha(pts)}" fill="none" stroke="none"/>` +
      `<text font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${tamanhoTexto}" ` +
      `letter-spacing="${(tamanhoTexto * 0.14).toFixed(2)}" fill="${corTexto}" stroke="none" dominant-baseline="central">` +
      `<textPath href="#${id}" startOffset="${inicioTexto}">${esc(texto)}</textPath></text>`;
  }
  return saida;
};

const CINZA_FITA = "#eef0f2";

// gradil da igreja na base, com muitas fitas amarradas: uma ponta longa ao
// vento (com o texto) e uma ponta curta caída para baixo
const fitasNaBase = ({ margens, cor, corTexto }) => {
  const TEXTOS_FITA = textosFita();
  const y = ALTURA - margens.base - 11;
  const x0 = margens.x - 4;
  const x1 = LARGURA - margens.x + 4;
  let s = "";
  // gradil: dois corrimãos, hastes e arabescos
  let g = `<path d="M${x0} ${y} H${x1} M${x0} ${y + 4.5} H${x1}"/>`;
  for (let x = x0 + 3; x < x1; x += 9) {
    g += `<path d="M${x.toFixed(1)} ${y} V${y + 11}"/>`;
    g += `<path d="M${(x + 4.5).toFixed(1)} ${y + 6.8} m-1.6 0 a1.6 1.6 0 1 0 3.2 0 a1.6 1.6 0 1 0 -3.2 0" opacity=".6"/>`;
  }
  s += `<g fill="none" stroke="${cor}" stroke-width="0.35">${g}</g>`;

  const passo = 19.5;
  const nos = [];
  for (let x = x0 + 8; x <= x1 - 46; x += passo) nos.push(x);
  const alturas = [22, 31, 18, 27, 35, 20, 29, 24, 33, 19, 28, 25, 30];
  const comprimentos = [44, 52, 40, 56, 48, 42, 54, 46, 50, 41, 53, 47, 49];
  const caidas = [];
  const longas = [];
  nos.forEach((x, i) => {
    const h = alturas[i % alturas.length];
    const c = comprimentos[i % comprimentos.length];
    const onda = (i % 2 ? -1 : 1) * 2.4;
    const meio = [x + c * 0.55, y - h * 0.55];
    const c2 = [x + c * 0.32, y - h * 0.62 + onda];
    const seg1 = [[x, y], [x + c * 0.18, y - h * 0.08], c2, meio];
    const refl = [2 * meio[0] - c2[0], 2 * meio[1] - c2[1]];
    const seg2 = [meio, refl, [x + c * 0.88, y - h * 0.8 - onda], [x + c, y - h]];
    longas.push({
      pts: amostrar([seg1, seg2]),
      largura: 6.4,
      torcao: 1.2 + (i % 4) * 0.15,
      texto: TEXTOS_FITA[i % TEXTOS_FITA.length],
      tamanhoTexto: 2.5,
      fundo: i % 3 === 1 ? CINZA_FITA : "#ffffff",
    });
    // ponta curta caída, para o gradil ficar mais cheio
    const q = 9 + (i % 3) * 3;
    caidas.push({
      pts: amostrar([[[x, y + 1], [x - 2, y + q * 0.4], [x + 3, y + q * 0.7], [x - 1.5, y + q]]], 14),
      largura: 5,
      torcao: 0.8,
      fundo: i % 3 === 1 ? "#ffffff" : CINZA_FITA,
    });
  });
  caidas.forEach((c) => {
    s += fita({ ...c, cor, corTexto, espessura: 0.35 });
  });
  // da esquerda para a direita: cada fita cobre o fim da anterior, nunca o texto dela
  longas.forEach((l) => {
    s += fita({ ...l, cor, corTexto, espessura: 0.35 });
  });
  nos.forEach((x) => {
    s += `<path d="M${(x - 2.4).toFixed(1)} ${y} q2.4 -3.2 4.8 0 q-2.4 3.4 -4.8 0" fill="#ffffff" stroke="${cor}" stroke-width="0.4"/>`;
  });
  return s;
};

// duas fitas trançadas em cada lateral, com os textos da Luck
const fitasNasLaterais = ({ cor, corTexto }) => {
  const trança = (xc, fase) => {
    const pts = [];
    for (let y = 4; y <= ALTURA - 4; y += 2) {
      pts.push([xc + 5.5 * Math.sin((y / 46) * Math.PI * 2 + fase), y]);
    }
    return pts;
  };
  const cidade = temaDaRegiao().cidade.toUpperCase();
  const texto = `LUCK  ·  DESDE 1960  ·  ${cidade}  ·  BEM-VINDOS  ·  LUCK  ·  DESDE 1960`;
  const comum = { largura: 7.5, torcao: 4, tamanhoTexto: 2.7, cor, corTexto, espessura: 0.4, pontaInicio: true };
  let s = "";
  [16, LARGURA - 16].forEach((xc, lado) => {
    const tras = trança(xc, Math.PI);
    const frente = trança(xc, 0);
    const ordem = lado ? [frente, tras] : [tras, frente];
    s += fita({ ...comum, pts: ordem[0], fundo: CINZA_FITA, texto: "", inicioTexto: "0%" });
    s += fita({ ...comum, pts: ordem[1], fundo: "#ffffff", texto, inicioTexto: "3%" });
  });
  return s;
};

// ---------- desenhos de prédios ----------
const desenhoEm = ({ chave, x, y, w, h, espelhar = false, cor, alinhamento = "xMidYMax meet" }) => {
  const d = TODOS_DESENHOS[chave];
  if (!d) return "";
  const svg =
    `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${d.viewBox}" preserveAspectRatio="${alinhamento}" ` +
    `fill="none" stroke="${cor}" stroke-width="${d.traco}" stroke-linecap="round" stroke-linejoin="round">${d.corpo.replaceAll("{cor}", cor)}</svg>`;
  return espelhar ? `<g transform="translate(${2 * x + w} 0) scale(-1 1)">${svg}</g>` : svg;
};

const azulejosNosCantos = (margens, cor) => {
  const l = 13;
  const y = ALTURA - margens.base - 2 - l;
  const xe = margens.x - 4;
  const xd = LARGURA - margens.x + 4 - l;
  const cantos = [[0, 0], [1, 0], [2, 0], [0, -1], [1, -1], [0, -2]];
  let s = "";
  cantos.forEach(([c, r]) => {
    s += azulejo(xe + c * l, y + r * l, l);
    s += azulejo(xd - c * l, y + r * l, l);
  });
  return `<g fill="none" stroke="${cor}" stroke-width="0.32">${s}</g>`;
};

const desenho = (modelo, margens, cor) => {
  const chave = modelo.desenho;
  const fundo = ALTURA - margens.base;
  if (chave === "azulejos") return azulejosNosCantos(margens, cor);
  if (TODOS_DESENHOS[chave]?.faixa) {
    const w = LARGURA - margens.x * 2 + 8;
    const h = w * 0.18;
    return desenhoEm({ chave, x: margens.x - 4, y: fundo - h + 1, w, h, cor, alinhamento: "xMidYMax meet" });
  }
  if (chave === "pelourinho") {
    const h = 60;
    return desenhoEm({ chave, x: margens.temMoldura ? 9 : 0, y: fundo - h + 3, w: LARGURA - (margens.temMoldura ? 18 : 0), h, cor, alinhamento: "xMidYMax slice" });
  }
  if (chave === "orla") {
    const h = 74;
    return desenhoEm({ chave, x: margens.x, y: fundo - h + 4, w: LARGURA - margens.x * 2, h, cor });
  }
  const w = modelo.posicao === "base" ? 100 : 94;
  const h = w * (300 / 420);
  if (modelo.posicao === "base") {
    return desenhoEm({ chave, x: (LARGURA - w) / 2, y: fundo - h + 3, w, h, cor });
  }
  const esquerda = modelo.posicao === "esquerda";
  const x = esquerda ? margens.x - 6 : LARGURA - margens.x - w + 6;
  return desenhoEm({ chave, x, y: fundo - h + 3, w, h, cor, espelhar: esquerda });
};

const moldura = (tipo, cor) => {
  const i = 7;
  const w = LARGURA - i * 2;
  const h = ALTURA - i * 2;
  if (tipo === "fina") return `<rect x="${i}" y="${i}" width="${w}" height="${h}" rx="1.5" fill="none" stroke="${cor}" stroke-width="0.45"/>`;
  if (tipo === "dupla")
    return (
      `<rect x="${i}" y="${i}" width="${w}" height="${h}" rx="1.5" fill="none" stroke="${cor}" stroke-width="0.5"/>` +
      `<rect x="${i + 2.2}" y="${i + 2.2}" width="${w - 4.4}" height="${h - 4.4}" rx="1" fill="none" stroke="#c9cdd1" stroke-width="0.3"/>`
    );
  if (tipo === "cantos") {
    const l = 14;
    const x2 = LARGURA - i;
    const y2 = ALTURA - i;
    return `<path d="M${i} ${i + l} V${i} H${i + l} M${x2 - l} ${i} H${x2} V${i + l} M${i} ${y2 - l} V${y2} H${i + l} M${x2 - l} ${y2} H${x2} V${y2 - l}" fill="none" stroke="${cor}" stroke-width="0.5"/>`;
  }
  return "";
};

// trevo de fundo: versão cinza e menor do logo, preparada uma vez
let trevoCinzaPromessa = null;
export const carregarTrevoCinza = () => {
  if (!trevoCinzaPromessa) {
    trevoCinzaPromessa = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const lado = 512;
          const c = document.createElement("canvas");
          c.width = lado;
          c.height = lado;
          const ctx = c.getContext("2d");
          ctx.drawImage(img, 0, 0, lado, lado);
          const dados = ctx.getImageData(0, 0, lado, lado);
          const p = dados.data;
          for (let k = 0; k < p.length; k += 4) {
            const l = Math.round(p[k] * 0.3 + p[k + 1] * 0.59 + p[k + 2] * 0.11);
            p[k] = l;
            p[k + 1] = l;
            p[k + 2] = l;
          }
          ctx.putImageData(dados, 0, 0);
          resolve(c.toDataURL("image/png"));
        } catch {
          resolve(logoLuck);
        }
      };
      img.onerror = () => resolve("");
      img.src = logoLuck;
    });
  }
  return trevoCinzaPromessa;
};

// logo pequeno para o cabeçalho (o arquivo original é grande)
let logoPequenoPromessa = null;
export const carregarLogoPequeno = () => {
  if (!logoPequenoPromessa) {
    logoPequenoPromessa = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement("canvas");
          c.width = 240;
          c.height = 240;
          c.getContext("2d").drawImage(img, 0, 0, 240, 240);
          resolve(c.toDataURL("image/png"));
        } catch {
          resolve(logoLuck);
        }
      };
      img.onerror = () => resolve("");
      img.src = logoLuck;
    });
  }
  return logoPequenoPromessa;
};

/* SVG completo da camada de fundo. tipo "colecao" usa só trevo (o espaço
   é todo dos nomes). trevo: data URL do trevo cinza (carregarTrevoCinza). */
export const svgArte = (modelo = {}, { tipo = "individual", trevo = "" } = {}) => {
  contadorFita = 0;
  const margens = margensDoModelo(tipo === "colecao" ? {} : modelo);
  const cor = COR_TRACO[modelo.traco] || COR_TRACO.leve;
  const corTexto = COR_FITA_TEXTO[modelo.traco] || COR_FITA_TEXTO.leve;
  let corpo = "";

  const opacidade = Number(modelo.trevo ?? 0.06);
  if (trevo && opacidade > 0) {
    const lado = 150;
    corpo += `<image href="${trevo}" x="${(LARGURA - lado) / 2}" y="${ALTURA * 0.56 - lado / 2}" width="${lado}" height="${lado}" opacity="${opacidade}"/>`;
  }

  if (tipo !== "colecao") {
    corpo += moldura(modelo.moldura, cor);
    if (modelo.desenho === "fitinhas") {
      corpo += modelo.posicao === "laterais" ? fitasNasLaterais({ cor, corTexto }) : fitasNaBase({ margens, cor, corTexto });
    } else if (modelo.desenho && modelo.desenho !== "nenhum") {
      corpo += desenho(modelo, margens, cor);
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `viewBox="0 0 ${LARGURA} ${ALTURA}" width="${LARGURA}mm" height="${ALTURA}mm">` +
    `<rect width="${LARGURA}" height="${ALTURA}" fill="#ffffff"/>${corpo}</svg>`
  );
};

export const svgParaDataUrl = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

// SVG → JPEG (fundo branco) para o PDF. Guarda as últimas conversões.
const cacheRaster = new Map();
export const rasterizarArte = (svg, { dpi = 200 } = {}) => {
  const chave = `${dpi}|${svg.length}|${svg.slice(-400)}|${svg.slice(0, 400)}`;
  if (cacheRaster.has(chave)) return cacheRaster.get(chave);
  const promessa = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = Math.round((LARGURA / 25.4) * dpi);
        c.height = Math.round((ALTURA / 25.4) * dpi);
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.92));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error("Não foi possível desenhar o fundo da placa."));
    img.src = svgParaDataUrl(svg);
  });
  cacheRaster.set(chave, promessa);
  if (cacheRaster.size > 12) cacheRaster.delete(cacheRaster.keys().next().value);
  promessa.catch(() => cacheRaster.delete(chave));
  return promessa;
};
