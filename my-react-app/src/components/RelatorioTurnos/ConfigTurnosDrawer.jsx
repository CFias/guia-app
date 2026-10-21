import { useEffect, useState } from "react";
import { Button, Drawer, Icon } from "../ui";
import {
  configPadraoDaRegiao,
  CORES_TURNO,
  DIAS_SEMANA_CURTO,
  ETAPAS_PADRAO,
  MODELOS_ESCALA,
  PAPEIS,
  carregarContasAtendimento,
  dataBr,
  isoLocal,
  normalizarConfig,
  normalizarEscala,
  somarDias,
  trabalhaPeloModelo,
  novoId,
  validarConfig,
} from "../../Services/Services/relatorioTurnos";
import { ehSede } from "../../Services/Services/regiaoAtiva";

/* Painel "Turnos e equipe": cria/edita os turnos (nome, horário, cor) e os
   colaboradores de cada um — papel no setor (função principal ou suporte em
   sinergia), modelo de escala (dias da semana, 12x36, 24x48, 2x2 ou ciclo),
   horário próprio quando diferente do turno — e as regras do painel do
   aeroporto (etapas que cada um marca e como os pax são contados). */

const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0];

const novoColaborador = () => ({ id: novoId(), nome: "", papel: "principal", dias: [], inicio: "", fim: "", obs: "" });

const hojeIso = () => isoLocal(new Date());

// os próximos 14 dias, para conferir o ciclo (12x36, 2x2…)
const ProximosDias = ({ c }) => {
  const hoje = hojeIso();
  const dias = Array.from({ length: 14 }, (_, i) => somarDias(hoje, i));
  return (
    <div className="rtc-ciclo" aria-label="Próximos 14 dias">
      {dias.map((d) => {
        const sim = trabalhaPeloModelo(c, d);
        return (
          <span key={d} className={sim ? "is-on" : ""} title={`${dataBr(d)} · ${sim ? "trabalha" : "folga"}`}>
            {DIAS_SEMANA_CURTO[new Date(`${d}T12:00:00`).getDay()].slice(0, 1)}
            <small>{d.slice(8)}</small>
          </span>
        );
      })}
    </div>
  );
};

const Escala = ({ c, onChange }) => {
  const e = normalizarEscala(c.escala);
  const mudar = (novo) => onChange({ ...c, escala: normalizarEscala({ ...e, ...novo }) });
  return (
    <div className="rtc-escala">
      <div className="rtc-colab__linha">
        <select className="ui-input" value={e.modelo} onChange={(ev) => mudar({ modelo: ev.target.value })} aria-label="Modelo de escala">
          {MODELOS_ESCALA.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome}
            </option>
          ))}
        </select>
        {e.modelo !== "semanal" && (
          <label className="rtc-ref">
            <span>Trabalha em</span>
            <input
              type="date"
              className="ui-input"
              value={e.referencia}
              onChange={(ev) => mudar({ referencia: ev.target.value })}
              aria-label="Um dia em que trabalha (início do ciclo)"
            />
          </label>
        )}
      </div>
      {e.modelo === "ciclo" && (
        <div className="rtc-colab__linha rtc-ciclo-num">
          <label>
            <input type="number" min={1} max={14} className="ui-input" value={e.trabalha} onChange={(ev) => mudar({ trabalha: ev.target.value })} /> dia(s) de trabalho
          </label>
          <label>
            <input type="number" min={1} max={14} className="ui-input" value={e.folga} onChange={(ev) => mudar({ folga: ev.target.value })} /> dia(s) de folga
          </label>
        </div>
      )}
      {e.modelo !== "semanal" && (e.referencia ? <ProximosDias c={{ ...c, escala: e }} /> : <small className="rtc-ajuda">Escolha um dia em que a pessoa trabalha — o ciclo é contado a partir dele.</small>)}
    </div>
  );
};

// a pessoa da equipe é desta conta? (contas antigas: pelo colaboradorId)
const ehDaConta = (c, conta) => c.contaUid === conta.uid || c.id === conta.uid || (!!conta.colaboradorId && c.id === conta.colaboradorId);

