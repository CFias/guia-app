// googleDrive.js
//
// "Salvar no Drive" (Gerar Escala): lança a escala da semana numa planilha
// de HISTÓRICO no Google Drive — uma única Planilha Google, com uma aba por
// período ("20.10 a 26.10.2026"), a mais recente primeiro. Os períodos
// antigos nunca são apagados; reenviar a mesma semana só refaz a aba dela.
// O ID dessa planilha fica em settings/scale.driveEscalaPlanilhaId, então a
// equipe toda grava no mesmo arquivo.
//
// ⚠️ Precisa de um Client ID do Google Cloud, colado em Configurações →
// Escala → Google Drive (sem isso, o botão avisa o que falta). Veja o
// passo a passo em GOOGLE_DRIVE_SETUP.md, na raiz do projeto.
//
// Como funciona: usa o Google Identity Services (a biblioteca oficial do
// Google para login/autorização no navegador) pra pedir, na hora, uma
// autorização de acesso só aos arquivos que ESTE app cria no Drive da
// pessoa (escopo drive.file) e às Planilhas Google (escopo spreadsheets,
// necessário para gravar na planilha de histórico mesmo quando foi outra
// pessoa da equipe que a criou). O arquivo é criado pela API do Drive e as
// abas são escritas pela API do Google Sheets.

import { construirEscalaPorDia, periodoDaSemana, totaisDaEscala } from "./plannerExport";

// O Client ID agora é configurado pela tela (Configurações → Escala →
// Google Drive), não fica mais fixo no código. Veja GOOGLE_DRIVE_SETUP.md
// pra saber como criar um no Google Cloud.
let clientIdAtual = "";

const ESCOPO_DRIVE = "https://www.googleapis.com/auth/drive.file";
const ESCOPO_PLANILHAS = "https://www.googleapis.com/auth/spreadsheets";
const ESCOPOS = `${ESCOPO_DRIVE} ${ESCOPO_PLANILHAS}`;
const SRC_GIS = "https://accounts.google.com/gsi/client";

let scriptCarregado = null;
let tokenClient = null;
let tokenEmCache = null; // { access_token, expiraEm }
let pedirConsentimento = false; // reabre a tela de permissões se faltou um escopo

// Chamado antes de cada envio, com o Client ID lido da configuração salva.
// Se a pessoa trocar o Client ID em Configurações, o próximo envio já usa
// o novo — descarta o token e o cliente de autorização antigos.
const definirClientId = (id) => {
  const novo = String(id || "").trim();
  if (novo === clientIdAtual) return;

  clientIdAtual = novo;
  tokenClient = null;
  tokenEmCache = null;
};

const carregarScriptGis = () => {
  if (scriptCarregado) return scriptCarregado;

  scriptCarregado = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = SRC_GIS;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Não foi possível carregar o login do Google."));
    document.head.appendChild(script);
  });

  return scriptCarregado;
};

// Pede um token de acesso ao Drive. Na primeira vez do dia, abre o popup de
// permissão do Google; depois disso, reaproveita o token enquanto for
// válido (tokens do Google duram ~1 hora).
const obterTokenAcessoDrive = async () => {
  if (!clientIdAtual) {
    throw new Error("SEM_CLIENT_ID");
  }

  if (tokenEmCache && Date.now() < tokenEmCache.expiraEm) {
    return tokenEmCache.access_token;
  }

  await carregarScriptGis();

  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientIdAtual,
        scope: ESCOPOS,
        callback: () => { }, // sobrescrito a cada chamada, logo abaixo
      });
    }

    tokenClient.callback = (resposta) => {
      if (resposta.error) {
        reject(
          new Error(
            resposta.error === "access_denied"
              ? "PERMISSAO_NEGADA"
              : `Erro ao autorizar o Google Drive: ${resposta.error}`,
          ),
        );
        return;
      }

      // a pessoa pode desmarcar o acesso às Planilhas na tela do Google
      const oauth2 = window.google.accounts.oauth2;
      if (oauth2.hasGrantedAllScopes && !oauth2.hasGrantedAllScopes(resposta, ESCOPO_DRIVE, ESCOPO_PLANILHAS)) {
        pedirConsentimento = true;
        reject(new Error("ESCOPO_INCOMPLETO"));
        return;
      }

      pedirConsentimento = false;
      tokenEmCache = {
        access_token: resposta.access_token,
        // renova um pouco antes do prazo real, por segurança
        expiraEm: Date.now() + (Number(resposta.expires_in) || 3000) * 1000 - 60000,
      };
      resolve(resposta.access_token);
    };

    tokenClient.requestAccessToken({ prompt: pedirConsentimento ? "consent" : "" });
  });
};

