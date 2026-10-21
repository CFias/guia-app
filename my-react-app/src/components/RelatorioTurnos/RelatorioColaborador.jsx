import { useEffect, useMemo, useState } from "react";
import { Button, Drawer, Icon, Segmented } from "../ui";
import { dataBr, isoLocal, num, somarDias } from "../../Services/Services/relatorioTurnos";
import { horaDe, listarAtendimentos, relatorioDoColaborador, textoMinutos } from "../../Services/Services/atendimentoAeroporto";
import { baixarExcelColaborador, imprimirColaborador } from "./impressaoAtendimento";

/* Relatório de UM colaborador do aeroporto: pax e veículos em cada etapa,
   % do total, espera média, dia a dia e todos os veículos que ele marcou
   (com horário). Período: o do filtro da aba ou um atalho próprio. */

const hoje = () => isoLocal(new Date());
const PERIODOS = [
  { value: "filtro", label: "Período do filtro" },
  {
    value: "mes",
    label: "Este mês",
    calc: () => {
      const d = new Date();
      return [isoLocal(new Date(d.getFullYear(), d.getMonth(), 1, 12)), hoje()];
    },
  },
  {
    value: "mesPassado",
    label: "Mês passado",
    calc: () => {
      const d = new Date();
      return [isoLocal(new Date(d.getFullYear(), d.getMonth() - 1, 1, 12)), isoLocal(new Date(d.getFullYear(), d.getMonth(), 0, 12))];
    },
  },
  { value: "90", label: "90 dias", calc: () => [somarDias(hoje(), -89), hoje()] },
];
const pct = (v) => `${num(v, v && v < 10 ? 1 : 0)}%`;

