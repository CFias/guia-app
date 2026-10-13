# REFATORACAO.md — Refatoração visual do Painel Operacional

> Refatoração **apenas de UI/UX**. Nenhuma função, handler, rota, coleção do Firestore, chamada ao Phoenix, envio de WhatsApp, integração com o Drive, geração de PDF/placas ou texto copiado muda.
> Referência visual: `referencia/Painel Operacional v5.dc.html` + `referencia/painel-data.js` (protótipo, não é código para copiar).

Status: **etapas 1 (tokens + componentes base) e 2 (shell) prontas** — telas ainda não refeitas usam a paleta nova pela ponte de variáveis.

---

## 0. Ambiente e limitações desta sessão

| Item | Situação |
|---|---|
| `npm install` | **Bloqueado** pela rede desta sessão (registry.npmjs.org e CDNs negados). Sem `node_modules` não dá para rodar `npm run lint` nem `npm run build` aqui. |
| Verificação possível aqui | Compilação de todos os arquivos com **esbuild** (JSX + imports resolvidos, libs externas marcadas como externas), ESLint com regras base do JS (`no-undef`, `no-unused-vars`) e captura de tela com Playwright de um ambiente de prévia com dados falsos. |
| Verificação que fica com você | `npm run lint` e `npm run build` no seu computador após cada entrega. O projeto **não tem testes automatizados** hoje. |
| Lint antes da refatoração | O projeto recebido **já tinha 33 erros de lint** (`no-unused-vars`: funções e variáveis sem uso, 24 delas em `RoboConferenteVoos.jsx`, mais `Home`, `PreviaTransfers`, `PainelOperacional`, `CadastroFornecedores`, `plannerRepository`, `weekDates`). Não removo essas funções (regra nº 1); cada etapa é conferida para **não adicionar nenhum problema novo**. |
| Git | O zip veio sem a pasta `.git`. Uso um repositório local só para gerar um commit por etapa; a entrega de cada etapa vem com os arquivos alterados + o patch, para você commitar no seu repositório. |

---

## 1. Mapa de telas atuais → nova navegação

Todas as rotas atuais continuam existindo com o **mesmo path**. A sidebar só reorganiza os links.

| Grupo (novo) | Item no menu | Rota (sem mudança) | Componente atual |
|---|---|---|---|
| Visão geral | Dashboard | `/` | `components/Home/Home.jsx` |
| Operação do dia | Painel Operacional | `/op` | `components/PainelOperacional/PainelOperacional.jsx` |
| Operação do dia | Prévia de Serviços | `/previas` | `components/PreviaTransfers/PreviaTransfers.jsx` (seções "Indicadores" + "Enviar prévia individualmente") |
| Operação do dia | Planilha operacional | `/planilha` **(rota nova)** | o **mesmo** `PreviaTransfers.jsx`, abrindo direto na seção "Planilha operacional automática" (prop `secao`). Nenhuma lógica duplicada. |
| Escala e guias | Gerar Escala | `/passeios` | `components/ListaPasseios/ListaPasseios.jsx` |
| Escala e guias | Lista de Guias | `/guias` | `components/Guias/ListaGuias.jsx` + `EditarGuiaModal.jsx` |
| Escala e guias | Mapa de afinidade | `/mapear-guias` | `components/MapaAfinidadeGuias/MapaAfinidadeGuias.jsx` |
| Escala e guias | Disponibilidade da semana *(fora da referência)* | `/disponibilidade-guia` | `components/DisponibilidadeGuia/DisponibilidadeGuia.jsx` |
| Relatórios | Relatório executivo | `/relatorios` | `components/RelatoriosOp/RelatoriosOp.jsx` (hoje a rota existe mas **não está no menu**) |
| Relatórios | Serviços por Fornecedor | `/servicos-fornecedor` | `components/ServicosFornecedor/ServicosFornecedor.jsx` |
| Gestão | Cadastros | `/register-guias`, `/register-fornecedores`, `/usuarios` | `RegisterGuias`, `CadastroFornecedores`, `GerenciarUsuarios` — viram as abas Guias / Fornecedores / Usuários e acessos de uma tela só (cada aba renderiza o componente atual; as 3 rotas antigas continuam abrindo a aba certa) |
| Gestão | Central de Dúvidas *(fora da referência)* | `/faqadmin` | `components/FaqAdmin/FaqAdmin.jsx` |
| Gestão | Ver como o comercial *(fora da referência)* | `/faqcomercial` | `components/FaqComercial/FaqComercial.jsx` |
| Rodapé | Configurações | `/configuracoes` | `pages/Configuracoes/Configuracoes.jsx` |
| — (sem link, como hoje) | — | `/conferencia`, `/resumo`, `/chegadas`, `/outs`, `/escala-semanal`, `/register-tours` | `RoboConferenteVoos`, `ResumoOperacional`, `PainelChegadas`, `PainelSaidas`, `EscalaSemanal`, `RegisterTours` — já não estavam no menu; continuam acessíveis pela URL (com breadcrumb) e ganham os tokens novos |
| Fora do layout | — | `/login`, `/redefinir-senha`, `/minha-disponibilidade` | ganham tokens/fonte novos, sem shell |

**Comercial:** continua vendo só "Central de Dúvidas" (`/faqcomercial`). As permissões (`Context/permissions.js`, `RouteGuards`) não mudam.

---

## 2. Base visual (etapa 1 — sem trocar telas)

### 2.1 Tokens
Arquivo novo `src/styles/tokens.css`, importado em `main.jsx` antes de tudo:

- Cores, raios e fonte exatamente como no prompt (`--bg #111110`, `--surface #191817`, `--raised #211f1e`, `--text #ecebea`, `--text-2`, `--text-3`, `--divider`, `--accent` + derivados `--accent-300/400/600` via `color-mix(in oklch, …)`, `--on-accent`, `--alert #ff7a63`, `--radius-sm/md/lg`, Archivo 400/600/700/800, `tabular-nums` nos números).
- **Ponte de compatibilidade:** as variáveis antigas que os 25 arquivos de CSS usam hoje (`--card`, `--border`, `--primary`, `--primary-1/2`, `--btn-main`, `--text-dist`, `--p1/--p2/--p3`, `--status-red`, `--input`, `--side`, `--text-btn`…) passam a ser **apelidos** dos tokens novos. Resultado: toda tela já sai com a paleta nova antes de ser refatorada, e nada quebra. Conforme cada tela é refeita, ela passa a usar só os tokens novos. No fim, a ponte é removida.

### 2.2 Componentes base (`src/components/ui/`)
`Button` (primary / secondary / ghost / icon), `Segmented`, `KpiTiles`, `DataTable` (card + header 44px + linhas 60–64px + scroll horizontal), `ExpandableRow`, `Drawer` (420px, overlay, header 64px, rodapé Cancelar/Salvar), `Toast`, `PageHeader` (título 26px + descrição + ações + menu `⋯`), `MoreMenu`, `StatusDot`, `Icon`.

São só apresentação: recebem `onClick`, `value`, `onChange` etc. e chamam **os handlers que já existem** em cada tela.

### 2.3 Ícones
Componente `Icon` com traços no padrão Lucide (stroke 1.75, 24×24), desenhados inline — **sem nova dependência** (a rede desta sessão não deixa instalar `lucide-react`). Os ícones do MUI continuam instalados; vou trocando tela a tela.

### 2.4 Shell (etapa 2)
- `pages/Dashboard/Dashboard.jsx` (o layout) ganha sidebar 256/72px com « / », grupos do item 1, item ativo com `--raised` + ícone accent-400. Estado recolhido salvo por usuário (`localStorage`, chave por uid).
- O menu-gaveta do celular que existe hoje **continua** (botão ☰, Esc fecha, trava a rolagem).
- Topbar 64px sticky com blur: breadcrumb Grupo / Página, data, sino (`NotificacoesSino`, sem mudar a lógica) e o indicador "Phoenix · HH:MM" (ver decisão D4).
- Rodapé: Configurações + avatar/nome/nível + Sair (`logout` atual) + versão.

---

## 3. Plano por tela (onde cada item vai parar)

Ordem do prompt: Dashboard → Painel Operacional → Gerar Escala → Lista de Guias → Mapa de afinidade → Prévia de Serviços → Planilha operacional → Serviços por Fornecedor → Relatório executivo → Cadastros → Configurações. Depois as telas fora da referência (Conferência, Resumo, Disponibilidade, Central de Dúvidas ×2, Chegadas/OUTs/Escala semanal/Cadastro de passeios, Login, Redefinir senha, Minha disponibilidade).

### 3.1 Dashboard (`Home.jsx`)
- **Header:** "Operação de hoje" + data. Primary: "Atualizar dados do Phoenix" (`carregarApiSemana`). Menu `⋯`: "Abrir escala da semana" (`navigate("/passeios")`).
- **Navegação de semana** (`setSemanaOffset`: anterior / atual / próxima) e **seletor de dia** (`setDiaSelecionadoHome`) numa linha de filtros com `Segmented`.
- **Abas Operação / Comparativo** (`setAbaAtiva`) viram `Segmented` no topo.
- **KPIs:** os 4 cards atuais (Serviços reais, Serviços com guia %, Passageiros com guia %, Operadoras na semana) viram tiles; o primeiro com fundo accent.
- **Tabela "Serviços do dia"**: Saída · Serviço · Guia · Pax · ações "Copiar serviço" (`copiarServicoDia`) e "Enviar ao guia" (`enviarWhatsappServico`).
- Alertas automáticos, Operadoras, Demanda da semana, Versículo do dia e todo o Comparativo (gráficos recharts) **continuam**, reorganizados em cards abaixo da tabela.
- ⚠️ Tiles da referência que **não têm cálculo hoje** ("Grupos a formar", "Escalas a enviar", "Sem guia" do dia, botão "Enviar escalas pendentes") → **sugestão futura** (não implemento lógica).

### 3.2 Painel Operacional (`PainelOperacional.jsx`, 4.054 linhas)
- **Header:** primary "Copiar fechamento" (`copiarResumo`). Secundários: "Atualizar" (`carregarDados`), "Nova placa personalizada" (`abrirPopupNovaPlaca`). `⋯`: "Configurações das placas PDF" → **drawer** (os 3 campos atuais: qtd. por página, mostrar logo, repetir cabeçalho — mesma chave `painel_operacional_config_placas`).
- **Segmented Chegadas / OUT's / Passeios** com ícone e contagem (`setAbaAtiva`).
- **Linha de filtros:** data operacional, busca de reserva, status do voo, escala, guia, veículo (todos os filtros atuais, mesmos states).
- **Chegadas:** tabela com voo · rota · previsto · estimado · status (ícone + texto; atrasado em `--alert`) · reservas · pax · fornecedor · copiar. Linha expansível (`toggleExpandirVoo`) com ações "Buscar voo" (`abrirBuscaGoogleVoo`), "Placas individuais" (`gerarPdfPlacasIndividuais`), "Placa coleção" (`gerarPdfPlacasColecao`) e **um bloco por veículo** com os passageiros; "Editar placa" (`abrirEdicaoPlaca`) fica em cada passageiro.
- **OUT's:** mesma tabela + expansão (`toggleExpandirGrupoOut`), checkbox "Monitorado" (`toggleMonitoradoOut` → `painel_out_monitoramento`), "Copiar monitoramento" (`copiarMonitoramentoGrupo`), "Buscar voo" (`abrirBuscaVooPratica`).
- **Passeios:** agrupado por guia (`toggleExpandirGrupoGuia`).
- Resultados da busca, Resumo do dia e Última atualização continuam visíveis.
- Popups "Nova placa personalizada" e "Editar placa da reserva" viram **drawer** com os mesmos campos e botões ("Gerar PDF da placa" `gerarPlacaPersonalizada`, "Gerar PDF agora" `gerarPdfPlacaUnica`, "Salvar nome" `salvarEdicaoPlaca`).
- ⚠️ "Enviar ao motorista" por veículo e "copiar script daquele veículo" → só se já existir texto por veículo; se não, **sugestão futura**.

### 3.3 Gerar Escala (`ListaPasseios.jsx`)
- **Header:** "Desfazer" (`desfazerGuiasSemana`), "Editar escala"/"Visualizar" (`setModoVisualizacao`), `⋯` com "Abrir planilha" (`abrirEscalaEmNovaAba`), "Salvar no Drive" (`salvarNoDrive`), "Atualizar dados (Phoenix)" (`atualizarSomentePlanilha`); "Gerar escala de Guias" (`alocarGuiasSemana`); primary "Enviar todos os Bloqueios" (`enviarWhatsappGuiasSemana_FIRESTORE`).
- Navegador de semana ‹ › (`setSemanaOffset`). Relatório do robô (`setRelatorioEscala` / Fechar) em drawer.
- Abas **Por dia / Por guia** reaproveitando os dados que a tela já calcula; "Enviar" por guia (`enviarWhatsappGuiaIndividual`).
- Modo edição: adicionar passeio manual (➕ `adicionarPasseioManual`), remover (🗑️ `removerPasseio`), trocar guia/pax/status (`alterarGuiaManual`, `alterarPaxManual`, `alterarStatusAlocacao`).
- ⚠️ "Regras resumidas em 1 linha com drawer": as regras hoje ficam em **Configurações** (`settings/scale`). No drawer mostro e abro as mesmas regras; se salvar exigir chamar o robô de outro jeito, fica como sugestão futura. **A lógica do robô não muda.**

### 3.4 Lista de Guias (`ListaGuias.jsx` + `EditarGuiaModal.jsx`)
Filtros numa linha (os 3 selects + busca atuais); tabela guia · WhatsApp · idiomas (chips) · prioridade · motoguia · status; "Editar" (`setGuiaEditando`) abre **drawer** com o conteúdo do `EditarGuiaModal` (mesmo `salvar`, mesmos campos).

### 3.5 Mapa de afinidade (`MapaAfinidadeGuias.jsx`)
Lista de guias à esquerda (sticky, com busca — a busca é só filtro visual da lista); à direita os passeios com slider/nível (`atualizarNivel`); legenda no header; primary "Salvar mapeamento" (`salvarMapa`).

### 3.6 Prévia de Serviços (`PreviaTransfers.jsx`, `/previas`)
KPIs (Indicadores operacionais atuais) + tabela por veículo/fornecedor: veículo, motorista, serviços, pax, enviar WhatsApp (`abrirWhatsappPorVeiculo`). Header: "Enviar todas as prévias atualizadas" e primary "Enviar todas as prévias" (`envioGeral`), "Atualizar" (`carregarServicos`), data operacional.
⚠️ Status "Enviada / Desatualizada / Não enviada" não é registrado hoje → **sugestão futura**.

### 3.7 Planilha operacional (`PreviaTransfers.jsx`, `/planilha`)
Mesmo componente, seção "Planilha operacional automática": segmented Todos/IN/OUT/TRF/TOUR (filtro só visual), grid de cards por veículo com arrastar para reordenar (`onDragStart/End`, `moverBloco`, chave `previa_operacional_ordem_blocos_v3`).
⚠️ "Copiar planilha" / "copiar por veículo" → só se o texto já existir; senão sugestão futura.

### 3.8 Serviços por Fornecedor (`ServicosFornecedor.jsx`)
Já segue boa parte do padrão. Troco os estilos `sf-*` pelos componentes base: atalhos de período em `Segmented`, KPIs em tiles, ranking em `DataTable`, painel de veículos/vínculos mantido. Primary "Imprimir relatório".

### 3.9 Relatório executivo (`RelatoriosOp.jsx`, `/relatorios`)
Header com presets de período + "Atualizar". Abas Guias / Passeios / Transfers e todos os filtros e gráficos atuais mantidos.
⚠️ "Exportar PDF" e seções "Ranking de veículos", "Pendências", "Ranking de fornecedores" que não existem nesta tela hoje → estado "sem dados" + **sugestão futura** (o ranking de fornecedores existe em `/servicos-fornecedor`; dá para linkar).

### 3.10 Cadastros
Tela nova só de layout (`pages/Cadastros/Cadastros.jsx`) com segmented Guias / Fornecedores / Usuários e acessos, renderizando `RegisterGuias`, `CadastroFornecedores` e `GerenciarUsuarios` sem mudar a lógica deles. Edição/criação em drawer quando o componente já tiver o formulário separado; senão o formulário fica no topo da aba como hoje.

