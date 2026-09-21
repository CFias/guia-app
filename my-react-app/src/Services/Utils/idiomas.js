/* =========================================================
   IDIOMAS — usado pela escala automática.

   1) Lê o idioma dos passageiros direto do que o Phoenix devolve;
   2) compara com os idiomas que cada guia fala (cadastro do guia);
   3) fornece a sigla (EN, ES...) que aparece ao lado do passeio.

   Os ids são os mesmos de Services/languages.service.js
   (pt, en, es, fr, it, de, jp, cn) e o cadastro do guia guarda o
   NOME ("Inglês", "Espanhol"...), então aceitamos os dois.
   ========================================================= */

export const IDIOMAS = [
  { id: "pt", label: "Português", sigla: "PT", aliases: ["portugues", "portuguese", "por", "ptbr"] },
  { id: "en", label: "Inglês", sigla: "EN", aliases: ["ingles", "english", "eng", "ing"] },
  { id: "es", label: "Espanhol", sigla: "ES", aliases: ["espanhol", "espanol", "spanish", "castellano", "esp"] },
  { id: "fr", label: "Francês", sigla: "FR", aliases: ["frances", "francais", "french", "fra", "fre"] },
  { id: "it", label: "Italiano", sigla: "IT", aliases: ["italiano", "italian", "ita"] },
  { id: "de", label: "Alemão", sigla: "DE", aliases: ["alemao", "german", "deutsch", "ale", "ger", "deu"] },
  { id: "jp", label: "Japonês", sigla: "JP", aliases: ["japones", "japanese", "ja", "jpn", "jap"] },
  { id: "cn", label: "Chinês", sigla: "CN", aliases: ["chines", "chinese", "zh", "chn", "chi", "mandarim", "mandarin"] },
];

const semAcento = (t) =>
  String(t ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const MAPA_ALIAS = new Map();
IDIOMAS.forEach((i) => {
  MAPA_ALIAS.set(i.id, i.id);
  MAPA_ALIAS.set(semAcento(i.label), i.id);
  MAPA_ALIAS.set(semAcento(i.sigla), i.id);
  i.aliases.forEach((a) => MAPA_ALIAS.set(semAcento(a), i.id));
});

export const siglaDoIdioma = (id) =>
  IDIOMAS.find((i) => i.id === id)?.sigla || String(id || "").toUpperCase();

export const rotuloDoIdioma = (id) =>
  IDIOMAS.find((i) => i.id === id)?.label || String(id || "");

/* ---------------------------------------------------------
   Valor "estruturado" (campo de idioma) → id do idioma.
   Aceita "en", "EN-US", "Inglês", { code: "es" }, { name: "Spanish" }...
   --------------------------------------------------------- */
export const normalizarIdioma = (valor) => {
  if (valor === null || valor === undefined) return null;

  if (typeof valor === "object") {
    for (const chave of ["code", "iso", "iso_code", "locale", "name", "label", "nome", "description", "language"]) {
      const id = normalizarIdioma(valor[chave]);
      if (id) return id;
    }
    return null;
  }

  const t = semAcento(valor);
  if (!t) return null;
  if (MAPA_ALIAS.has(t)) return MAPA_ALIAS.get(t);

  // "pt-BR", "en_US", "english speaking" → primeiro pedaço
  return MAPA_ALIAS.get(t.split(/[-_\s]/)[0]) || null;
};

const normalizarLista = (valor) => {
  if (Array.isArray(valor)) return valor.flatMap(normalizarLista);
  if (typeof valor === "string" && /[,;/&+|]/.test(valor)) {
    return valor.split(/[,;/&+|]/).flatMap(normalizarLista);
  }
  const id = normalizarIdioma(valor);
  return id ? [id] : [];
};

const unicos = (lista) => [...new Set(lista.filter(Boolean))];

/* ---------------------------------------------------------
   Onde procurar o idioma no item do Phoenix.

   ⚠️ Se o campo do Phoenix tiver outro nome, é AQUI que se ajusta:
   basta acrescentar o caminho em CAMINHOS_IDIOMA.
   Além desses caminhos, há uma varredura automática por chaves
   com nome parecido (language, idioma, lang, locale) e, por último,
   uma leitura das observações e do nome do passeio.
   --------------------------------------------------------- */
export const CAMINHOS_IDIOMA = [
  "language", "languages", "lang", "locale", "idioma", "idiomas",
  "reserve.language", "reserve.languages", "reserve.lang", "reserve.locale", "reserve.idioma",
  "reserve.customer.language", "reserve.customer.languages", "reserve.customer.lang",
  "reserve.customer.locale", "reserve.customer.idioma",
  "customer.language", "customer.lang", "customer.locale", "customer.idioma",
  "reserveService.language", "reserveService.lang", "reserveService.locale", "reserveService.idioma",
];

const pegarCaminho = (obj, caminho) =>
  caminho.split(".").reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj);

