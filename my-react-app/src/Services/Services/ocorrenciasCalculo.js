// =========================================================
//  OCORRÊNCIAS DE FORNECEDORES — regras puras (sem Firestore)
//  Tudo que a tela e o relatório precisam: categorias, quem foi o
//  responsável, impactos, o texto pronto para mandar ao fornecedor e
//  os números do período.
// =========================================================
import { NOME_TIPO, chaveTexto } from "./custosCalculo";

export const CATEGORIAS_OCORRENCIA = [
  { valor: "atraso", nome: "Atraso", icone: "clock", pedeMinutos: true },
  { valor: "nao-compareceu", nome: "Não compareceu", icone: "x" },
  { valor: "veiculo-trocado", nome: "Veículo trocado sem aviso", icone: "car" },
  {
    valor: "condicoes-veiculo",
    nome: "Veículo em más condições",
    icone: "snowflake",
  },
  { valor: "conduta", nome: "Conduta do motorista", icone: "user" },
  { valor: "rota", nome: "Rota ou endereço errado", icone: "navigation" },
  { valor: "comunicacao", nome: "Sem resposta / comunicação", icone: "phone" },
  { valor: "reclamacao", nome: "Reclamação do passageiro", icone: "message" },
  { valor: "elogio", nome: "Elogio", icone: "star", positiva: true },
  { valor: "outro", nome: "Outro", icone: "info" },
];
export const NOME_CATEGORIA_OCORRENCIA = Object.fromEntries(
  CATEGORIAS_OCORRENCIA.map((c) => [c.valor, c.nome]),
);
export const CATEGORIA_OCORRENCIA = Object.fromEntries(
  CATEGORIAS_OCORRENCIA.map((c) => [c.valor, c]),
);

export const RESPONSAVEIS = [
  {
    valor: "fornecedor",
    nome: "Fornecedor",
    descricao: "falha do próprio fornecedor ou motorista",
  },
  {
    valor: "passageiro",
    nome: "Passageiro",
    descricao: "atraso ou erro do passageiro",
  },
  {
    valor: "operacao",
    nome: "Nossa operação",
    descricao: "escala, informação ou comunicação nossa",
  },
  {
    valor: "externo",
    nome: "Fator externo",
    descricao: "trânsito, voo, clima, bloqueio",
  },
];
export const NOME_RESPONSAVEL = Object.fromEntries(
  RESPONSAVEIS.map((r) => [r.valor, r.nome]),
);

export const IMPACTOS = [
  { valor: "contato-pax", nome: "Precisamos contatar o passageiro" },
  { valor: "pax-esperou", nome: "Passageiro ficou esperando" },
  { valor: "outro-veiculo", nome: "Precisamos enviar outro veículo" },
  { valor: "perdeu", nome: "Passageiro perdeu voo ou passeio" },
  { valor: "custo-extra", nome: "Gerou custo extra" },
  { valor: "reclamacao-formal", nome: "Virou reclamação formal" },
];
export const NOME_IMPACTO = Object.fromEntries(
  IMPACTOS.map((i) => [i.valor, i.nome]),
);

export const GRAVIDADES = [
  { valor: "leve", nome: "Leve", peso: 1 },
  { valor: "media", nome: "Média", peso: 3 },
  { valor: "grave", nome: "Grave", peso: 5 },
];
export const NOME_GRAVIDADE = Object.fromEntries(
  GRAVIDADES.map((g) => [g.valor, g.nome]),
);
const PESO_GRAVIDADE = Object.fromEntries(
  GRAVIDADES.map((g) => [g.valor, g.peso]),
);

export const STATUS_OCORRENCIA = [
  { valor: "aberta", nome: "Em aberto" },
  { valor: "resolvida", nome: "Resolvida" },
];

// chave estável do fornecedor (mesma grafia com/sem acento e caixa)
export const chaveFornecedor = (nome = "") =>
  chaveTexto(nome).replace(/ /g, "-") || "sem-fornecedor";

export const ehPositiva = (o) => !!CATEGORIA_OCORRENCIA[o?.categoria]?.positiva;

// Conta contra o fornecedor: só o que foi falha dele (elogio nunca conta)
export const contaContraFornecedor = (o) =>
  !ehPositiva(o) && o?.responsavel === "fornecedor";

export const pesoDaOcorrencia = (o) =>
  contaContraFornecedor(o) ? PESO_GRAVIDADE[o.gravidade] || 1 : 0;

const numeroOuNulo = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

