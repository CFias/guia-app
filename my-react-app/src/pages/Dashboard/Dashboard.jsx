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
  QuizRounded,
  AdminPanelSettingsRounded,
  LogoutRounded,
} from "@mui/icons-material";
import { useAuth } from "../../Context/AuthContext";
import NotificacoesSino from "../../components/Notificacoes/NotificacoesSino";
import { ACESSO, ROLE_LABELS } from "../../Context/permissions";

const Dashboard = ({ loading }) => {
  const { perfil, role, logout } = useAuth();
  // O que aparece no menu depende do nível. Pra liberar mais itens ao
  // Comercial no futuro: coloque o <NavLink> no grupo "Comercial" abaixo
  // e inclua a rota em ACESSO (permissions.js) + App.jsx.
  const veOperacao = ACESSO.painel.includes(role);
  const veFaq = ACESSO.faqComercial.includes(role);

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

          {/* Notificações em tempo real dos guias (só operacional) */}
          {veOperacao && <NotificacoesSino />}
        </div>

        {veOperacao && (
          <NavLink to="/" className={getNavClass}>
            <DashboardRounded fontSize="small" className="sidebar-icon" />
            <span>Dashboard</span>
          </NavLink>
        )}
        <div className="sidebar-menu">
          {/* ===== COMERCIAL ===== */}
          {!veOperacao && veFaq && (
            <div className="sidebar-group">
              <span className="sidebar-group-title">Comercial</span>
              <NavLink to="faqcomercial" className={getNavClass}>
                <QuizRounded fontSize="small" className="sidebar-icon" />
                <span>Central de Dúvidas</span>
              </NavLink>
            </div>
          )}

          {/* ===== OPERAÇÃO + CADASTROS (só operacional) ===== */}
          {veOperacao && (
            <>
              <div className="sidebar-group">
                <span className="sidebar-group-title">Operação</span>
                <NavLink to="op" className={getNavClass}>
                  <AssignmentRounded
                    fontSize="small"
                    className="sidebar-icon"
                  />
                  <span>Painel Operacional</span>
                </NavLink>
                <NavLink to="previas" className={getNavClass}>
                  <ViewModuleRounded
                    fontSize="small"
                    className="sidebar-icon"
                  />
                  <span>Prévia de Transfers</span>
                </NavLink>

                <NavLink to="passeios" className={getNavClass}>
                  <AnalyticsRounded fontSize="small" className="sidebar-icon" />
                  <span>Gerar Escala</span>
                </NavLink>
                <NavLink to="guias" className={getNavClass}>
                  <DnsRounded fontSize="small" className="sidebar-icon" />
                  <span>Lista de Guias</span>
                </NavLink>
                <NavLink to="mapear-guias" className={getNavClass}>
                  <MapRounded fontSize="small" className="sidebar-icon" />
                  <span>Mapear Guias</span>
                </NavLink>

                <NavLink to="disponibilidade-guia" className={getNavClass}>
                  <FactCheckRounded fontSize="small" className="sidebar-icon" />
                  <span>Disponibilidade da Semana</span>
                </NavLink>

                <NavLink to="faqadmin" className={getNavClass}>
                  <QuizRounded fontSize="small" className="sidebar-icon" />
                  <span>Central de Dúvidas</span>
                </NavLink>

                <NavLink to="faqcomercial" className={getNavClass}>
                  <QuizRounded fontSize="small" className="sidebar-icon" />
                  <span>Ver como o comercial</span>
                </NavLink>
              </div>

              <div className="sidebar-group">
                <span className="sidebar-group-title">Cadastros</span>

                <NavLink to="register-guias" className={getNavClass}>
                  <AssignmentIndRounded
                    fontSize="small"
                    className="sidebar-icon"
                  />
                  <span>Cadastrar Guias</span>
                </NavLink>

                <NavLink to="register-fornecedores" className={getNavClass}>
                  <LocalShippingRounded
                    fontSize="small"
                    className="sidebar-icon"
                  />
                  <span>Cadastrar Fornecedores</span>
                </NavLink>

                <NavLink to="usuarios" className={getNavClass}>
                  <AdminPanelSettingsRounded
                    fontSize="small"
                    className="sidebar-icon"
                  />
                  <span>Usuários e Acessos</span>
                </NavLink>
                {/* <NavLink to="register-tours" className={getNavClass}>
              <PlaylistAddCheckCircleRounded
                fontSize="small"
                className="sidebar-icon"
              />
              <span>Cadastrar Passeios</span>
            </NavLink> */}
              </div>
            </>
          )}
        </div>

        <div className="sidebar-footer">
          {veOperacao && (
            <NavLink to="configuracoes" className={getNavClass}>
              <SettingsRounded fontSize="small" className="sidebar-icon" />
              <span>Configurações</span>
            </NavLink>
          )}

          <div className="sidebar-user">
            <div className="sidebar-user-info">
              <strong>{perfil?.nome}</strong>
              <span>{ROLE_LABELS[role]}</span>
            </div>
            <button
              type="button"
              className="sidebar-logout"
              onClick={logout}
              title="Sair"
              aria-label="Sair"
            >
              <LogoutRounded fontSize="small" />
            </button>
          </div>

          <div className="sidebar-version">v1.2.0 Beta</div>
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
