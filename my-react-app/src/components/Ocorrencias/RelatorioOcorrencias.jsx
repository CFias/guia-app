import { useMemo, useState } from "react";
import { Button, Card, CardHeader, EmptyState, Icon } from "../ui";
import { NOME_TIPO } from "../../Services/Services/custosCalculo";
import {
  NOME_CATEGORIA_OCORRENCIA,
  NOME_IMPACTO,
  NOME_RESPONSAVEL,
  ocorrenciasParaCsv,
  resumirOcorrencias,
} from "../../Services/Services/ocorrenciasCalculo";
import { contarServicosPorFornecedor } from "../../Services/Services/ocorrenciasRepository";
import { TAMANHOS_FONTE_RELATORIO, escalaDaFonte } from "../ServicosFornecedor/relatorioHtml";
import { baixarArquivo, listarDatas } from "../CustosOperacionais/custosDatas";
import { COR_RESPONSAVEL, documentoOcorrencias, resumoEmTexto } from "./ocorrenciasRelatorioHtml";
import { abrirParaImprimir, gravarPreferencia, lerPreferencia, nomeDoMes } from "./ocorrenciasUtils";

const MAX_DIAS_CONTAGEM = 93;

const Barras = ({ itens, nomeDe, corDe, vazio = "Sem registros." }) => {
  if (!itens.length) return <p className="oco-muted">{vazio}</p>;
  const max = Math.max(...itens.map((i) => i.total), 1);
  return (
    <ul className="oco-barras">
      {itens.map((i) => (
        <li key={i.valor}>
          <span className="oco-barras-nome">{nomeDe(i.valor)}</span>
          <span className="oco-barras-trilho">
            <span style={{ width: `${(i.total / max) * 100}%`, background: corDe?.(i.valor) }} />
          </span>
          <strong>{i.total}</strong>
        </li>
      ))}
    </ul>
  );
};

