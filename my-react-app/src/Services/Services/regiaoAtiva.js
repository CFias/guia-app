// regiaoAtiva.js
//
// REGIÃO ATIVA (base Luck) da sessão — de onde vêm os dados do Phoenix.
//
// - Salvador é a SEDE: tudo funciona como sempre (cadastros, escala, custos…).
// - As outras bases (cadastradas em Gestão → Regiões, settings/regioes) usam
//   só algumas telas, com os dados do Phoenix delas.
// - Quem decide a região: o campo `regiao` da conta (users/{uid}.regiao). A
//   gerência pode trocar a região no topo da tela.
//
// Fica num módulo comum (e não só no React) porque as URLs do Phoenix são
// montadas em funções soltas espalhadas pelo app: todas chamam
// phoenixReserveService() na hora da busca. O RegiaoProvider mantém isto em
// dia e remonta as telas quando a região muda.

export const ID_SEDE = "ssa";

export const PHOENIX_SEDE = "https://driversalvador.phoenix.comeialabs.com";

export const SEDE = Object.freeze({
  id: ID_SEDE,
  nome: "Salvador",
  sigla: "SSA",
  phoenix: PHOENIX_SEDE,
  aeroporto: true,
  ativa: true,
  telas: null, // null = todas
});

// TODAS as telas de Salvador, na ordem do menu. A gerência escolhe em
// Gestão → Regiões quais ficam visíveis em cada base. As marcadas com
// pronta: false ainda estão sendo adaptadas para usar os cadastros da base
// (aparecem como "Em breve" e não podem ser marcadas). Mesmas chaves de
// Context/acessos.js.
export const TELAS_REGIONAIS = [
  {
    grupo: "Início",
    chave: "dashboard",
    label: "Hoje",
    detalhe: "Serviços do dia, indicadores e guias da base.",
    pronta: true,
  },
  {
    grupo: "Operação",
    chave: "painelOperacional",
    label: "Painel do dia",
    detalhe: "Chegadas, saídas, transfers, resumo por guia, mapa e placas.",
    pronta: true,
  },
  {
    grupo: "Operação",
    chave: "painelAtendimento",
    label: "Aeroporto",
    detalhe: "Recepção e embarque no aeroporto (contas liberadas).",
    pronta: true,
  },
  {
    grupo: "Operação",
    chave: "previas",
    label: "Envio aos fornecedores · Prévia",
    detalhe: "Prévia do dia para os fornecedores da base.",
    pronta: true,
  },
  {
    grupo: "Operação",
    chave: "planilha",
    label: "Envio aos fornecedores · Planilha",
    detalhe: "A planilha do dia (mesma base da prévia).",
    pronta: true,
  },
  {
    grupo: "Guias",
    chave: "gerarEscala",
    label: "Escala de passeios",
    detalhe: "Escala automática da semana.",
    pronta: false,
  },
  {
    grupo: "Guias",
    chave: "listaGuias",
    label: "Guias · Lista",
    detalhe: "Guias da base: dados, idiomas, foto e afinidade.",
    pronta: true,
  },
  {
    grupo: "Guias",
    chave: "mapaAfinidade",
    label: "Guias · Afinidade",
    detalhe: "Nível de cada guia em cada passeio.",
    pronta: false,
  },
  {
    grupo: "Guias",
    chave: "disponibilidade",
    label: "Guias · Disponibilidade",
    detalhe: "O que cada guia enviou.",
    pronta: false,
  },
  {
    grupo: "Equipe e custos",
    chave: "custos",
    label: "Custos e alterações",
    detalhe:
      "Custos, tarifas e auditor de alterações da base (tarifário próprio).",
    pronta: true,
  },
  {
    grupo: "Equipe e custos",
    chave: "demandaTurnos",
    label: "Escala da equipe",
    detalhe: "Turnos e equipe próprios da base.",
    pronta: true,
  },
  {
    grupo: "Equipe e custos",
    chave: "servicosFornecedor",
    label: "Serviços por fornecedor",
    detalhe: "Serviços de cada fornecedor da base.",
    pronta: false,
  },
  {
    grupo: "Administração",
    chave: "cadastros",
    label: "Cadastros",
    detalhe: "Guias, passeios e fornecedores da base (começa vazio).",
    pronta: true,
  },
  {
    grupo: "Administração",
    chave: "centralInformacoes",
    label: "Central de informações · Edição",
    detalhe: "Edição do que o comercial vê.",
    pronta: false,
  },
  {
    grupo: "Administração",
    chave: "verComercial",
    label: "Central de informações · Como o comercial vê",
    detalhe: "Central vista pelo comercial.",
    pronta: false,
  },
];
// as que já podem ser liberadas
export const TELAS_PRONTAS = TELAS_REGIONAIS.filter((t) => t.pronta);

// Rotas que dependem de algo só de Salvador (painel do aeroporto de SSA).
export const ROTAS_SO_SEDE = ["/conferencia"];

let atual = SEDE;

export const regiaoAtual = () => atual;
export const ehSede = (r = atual) => !r || r.id === ID_SEDE;

export const definirRegiaoAtual = (r) => {
  atual = r && r.id ? r : SEDE;
};

// Todas as bases seguem o mesmo padrão: driver<base>.phoenix.comeialabs.com
// (driversalvador, driverrecife…). Aceita:
//   "recife" ou "driverrecife"           → https://driverrecife.phoenix.comeialabs.com
//   o link completo de qualquer endpoint → só a origem
export const DOMINIO_PHOENIX = "phoenix.comeialabs.com";

export const normalizarLinkPhoenix = (link = "") => {
  const texto = String(link || "").trim();
  if (!texto) return "";
  const nome = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "");
  if (/^[a-z0-9-]+$/.test(nome))
    return `https://${nome.startsWith("driver") ? nome : `driver${nome}`}.${DOMINIO_PHOENIX}`;
  try {
    const url = new URL(
      /^https?:\/\//i.test(texto) ? texto : `https://${texto}`,
    );
    return url.origin;
  } catch {
    return "";
  }
};

const origemPhoenix = (r = atual) =>
  normalizarLinkPhoenix(r?.phoenix) || PHOENIX_SEDE;

export const phoenixReserveService = (r = atual) =>
  `${origemPhoenix(r)}/scale/reserve-service`;

// Documento de configuração por região: Salvador mantém o nome de sempre
// (nada muda para quem já usa), as outras bases ganham o sufixo.
// settings/turnos_equipe → settings/turnos_equipe__nat
export const idPorRegiao = (base, r = atual) =>
  ehSede(r) ? base : `${base}__${r.id}`;

// Coleção de cadastros por região: cada base tem os seus (guias, passeios,
// disponibilidade, afinidade, escala da semana…). Salvador continua com as
// coleções de sempre; as outras bases ganham o sufixo.
// guides → guides__nat   (ver Services/Services/dadosBase.js)
export const colecaoDaBase = (nome, r = atual) =>
  ehSede(r) ? nome : `${nome}__${r.id}`;
