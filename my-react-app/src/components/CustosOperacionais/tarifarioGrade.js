// tarifarioGrade.js
//
// Monta a grade do Tarifário (tela e impressão) a partir das tarifas, sem
// repetir valor: IN e OUT da mesma região viram uma linha só ("Aeroporto ⇄
// região") e transfer de ida e volta também ("SALVADOR ⇄ LITORAL NORTE").
// Quando os dois sentidos têm o mesmo valor, a célula mostra um número só;
// quando diferem (ou falta um lado), a célula mostra os dois.
// O cadastro não muda: continua uma tarifa por tipo, região e veículo.
import { CATEGORIAS, chaveTexto, ondeDaTarifa } from "../../Services/Services/custosCalculo";

export const SECOES_TARIFARIO = [
  {
    chave: "AEROPORTO",
    tipos: ["IN", "OUT"],
    tag: "IN",
    titulo: "Aeroporto (IN e OUT)",
    nota: "Valor por serviço (veículo). Chegada e saída da mesma região numa linha só.",
    rotuloColuna: "Região do hotel",
  },
  {
    chave: "TRF",
    tipos: ["TRF"],
    tag: "TRF",
    titulo: "Transfer — hotel ⇄ hotel",
    nota: "Valor por serviço (veículo). Ida e volta numa linha só.",
    rotuloColuna: "Trajeto",
  },
  { chave: "PASSEIO", tipos: ["PASSEIO"], tag: "PASSEIO", titulo: "Passeios", nota: "Valor do veículo no passeio.", rotuloColuna: "Passeio" },
  {
    chave: "APOIO",
    tipos: ["APOIO"],
    tag: "APOIO",
    titulo: "Apoio de passeio",
    nota: "Valor por trecho (ida e volta = 2 trechos).",
    rotuloColuna: "Trecho",
  },
  {
    chave: "SERVICO",
    tipos: ["SERVICO"],
    tag: "SERVICO",
    titulo: "Serviços de parceiros",
    nota: "Reconhecidos pelo nome do serviço no Phoenix; cobrança por passageiro ou reserva.",
    rotuloColuna: "Serviço — parceiro",
  },
];

export const COLUNAS_TARIFARIO = [{ valor: "", nome: "Qualquer" }, ...CATEGORIAS];

// cidade-base primeiro nos transfers ("SALVADOR ⇄ LITORAL NORTE")
const BASE = "salvador";

// sigla curta do lugar para a célula com os dois sentidos
export const siglaDoLugar = (nome = "") => {
  const t = String(nome || "").trim();
  if (!t) return "?";
  if (chaveTexto(t) === BASE) return "SSA";
  const palavras = t.split(/\s+/).filter((p) => p.length > 2 || /^[A-Z]{2,3}$/.test(p));
  if (palavras.length > 1) return palavras.map((p) => p[0]).join("").toUpperCase().slice(0, 4);
  return t.slice(0, 3).toUpperCase();
};

const chaveDaLinhaSimples = (t) => `${t.tipo}|${t.regiao}|${t.regiaoDestino}|${chaveTexto(t.servico)}`;

// dois lados com o mesmo preço (valor, casado e forma de cobrança)
export const ladosIguais = (a, b) =>
  !!a &&
  !!b &&
  a.tarifa.valor === b.tarifa.valor &&
  (a.tarifa.valorCasado ?? null) === (b.tarifa.valorCasado ?? null) &&
  a.tarifa.cobranca === b.tarifa.cobranca;

// Linha de dois sentidos. lado "a" = IN (ou ida), lado "b" = OUT (ou volta).
const chaveDoPar = (t) => {
  if (t.tipo === "IN" || t.tipo === "OUT") return { chave: `AER|${chaveTexto(t.regiao)}`, lado: t.tipo === "IN" ? "a" : "b" };
  // transfer: a = sentido que sai da cidade-base (ou o primeiro em ordem alfabética)
  const o = chaveTexto(t.regiao);
  const d = chaveTexto(t.regiaoDestino);
  const primeiro = o === BASE ? o : d === BASE ? d : [o, d].sort()[0];
  return { chave: `TRF|${[o, d].sort().join("|")}`, lado: o === primeiro ? "a" : "b" };
};

const montarLinhaPar = (secao, chave) => ({ chave, tipoLinha: "par", secao, celulas: {}, lugares: null });

