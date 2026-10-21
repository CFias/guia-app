import { useMemo, useState } from "react";
import Icon from "../ui/Icon";
import Button from "../ui/Button";
import { aplicarEspeciais, descreverCombinacoes, recomendarVeiculo } from "./catalogo";
import { resumoSimulacao, simularBagagem, textoSimulacao, tipoDoVeiculo, veiculosSimulaveis } from "./simulacaoBagagem";
import Giro360 from "./Giro360";

/* Simulador de bagagem: o vendedor escolhe o veículo e vê o porta-malas
   enchendo com as malas do grupo (as mesmas quantidades do assistente).
   Vagas de 23 kg e de 10 kg de verdade da configuração do operacional;
   mala de 10 kg que sobra ocupa vaga de 23 kg livre; o que não cabe fica
   "do lado de fora", em vermelho. Também mostra os lugares. */

const fotoDe = (item) => {
  if (!item || item.veiculoForaCatalogo) return null;
  if (Array.isArray(item.imagensVeiculo) && item.imagensVeiculo.length) return item.imagensVeiculo[0];
  return item.imagemVeiculoUrl || null;
};

// mala desenhada (23 kg = grande; 10 kg = de bordo)
const Mala = ({ tipo = "grande", estado = "dentro" }) => (
  <svg viewBox="0 0 40 52" className={`sim-mala is-${tipo} is-${estado}`} aria-hidden="true">
    <rect x="14" y="2" width="12" height="7" rx="2.5" className="sim-mala__alca" />
    <rect x="4" y="8" width="32" height="38" rx="6" className="sim-mala__corpo" />
    <line x1="14" y1="13" x2="14" y2="41" className="sim-mala__friso" />
    <line x1="26" y1="13" x2="26" y2="41" className="sim-mala__friso" />
    {tipo === "grande" && (
      <>
        <circle cx="11" cy="48.5" r="2.6" className="sim-mala__roda" />
        <circle cx="29" cy="48.5" r="2.6" className="sim-mala__roda" />
      </>
    )}
  </svg>
);

// uma vaga do porta-malas
const Vaga = ({ tipo, conteudo }) => (
  <span className={`sim-vaga is-${tipo} ${conteudo.length ? "is-ocupada" : "is-livre"}`} title={conteudo.length ? undefined : `Vaga livre (${tipo === "grande" ? "23 kg" : "10 kg"})`}>
    {conteudo.length === 0 ? (
      <span className="sim-vaga__livre">{tipo === "grande" ? "23" : "10"}</span>
    ) : (
      conteudo.map((t, i) => <Mala key={i} tipo={t} />)
    )}
  </span>
);

const Lugar = ({ ocupado, fora }) => (
  <svg viewBox="0 0 24 24" className={`sim-lugar ${ocupado ? "is-ocupado" : ""} ${fora ? "is-fora" : ""}`} aria-hidden="true">
    <path d="M7 3h8a2 2 0 0 1 2 2v7H5V5a2 2 0 0 1 2-2Z" />
    <path d="M4 12h14a2 2 0 0 1 2 2v3H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z" />
    <path d="M6 17v4M17 17v4" />
  </svg>
);

const VEICULO_ICONE = { carro: "car", van: "truck", micro: "truck", onibus: "truck" };

