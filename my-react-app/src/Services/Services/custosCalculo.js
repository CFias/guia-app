// custosCalculo.js
//
// Regras do CUSTO OPERACIONAL (só cálculo, sem banco — dá para testar
// sozinho). A tela "Custos operacionais" junta três fontes:
//   1. Phoenix: os serviços do dia, um por escala (veículo), com tipo,
//      hotéis/regiões, horário, veículo, motorista e guia;
//   2. tabela de tarifas (settings/custos): quanto cada fornecedor cobra por
//      tipo de serviço, região/passeio e categoria de veículo — valor cheio
//      e valor casado;
//   3. lançamentos do dia (custos_dia/{data}): o valor que o fornecedor
//      realmente cobrou e o que foi pago ao guia, quando diferem da tabela.
//
// O valor final de cada serviço é: lançado > tarifa (casada, se for casado)
// > sem tarifa (pendência). O guia nunca entra pela tabela sozinho: a tabela
// só sugere a referência e o valor fica "a confirmar" até alguém lançar.

import { acumularIdiomas, extrairIdiomasDoItem, siglaDoIdioma } from "../Utils/idiomas";

/* ---------------- constantes ---------------- */

export const CATEGORIAS = [
  { valor: "carro", nome: "Carro", curto: "Carro" },
  { valor: "van", nome: "Van", curto: "Van" },
  { valor: "van-alongada", nome: "Van alongada", curto: "Van along." },
  { valor: "micro", nome: "Micro-ônibus", curto: "Micro" },
  { valor: "onibus", nome: "Ônibus", curto: "Ônibus" },
];

export const NOME_CATEGORIA = Object.fromEntries(CATEGORIAS.map((c) => [c.valor, c.nome]));

// grupos grandes: o guia acompanha o grupo mesmo em transfer
export const CATEGORIAS_COM_GUIA = ["micro", "onibus"];

// lotação por categoria (passageiros) — o recomendador só sugere colocar um
// serviço num veículo que comporte o grupo
export const CAPACIDADE_CATEGORIA = { carro: 4, van: 15, "van-alongada": 20, micro: 28, onibus: 50 };

export const TIPOS_CUSTO = [
  { valor: "IN", nome: "IN (chegada)" },
  { valor: "OUT", nome: "OUT (saída)" },
  { valor: "TRF", nome: "Transfer" },
  { valor: "PASSEIO", nome: "Passeio" },
  { valor: "APOIO", nome: "Apoio de passeio (por trecho)" },
  { valor: "SERVICO", nome: "Serviço de parceiro (pelo nome no Phoenix)" },
];

// como a tarifa é cobrada: por serviço (veículo), por passageiro ou por reserva
export const COBRANCAS = [
  { valor: "servico", nome: "Por serviço", sufixo: "" },
  { valor: "pax", nome: "Por passageiro", sufixo: "/ pax" },
  { valor: "reserva", nome: "Por reserva", sufixo: "/ reserva" },
];
export const SUFIXO_COBRANCA = Object.fromEntries(COBRANCAS.map((c) => [c.valor, c.sufixo]));

export const NOME_TIPO = { IN: "IN", OUT: "OUT", TRF: "Transfer", PASSEIO: "Passeio", APOIO: "Apoio", SERVICO: "Parceiro" };
const TIPOS_VALIDOS = ["IN", "OUT", "TRF", "PASSEIO", "APOIO", "SERVICO"];

// minHoras: margem mínima entre dois serviços do mesmo veículo (deslocamento
//           sem risco de atraso) — também vale para o recomendador de troca
// maxHoras: até quanto tempo depois do IN o OUT ainda conta como casado
// duracaoPasseioHoras: quanto tempo um passeio ocupa o veículo
// no-show: % do valor do serviço pago ao fornecedor quando o passageiro não
// se apresenta. Chegada (IN) paga metade; saída (OUT) paga inteiro.
// adicionalIdioma: % a mais para o guia num passeio regular que tem
// passageiro de outro idioma.
export const REGRAS_PADRAO = { noShowIn: 50, noShowOut: 100, noShowTrf: 100, adicionalIdioma: 20 };

export const MODALIDADES_GUIA = [
  { valor: "regular", nome: "Regular" },
  { valor: "mi", nome: "Tabela MI" },
  { valor: "idioma", nome: "Regular + idioma" },
];
export const NOME_MODALIDADE = Object.fromEntries(MODALIDADES_GUIA.map((m) => [m.valor, m.nome]));

export const CASADO_PADRAO = {
  ativo: true,
  regioes: ["LITORAL NORTE"],
  minHoras: 2,
  maxHoras: 3,
  duracaoPasseioHoras: 8,
};

/* ---------------- texto e números ---------------- */

export const normalizarTexto = (texto = "") =>
  String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export const chaveTexto = (texto = "") => normalizarTexto(texto).replace(/[^a-z0-9]+/g, " ").trim();

export const regiaoCanonica = (texto = "") => String(texto ?? "").replace(/\s+/g, " ").trim().toUpperCase();

export const numeroOuNulo = (v) => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  return lerValorDigitado(v);
};

// "1.234,5" / "1234.5" / 1234.5 → 1234.5 (aceita o que a pessoa digitar)
export const lerValorDigitado = (texto) => {
  if (texto === null || texto === undefined) return null;
  const s = String(texto).replace(/[R$\s]/g, "").trim();
  if (!s) return null;
  const temVirgula = s.includes(",");
  const limpo = temVirgula ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(limpo);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};

export const formatarReais = (v, { semCentavos = false } = {}) => {
  const n = Number(v || 0);
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: semCentavos ? 0 : 2,
    maximumFractionDigits: semCentavos ? 0 : 2,
  });
};

