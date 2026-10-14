// ilustracoes.js
//
// Ilustrações vetoriais (desenhadas para a Central de Informações) usadas
// como capa dos cards quando o cadastro não tem foto. Cada uma é o miolo de
// um SVG 96×96 (conteúdo fixo, nosso — nada vem do usuário) e uma cor de
// fundo. A escolha é automática pela categoria (ou pelo tipo do cadastro);
// no cadastro dá para fixar outra em "Complementos".

export const ILUSTRACOES = {
  politica: {
    nome: "Política",
    fundo: "#e7edfb",
    svg: '<ellipse cx="48" cy="84" rx="26" ry="4" fill="#000" opacity=".08"/><rect x="24" y="14" width="44" height="58" rx="6" fill="#fff" stroke="#c9d3ea" stroke-width="2"/><path d="M56 14h6a6 6 0 0 1 6 6v6h-8a4 4 0 0 1-4-4z" fill="#dfe6f6"/><rect x="32" y="26" width="22" height="4" rx="2" fill="#3b5bdb"/><rect x="32" y="36" width="28" height="3" rx="1.5" fill="#c9d3ea"/><rect x="32" y="43" width="26" height="3" rx="1.5" fill="#c9d3ea"/><rect x="32" y="50" width="20" height="3" rx="1.5" fill="#c9d3ea"/><path d="M58 66l-5 14 6-3 5 4 1-15z" fill="#c92a2a"/><path d="M66 66l5 14-6-3-5 4-1-15z" fill="#e03131"/><circle cx="62" cy="62" r="11" fill="#fa5252"/><circle cx="62" cy="62" r="7.5" fill="none" stroke="#fff" stroke-width="1.6" stroke-dasharray="2 2"/><path d="M58.5 62l2.5 2.6 4.5-5" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  bagagem: {
    nome: "Bagagem",
    fundo: "#fdf0d9",
    svg: '<ellipse cx="48" cy="84" rx="26" ry="4" fill="#000" opacity=".08"/><rect x="38" y="12" width="20" height="12" rx="5" fill="none" stroke="#8a5a14" stroke-width="4"/><rect x="20" y="22" width="56" height="52" rx="9" fill="#f59f00"/><rect x="20" y="22" width="56" height="12" rx="9" fill="#fab005"/><rect x="31" y="22" width="6" height="52" fill="#d9480f" opacity=".85"/><rect x="59" y="22" width="6" height="52" fill="#d9480f" opacity=".85"/><rect x="44" y="44" width="8" height="8" rx="2" fill="#8a5a14"/><circle cx="30" cy="79" r="4" fill="#495057"/><circle cx="66" cy="79" r="4" fill="#495057"/>',
  },
  valores: {
    nome: "Cotação / valores",
    fundo: "#fff4cc",
    svg: '<ellipse cx="48" cy="84" rx="26" ry="4" fill="#000" opacity=".08"/><rect x="14" y="40" width="44" height="26" rx="4" fill="#40c057" transform="rotate(-10 36 53)"/><circle cx="36" cy="53" r="7" fill="none" stroke="#d3f9d8" stroke-width="2" transform="rotate(-10 36 53)"/><ellipse cx="62" cy="70" rx="17" ry="5" fill="#e8a400"/><rect x="45" y="62" width="34" height="8" fill="#e8a400"/><ellipse cx="62" cy="62" rx="17" ry="5" fill="#fcc419"/><ellipse cx="62" cy="58" rx="17" ry="5" fill="#e8a400"/><rect x="45" y="50" width="34" height="8" fill="#e8a400"/><ellipse cx="62" cy="50" rx="17" ry="5" fill="#fcc419"/><circle cx="64" cy="30" r="15" fill="#fab005"/><circle cx="64" cy="30" r="11" fill="#fcc419"/><text x="64" y="36" text-anchor="middle" font-family="Arial" font-weight="900" font-size="16" fill="#e67700">$</text>',
  },
  taxas: {
    nome: "Taxas",
    fundo: "#dff5f6",
    svg: '<ellipse cx="48" cy="84" rx="26" ry="4" fill="#000" opacity=".08"/><path d="M16 28a4 4 0 0 1 4-4h56a4 4 0 0 1 4 4v8a6 6 0 0 0 0 12v8a4 4 0 0 1-4 4H20a4 4 0 0 1-4-4v-8a6 6 0 0 0 0-12z" fill="#15aabf"/><path d="M58 26v34" stroke="#fff" stroke-width="2" stroke-dasharray="3 3"/><rect x="24" y="33" width="26" height="4" rx="2" fill="#e3fafc"/><rect x="24" y="41" width="18" height="3" rx="1.5" fill="#99e9f2"/><rect x="24" y="48" width="22" height="3" rx="1.5" fill="#99e9f2"/><text x="69" y="49" text-anchor="middle" font-family="Arial" font-weight="900" font-size="15" fill="#fff">%</text>',
  },
  crianca: {
    nome: "Criança",
    fundo: "#fde4ef",
    svg: '<ellipse cx="48" cy="84" rx="26" ry="4" fill="#000" opacity=".08"/><path d="M22 46h48a0 0 0 0 1 0 0 18 18 0 0 1-18 18H40a18 18 0 0 1-18-18z" fill="#f06595"/><path d="M22 46a24 24 0 0 1 24-24v24z" fill="#faa2c1"/><path d="M46 22a24 24 0 0 1 3 0l-3 24z" fill="#f783ac"/><path d="M70 46l8-14" stroke="#495057" stroke-width="4" stroke-linecap="round"/><circle cx="32" cy="74" r="6" fill="#495057"/><circle cx="32" cy="74" r="2.5" fill="#dee2e6"/><circle cx="60" cy="74" r="6" fill="#495057"/><circle cx="60" cy="74" r="2.5" fill="#dee2e6"/><circle cx="34" cy="54" r="2" fill="#fff" opacity=".7"/><circle cx="44" cy="56" r="2" fill="#fff" opacity=".7"/><circle cx="54" cy="54" r="2" fill="#fff" opacity=".7"/>',
  },
  veiculo: {
    nome: "Veículo",
    fundo: "#dff3ef",
    svg: '<ellipse cx="48" cy="84" rx="26" ry="4" fill="#000" opacity=".08"/><path d="M12 62V36a8 8 0 0 1 8-8h42a8 8 0 0 1 6 3l12 14a8 8 0 0 1 2 5v12z" fill="#12b886"/><rect x="12" y="56" width="70" height="10" rx="4" fill="#099268"/><rect x="20" y="34" width="12" height="12" rx="2" fill="#c3fae8"/><rect x="36" y="34" width="12" height="12" rx="2" fill="#c3fae8"/><rect x="52" y="34" width="10" height="12" rx="2" fill="#c3fae8"/><path d="M66 34h1a4 4 0 0 1 3 1.5l7 9.5H66z" fill="#c3fae8"/><circle cx="28" cy="68" r="8" fill="#343a40"/><circle cx="28" cy="68" r="3.5" fill="#ced4da"/><circle cx="66" cy="68" r="8" fill="#343a40"/><circle cx="66" cy="68" r="3.5" fill="#ced4da"/><rect x="78" y="52" width="4" height="4" rx="1" fill="#ffd43b"/>',
  },
  motoguia: {
    nome: "Motoguia",
    fundo: "#ece6fd",
    svg: '<ellipse cx="48" cy="84" rx="26" ry="4" fill="#000" opacity=".08"/><path d="M10 64v-8a6 6 0 0 1 5-6l9-2 9-11a8 8 0 0 1 6-3h18a8 8 0 0 1 6 2.6L73 48l9 2a6 6 0 0 1 5 6v8z" fill="#7950f2"/><rect x="10" y="58" width="77" height="8" rx="4" fill="#5f3dc4"/><path d="M30 48l7-9a4 4 0 0 1 3-1.5h7V48z" fill="#e5dbff"/><path d="M51 37.5h6a4 4 0 0 1 3 1.4L67 48H51z" fill="#e5dbff"/><circle cx="27" cy="67" r="8" fill="#343a40"/><circle cx="27" cy="67" r="3.5" fill="#ced4da"/><circle cx="70" cy="67" r="8" fill="#343a40"/><circle cx="70" cy="67" r="3.5" fill="#ced4da"/><path d="M62 34V12" stroke="#495057" stroke-width="2.5" stroke-linecap="round"/><path d="M62 12h16l-4 5 4 5H62z" fill="#ff922b"/><circle cx="22" cy="22" r="9" fill="#ffd8a8"/><path d="M13 21a9 9 0 0 1 18 0z" fill="#495057"/><path d="M12 40a10 10 0 0 1 20 0z" fill="#ff922b"/>',
  },
  embarcacao: {
    nome: "Embarcação",
    fundo: "#e0edfd",
    svg: '<ellipse cx="48" cy="84" rx="26" ry="4" fill="#000" opacity=".08"/><path d="M48 10v44" stroke="#495057" stroke-width="3" stroke-linecap="round"/><path d="M51 14l22 36H51z" fill="#fff" stroke="#d0ebff" stroke-width="2"/><path d="M45 20L28 50h17z" fill="#ffd43b"/><path d="M14 56h68l-8 14H24z" fill="#1c7ed6"/><rect x="22" y="58" width="52" height="4" rx="2" fill="#4dabf7"/><path d="M48 10l10 4-10 4z" fill="#fa5252"/><path d="M8 76c6 0 6-4 12-4s6 4 12 4 6-4 12-4 6 4 12 4 6-4 12-4 6 4 12 4" stroke="#74c0fc" stroke-width="3" fill="none" stroke-linecap="round"/>',
  },
  local: {
    nome: "Local",
    fundo: "#fde3e1",
    svg: '<path d="M14 66l20-8 28 8 20-8v18l-20 8-28-8-20 8z" fill="#c3fae8"/><path d="M34 58v18l28 8V66z" fill="#96f2d7"/><path d="M14 66l20-8M62 66l20-8" stroke="#63e6be" stroke-width="1.5"/><path d="M48 70S28 50 28 34a20 20 0 0 1 40 0c0 16-20 36-20 36z" fill="#fa5252"/><circle cx="48" cy="34" r="8" fill="#fff"/><ellipse cx="48" cy="72" rx="6" ry="2" fill="#000" opacity=".15"/>',
  },
  equipamento: {
    nome: "Equipamento",
    fundo: "#e3f6e8",
    svg: '<ellipse cx="48" cy="84" rx="26" ry="4" fill="#000" opacity=".08"/><path d="M26 18a8 8 0 0 1 8-8h8a8 8 0 0 1 8 8v26H26z" fill="#37b24d"/><path d="M22 42h40a8 8 0 0 1 8 8v8a6 6 0 0 1-6 6H28a6 6 0 0 1-6-6z" fill="#2f9e44"/><rect x="30" y="16" width="16" height="22" rx="5" fill="#8ce99a"/><path d="M70 50c6-10 4-22-6-28" stroke="#495057" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M30 46l8 10 8-10" stroke="#ffd43b" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="18" y="66" width="56" height="8" rx="4" fill="#495057"/>',
  },
  horario: {
    nome: "Horários",
    fundo: "#ebe6fd",
    svg: '<ellipse cx="48" cy="84" rx="26" ry="4" fill="#000" opacity=".08"/><circle cx="30" cy="20" r="7" fill="#9775fa"/><circle cx="66" cy="20" r="7" fill="#9775fa"/><circle cx="48" cy="46" r="28" fill="#7950f2"/><circle cx="48" cy="46" r="22" fill="#fff"/><path d="M48 30v16l10 6" stroke="#343a40" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="48" cy="46" r="3" fill="#fa5252"/><path d="M30 72l-4 6M66 72l4 6" stroke="#7950f2" stroke-width="4" stroke-linecap="round"/>',
  },
  hotel: {
    nome: "Hotel",
    fundo: "#fde8d9",
    svg: '<ellipse cx="48" cy="84" rx="26" ry="4" fill="#000" opacity=".08"/><rect x="24" y="14" width="48" height="64" rx="4" fill="#fd7e14"/><rect x="24" y="14" width="48" height="8" rx="4" fill="#e8590c"/><g fill="#fff3bf"><rect x="31" y="28" width="8" height="8" rx="1.5"/><rect x="44" y="28" width="8" height="8" rx="1.5"/><rect x="57" y="28" width="8" height="8" rx="1.5"/><rect x="31" y="42" width="8" height="8" rx="1.5"/><rect x="44" y="42" width="8" height="8" rx="1.5"/><rect x="57" y="42" width="8" height="8" rx="1.5"/></g><path d="M36 60h24l3 6H33z" fill="#c92a2a"/><rect x="42" y="66" width="12" height="12" fill="#862e9c" opacity=".85"/><text x="48" y="20.5" text-anchor="middle" font-family="Arial" font-weight="900" font-size="6" fill="#fff">HOTEL</text>',
  },
  idiomas: {
    nome: "Idiomas",
    fundo: "#e0f1fd",
    svg: '<ellipse cx="48" cy="84" rx="26" ry="4" fill="#000" opacity=".08"/><circle cx="40" cy="44" r="24" fill="#339af0"/><path d="M40 20c-8 7-8 41 0 48M40 20c8 7 8 41 0 48M17 44h46M20 32h40M20 56h40" stroke="#d0ebff" stroke-width="2" fill="none"/><path d="M58 16h24a6 6 0 0 1 6 6v12a6 6 0 0 1-6 6h-14l-8 6v-6h-2a6 6 0 0 1-6-6V22a6 6 0 0 1 6-6z" fill="#fff" stroke="#a5d8ff" stroke-width="2"/><text x="70" y="33" text-anchor="middle" font-family="Arial" font-weight="900" font-size="11" fill="#1c7ed6">Aa</text>',
  },
  documento: {
    nome: "Documento",
    fundo: "#e6ecf5",
    svg: '<ellipse cx="48" cy="84" rx="26" ry="4" fill="#000" opacity=".08"/><rect x="14" y="22" width="68" height="46" rx="7" fill="#fff" stroke="#c5d0e0" stroke-width="2"/><rect x="14" y="22" width="68" height="11" rx="7" fill="#4c6ef5"/><rect x="14" y="28" width="68" height="5" fill="#4c6ef5"/><circle cx="32" cy="48" r="8" fill="#dbe4ff"/><circle cx="32" cy="46" r="3.5" fill="#748ffc"/><path d="M25.5 54a7 7 0 0 1 13 0z" fill="#748ffc"/><rect x="46" y="41" width="28" height="4" rx="2" fill="#343a40"/><rect x="46" y="49" width="22" height="3" rx="1.5" fill="#ced4da"/><rect x="46" y="56" width="18" height="3" rx="1.5" fill="#ced4da"/>',
  },
  ingresso: {
    nome: "Ingresso",
    fundo: "#fff0e0",
    svg: '<ellipse cx="48" cy="84" rx="26" ry="4" fill="#000" opacity=".08"/><g transform="rotate(-12 48 46)"><path d="M14 30a4 4 0 0 1 4-4h60a4 4 0 0 1 4 4v7a7 7 0 0 0 0 14v7a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4v-7a7 7 0 0 0 0-14z" fill="#ff922b"/><path d="M62 28v32" stroke="#fff" stroke-width="2" stroke-dasharray="3 3"/><path d="M38 34l3.2 6.5 7.1 1-5.1 5 1.2 7-6.4-3.3-6.4 3.3 1.2-7-5.1-5 7.1-1z" fill="#fff"/><rect x="66" y="38" width="10" height="3" rx="1.5" fill="#ffe8cc"/><rect x="66" y="45" width="8" height="3" rx="1.5" fill="#ffe8cc"/></g>',
  },
  duvida: {
    nome: "Dúvidas gerais",
    fundo: "#dff3ef",
    svg: '<ellipse cx="48" cy="84" rx="26" ry="4" fill="#000" opacity=".08"/><path d="M18 18h60a8 8 0 0 1 8 8v30a8 8 0 0 1-8 8H44l-14 12V64H18a8 8 0 0 1-8-8V26a8 8 0 0 1 8-8z" fill="#12b886"/><path d="M40 34a8 8 0 1 1 11 7.4c-2 .8-3 2.3-3 4.6v1" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="48" cy="55" r="3" fill="#fff"/>',
  },
  ilha: {
    nome: "Ilha / praia",
    fundo: "#e3f4ff",
    svg: '<ellipse cx="48" cy="84" rx="28" ry="4" fill="#000" opacity=".08"/><circle cx="72" cy="22" r="9" fill="#fcc419"/><path d="M8 66q40-10 80 0v12H8z" fill="#4dabf7"/><path d="M20 67q28-22 56 0z" fill="#ffd8a8"/><path d="M47 63q1-18 6-29" stroke="#8a5a14" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M53 34q-12-5-21 4q10-2 21-4z" fill="#2f9e44"/><path d="M53 34q10-9 23-2q-12 0-23 2z" fill="#37b24d"/><path d="M53 34q-4-12 4-19q-2 10-4 19z" fill="#40c057"/><path d="M53 34q12 2 17 12q-8-8-17-12z" fill="#2f9e44"/><path d="M14 74q6-3 12 0t12 0 12 0 12 0 12 0" stroke="#fff" stroke-width="2" fill="none" opacity=".7"/>',
  },
  farol: {
    nome: "Morro / farol",
    fundo: "#e6fcf5",
    svg: '<ellipse cx="48" cy="84" rx="28" ry="4" fill="#000" opacity=".08"/><path d="M6 78q22-28 42-28t42 28z" fill="#69db7c"/><path d="M56 18l28-9v18z" fill="#ffe066" opacity=".6"/><path d="M40 18l-28-9v18z" fill="#ffe066" opacity=".6"/><path d="M42 23h12l4 40H38z" fill="#fff" stroke="#dee2e6" stroke-width="1.5"/><path d="M40.6 36h14.8l.9 8H39.7z" fill="#fa5252"/><path d="M39.2 52h17.6l.9 8H38.3z" fill="#fa5252"/><rect x="40" y="14" width="16" height="9" rx="2" fill="#495057"/><rect x="43" y="16" width="10" height="5" fill="#ffe066"/><path d="M38 14h20l-10-8z" fill="#c92a2a"/>',
  },
  igreja: {
    nome: "Igreja / roteiro da fé",
    fundo: "#fff4e6",
    svg: '<ellipse cx="48" cy="84" rx="28" ry="4" fill="#000" opacity=".08"/><rect x="46.5" y="5" width="3" height="14" fill="#868e96"/><rect x="42.5" y="8.5" width="11" height="3" fill="#868e96"/><path d="M22 38L48 19l26 19z" fill="#f08c00"/><rect x="26" y="37" width="44" height="42" fill="#fff" stroke="#f1e3d3" stroke-width="1.5"/><circle cx="48" cy="47" r="5" fill="#74c0fc"/><rect x="31" y="52" width="5" height="11" rx="2.5" fill="#74c0fc"/><rect x="60" y="52" width="5" height="11" rx="2.5" fill="#74c0fc"/><path d="M41 79V62a7 7 0 0 1 14 0v17z" fill="#1971c2"/>',
  },
  atabaque: {
    nome: "Cultura afro / axé",
    fundo: "#fff0f6",
    svg: '<ellipse cx="48" cy="84" rx="28" ry="4" fill="#000" opacity=".08"/><path d="M29 22h38l-7 56H36z" fill="#d9480f"/><path d="M31 28l6 17 6-17 6 17 6-17 6 17 5-15" stroke="#ffe8cc" stroke-width="2" fill="none" stroke-linejoin="round"/><path d="M33.5 51h29l-.7 6H34.2z" fill="#fab005"/><rect x="35" y="71" width="26" height="7" rx="2" fill="#862e9c"/><ellipse cx="48" cy="22" rx="19" ry="5.5" fill="#ffe8cc" stroke="#8a5a14" stroke-width="2"/>',
  },
  casario: {
    nome: "Centro histórico",
    fundo: "#fff9db",
    svg: '<ellipse cx="48" cy="84" rx="28" ry="4" fill="#000" opacity=".08"/><rect x="12" y="38" width="22" height="40" fill="#ff922b"/><rect x="34" y="28" width="26" height="50" fill="#4dabf7"/><rect x="60" y="40" width="24" height="38" fill="#f06595"/><rect x="10" y="34" width="26" height="5" rx="1" fill="#e8590c"/><rect x="32" y="24" width="30" height="5" rx="1" fill="#1c7ed6"/><rect x="58" y="36" width="28" height="5" rx="1" fill="#d6336c"/><g fill="#fff"><rect x="17" y="45" width="5" height="8" rx="2.5"/><rect x="25" y="45" width="5" height="8" rx="2.5"/><rect x="39" y="35" width="6" height="9" rx="3"/><rect x="49" y="35" width="6" height="9" rx="3"/><rect x="39" y="50" width="6" height="9" rx="3"/><rect x="49" y="50" width="6" height="9" rx="3"/><rect x="65" y="47" width="5" height="8" rx="2.5"/><rect x="74" y="47" width="5" height="8" rx="2.5"/></g><path d="M19 78v-12a4 4 0 0 1 8 0v12zM43 78v-12a4 4 0 0 1 8 0v12zM68 78v-12a4 4 0 0 1 8 0v12z" fill="#5c3b1e"/>',
  },
  pet: {
    nome: "Animais",
    fundo: "#edf2ff",
    svg: '<ellipse cx="48" cy="84" rx="28" ry="4" fill="#000" opacity=".08"/><rect x="16" y="34" width="64" height="42" rx="8" fill="#748ffc"/><rect x="16" y="34" width="64" height="10" rx="5" fill="#5c7cfa"/><path d="M38 34v-6a10 10 0 0 1 20 0v6" stroke="#4c6ef5" stroke-width="4" fill="none"/><g fill="#fff"><ellipse cx="48" cy="62" rx="8" ry="6.5"/><circle cx="38" cy="52" r="3.5"/><circle cx="44" cy="47" r="3.5"/><circle cx="52" cy="47" r="3.5"/><circle cx="58" cy="52" r="3.5"/></g>',
  },
};