const SimuladorBagagem = ({ config, veiculos = [], grupo, veiculoId, onVeiculo }) => {
  const [copiado, setCopiado] = useState(false);
  const [giro, setGiro] = useState(null); // item com o giro 360 aberto
  const lista = useMemo(() => veiculosSimulaveis(config), [config]);
  const { efetivo, consultar } = aplicarEspeciais(config, grupo);
  const fator = config.fatorBordoPorGrande;

  // sem escolha: o indicado para o grupo (ou o primeiro da lista)
  const indicado = useMemo(() => {
    const r = recomendarVeiculo(config, grupo);
    const nome = r.modo === "faixas" ? r.categoria?.nome : r.recomendada?.opcao?.nome;
    return nome ? lista.find((v) => v.nome.toLowerCase() === nome.toLowerCase()) : null;
  }, [config, grupo, lista]);
  const veiculo = lista.find((v) => v.id === veiculoId) || indicado || lista[0];

  if (!lista.length) {
    return (
      <div className="assist-vazio">
        <Icon name="settings" size={22} />
        <span>O operacional ainda não informou a capacidade de malas dos veículos (Central de Informações → Assistente de veículo).</span>
      </div>
    );
  }

  const s = simularBagagem(veiculo, efetivo, fator);
  const vinculados = veiculo.veiculosIds.map((id) => veiculos.find((v) => v.id === id)).filter(Boolean);
  const foto = vinculados.map(fotoDe).find(Boolean);
  const com360 = vinculados.find((v) => v.giro360?.arquivoId);
  const tipo = tipoDoVeiculo(veiculo.nome, veiculo.grupo);

  // vagas na ordem: as de 23 kg (com malas de 23, depois as que levam 10 kg, depois livres) e as de 10 kg
  const porVaga = Math.max(1, Math.floor(fator));
  const vagas = [];
  for (let i = 0; i < s.grandesDentro; i += 1) vagas.push({ tipo: "grande", conteudo: ["grande"] });
  let bordoEmGrandes = s.bordoNasVagasGrandes;
  for (let i = 0; i < s.vagasGrandesComBordo; i += 1) {
    const n = Math.min(porVaga, bordoEmGrandes);
    bordoEmGrandes -= n;
    vagas.push({ tipo: "grande", conteudo: Array.from({ length: n }, () => "bordo") });
  }
  for (let i = 0; i < s.vagasGrandesLivres; i += 1) vagas.push({ tipo: "grande", conteudo: [] });
  for (let i = 0; i < s.bordoNasVagasBordo; i += 1) vagas.push({ tipo: "bordo", conteudo: ["bordo"] });
  for (let i = 0; i < s.vagasBordoLivres; i += 1) vagas.push({ tipo: "bordo", conteudo: [] });
  const fora = [...Array.from({ length: s.grandesFora }, () => "grande"), ...Array.from({ length: s.bordoFora }, () => "bordo")];
  const totalVagas = vagas.length;
  const compacto = totalVagas > 16;

  const status = !s.cabe ? "nao" : s.noLimite || s.apertado ? "limite" : "ok";
  const texto = textoSimulacao(veiculo, s);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      alert("Não foi possível copiar.");
    }
  };

  const mostrarLugares = s.lugares > 0;
  const lugaresDesenho = mostrarLugares && s.lugares <= 19;

  return (
    <div className="sim">
      {/* escolha do veículo */}
      <div className="sim-escolha" role="radiogroup" aria-label="Veículo para simular">
        {lista.map((v) => {
          const vs = simularBagagem(v, efetivo, fator);
          const ok = vs?.cabe;
          return (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={v.id === veiculo.id}
              className={`sim-chip ${v.id === veiculo.id ? "is-on" : ""} ${ok ? "is-cabe" : "is-naocabe"}`}
              onClick={() => onVeiculo(v.id)}
              title={ok ? "O grupo cabe neste veículo" : "O grupo não cabe neste veículo"}
            >
              <Icon name={VEICULO_ICONE[tipoDoVeiculo(v.nome, v.grupo)]} size={14} />
              <span>{v.nome}</span>
              {(efetivo.pax > 0 || efetivo.grandes > 0 || efetivo.bordo > 0) && <i className="sim-chip__ponto" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      {/* veículo escolhido */}
      <div className="sim-veiculo">
        <span className="sim-veiculo__foto">{foto ? <img src={foto} alt="" /> : <Icon name={VEICULO_ICONE[tipo]} size={26} />}</span>
        <div className="sim-veiculo__info">
          <strong>
            {veiculo.nome}
            {indicado?.id === veiculo.id && (efetivo.pax > 0 || efetivo.grandes > 0) && (
              <span className="assist-tag is-ok">
                <Icon name="check" size={12} /> Indicado para o grupo
              </span>
            )}
          </strong>
          <small>
            {s.lugares ? `até ${s.lugares} passageiros · ` : ""}
            {descreverCombinacoes(veiculo.combinacoes)}
          </small>
          {veiculo.acessorio && <small className="sim-veiculo__acessorio">Inclui {veiculo.acessorio.toLowerCase()} — sujeito a disponibilidade</small>}
        </div>
        {com360 && (
          <button type="button" className="sim-360" onClick={() => setGiro(com360)}>
            <Icon name="refresh" size={14} /> Girar 360º
          </button>
        )}
      </div>

      {/* resultado */}
      <div className={`sim-status is-${status}`} aria-live="polite">
        <Icon name={status === "nao" ? "alert" : status === "limite" ? "alert" : "circleCheck"} size={18} />
        <span>
          <b>{resumoSimulacao(veiculo, s)}</b>
          {s.apertado && s.cabePax && <small> Passa do recomendado ({veiculo.paxIdeal} passageiros): fica apertado.</small>}
          {consultar.length > 0 && <small> Itens para o operacional analisar não entram na simulação.</small>}
        </span>
      </div>

      {mostrarLugares && (
        <div className="sim-bloco">
          <span className="sim-bloco__titulo">
            <Icon name="users" size={14} /> Lugares
            <em>
              {Math.min(s.pax, s.lugares)} de {s.lugares}
              {s.paxFora > 0 && <b className="sim-erro"> · faltam {s.paxFora}</b>}
            </em>
          </span>
          {lugaresDesenho ? (
            <div className="sim-lugares">
              {Array.from({ length: s.lugares }, (_, i) => (
                <Lugar key={i} ocupado={i < s.pax} />
              ))}
              {Array.from({ length: s.paxFora }, (_, i) => (
                <Lugar key={`f${i}`} ocupado fora />
              ))}
            </div>
          ) : (
            <div className="sim-barra-lugares" role="img" aria-label={`${s.pax} de ${s.lugares} lugares`}>
              <i style={{ width: `${Math.min(100, (s.pax / s.lugares) * 100)}%` }} className={s.paxFora ? "is-fora" : ""} />
            </div>
          )}
        </div>
      )}

      <div className="sim-bloco">
        <span className="sim-bloco__titulo">
          <Icon name="briefcase" size={14} /> {veiculo.acessorio ? `Porta-malas + ${veiculo.acessorio.toLowerCase()}` : "Porta-malas"}
          <em>
            {s.totalGrandes + s.totalBordo === 0
              ? "vazio"
              : `${s.grandesDentro + s.bordoNasVagasBordo + s.bordoNasVagasGrandes} de ${s.totalGrandes + s.totalBordo} malas dentro`}
          </em>
        </span>
        <div className={`sim-porta-malas is-${tipo} ${compacto ? "is-compacto" : ""} ${veiculo.acessorio ? "tem-acessorio" : ""}`}>
          {veiculo.acessorio === "Bagageiro" && <span className="sim-acessorio is-bagageiro">bagageiro</span>}
          <div className="sim-vagas">
            {vagas.map((v, i) => (
              <Vaga key={`${v.tipo}-${i}-${v.conteudo.join("")}`} tipo={v.tipo} conteudo={v.conteudo} />
            ))}
          </div>
          {veiculo.acessorio === "Carretinha" && <span className="sim-acessorio is-carretinha">inclui carretinha</span>}
        </div>
        {fora.length > 0 && (
          <div className="sim-fora">
            <span>Não cabem:</span>
            <div className="sim-fora__malas">
              {fora.map((t, i) => (
                <Mala key={i} tipo={t} estado="fora" />
              ))}
            </div>
          </div>
        )}
        <div className="sim-legenda">
          <span>
            <Mala tipo="grande" /> 23 kg
          </span>
          <span>
            <Mala tipo="bordo" /> 10 kg (mochila grande conta como 10 kg)
          </span>
          <span>
            <i className="sim-legenda__livre" /> vaga livre
          </span>
        </div>
      </div>

      {!s.cabe && indicado && indicado.id !== veiculo.id && (
        <button type="button" className="sim-sugestao" onClick={() => onVeiculo(indicado.id)}>
          <Icon name="sparkles" size={14} /> Para esse grupo, o indicado é <b>{indicado.nome}</b> — simular nele
        </button>
      )}

      <div className="assist-acoes">
        <Button variant="secondary" size="sm" icon="message" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener,noreferrer")}>
          WhatsApp
        </Button>
        <Button variant="primary" size="sm" icon={copiado ? "check" : "copy"} onClick={copiar}>
          {copiado ? "Copiado!" : "Copiar simulação"}
        </Button>
      </div>

      {giro && <Giro360 item={giro} onFechar={() => setGiro(null)} />}
    </div>
  );
};

export default SimuladorBagagem;
