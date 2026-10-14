import { useEffect } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon";

/* Foto ampliada (ex.: foto de perfil do guia). Clique fora ou Esc fecha. */
const FotoAmpliada = ({ foto, nome = "", legenda, onClose }) => {
  useEffect(() => {
    // captura: fecha só a foto (sem fechar o painel que está por baixo)
    const tecla = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose?.();
    };
    document.addEventListener("keydown", tecla, true);
    return () => document.removeEventListener("keydown", tecla, true);
  }, [onClose]);

  if (!foto) return null;
  return createPortal(
    <div
      className="ui-foto-ampliada"
      role="dialog"
      aria-modal="true"
      aria-label={nome ? `Foto de ${nome}` : "Foto"}
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <figure>
        <img src={foto} alt={nome ? `Foto de ${nome}` : ""} />
        {(nome || legenda) && (
          <figcaption>
            {nome && <strong>{nome}</strong>}
            {legenda && <span>{legenda}</span>}
          </figcaption>
        )}
        <button type="button" className="ui-foto-ampliada__fechar" onClick={onClose} aria-label="Fechar">
          <Icon name="x" size={18} />
        </button>
      </figure>
    </div>,
    document.body,
  );
};

export default FotoAmpliada;