const horaEmMinutos = (hora = "") => {
  const m = String(hora).match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/* ---------------- categoria do veículo ---------------- */

const PALAVRAS_CATEGORIA = [
  ["onibus", ["onibus", "ônibus", "bus ", "double deck", "rodoviario", "executivo 4", "46l", "44l", "50l"]],
  ["micro", ["micro", "volare", "w9", "w8", "28l", "24l", "(24)", "(28)", "(25)"]],
  // van alongada: 18 a 20 lugares (mesma tarifa para as duas)
  ["van-alongada", ["alongada", "longa", "(18)", "(19)", "(20)", "18l", "19l", "20l", "18 lug", "20 lug"]],
  ["van", ["van", "sprinter", "master", "ducato", "boxer", "jumper", "daily", "(14)", "(15)", "(16)", "15l", "16l"]],
  ["carro", ["spin", "doblo", "doblò", "carro", "sedan", "suv", "4x4", "onix", "cobalt", "corolla", "byd", "logan", "voyage", "prisma", "taxi"]],
];

// Pelo nome do veículo no Phoenix ("JOALDO - SPIN", "VAN FERNANDO (15)").
// Quando não dá para saber, devolve "" e a tela pede para escolher.
export const categoriaPeloNome = (nome = "") => {
  const t = ` ${normalizarTexto(nome)} `;
  for (const [cat, palavras] of PALAVRAS_CATEGORIA) {
    if (palavras.some((p) => t.includes(normalizarTexto(p)))) return cat;
  }
  return "";
};

/* ---------------- Phoenix → serviços (1 por escala) ---------------- */

const veiculoObj = (item) =>
  item?.roadmapService?.roadmap?.serviceOrder?.vehicle ||
  item?.auxRoadmapService?.roadmap?.serviceOrder?.vehicle ||
  item?.vehicle ||
  null;

const extrairVeiculoNome = (item) =>
  String(
    veiculoObj(item)?.name ||
    item?.roadmapService?.roadmap?.serviceOrder?.vehicle_name ||
    item?.auxRoadmapService?.roadmap?.serviceOrder?.vehicle_name ||
    "",
  ).trim();

const extrairVeiculoId = (item) => {
  const id =
    veiculoObj(item)?.id ??
    item?.roadmapService?.roadmap?.serviceOrder?.vehicle_id ??
    item?.auxRoadmapService?.roadmap?.serviceOrder?.vehicle_id ??
    null;
  return id !== null && id !== undefined && id !== "" ? String(id) : "";
};

// mesma chave da tela Serviços por Fornecedor (vínculo veículo → fornecedor)
export const chaveDoVeiculo = (id, nome) =>
  id || `nome-${normalizarTexto(nome).replace(/[^a-z0-9]+/g, "-")}`;

const roadmapDo = (item) => item?.roadmapService?.roadmap || item?.auxRoadmapService?.roadmap || item?.roadmap || null;

const extrairGuia = (item) =>
  String(roadmapDo(item)?.guide?.nickname || roadmapDo(item)?.guide?.name || "")
    .replace(/\s*-?\s*GUIA\s*$/i, "")
    .trim();

const extrairMotorista = (item) =>
  String(roadmapDo(item)?.driver?.nickname || roadmapDo(item)?.driver?.name || "").trim();

const nomeOrigem = (item) => item?.establishmentOrigin?.name || "";
const nomeDestino = (item) => item?.establishmentDestination?.name || "";
const regiaoOrigem = (item) => regiaoCanonica(item?.establishmentOrigin?.region?.name || item?.regionOrigin?.name || "");
const regiaoDestino = (item) =>
  regiaoCanonica(item?.establishmentDestination?.region?.name || item?.regionDestination?.name || "");

const nomeServico = (item) => item?.service?.name || item?.schedule?.service?.name || "";

const ehAeroporto = (texto = "") => {
  const t = normalizarTexto(texto);
  return t.includes("aeroporto") || t.includes("airport");
};

const valorHorario = (item) =>
  String(item?.presentation_hour || item?.presentation_hour_end || item?.schedule?.presentation_hour || item?.date || "");

const extrairData = (item) => (valorHorario(item).match(/^(\d{4}-\d{2}-\d{2})/) || [])[1] || "";
const extrairHora = (item) => (valorHorario(item).match(/(\d{2}:\d{2})/) || [])[1] || "";

const n0 = (...vals) => {
  for (const v of vals) {
    if (v === null || v === undefined || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
};

const paxDo = (item) =>
  n0(item?.is_adult_count, item?.adult_count) +
  n0(item?.is_child_count, item?.child_count) +
  n0(item?.is_baby_count, item?.is_infant_count, item?.infant_count);

export const tipoDoItem = (item) => {
  if (item?.__passeio || String(item?.service_type) === "3") return "PASSEIO";
  if (ehAeroporto(nomeOrigem(item))) return "IN";
  if (ehAeroporto(nomeDestino(item))) return "OUT";
  const st = String(item?.service_type || "");
  if (st === "1") return "IN";
  if (st === "2") return "OUT";
  return "TRF";
};

// Reservas do Phoenix → serviços: uma linha por escala (roadmap) e tipo.
// Reservas sem veículo/escala ainda não têm custo e ficam de fora (contadas
// em `semEscala` para a tela avisar).
// Tarifas de "serviço de parceiro" reconhecem o serviço pelo nome no Phoenix
// (ex.: "MORRO DE SAO PAULO") e, se configurado, só num tipo (transfer…).
const tarifaDeParceiroDoItem = (item, tarifasParceiro) => {
  if (!tarifasParceiro.length) return null;
  const nome = chaveTexto(nomeServico(item));
  if (!nome) return null;
  const tipo = tipoDoItem(item);
  return (
    tarifasParceiro.find((t) => nome.includes(chaveTexto(t.servico)) && (!t.aplicaA || t.aplicaA === tipo)) || null
  );
};

export const consolidarServicos = (itens = [], dataAlvo = "", tarifas = []) => {
  const mapa = new Map();
  let semEscala = 0;
  const tarifasParceiro = tarifas.filter((t) => t.tipo === "SERVICO" && t.servico && t.valor !== null);

  itens.forEach((item) => {
    const escalaId = roadmapDo(item)?.id;
    const veiculo = extrairVeiculoNome(item);

    // serviço de parceiro (cobra por passageiro/reserva): entra mesmo sem
    // veículo escalado — uma linha por tarifa e horário de saída
    const parceiro = tarifaDeParceiroDoItem(item, tarifasParceiro);
    if (parceiro) {
      const data = extrairData(item) || item.__dataMapa || dataAlvo;
      const hora = extrairHora(item);
      const chave = `SRV_${parceiro.id}_${data}_${hora || "0000"}`.replace(/[^A-Za-z0-9_-]/g, "");
      if (!mapa.has(chave)) {
        const veiculoId = extrairVeiculoId(item);
        mapa.set(chave, {
          chave,
          escalaId: escalaId ? String(escalaId) : "",
          tipo: "SERVICO",
          tipoPhoenix: tipoDoItem(item),
          tarifaFixaId: parceiro.id,
          data,
          hora,
          veiculo: veiculo || `${parceiro.fornecedor || "Parceiro"} · parceiro`,
          veiculoId,
          veiculoKey: veiculo ? chaveDoVeiculo(veiculoId, veiculo) : `parceiro-${chaveTexto(parceiro.fornecedor || parceiro.id).replace(/ /g, "-")}`,
          placa: String(veiculoObj(item)?.plate || "").trim().toUpperCase(),
          motorista: extrairMotorista(item),
          guiaPhoenix: extrairGuia(item),
          passeio: nomeServico(item),
          regioesSet: new Set(),
          regioesDestinoSet: new Set(),
          hoteisSet: new Set(),
          reservas: 0,
          pax: 0,
          idiomas: {},
        });
      }
      const s = mapa.get(chave);
      s.reservas += 1;
      s.pax += paxDo(item);
      if (regiaoOrigem(item)) s.regioesSet.add(regiaoOrigem(item));
      if (regiaoDestino(item)) s.regioesDestinoSet.add(regiaoDestino(item));
      const hotel = ehAeroporto(nomeOrigem(item)) ? nomeDestino(item) : nomeOrigem(item);
      if (hotel) s.hoteisSet.add(hotel);
      return;
    }

    if (!escalaId || !veiculo) {
      semEscala += 1;
      return;
    }
    const tipo = tipoDoItem(item);
    const chave = `${tipo}_${escalaId}`;
    const data = extrairData(item) || item.__dataMapa || dataAlvo;
    const hora = extrairHora(item);

    if (!mapa.has(chave)) {
      const veiculoId = extrairVeiculoId(item);
      mapa.set(chave, {
        chave,
        escalaId: String(escalaId),
        tipo,
        data,
        hora,
        veiculo,
        veiculoId,
        veiculoKey: chaveDoVeiculo(veiculoId, veiculo),
        placa: String(veiculoObj(item)?.plate || "").trim().toUpperCase(),
        motorista: extrairMotorista(item),
        guiaPhoenix: extrairGuia(item),
        passeio: tipo === "PASSEIO" ? nomeServico(item) : "",
        regioesSet: new Set(),
        regioesDestinoSet: new Set(),
        hoteisSet: new Set(),
        reservas: 0,
        pax: 0,
        idiomas: {},
      });
    }
    const s = mapa.get(chave);
    s.reservas += 1;
    s.pax += paxDo(item);
    // idioma dos passageiros (só os estrangeiros: português não entra)
    acumularIdiomas(s.idiomas, extrairIdiomasDoItem(item, { nomeServico: nomeServico(item) }).ids, paxDo(item));
    if (!s.guiaPhoenix) s.guiaPhoenix = extrairGuia(item);
    if (!s.motorista) s.motorista = extrairMotorista(item);
    if (`${data} ${hora || "99:99"}` < `${s.data} ${s.hora || "99:99"}`) {
      s.data = data;
      s.hora = hora;
    }

    // região que define a tarifa: IN = onde deixa; OUT = onde busca;
    // transfer = origem → destino; passeio = de onde sai (só informativo)
    if (tipo === "IN") {
      if (regiaoDestino(item)) s.regioesSet.add(regiaoDestino(item));
      if (nomeDestino(item)) s.hoteisSet.add(nomeDestino(item));
    } else if (tipo === "OUT") {
      if (regiaoOrigem(item)) s.regioesSet.add(regiaoOrigem(item));
      if (nomeOrigem(item)) s.hoteisSet.add(nomeOrigem(item));
    } else if (tipo === "TRF") {
      if (regiaoOrigem(item)) s.regioesSet.add(regiaoOrigem(item));
      if (regiaoDestino(item)) s.regioesDestinoSet.add(regiaoDestino(item));
      if (nomeOrigem(item)) s.hoteisSet.add(nomeOrigem(item));
      if (nomeDestino(item)) s.hoteisSet.add(nomeDestino(item));
    } else {
      if (regiaoOrigem(item)) s.regioesSet.add(regiaoOrigem(item));
      if (nomeOrigem(item)) s.hoteisSet.add(nomeOrigem(item));
    }
  });

  const servicos = Array.from(mapa.values())
    .filter((s) => !dataAlvo || s.data === dataAlvo)
    .map(({ regioesSet, regioesDestinoSet, hoteisSet, ...s }) => ({
      ...s,
      regioes: Array.from(regioesSet).sort(),
      regioesDestino: Array.from(regioesDestinoSet).sort(),
      hoteis: Array.from(hoteisSet).sort(),
    }))
    .sort((a, b) => `${a.hora}${a.chave}`.localeCompare(`${b.hora}${b.chave}`));

  return { servicos, semEscala };
};

export const descreverServico = (s) => {
  if (s.tipo === "PASSEIO" || s.tipo === "SERVICO") return s.passeio || "Passeio";
  const hotel = s.hoteis?.[0] || "";
  const mais = (s.hoteis?.length || 0) > 1 ? ` +${s.hoteis.length - 1}` : "";
  if (s.tipo === "IN") return `Aeroporto → ${hotel || "hotel"}${mais}`;
  if (s.tipo === "OUT") return `${hotel || "hotel"}${mais} → Aeroporto`;
  return hotel ? `${hotel}${mais}` : "Transfer";
};

export const descreverRegiao = (s) => {
  if (s.tipo === "TRF") {
    const o = s.regioes?.join(" / ") || "?";
    const d = s.regioesDestino?.join(" / ") || "?";
    return `${o} → ${d}`;
  }
  return s.regioes?.join(" / ") || "";
};

/* ---------------- fornecedor do veículo ---------------- */

// vinculos: settings/vinculos_veiculos_fornecedor.vinculos ({chave: {fornecedor}})
// fornecedores: coleção providers ({nome, veiculos: [{id, nome}]})
export const mapaFornecedorPorVeiculo = (vinculos = {}, fornecedores = []) => {
  const mapa = {};
  fornecedores.forEach((f) => {
    const nome = String(f?.nome || "").trim();
    if (!nome || f?.ativo === false) return;
    (Array.isArray(f.veiculos) ? f.veiculos : []).forEach((v) => {
      const id = typeof v === "object" ? v?.id : null;
      const nomeV = typeof v === "object" ? v?.nome : v;
      const temId = id !== null && id !== undefined && id !== "";
      const chave = chaveDoVeiculo(temId ? String(id) : "", nomeV || "");
      if (!mapa[chave]) mapa[chave] = nome;
      // também pelo nome: cadastros antigos guardam só o nome do veículo
      const porNome = chaveDoVeiculo("", nomeV || "");
      if (nomeV && !mapa[porNome]) mapa[porNome] = nome;
    });
  });
  // o vínculo feito na tela Serviços por Fornecedor tem prioridade
  Object.entries(vinculos || {}).forEach(([chave, v]) => {
    const nome = String(v?.fornecedor || "").trim();
    if (nome) mapa[chave] = nome;
  });
  return mapa;
};

export const listaDeFornecedores = (vinculos = {}, fornecedores = [], tarifas = []) => {
  const porChave = new Map();
  const add = (nome) => {
    const n = String(nome || "").trim();
    if (n && !porChave.has(chaveTexto(n))) porChave.set(chaveTexto(n), n);
  };
  fornecedores.forEach((f) => f?.ativo !== false && add(f?.nome));
  Object.values(vinculos || {}).forEach((v) => add(v?.fornecedor));
  tarifas.forEach((t) => add(t?.fornecedor));
  return Array.from(porChave.values()).sort((a, b) => a.localeCompare(b, "pt-BR"));
};

/* ---------------- tarifas ---------------- */

let contadorId = 0;
export const novoIdTarifa = () => `t${Date.now().toString(36)}${(contadorId++).toString(36)}`;

export const normalizarTarifa = (t = {}) => ({
  id: t.id || novoIdTarifa(),
  fornecedor: String(t.fornecedor || "").trim(),
  tipo: TIPOS_VALIDOS.includes(t.tipo) ? t.tipo : "IN",
  regiao: regiaoCanonica(t.regiao),
  regiaoDestino: regiaoCanonica(t.regiaoDestino),
  servico: String(t.servico || "").trim(),
  categoria: NOME_CATEGORIA[t.categoria] ? t.categoria : "",
  valor: numeroOuNulo(t.valor),
  valorCasado: numeroOuNulo(t.valorCasado),
  cobranca: ["pax", "reserva"].includes(t.cobranca) ? t.cobranca : t.tipo === "SERVICO" ? "pax" : "servico",
  aplicaA: ["IN", "OUT", "TRF", "PASSEIO"].includes(t.aplicaA) ? t.aplicaA : "",
  obs: String(t.obs || "").trim(),
});

export const normalizarTarifaGuia = (t = {}) => ({
  id: t.id || novoIdTarifa(),
  tabela: t.tabela === "mi" ? "mi" : "regular",
  tipo: TIPOS_VALIDOS.includes(t.tipo) ? t.tipo : "",
  servico: String(t.servico || "").trim(),
  categoria: NOME_CATEGORIA[t.categoria] ? t.categoria : "",
  valor: numeroOuNulo(t.valor),
  obs: String(t.obs || "").trim(),
});

export const normalizarRegrasCasado = (r = {}) => {
  const min = numeroOuNulo(r.minHoras);
  const max = numeroOuNulo(r.maxHoras);
  const passeio = numeroOuNulo(r.duracaoPasseioHoras);
  return {
    ativo: r.ativo !== false,
    regioes: Array.isArray(r.regioes) ? r.regioes.map(regiaoCanonica).filter(Boolean) : [...CASADO_PADRAO.regioes],
    minHoras: min ?? CASADO_PADRAO.minHoras,
    maxHoras: max ?? CASADO_PADRAO.maxHoras,
    duracaoPasseioHoras: passeio ?? CASADO_PADRAO.duracaoPasseioHoras,
  };
};

const pct = (v, padrao) => {
  const n = numeroOuNulo(v);
  return n === null || n < 0 || n > 300 ? padrao : n;
};

export const normalizarRegras = (r = {}) => ({
  noShowIn: pct(r.noShowIn, REGRAS_PADRAO.noShowIn),
  noShowOut: pct(r.noShowOut, REGRAS_PADRAO.noShowOut),
  noShowTrf: pct(r.noShowTrf, REGRAS_PADRAO.noShowTrf),
  adicionalIdioma: pct(r.adicionalIdioma, REGRAS_PADRAO.adicionalIdioma),
});

export const normalizarConfigCustos = (d = {}) => ({
  regras: normalizarRegras(d.regras || {}),
  tarifas: (Array.isArray(d.tarifas) ? d.tarifas : []).map(normalizarTarifa),
  tarifasGuia: (Array.isArray(d.tarifasGuia) ? d.tarifasGuia : []).map(normalizarTarifaGuia),
  casado: normalizarRegrasCasado(d.casado || CASADO_PADRAO),
  categoriasVeiculo: d.categoriasVeiculo && typeof d.categoriasVeiculo === "object" ? d.categoriasVeiculo : {},
  regioesConhecidas: Array.isArray(d.regioesConhecidas) ? d.regioesConhecidas.map(regiaoCanonica).filter(Boolean) : [],
  servicosConhecidos: Array.isArray(d.servicosConhecidos)
    ? Array.from(new Set(d.servicosConhecidos.map((n) => String(n || "").trim()).filter(Boolean))).sort((x, y) => x.localeCompare(y, "pt-BR"))
    : [],
});

// Descrição curta de uma tarifa (para listas e motivos)
export const descreverTarifa = (t) => {
  const onde =
    t.tipo === "PASSEIO"
      ? t.servico || "qualquer passeio"
      : t.tipo === "TRF"
        ? `${t.regiao || "qualquer região"} → ${t.regiaoDestino || "qualquer região"}`
        : t.regiao || "qualquer região";
  return `${NOME_TIPO[t.tipo]} · ${onde} · ${t.categoria ? NOME_CATEGORIA[t.categoria] : "qualquer veículo"}`;
};

// Onde vale a tarifa, em texto (listas, tarifário)
export const ondeDaTarifa = (t) => {
  if (t.tipo === "SERVICO") return `Serviço com “${t.servico || "?"}”${t.aplicaA ? ` (${NOME_TIPO[t.aplicaA]})` : ""}`;
  if (t.tipo === "PASSEIO") return t.servico || "Qualquer passeio";
  if (t.tipo === "APOIO") return `Por trecho · ${t.regiao || "qualquer região"}${t.servico ? ` · ${t.servico}` : ""}`;
  if (t.tipo === "TRF") return `${t.regiao || "Qualquer região"} → ${t.regiaoDestino || "qualquer região"}`;
  if (t.tipo === "IN") return `Aeroporto → ${t.regiao || "qualquer região"}`;
  return `${t.regiao || "Qualquer região"} → Aeroporto`;
};

// Melhor tarifa para um serviço numa região: fornecedor específico vale
// mais que "todos os fornecedores"; depois a categoria certa; depois a
// região/passeio exatos. Empate: a primeira da lista.
const pontuarTarifa = (t, { tipo, fornecedor, categoria, regiao, regiaoDestino, passeio }) => {
  if (t.tipo !== tipo || t.tipo === "SERVICO") return -1;
  if (t.valor === null) return -1;
  let p = 0;
  if (t.fornecedor) {
    if (chaveTexto(t.fornecedor) !== chaveTexto(fornecedor)) return -1;
    p += 100;
  }
  if (t.categoria) {
    if (t.categoria !== categoria) return -1;
    p += 20;
  }
  if (tipo === "PASSEIO") {
    if (t.servico) {
      if (chaveTexto(t.servico) !== chaveTexto(passeio)) return -1;
      p += 10;
    }
  } else {
    if (t.regiao) {
      if (t.regiao !== regiao) return -1;
      p += 10;
    }
    if (tipo === "TRF" && t.regiaoDestino) {
      if (t.regiaoDestino !== regiaoDestino) return -1;
      p += 5;
    }
    if (tipo === "APOIO" && t.servico) {
      if (chaveTexto(t.servico) !== chaveTexto(passeio)) return -1;
      p += 5;
    }
  }
  return p;
};

export const acharTarifa = (servico, { fornecedor, categoria }, tarifas = []) => {
  const regioes = servico.regioes?.length ? servico.regioes : [""];
  const destinos = servico.regioesDestino?.length ? servico.regioesDestino : [""];
  let melhor = null;
  regioes.forEach((regiao) => {
    destinos.forEach((regiaoDestino) => {
      let escolhida = null;
      let pontos = -1;
      tarifas.forEach((t) => {
        const p = pontuarTarifa(t, {
          tipo: servico.tipo,
          fornecedor,
          categoria,
          regiao,
          regiaoDestino,
          passeio: servico.passeio,
        });
        if (p > pontos) {
          pontos = p;
          escolhida = t;
        }
      });
      // mais de uma região na mesma escala: vale a mais cara (o veículo
      // vai até a mais distante)
      if (escolhida && (!melhor || escolhida.valor > melhor.valor)) melhor = escolhida;
    });
  });
  return melhor;
};

export const acharTarifaGuia = (servico, categoria, tarifasGuia = [], tabela = "regular") => {
  let escolhida = null;
  let pontos = -1;
  tarifasGuia.forEach((t) => {
    if (t.valor === null) return;
    if ((t.tabela || "regular") !== tabela) return;
    let p = 0;
    if (t.tipo) {
      if (t.tipo !== servico.tipo) return;
      p += 4;
    }
    if (t.servico) {
      if (chaveTexto(t.servico) !== chaveTexto(servico.passeio)) return;
      p += 8;
    }
    if (t.categoria) {
      if (t.categoria !== categoria) return;
      p += 2;
    }
    if (p > pontos) {
      pontos = p;
      escolhida = t;
    }
  });
  return escolhida;
};

/* ---------------- serviço casado ---------------- */

const regiaoNaLista = (s, regras) => s.regioes?.some((r) => regras.regioes.includes(r));

// IN que deixa numa região do casado + OUT que busca na mesma região (pode
// ser outro hotel), no MESMO veículo, com o OUT entre min e max horas depois
// do IN. Cada serviço casa uma vez; o par mais próximo no tempo ganha.
export const detectarCasados = (servicos = [], regras = CASADO_PADRAO) => {
  const r = normalizarRegrasCasado(regras);
  const pares = {};
  if (!r.ativo || !r.regioes.length) return pares;
  const ins = servicos.filter((s) => s.tipo === "IN" && regiaoNaLista(s, r) && horaEmMinutos(s.hora) !== null);
  const outs = servicos.filter((s) => s.tipo === "OUT" && regiaoNaLista(s, r) && horaEmMinutos(s.hora) !== null);
  const candidatos = [];
  ins.forEach((a) => {
    outs.forEach((b) => {
      if (a.veiculoKey !== b.veiculoKey) return;
      const dif = horaEmMinutos(b.hora) - horaEmMinutos(a.hora);
      if (dif < r.minHoras * 60 || dif > r.maxHoras * 60) return;
      candidatos.push({ a, b, dif });
    });
  });
  candidatos
    .sort((x, y) => x.dif - y.dif)
    .forEach(({ a, b }) => {
      if (pares[a.chave] || pares[b.chave]) return;
      pares[a.chave] = b.chave;
      pares[b.chave] = a.chave;
    });
  return pares;
};

/* ---------------- linha final (o que vale para o custo) ---------------- */

// servico: do Phoenix (ou o retrato salvo, se o Phoenix não respondeu)
// manual:  lançamentos da pessoa {valor, fornecedor, categoria, casado,
//          guiaNome, guiaValor, semGuia, obs}
// ctx:     {fornecedorPorVeiculo, config, pares}
export const calcularLinha = (servico, manual = {}, ctx = {}) => {
  const { fornecedorPorVeiculo = {}, config = normalizarConfigCustos({}), pares = {}, apoios = {} } = ctx;
  const m = manual || {};

  const tarifaFixa = servico.tarifaFixaId ? config.tarifas.find((t) => t.id === servico.tarifaFixaId) || null : null;
  const fornecedorAuto =
    (tarifaFixa && tarifaFixa.fornecedor) ||
    fornecedorPorVeiculo[servico.veiculoKey] ||
    fornecedorPorVeiculo[chaveDoVeiculo("", servico.veiculo)] ||
    "";
  const fornecedor = String(m.fornecedor || fornecedorAuto || "").trim();
  const categoriaAuto = config.categoriasVeiculo?.[servico.veiculoKey] || categoriaPeloNome(servico.veiculo);
  const categoria = NOME_CATEGORIA[m.categoria] ? m.categoria : categoriaAuto;

  // veículo de apoio do passeio: só leva do hotel ao veículo principal e
  // traz de volta — cobra por trecho (tarifa "Apoio"), não o passeio cheio
  const ehPasseio = servico.tipo === "PASSEIO";
  const apoioAuto = ehPasseio && !!apoios[servico.chave];
  const apoio = ehPasseio && (typeof m.apoio === "boolean" ? m.apoio : apoioAuto);
  const trechos = apoio ? (Number(m.trechos) === 1 ? 1 : 2) : 1;

  const parAuto = apoio ? null : pares[servico.chave] || null;
  const casado = apoio ? false : typeof m.casado === "boolean" ? m.casado : !!parAuto;

  const tarifa =
    servico.tipo === "SERVICO"
      ? tarifaFixa
      : acharTarifa(apoio ? { ...servico, tipo: "APOIO" } : servico, { fornecedor, categoria }, config.tarifas);
  // cobrança por passageiro / reserva: valor × quantidade (editável na ficha)
  const cobranca = tarifa?.cobranca || "servico";
  const quantidadeAuto = cobranca === "pax" ? servico.pax : cobranca === "reserva" ? servico.reservas : 1;
  const quantidadeManual = numeroOuNulo(m.quantidade);
  const quantidade = cobranca === "servico" ? 1 : quantidadeManual ?? quantidadeAuto;
  const tarifaUnitaria = tarifa ? tarifa.valor : null;
  const tarifaCheia = tarifa ? Math.round(tarifa.valor * trechos * quantidade * 100) / 100 : null;
  const tarifaCasada = tarifa && !apoio && cobranca === "servico" ? (tarifa.valorCasado ?? null) : null;
  const tarifaAplicada = tarifa ? (casado && tarifaCasada !== null ? tarifaCasada : tarifaCheia) : null;

  const valorLancado = numeroOuNulo(m.valor);
  let valorServico = null;
  let origemValor = "sem-tarifa";
  if (valorLancado !== null) {
    valorServico = valorLancado;
    origemValor = "lancado";
  } else if (tarifaAplicada !== null) {
    valorServico = tarifaAplicada;
    origemValor = casado && tarifaCasada !== null ? "tarifa-casada" : "tarifa";
  }

  // no-show: o passageiro não se apresentou. IN paga a % de no-show
  // (padrão 50%); OUT e transfer pagam inteiro (ou o que estiver na regra).
  const regras = config.regras || REGRAS_PADRAO;
  const noShow = !!m.noShow && servico.tipo !== "PASSEIO";
  const noShowPct = noShow
    ? servico.tipo === "IN"
      ? regras.noShowIn
      : servico.tipo === "OUT"
        ? regras.noShowOut
        : regras.noShowTrf
    : 100;
  const valorFornecedor = valorServico === null ? null : Math.round(valorServico * noShowPct) / 100;
  const economiaNoShow = valorServico === null ? 0 : Math.round((valorServico - valorFornecedor) * 100) / 100;

  // economia em relação à tabela cheia: casado ou valor negociado abaixo
  // (o desconto do no-show fica à parte, em economiaNoShow)
  const economia =
    tarifaCheia !== null && valorServico !== null && valorServico < tarifaCheia
      ? Math.round((tarifaCheia - valorServico) * 100) / 100
      : 0;
  const motivoEconomia = economia > 0 ? (casado ? "casado" : "negociado") : "";
  const acimaDaTabela =
    tarifaCheia !== null && valorServico !== null && valorServico > tarifaCheia
      ? Math.round((valorServico - tarifaCheia) * 100) / 100
      : 0;

  // guia
  const guiaNome = m.semGuia ? "" : String(m.guiaNome || servico.guiaPhoenix || "").trim();
  const grupoGrande = CATEGORIAS_COM_GUIA.includes(categoria);
  // modalidade: regular, tabela MI (guiamento todo em outro idioma para um
  // grupo) ou regular + adicional de idioma (passeio regular com passageiro
  // estrangeiro). Automático: passeio com passageiro estrangeiro → idioma.
  const idiomasEstrangeiros = Object.keys(servico.idiomas || {}).filter((k) => k !== "pt" && servico.idiomas[k] > 0);
  const guiaModalidadeAuto = servico.tipo === "PASSEIO" && idiomasEstrangeiros.length ? "idioma" : "regular";
  const guiaModalidade = NOME_MODALIDADE[m.guiaModalidade] ? m.guiaModalidade : guiaModalidadeAuto;
  const temGuiaOuGrande = !!guiaNome || grupoGrande;
  const refBase = temGuiaOuGrande
    ? acharTarifaGuia(servico, categoria, config.tarifasGuia, guiaModalidade === "mi" ? "mi" : "regular")
    : null;
  const fatorIdioma = guiaModalidade === "idioma" ? 1 + regras.adicionalIdioma / 100 : 1;
  const refGuia = refBase ? { valor: Math.round(refBase.valor * fatorIdioma * 100) / 100, base: refBase.valor } : null;
  const guiaValor = guiaNome ? numeroOuNulo(m.guiaValor) : null;
  // parte do valor do guia que é o adicional de idioma (para o relatório)
  const valorGuiaParaAdicional = guiaValor ?? (refGuia ? refGuia.valor : null);
  const guiaAdicional =
    guiaNome && guiaModalidade === "idioma" && valorGuiaParaAdicional !== null
      ? Math.round((valorGuiaParaAdicional - valorGuiaParaAdicional / fatorIdioma) * 100) / 100
      : 0;
  let guiaStatus = "sem-guia";
  if (guiaNome) guiaStatus = guiaValor !== null ? "lancado" : "a-confirmar";
  else if (grupoGrande && !m.semGuia) guiaStatus = "verificar";

  const pendencias = [];
  if (!fornecedor) pendencias.push("fornecedor");
  if (!categoria && servico.tipo !== "SERVICO") pendencias.push("categoria");
  if (valorFornecedor === null) pendencias.push("valor");
  if (guiaStatus === "a-confirmar") pendencias.push("guia");
  if (guiaStatus === "verificar") pendencias.push("guia-verificar");

  return {
    ...servico,
    descricao: descreverServico(servico),
    regiaoTexto: descreverRegiao(servico),
    fornecedor,
    fornecedorAuto,
    categoria,
    categoriaAuto,
    casado,
    parCasado: parAuto,
    casadoManual: typeof m.casado === "boolean",
    apoio,
    apoioAuto,
    apoioManual: typeof m.apoio === "boolean",
    trechos,
    tarifaUnitaria,
    cobranca,
    quantidade,
    quantidadeAuto,
    quantidadeManual: quantidadeManual !== null,
    tarifaId: tarifa?.id || null,
    tarifaCheia,
    tarifaCasada,
    tarifaAplicada,
    valorServico,
    valorFornecedor,
    origemValor,
    noShow,
    noShowPct,
    economiaNoShow,
    economia,
    motivoEconomia,
    acimaDaTabela,
    guiaNome,
    guiaManual: !!m.guiaNome,
    semGuia: !!m.semGuia,
    guiaReferencia: refGuia ? refGuia.valor : null,
    guiaReferenciaBase: refGuia ? refGuia.base : null,
    guiaModalidade,
    guiaModalidadeAuto,
    guiaAdicional,
    idiomasEstrangeiros,
    idiomasTexto: idiomasEstrangeiros.map((k) => `${siglaDoIdioma(k)} ${servico.idiomas[k]}`).join(" · "),
    guiaValor,
    guiaStatus,
    total: (valorFornecedor || 0) + (guiaValor || 0),
    obs: String(m.obs || ""),
    pendencias,
  };
};

/* ---------------- veículo de apoio ---------------- */

// Apoio automático: "APOIO" no nome do veículo ou do motorista escalado,
// carro sem guia no passeio, ou o mesmo passeio com mais de uma escala no dia
// em que só algumas têm guia — as sem guia são apoio (buscam no hotel,
// entregam ao veículo principal e trazem de volta).
export const detectarApoios = (servicos = []) => {
  const apoios = {};
  const porPasseio = new Map();
  servicos.forEach((s) => {
    if (s.tipo !== "PASSEIO") return;
    if (/\bapoio\b/.test(normalizarTexto(s.veiculo)) || /\bapoio\b/.test(normalizarTexto(s.motorista))) apoios[s.chave] = true;
    // carro (Spin, Doblò…) em passeio sem guia quase sempre é apoio
    else if (!s.guiaPhoenix && categoriaPeloNome(s.veiculo) === "carro") apoios[s.chave] = true;
    const k = chaveTexto(s.passeio);
    if (!porPasseio.has(k)) porPasseio.set(k, []);
    porPasseio.get(k).push(s);
  });
  porPasseio.forEach((grupo) => {
    if (grupo.length < 2) return;
    const comGuia = grupo.filter((s) => s.guiaPhoenix);
    if (!comGuia.length || comGuia.length === grupo.length) return;
    grupo.filter((s) => !s.guiaPhoenix).forEach((s) => {
      apoios[s.chave] = true;
    });
  });
  return apoios;
};

/* ---------------- recomendador de troca entre veículos ---------------- */

// Janela que o serviço ocupa o veículo (em minutos do dia). Transfer: o
// horário; passeio: do horário até o fim do passeio.
const janelaDoServico = (s, regras) => {
  const ini = horaEmMinutos(s.hora);
  if (ini === null) return null;
  const fim = s.tipo === "PASSEIO" ? ini + regras.duracaoPasseioHoras * 60 : ini;
  return [ini, fim];
};

// Folga exigida entre dois serviços do mesmo veículo: a margem mínima quando
// algum dos dois é na região do casado (viagem longa); senão 1h (cidade).
const MARGEM_CIDADE_MIN = 60;
const folgaExigida = (a, b, regras) =>
  regiaoNaLista(a, regras) || regiaoNaLista(b, regras) ? regras.minHoras * 60 : MARGEM_CIDADE_MIN;

const conflitoDeHorario = (novo, agenda, regras) => {
  const jn = janelaDoServico(novo, regras);
  if (!jn) return { conflito: true };
  for (const o of agenda) {
    const jo = janelaDoServico(o, regras);
    if (!jo) continue;
    const intervalo = jn[0] >= jo[1] ? jn[0] - jo[1] : jo[0] >= jn[1] ? jo[0] - jn[1] : -1;
    if (intervalo < folgaExigida(novo, o, regras)) return { conflito: true, com: o, intervalo };
  }
  return { conflito: false };
};

const noVeiculo = (s, v) => ({
  ...s,
  veiculo: v.veiculo,
  veiculoKey: v.veiculoKey,
  veiculoId: v.veiculoId,
  placa: v.placa,
  motorista: v.motorista,
});

// custo (pela tabela) de todos os serviços dos veículos envolvidos
const custoDosVeiculos = (servicos, ctx) => {
  const pares = detectarCasados(servicos, ctx.config.casado);
  let total = 0;
  for (const s of servicos) {
    const l = calcularLinha(s, {}, { ...ctx, pares });
    if (l.valorFornecedor === null) return null;
    total += l.valorFornecedor;
  }
  return Math.round(total * 100) / 100;
};

// Para cada IN/OUT da região do casado que está sozinho, procura outro
// veículo DA MESMA CATEGORIA (carro com carro, van com van… — a categoria
// foi escolhida pela operação pelo grupo e pela bagagem, e a tarifa muda
// com ela; trocar van por carro não faz sentido) que tenha o par (OUT depois / IN antes, dentro do intervalo do
// casado), que comporte o grupo e que esteja livre no horário (margem
// mínima com os outros serviços dele). Prefere TROCAR — o veículo de
// origem recebe um serviço do outro, para nenhum fornecedor ficar sem — e,
// se não houver troca possível, sugere MOVER. A economia é calculada pela
// tabela, refazendo o custo dos dois veículos antes e depois.
export const recomendarTrocas = (servicos = [], ctx = {}) => {
  const config = ctx.config || normalizarConfigCustos({});
  const regras = config.casado;
  if (!regras.ativo || !regras.regioes.length) return [];
  const contexto = { ...ctx, config, apoios: ctx.apoios || detectarApoios(servicos) };
  const paresBase = detectarCasados(servicos, regras);
  const linhas = servicos.map((s) => calcularLinha(s, {}, { ...contexto, pares: paresBase }));
  const porChave = new Map(linhas.map((l) => [l.chave, l]));

  const veiculos = new Map();
  linhas.forEach((l) => {
    if (!veiculos.has(l.veiculoKey)) {
      veiculos.set(l.veiculoKey, {
        veiculoKey: l.veiculoKey,
        veiculo: l.veiculo,
        veiculoId: l.veiculoId,
        placa: l.placa,
        motorista: l.motorista,
        fornecedor: l.fornecedor,
        categoria: l.categoria,
        servicos: [],
      });
    }
    veiculos.get(l.veiculoKey).servicos.push(servicos.find((s) => s.chave === l.chave));
  });

  const dentroDoCasado = (inS, outS) => {
    const d = horaEmMinutos(outS.hora) - horaEmMinutos(inS.hora);
    return d >= regras.minHoras * 60 && d <= regras.maxHoras * 60 ? d : null;
  };
  const transferSolto = (l) =>
    (l.tipo === "IN" || l.tipo === "OUT") && !l.casado && !l.apoio && horaEmMinutos(l.hora) !== null && regiaoNaLista(l, regras);
  const cabe = (pax, categoria) => !!categoria && pax <= (CAPACIDADE_CATEGORIA[categoria] || 0);

  const sugestoes = [];

  linhas.filter(transferSolto).forEach((x) => {
    const A = veiculos.get(x.veiculoKey);
    const sx = servicos.find((s) => s.chave === x.chave);
    let melhor = null;
    // sem categoria conhecida não dá para garantir uma troca equivalente
    if (!A.categoria) return;

    veiculos.forEach((B) => {
      if (B.veiculoKey === A.veiculoKey) return;
      // só entre veículos da mesma categoria (e que levem o grupo)
      if (B.categoria !== A.categoria || !cabe(x.pax, B.categoria)) return;
      const parceiros = B.servicos
        .map((s) => porChave.get(s.chave))
        .filter((p) => transferSolto(p) && p.tipo !== x.tipo)
        .map((p) => ({ p, intervalo: x.tipo === "OUT" ? dentroDoCasado(p, x) : dentroDoCasado(x, p) }))
        .filter((c) => c.intervalo !== null)
        .sort((a, b) => a.intervalo - b.intervalo);
      if (!parceiros.length) return;
      const { p: par, intervalo } = parceiros[0];

      const antes = custoDosVeiculos([...A.servicos, ...B.servicos], contexto);
      if (antes === null) return;
      const semX = A.servicos.filter((s) => s.chave !== x.chave);

      // trocar: X vai para B e um serviço Y de B vem para A
      B.servicos.forEach((sy) => {
        const y = porChave.get(sy.chave);
        if (!y || y.chave === par.chave || y.casado || y.apoio || y.tipo === "PASSEIO") return;
        if (!cabe(y.pax, A.categoria)) return;
        const bSemY = B.servicos.filter((s) => s.chave !== y.chave);
        if (conflitoDeHorario(sx, bSemY, regras).conflito) return;
        if (conflitoDeHorario(sy, semX, regras).conflito) return;
        const depois = custoDosVeiculos([...semX, noVeiculo(sy, A), ...bSemY, noVeiculo(sx, B)], contexto);
        if (depois === null) return;
        const economia = Math.round((antes - depois) * 100) / 100;
        if (economia <= 0) return;
        if (!melhor || economia > melhor.economia || (economia === melhor.economia && melhor.tipo === "mover")) {
          melhor = { tipo: "troca", x, y, par, de: A, para: B, antes, depois, economia, intervalo };
        }
      });

      // mover: X vai para B (A fica com um serviço a menos)
      if (!conflitoDeHorario(sx, B.servicos, regras).conflito) {
        const depois = custoDosVeiculos([...semX, ...B.servicos, noVeiculo(sx, B)], contexto);
        if (depois !== null) {
          const economia = Math.round((antes - depois) * 100) / 100;
          if (economia > 0 && (!melhor || (melhor.tipo === "mover" && economia > melhor.economia))) {
            melhor = { tipo: "mover", x, y: null, par, de: A, para: B, antes, depois, economia, intervalo };
          }
        }
      }
    });

    if (melhor) sugestoes.push(melhor);
  });

  // cada serviço entra numa sugestão só (a de maior economia ganha)
  const usados = new Set();
  return sugestoes
    .sort((a, b) => Number(a.tipo === "mover") - Number(b.tipo === "mover") || b.economia - a.economia)
    .filter((r) => {
      const chaves = [r.x.chave, r.par.chave, r.y?.chave].filter(Boolean);
      if (chaves.some((c) => usados.has(c))) return false;
      chaves.forEach((c) => usados.add(c));
      return true;
    })
    .map((r) => ({
      ...r,
      chave: `${r.tipo}|${r.x.chave}|${r.para.veiculoKey}`,
      pct: r.antes ? Math.round((r.economia / r.antes) * 1000) / 10 : 0,
      de: { veiculoKey: r.de.veiculoKey, veiculo: r.de.veiculo, fornecedor: r.de.fornecedor, categoria: r.de.categoria },
      para: { veiculoKey: r.para.veiculoKey, veiculo: r.para.veiculo, fornecedor: r.para.fornecedor, categoria: r.para.categoria },
    }))
    .sort((a, b) => b.economia - a.economia);
};

// Texto curto para mandar ao operacional/fornecedor
export const textoDaRecomendacao = (r) => {
  const sv = (l) => `${NOME_TIPO[l.tipo]} ${l.hora} ${descreverServico(l)}`;
  const linhas = [
    r.tipo === "troca"
      ? `Trocar: ${sv(r.x)} sai de ${r.de.veiculo} e vai para ${r.para.veiculo}; em troca ${sv(r.y)} vai para ${r.de.veiculo}.`
      : `Mover: ${sv(r.x)} de ${r.de.veiculo} para ${r.para.veiculo}.`,
    `Fica casado com ${sv(r.par)} (${r.para.veiculo}).`,
    `Custo dos dois veículos: ${formatarReais(r.antes)} → ${formatarReais(r.depois)} (economia ${formatarReais(r.economia)}, ${String(r.pct).replace(".", ",")}%).`,
  ];
  return linhas.join("\n");
};

/* ---------------- retrato salvo e resumo ---------------- */

// O que fica gravado em custos_dia/{data}.linhas[chave] (além de `manual`):
// os dados do serviço e o resultado do cálculo — os relatórios leem só isso.
export const CAMPOS_RETRATO = [
  "chave", "escalaId", "tipo", "data", "hora", "veiculo", "veiculoId", "veiculoKey", "placa",
  "motorista", "guiaPhoenix", "passeio", "regioes", "regioesDestino", "hoteis", "reservas", "pax", "idiomas",
  "tarifaFixaId", "tipoPhoenix",
];

export const CAMPOS_CALCULO = [
  "fornecedor", "categoria", "casado", "parCasado", "apoio", "trechos", "valorServico", "noShow", "noShowPct",
  "economiaNoShow", "guiaModalidade", "guiaAdicional", "cobranca", "quantidade", "tarifaUnitaria", "tarifaCheia", "tarifaCasada", "valorFornecedor",
  "origemValor", "economia", "motivoEconomia", "acimaDaTabela", "guiaNome", "guiaReferencia",
  "guiaValor", "guiaStatus", "total",
];

export const retratoDaLinha = (linha) => {
  const r = {};
  CAMPOS_RETRATO.forEach((c) => {
    r[c] = linha[c] ?? (Array.isArray(linha[c]) ? [] : null);
  });
  const calc = {};
  CAMPOS_CALCULO.forEach((c) => {
    calc[c] = linha[c] === undefined ? null : linha[c];
  });
  calc.pendencias = linha.pendencias || [];
  return { ...r, calc };
};

// serviço a partir do retrato salvo (quando o Phoenix não responde)
export const servicoDoRetrato = (salvo = {}) => {
  const s = {};
  CAMPOS_RETRATO.forEach((c) => {
    s[c] = salvo[c] ?? (["regioes", "regioesDestino", "hoteis"].includes(c) ? [] : "");
  });
  s.reservas = Number(salvo.reservas || 0);
  s.pax = Number(salvo.pax || 0);
  s.idiomas = salvo.idiomas && typeof salvo.idiomas === "object" ? salvo.idiomas : {};
  return s;
};

// compara ignorando a ordem das chaves (o Firestore não guarda a ordem)
const estavel = (v) => {
  if (Array.isArray(v)) return v.map(estavel);
  if (v && typeof v === "object") {
    return Object.keys(v)
      .sort()
      .reduce((acc, k) => {
        acc[k] = estavel(v[k]);
        return acc;
      }, {});
  }
  return v === undefined ? null : v;
};
const iguais = (a, b) => JSON.stringify(estavel(a)) === JSON.stringify(estavel(b));

// Linhas cujo retrato mudou desde a última gravação (só essas são escritas)
export const linhasParaGravar = (linhas = [], salvas = {}) => {
  const mudou = {};
  linhas.forEach((l) => {
    if (l.removido) return;
    const novo = retratoDaLinha(l);
    const antigo = salvas[l.chave] || {};
    if (!iguais(novo, pick(antigo, Object.keys(novo)))) mudou[l.chave] = { ...novo, removido: false };
    else if (antigo.removido) mudou[l.chave] = { ...novo, removido: false };
  });
  return mudou;
};

function pick(obj, chaves) {
  const r = {};
  chaves.forEach((k) => {
    if (k in obj) r[k] = obj[k];
  });
  return r;
}

const somar = (mapa, chave, campos) => {
  if (!mapa[chave]) mapa[chave] = { chave, servicos: 0, valor: 0, economia: 0, casados: 0, pax: 0, pendentes: 0 };
  const g = mapa[chave];
  Object.entries(campos).forEach(([k, v]) => {
    g[k] = (g[k] || 0) + (v || 0);
  });
};

const ordenarPorValor = (mapa) => Object.values(mapa).sort((a, b) => b.valor - a.valor || b.servicos - a.servicos);

// Resumo de um período a partir dos documentos custos_dia (relatórios)
// docs: [{data, status, linhas}] — dias sem documento entram em `diasSemLancamento`
export const resumirPeriodo = (docs = [], datas = []) => {
  const porData = new Map(docs.filter(Boolean).map((d) => [d.data, d]));
  const total = {
    servicos: 0, pax: 0, fornecedores: 0, guias: 0, guiasAConfirmar: 0, guiasAConfirmarRef: 0,
    economia: 0, economiaCasado: 0, economiaNegociada: 0, acimaDaTabela: 0, acimaQtd: 0,
    casados: 0, semValor: 0, semFornecedor: 0, total: 0,
    noShowQtd: 0, noShowInQtd: 0, noShowPago: 0, noShowEconomia: 0,
    guiaMiQtd: 0, guiaMiValor: 0, guiaIdiomaQtd: 0, guiaIdiomaValor: 0, guiaAdicional: 0,
  };
  const porFornecedor = {};
  const porTipo = {};
  const porCategoria = {};
  const porRegiao = {};
  const porGuia = {};
  const porParceiro = {};
  const porDia = [];
  const diasSemLancamento = [];
  const linhasDetalhe = [];

  datas.forEach((data) => {
    const d = porData.get(data);
    if (!d) {
      diasSemLancamento.push(data);
      porDia.push({ data, total: 0, fornecedores: 0, guias: 0, servicos: 0, status: "sem-lancamento", pendencias: 0 });
      return;
    }
    const dia = { data, total: 0, fornecedores: 0, guias: 0, servicos: 0, status: d.status || "rascunho", pendencias: 0 };
    Object.values(d.linhas || {}).forEach((l) => {
      if (!l || l.removido || !l.calc) return;
      const c = l.calc;
      const vf = Number(c.valorFornecedor || 0);
      const vg = Number(c.guiaValor || 0);
      total.servicos += 1;
      total.pax += Number(l.pax || 0);
      total.fornecedores += vf;
      total.guias += vg;
      total.total += vf + vg;
      total.economia += Number(c.economia || 0);
      if (c.motivoEconomia === "casado") total.economiaCasado += Number(c.economia || 0);
      if (c.motivoEconomia === "negociado") total.economiaNegociada += Number(c.economia || 0);
      if (c.acimaDaTabela) {
        total.acimaDaTabela += Number(c.acimaDaTabela);
        total.acimaQtd += 1;
      }
      if (c.casado) total.casados += 1;
      if (c.noShow) {
        total.noShowQtd += 1;
        if (l.tipo === "IN") total.noShowInQtd += 1;
        total.noShowPago += vf;
        total.noShowEconomia += Number(c.economiaNoShow || 0);
      }
      if (c.guiaNome && c.guiaModalidade === "mi") {
        total.guiaMiQtd += 1;
        total.guiaMiValor += vg;
      }
      if (c.guiaNome && c.guiaModalidade === "idioma") {
        total.guiaIdiomaQtd += 1;
        total.guiaIdiomaValor += vg;
        // adicional só do que já foi lançado (os "a confirmar" ainda não têm valor pago)
        if (c.guiaValor !== null && c.guiaValor !== undefined) total.guiaAdicional += Number(c.guiaAdicional || 0);
      }
      if (c.valorFornecedor === null || c.valorFornecedor === undefined) total.semValor += 1;
      if (!c.fornecedor) total.semFornecedor += 1;
      if (c.guiaStatus === "a-confirmar") {
        total.guiasAConfirmar += 1;
        total.guiasAConfirmarRef += Number(c.guiaReferencia || 0);
      }
      const pend = (c.pendencias || []).length ? 1 : 0;
      dia.pendencias += pend;
      dia.total += vf + vg;
      dia.fornecedores += vf;
      dia.guias += vg;
      dia.servicos += 1;

      const base = {
        servicos: 1,
        valor: vf,
        economia: Number(c.economia || 0),
        casados: c.casado ? 1 : 0,
        pax: Number(l.pax || 0),
        reservas: Number(l.reservas || 0),
        porPax: c.cobranca === "pax" || c.cobranca === "reserva" ? 1 : 0,
      };
      somar(porFornecedor, c.fornecedor || "Sem fornecedor", { ...base, pendentes: c.valorFornecedor == null ? 1 : 0 });
      somar(porTipo, l.tipo || "?", base);
      somar(porCategoria, c.categoria || "", base);
      (l.tipo === "PASSEIO" ? [l.passeio || "Passeio"] : (l.regioes?.length ? [l.regioes[0]] : ["Sem região"])).forEach((reg) =>
        somar(porRegiao, reg, base),
      );
      if (l.tipo === "SERVICO") {
        somar(porParceiro, c.fornecedor || "Sem fornecedor", base);
      }
      if (c.guiaNome) {
        somar(porGuia, c.guiaNome, {
          servicos: 1,
          valor: vg,
          pendentes: c.guiaStatus === "a-confirmar" ? 1 : 0,
          pax: Number(l.pax || 0),
        });
      }
      linhasDetalhe.push({ ...l, calc: c });
    });
    porDia.push(dia);
  });

  const arred = (v) => Math.round(v * 100) / 100;
  Object.keys(total).forEach((k) => {
    total[k] = arred(total[k]);
  });
  total.custoPorPax = total.pax ? arred(total.total / total.pax) : 0;
  total.diasComLancamento = datas.length - diasSemLancamento.length;
  total.diasConferidos = porDia.filter((d) => d.status === "conferido").length;

  return {
    total,
    porFornecedor: ordenarPorValor(porFornecedor),
    porTipo: ordenarPorValor(porTipo),
    porCategoria: ordenarPorValor(porCategoria),
    porRegiao: ordenarPorValor(porRegiao),
    porGuia: ordenarPorValor(porGuia),
    porParceiro: ordenarPorValor(porParceiro),
    porDia,
    diasSemLancamento,
    linhas: linhasDetalhe,
  };
};

/* ---------------- CSV ---------------- */

const csvCelula = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csvNumero = (v) => (v === null || v === undefined || v === "" ? "" : String(Number(v).toFixed(2)).replace(".", ","));

export const linhasParaCsv = (linhas = []) => {
  const cab = [
    "Data", "Hora", "Tipo", "Serviço", "Região", "Veículo", "Placa", "Fornecedor", "Categoria", "Pax",
    "Casado", "Apoio (trechos)", "No-show", "Tarifa cheia", "Valor do serviço", "Valor fornecedor", "Origem do valor", "Economia", "Guia", "Valor guia",
    "Situação guia", "Modalidade guia", "Total",
  ];
  const ORIGEM = { lancado: "Lançado", tarifa: "Tabela", "tarifa-casada": "Tabela (casado)", "sem-tarifa": "Sem tarifa" };
  const GUIA = { lancado: "Lançado", "a-confirmar": "A confirmar", verificar: "Verificar", "sem-guia": "" };
  const corpo = linhas.map((l) => {
    const c = l.calc || l;
    return [
      l.data, l.hora, NOME_TIPO[l.tipo] || l.tipo, descreverServico(l), descreverRegiao(l), l.veiculo, l.placa,
      c.fornecedor, NOME_CATEGORIA[c.categoria] || "", l.pax, c.casado ? "Sim" : "", c.apoio ? c.trechos || 2 : "",
      c.noShow ? `Sim (${c.noShowPct}%)` : "", csvNumero(c.tarifaCheia), csvNumero(c.valorServico ?? c.valorFornecedor), csvNumero(c.valorFornecedor), ORIGEM[c.origemValor] || "", csvNumero(c.economia),
      c.guiaNome, csvNumero(c.guiaValor), GUIA[c.guiaStatus] || "", c.guiaNome ? NOME_MODALIDADE[c.guiaModalidade] || "" : "", csvNumero(c.total),
    ].map(csvCelula).join(";");
  });
  return `﻿${[cab.join(";"), ...corpo].join("\n")}`;
};
