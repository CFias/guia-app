// googleDrive.js
//
// Envia a escala semanal como uma Planilha Google (nativa, editável no
// Drive) direto para o Google Drive do operacional que estiver logado.
//
// ⚠️ Precisa de um Client ID do Google Cloud, colado em Configurações →
// Escala → Google Drive (sem isso, o botão avisa o que falta). Veja o
// passo a passo em GOOGLE_DRIVE_SETUP.md, na raiz do projeto.
//
// Como funciona: usa o Google Identity Services (a biblioteca oficial do
// Google para login/autorização no navegador) pra pedir, na hora, uma
// autorização de acesso só aos arquivos que ESTE app cria no Drive da
// pessoa (escopo drive.file — não enxerga o resto do Drive dela). Depois
// sobe a planilha pela API do Drive, já convertida em Planilhas Google.

import * as XLSX from "xlsx";
import { construirDadosEscala, construirWorkbookEscala } from "./plannerExport";

// O Client ID agora é configurado pela tela (Configurações → Escala →
// Google Drive), não fica mais fixo no código. Veja GOOGLE_DRIVE_SETUP.md
// pra saber como criar um no Google Cloud.
let clientIdAtual = "";

const ESCOPO_DRIVE = "https://www.googleapis.com/auth/drive.file";
const SRC_GIS = "https://accounts.google.com/gsi/client";

let scriptCarregado = null;
let tokenClient = null;
let tokenEmCache = null; // { access_token, expiraEm }

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
        scope: ESCOPO_DRIVE,
        callback: () => {}, // sobrescrito a cada chamada, logo abaixo
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

      tokenEmCache = {
        access_token: resposta.access_token,
        // renova um pouco antes do prazo real, por segurança
        expiraEm: Date.now() + (Number(resposta.expires_in) || 3000) * 1000 - 60000,
      };
      resolve(resposta.access_token);
    };

    tokenClient.requestAccessToken({ prompt: "" });
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

const mensagemErroUpload = (status, corpo) => {
  if (status === 401) return "SESSAO_EXPIRADA";
  if (status === 404) {
    return "A pasta configurada não foi encontrada (ou não está compartilhada com esta conta do Google).";
  }
  if (status === 403) {
    return "Sem permissão para gravar nessa pasta do Drive com esta conta do Google.";
  }
  return `O Google Drive recusou o envio (${status}). ${corpo?.error?.message || ""}`.trim();
};

// Envia um Blob pro Drive já como Planilha Google nativa (não um .xlsx
// solto) — assim abre direto no Planilhas Google, editável e compartilhável.
const enviarParaDrive = async ({ blob, nome, pastaId, accessToken, tentarDeNovo = true }) => {
  const metadados = {
    name: nome,
    mimeType: "application/vnd.google-apps.spreadsheet",
    ...(pastaId ? { parents: [pastaId] } : {}),
  };

  const boundary = "-------escalasemanal" + Date.now();
  const partes = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadados)}\r\n`,
    `--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`,
  ];

  const corpo = new Blob([partes[0], partes[1], blob, `\r\n--${boundary}--`], {
    type: `multipart/related; boundary=${boundary}`,
  });

  const resposta = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: corpo,
    },
  );

  if (!resposta.ok) {
    let corpoErro = null;
    try {
      corpoErro = await resposta.json();
    } catch {
      corpoErro = null;
    }

    const motivo = mensagemErroUpload(resposta.status, corpoErro);

    // token expirou bem na hora de enviar: pede um novo, uma única vez
    if (motivo === "SESSAO_EXPIRADA" && tentarDeNovo) {
      tokenEmCache = null;
      const novoToken = await obterTokenAcessoDrive();
      return enviarParaDrive({ blob, nome, pastaId, accessToken: novoToken, tentarDeNovo: false });
    }

    throw new Error(motivo === "SESSAO_EXPIRADA" ? "Sua permissão do Google expirou. Tente de novo." : motivo);
  }

  return resposta.json();
};

const nomeArquivoEscala = (semana) => {
  const inicio = semana?.[0]?.date?.split("-").reverse().slice(0, 2).join("/");
  const fim = semana?.[6]?.date?.split("-").reverse().slice(0, 2).join("/");
  return `Escala Semanal ${inicio || ""} a ${fim || ""}`.trim();
};

// Função principal: monta a planilha da semana e sobe pro Drive.
// Retorna { id, webViewLink } do arquivo criado.
export const salvarEscalaNoDrive = async ({
  semana = [],
  extras = {},
  agruparRegistrosPorServico,
  getTextoStatusServico,
  pastaId = "",
  clientId = "",
}) => {
  definirClientId(clientId);

  const dadosEscala = construirDadosEscala({
    semana,
    extras,
    agruparRegistrosPorServico,
    getTextoStatusServico,
  });

  const workbook = construirWorkbookEscala(dadosEscala);
  const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const accessToken = await obterTokenAcessoDrive();

  return enviarParaDrive({
    blob,
    nome: nomeArquivoEscala(semana),
    pastaId,
    accessToken,
  });
};
