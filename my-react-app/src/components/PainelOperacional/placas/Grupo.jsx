/* Igual ao Field do kit, mas numa <div>: dentro de um <label>, clicar no
   espaço entre botões acionaria o primeiro botão do grupo. */
const Grupo = ({ label, hint, children }) => (
  <div className="ui-field">
    {label && <span className="ui-field__label">{label}</span>}
    {children}
    {hint && <span className="ui-field__hint">{hint}</span>}
  </div>
);

export default Grupo;
