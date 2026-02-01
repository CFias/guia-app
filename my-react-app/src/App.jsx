import { Routes, Route } from "react-router-dom";
import "./App.css";

import Dashboard from "./pages/Dashboard/Dashboard";
import RegisterGuias from "./components/RegisterGuias/RegisterGuias";
import RegisterTours from "./components/RegisterTours/RegisterTours";
import DisponibilidadeGuia from "./components/DisponibilidadeGuia/DisponibilidadeGuia";
import GerarEscalaSemanal from "./components/EscalaSemanal/EscalaSemanal";
import ListaGuias from "./components/Guias/ListaGuias";
import ListaPasseios from "./components/ListaPasseios/ListaPasseios";
import RelatoriosGuias from "./components/RelatoriosGuias/RelatoriosGuias";

function App() {
  return (
    <Routes>
      {/* ===== DASHBOARD COMO LAYOUT ===== */}
      <Route path="/" element={<Dashboard />}>

        {/* ROTAS INTERNAS (renderizam no <Outlet />) */}
        <Route path="register-guias" element={<RegisterGuias />} />
        <Route path="register-tours" element={<RegisterTours />} />
        <Route path="disponibilidade-guia" element={<DisponibilidadeGuia />} />
        <Route path="escala-semanal" element={<GerarEscalaSemanal />} />

        {/* rotas futuras */}
        <Route path="guias" element={<ListaGuias />} />
        <Route path="passeios" element={<ListaPasseios />} />
        <Route path="relatorios-guias" element={<RelatoriosGuias />} />

      </Route>
    </Routes>
  );
}

export default App;
