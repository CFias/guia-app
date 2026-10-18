import { Button, Card, CardHeader, Icon } from "../ui";
import { NOME_CATEGORIA, NOME_TIPO, formatarReais, textoDaRecomendacao } from "../../Services/Services/custosCalculo";
import { duracaoTexto } from "./custosDatas";

/* Recomendações de troca entre veículos (para formar serviço casado).
   O sistema não muda nada no Phoenix: mostra a troca, a conta e o texto
   para copiar. */

const Servico = ({ linha, veiculo, onAbrir }) => (
  <button type="button" className="cst-rec__srv" onClick={() => onAbrir?.(linha.chave)}>
    <span className={`ui-tag cst-tipo cst-tipo--${linha.tipo}`}>{NOME_TIPO[linha.tipo]}</span>
    <b className="tabular">{linha.hora}</b>
    <span className="cst-rec__desc">{linha.descricao}</span>
    {veiculo && <small>{veiculo}</small>}
  </button>
);

export const BlocoRecomendacao = ({ rec, onAbrir, onCopiar, compacto = false }) => (
  <div className={`cst-rec ${compacto ? "is-compacto" : ""} ${rec.restrita ? "is-restrita" : ""}`}>
    <div className="cst-rec__topo">
      <span className="cst-rec__selo">
        <Icon name="sparkles" size={13} />
        {rec.tipo === "troca" ? `Trocar com ${rec.para.veiculo}` : `Passar para ${rec.para.veiculo}`}
      </span>
      <b className="cst-eco tabular">
        −{formatarReais(rec.economia, { semCentavos: rec.economia >= 100 })} ({String(rec.pct).replace(".", ",")}%)
      </b>
    </div>

    <p className="cst-rec__texto">
      {rec.tipo === "troca" ? (
        <>
          <b>{rec.x.tipo} {rec.x.hora}</b> vai para <b>{rec.para.veiculo}</b>
          {rec.para.fornecedor ? ` (${rec.para.fornecedor})` : ""} e fica casado com o {NOME_TIPO[rec.par.tipo]} das{" "}
          {rec.par.hora}. Em troca, <b>{rec.de.veiculo}</b> recebe o {NOME_TIPO[rec.y.tipo]} das {rec.y.hora} — nenhum
          fornecedor fica sem serviço.
        </>
      ) : (
        <>
          <b>{rec.x.tipo} {rec.x.hora}</b> vai para <b>{rec.para.veiculo}</b>
          {rec.para.fornecedor ? ` (${rec.para.fornecedor})` : ""} e fica casado com o {NOME_TIPO[rec.par.tipo]} das{" "}
          {rec.par.hora}. <span className="cst-quase">{rec.de.veiculo} fica com um serviço a menos.</span>
        </>
      )}
    </p>

    {rec.restrita && (
      <div className="cst-rec__ressalva">
        <Icon name="info" size={13} />
        <span>
          <b>Pode não ser possível:</b>{" "}
          {rec.ressalvas.map((r) => `${r.servico} — reserva ${r.reserva}: “${r.texto}”`).join(" · ")}
        </span>
      </div>
    )}

    {!compacto && (
      <div className="cst-rec__servicos">
        <Servico linha={rec.par} veiculo={`${rec.para.veiculo} · já tem`} onAbrir={onAbrir} />
        <Servico linha={rec.x} veiculo={`${rec.de.veiculo} → ${rec.para.veiculo}`} onAbrir={onAbrir} />
        {rec.y && <Servico linha={rec.y} veiculo={`${rec.para.veiculo} → ${rec.de.veiculo}`} onAbrir={onAbrir} />}
      </div>
    )}

    <div className="cst-rec__rodape">
      <span className="tabular">
        {formatarReais(rec.antes, { semCentavos: true })} → {formatarReais(rec.depois, { semCentavos: true })} nos dois veículos ·
        intervalo {duracaoTexto(rec.intervalo)} · horários livres · {NOME_CATEGORIA[rec.para.categoria] || "mesma categoria"}
        {rec.para.lugares ? ` de ${rec.para.lugares} lugares` : ""}
      </span>
      {onCopiar && (
        <Button variant="ghost" size="sm" icon="copy" onClick={() => onCopiar(textoDaRecomendacao(rec))}>
          Copiar
        </Button>
      )}
    </div>
  </div>
);

const CardRecomendacoes = ({ recomendacoes, casadosHoje, economiaCasados, economiaRessalva = 0, regras, onAbrir, onCopiar }) => {
  const livres = recomendacoes.filter((r) => !r.restrita);
  const restritas = recomendacoes.filter((r) => r.restrita);
  const total = livres.reduce((s, r) => s + r.economia, 0);
  return (
    <Card className="cst-card">
      <CardHeader
        icon="sparkles"
        title="Recomendador de custo"
        subtitle={`Trocas entre veículos que formam serviço casado (${regras.regioes.join(", ") || "—"}, de ${duracaoTexto(regras.minHoras * 60)} a ${duracaoTexto(regras.maxHoras * 60)}): só carro com carro, van com van…, conferindo os lugares de cada veículo (cadastro de fornecedores), o horário livre e a observação das reservas.`}
      />
      <div className="cst-casados-resumo">
        <span>
          <b className="tabular">{casadosHoje}</b> par(es) casado(s) · {formatarReais(economiaCasados, { semCentavos: true })}
        </span>
        {total > 0 && (
          <span>
            possível <b className="cst-eco tabular">−{formatarReais(total, { semCentavos: true })}</b>
          </span>
        )}
        {economiaRessalva > 0 && (
          <span className="cst-quase">
            com ressalva −{formatarReais(economiaRessalva, { semCentavos: true })}
          </span>
        )}
      </div>
      {recomendacoes.length === 0 ? (
        <p className="cst-nada">Nenhuma troca que forme casado com horário livre — ou faltam tarifas casadas na tabela.</p>
      ) : (
        <div className="cst-rec-lista">
          {livres.map((r) => (
            <BlocoRecomendacao key={r.chave} rec={r} onAbrir={onAbrir} onCopiar={onCopiar} />
          ))}
          {restritas.length > 0 && (
            <>
              <p className="cst-rec-sep">
                Com ressalva — a observação da reserva pede fornecedor ou veículo específico. A economia é relativa: confira antes de trocar.
              </p>
              {restritas.map((r) => (
                <BlocoRecomendacao key={r.chave} rec={r} onAbrir={onAbrir} onCopiar={onCopiar} />
              ))}
            </>
          )}
        </div>
      )}
    </Card>
  );
};

export default CardRecomendacoes;
