import Icon from "./Icon";

/* Botão base.
   variant: "primary" (accent — no máximo 1 por tela) | "secondary" | "ghost" | "danger"
   icon: nome do ícone à esquerda · iconOnly: botão quadrado só com ícone (passe `title`)
   loading: mostra o ícone girando e desabilita o clique */
const Button = ({
  variant = "secondary",
  size = "md",
  icon,
  iconRight,
  iconOnly = false,
  loading = false,
  disabled,
  className = "",
  children,
  type = "button",
  ...rest
}) => {
  const classes = [
    "ui-btn",
    `ui-btn--${variant}`,
    size !== "md" ? `ui-btn--${size}` : "",
    iconOnly ? "ui-btn--icon" : "",
    loading ? "is-loading" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const tamanhoIcone = size === "sm" ? 14 : 15;

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <Icon name="loader" size={tamanhoIcone} className="ui-spin" />
      ) : (
        icon && <Icon name={icon} size={tamanhoIcone} />
      )}
      {!iconOnly && children}
      {iconRight && !iconOnly && <Icon name={iconRight} size={tamanhoIcone} />}
    </button>
  );
};

export default Button;
