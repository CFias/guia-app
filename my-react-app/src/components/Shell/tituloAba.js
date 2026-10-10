/* Título da aba do navegador: "Página · Operacional SSA".
   Mantém o contador de notificações "(3) " que o sino coloca na frente. */
export const NOME_APP = "Operacional SSA";

export const definirTituloAba = (pagina) => {
  if (typeof document === "undefined") return;
  const prefixo = (document.title.match(/^\(\d+\)\s/) || [""])[0];
  const texto = pagina ? `${pagina} · ${NOME_APP}` : NOME_APP;
  document.title = `${prefixo}${texto}`;
};