const fecharLinhaPar = (l) => {
  const cels = Object.values(l.celulas);
  const temA = cels.some((c) => c.a);
  const temB = cels.some((c) => c.b);
  const todasIguais = cels.every((c) => ladosIguais(c.a, c.b));
  const algumDiferente = cels.some((c) => c.a && c.b && !ladosIguais(c.a, c.b));
  const modelo = cels.map((c) => (c.a || c.b).tarifa)[0];
  if (l.secao === "AEROPORTO") {
    l.rotulo = `Aeroporto ⇄ ${modelo.regiao || "qualquer região"}`;
    l.siglas = { a: "IN", b: "OUT" };
    const faltaB = cels.some((c) => c.a && !c.b);
    const faltaA = cels.some((c) => !c.a && c.b);
    l.estado = todasIguais ? "igual" : algumDiferente ? "diferente" : temA && !temB ? "so-a" : !temA && temB ? "so-b" : "parcial";
    l.etiqueta = {
      igual: "IN = OUT",
      diferente: "valores diferentes",
      "so-a": "só IN",
      "so-b": "só OUT",
      parcial: faltaA && faltaB ? "falta IN ou OUT" : faltaB ? "falta OUT em algum veículo" : "falta IN em algum veículo",
    }[l.estado];
  } else {
    const ida = cels.map((c) => c.a?.tarifa).find(Boolean);
    const volta = cels.map((c) => c.b?.tarifa).find(Boolean);
    const origem = (ida || { regiao: volta.regiaoDestino }).regiao;
    const destino = (ida || { regiaoDestino: volta.regiao }).regiaoDestino;
    l.lugares = { a: origem, b: destino };
    l.siglas = { a: `${siglaDoLugar(origem)} → ${siglaDoLugar(destino)}`, b: `${siglaDoLugar(destino)} → ${siglaDoLugar(origem)}` };
    const so = temA && !temB ? "a" : !temA && temB ? "b" : "";
    // um sentido só: linha comum com seta simples
    l.umSentido = so;
    l.rotulo = so
      ? `${so === "a" ? origem || "Qualquer região" : destino || "Qualquer região"} → ${so === "a" ? destino || "qualquer região" : origem || "qualquer região"}`
      : `${origem || "Qualquer região"} ⇄ ${destino || "qualquer região"}`;
    l.estado = so ? "um-sentido" : todasIguais ? "igual" : algumDiferente ? "diferente" : "parcial";
    l.etiqueta = { igual: "ida = volta", diferente: "valores diferentes", parcial: "falta um sentido", "um-sentido": "" }[l.estado];
  }
  l.modelo = modelo;
  // casado (só aeroporto): valor por trecho, par IN + OUT e cheio
  if (l.secao === "AEROPORTO") {
    const casado = {};
    Object.entries(l.celulas).forEach(([cat, c]) => {
      const ca = c.a?.tarifa.valorCasado ?? null;
      const cb = c.b?.tarifa.valorCasado ?? null;
      if (ca === null && cb === null) return;
      const va = c.a?.tarifa.valor ?? c.b?.tarifa.valor;
      const vb = c.b?.tarifa.valor ?? c.a?.tarifa.valor;
      const ta = ca ?? cb;
      const tb = cb ?? ca;
      casado[cat] = {
        trechoA: ta,
        trechoB: tb,
        iguais: ta === tb,
        par: Math.round((ta + tb) * 100) / 100,
        cheio: Math.round((va + vb) * 100) / 100,
      };
    });
    l.casado = Object.keys(casado).length ? casado : null;
  }
  return l;
};

