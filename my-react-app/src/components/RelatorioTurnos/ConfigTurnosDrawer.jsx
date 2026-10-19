import { useState } from "react";
import { Button, Drawer, Icon } from "../ui";
import {
  configPadraoDaRegiao,
  CORES_TURNO,
  DIAS_SEMANA_CURTO,
  PAPEIS,
  normalizarConfig,
  novoId,
  validarConfig,
} from "../../Services/Services/relatorioTurnos";
import { ehSede } from "../../Services/Services/regiaoAtiva";

/* Painel "Turnos e equipe": cria/edita os turnos (nome, horário, cor) e os
   colaboradores de cada um — papel no setor (função principal ou suporte em
   sinergia), dias da semana e horário próprio quando diferente do turno. */

const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0];

const novoColaborador = () => ({ id: novoId(), nome: "", papel: "principal", dias: [], inicio: "", fim: "", obs: "" });

const Colaborador = ({ c, onChange, onRemover }) => {
  const [horarioProprio, setHorarioProprio] = useState(!!(c.inicio || c.fim));
  const set = (campo) => (e) => onChange({ ...c, [campo]: e.target.value });
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
      <div className="rtc-dias" role="group" aria-label="Dias que trabalha">
        {ORDEM_SEMANA.map((d) => (
          <button key={d} type="button" className={`rtc-dia ${ativo(d) ? "is-on" : ""}`} aria-pressed={ativo(d)} onClick={() => alternarDia(d)}>
            {DIAS_SEMANA_CURTO[d]}
          </button>
        ))}
      </div>
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

const ConfigTurnosDrawer = ({ open, config, onClose, onSalvar }) => {
  const [rascunho, setRascunho] = useState(() => normalizarConfig(config));
  const [salvando, setSalvando] = useState(false);
  const [erros, setErros] = useState([]);

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