const RelatorioColaborador = ({ pessoa, docsFiltro, inicioFiltro, fimFiltro, etapas, regra, onClose }) => {
  const [periodo, setPeriodo] = useState("filtro");
  const [carga, setCarga] = useState({ chave: "", docs: [], erro: "" });
  const [ini, fim] = periodo === "filtro" ? [inicioFiltro, fimFiltro] : PERIODOS.find((p) => p.value === periodo).calc();
  const chave = periodo === "filtro" ? "" : `${ini}|${fim}`;

  useEffect(() => {
    if (!chave) return;
    let vivo = true;
    const [a, b] = chave.split("|");
    listarAtendimentos(a, b)
      .then((docs) => vivo && setCarga({ chave, docs, erro: "" }))
      .catch((e) => {
        console.error(e);
        if (vivo) setCarga({ chave, docs: [], erro: "Não foi possível carregar o período." });
      });
    return () => {
      vivo = false;
    };
  }, [chave]);

  const carregando = !!chave && carga.chave !== chave;
  const docs = chave ? carga.docs : docsFiltro;
  const r = useMemo(() => (carregando ? null : relatorioDoColaborador({ docs, etapas, regra, id: pessoa.id })), [carregando, docs, etapas, regra, pessoa.id]);
  const saida = r ? { pessoa, inicio: ini, fim, etapas, regra, r } : null;
  const maxDia = r ? Math.max(1, ...r.dias.map((d) => d.etapas[etapas[0]?.id]?.pax || 0)) : 1;

  return (
    <Drawer
      open
      onClose={onClose}
      width={620}
      title={`Relatório de ${pessoa.nome}`}
      subtitle={`${pessoa.turnoNome || "—"} · ${ini === fim ? dataBr(ini) : `${dataBr(ini)} a ${dataBr(fim)}`}`}
      footer={
        <>
          <Button icon="download" onClick={() => baixarExcelColaborador(saida)} disabled={!r}>
            Excel
          </Button>
          <Button variant="primary" icon="printer" onClick={() => imprimirColaborador(saida)} disabled={!r}>
            Imprimir / PDF
          </Button>
        </>
      }
    >
      <div className="rtn-colab">
        <Segmented size="sm" ariaLabel="Período do relatório" value={periodo} onChange={setPeriodo} options={PERIODOS.map(({ value, label }) => ({ value, label }))} />
        {carga.erro && chave && <p className="rtn-atd__vazio">{carga.erro}</p>}
        {!r ? (
          <p className="rtn-atd__vazio">
            <Icon name="loader" size={16} className="ui-spin" /> Carregando…
          </p>
        ) : r.totalVeiculos === 0 && r.noShows.length === 0 ? (
          <p className="rtn-atd__vazio">{pessoa.nome} não marcou nenhum atendimento neste período.</p>
        ) : (
          <>
            <div className="rtn-esp__kpis rtn-colab__kpis">
              {etapas.map((e) => (
                <div key={e.id}>
                  <b className="tabular">{num(r.etapas[e.id].pax, 1)}</b>
                  <span>
                    pax · {e.nome.toLowerCase()} em {r.etapas[e.id].veiculos} veíc. · {pct(r.etapas[e.id].pct)} do total
                  </span>
                </div>
              ))}
              {etapas.length > 1 && (
                <div>
                  <b className="tabular">{textoMinutos(r.esperaMedia)}</b>
                  <span>espera média dos veículos dele(a)</span>
                </div>
              )}
              <div>
                <b className="tabular">{r.dias.length}</b>
                <span>dia(s) com atendimento</span>
              </div>
              <div>
                <b className="tabular">{r.noShows.length}</b>
                <span>no show(s) informado(s) · {r.noShows.filter((n) => n.tipo === "com_custo").length} com custo</span>
              </div>
            </div>

            {r.dias.length > 1 && (
              <section className="rtn-colab__sec">
                <h4>Dia a dia</h4>
                <ul className="rtn-barras">
                  {r.dias.map((d) => (
                    <li key={d.data}>
                      <div className="rtn-barras__topo">
                        <span>{dataBr(d.data)}</span>
                        <b className="tabular">{etapas.map((e) => `${num(d.etapas[e.id].pax, 1)} ${e.nome.slice(0, 4).toLowerCase()}.`).join(" · ")}</b>
                      </div>
                      <div className="rtn-barras__trilho" aria-hidden="true">
                        <span style={{ width: `${((d.etapas[etapas[0].id]?.pax || 0) / maxDia) * 100}%`, background: pessoa.cor || "var(--accent)" }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {r.noShows.length > 0 && (
              <section className="rtn-colab__sec">
                <h4>No shows informados ({r.noShows.length})</h4>
                <ul className="rtn-colab__veic">
                  {r.noShows.map((n) => (
                    <li key={`${n.docId}-${n.chave}`}>
                      <div className="rtn-colab__veic-topo">
                        <b className="tabular">
                          {dataBr(n.data).slice(0, 5)} {n.hora || ""}
                        </b>
                        <span>
                          {n.titular || "Sem nome"} · {n.codigo || "sem código"} · {n.pax} pax
                        </span>
                        <span className={`rtn-ns-tag is-${n.tipo}`}>{n.tipo === "com_custo" ? "Com custo" : "Sem custo"}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="rtn-colab__sec">
              <h4>Veículos atendidos ({r.veiculos.length})</h4>
              <ul className="rtn-colab__veic">
                {r.veiculos.map(({ doc, etapas: minhas, espera }) => (
                  <li key={doc.id}>
                    <div className="rtn-colab__veic-topo">
                      <b className="tabular">
                        {r.dias.length > 1 ? `${dataBr(doc.data).slice(0, 5)} ` : ""}
                        {doc.hora || "--:--"}
                      </b>
                      <span>
                        {(doc.voos || []).join(", ") || "Sem voo"} · {doc.veiculo || "sem veículo"} · {doc.pax} pax
                      </span>
                    </div>
                    <div className="rtn-colab__tags">
                      {minhas.map((m) => {
                        const e = etapas.find((x) => x.id === m.id);
                        return (
                          <span key={m.id} className="rtn-colab__tag">
                            {e?.nome} {horaDe(m.em)}
                            {m.lancado ? "*" : ""} · {num(m.pax, 1)} pax{m.dividido ? " (dividido)" : ""}
                          </span>
                        );
                      })}
                      {espera?.min !== null && espera?.min !== undefined && <span className="rtn-colab__espera">espera {textoMinutos(espera.min)}</span>}
                    </div>
                    {Array.isArray(doc.reservas) && doc.reservas.length > 0 && (
                      <small className="rtn-colab__res">{doc.reservas.map((x) => `${x.titular || x.codigo} (${x.pax})`).join(" · ")}</small>
                    )}
                  </li>
                ))}
              </ul>
              {r.veiculos.some((v) => v.etapas.some((m) => m.lancado)) && <small className="rtn-colab__nota">* lançado pelo Operacional sem o horário da cartinha.</small>}
            </section>
          </>
        )}
      </div>
    </Drawer>
  );
};

export default RelatorioColaborador;
