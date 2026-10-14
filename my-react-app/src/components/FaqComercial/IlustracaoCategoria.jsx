import { ILUSTRACOES } from "./ilustracoes";

/* Ilustração vetorial da categoria (capa de card sem foto, selos e
   prévia no cadastro). O SVG é conteúdo fixo do próprio sistema. */
const IlustracaoCategoria = ({ chave, tamanho = 96, comFundo = false, className = "", titulo }) => {
  const ilus = ILUSTRACOES[chave] || ILUSTRACOES.duvida;
  const fundo = comFundo ? `<rect width="96" height="96" rx="20" fill="${ilus.fundo}"/>` : "";
  return (
    <svg
      className={`ilus-categoria ${className}`.trim()}
      viewBox="0 0 96 96"
      width={tamanho}
      height={tamanho}
      role={titulo ? "img" : undefined}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : true}
      // desenho fixo, definido em ilustracoes.js
      dangerouslySetInnerHTML={{ __html: fundo + ilus.svg }}
    />
  );
};

export default IlustracaoCategoria;
