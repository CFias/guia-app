import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import "./styles.css";

import PlaylistAddCircleRoundedIcon from "@mui/icons-material/PlaylistAddCircleRounded";
import PlaylistAddCheckCircleRoundedIcon from "@mui/icons-material/PlaylistAddCheckCircleRounded";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import TourIcon from "@mui/icons-material/Tour";
import StyleIcon from "@mui/icons-material/Style";

import logo from "../../assets/logo4.png";

const Dashboard = ({ loading }) => {
  return (
    <div className="dashboard-container">
      
      {/* ===== SIDEBAR ===== */}
      <aside className="side-dashboard">
        <NavLink to="/" className="logo-dashboard">
          <img src={logo} alt="Ferramenta Operacional SSA" />
        </NavLink>

        <h4 className="name-side">Serviços e Guias</h4>
        <NavLink to="guias" className="card">
          <AccountCircleIcon fontSize="small" className="icon-side" />
          <span className="label">Lista de Guias</span>
        </NavLink>

        <NavLink to="passeios" className="card">
          <TourIcon fontSize="small" className="icon-side" />
          <span className="label">Gerar Escala</span>
        </NavLink>

        <NavLink to="disponibilidade-guia" className="card">
          <PlaylistAddCheckCircleRoundedIcon
            fontSize="small"
            className="icon-side"
          />
          <span className="label">Disponibilidade da Semana</span>
        </NavLink>

        <NavLink to="register-guias" className="card">
          <PlaylistAddCircleRoundedIcon
            fontSize="small"
            className="icon-side"
          />
          <span className="label">Cadastrar Guias</span>
        </NavLink>

        <NavLink to="register-tours" className="card">
          <StyleIcon fontSize="small" className="icon-side" />
          <span className="label">Cadastrar Passeios</span>
        </NavLink>

        {/* <h4 className="name-side">Relatórios</h4>

        <NavLink to="relatorios-guias" className="card">
          <WorkHistoryRoundedIcon fontSize="small" className="icon-side" />
          <span className="label">Histórico de Guias</span>
        </NavLink> */}
      </aside>

      {/* ===== CONTEÚDO ===== */}
      <div className="dashboard-content">
        <main className="dashboard-cards">
          {loading && <div className="loading">Carregando...</div>}
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
