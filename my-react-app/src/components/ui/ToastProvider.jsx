import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ToastContext } from "./toastContext";

const DURACAO_MS = 2200;

const ToastProvider = ({ children }) => {
  const [mensagem, setMensagem] = useState("");
  const timerRef = useRef(null);

  const mostrarToast = useCallback((texto) => {
    setMensagem(String(texto || ""));
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setMensagem(""), DURACAO_MS);
  }, []);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const value = useMemo(() => ({ mostrarToast }), [mostrarToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mensagem &&
        createPortal(
          <div className="ui-toast" role="status" aria-live="polite">
            <span className="ui-toast__dot" aria-hidden="true" />
            {mensagem}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
};

export default ToastProvider;
