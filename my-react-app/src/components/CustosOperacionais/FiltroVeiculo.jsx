import { Icon } from "../ui";
import { CATEGORIAS } from "../../Services/Services/custosCalculo";

/* Filtro por tipo de veículo (Carro, Van, Van alongada, Micro, Ônibus),
   em chips com a quantidade de tarifas de cada um. `valor`: "" = todos,
   "qualquer" = tarifas sem categoria (valem para qualquer veículo). */

const ICONE = { carro: "car", van: "truck", "van-alongada": "truck", micro: "truck", onibus: "truck" };

const FiltroVeiculo = ({ valor, onChange, contagem = {}, rotulo = "Veículo", mostrarQualquer = true }) => {
  const opcoes = [
    { valor: "", nome: "Todos", n: contagem.__total },
    ...CATEGORIAS.map((c) => ({ valor: c.valor, nome: c.nome, n: contagem[c.valor] || 0, icone: ICONE[c.valor] })),
    ...(mostrarQualquer && contagem[""] ? [{ valor: "qualquer", nome: "Qualquer veículo", n: contagem[""] }] : []),
  ];
  return (
    <div className="cst-fv" role="group" aria-label={`Filtrar por ${rotulo.toLowerCase()}`}>
      <span className="cst-fv__rotulo">{rotulo}</span>
      {opcoes.map((o) => (
        <button
          key={o.valor || "todos"}
          type="button"
          className={`cst-fv__chip ${valor === o.valor ? "is-ativo" : ""}`}
          aria-pressed={valor === o.valor}
          disabled={o.valor && o.valor !== "qualquer" && !o.n}
          onClick={() => onChange(valor === o.valor ? "" : o.valor)}
        >
          {o.icone && <Icon name={o.icone} size={13} />}
          {o.nome}
          {o.n !== undefined && <span className="cst-fv__n tabular">{o.n}</span>}
        </button>
      ))}
    </div>
  );
};

export default FiltroVeiculo;
