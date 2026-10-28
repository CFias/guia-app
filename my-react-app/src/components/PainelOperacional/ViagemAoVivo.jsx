import { useEffect, useState } from "react";
import Icon from "../ui/Icon";
import { baseAtual, horaDoTimestamp, leituraAoVivo, linkPosicao, mapaEmbutido } from "../../Services/Services/viagemMotorista";
import "./viagemAoVivo.css";

/* Localização AO VIVO de quem está em viagem (app do motorista do
   fornecedor). O app envia a posição a cada 15 s andando (60 s parado);
   aqui aparece o sinal (ao vivo · atrasada · sem sinal), a velocidade e,
   no OUT, quanto falta para o aeroporto (estimativa). */

// relógio da tela (atualiza o "há 20 s")
export const useRelogio = (passo = 5000) => {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), passo);
    return () => clearInterval(t);
  }, [passo]);
  return agora;
};

// em viagem agora, com a posição desta viagem
export const emViagemComPosicao = (v) => {
  if (!v?.eventos?.iniciado?.em || v.eventos?.finalizado?.em) return false;
  const p = v.ultimaPosicao;
  return !!(p && p.lat !== undefined && (!p.chave || !v.chave || p.chave === v.chave));
};

const ROTULO = { aovivo: "Ao vivo", atrasada: "Sinal atrasado", semsinal: "Sem sinal" };
const kmTxt = (km) => (km < 10 ? km.toFixed(1).replace(".", ",") : String(Math.round(km)));

const partesDaLeitura = (l) => {
  const p = [];
  if (l.estado !== "semsinal" && l.vel !== null) p.push(l.vel < 5 ? "parado" : `${l.vel} km/h`);
  if (l.distKm !== null) p.push(l.distKm < 0.8 ? "chegando ao aeroporto" : `${kmTxt(l.distKm)} km do aeroporto · ~${l.etaMin} min`);
  return p;
};

// selo curto na linha do painel: ● Ao vivo · 42 km/h · 9,4 km do aeroporto · ~16 min
export const SinalAoVivo = ({ v, onAbrir }) => {
  const agora = useRelogio(5000);
  if (!emViagemComPosicao(v)) return null;
  const l = leituraAoVivo(v, agora, baseAtual());
  if (!l) return null;
  const vel = l.estado !== "semsinal" && l.vel !== null ? (l.vel < 5 ? "parado" : `${l.vel} km/h`) : "";
  const destino = l.distKm === null ? "" : l.distKm < 0.8 ? "chegando ao aeroporto" : `${kmTxt(l.distKm)} km do aeroporto · ~${l.etaMin} min`;
  const conteudo = (
    <>
      <span className="vav-sinal__l1">
        <i className="vav-ponto" aria-hidden="true" />
        <b>{ROTULO[l.estado]}</b>
        {l.estado !== "aovivo" && <small>{l.idadeTxt}</small>}
        {vel && <small>· {vel}</small>}
      </span>
      {destino && <span className="vav-sinal__l2">{destino}</span>}
    </>
  );
  return onAbrir ? (
    <button
      type="button"
      className={`vav-sinal is-${l.estado}`}
      onClick={(e) => {
        e.stopPropagation();
        onAbrir();
      }}
      title={`Localização ${l.idadeTxt} · toque para ver o mapa ao vivo`}
    >
      {conteudo}
    </button>
  ) : (
    <span className={`vav-sinal is-${l.estado}`} title={`Localização ${l.idadeTxt}`}>
      {conteudo}
    </span>
  );
};