### 3.11 Configurações (`Configuracoes.jsx`)
Seções em 2 colunas (título + descrição | controles): Aparência (tema + accent por pessoa), Escala (modo, afinidade, idioma, pax mínimo, janela de disponibilidade — tudo como hoje), Placas PDF (atalho para o drawer do Painel), Google Drive (Client ID e pasta, `onBlur` como hoje).

---

## 4. Decisões tomadas

- **D1 — Temas:** mantidos os 3 (Claro, Dark, Dark Pro), todos redesenhados com os tokens novos. O padrão continua o do `ThemeContext` (Claro). Dark = paleta do protótipo; Dark Pro = variante mais profunda.
- **D2 — Cor de destaque por pessoa:** salva **só no navegador** (`localStorage`, chave `ui_prefs_<uid>`), junto com o estado da sidebar recolhida. Nada muda no Firestore. Escolha em Configurações → Tema → "Cor de destaque".
- **D3 — Ícones:** componente `Icon` próprio com traço Lucide (os caminhos vieram do protótipo + complementos), sem dependência nova.
- **D4 — "Phoenix · HH:MM":** a tela aberta se registra com `usePhoenixStatus({ atualizadoEm, carregando, atualizar })` (em `components/Shell/shellContext.js`); o clique chama o **mesmo** "Atualizar" da tela. Sem registro, o indicador não aparece. As telas passam a se registrar conforme forem refeitas.
- **Entrega:** por etapa, arquivos alterados + patch.

---

## 5. Sugestões futuras (exigem lógica nova — não serão implementadas)

- Dashboard: tiles "Sem guia", "Grupos a formar", "Escalas a enviar" e botão "Enviar escalas pendentes".
- Notificações automáticas de voo atrasado / pousou / prévia desatualizada / serviço sem guia no sino (hoje o sino só recebe avisos de disponibilidade dos guias, vindos de `notificacoes`). Os alertas da Dashboard continuam na Dashboard.
- Prévia de Serviços: registrar status Enviada / Desatualizada / Não enviada por veículo.
- Planilha operacional: "Copiar planilha" e copiar por veículo (se não houver texto pronto); filtro por tipo (IN/OUT/TRF/Passeio) da referência.
- Prévia de Serviços: botão "Copiar prévia" por veículo (precisa de chamada nova à área de transferência).
- Painel Operacional: "Enviar ao motorista" por veículo.
- Relatório executivo: Exportar PDF, Ranking de veículos, Pendências, Ranking de fornecedores na mesma tela.
- Gerar Escala: salvar regras no drawer e já gerar de novo.
- Mapa de afinidade e Lista de Guias: filtros que não existem hoje (só filtro visual será feito).
- Painel de Chegadas: o botão "Buscar voo no Google" fica dentro do botão do card (HTML inválido, gera aviso no console) — trocar o card por `div role=button`.
- Configurações: seção "Placas PDF" (qtd. por página, logo, cabeçalho) e "Integração Phoenix" (frequência de atualização) da referência.

---

## 6. Inventário (estado atual, antes de qualquer mudança)

Gerado a partir do código. Cada item é marcado `[x]` quando a tela refeita for conferida. Botões com handler `—` usam função inline (ex.: `onClick={(e) => { e.stopPropagation(); gerarPdfPlacasIndividuais(voo); }}`); o handler real está anotado no plano da tela (seção 3).

#### `src/pages/Dashboard/Dashboard.jsx`

**Botões / ações (rótulo → handler):**

- [x] Cadastros → toggleGrupo
- [x] Operação → toggleGrupo
- [x] [aria: Abrir menu] → setMenuAberto
- [x] [aria: Fechar menu] → setMenuAberto
- [x] [title: Sair] → logout

**Eventos ligados no JSX:** `onClick→fecharAoNavegar`, `onClick→logout`, `onClick→setMenuAberto`, `onClick→toggleGrupo`

<details><summary>Funções definidas no arquivo (5) — nenhuma muda de nome/assinatura</summary>

`Dashboard`, `aoTeclar`, `fecharAoNavegar`, `getNavClass`, `toggleGrupo`

</details>

> Etapa 2: todos os itens continuam. Os grupos do menu continuam abrindo/fechando (`toggleGrupo`, agora em todos os grupos); a gaveta do celular (`menuAberto`, Esc, trava de rolagem, `fecharAoNavegar`) foi mantida; o overlay `loading` do layout também.

#### `src/components/Notificacoes/NotificacoesSino.jsx`

**Botões / ações (rótulo → handler):**

- [ ] Marcar todas como lidas → marcarTodasLidas
- [ ] Ver mais ( {…} restante : ) → setQtdVisivel
- [ ] [aria: Fechar aviso] → setToasts
- [ ] [title: Fechar] → setAberto
- [ ] [title: Remover da minha lista] → apagarNotificacao
- [ ] small | small notif-badge | 99+ [title: Notificações] → setAberto

**Eventos ligados no JSX:** `onClick→abrirNotificacao`, `onClick→marcarTodasLidas`, `onClick→setAberto`, `onClick→setQtdVisivel`, `onClick→setToasts`

**Integrações:**
- [ ] Firestore: `notificacoes` (onSnapshot, updateDoc, writeBatch)
- [ ] Outros: setInterval

<details><summary>Funções definidas no arquivo (12) — nenhuma muda de nome/assinatura</summary>

`Contexto`, `Detalhes`, `NotificacoesSino`, `abrirNotificacao`, `apagarNotificacao`, `foiApagadaPorMim`, `foiLida`, `marcarLida`, `marcarTodasLidas`, `mostrarToast`, `rotulo`, `tempoRelativo`

</details>

#### `src/components/Home/Home.jsx`

**Botões / ações (rótulo → handler):**

- [x] 12 | 12 → copiarServicoDia
- [x] Abrir escala da semana → navigate
- [x] Comparativo → setAbaAtiva
- [x] Enviar ao guia → enviarWhatsappServico
- [x] Operadoras na semana {…} → —
- [x] Operação → setAbaAtiva
- [x] Passageiros com guia (%) {…} → —
- [x] Próxima semana → → setSemanaOffset
- [x] Puxando dados do Phoenix... | Atualizar dados do Phoenix → carregarApiSemana
- [x] Semana atual → setSemanaOffset
- [x] Serviços com guia (%) {…} → —
- [x] Serviços reais {…} → —
- [x] {…} • {…} → setDiaSelecionadoHome
- [x] ← Semana anterior → setSemanaOffset

**Eventos ligados no JSX:** `onClick→carregarApiSemana`, `onClick→copiarServicoDia`, `onClick→enviarWhatsappServico`, `onClick→navigate`, `onClick→setAbaAtiva`, `onClick→setDiaSelecionadoHome`, `onClick→setSemanaOffset`

**Filtros / campos:** 3 campos (input/select/textarea)

**Integrações:**
- [x] Firestore: `guide_availability`, `guide_tour_levels`, `guides`, `services`, `weekly_services` (getDocs)
- [x] HTTP: `https://bible-api.com/`, `https://driversalvador.phoenix.comeialabs.com/scale/reserve-service`, `https://wa.me/55`
- [x] Outros: alert/confirm, clipboard, recharts, whatsapp(wa.me), window.open

<details><summary>Funções definidas no arquivo (49) — nenhuma muda de nome/assinatura</summary>

`Home`, `LABEL_OCUPACAO`, `calcularDeltaPercentual`, `carregarApiSemana`, `carregarSemanaApi`, `carregarTudo`, `copiarServicoDia`, `deveIgnorarServico`, `disponibilidadeMedia`, `ehObservacaoCancelada`, `ehServicoDisp`, `ehServicoDispPorNomeOuTipo`, `encontrarRelacionadosNoBanco`, `enviarWhatsappServico`, `extrairCodigoReserva`, `extrairContagemPax`, `extrairDataServico`, `extrairHotelReserva`, `extrairListaResposta`, `extrairModoServico`, `extrairNomeOperadora`, `extrairNomePasseio`, `extrairNomeVendedor`, `extrairOperadora`, `extrairPrimeiroNome`, `extrairResponsavelDisp`, `extrairServiceIdExterno`, `formatarDataBr`, `formatarDelta`, `formatarUltimaAtualizacao`, `gerarMensagemServicoGuia`, `getAlertaComparativoPax`, `getAlertaSemaforo`, `getSemanaAnterior`, `getSemanaPorOffset`, `getTextoDataOperacional`, `hotelNaoInformado`, `isAmanha`, `itemEstaCancelado`, `montarNomeServicoExibicao`, `montarTextoServicoDia`, `montarUrlApi`, `normalizarTexto`, `obterNomeCanonico`, `renderCardLoading`, `renderIconeComparativo`, `renderValorCard`, `somarDiasIso`, `truncarTexto`

</details>

> Etapa 3: todos os itens continuam, com os mesmos handlers. Os 4 cards da semana (que eram botões sem ação) viraram tiles informativos em "Resumo da semana". Os tiles do dia filtram a tabela usando o filtro de status que já existia (`setFiltroStatusDia`). Nenhum cálculo de `dashboard` mudou.

#### `src/components/PainelOperacional/PainelOperacional.jsx`

**Botões / ações (rótulo → handler):**

- [x] (ícone) → setPlacaEmEdicao
- [x] (ícone) → setPopupPlacaAberto
- [x] Atualizando... | Atualizar → carregarDados
- [x] Buscar voo → —
- [x] Chegadas → setAbaAtiva
- [x] Editar placa → —
- [x] Gerar PDF agora → gerarPdfPlacaUnica
- [x] Gerar PDF da placa → gerarPlacaPersonalizada
- [x] Nova placa personalizada → abrirPopupNovaPlaca
- [x] OUT's → setAbaAtiva
- [x] Passeios → setAbaAtiva
- [x] Placa coleção → —
- [x] Placas individuais → —
- [x] Salvar nome → salvarEdicaoPlaca
- [x] small | small Copiado! | Copiar monitoramento → async
- [x] small | spin | small | small Copiado! | Carregando... | Copiar resumo → copiarResumo
- [x] {…} Sem passeio Passeios: {…} Veículos: {…} Pax: {…} small | small → toggleExpandirGrupoGuia
- [x] {…} {…} Buscar voo → toggleExpandirVoo

**Eventos ligados no JSX:** `onChange→toggleMonitoradoOut`, `onClick→abrirPopupNovaPlaca`, `onClick→async`, `onClick→carregarDados`, `onClick→copiarResumo`, `onClick→gerarPdfPlacaUnica`, `onClick→gerarPlacaPersonalizada`, `onClick→salvarEdicaoPlaca`, `onClick→setAbaAtiva`, `onClick→setPlacaEmEdicao`, `onClick→setPopupPlacaAberto`, `onClick→toggleExpandirGrupoGuia`, `onClick→toggleExpandirGrupoOut`, `onClick→toggleExpandirVoo`

**Filtros / campos:** 13 campos (input/select/textarea); placeholders: "Ex: G3 1234", "Ex: João Silva", "Ex: João Silva ou 123456"

**Integrações:**
- [x] Firestore: `painel_out_monitoramento` (onSnapshot, setDoc)
- [x] HTTP: `https://driversalvador.phoenix.comeialabs.com/scale/reserve-service`, `https://www.google.com/search`
- [x] localStorage: `painel_operacional_config_placas`
- [x] Outros: alert/confirm, clipboard, jsPDF, window.open

<details><summary>Funções definidas no arquivo (101) — nenhuma muda de nome/assinatura</summary>

`abreviarHotel`, `abrirBuscaGoogleVoo`, `abrirBuscaVooPratica`, `abrirEdicaoPlaca`, `abrirPopupNovaPlaca`, `calcularStatusVooPorHorario`, `carregarDados`, `carregarImagemComoDataURL`, `classificarStatusVoo`, `compararDataHora`, `copiarMonitoramentoGrupo`, `copiarResumo`, `desenharCabecalhoColecao`, `desenharCabecalhoPadraoPlaca`, `desenharItemColecao`, `desenharPlacaIndividual`, `desenharRodapePadraoPlaca`, `deveIgnorarServico`, `extrairAdicionais`, `extrairAdultos`, `extrairCodigoReserva`, `extrairContatoPax`, `extrairCriancas`, `extrairDataIsoDeValor`, `extrairDataRealServico`, `extrairDataReserva`, `extrairDestino`, `extrairEscalaId`, `extrairFlagCancelado`, `extrairFlagPousado`, `extrairFornecedor`, `extrairFornecedorNickname`, `extrairGuiaEscalado`, `extrairHoraMinutos`, `extrairHorarioApresentacao`, `extrairHorarioAtualizadoVoo`, `extrairHorarioDecolagemVoo`, `extrairHorarioPrevistoVoo`, `extrairHorarioRealVoo`, `extrairHorarioServico`, `extrairHotel`, `extrairInfantes`, `extrairListaResposta`, `extrairModalidadeServico`, `extrairMotorista`, `extrairNomeCliente`, `extrairNomePasseio`, `extrairNumeroEscala`, `extrairNumeroVoo`, `extrairObservacao`, `extrairOperadora`, `extrairOrigem`, `extrairPax`, `extrairPresentationHour`, `extrairTextoNomePlaca`, `extrairTextoVooPlaca`, `extrairTipoOutOuTransfer`, `extrairVeiculoEscalado`, `extrairVeiculoGuia`, `extrairVeiculoPrincipalOut`, `extrairVooRetornoTexto`, `formatarContato`, `formatarDataBr`, `formatarDataPlaca`, `formatarHora`, `formatarNomeGuia`, `formatarNomePasseio`, `formatarNomeVeiculo`, `formatarQuantidadeDetalhada`, `formatarTextoApoio`, `formatarVariacaoVoo`, `gerarPdfPlacaUnica`, `gerarPdfPlacasColecao`, `gerarPdfPlacasIndividuais`, `gerarPlacaPersonalizada`, `getBadgeAlertaServicoHoje`, `getHojeIso`, `labelStatusVoo`, `linesPushIfValue`, `marcarComoMonitorado`, `montarChaveMonitoramento`, `montarLinhasPassageiros`, `montarResumoTexto`, `montarTextoMonitoramentoGrupo`, `montarUrlApi`, `normalizarCodigoVoo`, `normalizarNomePasseio`, `normalizarTexto`, `obterNomePlaca`, `obterPontoDeApoio`, `ordenarHora`, `quebrarTextoCentralizado`, `resolverQuantidadePorPaginaColecao`, `salvarEdicaoPlaca`, `salvarMonitoramento`, `somarPaxDetalhadoReservas`, `somarReservas`, `toggleExpandirGrupoGuia`, `toggleExpandirGrupoOut`, `toggleExpandirVoo`, `toggleMonitoradoOut`

</details>

> Etapa 4: todos os itens continuam com os mesmos handlers (inclusive os que eram funções inline: `abrirBuscaGoogleVoo`, `gerarPdfPlacasIndividuais`, `gerarPdfPlacasColecao`, `abrirEdicaoPlaca`, `abrirBuscaVooPratica`, `copiarMonitoramentoGrupo` + `marcarComoMonitorado`). Os 2 popups e o card de configurações das placas viraram drawers com os mesmos campos; a chave `painel_operacional_config_placas` não mudou.

#### `src/components/PainelChegadas/PainelChegadas.jsx`

**Botões / ações (rótulo → handler):**

- [ ] Atualizando... | Atualizar → carregarChegadas
- [ ] Buscar no Google [title: Buscar ${voo.voo} no Google] → —
- [ ] {…} Buscar no Google → toggleExpandirVoo

**Eventos ligados no JSX:** `onClick→carregarChegadas`, `onClick→toggleExpandirVoo`

**Filtros / campos:** 3 campos (input/select/textarea)

**Integrações:**
- [ ] HTTP: `https://driversalvador.phoenix.comeialabs.com/scale/reserve-service`, `https://www.google.com/search`
- [ ] Outros: window.open

<details><summary>Funções definidas no arquivo (41) — nenhuma muda de nome/assinatura</summary>