// Extrai o ID da pasta a partir do que o operacional colar em Configurações
// (aceita o link inteiro do Drive ou só o ID).
export const extrairIdPastaDrive = (valor) => {
  const texto = String(valor || "").trim();
  if (!texto) return "";

  const doLink = texto.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (doLink) return doLink[1];

  const doParametro = texto.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (doParametro) return doParametro[1];

  // já deve ser só o ID
  return /^[a-zA-Z0-9_-]{10,}$/.test(texto) ? texto : "";
};

// Aceita o link da planilha ou só o ID.
export const extrairIdPlanilhaDrive = (valor) => {
  const texto = String(valor || "").trim();
  if (!texto) return "";
  const doLink = texto.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/) || texto.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (doLink) return doLink[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(texto) ? texto : "";
};

export const linkPlanilhaDrive = (id, gid) =>
  id ? `https://docs.google.com/spreadsheets/d/${id}/edit${gid !== undefined && gid !== null ? `#gid=${gid}` : ""}` : "";

export const NOME_PLANILHA_HISTORICO = "Escala semanal de passeios — histórico";

// Chamada às APIs do Google com o token; renova o token uma vez se expirar.
const chamarGoogle = async (url, { method = "GET", body } = {}, tentarDeNovo = true) => {
  const token = await obterTokenAcessoDrive();
  const resposta = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json; charset=UTF-8" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (resposta.status === 401 && tentarDeNovo) {
    tokenEmCache = null;
    return chamarGoogle(url, { method, body }, false);
  }

  let corpo = null;
  try {
    corpo = await resposta.json();
  } catch {
    corpo = null;
  }

  if (!resposta.ok) {
    const erro = new Error(corpo?.error?.message || `Erro ${resposta.status} do Google.`);
    erro.status = resposta.status;
    throw erro;
  }
  return corpo;
};

const criarPlanilhaHistorico = async (pastaId) => {
  try {
    const arquivo = await chamarGoogle("https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true", {
      method: "POST",
      body: {
        name: NOME_PLANILHA_HISTORICO,
        mimeType: "application/vnd.google-apps.spreadsheet",
        ...(pastaId ? { parents: [pastaId] } : {}),
      },
    });
    return arquivo.id;
  } catch (err) {
    if (err.status === 404) {
      throw new Error("A pasta configurada não foi encontrada (ou não está compartilhada com esta conta do Google).");
    }
    if (err.status === 403) {
      throw new Error("Sem permissão para criar a planilha nessa pasta do Drive com esta conta do Google.");
    }
    throw err;
  }
};

// ---------------------------------------------------------------------
// Conteúdo da aba do período (valores + formatação), para o batchUpdate.
// ---------------------------------------------------------------------
const rgb = (hex) => {
  const n = parseInt(String(hex).replace("#", ""), 16);
  return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 };
};

// Mesma estrutura da planilha que o operacional manda ao comercial.
const COLUNAS = [
  { titulo: "DATA", px: 96, centro: true },
  { titulo: "DIA DA SEMANA", px: 116, centro: true },
  { titulo: "PASSEIO", px: 330 },
  { titulo: "GUIA", px: 150 },
  { titulo: "QTD PAX", px: 72, centro: true },
  { titulo: "IDIOMAS", px: 120, centro: true },
  { titulo: "PONTO DE APOIO", px: 170 },
  { titulo: "SITUAÇÃO", px: 150, centro: true },
  { titulo: "OBSERVAÇÕES", px: 240 },
];
const NCOL = COLUNAS.length;
const COL_APOIO = 6;
const COL_OBS = 8;
const LINHAS_TOPO = 4; // título, resumo, em branco, cabeçalho

