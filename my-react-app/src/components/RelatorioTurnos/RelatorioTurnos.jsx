import { useEffect, useMemo, useState } from "react";
import { Button, Card, CardHeader, Drawer, EmptyState, Field, Icon, KpiTiles, PageHeader, Segmented, useToast } from "../ui";
import {
  DIAS_SEMANA_CURTO,
  TIPOS_SERVICO,
  buscarServicosPeriodo,
  calcularRelatorio,
  carregarConfigTurnos,
  carregarExcecoes,
  dataBr,
  detalharDia,
  funcoesQueRecebem,
  diaDaSemana,
  horaTexto,
  isoLocal,
  listarDatas,
  normalizarConfig,
  configPadraoDaRegiao,
  nomeTipo,
  num,
  salvarConfigTurnos,
  salvarExcecoes,
  somarDias,
  textoEscala,
} from "../../Services/Services/relatorioTurnos";
import { listarAtendimentos } from "../../Services/Services/atendimentoAeroporto";
import { baixarExcelTurnos, imprimirRelatorioTurnos, textoPico } from "./impressaoTurnos";
import AssistenteEscala from "./AssistenteEscala";
import EscalaEquipe from "./EscalaEquipe";
import AtendimentoRelatorio from "./AtendimentoRelatorio";
import { CalendarioCalor, SemanaHoraCalor } from "./MapaCalor";
import "./turnos.css";

/* Relatório "Demanda por turno" (pedido da gerência): quantas pessoas cada
   turno da equipe atende — chegadas, saídas, transfers e passeios do
   Phoenix — num período, com mapa de calor e detalhe por dia. Os turnos e
   a equipe são configuráveis ("Configurar escala" → AssistenteEscala). */

const MAX_DIAS = 93;
// a escala vem primeiro (é a que abre); a demanda fica por último
const VISOES = [
  { value: "escala", label: "Escala da equipe" },
  { value: "atendimento", label: "Atendimento no aeroporto" },
  { value: "demanda", label: "Demanda" },
];
const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0];

const ontem = () => somarDias(isoLocal(new Date()), -1);

const ATALHOS = [
  { value: "7", label: "7 dias", calc: () => [somarDias(ontem(), -6), ontem()] },
  { value: "30", label: "30 dias", calc: () => [somarDias(ontem(), -29), ontem()] },
  {
    value: "mesPassado",
    label: "Mês passado",
    calc: () => {
      const d = new Date();
      return [isoLocal(new Date(d.getFullYear(), d.getMonth() - 1, 1, 12)), isoLocal(new Date(d.getFullYear(), d.getMonth(), 0, 12))];
    },
  },
  {
    value: "mes",
    label: "Este mês",
    calc: () => {
      const d = new Date();
      const ini = isoLocal(new Date(d.getFullYear(), d.getMonth(), 1, 12));
      const fim = ontem();
      return [ini, fim < ini ? ini : fim];
    },
  },
  { value: "90", label: "90 dias", calc: () => [somarDias(ontem(), -89), ontem()] },
];

const rotuloGrupo = (ver) => (ver === "in" || ver === "out" ? "Voos" : ver === "todos" ? "Voos/serviços" : "Serviços");
const rotuloPessoas = (ver) => (ver === "in" ? "Pessoas recebidas" : "Pessoas atendidas");

const corDaHora = (h, turnos) => {
  const meio = h * 60 + 30;
  const t = turnos
    .filter((x) => !x.apoio)
    .find((x) => {
      const a = Number(x.inicio.slice(0, 2)) * 60 + Number(x.inicio.slice(3));
      const b = Number(x.fim.slice(0, 2)) * 60 + Number(x.fim.slice(3));
      return a <= b ? meio >= a && meio < b : meio >= a || meio < b;
    });
  return t?.cor || "var(--text-3)";
};

