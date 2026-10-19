// desenhosRegioes.js
//
// Desenhos em traço fino dos pontos turísticos das outras bases Luck e
// alguns temas que valem para todo o Nordeste. Mesmo estilo e formatos de
// desenhosSvg.js / desenhosNordeste.js:
// - CANTO (viewBox 420×300): canto direito/esquerdo ou centralizado na base;
// - FAIXA (viewBox 1000×180): faixa larga na base da placa.
// Só contorno (pouca tinta, bom em impressora preto e branco).
// "{cor}" no corpo é trocado pela cor do traço (usado nos textos).

const f = (n) => Number(n.toFixed(1));

// ---------- peças ----------
const ondas = (y0, x0, x1, { linhas = 3, passo = 40, amp = 5, op = 1 } = {}) => {
  let s = "";
  for (let i = 0; i < linhas; i += 1) {
    const ini = x0 + (i % 2) * (passo / 3);
    let d = `M${f(ini)} ${y0 + i * 10}`;
    for (let x = ini; x < x1 - passo / 2; x += passo) d += ` q${passo / 4} ${-amp} ${passo / 2} 0 t${passo / 2} 0`;
    s += `<path d="${d}" opacity="${f(op * (1 - i * 0.28))}"/>`;
  }
  return s;
};

const coqueiro = (x, base, alt, incl = 1, esc = 1) => {
  const tx = x + incl * 22 * esc;
  const ty = base - alt;
  let s = `<path d="M${x} ${base} Q${f(x + incl * 4 * esc)} ${f(base - alt * 0.6)} ${f(tx)} ${f(ty)}"/>`;
  s += `<path d="M${f(x + 6 * esc)} ${base} Q${f(x + incl * 10 * esc)} ${f(base - alt * 0.6)} ${f(tx + 5 * esc)} ${f(ty + 2)}" opacity=".5"/>`;
  [[-40, -6], [-30, -22], [-4, -28], [26, -20], [42, 4], [-46, 14]].forEach(([dx, dy]) => {
    s += `<path d="M${f(tx)} ${f(ty)} q${f(dx * 0.5 * esc)} ${f((dy - 14) * esc)} ${f(dx * esc)} ${f((dy + 6) * esc)}"/>`;
  });
  s += `<circle cx="${f(tx - 3 * esc)}" cy="${f(ty + 6 * esc)}" r="${f(3.5 * esc)}"/><circle cx="${f(tx + 4 * esc)}" cy="${f(ty + 7 * esc)}" r="${f(3.5 * esc)}"/>`;
  return s;
};

const sol = (cx, cy, r = 20, { raios = 12, op = 1, meio = false } = {}) => {
  let s = meio
    ? `<path d="M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}" opacity="${op}"/>`
    : `<circle cx="${cx}" cy="${cy}" r="${r}" opacity="${op}"/>`;
  for (let k = 0; k < raios; k += 1) {
    const a = meio ? Math.PI + (k / (raios - 1)) * Math.PI : (k / raios) * Math.PI * 2;
    s += `<path d="M${f(cx + Math.cos(a) * (r + 7))} ${f(cy + Math.sin(a) * (r + 7))} L${f(cx + Math.cos(a) * (r + 17))} ${f(cy + Math.sin(a) * (r + 17))}" opacity="${f(op * 0.6)}"/>`;
  }
  return s;
};

const gaivota = (x, y, l = 10) => `<path d="M${x - l} ${y} q${l / 2} ${-l * 0.6} ${l} 0 q${l / 2} ${-l * 0.6} ${l} 0" opacity=".55"/>`;

// jangada de vela triangular (x = centro do casco, y = linha d'água)
const jangadaVela = (x, y, e = 1, { listras = 0 } = {}) => {
  const w = 60 * e;
  let s = `<path d="M${f(x - w)} ${y - 8 * e} H${f(x + w)} L${f(x + w - 8 * e)} ${y} H${f(x - w + 8 * e)} Z"/>`;
  s += `<path d="M${x} ${f(y - 8 * e)} V${f(y - 120 * e)}"/>`;
  s += `<path d="M${f(x + 3 * e)} ${f(y - 116 * e)} Q${f(x + 64 * e)} ${f(y - 64 * e)} ${f(x + 40 * e)} ${f(y - 12 * e)} H${f(x + 3 * e)} Z"/>`;
  for (let i = 1; i <= listras; i += 1) {
    const yy = y - 12 * e - (i * 100 * e) / (listras + 1);
    const larg = 4 + (40 * (yy - (y - 116 * e))) / (104 * e);
    s += `<path d="M${f(x + 3 * e)} ${f(yy)} H${f(x + 3 * e + Math.max(6, larg) * e * 1.1)}" opacity=".5"/>`;
  }
  return s;
};

const peixe = (x, y, e = 1, dir = 1) =>
  `<path d="M${x} ${y} q${f(dir * 10 * e)} ${f(-8 * e)} ${f(dir * 20 * e)} 0 q${f(-dir * 10 * e)} ${f(8 * e)} ${f(-dir * 20 * e)} 0 Z M${f(x + dir * 20 * e)} ${y} l${f(dir * 7 * e)} ${f(-5 * e)} v${f(10 * e)} Z" opacity=".7"/>`;

