# Autenticação e níveis de acesso — passo a passo de ativação

Níveis: **Operacional** (tudo) · **Comercial** (Central de Dúvidas) · **Guia** (só a própria disponibilidade).
Não existe tela de cadastro: contas são criadas por um operacional em **Cadastros → Usuários e Acessos**.

> ⚠️ Faça os passos **na ordem**. Publicar as regras (passo 4) antes do passo 2 tranca o sistema para todo mundo.

## 1. Ligar o login por e-mail e senha
Firebase Console → projeto `ssa-guias-luck` → **Authentication** → *Sign-in method* → habilitar **E-mail/senha**.

## 2. Criar o primeiro operacional (uma vez só)
Como ainda não existe nenhum operacional para criar os outros, o primeiro é manual:

1. **Authentication → Users → Add user**: e-mail + senha. Copie o **UID** gerado.
2. **Firestore → Iniciar coleção** `users` → *ID do documento* = o **UID** copiado, com os campos:
   - `nome` (string) — seu nome
   - `email` (string) — o mesmo e-mail
   - `role` (string) — `operacional`
   - `ativo` (boolean) — `true`

## 3. Publicar o front
Faça o deploy normal (Vercel). Entre em `/login` com a conta do passo 2 e confira que abre o painel.

## 4. Publicar as regras do Firestore
Firebase Console → **Firestore → Regras** → cole o conteúdo de `firestore.rules` → **Publicar**.
(ou `firebase deploy --only firestore:rules`)

## 5. Criar as demais contas
Em **Usuários e Acessos**: nome, e-mail, senha temporária e nível. Para **Guia**, escolha qual
cadastro de guia a conta representa (é nele que a disponibilidade é gravada).
A tela mostra a senha uma única vez para você enviar à pessoa; depois, use o botão de
*link de nova senha*.

## 6. (Recomendado) Fechar o auto-cadastro do Firebase
Por padrão, quem tem a chave pública do app consegue chamar a API de criação de conta do Firebase.
Essa conta **não enxerga nada** (sem documento em `users` as regras negam tudo), mas dá pra fechar de vez:
Se o seu projeto oferecer a opção, em Authentication → *Settings* → *User actions* desmarque
**Enable create (sign-up)** (pode exigir atualizar para o Identity Platform — confira no console).
⚠️ Se fechar o sign-up, a criação de contas pela tela de Usuários deixa de funcionar — nesse caso o
cadastro precisa migrar para uma Cloud Function com Admin SDK. Se não quiser essa dependência, deixe
como está: as regras já garantem o isolamento.

## Teste rápido
| Entrar como | Deve acontecer |
|---|---|
| Operacional | Abre o painel completo + "Usuários e Acessos" |
| Comercial | Cai em `/faqcomercial`; digitar `/op` volta para lá |
| Guia | Cai em `/minha-disponibilidade`; digitar `/op` volta para lá |
| Conta desativada | Tela "Acesso desativado" |
| Sem login | Qualquer URL vai para `/login` |

## 7. E-mail e tela de recuperação de senha (temáticos)

A tela nova fica em `/redefinir-senha`. Para o link do e-mail abrir nela (e não na página padrão do Firebase):

1. **Domínio autorizado:** Authentication → *Settings* → *Authorized domains* → adicione o domínio do sistema (o da Vercel).
2. **Modelo do e-mail:** Authentication → *Templates* → **Password reset** → ícone de lápis:
   - *Sender name:* `Operacional SSA`
   - *Language:* Português (Brasil)
   - *Subject:* `Redefinir sua senha — Operacional SSA`
   - *Message:*
     ```
     Olá,

     Recebemos um pedido para redefinir a senha de acesso %EMAIL% ao Operacional SSA.

     Para criar uma nova senha, clique no link abaixo:

     %LINK%

     Se você não fez esse pedido, ignore este e-mail — sua senha continua a mesma.

     Equipe Operacional SSA
     ```
   - *Customize action URL:* `https://SEU-DOMINIO/redefinir-senha`
3. Salve. Só troque a URL de ação **depois** de publicar o front com a rota nova (senão o link cai numa página inexistente).

## 8. Controle de acessos por tela (gerência)

Dentro do nível **Operacional** existe a **gerência** (ex.: supervisor operacional,
coordenação operacional e gerente geral): vê todas as telas e decide, conta por
conta, o que cada pessoa do operacional pode abrir.

1. Publique as regras novas: `firebase deploy --only firestore:rules`.
2. Entre com a sua conta (Operacional) e abra **Cadastros → Usuários e acessos**
   → link **Controle de acessos** (ou o endereço `/acessos`).
3. Clique em **Ativar e me tornar gerência**. Isso só funciona **uma vez**: quem
   ativa vira gerência; depois disso, só a gerência promove outras contas.
4. Na lista, escolha as outras pessoas da gerência e marque **Gerência** → Salvar.
5. Para as demais contas do Operacional, marque **Pode / Não pode** em cada tela
   do menu → **Salvar acessos**. A mudança vale na hora (a sessão aberta da pessoa
   já some com a tela).

O que fica protegido também no banco (firestore.rules), e não só no menu:
custos operacionais (lançamentos e tarifas), Central de Informações (edição),
usuários, turnos e equipe (Demanda por turno) e a própria configuração de
acessos. Quem não é da gerência só cria/edita contas do Comercial e dos Guias.
Dados que várias telas usam (serviços, guias, escala, fornecedores) continuam
liberados para todo o Operacional — senão as telas liberadas quebrariam.