const GraficoHoras = ({ porHora, turnos }) => {
  const max = Math.max(1, ...porHora);
  const [foco, setFoco] = useState(null);
  return (
    <div className="rtn-horas">
      <div className="rtn-horas__barras" onMouseLeave={() => setFoco(null)}>
        {porHora.map((v, h) => (
          <button
            key={h}
            type="button"
            className={`rtn-horas__col ${foco === h ? "is-foco" : ""}`}
            onMouseEnter={() => setFoco(h)}
            onFocus={() => setFoco(h)}
            onBlur={() => setFoco(null)}
            aria-label={`${String(h).padStart(2, "0")}h: média de ${num(v)} pessoas`}
          >
            <span style={{ height: `${Math.max(1, (v / max) * 100)}%`, background: corDaHora(h, turnos) }} />
          </button>
        ))}
        {foco !== null && (
          <div className="rtn-horas__dica" style={{ left: `${((foco + 0.5) / 24) * 100}%` }} role="status">
            <b>
              {String(foco).padStart(2, "0")}h–{String(foco + 1).padStart(2, "0")}h
            </b>
            <span>{num(porHora[foco])} pessoas em média</span>
          </div>
        )}
      </div>
      <div className="rtn-horas__x" aria-hidden="true">
        {porHora.map((_, h) => (
          <span key={h}>{h % 2 === 0 ? String(h).padStart(2, "0") : ""}</span>
        ))}
      </div>
      <div className="rtn-legenda">
        {turnos
          .filter((t) => !t.apoio)
          .map((t) => (
            <span key={t.id}>
              <i style={{ background: t.cor }} />
              {t.nome} {horaTexto(t.inicio)}–{horaTexto(t.fim)}
            </span>
          ))}
      </div>
    </div>
  );
};

const Equipe = ({ t }) => (
  <ul className="rtn-equipe">
    {t.colaboradores.map((c) => (
      <li key={c.id} className={c.papel === "sinergia" ? "is-sinergia" : ""}>
        <b>{c.nome}</b>
        <span>
          {c.papel === "sinergia" ? "sinergia" : "principal"}
          {c.obs ? ` · ${c.obs}` : ""}
          {c.dias?.length || (c.escala?.modelo && c.escala.modelo !== "semanal") ? ` · ${textoEscala(c)}` : ""}
          {c.inicio && c.fim ? ` · ${horaTexto(c.inicio)}–${horaTexto(c.fim)}` : ""}
        </span>
      </li>
    ))}
    {!t.colaboradores.length && <li className="is-vazio">Sem colaboradores</li>}
  </ul>
);

// "Concierge" · "Concierge e Recepção" · "quem recebe"
const rotuloQuemRecebe = (recepcao) => {
  const n = recepcao?.nomesFuncoes || [];
  return n.length ? n.join(" e ") : "quem recebe";
};

const CartaoTurno = ({ t, grupo, recepcao }) => (
  <Card className={`rtn-turno ${t.apoio ? "is-apoio" : ""}`} style={{ "--c": t.cor }}>
    <div className="rtn-turno__topo">
      <h3>
        {t.nome}
        {t.apoio && <span className="rtn-tag">Janela de apoio</span>}
      </h3>
      <span>
        {horaTexto(t.inicio)} às {horaTexto(t.fim)}
      </span>
    </div>
    <Equipe t={t} />
    <div className="rtn-turno__media">
      <b className="tabular">{num(t.mediaPax)}</b>
      <span>pessoas por {t.apoio ? "dia nessa janela" : "turno"}, em média</span>
    </div>
    <dl className="rtn-turno__dados">
      {!t.apoio && recepcao?.porTurno[t.id]?.porPessoa != null && (
        <div title="Chegadas do turno ÷ quem recebe escalado no dia (folgas, trocas e coberturas contam), na média dos dias">
          <dt>Chegadas por {rotuloQuemRecebe(recepcao).toLowerCase()}</dt>
          <dd className="tabular">{num(recepcao.porTurno[t.id].porPessoa)}</dd>
        </div>
      )}
      {!t.apoio && recepcao?.porTurno[t.id]?.diasSemNinguem > 0 && (
        <div className="is-alerta">
          <dt>Dias sem {rotuloQuemRecebe(recepcao).toLowerCase()} na escala</dt>
          <dd className="tabular">{recepcao.porTurno[t.id].diasSemNinguem}</dd>
        </div>
      )}
      <div>
        <dt>Reservas por {t.apoio ? "dia" : "turno"}</dt>
        <dd className="tabular">{num(t.mediaReservas)}</dd>
      </div>
      <div>
        <dt>
          {grupo} por {t.apoio ? "dia" : "turno"}
        </dt>
        <dd className="tabular">{num(t.mediaGrupos)}</dd>
      </div>
      <div>
        <dt>Pessoas por hora</dt>
        <dd className="tabular">{num(t.paxPorHora)}</dd>
      </div>
      <div>
        <dt>Total no período</dt>
        <dd className="tabular">{t.totalPax.toLocaleString("pt-BR")}</dd>
      </div>
      <div>
        <dt>Dia mais cheio</dt>
        <dd>{textoPico(t.maior)}</dd>
      </div>
      <div>
        <dt>Dia mais vazio</dt>
        <dd>{textoPico(t.menor)}</dd>
      </div>
    </dl>
  </Card>
);

