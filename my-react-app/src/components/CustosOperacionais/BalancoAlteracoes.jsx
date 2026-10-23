import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Button, Card, CardHeader, EmptyState, Icon, KpiTiles } from "../ui";
import { CLASSES_ATUALIZACAO, TIPOS_ALTERACAO } from "../../Services/Services/auditoriaAlteracoes";
import { formatarReais } from "../../Services/Services/custosCalculo";
import { carregarBalanco } from "../../Services/Services/custosRepository";
import { CSS_IMPRESSAO, esc, imprimirHtml } from "../RelatorioTurnos/impressaoTurnos";

/* =========================================================
   BALANÇO DAS ALTERAÇÕES (período)
   Para cada dia com programação guardada, o auditor deixa um resumo:
   quantas alterações houve depois da programação e quanto elas
   aumentaram ou reduziram o custo. Aqui somamos o período escolhido.
   ========================================================= */

const isoDe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hojeIso = () => isoDe(new Date());
const somarDias = (iso, n) => {
  const [y, m, d] = iso.split("-").map(Number);
  return isoDe(new Date(y, m - 1, d + n, 12));
};
const dataBr = (iso = "") => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const diaSemana = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return DIAS[new Date(y, m - 1, d, 12).getDay()];
};
const datasEntre = (ini, fim) => {
  const out = [];
  for (let d = ini; d <= fim && out.length < 186; d = somarDias(d, 1)) out.push(d);
  return out;
};
const sinal = (v) => (v > 0 ? `+${formatarReais(v)}` : v < 0 ? `−${formatarReais(-v)}` : formatarReais(0));
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const PRESETS = [
  ["7d", "Últimos 7 dias", () => [somarDias(hojeIso(), -6), hojeIso()]],
  ["mes", "Este mês", () => [`${hojeIso().slice(0, 8)}01`, hojeIso()]],
  [
    "passado",
    "Mês passado",
    () => {
      const ini = `${somarDias(`${hojeIso().slice(0, 8)}01`, -1).slice(0, 8)}01`;
      return [ini, somarDias(`${hojeIso().slice(0, 8)}01`, -1)];
    },
  ],
];

// soma os resumos dos dias
const somarBalanco = (dias = []) => {
  const comResumo = dias.filter((d) => d.resumo);
  const t = { dias: dias.length, comResumo: comResumo.length, alteracoes: 0, mudancas: 0, comAumento: 0, comReducao: 0, aumentos: 0, reducoes: 0, impacto: 0, totalFoto: 0, totalAgora: 0, porTipo: {}, porClasse: {} };
  comResumo.forEach(({ resumo: r }) => {
    t.alteracoes += r.alteracoes || 0;
    t.mudancas += r.mudancas || 0;
    t.comAumento += r.comAumento || 0;
    t.comReducao += r.comReducao || 0;
    t.aumentos += r.aumentos || 0;
    t.reducoes += r.reducoes || 0;
    t.impacto += r.impacto || 0;
    t.totalFoto += r.totalFoto || 0;
    t.totalAgora += r.totalAgora || 0;
    Object.entries(r.porTipo || {}).forEach(([k, v]) => {
      t.porTipo[k] = t.porTipo[k] || { n: 0, custo: 0 };
      t.porTipo[k].n += v.n || 0;
      t.porTipo[k].custo += v.custo || 0;
    });
    Object.entries(r.porClasse || {}).forEach(([k, v]) => {
      t.porClasse[k] = t.porClasse[k] || { n: 0, impacto: 0 };
      t.porClasse[k].n += v.n || 0;
      t.porClasse[k].impacto = r2(t.porClasse[k].impacto + (v.impacto || 0));
    });
  });
  ["aumentos", "reducoes", "impacto", "totalFoto", "totalAgora"].forEach((k) => (t[k] = r2(t[k])));
  return t;
};

