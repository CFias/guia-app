import { Routes, Route } from "react-router-dom";
import "./App.css";
import "./uiStates.css";

import Dashboard from "./pages/Dashboard/Dashboard";
import Cadastros from "./pages/Cadastros/Cadastros";
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
import ServicosFornecedor from "./components/ServicosFornecedor/ServicosFornecedor";
import CustosOperacionais from "./components/CustosOperacionais/CustosOperacionais";
import RelatorioTurnos from "./components/RelatorioTurnos/RelatorioTurnos";
import PainelOuts from "./components/PainelSaidas/PainelSaidas";
import ResumoOperacionalGuias from "./components/ResumoOperacional/ResumoOperacional";
import PainelOperacionalUnificado from "./components/PainelOperacional/PainelOperacional";
import RoboConferenteVoos from "./components/RoboConferenteVoos/RoboConferenteVoos";
import FaqComercial from "./components/FaqComercial/FaqComercial";
import FaqAdmin from "./components/FaqAdmin/FaqAdmin";
import MinhaDisponibilidade from "./components/MinhaDisponibilidade/MinhaDisponibilidade";
import AtendimentoAeroporto from "./components/AtendimentoAeroporto/AtendimentoAeroporto";
import Sobre from "./components/Sobre/Sobre";
import Login from "./pages/Login/Login";
import RedefinirSenha from "./pages/RedefinirSenha/RedefinirSenha";
import { RedirectHome, RequireArea, RequireRole } from "./components/Auth/RouteGuards";
import ControleAcessos from "./components/ControleAcessos/ControleAcessos";
import Regioes from "./components/Regioes/Regioes";
import Balanco from "./components/Atividade/Balanco";
import { ACESSO } from "./Context/permissions";

function App() {
  return (
    <Routes>
      {/* ===== PÚBLICA: só login (não existe tela de cadastro) ===== */}
      <Route path="/login" element={<Login />} />
      {/* Destino do link do e-mail "esqueci minha senha" (pública) */}
      <Route path="/redefinir-senha" element={<RedefinirSenha />} />

      {/* ===== DASHBOARD COMO LAYOUT (menu lateral) =====
          Operacional e Comercial entram; cada um vê só o seu menu. */}
      <Route element={<RequireRole roles={ACESSO.layout} />}>
        <Route path="/" element={<Dashboard />}>
          {/* ---- Telas do OPERACIONAL ---- */}
          <Route element={<RequireRole roles={ACESSO.painel} />}>
            <Route element={<RequireArea />}>
              <Route index element={<Home />} />
              <Route path="mapear-guias" element={<MapaAfinidadeGuias />} />
              <Route path="previas" element={<PreviaTransfers />} />
              {/* Planilha operacional: a mesma tela da Prévia, aberta na planilha */}
              <Route
                path="planilha"
                element={<PreviaTransfers secao="planilha" />}
              />
              {/* Cadastros: as 3 telas de cadastro viram abas (mesmos paths) */}
              <Route
                path="register-fornecedores"
                element={<Cadastros aba="fornecedores" />}
              />
              <Route path="op" element={<PainelOperacionalUnificado />} />
              <Route
                path="servicos-fornecedor"
                element={<ServicosFornecedor />}
              />
              <Route path="custos" element={<CustosOperacionais />} />
              <Route path="recepcao-turnos" element={<RelatorioTurnos />} />
              <Route path="chegadas" element={<PainelChegadas />} />
              <Route path="outs" element={<PainelOuts />} />
              <Route path="register-guias" element={<Cadastros aba="guias" />} />
              <Route path="register-tours" element={<RegisterTours />} />
              <Route path="resumo" element={<ResumoOperacionalGuias />} />
              <Route
                path="disponibilidade-guia"
                element={<DisponibilidadeGuia />}
              />
              <Route path="escala-semanal" element={<GerarEscalaSemanal />} />
              <Route path="conferencia" element={<RoboConferenteVoos />} />
              <Route path="faqadmin" element={<FaqAdmin />} />
              <Route path="usuarios" element={<Cadastros aba="usuarios" />} />
              {/* rotas futuras */}
              <Route path="guias" element={<ListaGuias />} />
              <Route path="passeios" element={<ListaPasseios />} />
            </Route>
            {/* Controle de acessos: a própria tela decide (gerência / ativação) */}
            <Route path="acessos" element={<ControleAcessos />} />
            {/* Regiões (bases Luck): só a gerência — a própria tela confere */}
            <Route path="regioes" element={<Regioes />} />
          </Route>

          {/* ---- Balanço de uso: a gerência e quem ela marcar (a tela confere) ---- */}
          <Route path="balanco" element={<Balanco />} />

          {/* ---- Configurações (comercial vê só a aba Tema) ---- */}
          <Route element={<RequireRole roles={ACESSO.configuracoes} />}>
            <Route path="configuracoes" element={<Configuracoes />} />
          </Route>

          {/* ---- Sobre a FiaSystem (todos que usam o menu lateral) ---- */}
          <Route element={<RequireRole roles={ACESSO.sobre} />}>
            <Route path="sobre" element={<Sobre />} />
          </Route>

          {/* ---- Telas do COMERCIAL (Operacional também acessa) ---- */}
          <Route element={<RequireRole roles={ACESSO.faqComercial} />}>
            <Route element={<RequireArea />}>
              <Route path="faqcomercial" element={<FaqComercial />} />
            </Route>
          </Route>
        </Route>
      </Route>

      {/* ===== GUIA: só a própria disponibilidade ===== */}
      <Route element={<RequireRole roles={ACESSO.minhaDisponibilidade} />}>
        <Route path="/minha-disponibilidade" element={<MinhaDisponibilidade />} />
        {/* Sobre a FiaSystem na versão da área do guia (sem menu lateral) */}
        <Route path="/guia/sobre" element={<Sobre modo="guia" />} />
        {/* Tema (aparência): todos os níveis de conta */}
        <Route path="/guia/tema" element={<Configuracoes voltar="/minha-disponibilidade" textoVoltar="Voltar para minha disponibilidade" />} />
      </Route>

      {/* ===== ATENDIMENTO NO AEROPORTO: painel das cartinhas (sem menu lateral) ===== */}
      <Route element={<RequireRole roles={ACESSO.atendimentoAeroporto} />}>
        <Route path="/atendimento" element={<AtendimentoAeroporto />} />
        <Route path="/atendimento/sobre" element={<Sobre modo="guia" voltar="/atendimento" textoVoltar="Voltar para o atendimento" />} />
        <Route path="/atendimento/tema" element={<Configuracoes voltar="/atendimento" textoVoltar="Voltar para o atendimento" />} />
      </Route>

      {/* Qualquer outra URL volta pra home do nível de cada um */}
      <Route path="*" element={<RedirectHome />} />
    </Routes>
  );
}

export default App;