export const LISTA_ILUSTRACOES = Object.entries(ILUSTRACOES).map(
  ([chave, v]) => ({ chave, nome: v.nome }),
);

const normalizar = (texto = "") =>
  String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

// palavra da categoria → ilustração (a primeira que bater vale)
const PALAVRAS = [
  ["motoguia", ["motoguia", "moto guia", "guia com carro", "guias"]],
  ["idiomas", ["idioma", "lingua", "ingles", "espanhol", "traducao"]],
  [
    "politica",
    [
      "politic",
      "regra",
      "cancel",
      "reembols",
      "termo",
      "contrato",
      "norma",
      "condic",
    ],
  ],
  [
    "documento",
    [
      "document",
      "passaporte",
      "identidade",
      " rg",
      "cpf",
      "certidao",
      "autorizac",
    ],
  ],
  [
    "ingresso",
    ["ingress", "bilhete", "ticket", "entrada", "atrac", "museu", "show"],
  ],
  ["taxas", ["taxa", "imposto", "tribut", "tarifa de embarque"]],
  [
    "valores",
    [
      "cotac",
      "preco",
      "valor",
      "pagamento",
      "tarifa",
      "pix",
      "cartao",
      "custo",
      "orcamento",
    ],
  ],
  ["bagagem", ["bagag", "mala", "prancha", "volume"]],
  ["crianca", ["crianc", "bebe", "infantil", "menor", "colo", "kids"]],
  ["equipamento", ["equipament", "cadeir", "acessori", "carrinho", "assento"]],
  [
    "embarcacao",
    ["embarca", "barco", "lancha", "catamar", "escuna", "nautic", "travessia"],
  ],
  ["hotel", ["hotel", "hosped", "pousada", "resort", "hostel"]],
  [
    "horario",
    ["horari", "tempo", "check-in", "checkin", "pontual", "atraso", "duracao"],
  ],
  [
    "local",
    ["local", "endereco", "restaurante", "ponto", "apoio", "praia", "mapa"],
  ],
  [
    "veiculo",
    [
      "veicul",
      "carro",
      "van",
      "onibus",
      "frota",
      "transfer",
      "micro",
      "blindad",
    ],
  ],
];

