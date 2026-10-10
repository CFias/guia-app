// Formulário de item da Central de Informações: estado inicial, conversão
// item ⇄ formulário e validação (o que é obrigatório para cada tipo).

import {
  FORMATOS,
  obterFormato,
  obterFichaVeiculo,
  obterTabelaPrecos,
  obterFichaEmbarcacao,
  obterFichaLocal,
  RECURSOS_VEICULO,
  RECURSOS_EMBARCACAO,
} from "../FaqComercial/catalogo";

export const LINHA_PRECO_VAZIA = { servico: "", valor: "", detalhe: "" };

const NOMES_RECURSOS_PADRAO = RECURSOS_VEICULO.map((r) => r.label);
const NOMES_RECURSOS_BARCO = RECURSOS_EMBARCACAO.map((r) => r.label);

// Categoria sugerida ao escolher o tipo (o operacional pode trocar).
export const CATEGORIA_PADRAO = {
  [FORMATOS.VEICULO]: "Veículo",
  [FORMATOS.TABELA]: "Valores",
  [FORMATOS.EMBARCACAO]: "Embarcações",
  [FORMATOS.LOCAL]: "Locais",
};

export const FORMULARIO_VAZIO = {
  formato: FORMATOS.RESPOSTA,
  tipoVeiculo: "",
  passageiros: "",
  malasGrandes: "",
  malasBordo: "",
  recursos: [],
  recursosExtras: "",
  tabelaPrecos: [{ ...LINHA_PRECO_VAZIA }],
  categoria: "",
  pergunta: "",
  resposta: "",
  palavrasChave: "",
  validade: "",
  destaque: false,
  ativo: true,
  nomeVeiculo: "",
  imagensVeiculoTexto: "",
  linkOficialVeiculo: "",
  veiculoForaCatalogo: false,
  // Capacidade do veículo: uma ou mais configurações (ex.: sem bagageiro /
  // com bagageiro). Ficam guardadas no Assistente de veículo — fonte única.
  configsVeiculo: [],
  // embarcação
  tipoEmbarcacao: "",
  capacidadeEmbarcacao: "",
  recursosEmbarcacao: [],
  recursosEmbarcacaoExtras: "",
  roteiros: "",
  // local
  tipoLocal: "",
  endereco: "",
  bairro: "",
  telefone: "",
  horario: "",
  linkMapa: "",
  site: "",
};

export const CONFIG_VEICULO_VAZIA = () => ({
  id: null,
  nome: "",
  paxMax: "",
  acessorio: "",
  combinacoes: [{ grandes: "", bordo: "" }],
  usadaPor: [],
});

// Configuração tem algo preenchido? (vazia é ignorada ao salvar)
export const configPreenchida = (c) =>
  !!(
    String(c.nome || "").trim() ||
    String(c.paxMax ?? "").trim() ||
    c.combinacoes.some(
      (x) => String(x.grandes ?? "").trim() || String(x.bordo ?? "").trim(),
    )
  );

// Nome automático quando não informado: "Spin" / "Spin com bagageiro".
export const nomeAutomaticoConfig = (c, nomeVeiculo) => {
  const base = String(nomeVeiculo || "").trim() || "Veículo";
  return c.acessorio ? `${base} com ${c.acessorio.toLowerCase()}` : base;
};

const obterImagens = (item) => {
  if (Array.isArray(item?.imagensVeiculo) && item.imagensVeiculo.length) {
    return item.imagensVeiculo;
  }
  if (item?.imagemVeiculoUrl) return [item.imagemVeiculoUrl];
  return [];
};

// Item salvo → formulário. `copia` = duplicar (vira item novo).
export const formularioDoItem = (item, copia = false) => {
  const ficha = obterFichaVeiculo(item);
  const tabela = obterTabelaPrecos(item);
  return {
    formato: obterFormato(item),
    categoria: item.categoria || "",
    pergunta: item.pergunta
      ? copia
        ? `${item.pergunta} (cópia)`
        : item.pergunta
      : "",
    resposta: item.resposta || "",
    palavrasChave: Array.isArray(item.palavrasChave)
      ? item.palavrasChave.join(", ")
      : "",
    validade: item.validade || "",
    destaque: copia ? false : !!item.destaque,
    ativo: copia ? true : item.ativo !== false,
    nomeVeiculo: item.nomeVeiculo || "",
    imagensVeiculoTexto: obterImagens(item).join("\n"),
    linkOficialVeiculo: item.linkOficialVeiculo || "",
    veiculoForaCatalogo: !!item.veiculoForaCatalogo,
    tipoVeiculo: ficha.tipoVeiculo,
    passageiros: ficha.passageiros ?? "",
    malasGrandes: ficha.malasGrandes ?? "",
    malasBordo: ficha.malasBordo ?? "",
    recursos: ficha.recursos.filter((r) => NOMES_RECURSOS_PADRAO.includes(r)),
    recursosExtras: ficha.recursos
      .filter((r) => !NOMES_RECURSOS_PADRAO.includes(r))
      .join(", "),
    tabelaPrecos: tabela.length ? tabela : [{ ...LINHA_PRECO_VAZIA }],
    configsVeiculo: [],
    ...camposEmbarcacaoELocal(item),
  };
};

