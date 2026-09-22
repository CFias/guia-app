# Salvar a escala no Google Drive — como ativar

O botão **Salvar no Drive**, em Gerar Escala, sobe a planilha da semana como uma
Planilha Google (editável, não um arquivo solto) direto para o Drive de quem
clicar. Por padrão ele está desligado — sem isso configurado, o botão mostra um
aviso explicando o que falta.

## 1. Criar o projeto no Google Cloud (ou reaproveitar o do Firebase)

O Firebase já roda sobre um projeto do Google Cloud. Dá pra usar o mesmo:

1. Acesse o [Google Cloud Console](https://console.cloud.google.com).
2. No topo, confirme que o projeto selecionado é o mesmo do Firebase
   (`ssa-guias-luck`, ou o nome que você deu).

## 2. Ativar a API do Google Drive

**APIs e serviços → Biblioteca** → busque **Google Drive API** → **Ativar**.

## 3. Configurar a Tela de consentimento OAuth

**APIs e serviços → Tela de permissão OAuth**:

1. Tipo de usuário: **Externo** (a menos que todo o time use contas do
   Google Workspace do mesmo domínio — nesse caso, **Interno**).
2. Preencha nome do app (`Operacional SSA`), e-mail de suporte e e-mail de
   contato do desenvolvedor.
3. Em **Escopos**, adicione `.../auth/drive.file` (acesso só aos arquivos
   que o próprio app cria — não enxerga o resto do Drive da pessoa).
4. Em **Usuários de teste** (se o app ficar em modo "Teste"), adicione o
   e-mail do Google de cada pessoa do operacional que vai usar o botão.
   ⚠️ Enquanto o app estiver em "Teste", só esses e-mails conseguem
   autorizar — é o suficiente para uso interno da empresa.

## 4. Criar as credenciais (Client ID)

**APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**:

1. Tipo de aplicativo: **Aplicativo da Web**.
2. Nome: `Operacional SSA - Web`.
3. **Origens JavaScript autorizadas** — adicione cada endereço de onde o
   sistema roda:
   - `http://localhost:5173` (desenvolvimento)
   - `https://SEU-DOMINIO` (produção, o da Vercel)
4. Crie e copie o **Client ID** gerado (termina em
   `.apps.googleusercontent.com`). Não precisa do "Client secret" — este
   fluxo roda inteiro no navegador.

## 5. Colar o Client ID no sistema

Em **Configurações → Escala → Google Drive**, cole o Client ID no campo
"Client ID do Google". Salva sozinho ao sair do campo — não precisa mexer
em código nem publicar o front de novo.

## 6. (Opcional) Escolher uma pasta fixa

Em **Configurações → Escala → Pasta no Google Drive**, cole o link de uma
pasta do Drive. A partir daí, "Salvar no Drive" grava sempre ali, para
qualquer um do time. Compartilhe essa pasta (edição) com todos que forem
usar o botão — cada um salva com a própria conta do Google, então cada um
precisa ter acesso de gravação na pasta.

Sem uma pasta configurada, cada operacional salva na raiz do próprio Drive.

## Teste rápido

1. Abra **Gerar Escala** com uma semana que já tenha alguns serviços.
2. Clique em **Salvar no Drive**.
3. Na primeira vez, o Google abre um popup pedindo permissão — escolha a
   conta e aceite. (Se o navegador bloquear o popup, libere popups para o
   site e clique de novo.)
4. Uma nova aba deve abrir com a Planilha Google já criada.

## Erros comuns

| Mensagem | O que fazer |
|---|---|
| "ainda não foi configurado" | Falta colar o Client ID no passo 5. |
| Popup não abre / fecha sozinho | Verifique se o e-mail usado está na lista de "Usuários de teste" (passo 3). |
| "pasta não foi encontrada" | A pasta configurada não foi compartilhada com essa conta do Google. |
| "app não verificado" (tela do Google) | Normal em modo Teste — clique em "Avançado" → "Acessar (não seguro)". Some sozinho quando o app sai do modo Teste (exige verificação do Google para uso público, não necessária aqui). |
