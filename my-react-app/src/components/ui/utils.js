/* Para cliques em botões dentro de uma linha clicável/expansível
   não abrirem/fecharem a linha. Uso: onClick={(e) => { pararClique(e); acao(); }} */
export const pararClique = (e) => e?.stopPropagation?.();

export const juntarClasses = (...classes) => classes.filter(Boolean).join(" ");
