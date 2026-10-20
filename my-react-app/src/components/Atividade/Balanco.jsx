import { Fragment, useEffect, useMemo, useState } from "react";
import { Button, Card, CardHeader, EmptyState, Icon, KpiTiles, PageHeader, Segmented, Table, TableExpansion, TableHead, TableRow, useToast } from "../ui";
import { useAuth } from "../../Context/AuthContext";
import { ROLE_LABELS, ROLES } from "../../Context/permissions";
import { ehGerencia, podeVerBalanco } from "../../Context/acessos";
import { listarContas } from "../../Services/Services/acessosRepository";
import { definirVerBalanco, diaMenos, listarAtividade, listarAvaliacoes } from "../../Services/Services/atividadeRepository";
import { Estrelas } from "./AvaliacaoSistema";
import { TEXTO_NOTA } from "./notas";
import "./atividade.css";

/* =========================================================
   BALANÇO DE USO — quem está usando o sistema, o que mais é visto,
   impressões feitas e a avaliação de cada um (0 a 5 estrelas).
   Vê: a gerência e as contas que a gerência marcar (seção no fim da tela,
   ou Cadastros → Usuários → editar → "Pode ver o Balanço de uso").
   Dados: atividade_diaria (um doc por pessoa por dia) e avaliacoes.
   ========================================================= */

const PERIODOS = [
  { value: 7, label: "7 dias" },
  { value: 30, label: "30 dias" },
  { value: 90, label: "90 dias" },
];

