import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  CardHeader,
  Drawer,
  EmptyState,
  Icon,
  KpiTiles,
  PageHeader,
  SearchInput,
  Segmented,
  Table,
  TableExpansion,
  TableHead,
  TableRow,
  useToast,
} from "../ui";
import { useAuth } from "../../Context/AuthContext";
import { useRegiao } from "../../Context/regiaoContext";
import { ROLE_LABELS, ROLES } from "../../Context/permissions";
import { ehGerencia, podeVerBalanco } from "../../Context/acessos";
import { listarContas } from "../../Services/Services/acessosRepository";
import { SEDE } from "../../Services/Services/regiaoAtiva";
import { definirVerBalanco, diaMenos, listarAtividade, listarAvaliacoes } from "../../Services/Services/atividadeRepository";
import { Estrelas } from "./AvaliacaoSistema";
import { TEXTO_NOTA } from "./notas";
import "./atividade.css";

/* =========================================================
   BALANÇO DE USO — quem está usando o sistema, quanto tempo e onde,
   em que horário, impressões feitas e a avaliação de cada um.
   Vê: a gerência e as contas que a gerência marcar (seção no fim da tela,
   ou Cadastros → Usuários → editar → "Pode ver o Balanço de uso").
   Dados: atividade_diaria (um doc por pessoa por dia) e avaliacoes.
   - Tempo de uso: tela aberta, aba visível e a pessoa mexendo no sistema
     (15 min parado = para de contar). Registrado a partir desta versão.
   - 7 e 30 dias comparam com o período anterior do mesmo tamanho.
   ========================================================= */

const PERIODOS = [
  { value: 7, label: "7 dias" },
  { value: 30, label: "30 dias" },
  { value: 90, label: "90 dias" },
];
const COMENTARIOS_NO_CARD = 3;

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

// segundos → "2h10" / "45 min" / "menos de 1 min"
const fmtDuracao = (seg) => {
  const s = Math.round(n(seg));
  if (s <= 0) return "—";
  if (s < 60) return "< 1 min";
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
};
// variação em relação ao período anterior: "▲ 12%" / "▼ 5%" / "="
const variacao = (atual, anterior) => {
  if (anterior === null || anterior === undefined) return "";
  if (!anterior) return atual ? "novo no período" : "";
  const p = Math.round(((atual - anterior) / anterior) * 100);
  if (p === 0) return "= ao período anterior";
  return `${p > 0 ? "▲" : "▼"} ${Math.abs(p)}% vs. período anterior`;
};

// "2026-10-20" → "20/10"
const diaCurto = (dia) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

