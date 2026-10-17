// escalaImagem.js
//
// "Baixar imagem" da escala semanal (Gerar Escala → Abrir planilha): desenha
// num <canvas> a escala com o mesmo visual da aba do Google Sheets (título,
// resumo, cabeçalho verde, DATA e DIA mesclados, FORMAR GRUPO em amarelo),
// em alta resolução, para mandar no grupo dos vendedores/comercial. Respeita os filtros da
// página (só pendências, sem guia, formar grupo, busca) e pode ser da semana
// toda ou de um dia só. No celular, abre o "Compartilhar" do aparelho.

import { periodoDaSemana } from "./plannerExport";

const FONTE = "Arial, Helvetica, sans-serif";

const DIA_LONGO = {
  Segunda: "segunda",
  Terça: "terça",
  Quarta: "quarta",
  Quinta: "quinta",
  Sexta: "sexta",
  Sábado: "sábado",
  Domingo: "domingo",
};

// Mesmo critério dos filtros da página.
export const filtrarDiasEscala = (dias = [], { filtro = "todos", busca = "", data = "" } = {}) => {
  const termo = String(busca || "").trim().toLowerCase();
  const passa = (s) => {
    const semGuia = !s.guia && s.tipo !== "fechado";
    const formar = s.tipo === "formar";
    const okFiltro =
      filtro === "todos" ||
      (filtro === "semguia" && semGuia) ||
      (filtro === "formar" && formar) ||
      (filtro === "pend" && (semGuia || formar));
    return okFiltro && (!termo || `${s.passeio} ${s.guia}`.toLowerCase().includes(termo));
  };
  const filtrando = filtro !== "todos" || !!termo;
  return dias
    .filter((d) => !data || d.date === data)
    .map((d) => ({ ...d, servicos: d.servicos.filter(passa) }))
    .filter((d) => !filtrando || d.servicos.length);
};




const quebrarTexto = (ctx, texto, largura, maxLinhas = 2) => {
  const palavras = String(texto || "").split(/\s+/).filter(Boolean);
  const linhas = [];
  let atual = "";
  palavras.forEach((p) => {
    const teste = atual ? `${atual} ${p}` : p;
    if (ctx.measureText(teste).width <= largura || !atual) atual = teste;
    else {
      linhas.push(atual);
      atual = p;
    }
  });
  if (atual) linhas.push(atual);
  if (linhas.length > maxLinhas) {
    const corte = linhas.slice(0, maxLinhas);
    let ultima = corte[maxLinhas - 1];
    while (ultima.length > 1 && ctx.measureText(`${ultima}…`).width > largura) ultima = ultima.slice(0, -1);
    corte[maxLinhas - 1] = `${ultima.trimEnd()}…`;
    return corte;
  }
  return linhas;
};

const fonte = (ctx, px, peso = 400) => {
  ctx.font = `${peso} ${px}px ${FONTE}`;
};

// Situação na linguagem do comercial: o que importa é o que ainda precisa
// de venda ("Formar grupo").
export const SITUACAO_ESCALA = {
  formar: { texto: "Formar grupo", cor: "#8a5a00", fundo: "#ffe8a3", borda: "#e0a800", cheio: true },
  formado: { texto: "Grupo formado", cor: "#1a7f37", fundo: "#ffffff", borda: "#1a7f37", marca: "✓" },
  privativo: { texto: "Privativo", cor: "#4338ca", fundo: "#ffffff", borda: "#6366f1" },
  fechado: { texto: "Fechado", cor: "#b42318", fundo: "#ffffff", borda: "#d92d20" },
};

// Mede (desenhando=false) ou desenha. Medidas em "px de planilha"; o
// canvas é ampliado (ESCALA) para a imagem sair nítida.
// Visual igual à aba do Google Sheets que vai para o Drive.
const ESCALA = 2;
const M = 16; // margem
const LINHA = 30; // altura mínima da linha
const PL = {
  verde: "#14532d",
  grade: "#e1e4e8",
  borda: "#adb5bd",
  separaDia: "#57606a",
  zebra: "#f6f8fa",
  tx: "#1f2328",
  t2: "#57606a",
  t3: "#8c959f",
};
const SITUACAO_PLANILHA = {
  formar: { texto: "FORMAR GRUPO", cor: "#8a5a00", fundo: "#ffe8a3" },
  formado: { texto: "✓ Grupo formado", cor: "#1a7f37" },
  privativo: { texto: "Privativo", cor: "#4338ca" },
  fechado: { texto: "Fechado", cor: "#b42318" },
};