const paraData = (v) => (v?.toDate ? v.toDate() : typeof v === "number" ? new Date(v) : v ? new Date(v) : null);
const fmtDataHora = (d) => {
  if (!d) return "—";
  const hoje = new Date().toDateString() === d.toDateString();
  const ontem = new Date(Date.now() - 86400000).toDateString() === d.toDateString();
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (hoje) return `Hoje ${hora}`;
  if (ontem) return `Ontem ${hora}`;
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${hora}`;
};
const usandoAgora = (d) => d && Date.now() - d.getTime() < 6 * 60000;
const nivelDe = (p) => (p.role === ROLES.OPERACIONAL && p.gerencia ? "Gerência" : ROLE_LABELS[p.role] || p.role || "—");
const ROTULO_TIPO = { login: "Login", tela: "Tela", impressao: "Impressão", acao: "Ação" };
const ICONE_TIPO = { login: "login", tela: "eye", impressao: "printer", acao: "check" };
const n = (v) => Number(v) || 0;

// "2026-10-20" → "20/10"
const diaCurto = (dia) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

const Balanco = () => {
  const { perfil } = useAuth();
  const { mostrarToast } = useToast();
  const pode = podeVerBalanco(perfil);
  const souGerencia = ehGerencia(perfil);

  const [periodo, setPeriodo] = useState(30);
  // resultado da última leitura, junto com o período que ela cobre
  const [carga, setCarga] = useState({ periodo: null, docs: [], contas: [], avaliacoes: [], erro: "" });
  const docs = carga.periodo === periodo ? carga.docs : null; // null = carregando
  const { contas, avaliacoes, erro } = carga;
  const setContas = (fn) => setCarga((c) => ({ ...c, contas: fn(c.contas) }));
  const [aberto, setAberto] = useState("");
  const [filtro, setFiltro] = useState("todos"); // todos | usaram | naoUsaram

  useEffect(() => {
    if (!pode) return undefined;
    let vivo = true;
    Promise.all([listarAtividade(periodo), listarAvaliacoes().catch(() => []), listarContas().catch(() => [])])
      .then(([a, av, c]) => {
        if (vivo) setCarga({ periodo, docs: a, contas: c, avaliacoes: av, erro: "" });
      })
      .catch((e) => {
        console.error("Erro ao carregar o balanço:", e);
        if (vivo) {
          setCarga((c) => ({
            ...c,
            periodo,
            docs: [],
            erro:
              e?.code === "permission-denied"
                ? "Sem permissão para ler o registro de uso. Confira se o firestore.rules novo foi publicado."
                : "Não foi possível carregar o balanço.",
          }));
        }
      });
    return () => {
      vivo = false;
    };
  }, [pode, periodo]);

  // ---------- consolidação ----------
  const dados = useMemo(() => {
    if (!docs) return null;
    const pessoas = new Map();
    const porDia = new Map();
    const telas = new Map();
    const acoes = new Map();
    docs.forEach((d) => {
      const p = pessoas.get(d.uid) || {
        uid: d.uid,
        nome: d.nome,
        role: d.role,
        regiao: d.regiao,
        dias: new Set(),
        logins: 0,
        telasVistas: 0,
        impressoes: 0,
        telas: {},
        acoes: {},
        rotulos: {},
        ultimo: null,
        ultimoLogin: null,
        eventos: [],
      };
      p.nome = p.nome || d.nome;
      p.dias.add(d.dia);
      p.logins += n(d.logins);
      p.telasVistas += n(d.telasVistas);
      p.impressoes += n(d.impressoes);
      Object.assign(p.rotulos, d.rotulos || {});
      Object.entries(d.telas || {}).forEach(([k, v]) => (p.telas[k] = (p.telas[k] || 0) + n(v)));
      Object.entries(d.acoes || {}).forEach(([k, v]) => (p.acoes[k] = (p.acoes[k] || 0) + n(v)));
      const u = paraData(d.ultimo);
      if (u && (!p.ultimo || u > p.ultimo)) p.ultimo = u;
      (d.eventos || []).forEach((e) => {
        p.eventos.push(e);
        if (e.tipo === "login" && (!p.ultimoLogin || e.em > p.ultimoLogin.getTime())) p.ultimoLogin = new Date(e.em);
      });
      pessoas.set(d.uid, p);

      const dia = porDia.get(d.dia) || { pessoas: new Set(), impressoes: 0 };
      dia.pessoas.add(d.uid);
      dia.impressoes += n(d.impressoes);
      porDia.set(d.dia, dia);

      Object.entries(d.telas || {}).forEach(([k, v]) => {
        const t = telas.get(k) || { rotulo: d.rotulos?.[k] || k, total: 0, pessoas: new Set() };
        t.total += n(v);
        t.pessoas.add(d.uid);
        telas.set(k, t);
      });
      Object.entries(d.acoes || {}).forEach(([k, v]) => {
        const t = acoes.get(k) || { rotulo: d.rotulos?.[k] || k, total: 0, pessoas: new Set() };
        t.total += n(v);
        t.pessoas.add(d.uid);
        acoes.set(k, t);
      });
    });

    // contas (quando dá para ler): último login/acesso gravados no perfil e quem não usou
    const porUid = new Map(contas.map((c) => [c.id, c]));
    const lista = [...pessoas.values()].map((p) => {
      const c = porUid.get(p.uid);
      const ultimoAcesso = [p.ultimo, paraData(c?.ultimoAcesso)].filter(Boolean).sort((a, b) => b - a)[0] || null;
      const ultimoLogin = [p.ultimoLogin, paraData(c?.ultimoLogin)].filter(Boolean).sort((a, b) => b - a)[0] || null;
      const maisUsada = Object.entries(p.telas).sort((a, b) => b[1] - a[1])[0];
      return {
        ...p,
        nome: c?.nome || p.nome || "Sem nome",
        role: c?.role || p.role,
        gerencia: c?.gerencia === true,
        ultimoAcesso,
        ultimoLogin,
        diasAtivos: p.dias.size,
        maisUsada: maisUsada ? p.rotulos[maisUsada[0]] || maisUsada[0] : "—",
        usou: true,
      };
    });
    const semUso = contas
      .filter((c) => c.ativo !== false && !pessoas.has(c.id))
      .map((c) => ({
        uid: c.id,
        nome: c.nome || c.email,
        role: c.role,
        gerencia: c.gerencia === true,
        regiao: c.regiao,
        ultimoAcesso: paraData(c.ultimoAcesso),
        ultimoLogin: paraData(c.ultimoLogin),
        diasAtivos: 0,
        telasVistas: 0,
        impressoes: 0,
        logins: 0,
        maisUsada: "—",
        eventos: [],
        acoes: {},
        rotulos: {},
        usou: false,
        pendente: c.senhaTemporaria === true,
      }));
    lista.sort((a, b) => (b.ultimoAcesso?.getTime() || 0) - (a.ultimoAcesso?.getTime() || 0));
    semUso.sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));

    // um ponto por dia do período (dias sem uso = 0)
    const serie = Array.from({ length: periodo }, (_, i) => {
      const dia = diaMenos(periodo - 1 - i);
      const v = porDia.get(dia);
      return { dia, pessoas: v ? v.pessoas.size : 0, impressoes: v ? v.impressoes : 0 };
    });

    const ordenar = (m) =>
      [...m.entries()].map(([k, v]) => ({ chave: k, rotulo: v.rotulo, total: v.total, pessoas: v.pessoas.size })).sort((a, b) => b.total - a.total);

    return {
      lista,
      semUso,
      serie,
      telas: ordenar(telas),
      acoes: ordenar(acoes),
      totalLogins: lista.reduce((s, p) => s + p.logins, 0),
      totalTelas: lista.reduce((s, p) => s + p.telasVistas, 0),
      totalImpressoes: lista.reduce((s, p) => s + p.impressoes, 0),
      contasAtivas: contas.filter((c) => c.ativo !== false).length,
    };
  }, [docs, contas, periodo]);

  const resumoAval = useMemo(() => {
    const validas = avaliacoes.filter((a) => Number.isFinite(Number(a.nota)));
    const media = validas.length ? validas.reduce((s, a) => s + Number(a.nota), 0) / validas.length : 0;
    const dist = [5, 4, 3, 2, 1, 0].map((nota) => ({ nota, qtd: validas.filter((a) => Number(a.nota) === nota).length }));
    const lista = [...validas].sort((a, b) => (paraData(b.atualizadoEm)?.getTime() || 0) - (paraData(a.atualizadoEm)?.getTime() || 0));
    return { media, dist, lista, total: validas.length };
  }, [avaliacoes]);

  if (!pode) {
    return (
      <div className="atv ui-page">
        <PageHeader title="Balanço de uso" description="Quem está usando o sistema, impressões e avaliações." />
        <EmptyState icon="lock" title="Só para quem a gerência liberar">
          Peça para a gerência marcar a sua conta em Cadastros → Usuários.
        </EmptyState>
      </div>
    );
  }

  const baixarCsv = () => {
    if (!dados) return;
    const linhas = [
      ["Pessoa", "Nível", "Base", "Último login", "Último acesso", "Dias com uso", "Logins", "Telas vistas", "Impressões", "Tela mais usada", "Avaliação", "Comentário"],
      ...[...dados.lista, ...dados.semUso].map((p) => {
        const av = avaliacoes.find((a) => a.uid === p.uid || a.id === p.uid);
        return [
          p.nome,
          nivelDe(p),
          (p.regiao || "ssa").toUpperCase(),
          p.ultimoLogin ? p.ultimoLogin.toLocaleString("pt-BR") : "",
          p.ultimoAcesso ? p.ultimoAcesso.toLocaleString("pt-BR") : "",
          p.diasAtivos,
          p.logins,
          p.telasVistas,
          p.impressoes,
          p.maisUsada === "—" ? "" : p.maisUsada,
          av ? av.nota : "",
          av?.comentario || "",
        ];
      }),
    ];
    const csv = "﻿" + linhas.map((l) => l.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `balanco-de-uso-${periodo}-dias.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const alternarVer = async (c, valor) => {
    try {
      await definirVerBalanco(c.id, valor);
      setContas((lista) => lista.map((x) => (x.id === c.id ? { ...x, verBalanco: valor } : x)));
      mostrarToast(valor ? `${c.nome} agora vê o balanço` : `${c.nome} não vê mais o balanço`);
    } catch (e) {
      console.error(e);
      mostrarToast("Não foi possível salvar. Confira o firestore.rules.");
    }
  };

  const maxSerie = Math.max(1, ...(dados?.serie || []).map((s) => s.pessoas));
  const maxTela = Math.max(1, ...(dados?.telas || []).map((t) => t.total));
  const maxAcao = Math.max(1, ...(dados?.acoes || []).map((t) => t.total));
  const maxDist = Math.max(1, ...resumoAval.dist.map((d) => d.qtd));
  const linhas =
    !dados ? [] : filtro === "usaram" ? dados.lista : filtro === "naoUsaram" ? dados.semUso : [...dados.lista, ...dados.semUso];
  const marcarDias = periodo <= 30 ? 1 : 7; // rótulo do eixo a cada N dias

  return (
    <div className="atv ui-page">
      <PageHeader
        title="Balanço de uso"
        description="Quem está usando o sistema, o que mais é visto, as impressões feitas e a avaliação de cada um."
        actions={
          <>
            <Segmented size="sm" value={periodo} onChange={setPeriodo} options={PERIODOS} ariaLabel="Período" />
            <Button icon="download" onClick={baixarCsv} disabled={!dados}>
              Baixar relatório
            </Button>
          </>
        }
      />

      {erro && (
        <p className="atv-erro" role="alert">
          <Icon name="alert" size={14} /> {erro}
        </p>
      )}

      {!dados ? (
        <EmptyState icon="loader" title="Carregando o balanço…" />
      ) : (
        <>
          <KpiTiles
            items={[
              {
                key: "pessoas",
                label: "Pessoas que usaram",
                value: dados.lista.length,
                hint: dados.contasAtivas ? `de ${dados.contasAtivas} contas ativas` : `nos últimos ${periodo} dias`,
                icon: "users",
              },
              { key: "logins", label: "Logins", value: dados.totalLogins, hint: `${periodo} dias`, icon: "login" },
              { key: "telas", label: "Telas abertas", value: dados.totalTelas, hint: `${periodo} dias`, icon: "eye" },
              { key: "impressoes", label: "Impressões e PDFs", value: dados.totalImpressoes, hint: "placas, mapas, relatórios…", icon: "printer" },
              {
                key: "avaliacao",
                label: "Avaliação média",
                value: resumoAval.total ? `${resumoAval.media.toFixed(1).replace(".", ",")} ★` : "—",
                hint: resumoAval.total ? `${resumoAval.total} ${resumoAval.total === 1 ? "avaliação" : "avaliações"}` : "ninguém avaliou ainda",
                icon: "star",
              },
            ]}
          />

          <div className="atv-grade">
            <Card className="atv-card atv-card--largo">
              <CardHeader title="Pessoas usando por dia" subtitle={`Quantas pessoas diferentes entraram em cada dia · últimos ${periodo} dias`} icon="barChart" />
              <div className="atv-serie" role="img" aria-label="Pessoas usando por dia">
                <div className="atv-serie__barras" style={{ "--n": dados.serie.length }}>
                  {dados.serie.map((s, i) => (
                    <div key={s.dia} className="atv-serie__col" title={`${diaCurto(s.dia)}: ${s.pessoas} ${s.pessoas === 1 ? "pessoa" : "pessoas"} · ${s.impressoes} impressões`}>
                      <span className="atv-serie__valor">{s.pessoas > 0 && periodo <= 30 ? s.pessoas : ""}</span>
                      <span className="atv-serie__barra" style={{ height: `${(s.pessoas / maxSerie) * 100}%` }} />
                      <span className="atv-serie__dia">{i % marcarDias === 0 || i === dados.serie.length - 1 ? diaCurto(s.dia) : ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card className="atv-card">
              <CardHeader title="Telas mais vistas" subtitle="Vezes que cada tela foi aberta" icon="eye" />
              <ListaBarras itens={dados.telas.slice(0, 10)} max={maxTela} vazio="Nenhuma tela registrada no período." />
            </Card>

            <Card className="atv-card">
              <CardHeader title="Impressões e ações" subtitle="PDFs, mapas, relatórios e outras ações" icon="printer" />
              <ListaBarras itens={dados.acoes.slice(0, 10)} max={maxAcao} vazio="Nenhuma impressão registrada no período." />
            </Card>
          </div>

          <Card className="atv-card">
            <CardHeader
              title="Quem está usando"
              subtitle="Clique numa pessoa para ver o que ela fez (logins, telas e impressões)."
              icon="users"
              actions={
                <Segmented
                  size="sm"
                  value={filtro}
                  onChange={setFiltro}
                  options={[
                    { value: "todos", label: "Todos", count: dados.lista.length + dados.semUso.length },
                    { value: "usaram", label: "Usaram", count: dados.lista.length },
                    { value: "naoUsaram", label: "Não usaram", count: dados.semUso.length },
                  ]}
                />
              }
            />
            {linhas.length === 0 ? (
              <EmptyState icon="users" title="Ninguém por aqui no período" />
            ) : (
              <Table columns="32px minmax(180px, 1.6fr) 120px 120px 80px 80px 90px minmax(140px, 1fr)" minWidth={920} compact>
                <TableHead>
                  <span />
                  <span>Pessoa</span>
                  <span>Último login</span>
                  <span>Último acesso</span>
                  <span className="atv-num">Dias</span>
                  <span className="atv-num">Telas</span>
                  <span className="atv-num">Impressões</span>
                  <span>Mais usa</span>
                </TableHead>
                {linhas.map((p) => {
                  const exp = aberto === p.uid;
                  const av = avaliacoes.find((a) => a.uid === p.uid || a.id === p.uid);
                  return (
                    <Fragment key={p.uid}>
                      <TableRow expandable={p.usou} expanded={exp} onToggle={() => setAberto(exp ? "" : p.uid)} className={p.usou ? "" : "atv-sem-uso"}>
                        {!p.usou && <span />}
                        <span className="atv-pessoa">
                          <b>
                            {usandoAgora(p.ultimoAcesso) && <i className="atv-online" title="Usando agora" />}
                            {p.nome}
                          </b>
                          <small>
                            {nivelDe(p)}
                            {p.regiao && p.regiao !== "ssa" ? ` · ${String(p.regiao).toUpperCase()}` : ""}
                            {av ? ` · avaliou ${av.nota}★` : ""}
                            {p.pendente ? " · 1º acesso pendente" : ""}
                          </small>
                        </span>
                        <span>{fmtDataHora(p.ultimoLogin)}</span>
                        <span>{usandoAgora(p.ultimoAcesso) ? <b className="atv-agora">Agora</b> : fmtDataHora(p.ultimoAcesso)}</span>
                        <span className="atv-num">{p.diasAtivos || "—"}</span>
                        <span className="atv-num">{p.telasVistas || "—"}</span>
                        <span className="atv-num">{p.impressoes || "—"}</span>
                        <span className="atv-trunca">{p.usou ? p.maisUsada : "Não usou no período"}</span>
                      </TableRow>
                      {exp && (
                        <TableExpansion>
                          <LinhaDoTempo pessoa={p} />
                        </TableExpansion>
                      )}
                    </Fragment>
                  );
                })}
              </Table>
            )}
          </Card>

          <Card className="atv-card">
            <CardHeader title="Avaliação do sistema" subtitle="Nota de 0 a 5 e comentário de cada pessoa (vale a última avaliação de cada uma)." icon="star" />
            {resumoAval.total === 0 ? (
              <EmptyState icon="star" title="Ninguém avaliou ainda">
                O botão “Avaliar o sistema” fica no menu lateral (e na área do guia). Quem usa em 3 dias diferentes recebe um convite.
              </EmptyState>
            ) : (
              <div className="atv-aval">
                <div className="atv-aval__resumo">
                  <strong>{resumoAval.media.toFixed(1).replace(".", ",")}</strong>
                  <Estrelas valor={resumoAval.media} somenteLeitura tamanho={18} />
                  <small>
                    {resumoAval.total} {resumoAval.total === 1 ? "avaliação" : "avaliações"}
                  </small>
                  <ul className="atv-aval__dist">
                    {resumoAval.dist.map((d) => (
                      <li key={d.nota}>
                        <span>{d.nota}★</span>
                        <i>
                          <b style={{ width: `${(d.qtd / maxDist) * 100}%` }} />
                        </i>
                        <span className="atv-num">{d.qtd}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <ul className="atv-aval__lista">
                  {resumoAval.lista.map((a) => (
                    <li key={a.id}>
                      <div className="atv-aval__topo">
                        <b>{a.nome || "Sem nome"}</b>
                        <span className="atv-aval__nota" title={TEXTO_NOTA[a.nota]}>
                          <Estrelas valor={Number(a.nota)} somenteLeitura tamanho={13} /> {a.nota}
                        </span>
                        <small>
                          {ROLE_LABELS[a.role] || a.role}
                          {a.regiao && a.regiao !== "ssa" ? ` · ${String(a.regiao).toUpperCase()}` : ""} · {fmtDataHora(paraData(a.atualizadoEm))}
                        </small>
                      </div>
                      {a.comentario ? <p>{a.comentario}</p> : <p className="atv-sem-comentario">Sem comentário.</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          {souGerencia && (
            <Card className="atv-card">
              <CardHeader
                title="Quem pode ver este balanço"
                subtitle="A gerência sempre vê. Marque as outras pessoas (Operacional ou Comercial) que também podem ver."
                icon="shield"
              />
              <ul className="atv-quem">
                {contas
                  .filter((c) => c.ativo !== false && c.role !== ROLES.GUIA)
                  .sort((a, b) => (b.gerencia === true) - (a.gerencia === true) || (a.nome || "").localeCompare(b.nome || "", "pt-BR"))
                  .map((c) => {
                    const gerencia = c.gerencia === true && c.role === ROLES.OPERACIONAL;
                    return (
                      <li key={c.id}>
                        <label className={`atv-quem__item ${gerencia || c.verBalanco ? "is-on" : ""}`}>
                          <input
                            type="checkbox"
                            checked={gerencia || c.verBalanco === true}
                            disabled={gerencia}
                            onChange={(e) => alternarVer(c, e.target.checked)}
                          />
                          <span>
                            <b>{c.nome}</b>
                            <small>{gerencia ? "Gerência · sempre vê" : nivelDe(c)}</small>
                          </span>
                        </label>
                      </li>
                    );
                  })}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

const ListaBarras = ({ itens, max, vazio }) =>
  itens.length === 0 ? (
    <p className="atv-vazio">{vazio}</p>
  ) : (
    <ul className="atv-barras">
      {itens.map((t) => (
        <li key={t.chave} title={`${t.rotulo}: ${t.total} · ${t.pessoas} ${t.pessoas === 1 ? "pessoa" : "pessoas"}`}>
          <span className="atv-barras__rotulo">{t.rotulo}</span>
          <i>
            <b style={{ width: `${(t.total / max) * 100}%` }} />
          </i>
          <span className="atv-num">{t.total}</span>
          <small className="atv-barras__pessoas">
            {t.pessoas} {t.pessoas === 1 ? "pessoa" : "pessoas"}
          </small>
        </li>
      ))}
    </ul>
  );

const LinhaDoTempo = ({ pessoa }) => {
  const eventos = [...pessoa.eventos].sort((a, b) => b.em - a.em).slice(0, 80);
  if (!eventos.length) return <p className="atv-vazio">Sem detalhes registrados.</p>;
  let diaAnterior = "";
  return (
    <ol className="atv-tempo">
      {eventos.map((e, i) => {
        const d = new Date(e.em);
        const dia = d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
        const novoDia = dia !== diaAnterior;
        diaAnterior = dia;
        return (
          <Fragment key={`${e.em}-${i}`}>
            {novoDia && <li className="atv-tempo__dia">{dia}</li>}
            <li className={`atv-tempo__ev is-${e.tipo}`}>
              <span className="atv-tempo__hora">{d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
              <Icon name={ICONE_TIPO[e.tipo] || "info"} size={13} />
              <span>
                <b>{ROTULO_TIPO[e.tipo] || e.tipo}</b> · {e.rotulo}
                {e.detalhe ? <small> · {e.detalhe}</small> : null}
              </span>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
};

export default Balanco;
