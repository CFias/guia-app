// ocorrenciasRelatorioHtml.js
//
// Textos e HTML do relatório de ocorrências (tela e impressão). Usa o mesmo
// documento do relatório de Serviços por Fornecedor, para os dois saírem
// com a mesma cara.
import {
  documentoRelatorio,
  esc,
  htmlBarrasSimples,
  tagTipo,
} from "../ServicosFornecedor/relatorioHtml";
import {
  NOME_CATEGORIA_OCORRENCIA,
  NOME_GRAVIDADE,
  NOME_IMPACTO,
  NOME_RESPONSAVEL,
  ehPositiva,
  textoDaOcorrencia,
} from "../../Services/Services/ocorrenciasCalculo";
import { NOME_TIPO } from "../../Services/Services/custosCalculo";
import { nomeDoMes } from "./ocorrenciasUtils";

export const COR_RESPONSAVEL = {
  fornecedor: "#c4566d",
  passageiro: "#3f6fd1",
  operacao: "#c98a1b",
  externo: "#7f8a88",
};
export const COR_GRAVIDADE = { leve: "#c98a1b", media: "#d46a2c", grave: "#b3261e" };

const num = (n = 0) => Number(n || 0).toLocaleString("pt-BR");
const reais = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (iso = "") => {
  const [a, m, d] = String(iso).split("-");
  return a ? `${d}/${m}/${a}` : "";
};
const dataCurta = (iso = "") => {
  const [, m, d] = String(iso).split("-");
  return m ? `${d}/${m}` : "";
};

const juntar = (itens) =>
  itens.length <= 1 ? itens.join("") : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;

// Resumo em linguagem simples, para a gerência. Devolve HTML (com <b>).
// fornecedor: quando o relatório é de um fornecedor só.
export const resumoEmTexto = (r, { inicio, fim, fornecedor = "" } = {}) => {
  const b = (t) => `<b>${esc(t)}</b>`;
  const periodo = `${b(dataBr(inicio))} a ${b(dataBr(fim))}`;
  if (!r.total) {
    return `No período de ${periodo} não há ocorrências registradas${fornecedor ? ` para ${b(fornecedor)}` : ""}.`;
  }
  const partes = [];
  const quem = fornecedor ? ` com ${b(fornecedor)}` : "";
  partes.push(
    `No período de ${periodo} foram registradas ${b(`${num(r.negativas)} ocorrência(s)`)}${quem}` +
      (r.negativas
        ? ` — ${b(num(r.contraFornecedor))} por falha do fornecedor${r.graves ? `, ${b(num(r.graves))} grave(s)` : ""}`
        : "") +
      (r.elogios ? ` — e ${b(`${num(r.elogios)} elogio(s)`)}` : "") +
      ".",
  );

  if (!fornecedor) {
    const comFalha = r.porFornecedor.filter((f) => f.contra > 0);
    if (comFalha.length) {
      const [primeiro, ...resto] = comFalha;
      let frase = `O fornecedor que mais pesou foi ${b(primeiro.nome)} (${num(primeiro.contra)} falha(s), ${num(
        primeiro.pontos,
      )} ponto(s)${primeiro.taxa !== null && primeiro.taxa !== undefined ? `, ${String(primeiro.taxa).replace(".", ",")} a cada 100 serviços` : ""})`;
      if (resto.length) frase += `, seguido de ${juntar(resto.slice(0, 2).map((f) => `${b(f.nome)} (${num(f.contra)})`))}`;
      partes.push(`${frase}.`);
    }
    const semFalha = r.porFornecedor.filter((f) => f.contra === 0 && f.elogios > 0);
    if (semFalha.length) partes.push(`${juntar(semFalha.slice(0, 3).map((f) => b(f.nome)))} só tiveram elogios.`);
  }

  const cat = r.porCategoria[0];
  if (cat) {
    let frase = `O tipo mais comum foi ${b(NOME_CATEGORIA_OCORRENCIA[cat.valor] || cat.valor)} (${num(cat.total)} de ${num(
      r.negativas,
    )})`;
    if (r.atrasos) frase += `; o atraso médio foi de ${b(`${r.mediaAtraso} min`)}`;
    partes.push(`${frase}.`);
  }
  const resp = r.porResponsavel.filter((x) => x.valor !== "fornecedor");
  if (resp.length && r.negativas) {
    partes.push(
      `Não foram culpa do fornecedor: ${juntar(
        resp.map((x) => `${num(x.total)} ${(NOME_RESPONSAVEL[x.valor] || x.valor).toLowerCase()}`),
      )}.`,
    );
  }
  if (r.contatosPax) partes.push(`Em ${b(num(r.contatosPax))} caso(s) a operação precisou contatar o passageiro.`);
  if (r.custoExtra) partes.push(`Custo extra gerado: ${b(reais(r.custoExtra))}.`);
  if (r.abertas) partes.push(`${b(num(r.abertas))} ainda em aberto.`);
  return partes.join(" ");
};

