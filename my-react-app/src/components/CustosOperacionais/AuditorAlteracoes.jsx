import { Fragment, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Button, Card, CardHeader, EmptyState, Icon, KpiTiles, useToast } from "../ui";
import { useAuth } from "../../Context/AuthContext";
import { useRegiao } from "../../Context/regiaoContext";
import {
  CLASSES_ATUALIZACAO,
  CURTO_ALTERACAO,
  ITENS_OBSERVADOS,
  NOME_CLASSE,
  fraseDaAtualizacao,
  linhasDoQueMudou,
  nomeCategoriaCurto,
  NOME_ALTERACAO,
  nomeDoVeiculo,
  TIPOS_ALTERACAO,
  compararComFoto,
  conferenciaSuspeita,
  normalizarAuditoria,
  textoDaMudanca,
} from "../../Services/Services/auditoriaAlteracoes";
import { NOME_TIPO, formatarReais } from "../../Services/Services/custosCalculo";
import BalancoAlteracoes from "./BalancoAlteracoes";
import { CSS_IMPRESSAO, esc, imprimirHtml } from "../RelatorioTurnos/impressaoTurnos";
import {
  calcularLinhasDoDia,
  chaveDaVista,
  gravarResumoDoBalanco,
  ouvirAuditoria,
  registrarNoHistorico,
  rodarAuditoriaAutomatica,
  salvarConfigCustos,
} from "../../Services/Services/custosRepository";

/* =========================================================
   AUDITOR DE ALTERAÇÕES (automático)
   À meia-noite o sistema guarda a PROGRAMAÇÃO do dia; durante a operação,
   compara com o Phoenix e registra cada alteração (com a hora em que
   apareceu) — mesmo com a tela fechada, enquanto alguém com acesso a Custos
   estiver com o sistema aberto. Custo de cada alteração: diferença da tabela
   de tarifas + a tabela de custos das alterações (configurável).
   ========================================================= */

