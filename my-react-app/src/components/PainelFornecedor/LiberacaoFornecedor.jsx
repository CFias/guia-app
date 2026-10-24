import { useEffect, useState } from "react";
import { Button, Icon, useToast } from "../ui";
import { dataBr, isoLocal, somarDias } from "../../Services/Services/relatorioTurnos";
import { estadoLiberacao, liberarDia, ouvirConfigPainel, salvarConfigPainel, textoAbertura } from "../../Services/Services/fornecedorPainel";

/* Faixa na tela de Prévia: quando os fornecedores passam a ver os serviços do
   dia seguinte no painel deles. Hora automática (configurável) + liberar ou
   bloquear na mão. Hoje fica sempre aberto. */
const LiberacaoFornecedor = () => {
  const { mostrarToast } = useToast();
  const [config, setConfig] = useState(null);
  const [agora, setAgora] = useState(() => new Date());
  const [editando, setEditando] = useState(false);
  const [hora, setHora] = useState("18:00");
  const [minutos, setMinutos] = useState(60);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => ouvirConfigPainel(setConfig), []);
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  if (!config) return null;
  const amanha = somarDias(isoLocal(agora), 1);
  const est = estadoLiberacao(amanha, config, agora);

  const alternar = async () => {
    setSalvando(true);
    try {
      await liberarDia(amanha, !est.liberado);
      mostrarToast(est.liberado ? `Serviços de ${dataBr(amanha)} bloqueados para os fornecedores` : `Serviços de ${dataBr(amanha)} liberados para os fornecedores`);
    } catch (e) {
      console.error(e);
      window.alert("Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };

  const salvarHorario = async () => {
    setSalvando(true);
    try {
      await salvarConfigPainel({ horaLiberacao: hora, minutosAntesCheguei: Number(minutos) || 0 });
      setEditando(false);
      mostrarToast("Horário de liberação salvo");
    } catch (e) {
      console.error(e);
      window.alert("Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <section className={`lib-forn ${est.liberado ? "is-aberto" : "is-fechado"}`} aria-label="Liberação do painel do fornecedor">
      <span className="lib-forn__ic">
        <Icon name={est.liberado ? "unlock" : "lock"} size={18} />
      </span>
      <span className="lib-forn__txt">
        <b>
          Painel do fornecedor · {dataBr(amanha).slice(0, 5)}: {est.liberado ? "liberado" : "fechado"}
        </b>
        <small>
          {est.liberado
            ? est.manual
              ? "Liberado na mão — os fornecedores já veem os serviços e escolhem os motoristas."
              : `Abriu às ${config.horaLiberacao} — os fornecedores já veem os serviços e escolhem os motoristas.`
            : est.manual
              ? "Bloqueado na mão — só abre quando vocês liberarem."
              : `Os fornecedores veem com cadeado; abre ${textoAbertura(est.abreEm, agora)}.`}{" "}
          Abre todo dia às <b>{config.horaLiberacao}</b> · “Cheguei no hotel” libera {config.minutosAntesCheguei} min antes do OUT.
        </small>
      </span>
      {editando ? (
        <span className="lib-forn__form">
          <label>
            <span>Abre às</span>
            <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
          </label>
          <label>
            <span>Cheguei (min antes)</span>
            <input type="number" min="0" max="240" step="5" value={minutos} onChange={(e) => setMinutos(e.target.value)} />
          </label>
          <Button size="sm" onClick={() => setEditando(false)}>
            Cancelar
          </Button>
          <Button size="sm" variant="primary" onClick={salvarHorario} loading={salvando} disabled={salvando || !hora}>
            Salvar
          </Button>
        </span>
      ) : (
        <span className="lib-forn__acoes">
          <Button
            size="sm"
            variant="ghost"
            icon="clock"
            onClick={() => {
              setHora(config.horaLiberacao);
              setMinutos(config.minutosAntesCheguei);
              setEditando(true);
            }}
          >
            Horário
          </Button>
          <Button size="sm" variant={est.liberado ? "secondary" : "primary"} icon={est.liberado ? "lock" : "unlock"} onClick={alternar} loading={salvando} disabled={salvando}>
            {est.liberado ? "Bloquear de novo" : "Liberar agora"}
          </Button>
        </span>
      )}
    </section>
  );
};

export default LiberacaoFornecedor;