// pontos (x) de uma curva cúbica, para apoiar casas e árvores numa encosta
const cubica = (p0, p1, p2, p3) => (t) => {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
};
const alturaNaCurva = (curvas, x) => {
  let melhor = null;
  curvas.forEach((c) => {
    for (let t = 0; t <= 1; t += 0.01) {
      const p = c(t);
      if (!melhor || Math.abs(p[0] - x) < Math.abs(melhor[0] - x)) melhor = p;
    }
  });
  return melhor ? melhor[1] : 0;
};

// =====================================================================
// NATAL (RN)
// =====================================================================

// Forte dos Reis Magos, sobre o arrecife, com a ponte Newton Navarro ao fundo
const reisMagos = () => {
  let s = "";
  // ponte ao fundo
  s += '<g opacity=".35"><path d="M196 128 Q320 112 420 120"/><path d="M330 120 V30"/>';
  [212, 244, 276, 304, 356, 384, 412].forEach((x) => {
    s += `<path d="M330 36 L${x} ${f(126 - (x - 196) * 0.05)}"/>`;
  });
  s += "</g>";
  // arrecife e mar
  s += '<path d="M30 258 Q50 248 80 252 Q120 246 160 252 Q210 246 260 252 Q310 246 350 252 Q376 248 392 258"/>';
  s += ondas(270, 0, 420, { linhas: 3, passo: 42 });
  // muralha em estrela (faces em ângulo)
  s += '<path d="M48 252 L78 204 L130 214 L210 196 L290 214 L342 204 L372 252 Z"/>';
  s += '<path d="M78 204 V196 L130 206 L210 188 L290 206 L342 196 V204" />';
  s += '<path d="M130 214 L134 252 M290 214 L286 252" opacity=".5"/>';
  s += '<path d="M96 232 h10 M150 236 h10 M262 236 h10 M316 232 h10" opacity=".55"/>';
  // guaritas nas pontas
  [78, 342].forEach((x) => {
    s += `<path d="M${x - 7} 196 V178 H${x + 7} V196"/><path d="M${x - 10} 178 Q${x} 160 ${x + 10} 178"/><path d="M${x - 2} 186 h4" opacity=".6"/>`;
  });
  // portal com frontão e bandeira
  s += '<path d="M190 252 V214 H230 V252"/><path d="M196 252 V230 a14 14 0 0 1 28 0 V252"/>';
  s += '<path d="M184 214 H236 M188 214 L210 182 L232 214"/><path d="M210 196 v8" opacity=".6"/>';
  s += '<path d="M210 182 V146"/><path d="M210 148 h26 l-7 7 l7 7 h-26" />';
  s += sol(66, 70, 16, { raios: 10, op: 0.8 });
  s += gaivota(130, 96, 9) + gaivota(160, 80, 7);
  return s;
};

// Morro do Careca: a duna com mata dos lados e o meio "careca"
const morroCareca = () => {
  let s = '<g transform="translate(58 0) scale(0.86 1)">';
  s += '<path d="M24 256 C80 220 120 74 210 64 C300 56 336 200 404 256"/>';
  // mata dos dois lados (tufos)
  const tufos = (pts) => pts.map(([x, y]) => `<path d="M${x - 8} ${y} q4 -10 8 0 q4 -12 8 0 q4 -9 8 0" opacity=".75"/>`).join("");
  s += tufos([[50, 240], [70, 222], [88, 200], [102, 176], [114, 150], [128, 124], [146, 100], [64, 252], [92, 238], [116, 214], [130, 190]]);
  s += tufos([[290, 104], [306, 130], [320, 156], [336, 182], [352, 206], [372, 232], [312, 178], [332, 210], [350, 238], [384, 250]]);
  // areia (vento) no meio
  s += '<path d="M158 120 Q210 104 262 124 M146 160 Q210 142 278 164 M136 200 Q210 184 300 206" opacity=".35"/>';
  s += "</g>";
  // praia, mar e guarda-sol
  s += '<path d="M0 262 H420" opacity=".6"/>';
  s += ondas(274, 0, 420, { linhas: 2, passo: 44 });
  s += '<path d="M42 262 V214"/><path d="M12 218 Q42 188 72 218 Q64.5 212 57 218 Q49.5 212 42 218 Q34.5 212 27 218 Q19.5 212 12 218"/>';
  s += sol(360, 52, 15, { raios: 10, op: 0.8 });
  s += gaivota(120, 60, 8) + gaivota(146, 46, 6);
  return s;
};