// Formulário → documento (só os campos conhecidos, números limpos)
export const normalizarOcorrencia = (f = {}) => {
  const categoria = CATEGORIA_OCORRENCIA[f.categoria] ? f.categoria : "outro";
  const positiva = !!CATEGORIA_OCORRENCIA[categoria].positiva;
  const atrasoMin = CATEGORIA_OCORRENCIA[categoria].pedeMinutos
    ? numeroOuNulo(f.atrasoMin)
    : null;
  const impactos = positiva
    ? []
    : (Array.isArray(f.impactos) ? f.impactos : []).filter(
        (i) => NOME_IMPACTO[i],
      );
  const custoExtra = impactos.includes("custo-extra")
    ? numeroOuNulo(f.custoExtra)
    : null;
  const fornecedor = String(f.fornecedor || "").trim();
  return {
    data: String(f.data || ""),
    hora: String(f.hora || ""),
    tipoServico: NOME_TIPO[f.tipoServico] ? f.tipoServico : "",
    servicoDescricao: String(f.servicoDescricao || "").trim(),
    servicoChave: String(f.servicoChave || ""),
    escalaId: String(f.escalaId || ""),
    fornecedor,
    fornecedorKey: chaveFornecedor(fornecedor),
    veiculo: String(f.veiculo || "").trim(),
    veiculoKey: String(f.veiculoKey || ""),
    placa: String(f.placa || "")
      .trim()
      .toUpperCase(),
    motorista: String(f.motorista || "").trim(),
    guia: String(f.guia || "").trim(),
    pax: numeroOuNulo(f.pax),
    categoria,
    responsavel: positiva
      ? "fornecedor"
      : NOME_RESPONSAVEL[f.responsavel]
        ? f.responsavel
        : "fornecedor",
    gravidade: positiva
      ? ""
      : NOME_GRAVIDADE[f.gravidade]
        ? f.gravidade
        : "leve",
    atrasoMin: atrasoMin !== null ? Math.max(0, Math.round(atrasoMin)) : null,
    impactos,
    custoExtra,
    descricao: String(f.descricao || "").trim(),
    status: positiva
      ? "resolvida"
      : f.status === "resolvida"
        ? "resolvida"
        : "aberta",
    resolucao: String(f.resolucao || "").trim(),
  };
};

// o que falta para gravar (vazio = pode salvar)
export const validarOcorrencia = (o) => {
  const faltas = [];
  if (!o.data) faltas.push("a data");
  if (!o.fornecedor) faltas.push("o fornecedor");
  if (CATEGORIA_OCORRENCIA[o.categoria]?.pedeMinutos && o.atrasoMin === null)
    faltas.push("quantos minutos de atraso");
  if (o.categoria === "outro" && !o.descricao) faltas.push("a descrição");
  return faltas;
};

/* ---------------- texto pronto ---------------- */

const dataBr = (iso = "") => {
  const [a, m, d] = String(iso).split("-");
  return a ? `${d}/${m}` : "";
};

const TIPO_NO_TEXTO = {
  IN: "IN",
  OUT: "OUT",
  TRF: "transfer",
  PASSEIO: "passeio",
  APOIO: "apoio",
  SERVICO: "serviço",
};

const nomeDoServico = (o) => {
  const quando = o.hora ? ` das ${o.hora}` : "";
  const desc = o.servicoDescricao ? ` (${o.servicoDescricao})` : "";
  return `${TIPO_NO_TEXTO[o.tipoServico] || "serviço"}${quando}${desc}`;
};

const OQUE = {
  atraso: (o) => `chegou ${o.atrasoMin ? `${o.atrasoMin} min ` : ""}atrasado`,
  "nao-compareceu": () => "não compareceu ao serviço",
  "veiculo-trocado": () => "foi trocado sem aviso prévio",
  "condicoes-veiculo": () => "estava em más condições",
  conduta: () => "teve problema de conduta do motorista",
  rota: () => "seguiu rota ou endereço errado",
  comunicacao: () => "não respondeu ou teve falha de comunicação",
  reclamacao: () => "gerou reclamação do passageiro",
  elogio: () => "recebeu elogio do passageiro",
  outro: () => "teve uma ocorrência",
};

const RESPONSABILIDADE_TEXTO = {
  fornecedor: "responsabilidade do fornecedor",
  passageiro: "motivo do passageiro",
  operacao: "falha da nossa operação",
  externo: "fator externo (trânsito, voo, clima)",
};

const IMPACTO_TEXTO = {
  "contato-pax": "a operação precisou contatar o passageiro",
  "pax-esperou": "o passageiro ficou esperando",
  "outro-veiculo": "foi preciso enviar outro veículo",
  perdeu: "o passageiro perdeu o voo ou o passeio",
  "custo-extra": "houve custo extra",
  "reclamacao-formal": "virou reclamação formal",
};

const juntarLista = (itens) =>
  itens.length <= 1
    ? itens.join("")
    : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;

const reais = (v) =>
  Number(v).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });

// "Em 12/10, no IN das 14:00 (Aeroporto → Hotel X), o veículo RICARDO 2
//  (fornecedor RICARDO, motorista Ricardo) chegou 25 min atrasado por falha
//  do fornecedor. A operação precisou contatar o passageiro."
export const textoDaOcorrencia = (o) => {
  const quem = [
    o.fornecedor && `fornecedor ${o.fornecedor}`,
    o.motorista && `motorista ${o.motorista}`,
  ]
    .filter(Boolean)
    .join(", ");
  const sujeito = o.veiculo
    ? `o veículo ${o.veiculo}${quem ? ` (${quem})` : ""}`
    : quem
      ? `o ${quem}`
      : "o fornecedor";
  const verbo = (OQUE[o.categoria] || OQUE.outro)(o);
  const positiva = CATEGORIA_OCORRENCIA[o.categoria]?.positiva;
  const resp =
    positiva || !RESPONSABILIDADE_TEXTO[o.responsavel]
      ? ""
      : ` — ${RESPONSABILIDADE_TEXTO[o.responsavel]}`;
  let texto = `Em ${dataBr(o.data)}, no ${nomeDoServico(o)}, ${sujeito} ${verbo}${resp}.`;
  const impactos = (o.impactos || [])
    .map((i) => IMPACTO_TEXTO[i])
    .filter(Boolean);
  if (impactos.length) {
    const frase = juntarLista(impactos);
    texto += ` ${frase.charAt(0).toUpperCase()}${frase.slice(1)}`;
    texto += o.custoExtra ? ` (${reais(o.custoExtra)}).` : ".";
  }
  if (o.descricao)
    texto += ` ${o.descricao.replace(/\s+$/, "")}${/[.!?]$/.test(o.descricao.trim()) ? "" : "."}`;
  if (o.status === "resolvida" && o.resolucao && !positiva)
    texto += ` Resolução: ${o.resolucao}`;
  return texto.replace(/\s+/g, " ").trim();
};

/* ---------------- números do período ---------------- */

const contarPor = (lista, chave) => {
  const m = new Map();
  lista.forEach((o) => {
    const k = typeof chave === "function" ? chave(o) : o[chave];
    if (!k) return;
    m.set(k, (m.get(k) || 0) + 1);
  });
  return Array.from(m.entries())
    .map(([valor, total]) => ({ valor, total }))
    .sort(
      (a, b) =>
        b.total - a.total ||
        String(a.valor).localeCompare(String(b.valor), "pt-BR"),
    );
};

// servicosPorFornecedor (opcional): { [fornecedorKey]: nº de serviços no
// período } → ocorrências a cada 100 serviços (compara fornecedores grandes
// e pequenos de forma justa).
export const resumirOcorrencias = (
  lista = [],
  { servicosPorFornecedor = null } = {},
) => {
  const negativas = lista.filter((o) => !ehPositiva(o));
  const contraFornecedor = negativas.filter(contaContraFornecedor);
  const atrasos = negativas.filter(
    (o) => o.categoria === "atraso" && Number(o.atrasoMin) > 0,
  );

  const porFornecedorMapa = new Map();
  lista.forEach((o) => {
    const k = o.fornecedorKey || chaveFornecedor(o.fornecedor);
    if (!porFornecedorMapa.has(k)) {
      porFornecedorMapa.set(k, {
        chave: k,
        nome: o.fornecedor || "Sem fornecedor",
        total: 0,
        contra: 0,
        graves: 0,
        pontos: 0,
        elogios: 0,
        atrasos: 0,
        minutosAtraso: 0,
        abertas: 0,
        custoExtra: 0,
        categorias: {},
      });
    }
    const f = porFornecedorMapa.get(k);
    if (ehPositiva(o)) {
      f.elogios += 1;
      return;
    }
    f.total += 1;
    f.categorias[o.categoria] = (f.categorias[o.categoria] || 0) + 1;
    if (contaContraFornecedor(o)) {
      f.contra += 1;
      f.pontos += pesoDaOcorrencia(o);
      if (o.gravidade === "grave") f.graves += 1;
    }
    if (o.categoria === "atraso" && Number(o.atrasoMin) > 0) {
      f.atrasos += 1;
      f.minutosAtraso += Number(o.atrasoMin);
    }
    if (o.status !== "resolvida") f.abertas += 1;
    if (Number(o.custoExtra) > 0) f.custoExtra += Number(o.custoExtra);
  });

  const porFornecedor = Array.from(porFornecedorMapa.values())
    .map((f) => {
      const servicos = servicosPorFornecedor
        ? servicosPorFornecedor[f.chave] || 0
        : null;
      return {
        ...f,
        servicos,
        taxa: servicos ? Math.round((f.contra / servicos) * 1000) / 10 : null, // por 100 serviços
        mediaAtraso: f.atrasos ? Math.round(f.minutosAtraso / f.atrasos) : 0,
      };
    })
    .sort(
      (a, b) =>
        b.pontos - a.pontos ||
        b.contra - a.contra ||
        b.total - a.total ||
        a.nome.localeCompare(b.nome, "pt-BR"),
    );

  const porMes = contarPor(lista, (o) => String(o.data || "").slice(0, 7))
    .sort((a, b) => a.valor.localeCompare(b.valor))
    .map((m) => ({
      ...m,
      contra: lista.filter(
        (o) =>
          String(o.data || "").startsWith(m.valor) && contaContraFornecedor(o),
      ).length,
      elogios: lista.filter(
        (o) => String(o.data || "").startsWith(m.valor) && ehPositiva(o),
      ).length,
    }));

  return {
    total: lista.length,
    negativas: negativas.length,
    contraFornecedor: contraFornecedor.length,
    graves: contraFornecedor.filter((o) => o.gravidade === "grave").length,
    elogios: lista.length - negativas.length,
    abertas: negativas.filter((o) => o.status !== "resolvida").length,
    custoExtra: negativas.reduce((s, o) => s + (Number(o.custoExtra) || 0), 0),
    mediaAtraso: atrasos.length
      ? Math.round(
          atrasos.reduce((s, o) => s + Number(o.atrasoMin), 0) / atrasos.length,
        )
      : 0,
    atrasos: atrasos.length,
    contatosPax: negativas.filter((o) =>
      (o.impactos || []).includes("contato-pax"),
    ).length,
    porFornecedor,
    porCategoria: contarPor(negativas, "categoria"),
    porResponsavel: contarPor(negativas, "responsavel"),
    porTipoServico: contarPor(negativas, (o) => o.tipoServico || "SEM"),
    porImpacto: contarPor(
      negativas.flatMap((o) => (o.impactos || []).map((i) => ({ i }))),
      "i",
    ),
    porMes,
  };
};

