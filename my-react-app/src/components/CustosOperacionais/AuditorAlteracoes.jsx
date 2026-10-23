import { Fragment, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Button, Card, CardHeader, EmptyState, Icon, KpiTiles, Table, TableExpansion, TableHead, TableRow, useToast } from "../ui";
import { useAuth } from "../../Context/AuthContext";
import {
  CURTO_ALTERACAO,
  NOME_ALTERACAO,
  TIPOS_ALTERACAO,
  compararComFoto,
  normalizarAuditoria,
} from "../../Services/Services/auditoriaAlteracoes";
import { NOME_CATEGORIA, NOME_TIPO, formatarReais } from "../../Services/Services/custosCalculo";
import {
  calcularLinhasDoDia,
  chaveDaVista,
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
  "meia-noite": "guardada à meia-noite",
  atrasada: "guardada depois da meia-noite (ninguém estava com o sistema aberto na virada)",
  antecipada: "guardada antes do dia",
  manual: "guardada à mão",
  automatica: "guardada automaticamente",
  tardia: "guardada no próprio dia",
};

const textoMudanca = (m) => {
  if (m.tipo === "novo") return `entrou ${m.para || ""}`.trim();
  if (m.tipo === "cancelado") return `saiu ${m.de || ""}`.trim();
  if (m.tipo === "categoria") return `${NOME_CATEGORIA[m.de] || m.de} → ${NOME_CATEGORIA[m.para] || m.para}`;
  if (m.tipo === "horario") return `${m.de} → ${m.para} (${m.qtd > 0 ? "+" : ""}${m.qtd} min)`;
  if (m.tipo === "paxMais" || m.tipo === "paxMenos") return `${m.de} → ${m.para} pax`;
  return `${m.de || "—"} → ${m.para || "—"}`;
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
              <th>R$ por pax</th>
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

const AuditorAlteracoes = ({ config, pronto, vinculos, fornecedores }) => {
  const { perfil } = useAuth();
  const [data, setData] = useState(hojeIso);
  const [recarga, setRecarga] = useState(0);
  const [atual, setAtual] = useState({ chave: "", linhas: [], estado: "carregando", erro: "" });
  const [aud, setAud] = useState({ data: "", doc: undefined });
  const [filtroTipo, setFiltroTipo] = useState("");
  const [regrasAbertas, setRegrasAbertas] = useState(false);
  const [aberta, setAberta] = useState(null);
  const hoje = hojeIso();
  const chave = `${data}|${recarga}`;

  // programação guardada e histórico de alterações do dia (tempo real)
  useEffect(() => ouvirAuditoria(data, (doc) => setAud({ data, doc })), [data]);

  // o dia agora: Phoenix + tabela de tarifas
  useEffect(() => {
    if (!pronto) return undefined;
    let vivo = true;
    const ch = `${data}|${recarga}`;
    calcularLinhasDoDia(data, { config, vinculos, fornecedores })
      .then((linhas) => vivo && setAtual({ chave: ch, linhas, estado: "ok", erro: "" }))
      .catch((e) => vivo && setAtual({ chave: ch, linhas: [], estado: "erro", erro: e?.message || "O Phoenix não respondeu." }));
    return () => {
      vivo = false;
    };
  }, [data, recarga, pronto, config, vinculos, fornecedores]);

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
    rodarAuditoriaAutomatica(perfil, { config, vinculos, fornecedores }).catch((e) => console.error("Auditoria automática:", e));
  }, [pronto, data, hoje, perfil, config, vinculos, fornecedores]);

  const doc = aud.data === data ? aud.doc : undefined;
  const foto = doc?.foto || null;
  const carregando = doc === undefined || atual.chave !== chave;
  const rel = useMemo(() => (foto && atual.estado === "ok" ? compararComFoto(foto, atual.linhas, config.auditoria || normalizarAuditoria()) : null), [foto, atual, config.auditoria]);

  // o que aparecer de novo vai para o histórico (com a hora)
  useEffect(() => {
    if (!rel || !doc || data !== hoje) return;
    const hist = doc.historico || {};
    if (rel.alteracoes.some((a) => !hist[chaveDaVista(a.id)])) registrarNoHistorico(data, rel.alteracoes, hist).catch((e) => console.error("Histórico:", e));
  }, [rel, doc, data, hoje]);

  const lista = rel ? rel.alteracoes.filter((a) => !filtroTipo || a.mudancas.some((m) => m.tipo === filtroTipo)) : [];
  const historico = useMemo(() => doc?.historico || {}, [doc]);
  // hora em que a alteração apareceu (histórico; "vistas" é o formato antigo)
  const vistoEm = (id) => historico[chaveDaVista(id)]?.em || doc?.vistas?.[chaveDaVista(id)] || null;
  // alterações registradas que não estão mais assim (voltaram atrás ou mudaram de novo)
  const voltaram = useMemo(() => {
    if (!rel) return [];
    const atuais = new Set(rel.alteracoes.map((a) => chaveDaVista(a.id)));
    return Object.entries(historico)
      .filter(([k]) => !atuais.has(k))
      .map(([k, v]) => ({ k, ...v }))
      .sort((a, b) => (a.em?.toMillis?.() || 0) - (b.em?.toMillis?.() || 0));
  }, [rel, historico]);

  const baixarExcel = () => {
    if (!rel) return;
    const linhas = [
      [`Auditor de alterações · ${dataBr(data)}`],
      [`Programação: ${quando(foto.em)} (${ORIGEM[foto.origem] || foto.origem})`],
      [],
      ["Hora", "Tipo", "Serviço", "Veículo (programação)", "Veículo (agora)", "Alterações", "Custo programado", "Custo agora", "Diferença da tabela", "Custos das alterações", "Impacto", "Visto às"],
      ...rel.alteracoes.map((a) => [
        a.hora,
        NOME_TIPO[a.tipoServico] || a.tipoServico,
        a.servico,
        a.antes?.veiculo || "",
        a.depois?.veiculo || "",
        a.mudancas.map((m) => `${NOME_ALTERACAO[m.tipo]}: ${textoMudanca(m)}`).join(" | "),
        a.antes?.total ?? "",
        a.depois?.total ?? "",
        a.deltaTabela,
        a.custoRegras,
        a.impacto,
        horaDe(vistoEm(a.id)),
      ]),
      [],
      ["", "", "", "", "", "Total", rel.totais.totalFoto, rel.totais.totalAgora, rel.totais.deltaTabela, rel.totais.custoRegras, rel.totais.impacto],
      ...(voltaram.length
        ? [[], ["Alterações que voltaram atrás"], ...voltaram.map((v) => [v.hora, NOME_TIPO[v.tipoServico] || v.tipoServico, v.servico, v.veiculoAntes, v.veiculoDepois, (v.mudancas || []).map((m) => `${NOME_ALTERACAO[m.tipo]}: ${textoMudanca(m)}`).join(" | "), "", "", v.deltaTabela, v.custoRegras, v.impacto, horaDe(v.em)])]
        : []),
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), "Alterações");
    XLSX.writeFile(wb, `auditor-alteracoes-${data}.xlsx`);
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
            <Button size="sm" icon="refresh" onClick={() => setRecarga((x) => x + 1)} loading={carregando && !!foto} disabled={carregando}>
              Atualizar
            </Button>
            <Button size="sm" icon="download" onClick={baixarExcel} disabled={!rel}>
              Excel
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
                {doc?.ultimaVerificacao ? <> · conferida às {horaDe(doc.ultimaVerificacao)}</> : null}
              </span>
            ) : (
              <span>
                <b>Programação de {dataBr(data).slice(0, 5)}</b> ·{" "}
                {data > hoje ? "será guardada sozinha à meia-noite do dia." : data === hoje ? "guardando agora…" : "não foi guardada (o sistema não estava aberto nesse dia)."}
              </span>
            )}
          </span>
        </div>
      </Card>

      {regrasAbertas && <TabelaRegras config={config} onFechar={() => setRegrasAbertas(false)} />}

      {!foto && doc !== undefined ? (
        <Card>
          <EmptyState icon="clock" title={data > hoje ? `A programação de ${dataBr(data)} ainda não foi guardada.` : data === hoje ? "Guardando a programação de hoje…" : `Sem programação guardada de ${dataBr(data)}.`}>
            {data > hoje
              ? "À meia-noite o sistema guarda a programação do dia e, a partir daí, registra cada alteração."
              : data === hoje
                ? "Leva alguns segundos (busca o Phoenix)."
                : "A programação só é guardada com alguém com acesso a Custos usando o sistema naquele dia."}
          </EmptyState>
        </Card>
      ) : atual.estado === "erro" && atual.chave === chave ? (
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
              { key: "foto", label: "Custo programado", value: formatarReais(rel.totais.totalFoto, { semCentavos: true }), hint: `${rel.totais.servicosFoto} serviço(s) na virada do dia`, icon: "calendar" },
              { key: "agora", label: "Custo agora", value: formatarReais(rel.totais.totalAgora, { semCentavos: true }), hint: `${rel.totais.servicosAgora} serviço(s) no Phoenix`, icon: "coins" },
              {
                key: "imp",
                label: "Impacto das alterações",
                value: sinal(rel.totais.impacto),
                hint: `${sinal(rel.totais.aumentos)} de aumento · ${sinal(rel.totais.reducoes)} de redução`,
                icon: "activity",
                tone: rel.totais.impacto > 0 ? "alert" : undefined,
              },
              {
                key: "n",
                label: "Alterações",
                value: rel.alteracoes.length,
                hint: rel.totais.custoRegras ? `${formatarReais(rel.totais.custoRegras)} pela tabela de custos das alterações` : "serviços que mudaram desde a meia-noite",
                icon: "listCheck",
              },
            ]}
          />

          {Object.keys(rel.totais.porTipo).length > 0 && (
            <div className="aud-tipos" role="group" aria-label="Filtrar por tipo de alteração">
              <button type="button" className={!filtroTipo ? "is-on" : ""} onClick={() => setFiltroTipo("")}>
                Todas · {rel.alteracoes.length}
              </button>
              {TIPOS_ALTERACAO.filter((t) => rel.totais.porTipo[t.id]).map((t) => (
                <button key={t.id} type="button" className={`is-${t.id} ${filtroTipo === t.id ? "is-on" : ""}`} onClick={() => setFiltroTipo(filtroTipo === t.id ? "" : t.id)}>
                  {t.curto} · {rel.totais.porTipo[t.id].n}
                  {rel.totais.porTipo[t.id].custo ? <small> · {formatarReais(rel.totais.porTipo[t.id].custo, { semCentavos: true })}</small> : null}
                </button>
              ))}
            </div>
          )}

          {lista.length === 0 ? (
            <Card>
              <EmptyState icon="circleCheck" title={rel.alteracoes.length ? "Nenhuma alteração desse tipo." : "Nada mudou desde a programação da meia-noite."}>
                {data === hoje ? "O sistema confere o Phoenix sozinho a cada 10 minutos." : ""}
              </EmptyState>
            </Card>
          ) : (
            <Card className="aud-lista">
              <Table columns="20px 62px minmax(190px,1.3fr) minmax(220px,1.6fr) 110px 110px 116px 78px" minWidth={1000}>
                <TableHead>
                  <span />
                  <span>Hora</span>
                  <span>Serviço</span>
                  <span>O que mudou</span>
                  <span className="ui-cell-end">Programado</span>
                  <span className="ui-cell-end">Agora</span>
                  <span className="ui-cell-end">Impacto</span>
                  <span className="ui-cell-end">Visto às</span>
                </TableHead>
                {lista.map((a) => {
                  const ref = a.depois || a.antes;
                  const aberto = aberta === a.id;
                  return (
                    <Fragment key={a.id}>
                      <TableRow expandable expanded={aberto} onToggle={() => setAberta(aberto ? null : a.id)} className={a.impacto > 0 ? "aud-linha--mais" : a.impacto < 0 ? "aud-linha--menos" : ""}>
                        <span className="tabular aud-hora">{a.hora || "—"}</span>
                        <span>
                          <span className="ui-cell-main">
                            <span className={`cst-tipo cst-tipo--${a.tipoServico}`}>{NOME_TIPO[a.tipoServico] || a.tipoServico}</span> {ref.veiculo || "—"}
                          </span>
                          <span className="ui-cell-sub">
                            {[ref.fornecedor, ref.servicoNome].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <span className="aud-mudancas">
                          {a.mudancas.map((m) => (
                            <span key={m.tipo} className={`aud-mud is-${m.tipo}`} title={`${NOME_ALTERACAO[m.tipo]}${m.custo ? ` · ${formatarReais(m.custo)} pela tabela de custos` : ""}`}>
                              <b>{CURTO_ALTERACAO[m.tipo]}</b> {textoMudanca(m)}
                            </span>
                          ))}
                        </span>
                        <span className="ui-cell-end tabular">{a.antes ? formatarReais(a.antes.total, { semCentavos: true }) : "—"}</span>
                        <span className="ui-cell-end tabular">{a.depois ? formatarReais(a.depois.total, { semCentavos: true }) : "—"}</span>
                        <span className={`ui-cell-end tabular aud-impacto ${a.impacto > 0 ? "is-mais" : a.impacto < 0 ? "is-menos" : ""}`}>{sinal(a.impacto)}</span>
                        <span className="ui-cell-end tabular aud-visto">{horaDe(vistoEm(a.id)) || "agora"}</span>
                      </TableRow>
                      {aberto && (
                        <TableExpansion>
                          <div className="aud-detalhe">
                            <dl>
                              <div>
                                <dt>Diferença da tabela</dt>
                                <dd className="tabular">{sinal(a.deltaTabela)}</dd>
                              </div>
                              {a.mudancas
                                .filter((m) => m.custo)
                                .map((m) => (
                                  <div key={m.tipo}>
                                    <dt>{NOME_ALTERACAO[m.tipo]}</dt>
                                    <dd className="tabular">{sinal(m.custo)}</dd>
                                  </div>
                                ))}
                              <div className="is-total">
                                <dt>Impacto</dt>
                                <dd className="tabular">{sinal(a.impacto)}</dd>
                              </div>
                            </dl>
                            <div className="aud-detalhe__comp">
                              {[
                                ["Programado", a.antes],
                                ["Agora", a.depois],
                              ].map(([rot, l]) => (
                                <div key={rot}>
                                  <span>{rot}</span>
                                  {l ? (
                                    <>
                                      <b>
                                        {l.hora} · {l.veiculo || "—"}
                                      </b>
                                      <small>
                                        {[l.fornecedor, NOME_CATEGORIA[l.categoria] || l.categoria, l.motorista, l.guia ? `guia ${l.guia}` : "", `${l.pax} pax · ${l.reservas} reserva(s)`]
                                          .filter(Boolean)
                                          .join(" · ")}
                                      </small>
                                      <small>
                                        Fornecedor {formatarReais(l.valorFornecedor)} · guia {formatarReais(l.guiaValor)} · total {formatarReais(l.total)}
                                      </small>
                                    </>
                                  ) : (
                                    <em>{rot === "Programado" ? "não estava na programação" : "não está mais no Phoenix"}</em>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </TableExpansion>
                      )}
                    </Fragment>
                  );
                })}
              </Table>
            </Card>
          )}

          {voltaram.length > 0 && (
            <Card className="aud-voltaram">
              <CardHeader
                icon="refresh"
                title={`Voltaram atrás ou mudaram de novo (${voltaram.length})`}
                subtitle="Alterações que o sistema registrou durante o dia e que não estão mais assim no Phoenix. Não entram no impacto de agora."
              />
              <ul>
                {voltaram.map((v) => (
                  <li key={v.k}>
                    <time>{horaDe(v.em)}</time>
                    <span className={`cst-tipo cst-tipo--${v.tipoServico}`}>{NOME_TIPO[v.tipoServico] || v.tipoServico}</span>
                    <b>{v.hora}</b>
                    <span className="aud-voltaram__veic">{v.veiculoDepois || v.veiculoAntes || "—"}</span>
                    <span className="aud-mudancas">
                      {(v.mudancas || []).map((m) => (
                        <span key={m.tipo} className={`aud-mud is-${m.tipo}`}>
                          <b>{CURTO_ALTERACAO[m.tipo]}</b> {textoMudanca(m)}
                        </span>
                      ))}
                    </span>
                    <span className={`aud-impacto ${v.impacto > 0 ? "is-mais" : v.impacto < 0 ? "is-menos" : ""}`}>{sinal(v.impacto || 0)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default AuditorAlteracoes;