// ---------- consolidação de um conjunto de docs ----------
const consolidar = (docs, contas, periodo) => {
  const pessoas = new Map();
  const porDia = new Map();
  const telas = new Map();
  const acoes = new Map();
  const horas = Array.from({ length: 24 }, () => 0);
  const bases = new Map();
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
      tempo: 0,
      telas: {},
      tempoTelas: {},
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
    p.tempo += n(d.tempoTotal);
    Object.assign(p.rotulos, d.rotulos || {});
    Object.entries(d.telas || {}).forEach(([k, v]) => (p.telas[k] = (p.telas[k] || 0) + n(v)));
    Object.entries(d.tempo || {}).forEach(([k, v]) => (p.tempoTelas[k] = (p.tempoTelas[k] || 0) + n(v)));
    Object.entries(d.acoes || {}).forEach(([k, v]) => (p.acoes[k] = (p.acoes[k] || 0) + n(v)));
    const u = paraData(d.ultimo);
    if (u && (!p.ultimo || u > p.ultimo)) p.ultimo = u;
    (d.eventos || []).forEach((e) => {
      p.eventos.push(e);
      if (e.tipo === "login" && (!p.ultimoLogin || e.em > p.ultimoLogin.getTime())) p.ultimoLogin = new Date(e.em);
    });
    pessoas.set(d.uid, p);

    const dia = porDia.get(d.dia) || { pessoas: new Set(), impressoes: 0, tempo: 0 };
    dia.pessoas.add(d.uid);
    dia.impressoes += n(d.impressoes);
    dia.tempo += n(d.tempoTotal);
    porDia.set(d.dia, dia);

    const somarEm = (mapa, k, v, uid, rotulo) => {
      const t = mapa.get(k) || { rotulo: rotulo || k, total: 0, tempo: 0, pessoas: new Set() };
      t.pessoas.add(uid);
      return mapa.set(k, t).get(k);
    };
    Object.entries(d.telas || {}).forEach(([k, v]) => (somarEm(telas, k, v, d.uid, d.rotulos?.[k]).total += n(v)));
    Object.entries(d.tempo || {}).forEach(([k, v]) => (somarEm(telas, k, v, d.uid, d.rotulos?.[k]).tempo += n(v)));
    Object.entries(d.acoes || {}).forEach(([k, v]) => (somarEm(acoes, k, v, d.uid, d.rotulos?.[k]).total += n(v)));
    Object.entries(d.horas || {}).forEach(([h, v]) => {
      const i = Number(h);
      if (i >= 0 && i < 24) horas[i] += n(v);
    });
    Object.entries(d.tempoBase || {}).forEach(([b, v]) => {
      const x = bases.get(b) || { tempo: 0, pessoas: new Set() };
      x.tempo += n(v);
      x.pessoas.add(d.uid);
      bases.set(b, x);
    });
  });

  const porUid = new Map(contas.map((c) => [c.id, c]));
  const lista = [...pessoas.values()].map((p) => {
    const c = porUid.get(p.uid);
    const ultimoAcesso = [p.ultimo, paraData(c?.ultimoAcesso)].filter(Boolean).sort((a, b) => b - a)[0] || null;
    const ultimoLogin = [p.ultimoLogin, paraData(c?.ultimoLogin)].filter(Boolean).sort((a, b) => b - a)[0] || null;
    // tela onde mais passa tempo (sem tempo registrado: a mais aberta)
    const porTempo = Object.entries(p.tempoTelas).sort((a, b) => b[1] - a[1])[0];
    const porAberturas = Object.entries(p.telas).sort((a, b) => b[1] - a[1])[0];
    const mais = porTempo || porAberturas;
    return {
      ...p,
      nome: c?.nome || p.nome || "Sem nome",
      role: c?.role || p.role,
      gerencia: c?.gerencia === true,
      ultimoAcesso,
      ultimoLogin,
      diasAtivos: p.dias.size,
      maisUsada: mais ? p.rotulos[mais[0]] || mais[0] : "—",
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
      tempo: 0,
      logins: 0,
      maisUsada: "—",
      eventos: [],
      usou: false,
      pendente: c.senhaTemporaria === true,
    }));
  lista.sort((a, b) => (b.ultimoAcesso?.getTime() || 0) - (a.ultimoAcesso?.getTime() || 0));
  semUso.sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));

  const serie = Array.from({ length: periodo }, (_, i) => {
    const dia = diaMenos(periodo - 1 - i);
    const v = porDia.get(dia);
    return { dia, pessoas: v ? v.pessoas.size : 0, impressoes: v ? v.impressoes : 0, tempo: v ? v.tempo : 0 };
  });
  const ordenar = (m, campo) =>
    [...m.entries()]
      .map(([k, v]) => ({ chave: k, rotulo: v.rotulo, total: v.total, tempo: v.tempo, pessoas: v.pessoas.size }))
      .sort((a, b) => b[campo] - a[campo] || b.total - a.total);

  const tempoTotal = lista.reduce((s, p) => s + p.tempo, 0);
  return {
    lista,
    semUso,
    serie,
    telas: ordenar(telas, "tempo"),
    acoes: ordenar(acoes, "total"),
    horas,
    bases: [...bases.entries()].map(([id, v]) => ({ id, tempo: v.tempo, pessoas: v.pessoas.size })).sort((a, b) => b.tempo - a.tempo),
    totalLogins: lista.reduce((s, p) => s + p.logins, 0),
    totalTelas: lista.reduce((s, p) => s + p.telasVistas, 0),
    totalImpressoes: lista.reduce((s, p) => s + p.impressoes, 0),
    tempoTotal,
    temTempo: tempoTotal > 0,
    contasAtivas: contas.filter((c) => c.ativo !== false).length,
  };
};

