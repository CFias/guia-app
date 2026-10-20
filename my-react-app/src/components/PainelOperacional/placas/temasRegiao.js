// temasRegiao.js
//
// Tema das placas de cada base Luck: cidade e estado (subtítulo e mensagem
// de boas-vindas) e os modelos prontos com os pontos turísticos da base.
// Todas as bases também têm os modelos do NORDESTE (praia, #VouDeLuck,
// jangada, cordel, sertão, São João, Carnaval).
//
// A base em uso vem de regiaoAtiva.js. Qual tema a base usa:
// 1. o escolhido em Gestão → Regiões (campo `tema`);
// 2. senão, pelo nome/sigla da base (Natal → nat, "Porto de Galinhas" → rec…);
// 3. senão, um tema genérico com o nome da base e só os modelos do Nordeste.

import { regiaoAtual } from "../../../Services/Services/regiaoAtiva";

const m = (id, nome, desenho, posicao = "direita", extra = {}) => ({
  id,
  nome,
  desenho,
  posicao,
  ...extra,
});

export const MODELOS_NORDESTE = [
  m("praia", "Praia", "praia", "base", { novo: true }),
  m("vou_de_luck", "#VouDeLuck", "voudeluck", "base", { novo: true }),
  m("jangada", "Jangada", "jangada", "base"),
  m("cordel", "Cordel", "cordel", "base", { moldura: "fina" }),
  m("sertao", "Sertão", "sertao", "direita", { novo: true }),
  m("sao_joao", "São João", "saojoao", "base", { epoca: "Junho" }),
  m("carnaval", "Carnaval", "carnaval", "base", { epoca: "Fev/Mar" }),
];

const BAHIA = [
  m("capoeira", "Capoeira", "berimbau"),
  m("baiana", "Baiana", "baiana"),
];

export const TEMAS = {
  ssa: {
    cidade: "Salvador",
    estado: "Bahia",
    uf: "BA",
    modelos: [
      m("farol", "Farol da Barra", "farol"),
      m("bonfim", "Senhor do Bonfim", "bonfim"),
      m("pelourinho", "Pelourinho", "pelourinho", "base"),
      m("orla", "Orla", "orla", "base"),
      m("fitinhas", "Fitinhas do Bonfim", "fitinhas", "base"),
      m("moldura_fitas", "Moldura de fitas", "fitinhas", "laterais"),
      ...BAHIA,
      m("elevador", "Elevador Lacerda", "elevador"),
      m("praia_do_forte", "Praia do Forte", "tartaruga"),
      m("azulejos", "Azulejos", "azulejos", "base"),
    ],
  },
  nat: {
    cidade: "Natal",
    estado: "Rio Grande do Norte",
    uf: "RN",
    apelidos: ["pipa", "genipabu", "sao miguel do gostoso"],
    modelos: [
      m("reis_magos", "Forte dos Reis Magos", "reismagos", "direita", {
        novo: true,
      }),
      m("morro_careca", "Morro do Careca", "morrocareca", "direita", {
        novo: true,
      }),
      m("cajueiro", "Cajueiro de Pirangi", "cajueiro", "direita", {
        novo: true,
      }),
    ],
  },
  rec: {
    cidade: "Recife",
    estado: "Pernambuco",
    uf: "PE",
    preposicao: "ao", // "Bem-vindo ao Recife" (o Recife leva artigo)
    apelidos: ["olinda", "porto de galinhas", "ipojuca", "carneiros"],
    modelos: [
      m("frevo", "Frevo", "frevo", "direita", { novo: true }),
      m("olinda", "Olinda", "olinda", "base", { novo: true }),
      m("porto_galinhas", "Porto de Galinhas", "portogalinhas", "direita", {
        novo: true,
      }),
    ],
  },
  mcz: {
    cidade: "Maceió",
    estado: "Alagoas",
    uf: "AL",
    apelidos: ["maragogi", "gunga", "pajucara", "sao miguel dos milagres"],
    modelos: [
      m("pajucara", "Piscinas de Pajuçara", "pajucara", "direita", {
        novo: true,
      }),
      m("gunga", "Praia do Gunga", "gunga", "base", { novo: true }),
    ],
  },
  for: {
    cidade: "Fortaleza",
    estado: "Ceará",
    uf: "CE",
    apelidos: ["jericoacoara", "jeri", "canoa quebrada", "cumbuco"],
    modelos: [
      m("ponte_ingleses", "Ponte dos Ingleses", "ponteingleses", "base", {
        novo: true,
      }),
      m("pedra_furada", "Pedra Furada", "pedrafurada", "direita", {
        novo: true,
      }),
    ],
  },
  jpa: {
    cidade: "João Pessoa",
    estado: "Paraíba",
    uf: "PB",
    apelidos: ["joao pessoa", "cabo branco", "jacare"],
    modelos: [
      m("cabo_branco", "Farol do Cabo Branco", "cabobranco", "direita", {
        novo: true,
      }),
      m("jacare", "Pôr do sol do Jacaré", "jacare", "direita", { novo: true }),
    ],
  },
  aju: {
    cidade: "Aracaju",
    estado: "Sergipe",
    uf: "SE",
    apelidos: ["xingo", "caninde"],
    modelos: [
      m("caranguejo", "Passarela do Caranguejo", "caranguejo", "direita", {
        novo: true,
      }),
      m("xingo", "Cânion do Xingó", "xingo", "base", { novo: true }),
    ],
  },
  bps: {
    cidade: "Porto Seguro",
    estado: "Bahia",
    uf: "BA",
    apelidos: ["arraial d'ajuda", "arraial dajuda", "trancoso"],
    modelos: [
      m("caravela", "Caravela do Descobrimento", "caravela", "direita", {
        novo: true,
      }),
      ...BAHIA,
    ],
  },
};

// opções para o campo "Tema das placas" em Gestão → Regiões
export const OPCOES_TEMA = Object.entries(TEMAS).map(([id, t]) => ({
  id,
  label: `${t.cidade} · ${t.uf}`,
}));

const semAcento = (t = "") =>
  String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// tema pelo nome/sigla da base, quando não foi escolhido
// O NOME da base manda: o código (id) não muda quando a base é renomeada
// (ex.: um cadastro criado como "Recife" e depois trocado para "Maceió"
// continua com o código "rec"), então ele só é usado se o nome não disser nada.
export const acharTemaPorNome = (regiao = {}) => {
  const nome = semAcento(regiao.nome);
  const id = semAcento(regiao.id);
  const entradas = Object.entries(TEMAS);
  const exato = entradas.find(([, t]) => semAcento(t.cidade) === nome);
  if (exato) return exato[0];
  const contem = entradas.find(
    ([, t]) => nome && nome.includes(semAcento(t.cidade)),
  );
  if (contem) return contem[0];
  const apelido = entradas.find(
    ([, t]) => nome && (t.apelidos || []).some((a) => nome.includes(a)),
  );
  if (apelido) return apelido[0];
  return TEMAS[id] ? id : "";
};

export const temaDaRegiao = (regiao = regiaoAtual()) => {
  const id =
    (regiao?.tema && TEMAS[regiao.tema] && regiao.tema) ||
    acharTemaPorNome(regiao);
  if (id) return { id, preposicao: "a", ...TEMAS[id] };
  return {
    id: "",
    cidade: regiao?.nome || "Nordeste",
    estado: "",
    uf: "",
    preposicao: "a",
    modelos: [],
  };
};

export const subtituloDoTema = (tema = temaDaRegiao()) =>
  [tema.cidade, tema.estado].filter(Boolean).join(" · ");