// Maior cajueiro do mundo (Pirangi), com cajus
const cajueiro = () => {
  let s = "";
  // copa larga, em ondas
  const cx = 210;
  const cy = 150;
  const rx = 186;
  const ry = 92;
  const n = 15;
  let d = "";
  for (let i = 0; i <= n; i += 1) {
    const a = Math.PI + (i / n) * Math.PI;
    const x = cx + Math.cos(a) * rx;
    const y = cy + Math.sin(a) * ry;
    if (!i) d += `M${f(x)} ${f(y)}`;
    else d += ` A16 13 0 0 1 ${f(x)} ${f(y)}`;
  }
  // borda de baixo, irregular
  const passos = Math.round((2 * rx) / 30);
  const passo = (2 * rx) / passos;
  for (let i = 0; i < passos; i += 1) d += ` q${f(-passo * 0.27)} 14 ${f(-passo / 2)} 6 q${f(-passo * 0.27)} 12 ${f(-passo / 2)} -6`;
  s += `<path d="${d} Z"/>`;
  s += '<path d="M80 120 q10 -8 20 0 M150 92 q10 -8 20 0 M250 96 q10 -8 20 0 M320 124 q10 -8 20 0 M200 128 q10 -8 20 0 M120 150 q10 -8 20 0 M286 150 q10 -8 20 0" opacity=".35"/>';
  // troncos e galhos que descem até o chão
  s += '<path d="M168 168 C150 206 176 238 146 288 M186 168 C170 210 196 240 172 288"/>';
  s += '<path d="M222 168 C236 204 214 236 240 288 M240 168 C256 206 234 240 264 288"/>';
  s += '<path d="M176 220 C196 214 210 222 226 214" opacity=".55"/>';
  s += '<path d="M98 166 C70 196 74 236 36 262 Q24 272 30 284 M114 166 C90 200 96 240 60 270 Q52 278 58 286" opacity=".85"/>';
  s += '<path d="M322 166 C350 196 346 236 384 262 Q396 272 390 284 M306 166 C330 200 324 240 360 270 Q368 278 362 286" opacity=".85"/>';
  s += '<path d="M10 290 H410" opacity=".55"/>';
  // cajus pendurados
  const caju = (x, y) =>
    `<path d="M${x} ${y} q-11 4 -11 20 q0 16 11 18 q11 -2 11 -18 q0 -16 -11 -20 Z"/>` +
    `<path d="M${x - 5} ${y} q-5 -11 4 -13 q10 -1 8 9 q-2 6 -7 4" opacity=".85"/><path d="M${x} ${y - 13} v-8" opacity=".6"/>`;
  s += caju(286, 186) + caju(132, 192);
  return s;
};

// =====================================================================
// RECIFE / OLINDA / PORTO DE GALINHAS (PE)
// =====================================================================

const sombrinha = (cx, cy, r, rot) => {
  let s = `<g transform="rotate(${rot} ${cx} ${cy})">`;
  s += `<path d="M${cx - r} ${cy} A${r} ${r * 0.82} 0 0 1 ${cx + r} ${cy}"/>`;
  // borda em gomos
  const n = 8;
  let borda = `M${cx + r} ${cy}`;
  for (let i = 1; i <= n; i += 1) borda += ` Q${f(cx + r - (2 * r * (i - 0.5)) / n)} ${f(cy + r * 0.12)} ${f(cx + r - (2 * r * i) / n)} ${cy}`;
  s += `<path d="${borda}"/>`;
  // varetas
  for (let i = 1; i < n; i += 1) {
    const x = cx + r - (2 * r * i) / n;
    s += `<path d="M${cx} ${f(cy - r * 0.82)} Q${f(cx + (x - cx) * 0.95)} ${f(cy - r * 0.42)} ${f(x)} ${cy}" opacity="${i % 2 ? 0.9 : 0.45}"/>`;
  }
  // gomos alternados com listras
  for (let i = 0; i < n; i += 2) {
    const x = cx + r - (2 * r * (i + 0.5)) / n;
    s += `<path d="M${f(x - 4)} ${f(cy - r * 0.2)} l8 -6 M${f(x - 5)} ${f(cy - r * 0.08)} l10 -7" opacity=".45"/>`;
  }
  s += `<path d="M${cx} ${f(cy - r * 0.82)} v-8"/><path d="M${cx} ${cy} V${f(cy + r * 0.62)} q0 8 -7 8"/>`;
  return `${s}</g>`;
};

const frevo = () => {
  let s = sombrinha(250, 150, 96, -14) + sombrinha(104, 214, 58, 18);
  // serpentinas e confete
  s += '<path d="M330 60 c18 6 6 22 22 26 c16 4 4 20 22 24" opacity=".6"/><path d="M40 90 c14 8 0 20 14 28 c14 8 0 20 14 28" opacity=".6"/>';
  [[60, 60], [170, 40], [380, 150], [356, 220], [36, 160], [200, 270], [300, 262], [150, 120]].forEach(([x, y], i) => {
    s += i % 2 ? `<circle cx="${x}" cy="${y}" r="3.5" opacity=".7"/>` : `<rect x="${x - 3}" y="${y - 3}" width="6" height="6" transform="rotate(30 ${x} ${y})" opacity=".7"/>`;
  });
  // notas musicais
  s += '<path d="M372 96 v-26 l18 -5 v24"/><ellipse cx="368" cy="96" rx="6" ry="4.5"/><ellipse cx="386" cy="90" rx="6" ry="4.5"/>';
  s += '<path d="M28 236 v-22"/><ellipse cx="24" cy="236" rx="5.5" ry="4"/><path d="M28 214 q8 4 8 12" opacity=".8"/>';
  s += '<path d="M20 294 H400" opacity=".45"/>';
  return s;
};