// Fornecedores com ocorrência recente que pede atenção (Prontidão D-1):
// grave nos últimos `dias`, ou 2+ contra o fornecedor no período.
export const fornecedoresEmAlerta = (
  lista = [],
  { ate = "", dias = 30 } = {},
) => {
  const limite = (() => {
    if (!ate) return "";
    const d = new Date(`${ate}T12:00:00`);
    d.setDate(d.getDate() - dias);
    return d.toISOString().slice(0, 10);
  })();
  const mapa = {};
  lista.forEach((o) => {
    if (!contaContraFornecedor(o)) return;
    if (limite && (o.data < limite || o.data > ate)) return;
    const k = o.fornecedorKey || chaveFornecedor(o.fornecedor);
    if (!mapa[k])
      mapa[k] = { nome: o.fornecedor, total: 0, graves: 0, ultima: "" };
    mapa[k].total += 1;
    if (o.gravidade === "grave") mapa[k].graves += 1;
    if (o.data > mapa[k].ultima) mapa[k].ultima = o.data;
  });
  return Object.fromEntries(
    Object.entries(mapa).filter(([, v]) => v.graves > 0 || v.total >= 2),
  );
};

export const ocorrenciasParaCsv = (lista = []) => {
  const cab = [
    "Data",
    "Hora",
    "Tipo de serviço",
    "Serviço",
    "Fornecedor",
    "Veículo",
    "Motorista",
    "Ocorrência",
    "Atraso (min)",
    "Responsável",
    "Gravidade",
    "Impactos",
    "Custo extra",
    "Status",
    "Descrição",
    "Resolução",
    "Registrado por",
  ];
  const cel = (v) => {
    const t = String(v ?? "");
    return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const linhas = lista.map((o) =>
    [
      o.data,
      o.hora,
      NOME_TIPO[o.tipoServico] || "",
      o.servicoDescricao,
      o.fornecedor,
      o.veiculo,
      o.motorista,
      NOME_CATEGORIA_OCORRENCIA[o.categoria] || o.categoria,
      o.atrasoMin ?? "",
      ehPositiva(o) ? "" : NOME_RESPONSAVEL[o.responsavel] || "",
      NOME_GRAVIDADE[o.gravidade] || "",
      (o.impactos || []).map((i) => NOME_IMPACTO[i]).join(" | "),
      o.custoExtra ? String(o.custoExtra).replace(".", ",") : "",
      o.status === "resolvida" ? "Resolvida" : "Em aberto",
      o.descricao,
      o.resolucao,
      o.criadoPor?.nome || "",
    ]
      .map(cel)
      .join(";"),
  );
  return `﻿${[cab.join(";"), ...linhas].join("\n")}`;
};
