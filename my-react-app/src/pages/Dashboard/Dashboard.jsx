import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { VERSAO_TEXTO } from "../../versao";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import "./styles.css";

import logo from "../../assets/clover.png";
import { useAuth } from "../../Context/AuthContext";
import BoasVindasComercial from "../../components/BoasVindas/BoasVindasComercial";
import BoasVindasBase from "../../components/BoasVindas/BoasVindasBase";
import NotificacoesSino from "../../components/Notificacoes/NotificacoesSino";
import { ACESSO, ROLE_LABELS, ROLES } from "../../Context/permissions";
import { areaDaRota, ehGerencia, podeArea, podeVerBalanco, rotaForaDaRegiao } from "../../Context/acessos";
import { rodarAuditoriaAutomatica } from "../../Services/Services/custosRepository";
import AvaliacaoSistema from "../../components/Atividade/AvaliacaoSistema";
import { useRegiao } from "../../Context/regiaoContext";
import { ehSede } from "../../Services/Services/regiaoAtiva";
import { usePreferenciasUI } from "../../Context/preferenciasUIContext";
import Icon from "../../components/ui/Icon";
import {
  GRUPOS_MENU,
  ITEM_CONFIGURACOES,
  ITEM_SOBRE,
  ROTAS_FORA_DO_MENU,
} from "../../components/Shell/navConfig";
import { ShellContext } from "../../components/Shell/shellContext";
import FotosGuiasProvider from "../../Context/FotosGuias";
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
  if (item.abas) return item.abas.some((a) => pathname === a.to || pathname.startsWith(`${a.to}/`));
  if (item.match) return item.match.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (item.end) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
};