// Função no setor: escolhe da lista ou cria uma nova
const SeletorFuncao = ({ valor, funcoes, onChange, onCriar, className = "" }) => (
  <select
    className={`ui-input ${className}`}
    value={valor || ""}
    onChange={(e) => {
      if (e.target.value === "__nova__") {
        const nome = window.prompt("Nome da nova função (ex.: Recepção, Embarque, Supervisão):");
        if (nome && nome.trim()) onChange(onCriar(nome.trim()));
        return;
      }
      onChange(e.target.value);
    }}
    aria-label="Função"
  >
    <option value="">Sem função</option>
    {funcoes.map((f) => (
      <option key={f.id} value={f.id}>
        {f.nome}
      </option>
    ))}
    <option value="__nova__">+ Criar função…</option>
  </select>
);

const Colaborador = ({ c, onChange, onRemover, funcoes = [], onCriarFuncao }) => {
  const [horarioProprio, setHorarioProprio] = useState(!!(c.inicio || c.fim));
  const set = (campo) => (e) => onChange({ ...c, [campo]: e.target.value });
  const modelo = normalizarEscala(c.escala).modelo;
  const alternarDia = (d) => {
    const atuais = c.dias.length ? c.dias : [0, 1, 2, 3, 4, 5, 6];
    const prox = atuais.includes(d) ? atuais.filter((x) => x !== d) : [...atuais, d];
    onChange({ ...c, dias: prox.length === 7 ? [] : prox.sort() });
  };
  const ativo = (d) => !c.dias.length || c.dias.includes(d);

  return (
    <div className="rtc-colab">
      <div className="rtc-colab__linha">
        <input className="ui-input rtc-colab__nome" placeholder="Nome" value={c.nome} onChange={set("nome")} aria-label="Nome do colaborador" />
        <select className="ui-input rtc-colab__papel" value={c.papel} onChange={set("papel")} aria-label="Papel no setor">
          {PAPEIS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
        <Button variant="ghost" iconOnly icon="trash" size="sm" onClick={onRemover} title="Remover colaborador" aria-label="Remover colaborador" />
      </div>
      <div className="rtc-colab__linha">
        <SeletorFuncao valor={c.funcao} funcoes={funcoes} onChange={(v) => onChange({ ...c, funcao: v })} onCriar={onCriarFuncao} className="rtc-colab__funcao" />
        {c.contaUid && (
          <span className="rtc-conta-tag" title="Tem conta de Atendimento: marca no celular">
            <Icon name="smartphone" size={12} /> conta de atendimento
          </span>
        )}
      </div>
      <Escala c={c} onChange={onChange} />
      {modelo === "semanal" && (
        <div className="rtc-dias" role="group" aria-label="Dias que trabalha">
          {ORDEM_SEMANA.map((d) => (
            <button key={d} type="button" className={`rtc-dia ${ativo(d) ? "is-on" : ""}`} aria-pressed={ativo(d)} onClick={() => alternarDia(d)}>
              {DIAS_SEMANA_CURTO[d]}
            </button>
          ))}
        </div>
      )}
      <div className="rtc-colab__linha rtc-colab__extra">
        <label className="rtc-check">
          <input
            type="checkbox"
            checked={horarioProprio}
            onChange={(e) => {
              setHorarioProprio(e.target.checked);
              if (!e.target.checked) onChange({ ...c, inicio: "", fim: "" });
            }}
          />
          Horário diferente do turno
        </label>
        {horarioProprio && (
          <span className="rtc-horas">
            <input type="time" className="ui-input" value={c.inicio} onChange={set("inicio")} aria-label="Início do colaborador" />
            <span>às</span>
            <input type="time" className="ui-input" value={c.fim} onChange={set("fim")} aria-label="Fim do colaborador" />
          </span>
        )}
      </div>
      <input className="ui-input rtc-obs" placeholder="Observação (ex.: Jovem Aprendiz, sempre que necessário)" value={c.obs} onChange={set("obs")} />
    </div>
  );
};

/* Regras do painel do aeroporto (cartinhas) */
const Atendimento = ({ atendimento, onChange }) => {
  const a = atendimento || { ativo: true, etapas: ETAPAS_PADRAO, contagem: "dividir", avisarForaDoTurno: true };
  const set = (campo, valor) => onChange({ ...a, [campo]: valor });
  const mudarEtapa = (id, novo) => set("etapas", a.etapas.map((x) => (x.id === id ? { ...x, ...novo } : x)));
  return (
    <section className="rtc-folg rtc-atd">
      <h4>
        <Icon name="planeLanding" size={15} /> Atendimento no aeroporto
      </h4>
      <p className="rtc-ajuda">
        No celular, cada colaborador marca por veículo as etapas que fez (o verso da cartinha). As contas são criadas em Usuários, nível <b>Atendimento</b>.
      </p>
      <label className="rtc-check">
        <input type="checkbox" checked={a.ativo} onChange={(e) => set("ativo", e.target.checked)} />
        Painel ativo
      </label>
      <div className="rtc-etapas">
        <span className="rtc-etapas__cab">
          <small>No relatório</small>
          <small>No botão</small>
        </span>
        {a.etapas.map((x) => (
          <div key={x.id} className="rtc-colab__linha">
            <input className="ui-input" value={x.nome} placeholder="Ex.: Recepcionou" onChange={(e) => mudarEtapa(x.id, { nome: e.target.value })} aria-label="Nome da etapa no relatório" />
            <input className="ui-input" value={x.acao} placeholder="Ex.: Recepcionei" onChange={(e) => mudarEtapa(x.id, { acao: e.target.value })} aria-label="Texto do botão" />
            <Button
              variant="ghost"
              iconOnly
              icon="trash"
              size="sm"
              disabled={a.etapas.length <= 1}
              onClick={() => window.confirm(`Remover a etapa ${x.nome}? As marcas já feitas nela deixam de contar.`) && set("etapas", a.etapas.filter((y) => y.id !== x.id))}
              aria-label="Remover etapa"
              title="Remover etapa"
            />
          </div>
        ))}
        {a.etapas.length < 4 && (
          <Button size="sm" icon="plus" onClick={() => set("etapas", [...a.etapas, { id: novoId(), nome: "", acao: "" }])}>
            Adicionar etapa
          </Button>
        )}
      </div>
      <div className="rtc-contagem" role="radiogroup" aria-label="Quando duas pessoas marcam o mesmo veículo">
        <span>Quando 2 ou mais pessoas marcam a mesma etapa do veículo:</span>
        <label className={a.contagem === "dividir" ? "is-on" : ""}>
          <input type="radio" name="contagem" checked={a.contagem === "dividir"} onChange={() => set("contagem", "dividir")} />
          <b>Dividir os pax</b>
          <small>10 pax com 2 pessoas = 5 para cada. A soma bate com o total do dia.</small>
        </label>
        <label className={a.contagem === "total" ? "is-on" : ""}>
          <input type="radio" name="contagem" checked={a.contagem === "total"} onChange={() => set("contagem", "total")} />
          <b>Cada um conta tudo</b>
          <small>10 pax com 2 pessoas = 10 para cada (como na cartinha). A soma passa de 100%.</small>
        </label>
      </div>
      <label className="rtc-check">
        <input type="checkbox" checked={a.avisarForaDoTurno} onChange={(e) => set("avisarForaDoTurno", e.target.checked)} />
        Avisar quando alguém marcar um veículo fora do próprio turno
      </label>
    </section>
  );
};

/* Contas de Atendimento (criadas em Usuários): aqui cada pessoa ganha a
   função, o turno e a folga fixa — e passa a fazer parte da equipe. */
const ContasAtendimento = ({ contas, turnos, funcoes, daConta, onMudar, onCriarFuncao, onRemoverFuncao }) => (
  <section className="rtc-folg rtc-contas">
    <h4>
      <Icon name="smartphone" size={15} /> Contas de atendimento
    </h4>
    <p className="rtc-ajuda">
      As contas de nível <b>Atendimento</b> criadas em Usuários aparecem aqui. Escolha a função, o turno e a folga fixa de cada pessoa — é isso que vale no
      painel do aeroporto e no relatório.
    </p>
    {contas === null ? (
      <p className="rtc-ajuda">
        <Icon name="loader" size={14} className="ui-spin" /> Carregando as contas…
      </p>
    ) : contas.length === 0 ? (
      <p className="rtc-ajuda">Nenhuma conta de Atendimento nesta base ainda. Crie em Gestão → Cadastros → Usuários e acessos.</p>
    ) : (
      <ul className="rtc-contas__lista">
        {contas.map((conta) => {
          const atual = daConta(conta);
          const dias = atual?.c.dias || [];
          const folga = (d) => dias.length > 0 && !dias.includes(d);
          const alternarFolga = (d) => {
            const trabalha = dias.length ? dias : [0, 1, 2, 3, 4, 5, 6];
            const prox = trabalha.includes(d) ? trabalha.filter((x) => x !== d) : [...trabalha, d].sort();
            if (!prox.length) return; // pelo menos um dia de trabalho
            onMudar(conta, { dias: prox.length === 7 ? [] : prox, ...(atual ? {} : { turnoId: turnos[0]?.id || "" }) });
          };
          const modelo = atual?.c.escala?.modelo && atual.c.escala.modelo !== "semanal";
          return (
            <li key={conta.uid} className={`rtc-conta ${atual ? "is-na-equipe" : ""}`} style={atual ? { "--c": atual.turno.cor } : undefined}>
              <div className="rtc-conta__topo">
                <span className="rtc-conta__nome">
                  <b>{conta.nome || "Sem nome"}</b>
                  <small>{conta.email}</small>
                </span>
                {!atual && <span className="rtc-conta__novo">fora da equipe</span>}
              </div>
              <div className="rtc-colab__linha">
                <SeletorFuncao valor={atual?.c.funcao} funcoes={funcoes} onChange={(v) => onMudar(conta, { funcao: v, ...(atual ? {} : { turnoId: turnos[0]?.id || "" }) })} onCriar={onCriarFuncao} className="rtc-colab__funcao" />
                <select className="ui-input" value={atual?.turno.id || ""} onChange={(e) => onMudar(conta, { turnoId: e.target.value })} aria-label="Turno">
                  <option value="">Fora da equipe</option>
                  {turnos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome} ({t.inicio}–{t.fim})
                    </option>
                  ))}
                </select>
              </div>
              {modelo ? (
                <small className="rtc-ajuda">Escala {atual.c.escala.modelo}: ajuste no card da pessoa, no turno {atual.turno.nome}.</small>
              ) : (
                <div className="rtc-folga-fixa">
                  <span>Folga fixa</span>
                  <div className="rtc-dias" role="group" aria-label={`Folga fixa de ${conta.nome}`}>
                    {ORDEM_SEMANA.map((d) => (
                      <button key={d} type="button" className={`rtc-dia rtc-dia--folga ${folga(d) ? "is-on" : ""}`} aria-pressed={folga(d)} onClick={() => alternarFolga(d)}>
                        {DIAS_SEMANA_CURTO[d]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    )}
    {funcoes.length > 0 && (
      <div className="rtc-funcoes">
        <span>Funções:</span>
        {funcoes.map((f) => (
          <span key={f.id} className="rtc-funcao">
            {f.nome}
            <button type="button" onClick={() => window.confirm(`Excluir a função ${f.nome}? Quem tinha essa função fica sem função.`) && onRemoverFuncao(f.id)} aria-label={`Excluir a função ${f.nome}`} title="Excluir função">
              <Icon name="x" size={11} />
            </button>
          </span>
        ))}
        <button
          type="button"
          className="rtc-funcao rtc-funcao--nova"
          onClick={() => {
            const nome = window.prompt("Nome da nova função:");
            if (nome && nome.trim()) onCriarFuncao(nome.trim());
          }}
        >
          + Criar função
        </button>
      </div>
    )}
  </section>
);

const ConfigTurnosDrawer = ({ open, config, onClose, onSalvar }) => {
  const [rascunho, setRascunho] = useState(() => normalizarConfig(config));
  const [salvando, setSalvando] = useState(false);
  const [erros, setErros] = useState([]);
  const [contas, setContas] = useState(null); // contas de Atendimento da base
  useEffect(() => {
    let vivo = true;
    carregarContasAtendimento()
      .then((l) => vivo && setContas(l))
      .catch((e) => {
        console.error("Contas de atendimento:", e);
        if (vivo) setContas([]);
      });
    return () => {
      vivo = false;
    };
  }, []);

  // funções do setor
  const criarFuncao = (nome) => {
    const existente = (rascunho.funcoes || []).find((f) => f.nome.toLowerCase() === nome.toLowerCase());
    if (existente) return existente.id;
    const id = `f_${novoId()}`;
    setRascunho((r) => ({ ...r, funcoes: [...(r.funcoes || []), { id, nome }] }));
    return id;
  };
  const removerFuncao = (id) =>
    setRascunho((r) => ({
      ...r,
      funcoes: (r.funcoes || []).filter((f) => f.id !== id),
      turnos: r.turnos.map((t) => ({ ...t, colaboradores: t.colaboradores.map((c) => (c.funcao === id ? { ...c, funcao: "" } : c)) })),
    }));

  // a pessoa de uma conta na equipe (em qual turno está)
  const daConta = (conta) => {
    for (const t of rascunho.turnos) {
      const c = t.colaboradores.find((x) => ehDaConta(x, conta));
      if (c) return { turno: t, c };
    }
    return null;
  };
  // muda função / turno / folga da conta: cria, move ou tira da equipe
  const mudarConta = (conta, parcial) =>
    setRascunho((r) => {
      let atual = null;
      let turnoAtual = "";
      r.turnos.forEach((t) =>
        t.colaboradores.forEach((c) => {
          if (ehDaConta(c, conta)) {
            atual = c;
            turnoAtual = t.id;
          }
        }),
      );
      const novoTurno = parcial.turnoId !== undefined ? parcial.turnoId : turnoAtual;
      const base = atual || { ...novoColaborador(), id: conta.uid, nome: conta.nome || conta.email || "Atendimento" };
      const pessoa = { ...base, contaUid: conta.uid, ...(parcial.funcao !== undefined ? { funcao: parcial.funcao } : {}), ...(parcial.dias !== undefined ? { dias: parcial.dias } : {}) };
      return {
        ...r,
        turnos: r.turnos.map((t) => {
          const sem = t.colaboradores.filter((c) => !ehDaConta(c, conta));
          if (t.id !== novoTurno) return { ...t, colaboradores: sem };
          const idx = t.colaboradores.findIndex((c) => ehDaConta(c, conta));
          if (idx >= 0) return { ...t, colaboradores: t.colaboradores.map((c, i) => (i === idx ? pessoa : c)) };
          return { ...t, colaboradores: [...t.colaboradores, pessoa] };
        }),
      };
    });

  const mudarTurno = (id, novo) => setRascunho((r) => ({ ...r, turnos: r.turnos.map((t) => (t.id === id ? novo : t)) }));
  const removerTurno = (id) => setRascunho((r) => ({ ...r, turnos: r.turnos.filter((t) => t.id !== id) }));
  const moverTurno = (i, delta) =>
    setRascunho((r) => {
      const lista = [...r.turnos];
      const j = i + delta;
      if (j < 0 || j >= lista.length) return r;
      [lista[i], lista[j]] = [lista[j], lista[i]];
      return { ...r, turnos: lista };
    });
  const adicionarTurno = () =>
    setRascunho((r) => ({
      ...r,
      turnos: [
        ...r.turnos,
        {
          id: novoId(),
          nome: "",
          inicio: "08:00",
          fim: "16:00",
          cor: CORES_TURNO[r.turnos.length % CORES_TURNO.length],
          colaboradores: [novoColaborador()],
        },
      ],
    }));

  const salvar = async () => {
    const problemas = validarConfig(rascunho);
    setErros(problemas);
    if (problemas.length) return;
    setSalvando(true);
    try {
      await onSalvar(rascunho);
    } catch (e) {
      console.error(e);
      setErros(["Não foi possível salvar. Verifique a conexão e tente de novo."]);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={600}
      title="Turnos e equipe"
      subtitle="O relatório é calculado com estes turnos. Vale para todo o operacional."
      onSave={salvar}
      saving={salvando}
      saveLabel="Salvar turnos"
    >
      <div className="rtc">
        <p className="rtc-ajuda">
          <Icon name="info" size={14} /> <b>Função principal</b>: o colaborador é do setor e divide a demanda do turno. <b>Suporte (sinergia)</b>: ajuda quando
          necessário — aparece no relatório, mas não divide a conta. Um turno só com sinergia vira uma <b>janela de apoio</b>.
        </p>

        <ContasAtendimento
          contas={contas}
          turnos={rascunho.turnos}
          funcoes={rascunho.funcoes || []}
          daConta={daConta}
          onMudar={mudarConta}
          onCriarFuncao={criarFuncao}
          onRemoverFuncao={removerFuncao}
        />

        {rascunho.turnos.map((t, i) => (
          <section key={t.id} className="rtc-turno" style={{ "--c": t.cor }}>
            <div className="rtc-turno__topo">
              <input
                className="ui-input rtc-turno__nome"
                placeholder="Nome do turno (ex.: Manhã)"
                value={t.nome}
                onChange={(e) => mudarTurno(t.id, { ...t, nome: e.target.value })}
                aria-label="Nome do turno"
              />
              <span className="rtc-horas">
                <input type="time" className="ui-input" value={t.inicio} onChange={(e) => mudarTurno(t.id, { ...t, inicio: e.target.value })} aria-label="Início do turno" />
                <span>às</span>
                <input type="time" className="ui-input" value={t.fim} onChange={(e) => mudarTurno(t.id, { ...t, fim: e.target.value })} aria-label="Fim do turno" />
              </span>
            </div>
            <div className="rtc-turno__acoes">
              <div className="rtc-cores" role="radiogroup" aria-label="Cor do turno">
                {CORES_TURNO.map((cor) => (
                  <button
                    key={cor}
                    type="button"
                    role="radio"
                    aria-checked={t.cor === cor}
                    aria-label={`Cor ${cor}`}
                    className={`rtc-cor ${t.cor === cor ? "is-on" : ""}`}
                    style={{ background: cor }}
                    onClick={() => mudarTurno(t.id, { ...t, cor })}
                  />
                ))}
              </div>
              <span className="rtc-turno__mover">
                <Button variant="ghost" iconOnly size="sm" icon="arrowUp" onClick={() => moverTurno(i, -1)} disabled={i === 0} aria-label="Subir" title="Subir" />
                <Button
                  variant="ghost"
                  iconOnly
                  size="sm"
                  icon="arrowDown"
                  onClick={() => moverTurno(i, 1)}
                  disabled={i === rascunho.turnos.length - 1}
                  aria-label="Descer"
                  title="Descer"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  icon="trash"
                  onClick={() => window.confirm(`Remover o turno ${t.nome || ""}?`) && removerTurno(t.id)}
                >
                  Remover turno
                </Button>
              </span>
            </div>

            <div className="rtc-colabs">
              {t.colaboradores.map((c) => (
                <Colaborador
                  key={c.id}
                  c={c}
                  funcoes={rascunho.funcoes || []}
                  onCriarFuncao={criarFuncao}
                  onChange={(novo) => mudarTurno(t.id, { ...t, colaboradores: t.colaboradores.map((x) => (x.id === c.id ? novo : x)) })}
                  onRemover={() => mudarTurno(t.id, { ...t, colaboradores: t.colaboradores.filter((x) => x.id !== c.id) })}
                />
              ))}
              <Button size="sm" icon="userPlus" onClick={() => mudarTurno(t.id, { ...t, colaboradores: [...t.colaboradores, novoColaborador()] })}>
                Adicionar colaborador
              </Button>
            </div>
          </section>
        ))}

        <Button icon="plus" onClick={adicionarTurno}>
          Adicionar turno
        </Button>

        <section className="rtc-folg">
          <h4>Folguistas</h4>
          <p className="rtc-ajuda">Cobrem as folgas da equipe. Aparecem no relatório, sem turno fixo.</p>
          {rascunho.folguistas.map((f) => (
            <div key={f.id} className="rtc-colab__linha">
              <input
                className="ui-input rtc-colab__nome"
                placeholder="Nome"
                value={f.nome}
                onChange={(e) => setRascunho((r) => ({ ...r, folguistas: r.folguistas.map((x) => (x.id === f.id ? { ...x, nome: e.target.value } : x)) }))}
                aria-label="Nome do folguista"
              />
              <input
                className="ui-input"
                placeholder="Observação"
                value={f.obs}
                onChange={(e) => setRascunho((r) => ({ ...r, folguistas: r.folguistas.map((x) => (x.id === f.id ? { ...x, obs: e.target.value } : x)) }))}
                aria-label="Observação do folguista"
              />
              <Button
                variant="ghost"
                iconOnly
                icon="trash"
                size="sm"
                onClick={() => setRascunho((r) => ({ ...r, folguistas: r.folguistas.filter((x) => x.id !== f.id) }))}
                aria-label="Remover folguista"
                title="Remover folguista"
              />
            </div>
          ))}
          <Button size="sm" icon="userPlus" onClick={() => setRascunho((r) => ({ ...r, folguistas: [...r.folguistas, { id: novoId(), nome: "", obs: "" }] }))}>
            Adicionar folguista
          </Button>
        </section>

        <Atendimento atendimento={rascunho.atendimento} onChange={(a) => setRascunho((r) => ({ ...r, atendimento: a }))} />

        <button
          type="button"
          className="rtc-restaurar"
          onClick={() => window.confirm(ehSede() ? "Voltar para a escala padrão (Edson, Emerson, Ariana, Ingra, suporte e folguista)?" : "Voltar para os turnos padrão, sem ninguém na equipe?") && setRascunho(normalizarConfig(configPadraoDaRegiao()))}
        >
          Restaurar a escala padrão
        </button>

        {erros.length > 0 && (
          <div className="rtc-erros" role="alert">
            {erros.map((e) => (
              <p key={e}>
                <Icon name="alert" size={14} /> {e}
              </p>
            ))}
          </div>
        )}
      </div>
    </Drawer>
  );
};

export default ConfigTurnosDrawer;