const RelatorioOcorrencias = ({ lista, periodo, carregando, contexto }) => {
  const [fornecedorSel, setFornecedorSel] = useState("");
  const [contagem, setContagem] = useState(null); // { chave período, contagem }
  const [progresso, setProgresso] = useState(null);
  const [fonte, setFonte] = useState(() => lerPreferencia("ocorrencias_fonte_relatorio", "normal"));

  const chavePeriodo = `${periodo.inicio}_${periodo.fim}`;
  const servicosPorFornecedor = contagem?.chave === chavePeriodo ? contagem.contagem : null;

  const listaSel = useMemo(
    () => (fornecedorSel ? lista.filter((o) => o.fornecedorKey === fornecedorSel) : lista),
    [lista, fornecedorSel],
  );
  const resumo = useMemo(() => resumirOcorrencias(listaSel, { servicosPorFornecedor }), [listaSel, servicosPorFornecedor]);
  const resumoGeral = useMemo(() => resumirOcorrencias(lista, { servicosPorFornecedor }), [lista, servicosPorFornecedor]);
  const nomeSel = resumoGeral.porFornecedor.find((f) => f.chave === fornecedorSel)?.nome || "";

  const dias = listarDatas(periodo.inicio, periodo.fim).length;
  const podeContar = dias > 0 && dias <= MAX_DIAS_CONTAGEM && contexto.pronto;

  const contar = async () => {
    const datas = listarDatas(periodo.inicio, periodo.fim);
    setProgresso({ feitos: 0, total: datas.length });
    const { contagem: c, falhas } = await contarServicosPorFornecedor(datas, contexto, (feitos, total) =>
      setProgresso({ feitos, total }),
    );
    setContagem({ chave: chavePeriodo, contagem: c });
    setProgresso(null);
    if (falhas.length) alert(`Não foi possível consultar ${falhas.length} dia(s) no Phoenix; a taxa pode estar incompleta.`);
  };

  const imprimir = () =>
    abrirParaImprimir(
      documentoOcorrencias({
        resumo,
        lista: listaSel,
        inicio: periodo.inicio,
        fim: periodo.fim,
        fornecedor: fornecedorSel ? { chave: fornecedorSel, nome: nomeSel } : null,
        comServicos: !!servicosPorFornecedor,
        escalaFonte: escalaDaFonte(fonte),
      }),
    );

  const csv = () =>
    baixarArquivo(ocorrenciasParaCsv(listaSel), `ocorrencias_${periodo.inicio}_${periodo.fim}${fornecedorSel ? `_${fornecedorSel}` : ""}.csv`);

  const mudarFonte = (v) => {
    setFonte(v);
    gravarPreferencia("ocorrencias_fonte_relatorio", v);
  };

  if (carregando) return <EmptyState icon="loader" title="Carregando…" />;
  if (!lista.length) return <EmptyState icon="barChart" title="Sem ocorrências no período" />;

  const comServicos = !!servicosPorFornecedor;

  return (
    <div className="oco-rel">
      <div className="oco-rel-barra">
        <label className="oco-rel-campo">
          <span>Relatório de</span>
          <select value={fornecedorSel} onChange={(e) => setFornecedorSel(e.target.value)}>
            <option value="">Todos os fornecedores</option>
            {resumoGeral.porFornecedor.map((f) => (
              <option key={f.chave} value={f.chave}>
                {f.nome}
              </option>
            ))}
          </select>
        </label>
        <div className="oco-rel-acoes">
          {!fornecedorSel && (
            <Button
              icon={progresso ? "loader" : "scale"}
              onClick={contar}
              disabled={!podeContar || !!progresso}
              title={
                dias > MAX_DIAS_CONTAGEM
                  ? `Escolha um período de até ${MAX_DIAS_CONTAGEM} dias para comparar com o volume`
                  : "Consulta o Phoenix e calcula as falhas a cada 100 serviços de cada fornecedor"
              }
            >
              {progresso
                ? `Consultando ${progresso.feitos}/${progresso.total}…`
                : comServicos
                  ? "Volume atualizado"
                  : "Comparar com o volume"}
            </Button>
          )}
          <select className="oco-select-mini" value={fonte} onChange={(e) => mudarFonte(e.target.value)} aria-label="Tamanho da fonte">
            {TAMANHOS_FONTE_RELATORIO.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
          <Button icon="download" onClick={csv}>
            CSV
          </Button>
          <Button variant="primary" icon="printer" onClick={imprimir}>
            Imprimir
          </Button>
        </div>
      </div>

      <Card padded className="oco-rel-resumo">
        <span className="oco-rel-etq">
          <Icon name="sparkles" size={13} /> Resumo para a gerência
        </span>
        <p
          // texto montado aqui mesmo, com os nomes escapados
          dangerouslySetInnerHTML={{
            __html: resumoEmTexto(resumo, { inicio: periodo.inicio, fim: periodo.fim, fornecedor: nomeSel }),
          }}
        />
      </Card>

      {!fornecedorSel && (
        <Card className="oco-rel-ranking">
          <CardHeader
            icon="truck"
            title="Ranking de fornecedores"
            subtitle="Pontos = leve 1, média 3, grave 5 — só o que foi falha do próprio fornecedor."
          />
          <div className="oco-tabela-scroll">
            <table className="oco-tabela">
              <thead>
                <tr>
                  <th>Fornecedor</th>
                  <th className="num">Ocorrências</th>
                  <th className="num">Falha dele</th>
                  <th className="num">Graves</th>
                  <th className="num">Pontos</th>
                  {comServicos && <th className="num">Serviços</th>}
                  {comServicos && <th className="num">Falhas / 100</th>}
                  <th className="num">Atraso médio</th>
                  <th className="num">Elogios</th>
                  <th className="num">Em aberto</th>
                </tr>
              </thead>
              <tbody>
                {resumo.porFornecedor.map((f) => (
                  <tr key={f.chave} onClick={() => setFornecedorSel(f.chave)} title="Ver o relatório deste fornecedor">
                    <td>
                      <strong>{f.nome}</strong>
                    </td>
                    <td className="num">{f.total}</td>
                    <td className="num">
                      <strong>{f.contra}</strong>
                    </td>
                    <td className="num">{f.graves ? <span className="oco-pilula grave">{f.graves}</span> : 0}</td>
                    <td className="num">
                      <span className="oco-pontos">
                        <i style={{ width: `${Math.min(100, f.pontos * 6)}%` }} />
                        <strong>{f.pontos}</strong>
                      </span>
                    </td>
                    {comServicos && <td className="num">{f.servicos || "—"}</td>}
                    {comServicos && (
                      <td className="num">
                        <strong>{f.taxa !== null ? String(f.taxa).replace(".", ",") : "—"}</strong>
                      </td>
                    )}
                    <td className="num">{f.atrasos ? `${f.mediaAtraso} min` : "—"}</td>
                    <td className="num">{f.elogios ? <span className="oco-pilula pos">{f.elogios}</span> : 0}</td>
                    <td className="num">{f.abertas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="oco-rel-grade">
        <Card padded>
          <h3 className="oco-rel-tit">Por tipo de ocorrência</h3>
          <Barras itens={resumo.porCategoria} nomeDe={(v) => NOME_CATEGORIA_OCORRENCIA[v] || v} />
        </Card>
        <Card padded>
          <h3 className="oco-rel-tit">De quem foi a responsabilidade</h3>
          <Barras itens={resumo.porResponsavel} nomeDe={(v) => NOME_RESPONSAVEL[v] || v} corDe={(v) => COR_RESPONSAVEL[v]} />
        </Card>
        <Card padded>
          <h3 className="oco-rel-tit">Por tipo de serviço</h3>
          <Barras itens={resumo.porTipoServico} nomeDe={(v) => (v === "SEM" ? "Não informado" : NOME_TIPO[v] || v)} />
        </Card>
        <Card padded>
          <h3 className="oco-rel-tit">Impacto na operação</h3>
          <Barras itens={resumo.porImpacto} nomeDe={(v) => NOME_IMPACTO[v] || v} corDe={() => "var(--text-3)"} vazio="Nenhum impacto marcado." />
        </Card>
        {resumo.porMes.length > 1 && (
          <Card padded className="largo">
            <h3 className="oco-rel-tit">Por mês — falhas do fornecedor e elogios</h3>
            <ul className="oco-meses">
              {(() => {
                const max = Math.max(...resumo.porMes.map((m) => Math.max(m.contra, m.elogios)), 1);
                return resumo.porMes.map((m) => (
                  <li key={m.valor}>
                    <span className="oco-meses-col">
                      <i className="falha" style={{ height: `${(m.contra / max) * 100}%` }} title={`${m.contra} falha(s)`} />
                      <i className="elogio" style={{ height: `${(m.elogios / max) * 100}%` }} title={`${m.elogios} elogio(s)`} />
                    </span>
                    <small>{nomeDoMes(m.valor)}</small>
                  </li>
                ));
              })()}
            </ul>
            <p className="oco-legenda">
              <i className="falha" /> falhas do fornecedor <i className="elogio" /> elogios
            </p>
          </Card>
        )}
      </div>
    </div>
  );
};

export default RelatorioOcorrencias;
