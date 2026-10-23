// auditoriaAlteracoes.js
//
// AUDITOR DE ALTERAÇÕES (Custos e alterações → Auditor). Só cálculo, sem banco.
//
// À meia-noite, o sistema guarda a PROGRAMAÇÃO do dia (os serviços do Phoenix,
// um por escala/veículo, com o custo pela tabela de tarifas). Durante o dia
// da operação, o auditor compara a programação com o Phoenix e registra
// cada alteração: serviço novo, cancelado, troca de fornecedor / veículo /
// categoria / motorista / guia, mudança de horário e pax a mais ou a menos.
//
// Custo de cada alteração = diferença da TABELA (custo depois − custo antes)
// + o que a TABELA DE CUSTOS DAS ALTERAÇÕES manda somar (100% configurável:
// valor fixo, % do serviço e valor por passageiro, por tipo de alteração).
//
// A chave do serviço é a mesma do Custo do dia (`<tipo>_<escala>`), então
// trocar o veículo dentro da mesma escala aparece como "troca de veículo", e
// não como um cancelado + um novo.

export const TIPOS_ALTERACAO = [
  { id: "novo", nome: "Serviço novo no dia", curto: "Novo", ref: "depois", dica: "escala criada depois da foto" },
  { id: "cancelado", nome: "Serviço cancelado / tirado da escala", curto: "Cancelado", ref: "antes", dica: "estava na foto e saiu" },
  { id: "fornecedor", nome: "Troca de fornecedor", curto: "Fornecedor", ref: "depois" },
  { id: "veiculo", nome: "Troca de veículo", curto: "Veículo", ref: "depois" },
  { id: "categoria", nome: "Troca de categoria (carro, van, micro…)", curto: "Categoria", ref: "depois" },
  { id: "motorista", nome: "Troca de motorista", curto: "Motorista", ref: "depois" },
  { id: "guia", nome: "Troca de guia", curto: "Guia", ref: "depois" },
  { id: "horario", nome: "Mudança de horário", curto: "Horário", ref: "depois" },
  { id: "paxMais", nome: "Passageiros a mais", curto: "Pax +", ref: "depois", porPax: true },
  { id: "paxMenos", nome: "Passageiros a menos", curto: "Pax −", ref: "depois", porPax: true },
];
export const NOME_ALTERACAO = Object.fromEntries(TIPOS_ALTERACAO.map((t) => [t.id, t.nome]));
export const CURTO_ALTERACAO = Object.fromEntries(TIPOS_ALTERACAO.map((t) => [t.id, t.curto]));

const num = (v) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const horaValida = (h) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(h || ""));

/* Configuração (settings/custos.auditoria):
   { contarTabela: true,
     regras: { <tipo>: { fixo, pct, porPax, ativa } } } */
export const normalizarAuditoria = (a = {}) => ({
  // somar a diferença da tabela de tarifas (custo depois − custo antes)
  contarTabela: a?.contarTabela !== false,
  regras: Object.fromEntries(
    TIPOS_ALTERACAO.map((t) => {
      const r = a?.regras?.[t.id] || {};
      return [t.id, { fixo: Math.max(0, num(r.fixo)), pct: Math.max(0, Math.min(500, num(r.pct))), porPax: Math.max(0, num(r.porPax)), ativa: r.ativa !== false }];
    }),
  ),
});

/* O que fica guardado de cada serviço na foto (compacto). */
export const fotoDaLinha = (l) => ({
  chave: l.chave,
  tipo: l.tipo || "",
  hora: l.hora || "",
  servicoNome: l.servicoNome || l.passeio || "",
  veiculo: l.veiculo || "",
  veiculoKey: l.veiculoKey || "",
  fornecedor: l.fornecedor || "",
  categoria: l.categoria || "",
  motorista: l.motorista || "",
  guia: l.guiaNome || l.guiaPhoenix || "",
  pax: Number(l.pax) || 0,
  reservas: Number(l.reservas) || 0,
  regioes: Array.isArray(l.regioes) ? l.regioes.slice(0, 4) : [],
  valorFornecedor: Number(l.valorFornecedor) || 0,
  guiaValor: Number(l.guiaValor) || 0,
  total: Number(l.total) || 0,
});

const iguais = (a, b) => String(a || "").trim().toUpperCase() === String(b || "").trim().toUpperCase();
const minutos = (h) => (horaValida(h) ? Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5)) : null);

