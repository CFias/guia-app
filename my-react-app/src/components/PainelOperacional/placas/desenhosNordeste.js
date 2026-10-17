// desenhosNordeste.js
//
// Desenhos em traço fino com temas do turismo na Bahia e no Nordeste.
// Dois formatos, como os de desenhosSvg.js:
// - CANTO (viewBox 420×300): ficam no canto direito/esquerdo ou centralizados na base;
// - FAIXA (viewBox 1000×180): faixa larga na base da placa.
// Tudo só contorno (pouca tinta, bom em impressora preto e branco).

const f = (n) => Number(n.toFixed(1));

// ---------- CANTO ----------
const berimbau = () => {
  let s = "";
  // arco, corda e cabaça
  s += '<path d="M262 16 Q352 150 262 288"/><path d="M262 16 V288"/>';
  s += '<path d="M262 18 l-4 -6 M262 286 l-4 6" opacity=".6"/>';
  s += '<circle cx="232" cy="226" r="30"/><ellipse cx="216" cy="226" rx="7" ry="16" opacity=".55"/>';
  s += '<path d="M248 210 L262 205 M248 242 L262 238" opacity=".8"/>';
  // baqueta e caxixi
  s += '<path d="M150 120 L238 194" stroke-width="2.2"/>';
  s += '<path d="M168 286 q4 -44 22 -52 q18 8 22 52 z"/><path d="M178 284 q2 -30 12 -40 M190 286 v-46 M202 284 q-2 -30 -12 -40" opacity=".5"/>';
  s += '<path d="M190 234 v-14 q0 -6 6 -6" />';
  // pandeiro
  s += '<circle cx="100" cy="206" r="56"/><circle cx="100" cy="206" r="47" opacity=".55"/>';
  for (let k = 0; k < 6; k += 1) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    const x = 100 + Math.cos(a) * 51.5;
    const y = 206 + Math.sin(a) * 51.5;
    s += `<rect x="${f(x - 5)}" y="${f(y - 2.5)}" width="10" height="5" rx="2" transform="rotate(${f((a * 180) / Math.PI + 90)} ${f(x)} ${f(y)})"/>`;
  }
  s += '<path d="M30 292 H392" opacity=".5"/>';
  return s;
};

const baiana = () => {
  let s = "";
  // turbante
  s += '<path d="M176 74 q34 -60 72 -4 q-8 14 -36 16 q-30 -2 -36 -12 z"/>';
  s += '<path d="M186 62 q20 -10 50 4 M196 46 q16 -6 34 6" opacity=".55"/>';
  s += '<path d="M244 64 q22 -6 26 12 q-12 -4 -22 2" opacity=".8"/>';
  // cabeça e pescoço (sem rosto)
  s += '<ellipse cx="212" cy="96" rx="19" ry="23"/><path d="M204 118 v9 M220 118 v9"/>';
  // fios de contas
  s += '<path d="M186 132 q26 28 52 0" stroke-dasharray="0.1 6.5" stroke-width="3.2"/>';
  s += '<path d="M180 132 q32 42 64 0" stroke-dasharray="0.1 6.5" stroke-width="3.2" opacity=".7"/>';
  // blusa, pano da costa e braços
  s += '<path d="M172 130 q40 -12 80 0 l14 42 H158 z"/>';
  s += '<path d="M172 130 L250 172" opacity=".55"/>';
  s += '<path d="M170 136 q-22 26 -10 64 M254 136 q22 26 10 64"/>';
  // saia rodada com renda
  s += '<path d="M158 172 C126 220 98 262 84 288 H340 C326 262 298 220 266 172 Z"/>';
  const renda = (y, x0, x1) => {
    let r = `<path d="M${f(x0)} ${y}`;
    for (let x = x0; x < x1 - 1; x += 16) r += " q8 9 16 0";
    return `${r}" opacity=".6"/>`;
  };
  s += renda(214, 136, 290);
  s += renda(250, 110, 316);
  s += renda(280, 90, 336);
  s += '<path d="M212 172 C206 220 200 260 198 288 M240 176 C246 220 262 262 270 288 M184 176 C176 220 158 262 150 288" opacity=".35"/>';
  s += '<path d="M60 294 H364" opacity=".5"/>';
  return s;
};