// Olinda: casario subindo a ladeira, igrejas no alto e Recife ao longe
const olinda = () => {
  let s = "";
  const c1 = cubica([0, 170], [130, 156], [220, 70], [380, 62]);
  const c2 = cubica([380, 62], [520, 56], [600, 118], [720, 146]);
  s += '<path d="M0 170 C130 156 220 70 380 62 C520 56 600 118 720 146 C800 162 880 158 1000 162"/>';
  // casario
  const casas = [40, 78, 112, 146, 178, 208, 236, 262, 296, 470, 500, 530, 560, 590, 622, 652, 684];
  casas.forEach((x, i) => {
    const y = alturaNaCurva([c1, c2], x + 14) + 2;
    const h = 18 + (i % 3) * 6;
    const w = 26;
    s += `<path d="M${x} ${f(y)} V${f(y - h)} H${x + w} V${f(y)}"/>`;
    s += i % 2
      ? `<path d="M${x - 2} ${f(y - h)} L${x + w / 2} ${f(y - h - 10)} L${x + w + 2} ${f(y - h)}"/>`
      : `<path d="M${x - 2} ${f(y - h)} H${x + w + 2} M${x + 2} ${f(y - h - 4)} H${x + w - 2}" opacity=".8"/>`;
    s += `<path d="M${x + 6} ${f(y)} v-9 h6 v9 M${x + 16} ${f(y - h + 6)} h5 v6 h-5z" opacity=".6"/>`;
  });
  // igreja de duas torres no alto
  s += '<path d="M330 62 V20 H356 V62 M404 62 V20 H430 V62"/><path d="M330 20 l13 -14 l13 14 M404 20 l13 -14 l13 14"/>';
  s += '<path d="M356 62 V30 H404 V62"/><path d="M356 30 Q380 8 404 30"/><path d="M380 14 v-10 M375 8 h10"/>';
  s += '<path d="M372 62 v-14 a8 8 0 0 1 16 0 v14 M336 30 h8 v8 h-8z M416 30 h8 v8 h-8z" opacity=".65"/>';
  // coqueiros
  s += coqueiro(300, 96, 56, -1, 0.62) + coqueiro(458, 74, 46, 1, 0.55) + coqueiro(706, 148, 78, -1, 0.75);
  // mar e Recife ao longe
  s += '<path d="M730 150 q20 -5 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0" opacity=".5"/>';
  s += '<g opacity=".4"><path d="M800 140 V96 h14 V140 M820 140 V82 h12 V140 M838 140 V104 h16 V140 M860 140 V70 h12 V140 M878 140 V90 h14 V140 M898 140 V60 h10 V140 M914 140 V98 h18 V140 M938 140 V78 h12 V140 M956 140 V108 h16 V140"/></g>';
  return s;
};

// Porto de Galinhas: piscinas naturais, jangada, peixinhos e a galinha
const portoGalinhas = () => {
  let s = '<path d="M0 196 H420" opacity=".55"/>';
  s += ondas(206, 0, 420, { linhas: 1, passo: 48, op: 0.45 });
  s += jangadaVela(96, 200, 0.62, { listras: 2 });
  // piscina natural: anel de pedras com a água dentro
  let pedras = "";
  const n = 30;
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    const b = ((i + 1) / n) * Math.PI * 2;
    const r = 1 + 0.05 * Math.sin(i * 2.3);
    const x1 = 196 + Math.cos(a) * 160 * r;
    const y1 = 252 + Math.sin(a) * 30 * r;
    const x2 = 196 + Math.cos(b) * 160 * r;
    const y2 = 252 + Math.sin(b) * 30 * r;
    pedras += `<path d="M${f(x1)} ${f(y1)} Q${f((x1 + x2) / 2 + Math.cos((a + b) / 2) * 6)} ${f((y1 + y2) / 2 + Math.sin((a + b) / 2) * 8 - 4)} ${f(x2)} ${f(y2)}"/>`;
  }
  s += pedras;
  s += '<path d="M60 252 Q196 236 332 252" opacity=".35"/>';
  s += '<path d="M110 250 q14 -4 28 0 M232 258 q14 -4 28 0 M170 262 q10 -3 20 0" opacity=".45"/>';
  s += peixe(120, 262, 0.9, 1) + peixe(268, 248, 0.8, -1) + peixe(196, 270, 0.7, 1);
  // galinha (símbolo da praia)
  s += '<g transform="translate(-4 -30)">';
  s += '<path d="M302 226 q14 -8 30 -4 q12 -24 34 -18 q-6 6 -2 12 q8 10 -2 24 q-14 14 -42 8 q-16 -4 -18 -22 Z"/>';
  s += '<path d="M340 206 q-6 -16 6 -20 q4 6 8 -2 q6 10 2 18" /><path d="M366 210 l12 4 l-12 4" />';
  s += '<path d="M302 226 q-22 -26 -10 -46 q4 20 18 26 q-10 -26 4 -40 q2 26 16 34" opacity=".8"/>';
  s += '<circle cx="356" cy="210" r="2" opacity=".8"/><path d="M322 240 q14 6 28 -2" opacity=".5"/>';
  s += '<path d="M326 252 v12 M340 252 v12" opacity=".7"/><path d="M300 266 h70 l-6 10 h-58 Z" opacity=".8"/>';
  s += "</g>";
  s += sol(360, 60, 16, { raios: 10, op: 0.8 });
  s += gaivota(200, 80, 9) + gaivota(230, 64, 7);
  return s;
};

// =====================================================================
// MACEIÓ (AL)
// =====================================================================

