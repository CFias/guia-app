// modelosPlaca.js
//
// Modelos das placas de recepção (Painel Operacional → Chegadas).
// - Modelos prontos: ficam no código, por base (temasRegiao.js → modelosProntos()).
// - Modelos da equipe: criados no próprio painel, salvos em
//   settings/placas_modelos = { modelos: [...], atualizadoEm }.
// - O que cada computador escolheu por último (modelo, mensagem, opções da
//   coleção) fica no localStorage: é só uma conveniência de quem imprime.

import { useCallback, useEffect, useState } from "react";
import { doc, onSnapshot, setDoc, Timestamp } from "firebase/firestore";
import { db } from "../../../Services/Services/firebase";
import { idPorRegiao } from "../../../Services/Services/regiaoAtiva";
import { MODELOS_NORDESTE, temaDaRegiao } from "./temasRegiao";
import { LETRAS } from "./fontesPlaca";

// cada base tem os seus modelos (Salvador: settings/placas_modelos)
const REF = () => doc(db, "settings", idPorRegiao("placas_modelos"));

export const DESENHOS = [
  { value: "nenhum", label: "Nenhum" },
  { value: "farol", label: "Farol" },
  { value: "bonfim", label: "Igreja do Bonfim" },
  { value: "pelourinho", label: "Pelourinho" },
  { value: "orla", label: "Orla" },
  { value: "fitinhas", label: "Fitinhas" },
  { value: "berimbau", label: "Berimbau e pandeiro" },
  { value: "baiana", label: "Baiana" },
  { value: "elevador", label: "Elevador Lacerda" },
  { value: "tartaruga", label: "Tartaruga" },
  { value: "jangada", label: "Jangada e coqueiros" },
  { value: "cordel", label: "Cordel" },
  { value: "azulejos", label: "Azulejos" },
  { value: "saojoao", label: "São João" },
  { value: "carnaval", label: "Carnaval" },
  // Nordeste (todas as bases)
  { value: "praia", label: "Praia" },
  { value: "voudeluck", label: "#VouDeLuck" },
  { value: "sertao", label: "Sertão (mandacaru)" },
  // Natal
  { value: "reismagos", label: "Forte dos Reis Magos" },
  { value: "morrocareca", label: "Morro do Careca" },
  { value: "cajueiro", label: "Cajueiro de Pirangi" },
  // Recife / Olinda / Porto de Galinhas
  { value: "frevo", label: "Frevo" },
  { value: "olinda", label: "Olinda" },
  { value: "portogalinhas", label: "Porto de Galinhas" },
  // Maceió
  { value: "pajucara", label: "Piscinas de Pajuçara" },
  { value: "gunga", label: "Praia do Gunga" },
  // Fortaleza / Jericoacoara
  { value: "ponteingleses", label: "Ponte dos Ingleses" },
  { value: "pedrafurada", label: "Pedra Furada" },
  // João Pessoa
  { value: "cabobranco", label: "Farol do Cabo Branco" },
  { value: "jacare", label: "Pôr do sol do Jacaré" },
  // Aracaju
  { value: "caranguejo", label: "Caranguejo" },
  { value: "xingo", label: "Cânion do Xingó" },
  // Porto Seguro
  { value: "caravela", label: "Caravela" },
];

// desenhos em faixa (base) ou fixos — não escolhem posição
const SO_BASE = [
  "pelourinho",
  "orla",
  "jangada",
  "cordel",
  "azulejos",
  "saojoao",
  "carnaval",
  "praia",
  "voudeluck",
  "olinda",
  "gunga",
  "ponteingleses",
  "xingo",
];

export const POSICOES = [
  { value: "direita", label: "Canto direito" },
  { value: "esquerda", label: "Canto esquerdo" },
  { value: "base", label: "Na base" },
  { value: "laterais", label: "Nas laterais" },
];

export const MOLDURAS = [
  { value: "nenhuma", label: "Nenhuma" },
  { value: "fina", label: "Linha fina" },
  { value: "dupla", label: "Dupla" },
  { value: "cantos", label: "Só cantos" },
];

// letras do nome: fontesPlaca.js (Forte, Elegante, Moderna, Condensada…)
export { LETRAS };

// Como o nome fica na placa
export const ALINHAMENTOS = [
  { value: "centro", label: "Centralizado" },
  { value: "esquerda", label: "À esquerda" },
];

export const ALTURAS_NOME = [
  { value: "meio", label: "No meio" },
  { value: "alto", label: "Mais em cima" },
  { value: "baixo", label: "Mais embaixo" },
];

export const CAIXAS = [
  { value: "maiusculas", label: "MAIÚSCULAS" },
  { value: "nome", label: "Nome Próprio" },
];

export const QUEBRAS = [
  { value: "auto", label: "Automático" },
  { value: "uma", label: "Sempre 1 linha" },
  { value: "duas", label: "Sobrenome embaixo" },
];

