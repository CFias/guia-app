// simulacaoBagagem.js
//
// Simulador de bagagem (Central de Informações → assistente): escolhe um
// veículo e mostra como o porta-malas fica com o grupo informado.
// Usa a MESMA regra de capacidade do assistente (catalogo.js →
// bagagemCabe): cada configuração tem combinações de vagas (ex.: "3 de
// 23 kg + 2 de 10 kg" ou "0 + 6"), e uma vaga de 23 kg que sobra recebe
// malas de 10 kg (quantas por vaga = fatorBordoPorGrande).

import { bagagemCabe } from "./catalogo";

const inteiro = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
};

const semAcento = (t = "") =>
  String(t)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// tipo do desenho pelo nome/grupo (carro, van, micro, ônibus)
export const tipoDoVeiculo = (nome = "", grupo = "") => {
  const t = semAcento(`${grupo} ${nome}`);
  if (/onibus/.test(t)) return "onibus";
  if (/micro/.test(t)) return "micro";
  if (/van|sprinter|master|ducato/.test(t)) return "van";
  return "carro";
};

export const acessorioDoNome = (nome = "", acessorio = "") => {
  if (acessorio) return acessorio;
  const t = semAcento(nome);
  if (/sem (bagageiro|carretinha)/.test(t)) return "";
  if (/carretinha|reboque/.test(t)) return "Carretinha";
  if (/bagageiro/.test(t)) return "Bagageiro";
  return "";
};

/* Veículos que dá para simular: as opções do assistente (com fotos dos
   veículos vinculados) e as categorias das regras por passageiros que não
   estão entre elas. Só entra o que tem capacidade de malas informada. */
export const veiculosSimulaveis = (config = {}) => {
  const lista = [];
  const vistos = new Set();
  (config.opcoes || [])
    .filter((o) => o.ativo !== false && o.nome && o.combinacoes?.length)
    .forEach((o) => {
      const k = semAcento(o.nome);
      if (vistos.has(k)) return;
      vistos.add(k);
      lista.push({
        id: `op:${o.id}`,
        nome: o.nome,
        grupo: o.grupo || "",
        paxMax: inteiro(o.paxMax),
        paxIdeal: inteiro(o.paxIdeal),
        acessorio: acessorioDoNome(o.nome, o.acessorio),
        combinacoes: o.combinacoes,
        veiculosIds: o.veiculosIds || [],
        observacao: o.observacao || "",
      });
    });
  (config.faixas || []).forEach((f) =>
    f.categorias.forEach((c) => {
      if (!c.combinacoes?.length) return;
      const k = semAcento(c.nome);
      const existente = lista.find((v) => semAcento(v.nome) === k);
      if (existente) {
        // categoria que aparece em várias faixas (ex.: Spin em 1–3 e em 4):
        // vale até o fim da maior; opção do assistente sem lugares usa a faixa
        if (existente.id.startsWith("cat:") || !existente.paxMax) existente.paxMax = Math.max(existente.paxMax || 0, f.ate);
        return;
      }
      vistos.add(k);
      lista.push({
        id: `cat:${k}`,
        nome: c.nome,
        grupo: "",
        paxMax: f.ate,
        paxIdeal: 0,
        acessorio: acessorioDoNome(c.nome),
        combinacoes: c.combinacoes,
        veiculosIds: [],
        observacao: "",
      });
    }),
  );
  // menor para o maior (lugares e depois espaço de malas)
  const espaco = (v) => Math.max(...v.combinacoes.map((c) => c.grandes * 2 + c.bordo));
  return lista.sort((a, b) => a.paxMax - b.paxMax || espaco(a) - espaco(b));
};

// Encaixa a bagagem numa combinação: vagas usadas, livres e o que não cabe.
const encaixar = (c, grandes, bordo, fator) => {
  const grandesDentro = Math.min(grandes, c.grandes);
  const grandesFora = grandes - grandesDentro;
  const bordoNasVagasBordo = Math.min(bordo, c.bordo);
  let resto = bordo - bordoNasVagasBordo;
  const vagasGrandesLivres = c.grandes - grandesDentro;
  // malas de 10 kg que vão para as vagas de 23 kg que sobraram
  const porVaga = Math.max(0, Math.floor(fator));
  const cabemNasGrandes = porVaga > 0 ? vagasGrandesLivres * porVaga : 0;
  const bordoNasVagasGrandes = Math.min(resto, cabemNasGrandes);
  resto -= bordoNasVagasGrandes;
  const vagasGrandesComBordo = porVaga > 0 ? Math.ceil(bordoNasVagasGrandes / porVaga) : 0;
  return {
    combinacao: c,
    grandesDentro,
    grandesFora,
    bordoNasVagasBordo,
    bordoNasVagasGrandes,
    vagasGrandesComBordo,
    bordoFora: resto,
    vagasGrandesLivres: vagasGrandesLivres - vagasGrandesComBordo,
    vagasBordoLivres: c.bordo - bordoNasVagasBordo,
  };
};

