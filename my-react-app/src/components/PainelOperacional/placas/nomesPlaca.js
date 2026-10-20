// nomesPlaca.js
//
// Conferência automática dos nomes antes de irem para a placa.
//
// O sistema NÃO tenta adivinhar como o nome se escreve (nome próprio tem
// grafia livre: corrigir "no chute" pode imprimir errado). Quando uma palavra
// do nome tem caractere não reconhecido — "CONCEIÃ‡ÃƒO", "CONCEI?O", "MAR�A",
// símbolos, caracteres invisíveis — a palavra sai da placa e entra outro
// nome da pessoa:
//   - estragada no meio → primeiro + último nome;
//   - estragada no fim → primeiro + segundo nome;
//   - estragada no começo → os dois primeiros nomes bons.
// Status: "ok", "trocado" (houve troca), "revisar" (sobrou um nome só ou
// nenhum) e "editado" (digitado à mão na tela das placas).

import { extrairTextoNomePlaca } from "./layoutPlaca";

// letras que aparecem em nomes (português, espanhol, inglês, francês, alemão…)
// e que todas as letras da placa têm desenho
const LETRA_DE_NOME = /^[A-Za-z0-9À-ÖØ-öø-ÿŒœŠšŸŽžŁłı'’.\-& ]$/;
// "Ã"/"Â" + caractere da faixa 0x80–0xBF: acento estragado (UTF-8 lido como
// Latin-1), mesmo quando os dois caracteres parecem letras ("Ãš", "Ã£")
const ACENTO_ESTRAGADO = /[ÂÃ][\u0080-¿€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/;
const CONECTORES = ["de", "da", "do", "dos", "das", "e", "del", "van", "von", "di", "y"];

const estranhosDe = (texto = "") => [...String(texto)].filter((c) => !LETRA_DE_NOME.test(c));
export const palavraEstragada = (palavra = "") => estranhosDe(palavra).length > 0 || ACENTO_ESTRAGADO.test(palavra);

const maiusculas = (t) => String(t || "").toLocaleUpperCase("pt-BR");
const visivel = (c) => (/[\u0000-\u001f\u007f-\u009f�]/.test(c) ? "□" : c);

/**
 * Nome que vai para a placa + diagnóstico.
 * @returns {{ texto: string, status: "ok"|"trocado"|"revisar", original: string, motivo: string, estragadas: string[] }}
 */
export const tratarNomePlaca = (bruto = "") => {
  const original = String(bruto || "").replace(/\s+/g, " ").trim();
  if (!original) return { texto: extrairTextoNomePlaca(""), status: "revisar", original, motivo: "Reserva sem nome", estragadas: [] };

  const palavras = original.split(" ").filter(Boolean);
  const estragadas = palavras.filter(palavraEstragada);
  const base = extrairTextoNomePlaca(original);
  // o nome que já ia para a placa está limpo (a palavra estragada nem entraria)
  if (!base.split(" ").some(palavraEstragada)) return { texto: base, status: "ok", original, motivo: "", estragadas };

  const motivo = `Caractere não reconhecido em ${estragadas.map((p) => [...p].map(visivel).join("")).join(", ")}`;
  const boa = (p) => !palavraEstragada(p) && !CONECTORES.includes(p.toLowerCase());
  const limpas = palavras.filter(boa);
  const ultima = palavras[palavras.length - 1];

  if (limpas.length >= 2) {
    // estragada no meio → primeiro + último; estragada no fim → primeiro + segundo
    const segundo = boa(ultima) && ultima !== limpas[0] ? ultima : limpas[1];
    return { texto: maiusculas(`${limpas[0]} ${segundo}`), status: "trocado", original, motivo, estragadas };
  }
  if (limpas.length === 1) return { texto: maiusculas(limpas[0]), status: "revisar", original, motivo: `${motivo} · sobrou um nome só`, estragadas };
  return { texto: "NOME A CONFERIR", status: "revisar", original, motivo: `${motivo} · nenhum nome aproveitável`, estragadas };
};

// nome digitado à mão na tela das placas
export const nomeEditado = (texto = "") => maiusculas(String(texto).replace(/\s+/g, " ").trim());

// texto do nome original para mostrar na tela (caracteres invisíveis viram □)
export const nomeParaMostrar = (texto = "") => [...String(texto)].map(visivel).join("");