const Dashboard = ({ loading }) => {
  const { perfil, role, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { sidebarRecolhida, setSidebarRecolhida } = usePreferenciasUI();
  const { regiao, todas, podeTrocar, trocarRegiao, carregando: carregandoRegiao, indisponivel } = useRegiao();
  const naSede = ehSede(regiao);

  // Auditoria de escala automática: com o sistema aberto por quem tem acesso
  // a Custos, guarda a programação do dia logo depois da meia-noite e, a cada
  // 10 min, registra as alterações do dia (Custos e alterações → Auditor).
  // Cada base audita a própria programação (a base em uso, com a tela liberada).
  const podeAuditar = role === ROLES.OPERACIONAL && !carregandoRegiao && !indisponivel && podeArea(perfil, "custos", regiao);
  useEffect(() => {
    if (!podeAuditar) return undefined;
    const rodar = () => rodarAuditoriaAutomatica(perfil, null, regiao).catch((e) => console.error("Auditoria automática:", e));
    const primeira = setTimeout(rodar, 20000);
    const t = setInterval(rodar, 10 * 60 * 1000);
    // e logo depois da virada do dia (00:00:20)
    let meiaNoite = null;
    const agendarMeiaNoite = () => {
      const agora = new Date();
      const alvo = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1, 0, 0, 20);
      meiaNoite = setTimeout(() => {
        rodar();
        agendarMeiaNoite();
      }, alvo - agora);
    };
    agendarMeiaNoite();
    return () => {
      clearTimeout(primeira);
      clearInterval(t);
      clearTimeout(meiaNoite);
    };
  }, [podeAuditar, perfil, regiao]);

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

  // Além do nível, no Operacional cada tela pode estar bloqueada para a
  // conta (Controle de acessos — Context/acessos.js).
  const podeVer = useCallback(
    function ver(item) {
      if (!(ACESSO[item.area] || []).includes(role)) return false;
      // item com abas: aparece se alguma aba estiver liberada
      if (item.abas) return item.abas.some((a) => ver({ ...a, area: item.area }));
      if (item.somenteBalanco) return podeVerBalanco(perfil);
      if (role !== ROLES.OPERACIONAL) return true;
      if (item.somenteGerencia) return ehGerencia(perfil);
      if (!item.chave) return true;
      const chaves = Array.isArray(item.chave) ? item.chave : [item.chave];
      return chaves.some((c) => podeArea(perfil, c, regiao));
    },
    [role, perfil, regiao],
  );

  // item com várias telas (Cadastros, abas): abre na primeira liberada
  const ajustarRota = useCallback(
    (item) => {
      if (item.abas) {
        const abas = item.abas.filter((a) => podeVer({ ...a, area: item.area }));
        return { ...item, abasVisiveis: abas, to: abas[0]?.to || item.to };
      }
      if (!item.rotaPorChave || role !== ROLES.OPERACIONAL) return item;
      const chave = (Array.isArray(item.chave) ? item.chave : [item.chave]).find((c) => podeArea(perfil, c, regiao));
      return chave ? { ...item, to: item.rotaPorChave[chave] } : item;
    },
    [role, perfil, regiao, podeVer],
  );

  // Gerência trocando de base: fica na tela se ela existe na nova base;
  // senão vai para a primeira tela liberada.
  const aoTrocarRegiao = (id) => {
    const nova = todas.find((r) => r.id === id);
    if (!nova || nova.id === regiao.id) return;
    trocarRegiao(id);
    const area = areaDaRota(pathname);
    if (rotaForaDaRegiao(pathname, nova) || (area && !podeArea(perfil, area.chave, nova))) navigate("/");
  };

  const nomeSistema = "Operacional Luck";
  // com outras bases cadastradas, a base em uso aparece embaixo do nome
  const legendaSistema = todas.length > 1 || !naSede ? `Base ${regiao.nome}` : "Gestão de serviços";

  const grupos = useMemo(
    () =>
      GRUPOS_MENU.filter((g) => !(g.somenteSemPainel && veOperacao))
        .map((g) => ({ ...g, itens: g.itens.filter(podeVer).map(ajustarRota) }))
        .filter((g) => g.itens.length > 0),
    [podeVer, ajustarRota, veOperacao],
  );

  // seção com abas (ex.: Guias → Lista · Afinidade · Disponibilidade)
  const secaoComAbas = useMemo(() => {
    for (const g of grupos) {
      const item = g.itens.find((i) => i.abasVisiveis && itemAtivo(i, pathname));
      if (item && item.abasVisiveis.length > 1) return item;
    }
    return null;
  }, [grupos, pathname]);

  // breadcrumb: Grupo / Página
  const migalhas = useMemo(() => {
    for (const g of grupos) {
      const item = g.itens.find((i) => itemAtivo(i, pathname));
      if (item) {
        const aba = item.abasVisiveis?.find((a) => pathname === a.to || pathname.startsWith(`${a.to}/`));
        if (aba) return [g.titulo, g.titulo === item.label ? aba.label : `${item.label} · ${aba.label}`];
        return [g.titulo, item.label];
      }
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
              title={recolhido ? nomeSistema : undefined}
            >
              <div className="sidebar-logo-box">
                <img src={logo} alt={nomeSistema} />
              </div>

              <div className="sidebar-brand">
                <strong>{nomeSistema}</strong>
                <span>{legendaSistema}</span>
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
            <AvaliacaoSistema variante="menu" recolhido={recolhido} />

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

            <div className="sidebar-version">{VERSAO_TEXTO}</div>
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
                <strong className="app-breadcrumb__pagina">{nomeSistema}</strong>
              )}
            </nav>

            <div className="app-topbar__right">
              {veOperacao && podeTrocar && todas.length > 1 ? (
                <label className={`app-regiao ${naSede ? "" : "fora-da-sede"}`} title="Base em uso: de qual Phoenix vêm os dados">
                  <Icon name="mapPin" size={15} />
                  <select value={regiao.id} onChange={(e) => aoTrocarRegiao(e.target.value)} aria-label="Base em uso">
                    {todas.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.nome} ({r.sigla})
                      </option>
                    ))}
                  </select>
                </label>
              ) : veOperacao && !naSede ? (
                <span className="app-regiao fora-da-sede" title="Base em uso">
                  <Icon name="mapPin" size={15} />
                  {regiao.nome}
                </span>
              ) : null}

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
              {veOperacao && naSede && (
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
            {veOperacao && carregandoRegiao ? (
              <div className="loading-overlay">
                <div className="spinner" />
              </div>
            ) : veOperacao && indisponivel ? (
              <div className="auth-sem-permissao">
                <Icon name="mapPin" size={22} />
                <h2>Base não disponível</h2>
                <p>
                  A sua conta é de uma base que foi desativada ou ainda não foi configurada. Fale com a gerência
                  (Gestão → Regiões).
                </p>
              </div>
            ) : (
              <FotosGuiasProvider>
                {/* key: trocar de base remonta a tela e refaz as buscas no Phoenix certo */}
                <Fragment key={regiao.id}>
                  {secaoComAbas && (
                    <nav className="app-secao-abas" aria-label={secaoComAbas.label}>
                      <span className="app-secao-abas__tit">
                        <Icon name={secaoComAbas.icon} size={15} /> {secaoComAbas.label}
                      </span>
                      <span className="app-secao-abas__lista">
                        {secaoComAbas.abasVisiveis.map((a) => (
                          <NavLink key={a.to} to={a.to} className={({ isActive }) => `app-secao-abas__aba ${isActive ? "is-on" : ""}`}>
                            <Icon name={a.icon} size={14} /> {a.label}
                          </NavLink>
                        ))}
                      </span>
                    </nav>
                  )}
                  <Outlet />
                </Fragment>
              </FotosGuiasProvider>
            )}
          </main>
          {role === "comercial" && <BoasVindasComercial />}
          {veOperacao && !naSede && !carregandoRegiao && !indisponivel && <BoasVindasBase />}
        </div>
      </div>
    </ShellContext.Provider>
  );
};

export default Dashboard;
