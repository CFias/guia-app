// plannerExport.js
//
// A "planilha" da escala semanal (Gerar Escala → Abrir planilha / Salvar no
// Drive). Um único formato de dados alimenta as três saídas:
//   - a página que abre em nova aba (por dia, com totais e pendências);
//   - o Excel (.xlsx) baixado dali;
//   - a aba do período na planilha de histórico do Google Drive.

import * as XLSX from "xlsx";
import logoLuck from "../../assets/clover.png";
import {
  SITUACAO_ESCALA,
  entregarImagem,
  gerarImagemEscala,
} from "./escalaImagem";
import { registrarImpressao } from "./atividadeRepository";

// Situação do serviço, a partir da classe que o Gerar Escala já usa.
const TIPO_POR_CLASSE = {
  "status-fechado": "fechado",
  "status-privativo": "privativo",
  "status-formado": "formado",
  "status-alerta": "formar",
};

export const STATUS_ESCALA = {
  formado: { texto: "Grupo formado", cor: "#1a7f37", fundo: "#e6f4ea" },
  formar: { texto: "Formar grupo", cor: "#9a6700", fundo: "#fff4d6" },
  privativo: { texto: "Privativo", cor: "#4338ca", fundo: "#eef0ff" },
  fechado: { texto: "Passeio fechado", cor: "#b42318", fundo: "#fde8e6" },
};

const DIA_CURTO = {
  Segunda: "SEG",
  Terça: "TER",
  Quarta: "QUA",
  Quinta: "QUI",
  Sexta: "SEX",
  Sábado: "SÁB",
  Domingo: "DOM",
};

const dataBr = (iso = "") => {
  const [a, m, d] = String(iso).split("-");
  return a && m && d ? `${d}/${m}/${a}` : "";
};

const ddmm = (iso = "") => dataBr(iso).slice(0, 5);

export const periodoDaSemana = (semana = []) => {
  const ini = semana[0]?.date || "";
  const fim = semana[semana.length - 1]?.date || "";
  return {
    inicio: ini,
    fim,
    // "20/10 a 26/10/2026"
    texto: ini && fim ? `${ddmm(ini)} a ${dataBr(fim)}` : "",
    // nome da aba no Drive (a barra não é permitida): "20.10 a 26.10.2026"
    aba:
      ini && fim
        ? `${ddmm(ini).replace("/", ".")} a ${dataBr(fim).replace(/\//g, ".")}`
        : "Escala",
  };
};