// Piscinas naturais de Pajuçara: jangadas de vela listrada
const pajucara = () => {
  let s = '<path d="M0 214 H420" opacity=".5"/>';
  s += ondas(226, 0, 420, { linhas: 1, passo: 52, op: 0.45 });
  s += jangadaVela(110, 268, 1.05, { listras: 3 });
  s += jangadaVela(250, 250, 0.78, { listras: 2 });
  s += jangadaVela(350, 236, 0.55, { listras: 2 });
  s += '<path d="M10 284 q20 -6 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0" opacity=".6"/>';
  s += '<path d="M180 274 q12 -4 24 0 M300 262 q12 -4 24 0" opacity=".45"/>';
  s += sol(60, 66, 15, { raios: 10, op: 0.8 });
  s += gaivota(200, 70, 9) + gaivota(230, 56, 7);
  return s;
};

// Praia do Gunga: coqueiral, mar calmo e as falésias coloridas
const gunga = () => {
  let s = '<path d="M0 160 Q180 146 420 152 T1000 150"/>';
  // coqueiral
  [[30, 154, 92, 1], [80, 152, 104, -1], [130, 152, 86, 1], [180, 151, 100, -1], [230, 150, 82, 1], [280, 150, 96, -1], [330, 150, 76, 1]].forEach(([x, b, h, i]) => {
    s += coqueiro(x, b, h, i, 0.82);
  });
  // mar e jangada
  s += '<path d="M400 140 q22 -5 44 0 t44 0 t44 0 t44 0 t44 0" opacity=".5"/>';
  s += jangadaVela(520, 136, 0.62, { listras: 2 });
  // falésias em camadas
  s += '<path d="M640 156 L668 70 Q700 52 760 56 Q840 50 1000 60 V156"/>';
  s += '<path d="M660 98 Q760 86 1000 92 M652 122 Q770 112 1000 118 M646 140 Q780 132 1000 138" opacity=".55"/>';
  s += '<path d="M676 82 q30 -6 60 -2 q40 -6 80 0 q50 -6 100 -2 q40 -4 84 0" opacity=".35"/>';
  // mato no alto da falésia
  for (let x = 674; x < 1000; x += 26) s += `<path d="M${x} 60 q4 -10 8 0 q4 -12 8 0 q4 -9 8 0" opacity=".7"/>`;
  s += sol(590, 40, 16, { raios: 10, op: 0.8 });
  s += gaivota(440, 44, 9) + gaivota(470, 30, 7);
  return s;
};

// =====================================================================
// FORTALEZA / JERICOACOARA (CE)
// =====================================================================

// Pedra Furada (Jericoacoara), com o sol no buraco
const pedraFurada = () => {
  let s = "";
  s += '<path d="M96 270 C94 238 90 204 106 172 C118 146 112 120 138 102 C168 82 212 88 246 96 C286 106 318 138 328 184 C336 222 330 250 342 270"/>';
  s += '<path d="M140 270 C138 230 146 186 182 170 C218 156 250 176 262 214 C268 240 264 258 270 270"/>';
  s += '<path d="M146 122 q18 -12 38 -10 M250 112 q28 10 42 36 M118 196 q6 -16 18 -24 M296 176 q14 16 14 36 M200 150 q20 -6 40 2" opacity=".45"/>';
  s += '<path d="M112 236 q10 -6 20 0 M290 234 q12 -6 24 0 M220 120 l10 14" opacity=".4"/>';
  // sol dentro do buraco
  s += '<circle cx="204" cy="236" r="20"/><path d="M176 254 h56 M184 262 h40" opacity=".5"/>';
  // mar
  s += '<path d="M0 270 H420"/>';
  s += ondas(282, 0, 420, { linhas: 2, passo: 40 });
  s += gaivota(330, 64, 9) + gaivota(360, 50, 7) + gaivota(60, 90, 8);
  return s;
};

// Ponte dos Ingleses ao pôr do sol, com prédios da Beira-Mar
const ponteIngleses = () => {
  let s = '<path d="M0 132 H1000" opacity=".6"/>';
  // ponte sobre pilares
  s += '<path d="M40 112 L640 102 M40 120 L640 110"/>';
  for (let x = 60; x <= 630; x += 38) {
    const y = 120 - ((x - 40) * 10) / 600;
    s += `<path d="M${x} ${f(y)} V160" opacity=".8"/>`;
  }
  for (let x = 80; x <= 620; x += 90) {
    const y = 112 - ((x - 40) * 10) / 600;
    s += `<path d="M${x} ${f(y)} V${f(y - 26)} h8" /><circle cx="${x + 10}" cy="${f(y - 24)}" r="3" opacity=".7"/>`;
  }
  s += '<path d="M40 104 L640 94" opacity=".5"/>';
  for (let x = 50; x < 640; x += 12) {
    const y = 104 - ((x - 40) * 10) / 600;
    s += `<path d="M${x} ${f(y)} v8" opacity=".35"/>`;
  }
  s += '<path d="M0 120 L40 116 V112" />';
  // sol se pondo e reflexo
  s += sol(760, 132, 30, { raios: 9, meio: true });
  s += '<path d="M730 142 h60 M738 150 h44 M748 158 h24" opacity=".5"/>';
  // água
  s += '<path d="M0 170 q30 -6 60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0" opacity=".45"/>';
  // prédios da Beira-Mar
  s += '<g opacity=".45"><path d="M840 132 V70 h18 V132 M864 132 V52 h16 V132 M886 132 V80 h20 V132 M912 132 V44 h14 V132 M932 132 V66 h20 V132 M958 132 V86 h16 V132 M980 132 V58 h16 V132"/></g>';
  s += jangadaVela(680, 128, 0.36, { listras: 1 });
  return s;
};

