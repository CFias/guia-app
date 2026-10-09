import { createElement } from "react";
import Icon from "./Icon";

/* Para telas que guardam o ÍCONE COMO COMPONENTE (ex.: uma função que
   devolve o ícone da categoria e depois renderiza <Icone fontSize="small" />).
   Cria, uma vez só (no módulo), um componente com a mesma API de tamanho
   do ícone MUI antigo, desenhado com o Icon do projeto. */
const TAMANHOS = { inherit: 14, small: 16, medium: 20, large: 22 };

export const iconeMui = (name) => {
  const IconeProjeto = ({ fontSize = "medium", className, style }) =>
    createElement(Icon, { name, size: TAMANHOS[fontSize] || 20, className, style });
  IconeProjeto.displayName = `Icone(${name})`;
  return IconeProjeto;
};