// "por tipo": pelas atualizações (Veículo a mais, Juntados…) com o saldo de
// cada uma; dias antigos (antes desse resumo) caem nos tipos de mudança
const linhasPorTipo = (t) =>
  Object.keys(t.porClasse).length
    ? CLASSES_ATUALIZACAO.filter((c) => t.porClasse[c.id]).map((c) => ({ id: c.id, nome: c.nome, n: t.porClasse[c.id].n, valor: t.porClasse[c.id].impacto, saldo: true }))
    : TIPOS_ALTERACAO.filter((x) => t.porTipo[x.id]).map((x) => ({ id: x.id, nome: x.nome, n: t.porTipo[x.id].n, valor: r2(t.porTipo[x.id].custo), saldo: false }));

const htmlBalanco = ({ ini, fim, dias, t }) => {
  const tipos = linhasPorTipo(t);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Balanço das atualizações ${esc(dataBr(ini))} a ${esc(dataBr(fim))}</title><style>${CSS_IMPRESSAO}
.mais { color: #b42318; font-weight: 700; } .menos { color: #067647; font-weight: 700; }
.kpis { grid-template-columns: repeat(5, 1fr); }
</style></head><body>
<div class="topo"><div><h1>Balanço das atualizações da programação</h1><p>${esc(dataBr(ini))} a ${esc(dataBr(fim))} · ${t.comResumo} dia(s) auditado(s)</p></div><div class="gerado">Gerado em ${esc(new Date().toLocaleString("pt-BR"))}</div></div>
<div class="kpis">
<div class="kpi"><span>Atualizações</span><b>${t.alteracoes}</b><small>${t.mudancas} mudança(s)</small></div>
<div class="kpi"><span>Custo maior</span><b class="mais">${esc(sinal(t.aumentos))}</b><small>${t.comAumento} atualização(ões)</small></div>
<div class="kpi"><span>Custo enxugado</span><b class="menos">${esc(sinal(t.reducoes))}</b><small>${t.comReducao} atualização(ões)</small></div>
<div class="kpi"><span>Saldo</span><b class="${t.impacto > 0 ? "mais" : t.impacto < 0 ? "menos" : ""}">${esc(sinal(t.impacto))}</b><small>aumentos + reduções</small></div>
<div class="kpi"><span>Custo programado → final</span><b>${esc(formatarReais(t.totalAgora, { semCentavos: true }))}</b><small>programado ${esc(formatarReais(t.totalFoto, { semCentavos: true }))}</small></div>
</div>
${
  tipos.length
    ? `<h2>Por tipo de atualização</h2><table><thead><tr><th class="e">Atualização</th><th>Quantidade</th><th>Impacto no custo</th></tr></thead><tbody>${tipos
        .map((x) => `<tr><td class="e">${esc(x.nome)}</td><td>${x.n}</td><td class="${x.valor > 0 ? "mais" : x.valor < 0 ? "menos" : ""}">${esc(x.saldo ? sinal(x.valor) : formatarReais(x.valor))}</td></tr>`)
        .join("")}</tbody></table>`
    : ""
}
<h2>Dia a dia</h2>
<table><thead><tr><th class="e">Dia</th><th>Serviços</th><th>Atualizações</th><th>Aumento</th><th>Redução</th><th>Saldo</th><th>Programado</th><th>Final</th></tr></thead><tbody>
${dias
  .map((d) =>
    d.resumo
      ? `<tr><td class="e">${esc(diaSemana(d.data))} ${esc(dataBr(d.data).slice(0, 5))}</td><td>${d.resumo.servicosFoto}</td><td>${d.resumo.alteracoes}</td><td class="mais">${d.resumo.aumentos ? esc(sinal(d.resumo.aumentos)) : "—"}</td><td class="menos">${d.resumo.reducoes ? esc(sinal(d.resumo.reducoes)) : "—"}</td><td>${esc(sinal(d.resumo.impacto))}</td><td>${esc(formatarReais(d.resumo.totalFoto, { semCentavos: true }))}</td><td>${esc(formatarReais(d.resumo.totalAgora, { semCentavos: true }))}</td></tr>`
      : `<tr><td class="e">${esc(diaSemana(d.data))} ${esc(dataBr(d.data).slice(0, 5))}</td><td>${d.foto.servicos}</td><td colspan="6" style="text-align:left;color:#57606a">ainda sem conferência</td></tr>`,
  )
  .join("")}
</tbody></table>
</body></html>`;
};

const BalancoAlteracoes = () => {
  const [periodo, setPeriodo] = useState(() => PRESETS[1][2]());
  const [ini, fim] = periodo;
  const chave = `${ini}|${fim}`;
  const [res, setRes] = useState({ chave: "", dias: [], erro: "" });

  useEffect(() => {
    if (!ini || !fim || ini > fim) return undefined;
    let vivo = true;
    carregarBalanco(datasEntre(ini, fim))
      .then((dias) => vivo && setRes({ chave, dias, erro: "" }))
      .catch((e) => vivo && setRes({ chave, dias: [], erro: e?.message || "Não foi possível ler o balanço." }));
    return () => {
      vivo = false;
    };
  }, [ini, fim, chave]);

  const carregando = res.chave !== chave;
  const dias = useMemo(() => (carregando ? [] : res.dias), [carregando, res.dias]);
  const t = useMemo(() => somarBalanco(dias), [dias]);
  const tipos = linhasPorTipo(t);
  const maiorDia = Math.max(1, ...dias.map((d) => Math.abs(d.resumo?.aumentos || 0) + Math.abs(d.resumo?.reducoes || 0)));

  const baixarExcel = () => {
    const linhas = [
      [`Balanço das atualizações · ${dataBr(ini)} a ${dataBr(fim)}`],
      [],
      ["Atualizações", t.alteracoes],
      ["Custo maior", t.aumentos, `${t.comAumento} atualização(ões)`],
      ["Custo enxugado", t.reducoes, `${t.comReducao} atualização(ões)`],
      ["Saldo", t.impacto],
      ["Custo programado", t.totalFoto],
      ["Custo final", t.totalAgora],
      [],
      ["Por tipo de atualização", "Quantidade", "Impacto no custo"],
      ...tipos.map((x) => [x.nome, x.n, x.valor]),
      [],
      ["Dia", "Serviços programados", "Atualizações", "Aumento", "Redução", "Saldo", "Custo programado", "Custo final"],
      ...dias.map((d) =>
        d.resumo
          ? [dataBr(d.data), d.resumo.servicosFoto, d.resumo.alteracoes, d.resumo.aumentos, d.resumo.reducoes, d.resumo.impacto, d.resumo.totalFoto, d.resumo.totalAgora]
          : [dataBr(d.data), d.foto.servicos, "ainda sem conferência"],
      ),
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), "Balanço");
    XLSX.writeFile(wb, `balanco-alteracoes-${ini}-a-${fim}.xlsx`);
  };

  return (
    <div className="bal-alt">
      <Card className="aud-barra">
        <div className="aud-barra__linha">
          <span className="bal-alt__periodo">
            <label>
              <span>De</span>
              <input type="date" className="ui-input" value={ini} max={fim} onChange={(e) => e.target.value && setPeriodo([e.target.value, fim])} />
            </label>
            <label>
              <span>até</span>
              <input type="date" className="ui-input" value={fim} min={ini} onChange={(e) => e.target.value && setPeriodo([ini, e.target.value])} />
            </label>
            <span className="bal-alt__presets">
              {PRESETS.map(([id, rot, f]) => {
                const [a, b] = f();
                return (
                  <button key={id} type="button" className={a === ini && b === fim ? "is-on" : ""} onClick={() => setPeriodo([a, b])}>
                    {rot}
                  </button>
                );
              })}
            </span>
          </span>
          <span className="aud-barra__acoes">
            <Button size="sm" icon="download" onClick={baixarExcel} disabled={carregando || !t.comResumo}>
              Excel
            </Button>
            <Button size="sm" icon="printer" onClick={() => imprimirHtml(htmlBalanco({ ini, fim, dias, t }))} disabled={carregando || !t.comResumo}>
              Imprimir / PDF
            </Button>
          </span>
        </div>
      </Card>

      {res.erro && !carregando ? (
        <div className="cst-faixa cst-faixa--alerta" role="alert">
          <Icon name="alert" size={16} /> <span>{res.erro}</span>
        </div>
      ) : carregando ? (
        <Card>
          <p className="aud-carregando">
            <Icon name="loader" size={16} className="ui-spin" /> Somando o período…
          </p>
        </Card>
      ) : !dias.length ? (
        <Card>
          <EmptyState icon="calendar" title="Nenhum dia auditado nesse período.">
            O balanço usa os dias em que a programação foi guardada (a partir da virada de cada dia).
          </EmptyState>
        </Card>
      ) : (
        <>
          <KpiTiles
            items={[
              { key: "n", label: "Atualizações", value: t.alteracoes, hint: `${t.comResumo} dia(s) auditado(s) · ${t.mudancas} mudança(s)`, icon: "listCheck" },
              { key: "mais", label: "Custo maior", value: sinal(t.aumentos), hint: `${t.comAumento} atualização(ões)`, icon: "trendingUp", tone: t.aumentos > 0 ? "alert" : undefined },
              { key: "menos", label: "Custo enxugado", value: sinal(t.reducoes), hint: `${t.comReducao} atualização(ões)`, icon: "trendingDown" },
              {
                key: "saldo",
                label: "Saldo do período",
                value: sinal(t.impacto),
                hint: `programado ${formatarReais(t.totalFoto, { semCentavos: true })} → final ${formatarReais(t.totalAgora, { semCentavos: true })}`,
                icon: "activity",
                tone: t.impacto > 0 ? "alert" : undefined,
              },
            ]}
          />

          {tipos.length > 0 && (
            <Card className="bal-alt__card">
              <CardHeader icon="listCheck" title="Por tipo de atualização" subtitle="Quantas vezes cada tipo aconteceu no período e quanto mexeu no custo." />
              <ul className="bal-alt__tipos">
                {[...tipos]
                  .sort((a, b) => b.n - a.n)
                  .map((x) => (
                    <li key={x.id}>
                      <span className="bal-alt__tipo-nome">{x.nome}</span>
                      <b className="tabular">{x.n}</b>
                      <span className={`tabular bal-alt__tipo-custo aud-impacto ${x.saldo && x.valor > 0 ? "is-mais" : x.saldo && x.valor < 0 ? "is-menos" : ""}`}>
                        {x.valor ? (x.saldo ? sinal(x.valor) : formatarReais(x.valor)) : "—"}
                      </span>
                    </li>
                  ))}
              </ul>
            </Card>
          )}

          <Card className="bal-alt__card">
            <CardHeader icon="calendar" title="Dia a dia" subtitle="Aumento (vermelho) e redução (verde) de cada dia em relação à programação guardada." />
            <div className="bal-alt__tabela">
              <table>
                <thead>
                  <tr>
                    <th className="e">Dia</th>
                    <th>Serviços</th>
                    <th>Atualizações</th>
                    <th className="e bal-alt__col-barra">Aumento × redução</th>
                    <th>Saldo</th>
                    <th>Programado</th>
                    <th>Final</th>
                  </tr>
                </thead>
                <tbody>
                  {dias.map((d) => {
                    const r = d.resumo;
                    return (
                      <tr key={d.data}>
                        <td className="e">
                          <b>{dataBr(d.data).slice(0, 5)}</b> <small>{diaSemana(d.data)}</small>
                        </td>
                        <td className="tabular">{r ? r.servicosFoto : d.foto.servicos}</td>
                        {r ? (
                          <>
                            <td className="tabular">{r.alteracoes || "—"}</td>
                            <td className="e bal-alt__col-barra">
                              <span className="bal-alt__barra" title={`${sinal(r.aumentos)} · ${sinal(r.reducoes)}`}>
                                <i className="is-menos" style={{ width: `${(Math.abs(r.reducoes) / maiorDia) * 50}%` }} />
                                <i className="is-mais" style={{ width: `${(Math.abs(r.aumentos) / maiorDia) * 50}%` }} />
                              </span>
                            </td>
                            <td className={`tabular aud-impacto ${r.impacto > 0 ? "is-mais" : r.impacto < 0 ? "is-menos" : ""}`}>{r.alteracoes ? sinal(r.impacto) : "—"}</td>
                            <td className="tabular">{formatarReais(r.totalFoto, { semCentavos: true })}</td>
                            <td className="tabular">{formatarReais(r.totalAgora, { semCentavos: true })}</td>
                          </>
                        ) : (
                          <td colSpan={5} className="e bal-alt__sem">
                            ainda sem conferência (abra o dia no auditor)
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
};

export default BalancoAlteracoes;
