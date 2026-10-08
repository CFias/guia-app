import Icon from "./Icon";

/* Peças de formulário/filtro no padrão visual novo.
   São "burras": value/onChange vêm da tela, como já é hoje. */

export const FilterBar = ({ children, className = "" }) => (
  <div className={`ui-filters ${className}`.trim()}>{children}</div>
);

export const Field = ({ label, icon, hint, className = "", children, grow = false }) => (
  <label className={`ui-field ${grow ? "ui-field--grow" : ""} ${className}`.trim()}>
    {label && (
      <span className="ui-field__label">
        {icon && <Icon name={icon} size={13} />}
        {label}
      </span>
    )}
    {children}
    {hint && <span className="ui-field__hint">{hint}</span>}
  </label>
);

export const SearchInput = ({ value, onChange, placeholder = "Buscar…", className = "", ...rest }) => (
  <div className={`ui-search ${className}`.trim()}>
    <Icon name="search" size={15} className="ui-search__icon" />
    <input
      type="search"
      className="ui-input"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      {...rest}
    />
  </div>
);

export const EmptyState = ({ icon = "info", title, children, action }) => (
  <div className="ui-empty">
    <Icon name={icon} size={22} />
    {title && <strong className="ui-empty__title">{title}</strong>}
    {children && <p className="ui-empty__text">{children}</p>}
    {action}
  </div>
);
