// custoFrota.js
//
// CUSTO DE FROTA PRÓPRIA (Custos e alterações → Frota própria)
//
// Cada base escolhe como paga os veículos:
//   "terceirizado" → só o tarifário (o que se paga ao fornecedor) — Salvador
//   "frota"        → todos os veículos são da base: custo pela frota
//   "misto"        → frota + terceirizado: veículo cadastrado na frota usa o
//                    custo da frota; os outros, o tarifário
//
// Custo de um serviço com veículo da frota:
//   km do serviço   (tabela de distâncias por região, ou o padrão)
//   combustível     = km ÷ consumo do veículo (km/L) × preço do litro
//   desgaste        = km × custo por km do veículo (pneu, manutenção, óleo…)
//   fixo            = custo fixo por serviço do veículo (motorista, diária…)
//   total           = fixo + combustível + desgaste
//
// Fica em settings/custos[__base].frota.

const num = (v) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const semAcento = (t) =>
  String(t || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

export const MODELOS_CUSTO = [
  { id: "terceirizado", nome: "Só terceirizado", dica: "Paga fornecedores: o custo vem do tarifário.", icone: "building" },
  { id: "misto", nome: "Frota + terceirizado", dica: "Veículo cadastrado na frota usa o custo da frota; os outros, o tarifário.", icone: "layers" },
  { id: "frota", nome: "Só frota própria", dica: "Todos os veículos são da base: o custo vem da frota.", icone: "car" },
];

export const COMBUSTIVEIS = [
  { id: "diesel", nome: "Diesel" },
  { id: "gasolina", nome: "Gasolina" },
  { id: "etanol", nome: "Etanol" },
  { id: "gnv", nome: "GNV" },
];

let seq = 0;
const novoId = () => `fr${Date.now().toString(36)}${(seq++).toString(36)}`;

export const normalizarVeiculoFrota = (v = {}) => ({
  id: String(v.id || novoId()),
  // nome como vem no Phoenix ("VAN 2668", "MICRAO 1960") — é por ele que o sistema acha o veículo
  nome: String(v.nome || "").trim(),
  placa: String(v.placa || "")
    .trim()
    .toUpperCase(),
  modelo: String(v.modelo || "").trim(),
  categoria: String(v.categoria || ""),
  combustivel: COMBUSTIVEIS.some((c) => c.id === v.combustivel) ? v.combustivel : "diesel",
  consumo: Math.max(0, num(v.consumo)), // km por litro
  custoKm: Math.max(0, num(v.custoKm)), // R$ por km (pneu, manutenção, óleo…)
  fixo: Math.max(0, num(v.fixo)), // R$ por serviço (motorista, diária rateada…)
  ativo: v.ativo !== false,
});

export const normalizarFrota = (f = {}) => ({
  modelo: MODELOS_CUSTO.some((m) => m.id === f?.modelo) ? f.modelo : "terceirizado",
  precos: Object.fromEntries(COMBUSTIVEIS.map((c) => [c.id, Math.max(0, num(f?.precos?.[c.id]))])),
  veiculos: (Array.isArray(f?.veiculos) ? f.veiculos : []).map(normalizarVeiculoFrota),
  // km rodados num serviço completo (saída da garagem até a volta), por região
  distancias: Object.fromEntries(
    Object.entries(f?.distancias && typeof f.distancias === "object" ? f.distancias : {})
      .map(([k, v]) => [semAcento(k), Math.max(0, num(v))])
      .filter(([k]) => k),
  ),
  kmPadrao: Math.max(0, num(f?.kmPadrao)),
  kmPasseio: Math.max(0, num(f?.kmPasseio)),
});

export const usaFrota = (frota) => !!frota && frota.modelo !== "terceirizado";

// o veículo do serviço está na frota? (pelo nome do Phoenix ou pela placa)
export const acharVeiculoDaFrota = (servico, frota) => {
  if (!usaFrota(frota)) return null;
  const nome = semAcento(servico?.veiculo);
  const placa = String(servico?.placa || "").toUpperCase();
  return frota.veiculos.find((v) => v.ativo && ((v.nome && semAcento(v.nome) === nome) || (v.placa && placa && v.placa === placa))) || null;
};

// km do serviço: passeio → km do passeio; os outros → distância da região
export const kmDoServico = (servico, frota) => {
  if (servico?.tipo === "PASSEIO") return frota.kmPasseio || frota.kmPadrao;
  const regs = [...(servico?.regioes || []), ...(servico?.regioesDestino || [])].map(semAcento);
  const kms = regs.map((r) => frota.distancias[r]).filter((k) => k > 0);
  return kms.length ? Math.max(...kms) : frota.kmPadrao;
};

// custo do serviço com veículo da frota (null = não é da frota)
export const custoDeFrota = (servico, frota, veiculo = acharVeiculoDaFrota(servico, frota)) => {
  if (!veiculo) return null;
  const km = kmDoServico(servico, frota);
  const preco = frota.precos[veiculo.combustivel] || 0;
  const litros = veiculo.consumo > 0 ? km / veiculo.consumo : 0;
  const combustivel = r2(litros * preco);
  const desgaste = r2(km * veiculo.custoKm);
  const fixo = r2(veiculo.fixo);
  return {
    veiculoId: veiculo.id,
    modelo: veiculo.modelo,
    km: r2(km),
    litros: r2(litros),
    combustivel,
    desgaste,
    fixo,
    total: r2(fixo + combustivel + desgaste),
    semKm: !km,
    semConsumo: !veiculo.consumo || !preco,
  };
};
