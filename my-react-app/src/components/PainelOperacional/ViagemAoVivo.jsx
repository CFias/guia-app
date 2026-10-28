import { useEffect, useState } from "react";
import Icon from "../ui/Icon";
import { baseAtual, horaDoTimestamp, leituraAoVivo, linkPosicao, mapaEmbutido } from "../../Services/Services/viagemMotorista";
import "./viagemAoVivo.css";

/* Localização AO VIVO de quem está em viagem (app do motorista do
   fornecedor). O app envia a posição a cada 15 s andando (60 s parado);
   aqui aparece o sinal (ao vivo · atrasada · sem sinal), a velocidade e,
   quanto falta até o destino atual (hotel, aeroporto, próxima parada) —
   pela rota que o app do motorista traça; sem ela, estimativa. */

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
// "No Waze" quando o motorista foi navegar em outro app
const rotulo = (l) => (l.estado === "externo" ? `No ${l.externo}` : ROTULO[l.estado]);
const semVelocidade = (l) => l.estado === "semsinal" || l.estado === "externo";
const kmTxt = (km) => (km < 10 ? km.toFixed(1).replace(".", ",") : String(Math.round(km)));
// "até IBEROSTAR" / "do aeroporto"
const ateAlvo = (l) => (l.alvo === "aeroporto" ? "do aeroporto" : `até ${l.alvo}`);
const chegandoEm = (l) => (l.alvo === "aeroporto" ? "chegando ao aeroporto" : `chegando em ${l.alvo}`);
const textoDestino = (l) => (l.distKm === null ? "" : l.distKm < (l.alvo === "aeroporto" ? 0.8 : 0.15) ? chegandoEm(l) : `${kmTxt(l.distKm)} km ${ateAlvo(l)} · ~${l.etaMin} min`);

const partesDaLeitura = (l) => {
  const p = [];
  if (!semVelocidade(l) && l.vel !== null) p.push(l.vel < 5 ? "parado" : `${l.vel} km/h`);
  if (l.distKm !== null) p.push(textoDestino(l));
  return p;
};

// selo curto na linha do painel: ● Ao vivo · 42 km/h / 9,4 km até IBEROSTAR · ~16 min
export const SinalAoVivo = ({ v, onAbrir }) => {
  const agora = useRelogio(5000);
  if (!emViagemComPosicao(v)) return null;
  const l = leituraAoVivo(v, agora, baseAtual());
  if (!l) return null;
  const vel = !semVelocidade(l) && l.vel !== null ? (l.vel < 5 ? "parado" : `${l.vel} km/h`) : "";
  const destino = textoDestino(l);
  const conteudo = (
    <>
      <span className="vav-sinal__l1">
        <i className="vav-ponto" aria-hidden="true" />
        <b>{rotulo(l)}</b>
        {l.estado !== "aovivo" && <small>{l.estado === "externo" ? `· posição ${l.idadeTxt}` : l.idadeTxt}</small>}
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
          <i className="vav-ponto" aria-hidden="true" /> {rotulo(l)} · {l.idadeTxt}
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
            <dd className="tabular">{semVelocidade(l) || l.vel === null ? "—" : l.vel < 5 ? "Parado" : `${l.vel} km/h`}</dd>
          </div>
          {l.distKm !== null && (
            <>
              <div>
                <dt>{l.alvo === "aeroporto" ? "Até o aeroporto" : "Faltam"}</dt>
                <dd className="tabular">{l.etaMin === 0 ? "Chegando" : `${kmTxt(l.distKm)} km`}</dd>
              </div>
              <div>
                <dt>Chegada {l.pelaRota ? "pela rota" : "estimada"}</dt>
                <dd className="tabular">{l.etaMin === 0 ? "agora" : `~${l.chegada} (${l.etaMin} min)`}</dd>
              </div>
              {l.alvo && l.alvo !== "aeroporto" && (
                <div className="vav-cartao__alvo">
                  <dt>Indo para</dt>
                  <dd>{l.alvo}</dd>
                </div>
              )}
            </>
          )}
          <div>
            <dt>Atualizado</dt>
            <dd className="tabular">{l.idadeTxt}</dd>
          </div>
        </dl>
        {l.estado === "externo" && (
          <p className="vav-cartao__aviso is-externo">
            <Icon name="navigation" size={13} /> Navegando pelo {l.externo}. Enquanto isso o celular pausa o app da Luck: esta é a posição de quando ele saiu, e volta a
            atualizar quando ele abrir o app de novo.
          </p>
        )}
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
        <small className="vav-cartao__nota">
          {l.pelaRota ? "Distância e tempo pela rota do app do motorista, sem trânsito em tempo real." : "Distância e chegada são estimativas pela posição do celular."}
        </small>
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
            <button key={x.chave || x.id} type="button" className={`vav-faixa__item is-${l.estado}`} onClick={() => onAbrir?.(x.id)} title="Abrir o grupo com o mapa ao vivo">
              <i className="vav-ponto" aria-hidden="true" />
              <span>
                <span className="vav-faixa__l1">
                  <b>{String(x.v.motoristaNome || "Motorista").split(" ")[0]}</b> · {x.rotulo}
                </span>
                <small>{[rotulo(l) + (l.estado === "aovivo" ? "" : l.estado === "externo" ? ` · posição ${l.idadeTxt}` : ` ${l.idadeTxt}`), ...partesDaLeitura(l)].join(" · ")}</small>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};
