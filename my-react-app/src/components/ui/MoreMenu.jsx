import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";

/* Menu "⋯" para ações secundárias (nunca some uma ação: ela vem pra cá).
   items: [{ label, icon?, onClick, disabled?, danger?, hint? } | "divider"] */
const MoreMenu = ({
  items = [],
  label = "Mais ações",
  align = "right",
  buttonLabel,
  icon = "more",
}) => {
  const [aberto, setAberto] = useState(false);
  const raizRef = useRef(null);

  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e) => {
      if (raizRef.current && !raizRef.current.contains(e.target)) setAberto(false);
    };
    const esc = (e) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const visiveis = items.filter(Boolean);
  if (!visiveis.length) return null;

  return (
    <div className="ui-more" ref={raizRef}>
      <button
        type="button"
        className={`ui-btn ui-btn--secondary ${buttonLabel ? "" : "ui-btn--icon"}`}
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={label}
        title={label}
      >
        <Icon name={icon} size={16} />
        {buttonLabel}
      </button>

      {aberto && (
        <div className={`ui-more__menu ui-more__menu--${align}`} role="menu">
          {visiveis.map((item, i) =>
            item === "divider" ? (
              <div key={`d${i}`} className="ui-more__divider" role="separator" />
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={`ui-more__item ${item.danger ? "is-danger" : ""}`}
                disabled={item.disabled}
                onClick={(e) => {
                  setAberto(false);
                  item.onClick?.(e);
                }}
              >
                {item.icon && <Icon name={item.icon} size={15} />}
                <span className="ui-more__label">{item.label}</span>
                {item.hint && <span className="ui-more__hint">{item.hint}</span>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
};

export default MoreMenu;