// =====================================================================
// JOÃO PESSOA (PB)
// =====================================================================

// Farol do Cabo Branco na falésia, com o sol nascendo (ponto mais oriental)
const caboBranco = () => {
  let s = "";
  s += '<path d="M190 290 L210 210 Q236 196 280 198 L420 194"/>';
  s += '<path d="M206 226 q30 -4 60 0 M200 250 q36 -4 72 0 M196 272 q40 -4 80 0" opacity=".45"/>';
  for (let x = 222; x < 420; x += 24) s += `<path d="M${x} 197 q4 -9 8 0 q4 -10 8 0" opacity=".65"/>`;
  // farol: haste com três "folhas de sisal"
  s += '<path d="M318 196 V70 H334 V196"/>';
  s += '<path d="M318 196 L284 196 L318 84 M334 196 L368 196 L334 84"/>';
  s += '<path d="M318 140 L300 140 M334 140 L352 140" opacity=".5"/>';
  s += '<path d="M314 70 H338 V52 H314 Z M312 52 L326 40 L340 52 M326 40 V30"/>';
  s += '<path d="M314 60 L250 44 M314 62 L254 74 M338 60 L402 44 M338 62 L398 74" opacity=".35"/>';
  // sol nascendo no mar
  s += sol(96, 222, 34, { raios: 9, meio: true });
  s += '<path d="M0 222 H200" opacity=".7"/>';
  s += '<path d="M54 234 h84 M66 244 h60 M80 254 h32" opacity=".5"/>';
  s += ondas(270, 0, 196, { linhas: 2, passo: 36 });
  s += gaivota(150, 120, 9) + gaivota(176, 104, 7);
  return s;
};

// Pôr do sol do Jacaré: o saxofonista no barco tocando o Bolero
const jacare = () => {
  let s = "";
  s += sol(290, 196, 52, { raios: 11, meio: true });
  s += '<path d="M0 196 H420"/>';
  s += '<path d="M238 208 h104 M252 218 h76 M266 228 h48" opacity=".5"/>';
  // mangue na outra margem
  s += '<g opacity=".55"><path d="M10 196 q10 -40 34 -46 q26 -2 30 26 q14 -24 34 -10 q12 10 6 30"/><path d="M28 196 q4 -12 10 -16 M54 196 q-2 -14 6 -22 M86 196 q2 -12 10 -18"/></g>';
  // barco
  s += '<path d="M60 250 Q126 266 196 250 L188 262 Q126 274 68 262 Z"/>';
  // saxofonista em pé
  s += '<circle cx="132" cy="166" r="9"/><path d="M132 175 V222 M132 222 l-10 28 M132 222 l10 28"/>';
  s += '<path d="M132 186 l-14 16 l16 4 M132 186 l12 14 l-8 10"/>';
  // saxofone
  s += '<path d="M126 170 q4 4 6 12 L140 230 q2 10 12 8 q8 -2 6 -12 l-4 -10" stroke-width="2"/><path d="M150 214 l10 -4" />';
  s += '<path d="M134 196 h3 M136 206 h3 M138 216 h3" opacity=".7"/>';
  // notas
  s += '<path d="M176 140 v-20 l14 -4 v18"/><ellipse cx="173" cy="140" rx="4.5" ry="3.5"/><ellipse cx="187" cy="134" rx="4.5" ry="3.5"/>';
  s += '<path d="M206 112 v-18"/><ellipse cx="203" cy="112" rx="4.5" ry="3.5"/>';
  s += ondas(280, 0, 420, { linhas: 2, passo: 46, op: 0.7 });
  return s;
};

// =====================================================================
// ARACAJU (SE)
// =====================================================================

// O caranguejo (Passarela do Caranguejo)
const caranguejo = () => {
  let s = "";
  s += '<ellipse cx="210" cy="196" rx="84" ry="50"/>';
  s += '<path d="M150 186 q60 -30 120 0 M160 210 q50 16 100 0" opacity=".45"/>';
  s += '<path d="M182 160 q-4 -26 -10 -34 M238 160 q4 -26 10 -34"/><circle cx="172" cy="122" r="6"/><circle cx="248" cy="122" r="6"/>';
  // garras
  s += '<path d="M138 176 Q100 150 96 112"/><path d="M96 112 q-26 -8 -30 -36 q22 4 34 22 q4 -20 -8 -36 q30 8 30 40 q0 18 -26 10" />';
  s += '<path d="M282 176 Q320 150 324 112"/><path d="M324 112 q26 -8 30 -36 q-22 4 -34 22 q-4 -20 8 -36 q-30 8 -30 40 q0 18 26 10"/>';
  // patas
  [0, 1, 2].forEach((k) => {
    const y = 204 + k * 14;
    s += `<path d="M${132 + k * 4} ${y} q-34 ${4 + k * 6} -${50 - k * 4} ${34 + k * 8}"/>`;
    s += `<path d="M${288 - k * 4} ${y} q34 ${4 + k * 6} ${50 - k * 4} ${34 + k * 8}"/>`;
  });
  s += '<path d="M10 290 H410" opacity=".55"/>';
  s += '<path d="M40 280 q10 -4 20 0 M340 284 q10 -4 20 0 M200 284 q10 -4 20 0" opacity=".4"/>';
  s += sol(370, 50, 14, { raios: 10, op: 0.75 });
  return s;
};

