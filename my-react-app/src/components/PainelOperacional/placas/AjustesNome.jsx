import { FONTES_PLACA } from "./fontesPlaca";
import { ALINHAMENTOS, ALTURAS_NOME, CAIXAS, LETRAS, QUEBRAS } from "./modelosPlaca";

/* Como o nome sai na placa: letra, alinhamento, altura, maiúsculas e linhas.
   - No painel das placas (doModelo): cada campo começa em "Do modelo" e só
     muda esta impressão (fica salvo neste computador).
   - No criador de modelos: os mesmos campos, gravados no modelo. */

export const CAMPOS_NOME = [
  { campo: "letra", label: "Letra", opcoes: LETRAS },
  { campo: "alinhamento", label: "Alinhamento", opcoes: ALINHAMENTOS },
  { campo: "alturaNome", label: "Altura", opcoes: ALTURAS_NOME },
  { campo: "caixa", label: "Escrita", opcoes: CAIXAS },
  { campo: "quebra", label: "Linhas", opcoes: QUEBRAS },
];

export const AJUSTE_NOME_VAZIO = { letra: "", alinhamento: "", alturaNome: "", caixa: "", quebra: "" };

// modelo + ajustes desta impressão ("" = fica o do modelo)
export const aplicarAjusteNome = (modelo, ajuste = {}) => {
  const extra = Object.fromEntries(Object.entries(ajuste || {}).filter(([k, v]) => v && k in AJUSTE_NOME_VAZIO));
  return Object.keys(extra).length ? { ...modelo, ...extra } : modelo;
};

const rotulo = (opcoes, v) => opcoes.find((o) => o.value === v)?.label || "";

const AjustesNome = ({ valores = {}, onChange, doModelo = null }) => (
  <div className="plc-nome-ajustes">
    {CAMPOS_NOME.map(({ campo, label, opcoes }) => (
      <label key={campo} className="plc-nome-ajuste">
        <span>{label}</span>
        <select
          className="ui-input"
          value={valores[campo] || ""}
          onChange={(e) => onChange({ [campo]: e.target.value })}
          style={campo === "letra" && valores.letra ? { fontFamily: FONTES_PLACA[valores.letra]?.css } : undefined}
        >
          {doModelo && <option value="">Do modelo ({rotulo(opcoes, doModelo[campo])})</option>}
          {opcoes.map((o) => (
            <option key={o.value} value={o.value} style={campo === "letra" ? { fontFamily: FONTES_PLACA[o.value]?.css } : undefined}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    ))}
  </div>
);

export default AjustesNome;
