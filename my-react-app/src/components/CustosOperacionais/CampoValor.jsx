import { useState } from "react";
import { lerValorDigitado } from "../../Services/Services/custosCalculo";

/* Campo de R$ que grava ao sair (ou Enter). Esc desfaz.
   Vazio = volta ao automático (tabela). Use `key` com o valor salvo para
   o campo acompanhar mudanças que vêm de fora. */
const paraTexto = (v) =>
  v === null || v === undefined || v === ""
    ? ""
    : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CampoValor = ({ valor, placeholder = "", onSalvar, ariaLabel, destaque = false, className = "" }) => {
  const [texto, setTexto] = useState(() => paraTexto(valor));
  const [erro, setErro] = useState(false);

  const confirmar = () => {
    const limpo = texto.trim();
    if (!limpo) {
      setErro(false);
      if (valor !== null && valor !== undefined && valor !== "") onSalvar(null);
      return;
    }
    const n = lerValorDigitado(limpo);
    if (n === null) {
      setErro(true);
      return;
    }
    setErro(false);
    setTexto(paraTexto(n));
    if (n !== valor) onSalvar(n);
  };

  return (
    <span className={`cst-valor ${destaque ? "is-destaque" : ""} ${erro ? "is-erro" : ""} ${className}`.trim()}>
      <span className="cst-valor__moeda" aria-hidden="true">R$</span>
      <input
        className="cst-valor__input tabular"
        inputMode="decimal"
        value={texto}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={erro || undefined}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={confirmar}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setTexto(paraTexto(valor));
            setErro(false);
          }
        }}
      />
    </span>
  );
};

export default CampoValor;