export const TRACOS = [
  { value: "marcado", label: "Marcado" },
  { value: "leve", label: "Leve" },
  { value: "bem-leve", label: "Bem leve" },
];

// posições que cada desenho aceita (as fitinhas não ficam num canto só;
// os prédios não cabem nas laterais)
export const posicoesDoDesenho = (desenho) => {
  if (desenho === "nenhum") return [];
  if (desenho === "fitinhas") return ["base", "laterais"];
  if (SO_BASE.includes(desenho)) return ["base"];
  return ["direita", "esquerda", "base"];
};

export const MODELO_BASE = {
  nome: "",
  desenho: "nenhum",
  posicao: "base",
  moldura: "nenhuma",
  letra: "forte",
  alinhamento: "centro",
  alturaNome: "meio",
  caixa: "maiusculas",
  quebra: "auto",
  traco: "leve",
  mensagem: "",
  trevo: 0.06,
};

// Modelos prontos da base em uso (temasRegiao.js): os pontos turísticos da
// base e, para todas, os do Nordeste. O Clássico (sem desenho) abre a lista.
const CLASSICO = { id: "classico", nome: "Clássico", desenho: "nenhum" };
const completar = (lista) =>
  lista.map((m) => ({ ...MODELO_BASE, ...m, pronto: true }));

export const gruposProntos = (tema = temaDaRegiao()) => [
  { titulo: tema.cidade, modelos: completar([CLASSICO, ...tema.modelos]) },
  { titulo: "Nordeste", modelos: completar(MODELOS_NORDESTE) },
];

export const modelosProntos = (tema) =>
  gruposProntos(tema).flatMap((g) => g.modelos);

// desenhos oferecidos no criador de modelos: os da base + Nordeste (e o
// desenho atual do modelo, se veio de outra base)
export const desenhosDaBase = (tema = temaDaRegiao(), atual = "") => {
  const usados = new Set([
    "nenhum",
    atual,
    ...modelosProntos(tema).map((m) => m.desenho),
  ]);
  return DESENHOS.filter((d) => usados.has(d.value));
};

const valido = (lista, v, padrao) =>
  lista.some((o) => o.value === v) ? v : padrao;

// Garante um modelo completo e coerente (vale para o que vem do Firestore)
export const normalizarModelo = (m = {}) => {
  const desenho = valido(DESENHOS, m.desenho, MODELO_BASE.desenho);
  const aceitas = posicoesDoDesenho(desenho);
  const posicao = aceitas.includes(m.posicao)
    ? m.posicao
    : aceitas[0] || "base";
  const trevo = Number(m.trevo);
  return {
    ...MODELO_BASE,
    ...m,
    nome:
      String(m.nome || "")
        .trim()
        .slice(0, 40) || "Sem nome",
    desenho,
    posicao,
    moldura: valido(MOLDURAS, m.moldura, MODELO_BASE.moldura),
    letra: valido(LETRAS, m.letra, MODELO_BASE.letra),
    alinhamento: valido(ALINHAMENTOS, m.alinhamento, MODELO_BASE.alinhamento),
    alturaNome: valido(ALTURAS_NOME, m.alturaNome, MODELO_BASE.alturaNome),
    caixa: valido(CAIXAS, m.caixa, MODELO_BASE.caixa),
    quebra: valido(QUEBRAS, m.quebra, MODELO_BASE.quebra),
    traco: valido(TRACOS, m.traco, MODELO_BASE.traco),
    mensagem: String(m.mensagem || "").slice(0, 90),
    trevo: Number.isFinite(trevo)
      ? Math.min(0.2, Math.max(0, trevo))
      : MODELO_BASE.trevo,
  };
};