const CHAVE_IDIOMA =
  /^(lang|language|languages|idioma|idiomas|locale)$|(^|_)(lang|language|idioma)(_?(code|name))?$/i;

// Trechos do JSON que NÃO falam do passageiro (idioma do guia, do motorista,
// da agência etc. não podem virar idioma do serviço).
const CAMINHO_IGNORADO =
  /(guide|driver|motorista|vehicle|veiculo|provider|user|seller|pdvpayment|partner|establishment|roadmap)/i;

const varrerChaves = (obj, regex, { profMax = 4, ignorar = null } = {}) => {
  const saida = [];

  const andar = (no, caminho, prof) => {
    if (!no || typeof no !== "object" || prof > profMax) return;

    for (const [chave, valor] of Object.entries(no)) {
      const p = caminho ? `${caminho}.${chave}` : chave;
      if (ignorar && ignorar.test(p)) continue;
      if (regex.test(chave)) saida.push({ caminho: p, valor });
      if (valor && typeof valor === "object") andar(valor, p, prof + 1);
    }
  };

  andar(obj, "", 0);
  return saida;
};

/* ---------------------------------------------------------
   Texto livre (observações e nome do passeio).
   Só aceita formas seguras — "DE", "IT", "FR" soltos NÃO valem
   (DE é "de" em português). Vale: palavra inteira (inglês, english...),
   sigla de 3 letras em MAIÚSCULAS (ING, ESP...) ou sigla entre
   parênteses/colchetes: (EN) [ES].
   --------------------------------------------------------- */
const PALAVRAS_TEXTO = [
  ["en", /\b(ingles|english)\b/],
  ["es", /\b(espanhol|espanol|spanish)\b/],
  ["fr", /\b(frances|francais|french)\b/],
  ["it", /\b(italiano|italian)\b/],
  ["de", /\b(alemao|german|deutsch)\b/],
  ["jp", /\b(japones|japanese)\b/],
  ["cn", /\b(chines|chinese|mandarim|mandarin)\b/],
];

const SIGLAS_MAIUSCULAS = [
  ["en", /(?<![A-Za-z])(ING|ENG)(?![A-Za-z])/],
  ["es", /(?<![A-Za-z])ESP(?![A-Za-z])/],
  ["fr", /(?<![A-Za-z])FRA(?![A-Za-z])/],
  ["it", /(?<![A-Za-z])ITA(?![A-Za-z])/],
  ["de", /(?<![A-Za-z])(ALE|GER)(?![A-Za-z])/],
  ["jp", /(?<![A-Za-z])JAP(?![A-Za-z])/],
  ["cn", /(?<![A-Za-z])CHN(?![A-Za-z])/],
];

const SIGLA_ENTRE_PARENTESES = /[([]\s*(EN|ES|FR|IT|DE|JP|CN)\s*[)\]]/gi;

const idiomasNoTexto = (texto) => {
  if (!texto || typeof texto !== "string") return [];

  const achados = [];
  const limpo = semAcento(texto);

  PALAVRAS_TEXTO.forEach(([id, re]) => re.test(limpo) && achados.push(id));
  SIGLAS_MAIUSCULAS.forEach(([id, re]) => re.test(texto) && achados.push(id));

  for (const m of texto.matchAll(SIGLA_ENTRE_PARENTESES)) {
    const id = normalizarIdioma(m[1]);
    if (id) achados.push(id);
  }

  return unicos(achados);
};

const CHAVE_OBSERVACAO = /(obs|note|remark|comment|memo|informa)/i;

