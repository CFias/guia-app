import Icon from "./Icon";

/* Status = ponto de 7px (ou ícone) + texto na cor do tom.
   tone: "neutral" | "accent" | "alert" | "warning" | "muted" */
const StatusDot = ({ tone = "neutral", icon, children, className = "", title }) => (
  <span className={`ui-status ui-status--${tone} ${className}`.trim()} title={title}>
    {icon ? (
      <Icon name={icon} size={14} />
    ) : (
      <span className="ui-status__dot" aria-hidden="true" />
    )}
    <span>{children}</span>
  </span>
);

export default StatusDot;
