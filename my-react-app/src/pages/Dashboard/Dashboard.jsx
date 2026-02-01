import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import "./styles.css";
import PlaylistAddCircleRoundedIcon from "@mui/icons-material/PlaylistAddCircleRounded";
import PlaylistAddCheckCircleRoundedIcon from "@mui/icons-material/PlaylistAddCheckCircleRounded";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import TourIcon from "@mui/icons-material/Tour";
import StyleIcon from "@mui/icons-material/Style";
import WorkHistoryRoundedIcon from "@mui/icons-material/WorkHistoryRounded";
import logo from "../../assets/logoop.png";

const Dashboard = ({ loading }) => {
  return (
    <div className="dashboard-container">
      {/* ===== SIDEBAR ===== */}
      <aside className="side-dashboard">
        <NavLink to="/" className="logo-dashboard">
          <img className="name-logo" src={logo} alt="" />
        </NavLink>
        {/* <div className="dashboard-nav">
          <input
            className="search-input"
            type="text"
            placeholder="Buscar por Guia, serviços e idiomas"
          />
        </div> */}

        <h4 className="name-side">Serviços e Guias</h4>
        <NavLink to="guias" className="card">
          <AccountCircleIcon fontSize="small" className="icon-side" /> Lista de
          Guias
        </NavLink>
        <NavLink to="passeios" className="card">
          <TourIcon fontSize="small" className="icon-side" /> Lista de Passeios
        </NavLink>

        <NavLink to="disponibilidade-guia" className="card">
          <PlaylistAddCheckCircleRoundedIcon
            fontSize="small"
            className="icon-side"
          />{" "}
          Disponibilidade da Semana
        </NavLink>
        <NavLink to="register-guias" className="card">
          <PlaylistAddCircleRoundedIcon
            fontSize="small"
            className="icon-side"
          />{" "}
          Cadastrar Guias
        </NavLink>
        <NavLink to="register-tours" className="card">
          <StyleIcon fontSize="small" className="icon-side" /> Cadastrar
          Passeios
        </NavLink>

        <h4 className="name-side">Relatórios</h4>
        <NavLink to="bloqueios" className="card">
          <WorkHistoryRoundedIcon fontSize="small" className="icon-side" />{" "}
          Histórico de Bloqueios
        </NavLink>
      </aside>

      {/* ===== CONTEÚDO ===== */}
      <div className="dashboard-content">
        <main className="dashboard-cards">
          {loading && <LoadingOverlay />}
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