const elevador = () => {
  let s = "";
  // cidade alta no alto da encosta
  s += '<path d="M236 58 L262 292" opacity=".6"/><path d="M236 58 H410"/>';
  s += '<path d="M268 58 V32 h26 V58 M300 58 V22 l14 -10 l14 10 V58 M336 58 V36 h30 V58 M372 58 V28 l12 -8 l12 8 V58"/>';
  s += '<path d="M274 40 h8 v8 h-8z M306 30 h10 v10 h-10z M344 44 h12 v8 h-12z M378 36 h10 v10 h-10z" opacity=".55"/>';
  // passarela
  s += '<path d="M176 58 H236 M176 66 H236"/><path d="M186 58 v8 M198 58 v8 M210 58 v8 M222 58 v8" opacity=".5"/>';
  // torre
  s += '<path d="M126 58 V236 M176 58 V236"/><path d="M118 58 H184 V34 H118 Z"/><path d="M118 42 H184" opacity=".55"/>';
  s += '<path d="M138 34 V22 H164 V34 M146 22 V14 H156 V22"/>';
  s += '<path d="M146 66 V228 M156 66 V228" opacity=".6"/>';
  for (let y = 84; y < 232; y += 22) s += `<path d="M126 ${y} H176" opacity=".35"/>`;
  // prédio de baixo
  s += '<path d="M70 288 V236 H232 V288"/><path d="M64 236 H238"/>';
  for (let x = 86; x < 224; x += 28) s += `<path d="M${x} 288 v-26 a8 8 0 0 1 16 0 v26" opacity=".65"/>`;
  s += '<path d="M20 292 H410" opacity=".5"/>';
  return s;
};

const tartaruga = () => {
  let s = '<g transform="rotate(-18 210 160)">';
  s += '<ellipse cx="210" cy="164" rx="66" ry="84"/>';
  s += '<path d="M210 112 L238 132 L238 170 L210 190 L182 170 L182 132 Z"/>';
  s += '<path d="M210 112 V86 M238 132 L268 116 M238 170 L272 186 M210 190 V244 M182 170 L148 186 M182 132 L152 116" opacity=".6"/>';
  s += '<path d="M210 190 L238 222 M210 190 L182 222" opacity=".4"/>';
  s += '<ellipse cx="210" cy="64" rx="17" ry="22"/><circle cx="203" cy="58" r="2" opacity=".7"/><circle cx="217" cy="58" r="2" opacity=".7"/>';
  s += '<path d="M154 116 q-56 -40 -98 -22 q34 28 92 52"/><path d="M266 116 q56 -40 98 -22 q-34 28 -92 52"/>';
  s += '<path d="M160 222 q-36 18 -40 46 q24 -8 50 -30"/><path d="M260 222 q36 18 40 46 q-24 -8 -50 -30"/>';
  s += '<path d="M210 248 l-6 18 l12 0 z" opacity=".7"/>';
  s += "</g>";
  s += '<path d="M10 290 q20 -8 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0" opacity=".5"/>';
  s += '<path d="M40 278 q16 -6 32 0 t32 0" opacity=".35"/><path d="M310 270 q16 -6 32 0 t32 0" opacity=".35"/>';
  return s;
};

// ---------- FAIXA ----------
const ondas = (y0, linhas = 3, passo = 50) => {
  let s = "";
  for (let i = 0; i < linhas; i += 1) {
    let d = `M${i * 18} ${y0 + i * 12}`;
    for (let x = i * 18; x < 1000; x += passo) d += ` q${passo / 4} -6 ${passo / 2} 0 t${passo / 2} 0`;
    s += `<path d="${d}" opacity="${f(1 - i * 0.3)}"/>`;
  }
  return s;
};

const coqueiro = (x, base, alt, incl = 1) => {
  const topoX = x + incl * 22;
  const topoY = base - alt;
  let s = `<path d="M${x} ${base} Q${x + incl * 4} ${base - alt * 0.6} ${topoX} ${topoY}"/>`;
  s += `<path d="M${x + 6} ${base} Q${x + incl * 10} ${base - alt * 0.6} ${topoX + 5} ${topoY + 2}" opacity=".5"/>`;
  [[-40, -6], [-30, -22], [-4, -28], [26, -20], [42, 4], [-46, 14]].forEach(([dx, dy]) => {
    s += `<path d="M${topoX} ${topoY} q${f(dx * 0.5)} ${f(dy - 14)} ${dx} ${dy + 6}"/>`;
  });
  s += `<circle cx="${topoX - 3}" cy="${topoY + 6}" r="3.5"/><circle cx="${topoX + 4}" cy="${topoY + 7}" r="3.5"/>`;
  return s;
};

