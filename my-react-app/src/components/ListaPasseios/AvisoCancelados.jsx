import { useState } from "react";
import { Icon } from "../ui";
import "./avisoCancelados.css";

/* Passeios que saíram do Phoenix depois de escalados (cancelados, sem
   passageiros ou que mudaram de data): o guia não se perde — fica aqui,
   "Fulano estava no City Tour de qua 25/10 (8 pax) · cancelado".
   lista: registros de weekly_services com `cancelamento`
   onCiente(id): tira o aviso (opcional; sem ele, só leitura) */

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const dataCurta = (iso) => {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00`);
  return `${DIAS[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const horaDe = (v) => {
  const d = v?.toDate ? v.toDate() : v instanceof Date ? v : v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? `${dataCurta(d.toISOString().slice(0, 10))} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "";
};

const AvisoCancelados = ({ lista = [], onCiente = null, titulo = "Passeios que saíram do Phoenix depois de escalados" }) => {
  const [abertos, setAbertos] = useState(true);
  const [tirando, setTirando] = useState("");
  if (!lista.length) return null;
  return (
    <section className="avc" aria-label={titulo}>
      <button type="button" className="avc__topo" onClick={() => setAbertos((x) => !x)} aria-expanded={abertos}>
        <span className="avc__ic" aria-hidden="true">
          <Icon name="alert" size={16} />
        </span>
        <span className="avc__tit">
          <b>{titulo}</b>
          <small>
            {lista.length} {lista.length === 1 ? "passeio" : "passeios"} · o guia que estava escalado continua registrado aqui
          </small>
        </span>
        <Icon name={abertos ? "chevronUp" : "chevronDown"} size={16} />
      </button>
      {abertos && (
        <ul className="avc__lista">
          {lista.map((r) => {
            const c = r.cancelamento || {};
            const mudou = c.motivo === "mudou";
            const guia = c.guiaNome || r.guiaNome || "Guia";
            return (
              <li key={r.id} className={mudou ? "is-mudou" : "is-cancelado"}>
                <span className="avc__guia">
                  <Icon name="user" size={13} /> <b>{guia}</b>
                </span>
                <span className="avc__txt">
                  estava no <b>{r.serviceName || "passeio"}</b> de {dataCurta(r.date)}
                  {c.paxAntes ? ` (${c.paxAntes} pax)` : ""}
                </span>
                <span className={`avc__status ${mudou ? "is-mudou" : "is-cancelado"}`}>
                  <Icon name={mudou ? "calendar" : "x"} size={12} />
                  {mudou ? (
                    <>
                      mudou para <b>{dataCurta(c.novaData)}</b>
                      {c.novoServico && c.novoServico !== r.serviceName ? ` · ${c.novoServico}` : ""}
                    </>
                  ) : (
                    "cancelado ou sem passageiros"
                  )}
                </span>
                <small className="avc__quando" title="Quando o sistema percebeu que o passeio saiu do Phoenix">
                  {horaDe(c.em)}
                </small>
                {onCiente && (
                  <button
                    type="button"
                    className="avc__ciente"
                    disabled={tirando === r.id}
                    onClick={async () => {
                      setTirando(r.id);
                      try {
                        await onCiente(r.id);
                      } finally {
                        setTirando("");
                      }
                    }}
                    title="Tirar este aviso (o guia já foi avisado)"
                  >
                    {tirando === r.id ? <Icon name="loader" size={12} className="ui-spin" /> : <Icon name="check" size={12} />} Ciente
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export default AvisoCancelados;
