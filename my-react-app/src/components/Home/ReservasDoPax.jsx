import { useState } from "react";
import { Drawer, Icon } from "../ui";
import "./reservasDoPax.css";

/* As reservas do Phoenix que somam o pax de um serviço do dia — para
   conferir quando o número não bate com o Phoenix. Reserva com o mesmo
   código mais de uma vez fica marcada ("aparece 2×").
   servico: item da lista "Guias e serviços do dia" (com reservasDet) */
const dataBr = (iso) => (iso ? iso.split("-").reverse().join("/") : "");

const ReservasDoPax = ({ servico, onClose }) => {
  const [copiado, setCopiado] = useState(false);
  const lista = servico?.reservasDet || [];
  const vezes = new Map();
  lista.forEach((r) => r.codigo && vezes.set(r.codigo, (vezes.get(r.codigo) || 0) + 1));
  const repetidas = [...vezes.values()].filter((n) => n > 1).length;
  const soma = (k) => lista.reduce((s, r) => s + Number(r[k] || 0), 0);

  const copiar = async () => {
    const txt = [
      `${servico.serviceName} · ${dataBr(servico.date)} · ${servico.passengers} pax`,
      ...lista.map((r) => `${r.codigo || "sem código"} · ${r.cliente || "—"} · ${r.operadora || "—"} · ADT ${r.adultos} CHD ${r.criancas} INF ${r.infants}${r.situacao ? ` · ${r.situacao}` : ""}${r.observacao ? ` · obs: ${r.observacao}` : ""}`),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(txt);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* sem área de transferência */
    }
  };

  return (
    <Drawer
      open={!!servico}
      title="Reservas que somam o pax"
      subtitle={servico ? `${servico.serviceName} · ${dataBr(servico.date)}` : ""}
      onClose={onClose}
      width={480}
      footer={
        <button type="button" className="rdp-copiar" onClick={copiar}>
          <Icon name={copiado ? "check" : "copy"} size={14} /> {copiado ? "Copiado" : "Copiar a lista"}
        </button>
      }
    >
      {servico && (
        <div className="rdp">
          <div className="rdp-resumo">
            <span>
              <b className="tabular">{servico.passengers}</b> pax
            </span>
            <small className="tabular">
              {lista.length} {lista.length === 1 ? "reserva" : "reservas"} · ADT {soma("adultos")} · CHD {soma("criancas")} · INF {soma("infants")} (bebê não conta no pax)
            </small>
          </div>
          {repetidas > 0 && (
            <p className="rdp-alerta">
              <Icon name="alert" size={14} />
              <span>
                {repetidas === 1 ? "Uma reserva aparece" : `${repetidas} reservas aparecem`} mais de uma vez neste serviço no Phoenix e está sendo somada de novo. Confira
                no Phoenix se ela foi alterada ou duplicada.
              </span>
            </p>
          )}
          <ul className="rdp-lista">
            {lista.map((r, i) => {
              const n = r.codigo ? vezes.get(r.codigo) : 1;
              return (
                <li key={`${r.id ?? r.codigo}-${i}`} className={n > 1 ? "is-repetida" : ""}>
                  <div className="rdp-linha">
                    <b>{r.codigo || "Sem código"}</b>
                    {n > 1 && <em className="rdp-tag">aparece {n}×</em>}
                    <span className="rdp-pax tabular">{r.pax} pax</span>
                  </div>
                  <div className="rdp-info">
                    <span>{r.cliente || "Cliente não informado"}</span>
                    {r.operadora && r.operadora !== "SEM OPERADORA" && <span>{r.operadora}</span>}
                    {r.hora && <span className="tabular">{r.hora}</span>}
                    <span className="tabular">
                      ADT {r.adultos} · CHD {r.criancas} · INF {r.infants}
                    </span>
                  </div>
                  {r.situacao && <small className="rdp-sit">Situação no Phoenix: {r.situacao}</small>}
                  {r.observacao && <small className="rdp-obs">{r.observacao}</small>}
                </li>
              );
            })}
          </ul>
          <p className="rdp-nota">
            <Icon name="info" size={13} /> Reservas com CLD, cancelado, “não escalar” ou dispensado na observação já ficam de fora. Se o número não bate com o
            Phoenix, a reserva desta lista que não aparece lá é a diferença.
          </p>
        </div>
      )}
    </Drawer>
  );
};

export default ReservasDoPax;