`PainelChegadas`, `abrirBuscaGoogleVoo`, `calcularStatusVooPorHorario`, `carregarChegadas`, `classificarStatusVoo`, `extrairAdicionais`, `extrairAdultos`, `extrairCodigoReserva`, `extrairContatoPax`, `extrairCriancas`, `extrairDestino`, `extrairEscalaId`, `extrairFlagCancelado`, `extrairFlagPousado`, `extrairHoraMinutos`, `extrairHorarioAtualizadoVoo`, `extrairHorarioDecolagemVoo`, `extrairHorarioPrevistoVoo`, `extrairHorarioRealVoo`, `extrairHorarioServico`, `extrairInfantes`, `extrairListaResposta`, `extrairModalidadeServico`, `extrairMotorista`, `extrairNomeCliente`, `extrairNumeroVoo`, `extrairOperadora`, `extrairPax`, `extrairResumoPax`, `extrairVeiculoEscalado`, `formatarContato`, `formatarDataBr`, `formatarVariacaoVoo`, `getHojeIso`, `labelStatusVoo`, `montarUrlApi`, `normalizarCodigoVoo`, `normalizarTexto`, `ordenarHora`, `somarReservas`, `toggleExpandirVoo`

</details>

#### `src/components/PainelSaidas/PainelSaidas.jsx`

**Botões / ações (rótulo → handler):**

- [ ] Atualizando OUT | : → carregarOuts
- [ ] {…} {…} {…} reserva(s) {…} pax {…} hotel(is) {…} {…} {…} → toggleExpandirGrupo

**Eventos ligados no JSX:** `onClick→carregarOuts`, `onClick→toggleExpandirGrupo`

**Filtros / campos:** 2 campos (input/select/textarea)

**Integrações:**
- [ ] HTTP: `https://driversalvador.phoenix.comeialabs.com/scale/reserve-service`

<details><summary>Funções definidas no arquivo (29) — nenhuma muda de nome/assinatura</summary>

`PainelOuts`, `carregarOuts`, `extrairAdultos`, `extrairCodigoReserva`, `extrairContatoPax`, `extrairCriancas`, `extrairDestino`, `extrairEscalaId`, `extrairHotel`, `extrairInfantes`, `extrairListaResposta`, `extrairMotorista`, `extrairNomeCliente`, `extrairObservacao`, `extrairOperadora`, `extrairOrigem`, `extrairPax`, `extrairPresentationHour`, `extrairRegiao`, `extrairVeiculo`, `formatarContato`, `formatarDataBr`, `formatarHora`, `formatarPaxDetalhado`, `getHojeIso`, `montarUrlApi`, `normalizarTexto`, `ordenarHora`, `toggleExpandirGrupo`

</details>

#### `src/components/RoboConferenteVoos/RoboConferenteVoos.jsx`

**Botões / ações (rótulo → handler):**

- [ ] Buscar voo → —
- [ ] spin | small | small Atualizar dados → carregar
- [ ] spin | small | small Rodando robô... → rodarRoboServicoPorServico
- [ ] {…} ( {…} ) → setAbaAtiva

**Eventos ligados no JSX:** `onClick→carregar`, `onClick→rodarRoboServicoPorServico`, `onClick→setAbaAtiva`, `onClick→toggle`

**Filtros / campos:** 1 campos (input/select/textarea)

**Integrações:**
- [ ] Firestore: `providers` (onSnapshot)
- [ ] HTTP: `https://driversalvador.phoenix.comeialabs.com/scale/reserve-service`, `https://guia-app.onrender.com`, `https://www.google.com/search`
- [ ] Outros: GoogleDrive, window.open

<details><summary>Funções definidas no arquivo (81) — nenhuma muda de nome/assinatura</summary>

`BlocoResumo`, `ListaServicosEscalados`, `TabsTipoServico`, `abrirBuscaGoogleVoo`, `abrirBuscaGoogleVooPhoenix`, `buildAirportMapByNumber`, `buildDiagnostico`, `buildGroupedServices`, `buildScaleLabel`, `buildSummary`, `buildVehicleIndex`, `carregar`, `classifyServiceType`, `diffMinutes`, `extractDestinationFromItem`, `extractDestinationLabel`, `extractDriverDisplay`, `extractDriverFromItem`, `extractDriverFromReserveService`, `extractFlightCode`, `extractFlightNumberOnly`, `extractObservationFlightCode`, `extractOriginFromItem`, `extractOriginLabel`, `extractPassengerName`, `extractPaxBreakdown`, `extractPhoenixFlightTime`, `extractReservationCode`, `extractReserveServicesFromRoadmapItem`, `extractRoadmapId`, `extractScaleCodeFromItem`, `extractScaleCodeFromReserveService`, `extractScaleIdFromItem`, `extractScaleIdFromReserveService`, `extractVehicleDisplay`, `extractVehicleFromItem`, `extractVehicleFromReserveService`, `extractVehicleIdentity`, `extractVehicleIdentityFromItem`, `extrairCodigoEscala`, `extrairCodigoEscalaRobusto`, `extrairContatoReserva`, `extrairEscalaLabel`, `extrairHoraPrincipalReserva`, `extrairHorarioVooPhoenix`, `extrairListaResposta`, `extrairModalidade`, `extrairNumeroVooPhoenix`, `extrairNumeroVooPrincipal`, `extrairObservacao`, `extrairPaxBreakdown`, `extrairVeiculoDisplayRobusto`, `extrairVeiculoIdentidade`, `findBestAirportMatch`, `findVehicleMatch`, `flattenRoadmapReserveServices`, `formatHour`, `formatarCodigoVooExibicao`, `formatarDataBr`, `formatarDiff`, `formatarQuantidadeDetalhada`, `gerarVariacoesVeiculo`, `getCardSemaforoStyle`, `getClasse`, `getHojeIso`, `getRotuloStatus`, `horarioValido`, `isAirportLike`, `mergeGruposOperacionais`, `montarUrlPhoenixReserveService`, `normalizarEstrito`, `normalizarTexto`, `normalizeAirportPayload`, `normalizeAirportStatus`, `normalizeScaleCode`, `normalizeVehicleKey`, `rodarRoboServicoPorServico`, `sortReservasByHora`, `sortReservasPorHorario`, `toMinutes`, `toggle`

</details>

#### `src/components/PreviaTransfers/PreviaTransfers.jsx`

**Botões / ações (rótulo → handler):**

- [x] (ícone) → abrirWhatsappPorVeiculo
- [x] Atualizando serviços... | Atualizar → carregarServicos
- [x] Enviar todas as prévias atualizadas → envioGeral
- [x] Enviar todas as prévias → envioGeral

**Eventos ligados no JSX:** `onClick→abrirWhatsappPorVeiculo`, `onClick→carregarServicos`, `onClick→envioGeral`, `onDragEnd→setDraggingVehicle`, `onDragStart→setDraggingVehicle`

**Filtros / campos:** 2 campos (input/select/textarea)

**Integrações:**
- [x] Firestore: `providers` (onSnapshot)
- [x] HTTP: `https://driversalvador.phoenix.comeialabs.com/scale/reserve-service`, `https://wa.me/`
- [x] localStorage: `previa_operacional_ordem_blocos_v3`
- [x] Outros: alert/confirm, whatsapp(wa.me), window.open

<details><summary>Funções definidas no arquivo (54) — nenhuma muda de nome/assinatura</summary>

`PreviaEscalasPlanilha`, `abreviarHotel`, `abrirWhatsappFornecedor`, `abrirWhatsappPorVeiculo`, `carregarServicos`, `classificarTipoEscala`, `compararDataHoraServico`, `construirLinhaMensagem`, `deveEntrarNaPrevia`, `dividirEmLinhas`, `envioGeral`, `extrairAdultos`, `extrairCriancas`, `extrairDataIsoDeValor`, `extrairDataServicoReal`, `extrairDestino`, `extrairEscalaId`, `extrairGuia`, `extrairHorario`, `extrairInfantes`, `extrairListaResposta`, `extrairMotorista`, `extrairOrigem`, `extrairPasseio`, `extrairPasseioId`, `extrairPax`, `extrairPaxDetalhado`, `extrairTextoLinhaEscala`, `extrairVeiculo`, `extrairVeiculosFornecedor`, `formatarDataCurtaBr`, `formatarDataTitulo`, `formatarHoraMensagem`, `formatarPaxDetalhado`, `formatarWhatsappVisual`, `getHojeIso`, `getIndiceOrdemVeiculo`, `isAeroporto`, `isHotel`, `lerLocalStorage`, `limparNomeGuia`, `limparNumeroWhatsapp`, `montarMarcadorHoje`, `montarMensagemFornecedor`, `montarMensagemPorVeiculo`, `montarTagHojeData`, `montarUrlApi`, `moverBloco`, `normalizarNomeVeiculo`, `normalizarTexto`, `ordenarHora`, `salvarLocalStorage`, `somarPaxDetalhado`, `tipoLinhaClass`

</details>

> Um componente, dois itens do menu: /previas mostra KPIs + tabela de envio por veículo (linha expansível com os serviços); /planilha mostra a grade arrastável. carregarServicos, envioGeral, abrirWhatsappPorVeiculo, moverBloco, ordem no localStorage e colunas inalterados. Texto da planilha (textContent) idêntico ao anterior ("*VEÍCULO: X*", "IN - 06:00 - HOTEL - 6/0/1"): rótulos novos vêm de CSS. Removido o scroll automático que eu tinha posto na etapa 2 (a planilha agora abre no topo da própria rota).

#### `src/components/ResumoOperacional/ResumoOperacional.jsx`

**Botões / ações (rótulo → handler):**

- [ ] Atualizando... | Atualizar → carregarServicos
- [ ] small | small Copiado! | Copiar resumo → copiarResumo
- [ ] {…} {…} Motorista: {…} Modalidade: {…} Reservas: {…} Pax: {…} {…} → toggleGrupo

**Eventos ligados no JSX:** `onClick→carregarServicos`, `onClick→copiarResumo`, `onClick→toggleGrupo`

**Filtros / campos:** 3 campos (input/select/textarea)

**Integrações:**
- [ ] HTTP: `https://driversalvador.phoenix.comeialabs.com/scale/reserve-service`
- [ ] Outros: alert/confirm, clipboard

<details><summary>Funções definidas no arquivo (28) — nenhuma muda de nome/assinatura</summary>

`carregarServicos`, `copiarResumo`, `deveIgnorarServico`, `extrairAdultos`, `extrairCriancas`, `extrairFornecedor`, `extrairGuiaEscalado`, `extrairHorarioApresentacao`, `extrairHotel`, `extrairInfantes`, `extrairListaResposta`, `extrairModalidade`, `extrairNomePasseio`, `extrairNomePax`, `extrairObservacao`, `extrairQuantidade`, `extrairReservaCodigo`, `extrairTipoLinha`, `extrairVeiculo`, `formatarDataBr`, `formatarHora`, `formatarQuantidadeDetalhada`, `getHojeIso`, `montarResumoTexto`, `montarUrlApi`, `normalizarTexto`, `ordenarHora`, `toggleGrupo`

</details>

#### `src/components/ListaPasseios/ListaPasseios.jsx`

**Botões / ações (rótulo → handler):**

- [x] Abrir planilha → abrirEscalaEmNovaAba
- [x] Atualizar dados (Phoenix) → atualizarSomentePlanilha
- [x] Desfazer escala de Guias → desfazerGuiasSemana
- [x] Editar escala → setModoVisualizacao
- [x] Enviando... | Salvar no Drive → salvarNoDrive
- [x] Enviar todos os Bloqueios {…} → enviarWhatsappGuiasSemana_FIRESTORE
- [x] Enviar → enviarWhatsappGuiaIndividual
- [x] Fechar → setRelatorioEscala
- [x] Gerar escala de Guias → alocarGuiasSemana
- [x] Semana atual → setSemanaOffset
- [x] Semana seguinte ➡ → setSemanaOffset
- [x] Visualizar → setModoVisualizacao
- [x] ➕ → adicionarPasseioManual
- [x] ⬅ Semana anterior → setSemanaOffset
- [x] 🗑️ → removerPasseio

**Eventos ligados no JSX:** `onChange→async`, `onClick→abrirEscalaEmNovaAba`, `onClick→adicionarPasseioManual`, `onClick→alocarGuiasSemana`, `onClick→atualizarSomentePlanilha`, `onClick→desfazerGuiasSemana`, `onClick→enviarWhatsappGuiaIndividual`, `onClick→enviarWhatsappGuiasSemana_FIRESTORE`, `onClick→removerPasseio`, `onClick→salvarNoDrive`, `onClick→setModoVisualizacao`, `onClick→setRelatorioEscala`, `onClick→setSemanaOffset`

**Filtros / campos:** 6 campos (input/select/textarea); placeholders: "Nome do serviço", "Pax"

**Integrações:**
- [x] HTTP: `https://wa.me/55`
- [x] Outros: GoogleDrive, alert/confirm, setInterval, whatsapp(wa.me), window.open

<details><summary>Funções definidas no arquivo (23) — nenhuma muda de nome/assinatura</summary>

`ListaPasseiosSemana`, `adicionarPasseioManual`, `alocarGuiasSemana`, `alterarGuiaManual`, `alterarPaxManual`, `alterarStatusAlocacao`, `atualizarSomentePlanilha`, `avancarEtapaRobo`, `carregar`, `carregarDados`, `desfazerGuiasSemana`, `enviarWhatsappGuiaIndividual`, `enviarWhatsappGuiasSemana_FIRESTORE`, `finalizarRoboEscala`, `formatarDataCurta`, `iniciarRoboEscala`, `recarregarExtras`, `removerPasseio`, `renderDiasSkeleton`, `renderResumoSkeleton`, `salvarNoDrive`, `statusGrupo`, `textoMotivoNaoAlocado`

</details>

> Etapa 5: todos os itens continuam com os mesmos handlers e a mesma condição de bloqueio (`processandoAcao || carregandoEstrutura || gerandoEscala`). "Abrir planilha", "Salvar no Drive" e "Atualizar dados (Phoenix)" foram para o menu ⋯. A lógica do robô (`alocarGuiasSemana`, `gerarPlanoAlocacaoSemana`) não foi tocada.

#### `src/components/EscalaSemanal/EscalaSemanal.jsx`

**Botões / ações (rótulo → handler):**

- [ ] Disparar bloqueios da semana (WhatsApp) → enviarBloqueiosSemana
- [ ] Gerando... | Gerar Escala Automática → gerarEscala

**Eventos ligados no JSX:** `onChange→e`, `onClick→enviarBloqueiosSemana`, `onClick→gerarEscala`

**Filtros / campos:** 1 campos (input/select/textarea)

**Integrações:**
- [ ] Firestore: `guide_availability`, `guides`, `services` (getDocs)
- [ ] HTTP: `https://wa.me/`
- [ ] Outros: alert/confirm, whatsapp(wa.me), window.open

<details><summary>Funções definidas no arquivo (4) — nenhuma muda de nome/assinatura</summary>

`EscalaSemanal`, `carregarDados`, `enviarBloqueiosSemana`, `gerarEscala`

</details>

#### `src/components/EscalaAutomaticaSemana/EscalaAutomaticaSemana.jsx`

**Botões / ações (rótulo → handler):**

- [ ] Atualizar → carregarDados
- [ ] Próxima semana → setOffsetSemana
- [ ] Semana anterior → setOffsetSemana
- [ ] Semana atual → setOffsetSemana

**Eventos ligados no JSX:** `onClick→carregarDados`, `onClick→setOffsetSemana`

**Integrações:**
- [ ] Firestore: `guides`, `services` (getDocs)
- [ ] HTTP: `https://driversalvador.phoenix.comeialabs.com/scale/reserve-service`

<details><summary>Funções definidas no arquivo (12) — nenhuma muda de nome/assinatura</summary>

`EscalaAutomaticaSemana`, `buscarCatalogoServicos`, `buscarGuias`, `buscarPasseiosPorDia`, `carregarDados`, `encontrarGuiasAptos`, `encontrarServicoNoCatalogo`, `extrairListaResposta`, `extrairNomePasseio`, `extrairPax`, `montarUrl`, `normalizarTexto`

</details>

#### `src/components/DisponibilidadeGuia/DisponibilidadeGuia.jsx`

**Botões / ações (rótulo → handler):**

- [ ] Próxima semana ▶ → setSemanaOffset
- [ ] Remover todos | Selecionar todos → selecionarTodosDias
- [ ] Salvando... | Salvar disponibilidade → salvarDisponibilidade
- [ ] Semana atual → setSemanaOffset
- [ ] × → removerDataSalva
- [ ] ◀ Semana anterior → setSemanaOffset