// tarifas → seções (com o filtro de fornecedor e de veículo da tela)
export const montarSecoesTarifario = (tarifas = [], { fornecedorSel = "", veiculoSel = "" } = {}) => {
  const geral = tarifas.filter((t) => !t.fornecedor);
  const proprias = fornecedorSel ? tarifas.filter((t) => chaveTexto(t.fornecedor) === chaveTexto(fornecedorSel)) : [];
  // "Qualquer veículo": se alguma seção usa, entra em todas (grade igual)
  const algumQualquer = tarifas.some(
    (t) => t.tipo !== "SERVICO" && t.valor !== null && !t.categoria && (!t.fornecedor || proprias.includes(t)),
  );
  const visivel = (cat) => !veiculoSel || (veiculoSel === "qualquer" ? cat === "" : cat === veiculoSel || cat === "");

  return SECOES_TARIFARIO.map((sec) => {
    const linhas = new Map();
    const comPar = sec.chave === "AEROPORTO" || sec.chave === "TRF";
    const colocar = (t, origem) => {
      if (!sec.tipos.includes(t.tipo) || t.valor === null) return;
      const cat = t.categoria || "";
      if (comPar) {
        const { chave, lado } = chaveDoPar(t);
        if (!linhas.has(chave)) linhas.set(chave, montarLinhaPar(sec.chave, chave));
        const l = linhas.get(chave);
        if (!l.celulas[cat]) l.celulas[cat] = { a: null, b: null };
        // a tarifa própria do fornecedor vence a geral no mesmo lugar
        if (!l.celulas[cat][lado] || origem === "propria") l.celulas[cat][lado] = { tarifa: t, origem };
        return;
      }
      const k = sec.chave === "SERVICO" ? `${chaveDaLinhaSimples(t)}|${chaveTexto(t.fornecedor)}` : chaveDaLinhaSimples(t);
      const rotulo = sec.chave === "SERVICO" ? `${ondeDaTarifa(t)} — ${t.fornecedor || "sem fornecedor"}` : ondeDaTarifa(t);
      if (!linhas.has(k)) linhas.set(k, { chave: k, tipoLinha: "simples", rotulo, modelo: t, celulas: {} });
      linhas.get(k).celulas[cat] = { tarifa: t, origem };
    };
    if (sec.chave === "SERVICO") {
      tarifas
        .filter((t) => t.tipo === "SERVICO" && (!fornecedorSel || chaveTexto(t.fornecedor) === chaveTexto(fornecedorSel)))
        .forEach((t) => colocar(t, "propria"));
    } else {
      geral.forEach((t) => colocar(t, fornecedorSel ? "geral" : "propria"));
      proprias.forEach((t) => colocar(t, "propria"));
    }
    let lista = Array.from(linhas.values()).map((l) => (l.tipoLinha === "par" ? fecharLinhaPar(l) : l));
    lista.sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
    lista = lista.filter((l) => Object.keys(l.celulas).some(visivel));
    const usadas = new Set(lista.flatMap((l) => Object.keys(l.celulas)).filter(visivel));
    const colunas =
      sec.chave === "SERVICO"
        ? COLUNAS_TARIFARIO.filter((c) => usadas.has(c.valor))
        : COLUNAS_TARIFARIO.filter((c) =>
          c.valor === "" ? algumQualquer || usadas.has("") : visivel(c.valor) && veiculoSel !== "qualquer",
        );
    // parceiro não tem veículo: some quando um veículo está escolhido
    if (sec.chave === "SERVICO" && veiculoSel) lista = [];
    return { ...sec, linhas: lista, colunas: colunas.length ? colunas : COLUNAS_TARIFARIO.slice(1) };
  });
};

// Tarifa do outro sentido (o "par") de uma tarifa IN/OUT/TRF
export const modeloDoPar = (t) => {
  if (t.tipo === "IN") return { tipo: "OUT", regiao: t.regiao, regiaoDestino: "" };
  if (t.tipo === "OUT") return { tipo: "IN", regiao: t.regiao, regiaoDestino: "" };
  if (t.tipo === "TRF") return { tipo: "TRF", regiao: t.regiaoDestino, regiaoDestino: t.regiao };
  return null;
};

export const nomeDoPar = (t) => {
  if (t?.tipo === "IN") return "OUT (hotel → aeroporto)";
  if (t?.tipo === "OUT") return "IN (aeroporto → hotel)";
  if (t?.tipo === "TRF") {
    if (!t.regiao && !t.regiaoDestino) return "sentido contrário";
    return `volta (${t.regiaoDestino || "qualquer região"} → ${t.regiao || "qualquer região"})`;
  }
  return "";
};

// a tarifa própria (mesmo fornecedor) que é o par de `t`, se existir
export const acharTarifaPar = (t, tarifas = []) => {
  const m = modeloDoPar(t);
  if (!m) return null;
  return (
    tarifas.find(
      (x) =>
        x.id !== t.id &&
        x.tipo === m.tipo &&
        chaveTexto(x.fornecedor) === chaveTexto(t.fornecedor) &&
        chaveTexto(x.regiao) === chaveTexto(m.regiao) &&
        chaveTexto(x.regiaoDestino) === chaveTexto(m.regiaoDestino) &&
        (x.categoria || "") === (t.categoria || ""),
    ) || null
  );
};