const coletarTextosObservacao = (item) => {
  const textos = [];
  varrerChaves(item, CHAVE_OBSERVACAO, { profMax: 3, ignorar: CAMINHO_IGNORADO }).forEach(({ valor }) => {
    if (typeof valor === "string") textos.push(valor);
  });
  return textos;
};

/* ---------------------------------------------------------
   Idiomas do passageiro num item do Phoenix.
   Retorna { ids: ["en"], origem: "campo" | "texto" | null }.
   --------------------------------------------------------- */
export const extrairIdiomasDoItem = (item, { nomeServico = "" } = {}) => {
  if (!item || typeof item !== "object") return { ids: [], origem: null };

  // 1) caminhos conhecidos
  const dosCaminhos = unicos(
    CAMINHOS_IDIOMA.flatMap((c) => normalizarLista(pegarCaminho(item, c))),
  );
  if (dosCaminhos.length) return { ids: dosCaminhos, origem: "campo" };

  // 2) varredura por chaves com nome parecido
  const daVarredura = unicos(
    varrerChaves(item, CHAVE_IDIOMA, { ignorar: CAMINHO_IGNORADO }).flatMap(({ valor }) =>
      normalizarLista(valor),
    ),
  );
  if (daVarredura.length) return { ids: daVarredura, origem: "campo" };

  // 3) texto: observações e nome do passeio
  const doTexto = unicos([
    ...coletarTextosObservacao(item).flatMap(idiomasNoTexto),
    ...idiomasNoTexto(nomeServico),
  ]);
  if (doTexto.length) return { ids: doTexto, origem: "texto" };

  return { ids: [], origem: null };
};

// Ajuda a descobrir o nome real do campo quando nada é detectado.
export const listarCamposParecidosComIdioma = (item) =>
  varrerChaves(item, CHAVE_IDIOMA, { profMax: 5 }).map(({ caminho, valor }) => ({
    caminho,
    valor: typeof valor === "object" ? JSON.stringify(valor).slice(0, 80) : String(valor),
  }));

/* ---------------------------------------------------------
   Acúmulo por serviço: { en: 3, es: 2 } = pax por idioma ESTRANGEIRO.
   (Português não entra: é o padrão e não pede nada especial.)
   --------------------------------------------------------- */
export const acumularIdiomas = (mapa, ids = [], pax = 0) => {
  ids.forEach((id) => {
    if (!id || id === "pt") return;
    mapa[id] = Number(mapa[id] || 0) + Math.max(Number(pax) || 0, 1);
  });
  return mapa;
};

export const somarMapasIdiomas = (a = {}, b = {}) => {
  const saida = { ...(a || {}) };
  Object.entries(b || {}).forEach(([id, n]) => {
    saida[id] = Number(saida[id] || 0) + Number(n || 0);
  });
  return saida;
};

// Idiomas estrangeiros pedidos pelo serviço, do mais para o menos pax.
export const listarIdiomasExigidos = (mapa) =>
  Object.entries(mapa || {})
    .filter(([id, n]) => id !== "pt" && Number(n) > 0)
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return IDIOMAS.findIndex((i) => i.id === a[0]) - IDIOMAS.findIndex((i) => i.id === b[0]);
    })
    .map(([id]) => id);

/* ---------------------------------------------------------
   Guia
   --------------------------------------------------------- */
export const idiomasDoGuia = (guia) => {
  const lista = Array.isArray(guia?.idiomas) ? guia.idiomas : [];
  const ids = new Set(lista.map(normalizarIdioma).filter(Boolean));
  ids.add("pt"); // todo guia atende em português
  return ids;
};

export const siglasDoGuia = (guia) =>
  [...idiomasDoGuia(guia)].filter((id) => id !== "pt").map(siglaDoIdioma);

// Quanto o guia atende os idiomas pedidos pelo serviço.
export const avaliarMatchIdioma = (guia, exigidos = []) => {
  if (!exigidos.length) {
    return { exige: false, cobrePrincipal: true, cobreTodos: true, faltantes: [] };
  }

  const falados = idiomasDoGuia(guia);
  const faltantes = exigidos.filter((id) => !falados.has(id));

  return {
    exige: true,
    cobrePrincipal: falados.has(exigidos[0]),
    cobreTodos: faltantes.length === 0,
    faltantes,
  };
};