export const novoIdModelo = () =>
  `mod_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

// ---------- mensagem de boas-vindas pelo idioma ----------
// Com a cidade da base em uso. jp/cn usam inglês: a fonte padrão do PDF não
// tem esses caracteres.
const mensagens = (tema) => {
  const c = tema.cidade;
  const a = tema.preposicao || "a";
  return {
    pt: [`Seja bem-vindo(a) ${a} ${c}!`, `Sejam bem-vindos ${a} ${c}!`],
    en: [`Welcome to ${c}!`, `Welcome to ${c}!`],
    es: [`¡Bienvenido(a) a ${c}!`, `¡Bienvenidos a ${c}!`],
    fr: [`Bienvenue à ${c} !`, `Bienvenue à ${c} !`],
    it: [`Benvenuto/a a ${c}!`, `Benvenuti a ${c}!`],
    de: [`Willkommen in ${c}!`, `Willkommen in ${c}!`],
  };
};

export const mensagemDoIdioma = (
  idioma,
  { plural = false, tema = temaDaRegiao() } = {},
) => {
  const M = mensagens(tema);
  const par = M[idioma] || (idioma && idioma !== "pt" ? M.en : M.pt);
  return plural ? par[1] : par[0];
};

// idioma da maioria (coleção): o mais frequente; empate → português
export const idiomaDaMaioria = (idiomas = []) => {
  const conta = {};
  idiomas.forEach((i) => {
    const id = i || "pt";
    conta[id] = (conta[id] || 0) + 1;
  });
  const ordem = Object.entries(conta).sort(
    (a, b) => b[1] - a[1] || (a[0] === "pt" ? -1 : 1),
  );
  return ordem[0]?.[0] || "pt";
};

const primeiroNome = (nome = "") => {
  const p =
    String(nome || "")
      .trim()
      .split(/\s+/)[0] || "";
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : "";
};

// modo: "auto" (pelo idioma) | "modelo" (texto do modelo; vazio → auto) | "nenhuma"
export const textoMensagem = ({
  modo = "auto",
  modelo,
  idioma,
  nome,
  hotel,
  plural = false,
}) => {
  if (modo === "nenhuma") return "";
  const propria = String(modelo?.mensagem || "").trim();
  if (modo === "modelo" && propria) {
    return propria
      .replace(/\{primeiro nome\}/gi, plural ? "" : primeiroNome(nome))
      .replace(/\{hotel\}/gi, hotel || "")
      .replace(/\s+([,!.?])/g, "$1")
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  return mensagemDoIdioma(idioma, { plural });
};

// ---------- preferências deste computador ----------
const CHAVE_PREFS = "painel_operacional_placas_v2";

export const PREFS_PADRAO = {
  modeloId: "classico",
  mensagem: "auto", // auto | modelo | nenhuma
  mostrarVoo: true,
  mostrarHotel: false,
  mostrarRodape: false,
  // coleção
  colecaoPorPlaca: 5,
  colecaoSeparacao: "linha", // linha | caixa | faixa
  colecaoOrdem: "phoenix", // phoenix | az
  colecaoTamanho: "auto", // auto | manual
  colecaoEscala: 1, // 0.7 a 1.3 (manual)
  colecaoModeloId: "classico",
  colecaoLetra: "forte",
  // ajustes do nome só desta impressão ("" = o do modelo) — AjustesNome.jsx
  nome: { letra: "", alinhamento: "", alturaNome: "", caixa: "", quebra: "" },
  // individual: tamanho do nome e fundo só desta impressão
  individualTamanho: "auto", // auto | manual
  individualEscala: 1, // 0.6 a 1.3 (manual)
  fundo: { desenho: null, trevo: null, logo: null }, // ajuste manual (null = o do modelo): intensidade do desenho, trevo e logo do cabeçalho
  mostrarVeiculo: false, // veículo do serviço, discreto
};

export const lerPrefsPlacas = () => {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_PREFS) || "null");
    return {
      ...PREFS_PADRAO,
      ...(salvo && typeof salvo === "object" ? salvo : {}),
    };
  } catch {
    return { ...PREFS_PADRAO };
  }
};

export const salvarPrefsPlacas = (prefs) => {
  try {
    localStorage.setItem(CHAVE_PREFS, JSON.stringify(prefs));
  } catch {
    /* navegador sem storage: fica só nesta sessão */
  }
};

// ---------- modelos da equipe (Firestore) ----------
export const useModelosEquipe = () => {
  const [modelos, setModelos] = useState([]);
  const [carregado, setCarregado] = useState(false);

  useEffect(
    () =>
      onSnapshot(
        REF(),
        (snap) => {
          const lista = snap.exists() ? snap.data()?.modelos : null;
          setModelos(
            Array.isArray(lista)
              ? lista
                  .filter((m) => m && m.id)
                  .map((m) => ({ ...normalizarModelo(m), id: m.id }))
              : [],
          );
          setCarregado(true);
        },
        (e) => {
          console.error("Erro ao ler modelos de placa:", e);
          setCarregado(true);
        },
      ),
    [],
  );

  const gravar = useCallback(
    (lista) =>
      setDoc(
        REF(),
        {
          modelos: lista.map((m) => {
            const limpo = normalizarModelo(m);
            delete limpo.pronto;
            delete limpo.novo;
            return { ...limpo, id: m.id };
          }),
          atualizadoEm: Timestamp.now(),
        },
        { merge: true },
      ),
    [],
  );

  const salvarModelo = useCallback(
    (modelo) => {
      const id = modelo.id && !modelo.pronto ? modelo.id : novoIdModelo();
      const existe = modelos.some((m) => m.id === id);
      const lista = existe
        ? modelos.map((m) => (m.id === id ? { ...modelo, id } : m))
        : [...modelos, { ...modelo, id }];
      return gravar(lista).then(() => id);
    },
    [modelos, gravar],
  );

  const removerModelo = useCallback(
    (id) => gravar(modelos.filter((m) => m.id !== id)),
    [modelos, gravar],
  );

  return { modelos, carregado, salvarModelo, removerModelo };
};

export const acharModelo = (id, modelosEquipe = []) => {
  const prontos = modelosProntos();
  return (
    prontos.find((m) => m.id === id) ||
    modelosEquipe.find((m) => m.id === id) ||
    prontos[0]
  );
};
