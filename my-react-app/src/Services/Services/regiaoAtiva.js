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

// Telas que funcionam numa base sem dados próprios no sistema (só Phoenix).
// Mesmas chaves de Context/acessos.js.
export const TELAS_REGIONAIS = [
  {
    chave: "painelOperacional",
    label: "Painel Operacional",
    detalhe: "Chegadas, saídas, transfers, resumo por guia, mapa e placas.",
  },
  { chave: "previas", label: "Prévia de serviços", detalhe: "Prévia do dia para os fornecedores." },
  { chave: "planilha", label: "Planilha operacional", detalhe: "A planilha do dia (mesma base da prévia)." },
  { chave: "demandaTurnos", label: "Demanda por turno", detalhe: "Turnos e equipe próprios da base." },
];

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
  if (/^[a-z0-9-]+$/.test(nome)) return `https://${nome.startsWith("driver") ? nome : `driver${nome}`}.${DOMINIO_PHOENIX}`;
  try {
    const url = new URL(/^https?:\/\//i.test(texto) ? texto : `https://${texto}`);
    return url.origin;
  } catch {
    return "";
  }
};

const origemPhoenix = (r = atual) => normalizarLinkPhoenix(r?.phoenix) || PHOENIX_SEDE;

export const phoenixReserveService = (r = atual) => `${origemPhoenix(r)}/scale/reserve-service`;

// Documento de configuração por região: Salvador mantém o nome de sempre
// (nada muda para quem já usa), as outras bases ganham o sufixo.
// settings/turnos_equipe → settings/turnos_equipe__nat
export const idPorRegiao = (base, r = atual) => (ehSede(r) ? base : `${base}__${r.id}`);
