// escalaAprendizado.js
//
// O QUE A ESCALA APRENDE COM AS EDIÇÕES DA EQUIPE
//
// Toda vez que alguém troca o guia de um passeio na Escala de passeios, a
// troca fica registrada (escalaAprendizadoRepository.js). Daqui sai um
// "aprendizado" simples e explicável:
//   - por passeio: quais guias a equipe costuma COLOCAR e quais costuma
//     TIRAR dele;
//   - trocas recorrentes: "tirou A e colocou B" que se repete.
//
// Edições recentes valem mais (meia-vida de 60 dias): se a equipe mudou de
// ideia, o sistema acompanha. O aprendizado é um critério SECUNDÁRIO na
// nota do robô (no máximo ±18 pontos — idioma vale 130, afinidade até 60,
// equilíbrio até 80): ajuda a desempatar e a se parecer com a equipe, mas
// nunca passa por cima de idioma, disponibilidade, prioridade ou equilíbrio.
//
// Este arquivo é só cálculo (sem Firebase) — dá para testar isolado.

export const MEIA_VIDA_DIAS = 60;
export const JANELA_APRENDIZADO_DIAS = 180;

export const PESOS_APRENDIZADO = {
  porVez: 6, // cada edição "líquida" (colocou − tirou) vale 6 pontos
  maximo: 18, // teto do bônus/penalidade
  minimoParaExplicar: 2, // só vira motivo na tela a partir de 2 edições
};

// Chave do passeio: o id do cadastro quando existe, senão o nome normalizado.
export const chavePasseio = (
  passeioId,
  serviceName,
  normalizarTexto = (t) => t,
) =>
  passeioId
    ? String(passeioId)
    : `nome:${normalizarTexto(String(serviceName || ""))}`;

const diasEntre = (isoA, isoB) => {
  const [a1, m1, d1] = String(isoA).split("-").map(Number);
  const [a2, m2, d2] = String(isoB).split("-").map(Number);
  if (!a1 || !a2) return 0;
  return Math.max(
    0,
    Math.round(
      (Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000,
    ),
  );
};

const pesoPorIdade = (dias) => 0.5 ** (dias / MEIA_VIDA_DIAS);

const isoHoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// edições (documentos) → aprendizado
export const construirAprendizado = (edicoes = [], hoje = isoHoje()) => {
  const porPasseio = {}; // chave -> guiaId -> { colocou, tirou, vezesColocou, vezesTirou }
  const nomesPasseio = {};
  const nomesGuia = {};
  const trocas = {}; // "de>para" -> { deId, paraId, vezes, peso, passeios:Set }
  let total = 0;

  const marcar = (chave, guiaId, campo, peso) => {
    if (!chave || !guiaId) return;
    if (!porPasseio[chave]) porPasseio[chave] = {};
    if (!porPasseio[chave][guiaId])
      porPasseio[chave][guiaId] = {
        colocou: 0,
        tirou: 0,
        vezesColocou: 0,
        vezesTirou: 0,
      };
    const g = porPasseio[chave][guiaId];
    g[campo] += peso;
    if (campo === "colocou") g.vezesColocou += 1;
    else g.vezesTirou += 1;
  };

  edicoes.forEach((e) => {
    if (!e || !e.passeio || e.deId === e.paraId) return;
    const idade = diasEntre(e.registradoEm || e.date, hoje);
    if (idade > JANELA_APRENDIZADO_DIAS) return;
    const peso = pesoPorIdade(idade);
    total += 1;
    nomesPasseio[e.passeio] = e.serviceName || nomesPasseio[e.passeio];
    if (e.deId) nomesGuia[e.deId] = e.deNome || nomesGuia[e.deId];
    if (e.paraId) nomesGuia[e.paraId] = e.paraNome || nomesGuia[e.paraId];

    marcar(e.passeio, e.paraId, "colocou", peso);
    marcar(e.passeio, e.deId, "tirou", peso);

    if (e.deId && e.paraId) {
      const k = `${e.deId}>${e.paraId}`;
      if (!trocas[k])
        trocas[k] = {
          deId: e.deId,
          paraId: e.paraId,
          vezes: 0,
          peso: 0,
          passeios: new Set(),
        };
      trocas[k].vezes += 1;
      trocas[k].peso += peso;
      trocas[k].passeios.add(e.passeio);
    }
  });

  return { porPasseio, nomesPasseio, nomesGuia, trocas, total };
};

// Bônus (ou penalidade) aprendido para o guia neste passeio.
export const bonusAprendido = (
  aprendizado,
  guiaId,
  passeio,
  pesos = PESOS_APRENDIZADO,
) => {
  const p = { ...PESOS_APRENDIZADO, ...pesos };
  const info = aprendizado?.porPasseio?.[passeio]?.[guiaId];
  if (!info) return { pontos: 0, motivo: null, vezesColocou: 0, vezesTirou: 0 };
  const liquido = info.colocou - info.tirou;
  const pontos = Math.max(-p.maximo, Math.min(p.maximo, liquido * p.porVez));
  let motivo = null;
  if (pontos >= p.porVez * 0.5 && info.vezesColocou >= p.minimoParaExplicar) {
    motivo = `a equipe costuma escolher para esse passeio (${info.vezesColocou}×)`;
  } else if (
    pontos <= -p.porVez * 0.5 &&
    info.vezesTirou >= p.minimoParaExplicar
  ) {
    motivo = `a equipe costuma trocar nesse passeio (${info.vezesTirou}×)`;
  }
  return {
    pontos,
    motivo,
    vezesColocou: info.vezesColocou,
    vezesTirou: info.vezesTirou,
  };
};

// Resumo legível do que foi aprendido (para o painel de regras).
export const resumoDoAprendizado = (
  aprendizado,
  nomeDoGuia = (id) => id,
  limite = 6,
) => {
  if (!aprendizado?.total) return { total: 0, preferidos: [], trocas: [] };
  const nome = (id) => nomeDoGuia(id) || aprendizado.nomesGuia[id] || "Guia";

  const preferidos = [];
  Object.entries(aprendizado.porPasseio).forEach(([passeio, guias]) => {
    Object.entries(guias).forEach(([guiaId, g]) => {
      if (g.vezesColocou >= 2 && g.colocou > g.tirou) {
        preferidos.push({
          passeio:
            aprendizado.nomesPasseio[passeio] || passeio.replace(/^nome:/, ""),
          guia: nome(guiaId),
          vezes: g.vezesColocou,
          peso: g.colocou - g.tirou,
        });
      }
    });
  });
  preferidos.sort((a, b) => b.peso - a.peso);

  const trocas = Object.values(aprendizado.trocas)
    .filter((t) => t.vezes >= 2)
    .sort((a, b) => b.peso - a.peso)
    .map((t) => ({
      de: nome(t.deId),
      para: nome(t.paraId),
      vezes: t.vezes,
      passeios: t.passeios.size,
    }));

  return {
    total: aprendizado.total,
    preferidos: preferidos.slice(0, limite),
    trocas: trocas.slice(0, limite),
  };
};