**Eventos ligados no JSX:** `onClick→adicionarDia`, `onClick→removerDataSalva`, `onClick→salvarDisponibilidade`, `onClick→selecionarTodosDias`, `onClick→setSemanaOffset`

**Filtros / campos:** 2 campos (input/select/textarea); placeholders: "Buscar por guia ou data"

**Integrações:**
- [ ] Firestore: `guide_availability`, `guides` (getDoc, getDocs, setDoc, updateDoc)
- [ ] Outros: alert/confirm

<details><summary>Funções definidas no arquivo (12) — nenhuma muda de nome/assinatura</summary>

`DisponibilidadeGuia`, `adicionarDia`, `carregarDisponibilidadeSemana`, `carregarGuias`, `formatarIntervaloSemana`, `getSemanaAtual`, `removerDataSalva`, `removerDia`, `salvarDisponibilidade`, `selecionarGuia`, `selecionarTodosDias`, `toggleFiltroDia`

</details>

#### `src/components/Guias/ListaGuias.jsx`

**Botões / ações (rótulo → handler):**

- [x] Editar → setGuiaEditando

**Eventos ligados no JSX:** `onClick→setGuiaEditando`

**Filtros / campos:** 4 campos (input/select/textarea); placeholders: "Buscar por nome, idioma ou WhatsApp"

**Integrações:**
- [x] Firestore: `guides` (getDocs)

<details><summary>Funções definidas no arquivo (2) — nenhuma muda de nome/assinatura</summary>

`ListaGuias`, `carregarGuias`

</details>

> Tabela com filtros (busca, idioma, motoguia, status) — mesmos estados e mesmo filtro; botão Editar abre o drawer.

#### `src/components/Guias/EditarGuiaModal.jsx`

**Botões / ações (rótulo → handler):**

- [x] (ícone) → onClose
- [x] Cancelar → onClose
- [x] Salvando... | Salvar → salvar

**Eventos ligados no JSX:** `onClick→onClose`, `onClick→salvar`

**Filtros / campos:** 6 campos (input/select/textarea); placeholders: "Nome", "WhatsApp"

**Integrações:**
- [x] Firestore: `guide_tour_levels`, `guides`, `services` (getDoc, getDocs, updateDoc)
- [x] Outros: alert/confirm

<details><summary>Funções definidas no arquivo (8) — nenhuma muda de nome/assinatura</summary>

`EditarGuiaModal`, `LABEL_NIVEL`, `carregarDados`, `formatarTelefone`, `getNivelClass`, `obterNomePasseio`, `salvar`, `toggleIdioma`

</details>

> Mesmo componente/props; o render agora usa <Drawer>. salvar(), validações e campos inalterados.

#### `src/components/MapaAfinidadeGuias/MapaAfinidadeGuias.jsx`

**Botões / ações (rótulo → handler):**

- [x] Salvando alterações... | Salvar mapeamento → salvarMapa

**Eventos ligados no JSX:** `onClick→salvarMapa`

**Filtros / campos:** 2 campos (input/select/textarea)

**Integrações:**
- [x] Firestore: `guide_tour_levels`, `guides`, `services` (getDoc, getDocs, setDoc)

<details><summary>Funções definidas no arquivo (8) — nenhuma muda de nome/assinatura</summary>

`LABEL_NIVEL`, `MapaAfinidadeGuias`, `atualizarNivel`, `carregarDados`, `carregarMapaGuia`, `obterCorNivel`, `obterNomePasseio`, `salvarMapa`

</details>

> Duas colunas: lista de guias (com busca visual nova, só filtra a lista) e passeios com sliders. salvarMapa/atualizarNivel inalterados; cores dos níveis via tokens.

#### `src/components/ServicosFornecedor/ServicosFornecedor.jsx`

**Botões / ações (rótulo → handler):**

- [x] (ícone) → aplicarAtalho
- [x] (ícone) → vincular
- [x] Colunas → setSeletorColunasAberto
- [x] Definir agora → irParaPendentes
- [x] Desmarcar todos → marcarTodos
- [x] Imprimir relatório → imprimirRelatorio
- [x] Marcar todos → marcarTodos
- [x] Por fornecedor → setModoRanking
- [x] Por veículo → setModoRanking
- [x] Todos {…} {…} → setTipoDetalhe
- [x] Todos {…} → setVeiculoDetalhe
- [x] Veículos e fornecedores {…} de {…} no relatório small | small → setPainelVeiculosAberto
- [x] Voltar ao ranking → selecionarFornecedor
- [x] [aria: Limpar busca] → setBusca
- [x] [title: Cancelar] → setEditandoVeiculo
- [x] [title: Mudar o fornecedor deste veículo] → —
- [x] [title: Renomear fornecedor] → —
- [x] [title: Salvar nome] → renomearFornecedor
- [x] [title: Salvar] → vincular
- [x] [title: Tirar do fornecedor] → desvincular
- [x] sf-spin | small | small Atualizar → carregar
- [x] {…} {…} [title: Vincular ${v.nome} ao fornecedor ${s}] → vincular
- [x] {…} {…} → setVeiculoDetalhe

**Eventos ligados no JSX:** `onChange→alternarColuna`, `onChange→alternarLista`, `onChange→alternarVeiculo`, `onClick→aplicarAtalho`, `onClick→carregar`, `onClick→desvincular`, `onClick→imprimirRelatorio`, `onClick→irParaPendentes`, `onClick→marcarTodos`, `onClick→modoRanking`, `onClick→onOrdenar`, `onClick→renomearFornecedor`, `onClick→selecionarFornecedor`, `onClick→setBusca`, `onClick→setEditandoVeiculo`, `onClick→setModoRanking`, `onClick→setPainelVeiculosAberto`, `onClick→setSeletorColunasAberto`, `onClick→setTipoDetalhe`, `onClick→setVeiculoDetalhe`, `onClick→vincular`

**Filtros / campos:** 12 campos (input/select/textarea)

**Integrações:**
- [x] Firestore: onSnapshot, setDoc, updateDoc
- [x] HTTP: `https://driversalvador.phoenix.comeialabs.com/scale/reserve-service`
- [x] localStorage: `servicos_fornecedor_colunas_v1`, `servicos_fornecedor_veiculos_desmarcados_v2`
- [x] Outros: alert/confirm, print, window.open

<details><summary>Funções definidas no arquivo (67) — nenhuma muda de nome/assinatura</summary>

`ServicosFornecedor`, `Th`, `alternarColuna`, `alternarLista`, `alternarOrdem`, `alternarVeiculo`, `aplicarAtalho`, `atualizarDesmarcados`, `buscarDia`, `buscarJson`, `carregar`, `casaBusca`, `chaveFornecedor`, `chaveVeiculoItem`, `checkboxLista`, `classificarTipo`, `consolidarServicos`, `descreverServico`, `desvincular`, `diasAtrasIso`, `ehAeroporto`, `escaparHtml`, `executarGravacao`, `extrairDataReal`, `extrairDestino`, `extrairEscalaId`, `extrairGuia`, `extrairHora`, `extrairListaResposta`, `extrairMotorista`, `extrairNomeServico`, `extrairObjVeiculo`, `extrairOrigem`, `extrairPax`, `extrairPlaca`, `extrairVeiculo`, `extrairVeiculoId`, `formatarDataBr`, `formatarDataCurta`, `formatarNumero`, `fornecedorDoVeiculo`, `gravarVinculos`, `grupoAutomatico`, `hojeIso`, `imprimirRelatorio`, `infoVeiculo`, `irParaPendentes`, `kpisHtml`, `lerColunas`, `lerSet`, `listarDatas`, `marcarTodos`, `montarUrlApi`, `normalizarTexto`, `num`, `placaVisivel`, `removerVinculo`, `renomearFornecedor`, `salvarSet`, `selecionarFornecedor`, `tabelaDetalhe`, `toIso`, `tokensSignificativos`, `trabalhador`, `valorCelula`, `valorHorario`, `vincular`

</details>

> Cabeçalho (PageHeader com seletor do relatório, Atualizar e Imprimir), FilterBar, atalhos de período em Segmented, KPIs em KpiTiles, ranking com Segmented Por fornecedor/Por veículo. Painel de vínculos, ordenação, seletor de colunas e impressão inalterados; styles.css reescrito só com tokens (ícones MUI trocados pelo Icon do projeto).

#### `src/components/RelatoriosOp/RelatoriosOp.jsx`

**Botões / ações (rótulo → handler):**

- [x] (ícone) → setFiltrosAbertos
- [x] (ícone) → —
- [x] Guias → setAbaAtiva
- [x] Passeios → setAbaAtiva
- [x] Transfers → setAbaAtiva
- [x] spin | small | small Atualizando... | Atualizar → carregarDados

**Eventos ligados no JSX:** `onClick→carregarDados`, `onClick→setAbaAtiva`, `onClick→setFiltrosAbertos`

**Filtros / campos:** 12 campos (input/select/textarea); placeholders: "Guia, passeio, operadora, veículo..."

**Integrações:**
- [x] HTTP: `https://driversalvador.phoenix.comeialabs.com/scale/reserve-service`
- [x] Outros: recharts

<details><summary>Funções definidas no arquivo (36) — nenhuma muda de nome/assinatura</summary>

`RelatoriosOperacionaisApiOnly`, `TooltipTimelineGuias`, `calcularDeltaPercentual`, `carregarApiPorDatas`, `carregarDados`, `classificarTransfer`, `consolidarServicosPhoenix`, `deveIgnorarServico`, `diferencaDias`, `ehPasseio`, `extrairContagemPax`, `extrairDataServico`, `extrairDestino`, `extrairGuiaApi`, `extrairHorarioServico`, `extrairIdServico`, `extrairListaResposta`, `extrairNomePasseio`, `extrairOperadora`, `extrairOrigem`, `extrairRegiao`, `extrairVeiculo`, `formatarDataBr`, `formatarDelta`, `formatarNumero`, `formatarPeriodoTitulo`, `getDiasAtrasIso`, `getHojeIso`, `getPeriodoComparativo`, `listarDatasNoPeriodo`, `montarUrlApi`, `normalizarTexto`, `obterNomeCanonico`, `pegar`, `renderCardLoading`, `toIso`

</details>

> PageHeader com atalhos de período (Segmented) e Atualizar; abas Guias/Passeios/Transfers em Segmented; filtros (mesmos estados) em FilterBar recolhível; KPIs em KpiTiles; tabelas no componente Table. Gráficos só com accent/neutros: o comparativo de demanda (2 eixos Y) virou 2 gráficos; 'Passeios com maior volume' separou pax e formação de grupo (mesmos dados, um eixo cada); a rosca do mix virou barras de participação. Lógica, chamadas ao Phoenix e consolidação inalteradas. styles.css antigo deixou de ser importado.

#### `src/components/RegisterGuias/RegisterGuias.jsx`

**Botões / ações (rótulo → handler):**

- [x] Atua como Motoguia → setMotoguia
- [x] Salvando... | Cadastrar guia → —

**Eventos ligados no JSX:** `onClick→adicionarIdioma`, `onClick→adicionarPasseio`, `onClick→setMotoguia`, `onSubmit→salvarGuia`

**Filtros / campos:** 3 campos (input/select/textarea); placeholders: "Digite o nome do guia", "Informe o WhatsApp", "Informe pontos fortes, características ou diferenc"

**Integrações:**
- [x] Firestore: `guides`, `services` (addDoc, getDocs)
- [x] Outros: GoogleDrive, alert/confirm

<details><summary>Funções definidas no arquivo (8) — nenhuma muda de nome/assinatura</summary>

`CadastroGuia`, `adicionarIdioma`, `adicionarPasseio`, `carregarDados`, `formatarTelefone`, `removerIdioma`, `removerPasseio`, `salvarGuia`

</details>

> Ícones MUI → Icon do projeto; nenhuma outra mudança no JSX. Visual via pages/Cadastros/styles.css.

#### `src/components/CadastroFornecedores/CadastroFornecedores.jsx`

**Botões / ações (rótulo → handler):**

- [x] Atualizando veículos... | Atualizar veículos da API → carregarVeiculosDaApi
- [x] Cancelar edição → resetForm
- [x] Editar → preencherFormEdicao
- [x] Exibir como Plotado {…} → setPlotado
- [x] Fornecedor ativo {…} → setAtivo
- [x] Salvando... | Salvar alterações | Cadastrar fornecedor → —
- [x] small | small Ativar | Inativar → alternarStatusFornecedor

**Eventos ligados no JSX:** `onClick→adicionarVeiculo`, `onClick→alternarStatusFornecedor`, `onClick→carregarVeiculosDaApi`, `onClick→preencherFormEdicao`, `onClick→resetForm`, `onClick→setAtivo`, `onClick→setPlotado`, `onSubmit→salvarFornecedor`

**Filtros / campos:** 5 campos (input/select/textarea); placeholders: "Buscar por nome, telefone ou veículo", "Digite o nome do fornecedor", "Ex: 15", "Informe o WhatsApp"

**Integrações:**
- [x] Firestore: `providers` (addDoc, getDocs, onSnapshot, updateDoc)
- [x] HTTP: `https://driversalvador.phoenix.comeialabs.com/scale/reserve-service`
- [x] Outros: GoogleDrive

<details><summary>Funções definidas no arquivo (16) — nenhuma muda de nome/assinatura</summary>

`CadastroFornecedores`, `adicionarVeiculo`, `alternarStatusFornecedor`, `atualizarCapacidadeVeiculo`, `carregarVeiculosDaApi`, `extrairListaResposta`, `extrairVeiculo`, `formatarTelefone`, `getHojeIso`, `montarUrlApi`, `normalizarTexto`, `normalizarVeiculoParaObjeto`, `preencherFormEdicao`, `removerVeiculo`, `resetForm`, `salvarFornecedor`

</details>

> Ícones MUI → Icon do projeto; nenhuma outra mudança no JSX.

#### `src/components/GerenciarUsuarios/GerenciarUsuarios.jsx`

**Botões / ações (rótulo → handler):**

- [x] Cancelar → onFechar
- [x] Carregar mais ( {…} restante : ) → setQtdVisivel
- [x] Copiado! | Copiar mensagem → copiarCredenciais
- [x] Criando... | Criar conta → —
- [x] Fechar → setCredenciais
- [x] Salvando... | Salvar → —
- [x] [title: Editar] → —
- [x] [title: Enviar link de nova senha] → enviarRedefinicao
- [x] [title: Gerar outra senha] → setCampo

**Eventos ligados no JSX:** `onChange→setCampo`, `onClick→copiarCredenciais`, `onClick→enviarRedefinicao`, `onClick→onFechar`, `onClick→setCampo`, `onClick→setCredenciais`, `onClick→setQtdVisivel`, `onSubmit→criarUsuario`, `onSubmit→submit`

**Filtros / campos:** 10 campos (input/select/textarea)

**Integrações:**
- [x] Firestore: `guides`, `users` (getDocs, setDoc, updateDoc)
- [x] Outros: alert/confirm, clipboard

<details><summary>Funções definidas no arquivo (13) — nenhuma muda de nome/assinatura</summary>

`EditarUsuarioModal`, `GerenciarUsuarios`, `carregar`, `copiarCredenciais`, `criarUsuario`, `enviarRedefinicao`, `gerarSenha`, `getSecondaryAuth`, `mensagemErroAuth`, `salvarEdicao`, `set`, `setCampo`, `submit`

</details>

> Ícones MUI → Icon do projeto; nenhuma outra mudança no JSX.

#### `src/components/RegisterTours/RegisterTours.jsx`

**Botões / ações (rótulo → handler):**

- [ ] Apagar → excluirPasseio
- [ ] Cancelar edição → limparFormulario
- [ ] Editar → editarPasseio
- [ ] Importando... | Puxar dados do Phoenix → importarPasseiosDaApi
- [ ] Salvando... | Salvar alterações | Cadastrar passeio → —

**Eventos ligados no JSX:** `onClick→adicionarDia`, `onClick→editarPasseio`, `onClick→excluirPasseio`, `onClick→importarPasseiosDaApi`, `onClick→limparFormulario`, `onSubmit→salvarPasseio`

**Filtros / campos:** 3 campos (input/select/textarea); placeholders: "Descreva o passeio ou observações importantes", "Digite o nome do passeio", "Informe o ID do serviço no Phoenix"

