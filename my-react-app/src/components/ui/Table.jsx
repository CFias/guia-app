import Icon from "./Icon";

/* Tabela/lista em grid.
   <Table columns="40px 1.4fr 1fr 90px" minWidth={760}>
     <TableHead><span>Voo</span>…</TableHead>
     <TableRow expandable expanded={aberto} onToggle={…}>…células…</TableRow>
     {aberto && <TableExpansion>…</TableExpansion>}
   </Table>
   - columns: grid-template-columns compartilhado por cabeçalho e linhas
   - minWidth: abaixo disso a tabela rola na horizontal (telas estreitas) */

export const Card = ({ className = "", children, padded = false, ...rest }) => (
  <div
    className={`ui-card ${padded ? "ui-card--padded" : ""} ${className}`.trim()}
    {...rest}
  >
    {children}
  </div>
);

export const CardHeader = ({ title, subtitle, actions, icon }) => (
  <div className="ui-card__head">
    <div className="ui-card__titles">
      <h3 className="ui-card__title">
        {icon && <Icon name={icon} size={16} />}
        {title}
      </h3>
      {subtitle && <p className="ui-card__subtitle">{subtitle}</p>}
    </div>
    {actions && <div className="ui-card__actions">{actions}</div>}
  </div>
);

export const Table = ({
  columns,
  minWidth = 0,
  compact = false,
  className = "",
  children,
  ...rest
}) => (
  <div
    className={`ui-table ${compact ? "ui-table--compact" : ""} ${className}`.trim()}
    {...rest}
  >
    <div
      className="ui-table__scroll"
      style={{ "--ui-cols": columns, "--ui-min-w": minWidth ? `${minWidth}px` : "0" }}
    >
      <div className="ui-table__inner">{children}</div>
    </div>
  </div>
);

export const TableHead = ({ children, className = "" }) => (
  <div className={`ui-table__head ${className}`.trim()} role="row">
    {children}
  </div>
);

export const TableRow = ({
  children,
  expandable = false,
  expanded = false,
  onToggle,
  onClick,
  className = "",
  selected = false,
  ...rest
}) => {
  const clicavel = expandable || !!onClick;
  const acionar = (e) => {
    if (expandable) onToggle?.(e);
    onClick?.(e);
  };

  return (
    <div
      role="row"
      className={[
        "ui-table__row",
        clicavel ? "is-clickable" : "",
        expanded ? "is-expanded" : "",
        selected ? "is-selected" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={clicavel ? acionar : undefined}
      onKeyDown={
        clicavel
          ? (e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                acionar(e);
              }
            }
          : undefined
      }
      tabIndex={clicavel ? 0 : undefined}
      aria-expanded={expandable ? expanded : undefined}
      {...rest}
    >
      {expandable && (
        <span className="ui-table__chevron" aria-hidden="true">
          <Icon name="chevronRight" size={16} />
        </span>
      )}
      {children}
    </div>
  );
};

export const TableExpansion = ({ children, className = "" }) => (
  <div className={`ui-table__expansion ${className}`.trim()}>{children}</div>
);

export default Table;