const idiomasTexto = (idiomas = {}) =>
  Object.entries(idiomas || {})
    .filter(([, n]) => Number(n) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map(([sigla]) => String(sigla).toUpperCase())
    .join(" · ");

// ---------------------------------------------------------------------
// Dados da escala: um item por dia, com os serviços e os totais do dia.
// ---------------------------------------------------------------------
export const construirEscalaPorDia = ({
  semana = [],
  extras = {},
  agruparRegistrosPorServico,
  getTextoStatusServico,
  getClasseStatusServico,
}) =>
  semana.map((dia) => {
    const servicos = agruparRegistrosPorServico(extras[dia.date] || []).map(
      (item) => {
        const classe = getClasseStatusServico
          ? getClasseStatusServico(item)
          : "";
        const tipo = TIPO_POR_CLASSE[classe] || "formar";
        return {
          passeio: item.serviceName || "-",
          guia: item.guiaNome || "",
          pax: Number(item.passengers || 0),
          adultos: Number(item.adultCount || 0),
          criancas: Number(item.childCount || 0),
          infantes: Number(item.infantCount || 0),
          idiomas: idiomasTexto(item.idiomas),
          status: getTextoStatusServico(item),
          statusClass: classe,
          tipo,
        };
      },
    );

    const precisaGuia = (s) => s.tipo !== "fechado";
    return {
      date: dia.date,
      dia: dia.day,
      diaCurto:
        DIA_CURTO[dia.day] ||
        String(dia.day || "")
          .slice(0, 3)
          .toUpperCase(),
      data: dataBr(dia.date),
      label: dia.label,
      servicos,
      totais: {
        servicos: servicos.length,
        pax: servicos.reduce((acc, s) => acc + s.pax, 0),
        semGuia: servicos.filter((s) => precisaGuia(s) && !s.guia).length,
        formar: servicos.filter((s) => s.tipo === "formar").length,
      },
    };
  });

export const totaisDaEscala = (dias = []) =>
  dias.reduce(
    (acc, d) => ({
      servicos: acc.servicos + d.totais.servicos,
      pax: acc.pax + d.totais.pax,
      semGuia: acc.semGuia + d.totais.semGuia,
      formar: acc.formar + d.totais.formar,
      guias: new Set([
        ...acc.guias,
        ...d.servicos.map((s) => s.guia).filter(Boolean),
      ]),
    }),
    { servicos: 0, pax: 0, semGuia: 0, formar: 0, guias: new Set() },
  );

// Formato antigo (uma linha por serviço) — mantido para quem ainda usa.
export const construirDadosEscala = (args) =>
  construirEscalaPorDia(args).flatMap((d) =>
    d.servicos.length
      ? d.servicos.map((s) => ({
          data: d.label,
          passeio: s.passeio,
          guia: s.guia || "-",
          pax: s.pax,
          status: s.status,
          statusClass: s.statusClass,
        }))
      : [{ data: d.label, passeio: "-", guia: "-", pax: "-", status: "-" }],
  );

// ---------------------------------------------------------------------
// Excel: tabela "achatada" (dia e data em toda linha), boa para filtrar.
// ---------------------------------------------------------------------
export const construirWorkbookEscala = (dias = [], semana = []) => {
  const periodo = periodoDaSemana(semana.length ? semana : dias);
  const tot = totaisDaEscala(dias);
  const cab = [
    "DIA",
    "DATA",
    "PASSEIO",
    "GUIA",
    "PAX",
    "ADT",
    "CHD",
    "INF",
    "IDIOMAS",
    "STATUS",
    "OBSERVAÇÕES",
  ];
  const linhas = [
    [`Escala semanal de passeios · ${periodo.texto}`],
    [
      `${tot.servicos} passeios · ${tot.pax} pax · ${tot.semGuia} sem guia · ${tot.formar} para formar grupo`,
    ],
    [],
    cab,
  ];

  dias.forEach((d) => {
    if (!d.servicos.length) {
      linhas.push([
        d.dia,
        d.data,
        "Sem passeios",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ]);
      return;
    }
    d.servicos.forEach((s) =>
      linhas.push([
        d.dia,
        d.data,
        s.passeio,
        s.guia || "SEM GUIA",
        s.pax,
        s.adultos || "",
        s.criancas || "",
        s.infantes || "",
        s.idiomas,
        s.status,
        "",
      ]),
    );
  });

  const planilha = XLSX.utils.aoa_to_sheet(linhas);
  planilha["!cols"] = [10, 11, 40, 22, 6, 6, 6, 6, 14, 16, 30].map((wch) => ({
    wch,
  }));
  planilha["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: cab.length - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: cab.length - 1 } },
  ];
  planilha["!autofilter"] = { ref: `A4:K${linhas.length}` };

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, planilha, periodo.aba.slice(0, 31));
  return workbook;
};

export const nomeArquivoEscala = (semana = []) =>
  `Escala semanal ${periodoDaSemana(semana).aba}`;

