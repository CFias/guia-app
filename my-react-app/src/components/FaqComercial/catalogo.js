// Catálogo da Central de Informações — regras compartilhadas entre a tela do
// comercial (FaqComercial) e a administração (FaqAdmin).
//
// Tudo continua na coleção `faq_itens` (mesmas regras do Firestore). Os
// campos novos são opcionais, então os itens antigos seguem funcionando:
//   formato          "resposta" | "veiculo" | "tabela" | "embarcacao" | "local"
//   fichaVeiculo     { tipoVeiculo, recursos[] }  (capacidade: Assistente)
//   tabelaPrecos     [{ servico, valor, detalhe }]
//   fichaEmbarcacao  { tipoEmbarcacao, capacidade, recursos[], roteiros }
//   fichaLocal       { tipoLocal, endereco, bairro, telefone, horario, linkMapa, site }
//   imagensVeiculo   fotos (o nome do campo é histórico; vale para todo item com foto)

export const FORMATOS = {
  RESPOSTA: "resposta",
  VEICULO: "veiculo",
  TABELA: "tabela",
  EMBARCACAO: "embarcacao",
  LOCAL: "local",
};

/* ---------- embarcações e locais ---------- */

export const TIPOS_EMBARCACAO = [
  "Catamarã",
  "Escuna",
  "Lancha",
  "Saveiro",
  "Barco",
  "Ferry-boat",
];

export const RECURSOS_EMBARCACAO = [
  { label: "Banheiro", icon: "check" },
  { label: "Coletes salva-vidas", icon: "shield" },
  { label: "Área coberta", icon: "sun" },
  { label: "Bar a bordo", icon: "utensils" },
  { label: "Som", icon: "message" },
  { label: "Acessibilidade", icon: "user" },
];

export const TIPOS_LOCAL = [
  "Hotel",
  "Pousada",
  "Resort",
  "Restaurante",
  "Ponto de apoio",
  "Ponto de encontro",
  "Atração turística",
  "Praia",
  "Aeroporto",
  "Terminal / porto",
];

export const iconeTipoLocal = (tipo = "") => {
  const t = String(tipo).toLowerCase();
  if (/hotel|pousada|resort|hostel/.test(t)) return "bed";
  if (/restaurante|bar|lanchonete|caf/.test(t)) return "utensils";
  if (/aeroporto/.test(t)) return "plane";
  if (/porto|terminal|marina/.test(t)) return "anchor";
  return "mapPin";
};

export const obterFichaEmbarcacao = (item) => {
  const f = item?.fichaEmbarcacao || {};
  const capacidade = Number(f.capacidade);
  return {
    tipoEmbarcacao: String(f.tipoEmbarcacao || "").trim(),
    capacidade:
      Number.isFinite(capacidade) && capacidade > 0
        ? Math.floor(capacidade)
        : null,
    recursos: Array.isArray(f.recursos) ? f.recursos.filter(Boolean) : [],
    roteiros: String(f.roteiros || "").trim(),
  };
};

export const linkMapaDoEndereco = (endereco = "", bairro = "") => {
  const alvo = [endereco, bairro]
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .join(", ");
  return alvo
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(alvo)}`
    : "";
};

export const obterFichaLocal = (item) => {
  const f = item?.fichaLocal || {};
  const endereco = String(f.endereco || "").trim();
  const bairro = String(f.bairro || "").trim();
  return {
    tipoLocal: String(f.tipoLocal || "").trim(),
    endereco,
    bairro,
    telefone: String(f.telefone || "").trim(),
    horario: String(f.horario || "").trim(),
    site: String(f.site || "").trim(),
    linkMapa:
      String(f.linkMapa || "").trim() || linkMapaDoEndereco(endereco, bairro),
  };
};

// Telefone → link de WhatsApp (Brasil, DDD obrigatório).
export const linkWhatsappTelefone = (telefone = "") => {
  const digitos = String(telefone).replace(/\D/g, "");
  if (digitos.length < 10) return "";
  const comPais =
    digitos.startsWith("55") && digitos.length > 11 ? digitos : `55${digitos}`;
  return `https://wa.me/${comPais}`;
};

export const MENSAGEM_VENCIDA =
  "Consultar Operacional para valores atualizados.";

// Itens antigos não têm `formato`: quem tem veículo vira ficha de veículo,
// o resto continua como resposta pronta.
export const obterFormato = (item) => {
  const formato = item?.formato;
  if (Object.values(FORMATOS).includes(formato)) return formato;
  if (String(item?.nomeVeiculo || "").trim()) return FORMATOS.VEICULO;
  return FORMATOS.RESPOSTA;
};

export const TIPOS_VEICULO = [
  "Carro",
  "Minivan",
  "Van",
  "Micro-ônibus",
  "Ônibus",
  "Ônibus double deck",
  "Motoguia",
];