// Cânion do Xingó, com o catamarã no rio
const xingo = () => {
  let s = "";
  // paredões em camadas
  s += '<path d="M0 30 L120 26 L190 40 L240 70 L262 120 L276 160"/>';
  s += '<path d="M1000 24 L860 28 L800 46 L760 80 L742 126 L730 160"/>';
  [[40, 4], [60, 10], [84, 20], [108, 34], [132, 48]].forEach(([y, dx]) => {
    s += `<path d="M0 ${y} Q120 ${y - 4} ${f(176 + dx * 1.6)} ${y + 6}" opacity=".45"/>`;
    s += `<path d="M1000 ${y - 4} Q880 ${y - 6} ${f(820 - dx * 1.6)} ${y + 4}" opacity=".45"/>`;
  });
  // rio
  s += '<path d="M276 160 Q500 150 730 160" opacity=".7"/>';
  s += '<path d="M300 168 q20 -4 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0" opacity=".5"/>';
  // catamarã
  s += '<path d="M420 146 H600 L590 156 H430 Z M424 138 H596 L590 146 H430 Z"/>';
  s += '<path d="M452 138 V112 H572 V138 M444 112 H580"/><path d="M462 120 h14 v10 h-14z M486 120 h14 v10 h-14z M510 120 h14 v10 h-14z M534 120 h14 v10 h-14z" opacity=".6"/>';
  s += sol(500, 32, 16, { raios: 10, op: 0.8 });
  s += gaivota(380, 70, 9) + gaivota(620, 60, 8);
  return s;
};

// =====================================================================
// PORTO SEGURO (BA)
// =====================================================================

const cruzDeCristo = (cx, cy, r) =>
  `<path d="M${cx - r * 0.3} ${cy - r} H${cx + r * 0.3} L${cx + r * 0.14} ${cy - r * 0.14} L${cx + r} ${cy - r * 0.3} V${cy + r * 0.3} L${cx + r * 0.14} ${cy + r * 0.14} L${cx + r * 0.3} ${cy + r} H${cx - r * 0.3} L${cx - r * 0.14} ${cy + r * 0.14} L${cx - r} ${cy + r * 0.3} V${cy - r * 0.3} L${cx - r * 0.14} ${cy - r * 0.14} Z" opacity=".75"/>`;

// Caravela do Descobrimento
const caravela = () => {
  let s = "";
  s += '<path d="M62 214 Q74 250 120 254 H300 Q346 250 364 206 L320 216 H130 Z"/>';
  s += '<path d="M62 214 L40 196 M364 206 L388 192"/><path d="M96 232 H330" opacity=".5"/>';
  s += '<path d="M300 216 V196 H352 L364 206" />';
  // mastros e velas com a cruz
  [[136, 70, 46], [222, 40, 58], [300, 92, 36]].forEach(([x, topo, larg]) => {
    s += `<path d="M${x} 216 V${topo}"/>`;
    const y1 = topo + 16;
    const y2 = y1 + larg * 1.5;
    s += `<path d="M${x - larg} ${y1} Q${x} ${y1 - 8} ${x + larg} ${y1} Q${x + larg + 8} ${(y1 + y2) / 2} ${x + larg} ${y2} Q${x} ${y2 - 8} ${x - larg} ${y2} Q${x - larg + 8} ${(y1 + y2) / 2} ${x - larg} ${y1} Z"/>`;
    s += cruzDeCristo(x + 4, (y1 + y2) / 2, larg * 0.4);
    s += `<path d="M${x} ${topo} h18 l-6 6 l6 6 h-18" opacity=".8"/>`;
  });
  s += '<path d="M40 196 L136 86 M388 192 L300 108" opacity=".45"/>';
  s += ondas(262, 0, 420, { linhas: 3, passo: 40 });
  s += gaivota(360, 60, 9) + gaivota(386, 46, 7);
  return s;
};

// =====================================================================
// NORDESTE (todas as bases)
// =====================================================================

// Praia: coqueiros, guarda-sol, cadeiras, sol e gaivotas
const praia = () => {
  let s = '<path d="M0 150 Q250 136 500 142 T1000 140"/>';
  s += '<path d="M0 166 q30 -6 60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0" opacity=".5"/>';
  s += coqueiro(70, 148, 120, 1) + coqueiro(130, 146, 96, -1, 0.85) + coqueiro(930, 142, 116, -1) + coqueiro(870, 144, 86, 1, 0.8);
  // guarda-sol e cadeiras
  const gs = (x) => {
    let g = `<path d="M${x} 144 V86"/><path d="M${x - 46} 94 Q${x} 50 ${x + 46} 94"/>`;
    for (let i = 0; i < 6; i += 1) g += `<path d="M${f(x - 46 + i * 15.3)} 94 q7.6 -7 15.3 0" />`;
    g += `<path d="M${x} 58 q-14 14 -16 36 M${x} 58 q14 14 16 36" opacity=".5"/>`;
    return g;
  };
  s += gs(380) + gs(620);
  const cadeira = (x) => `<path d="M${x} 144 l12 -22 l26 4 M${x + 12} 122 l-6 -18 M${x + 38} 126 l6 18" opacity=".85"/>`;
  s += cadeira(404) + cadeira(644);
  s += '<path d="M480 132 q8 -10 18 -4 q8 -8 16 2" opacity=".5"/><circle cx="530" cy="136" r="7" opacity=".7"/>';
  s += sol(760, 46, 20, { raios: 12 });
  s += gaivota(250, 54, 10) + gaivota(282, 40, 8) + gaivota(560, 34, 8);
  return s;
};

