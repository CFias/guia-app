import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import "./styles.css";

import logo from "../../assets/clover.png";
import { useAuth } from "../../Context/AuthContext";
import NotificacoesSino from "../../components/Notificacoes/NotificacoesSino";
import { ACESSO, ROLE_LABELS } from "../../Context/permissions";
import { usePreferenciasUI } from "../../Context/preferenciasUIContext";
import Icon from "../../components/ui/Icon";
import {
  GRUPOS_MENU,
  ITEM_CONFIGURACOES,
  ITEM_SOBRE,
  ROTAS_FORA_DO_MENU,
} from "../../components/Shell/navConfig";
import { ShellContext } from "../../components/Shell/shellContext";
import { definirTituloAba } from "../../components/Shell/tituloAba";

/* =========================================================
   LAYOUT (shell) — sidebar 256px / 72px recolhida + topbar 64px.
   É o elemento da rota "/" (App.jsx); as telas entram no <Outlet />.
   ========================================================= */

const iniciais = (nome = "") =>
  String(nome)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

// "Qui, 08 out"
const formatarDataTopo = (data) => {
  const texto = data
    .toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })
    .replace(/\./g, "")
    .replace(/ de /g, " ");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

const formatarHora = (ms) =>
  new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const itemAtivo = (item, pathname) => {
  if (item.match) return item.match.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (item.end) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
};

