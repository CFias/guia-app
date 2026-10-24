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
// ✓ recebeu (1ª etapa), carro embarcou (última)
const iconeEtapa = (k, n) => (k === 0 ? "check" : k === n - 1 ? "car" : "circleCheck");
const tomEtapa = (k, n) => (k === 0 ? "rec" : k === n - 1 ? "emb" : "meio");
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
      width={560}
      title="Relatório do colaborador"
      subtitle="Atendimento no aeroporto"
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
      <div className="rcb">
        <div className="rcb-cab">
          <span className="rcb-cab__avatar" style={{ background: pessoa.cor || "var(--accent)" }} aria-hidden="true">
            {String(pessoa.nome || "?").trim().charAt(0).toUpperCase()}
          </span>
          <span className="rcb-cab__txt">
            <b>{pessoa.nome}</b>
            <small>
              {pessoa.turnoNome && pessoa.turnoNome !== "—" ? `${pessoa.turnoNome} · ` : ""}
              {ini === fim ? dataBr(ini) : `${dataBr(ini)} a ${dataBr(fim)}`}
            </small>
          </span>
        </div>
        <div className="rcb-periodo">
          <Segmented size="sm" ariaLabel="Período do relatório" value={periodo} onChange={setPeriodo} options={PERIODOS.map(({ value, label }) => ({ value, label }))} />
        </div>
        {carga.erro && chave && <p className="rcb-vazio">{carga.erro}</p>}
        {!r ? (
          <p className="rcb-vazio">
            <Icon name="loader" size={16} className="ui-spin" /> Carregando…
          </p>
        ) : r.totalVeiculos === 0 && r.noShows.length === 0 ? (
          <p className="rcb-vazio">{pessoa.nome} não marcou nenhum atendimento neste período.</p>
        ) : (
          <>
            {/* o que fez, etapa por etapa */}
            <div className="rcb-etapas">
              {etapas.map((e, k) => {
                const v = r.etapas[e.id];
                return (
                  <div key={e.id} className={`rcb-etapa is-${tomEtapa(k, etapas.length)}`}>
                    <span className="rcb-etapa__ic">
                      <Icon name={iconeEtapa(k, etapas.length)} size={15} />
                    </span>
                    <span className="rcb-etapa__nome">{e.nome}</span>
                    <b className="rcb-etapa__num tabular">
                      {num(v.pax, 1)} <small>pax</small>
                    </b>
                    <span className="rcb-etapa__sub">
                      em {v.veiculos} veículo{v.veiculos === 1 ? "" : "s"} · {pct(v.pct)} do total
                    </span>
                    <span className="rcb-etapa__barra" aria-hidden="true">
                      <span style={{ width: `${Math.min(100, v.pct || 0)}%` }} />
                    </span>
                  </div>
                );
              })}
            </div>

            <dl className="rcb-fatos">
              {etapas.length > 1 && (
                <div>
                  <dt>Espera média</dt>
                  <dd className="tabular">{textoMinutos(r.esperaMedia)}</dd>
                </div>
              )}
              <div>
                <dt>Dias com atendimento</dt>
                <dd className="tabular">{r.dias.length}</dd>
              </div>
              <div>
                <dt>No shows informados</dt>
                <dd className="tabular">
                  {r.noShows.length}
                  {r.noShows.length > 0 && <small> · {r.noShows.filter((n) => n.tipo === "com_custo").length} com custo</small>}
                </dd>
              </div>
            </dl>

            {r.dias.length > 1 && (
              <section className="rcb-sec">
                <h4>Dia a dia</h4>
                <ul className="rcb-dias">
                  {r.dias.map((d) => (
                    <li key={d.data}>
                      <span className="rcb-dias__data tabular">{dataBr(d.data).slice(0, 5)}</span>
                      <span className="rcb-dias__trilho" aria-hidden="true">
                        <span style={{ width: `${((d.etapas[etapas[0].id]?.pax || 0) / maxDia) * 100}%`, background: pessoa.cor || "var(--accent)" }} />
                      </span>
                      <span className="rcb-dias__num tabular">{etapas.map((e) => num(d.etapas[e.id].pax, 1)).join(" / ")}</span>
                    </li>
                  ))}
                </ul>
                <small className="rcb-nota">pax por dia: {etapas.map((e) => e.nome.toLowerCase()).join(" / ")}</small>
              </section>
            )}

            {r.noShows.length > 0 && (
              <section className="rcb-sec">
                <h4>No shows informados ({r.noShows.length})</h4>
                <ul className="rcb-lista">
                  {r.noShows.map((n) => (
                    <li key={`${n.docId}-${n.chave}`} className="rcb-ns">
                      <span className="rcb-v__hora tabular">
                        {n.hora || "--:--"}
                        <small>{dataBr(n.data).slice(0, 5)}</small>
                      </span>
                      <span className="rcb-ns__txt">
                        <b>{n.titular || "Sem nome"}</b>
                        <small>
                          {n.codigo || "sem código"} · {n.pax} pax
                        </small>
                      </span>
                      <span className={`rcb-ns__tag is-${n.tipo}`}>{n.tipo === "com_custo" ? "Com custo" : "Sem custo"}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="rcb-sec">
              <h4>Veículos atendidos ({r.veiculos.length})</h4>
              <ul className="rcb-lista">
                {r.veiculos.map(({ doc, etapas: minhas, espera }, idx) => {
                  const novoDia = r.dias.length > 1 && (idx === 0 || r.veiculos[idx - 1].doc.data !== doc.data);
                  return (
                    <li key={doc.id} className="rcb-v">
                      {novoDia && <span className="rcb-v__dia">{dataBr(doc.data)}</span>}
                      <span className="rcb-v__hora tabular">{doc.hora || "--:--"}</span>
                      <div className="rcb-v__info">
                        <div className="rcb-v__linha">
                          <b>{doc.veiculo || "Sem veículo"}</b>
                          <span className="rcb-v__pax tabular">{doc.pax} pax</span>
                        </div>
                        <small className="rcb-v__voo">
                          <Icon name="planeLanding" size={12} /> {(doc.voos || []).join(", ") || "Sem voo"}
                        </small>
                        <div className="rcb-v__etapas">
                          {minhas.map((m) => {
                            const k = etapas.findIndex((x) => x.id === m.id);
                            const e = etapas[k];
                            return (
                              <span key={m.id} className={`rcb-chip is-${tomEtapa(k, etapas.length)}`}>
                                <Icon name={iconeEtapa(k, etapas.length)} size={11} />
                                {e?.nome} {horaDe(m.em)}
                                {m.lancado ? "*" : ""}
                                <i>
                                  {num(m.pax, 1)} pax{m.dividido ? " · dividido" : ""}
                                </i>
                              </span>
                            );
                          })}
                          {espera?.min !== null && espera?.min !== undefined && (
                            <span className="rcb-chip is-espera">
                              <Icon name="clock" size={11} /> espera {textoMinutos(espera.min)}
                            </span>
                          )}
                        </div>
                        {Array.isArray(doc.reservas) && doc.reservas.length > 0 && (
                          <small className="rcb-v__res">{doc.reservas.map((x) => `${x.titular || x.codigo} (${x.pax})`).join(" · ")}</small>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {r.veiculos.some((v) => v.etapas.some((m) => m.lancado)) && <small className="rcb-nota">* lançado pelo Operacional sem o horário da cartinha.</small>}
            </section>
          </>
        )}
      </div>
    </Drawer>
  );
};

export default RelatorioColaborador;
