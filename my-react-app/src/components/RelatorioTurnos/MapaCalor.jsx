import { Fragment } from "react";
import { DIAS_SEMANA_CURTO, dataBr, diaDaSemana, num } from "../../Services/Services/relatorioTurnos";
import { minimoPositivo, nivelCalor } from "./calor";

/* Mapas de calor da demanda: calendário do período (pessoas por dia) e
   dia da semana × hora (média de pessoas). Uma cor só, do claro ao escuro. */

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0];

export const LegendaCalor = ({ max, min = 0, sufixo = "pessoas" }) => (
  <div className="rtn-calor-leg" aria-hidden="true">
    <span>Menos</span>
    {[0, 1, 2, 3, 4, 5].map((n) => (
      <i key={n} className={`rtn-calor-${n}`} />
    ))}
    <span>Mais</span>
    {max > 0 && (
      <small>
        ({min > 0 && min < max ? `de ${num(min, 0)} a ` : "até "}
        {num(max, 0)} {sufixo})
      </small>
    )}
  </div>
);

// Calendário: um bloco por mês, semanas de segunda a domingo
export const CalendarioCalor = ({ calendario, selecionado, onEscolher }) => {
  const porData = new Map(calendario.map((d) => [d.data, d]));
  const max = Math.max(0, ...calendario.map((d) => d.pax));
  const min = minimoPositivo(calendario.map((d) => d.pax));
  const top = [...calendario].sort((a, b) => b.pax - a.pax).slice(0, 3).filter((d) => d.pax > 0).map((d) => d.data);

  const meses = [];
  calendario.forEach((d) => {
    const chave = d.data.slice(0, 7);
    if (!meses.includes(chave)) meses.push(chave);
  });

  return (
    <div className="rtn-cal">
      <div className="rtn-cal__meses">
        {meses.map((mes) => {
          const [a, m] = mes.split("-").map(Number);
          const primeiro = new Date(a, m - 1, 1, 12);
          const ultimoDia = new Date(a, m, 0, 12).getDate();
          const vazios = (primeiro.getDay() + 6) % 7;
          const celulas = [...Array(vazios).fill(null), ...Array.from({ length: ultimoDia }, (_, i) => `${mes}-${String(i + 1).padStart(2, "0")}`)];
          return (
            <div key={mes} className="rtn-cal__mes">
              <h4>
                {MESES[m - 1]} {a}
              </h4>
              <div className="rtn-cal__grade">
                {ORDEM_SEMANA.map((w) => (
                  <span key={w} className="rtn-cal__dsem">
                    {DIAS_SEMANA_CURTO[w]}
                  </span>
                ))}
                {celulas.map((iso, i) => {
                  if (!iso) return <span key={`v${i}`} />;
                  const d = porData.get(iso);
                  const dia = Number(iso.slice(8));
                  if (!d) {
                    return (
                      <span key={iso} className="rtn-cal__dia is-fora">
                        <b>{dia}</b>
                      </span>
                    );
                  }
                  const n = nivelCalor(d.pax, max, min);
                  return (
                    <button
                      key={iso}
                      type="button"
                      className={`rtn-cal__dia rtn-calor-${n} ${selecionado === iso ? "is-sel" : ""} ${top.includes(iso) ? "is-top" : ""}`}
                      onClick={() => onEscolher?.(iso)}
                      title={`${DIAS_SEMANA_CURTO[diaDaSemana(iso)]} ${dataBr(iso)}: ${d.pax} pessoas · ${d.reservas} reservas`}
                    >
                      <b>{dia}</b>
                      <span className="tabular">{d.pax || "–"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <LegendaCalor max={max} min={min} />
      {top.length > 0 && (
        <p className="rtn-cal__top">
          Dias de maior demanda:{" "}
          {top.map((iso, i) => (
            <Fragment key={iso}>
              {i > 0 && " · "}
              <b>
                {DIAS_SEMANA_CURTO[diaDaSemana(iso)].toLowerCase()} {dataBr(iso).slice(0, 5)}
              </b>{" "}
              ({porData.get(iso).pax})
            </Fragment>
          ))}
        </p>
      )}
    </div>
  );
};

// Dia da semana × hora (média de pessoas)
export const SemanaHoraCalor = ({ semanaHora }) => {
  const max = Math.max(0, ...semanaHora.flat().filter((v) => v !== null));
  const min = minimoPositivo(semanaHora.flat());
  let pico = null;
  semanaHora.forEach((linha, w) =>
    linha.forEach((v, h) => {
      if (v !== null && (!pico || v > pico.v)) pico = { w, h, v };
    }),
  );
  return (
    <div className="rtn-sh">
      <div className="rtn-sh__rolagem">
        <div className="rtn-sh__grade">
          <span />
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="rtn-sh__h">
              {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
            </span>
          ))}
          {ORDEM_SEMANA.map((w) => (
            <Fragment key={w}>
              <span className="rtn-sh__dsem">{DIAS_SEMANA_CURTO[w]}</span>
              {semanaHora[w].map((v, h) => (
                <span
                  key={h}
                  className={`rtn-sh__cel rtn-calor-${v === null ? 0 : nivelCalor(v, max, min)}`}
                  title={v === null ? "Sem esse dia no período" : `${DIAS_SEMANA_CURTO[w]} ${String(h).padStart(2, "0")}h: ${num(v)} pessoas em média`}
                />
              ))}
            </Fragment>
          ))}
        </div>
      </div>
      <LegendaCalor max={max} min={min} sufixo="pessoas/hora" />
      {pico && pico.v > 0 && (
        <p className="rtn-cal__top">
          Horário mais pesado: <b>{DIAS_SEMANA_CURTO[pico.w].toLowerCase()}, {String(pico.h).padStart(2, "0")}h–{String(pico.h + 1).padStart(2, "0")}h</b> (média de{" "}
          {num(pico.v)} pessoas).
        </p>
      )}
    </div>
  );
};