const camposEmbarcacaoELocal = (item) => {
  const fe = obterFichaEmbarcacao(item);
  const fl = item?.fichaLocal || {};
  const flNorm = obterFichaLocal(item);
  return {
    tipoEmbarcacao: fe.tipoEmbarcacao,
    capacidadeEmbarcacao: fe.capacidade ?? "",
    recursosEmbarcacao: fe.recursos.filter((r) =>
      NOMES_RECURSOS_BARCO.includes(r),
    ),
    recursosEmbarcacaoExtras: fe.recursos
      .filter((r) => !NOMES_RECURSOS_BARCO.includes(r))
      .join(", "),
    roteiros: fe.roteiros,
    tipoLocal: flNorm.tipoLocal,
    endereco: flNorm.endereco,
    bairro: flNorm.bairro,
    telefone: flNorm.telefone,
    horario: flNorm.horario,
    // só o link digitado (o automático é gerado na hora a partir do endereço)
    linkMapa: String(fl.linkMapa || "").trim(),
    site: flNorm.site,
  };
};

export const recursosEmbarcacaoDoFormulario = (f) => [
  ...f.recursosEmbarcacao,
  ...f.recursosEmbarcacaoExtras
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean),
];

export const numeroDoCampo = (valor) => {
  if (valor === "" || valor === null || valor === undefined) return null;
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

export const linhasPrecoPreenchidas = (tabelaPrecos = []) =>
  tabelaPrecos
    .map((l) => ({
      servico: String(l.servico || "").trim(),
      valor: String(l.valor ?? "").trim(),
      detalhe: String(l.detalhe || "").trim(),
    }))
    .filter((l) => l.servico || l.valor);

export const recursosDoFormulario = (f) => [
  ...f.recursos,
  ...f.recursosExtras
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean),
];

const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
};

// Regras de preenchimento. Retorna mensagens por campo:
//   erros  → impedem salvar   ·   avisos → só alertam
export const validarFormulario = (f) => {
  const erros = {};
  const avisos = {};
  const formato = f.formato || FORMATOS.RESPOSTA;

  if (!f.categoria.trim()) {
    erros.categoria = "Escolha uma categoria existente ou digite uma nova.";
  }

  if (formato === FORMATOS.RESPOSTA) {
    if (!f.pergunta.trim())
      erros.pergunta = "Escreva a pergunta como o cliente faria.";
    if (!f.resposta.trim())
      erros.resposta = "Escreva a resposta que o comercial vai enviar.";
  }

  if (formato === FORMATOS.VEICULO) {
    if (!f.nomeVeiculo.trim()) erros.nomeVeiculo = "Informe o nome do veículo.";
    const link = f.linkOficialVeiculo.trim();
    if (link && !/^https?:\/\//i.test(link)) {
      erros.linkOficialVeiculo =
        "O link precisa começar com http:// ou https://";
    }
    const preenchidas = f.configsVeiculo.filter(configPreenchida);
    if (!preenchidas.length) {
      avisos.capacidade =
        "Sem capacidade, o card não mostra vagas nem malas e o veículo não aparece nas recomendações do assistente.";
    }
    f.configsVeiculo.forEach((c, i) => {
      if (!configPreenchida(c)) return;
      if (!(Number(c.paxMax) > 0)) {
        erros[`config-${i}-pax`] = "Informe quantos passageiros cabem.";
      }
      const temMalas = c.combinacoes.some(
        (x) => Number(x.grandes) > 0 || Number(x.bordo) > 0,
      );
      if (!temMalas) {
        erros[`config-${i}-malas`] = "Informe o máximo de malas que cabem.";
      }
    });
    if (Object.keys(erros).some((k) => k.startsWith("config-"))) {
      erros.capacidade = "Complete a capacidade do veículo.";
    }
  }

  if (formato === FORMATOS.TABELA) {
    if (!f.pergunta.trim()) {
      erros.pergunta =
        "Dê um título à tabela (ex.: Motoguia — valores por serviço).";
    }
    f.tabelaPrecos.forEach((l, i) => {
      const servico = String(l.servico || "").trim();
      const valor = String(l.valor ?? "").trim();
      if (servico && !valor)
        erros[`linha-${i}`] = "Falta o valor deste serviço.";
      if (!servico && valor) erros[`linha-${i}`] = "Falta o nome do serviço.";
    });
    if (linhasPrecoPreenchidas(f.tabelaPrecos).length === 0) {
      erros.tabela = "Adicione pelo menos um serviço com valor.";
    }
  }

  if (formato === FORMATOS.EMBARCACAO) {
    if (!f.pergunta.trim()) erros.pergunta = "Informe o nome da embarcação.";
  }

  if (formato === FORMATOS.LOCAL) {
    if (!f.pergunta.trim()) erros.pergunta = "Informe o nome do local.";
    if (!f.endereco.trim() && !f.bairro.trim()) {
      avisos.endereco =
        "Sem endereço, o comercial não consegue abrir o local no mapa.";
    }
    const link = f.linkMapa.trim();
    if (link && !/^https?:\/\//i.test(link)) {
      erros.linkMapa = "O link precisa começar com http:// ou https://";
    }
  }

  if (f.validade && f.validade < hojeIso()) {
    avisos.validade =
      "Essa data já passou — o comercial vai ver o item como vencido.";
  }

  return { erros, avisos };
};

// Ordem dos campos na tela (para ir até o primeiro erro).
export const ORDEM_CAMPOS = [
  "nomeVeiculo",
  "capacidade",
  "pergunta",
  "resposta",
  "categoria",
  "tabela",
  "linkOficialVeiculo",
  "linkMapa",
];

export const ROTULO_ERRO = {
  nomeVeiculo: "Nome do veículo",
  pergunta: "Pergunta / título",
  resposta: "Resposta",
  categoria: "Categoria",
  tabela: "Valores por serviço",
  linkOficialVeiculo: "Link do site oficial",
  capacidade: "Capacidade",
  linkMapa: "Link do mapa",
};