const jangada = () => {
  let s = ondas(146, 3, 60);
  // jangada principal
  s += '<path d="M190 138 H330 L318 148 H202 Z"/><path d="M214 138 V130 M306 138 V130" opacity=".6"/>';
  s += '<path d="M258 138 V26"/><path d="M262 30 Q342 78 306 134 H262 Z"/><path d="M262 60 Q312 84 300 104" opacity=".45"/>';
  // jangada ao longe
  s += '<path d="M520 128 H572 L568 132 H524 Z"/><path d="M544 128 V82"/><path d="M546 84 Q574 102 562 126 H546 Z"/>';
  // sol
  s += '<circle cx="660" cy="56" r="22"/>';
  for (let k = 0; k < 12; k += 1) {
    const a = (k / 12) * Math.PI * 2;
    s += `<path d="M${f(660 + Math.cos(a) * 30)} ${f(56 + Math.sin(a) * 30)} L${f(660 + Math.cos(a) * 40)} ${f(56 + Math.sin(a) * 40)}" opacity=".6"/>`;
  }
  // praia e coqueiros
  s += '<path d="M720 150 Q820 124 1000 138" opacity=".7"/>';
  s += coqueiro(820, 136, 104, 1) + coqueiro(900, 140, 128, -1) + coqueiro(962, 140, 84, 1);
  s += '<path d="M60 40 q8 -6 16 0 q8 -6 16 0 M430 30 q6 -5 12 0 q6 -5 12 0" opacity=".5"/>';
  return s;
};

const sol = (cx, cy) => {
  let s = `<circle cx="${cx}" cy="${cy}" r="20"/><circle cx="${cx}" cy="${cy}" r="12" opacity=".55"/>`;
  for (let k = 0; k < 12; k += 1) {
    const a = (k / 12) * Math.PI * 2;
    const a1 = a - 0.12;
    const a2 = a + 0.12;
    s += `<path d="M${f(cx + Math.cos(a1) * 25)} ${f(cy + Math.sin(a1) * 25)} L${f(cx + Math.cos(a) * 40)} ${f(cy + Math.sin(a) * 40)} L${f(cx + Math.cos(a2) * 25)} ${f(cy + Math.sin(a2) * 25)}"/>`;
  }
  return s;
};

const mandacaru = (cx) => {
  let s = `<path d="M${cx - 9} 150 V54 a9 9 0 0 1 18 0 V150"/>`;
  s += `<path d="M${cx - 9} 112 H${cx - 22} a8 8 0 0 1 -8 -8 V76 a7 7 0 0 1 14 0 V98 H${cx - 9}"/>`;
  s += `<path d="M${cx + 9} 96 H${cx + 22} a8 8 0 0 0 8 -8 V62 a7 7 0 0 0 -14 0 V82 H${cx + 9}"/>`;
  s += `<path d="M${cx - 3} 52 V148 M${cx + 3} 52 V148" opacity=".4"/>`;
  s += `<path d="M${cx - 40} 152 H${cx + 40}" opacity=".6"/>`;
  return s;
};

const chapeu = (cx) => {
  let s = `<path d="M${cx - 52} 118 Q${cx} 30 ${cx + 52} 118"/>`;
  s += `<path d="M${cx - 60} 120 Q${cx} 140 ${cx + 60} 120 Q${cx} 108 ${cx - 60} 120 Z"/>`;
  s += `<path d="M${cx - 38} 104 Q${cx} 92 ${cx + 38} 104" opacity=".55"/>`;
  // estrela na aba da frente
  let e = "";
  for (let k = 0; k < 10; k += 1) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const r = k % 2 ? 5 : 12;
    e += `${k ? "L" : "M"}${f(cx + Math.cos(a) * r)} ${f(80 + Math.sin(a) * r)} `;
  }
  s += `<path d="${e}Z"/>`;
  return s;
};

