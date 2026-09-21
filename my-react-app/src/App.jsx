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
import FaqComercial from "./components/FaqComercial/FaqComercial";
import FaqAdmin from "./components/FaqAdmin/FaqAdmin";
import GerenciarUsuarios from "./components/GerenciarUsuarios/GerenciarUsuarios";
import MinhaDisponibilidade from "./components/MinhaDisponibilidade/MinhaDisponibilidade";
import Login from "./pages/Login/Login";
import { RedirectHome, RequireRole } from "./components/Auth/RouteGuards";
import { ACESSO } from "./Context/permissions";

function App() {
  return (
    <Routes>
      {/* ===== PÚBLICA: só login (não existe tela de cadastro) ===== */}
      <Route path="/login" element={<Login />} />

      {/* ===== DASHBOARD COMO LAYOUT (menu lateral) =====
          Operacional e Comercial entram; cada um vê só o seu menu. */}
      <Route element={<RequireRole roles={ACESSO.layout} />}>
        <Route path="/" element={<Dashboard />}>
          {/* ---- Telas do OPERACIONAL ---- */}
          <Route element={<RequireRole roles={ACESSO.painel} />}>
            <Route index element={<Home />} />
            <Route path="mapear-guias" element={<MapaAfinidadeGuias />} />
            <Route path="previas" element={<PreviaTransfers />} />
            <Route
              path="register-fornecedores"
              element={<CadastroFornecedores />}
            />
            <Route path="op" element={<PainelOperacionalUnificado />} />
            <Route path="chegadas" element={<PainelChegadas />} />
            <Route path="outs" element={<PainelOuts />} />
            <Route path="register-guias" element={<RegisterGuias />} />
            <Route path="register-tours" element={<RegisterTours />} />
            <Route path="resumo" element={<ResumoOperacionalGuias />} />
            <Route
              path="disponibilidade-guia"
              element={<DisponibilidadeGuia />}
            />
            <Route path="escala-semanal" element={<GerarEscalaSemanal />} />
            <Route path="relatorios" element={<RelatoriosOperacionais />} />
            <Route path="conferencia" element={<RoboConferenteVoos />} />
            <Route path="configuracoes" element={<Configuracoes />} />
            <Route path="faqadmin" element={<FaqAdmin />} />
            <Route path="usuarios" element={<GerenciarUsuarios />} />
            {/* rotas futuras */}
            <Route path="guias" element={<ListaGuias />} />
            <Route path="passeios" element={<ListaPasseios />} />
          </Route>

          {/* ---- Telas do COMERCIAL (Operacional também acessa) ---- */}
          <Route element={<RequireRole roles={ACESSO.faqComercial} />}>
            <Route path="faqcomercial" element={<FaqComercial />} />
          </Route>
        </Route>
      </Route>

      {/* ===== GUIA: só a própria disponibilidade ===== */}
      <Route element={<RequireRole roles={ACESSO.minhaDisponibilidade} />}>
        <Route
          path="/minha-disponibilidade"
          element={<MinhaDisponibilidade />}
        />
      </Route>

      {/* Qualquer outra URL volta pra home do nível de cada um */}
      <Route path="*" element={<RedirectHome />} />
    </Routes>
  );
}

export default App;