const Barras = ({ itens, max, cor }) => (
  <ul className="rtn-barras">
    {itens.map((i) => (
      <li key={i.chave}>
        <div className="rtn-barras__topo">
          <span>{i.nome}</span>
          <b className="tabular">{i.valor}</b>
        </div>
        <div className="rtn-barras__trilho" aria-hidden="true">
          <span style={{ width: `${max ? (i.valor / max) * 100 : 0}%`, background: i.cor || cor || "var(--accent)" }} />
        </div>
        {i.sub && <small>{i.sub}</small>}
      </li>
    ))}
  </ul>
);

const DetalheDia = ({ detalhe, onClose, grupo }) => {
  if (!detalhe) return null;
  const maxTurno = Math.max(1, ...detalhe.turnos.map((t) => t.pax));
  const maxHora = Math.max(1, ...detalhe.porHora);
  const tipos = Object.entries(detalhe.porTipo);
  return (
    <Drawer
      open
      onClose={onClose}
      width={480}
      title={`${DIAS_SEMANA_CURTO[diaDaSemana(detalhe.data)]} ${dataBr(detalhe.data)}`}
      subtitle={`${detalhe.pax} pessoas · ${detalhe.reservas} reservas`}
    >
      <div className="rtn-det">
        <section>
          <h4>Por turno</h4>
          <Barras
            max={maxTurno}
            itens={detalhe.turnos.map((t) => ({ chave: t.id, nome: `${t.nome} (${horaTexto(t.inicio)}–${horaTexto(t.fim)})`, valor: t.pax, cor: t.cor }))}
          />
        </section>
        <section>
          <h4>Por hora</h4>
          <div className="rtn-det__horas">
            {detalhe.porHora.map((v, h) => (
              <span key={h} title={`${String(h).padStart(2, "0")}h: ${v} pessoas`}>
                <i style={{ height: `${Math.max(v ? 4 : 1, (v / maxHora) * 100)}%` }} />
                <small>{h % 3 === 0 ? String(h).padStart(2, "0") : ""}</small>
              </span>
            ))}
          </div>
        </section>
        {tipos.length > 1 && (
          <section>
            <h4>Por tipo de serviço</h4>
            <Barras max={Math.max(...tipos.map((t) => t[1]))} itens={tipos.map(([k, v]) => ({ chave: k, nome: nomeTipo(k), valor: v }))} />
          </section>
        )}
        {detalhe.voos.length > 0 && (
          <section>
            <h4>Voos com mais pessoas</h4>
            <Barras
              max={detalhe.voos[0].pax}
              itens={detalhe.voos.slice(0, 10).map((v) => ({ chave: v.nome, nome: `${v.nome} · ${horaTexto(v.hora)}`, valor: v.pax, sub: `${v.reservas} reservas` }))}
            />
          </section>
        )}
        <section>
          <h4>{grupo === "Voos" ? "Serviços" : "Serviços com mais pessoas"}</h4>
          <Barras
            max={detalhe.servicos[0]?.pax || 1}
            itens={detalhe.servicos.slice(0, 12).map((s) => ({ chave: s.nome, nome: s.nome, valor: s.pax, sub: `${s.reservas} reservas · ${nomeTipo(s.tipo)}` }))}
          />
        </section>
      </div>
    </Drawer>
  );
};

/* Quem recebe os passageiros: a conta por pessoa da Demanda.
   Só as funções que recebem (ex.: Concierge) e pela escala real do dia;
   "Recebeu" sai das marcas de Recepcionei do painel do aeroporto. */