const SITUACAO_PLANILHA = {
  formar: { texto: "FORMAR GRUPO", cor: "#8a5a00", fundo: "#ffe8a3" },
  formado: { texto: "✓ Grupo formado", cor: "#1a7f37" },
  privativo: { texto: "Privativo", cor: "#4338ca" },
  fechado: { texto: "Fechado", cor: "#b42318" },
};

const celula = (valor, formato = {}) => ({
  userEnteredValue:
    typeof valor === "number" ? { numberValue: valor } : { stringValue: valor === undefined || valor === null ? "" : String(valor) },
  userEnteredFormat: { verticalAlignment: "MIDDLE", wrapStrategy: "WRAP", ...formato },
});

const texto = (cor, extra = {}) => ({ foregroundColor: rgb(cor), ...extra });

const montarLinhasAba = (dias, semana, anteriores = new Map()) => {
  const periodo = periodoDaSemana(semana);
  const tot = totaisDaEscala(dias);
  const formados = dias.reduce((a, d) => a + d.servicos.filter((s) => s.tipo === "formado").length, 0);
  const agora = new Date();
  const enviada = `${agora.toLocaleDateString("pt-BR")} às ${agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;

  const linhas = [];
  const blocosDia = []; // { ini, fim } de cada dia (para mesclar DATA e DIA)
  const vazio = (n) => Array.from({ length: n }, () => celula(""));

  linhas.push([celula(`Passeios da semana · ${periodo.texto}`, { textFormat: { bold: true, fontSize: 14 }, wrapStrategy: "CLIP" }), ...vazio(NCOL - 1)]);
  linhas.push([
    celula(
      `${tot.servicos} passeios · ${tot.pax} pax · ${formados} grupos formados · ${tot.formar} para formar grupo — atualizada em ${enviada}`,
      { textFormat: texto("#57606a"), wrapStrategy: "CLIP" },
    ),
    ...vazio(NCOL - 1),
  ]);
  linhas.push(vazio(NCOL));
  linhas.push(
    COLUNAS.map((c) =>
      celula(c.titulo, {
        backgroundColor: rgb("#14532d"),
        textFormat: { ...texto("#ffffff"), bold: true, fontSize: 9 },
        horizontalAlignment: c.centro ? "CENTER" : "LEFT",
      }),
    ),
  );

  dias.forEach((d, iDia) => {
    const fundo = iDia % 2 ? rgb("#f6f8fa") : rgb("#ffffff");
    const base = (extra = {}) => ({ backgroundColor: fundo, ...extra });
    const ini = linhas.length;
    const servicos = d.servicos.length ? d.servicos : [null];

    servicos.forEach((s, i) => {
      const primeira = i === 0;
      const colData = [
        celula(primeira ? d.data : "", base({ horizontalAlignment: "CENTER", textFormat: { bold: true, fontSize: 11 } })),
        celula(primeira ? String(d.dia || "").toUpperCase() : "", base({ horizontalAlignment: "CENTER", textFormat: { bold: true, ...texto("#57606a") } })),
      ];
      if (!s) {
        linhas.push([...colData, celula("Sem passeios", base({ textFormat: { italic: true, ...texto("#8c959f") } })), ...vazio(NCOL - 3).map(() => celula("", base()))]);
        return;
      }
      const sit = SITUACAO_PLANILHA[s.tipo] || SITUACAO_PLANILHA.formar;
      const antes = anteriores.get(`${d.data}|${s.passeio}`) || {};
      linhas.push([
        ...colData,
        celula(s.passeio, base({ textFormat: { bold: true } })),
        celula(s.guia || "", base()),
        celula(s.pax, base({ horizontalAlignment: "CENTER", textFormat: { bold: true, fontSize: 11 } })),
        celula(s.idiomas || "", base({ horizontalAlignment: "CENTER", textFormat: texto("#57606a") })),
        celula(antes.apoio || "", base()),
        celula(sit.texto, {
          backgroundColor: sit.fundo ? rgb(sit.fundo) : fundo,
          horizontalAlignment: "CENTER",
          textFormat: { ...texto(sit.cor), bold: true },
        }),
        celula(antes.obs || "", base()),
      ]);
    });
    blocosDia.push({ ini, fim: linhas.length });
  });

  return { linhas, blocosDia };
};

// Reenvio da mesma semana: guarda o que a equipe escreveu à mão em PONTO DE
// APOIO e OBSERVAÇÕES na aba antiga (por data + passeio) para não perder.
const lerAnotacoes = async (id, titulo) => {
  const mapa = new Map();
  try {
    const intervalo = encodeURIComponent(`'${titulo.replace(/'/g, "''")}'!A1:I`);
    const r = await chamarGoogle(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${intervalo}`);
    let data = "";
    (r?.values || []).slice(LINHAS_TOPO).forEach((l) => {
      // a data vem só na 1ª linha do dia (células mescladas)
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(String(l[0] || "").trim())) data = String(l[0]).trim();
      const passeio = String(l[2] || "").trim();
      const apoio = String(l[COL_APOIO] || "").trim();
      const obs = String(l[COL_OBS] || "").trim();
      if (data && passeio && (apoio || obs)) mapa.set(`${data}|${passeio}`, { apoio, obs });
    });
  } catch (err) {
    console.warn("Não foi possível ler as anotações da aba antiga:", err);
  }
  return mapa;
};

// Onde a aba nova entra: antes da primeira aba de período mais antigo
// (as abas ficam da mais recente para a mais antiga).
const inicioDaAba = (titulo) => {
  const m = String(titulo).match(/^(\d{2})\.(\d{2}) a (\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const anoFim = Number(m[5]);
  const ano = Number(m[2]) > Number(m[4]) ? anoFim - 1 : anoFim; // semana que vira o ano
  return `${ano}-${m[2]}-${m[1]}`;
};

// Função principal: lança a semana na planilha de histórico.
// Retorna { planilhaId, gid, url, criouPlanilha, atualizouPeriodo, periodo }.
export const salvarEscalaNoDrive = async ({
  semana = [],
  extras = {},
  agruparRegistrosPorServico,
  getTextoStatusServico,
  getClasseStatusServico,
  pastaId = "",
  clientId = "",
  planilhaId = "",
}) => {
  definirClientId(clientId);

  const dias = construirEscalaPorDia({
    semana,
    extras,
    agruparRegistrosPorServico,
    getTextoStatusServico,
    getClasseStatusServico,
  });
  const periodo = periodoDaSemana(semana);

  // pede a autorização antes de qualquer chamada (abre o popup do Google)
  await obterTokenAcessoDrive();

  let id = String(planilhaId || "").trim();
  let criouPlanilha = false;
  let info = null;

  if (id) {
    try {
      info = await chamarGoogle(
        `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties(sheetId,title,index)`,
      );
    } catch (err) {
      if (err.status === 403) {
        throw new Error(
          "Sua conta do Google não tem acesso à planilha de histórico da escala. Peça para quem a criou compartilhar com você (como Editor).",
        );
      }
      if (err.status !== 404) throw err;
      id = ""; // a planilha foi apagada: cria outra
    }
  }

  if (!id) {
    id = await criarPlanilhaHistorico(pastaId);
    criouPlanilha = true;
    info = await chamarGoogle(
      `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties(sheetId,title,index)`,
    );
  }

  const abas = (info?.sheets || []).map((s) => s.properties).sort((a, b) => a.index - b.index);
  const antiga = abas.find((a) => a.title === periodo.aba);
  const posMaisAntiga = abas.find((a) => {
    const ini = inicioDaAba(a.title);
    return ini && ini < periodo.inicio;
  });
  const indice = posMaisAntiga ? posMaisAntiga.index : abas.length;

  const usados = new Set(abas.map((a) => a.sheetId));
  let gid = Math.floor(Math.random() * 1e9) + 1;
  while (usados.has(gid)) gid += 1;

  const anteriores = antiga ? await lerAnotacoes(id, antiga.title) : new Map();
  const { linhas, blocosDia } = montarLinhasAba(dias, semana, anteriores);

  const requests = [
    {
      addSheet: {
        properties: {
          sheetId: gid,
          title: antiga ? `${periodo.aba} (novo)` : periodo.aba,
          index: indice,
          gridProperties: { rowCount: linhas.length + 20, columnCount: NCOL, frozenRowCount: LINHAS_TOPO },
        },
      },
    },
  ];

  // reenvio da mesma semana: troca só a aba dela; a planilha nova vem com
  // uma "Página1" em branco, que sai
  const apagar = antiga ? [antiga] : criouPlanilha ? abas : [];
  apagar.forEach((a) => requests.push({ deleteSheet: { sheetId: a.sheetId } }));
  if (antiga) {
    requests.push({ updateSheetProperties: { properties: { sheetId: gid, title: periodo.aba }, fields: "title" } });
  }

  requests.push({
    updateCells: {
      start: { sheetId: gid, rowIndex: 0, columnIndex: 0 },
      rows: linhas.map((values) => ({ values })),
      fields: "userEnteredValue,userEnteredFormat",
    },
  });

  [0, 1].forEach((r) =>
    requests.push({
      mergeCells: {
        range: { sheetId: gid, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: NCOL },
        mergeType: "MERGE_ALL",
      },
    }),
  );
  // DATA e DIA DA SEMANA mesclados por dia
  blocosDia
    .filter((b) => b.fim - b.ini > 1)
    .forEach((b) =>
      [0, 1].forEach((c) =>
        requests.push({
          mergeCells: {
            range: { sheetId: gid, startRowIndex: b.ini, endRowIndex: b.fim, startColumnIndex: c, endColumnIndex: c + 1 },
            mergeType: "MERGE_ALL",
          },
        }),
      ),
    );

  COLUNAS.forEach((c, i) =>
    requests.push({
      updateDimensionProperties: {
        range: { sheetId: gid, dimension: "COLUMNS", startIndex: i, endIndex: i + 1 },
        properties: { pixelSize: c.px },
        fields: "pixelSize",
      },
    }),
  );

  requests.push({
    updateDimensionProperties: {
      range: { sheetId: gid, dimension: "ROWS", startIndex: 0, endIndex: linhas.length },
      properties: { pixelSize: 28 },
      fields: "pixelSize",
    },
  });

  // borda fina em volta da tabela
  requests.push({
    updateBorders: {
      range: { sheetId: gid, startRowIndex: LINHAS_TOPO - 1, endRowIndex: linhas.length, startColumnIndex: 0, endColumnIndex: NCOL },
      top: { style: "SOLID", color: rgb("#adb5bd") },
      bottom: { style: "SOLID", color: rgb("#adb5bd") },
      left: { style: "SOLID", color: rgb("#adb5bd") },
      right: { style: "SOLID", color: rgb("#adb5bd") },
      innerHorizontal: { style: "SOLID", color: rgb("#e1e4e8") },
      innerVertical: { style: "SOLID", color: rgb("#e1e4e8") },
    },
  });
  // linha forte separando os dias
  blocosDia.forEach((b) =>
    requests.push({
      updateBorders: {
        range: { sheetId: gid, startRowIndex: b.ini, endRowIndex: b.fim, startColumnIndex: 0, endColumnIndex: NCOL },
        bottom: { style: "SOLID_MEDIUM", color: rgb("#57606a") },
      },
    }),
  );

  await chamarGoogle(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
    method: "POST",
    body: { requests },
  });

  return {
    planilhaId: id,
    gid,
    url: linkPlanilhaDrive(id, gid),
    criouPlanilha,
    atualizouPeriodo: !!antiga,
    periodo: periodo.texto,
  };
};