// Recursos com ícone próprio; qualquer outro texto cadastrado aparece com
// um ícone genérico de "check".
export const RECURSOS_VEICULO = [
  { label: "Ar-condicionado", icon: "snowflake" },
  { label: "Wi-Fi", icon: "wifi" },
  { label: "Tomada / USB", icon: "plug" },
  { label: "Bagageiro", icon: "briefcase" },
  { label: "Cadeirinha infantil", icon: "baby" },
  { label: "Acessibilidade", icon: "user" },
];

export const iconeRecurso = (label = "") =>
  [...RECURSOS_VEICULO, ...RECURSOS_EMBARCACAO].find((r) => r.label === label)
    ?.icon || "check";

const numeroOuNulo = (valor) => {
  if (valor === "" || valor === null || valor === undefined) return null;
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

// Configurações do assistente em que o veículo aparece (na ordem do assistente).
export const configuracoesDoVeiculo = (config, itemId) =>
  (config?.opcoes || []).filter(
    (o) =>
      o.ativo !== false && itemId && (o.veiculosIds || []).includes(itemId),
  );

// Ficha do veículo. A capacidade vem do Assistente de veículo (fonte
// única): usa a configuração base — a primeira sem bagageiro/carretinha.
// Itens antigos sem vínculo continuam mostrando a capacidade que tinham.
export const obterFichaVeiculo = (item, config) => {
  const ficha = item?.fichaVeiculo || {};
  const base = {
    tipoVeiculo: String(ficha.tipoVeiculo || "").trim(),
    passageiros: numeroOuNulo(ficha.passageiros),
    malasGrandes: numeroOuNulo(ficha.malasGrandes),
    malasBordo: numeroOuNulo(ficha.malasBordo),
    recursos: Array.isArray(ficha.recursos)
      ? ficha.recursos.filter(Boolean)
      : [],
    configuracoes: [],
  };

  const configuracoes = configuracoesDoVeiculo(config, item?.id);
  if (!configuracoes.length) return base;

  const principal = configuracoes.find((o) => !o.acessorio) || configuracoes[0];
  const combinacao = principal.combinacoes[0];
  return {
    ...base,
    passageiros: principal.paxMax || null,
    malasGrandes: combinacao ? combinacao.grandes : null,
    malasBordo: combinacao ? combinacao.bordo : null,
    configuracoes,
  };
};

export const fichaTemDados = (ficha) =>
  !!(
    ficha.configuracoes?.length ||
    ficha.tipoVeiculo ||
    ficha.passageiros !== null ||
    ficha.malasGrandes !== null ||
    ficha.malasBordo !== null ||
    ficha.recursos.length
  );

export const obterTabelaPrecos = (item) =>
  (Array.isArray(item?.tabelaPrecos) ? item.tabelaPrecos : [])
    .map((linha) => ({
      servico: String(linha?.servico || "").trim(),
      valor: String(linha?.valor ?? "").trim(),
      detalhe: String(linha?.detalhe || "").trim(),
    }))
    .filter((linha) => linha.servico || linha.valor);

// "250" / "250,5" / "1.250,00" viram R$; texto livre ("Sob consulta")
// aparece como foi digitado.
export const formatarValor = (valor = "") => {
  const texto = String(valor).trim();
  if (!texto) return "—";
  const limpo = texto.replace(/^R\$\s*/i, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(limpo)) {
    return texto;
  }
  // vírgula = decimal; sem vírgula, "1.250" é milhar e "12.5" é decimal
  const normalizado = limpo.includes(",")
    ? limpo.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+$/.test(limpo)
      ? limpo.replace(/\./g, "")
      : limpo;
  const n = Number(normalizado);
  if (!Number.isFinite(n)) return texto;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const formatarDataBr = (dataIso) => {
  if (!dataIso) return "";
  const [ano, mes, dia] = String(dataIso).split("-");
  return `${dia}/${mes}/${ano}`;
};

export const linhasFicha = (ficha) =>
  [
    ficha.tipoVeiculo && `Tipo: ${ficha.tipoVeiculo}`,
    ...(ficha.configuracoes?.length
      ? ficha.configuracoes.map(
          (o) =>
            `${o.nome}: até ${o.paxMax} passageiros${
              o.combinacoes.length
                ? ` · ${descreverCombinacoes(o.combinacoes)}`
                : ""
            }`,
        )
      : [
          ficha.passageiros !== null && `Passageiros: até ${ficha.passageiros}`,
          ficha.malasGrandes !== null &&
            `Malas grandes (até 23 kg): ${ficha.malasGrandes}`,
          ficha.malasBordo !== null &&
            `Malas de bordo (até 10 kg): ${ficha.malasBordo}`,
        ]),
    ficha.recursos.length > 0 && `Itens: ${ficha.recursos.join(" · ")}`,
  ].filter(Boolean);

export const linhaPreco = (linha) =>
  `- ${linha.servico || "Serviço"}: ${formatarValor(linha.valor)}${
    linha.detalhe ? ` (${linha.detalhe})` : ""
  }`;

// Texto que vai para a área de transferência / WhatsApp.
// Resposta pronta: exatamente o formato de antes (pergunta + resposta).
export const montarTextoCopia = (item, vencida = false, config = null) => {
  const formato = obterFormato(item);
  const resposta = vencida ? MENSAGEM_VENCIDA : item?.resposta || "";

  if (formato === FORMATOS.VEICULO) {
    const ficha = obterFichaVeiculo(item, config);
    if (!fichaTemDados(ficha)) return `${item.pergunta}\n\n${resposta}`.trim();
    const titulo = item.nomeVeiculo || item.pergunta;
    return [`*${titulo}*`, ...linhasFicha(ficha), resposta && `\n${resposta}`]
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  if (formato === FORMATOS.EMBARCACAO) {
    const f = obterFichaEmbarcacao(item);
    return [
      `*${item.pergunta}*`,
      f.tipoEmbarcacao && `Tipo: ${f.tipoEmbarcacao}`,
      f.capacidade && `Capacidade: até ${f.capacidade} passageiros`,
      f.recursos.length > 0 && `A bordo: ${f.recursos.join(" · ")}`,
      f.roteiros && `Roteiros: ${f.roteiros}`,
      resposta && `\n${resposta}`,
    ]
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  if (formato === FORMATOS.LOCAL) {
    const f = obterFichaLocal(item);
    return [
      `*${item.pergunta}*`,
      f.tipoLocal && f.tipoLocal,
      (f.endereco || f.bairro) &&
        `Endereço: ${[f.endereco, f.bairro].filter(Boolean).join(" — ")}`,
      f.telefone && `Telefone: ${f.telefone}`,
      f.horario && `Horário: ${f.horario}`,
      f.linkMapa && `Mapa: ${f.linkMapa}`,
      resposta && `\n${resposta}`,
    ]
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  if (formato === FORMATOS.TABELA) {
    if (vencida) return `${item.pergunta}\n\n${MENSAGEM_VENCIDA}`;
    const linhas = obterTabelaPrecos(item).map(linhaPreco);
    return [
      `*${item.pergunta}*`,
      item.validade && `Valores válidos até ${formatarDataBr(item.validade)}`,
      "",
      ...linhas,
      item.resposta && `\n${item.resposta}`,
    ]
      .filter((l) => l !== false && l !== undefined && l !== null)
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  return `${item.pergunta}\n\n${resposta}`;
};

// Uma linha só da tabela (ex.: "Motoguia — City Tour: R$ 250,00").
export const montarTextoLinhaPreco = (item, linha) =>
  `*${item.pergunta}*\n${linhaPreco(linha)}`;

// Texto puro para prévia de card (sem * e sem "- ").
export const textoPrevia = (texto = "") =>
  String(texto)
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\s*\n\s*/g, " ")
    .trim();

/* =========================================================
   Assistente de veículo
   Configuração única guardada em faq_itens/_assistente_veiculo (mesma
   coleção, sem mudar regras). `ativo: false` mantém o documento fora da
   lista de perguntas mesmo em versões antigas da tela.
   ========================================================= */

export const ASSISTENTE_DOC_ID = "_assistente_veiculo";
export const FORMATO_CONFIG_ASSISTENTE = "config_assistente";

export const ehConfigAssistente = (item) =>
  item?.id === ASSISTENTE_DOC_ID || item?.formato === FORMATO_CONFIG_ASSISTENTE;

export const ACESSORIOS = ["Bagageiro", "Carretinha"];

export const MENSAGEM_SEM_OPCAO_PADRAO =
  "Nenhuma configuração comporta esse grupo. Fale com o operacional — pode ser preciso dividir em dois veículos.";

const inteiro = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
};

// Itens fora do padrão: como cada um entra na conta.
export const COMO_CONTA = {
  grande: "Conta como mala de 23 kg",
  bordo: "Conta como mala de 10 kg",
  nao_ocupa: "Não ocupa espaço (vai no colo)",
  lugar: "Ocupa um lugar de passageiro",
  consultar: "Consultar o operacional",
};

// Entram na conta do assistente (o resto pede análise do operacional).
export const contaNaCapacidade = (conta) => conta !== "consultar";

// Padrão: mochilas entram na conta; o que foge do comum vai para o
// operacional analisar com calma.
export const ITENS_ESPECIAIS_PADRAO = [
  {
    id: "mochila-pequena",
    nome: "Mochila pequena (de mão)",
    conta: "nao_ocupa",
  },
  { id: "mochila-grande", nome: "Mochila grande (de viagem)", conta: "bordo" },
  { id: "mala-grande", nome: "Mala acima de 23 kg", conta: "consultar" },
  { id: "carrinho", nome: "Carrinho de bebê", conta: "consultar" },
  {
    id: "cadeirinha",
    nome: "Cadeirinha / assento infantil",
    conta: "consultar",
  },
  { id: "cadeira-rodas", nome: "Cadeira de rodas", conta: "consultar" },
  { id: "golfe", nome: "Bolsa de golfe", conta: "consultar" },
  { id: "prancha", nome: "Prancha de surf", conta: "consultar" },
  { id: "instrumento", nome: "Instrumento musical grande", conta: "consultar" },
];

// Nomes das seções da Central (editáveis pelo operacional).
export const NOMES_SECOES_PADRAO = {
  veiculo: "Veículos cadastrados",
  embarcacao: "Embarcações",
  local: "Locais e pontos de apoio",
  tabela: "Valores",
  resposta: "Respostas prontas",
};

// ---------------------------------------------------------------------
// Regras da operação por quantidade de passageiros (escopos). Cada faixa
// diz o veículo padrão e, em ordem, para onde subir se a bagagem não
// couber (ex.: Spin → Spin com bagageiro). Se nada da faixa levar a
// bagagem, sobe para a próxima faixa. Os números de malas são de partida
// — o operacional ajusta na aba "Assistente de veículo".
// ---------------------------------------------------------------------
const cat = (nome, ...combinacoes) => ({
  nome,
  combinacoes: combinacoes.map(([grandes, bordo]) => ({ grandes, bordo })),
});

export const FAIXAS_PADRAO = [
  {
    id: "f-1-3",
    de: 1,
    ate: 3,
    categorias: [
      cat("Carro de passeio ou Spin", [2, 2], [0, 5]),
      cat("Spin", [3, 2], [0, 6]),
      cat("Spin com bagageiro", [5, 3]),
    ],
    observacao: "Carros variados (sedan, SUV) ou Spin.",
  },
  {
    id: "f-4",
    de: 4,
    ate: 4,
    categorias: [
      cat("Spin", [3, 2], [0, 6]),
      cat("Spin com bagageiro", [5, 3]),
    ],
    observacao: "",
  },
  {
    id: "f-5-9",
    de: 5,
    ate: 9,
    categorias: [
      cat("Van sem carretinha", [9, 9]),
      cat("Van com carretinha", [18, 15]),
    ],
    observacao: "",
  },
  {
    id: "f-10-15",
    de: 10,
    ate: 15,
    categorias: [cat("Van com carretinha", [18, 15])],
    observacao: "",
  },
  {
    id: "f-16-19",
    de: 16,
    ate: 19,
    categorias: [cat("Van alongada com carretinha", [22, 19])],
    observacao: "",
  },
  {
    id: "f-20-28",
    de: 20,
    ate: 28,
    categorias: [cat("Micro-ônibus", [28, 28])],
    observacao: "",
  },
  {
    id: "f-29-46",
    de: 29,
    ate: 46,
    categorias: [cat("Ônibus", [46, 46])],
    observacao: "",
  },
];

const clonarFaixas = (lista) =>
  lista.map((f) => ({
    ...f,
    categorias: f.categorias.map((c) => ({
      ...c,
      combinacoes: c.combinacoes.map((x) => ({ ...x })),
    })),
  }));

// sem o campo salvo = regras padrão; lista vazia = regras desligadas
// (volta a recomendar pelas opções de veículo)
export const normalizarFaixas = (bruto) => {
  if (!Array.isArray(bruto)) return clonarFaixas(FAIXAS_PADRAO);
  return bruto
    .map((f, i) => ({
      id: String(f?.id || `f-${i}`),
      de: inteiro(f?.de),
      ate: inteiro(f?.ate),
      observacao: String(f?.observacao || "").trim(),
      categorias: (Array.isArray(f?.categorias) ? f.categorias : [])
        .map((c) => ({
          nome: String(c?.nome || "").trim(),
          combinacoes: (Array.isArray(c?.combinacoes) ? c.combinacoes : [])
            .map((x) => ({
              grandes: inteiro(x?.grandes),
              bordo: inteiro(x?.bordo),
            }))
            .filter((x) => x.grandes > 0 || x.bordo > 0),
        }))
        .filter((c) => c.nome),
    }))
    .filter((f) => f.de > 0 && f.ate >= f.de && f.categorias.length)
    .sort((a, b) => a.de - b.de);
};

export const rotuloFaixa = (f) =>
  f.de === f.ate ? `${f.de} pax` : `${f.de}–${f.ate} pax`;

export const normalizarConfigAssistente = (bruto) => {
  const opcoes = (Array.isArray(bruto?.opcoes) ? bruto.opcoes : []).map(
    (o, i) => ({
      id: String(o?.id || `op-${i}`),
      nome: String(o?.nome || "").trim(),
      grupo: String(o?.grupo || "").trim(),
      paxMax: inteiro(o?.paxMax),
      // até quantos passageiros este veículo é o RECOMENDADO (conforto da
      // operação); vazio = a própria capacidade. Ex.: BYD leva 4, mas é
      // recomendado até 3; van sem carretinha leva 14, recomendada até 9.
      paxIdeal: inteiro(o?.paxIdeal) || 0,
      acessorio: ACESSORIOS.includes(o?.acessorio) ? o.acessorio : "",
      combinacoes: (Array.isArray(o?.combinacoes) ? o.combinacoes : [])
        .map((c) => ({
          grandes: inteiro(c?.grandes),
          bordo: inteiro(c?.bordo),
        }))
        .filter((c) => c.grandes > 0 || c.bordo > 0),
      veiculosIds: Array.isArray(o?.veiculosIds)
        ? o.veiculosIds.filter(Boolean)
        : [],
      observacao: String(o?.observacao || "").trim(),
      ativo: o?.ativo !== false,
    }),
  );

  const fator = Number(bruto?.fatorBordoPorGrande);
  const itensEspeciais = Array.isArray(bruto?.itensEspeciais)
    ? bruto.itensEspeciais
        .map((it, i) => ({
          id: String(it?.id || `esp-${i}`),
          nome: String(it?.nome || "").trim(),
          conta: COMO_CONTA[it?.conta] ? it.conta : "consultar",
        }))
        .filter((it) => it.nome)
    : ITENS_ESPECIAIS_PADRAO;

  const nomes = bruto?.nomesSecoes || {};
  return {
    nomesSecoes: Object.fromEntries(
      Object.entries(NOMES_SECOES_PADRAO).map(([chave, padrao]) => [
        chave,
        String(nomes[chave] || "").trim() || padrao,
      ]),
    ),
    fatorBordoPorGrande: Number.isFinite(fator) && fator >= 0 ? fator : 1,
    margemFolga: inteiro(bruto?.margemFolga),
    mensagemSemOpcao:
      String(bruto?.mensagemSemOpcao || "").trim() || MENSAGEM_SEM_OPCAO_PADRAO,
    itensEspeciais,
    opcoes,
    faixas: normalizarFaixas(bruto?.faixas),
  };
};

// Modelo de partida para o operacional ajustar (os números são exemplo).
export const EXEMPLO_CONFIG_ASSISTENTE = {
  fatorBordoPorGrande: 1,
  margemFolga: 0,
  itensEspeciais: ITENS_ESPECIAIS_PADRAO,
  mensagemSemOpcao: MENSAGEM_SEM_OPCAO_PADRAO,
  opcoes: [
    {
      id: "ex-1",
      nome: "Spin sem bagageiro",
      grupo: "Carro",
      paxMax: 4,
      acessorio: "",
      combinacoes: [
        { grandes: 3, bordo: 2 },
        { grandes: 0, bordo: 7 },
      ],
      veiculosIds: [],
      observacao: "",
    },
    {
      id: "ex-2",
      nome: "Spin com bagageiro",
      grupo: "Carro",
      paxMax: 4,
      acessorio: "Bagageiro",
      combinacoes: [{ grandes: 5, bordo: 3 }],
      veiculosIds: [],
      observacao: "Bagageiro sujeito a disponibilidade.",
    },
    {
      id: "ex-3",
      nome: "Van sem carretinha",
      grupo: "Van",
      paxMax: 15,
      acessorio: "",
      combinacoes: [{ grandes: 8, bordo: 8 }],
      veiculosIds: [],
      observacao: "",
    },
    {
      id: "ex-4",
      nome: "Van com carretinha",
      grupo: "Van",
      paxMax: 15,
      acessorio: "Carretinha",
      combinacoes: [{ grandes: 18, bordo: 15 }],
      veiculosIds: [],
      observacao: "",
    },
    {
      id: "ex-5",
      nome: "Van alongada sem carretinha",
      grupo: "Van alongada",
      paxMax: 19,
      acessorio: "",
      combinacoes: [{ grandes: 12, bordo: 10 }],
      veiculosIds: [],
      observacao: "",
    },
    {
      id: "ex-6",
      nome: "Van alongada com carretinha",
      grupo: "Van alongada",
      paxMax: 19,
      acessorio: "Carretinha",
      combinacoes: [{ grandes: 22, bordo: 19 }],
      veiculosIds: [],
      observacao: "",
    },
  ],
};

// Cabe a bagagem em alguma combinação? Vaga de mala grande que sobra pode
// receber malas de bordo (quantas por vaga = fator).
export const bagagemCabe = (combinacoes, grandes, bordo, fator = 1) =>
  combinacoes.some(
    (c) =>
      grandes <= c.grandes &&
      bordo <= c.bordo + Math.floor((c.grandes - grandes) * fator),
  );

export const descreverCombinacoes = (combinacoes) =>
  combinacoes
    .map(
      (c) =>
        `até ${[
          c.grandes > 0 && `${c.grandes} de 23 kg`,
          c.bordo > 0 && `${c.bordo} de 10 kg`,
        ]
          .filter(Boolean)
          .join(" + ")}`,
    )
    .join(" · ou ");

// Soma os itens especiais ao grupo conforme a regra de cada um.
export const aplicarEspeciais = (config, grupo = {}) => {
  const efetivo = {
    pax: inteiro(grupo.pax),
    grandes: inteiro(grupo.grandes),
    bordo: inteiro(grupo.bordo),
  };
  const especiais = [];
  const consultar = [];

  config.itensEspeciais.forEach((item) => {
    const qtd = inteiro(grupo.especiais?.[item.id]);
    if (!qtd) return;
    especiais.push({ ...item, qtd });
    if (item.conta === "grande") efetivo.grandes += qtd;
    else if (item.conta === "bordo") efetivo.bordo += qtd;
    else if (item.conta === "lugar") efetivo.pax += qtd;
    else if (item.conta === "consultar") consultar.push({ ...item, qtd });
  });

  return { efetivo, especiais, consultar };
};

// quantas opções aparecem de cara na lista de recomendados
export const LIMITE_RECOMENDADAS = 4;

// Recomendação pelas regras da operação (faixas de passageiros).
export const recomendarPorFaixa = (config, grupo = {}) => {
  const { efetivo, especiais, consultar } = aplicarEspeciais(config, grupo);
  const { pax, grandes, bordo } = efetivo;
  const fator = config.fatorBordoPorGrande;
  const margem = config.margemFolga;
  const faixas = config.faixas || [];
  const preenchido =
    pax > 0 || grandes > 0 || bordo > 0 || especiais.length > 0;
  const temMalas = grandes > 0 || bordo > 0;
  const qtd = pax || 1;

  // categoria sem capacidade de malas informada: não dá para checar — aceita
  const cabe = (c, g = grandes, b = bordo) =>
    !temMalas ||
    !c.combinacoes.length ||
    bagagemCabe(c.combinacoes, g, b, fator);
  const cabeComFolga = (c, n) =>
    !temMalas ||
    n === 0 ||
    !c.combinacoes.length ||
    cabe(c, grandes + n, bordo) ||
    cabe(c, grandes, bordo + Math.ceil(n * Math.max(fator, 1)));

  const base = {
    modo: "faixas",
    efetivo,
    especiais,
    consultar,
    preenchido,
    faixas,
    margem,
    totalOpcoes: faixas.length,
    recomendada: null,
    recomendadas: [],
    maiores: [],
    alternativas: [],
  };

  const indice = faixas.findIndex((f) => qtd >= f.de && qtd <= f.ate);
  if (indice < 0) {
    return { ...base, excedePax: preenchido, faixaPax: null, escolha: null };
  }

  // a faixa dos passageiros e, se a bagagem pedir, as seguintes
  const sequencia = [];
  for (let k = indice; k < faixas.length; k += 1) {
    faixas[k].categorias.forEach((categoria, ci) =>
      sequencia.push({ faixa: faixas[k], categoria, k, ci }),
    );
  }

  const comMargem = sequencia.find(
    (s) => cabe(s.categoria) && cabeComFolga(s.categoria, margem),
  );
  const escolha = comMargem || sequencia.find((s) => cabe(s.categoria)) || null;
  const faixaPax = faixas[indice];

  return {
    ...base,
    faixaPax,
    padrao: faixaPax.categorias[0],
    escolha,
    categoria: escolha?.categoria || null,
    // bagagem fez trocar o veículo padrão da faixa
    subiuPorBagagem: !!(escolha && (escolha.k !== indice || escolha.ci > 0)),
    noLimite: !!(escolha && temMalas && !cabeComFolga(escolha.categoria, 1)),
    semMargem: !!(escolha && margem > 0 && !comMargem),
    excedeBagagem: !escolha,
    excedePax: false,
  };
};

export const recomendarVeiculo = (config, grupo = {}) => {
  // com regras da operação configuradas, elas mandam
  if (config.faixas?.length) return recomendarPorFaixa(config, grupo);
  const { efetivo, especiais, consultar } = aplicarEspeciais(config, grupo);
  const { pax, grandes, bordo } = efetivo;
  const fator = config.fatorBordoPorGrande;
  const margem = config.margemFolga;
  const opcoes = config.opcoes.filter((o) => o.ativo && o.nome && o.paxMax > 0);
  const preenchido =
    pax > 0 || grandes > 0 || bordo > 0 || especiais.length > 0;
  const temMalas = grandes > 0 || bordo > 0;

  const cabe = (o, g, b) => bagagemCabe(o.combinacoes, g, b, fator);
  const cabePax = (o) => (pax || 1) <= o.paxMax;
  const cabeMalas = (o) => !temMalas || cabe(o, grandes, bordo);
  // folga: sobra espaço para mais N malas (de 23 kg, ou o equivalente em 10 kg)
  const cabeComFolga = (o, n) =>
    !temMalas ||
    n === 0 ||
    cabe(o, grandes + n, bordo) ||
    cabe(o, grandes, bordo + Math.ceil(n * Math.max(fator, 1)));
  const noLimite = (o) => temMalas && !cabeComFolga(o, 1);

  // ---------------------------------------------------------------
  // Regra do operacional:
  //  1) cada opção tem uma faixa "recomendado até N pax" (paxIdeal; se
  //     vazio, a capacidade). As opções formam degraus por esse número;
  //     o grupo vai para o MENOR degrau que o comporta com conforto.
  //  2) dentro do degrau, quem não precisa de acessório (bagageiro,
  //     carretinha) vem antes — o acessório só entra se a bagagem pedir.
  //  3) bagagem: primeiro procura quem leva com a margem de segurança;
  //     se ninguém deixa margem, aceita quem leva no limite (e avisa).
  //  4) se nada no degrau leva a bagagem, sobe para o próximo degrau.
  //  O resto que também comporta fica em "Também comportam".
  // ---------------------------------------------------------------
  const ideal = (o) => Math.min(o.paxIdeal || o.paxMax, o.paxMax);
  const qtdPax = pax || 1;
  const tamanho = (o) =>
    o.paxMax * 1000 +
    Math.max(0, ...o.combinacoes.map((c) => c.grandes * 10 + c.bordo));
  const porTamanho = (a, b) =>
    ideal(a) - ideal(b) ||
    (a.acessorio ? 1 : 0) - (b.acessorio ? 1 : 0) ||
    tamanho(a) - tamanho(b);

  const degraus = [...new Set(opcoes.map(ideal))]
    .filter((d) => d >= qtdPax)
    .sort((a, b) => a - b);

  const escolherNoDegrau = (exigeFolga) => {
    for (const d of degraus) {
      const doDegrau = opcoes
        .filter((o) => ideal(o) === d && cabePax(o) && cabeMalas(o))
        .filter((o) => !exigeFolga || cabeComFolga(o, margem));
      if (!doDegrau.length) continue;
      const semAcessorio = doDegrau.filter((o) => !o.acessorio);
      return {
        degrau: d,
        lista: (semAcessorio.length ? semAcessorio : doDegrau).sort(porTamanho),
      };
    }
    return null;
  };

  // nenhum degrau "recomenda" tanta gente, mas a capacidade comporta:
  // mostra o menor que leva (marcado como apertado)
  const pelaCapacidade = (exigeFolga) => {
    const lista = opcoes
      .filter(
        (o) =>
          cabePax(o) &&
          cabeMalas(o) &&
          (!exigeFolga || cabeComFolga(o, margem)),
      )
      .sort((a, b) => a.paxMax - b.paxMax || porTamanho(a, b));
    return lista.length ? { degrau: null, lista: lista.slice(0, 1) } : null;
  };

  const escolhaComMargem =
    escolherNoDegrau(true) || (!degraus.length && pelaCapacidade(true));
  const escolha =
    escolhaComMargem ||
    escolherNoDegrau(false) ||
    pelaCapacidade(true) ||
    pelaCapacidade(false);
  const listaRecomendada = escolha ? escolha.lista : [];
  const recomendada = listaRecomendada[0] || null;

  const item = (o) => ({
    opcao: o,
    noLimite: noLimite(o),
    semMargem: margem > 0 && !cabeComFolga(o, margem),
    // comporta pela capacidade, mas acima do "recomendado até"
    apertado: qtdPax > ideal(o),
  });

  const recomendadas = listaRecomendada.slice(0, LIMITE_RECOMENDADAS).map(item);
  const idsRecomendadas = new Set(recomendadas.map((r) => r.opcao.id));

  // também comportam: primeiro os do mesmo tamanho (ex.: com acessório),
  // depois os maiores; por último os que cabem só apertado
  const atendem = opcoes.filter((o) => cabePax(o) && cabeMalas(o));
  const maiores = atendem
    .filter((o) => !idsRecomendadas.has(o.id))
    .sort((a, b) => {
      const apA = qtdPax > ideal(a) ? 1 : 0;
      const apB = qtdPax > ideal(b) ? 1 : 0;
      return apA - apB || porTamanho(a, b);
    })
    .map(item);

  const alternativas = atendem.filter((o) => !idsRecomendadas.has(o.id));

  // o que atenderia só pelo número de pessoas (sem olhar bagagem)
  const pelaQuantidade =
    opcoes
      .filter((o) => cabePax(o) && degraus.length && ideal(o) === degraus[0])
      .sort(porTamanho)[0] ||
    opcoes.filter(cabePax).sort(porTamanho)[0] ||
    null;

  const recomendadaNoLimite = !!(recomendada && noLimite(recomendada));
  const maisFolgada = recomendadaNoLimite
    ? maiores.find((m) => !m.noLimite && !m.apertado)?.opcao || null
    : null;

  // a mesma família tem uma versão com acessório? (para o selo "Sem …")
  const variacaoSemAcessorio =
    recomendada && !recomendada.acessorio
      ? opcoes.find(
          (o) => o.grupo && o.grupo === recomendada.grupo && o.acessorio,
        ) || null
      : null;

  const subiu = !!(
    recomendada &&
    pelaQuantidade &&
    (ideal(recomendada) !== ideal(pelaQuantidade) ||
      (!!recomendada.acessorio && !pelaQuantidade.acessorio))
  );
  const comMargem = escolhaComMargem ? recomendada : null;

  return {
    efetivo,
    especiais,
    consultar,
    preenchido,
    recomendada,
    recomendadas,
    maiores,
    pelaQuantidade,
    alternativas,
    subiuPorBagagem: subiu,
    // a menor opção comportava a bagagem, mas sem a margem de segurança
    subiuPorMargem: !!(
      subiu &&
      margem > 0 &&
      pelaQuantidade &&
      cabeMalas(pelaQuantidade)
    ),
    semMargem: !!(margem > 0 && recomendada && !comMargem),
    noLimite: recomendadaNoLimite,
    maisFolgada,
    margem,
    excedePax: preenchido && !pelaQuantidade,
    acessorioDispensado: variacaoSemAcessorio?.acessorio || "",
    totalOpcoes: opcoes.length,
  };
};

export const descreverGrupo = ({ pax = 0, grandes = 0, bordo = 0 }) =>
  [
    `${pax} passageiro${pax === 1 ? "" : "s"}`,
    grandes > 0 && `${grandes} mala${grandes === 1 ? "" : "s"} de 23 kg`,
    bordo > 0 && `${bordo} mala${bordo === 1 ? "" : "s"} de 10 kg`,
  ]
    .filter(Boolean)
    .join(" · ");

export const descreverEspeciais = (especiais = []) =>
  especiais.map((e) => `${e.qtd}× ${e.nome.toLowerCase()}`).join(", ");

export const montarTextoRecomendacao = (
  resultado,
  grupo,
  nomesDaOpcao = () => [],
) => {
  if (resultado.modo === "faixas") {
    if (!resultado.categoria) return "";
    return [
      `*Veículo recomendado: ${resultado.categoria.nome}*`,
      `Grupo: ${descreverGrupo({
        pax: grupo.pax || 0,
        grandes: grupo.grandes || 0,
        bordo: grupo.bordo || 0,
      })}`,
      resultado.especiais.length > 0 &&
        `Itens especiais: ${descreverEspeciais(resultado.especiais)}`,
      resultado.consultar.length > 0 &&
        `Sujeito a confirmação do operacional: ${descreverEspeciais(resultado.consultar)}.`,
    ]
      .filter(Boolean)
      .join("\n");
  }
  const { recomendadas = [], especiais, consultar } = resultado;
  if (!recomendadas.length) return "";
  const linhaOpcao = ({ opcao }) => {
    const nomes = nomesDaOpcao(opcao);
    return [
      `• *${opcao.nome}*`,
      nomes.length ? ` (${nomes.join(", ")} ou similar)` : "",
      opcao.acessorio ? ` — com ${opcao.acessorio.toLowerCase()}` : "",
    ].join("");
  };
  return [
    recomendadas.length === 1
      ? "*Veículo recomendado*"
      : "*Veículos recomendados*",
    `Grupo: ${descreverGrupo({
      pax: grupo.pax || 0,
      grandes: grupo.grandes || 0,
      bordo: grupo.bordo || 0,
    })}`,
    especiais.length > 0 && `Itens especiais: ${descreverEspeciais(especiais)}`,
    "",
    ...recomendadas.map(linhaOpcao),
    consultar.length > 0 && "",
    consultar.length > 0 &&
      `Sujeito a confirmação do operacional: ${descreverEspeciais(consultar)}.`,
  ]
    .filter((l) => l !== false && l !== null && l !== undefined)
    .join("\n");
};

// Frase do que uma capacidade aceita (para quem cadastra conferir).
const pluralCap = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

// Frase do que a capacidade aceita, para o operacional conferir.
export const resumoCapacidade = (combinacoes, fator) => {
  const linhas = combinacoes
    .map((c) => ({
      grandes: Number(c.grandes) || 0,
      bordo: Number(c.bordo) || 0,
    }))
    .filter((c) => c.grandes > 0 || c.bordo > 0);
  if (!linhas.length) return "Preencha o máximo que o veículo leva.";

  const partes = [];
  linhas.forEach((c, i) => {
    const base = [
      c.grandes > 0 && pluralCap(c.grandes, "mala de 23 kg", "malas de 23 kg"),
      c.bordo > 0 && pluralCap(c.bordo, "de 10 kg", "de 10 kg"),
    ]
      .filter(Boolean)
      .join(" + ");
    partes.push(i === 0 ? `Aceita até ${base}` : `ou até ${base}`);
    const soMao = c.bordo + Math.floor(c.grandes * fator);
    if (c.grandes > 0 && fator > 0 && i === 0) {
      partes.push(
        `ou até ${pluralCap(soMao, "mala de 10 kg", "malas de 10 kg")} sem malas grandes`,
      );
    }
  });
  return `${partes.join(", ")} — e qualquer quantidade menor.`;
};
