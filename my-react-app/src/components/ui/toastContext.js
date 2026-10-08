import { createContext, useContext } from "react";

/* Toast: aviso curto centralizado embaixo (ex.: "Script copiado").
   Uso: const { mostrarToast } = useToast(); mostrarToast("Copiado!"); */
export const ToastContext = createContext({ mostrarToast: () => {} });

export const useToast = () => useContext(ToastContext);