const isoDe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hojeIso = () => isoDe(new Date());
const somarDias = (iso, n) => {
  const [y, m, d] = iso.split("-").map(Number);
  return isoDe(new Date(y, m - 1, d + n, 12));
};
const dataBr = (iso = "") => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
const quando = (ts) => {
  const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : null;
  return d ? `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "";
};
const horaDe = (ts) => {
  const d = ts?.toDate ? ts.toDate() : null;
  return d ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
};
const sinal = (v) => (v > 0 ? `+${formatarReais(v)}` : v < 0 ? `−${formatarReais(-v)}` : formatarReais(0));
const ATUALIZAR_MS = 5 * 60 * 1000;
const ORIGEM = {
  "meia-noite": "fechada na virada do dia",
  vespera: "fechada com a última versão montada na véspera",
  atrasada: "guardada só depois da meia-noite (ninguém estava com o sistema aberto na virada) — o que mudou antes disso não aparece",
  antecipada: "guardada antes do dia",
  manual: "guardada à mão",
  automatica: "guardada automaticamente",
  tardia: "guardada no próprio dia",
};

const textoMudanca = textoDaMudanca;
const pl = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const ICONE_CLASSE = { veiculoMais: "split", juntou: "merge", troca: "swap", novo: "plus", cancelado: "x", remanejou: "users", ajuste: "sliders", escala: "hash" };
const ICONE_CATEGORIA = { carro: "car", van: "van", "van-alongada": "van", micro: "bus", onibus: "bus" };
const ROTULO_ESTADO = { entrou: "entrou", saiu: "saiu", trocou: "trocou" };

/* ---------- o que o auditor observa (configurável) ---------- */
const OQueObservar = ({ config, onFechar }) => {
  const { mostrarToast } = useToast();
  const [o, setO] = useState(() => normalizarAuditoria(config.auditoria).observar);
  const [salvando, setSalvando] = useState(false);
  const salvar = async () => {
    setSalvando(true);
    try {
      await salvarConfigCustos({ auditoria: { ...normalizarAuditoria(config.auditoria), observar: o } });
      mostrarToast("O auditor vai observar só o que está marcado");
      onFechar?.();
    } catch (e) {
      console.error(e);
      window.alert("Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };
  return (
    <Card className="aud-obs">
      <CardHeader
        icon="eye"
        title="O que o auditor observa"
        subtitle="Tudo vem do Phoenix e é comparado com a programação fechada à meia-noite. Desmarcado, o auditor ignora aquele tipo de mudança: não mostra, não conta no custo e não avisa no sino."
      />
      <div className="aud-obs__lista">
        {ITENS_OBSERVADOS.map((i) => (
          <label key={i.id} className={`aud-obs__item ${o[i.id] ? "is-on" : ""}`}>
            <input type="checkbox" checked={!!o[i.id]} onChange={(e) => setO((x) => ({ ...x, [i.id]: e.target.checked }))} />
            <span>
              <b>{i.nome}</b>
              <small>{i.dica}</small>
            </span>
          </label>
        ))}
      </div>
      <p className="aud-obs__nota">
        <Icon name="info" size={14} />
        <span>
          Como o auditor reconhece o mesmo grupo de passageiros: pelas <b>reservas</b> de cada veículo. Se a escala for refeita no mesmo veículo (o número muda, o resto
          não), ele sabe que é a mesma logística e não conta como troca.
        </span>
      </p>
      <div className="aud-regras__acoes">
        <Button variant="ghost" size="sm" onClick={onFechar} disabled={salvando}>
          Fechar
        </Button>
        <Button variant="primary" size="sm" icon="save" onClick={salvar} loading={salvando} disabled={salvando}>
          Salvar
        </Button>
      </div>
    </Card>
  );
};

/* ---------- tabela de custos das alterações (configurável) ---------- */
const TabelaRegras = ({ config, onFechar }) => {
  const { mostrarToast } = useToast();
  const [r, setR] = useState(() => normalizarAuditoria(config.auditoria));
  const [salvando, setSalvando] = useState(false);
  const mudar = (tipo, campo, valor) => setR((x) => ({ ...x, regras: { ...x.regras, [tipo]: { ...x.regras[tipo], [campo]: valor } } }));
  const salvar = async () => {
    setSalvando(true);
    try {
      await salvarConfigCustos({ auditoria: normalizarAuditoria(r) });
      mostrarToast("Tabela de custos das alterações salva");
      onFechar?.();
    } catch (e) {
      console.error(e);
      window.alert("Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };
  return (
    <Card className="aud-regras">
      <CardHeader
        icon="tag"
        title="Tabela de custos das alterações"
        subtitle="Quanto cada tipo de alteração custa além da diferença da tabela de tarifas. Valor fixo, % do valor do serviço e valor por passageiro somam."
      />
      <div className="aud-regras__gerais">
        <span className="aud-regras__info">
          <Icon name="clock" size={14} /> A programação do dia é guardada sozinha à meia-noite; as alterações são registradas ao longo do dia.
        </span>
        <label className="aud-check">
          <input type="checkbox" checked={r.contarTabela} onChange={(e) => setR((x) => ({ ...x, contarTabela: e.target.checked }))} />
          Somar a diferença da tabela de tarifas (custo agora − custo programado)
        </label>
      </div>
      <div className="aud-regras__tabela">
        <table>
          <thead>
            <tr>
              <th>Alteração</th>
              <th>Conta?</th>
              <th>Valor fixo (R$)</th>
              <th>% do serviço</th>
              <th>R$ por pax / reserva</th>
            </tr>
          </thead>
          <tbody>
            {TIPOS_ALTERACAO.map((t) => {
              const g = r.regras[t.id];
              return (
                <tr key={t.id} className={g.ativa ? "" : "is-off"}>
                  <td>
                    <b>{t.nome}</b>
                    <small>{t.ref === "antes" ? "% sobre o valor que estava na programação" : "% sobre o valor do serviço agora"}</small>
                  </td>
                  <td>
                    <input type="checkbox" checked={g.ativa} onChange={(e) => mudar(t.id, "ativa", e.target.checked)} aria-label={`Contar ${t.nome}`} />
                  </td>
                  <td>
                    <input type="number" min="0" step="0.01" className="ui-input" value={g.fixo} onChange={(e) => mudar(t.id, "fixo", e.target.value)} aria-label={`Valor fixo · ${t.nome}`} />
                  </td>
                  <td>
                    <input type="number" min="0" max="500" step="1" className="ui-input" value={g.pct} onChange={(e) => mudar(t.id, "pct", e.target.value)} aria-label={`% · ${t.nome}`} />
                  </td>
                  <td>
                    {t.porPax ? (
                      <input type="number" min="0" step="0.01" className="ui-input" value={g.porPax} onChange={(e) => mudar(t.id, "porPax", e.target.value)} aria-label={`Por pax · ${t.nome}`} />
                    ) : (
                      <span className="aud-regras__na">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="aud-regras__acoes">
        <Button variant="ghost" size="sm" onClick={onFechar} disabled={salvando}>
          Fechar
        </Button>
        <Button variant="primary" size="sm" icon="save" onClick={salvar} loading={salvando} disabled={salvando}>
          Salvar tabela
        </Button>
      </div>
    </Card>
  );
};

// Dia (o auditor) | Balanço do período
const AuditorAlteracoes = (props) => {
  const [visao, setVisao] = useState("dia");
  return (
    <div className="aud-raiz">
      <div className="aud-visoes" role="tablist" aria-label="Auditor">
        {[
          ["dia", "calendar", "Atualizações do dia"],
          ["balanco", "barChart", "Balanço do período"],
        ].map(([v, ic, r]) => (
          <button key={v} type="button" role="tab" aria-selected={visao === v} className={visao === v ? "is-on" : ""} onClick={() => setVisao(v)}>
            <Icon name={ic} size={14} /> {r}
          </button>
        ))}
      </div>
      {visao === "dia" ? <AuditorDoDia {...props} /> : <BalancoAlteracoes />}
    </div>
  );
};

const AuditorDoDia = ({ config, pronto, vinculos, fornecedores }) => {
  const { perfil } = useAuth();
  // a base em uso: a auditoria (Phoenix e documentos) é sempre da mesma base
  const { regiao } = useRegiao();
  const [data, setData] = useState(hojeIso);
  const [recarga, setRecarga] = useState(0);
  const [atual, setAtual] = useState({ chave: "", data: "", linhas: [], estado: "carregando", erro: "" });
  const [aud, setAud] = useState({ data: "", doc: undefined });
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroImpacto, setFiltroImpacto] = useState("");
  const [regrasAbertas, setRegrasAbertas] = useState(false);
  const [obsAberto, setObsAberto] = useState(false);
  const hoje = hojeIso();
  const chave = `${data}|${recarga}`;

  // programação guardada e histórico de alterações do dia (tempo real)
  useEffect(() => ouvirAuditoria(data, (doc) => setAud({ data, doc }), regiao), [data, regiao]);

  // o dia agora: Phoenix + tabela de tarifas
  useEffect(() => {
    if (!pronto) return undefined;
    let vivo = true;
    const ch = `${data}|${recarga}`;
    calcularLinhasDoDia(data, { config, vinculos, fornecedores, regiao })
      .then((linhas) => vivo && setAtual({ chave: ch, data, linhas, estado: "ok", erro: "" }))
      // erro numa atualização não apaga o que já estava na tela
      .catch((e) => vivo && setAtual((x) => (x.data === data && x.estado === "ok" ? { ...x, chave: ch, erroAtualizar: e?.message || "O Phoenix não respondeu." } : { chave: ch, data, linhas: [], estado: "erro", erro: e?.message || "O Phoenix não respondeu." })));
    return () => {
      vivo = false;
    };
  }, [data, recarga, pronto, config, vinculos, fornecedores, regiao]);

  // hoje: atualiza sozinho
  useEffect(() => {
    if (data !== hoje) return undefined;
    const t = setInterval(() => setRecarga((x) => x + 1), ATUALIZAR_MS);
    return () => clearInterval(t);
  }, [data, hoje]);

  // hoje: garante a programação guardada (se ninguém estava com o sistema aberto
  // à meia-noite, guarda agora) e registra as alterações — sem botão
  useEffect(() => {
    if (!pronto || data !== hoje) return;
    rodarAuditoriaAutomatica(perfil, { config, vinculos, fornecedores, regiao }).catch((e) => console.error("Auditoria automática:", e));
  }, [pronto, data, hoje, perfil, config, vinculos, fornecedores, regiao]);

  const doc = aud.data === data ? aud.doc : undefined;
  const foto = doc?.foto || null;
  const carregando = doc === undefined || atual.chave !== chave;
  // só compara a programação com o Phoenix DO MESMO DIA (ao trocar de dia, a
  // tela não mistura a foto de um dia com os serviços de outro)
  const doDia = atual.data === data && atual.estado === "ok";
  const suspeita = !!(foto && doDia && conferenciaSuspeita(foto, atual.linhas));
  const rel = useMemo(
    () => (foto && doDia && !suspeita ? compararComFoto(foto, atual.linhas, config.auditoria || normalizarAuditoria()) : null),
    [foto, doDia, suspeita, atual, config.auditoria],
  );

  // o que aparecer de novo vai para o histórico (com a hora) e o resumo do
  // dia vai para o Balanço
  const resumoGravado = doc?.resumo;
  useEffect(() => {
    if (!rel || !doc) return;
    if (data === hoje) {
      const hist = doc.historico || {};
      const mudou = !resumoGravado || resumoGravado.alteracoes !== rel.alteracoes.length || resumoGravado.impacto !== rel.totais.impacto;
      const semHora = rel.alteracoes.some((a) => a.mudancas.some((m) => m.id && !doc.horasMudancas?.[m.id]));
      if (mudou || semHora || rel.alteracoes.some((a) => !hist[chaveDaVista(a.id)])) registrarNoHistorico(data, rel.alteracoes, hist, rel, regiao).catch((e) => console.error("Histórico:", e));
    } else if (data < hoje && !resumoGravado) {
      gravarResumoDoBalanco(data, rel, regiao).catch((e) => console.error("Resumo do balanço:", e));
    }
  }, [rel, doc, data, hoje, resumoGravado]);

  const historico = useMemo(() => doc?.historico || {}, [doc]);
  // hora em que a atualização apareceu pela primeira vez
  const vistoEm = (id) => historico[chaveDaVista(id)]?.em || doc?.vistas?.[chaveDaVista(id)] || null;
  // hora de cada mudança (a primeira vez que o sistema viu); sem registro, a da atualização
  const horasMud = doc?.horasMudancas || {};
  const msDe = (ts) => ts?.toMillis?.() ?? (ts?.toDate ? ts.toDate().getTime() : null);
  const horaDasMudancas = (ids, a) => {
    const t = ids.map((id) => msDe(horasMud[id])).filter((x) => x !== null && x !== undefined);
    if (t.length) return new Date(Math.max(...t));
    const v = vistoEm(a.id);
    return v?.toDate ? v.toDate() : null;
  };
  const horaCurta = (d) => (d ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "");
  const passaFiltro = (a) =>
    (!filtroTipo || a.classe === filtroTipo) &&
    (!filtroImpacto || (filtroImpacto === "mais" ? a.impacto > 0 : filtroImpacto === "menos" ? a.impacto < 0 : a.impacto === 0));
  const lista = rel ? rel.alteracoes.filter(passaFiltro) : [];
  const nImpacto = (f) => (rel ? rel.alteracoes.filter((a) => (f === "mais" ? a.impacto > 0 : f === "menos" ? a.impacto < 0 : a.impacto === 0)).length : 0);

  const baixarExcel = () => {
    if (!rel) return;
    const linhas = [
      [`Auditor da programação · ${dataBr(data)}`],
      [`Programação fechada: ${quando(foto.em)} (${ORIGEM[foto.origem] || foto.origem})`],
      [],
      ["Hora", "Tipo", "Atualização", "Serviço", "Programado", "Agora", "Detalhes", "Custo programado", "Custo agora", "Diferença da tabela", "Tabela das alterações", "Impacto", "Resultado", "Visto às"],
      ...rel.alteracoes.map((a) => [
        a.hora,
        NOME_TIPO[a.tipoServico] || a.tipoServico,
        a.titulo,
        a.servico,
        a.veiculosAntes || "—",
        a.veiculosDepois || "—",
        a.mudancas.filter((m) => m.tipo !== "novo" && m.tipo !== "cancelado").map((m) => `${NOME_ALTERACAO[m.tipo]}: ${textoMudanca(m)}`).join(" | "),
        a.totalAntes,
        a.totalDepois,
        a.deltaTabela,
        a.custoRegras,
        a.impacto,
        a.impacto > 0 ? "Custo maior" : a.impacto < 0 ? "Custo enxugado" : "Sem impacto",
        horaDe(vistoEm(a.id)),
      ]),
      [],
      ["", "", "", "", "", "", "Total do dia", rel.totais.totalFoto, rel.totais.totalAgora, rel.totais.deltaTabela, rel.totais.custoRegras, rel.totais.impacto],
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), "Atualizações");
    XLSX.writeFile(wb, `auditor-programacao-${data}.xlsx`);
  };

  // relatório do dia (imprimir ou salvar em PDF)
  const imprimirDia = () => {
    if (!rel) return;
    const t = rel.totais;
    const cls = (v) => (v > 0 ? "mais" : v < 0 ? "menos" : "");
    const lado = (l) => (l.length ? l.map((x) => esc(nomeDoVeiculo(x))).join("<br>") : "<i>—</i>");
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Auditor da programação ${esc(dataBr(data))}</title><style>${CSS_IMPRESSAO}
.mais { color: #b42318; font-weight: 700; } .menos { color: #067647; font-weight: 700; }
td { vertical-align: top; } td.e { white-space: normal !important; } .det { color: #57606a; font-size: 9.5px; }
</style></head><body>
<div class="topo"><div><h1>Auditor da programação · ${esc(dataBr(data))}</h1><p>Programação ${esc(ORIGEM[foto.origem] || foto.origem)} (${esc(quando(foto.em))}) · ${t.servicosFoto} serviço(s)</p></div><div class="gerado">Gerado em ${esc(new Date().toLocaleString("pt-BR"))}</div></div>
<div class="kpis">
<div class="kpi"><span>Atualizações no dia</span><b>${rel.alteracoes.length}</b><small>${t.servicosFoto} → ${t.servicosAgora} serviço(s)</small></div>
<div class="kpi"><span>Custo maior</span><b class="mais">${esc(sinal(t.aumentos))}</b><small>${nImpacto("mais")} atualização(ões)</small></div>
<div class="kpi"><span>Custo enxugado</span><b class="menos">${esc(sinal(t.reducoes))}</b><small>${nImpacto("menos")} atualização(ões)</small></div>
<div class="kpi"><span>Saldo do dia</span><b class="${cls(t.impacto)}">${esc(sinal(t.impacto))}</b><small>programado ${esc(formatarReais(t.totalFoto, { semCentavos: true }))} → agora ${esc(formatarReais(t.totalAgora, { semCentavos: true }))}</small></div>
</div>
<h2>Atualizações</h2>
${
  rel.alteracoes.length
    ? `<table><thead><tr><th class="e">Hora</th><th class="e">Atualização</th><th class="e">Programado</th><th class="e">Agora</th><th>Antes</th><th>Agora</th><th>Impacto</th></tr></thead><tbody>${rel.alteracoes
        .map((a) => {
          const det = a.mudancas.filter((m) => m.tipo !== "novo" && m.tipo !== "cancelado").map((m) => `${CURTO_ALTERACAO[m.tipo]} ${textoMudanca(m)}`).join(" · ");
          return `<tr><td class="e"><b>${esc(a.hora || "--:--")}</b><br><span class="det">${esc(NOME_TIPO[a.tipoServico] || a.tipoServico)}</span></td><td class="e"><b>${esc(a.titulo || NOME_CLASSE[a.classe] || "")}</b><br><span class="det">${esc(a.servico)}${det ? `<br>${esc(det)}` : ""}</span></td><td class="e">${lado(a.antesLista || [])}</td><td class="e">${lado(a.depoisLista || [])}</td><td>${esc(formatarReais(a.totalAntes))}</td><td>${esc(formatarReais(a.totalDepois))}</td><td class="${cls(a.impacto)}">${esc(sinal(a.impacto))}</td></tr>`;
        })
        .join("")}</tbody></table>`
    : "<p>Nenhuma atualização desde a programação fechada.</p>"
}
</body></html>`;
    imprimirHtml(html);
  };

  return (
    <div className="aud">
      <Card className="aud-barra">
        <div className="aud-barra__linha">
          <span className="aud-navdia">
            <Button variant="ghost" iconOnly size="sm" icon="chevronLeft" onClick={() => setData((d) => somarDias(d, -1))} aria-label="Dia anterior" />
            <input type="date" className="ui-input" value={data} onChange={(e) => e.target.value && setData(e.target.value)} aria-label="Dia" />
            <Button variant="ghost" iconOnly size="sm" icon="chevronRight" onClick={() => setData((d) => somarDias(d, 1))} aria-label="Próximo dia" />
            <Button variant="ghost" size="sm" onClick={() => setData(hoje)} disabled={data === hoje}>
              Hoje
            </Button>
          </span>
          <span className="aud-barra__acoes">
            <Button size="sm" icon="refresh" onClick={() => setRecarga((x) => x + 1)} loading={carregando && !!foto && doDia} disabled={carregando}>
              Atualizar
            </Button>
            <Button size="sm" icon="download" onClick={baixarExcel} disabled={!rel}>
              Excel
            </Button>
            <Button size="sm" icon="printer" onClick={imprimirDia} disabled={!rel}>
              Relatório
            </Button>
            <Button size="sm" icon="eye" onClick={() => setObsAberto((x) => !x)}>
              O que observar
            </Button>
            <Button size="sm" icon="tag" onClick={() => setRegrasAbertas((x) => !x)}>
              Tabela de custos
            </Button>
          </span>
        </div>
        <div className="aud-fotos">
          <span className={`aud-foto ${foto ? "is-ok" : data > hoje ? "" : "is-falta"} ${foto?.origem === "atrasada" ? "is-atrasada" : ""}`}>
            <Icon name={foto ? (foto.origem === "atrasada" ? "alert" : "circleCheck") : "clock"} size={15} />
            {foto ? (
              <span>
                <b>Programação de {dataBr(data).slice(0, 5)}</b> · {ORIGEM[foto.origem] || foto.origem} ({quando(foto.em)}) · {foto.servicos} serviço(s)
                {rel ? <> · {formatarReais(rel.totais.totalFoto, { semCentavos: true })}</> : null}
                {doc?.ultimaVerificacao ? <> · conferida às {horaDe(doc.ultimaVerificacao)}</> : null}
              </span>
            ) : (
              <span>
                <b>Programação de {dataBr(data).slice(0, 5)}</b> ·{" "}
                {data > hoje
                  ? `em montagem — fecha às 23:59 e, a partir da meia-noite, cada atualização aparece aqui.${doc?.previa?.em ? ` Última leitura às ${horaDe(doc.previa.em)} · ${doc.previa.servicos} serviço(s).` : ""}`
                  : data === hoje
                    ? "guardando agora…"
                    : "não foi guardada (o sistema não estava aberto nesse dia)."}
              </span>
            )}
          </span>
        </div>
      </Card>

      {obsAberto && <OQueObservar config={config} onFechar={() => setObsAberto(false)} />}
      {regrasAbertas && <TabelaRegras config={config} onFechar={() => setRegrasAbertas(false)} />}

      {!foto && doc !== undefined ? (
        <Card>
          <EmptyState icon="clock" title={data > hoje ? `A programação de ${dataBr(data)} ainda não foi guardada.` : data === hoje ? "Guardando a programação de hoje…" : `Sem programação guardada de ${dataBr(data)}.`}>
            {data > hoje
              ? "A montagem de hoje não entra no auditor. À meia-noite a programação fecha e, a partir daí, cada atualização do dia é registrada com o custo antes e depois."
              : data === hoje
                ? "Leva alguns segundos (busca o Phoenix)."
                : "A programação só é guardada com alguém com acesso a Custos usando o sistema naquele dia."}
          </EmptyState>
        </Card>
      ) : suspeita ? (
        <div className="cst-faixa cst-faixa--alerta" role="alert">
          <Icon name="alert" size={16} />
          <span>O Phoenix devolveu bem menos serviços do que a programação tinha (resposta incompleta). O sistema não registrou nada desta conferência — tente “Atualizar” em instantes.</span>
        </div>
      ) : atual.estado === "erro" && atual.data === data ? (
        <div className="cst-faixa cst-faixa--alerta" role="alert">
          <Icon name="alert" size={16} /> <span>{atual.erro}</span>
        </div>
      ) : !rel ? (
        <Card>
          <p className="aud-carregando">
            <Icon name="loader" size={16} className="ui-spin" /> Comparando a foto com o Phoenix…
          </p>
        </Card>
      ) : (
        <>
          <KpiTiles
            items={[
              { key: "n", label: "Atualizações no dia", value: rel.alteracoes.length, hint: `desde a programação fechada · ${rel.totais.servicosFoto} → ${rel.totais.servicosAgora} serviço(s)`, icon: "listCheck" },
              { key: "mais", label: "Custo maior", value: sinal(rel.totais.aumentos), hint: `${nImpacto("mais")} atualização(ões) encareceram`, icon: "trendingUp", tone: rel.totais.aumentos > 0 ? "alert" : undefined },
              { key: "menos", label: "Custo enxugado", value: sinal(rel.totais.reducoes), hint: `${nImpacto("menos")} atualização(ões) economizaram`, icon: "trendingDown" },
              {
                key: "saldo",
                label: "Saldo do dia",
                value: sinal(rel.totais.impacto),
                hint: `programado ${formatarReais(rel.totais.totalFoto, { semCentavos: true })} → agora ${formatarReais(rel.totais.totalAgora, { semCentavos: true })}`,
                icon: "activity",
                tone: rel.totais.impacto > 0 ? "alert" : undefined,
              },
            ]}
          />

          {rel.alteracoes.length > 0 && (
            <div className="aud-filtros">
              <div className="aud-tipos" role="group" aria-label="Filtrar pelo custo">
                {[
                  ["", `Todas · ${rel.alteracoes.length}`],
                  ["mais", `Custo maior · ${nImpacto("mais")}`],
                  ["menos", `Custo enxugado · ${nImpacto("menos")}`],
                  ["zero", `Sem impacto · ${nImpacto("zero")}`],
                ].map(([v, r]) => (
                  <button key={v || "todas"} type="button" className={`${v ? `is-imp-${v}` : ""} ${filtroImpacto === v ? "is-on" : ""}`} onClick={() => setFiltroImpacto(v)}>
                    {r}
                  </button>
                ))}
              </div>
              {Object.keys(rel.totais.porClasse).length > 1 && (
                <select className="ui-input aud-filtro-classe" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} aria-label="Tipo de atualização">
                  <option value="">Todos os tipos</option>
                  {CLASSES_ATUALIZACAO.filter((c) => rel.totais.porClasse[c.id]).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome} · {rel.totais.porClasse[c.id].n}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {lista.length === 0 ? (
            <Card>
              <EmptyState icon="circleCheck" title={rel.alteracoes.length ? "Nenhuma atualização com esse filtro." : "Nenhuma atualização desde a programação fechada."}>
                {data === hoje ? "O sistema confere o Phoenix sozinho a cada 10 minutos." : ""}
              </EmptyState>
            </Card>
          ) : (
            <>
              <div className="aud-legenda" aria-label="Como ler">
                <span className="is-entrou"><i /> entrou</span>
                <span className="is-saiu"><i /> saiu</span>
                <span className="is-trocou"><i /> trocou</span>
                <span className="is-continua"><i /> continua</span>
                <span className="aud-legenda__dica">
                  <Icon name="info" size={12} /> comparado com a programação fechada à meia-noite
                </span>
              </div>
              <ul className="aud-ats">
                {lista.map((a) => {
                  const res = a.impacto > 0 ? "mais" : a.impacto < 0 ? "menos" : "zero";
                  const ultima = horaDasMudancas(a.mudancas.map((m) => m.id), a);
                  return (
                    <li key={a.id} className={`aud-at is-${res}`}>
                      <div className="aud-at__topo">
                        <span className={`aud-classe is-${a.classe}`}>
                          <Icon name={ICONE_CLASSE[a.classe] || "sliders"} size={14} /> {a.titulo}
                        </span>
                        <span className="aud-at__quando">
                          <Icon name="clock" size={13} /> <b className="tabular">{a.hora || "--:--"}</b>
                          <span className={`cst-tipo cst-tipo--${a.tipoServico}`}>{NOME_TIPO[a.tipoServico] || a.tipoServico}</span>
                          {a.servico ? <span className="aud-at__serv">{a.servico}</span> : null}
                        </span>
                        {ultima ? (
                          <span className="aud-at__ultima" title="Hora da última mudança deste grupo">
                            <Icon name="bell" size={12} /> {horaCurta(ultima)}
                          </span>
                        ) : null}
                        <span className={`aud-res is-${res}`}>
                          <Icon name={res === "mais" ? "trendingUp" : res === "menos" ? "trendingDown" : "minus"} size={14} />
                          {res === "mais" ? "Custo maior" : res === "menos" ? "Custo enxugado" : "Sem impacto"}
                        </span>
                      </div>

                      <p className="aud-at__frase">{fraseDaAtualizacao(a)}</p>

                      <div className="aud-at__meio">
                        <div className="aud-at__fluxo">
                          {[
                            ["Programado", a.antesLista, a.estadoAntes, a.paxAntes, a.totalAntes],
                            ["Agora", a.depoisLista, a.estadoDepois, a.paxDepois, a.totalDepois],
                          ].map(([rot, l, est, pax, tot], k) => (
                            <Fragment key={rot}>
                              {k === 1 && (
                                <span className="aud-at__seta" aria-hidden="true">
                                  <Icon name="arrowRight" size={16} />
                                </span>
                              )}
                              <div className={`aud-at__lado ${k ? "is-agora" : ""}`}>
                                <span className="aud-at__rot">
                                  {rot}
                                  {l.length ? <em>{pl(l.length, "veículo", "veículos")}</em> : null}
                                </span>
                                {l.length ? (
                                  <ul className="aud-veics">
                                    {l.map((x) => {
                                      const e = est?.[x.chave] || "continua";
                                      const cat = nomeCategoriaCurto(x.categoria);
                                      return (
                                        <li key={x.chave} className={`aud-veic is-${e}`}>
                                          <span className="aud-veic__ic" title={cat || "Sem categoria"}>
                                            <Icon name={ICONE_CATEGORIA[x.categoria] || "car"} size={15} />
                                          </span>
                                          <span className="aud-veic__nome">
                                            <b>{x.veiculo || "sem veículo"}</b>
                                            <small>
                                              {cat ? (
                                                <span className="aud-veic__cat">{cat}</span>
                                              ) : (
                                                <span className="aud-veic__cat is-sem" title="O Phoenix manda só o nome do veículo. A categoria vem do nome (VAN, SPIN, VOLARE…) ou do que for fixado no Custo do dia.">
                                                  sem categoria
                                                </span>
                                              )}
                                              {x.fornecedor ? <> · {x.fornecedor}</> : null}
                                            </small>
                                          </span>
                                          {e === "trocou" && (k ? a.noLugarDe?.[x.chave] : a.trocadoPor?.[x.chave]) ? (
                                            <span className="aud-veic__troca">
                                              <Icon name={k ? "undo" : "arrowRight"} size={12} />
                                              {k ? <>no lugar de <b>{a.noLugarDe[x.chave]}</b></> : <>trocado por <b>{a.trocadoPor[x.chave]}</b></>}
                                            </span>
                                          ) : e !== "continua" ? (
                                            <span className={`aud-veic__tag is-${e}`}>{ROTULO_ESTADO[e]}</span>
                                          ) : null}
                                        </li>
                                      );
                                    })}
                                  </ul>
                                ) : (
                                  <span className="aud-at__vazio">
                                    <Icon name={k ? "x" : "plus"} size={13} /> {k ? "saiu da escala" : "não estava na programação"}
                                  </span>
                                )}
                                <span className="aud-at__rodape">
                                  <span>
                                    <Icon name="users" size={13} /> {pax} pax
                                  </span>
                                  <span>
                                    <Icon name="coins" size={13} /> <b className="tabular">{formatarReais(tot)}</b>
                                  </span>
                                </span>
                              </div>
                            </Fragment>
                          ))}
                        </div>

                        <div className="aud-at__custo">
                          <span className="aud-at__custo-rot">Impacto no custo</span>
                          <b className="tabular">{a.impacto ? sinal(a.impacto) : formatarReais(0)}</b>
                          <small className="tabular">
                            {formatarReais(a.totalAntes, { semCentavos: true })} → {formatarReais(a.totalDepois, { semCentavos: true })}
                          </small>
                          {a.custoRegras ? <small className="aud-at__regra">inclui {formatarReais(a.custoRegras)} da tabela de alterações</small> : null}
                        </div>
                      </div>

                      {(() => {
                        const linhas = linhasDoQueMudou(a)
                          .map((l) => ({ ...l, quando: horaDasMudancas(l.ids, a) }))
                          .sort((x, y) => (x.quando?.getTime() || 0) - (y.quando?.getTime() || 0));
                        if (!linhas.length) return null;
                        return (
                          <div className="aud-linha">
                            <span className="aud-linha__tit">
                              <Icon name="history" size={13} /> O que mudou e quando
                            </span>
                            <ol>
                              {linhas.map((l, i) => (
                                <li key={i} className={l.tom ? `is-${l.tom}` : ""}>
                                  <time className="tabular">{horaCurta(l.quando) || "—"}</time>
                                  <span className="aud-linha__ic">
                                    <Icon name={l.icone} size={13} />
                                  </span>
                                  <span className="aud-linha__txt">{l.texto}</span>
                                </li>
                              ))}
                            </ol>
                          </div>
                        );
                      })()}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default AuditorAlteracoes;