export const kpisDoResumo = (r) => [
  { rotulo: "Ocorrências", valor: num(r.negativas) },
  { rotulo: "Falha do fornecedor", valor: num(r.contraFornecedor) },
  { rotulo: "Graves", valor: num(r.graves) },
  { rotulo: "Atraso médio", valor: r.atrasos ? `${r.mediaAtraso} min` : "—" },
  { rotulo: "Contato com pax", valor: num(r.contatosPax) },
  { rotulo: "Em aberto", valor: num(r.abertas) },
  { rotulo: "Elogios", valor: num(r.elogios) },
];

const barras = (lista, nomeDe, corDe) =>
  htmlBarrasSimples(
    lista.map((x) => ({ nome: nomeDe(x.valor), total: x.total, cor: corDe ? corDe(x.valor) : undefined })),
  );

const CSS_EXTRA = `
  .oc-lista td.texto { color: #4d5856; line-height: 1.45; }
  .oc-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 4px; vertical-align: 1px; }
  .oc-et { display: inline-block; padding: 0 5px; border-radius: 4px; font-size: 8px; font-weight: 700; background: #f3e3e6; color: #8f2f44; }
  .oc-et.pos { background: #e4f1ee; color: #0f6b63; }
  .oc-legenda { margin: 6px 0 0; color: #7f8a88; font-size: 8.5px; }
`;

const linhaRanking = (f, comServicos) => `<tr>
  <td><strong>${esc(f.nome)}</strong></td>
  <td class="num">${num(f.total)}</td>
  <td class="num"><strong>${num(f.contra)}</strong></td>
  <td class="num">${f.graves ? `<span class="oc-et">${num(f.graves)}</span>` : "0"}</td>
  <td class="num"><strong>${num(f.pontos)}</strong></td>
  ${comServicos ? `<td class="num">${f.servicos ? num(f.servicos) : "—"}</td><td class="num"><strong>${f.taxa !== null ? String(f.taxa).replace(".", ",") : "—"}</strong></td>` : ""}
  <td class="num">${f.atrasos ? `${f.mediaAtraso} min` : "—"}</td>
  <td class="num">${f.elogios ? `<span class="oc-et pos">${num(f.elogios)}</span>` : "0"}</td>
  <td class="num">${num(f.abertas)}</td>
</tr>`;

const tabelaRanking = (r, comServicos) => `<section class="secao">
  <h2>Ranking de fornecedores</h2>
  <table>
    <thead><tr>
      <th>Fornecedor</th><th class="num">Ocorrências</th><th class="num">Falha dele</th><th class="num">Graves</th><th class="num">Pontos</th>
      ${comServicos ? '<th class="num">Serviços</th><th class="num">Falhas / 100 serv.</th>' : ""}
      <th class="num">Atraso médio</th><th class="num">Elogios</th><th class="num">Em aberto</th>
    </tr></thead>
    <tbody>${r.porFornecedor.map((f) => linhaRanking(f, comServicos)).join("")}</tbody>
  </table>
  <p class="oc-legenda">Pontos: leve 1, média 3, grave 5 — só o que foi falha do próprio fornecedor (atraso de voo, trânsito ou erro nosso não pesa).</p>
</section>`;

const tabelaOcorrencias = (lista, { titulo = "Ocorrências", mostrarFornecedor = true } = {}) => `<section>
  <h2>${esc(titulo)}</h2>
  <table class="oc-lista">
    <thead><tr><th>Data</th>${mostrarFornecedor ? "<th>Fornecedor</th>" : ""}<th>Ocorrência</th><th>Responsável</th><th>O que aconteceu</th></tr></thead>
    <tbody>${lista
      .map(
        (o) => `<tr>
      <td class="num">${dataCurta(o.data)}${o.hora ? `<div class="mini">${esc(o.hora)}</div>` : ""}</td>
      ${mostrarFornecedor ? `<td><strong>${esc(o.fornecedor)}</strong>${o.veiculo ? `<div class="mini">${esc(o.veiculo)}</div>` : ""}</td>` : ""}
      <td>${o.tipoServico ? `${tagTipo(o.tipoServico === "SERVICO" ? "TRF" : o.tipoServico)} ` : ""}<strong>${esc(
        NOME_CATEGORIA_OCORRENCIA[o.categoria] || o.categoria,
      )}</strong>${o.categoria === "atraso" && o.atrasoMin ? ` · ${num(o.atrasoMin)} min` : ""}${
        o.gravidade ? `<div class="mini"><i class="oc-dot" style="background:${COR_GRAVIDADE[o.gravidade]}"></i>${esc(NOME_GRAVIDADE[o.gravidade])}</div>` : ""
      }</td>
      <td>${ehPositiva(o) ? "—" : esc(NOME_RESPONSAVEL[o.responsavel] || "")}${
        o.status === "resolvida" && !ehPositiva(o) ? '<div class="mini">resolvida</div>' : ""
      }</td>
      <td class="texto">${esc(textoDaOcorrencia(o))}</td>
    </tr>`,
      )
      .join("")}</tbody>
  </table>
</section>`;