// ---------------------------------------------------------------------
// Página em nova aba
// ---------------------------------------------------------------------
const esc = (t) =>
  String(t ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Mesmo visual da imagem baixada (escalaImagem.js): faixa verde, números da
// semana, uma tabela DATA | PASSEIO | GUIA | IDIOMAS | PAX | SITUAÇÃO com a
// data mesclada por dia. O que aparece na tela é o que vai na imagem.
const CSS = `
:root { --tx:#1f2328; --t2:#57606a; --t3:#8c959f; --ln:#e1e4e8; --bg:#f4f5f7; --cd:#fff; --verde:#14532d; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--tx); font: 14px/1.35 "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
.topo { background: var(--verde); color: #fff; }
.topo-in { max-width: 1120px; margin: 0 auto; padding: 20px 16px; display: flex; flex-wrap: wrap; align-items: center; gap: 14px 18px; }
.logo { width: 56px; height: 56px; border-radius: 50%; background: #fff; display: grid; place-items: center; flex: none; }
.logo img { width: 38px; height: 38px; }
.marca { font-size: 12px; font-weight: 600; letter-spacing: .04em; opacity: .75; }
.topo h1 { margin: 2px 0; font-size: 28px; font-weight: 800; letter-spacing: -.01em; }
.periodo { opacity: .88; font-size: 15px; }
.acoes { margin-left: auto; display: flex; flex-wrap: wrap; gap: 8px; }
.bt { border: 1px solid rgba(255,255,255,.45); background: transparent; color: #fff; border-radius: 8px; padding: 9px 14px; font: 600 13px inherit; font-family: inherit; cursor: pointer; }
.bt:hover { background: rgba(255,255,255,.12); }
.bt.pri { background: #fff; color: var(--verde); border-color: #fff; }
.bt[disabled], .bt-img[disabled] { opacity: .6; cursor: progress; }
.pg { max-width: 1120px; margin: 0 auto; padding: 18px 16px 40px; }
.res { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 12px; margin-bottom: 14px; }
.tile { background: var(--cd); border: 1.5px solid var(--ln); border-radius: 12px; padding: 10px 16px; }
.tile span { display: block; color: var(--t2); font-size: 13px; font-weight: 600; }
.tile b { font-size: 26px; font-weight: 800; font-variant-numeric: tabular-nums; }
.tile.ok b { color: #1a7f37; }
.tile.formar { background: #fff4cc; border-color: #e0a800; } .tile.formar b { color: #8a5a00; }
.filtros { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 14px; }
.filtros .f { border: 1px solid #d0d7de; background: var(--cd); border-radius: 999px; padding: 5px 12px; font: 600 12.5px inherit; font-family: inherit; color: var(--t2); cursor: pointer; }
.filtros .f[aria-pressed="true"] { background: var(--verde); border-color: var(--verde); color: #fff; }
.op { margin-left: 8px; display: inline-flex; align-items: center; gap: 6px; color: var(--t2); font-size: 13px; cursor: pointer; }
.filtros input[type="search"] { margin-left: auto; min-width: 240px; border: 1px solid #d0d7de; border-radius: 8px; padding: 7px 10px; font: inherit; }
.tabela { background: var(--cd); border: 2px solid #adb5bd; border-radius: 14px; overflow: hidden; }
.rolagem { overflow-x: auto; }
table { width: 100%; min-width: 940px; border-collapse: collapse; table-layout: fixed; }
thead th { background: var(--verde); color: #fff; font-size: 12px; font-weight: 800; letter-spacing: .04em; text-align: left; padding: 12px 14px; }
th.c, td.c { text-align: center; }
td { padding: 8px 14px; border-top: 1px solid #eaecef; vertical-align: middle; }
tbody.dia:nth-of-type(even) td { background: #f6f8fa; }
tbody.dia + tbody.dia { border-top: 3px solid #6e7781; }
td.data { border-right: 2px solid var(--ln); text-align: center; vertical-align: middle; }
td.data b { display: block; font-size: 24px; font-weight: 800; line-height: 1.1; }
td.data span { display: block; font-size: 12px; font-weight: 700; color: var(--t2); letter-spacing: .04em; }
.bt-img { white-space: nowrap; margin-top: 8px; border: 1px solid #d0d7de; background: var(--cd); color: var(--t2); border-radius: 6px; padding: 3px 8px; font: 600 11px inherit; font-family: inherit; cursor: pointer; }
.bt-img:hover { color: var(--tx); }
.passeio { font-weight: 700; font-size: 15px; }
.guia { font-weight: 600; } .guia.vazio { color: var(--t3); font-weight: 400; }
.idi { color: var(--t2); font-weight: 700; font-size: 13px; }
.pax { font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; }
.pax.formar { color: #8a5a00; }
.sit { display: inline-block; min-width: 168px; border: 2px solid; border-radius: 999px; padding: 4px 12px; font-size: 13px; font-weight: 800; text-align: center; white-space: nowrap; }
.vazio-dia { color: var(--t3); font-style: italic; }
.sem-guias .col-guia { display: none; }
.nota { margin-top: 14px; color: var(--t2); font-size: 13px; }
.nota small { display: block; color: var(--t3); margin-top: 4px; font-size: 12px; }
.nada { padding: 30px; text-align: center; color: var(--t3); }
@media (max-width: 720px) {
  .topo h1 { font-size: 22px; }
  .acoes { margin-left: 0; width: 100%; }
  .res { grid-template-columns: repeat(2, minmax(0,1fr)); }
  .filtros input[type="search"] { margin-left: 0; min-width: 0; width: 100%; }
}
@media print {
  @page { size: A4 portrait; margin: 8mm; }
  body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .acoes, .filtros, .bt-img { display: none !important; }
  .pg { padding: 10px 0 0; }
  table { min-width: 0; }
  tr { break-inside: avoid; }
}
`;

const pillSituacao = (s) => {
  const sit = SITUACAO_ESCALA[s.tipo] || SITUACAO_ESCALA.formar;
  const texto = `${sit.marca ? `${sit.marca} ` : ""}${sit.cheio ? sit.texto.toUpperCase() : sit.texto}`;
  return `<span class="sit" style="color:${sit.cor};background:${sit.fundo};border-color:${sit.borda}">${esc(texto)}</span>`;
};

const linhasDoDia = (d) => {
  const celulaData = `<td class="data" rowspan="${Math.max(1, d.servicos.length)}"><b>${esc(ddmm(d.date))}</b><span>${esc(String(d.dia || "").toUpperCase())}</span>${
    d.servicos.length
      ? `<button class="bt-img" type="button" data-img="${esc(d.date)}" title="Baixar a imagem só deste dia">↓ Imagem</button>`
      : ""
  }</td>`;
  if (!d.servicos.length) {
    return `<tr>${celulaData}<td class="vazio-dia" colspan="5">Sem passeios</td></tr>`;
  }
  return d.servicos
    .map((s, i) => {
      const semGuia = !s.guia && s.tipo !== "fechado";
      const formar = s.tipo === "formar";
      return `<tr data-semguia="${semGuia ? 1 : 0}" data-formar="${formar ? 1 : 0}" data-pend="${semGuia || formar ? 1 : 0}" data-busca="${esc(`${s.passeio} ${s.guia}`.toLowerCase())}">${i === 0 ? celulaData : ""}
<td class="passeio">${esc(s.passeio)}</td>
<td class="guia col-guia${s.guia ? "" : " vazio"}">${s.guia ? esc(s.guia) : "—"}</td>
<td class="idi">${esc(s.idiomas || "—")}</td>
<td class="pax c${formar ? " formar" : ""}">${s.pax}</td>
<td class="c">${pillSituacao(s)}</td></tr>`;
    })
    .join("");
};

export const montarHtmlEscala = (dias = [], semana = []) => {
  const periodo = periodoDaSemana(semana.length ? semana : dias);
  const tot = totaisDaEscala(dias);
  const formados = dias.reduce(
    (a, d) => a + d.servicos.filter((s) => s.tipo === "formado").length,
    0,
  );
  const agora = new Date();
  const gerado = `${agora.toLocaleDateString("pt-BR")} às ${agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;

  const corpo = dias
    .map(
      (d) =>
        `<tbody class="dia" data-dia="${esc(d.date)}">${linhasDoDia(d)}</tbody>`,
    )
    .join("");

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Passeios da semana ${esc(periodo.texto)}</title><style>${CSS}</style></head><body>
<header class="topo"><div class="topo-in">
<div class="logo"><img src="${logoLuck}" alt=""></div>
<div><div class="marca">LUCK RECEPTIVO · SALVADOR</div><h1>Passeios da semana</h1><div class="periodo">${esc(periodo.texto)}</div></div>
<div class="acoes"><button class="bt" type="button" onclick="window.print()">Imprimir / PDF</button><button class="bt" type="button" id="bt-excel">Baixar Excel</button><button class="bt pri" type="button" id="bt-img" title="Imagem igual a esta tela, para mandar ao comercial (segue os filtros)">Baixar imagem</button></div>
</div></header>
<div class="pg">
<div class="res">
<div class="tile"><span>Passeios</span><b>${tot.servicos}</b></div>
<div class="tile"><span>Pax</span><b>${tot.pax}</b></div>
<div class="tile ok"><span>Grupos formados</span><b>${formados}</b></div>
<div class="tile formar"><span>Formar grupo</span><b>${tot.formar}</b></div>
</div>
<div class="filtros" role="toolbar" aria-label="Filtrar">
<button class="f" type="button" data-f="todos" aria-pressed="true">Todos</button>
<button class="f" type="button" data-f="formar" aria-pressed="false">Formar grupo</button>
<button class="f" type="button" data-f="semguia" aria-pressed="false">Sem guia</button>
<button class="f" type="button" data-f="pend" aria-pressed="false">Só pendências</button>
<label class="op"><input type="checkbox" id="img-guias" checked> Mostrar guias</label>
<input type="search" placeholder="Buscar passeio ou guia" aria-label="Buscar passeio ou guia">
</div>
<div class="tabela"><div class="rolagem"><table>
<colgroup><col style="width:120px"><col><col class="col-guia" style="width:150px"><col style="width:120px"><col style="width:76px"><col style="width:210px"></colgroup>
<thead><tr><th class="c">DATA</th><th>PASSEIO</th><th class="col-guia">GUIA</th><th>IDIOMAS</th><th class="c">PAX</th><th class="c">SITUAÇÃO</th></tr></thead>
${corpo}
</table></div></div>
<p class="nada" id="nada" hidden>Nenhum passeio com esse filtro.</p>
<p class="nota">FORMAR GRUPO = passeio que ainda precisa de mais pax para sair.<small>Gerada em ${esc(gerado)} · ${esc(periodo.texto)}</small></p>
</div>
<script>
(function () {
  var filtro = "todos", busca = "";
  function aplicar() {
    var filtrando = filtro !== "todos" || busca, algum = false;
    document.querySelectorAll("tbody.dia").forEach(function (tb) {
      var celula = tb.querySelector("td.data");
      var linhas = Array.prototype.slice.call(tb.querySelectorAll("tr"));
      var visiveis = linhas.filter(function (tr) {
        if (!tr.dataset.busca) return !filtrando;
        var ok = (filtro === "todos" || tr.dataset[filtro] === "1") && (!busca || tr.dataset.busca.indexOf(busca) >= 0);
        tr.style.display = ok ? "" : "none";
        return ok;
      });
      tb.style.display = visiveis.length ? "" : "none";
      if (visiveis.length) {
        algum = true;
        // a célula da data vai para a 1ª linha visível do dia
        visiveis[0].insertBefore(celula, visiveis[0].firstChild);
        celula.rowSpan = visiveis.length;
      }
    });
    document.getElementById("nada").hidden = algum;
  }
  document.querySelectorAll(".f").forEach(function (b) {
    b.addEventListener("click", function () {
      filtro = b.dataset.f;
      document.querySelectorAll(".f").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      aplicar();
    });
  });
  document.querySelector(".filtros input[type=search]").addEventListener("input", function (e) { busca = e.target.value.trim().toLowerCase(); aplicar(); });
  var guias = document.getElementById("img-guias");
  guias.addEventListener("change", function () { document.body.classList.toggle("sem-guias", !guias.checked); });
  function baixarImagem(botao, data) {
    if (typeof window.__baixarImagem !== "function") { alert("Feche esta aba e use 'Abrir planilha' de novo para baixar a imagem."); return; }
    var texto = botao.textContent;
    botao.disabled = true; botao.textContent = "Gerando…";
    Promise.resolve(window.__baixarImagem({ data: data || "", filtro: filtro, busca: busca, guias: guias.checked }))
      .finally(function () { botao.disabled = false; botao.textContent = texto; });
  }
  document.getElementById("bt-img").addEventListener("click", function (e) { baixarImagem(e.currentTarget); });
  document.querySelectorAll("[data-img]").forEach(function (b) { b.addEventListener("click", function () { baixarImagem(b, b.dataset.img); }); });
  document.getElementById("bt-excel").addEventListener("click", function () {
    if (typeof window.__baixarExcel === "function") window.__baixarExcel();
    else alert("Feche esta aba e use 'Abrir planilha' de novo para baixar o Excel.");
  });
})();
</script>
</body></html>`;
};

export const abrirEscalaEmNovaAba = ({
  semana = [],
  extras = {},
  agruparRegistrosPorServico,
  getTextoStatusServico,
  getClasseStatusServico,
}) => {
  try {
    registrarImpressao("escala_semanal", "Escala semanal (planilha/imagem)"); // Balanço de uso
    const novaAba = window.open("", "_blank");

    if (!novaAba) {
      alert("O navegador bloqueou a abertura da nova aba.");
      return;
    }

    const dias = construirEscalaPorDia({
      semana,
      extras,
      agruparRegistrosPorServico,
      getTextoStatusServico,
      getClasseStatusServico,
    });

    novaAba.document.open();
    novaAba.document.write(montarHtmlEscala(dias, semana));
    novaAba.document.close();

    // O Excel é gerado aqui (com o xlsx do próprio sistema) e só disparado
    // pelo botão da nova aba — a aba não depende de script externo.
    novaAba.__baixarExcel = () => {
      try {
        XLSX.writeFile(
          construirWorkbookEscala(dias, semana),
          `${nomeArquivoEscala(semana)}.xlsx`,
        );
      } catch (err) {
        console.error("Erro ao exportar Excel:", err);
        novaAba.alert("Erro ao exportar o Excel.");
      }
    };

    // Imagem para o grupo dos vendedores (semana ou um dia, seguindo os filtros)
    novaAba.__baixarImagem = async (opcoes = {}) => {
      try {
        const imagem = await gerarImagemEscala({
          dias,
          semana,
          doc: novaAba.document,
          ...opcoes,
        });
        await entregarImagem(imagem, novaAba);
      } catch (err) {
        console.error("Erro ao gerar a imagem da escala:", err);
        novaAba.alert("Erro ao gerar a imagem.");
      }
    };
  } catch (err) {
    console.error("Erro ao abrir escala em nova aba:", err);
  }
};