const POR_FORMATO = {
  veiculo: "veiculo",
  embarcacao: "embarcacao",
  local: "local",
  equipamento: "equipamento",
  tabela: "valores",
};

export const ilustracaoDaCategoria = (categoria = "") => {
  const t = ` ${normalizar(categoria)}`;
  if (!t.trim()) return "";
  const achada = PALAVRAS.find(([, palavras]) =>
    palavras.some((p) => t.includes(p)),
  );
  return achada ? achada[0] : "";
};

// Assunto pelo TÍTULO (respostas e tabelas; assuntos antes de lugares): deixa a capa com a cara do
// item — a taxa de cada passeio, a regra de animais… Cada termo casa com o
// começo de uma palavra ("fe" exige a palavra inteira).
const TEMAS_DO_TITULO = [
  ["pet", ["animal", "animais", "pet", "cachorr", "gato", "cao", "caes"]],
  [
    "horario",
    [
      "margem",
      "horari",
      "antecedencia",
      "pontualidade",
      "atraso",
      "tolerancia",
    ],
  ],
  ["crianca", ["cadeirinha", "assento infantil", "bebe", "crianc", "colo"]],
  ["bagagem", ["bagag", "mala", "prancha"]],
  ["documento", ["documento", "passaporte", "rg$", "autorizacao"]],
  ["idiomas", ["idioma", "ingles", "espanhol", "bilingue"]],
  ["ingresso", ["ingresso", "bilhete", "museu"]],
  [
    "ilha",
    [
      "frades",
      "itaparica",
      "ilha",
      "boipeba",
      "tinhare",
      "praia do forte",
      "baia de todos",
    ],
  ],
  ["farol", ["morro de sao paulo", "morro sp", "farol", "gamboa"]],
  [
    "igreja",
    [
      "roteiro da fe",
      "fe$",
      "igreja",
      "bonfim",
      "convento",
      "basilica",
      "irma dulce",
      "misericordia",
    ],
  ],
  [
    "atabaque",
    [
      "axe",
      "terreiro",
      "candomble",
      "afro",
      "orixa",
      "capoeira",
      "ile ",
      "yle",
    ],
  ],
  [
    "casario",
    [
      "pelourinho",
      "pelo$",
      "city tour",
      "centro historico",
      "cidade historica",
      "cidade alta",
      "elevador lacerda",
    ],
  ],
  ["embarcacao", ["catamara", "lancha", "escuna", "barco", "travessia"]],
  ["hotel", ["hotel", "pousada", "resort", "hospedagem"]],
];

