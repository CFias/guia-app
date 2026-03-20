import { Routes, Route } from "react-router-dom";
import "./App.css";
import "./uiStates.css";

import Dashboard from "./pages/Dashboard/Dashboard";
import RegisterGuias from "./components/RegisterGuias/RegisterGuias";
import RegisterTours from "./components/RegisterTours/RegisterTours";
import DisponibilidadeGuia from "./components/DisponibilidadeGuia/DisponibilidadeGuia";
import GerarEscalaSemanal from "./components/EscalaSemanal/EscalaSemanal";
import ListaGuias from "./components/Guias/ListaGuias";
import ListaPasseios from "./components/ListaPasseios/ListaPasseios";
import RelatoriosGuias from "./components/RelatoriosGuias/RelatoriosGuias";
import Home from "./components/Home/Home";
import Configuracoes from "./pages/Configuracoes/Configuracoes";
import MapaAfinidadeGuias from "./components/MapaAfinidadeGuias/MapaAfinidadeGuias";
import PreviaTransfers from "./components/PreviaTransfers/PreviaTransfers";
import PainelChegadas from "./components/PainelChegadas/PainelChegadas";
import CadastroFornecedores from "./components/CadastroFornecedores/CadastroFornecedores";

function App() {
  return (
    <Routes>
      {/* ===== DASHBOARD COMO LAYOUT ===== */}
      <Route path="/" element={<Dashboard />}>

        {/* ROTAS INTERNAS (renderizam no <Outlet />) */}
        <Route path="mapear-guias" element={<MapaAfinidadeGuias />} />
        <Route path="previas" element={<PreviaTransfers />} />
        <Route path="register-fornecedores" element={<CadastroFornecedores />} />
        <Route path="chegadas" element={<PainelChegadas />} />
        <Route path="register-guias" element={<RegisterGuias />} />
        <Route path="register-tours" element={<RegisterTours />} />
        <Route path="disponibilidade-guia" element={<DisponibilidadeGuia />} />
        <Route path="escala-semanal" element={<GerarEscalaSemanal />} />
        <Route path="/" element={<Home />} />
        <Route path="configuracoes" element={<Configuracoes />} />
        {/* rotas futuras */}
        <Route path="guias" element={<ListaGuias />} />
        <Route path="passeios" element={<ListaPasseios />} />
        <Route path="relatorios-guias" element={<RelatoriosGuias />} />

      </Route>
    </Routes>
  );
}

export default App;