const colunasImagem = (guias) =>
  [
    { k: "data", t: "DATA", w: 96, c: true },
    { k: "dia", t: "DIA DA SEMANA", w: 116, c: true },
    { k: "passeio", t: "PASSEIO", w: 330 },
    guias && { k: "guia", t: "GUIA", w: 150 },
    { k: "pax", t: "QTD PAX", w: 72, c: true },
    { k: "idi", t: "IDIOMAS", w: 120, c: true },
    { k: "sit", t: "SITUAÇÃO", w: 150, c: true },
  ].filter(Boolean);

const larguraImagem = (guias) => colunasImagem(guias).reduce((a, c) => a + c.w, 0) + M * 2;

const desenhar = (ctx, { dias, semana, guias, titulo, subtitulo, desenhando }) => {
  const cols = colunasImagem(guias);
  const xs = {};
  let acc = M;
  cols.forEach((c) => {
    xs[c.k] = { x: acc, w: c.w, c: c.c };
    acc += c.w;
  });
  const LT = acc - M;
  const texto = (t, k, y, { cor = PL.tx, peso = 400, px = 12 } = {}) => {
    fonte(ctx, px, peso);
    ctx.fillStyle = cor;
    const col = xs[k];
    if (col.c) {
      ctx.textAlign = "center";
      ctx.fillText(t, col.x + col.w / 2, y);
      ctx.textAlign = "left";
    } else ctx.fillText(t, col.x + 6, y);
  };

  // título e resumo (linhas 1 e 2 da planilha)
  let y = M;
  if (desenhando) {
    fonte(ctx, 19, 700);
    ctx.fillStyle = PL.tx;
    ctx.fillText(titulo, M + 4, y + 21);
    fonte(ctx, 13, 400);
    ctx.fillStyle = PL.t2;
    ctx.fillText(subtitulo, M + 4, y + 47);
  }
  y += 66;

  // cabeçalho
  const yTabela = y;
  const altCab = 30;
  if (desenhando) {
    ctx.fillStyle = PL.verde;
    ctx.fillRect(M, y, LT, altCab);
    cols.forEach((c) => texto(c.t, c.k, y + 19, { cor: "#fff", peso: 700, px: 11 }));
  }
  y += altCab;

  // dias
  const blocos = dias.map((d) => {
    const linhas = (d.servicos.length ? d.servicos : [null]).map((s) => {
      if (!s) return { s, nome: ["Sem passeios"], guia: [], idi: [], alt: LINHA };
      fonte(ctx, 12.5, 700);
      const nome = quebrarTexto(ctx, s.passeio, xs.passeio.w - 12, 3);
      fonte(ctx, 12, 400);
      const guia = guias ? quebrarTexto(ctx, s.guia || "", xs.guia.w - 12, 2) : [];
      const idi = quebrarTexto(ctx, s.idiomas || "", xs.idi.w - 10, 2);
      const n = Math.max(nome.length, guia.length, idi.length, 1);
      return { s, nome, guia, idi, alt: Math.max(LINHA, 12 + n * 15) };
    });
    return { d, linhas, alt: linhas.reduce((a, l) => a + l.alt, 0) };
  });

  blocos.forEach((b, iBloco) => {
    if (desenhando) {
      ctx.fillStyle = iBloco % 2 ? PL.zebra : "#ffffff";
      ctx.fillRect(M, y, LT, b.alt);

      let yl = y;
      b.linhas.forEach((l, i) => {
        const meio = yl + l.alt / 2;
        const { s } = l;
        const multilinha = (linhas, k, opts) => {
          let yt = meio - ((linhas.length - 1) * 15) / 2 + 4.5;
          linhas.forEach((t) => {
            texto(t, k, yt, opts);
            yt += 15;
          });
        };
        if (!s) {
          multilinha(l.nome, "passeio", { cor: PL.t3, px: 12 });
        } else {
          const sit = SITUACAO_PLANILHA[s.tipo] || SITUACAO_PLANILHA.formar;
          if (sit.fundo) {
            ctx.fillStyle = sit.fundo;
            ctx.fillRect(xs.sit.x, yl, xs.sit.w, l.alt);
          }
          multilinha(l.nome, "passeio", { peso: 700, px: 12.5 });
          if (guias) multilinha(l.guia, "guia", { px: 12 });
          texto(String(s.pax), "pax", meio + 5, { peso: 700, px: 14 });
          multilinha(l.idi, "idi", { cor: PL.t2, px: 12 });
          texto(sit.texto, "sit", meio + 4.5, { cor: sit.cor, peso: 700, px: 12.5 });
        }
        // linha da grade (menos na última linha do dia e nas colunas mescladas)
        if (i < b.linhas.length - 1) {
          ctx.fillStyle = PL.grade;
          ctx.fillRect(xs.passeio.x, yl + l.alt - 0.5, LT - (xs.passeio.x - M), 1);
        }
        yl += l.alt;
      });

      // DATA e DIA DA SEMANA mesclados
      const meioDia = y + b.alt / 2;
      texto(b.d.data, "data", meioDia + 4.5, { peso: 700, px: 13 });
      texto(String(b.d.dia || "").toUpperCase(), "dia", meioDia + 4.5, { cor: PL.t2, peso: 700, px: 12 });

      // colunas
      ctx.fillStyle = PL.grade;
      cols.slice(1).forEach((c) => ctx.fillRect(xs[c.k].x - 0.5, y, 1, b.alt));
      // separação forte entre os dias
      ctx.fillStyle = PL.separaDia;
      ctx.fillRect(M, y + b.alt - 1, LT, 2);
    }
    y += b.alt;
  });

  if (!blocos.length) {
    if (desenhando) {
      fonte(ctx, 13, 400);
      ctx.fillStyle = PL.t3;
      ctx.fillText("Nenhum passeio com esse filtro.", M + 8, y + 20);
    }
    y += LINHA;
  }

  if (desenhando) {
    ctx.strokeStyle = PL.borda;
    ctx.lineWidth = 1;
    ctx.strokeRect(M + 0.5, yTabela + 0.5, LT - 1, y - yTabela - 1);
  }

  // rodapé
  if (desenhando) {
    const agora = new Date();
    fonte(ctx, 11.5, 400);
    ctx.fillStyle = PL.t2;
    ctx.fillText("FORMAR GRUPO = passeio que ainda precisa de mais pax para sair.", M + 4, y + 22);
    ctx.fillStyle = PL.t3;
    ctx.fillText(
      `Luck Receptivo Salvador · atualizado em ${agora.toLocaleDateString("pt-BR")} às ${agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · ${periodoDaSemana(semana).texto}`,
      M + 4,
      y + 40,
    );
  }
  return y + 54;
};

