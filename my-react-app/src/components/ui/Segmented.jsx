import Icon from "./Icon";

/* Controle segmentado (abas, presets de período, filtros de tipo).
   options: [{ value, label, icon?, count?, disabled?, title? }]
   O componente só avisa a troca por onChange(value) — o estado
   continua sendo o da tela. */
const Segmented = ({
  options = [],
  value,
  onChange,
  size = "md",
  ariaLabel,
  className = "",
  stretch = false,
}) => (
  <div
    className={[
      "ui-seg",
      size === "sm" ? "ui-seg--sm" : "",
      stretch ? "ui-seg--stretch" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ")}
    role="tablist"
    aria-label={ariaLabel}
  >
    {options.map((op) => {
      const ativo = op.value === value;
      return (
        <button
          key={String(op.value)}
          type="button"
          role="tab"
          aria-selected={ativo}
          className={`ui-seg__opt ${ativo ? "is-active" : ""}`}
          onClick={() => !ativo && onChange?.(op.value)}
          disabled={op.disabled}
          title={op.title}
        >
          {op.icon && <Icon name={op.icon} size={15} />}
          <span>{op.label}</span>
          {op.count !== undefined && op.count !== null && (
            <span className="ui-seg__count tabular">{op.count}</span>
          )}
        </button>
      );
    })}
  </div>
);

export default Segmented;