**Integrações:**
- [ ] Firestore: `services` (addDoc, deleteDoc, getDocs, setDoc, updateDoc)
- [ ] HTTP: `https://driversalvador.phoenix.comeialabs.com/scale/reserve-service`
- [ ] Outros: GoogleDrive, alert/confirm

<details><summary>Funções definidas no arquivo (19) — nenhuma muda de nome/assinatura</summary>

`CadastroPasseio`, `adicionarDia`, `carregarPasseios`, `deveIgnorarServico`, `editarPasseio`, `excluirPasseio`, `extrairListaResposta`, `extrairNomePasseio`, `extrairServiceIdExterno`, `gerarDiasImportacao`, `importarPasseiosDaApi`, `limparFormulario`, `montarUrlApi`, `normalizarTexto`, `obterDiaSemanaPt`, `obterNomeCanonico`, `ordenarFrequencia`, `removerDia`, `salvarPasseio`

</details>

#### `src/pages/Configuracoes/Configuracoes.jsx`

**Botões / ações (rótulo → handler):**

- [x] (ícone) → salvarUsoAfinidade
- [x] Claro Mais leve e aberto light | theme-check | small → aplicarTema
- [x] Dark Equilíbrio e contraste dark | theme-check | small → aplicarTema
- [x] Dark Pro Mais sofisticado dark-pro | theme-check | small → aplicarTema
- [x] Equilibrado Distribui os serviços de forma mais justa entre os guias, ajudando a → salvarModo
- [x] Escala → setAbaAtiva
- [x] Prioridade Favorece guias com maior nível de prioridade durante a geração da esc → salvarModo
- [x] Tema → setAbaAtiva
- [x] {…} {…} → salvarModoIdioma

**Eventos ligados no JSX:** `onBlur→salvarClientIdDrive`, `onBlur→salvarPastaDrive`, `onBlur→salvarPaxMinimo`, `onClick→aplicarTema`, `onClick→salvarModo`, `onClick→salvarModoIdioma`, `onClick→salvarUsoAfinidade`, `onClick→setAbaAtiva`

**Filtros / campos:** 5 campos (input/select/textarea); placeholders: "123456789-abcdefg.apps.googleusercontent.com", "https://drive.google.com/drive/folders/..."

**Integrações:**
- [x] Firestore: `settings` (getDoc, setDoc)
- [x] Outros: GoogleDrive, alert/confirm

<details><summary>Funções definidas no arquivo (11) — nenhuma muda de nome/assinatura</summary>

`Configuracoes`, `aplicarTema`, `carregar`, `salvarClientIdDrive`, `salvarConfiguracao`, `salvarJanela`, `salvarModo`, `salvarModoIdioma`, `salvarPastaDrive`, `salvarPaxMinimo`, `salvarUsoAfinidade`

</details>

> PageHeader com estado de sincronização (StatusDot), abas Tema/Escala em Segmented e um card com seções em duas colunas (texto | controles), como na referência. Todas as funções de salvar (salvarModo, salvarJanela, salvarModoIdioma, salvarPaxMinimo, salvarPastaDrive, salvarClientIdDrive, salvarUsoAfinidade, aplicarTema) e o carregamento de settings/scale inalterados. 'Resumo visual' virou a linha 'Tema atual' e 'Estado da configuração' foi para o cabeçalho + rodapé do card. Peças Secao/OpcaoCard/Interruptor declaradas fora do componente (não remontam ao digitar). styles.css antigo deixou de ser importado.

#### `src/components/FaqAdmin/FaqAdmin.jsx`

**Botões / ações (rótulo → handler):**

- [ ] Cancelar edição → limparFormulario
- [ ] Salvando... | Salvar alterações | Cadastrar pergunta → salvarItem
- [ ] [title: Duplicar] → duplicarItem
- [ ] [title: Editar] → abrirEdicao
- [ ] [title: Remover] → removerItem
- [ ] small | small → alternarCampo

**Eventos ligados no JSX:** `onClick→abrirEdicao`, `onClick→alternarCampo`, `onClick→duplicarItem`, `onClick→limparFormulario`, `onClick→removerItem`, `onClick→salvarItem`

**Filtros / campos:** 15 campos (input/select/textarea); placeholders: "Buscar por pergunta, resposta ou palavra-chave", "Escreva a resposta completa, do jeito que o comerc", "Ex: Bagagem, Veículos, Cotação...", "Ex: Mercedes-Benz Sprinter Executivo", "Ex: Quantas malas cabem no veículo executivo?", "Ex: mala, bagagem, quantidade", "https://www.mercedes-benz.com.br/..."

**Integrações:**
- [ ] Firestore: `faq_itens` (addDoc, deleteDoc, getDocs, updateDoc)
- [ ] Outros: alert/confirm

<details><summary>Funções definidas no arquivo (20) — nenhuma muda de nome/assinatura</summary>

`FaqAdmin`, `abrirEdicao`, `alternarCampo`, `carregar`, `carregarItens`, `diasParaVencer`, `duplicarItem`, `formatarDataBr`, `formatarTempoRelativo`, `getHojeIso`, `itemEstaVencido`, `itemVenceEmBreve`, `limparFormulario`, `normalizarTexto`, `obterCorCategoria`, `obterIconeCategoria`, `obterImagensVeiculo`, `removerItem`, `resolverCategoriaCanonica`, `salvarItem`

</details>

#### `src/components/FaqComercial/FaqComercial.jsx`

**Botões / ações (rótulo → handler):**

- [ ] (ícone) → setCategoriaAtiva
- [ ] Compartilhar → onCompartilhar
- [ ] Todas → setCategoriaAtiva
- [ ] [aria: Fechar] → onFechar
- [ ] [aria: Imagem anterior] → irParaImagemAnterior
- [ ] [aria: Próxima imagem] → irParaProximaImagem
- [ ] [title: Compartilhar no WhatsApp] → —
- [ ] small | small Copiado! | Copiar → onCopiar
- [ ] small | small → —

**Eventos ligados no JSX:** `onClick→irParaImagemAnterior`, `onClick→irParaProximaImagem`, `onClick→onAbrir`, `onClick→onCompartilhar`, `onClick→onCopiar`, `onClick→onFechar`, `onClick→setCategoriaAtiva`

**Filtros / campos:** 1 campos (input/select/textarea); placeholders: "Busque por palavra-chave (ex: mala, cancelamento,"

**Integrações:**
- [ ] Firestore: `faq_itens` (getDocs, updateDoc)
- [ ] HTTP: `https://wa.me/`, `https://www.google.com/search`
- [ ] Outros: alert/confirm, clipboard, whatsapp(wa.me), window.open

<details><summary>Funções definidas no arquivo (24) — nenhuma muda de nome/assinatura</summary>

`FaqComercial`, `FaqDetalheModal`, `FaqItemCard`, `abrirDetalhe`, `carregar`, `compartilharWhatsapp`, `copiarResposta`, `diasParaVencer`, `formatarDataBr`, `formatarTempoRelativo`, `getHojeIso`, `irParaImagemAnterior`, `irParaProximaImagem`, `itemEstaVencido`, `itemVenceEmBreve`, `linkPerguntarOperacional`, `normalizarTexto`, `obterCorCategoria`, `obterIconeCategoria`, `obterImagensVeiculo`, `obterLinkDetalheVeiculo`, `processarNegrito`, `registrarUso`, `renderizarResposta`

</details>

#### `src/components/MinhaDisponibilidade/MinhaDisponibilidade.jsx`

**Botões / ações (rótulo → handler):**

- [ ] Desmarcar todos | Marcar todos → marcarTodos
- [ ] Disponibilidade → setAba
- [ ] Meu perfil → setAba
- [ ] Sair → logout
- [ ] Salvando... | Salvar idiomas → salvarIdiomas
- [ ] Salvando... | Salvar → salvar
- [ ] [aria: Próxima semana] → setOffsetHistorico
- [ ] [aria: Semana anterior] → setOffsetHistorico
- [ ] inherit {…} → alternarIdioma
- [ ] {…} {…} small | check → alternar

**Eventos ligados no JSX:** `onClick→alternar`, `onClick→alternarIdioma`, `onClick→logout`, `onClick→marcarTodos`, `onClick→salvar`, `onClick→salvarIdiomas`, `onClick→setAba`, `onClick→setOffsetHistorico`

**Integrações:**
- [ ] Firestore: `guide_availability`, `guide_tour_levels`, `guides`, `notificacoes`, `services`, `settings` (getDoc, getDocs, writeBatch)
- [ ] Outros: setInterval

<details><summary>Funções definidas no arquivo (8) — nenhuma muda de nome/assinatura</summary>

`MinhaDisponibilidade`, `alternar`, `alternarIdioma`, `formatarWhatsapp`, `marcarTodos`, `nomePasseio`, `salvar`, `salvarIdiomas`

</details>

#### `src/pages/Login/Login.jsx`

**Botões / ações (rótulo → handler):**

- [ ] Entrando... | Entrar → —
- [ ] Esqueci minha senha → esqueciSenha
- [ ] small | small → setMostrarSenha

**Eventos ligados no JSX:** `onClick→esqueciSenha`, `onClick→setMostrarSenha`, `onSubmit→entrar`

**Filtros / campos:** 2 campos (input/select/textarea)

<details><summary>Funções definidas no arquivo (4) — nenhuma muda de nome/assinatura</summary>

`Login`, `entrar`, `esqueciSenha`, `mensagemErro`

</details>

#### `src/pages/RedefinirSenha/RedefinirSenha.jsx`

**Botões / ações (rótulo → handler):**

- [ ] Salvando... | Salvar nova senha → —
- [ ] small | small → setMostrar

**Eventos ligados no JSX:** `onClick→setMostrar`, `onSubmit→redefinir`

**Filtros / campos:** 3 campos (input/select/textarea)

<details><summary>Funções definidas no arquivo (3) — nenhuma muda de nome/assinatura</summary>

`RedefinirSenha`, `mensagemErro`, `redefinir`

</details>

#### `src/Context/ThemeContext.jsx`

**Integrações:**
- [ ] localStorage: `theme`

<details><summary>Funções definidas no arquivo (4) — nenhuma muda de nome/assinatura</summary>

`ThemeProvider`, `togglePro`, `toggleTheme`, `useTheme`

</details>

---

## 7. Checklist de entrega por etapa