export const gerarImagemEscala = async ({ dias, semana, guias = true, data = "", filtro = "todos", busca = "", doc = document }) => {
  const recorte = filtrarDiasEscala(dias, { filtro, busca, data });
  const periodo = periodoDaSemana(semana);
  const dia = data ? dias.find((d) => d.date === data) : null;
  const titulo = dia ? `Passeios de ${DIA_LONGO[dia.dia] || dia.dia} · ${dia.data}` : `Passeios da semana · ${periodo.texto}`;

  const tot = recorte.reduce(
    (a, d) => {
      d.servicos.forEach((s) => {
        a.passeios += 1;
        a.pax += s.pax;
        if (s.tipo === "formar") a.formar += 1;
        if (s.tipo === "formado") a.formados += 1;
      });
      return a;
    },
    { passeios: 0, pax: 0, formar: 0, formados: 0 },
  );
  const nomesFiltro = { pend: "só pendências", semguia: "só sem guia", formar: "só formar grupo" };
  const subtitulo = [
    `${tot.passeios} passeios · ${tot.pax} pax · ${tot.formados} grupos formados · ${tot.formar} para formar grupo`,
    nomesFiltro[filtro] && `filtro: ${nomesFiltro[filtro]}`,
    busca && `busca: “${busca}”`,
  ]
    .filter(Boolean)
    .join(" — ");

  const canvas = doc.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const largura = larguraImagem(guias);
  const altura = desenhar(ctx, { dias: recorte, semana, guias, titulo, subtitulo, desenhando: false });
  canvas.width = Math.ceil(largura * ESCALA);
  canvas.height = Math.ceil(altura * ESCALA);
  ctx.scale(ESCALA, ESCALA);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, largura, altura);
  desenhar(ctx, { dias: recorte, semana, guias, titulo, subtitulo, desenhando: true });

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  const nome = `Passeios ${dia ? dia.data.replace(/\//g, "-") : periodo.aba}.png`;
  return { blob, nome, largura: canvas.width, altura: canvas.height };
};

// Compartilha (celular) ou baixa (computador) a imagem.
export const entregarImagem = async ({ blob, nome }, janela = window) => {
  const arquivo = new janela.File([blob], nome, { type: "image/png" });
  const nav = janela.navigator;
  const celular = /Android|iPhone|iPad|iPod/i.test(nav.userAgent || "");
  if (celular && nav.canShare?.({ files: [arquivo] })) {
    try {
      await nav.share({ files: [arquivo], title: nome });
      return "compartilhado";
    } catch (err) {
      if (err?.name === "AbortError") return "cancelado";
    }
  }
  const url = janela.URL.createObjectURL(blob);
  const a = janela.document.createElement("a");
  a.href = url;
  a.download = nome;
  janela.document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => janela.URL.revokeObjectURL(url), 10000);
  return "baixado";
};