const Balanco = () => {
  const { perfil } = useAuth();
  const { regioes } = useRegiao();
  const { mostrarToast } = useToast();
  const pode = podeVerBalanco(perfil);
  const souGerencia = ehGerencia(perfil);

  const [periodo, setPeriodo] = useState(30);
  // 7 e 30 dias: lê o dobro para comparar com o período anterior
  const comparar = periodo <= 30;
  const [carga, setCarga] = useState({ periodo: null, docs: [], contas: [], avaliacoes: [], erro: "" });
  const docs = carga.periodo === periodo ? carga.docs : null; // null = carregando
  const { contas, avaliacoes, erro } = carga;
  const setContas = (fn) => setCarga((c) => ({ ...c, contas: fn(c.contas) }));
  const [aberto, setAberto] = useState("");
  const [filtro, setFiltro] = useState("todos"); // todos | usaram | naoUsaram
  const [serieModo, setSerieModo] = useState("pessoas"); // pessoas | tempo
  const [verAvaliacoes, setVerAvaliacoes] = useState(false);

  useEffect(() => {
    if (!pode) return undefined;
    let vivo = true;
    Promise.all([listarAtividade(comparar ? periodo * 2 : periodo), listarAvaliacoes().catch(() => []), listarContas().catch(() => [])])
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
  }, [pode, periodo, comparar]);

  const { dados, anterior } = useMemo(() => {
    if (!docs) return { dados: null, anterior: null };
    const inicio = diaMenos(periodo - 1);
    const atuais = docs.filter((d) => d.dia >= inicio);
    const antes = comparar ? docs.filter((d) => d.dia < inicio) : null;
    return {
      dados: consolidar(atuais, contas, periodo),
      anterior: antes ? consolidar(antes, [], periodo) : null,
    };
  }, [docs, contas, periodo, comparar]);

  const resumoAval = useMemo(() => {
    const validas = avaliacoes.filter((a) => Number.isFinite(Number(a.nota)));
    const media = validas.length ? validas.reduce((s, a) => s + Number(a.nota), 0) / validas.length : 0;
    const dist = [5, 4, 3, 2, 1, 0].map((nota) => ({ nota, qtd: validas.filter((a) => Number(a.nota) === nota).length }));
    const lista = [...validas].sort((a, b) => (paraData(b.atualizadoEm)?.getTime() || 0) - (paraData(a.atualizadoEm)?.getTime() || 0));
    const comComentario = lista.filter((a) => String(a.comentario || "").trim());
    return { media, dist, lista, total: validas.length, comComentario };
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

  const nomeBase = (id) => (id === SEDE.id ? SEDE.nome : regioes.find((r) => r.id === id)?.nome || String(id).toUpperCase());

  const baixarCsv = () => {
    if (!dados) return;
    const linhas = [
      ["Pessoa", "Nível", "Base", "Último login", "Último acesso", "Dias com uso", "Tempo de uso (min)", "Logins", "Telas abertas", "Impressões", "Onde mais usa", "Avaliação", "Comentário"],
      ...[...dados.lista, ...dados.semUso].map((p) => {
        const av = avaliacoes.find((a) => a.uid === p.uid || a.id === p.uid);
        return [
          p.nome,
          nivelDe(p),
          (p.regiao || "ssa").toUpperCase(),
          p.ultimoLogin ? p.ultimoLogin.toLocaleString("pt-BR") : "",
          p.ultimoAcesso ? p.ultimoAcesso.toLocaleString("pt-BR") : "",
          p.diasAtivos,
          Math.round(n(p.tempo) / 60),
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

  const valorSerie = (s) => (serieModo === "tempo" ? s.tempo : s.pessoas);
  const maxSerie = Math.max(1, ...(dados?.serie || []).map(valorSerie));
  const maxTela = Math.max(1, ...(dados?.telas || []).map((t) => (dados.temTempo ? t.tempo : t.total)));
  const maxAcao = Math.max(1, ...(dados?.acoes || []).map((t) => t.total));
  const maxHora = Math.max(1, ...(dados?.horas || [0]));
  const maxBase = Math.max(1, ...(dados?.bases || []).map((b) => b.tempo));
  const maxDist = Math.max(1, ...resumoAval.dist.map((d) => d.qtd));
  const linhas = !dados ? [] : filtro === "usaram" ? dados.lista : filtro === "naoUsaram" ? dados.semUso : [...dados.lista, ...dados.semUso];
  const marcarDias = periodo <= 30 ? 1 : 7;
  // horas do eixo: das 6h às 22h, abrindo mais se houver uso fora disso
  const usadas = (dados?.horas || []).map((v, h) => (v > 0 ? h : null)).filter((h) => h !== null);
  const hIni = Math.min(6, ...usadas);
  const hFim = Math.max(22, ...usadas);
  const horasUsadas = (dados?.horas || []).map((v, h) => ({ h, v })).filter(({ h }) => h >= hIni && h <= hFim);
  const pico = dados?.horas ? dados.horas.indexOf(Math.max(...dados.horas)) : -1;
  const mediaPorPessoa = dados && dados.lista.length ? dados.tempoTotal / dados.lista.length : 0;

  return (
    <div className="atv ui-page">
      <PageHeader
        title="Balanço de uso"
        description="Quem está usando o sistema, quanto tempo e onde, em que horário, as impressões feitas e a avaliação de cada um."
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
                hint: [dados.contasAtivas ? `de ${dados.contasAtivas} contas ativas` : "", variacao(dados.lista.length, anterior?.lista.length)].filter(Boolean).join(" · "),
                icon: "users",
              },
              {
                key: "tempo",
                label: "Tempo de uso",
                value: fmtDuracao(dados.tempoTotal),
                hint: dados.temTempo
                  ? [`média ${fmtDuracao(mediaPorPessoa)} por pessoa`, variacao(dados.tempoTotal, anterior?.temTempo ? anterior.tempoTotal : null)].filter(Boolean).join(" · ")
                  : "começa a contar a partir desta atualização",
                icon: "clock",
              },
              { key: "logins", label: "Logins", value: dados.totalLogins, hint: variacao(dados.totalLogins, anterior?.totalLogins) || `${periodo} dias`, icon: "login" },
              {
                key: "impressoes",
                label: "Impressões e PDFs",
                value: dados.totalImpressoes,
                hint: variacao(dados.totalImpressoes, anterior?.totalImpressoes) || "placas, mapas, relatórios…",
                icon: "printer",
              },
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
              <CardHeader
                title={serieModo === "tempo" ? "Tempo de uso por dia" : "Pessoas usando por dia"}
                subtitle={
                  serieModo === "tempo"
                    ? `Soma do tempo de todos em cada dia · últimos ${periodo} dias`
                    : `Quantas pessoas diferentes entraram em cada dia · últimos ${periodo} dias`
                }
                icon="barChart"
                actions={
                  <Segmented
                    size="sm"
                    value={serieModo}
                    onChange={setSerieModo}
                    options={[
                      { value: "pessoas", label: "Pessoas" },
                      { value: "tempo", label: "Tempo" },
                    ]}
                    ariaLabel="O que mostrar no gráfico"
                  />
                }
              />
              <div className="atv-serie" role="img" aria-label={serieModo === "tempo" ? "Tempo de uso por dia" : "Pessoas usando por dia"}>
                <div className="atv-serie__barras" style={{ "--n": dados.serie.length }}>
                  {dados.serie.map((s, i) => {
                    const v = valorSerie(s);
                    const rotulo = serieModo === "tempo" ? fmtDuracao(v) : v;
                    return (
                      <div
                        key={s.dia}
                        className="atv-serie__col"
                        title={`${diaCurto(s.dia)}: ${s.pessoas} ${s.pessoas === 1 ? "pessoa" : "pessoas"} · ${fmtDuracao(s.tempo)} de uso · ${s.impressoes} impressões`}
                      >
                        <span className="atv-serie__valor">{v > 0 && periodo <= 30 && (serieModo === "pessoas" || periodo <= 7) ? rotulo : ""}</span>
                        <span className="atv-serie__barra" style={{ height: `${(v / maxSerie) * 100}%` }} />
                        <span className="atv-serie__dia">{i % marcarDias === 0 || i === dados.serie.length - 1 ? diaCurto(s.dia) : ""}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>

            <Card className="atv-card">
              <CardHeader
                title={dados.temTempo ? "Onde o tempo é gasto" : "Telas mais abertas"}
                subtitle={dados.temTempo ? "Tempo de uso em cada tela (e quantas vezes foi aberta)" : "Vezes que cada tela foi aberta"}
                icon="clock"
              />
              <ListaBarras
                itens={dados.telas.slice(0, 10)}
                max={maxTela}
                valor={(t) => (dados.temTempo ? fmtDuracao(t.tempo) : t.total)}
                medida={(t) => (dados.temTempo ? t.tempo : t.total)}
                extra={(t) => `${t.pessoas} ${t.pessoas === 1 ? "pessoa" : "pessoas"}${dados.temTempo ? ` · aberta ${t.total}×` : ""}`}
                vazio="Nenhuma tela registrada no período."
              />
            </Card>

            <Card className="atv-card">
              <CardHeader
                title="Horário de uso"
                subtitle={dados.temTempo && pico >= 0 ? `Pico às ${String(pico).padStart(2, "0")}h · tempo de uso em cada hora do dia` : "Tempo de uso em cada hora do dia"}
                icon="clock"
              />
              {dados.temTempo ? (
                <div className="atv-horas" role="img" aria-label="Tempo de uso por hora do dia">
                  {horasUsadas.map(({ h, v }) => (
                    <div key={h} className={`atv-horas__col ${h === pico ? "is-pico" : ""}`} title={`${String(h).padStart(2, "0")}h: ${fmtDuracao(v)}`}>
                      <span className="atv-horas__barra" style={{ height: `${(v / maxHora) * 100}%` }} />
                      <span className="atv-horas__h">{h % 3 === 0 || h === pico ? `${h}h` : ""}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="atv-vazio">O horário de uso começa a ser registrado a partir desta atualização.</p>
              )}
            </Card>

            <Card className="atv-card">
              <CardHeader title="Impressões e ações" subtitle="PDFs, mapas, relatórios, consultas à Central e outras ações" icon="printer" />
              <ListaBarras
                itens={dados.acoes.slice(0, 10)}
                max={maxAcao}
                valor={(t) => t.total}
                medida={(t) => t.total}
                extra={(t) => `${t.pessoas} ${t.pessoas === 1 ? "pessoa" : "pessoas"}`}
                vazio="Nenhuma impressão registrada no período."
              />
            </Card>

            {dados.bases.length > 1 && (
              <Card className="atv-card">
                <CardHeader title="Uso por base" subtitle="Tempo de uso com cada base selecionada" icon="mapPin" />
                <ListaBarras
                  itens={dados.bases.map((b) => ({ chave: b.id, rotulo: nomeBase(b.id), tempo: b.tempo, pessoas: b.pessoas }))}
                  max={maxBase}
                  valor={(t) => fmtDuracao(t.tempo)}
                  medida={(t) => t.tempo}
                  extra={(t) => `${t.pessoas} ${t.pessoas === 1 ? "pessoa" : "pessoas"}`}
                  vazio=""
                />
              </Card>
            )}
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
              <Table columns="32px minmax(180px, 1.6fr) 120px 120px 70px 90px 90px minmax(140px, 1fr)" minWidth={940} compact>
                <TableHead>
                  <span />
                  <span>Pessoa</span>
                  <span>Último login</span>
                  <span>Último acesso</span>
                  <span className="atv-num">Dias</span>
                  <span className="atv-num">Tempo</span>
                  <span className="atv-num">Impressões</span>
                  <span>Onde mais usa</span>
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
                        <span className="atv-num" title={p.telasVistas ? `${p.telasVistas} telas abertas` : undefined}>
                          {fmtDuracao(p.tempo)}
                        </span>
                        <span className="atv-num">{p.impressoes || "—"}</span>
                        <span className="atv-trunca">{p.usou ? p.maisUsada : "Não usou no período"}</span>
                      </TableRow>
                      {exp && (
                        <TableExpansion>
                          <ResumoPessoa pessoa={p} />
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
            <CardHeader
              title="Avaliação do sistema"
              subtitle="Nota de 0 a 5 e comentário de cada pessoa (vale a última avaliação de cada uma)."
              icon="star"
              actions={
                resumoAval.total > 0 && (
                  <Button size="sm" icon="list" onClick={() => setVerAvaliacoes(true)}>
                    Ver todas ({resumoAval.total})
                  </Button>
                )
              }
            />
            {resumoAval.total === 0 ? (
              <EmptyState icon="star" title="Ninguém avaliou ainda">
                O botão “Avaliar o sistema” fica no menu lateral (e na área do guia), e o convite aparece depois de uma ação.
              </EmptyState>
            ) : (
              <div className="atv-aval">
                <div className="atv-aval__resumo">
                  <strong>{resumoAval.media.toFixed(1).replace(".", ",")}</strong>
                  <Estrelas valor={resumoAval.media} somenteLeitura tamanho={18} />
                  <small>
                    {resumoAval.total} {resumoAval.total === 1 ? "avaliação" : "avaliações"} · {resumoAval.comComentario.length} com comentário
                  </small>
                  <DistribuicaoNotas dist={resumoAval.dist} max={maxDist} />
                </div>
                <div className="atv-aval__recentes">
                  <span className="atv-aval__titulo">Comentários mais recentes</span>
                  {resumoAval.comComentario.length === 0 ? (
                    <p className="atv-vazio">Ninguém deixou comentário ainda — só notas.</p>
                  ) : (
                    <ul className="atv-aval__lista">
                      {resumoAval.comComentario.slice(0, COMENTARIOS_NO_CARD).map((a) => (
                        <ItemAvaliacao key={a.id} a={a} />
                      ))}
                    </ul>
                  )}
                  <button type="button" className="atv-ver-todas" onClick={() => setVerAvaliacoes(true)}>
                    Ver todas as {resumoAval.total} avaliações <Icon name="arrowRight" size={13} />
                  </button>
                </div>
              </div>
            )}
          </Card>

          <TodasAvaliacoes open={verAvaliacoes} onClose={() => setVerAvaliacoes(false)} lista={resumoAval.lista} dist={resumoAval.dist} />

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

const ListaBarras = ({ itens, max, valor, medida, extra, vazio }) =>
  itens.length === 0 ? (
    vazio ? <p className="atv-vazio">{vazio}</p> : null
  ) : (
    <ul className="atv-barras">
      {itens.map((t) => (
        <li key={t.chave} title={`${t.rotulo}: ${valor(t)} · ${extra(t)}`}>
          <span className="atv-barras__rotulo">{t.rotulo}</span>
          <i>
            <b style={{ width: `${(medida(t) / max) * 100}%` }} />
          </i>
          <span className="atv-num">{valor(t)}</span>
          <small className="atv-barras__pessoas">{extra(t)}</small>
        </li>
      ))}
    </ul>
  );

const DistribuicaoNotas = ({ dist, max, valor, onEscolher }) => (
  <ul className={`atv-aval__dist ${onEscolher ? "atv-aval__dist--filtro" : ""}`}>
    {dist.map((d) => {
      const conteudo = (
        <>
          <span>{d.nota}★</span>
          <i>
            <b style={{ width: `${(d.qtd / max) * 100}%` }} />
          </i>
          <span className="atv-num">{d.qtd}</span>
        </>
      );
      return (
        <li key={d.nota}>
          {onEscolher ? (
            <button type="button" className={valor === d.nota ? "is-on" : ""} onClick={() => onEscolher(valor === d.nota ? "todas" : d.nota)} disabled={!d.qtd}>
              {conteudo}
            </button>
          ) : (
            conteudo
          )}
        </li>
      );
    })}
  </ul>
);

const ItemAvaliacao = ({ a }) => (
  <li>
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
);

// painel com TODAS as avaliações: filtro por nota, só com comentário, busca e ordem
const TodasAvaliacoes = ({ open, onClose, lista, dist }) => {
  const [nota, setNota] = useState("todas");
  const [soComentario, setSoComentario] = useState(false);
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState("recentes");
  const max = Math.max(1, ...dist.map((d) => d.qtd));
  const t = busca
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  const filtradas = lista
    .filter((a) => nota === "todas" || Number(a.nota) === nota)
    .filter((a) => !soComentario || String(a.comentario || "").trim())
    .filter(
      (a) =>
        !t ||
        `${a.nome} ${a.comentario}`
          .toLowerCase()
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .includes(t),
    )
    .sort((a, b) =>
      ordem === "menor" ? Number(a.nota) - Number(b.nota) : ordem === "maior" ? Number(b.nota) - Number(a.nota) : 0,
    );
  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={620}
      title="Todas as avaliações"
      subtitle={`${lista.length} ${lista.length === 1 ? "avaliação" : "avaliações"} · vale a última de cada pessoa`}
      footer={<Button onClick={onClose}>Fechar</Button>}
    >
      <div className="atv-todas">
        <div className="atv-todas__filtros">
          <DistribuicaoNotas dist={dist} max={max} valor={nota} onEscolher={setNota} />
          <div className="atv-todas__linha">
            <SearchInput value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou comentário" />
            <select className="ui-input" value={ordem} onChange={(e) => setOrdem(e.target.value)} aria-label="Ordem">
              <option value="recentes">Mais recentes</option>
              <option value="menor">Menor nota primeiro</option>
              <option value="maior">Maior nota primeiro</option>
            </select>
          </div>
          <label className="atv-todas__check">
            <input type="checkbox" checked={soComentario} onChange={(e) => setSoComentario(e.target.checked)} /> Só com comentário
          </label>
          <span className="atv-todas__qtd">
            {filtradas.length} de {lista.length}
            {nota !== "todas" && (
              <button type="button" onClick={() => setNota("todas")}>
                Limpar nota
              </button>
            )}
          </span>
        </div>
        {filtradas.length === 0 ? (
          <p className="atv-vazio">Nenhuma avaliação com esse filtro.</p>
        ) : (
          <ul className="atv-aval__lista atv-aval__lista--toda">
            {filtradas.map((a) => (
              <ItemAvaliacao key={a.id} a={a} />
            ))}
          </ul>
        )}
      </div>
    </Drawer>
  );
};

// onde a pessoa passa o tempo (as 5 telas principais)
const ResumoPessoa = ({ pessoa }) => {
  const telas = Object.entries(pessoa.tempoTelas || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  if (!telas.length) return null;
  const max = Math.max(1, ...telas.map(([, v]) => v));
  return (
    <div className="atv-pessoa-tempo">
      <span className="atv-aval__titulo">Onde {String(pessoa.nome).split(" ")[0]} passa o tempo</span>
      <ul className="atv-barras atv-barras--compacta">
        {telas.map(([k, v]) => (
          <li key={k}>
            <span className="atv-barras__rotulo">{pessoa.rotulos?.[k] || k}</span>
            <i>
              <b style={{ width: `${(v / max) * 100}%` }} />
            </i>
            <span className="atv-num">{fmtDuracao(v)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

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