| Etapa | Itens do inventário conferidos | Compila (esbuild) | Lint base | Prévia visual | `npm run lint` / `build` (você) |
|---|---|---|---|---|---|
| 1. Tokens + componentes base | — | ✅ | ✅ sem novos | ✅ 3 temas | ☐ |
| 2. Shell | ✅ | ✅ | ✅ sem novos | ✅ desktop, recolhido, celular, comercial | ☐ |
| 3. Dashboard | ✅ | ✅ | ✅ sem novos | ✅ escuro, claro, celular | ☐ |
| 4. Painel Operacional | ✅ | ✅ | ✅ sem novos | ✅ 3 abas, linhas abertas, drawer, celular | ☐ |
| 5. Gerar Escala | ✅ | ✅ | ✅ sem novos | ✅ por dia, edição, por guia | ☐ |
| 6. Lista de Guias | ✅ | ✅ | ✅ sem novos | ✅ filtros, tabela, drawer | ☐ |
| 7. Mapa de afinidade | ✅ | ✅ | ✅ sem novos | ✅ seleção, slider, salvar | ☐ |
| 8. Prévia de Serviços | ✅ | ✅ | ✅ sem novos | ✅ envio geral, por veículo, expandir | ☐ |
| 9. Planilha operacional | ✅ | ✅ | ✅ sem novos | ✅ arrastar, colunas, data | ☐ |
| 10. Serviços por Fornecedor | ✅ | ✅ | ✅ sem novos | ✅ período, vínculo, ranking, detalhe | ☐ |
| 11. Relatório executivo | ✅ | ✅ | ✅ sem novos | ✅ abas, filtros, presets | ☐ |
| 12. Cadastros | ✅ | ✅ | ✅ sem novos | ✅ 3 abas, salvar, editar, ativar | ☐ |
| 13. Configurações | ✅ | ✅ | ✅ sem novos | ✅ tema, cor, regras, Drive (digitação sem perder foco) | ☐ |
| 14. Telas fora da referência | ✅ | ✅ | ✅ sem novos | ✅ amostras (Resumo, FAQ, Chegadas, OUT's, Escala semanal) | ☐ |
| 15. Remover ponte de variáveis antigas | — | ✅ | ✅ sem novos | ✅ amostras nos 3 temas | ☐ |


## 8. Registro das etapas

### Etapa 1 — tokens e componentes base
- `src/styles/tokens.css` (novo): tokens do prompt + temas `body.light` / `body.dark` / `body.dark-pro`; accent e derivados no `:root`.
- `src/App.css`: os 3 blocos de tema antigos viraram a **ponte** (variáveis antigas → tokens novos).
- `index.html`: fonte Archivo (Google Fonts). Os CSS que fixavam Montserrat passaram a usar `var(--font-body)`.
- `src/components/ui/*` (novo): `Icon`, `Button`, `Segmented`, `KpiTiles`, `Card/Table/TableRow/TableExpansion`, `Drawer`, `MoreMenu`, `PageHeader`, `StatusDot`, `FilterBar/Field/SearchInput/EmptyState`, `ToastProvider` + `useToast`.
- `src/Context/PreferenciasUI.jsx` + `preferenciasUIContext.js` (novos): accent e sidebar por pessoa.
- `src/main.jsx`: importa tokens + ui.css e envolve o app em `PreferenciasUIProvider` e `ToastProvider`.

### Etapa 2 — shell
- `src/pages/Dashboard/Dashboard.jsx` + `styles.css`: sidebar 256/72 com os grupos da seção 1, « / » salvo por pessoa, topbar sticky com breadcrumb, data, indicador Phoenix e sino (mesmo `NotificacoesSino`, painel ancorado sob o sino). Conteúdo fluido (o `max-width: 65vw` das telas foi neutralizado no shell).
- `src/components/Shell/navConfig.js` + `shellContext.js` (novos).
- `src/pages/Cadastros/Cadastros.jsx` (novo): abas Guias / Fornecedores / Usuários e acessos; `/register-guias`, `/register-fornecedores` e `/usuarios` abrem a aba certa.
- `src/App.jsx`: rota nova `/planilha` (mesma `PreviaTransfers`, prop `secao="planilha"`) e as 3 rotas de cadastro apontando para `Cadastros`. Nenhuma rota removida.
- `PreviaTransfers.jsx`: só recebeu a prop `secao` + `id`/`ref` na seção da planilha para abrir já posicionada nela.
- `Configuracoes.jsx`: seletor "Cor de destaque" (7 cores) no card de aparência.

### Etapa 3 — Dashboard (`components/Home/Home.jsx` + `home.css` novo)
- Título "Operação de hoje"; primary "Atualizar dados do Phoenix" (`carregarApiSemana`), secundário "Abrir escala da semana". Registra o indicador Phoenix da topbar.
- Segmented Operação / Comparativo + navegador de semana ‹ › (e "Semana atual") numa linha.
- Faixa de 7 dias com "x/y com guia" e ponto de alerta quando há serviço sem guia (números de `dashboard.distribuicaoSemana`, que já existiam).
- Tiles do dia: Serviços no dia · Guias escalados · Sem guia · Grupos a formar. Clicar filtra a tabela (mesmo `filtroStatusDia` do select). São só contagens da lista que a tabela já mostrava.
- Tabela "Guias e serviços do dia" com os 3 filtros de antes, copiar (`copiarServicoDia`, com o "Copiado!") e "Enviar ao guia" (`enviarWhatsappServico`).
- Gráficos: só accent + neutro (sem cores fixas). "Demanda da semana" tinha **dois eixos Y** (serviços e pax no mesmo gráfico); virou dois gráficos lado a lado com os mesmos dados. A pizza de operadoras virou ranking em barras (mesmos números + participação %), mais fácil de ler com 10 operadoras.
- O `styles.css` antigo da Home continua carregado porque o Relatório executivo ainda usa classes `home-dashboard-*`; sai na etapa 15.
- Sugestão futura mantida: "Escalas a enviar" e "Enviar escalas pendentes" (não há registro de envio).

### Etapa 4 — Painel Operacional (`PainelOperacional.jsx` + `painel.css` novo)
- Header: "Nova placa personalizada" (só em Chegadas), "Atualizar" e, em Passeios, o primary "Copiar resumo" (`copiarResumo` — é o texto de fechamento "LISTA DE PASSEIOS"). `⋯` → "Configurações das placas PDF" (drawer).
- Segmented Chegadas / OUT's / Passeios com ícone e contagem da aba aberta; filtros numa linha (data, busca, status, escala, veículo ou guia conforme a aba). Registra o indicador Phoenix.
- **Chegadas:** tabela Voo · Previsto · Estimado (+ variação) · Status com ícone (atrasado/cancelado em `--alert`) · Pax · Fornecedor ("N veículo(s)") · buscar voo. Linha aberta: Buscar voo / Placas individuais / Placa coleção e **um bloco por veículo** ("FORNECEDOR · veículo 1 de 3", veículo, modalidade, totais) com os passageiros e "Editar placa" em cada um; bloco de "Reservas não escaladas" em alerta.
- **OUT's:** tabela com etiqueta OUT/TRF, data/hora, escala, fornecedor + veículo, modalidade, pax, checkbox "Monitorado" e "Copiar" (monitoramento). Linha aberta: um bloco por hotel com as reservas e "Buscar voo".
- **Passeios:** tabela por guia; linha aberta mostra cada passeio e, dentro, um bloco por veículo com os passageiros.
- Sugestões futuras mantidas: "Enviar ao motorista" e "copiar script" por veículo (não existe texto por veículo hoje).

### Etapa 5 — Gerar Escala (`ListaPasseios.jsx` + `escala.css` novo)
- Header: Desfazer escala · Editar escala/Visualizar · "Gerar escala de guias" (vira "Gerar novamente" quando a semana já tem escala) · primary "Enviar todos os bloqueios". `⋯`: Abrir planilha, Salvar no Drive, Atualizar dados (Phoenix).
- Navegador de semana ‹ › + "Semana atual"; as regras (modo, afinidade, idioma, pax mínimo) numa linha que abre um drawer **só de leitura** com atalho para Configurações (as regras sempre foram editadas lá — salvar no drawer e gerar de novo segue como sugestão futura).
- Linha de status ("Essa escala foi gerada com a regra…" / "ainda não gerada") e o andamento do robô; o card animado do robô com as 5 etapas continua.
- 6 KPIs (passeios, com guia, sem guia, fechados, guias escalados, disponíveis sem serviço) — contagens do que a tela já carregava.
- Abas **Por dia** (faixa "Semana" + 7 dias com "x/y com guia" e ponto de alerta; tabela do dia com idioma, guia ou "Sem guia", pax ADT/CHD/INF e grupo; no modo edição: guia, pax, status, remover e a linha de adicionar passeio manual) e **Por guia** (cards com % de ocupação, barra, 7 dias e "Enviar" com a prévia da mensagem ao passar o mouse; lista de "disponíveis sem serviço").
- O resultado da geração automática continua aparecendo logo abaixo, com "Fechar".
- Sem dados para "Escala gerada às HH:MM" e "N ajustes manuais" (não são registrados hoje) → sugestão futura.

- **Etapa 6 — Lista de Guias:** tabela com chips de idioma, barras de prioridade e status; edição migrou do modal para Drawer (420→460px) com os mesmos campos, mesmo `salvar` e mesmos estados.

- **Etapa 7 — Mapa de afinidade:** legenda de faixas no cabeçalho, lista de guias fixa à esquerda com busca, card de passeios com slider + valor + rótulo do nível.

- **Etapas 8–9 — Prévia de Serviços e Planilha operacional** (mesmo componente, um commit): Prévia com ações Enviar todas / Enviar todas atualizadas, ⋯ com Atualizar e Abrir planilha, faixa de 7 KPIs e tabela por veículo (motorista, serviços, pax ADT/CHD/INF, fornecedor + WhatsApp, Enviar prévia / Atualizada). Veículos sem fornecedor agora aparecem na tabela (com ações ocultas), antes só os com fornecedor apareciam nos cards de envio. Planilha com cards por veículo, tipo/hora/pax em uma faixa e o local embaixo, quebra de colunas responsiva. Phoenix na topbar ligado ao mesmo carregarServicos.

- **Etapa 10 — Serviços por Fornecedor:** mesma lógica e mesmos estados; troca visual para os componentes base e CSS com tokens (accent no 1º do ranking e nas barras de participação; IN em accent, demais tipos neutros).

- **Etapa 11 — Relatório executivo:** nome do menu adotado no título; layout da referência (KPIs, cards) aplicado ao conteúdo que já existe. Ranking de veículos/fornecedores, Pendências e Exportar PDF seguem como sugestão futura.

- **Etapa 12 — Cadastros:** as 3 telas mantêm JSX e lógica; ícones MUI trocados pelo Icon (novos ícones: toggleOn/Off, userPlus, key, idCard, ticket, listCheck). Polimento por CSS com escopo na aba: título da aba menor (o da página é Cadastros), formulário | resumo fixo ao rolar, campos/raios/botões/interruptores com tokens.

- **Etapa 13 — Configurações:** layout de seções da referência. Placas PDF e frequência do Phoenix (da referência) não existem nesta tela hoje → sugestão futura.

- **Etapa 14 — Telas fora da referência** (Disponibilidade da semana, Central de Dúvidas admin/comercial, Conferência de voos, Resumo por guia, Chegadas, OUT's, Escala semanal, Cadastro de passeios, Minha disponibilidade, Login, Redefinir senha, sino de notificações e guarda de rota): ícones MUI trocados pelo Icon do projeto em todos os arquivos (nenhum `@mui/icons-material` restante no código). Onde o ícone era guardado como componente (ex.: `obterIconeCategoria` da Central de Dúvidas devolve o componente), usei `iconeMui("nome")` — mesma API (`fontSize`), função e assinatura intactas. Novo `src/styles/telas-legado.css` alinha título 26px, descrição, largura, cartões e foco dos campos ao padrão novo, só por CSS com escopo `.app-content`. JSX e lógica dessas telas não mudaram. Aviso de `<button>` dentro de `<button>` no Painel de Chegadas já existia no projeto recebido (não mexi para não alterar comportamento) → sugestão futura.

- **Etapa 15 — Ponte removida:** as 1.264 referências às variáveis antigas (`--card`, `--border`, `--primary`, `--p1/p2/p3`, `--text-dist`, `--input`, …) em 25 arquivos foram trocadas pelo token equivalente (exatamente o alias que a ponte fazia, então o visual não muda), e o bloco de apelidos saiu do `App.css`. Removidos os dois CSS que deixaram de ser importados (`RelatoriosOp/styles.css`, `Configuracoes/styles.css`). Os outros CSS antigos ainda têm regras usadas por telas não reescritas (ex.: Robô Conferente usa classes `previa-operacional-*`), então ficaram — limpar regra a regra é sugestão futura. `src/index.css` já não era importado no projeto recebido.

- **Remoção a pedido do Cleidson — Relatório executivo:** saiu do menu (grupo Relatórios ficou só com Serviços por Fornecedor), a rota `/relatorios` foi removida do `App.jsx` (quem abrir o endereço antigo cai no redirecionamento padrão) e a pasta `components/RelatoriosOp` foi apagada. Nenhuma outra tela usava esse componente.

- **Status do voo pelo aeroporto (a pedido, lógica nova) — Painel Operacional › Chegadas, só na data de hoje:** consulta `guia-app.onrender.com/api/aeroporto/arrivals` (o mesmo backend do Robô Conferente) ao abrir a aba, a cada 5 min e nos botões Atualizar/Phoenix. Cruza pelo número do voo (tirando o código da companhia, ex.: G3 1234 → 1234; se houver mais de um, fica o de horário previsto mais próximo) e completa o que o Phoenix não traz: horário de operação → "Estimado", status cancelado/pousado. Campos do Phoenix continuam com prioridade. O cálculo é o `calcularStatusVooPorHorario` que já existia. Correção junto: `classificarStatusVoo` testava "atras"/"antecip" antes de "pousado …", então "Pousado antecipado" aparecia como "Antecipado".

### Central de Dúvidas como catálogo (pedido do usuário — inclui lógica nova)
- **Comercial** (`FaqComercial.jsx` + `styles.css` reescrito): busca grande, filtro por tipo (Tudo · Frota · Valores · Respostas) e por categoria, atalhos "Mais buscadas". Três vitrines: **Frota** (cards com foto, tipo, passageiros/malas, ícones de itens; contador "Grupo do cliente" marca quem comporta o grupo), **Valores** (tabelas por serviço com R$ alinhado) e **Respostas prontas** (grade com prévia de 3 linhas). Detalhe em painel lateral: galeria com miniaturas, capacidade, itens, tabela com cópia por linha, observações e prévia "Como o cliente vai receber". Copiar/WhatsApp e contadores de uso (`contadorVisualizacoes`/`contadorCopias`) mantidos.
- **Admin** (`FaqAdmin.jsx` + `styles.css`): seletor "Tipo de item" (Resposta pronta / Ficha de veículo / Tabela de valores), ficha (tipo, passageiros, malas grandes, malas de bordo, itens + outros), editor de tabela (serviço, valor, detalhe; subir/descer/remover), filtro por tipo na lista e resumo de ficha/tabela em cada item.
- **Dados**: mesma coleção `faq_itens`, sem mudança nas regras do Firestore. Campos novos opcionais: `formato`, `fichaVeiculo { tipoVeiculo, passageiros, malasGrandes, malasBordo, recursos[] }`, `tabelaPrecos [{ servico, valor, detalhe }]`. Itens antigos continuam funcionando (com `nomeVeiculo` viram ficha de veículo; o resto, resposta pronta). Regras compartilhadas em `FaqComercial/catalogo.js`.
- Texto copiado de resposta pronta não mudou (pergunta + resposta). Ficha e tabela geram texto próprio; item vencido continua mostrando "Consultar Operacional para valores atualizados."
- Ícones novos: wifi, snowflake, plug, image, tag, car.

### Assistente de veículo + fotos enviadas do computador (pedido do usuário — lógica nova)
- **Assistente de veículo** (`FaqComercial/AssistenteVeiculo.jsx` + `assistente.css`): vendedor informa passageiros, malas de 23 kg e de 10 kg; recebe a primeira opção (da menor para a maior) que comporta pax + bagagem, com selo "Precisa de bagageiro/carretinha" ou "Sem carretinha", aviso "Recomendação por causa da bagagem" quando a quantidade de pessoas caberia numa opção menor, veículos da frota vinculados, alternativas e cópia/WhatsApp da sugestão. Substitui o contador "Grupo do cliente" da Frota (os cards passam a mostrar Recomendado / Também atende / Não comporta). A ficha do veículo mostra as "Configurações de bagagem" em que ele aparece.
- **Regras** (`FaqAdmin/AssistenteConfig.jsx`, aba "Assistente de veículo"): opções ordenadas com nome, família, pax máx., acessório (bagageiro/carretinha), combinações de bagagem ("3 de 23 kg + 2 de 10 kg" ou "7 de 10 kg"), veículos vinculados e observação; fator de malas de 10 kg por vaga de 23 kg livre; mensagem quando nada comporta; modelo de exemplo; prévia ao vivo antes de salvar.
- **Dados**: documento `faq_itens/_assistente_veiculo` (`formato: "config_assistente"`, `ativo: false`), sem mudar regras do Firestore.
- **Fotos** (`FaqAdmin/FotosVeiculo.jsx`): arrastar/escolher imagens; reduzidas no navegador para JPEG até 1280 px (~180 KB) e salvas no mesmo campo `imagensVeiculo`; capa, reordenar, remover, limite de 6 fotos / 850 KB por item (limite de 1 MB do documento); link continua aceito.
- Sugestão futura: mover fotos para o Firebase Storage (exige plano Blaze e regras de Storage) se a frota crescer muito.
- **Margem de erro do assistente** (pedido do usuário): aviso "Atende no limite" com sugestão da opção mais confortável; margem de segurança configurável (`margemFolga`, malas que devem sobrar — se nenhuma opção tiver folga, recomenda sem folga e avisa); itens especiais configuráveis (`itensEspeciais`: conta como 23 kg, como 10 kg, ocupa lugar ou pede confirmação do operacional), marcados pelo comercial e incluídos no texto copiado.

### Central de Informações (antiga Central de Dúvidas) — formulário e exibição (pedido do usuário)
- Nome trocado em menu, títulos e textos (rotas `/faqadmin` e `/faqcomercial` mantidas; coleção `faq_itens` mantida).
- **Admin**: lista compacta (capa/ícone, título, categoria, tipo, resumo, selos, uso e ações) com indicadores clicáveis (visíveis, destaque, vencendo, vencidos, escondidos), busca, filtro por tipo, categoria e ordenação. Formulário em painel lateral (`FormularioItem.jsx`): escolha do tipo em cartões, seções numeradas por tipo, campos obrigatórios com `*`, validação ao salvar com mensagem em cada campo e resumo clicável do que falta (`regrasFormulario.js`), avisos (data de validade passada, veículo sem capacidade), categoria sugerida por tipo e atalhos das categorias existentes, prévia do texto copiado, confirmação ao fechar com alterações não salvas. Veículo: descrição curta opcional (sem ela o título é o nome). Todas as ações anteriores (destacar, esconder, duplicar, editar, remover) mantidas.
- **Comercial**: "Mais buscadas" sobe para o topo; assistente de veículo recolhível (fechado em "Tudo", aberto em "Frota" ou quando já há grupo preenchido).
- **Capacidade com fonte única** (pedido do usuário): o formulário de veículo não pede mais passageiros/malas; o operacional marca em quais configurações do Assistente o veículo entra (grava `veiculosIds` no documento do assistente). Card, ficha, texto copiado e resumo da lista usam a configuração base (a primeira sem acessório); itens antigos sem vínculo continuam mostrando a capacidade que tinham.
- **Mochilas e itens especiais**: lista padrão com mochila pequena (vai no colo, `nao_ocupa`) e mochila grande (conta como 10 kg) logo abaixo das malas; demais itens (mala acima de 23 kg, carrinho, cadeirinha, cadeira de rodas, golfe, prancha, instrumento) em "Outros itens" com padrão "Consultar o operacional". Botão "voltar à lista padrão" no admin.
- **Capacidade editada no cadastro do veículo** (pedido do usuário): a seção "Capacidade" do formulário de veículo tem uma ou mais configurações (passageiros/vagas, "precisa de" bagageiro/carretinha, capacidade máxima de malas + exceções, nome automático). Ao salvar, grava/atualiza as opções do Assistente (posicionando as novas da menor para a maior) e desvincula as removidas; dá para reaproveitar configuração de outro veículo (avisa quando é compartilhada). Veículos antigos abrem com a capacidade que tinham já preenchida. Tipo "Ônibus double deck" incluído.
- **Nomes das seções editáveis**: "Frota" passa a "Veículos cadastrados" (padrão); menu "⋯ → Nomes das seções" no admin grava `nomesSecoes` no documento do assistente, lido pelo comercial.
- **Embarcações e locais** (pedido do usuário): dois tipos novos de item (`formato: "embarcacao" | "local"`). Embarcação: nome, tipo, lotação, o que tem a bordo, roteiros, fotos e observações (`fichaEmbarcacao`). Local: nome, tipo (hotel, restaurante, ponto de apoio…), endereço, bairro, telefone (vira WhatsApp), horário, link do mapa (gerado pelo endereço se vazio), site, fotos e observações (`fichaLocal`). No comercial: seções próprias com cards de foto, "Abrir no mapa", ficha no painel lateral e texto copiado. Abas de tipo sem itens ficam escondidas; nomes das seções novas também editáveis.
- **Foto em tela cheia** (pedido do usuário): na ficha (veículo, embarcação, local) a foto tem o botão "Ampliar" e abre o `VisualizadorFoto.jsx` — imagem grande, setas, contador, miniaturas, teclado (← → Esc, sem fechar a ficha), arrastar no celular, clique para aproximar e botão para abrir/baixar a foto.
- **Ícone do site** (pedido do usuário): marca **FiaSystem** — símbolo "F + nó" em quadrado verde arredondado, usado na aba e no app instalado (substituiu a versão com o trevo). `public/favicon.ico` (16–64), `favicon-16x16.png`, `favicon-32x32.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`, `favicon.svg` e as logos em `public/marca/` (claro, escuro, transparente e símbolo 1024); `index.html` aponta para os novos (o `favicon2.ico` antigo foi mantido no projeto, sem uso).
- **Marca corrigida para FiaSystem** (com "m"): logos refeitas em `public/marca/fiasystem-*.png` (os arquivos `fiasysten-*` foram removidos).
- **Sobre a FiaSystem** (pedido do usuário): página `components/Sobre/Sobre.jsx` com a história (dor operacional → primeira ferramenta → uma ideia puxa a outra), o que já foi construído, para onde vamos, princípios e chamada para ideias. Conteúdo fixo, sem banco. Aberta para todos: `/sobre` dentro do menu lateral (item no rodapé, ao lado de Configurações) para operacional e comercial; `/guia/sobre` para guias, com botão "Sobre" no topo da área do guia. `ACESSO.sobre` em `permissions.js`.
- **Marca d'água no login** (pedido do usuário): símbolo + nome FiaSystem bem suave no canto inferior do lado do formulário (claro e escuro, ajustado para celular, sem atrapalhar cliques) e assinatura "Desenvolvido com FiaSystem" no rodapé (`Login.jsx`, `login.css`).
- **Foto inteira na ficha e na tela cheia** (pedido do usuário): a galeria da ficha não corta mais a foto — mostra a imagem completa (`object-fit: contain`) numa moldura de altura adaptável, com a própria foto desfocada ao fundo preenchendo as sobras; o visualizador em tela cheia ajusta qualquer proporção (em pé ou deitada) sem estourar a altura (`FaqComercial.jsx`, `FaqComercial/styles.css`).
- **Gerar Escala — card "Semana inteira"** (pedido do usuário): o filtro da semana deixou de parecer mais um dia. Agora é um card próprio e mais largo, com ícone, borda tracejada, "Ver todos os 7 dias" e uma faixa com um traço por dia (verde = todos com guia, vermelho = falta guia, cinza = sem passeio), separado dos dias por uma divisória. Ativo, fica preenchido e todos os dias ganham um destaque leve, mostrando que estão incluídos (`ListaPasseios.jsx`, `escala.css`).
- **Assistente — veículos recomendados em lista** (pedido do usuário): em vez de um único veículo, mostra a lista de opções que levam o grupo — primeiro as que deixam a margem de segurança, da menor para a maior, depois as que atendem no limite. Cada opção tem foto, capacidade, selos ("Mais indicada", "Precisa de bagageiro/carretinha", "No limite") e os veículos vinculados (abrem a ficha). Mostra as 4 primeiras; as maiores ficam em "Ver mais". A frase "Comporta N passageiros" saiu; o motivo só aparece quando a bagagem tira a opção menor. Texto copiado lista todos os recomendados; o selo "Recomendado" nos cards de veículo vale para todos da lista (`catalogo.js` — `recomendadas`, `maiores`, `LIMITE_RECOMENDADAS`; `AssistenteVeiculo.jsx`, `assistente.css`, `FaqComercial.jsx`).
- **Gerar Escala — semana inteira sempre na tela** (pedido do usuário): o filtro por dia saiu; a escala mostra sempre os 7 dias. A faixa de dias fica presa embaixo da barra do topo enquanto rola e cada dia virou atalho: o clique desce até a tabela daquele dia e destaca ela por um instante; o dia que está na tela fica marcado na faixa e o dia de hoje aparece como "hoje". O card "Semana inteira" virou resumo (com guia / total e um traço por dia) (`ListaPasseios.jsx`, `escala.css`).
- **Motor da escala — nota de encaixe** (pedido do usuário — lógica nova): novo `Services/Services/plannerEncaixe.js`. Cada par guia × serviço recebe uma nota: afinidade com o passeio (vale mais em grupo grande e privativo e menos em transfer IN/OUT), idioma do grupo, garantia mínima da semana (de preferência em serviço mais simples), prioridade (modo Prioridade), equilíbrio como penalidade gradual (mais forte no modo Equilibrado) e penalidade para serviço exigente com afinidade baixa. Cada dia é montado pela melhor combinação (algoritmo húngaro): primeiro o máximo de serviços com guia, depois a maior soma de notas. A troca da garantia mínima não leva mais serviço exigente para guia com afinidade abaixo de 50%. Depois de gerar, embaixo do nome do guia aparece o motivo da escolha. Pesos em `PESOS_ESCALA_PADRAO` (aceita `pesosEscala`); a regra antiga continua disponível com `motorEscala: "fila"`. Simulação com 60 semanas: mesmo total de serviços com guia e mesmo atendimento de idioma (91%); afinidade média de 63% → 71% (Equilibrado) e 57% → 74% (Prioridade); serviços exigentes com guia de afinidade baixa de ~5 para ~1 por semana; equilíbrio parecido no Equilibrado e melhor no Prioridade.
- **Serviços fora da escala viram configuração** (pedido do usuário): as listas escritas no código saíram. Uma, no Cadastro de passeios, impedia alguns passeios (ex.: CITY TOUR PANORAMICO) de entrar no cadastro e no Mapa de afinidade; a outra, em `plannerUtils.js`, tirava serviços da escala. Agora há uma lista única em `settings/scale.servicosForaDaEscala`, editada em Configurações → Escala ("Serviços fora da escala": chips para tirar, campo com sugestões para adicionar, "Restaurar lista inicial") e também direto no Mapa de afinidade ("Tirar da escala" / "Colocar na escala"). Enquanto não for salva, vale a lista inicial (a mesma de antes da escala). O Cadastro de passeios puxa todos os passeios do Phoenix. O Mapa de afinidade mostra todos os passeios cadastrados, com busca, os fora da escala num grupo à parte e o atalho para o Cadastro de passeios. Novo `Services/Services/servicosEscala.js`; `plannerUtils.js` (`definirServicosForaDaEscala`), `plannerRepository.js`, `RegisterTours.jsx`, `MapaAfinidadeGuias.jsx` + `afinidade.css`, `Configuracoes.jsx` + `config.css`. As listas próprias do Painel Operacional, Home e Resumo (só exibição) não mudaram.
- **Gerar Escala — "Por guia" com as tabelas da semana** (pedido do usuário): embaixo dos cards dos guias aparecem a faixa de dias e as tabelas de todos os dias. Clicar no card de um guia marca o guia: desce até o primeiro dia dele, contorna os dias em que ele trabalha (os outros ficam apagados), destaca as linhas dele nas tabelas e mostra o nome na faixa fixa (com ✕ para desmarcar). Clicar de novo desmarca.
- **Motivo da garantia mais claro**: "garantia: ainda não tem N serviço(s) na semana".
- **Passeios do Phoenix sem mapeamento** (pedido do usuário): novo `Services/Services/servicosPhoenix.js`. Ao abrir o Mapa de afinidade, o sistema confere sozinho o Phoenix nas últimas 4 semanas e nas próximas 2 e lista os serviços que aparecem lá mas não estão no cadastro de passeios (mapa) nem na lista "fora da escala" — os que acabavam na escala sem guia apto. Cada um mostra próxima data (ou a última), em quantos dias apareceu, dias da semana e id do Phoenix, com "Colocar no mapa" (cria o passeio no cadastro, já com a frequência) ou "Fora da escala"; também "Colocar todos no mapa" e "Conferir de novo". Se o Phoenix não responder em nenhuma data, mostra erro em vez de "tudo certo". O "Puxar dados do Phoenix" do Cadastro de passeios passou a varrer o mesmo período (4 semanas para trás + 2 para a frente; antes eram só os próximos 30 dias). No resultado da geração automática, serviço sem guia porque o passeio não está no mapa aparece com esse motivo ("não está no Mapa de afinidade — coloque no mapa ou tire da escala").
- **Escala com base no histórico do Phoenix** (pedido do usuário — lógica nova): novo `Services/Services/historicoEscala.js`.
  - **Carga corrigida**: o Phoenix devolve uma linha por reserva e o histórico contava cada reserva como serviço (um passeio com 12 reservas valia 12). Agora conta dia + passeio + guia uma vez. A carga usa as últimas 4 semanas com peso (1; 0,75; 0,5; 0,25) e, quando há disponibilidade registrada no período, compara com os dias que o guia estava disponível. A função antiga (`carregarHistoricoServicosReaisPorNomeGuia`) também passou a contar sem repetir.
  - **Experiência com o passeio**: quantos dias cada guia fez cada passeio nas últimas 8 semanas vira bônus na nota de encaixe (4 pontos por vez, até 20). "Não operar" continua excluindo. O motivo aparece na escala ("fez esse passeio N× nas últimas 8 semanas").
  - **Gerar Escala**: busca 8 semanas do Phoenix (em paralelo); se não responder, gera sem histórico e avisa no resultado. O resultado lista os guias do Phoenix que não batem com o cadastro.
  - **Mapa de afinidade**: a conferência ao abrir cobre 8 semanas para trás e 2 para a frente; para o guia selecionado, cada passeio mostra "fez N× nas últimas 8 semanas · sugerido X · Aplicar" (sugestão: 1×→50, 2×→60, 3–4×→70, 5–7×→80, 8+→90; só sobe, nunca baixa; destaque quando o passeio está como "Não operar") e "Aplicar sugestões do histórico (N)"; as sugestões só gravam com "Salvar mapeamento". Aviso de guias do Phoenix sem correspondência no cadastro (ajustar apelido).
  - O Cadastro de passeios continua puxando 4 semanas para trás + 2 para a frente.
  - Teste com 8 semanas simuladas no formato do Phoenix: contagem antiga dava até 8× o real nos guias de grupos grandes, a nova bate com o real; com o mapa ainda sem ajuste, o guia escolhido coincide com o que o operacional costuma pôr em 62% dos serviços (17% sem histórico) e em 71% depois de aplicar as sugestões, mantendo a carga entre 4 e 7 por guia.
- **Idiomas com bandeira e cor** (pedido do usuário): novo `components/ui/IdiomaTag.jsx` (`IdiomaTag` e `Bandeira`, exportados em `ui/index.js`; estilos `.lang-tag` em `ui.css`). Bandeiras desenhadas em SVG (o Windows não mostra bandeira em emoji) para PT, EN, ES, FR, IT, DE, JP e CN, e uma cor por idioma; idioma sem bandeira mostra um globo. Usado no Gerar Escala (idioma dos passageiros com a quantidade de pax), na Lista de guias e na edição do guia.
- **Ocultar serviço direto na escala** (pedido do usuário): cada linha do Gerar Escala tem o botão "Ocultar" (olho riscado, aparece mais forte ao passar o mouse). Pede confirmação, coloca o serviço em Configurações → Escala → "Serviços fora da escala" e ele some da tabela na hora (e não recebe mais guia). Desfaz em Configurações ou no Mapa de afinidade.
- **Dashboard — idiomas e carregamento com esqueleto** (pedido do usuário): a tabela "Guias e serviços do dia" mostra o idioma dos passageiros com as etiquetas de bandeira (lido do Phoenix, como na escala) numa linha abaixo do nome do passeio. O carregamento deixou de mostrar spinner + "Atualizando…" em cada card: números dos cards e dos dias viram barras de esqueleto e cada card ganha um esqueleto no formato do conteúdo (tabela, lista, barras, gráfico, texto) — `renderCardLoading(texto, tipo)`. O `KpiTiles` (todas as telas) também troca o "…" de carregamento por esqueleto. Classes `.ui-sk*` em `ui.css` (respeita "reduzir movimento").
- **Recomendador de veículo — regra do operacional** (pedido do usuário — lógica nova): a lista seguia a ordem do cadastro (com 5 pax aparecia "Van com carretinha" como mais indicada) e não tinha noção de conforto (BYD e Spin iguais para 4 pax). Agora cada configuração tem **"Recomendado até (pax)"** (`paxIdeal`; vazio = todas as vagas), editável no cadastro do veículo e no Assistente. Regra (`recomendarVeiculo` em `catalogo.js`): as opções formam degraus pelo "recomendado até"; o grupo vai para o menor degrau que o comporta; dentro dele, quem não precisa de acessório vem primeiro (bagageiro/carretinha só se a bagagem pedir); primeiro com a margem de segurança, depois no limite; se a bagagem não cabe, sobe de degrau. O resto fica em "Também comportam" (recolhido), com selo "Apertado" quando passa do recomendado. Se ninguém "recomenda" tanta gente mas a capacidade comporta, mostra o menor que leva, marcado como apertado. Nome automático não repete o acessório quando o nome do veículo já tem ("VAN 15L COM CARRETINHA" não vira "… com carretinha"). Teste com frota parecida com a real: 3 pax → BYD; 4 pax → Spins; 4 pax + 4 malas → Spin com bagageiro; 5 a 9 pax → Van sem carretinha; 10 pax → Van com carretinha; 15 pax → Van alongada; 20 pax → Micro-ônibus.
- **Assistente de veículo por regras da operação (faixas)** (pedido do usuário — lógica nova): a resposta deixou de ser uma lista de carros e passou a ser o veículo pela regra da operação. Faixas de passageiros (`faixas` no documento do assistente; sem o campo salvo valem as **regras padrão**: 1–3 carro de passeio ou Spin · 4 Spin · 5–9 Van sem carretinha · 10–15 Van com carretinha · 16–19 Van alongada com carretinha · 20–28 Micro-ônibus · 29–46 Ônibus). Cada faixa tem o veículo **padrão** e, em ordem, para qual trocar **se a bagagem não couber** (ex.: Spin → Spin com bagageiro; Van sem → Van com carretinha); se nada da faixa levar a bagagem, sobe de faixa. O comercial vê o nome do veículo em destaque, o porquê ("De 5 a 9 passageiros a operação usa Van sem carretinha" ou "o padrão é Spin, mas a bagagem não cabe — por isso Spin com bagageiro"), a bagagem que cabe, avisos (no limite, consultar operacional) e a **régua das faixas** com a faixa marcada. Texto copiado: "*Veículo recomendado: …*". Os cards de veículo não mostram selo nesse modo. Operacional edita em Central de Informações → Assistente de veículo → "Regras da operação por passageiros" (de/até, padrão, opções se a bagagem não couber, malas, observação; valida faixas cruzadas; "Regras padrão" e "Desligar regras" — desligadas, volta a recomendação pela lista de opções). `recomendarPorFaixa`, `FAIXAS_PADRAO`, `normalizarFaixas` em `catalogo.js`.
- **Painel Operacional — horário do voo no Phoenix** (pedido do usuário): o painel não lia o campo em que o Phoenix guarda o horário do voo (`fly_hour`, o mesmo que o Robô conferente usa) e, sem os outros campos, o "Previsto" caía no horário de apresentação do serviço. Agora `fly_hour` é a primeira fonte do previsto e, embaixo dele, a coluna mostra **"Phoenix HH:MM"** (o horário mais comum entre as reservas do voo) e **"Aeroporto HH:MM"** (painel do aeroporto, quando é hoje); fica em destaque quando os dois diferem 10 min ou mais, ou quando as reservas do mesmo voo têm horários diferentes no Phoenix (ícone de alerta). Nesse caso, no detalhe do voo, cada reserva mostra "voo HH:MM" e as que fogem do horário principal ficam em destaque.
- **Equipamentos e acessórios** (pedido do usuário): novo tipo de item na Central de Informações (`formato: "equipamento"`, ficha em `fichaEquipamento`) para cadeirinha infantil, bebê conforto, assento de elevação, carrinho, cadeira de rodas etc. Formulário próprio: nome, tipo (lista), categoria (padrão "Equipamentos"), indicado para (idade/peso), quantidade disponível, valor, como solicitar, fotos e observações. No comercial: aba e seção "Equipamentos e acessórios" com cards de foto (para quem serve, valor, como pedir), ficha no painel lateral com galeria e tela cheia, e texto copiado ("Indicado para", "Valor", "Solicitar" — a quantidade fica só na ficha, com "confirme com o operacional"). Ícone novo `cadeirinha` em `Icon.jsx`; categoria com "equipament/cadeir/acessori" usa esse ícone. Nome da seção editável como os outros. Selos sobre as fotos dos cards não quebram mais linha (reticências).
- **Configurações para o comercial** (pedido do usuário): `ACESSO.configuracoes` = operacional e comercial; a rota saiu da área só do operacional e o item aparece no rodapé do menu do comercial. O comercial vê só a aparência (tema, cor de destaque, tamanho do texto) — sem a aba Escala, sem o status de sincronização e sem ler `settings/scale`. "Sobre a FiaSystem" já aparecia para o comercial (conferido).
- **Tamanho do texto** (pedido do usuário): Configurações → "Tamanho do texto" com Pequeno (90%), Padrão, Grande (112%) e Muito grande (125%). Fica salvo por pessoa, no navegador, junto da cor de destaque (`escalaFonte` em `PreferenciasUI.jsx` / `TAMANHOS_FONTE` em `preferenciasUIContext.js`), e grava `--escala-fonte` no `<html>`. Todos os `font-size` em px dos CSS (e os tokens `--fs-*` de `tokens.css`) passaram a `calc(Npx * var(--escala-fonte, 1))`, então vale para o site inteiro — menu lateral, telas, tabelas e área do guia. O menu lateral alarga junto quando o texto aumenta (`--sidebar-w`), para os nomes não cortarem.
- **Custos operacionais** (pedido do usuário — módulo novo): menu "Custos e relatórios → Custos operacionais" (`/custos`, só operacional), em três abas.
  - **Custo do dia**: escolhe a data e vê todos os serviços do Phoenix com veículo (um por escala, como em Serviços por Fornecedor): hora, tipo, hotel/região, veículo, fornecedor (pelo vínculo do veículo — o mesmo de Serviços por Fornecedor — ou pelo cadastro de fornecedores), categoria do veículo (pelo nome: Spin/Doblò → carro, Van/Sprinter → van, Micro/Volare → micro, Ônibus → ônibus; dá para fixar por veículo), valor da tabela e guia. O valor que o fornecedor realmente cobrou é digitado direto na linha (vazio = tabela); o guia aparece quando o Phoenix tem guia na escala ou quando é micro/ônibus sem guia ("teve guia?"), e fica "a confirmar" até alguém lançar o valor pago (a tabela só sugere a referência, porque é negociado). A ficha (lápis) ajusta fornecedor (e grava o vínculo do veículo), categoria, casado, valor, guia, "não teve guia" e observação, e cria tarifa quando falta. Indicadores: custo do dia (fornecedores + guias), serviços/pax/casados, economia, pendências (sem fornecedor, categoria, tarifa ou guia) e guias a confirmar; filtros, busca, CSV e "Marcar como conferido". Laterais: oportunidades de casar e custo por fornecedor; serviços que saíram do Phoenix ficam listados à parte (fora do custo).
  - **Serviço casado**: IN para uma região da regra (padrão LITORAL NORTE) + OUT da mesma região (mesmo hotel ou outro) no mesmo veículo, com o OUT entre 1h30 e 3h depois do IN (configurável) → os dois usam o valor casado da tarifa. Pares em veículos diferentes e mesma categoria viram **oportunidade** com a economia calculada (o veículo do IN faz os dois pelo valor casado do fornecedor dele); pares que passam do intervalo por até 30 min aparecem como "quase".
  - **Relatórios**: período (7 dias, semana, mês, mês passado, 30 dias ou datas), custo total, fornecedores, guias (lançados + a confirmar com referência), economia (casados / negociado abaixo da tabela), custo por pax, dias lançados/conferidos; gráfico de custo por dia; por fornecedor; por tipo, categoria ou região/passeio; por guia; serviços cobrados acima da tabela; CSV. Dias que ninguém abriu podem ser calculados pela tabela (busca o Phoenix e grava como rascunho).
  - **Tarifas**: por fornecedor (tipo IN/OUT/transfer/passeio, região ou passeio, categoria, valor e valor casado; fornecedor vazio = tabela geral, a do fornecedor tem prioridade; com mais de uma região na escala vale a mais cara), referência de valor dos guias e a regra do casado.
  - Dados: `settings/custos` (tarifas, tarifasGuia, casado, categoriasVeiculo, regioesConhecidas) e `custos_dia/{AAAA-MM-DD}` (status, `linhas.{chave}` com o retrato do serviço + `calc`, e `manual` com o que foi lançado — a sincronização com o Phoenix nunca mexe em `manual`). Cálculo puro em `Services/Services/custosCalculo.js` (testado à parte), acesso em `custosRepository.js`, telas em `components/CustosOperacionais/`. `firestore.rules`: `settings/custos` deixou de ser lido por comercial e guia (só operacional).
- **Custos — regras novas e recomendador de troca** (pedido do usuário):
  - **Van alongada** (18 a 20 lugares) virou categoria própria, com tarifa própria na tabela; reconhecida pelo nome ("alongada", "(18)", "(20)", "18L"/"20L"). Van normal = 14 a 16 lugares.
  - **Veículo de apoio de passeio**: busca no hotel, entrega ao veículo principal e traz de volta — cobra a tarifa nova **"Apoio de passeio (por trecho)"** × 2 trechos (ou 1, na ficha), não o passeio cheio. Automático quando o nome tem "APOIO" ou quando o mesmo passeio tem mais de um veículo e só alguns têm guia (os sem guia são apoio); a ficha permite marcar "É apoio" / "Faz o passeio".
  - **Visualização por veículo**: o custo do dia alterna entre **Lista** e **Por veículo** (cards como na Prévia de transfers: veículo, fornecedor, categoria, total, serviços do dia com casado/apoio/guia); a escolha fica lembrada no navegador.
  - **Recomendador de custo** (`recomendarTrocas` em `custosCalculo.js`): para cada IN/OUT da região do casado que está sozinho, procura outro veículo que tenha o par dentro do intervalo do casado, comporte o grupo (carro 4, van 15, van alongada 20, micro 28, ônibus 50) e esteja livre — margem mínima entre os serviços do veículo (a do casado nas viagens para a região; 1h na cidade; passeio ocupa o veículo pelas horas configuradas). Prefere **trocar** (o veículo de origem recebe um serviço do outro, para nenhum fornecedor ficar sem) e, sem troca possível, sugere **passar** o serviço. A economia é a diferença do custo dos dois veículos pela tabela, antes e depois, em R$ e %. Aparece embaixo do serviço no card do veículo, como etiqueta na lista (leva ao card) e no quadro "Recomendador de custo", com botão para copiar o texto. Novo filtro "Com recomendação".
  - **Margens**: em Tarifas → Serviço casado, "Margem mínima" (padrão 2h — deslocamento sem risco de atraso), "Margem máxima do casado" (3h) e "Um passeio ocupa o veículo por" (8h).
- **Custos — no-show, guia MI/idioma e tarifário** (pedido do usuário):
  - **No-show** (passageiro não se apresentou): marcado na ficha do serviço. Chegada (IN) paga **50%** do valor do serviço ao fornecedor; saída (OUT) e transfer pagam **integral** (porcentagens editáveis em Tarifas → Regras). O valor do serviço (lançado ou tabela) fica guardado em `valorServico`; o pago em `valorFornecedor`; a diferença em `economiaNoShow`. Etiqueta "No-show · paga 50%" na lista e nos cards, filtro "No-show", indicador de economia somando o no-show.
  - **Modalidade do guia**: Regular, **Tabela MI** (guiamento todo em outro idioma para um grupo — referências próprias, `tabela: "mi"` nas tarifas de guia) e **Regular + idioma** (passeio regular com passageiro de outro idioma: referência + **20%**, editável). O automático usa o idioma dos passageiros que vem do Phoenix (`idiomas` no serviço; português não conta): passeio com estrangeiro → + idioma. Na lista, etiqueta "MI" ou "+20% ES" ao lado do guia e botão ✓ para confirmar a referência como valor pago; na ficha, a modalidade, os idiomas do grupo, a conta da referência e "Usar referência". O valor digitado é o total pago ao guia.
  - **Relatório**: quadro "No-show e adicionais" (no-shows, pago e quanto deixou de pagar; guias na tabela MI; guias com adicional de idioma e o adicional pago) e economia somando o no-show; CSV com no-show, valor do serviço e modalidade do guia.
  - **Tarifário** (aba nova): todos os valores numa folha — por tipo (IN, OUT, transfer, passeio, apoio), trajeto/passeio × categoria do veículo, com o valor casado; guias em Regular / Regular + idioma (calculado) / Tabela MI; e as regras (no-show, idioma, casado, apoio). Escolhendo um fornecedor, mostra os valores dele e, onde não houver, os da tabela geral (marcados "geral"). Clique numa célula para editar ou cadastrar; "Imprimir" gera só a folha (A4, preto no branco). Formulários de tarifa saíram para `FormulariosTarifa.jsx` (usados pelo Tarifário e pela aba Tarifas).
  - Tarifas: a sub-aba "Serviço casado" virou **Regras** (no-show, adicional de idioma e casado); a lista de guias ganhou a coluna Tabela (Regular/MI).
- **Custos — cobrança por passageiro/reserva e serviço de parceiro (LCR)** (pedido do usuário):
  - Toda tarifa ganhou **Cobrança**: por serviço (veículo, como antes), **por passageiro** ou **por reserva** — o valor é multiplicado pela quantidade do serviço no Phoenix. Na ficha do dia dá para corrigir a quantidade cobrada ("Passageiros cobrados"); vazio = a do Phoenix. Valor casado só vale para cobrança por serviço.
  - Tipo novo de tarifa **"Serviço de parceiro (pelo nome no Phoenix)"**: fornecedor (ex.: LCR) + um pedaço do nome do serviço (ex.: "MORRO DE SAO PAULO", sem diferenciar acento) + "só quando o serviço for" (ex.: Transfer, para não pegar o passeio de mesmo nome). As reservas que batem entram no custo do dia **mesmo sem veículo escalado**, uma linha por horário de saída, com reservas, passageiros e "6 pax × R$ 137,10"; o fornecedor vem da tarifa. Os nomes de serviço vistos no Phoenix ficam como sugestão no cadastro (`servicosConhecidos`).
  - Relatórios: quadro "Condições especiais" mostra cada parceiro com reservas, passageiros, saídas, total pago e custo por pax; o ranking por fornecedor mostra também as reservas.
  - Tarifário: seção "Serviços de parceiros" e valores com "/ pax" ou "/ reserva".
  - `consolidarServicos(itens, data, tarifas)` recebe as tarifas; o custo do dia busca as reservas cruas do Phoenix (`buscarItensDoDia`) e consolida na tela, então uma tarifa de parceiro nova vale na hora, sem recarregar.
- **Tarifas e Tarifário — filtro por veículo e lista mais clara** (pedido do usuário): novo `FiltroVeiculo.jsx` (chips Carro, Van, Van alongada, Micro-ônibus, Ônibus, Qualquer veículo, com a quantidade de tarifas de cada um). Na aba **Tarifas**, além do veículo, chips por tipo de serviço (IN, OUT, Transfer, Passeio, Apoio, Parceiro) e "Limpar filtros"; a lista ficou agrupada por tipo de serviço (cabeçalho "Chegada (IN) — aeroporto → hotel · N tarifas" e botão "+ nova" já com o tipo e o veículo do filtro), linhas compactas e clicáveis para editar, veículo em etiqueta, valor com "/ pax" quando for o caso e valor casado com o desconto em % (ex.: R$ 180,00 −28%). No **Tarifário**, o filtro de veículo mostra só a coluna dele e os valores que valem para qualquer veículo (serviços de parceiro somem, porque não dependem de veículo); a impressão sai filtrada e com o veículo no cabeçalho.
- **Serviços por Fornecedor — plotados, seleção rápida e relatório novo** (pedido do usuário):
  - **Plotado**: cada veículo tem o botão "P"/"Plotado" (ao lado do nome, nos fornecedores e nos pendentes). Automático quando o nome do Phoenix tem "PLOTADO/PLOTADA"; dá para marcar ou desmarcar à mão (grava `plotado` no vínculo do veículo, em `settings/vinculos_veiculos_fornecedor`). A categoria do veículo (carro, van, van alongada, micro, ônibus) vem do nome ou da categoria fixada em Custos e aparece junto da placa.
  - **Seleção rápida** no painel de veículos: "Todos os plotados", "Carros plotados", "Vans plotadas", "Vans alongadas plotadas"…, "Não plotados" e por categoria (Carros, Vans…), com a quantidade de veículos. O clique seleciona só aquele grupo; com "somar à seleção" marcado, junta com o que já estava. O nome da seleção vai para o relatório.
  - **Relatório impresso refeito** (`relatorioHtml.js`): só entram os veículos/fornecedores selecionados — saiu a lista de todos os veículos desmarcados no fim (fica só "N veículo(s) ficaram fora"), e o aviso de pendentes só cita os pendentes selecionados. Novo visual: cabeçalho com o nome do fornecedor (ou da seleção), indicadores, gráficos em SVG (serviços por dia em colunas; divisão por tipo IN/OUT/Transfer/Passeio com %; barras empilhadas por fornecedor/veículo no ranking e barras por veículo no relatório de um fornecedor), tabela com o tipo em etiqueta colorida e "plotado" ao lado do veículo, e rodapé com a seleção usada.
- **Serviços por Fornecedor — relatório minimalista e apoio separado de passeio** (pedido do usuário):
  - Seletor do relatório: **Minimalista (1 página)** — resumo em texto + indicadores + uma tabela por fornecedor (ou por veículo, no relatório de um fornecedor) com IN, OUT, Transfer, Passeio, Apoio, total, % e uma barrinha da divisão, com linha de total; **Detalhado** (gráficos, como antes); **Detalhado + serviços de cada um** (no ranking). A escolha fica lembrada no navegador.
  - Os dois relatórios abrem com um **resumo em linguagem simples** para a gerência (quantos fornecedores, total, média por dia, quem lidera e os seguintes, divisão por tipo em %, apoios em trechos).
  - **Apoio** virou tipo próprio (não conta como passeio), na tela e no relatório. Um serviço de passeio é apoio quando: "APOIO" no nome do veículo **ou do motorista/usuário escalado** (ex.: veículo THAIS 3 com motorista THAIS APOIO); é **carro** (Spin, Doblò…) sem guia no passeio; ou é o veículo sem guia que acompanha o principal no mesmo passeio do dia. O relatório explica a regra no rodapé e diz quantos trechos os apoios representam (2 por apoio). A mesma regra (motorista e carro sem guia) passou a valer na detecção de apoio dos Custos operacionais.
- **Serviços por Fornecedor — escolher os veículos plotados de cada fornecedor** (pedido do usuário):
  - Novo painel **"Veículos plotados"** (`PlotadosDrawer.jsx`), aberto pelo botão no topo do painel de veículos ou pelo ícone de etiqueta em cada fornecedor (já abre filtrado nele). Mostra os veículos agrupados por fornecedor (os do período e os já vinculados, mesmo sem serviço agora), com uma chave liga/desliga por veículo, "todos"/"nenhum" por fornecedor, filtro por fornecedor e busca por veículo ou placa.
  - Ex.: fornecedor com 5 carros e 2 plotados → liga só os 2. A marcação vale mais que o nome do Phoenix (o "pelo nome" indica os reconhecidos automaticamente; dá para desligar).
  - As mudanças só gravam em **Salvar (N alterações)**, numa única gravação com merge em `settings/vinculos_veiculos_fornecedor` (`vinculos.{chave}.plotado`, o mesmo campo do botão "P"). A seleção rápida e o relatório passam a usar a marcação na hora.
  - Arquivos: `ServicosFornecedor/PlotadosDrawer.jsx` (novo), `ServicosFornecedor.jsx`, `ServicosFornecedor/styles.css`.
- **Serviços por Fornecedor — tamanho da fonte do relatório** (pedido do usuário): seletor ao lado do tipo de relatório com **Fonte pequena (90%)**, **normal**, **grande (115%)** e **muito grande (130%)**, salvo neste navegador (`servicos_fornecedor_fonte_relatorio`). Vale para o minimalista, o detalhado e o completo. `documentoRelatorio` recebe `escalaFonte` e multiplica todos os tamanhos do CSS do documento; os rótulos dos gráficos crescem 60% disso para não se sobreporem, e na fonte grande a coluna "Divisão" do minimalista encolhe para o nome do fornecedor caber (continua em 1 página). Arquivos: `relatorioHtml.js`, `ServicosFornecedor.jsx`.
- **Ocorrências de fornecedores e Prontidão do dia (D-1)** — feitas e **removidas** a pedido do usuário. O código voltou ao estado anterior (sem as telas `/ocorrencias` e `/prontidao`, sem os itens de menu e sem as funções de apoio que tinham entrado em `custosCalculo.js`, `custosRepository.js` e `relatorioHtml.js`). As coleções `ocorrencias` e `prontidao_dia` deixam de ser usadas.
