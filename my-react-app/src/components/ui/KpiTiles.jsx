import Icon from "./Icon";

/* Tiles de indicadores.
   items: [{ key, label, value, hint?, icon?, tone? ("alert"|"warning"),
             active?, onClick?, title?, loading? }]
   highlightFirst: o primeiro tile (ou o ativo) ganha fundo accent.
   Tiles com onClick viram botões (para filtrar a tabela abaixo). */
const KpiTiles = ({ items = [], highlightFirst = true, className = "" }) => {
  const algumAtivo = items.some((i) => i.active);

  return (
    <div className={`ui-kpis ${className}`.trim()}>
      {items.map((item, idx) => {
        const destaque = algumAtivo ? item.active : highlightFirst && idx === 0;
        const Tag = item.onClick ? "button" : "div";
        return (
          <Tag
            key={item.key ?? idx}
            type={item.onClick ? "button" : undefined}
            className={[
              "ui-kpi",
              destaque ? "is-highlight" : "",
              item.tone ? `ui-kpi--${item.tone}` : "",
              item.onClick ? "is-clickable" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={item.onClick}
            aria-pressed={item.onClick ? !!item.active : undefined}
            title={item.title}
          >
            <span className="ui-kpi__value tabular">
              {item.loading ? "…" : item.value}
            </span>
            <span className="ui-kpi__label">
              {item.icon && <Icon name={item.icon} size={14} />}
              {item.label}
            </span>
            {item.hint && <span className="ui-kpi__hint">{item.hint}</span>}
          </Tag>
        );
      })}
    </div>
  );
};

export default KpiTiles;
