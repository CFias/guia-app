// Catálogo da Central de Dúvidas — regras compartilhadas entre a tela do
// comercial (FaqComercial) e a administração (FaqAdmin).
//
// Tudo continua na coleção `faq_itens` (mesmas regras do Firestore). Os
// campos novos são opcionais, então os itens antigos seguem funcionando:
//   formato        "resposta" | "veiculo" | "tabela"   (sem o campo: deduzido)
//   fichaVeiculo   { tipoVeiculo, passageiros, malasGrandes, malasBordo, recursos[] }
//   tabelaPrecos   [{ servico, valor, detalhe }]

export const FORMATOS = {
  RESPOSTA: "resposta",
  VEICULO: "veiculo",
  TABELA: "tabela",
};

export const MENSAGEM_VENCIDA = "Consultar Operacional para valores atualizados.";

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
  RECURSOS_VEICULO.find((r) => r.label === label)?.icon || "check";

const numeroOuNulo = (valor) => {
  if (valor === "" || valor === null || valor === undefined) return null;
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export const obterFichaVeiculo = (item) => {
  const ficha = item?.fichaVeiculo || {};
  return {
    tipoVeiculo: String(ficha.tipoVeiculo || "").trim(),
    passageiros: numeroOuNulo(ficha.passageiros),
    malasGrandes: numeroOuNulo(ficha.malasGrandes),
    malasBordo: numeroOuNulo(ficha.malasBordo),
    recursos: Array.isArray(ficha.recursos) ? ficha.recursos.filter(Boolean) : [],
  };
};

export const fichaTemDados = (ficha) =>
  !!(
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
    ficha.passageiros !== null && `Passageiros: até ${ficha.passageiros}`,
    ficha.malasGrandes !== null &&
    `Malas grandes (até 23 kg): ${ficha.malasGrandes}`,
    ficha.malasBordo !== null && `Malas de bordo (até 10 kg): ${ficha.malasBordo}`,
    ficha.recursos.length > 0 && `Itens: ${ficha.recursos.join(" · ")}`,
  ].filter(Boolean);

export const linhaPreco = (linha) =>
  `- ${linha.servico || "Serviço"}: ${formatarValor(linha.valor)}${linha.detalhe ? ` (${linha.detalhe})` : ""
  }`;

// Texto que vai para a área de transferência / WhatsApp.
// Resposta pronta: exatamente o formato de antes (pergunta + resposta).
export const montarTextoCopia = (item, vencida = false) => {
  const formato = obterFormato(item);
  const resposta = vencida ? MENSAGEM_VENCIDA : item?.resposta || "";

  if (formato === FORMATOS.VEICULO) {
    const ficha = obterFichaVeiculo(item);
    if (!fichaTemDados(ficha)) return `${item.pergunta}\n\n${resposta}`.trim();
    const titulo = item.nomeVeiculo || item.pergunta;
    return [`*${titulo}*`, ...linhasFicha(ficha), resposta && `\n${resposta}`]
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
  lugar: "Ocupa um lugar de passageiro",
  consultar: "Pedir confirmação ao operacional",
};

export const ITENS_ESPECIAIS_PADRAO = [
  { id: "mala-grande", nome: "Mala acima de 23 kg", conta: "grande" },
  { id: "carrinho", nome: "Carrinho de bebê", conta: "grande" },
  { id: "cadeirinha", nome: "Cadeirinha / assento infantil", conta: "consultar" },
  { id: "cadeira-rodas", nome: "Cadeira de rodas dobrável", conta: "grande" },
  { id: "golfe", nome: "Bolsa de golfe", conta: "grande" },
  { id: "prancha", nome: "Prancha de surf", conta: "consultar" },
];

export const normalizarConfigAssistente = (bruto) => {
  const opcoes = (Array.isArray(bruto?.opcoes) ? bruto.opcoes : []).map((o, i) => ({
    id: String(o?.id || `op-${i}`),
    nome: String(o?.nome || "").trim(),
    grupo: String(o?.grupo || "").trim(),
    paxMax: inteiro(o?.paxMax),
    acessorio: ACESSORIOS.includes(o?.acessorio) ? o.acessorio : "",
    combinacoes: (Array.isArray(o?.combinacoes) ? o.combinacoes : [])
      .map((c) => ({ grandes: inteiro(c?.grandes), bordo: inteiro(c?.bordo) }))
      .filter((c) => c.grandes > 0 || c.bordo > 0),
    veiculosIds: Array.isArray(o?.veiculosIds) ? o.veiculosIds.filter(Boolean) : [],
    observacao: String(o?.observacao || "").trim(),
    ativo: o?.ativo !== false,
  }));

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

  return {
    fatorBordoPorGrande: Number.isFinite(fator) && fator >= 0 ? fator : 1,
    margemFolga: inteiro(bruto?.margemFolga),
    mensagemSemOpcao:
      String(bruto?.mensagemSemOpcao || "").trim() || MENSAGEM_SEM_OPCAO_PADRAO,
    itensEspeciais,
    opcoes,
  };
};

// Modelo de partida para o operacional ajustar (os números são exemplo).
export const EXEMPLO_CONFIG_ASSISTENTE = {
  fatorBordoPorGrande: 1,
  margemFolga: 0,
  itensEspeciais: ITENS_ESPECIAIS_PADRAO,
  mensagemSemOpcao: MENSAGEM_SEM_OPCAO_PADRAO,
  opcoes: [
    { id: "ex-1", nome: "Spin sem bagageiro", grupo: "Carro", paxMax: 4, acessorio: "", combinacoes: [{ grandes: 3, bordo: 2 }, { grandes: 0, bordo: 7 }], veiculosIds: [], observacao: "" },
    { id: "ex-2", nome: "Spin com bagageiro", grupo: "Carro", paxMax: 4, acessorio: "Bagageiro", combinacoes: [{ grandes: 5, bordo: 3 }], veiculosIds: [], observacao: "Bagageiro sujeito a disponibilidade." },
    { id: "ex-3", nome: "Van sem carretinha", grupo: "Van", paxMax: 15, acessorio: "", combinacoes: [{ grandes: 8, bordo: 8 }], veiculosIds: [], observacao: "" },
    { id: "ex-4", nome: "Van com carretinha", grupo: "Van", paxMax: 15, acessorio: "Carretinha", combinacoes: [{ grandes: 18, bordo: 15 }], veiculosIds: [], observacao: "" },
    { id: "ex-5", nome: "Van alongada sem carretinha", grupo: "Van alongada", paxMax: 19, acessorio: "", combinacoes: [{ grandes: 12, bordo: 10 }], veiculosIds: [], observacao: "" },
    { id: "ex-6", nome: "Van alongada com carretinha", grupo: "Van alongada", paxMax: 19, acessorio: "Carretinha", combinacoes: [{ grandes: 22, bordo: 19 }], veiculosIds: [], observacao: "" },
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
    else consultar.push({ ...item, qtd });
  });

  return { efetivo, especiais, consultar };
};

export const recomendarVeiculo = (config, grupo = {}) => {
  const { efetivo, especiais, consultar } = aplicarEspeciais(config, grupo);
  const { pax, grandes, bordo } = efetivo;
  const fator = config.fatorBordoPorGrande;
  const margem = config.margemFolga;
  const opcoes = config.opcoes.filter((o) => o.ativo && o.nome && o.paxMax > 0);
  const preenchido = pax > 0 || grandes > 0 || bordo > 0 || especiais.length > 0;
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

  const pelaQuantidade = opcoes.find(cabePax) || null;
  const comMargem = opcoes.find((o) => cabePax(o) && cabeMalas(o) && cabeComFolga(o, margem));
  const semMargem = opcoes.find((o) => cabePax(o) && cabeMalas(o)) || null;
  const recomendada = comMargem || semMargem;

  const alternativas = opcoes
    .filter((o) => o !== recomendada && cabePax(o) && cabeMalas(o))
    .slice(0, 3);

  const recomendadaNoLimite = !!(recomendada && noLimite(recomendada));
  const maisFolgada = recomendadaNoLimite
    ? opcoes.find(
      (o) =>
        o !== recomendada &&
        opcoes.indexOf(o) > opcoes.indexOf(recomendada) &&
        cabePax(o) &&
        !noLimite(o),
    ) || null
    : null;

  // a mesma família tem uma versão com/sem acessório?
  const variacaoSemAcessorio =
    recomendada && !recomendada.acessorio
      ? opcoes.find(
        (o) => o.grupo && o.grupo === recomendada.grupo && o.acessorio,
      ) || null
      : null;

  const subiu = !!(recomendada && pelaQuantidade && recomendada.id !== pelaQuantidade.id);

  return {
    efetivo,
    especiais,
    consultar,
    preenchido,
    recomendada,
    pelaQuantidade,
    alternativas,
    subiuPorBagagem: subiu,
    // a menor opção comportava a bagagem, mas sem a margem de segurança
    subiuPorMargem: !!(subiu && margem > 0 && pelaQuantidade && cabeMalas(pelaQuantidade)),
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

export const montarTextoRecomendacao = (resultado, grupo, nomesVeiculos = []) => {
  const { recomendada, especiais, consultar } = resultado;
  if (!recomendada) return "";
  return [
    "*Sugestão de veículo*",
    `Grupo: ${descreverGrupo({
      pax: grupo.pax || 0,
      grandes: grupo.grandes || 0,
      bordo: grupo.bordo || 0,
    })}`,
    especiais.length > 0 && `Itens especiais: ${descreverEspeciais(especiais)}`,
    `Veículo: *${recomendada.nome}*${nomesVeiculos.length ? ` (${nomesVeiculos.join(", ")} ou similar)` : ""
    }`,
    recomendada.acessorio && `Inclui ${recomendada.acessorio.toLowerCase()}.`,
    recomendada.observacao,
    consultar.length > 0 &&
    `Sujeito a confirmação do operacional: ${descreverEspeciais(consultar)}.`,
  ]
    .filter(Boolean)
    .join("\n");
};