// Sertão: mandacaru com o sol, xique-xique e pedras
const sertao = () => {
  let s = sol(300, 82, 30, { raios: 14, op: 0.8 });
  // mandacaru grande
  s += '<path d="M180 288 V86 a16 16 0 0 1 32 0 V288"/>';
  s += '<path d="M180 196 H152 a14 14 0 0 1 -14 -14 V122 a12 12 0 0 1 24 0 V170 H180"/>';
  s += '<path d="M212 168 H240 a14 14 0 0 0 14 -14 V104 a12 12 0 0 0 -24 0 V146 H212"/>';
  s += '<path d="M190 84 V286 M202 84 V286 M150 124 V180 M242 106 V158" opacity=".4"/>';
  s += '<path d="M196 70 v-8 M188 74 l-4 -6 M204 74 l4 -6" opacity=".7"/>';
  // xique-xique
  s += '<path d="M84 288 V236 a8 8 0 0 1 16 0 V288 M100 262 h10 a6 6 0 0 0 6 -6 V240 a6 6 0 0 0 -12 0 V252"/>';
  // pedras e chão rachado
  s += '<path d="M290 288 q4 -26 30 -30 q30 -2 40 30 M330 288 q10 -16 28 -14 q20 4 22 14"/>';
  s += '<path d="M10 290 H410"/><path d="M40 290 l10 -8 l12 6 M250 290 l8 -6 l10 4 M120 290 l6 -7" opacity=".5"/>';
  s += gaivota(80, 90, 10) + gaivota(110, 74, 8);
  return s;
};

// #VouDeLuck: a hashtag no meio, praia de um lado e avião do outro
const vouDeLuck = () => {
  let s = "";
  s += '<text x="500" y="116" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="74" letter-spacing="2" fill="{cor}" stroke="none">#VouDeLuck</text>';
  s += '<path d="M250 140 Q500 128 750 140" opacity=".6"/>';
  // praia à esquerda
  s += coqueiro(70, 156, 120, 1) + coqueiro(132, 158, 90, -1, 0.8);
  s += sol(200, 40, 16, { raios: 10, op: 0.8 });
  s += '<path d="M0 162 q25 -6 50 0 t50 0 t50 0 t50 0 t50 0" opacity=".55"/>';
  // avião à direita com rastro
  s += '<g transform="translate(880 54) rotate(-14)"><path d="M-46 0 Q-40 -8 -24 -8 H40 Q54 -8 58 0 Q54 8 40 8 H-24 Q-40 8 -46 0 Z"/>';
  s += '<path d="M2 -8 L-10 -40 H2 L22 -8 M2 8 L-10 40 H2 L22 8 M-38 -6 L-46 -24 H-38 L-28 -8"/>';
  s += '<path d="M34 -3 h6 M22 -3 h6 M10 -3 h6 M-2 -3 h6" opacity=".6"/></g>';
  s += '<path d="M832 68 Q800 84 760 84" stroke-dasharray="6 8" opacity=".5"/>';
  s += '<path d="M800 162 q25 -6 50 0 t50 0 t50 0 t50 0" opacity=".55"/>';
  s += gaivota(330, 30, 9) + gaivota(690, 30, 8);
  return s;
};

export const DESENHOS_REGIOES = {
  reismagos: { viewBox: "0 0 420 300", traco: 1.6, corpo: reisMagos() },
  morrocareca: { viewBox: "0 0 420 300", traco: 1.6, corpo: morroCareca() },
  cajueiro: { viewBox: "0 0 420 300", traco: 1.6, corpo: cajueiro() },
  frevo: { viewBox: "0 0 420 300", traco: 1.6, corpo: frevo() },
  olinda: { viewBox: "0 0 1000 180", traco: 1.6, corpo: olinda(), faixa: true },
  portogalinhas: { viewBox: "0 0 420 300", traco: 1.6, corpo: portoGalinhas() },
  pajucara: { viewBox: "0 0 420 300", traco: 1.6, corpo: pajucara() },
  gunga: { viewBox: "0 0 1000 180", traco: 1.6, corpo: gunga(), faixa: true },
  pedrafurada: { viewBox: "0 0 420 300", traco: 1.6, corpo: pedraFurada() },
  ponteingleses: { viewBox: "0 0 1000 180", traco: 1.6, corpo: ponteIngleses(), faixa: true },
  cabobranco: { viewBox: "0 0 420 300", traco: 1.6, corpo: caboBranco() },
  jacare: { viewBox: "0 0 420 300", traco: 1.6, corpo: jacare() },
  caranguejo: { viewBox: "0 0 420 300", traco: 1.6, corpo: caranguejo() },
  xingo: { viewBox: "0 0 1000 180", traco: 1.6, corpo: xingo(), faixa: true },
  caravela: { viewBox: "0 0 420 300", traco: 1.6, corpo: caravela() },
  praia: { viewBox: "0 0 1000 180", traco: 1.6, corpo: praia(), faixa: true },
  sertao: { viewBox: "0 0 420 300", traco: 1.6, corpo: sertao() },
  voudeluck: { viewBox: "0 0 1000 180", traco: 1.6, corpo: vouDeLuck(), faixa: true },
};
