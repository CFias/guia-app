import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./styles/tokens.css"; // primeiro: tokens de cor/fonte/raio de todo o app
import "./components/ui/ui.css";
import App from "./App";
import RegistroAtividade from "./components/Atividade/RegistroAtividade";
import { ThemeProvider } from "./Context/ThemeContext";
import { AuthProvider } from "./Context/AuthContext";
import RegiaoProvider from "./Context/RegiaoProvider";
import { PreferenciasUIProvider } from "./Context/PreferenciasUI";
import ToastProvider from "./components/ui/ToastProvider";
import "./uiStates.css";
import "./styles/telas-legado.css"; // etapa 14: telas fora da referência
import "./responsive.css"; // por último: tem a palavra final sobre os estilos das telas

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <RegiaoProvider>
            <PreferenciasUIProvider>
              <ToastProvider>
                <RegistroAtividade />
                <App />
              </ToastProvider>
            </PreferenciasUIProvider>
          </RegiaoProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