// cartão com o mapa ao vivo (dentro do grupo aberto)
export const CartaoAoVivo = ({ v, titulo = "" }) => {
  const agora = useRelogio(5000);
  // o mapa só recarrega quando a posição muda de verdade (não a cada segundo)
  const p = v?.ultimaPosicao;
  const chaveMapa = p ? `${p.lat.toFixed(4)},${p.lng.toFixed(4)}` : "";
  if (!emViagemComPosicao(v)) return null;
  const l = leituraAoVivo(v, agora, baseAtual());
  if (!l) return null;
  const tel = String(v.motoristaTelefone || "").replace(/\D/g, "");
  return (
    <section className={`vav-cartao is-${l.estado}`} aria-label="Viagem ao vivo">
      <div className="vav-cartao__mapa">
        <iframe key={chaveMapa} title={`Mapa ao vivo de ${v.motoristaNome || "motorista"}`} src={mapaEmbutido(l.pos)} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
        <span className={`vav-cartao__selo is-${l.estado}`}>
          <i className="vav-ponto" aria-hidden="true" /> {ROTULO[l.estado]} · {l.idadeTxt}
        </span>
      </div>
      <div className="vav-cartao__info">
        <div className="vav-cartao__topo">
          <span className="vav-cartao__ic" aria-hidden="true">
            <Icon name="navigation" size={16} />
          </span>
          <span className="vav-cartao__tit">
            <b>{v.motoristaNome || "Motorista"} em viagem</b>
            <small>
              {titulo || v.veiculo || ""}
              {v.eventos?.iniciado?.em ? `${titulo || v.veiculo ? " · " : ""}saiu às ${horaDoTimestamp(v.eventos.iniciado.em)}` : ""}
            </small>
          </span>
        </div>
        <dl className="vav-cartao__dados">
          <div>
            <dt>Velocidade</dt>
            <dd className="tabular">{l.estado === "semsinal" || l.vel === null ? "—" : l.vel < 5 ? "Parado" : `${l.vel} km/h`}</dd>
          </div>
          {l.distKm !== null && (
            <>
              <div>
                <dt>Até o aeroporto</dt>
                <dd className="tabular">{l.distKm < 0.8 ? "Chegando" : `${kmTxt(l.distKm)} km`}</dd>
              </div>
              <div>
                <dt>Chegada estimada</dt>
                <dd className="tabular">{l.distKm < 0.8 ? "agora" : `~${l.chegada} (${l.etaMin} min)`}</dd>
              </div>
            </>
          )}
          <div>
            <dt>Atualizado</dt>
            <dd className="tabular">{l.idadeTxt}</dd>
          </div>
        </dl>
        {l.estado === "semsinal" && (
          <p className="vav-cartao__aviso">
            <Icon name="alert" size={13} /> O celular do motorista parou de enviar (app fechado, tela bloqueada ou sem internet). Esta é a última posição recebida.
          </p>
        )}
        <div className="vav-cartao__acoes">
          <a href={linkPosicao(l.pos)} target="_blank" rel="noopener noreferrer">
            <Icon name="map" size={14} /> Abrir no Google Maps
          </a>
          {tel && (
            <a href={`https://wa.me/${tel.length <= 11 ? `55${tel}` : tel}`} target="_blank" rel="noopener noreferrer">
              <Icon name="message" size={14} /> WhatsApp
            </a>
          )}
          {tel && (
            <a href={`tel:+${tel.length <= 11 ? `55${tel}` : tel}`}>
              <Icon name="phone" size={14} /> Ligar
            </a>
          )}
        </div>
        <small className="vav-cartao__nota">Distância e chegada são estimativas pela posição do celular.</small>
      </div>
    </section>
  );
};

// faixa no topo da aba OUT: quem está em viagem agora
export const FaixaAoVivo = ({ itens = [], onAbrir }) => {
  const agora = useRelogio(5000);
  const lista = itens.filter((x) => emViagemComPosicao(x.v));
  if (!lista.length) return null;
  return (
    <section className="vav-faixa" aria-label="Em viagem agora">
      <span className="vav-faixa__tit">
        <Icon name="navigation" size={14} /> Em viagem agora <b className="tabular">{lista.length}</b>
      </span>
      <div className="vav-faixa__lista">
        {lista.map((x) => {
          const l = leituraAoVivo(x.v, agora, baseAtual());
          if (!l) return null;
          return (
            <button key={x.id} type="button" className={`vav-faixa__item is-${l.estado}`} onClick={() => onAbrir?.(x.id)} title="Abrir o grupo com o mapa ao vivo">
              <i className="vav-ponto" aria-hidden="true" />
              <span>
                <span className="vav-faixa__l1">
                  <b>{String(x.v.motoristaNome || "Motorista").split(" ")[0]}</b> · {x.rotulo}
                </span>
                <small>{[ROTULO[l.estado] + (l.estado === "aovivo" ? "" : ` ${l.idadeTxt}`), ...partesDaLeitura(l)].join(" · ")}</small>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};
