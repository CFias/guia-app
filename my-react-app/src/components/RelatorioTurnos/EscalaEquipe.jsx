import { useMemo, useState } from "react";
import { Button, Card, CardHeader, Icon } from "../ui";
import {
  DIAS_SEMANA_CURTO,
  MODELOS_ESCALA,
  dataBr,
  diaDaSemana,
  escalaDoDia,
  isoLocal,
  somarDias,
  todosDaEquipe,
  trabalhaPeloModelo,
} from "../../Services/Services/relatorioTurnos";

/* Aba "Escala da equipe": a semana de cada colaborador, calculada pelo
   modelo dele (dias da semana, 12x36, 24x48, 2x2, ciclo). Num toque dá para
   lançar a exceção do dia — folga, dia extra ou cobertura de outro turno
   (folguista ou troca). É essa escala que o painel do aeroporto usa para
   "Meu turno" e o relatório para saber quem estava escalado. */

const hojeIso = () => isoLocal(new Date());
const segundaDa = (iso) => somarDias(iso, -((diaDaSemana(iso) + 6) % 7));
const nomeModelo = (c) => (c.folguista ? "Folguista" : MODELOS_ESCALA.find((m) => m.id === (c.escala?.modelo || "semanal"))?.nome.split(" (")[0]);

const EscalaEquipe = ({ config, excecoes, onSalvar, onRemoverDaEquipe }) => {
  const [semana, setSemana] = useState(() => segundaDa(hojeIso()));
  const [rascunho, setRascunho] = useState(excecoes);
  const [salvando, setSalvando] = useState(false);
  const mudou = rascunho !== excecoes;

  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => somarDias(semana, i)), [semana]);
  const equipe = useMemo(() => todosDaEquipe(config), [config]);
  const turnoPorId = useMemo(() => new Map(config.turnos.map((t) => [t.id, t])), [config]);
  const hoje = hojeIso();

  // ---------- excluir escala ----------
  // tira as exceções (folga, extra, cobertura) que batem com o filtro
  const limparOnde = (filtro) =>
    setRascunho((r) => {
      const novo = {};
      Object.entries(r.dias || {}).forEach(([d, pessoas]) => {
        const resto = Object.fromEntries(Object.entries(pessoas || {}).filter(([id]) => !filtro(d, id)));
        if (Object.keys(resto).length) novo[d] = resto;
      });
      return { ...r, dias: novo };
    });
  const naSemana = (d) => d >= dias[0] && d <= dias[6];
  const excecoesDe = (id) => dias.filter((d) => rascunho.dias?.[d]?.[id]).length;
  const excecoesDoDia = (d) => Object.keys(rascunho.dias?.[d] || {}).length;
  const excecoesDaSemana = dias.reduce((n, d) => n + excecoesDoDia(d), 0);
  const totalExcecoes = Object.values(rascunho.dias || {}).reduce((n, p) => n + Object.keys(p || {}).length, 0);
  const limparPessoa = (c) => limparOnde((d, id) => naSemana(d) && id === c.id);
  const limparDia = (d) => limparOnde((dia) => dia === d);
  const limparSemana = () => window.confirm(`Excluir as ${excecoesDaSemana} exceções lançadas nesta semana? A escala volta a ser a do modelo de cada um.`) && limparOnde((d) => naSemana(d));
  const excluirTudo = () =>
    window.confirm(`Excluir toda a escala lançada (${totalExcecoes} exceções, em todas as semanas)? Folgas, dias extras e coberturas voltam ao modelo de cada um.`) &&
    setRascunho((r) => ({ ...r, dias: {} }));
  const tirarDaEquipe = async (c) => {
    if (!onRemoverDaEquipe) return;
    if (!window.confirm(`Tirar ${c.nome} da equipe? A escala e as exceções dele(a) são excluídas. As marcações já feitas no aeroporto continuam no relatório.`)) return;
    const semEle = { ...rascunho, dias: Object.fromEntries(Object.entries(rascunho.dias || {}).map(([d, p]) => [d, Object.fromEntries(Object.entries(p || {}).filter(([id]) => id !== c.id))])) };
    await onRemoverDaEquipe(c);
    setRascunho(await onSalvar(semEle));
  };

  const definir = (data, id, valor) =>
    setRascunho((r) => {
      const dia = { ...(r.dias?.[data] || {}) };
      if (!valor) delete dia[id];
      else if (valor.startsWith("cobre:")) dia[id] = { tipo: "cobre", turnoId: valor.slice(6) };
      else dia[id] = { tipo: valor };
      return { ...r, dias: { ...(r.dias || {}), [data]: dia } };
    });

  const salvar = async () => {
    setSalvando(true);
    try {
      const salvo = await onSalvar(rascunho);
      setRascunho(salvo);
    } finally {
      setSalvando(false);
    }
  };

  const celula = (c, data) => {
    const x = rascunho.dias?.[data]?.[c.id] || null;
    const base = !c.folguista && trabalhaPeloModelo(c, data);
    const turnoProprio = turnoPorId.get(c.turnoId);
    let texto = base ? turnoProprio?.nome || "Trabalha" : "Folga";
    let cor = base ? c.cor : "";
    let classe = base ? "is-trab" : "is-folga";
    if (x?.tipo === "folga") [texto, cor, classe] = ["Folga", "", "is-folga is-exc"];
    if (x?.tipo === "trabalha") [texto, cor, classe] = ["Extra", c.cor, "is-trab is-exc"];
    if (x?.tipo === "cobre") {
      const t = turnoPorId.get(x.turnoId);
      [texto, cor, classe] = [`Cobre ${t?.nome || "turno"}`, t?.cor || c.cor, "is-trab is-exc"];
    }
    const valor = x ? (x.tipo === "cobre" ? `cobre:${x.turnoId}` : x.tipo) : "";
    return (
      <td key={data} className={`rtn-esc__cel ${classe} ${data === hoje ? "is-hoje" : ""}`} style={cor ? { "--c": cor } : undefined}>
        <span>{texto}</span>
        <select value={valor} onChange={(e) => definir(data, c.id, e.target.value)} aria-label={`${c.nome} em ${dataBr(data)}`}>
          <option value="">{c.folguista ? "Pelo padrão (folga)" : `Pelo modelo (${base ? "trabalha" : "folga"})`}</option>
          {!c.folguista && <option value="folga">Folga</option>}
          {!c.folguista && <option value="trabalha">Dia extra (trabalha)</option>}
          {config.turnos
            .filter((t) => t.id !== c.turnoId)
            .map((t) => (
              <option key={t.id} value={`cobre:${t.id}`}>
                Cobre o turno {t.nome}
              </option>
            ))}
        </select>
      </td>
    );
  };

  // quantos principais em cada turno, por dia (avisa turno descoberto)
  const cobertura = useMemo(
    () =>
      dias.map((d) =>
        escalaDoDia(config, rascunho, d).map((e) => {
          // janela de apoio (só sinergia): conta todos e não avisa quando vazia
          const apoio = !e.turno.colaboradores.some((c) => c.papel === "principal");
          return { n: e.pessoas.filter((p) => apoio || p.papel !== "sinergia").length, apoio };
        }),
      ),
    [dias, config, rascunho],
  );

  return (
    <Card>
      <CardHeader
        icon="calendar"
        title="Escala da equipe"
        subtitle="Calculada pelo modelo de cada colaborador. Toque num dia para lançar folga, dia extra ou cobertura."
        actions={
          <span className="rtn-esc__nav">
            <Button variant="ghost" iconOnly size="sm" icon="chevronLeft" onClick={() => setSemana((s) => somarDias(s, -7))} aria-label="Semana anterior" />
            <b>
              {dataBr(dias[0]).slice(0, 5)} a {dataBr(dias[6]).slice(0, 5)}
            </b>
            <Button variant="ghost" iconOnly size="sm" icon="chevronRight" onClick={() => setSemana((s) => somarDias(s, 7))} aria-label="Próxima semana" />
            <Button variant="ghost" size="sm" onClick={() => setSemana(segundaDa(hoje))} disabled={semana === segundaDa(hoje)}>
              Hoje
            </Button>
          </span>
        }
      />
      <div className="rtn-semana">
        <table className="rtn-esc">
          <thead>
            <tr>
              <th>Colaborador</th>
              {dias.map((d) => (
                <th key={d} className={d === hoje ? "is-hoje" : ""}>
                  {DIAS_SEMANA_CURTO[diaDaSemana(d)]}
                  <small>{dataBr(d).slice(0, 5)}</small>
                  {excecoesDoDia(d) > 0 && (
                    <button type="button" className="rtn-esc__limpar" onClick={() => limparDia(d)} title={`Excluir as exceções de ${dataBr(d)}`} aria-label={`Excluir as exceções de ${dataBr(d)}`}>
                      <Icon name="x" size={11} />
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {equipe.map((c) => (
              <tr key={c.id}>
                <td className="rtn-esc__nome">
                  <span className="rtn-esc__acoes">
                    {excecoesDe(c.id) > 0 && (
                      <button type="button" onClick={() => limparPessoa(c)} title={`Excluir as exceções de ${c.nome} nesta semana`} aria-label={`Limpar a semana de ${c.nome}`}>
                        <Icon name="refresh" size={12} />
                      </button>
                    )}
                    {onRemoverDaEquipe && (
                      <button type="button" className="is-perigo" onClick={() => tirarDaEquipe(c)} title={`Tirar ${c.nome} da equipe`} aria-label={`Tirar ${c.nome} da equipe`}>
                        <Icon name="trash" size={12} />
                      </button>
                    )}
                  </span>
                  <i className="rtn-dot" style={{ background: c.cor }} />
                  <b>{c.nome}</b>
                  <small>
                    {c.turnoNome}
                    {c.funcaoNome ? ` · ${c.funcaoNome}` : ""} · {nomeModelo(c)}
                  </small>
                </td>
                {dias.map((d) => celula(c, d))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            {config.turnos.map((t, ti) => (
              <tr key={t.id}>
                <td className="rtn-esc__total">
                  <i className="rtn-dot" style={{ background: t.cor }} />
                  No turno {t.nome}
                </td>
                {cobertura.map((dia, i) => {
                  const n = dia[ti]?.n || 0;
                  const descoberto = n === 0 && !dia[ti]?.apoio;
                  return (
                    <td key={dias[i]} className={`tabular ${descoberto ? "is-descoberto" : ""}`} title={descoberto ? "Turno sem ninguém escalado" : undefined}>
                      {descoberto ? (
                        <>
                          <Icon name="alert" size={12} /> 0
                        </>
                      ) : (
                        n
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tfoot>
        </table>
      </div>
      <div className="rtn-esc__rodape">
        <span className="rtn-esc__excluir">
          <Button variant="ghost" size="sm" icon="trash" onClick={limparSemana} disabled={!excecoesDaSemana}>
            Excluir escala da semana{excecoesDaSemana ? ` (${excecoesDaSemana})` : ""}
          </Button>
          <Button variant="ghost" size="sm" onClick={excluirTudo} disabled={!totalExcecoes}>
            Excluir toda a escala lançada
          </Button>
        </span>
        <span className="rtn-esc__leg">
          <i className="is-trab" /> trabalha <i className="is-folga" /> folga <i className="is-exc" /> exceção lançada
        </span>
        <span>
          {mudou && (
            <Button variant="ghost" size="sm" onClick={() => setRascunho(excecoes)} disabled={salvando}>
              Desfazer
            </Button>
          )}
          <Button variant="primary" size="sm" icon="save" onClick={salvar} loading={salvando} disabled={!mudou || salvando}>
            Salvar escala
          </Button>
        </span>
      </div>
    </Card>
  );
};

export default EscalaEquipe;
