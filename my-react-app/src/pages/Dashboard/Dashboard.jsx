import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import "./styles.css";

import logo from "../../assets/clover.png";
import {
  AutoAwesomeRounded,
  AssignmentIndRounded,
  PeopleAltRounded,
  FactCheckRounded,
  MapRounded,
  PlaylistAddCheckCircleRounded,
  SettingsRounded,
  DashboardRounded,
  ExpandMoreRounded,
  AirportShuttleRounded,
  LocalShippingRounded,
  AssignmentRounded,
  QuizRounded,
  VisibilityRounded,
  AdminPanelSettingsRounded,
  CloseRounded,
  LogoutRounded,
  MenuRounded,
} from "@mui/icons-material";
import { useAuth } from "../../Context/AuthContext";
import NotificacoesSino from "../../components/Notificacoes/NotificacoesSino";
import { ACESSO, ROLE_LABELS } from "../../Context/permissions";

const Dashboard = ({ loading }) => {
  const { perfil, role, logout } = useAuth();

  // Celular / tablet: o menu vira uma gaveta que abre pelo botão ☰.
  const [menuAberto, setMenuAberto] = useState(false);

  useEffect(() => {
    if (!menuAberto) return;

    const aoTeclar = (e) => e.key === "Escape" && setMenuAberto(false);
    const overflowAnterior = document.body.style.overflow;

    document.addEventListener("keydown", aoTeclar);
    document.body.style.overflow = "hidden"; // não rola a página por trás da gaveta

    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflowAnterior;
    };
  }, [menuAberto]);

  // Tocou num link do menu → fecha a gaveta.
  const fecharAoNavegar = (e) => {
    if (e.target.closest("a")) setMenuAberto(false);
  };

  // Grupos do menu (Operação, Cadastros) abrem/fecham por conta própria —
  // abertos por padrão, pra navegação continuar visível de cara.
  const [gruposAbertos, setGruposAbertos] = useState({
    operacao: true,
    cadastros: true,
  });

  const toggleGrupo = (chave) =>
    setGruposAbertos((prev) => ({ ...prev, [chave]: !prev[chave] }));

  // O que aparece no menu depende do nível. Pra liberar mais itens ao
  // Comercial no futuro: coloque o <NavLink> no grupo "Comercial" abaixo
  // e inclua a rota em ACESSO (permissions.js) + App.jsx.
  const veOperacao = ACESSO.painel.includes(role);
  const veFaq = ACESSO.faqComercial.includes(role);

  const getNavClass = ({ isActive }) =>
    `sidebar-link ${isActive ? "active" : ""}`;

  return (
    <div className="dashboard-container">
      {/* Barra superior (só aparece em celular/tablet) */}
      <header className="dashboard-topbar">
        <button
          type="button"
          className="dashboard-menu-btn"
          onClick={() => setMenuAberto(true)}
          aria-label="Abrir menu"
          aria-expanded={menuAberto}
        >
          <MenuRounded />
        </button>
        <NavLink to="/" className="dashboard-topbar-brand">
          <img src={logo} alt="" />
          <strong>Operacional SSA</strong>
        </NavLink>
      </header>

      {/* Notificações em tempo real (só operacional). Fica fora da sidebar
          pra continuar visível com a gaveta fechada. */}
      {veOperacao && (
        <div className="dashboard-bell">
          <NotificacoesSino />
        </div>
      )}

      {menuAberto && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMenuAberto(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`sidebar ${menuAberto ? "aberto" : ""}`}
        onClick={fecharAoNavegar}
      >
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

          <button
            type="button"
            className="sidebar-close"
            onClick={() => setMenuAberto(false)}
            aria-label="Fechar menu"
          >
            <CloseRounded fontSize="small" />
          </button>
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
            <button
              type="button"
              className="sidebar-group-title sidebar-group-toggle"
              onClick={() => toggleGrupo("operacao")}
              aria-expanded={gruposAbertos.operacao}
            >
              <span>Operação</span>
              <ExpandMoreRounded
                fontSize="small"
                className={`sidebar-group-chevron ${gruposAbertos.operacao ? "aberto" : ""}`}
              />
            </button>
            {gruposAbertos.operacao && (
              <>
            <NavLink to="op" className={getNavClass}>
              <AssignmentRounded fontSize="small" className="sidebar-icon" />
              <span>Painel Operacional</span>
            </NavLink>
            <NavLink to="previas" className={getNavClass}>
              <AirportShuttleRounded fontSize="small" className="sidebar-icon" />
              <span>Prévia de Transfers</span>
            </NavLink>

            <NavLink to="passeios" className={getNavClass}>
              <AutoAwesomeRounded fontSize="small" className="sidebar-icon" />
              <span>Gerar Escala</span>
            </NavLink>
            <NavLink to="guias" className={getNavClass}>
              <PeopleAltRounded fontSize="small" className="sidebar-icon" />
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
              <VisibilityRounded fontSize="small" className="sidebar-icon" />
              <span>Ver como o comercial</span>
            </NavLink>
              </>
            )}
          </div>

          <div className="sidebar-group">
            <button
              type="button"
              className="sidebar-group-title sidebar-group-toggle"
              onClick={() => toggleGrupo("cadastros")}
              aria-expanded={gruposAbertos.cadastros}
            >
              <span className="btn-span">Cadastros</span>
              <ExpandMoreRounded
                fontSize="small"
                className={`sidebar-group-chevron ${gruposAbertos.cadastros ? "aberto" : ""}`}
              />
            </button>
            {gruposAbertos.cadastros && (
              <>

            <NavLink to="register-guias" className={getNavClass}>
              <AssignmentIndRounded fontSize="small" className="sidebar-icon" />
              <span>Cadastrar Guias</span>
            </NavLink>

            <NavLink to="register-fornecedores" className={getNavClass}>
              <LocalShippingRounded fontSize="small" className="sidebar-icon" />
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
              </>
            )}
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