const REGEX_TEMAS = TEMAS_DO_TITULO.map(([chave, termos]) => [
  chave,
  new RegExp(
    `(^|[^a-z0-9])(${termos
      .map((t) => (t.endsWith("$") ? `${t.slice(0, -1)}(?![a-z0-9])` : t))
      .join("|")})`,
  ),
]);

export const ilustracaoDoTitulo = (titulo = "") => {
  const t = normalizar(titulo);
  if (!t.trim()) return "";
  const achado = REGEX_TEMAS.find(([, re]) => re.test(t));
  return achado ? achado[0] : "";
};

const FORMATOS_COM_TEMA = new Set(["resposta", "tabela"]);

// Ilustração do item: a escolhida no cadastro → motoguia → o assunto do
// título (respostas e tabelas) → a da categoria → a do tipo do cadastro →
// "Dúvidas gerais".
export const ilustracaoDoItem = (item = {}, formato = "") => {
  if (item?.ilustracao && ILUSTRACOES[item.ilustracao]) return item.ilustracao;
  const tipoVeiculo = normalizar(item?.fichaVeiculo?.tipoVeiculo || "");
  if (tipoVeiculo.includes("motoguia")) return "motoguia";
  if (formato === "veiculo" && item?.complementos?.guiaId) return "motoguia";
  return (
    (FORMATOS_COM_TEMA.has(formato) && ilustracaoDoTitulo(item?.pergunta)) ||
    ilustracaoDaCategoria(item?.categoria) ||
    POR_FORMATO[formato] ||
    "duvida"
  );
};

