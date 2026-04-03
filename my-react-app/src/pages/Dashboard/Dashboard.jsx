import { NavLink, Outlet } from "react-router-dom";
import "./styles.css";

import logo from "../../assets/clover.png";
import {
  AnalyticsRounded,
  AssignmentIndRounded,
  DnsRounded,
  FactCheckRounded,
  MapRounded,
  PlaylistAddCheckCircleRounded,
  SettingsRounded,
  DashboardRounded,
  FlightLandRounded,
  ViewModuleRounded,
  FlightTakeoffRounded,
  LocalShippingRounded,
  AssignmentRounded,
  AssessmentRounded,
} from "@mui/icons-material";

const Dashboard = ({ loading }) => {
  const getNavClass = ({ isActive }) =>
    `sidebar-link ${isActive ? "active" : ""}`;

  return (
    <div className="dashboard-container">
      <aside className="sidebar">
        <div className="sidebar-top">
          <NavLink to="/" className="sidebar-brand-wrap">
            <div className="sidebar-logo-box">
              <img src={logo} alt="Operacional SSA" />
            </div>

            <div className="sidebar-brand">
              <strong>Operacional SSA</strong>
              <span>Gestão de serviços</span>
            </div>
          </NavLink>
        </div>

        <NavLink to="/" className={getNavClass}>
          <DashboardRounded fontSize="small" className="sidebar-icon" />
          <span>Dashboard</span>
        </NavLink>
        <div className="sidebar-menu">
          <div className="sidebar-group">
            <span className="sidebar-group-title">Operação</span>
            <NavLink to="op" className={getNavClass}>
              <AssignmentRounded fontSize="small" className="sidebar-icon" />
              <span>Painel Operacional</span>
            </NavLink>
            <NavLink to="previas" className={getNavClass}>
              <ViewModuleRounded fontSize="small" className="sidebar-icon" />
              <span>Prévia de Transfers</span>
            </NavLink>
            <NavLink to="mapear-guias" className={getNavClass}>
              <MapRounded fontSize="small" className="sidebar-icon" />
              <span>Mapear Guias</span>
            </NavLink>

            <NavLink to="passeios" className={getNavClass}>
              <AnalyticsRounded fontSize="small" className="sidebar-icon" />
              <span>Gerar Escala</span>
            </NavLink>
            <NavLink to="guias" className={getNavClass}>
              <DnsRounded fontSize="small" className="sidebar-icon" />
              <span>Lista de Guias</span>
            </NavLink>

            <NavLink to="disponibilidade-guia" className={getNavClass}>
              <FactCheckRounded fontSize="small" className="sidebar-icon" />
              <span>Disponibilidade da Semana</span>
            </NavLink>
            <NavLink to="relatorios" className={getNavClass}>
              <AssessmentRounded fontSize="small" className="sidebar-icon" />
              <span>Analytics - beta</span>
            </NavLink>

            {/* <NavLink to="chegadas" className={getNavClass}>
              <FlightLandRounded fontSize="small" className="sidebar-icon" />
              <span>Painel de Chegadas</span>
            </NavLink>
            <NavLink to="outs" className={getNavClass}>
              <FlightTakeoffRounded fontSize="small" className="sidebar-icon" />
              <span>Painel de OUT's</span>
            </NavLink>
            <NavLink to="resumo" className={getNavClass}>
              <AssignmentRounded fontSize="small" className="sidebar-icon" />
              <span>Painel de Passeios</span>
            </NavLink> */}
          </div>

          <div className="sidebar-group">
            <span className="sidebar-group-title">Cadastros</span>

            <NavLink to="register-guias" className={getNavClass}>
              <AssignmentIndRounded fontSize="small" className="sidebar-icon" />
              <span>Cadastrar Guias</span>
            </NavLink>

            <NavLink to="register-fornecedores" className={getNavClass}>
              <LocalShippingRounded fontSize="small" className="sidebar-icon" />
              <span>Cadastrar Fornecedores</span>
            </NavLink>
            <NavLink to="register-tours" className={getNavClass}>
              <PlaylistAddCheckCircleRounded
                fontSize="small"
                className="sidebar-icon"
              />
              <span>Cadastrar Passeios</span>
            </NavLink>
          </div>
        </div>

        <div className="sidebar-footer">
          <NavLink to="configuracoes" className={getNavClass}>
            <SettingsRounded fontSize="small" className="sidebar-icon" />
            <span>Configurações</span>
          </NavLink>

          <div className="sidebar-version">v1.1.1 Beta</div>
        </div>
      </aside>

      <div className="dashboard-content">
        <main className="dashboard-main">
          {loading && (
            <div className="loading-overlay">
              <div className="spinner" />
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
