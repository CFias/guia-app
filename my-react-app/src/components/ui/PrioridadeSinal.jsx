/* Nível de prioridade do guia como "sinal de rede" (1 a 3 barrinhas).
   Uso: <PrioridadeSinal nivel={guia.nivelPrioridade} /> */
const PrioridadeSinal = ({ nivel = 2, className = "" }) => {
  const n = Math.max(1, Math.min(3, Number(nivel) || 2));
  return (
    <span
      className={`ui-sinal ${className}`.trim()}
      title={`Prioridade ${n} de 3`}
      aria-label={`Prioridade ${n} de 3`}
      role="img"
    >
      {[1, 2, 3].map((i) => (
        <span key={i} className={i <= n ? "is-on" : ""} />
      ))}
    </span>
  );
};

export default PrioridadeSinal;