const asaBranca = (cx) =>
  `<path d="M${cx - 44} 84 q22 -26 44 2 q22 -28 44 -2"/><path d="M${cx - 6} 86 q6 6 12 0" opacity=".7"/>` +
  `<path d="M${cx - 14} 120 q11 -13 22 1 q11 -14 22 -1" opacity=".6"/>`;

const casinha = (cx) =>
  `<path d="M${cx - 38} 150 V96 L${cx} 64 L${cx + 38} 96 V150"/><path d="M${cx - 46} 102 L${cx} 60 L${cx + 46} 102"/>` +
  `<path d="M${cx - 10} 150 V120 h20 V150 M${cx - 30} 108 h14 v14 h-14z M${cx + 16} 108 h14 v14 h-14z" opacity=".7"/>`;

const estrela8 = (cx) => {
  let e = "";
  for (let k = 0; k < 16; k += 1) {
    const a = (k * Math.PI) / 8;
    const r = k % 2 ? 14 : 34;
    e += `${k ? "L" : "M"}${f(cx + Math.cos(a) * r)} ${f(92 + Math.sin(a) * r)} `;
  }
  return `<path d="${e}Z"/><circle cx="${cx}" cy="92" r="6" opacity=".6"/>`;
};

const cordel = () => {
  let s = '<path d="M0 8 H1000 M0 15 H1000 M0 165 H1000 M0 172 H1000"/>';
  const motivos = [sol, mandacaru, asaBranca, chapeu, estrela8, casinha, mandacaru, sol];
  const passo = 1000 / motivos.length;
  motivos.forEach((m, i) => {
    const cx = f(passo * i + passo / 2);
    s += m === sol ? sol(cx, 92) : m(cx);
    if (i > 0) s += `<path d="M${f(passo * i)} 84 l6 8 l-6 8 l-6 -8 z" opacity=".55"/>`;
  });
  return s;
};

// bandeirinhas de São João + fogueira
const saoJoao = () => {
  let s = "";
  const varal = (y0, flecha, cor = 1) => {
    const p0 = [0, y0];
    const p1 = [500, y0 + flecha * 2];
    const p2 = [1000, y0];
    let r = `<path d="M${p0[0]} ${p0[1]} Q${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]}" opacity="${cor}"/>`;
    for (let t = 0.03; t < 0.99; t += 0.042) {
      const x = (1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0];
      const y = (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1];
      if (x > 800 && y0 > 60) continue;
      r += `<path d="M${f(x - 11)} ${f(y)} H${f(x + 11)} V${f(y + 26)} L${f(x)} ${f(y + 18)} L${f(x - 11)} ${f(y + 26)} Z" opacity="${cor}"/>`;
    }
    return r;
  };
  s += varal(6, 34) + varal(64, 30, 0.7);
  // fogueira
  s += '<path d="M850 172 L948 140 M850 140 L948 172 M856 160 H942" />';
  s += '<path d="M899 138 q-30 -34 -6 -70 q4 24 18 30 q4 -18 -4 -36 q34 26 18 76 Z"/><path d="M900 134 q-12 -16 0 -34 q12 18 0 34" opacity=".6"/>';
  // milho
  s += '<path d="M780 170 q-16 -40 0 -86 q16 46 0 86 Z"/><path d="M780 168 q-24 -20 -26 -54 M780 168 q24 -20 26 -54" opacity=".6"/>';
  s += '<path d="M774 110 h12 M772 126 h16 M772 142 h16" opacity=".4"/>';
  return s;
};