// as mudanças entre a foto (antes) e agora (depois) de um mesmo serviço
const mudancasDoServico = (antes, depois) => {
  const m = [];
  if (!antes && depois) return [{ tipo: "novo", para: depois.veiculo }];
  if (antes && !depois) return [{ tipo: "cancelado", de: antes.veiculo }];
  if (antes.fornecedor && depois.fornecedor && !iguais(antes.fornecedor, depois.fornecedor)) m.push({ tipo: "fornecedor", de: antes.fornecedor, para: depois.fornecedor });
  if (!iguais(antes.veiculo, depois.veiculo)) m.push({ tipo: "veiculo", de: antes.veiculo, para: depois.veiculo });
  if (antes.categoria && depois.categoria && antes.categoria !== depois.categoria) m.push({ tipo: "categoria", de: antes.categoria, para: depois.categoria });
  if (antes.motorista && !iguais(antes.motorista, depois.motorista)) m.push({ tipo: "motorista", de: antes.motorista, para: depois.motorista || "—" });
  if ((antes.guia || depois.guia) && !iguais(antes.guia, depois.guia)) m.push({ tipo: "guia", de: antes.guia || "sem guia", para: depois.guia || "sem guia" });
  const ma = minutos(antes.hora);
  const md = minutos(depois.hora);
  if (ma !== null && md !== null && ma !== md) m.push({ tipo: "horario", de: antes.hora, para: depois.hora, qtd: md - ma });
  if (depois.pax > antes.pax) m.push({ tipo: "paxMais", de: antes.pax, para: depois.pax, qtd: depois.pax - antes.pax });
  if (depois.pax < antes.pax) m.push({ tipo: "paxMenos", de: antes.pax, para: depois.pax, qtd: antes.pax - depois.pax });
  return m;
};

// custo da tabela de alterações para uma mudança
export const custoDaRegra = (m, antes, depois, regras) => {
  const r = regras?.[m.tipo];
  if (!r || r.ativa === false) return 0;
  const tipo = TIPOS_ALTERACAO.find((t) => t.id === m.tipo);
  const ref = tipo?.ref === "antes" ? antes?.total || 0 : depois?.total || antes?.total || 0;
  const pax = tipo?.porPax ? Math.abs(Number(m.qtd) || 0) : 0;
  return Math.round((r.fixo + (ref * r.pct) / 100 + r.porPax * pax) * 100) / 100;
};

/* Compara a foto com o dia.
   foto: { linhas: { chave: foto } }; atuais: [linha calculada] (Custo do dia)
   Devolve { alteracoes: [...], totais }. Cada alteração:
   { id, chave, hora, tipoServico, servico, antes, depois, mudancas: [{ tipo, de, para, qtd, custo }],
     deltaTabela, custoRegras, impacto } */
export const compararComFoto = (foto, atuais = [], config = normalizarAuditoria()) => {
  const base = foto?.linhas || {};
  const agora = new Map(atuais.map((l) => [l.chave, fotoDaLinha(l)]));
  const chaves = [...new Set([...Object.keys(base), ...agora.keys()])];
  const alteracoes = [];
  chaves.forEach((chave) => {
    const antes = base[chave] || null;
    const depois = agora.get(chave) || null;
    const mudancas = mudancasDoServico(antes, depois);
    if (!mudancas.length) return;
    mudancas.forEach((m) => {
      m.custo = custoDaRegra(m, antes, depois, config.regras);
    });
    const deltaTabela = config.contarTabela ? Math.round(((depois?.total || 0) - (antes?.total || 0)) * 100) / 100 : 0;
    const custoRegras = Math.round(mudancas.reduce((s, m) => s + m.custo, 0) * 100) / 100;
    const ref = depois || antes;
    alteracoes.push({
      id: `${chave}|${mudancas.map((m) => `${m.tipo}:${m.para ?? ""}`).join(",")}`,
      chave,
      hora: ref.hora || "",
      tipoServico: ref.tipo || "",
      servico: ref.servicoNome || "",
      antes,
      depois,
      mudancas,
      deltaTabela,
      custoRegras,
      impacto: Math.round((deltaTabela + custoRegras) * 100) / 100,
    });
  });
  alteracoes.sort((a, b) => `${a.hora || "99:99"}${a.chave}`.localeCompare(`${b.hora || "99:99"}${b.chave}`));
  const totalFoto = Object.values(base).reduce((s, l) => s + (Number(l.total) || 0), 0);
  const totalAgora = [...agora.values()].reduce((s, l) => s + (Number(l.total) || 0), 0);
  const porTipo = {};
  alteracoes.forEach((a) =>
    a.mudancas.forEach((m) => {
      porTipo[m.tipo] = porTipo[m.tipo] || { n: 0, custo: 0 };
      porTipo[m.tipo].n += 1;
      porTipo[m.tipo].custo += m.custo;
    }),
  );
  const deltaTabela = alteracoes.reduce((s, a) => s + a.deltaTabela, 0);
  const custoRegras = alteracoes.reduce((s, a) => s + a.custoRegras, 0);
  return {
    alteracoes,
    totais: {
      servicosFoto: Object.keys(base).length,
      servicosAgora: agora.size,
      totalFoto: Math.round(totalFoto * 100) / 100,
      totalAgora: Math.round(totalAgora * 100) / 100,
      deltaTabela: Math.round(deltaTabela * 100) / 100,
      custoRegras: Math.round(custoRegras * 100) / 100,
      impacto: Math.round((deltaTabela + custoRegras) * 100) / 100,
      aumentos: alteracoes.filter((a) => a.impacto > 0).reduce((s, a) => s + a.impacto, 0),
      reducoes: alteracoes.filter((a) => a.impacto < 0).reduce((s, a) => s + a.impacto, 0),
      porTipo,
    },
  };
};