/* Simula o grupo no veículo.
   efetivo: { pax, grandes, bordo } (já com mochilas etc. — aplicarEspeciais)
   Devolve o encaixe (melhor combinação), lugares e o resumo. */
export const simularBagagem = (veiculo, efetivo = {}, fator = 1) => {
  const pax = inteiro(efetivo.pax);
  const grandes = inteiro(efetivo.grandes);
  const bordo = inteiro(efetivo.bordo);
  if (!veiculo?.combinacoes?.length) return null;

  // a combinação em que cabe; senão, a que deixa menos coisa de fora
  const tentativas = veiculo.combinacoes.map((c) => encaixar(c, grandes, bordo, fator));
  const cabem = tentativas.filter((t) => t.grandesFora === 0 && t.bordoFora === 0);
  const folga = (t) => t.vagasGrandesLivres * Math.max(1, fator) + t.vagasBordoLivres;
  const escolhido = cabem.length
    ? cabem.sort((a, b) => folga(b) - folga(a))[0]
    : tentativas.sort((a, b) => a.grandesFora * 2 + a.bordoFora - (b.grandesFora * 2 + b.bordoFora))[0];

  const cabeMalas = cabem.length > 0;
  const cabeMais23 = bagagemCabe(veiculo.combinacoes, grandes + 1, bordo, fator);
  const cabeMais10 = bagagemCabe(veiculo.combinacoes, grandes, bordo + 1, fator);
  // quantas malas de cada tipo ainda caberiam (sozinhas)
  let sobra23 = 0;
  while (sobra23 < 60 && bagagemCabe(veiculo.combinacoes, grandes + sobra23 + 1, bordo, fator)) sobra23 += 1;
  let sobra10 = 0;
  while (sobra10 < 60 && bagagemCabe(veiculo.combinacoes, grandes, bordo + sobra10 + 1, fator)) sobra10 += 1;

  const lugares = veiculo.paxMax || 0;
  const paxFora = lugares ? Math.max(0, pax - lugares) : 0;
  return {
    ...escolhido,
    pax,
    lugares,
    paxFora,
    apertado: !!(veiculo.paxIdeal && pax > veiculo.paxIdeal && pax <= lugares),
    cabeMalas,
    cabePax: paxFora === 0,
    cabe: cabeMalas && paxFora === 0,
    noLimite: cabeMalas && !cabeMais23 && !cabeMais10 && (grandes > 0 || bordo > 0),
    sobra23: cabeMalas ? sobra23 : 0,
    sobra10: cabeMalas ? sobra10 : 0,
    totalGrandes: grandes,
    totalBordo: bordo,
  };
};

const pl = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

export const resumoSimulacao = (veiculo, s) => {
  if (!s) return "";
  if (!s.cabePax) return `Faltam lugares: ${pl(s.pax, "passageiro", "passageiros")} para ${pl(s.lugares, "lugar", "lugares")}.`;
  if (!s.cabeMalas) {
    const fora = [s.grandesFora && pl(s.grandesFora, "mala de 23 kg", "malas de 23 kg"), s.bordoFora && pl(s.bordoFora, "mala de 10 kg", "malas de 10 kg")]
      .filter(Boolean)
      .join(" e ");
    return `Não cabe: ficam de fora ${fora}.`;
  }
  if (s.noLimite) return "Cabe, no limite: não sobra espaço para mais nenhuma mala.";
  const sobra = [s.sobra23 && pl(s.sobra23, "mala de 23 kg", "malas de 23 kg"), s.sobra10 && pl(s.sobra10, "de 10 kg", "de 10 kg")].filter(Boolean).join(" ou ");
  return sobra ? `Cabe! Ainda sobra espaço para ${sobra}.` : "Cabe!";
};

export const textoSimulacao = (veiculo, s) => {
  if (!s) return "";
  const grupo = [
    pl(s.pax || 0, "passageiro", "passageiros"),
    s.totalGrandes && pl(s.totalGrandes, "mala de 23 kg", "malas de 23 kg"),
    s.totalBordo && pl(s.totalBordo, "mala de 10 kg", "malas de 10 kg"),
  ]
    .filter(Boolean)
    .join(", ");
  return `🚐 *${veiculo.nome}*\n👥 ${grupo}\n${s.cabe ? "✅" : "⚠️"} ${resumoSimulacao(veiculo, s)}`;
};