// serpentinas, confetes e máscara de Carnaval
const carnaval = () => {
  let s = "";
  // serpentina: curva que dá voltinhas (trocoide), como a fita de papel solta
  const serpentina = (x0, y0, comprimento, raio, voltas, subida = 0) => {
    const pts = [];
    const passos = voltas * 28;
    for (let i = 0; i <= passos; i += 1) {
      const t = (i / passos) * voltas * Math.PI * 2;
      const avanço = (i / passos) * comprimento;
      pts.push([x0 + avanço + raio * 1.25 * Math.cos(t + Math.PI), y0 - (i / passos) * subida + raio * Math.sin(t + Math.PI)]);
    }
    return `<path d="${pts.map((p, i) => `${i ? "L" : "M"}${f(p[0])} ${f(p[1])}`).join(" ")}"/>`;
  };
  s += serpentina(20, 140, 300, 16, 6, 40) + serpentina(560, 150, 260, 15, 5, 70) + serpentina(700, 60, 280, 14, 5, -30);
  // confetes (posições fixas)
  [
    [60, 40], [120, 160], [180, 70], [250, 150], [330, 30], [380, 150], [450, 90], [520, 40], [600, 170],
    [640, 70], [700, 130], [760, 160], [820, 120], [880, 40], [940, 150], [970, 90], [140, 110], [470, 160],
  ].forEach(([x, y], i) => {
    s += i % 3 === 0 ? `<rect x="${x - 3}" y="${y - 3}" width="6" height="6" transform="rotate(30 ${x} ${y})"/>` : `<circle cx="${x}" cy="${y}" r="${i % 2 ? 3 : 4.5}"/>`;
  });
  // máscara
  s += '<path d="M400 90 q50 -30 100 0 q-6 34 -30 34 q-14 0 -20 -16 q-6 16 -20 16 q-24 0 -30 -34 Z"/>';
  s += '<ellipse cx="428" cy="96" rx="11" ry="7" opacity=".7"/><ellipse cx="472" cy="96" rx="11" ry="7" opacity=".7"/>';
  s += '<path d="M500 90 q24 -36 18 -70 M500 90 q34 -20 46 -54" opacity=".6"/><path d="M400 92 L380 140" opacity=".6"/>';
  return s;
};

export const DESENHOS_NORDESTE = {
  berimbau: { viewBox: "0 0 420 300", traco: 1.6, corpo: berimbau() },
  baiana: { viewBox: "0 0 420 300", traco: 1.6, corpo: baiana() },
  elevador: { viewBox: "0 0 420 300", traco: 1.6, corpo: elevador() },
  tartaruga: { viewBox: "0 0 420 300", traco: 1.6, corpo: tartaruga() },
  jangada: { viewBox: "0 0 1000 180", traco: 1.6, corpo: jangada(), faixa: true },
  cordel: { viewBox: "0 0 1000 180", traco: 1.6, corpo: cordel(), faixa: true },
  saojoao: { viewBox: "0 0 1000 180", traco: 1.6, corpo: saoJoao(), faixa: true },
  carnaval: { viewBox: "0 0 1000 180", traco: 1.6, corpo: carnaval(), faixa: true },
};

// azulejo português (traço), desenhado direto em mm
export const azulejo = (x, y, l) => {
  const c = l / 2;
  const r = l * 0.3;
  let s = `<rect x="${f(x)}" y="${f(y)}" width="${f(l)}" height="${f(l)}"/>`;
  s += `<circle cx="${f(x + c)}" cy="${f(y + c)}" r="${f(l * 0.14)}"/>`;
  // pétalas em cruz
  [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dy]) => {
    const px = x + c + dx * l * 0.27;
    const py = y + c + dy * l * 0.27;
    s += `<ellipse cx="${f(px)}" cy="${f(py)}" rx="${f(dx ? l * 0.12 : l * 0.06)}" ry="${f(dy ? l * 0.12 : l * 0.06)}"/>`;
  });
  // quartos de círculo nos cantos (formam o desenho entre azulejos)
  s += `<path d="M${f(x + r)} ${f(y)} A${f(r)} ${f(r)} 0 0 1 ${f(x)} ${f(y + r)}"/>`;
  s += `<path d="M${f(x + l - r)} ${f(y)} A${f(r)} ${f(r)} 0 0 0 ${f(x + l)} ${f(y + r)}"/>`;
  s += `<path d="M${f(x)} ${f(y + l - r)} A${f(r)} ${f(r)} 0 0 1 ${f(x + r)} ${f(y + l)}"/>`;
  s += `<path d="M${f(x + l)} ${f(y + l - r)} A${f(r)} ${f(r)} 0 0 0 ${f(x + l - r)} ${f(y + l)}"/>`;
  s += `<path d="M${f(x + c)} ${f(y + l * 0.06)} L${f(x + l * 0.94)} ${f(y + c)} L${f(x + c)} ${f(y + l * 0.94)} L${f(x + l * 0.06)} ${f(y + c)} Z" opacity=".35"/>`;
  return s;
};