const agora = () =>
  new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

// Documento para imprimir. fornecedor = { chave, nome } → relatório de um
// fornecedor só (com todas as ocorrências e o texto de cada uma).
export const documentoOcorrencias = ({ resumo, lista, inicio, fim, fornecedor = null, comServicos = false, escalaFonte = 1 }) => {
  const periodo = `${dataBr(inicio)} a ${dataBr(fim)}`;
  const graficos = [];
  if (!fornecedor && resumo.porFornecedor.some((f) => f.pontos > 0)) {
    graficos.push({
      titulo: "Pontos de falha por fornecedor",
      html: htmlBarrasSimples(
        resumo.porFornecedor
          .filter((f) => f.pontos > 0)
          .slice(0, 12)
          .map((f) => ({ nome: f.nome, total: f.pontos, cor: COR_RESPONSAVEL.fornecedor })),
      ),
    });
  }
  if (resumo.porCategoria.length) {
    graficos.push({
      titulo: "Por tipo de ocorrência",
      html: barras(resumo.porCategoria, (v) => NOME_CATEGORIA_OCORRENCIA[v] || v),
    });
  }
  if (resumo.porResponsavel.length) {
    graficos.push({
      titulo: "De quem foi a responsabilidade",
      html: barras(resumo.porResponsavel, (v) => NOME_RESPONSAVEL[v] || v, (v) => COR_RESPONSAVEL[v]),
    });
  }
  if (resumo.porTipoServico.length) {
    graficos.push({
      titulo: "Por tipo de serviço",
      html: barras(resumo.porTipoServico, (v) => (v === "SEM" ? "Não informado" : NOME_TIPO[v] || v)),
    });
  }
  if (resumo.porMes.length > 1) {
    graficos.push({
      titulo: "Por mês (falhas do fornecedor)",
      largo: true,
      html: htmlBarrasSimples(
        resumo.porMes.map((m) => ({ nome: nomeDoMes(m.valor), total: m.contra, cor: COR_RESPONSAVEL.fornecedor })),
      ),
    });
  }
  if (resumo.porImpacto.length) {
    graficos.push({
      titulo: "Impacto na operação",
      html: barras(resumo.porImpacto, (v) => NOME_IMPACTO[v] || v, () => "#4d5856"),
    });
  }

  const graves = lista.filter((o) => o.gravidade === "grave" && !ehPositiva(o));
  const corpo = fornecedor
    ? tabelaOcorrencias(
        [...lista].sort((a, b) => `${a.data} ${a.hora}`.localeCompare(`${b.data} ${b.hora}`)),
        { titulo: "Todas as ocorrências do período", mostrarFornecedor: false },
      )
    : `${tabelaRanking(resumo, comServicos)}${graves.length ? tabelaOcorrencias(graves, { titulo: "Ocorrências graves" }) : ""}`;

  return documentoRelatorio({
    marca: "Operacional SSA · Ocorrências de fornecedores",
    titulo: fornecedor ? fornecedor.nome : "Ocorrências de fornecedores",
    subtitulo: fornecedor ? "Histórico de ocorrências do fornecedor" : `${num(resumo.porFornecedor.length)} fornecedor(es) com registro`,
    resumo: resumoEmTexto(resumo, { inicio, fim, fornecedor: fornecedor?.nome || "" }),
    periodo,
    geradoEm: agora(),
    kpis: kpisDoResumo(resumo),
    graficos,
    corpo,
    rodape:
      "Registros feitos pela equipe operacional no FiaSystem. Responsável = de quem foi a falha; só o que foi falha do fornecedor pesa no ranking.",
    css: CSS_EXTRA,
    escalaFonte,
  });
};