const Dashboard = ({ loading }) => {
  const { perfil, role, logout } = useAuth();
  const { pathname } = useLocation();
  const { sidebarRecolhida, setSidebarRecolhida } = usePreferenciasUI();

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

  // Grupos do menu abrem/fecham por conta própria — abertos por padrão,
  // pra navegação continuar visível de cara.
  const [gruposAbertos, setGruposAbertos] = useState({});

  const toggleGrupo = (chave) =>
    setGruposAbertos((prev) => ({ ...prev, [chave]: prev[chave] === false }));

  // O que aparece no menu depende do nível. Pra liberar mais itens ao
  // Comercial no futuro: inclua o item em components/Shell/navConfig.js
  // e a rota em ACESSO (permissions.js) + App.jsx.
  const veOperacao = ACESSO.painel.includes(role);

  const podeVer = useCallback(
    (item) => (ACESSO[item.area] || []).includes(role),
    [role],
  );

  const grupos = useMemo(
    () =>
      GRUPOS_MENU.filter((g) => !(g.somenteSemPainel && veOperacao))
        .map((g) => ({ ...g, itens: g.itens.filter(podeVer) }))
        .filter((g) => g.itens.length > 0),
    [podeVer, veOperacao],
  );

  // breadcrumb: Grupo / Página
  const migalhas = useMemo(() => {
    for (const g of grupos) {
      const item = g.itens.find((i) => itemAtivo(i, pathname));
      if (item) return [g.titulo, item.label];
    }
    return ROTAS_FORA_DO_MENU[pathname] || null;
  }, [grupos, pathname]);

  // título da aba do navegador acompanha a página aberta
  const tituloPagina = migalhas ? migalhas[1] : "";
  useEffect(() => {
    definirTituloAba(tituloPagina);
  }, [tituloPagina]);

  // data da topbar (atualiza sozinha na virada do dia)
  const [hoje, setHoje] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setHoje(new Date()), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // Indicador "Phoenix · HH:MM" (a tela aberta se registra via usePhoenixStatus)
  const [phoenix, setPhoenix] = useState(null);
  const registrarPhoenix = useCallback((dados) => setPhoenix(dados), []);
  const shellValue = useMemo(
    () => ({ phoenix, registrarPhoenix }),
    [phoenix, registrarPhoenix],
  );

  // Desktop: menu recolhido (só ícones). Na gaveta do celular, sempre completo.
  const recolhido = sidebarRecolhida && !menuAberto;

  const getNavClass = (item) =>
    `sidebar-link ${itemAtivo(item, pathname) ? "active" : ""}`;

  const renderItem = (item) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      className={() => getNavClass(item)}
      title={recolhido ? item.label : undefined}
      aria-label={recolhido ? item.label : undefined}
    >
      <Icon name={item.icon} size={18} className="sidebar-icon" />
      <span className="sidebar-label">{item.label}</span>
    </NavLink>
  );

  return (
    <ShellContext.Provider value={shellValue}>
      <div
        className={`dashboard-container app-shell ${recolhido ? "is-collapsed" : ""}`}
      >
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
          aria-label="Menu principal"
        >
          <div className="sidebar-top">
            <NavLink
              to={veOperacao ? "/" : "/faqcomercial"}
              className="sidebar-brand-wrap"
              title={recolhido ? "Operacional SSA" : undefined}
            >
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
              className="sidebar-collapse"
              onClick={() => setSidebarRecolhida((v) => !v)}
              title={recolhido ? "Expandir menu" : "Recolher menu"}
              aria-label={recolhido ? "Expandir menu" : "Recolher menu"}
              aria-pressed={recolhido}
            >
              <Icon name={recolhido ? "chevronsRight" : "chevronsLeft"} size={16} />
            </button>

            <button
              type="button"
              className="sidebar-close"
              onClick={() => setMenuAberto(false)}
              aria-label="Fechar menu"
            >
              <Icon name="x" size={18} />
            </button>
          </div>

          <nav className="sidebar-menu">
            {grupos.map((g) => {
              const aberto = gruposAbertos[g.chave] !== false || recolhido;
              return (
                <div className="sidebar-group" key={g.chave}>
                  <button
                    type="button"
                    className="sidebar-group-title sidebar-group-toggle"
                    onClick={() => toggleGrupo(g.chave)}
                    aria-expanded={aberto}
                  >
                    <span>{g.titulo}</span>
                    <Icon
                      name="chevronDown"
                      size={14}
                      className={`sidebar-group-chevron ${aberto ? "aberto" : ""}`}
                    />
                  </button>
                  {aberto && g.itens.map(renderItem)}
                </div>
              );
            })}
          </nav>

          <div className="sidebar-footer">
            {podeVer(ITEM_CONFIGURACOES) && renderItem(ITEM_CONFIGURACOES)}
            {podeVer(ITEM_SOBRE) && renderItem(ITEM_SOBRE)}

            <div className="sidebar-user">
              <span className="sidebar-avatar" aria-hidden="true">
                {iniciais(perfil?.nome)}
              </span>
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
                <Icon name="logout" size={16} />
              </button>
            </div>

            <div className="sidebar-version">v1.2.0 Beta</div>
          </div>
        </aside>

        <div className="dashboard-content">
          <header className="app-topbar">
            <button
              type="button"
              className="dashboard-menu-btn"
              onClick={() => setMenuAberto(true)}
              aria-label="Abrir menu"
              aria-expanded={menuAberto}
            >
              <Icon name="menu" size={20} />
            </button>

            <nav className="app-breadcrumb" aria-label="Você está em">
              {migalhas ? (
                <>
                  <span className="app-breadcrumb__grupo">{migalhas[0]}</span>
                  <span className="app-breadcrumb__sep" aria-hidden="true">
                    /
                  </span>
                  <strong className="app-breadcrumb__pagina">{migalhas[1]}</strong>
                </>
              ) : (
                <strong className="app-breadcrumb__pagina">Operacional SSA</strong>
              )}
            </nav>

            <div className="app-topbar__right">
              <span className="app-topbar__data">
                <Icon name="calendar" size={15} />
                {formatarDataTopo(hoje)}
              </span>

              {phoenix && (
                <button
                  type="button"
                  className={`app-phoenix ${phoenix.carregando ? "is-loading" : ""}`}
                  onClick={phoenix.atualizar}
                  disabled={phoenix.carregando}
                  title="Atualizar dados do Phoenix desta tela"
                >
                  {phoenix.carregando ? (
                    <Icon name="loader" size={14} className="ui-spin" />
                  ) : (
                    <span className="app-phoenix__dot" aria-hidden="true" />
                  )}
                  <span>
                    Phoenix
                    {phoenix.atualizadoEm ? ` · ${formatarHora(phoenix.atualizadoEm)}` : ""}
                  </span>
                  <Icon name="refresh" size={14} className="app-phoenix__refresh" />
                </button>
              )}

              {/* Notificações em tempo real (só operacional) */}
              {veOperacao && (
                <div className="dashboard-bell">
                  <NotificacoesSino />
                </div>
              )}
            </div>
          </header>

          <main className="dashboard-main app-content">
            {loading && (
              <div className="loading-overlay">
                <div className="spinner" />
              </div>
            )}
            <Outlet />
          </main>
        </div>
      </div>
    </ShellContext.Provider>
  );
};

export default Dashboard;
