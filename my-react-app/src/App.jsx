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
import Home from "./components/Home/Home";
import Configuracoes from "./pages/Configuracoes/Configuracoes";
import MapaAfinidadeGuias from "./components/MapaAfinidadeGuias/MapaAfinidadeGuias";
import PreviaTransfers from "./components/PreviaTransfers/PreviaTransfers";
import PainelChegadas from "./components/PainelChegadas/PainelChegadas";
import CadastroFornecedores from "./components/CadastroFornecedores/CadastroFornecedores";
import PainelOuts from "./components/PainelSaidas/PainelSaidas";
import ResumoOperacionalGuias from "./components/ResumoOperacional/ResumoOperacional";
import PainelOperacionalUnificado from "./components/PainelOperacional/PainelOperacional";
import RelatoriosOperacionais from "./components/RelatoriosOp/RelatoriosOp";
import RoboConferenteVoos from "./components/RoboConferenteVoos/RoboConferenteVoos";


function App() {
  return (
    <Routes>
      {/* ===== DASHBOARD COMO LAYOUT ===== */}
      <Route path="/" element={<Dashboard />}>

        {/* ROTAS INTERNAS (renderizam no <Outlet />) */}
        <Route path="mapear-guias" element={<MapaAfinidadeGuias />} />
        <Route path="previas" element={<PreviaTransfers />} />
        <Route path="register-fornecedores" element={<CadastroFornecedores />} />
        <Route path="op" element={<PainelOperacionalUnificado />} />
        <Route path="chegadas" element={<PainelChegadas />} />
        <Route path="outs" element={<PainelOuts />} />
        <Route path="register-guias" element={<RegisterGuias />} />
        <Route path="register-tours" element={<RegisterTours />} />
        <Route path="resumo" element={<ResumoOperacionalGuias />} />
        <Route path="disponibilidade-guia" element={<DisponibilidadeGuia />} />
        <Route path="escala-semanal" element={<GerarEscalaSemanal />} />
        <Route path="relatorios" element={<RelatoriosOperacionais />} />
        <Route path="conferencia" element={<RoboConferenteVoos />} />
        <Route path="/" element={<Home />} />
        <Route path="configuracoes" element={<Configuracoes />} />
        {/* rotas futuras */}
        <Route path="guias" element={<ListaGuias />} />
        <Route path="passeios" element={<ListaPasseios />} />

      </Route>
    </Routes>
  );
}

export default App;