// ---------------------------------------------------------------------
// Tons: quando itens da mesma seção caem no mesmo desenho, o fundo gira
// um pouco o matiz (mesma claridade) para os cards não ficarem iguais.
// ---------------------------------------------------------------------
const GIROS_DE_TOM = [0, 38, -38, 76];

const hexParaHsl = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r
      ? (g - b) / d + (g < b ? 6 : 0)
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  return [h * 60, s, l];
};

const hslParaHex = (h, s, l) => {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)]
    .map((v) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
};

export const fundoComTom = (hex, tom = 0) => {
  const giro =
    GIROS_DE_TOM[
      ((tom % GIROS_DE_TOM.length) + GIROS_DE_TOM.length) % GIROS_DE_TOM.length
    ];
  if (!giro || !/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const [h, sat, l] = hexParaHsl(hex);
  return hslParaHex((h + giro + 360) % 360, Math.max(sat, 0.55), l);
};

// Para uma lista (uma seção): id → tom, contando quantas vezes o mesmo
// desenho já apareceu antes nela.
export const tonsDaLista = (itens = [], formatoDoItem = () => "") => {
  const vistos = {};
  const tons = {};
  itens.forEach((item) => {
    const chave = ilustracaoDoItem(item, formatoDoItem(item));
    tons[item.id] = vistos[chave] || 0;
    vistos[chave] = (vistos[chave] || 0) + 1;
  });
  return tons;
};