const QuemRecebe = ({ relatorio, config, onSalvarFuncoes, temChegadas }) => {
  const [salvando, setSalvando] = useState(false);
  const rec = relatorio.recepcao;
  const funcoes = config?.funcoes || [];
  const marcadas = new Set(funcoesQueRecebem(config).ids);
  const alternar = async (id) => {
    const nova = new Set(marcadas);
    if (nova.has(id)) nova.delete(id);
    else nova.add(id);
    setSalvando(true);
    try {
      await onSalvarFuncoes([...nova]);
    } finally {
      setSalvando(false);
    }
  };
  const rotulo = rotuloQuemRecebe(rec);
  const totalChegadas = rec?.totalChegadas ?? null;

  return (
    <Card>
      <CardHeader
        icon="users"
        title="Quem recebe os passageiros"
        subtitle="Só entra na conta quem recebe (não a equipe toda), pela escala real de cada dia. Recebeu = o que a pessoa marcou como Recepcionei no painel do aeroporto."
      />
      <div className="rtn-qr">
        <div className="rtn-qr__funcoes" role="group" aria-label="Funções que recebem os passageiros">
          <span className="rtn-tipos__rot">Funções que recebem</span>
          {funcoes.length ? (
            funcoes.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`rtn-chip ${marcadas.has(f.id) ? "is-on" : ""}`}
                aria-pressed={marcadas.has(f.id)}
                onClick={() => alternar(f.id)}
                disabled={salvando}
              >
                {marcadas.has(f.id) && <Icon name="check" size={12} />}
                {f.nome}
              </button>
            ))
          ) : (
            <small>Nenhuma função cadastrada. Crie “Concierge” em Configurar escala e marque quem é.</small>
          )}
          {rec?.automatico && marcadas.size > 0 && <small className="rtn-qr__auto">escolhidas pelo nome — toque para ajustar</small>}
        </div>

        {!temChegadas || !rec ? (
          <p className="rtn-qr__vazio">
            <Icon name="info" size={15} /> Inclua <b>Chegadas</b> nos serviços e gere de novo: a conta de quem recebe usa só as chegadas.
          </p>
        ) : !rec.linhas.length ? (
          <p className="rtn-qr__vazio">
            <Icon name="info" size={15} /> Ninguém com função que recebe estava na escala nesse período. Marque acima quais funções recebem os passageiros.
          </p>
        ) : (
          <>
            {!rec.temAtendimento && (
              <p className="rtn-qr__vazio">
                <Icon name="info" size={15} /> Sem marcas do painel do aeroporto nesse período: aparece só a parte esperada de cada um.
              </p>
            )}
            <div className="rtn-semana">
              <table className="rtn-colabs rtn-qr__tabela">
                <thead>
                  <tr>
                    <th>{rotulo}</th>
                    <th>Turno</th>
                    <th title="Dias em que estava na escala real (com folgas, trocas e coberturas)">Dias na escala</th>
                    <th title="Chegadas do turno dele, na média dos dias em que trabalhou">Chegadas do turno/dia</th>
                    <th title="Chegadas do turno ÷ quantos recebiam no dia">Parte esperada/dia</th>
                    {rec.temAtendimento && <th>Recebeu/dia</th>}
                    {rec.temAtendimento && <th>Recebeu no período</th>}
                    {rec.temAtendimento && <th>Do esperado</th>}
                  </tr>
                </thead>
                <tbody>
                  {rec.linhas.map((l) => {
                    const p = l.pctDoEsperado;
                    return (
                      <tr key={l.id}>
                        <td>
                          <b>{l.nome}</b>
                          {l.funcaoNome && <small> · {l.funcaoNome}</small>}
                          {l.foraDaEscala ? (
                            <small className="rtn-qr__fora" title="Marcou a recepção num dia em que não estava na escala">
                              {" "}
                              · fora da escala em {l.foraDaEscala} dia(s)
                            </small>
                          ) : null}
                        </td>
                        <td>
                          <i className="rtn-dot" style={{ background: l.cor }} />
                          {l.turnoNome}
                        </td>
                        <td className="tabular">{l.diasEscalado || "—"}</td>
                        <td className="tabular">{l.diasEscalado ? num(l.mediaDemanda) : "—"}</td>
                        <td className="tabular">
                          <b>{l.diasEscalado ? num(l.mediaEsperado) : "—"}</b>
                        </td>
                        {rec.temAtendimento && <td className="tabular">{num(l.mediaRecebido)}</td>}
                        {rec.temAtendimento && <td className="tabular">{Math.round(l.recebido).toLocaleString("pt-BR")}</td>}
                        {rec.temAtendimento && (
                          <td>
                            {p === null ? (
                              "—"
                            ) : (
                              <span className="rtn-qr__pct">
                                <span className="rtn-qr__trilho" aria-hidden="true">
                                  <i style={{ width: `${Math.min(100, p)}%` }} />
                                </span>
                                <b className="tabular">{num(p, 0)}%</b>
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {rec.temAtendimento && totalChegadas !== null && (
              <p className="rtn-folg">
                <b>{Math.round(rec.totalRecebido).toLocaleString("pt-BR")}</b> de {totalChegadas.toLocaleString("pt-BR")} pessoas que chegaram tiveram a
                recepção marcada no painel.
              </p>
            )}
          </>
        )}
        {rec?.foraDaConta?.length > 0 && (
          <p className="rtn-folg">
            <b>Fora da conta</b> (não recebem passageiros): {rec.foraDaConta.map((c) => `${c.nome} (${c.funcaoNome})`).join(", ")}.
          </p>
        )}
      </div>
    </Card>
  );
};

const RelatorioTurnos = () => {
  const { mostrarToast } = useToast();
  const [config, setConfig] = useState(null);
  const [excecoes, setExcecoes] = useState({ dias: {} });
  const [excecoesLidas, setExcecoesLidas] = useState(false);
  const [visao, setVisao] = useState("escala");
  const [configAberta, setConfigAberta] = useState(false);
  const [atalho, setAtalho] = useState("mesPassado");
  const [periodo, setPeriodo] = useState(() => ATALHOS.find((a) => a.value === "mesPassado").calc());
  const [tiposBusca, setTiposBusca] = useState(["in"]);
  const [carregando, setCarregando] = useState(null); // { feitas, total }
  const [dados, setDados] = useState(null); // { registros, falhas, inicio, fim, tipos }
  const [ver, setVer] = useState("todos");
  const [diaSel, setDiaSel] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let vivo = true;
    carregarConfigTurnos()
      .then((c) => vivo && setConfig(c))
      .catch((e) => {
        console.error(e);
        if (vivo) setConfig(normalizarConfig(configPadraoDaRegiao()));
      });
    carregarExcecoes()
      .then((x) => {
        if (!vivo) return;
        setExcecoes(x);
        setExcecoesLidas(true);
      })
      .catch((e) => console.error("Erro ao ler as exceções da escala:", e));
    return () => {
      vivo = false;
    };
  }, []);

  const [inicio, fim] = periodo;
  const nDias = listarDatas(inicio, fim).length;
  const grande = nDias > MAX_DIAS;

  const tiposCarregados = dados?.tipos || [];
  const verEfetivo = tiposCarregados.length === 1 ? tiposCarregados[0] : tiposCarregados.includes(ver) ? ver : "todos";

  const relatorio = useMemo(() => {
    if (!dados || !config) return null;
    const registros = verEfetivo === "todos" ? dados.registros : dados.registros.filter((r) => r.tipo === verEfetivo);
    const chegadas = dados.tipos.includes("in") ? dados.registros.filter((r) => r.tipo === "in") : null;
    return calcularRelatorio({ registros, inicio: dados.inicio, fim: dados.fim, config, excecoes, atendimentos: dados.atendimentos, chegadas });
  }, [dados, config, verEfetivo, excecoes]);

  const totaisPorTipo = useMemo(() => {
    const m = {};
    (dados?.registros || []).forEach((r) => {
      if (r.data >= dados.inicio && r.data <= dados.fim) m[r.tipo] = (m[r.tipo] || 0) + r.pax;
    });
    return m;
  }, [dados]);

  const detalhe = useMemo(() => (relatorio && diaSel ? detalharDia(relatorio, diaSel) : null), [relatorio, diaSel]);

  const escolherAtalho = (valor) => {
    setAtalho(valor);
    setPeriodo(ATALHOS.find((a) => a.value === valor).calc());
  };

  const mudarData = (qual) => (e) => {
    const v = e.target.value;
    if (!v) return;
    setAtalho("");
    setPeriodo((p) => (qual === 0 ? [v, p[1] < v ? v : p[1]] : [p[0] > v ? v : p[0], v]));
  };

  const alternarTipo = (id) =>
    setTiposBusca((atual) => (atual.includes(id) ? (atual.length > 1 ? atual.filter((x) => x !== id) : atual) : [...atual, id]));

  const gerar = async () => {
    if (!nDias || grande) return;
    setErro("");
    const tipos = TIPOS_SERVICO.map((t) => t.id).filter((id) => tiposBusca.includes(id));
    setCarregando({ feitas: 0, total: (nDias + 1) * tipos.length });
    try {
      // marcas do painel do aeroporto: quem recebeu de fato (falha não impede o relatório)
      const atend = config?.atendimento?.ativo === false ? Promise.resolve(null) : listarAtendimentos(inicio, fim).catch((e) => (console.error("Atendimentos:", e), null));
      const [r, atendimentos] = await Promise.all([buscarServicosPeriodo(inicio, fim, tipos, (feitas, total) => setCarregando({ feitas, total })), atend]);
      setDados({ ...r, inicio, fim, tipos, atendimentos });
      setVer(tipos.length === 1 ? tipos[0] : "todos");
      setDiaSel(null);
    } catch (e) {
      console.error(e);
      setErro("Não foi possível buscar os serviços no Phoenix. Tente de novo em instantes.");
    } finally {
      setCarregando(null);
    }
  };

  // Escala da equipe → tirar alguém da equipe (sai do turno ou dos folguistas)
  const removerDaEquipe = async (c) => {
    const nova = {
      ...config,
      turnos: config.turnos.map((t) => ({ ...t, colaboradores: t.colaboradores.filter((x) => x.id !== c.id) })),
      folguistas: (config.folguistas || []).filter((f) => f.id !== c.id),
    };
    setConfig(await salvarConfigTurnos(nova));
  };

  const salvarConfig = async (nova) => {
    const salva = await salvarConfigTurnos(nova);
    setConfig(salva);
    setConfigAberta(false);
    mostrarToast("Escala salva");
  };

  // relatório de recebimento: quem fica de fora (salvo na configuração, vale para todos)
  const salvarOcultos = async (ocultos) => {
    const salva = await salvarConfigTurnos({ ...config, atendimento: { ...config.atendimento, ocultos } });
    setConfig(salva);
    return salva;
  };

  // Demanda → quais funções recebem os passageiros (vale para todos)
  const salvarFuncoesRecepcao = async (ids) => {
    const salva = await salvarConfigTurnos({ ...config, atendimento: { ...config.atendimento, funcoesRecepcao: ids } });
    setConfig(salva);
  };

  const salvarEscala = async (novas) => {
    const salvas = await salvarExcecoes(novas);
    setExcecoes(salvas);
    mostrarToast("Escala salva");
    return salvas;
  };

  const desatualizado = relatorio && (relatorio.inicio !== inicio || relatorio.fim !== fim);
  const principais = relatorio ? relatorio.turnos.filter((t) => !t.apoio) : [];
  const maisMov = principais.length ? [...principais].sort((a, b) => b.mediaPax - a.mediaPax)[0] : null;
  const grupo = rotuloGrupo(verEfetivo);
  const tituloVer = verEfetivo === "todos" ? tiposCarregados.map((t) => nomeTipo(t)).join(", ") : nomeTipo(verEfetivo);
  const dadosImpressao = relatorio ? { ...relatorio, tituloServicos: tituloVer, grupo, rotuloPessoas: rotuloPessoas(verEfetivo) } : null;

  return (
    <div className="rtn">
      <PageHeader
        title="Demanda por turno"
        description="Quantas pessoas cada turno atende — chegadas, saídas, transfers e passeios do Phoenix —, a escala da equipe e quem recepcionou e embarcou no aeroporto."
        actions={
          <>
            <Button icon="users" onClick={() => setConfigAberta(true)} disabled={!config}>
              Configurar escala
            </Button>
            {visao === "demanda" && (
              <Button variant="primary" icon="printer" onClick={() => imprimirRelatorioTurnos(dadosImpressao)} disabled={!relatorio || desatualizado}>
                Imprimir / PDF
              </Button>
            )}
          </>
        }
        more={
          visao === "demanda"
            ? [
                {
                  label: "Exportar Excel",
                  icon: "download",
                  onClick: () => baixarExcelTurnos(dadosImpressao),
                  disabled: !relatorio || desatualizado,
                },
              ]
            : undefined
        }
      />

      <div className="rtn-visoes">
        <Segmented ariaLabel="Visão" value={visao} onChange={setVisao} options={VISOES} />
      </div>

      {visao === "escala" &&
        (config ? (
          <EscalaEquipe
            key={excecoesLidas ? "lida" : "lendo"}
            config={config}
            excecoes={excecoes}
            onSalvar={salvarEscala}
            onRemoverDaEquipe={removerDaEquipe}
            onConfigurar={() => setConfigAberta(true)}
          />
        ) : (
          <p className="rtn-atd__carregando">
            <Icon name="loader" size={16} className="ui-spin" /> Carregando a equipe…
          </p>
        ))}

      {visao === "atendimento" &&
        (config ? (
          <AtendimentoRelatorio config={config} excecoes={excecoes} onSalvarOcultos={salvarOcultos} />
        ) : (
          <p className="rtn-atd__carregando">
            <Icon name="loader" size={16} className="ui-spin" /> Carregando a equipe…
          </p>
        ))}

      {visao === "demanda" && (
      <>

      <Card className="rtn-filtro">
        <div className="rtn-filtro__linha">
          <Segmented size="sm" ariaLabel="Período" value={atalho} onChange={escolherAtalho} options={ATALHOS} />
          <div className="rtn-filtro__datas">
            <Field label="De">
              <input type="date" className="ui-input" value={inicio} onChange={mudarData(0)} />
            </Field>
            <Field label="Até">
              <input type="date" className="ui-input" value={fim} onChange={mudarData(1)} />
            </Field>
          </div>
        </div>
        <div className="rtn-filtro__linha">
          <div className="rtn-tipos" role="group" aria-label="Serviços do relatório">
            <span className="rtn-tipos__rot">Serviços</span>
            {TIPOS_SERVICO.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`rtn-chip ${tiposBusca.includes(t.id) ? "is-on" : ""}`}
                aria-pressed={tiposBusca.includes(t.id)}
                onClick={() => alternarTipo(t.id)}
              >
                {tiposBusca.includes(t.id) && <Icon name="check" size={12} />}
                {t.nome}
              </button>
            ))}
          </div>
          <Button
            variant="primary"
            icon="search"
            onClick={gerar}
            loading={!!carregando}
            disabled={!!carregando || grande || !nDias || !config}
            className="rtn-filtro__gerar"
          >
            {carregando ? `Buscando ${Math.round((carregando.feitas / carregando.total) * 100)}%…` : "Gerar relatório"}
          </Button>
        </div>
        {grande && <p className="rtn-aviso">Escolha até {MAX_DIAS} dias.</p>}
        {carregando && (
          <div className="rtn-progresso" aria-hidden="true">
            <span style={{ width: `${(carregando.feitas / carregando.total) * 100}%` }} />
          </div>
        )}
      </Card>

      {erro && (
        <div className="rtn-faixa rtn-faixa--erro" role="alert">
          <Icon name="alert" size={16} /> {erro}
        </div>
      )}

      {!relatorio && !carregando && (
        <EmptyState icon="clock" title="Escolha o período e os serviços e clique em Gerar relatório">
          O sistema busca no Phoenix os serviços de cada dia e calcula quantas pessoas cada turno da equipe atende, com o mapa de calor do período. Os turnos
          e a equipe ficam em “Configurar escala”.
        </EmptyState>
      )}

      {relatorio && (
        <>
          {desatualizado && (
            <div className="rtn-faixa" role="status">
              <Icon name="info" size={16} /> Os números abaixo são de {dataBr(relatorio.inicio)} a {dataBr(relatorio.fim)}. Clique em Gerar relatório para o
              período novo.
            </div>
          )}
          {dados.falhas.length > 0 && (
            <div className="rtn-faixa rtn-faixa--aviso" role="status">
              <Icon name="alert" size={16} /> O Phoenix não respondeu em {dados.falhas.length} dia(s) ({dados.falhas.map((d) => dataBr(d).slice(0, 5)).join(", ")}). Esses
              dias ficaram incompletos — gere de novo para completar.
            </div>
          )}

          {tiposCarregados.length > 1 && (
            <div className="rtn-ver">
              <span>Mostrar</span>
              <Segmented
                size="sm"
                ariaLabel="Tipo de serviço"
                value={verEfetivo}
                onChange={(v) => {
                  setVer(v);
                  setDiaSel(null);
                }}
                options={[
                  { value: "todos", label: "Todos", count: Object.values(totaisPorTipo).reduce((a, b) => a + b, 0) },
                  ...tiposCarregados.map((id) => ({ value: id, label: TIPOS_SERVICO.find((t) => t.id === id).curto, count: totaisPorTipo[id] || 0 })),
                ]}
              />
            </div>
          )}

          <KpiTiles
            items={[
              {
                key: "total",
                label: rotuloPessoas(verEfetivo),
                value: relatorio.totalPax.toLocaleString("pt-BR"),
                hint: `${relatorio.totalReservas.toLocaleString("pt-BR")} reservas · ${relatorio.nDias} dias`,
                icon: verEfetivo === "in" ? "planeLanding" : verEfetivo === "out" ? "planeTakeoff" : "users",
              },
              { key: "dia", label: "Média por dia", value: num(relatorio.mediaPaxDia), hint: tituloVer, icon: "calendar" },
              {
                key: "mov",
                label: "Turno mais movimentado",
                value: maisMov?.nome || "—",
                hint: maisMov ? `${num(maisMov.mediaPax)} pessoas por turno` : "",
                icon: "trendingUp",
              },
              {
                key: "troca",
                label: "Na troca de turno",
                value: num(relatorio.troca.mediaPax),
                hint: "pessoas por dia, contam nos dois turnos",
                icon: "clock",
              },
            ]}
          />

          <div className="rtn-turnos">
            {relatorio.turnos.map((t) => (
              <CartaoTurno key={t.id} t={t} grupo={grupo} recepcao={relatorio.recepcao} />
            ))}
          </div>

          <Card>
            <CardHeader
              icon="calendar"
              title="Mapa de calor do período"
              subtitle={`${rotuloPessoas(verEfetivo)} por dia (${tituloVer}). Quanto mais escuro, maior a demanda. Clique num dia para ver o detalhe.`}
            />
            <CalendarioCalor calendario={relatorio.calendario} selecionado={diaSel} onEscolher={setDiaSel} />
          </Card>

          <div className="rtn-grade">
            <Card>
              <CardHeader icon="grid" title="Dia da semana × hora" subtitle="Média de pessoas em cada hora. Mostra os horários de pico da semana." />
              <SemanaHoraCalor semanaHora={relatorio.semanaHora} />
            </Card>
            <Card>
              <CardHeader icon="barChart" title="Ao longo do dia" subtitle="Média de pessoas por hora, na cor do turno que está trabalhando." />
              <GraficoHoras porHora={relatorio.porHora} turnos={relatorio.turnos} />
            </Card>
          </div>

          <Card>
            <CardHeader icon="calendarCheck" title="Por dia da semana" subtitle="Média de pessoas por turno. Em negrito, o dia mais cheio de cada turno." />
            <div className="rtn-semana">
              <table>
                <thead>
                  <tr>
                    <th>Turno</th>
                    {ORDEM_SEMANA.map((w) => (
                      <th key={w}>{DIAS_SEMANA_CURTO[w]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {relatorio.turnos.map((t) => {
                    const vals = ORDEM_SEMANA.map((w) => t.semana[w]);
                    const max = Math.max(...vals.filter((v) => v !== null));
                    return (
                      <tr key={t.id}>
                        <td>
                          <i className="rtn-dot" style={{ background: t.cor }} />
                          {t.nome}
                          {t.apoio && <small className="rtn-semana__apoio"> apoio</small>}
                        </td>
                        {vals.map((v, i) => (
                          <td key={i} className={`tabular ${v !== null && v === max && v > 0 ? "is-max" : ""}`}>
                            {v === null ? "—" : num(v)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <QuemRecebe relatorio={relatorio} config={config} onSalvarFuncoes={salvarFuncoesRecepcao} temChegadas={tiposCarregados.includes("in")} />

          <Card className="rtn-notas">
            <p className="rtn-notas__como">
              Como é calculado: pessoas = adultos + crianças + bebês de cada reserva do Phoenix ({tituloVer}). Nas chegadas vale o horário do voo
              {relatorio.pelaApresentacao ? ` (${relatorio.pelaApresentacao} reservas sem horário de voo usaram a apresentação)` : ""}; nos demais serviços, a
              apresentação. Reservas com CLD, cancelado, não escalar ou dispensado não contam. Quem chega quando dois turnos se sobrepõem conta para os dois. Turno
              que passa da meia-noite é contado pelo dia em que começa (um voo às 02h do dia 15 é do turno da noite do dia 14). A conta por pessoa usa só as
              chegadas e só quem recebe os passageiros ({rotuloQuemRecebe(relatorio.recepcao)}), pela escala real de cada dia — folgas, trocas, coberturas e
              folguistas da Escala da equipe. "Recebeu" vem das marcas de Recepcionei no painel do aeroporto.
            </p>
          </Card>
        </>
      )}

      </>
      )}

      {configAberta && config && <AssistenteEscala config={config} onClose={() => setConfigAberta(false)} onSalvar={salvarConfig} />}
      <DetalheDia detalhe={detalhe} onClose={() => setDiaSel(null)} grupo={grupo} />
    </div>
  );
};

export default RelatorioTurnos;
