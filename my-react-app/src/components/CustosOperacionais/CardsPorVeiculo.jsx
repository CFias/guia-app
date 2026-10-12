import { useMemo } from "react";
import { Icon } from "../ui";
import { NOME_CATEGORIA, NOME_TIPO, formatarReais } from "../../Services/Services/custosCalculo";
import { BlocoRecomendacao } from "./Recomendacoes";
import { idDoCardVeiculo } from "./custosDatas";

/* Custo do dia agrupado por veículo (como os cards da Prévia de transfers):
   cada card é um veículo com os serviços dele no dia, o total e, embaixo do
   serviço, a recomendação de troca quando houver. */

const ORIGEM = { lancado: "lançado", tarifa: "tabela", "tarifa-casada": "casado", "sem-tarifa": "sem tarifa" };

const LinhaServico = ({ linha, par, onAbrir }) => (
  <button
    type="button"
    className={`cst-vc__srv ${linha.pendencias.length ? "is-pendente" : ""}`}
    onClick={() => onAbrir(linha.chave)}
  >
    <span className="cst-vc__hora">
      <b className="tabular">{linha.hora || "--:--"}</b>
      <span className={`ui-tag cst-tipo cst-tipo--${linha.tipo}`}>{NOME_TIPO[linha.tipo]}</span> 
    </span>
    <span className="cst-vc__desc">
      <span className="cst-vc__nome">{linha.descricao}</span>
      <small>
        {[linha.regiaoTexto, `${linha.pax} pax`].filter(Boolean).join(" · ")}
        {linha.casado && (
          <span className="cst-chip-casado">
            <Icon name="refresh" size={11} />
            Casado{par ? ` · ${par.tipo} ${par.hora}` : ""}
          </span>
        )}
        {linha.apoio && <span className="cst-chip-apoio">Apoio · {linha.trechos} trecho(s)</span>}
        {linha.guiaNome && (
          <span className={`cst-chip-guia ${linha.guiaStatus === "a-confirmar" ? "is-pendente" : ""}`}>
            <Icon name="user" size={11} />
            {linha.guiaNome}
            {linha.guiaValor !== null ? ` · ${formatarReais(linha.guiaValor, { semCentavos: true })}` : " · a confirmar"}
          </span>
        )}
      </small>
    </span>
    <span className="cst-vc__valor">
      {linha.valorFornecedor === null ? (
        <span className="cst-origem cst-origem--sem-tarifa">Sem tarifa</span>
      ) : (
        <>
          <b className="tabular">{formatarReais(linha.valorFornecedor)}</b>
          <small className={`cst-origem cst-origem--${linha.origemValor}`}>
            {ORIGEM[linha.origemValor]}
            {linha.economia > 0 && <b className="cst-eco"> −{formatarReais(linha.economia, { semCentavos: true })}</b>}
          </small>
        </>
      )}
    </span>
  </button>
);

const CardsPorVeiculo = ({ linhas, porChave, recPorServico, destaque, onAbrir, onCopiar }) => {
  const grupos = useMemo(() => {
    const m = new Map();
    linhas.forEach((l) => {
      if (!m.has(l.veiculoKey)) {
        m.set(l.veiculoKey, { veiculoKey: l.veiculoKey, veiculo: l.veiculo, placa: l.placa, motorista: l.motorista, fornecedor: l.fornecedor, categoria: l.categoria, linhas: [] });
      }
      m.get(l.veiculoKey).linhas.push(l);
    });
    return Array.from(m.values())
      .map((g) => ({
        ...g,
        total: g.linhas.reduce((s, l) => s + (l.valorFornecedor || 0) + (l.guiaValor || 0), 0),
        economiaPossivel: g.linhas.reduce((s, l) => s + (recPorServico.get(l.chave)?.economia || 0), 0),
        pendentes: g.linhas.filter((l) => l.pendencias.length).length,
      }))
      .sort((a, b) => b.economiaPossivel - a.economiaPossivel || `${a.linhas[0].hora}`.localeCompare(`${b.linhas[0].hora}`));
  }, [linhas, recPorServico]);

  return (
    <div className="cst-vcards">
      {grupos.map((g) => (
        <article
          key={g.veiculoKey}
          id={idDoCardVeiculo(g.veiculoKey)}
          className={`cst-vc ${destaque === g.veiculoKey ? "is-destaque" : ""} ${g.economiaPossivel > 0 ? "tem-rec" : ""}`}
        >
          <header className="cst-vc__topo">
            <div className="cst-vc__titulo">
              <h3 title={g.veiculo}>{g.veiculo}</h3>
              <span>
                {g.fornecedor || <span className="cst-alerta-texto">Sem fornecedor</span>}
                {g.categoria ? ` · ${NOME_CATEGORIA[g.categoria]}` : " · categoria?"}
                {g.motorista ? ` · ${g.motorista}` : ""}
              </span>
            </div>
            <div className="cst-vc__total">
              <b className="tabular">{formatarReais(g.total)}</b>
              <small>
                {g.linhas.length} serviço(s){g.pendentes ? ` · ${g.pendentes} pendente(s)` : ""}
              </small>
            </div>
          </header>
          <ul className="cst-vc__lista">
            {g.linhas.map((l) => {
              const rec = recPorServico.get(l.chave);
              return (
                <li key={l.chave}>
                  <LinhaServico linha={l} par={l.parCasado ? porChave.get(l.parCasado) : null} onAbrir={onAbrir} />
                  {rec && <BlocoRecomendacao rec={rec} onAbrir={onAbrir} onCopiar={onCopiar} compacto />}
                </li>
              );
            })}
          </ul>
        </article>
      ))}
    </div>
  );
};

export default CardsPorVeiculo;
