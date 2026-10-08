import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Button from "./Button";

/* Painel lateral (420px à direita) para configurações secundárias,
   edição de cadastro, placas PDF etc.
   - footer: conteúdo próprio do rodapé; ou use onSave/saveLabel para o
     padrão Cancelar + Salvar (Salvar chama o handler que a tela já tem).
   - Esc e clique fora fecham (onClose). */
const Drawer = ({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  onSave,
  saveLabel = "Salvar",
  cancelLabel = "Cancelar",
  saving = false,
  saveDisabled = false,
  width = 420,
}) => {
  const painelRef = useRef(null);
  // onClose num ref: o efeito abaixo roda só ao abrir/fechar, e não a cada
  // render (senão o foco pularia para o painel enquanto a pessoa digita).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;

    const aoTeclar = (e) => e.key === "Escape" && onCloseRef.current?.();
    const overflowAnterior = document.body.style.overflow;
    const focoAnterior = document.activeElement;

    document.addEventListener("keydown", aoTeclar);
    document.body.style.overflow = "hidden";
    painelRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflowAnterior;
      if (focoAnterior && typeof focoAnterior.focus === "function") {
        focoAnterior.focus();
      }
    };
  }, [open]);

  if (!open) return null;

  const rodape =
    footer !== undefined ? (
      footer
    ) : onSave ? (
      <>
        <Button variant="secondary" onClick={onClose} disabled={saving}>
          {cancelLabel}
        </Button>
        <Button
          variant="primary"
          icon="check"
          onClick={onSave}
          loading={saving}
          disabled={saveDisabled}
        >
          {saveLabel}
        </Button>
      </>
    ) : null;

  return createPortal(
    <div className="ui-drawer-root">
      <div className="ui-drawer-overlay" onClick={onClose} aria-hidden="true" />
      <aside
        ref={painelRef}
        className="ui-drawer"
        style={{ "--ui-drawer-w": `${width}px` }}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        tabIndex={-1}
      >
        <header className="ui-drawer__head">
          <div className="ui-drawer__titles">
            <h2 className="ui-drawer__title">{title}</h2>
            {subtitle && <p className="ui-drawer__subtitle">{subtitle}</p>}
          </div>
          <Button
            variant="ghost"
            iconOnly
            icon="x"
            onClick={onClose}
            title="Fechar"
            aria-label="Fechar"
          />
        </header>

        <div className="ui-drawer__body">{children}</div>

        {rodape && <footer className="ui-drawer__foot">{rodape}</footer>}
      </aside>
    </div>,
    document.body,
  );
};

export default Drawer;
