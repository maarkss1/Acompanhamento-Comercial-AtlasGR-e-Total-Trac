# Agente 03 — Data Quality Guardian

> Escopo: análise estática do código real do repositório (sem acesso à API Bitrix24 ao vivo
> nesta sessão). Toda constatação abaixo cita arquivo/trecho verificado em
> `/home/user/Acompanhamento-Comercial-AtlasGR-e-Total-Trac`. Onde a confirmação exigiria dados
> reais em produção, isso está marcado explicitamente como "não verificável nesta sessão".

## Resumo executivo

O pipeline é 100% client-side (navegador → Bitrix24 REST, sem backend próprio) mais uma
automação Node semanal (`scripts/forecast-semanal.mjs` via GitHub Actions). Diferente do que se
esperaria de um app "básico", o código já implementa várias defesas de qualidade de dados
deliberadas e bem comentadas: deduplicação por `ID` na paginação (`mesclarSemDuplicarPorId`),
reconciliação de contagem extraída vs. total informado pelo Bitrix (`completudePct`,
`auditoriaJornada`), tratamento explícito do sentinela `COMPANY_ID=0` do Bitrix, e dois
relatórios dedicados de auditoria de completude (`qualidade_crm`, `auditoria_sdr`). Isso reduz o
risco de vários problemas "óbvios" que normalmente apareceriam em uma auditoria deste tipo.

Ainda assim, foram encontrados riscos reais e verificáveis no código:

1. **Datas negativas (indicativas de timestamp futuro/inconsistente) são silenciosamente
   zeradas** em pelo menos três lugares (`calcularDiasParadoNoEstagio`,
   `diferencaDiasAteReferencia`, cálculo de `diasParado` em `decisao_final_sdr`) — um negócio ou
   lead com `MOVED_TIME`/data de referência no futuro aparece como "0 dias parado" em vez de
   sinalizar a anomalia.
2. **O rótulo "Última atualização" do Cockpit não reflete a idade real dos dados**: é
   carimbado com `new Date()` no momento da chamada, mesmo quando a resposta veio do cache de 5
   minutos em `localStorage` (`bitrixFetchComRetentativa`), sem nenhuma indicação visual de que os
   dados podem ter até 5 minutos de defasagem em relação ao Bitrix.
3. **Nenhum teste automatizado, validação de schema ou reconciliação entre fontes** existe no
   repositório — confirmado por busca (`describe(`, `assert(`, `expect(`, dependências de teste)
   sem nenhum resultado, e pela própria `AUDITORIA_ESTADO_ATUAL.md`.
4. **Deduplicação cobre Empresas e repetição de Negócios por cliente/funil, mas não Leads** — não
   há verificação de leads duplicados (ex.: mesmo telefone/e-mail em dois `crm.lead.list`
   diferentes) em nenhum relatório do catálogo.
5. Fuso horário é **hardcoded para `-03:00`** (Brasília) em todos os filtros de data client-side
   e no script Node, sem derivar do fuso configurado na conta Bitrix real — assunção razoável
   para uma empresa brasileira, mas não verificável sem acesso à conta real.

Nenhum destes achados é hipotético: todos apontam para trecho de código específico. Achados que
dependeriam de inspecionar dados reais do Bitrix (ex.: "existem hoje negócios com `OPPORTUNITY`
vazio?") estão marcados como não verificáveis nesta sessão.

## Completude (achados com evidência)

- **Existem dois relatórios dedicados de completude/auditoria** (evidência de maturidade, não um
  problema): `qualidade_crm` e `auditoria_sdr`, ambos em
  `js/catalogo-relatorios.js:329-376`. `qualidade_crm` calcula `FALTANTES`/`COMPLETUDE_PCT` para
  campos como vínculo de cliente, `SOURCE_ID`, `ASSIGNED_BY_ID`, `OPPORTUNITY > 0` e
  `CLOSEDATE` em negócios abertos; `auditoria_sdr` cobre leads sem atividade, atividades
  concluídas sem assunto, leads abertos sem contato há mais de 7 dias, e leads sem telefone/e-mail.
  Ambos rotulam explicitamente a limitação: "Completude mede disponibilidade... não afirma que
  todo campo seja obrigatório" (linha 346) e "valida existência e completude, não a qualidade do
  conteúdo" (linha 375).
- **Campo ausente vira string vazia silenciosa em quase toda a UI de tabela**: `registro[c] ?? ""`
  em `js/extrator.js:380` (extração genérica) e padrão equivalente em `js/extrator.js:674` — não é
  necessariamente um problema (é o comportamento esperado de uma tabela de exportação), mas
  significa que a UI de extração manual não distingue visualmente "campo vazio no Bitrix" de
  "campo não solicitado" — ambos aparecem como célula em branco.
- **Valores monetários ausentes/`null`/não numéricos são convertidos para `0` em quase 30
  ocorrências no código** (`Number(x.OPPORTUNITY) || 0` / `parseFloat(...) || 0`), em
  `js/extrator.js:351`, `js/forecast.js:152,449,582,588`, `js/sdr.js:1270,1298`, `js/jornada.js:574`,
  `js/ui.js:761,809`, `js/catalogo-relatorios.js` (múltiplas linhas). Isso é aceitável para somas
  (um valor ausente não deveria inflar o total), mas em **médias por contagem de negócios**
  (ex. `ticketMedioMes = fechadoMes / ganhosMes.length` em `js/cockpit.js:496`, `549`, `591`, `670`)
  um negócio marcado "Ganho" no Bitrix sem `OPPORTUNITY` preenchido entra no denominador com
  valor `0`, deflacionando silenciosamente o ticket médio sem qualquer aviso — o próprio
  `qualidade_crm` já mede quantos negócios têm `OPPORTUNITY > 0`, mas esse número não é
  cruzado automaticamente com os cálculos de ticket médio do Cockpit/Forecast.
- **Comentário explícito de princípio de design em `js/cockpit.js:16-18`**: "Quando um número não
  pode ser calculado com confiança... mostramos 'não disponível' — nunca 0 silencioso." Isso é
  seguido consistentemente via o helper `cockpitND` para métricas agregadas (coverage, win rate,
  ticket médio quando a amostra é vazia), mas **não** é seguido no nível de registro individual
  para o campo `OPPORTUNITY` (ver item acima) — uma inconsistência entre a intenção documentada e
  a prática em pontos específicos.
- **Não verificável nesta sessão**: se hoje existem, na base real de Negócios/Leads da AtlasGR ou
  Total Trac, registros com campos obrigatórios de fato vazios (ex. `OPPORTUNITY` em negócios
  "Ganhos", `SOURCE_ID` em leads) — isso requer rodar `qualidade_crm`/`auditoria_sdr` contra o
  Bitrix real.

## Consistência

- **Duplicação de regra de negócio entre navegador e automação Node**: `probabilidadeFallbackForecast`,
  `STAGE_IDS_PILOTO` e `METAS_FORECAST_MENSAL_PADRAO` existem tanto em `js/config.js`/`js/jornada.js`
  quanto em `scripts/forecast-semanal.mjs` (já documentado e parcialmente corrigido em
  `AUDITORIA_ESTADO_ATUAL.md`, seção 11) — sem módulo compartilhado entre os dois runtimes, uma
  edição futura de meta/estágio feita em um lado e esquecida no outro produz **dois relatórios de
  forecast divergentes** (o gerado pela automação semanal por e-mail vs. o gerado interativamente
  pelo usuário na mesma semana) sem qualquer alerta automático de divergência. Confirmado como
  risco estrutural ainda não resolvido pela própria auditoria anterior — não há mecanismo de
  reconciliação entre as duas saídas.
- **`CATEGORY_ID=0` ("Comercial") hardcoded como funil de referência** em vários pontos
  (`baseDealsCatalogo(webhook, true)`, script Node) — se a estrutura de funis do Bitrix for
  renumerada/alterada, os relatórios comerciais passam a filtrar o funil errado silenciosamente
  (sem erro, apenas resultado vazio ou incorreto). Não verificável nesta sessão se a numeração
  atual da conta real ainda corresponde a isso.
- **`COMPANY_ID=0` é tratado corretamente** como "sem empresa" (não como um ID de empresa válido)
  em `js/jornada.js:875` (`String(d.COMPANY_ID ?? "").trim() === "0"`) e contabilizado
  separadamente em `idsZeroIgnorados` (linhas 258, 1318) — evidência de que o time já corrigiu essa
  armadilha comum do Bitrix (`0` como falsy-mas-numérico).
- **Metas mensais fixas em código-fonte, duplicadas em dois arquivos** (`js/config.js:335-338` e
  `scripts/forecast-semanal.mjs`) — mudança de meta exige editar os dois; sem meta cadastrada para
  um mês fora da tabela, `metaMensalPadrao` retorna `0` silenciosamente (`js/config.js:339-342`),
  que por sua vez alimenta o campo de meta pré-preenchido da UI — um mês futuro não coberto pela
  tabela mostraria meta "R$ 0,00" sem aviso caso o usuário não perceba e não edite manualmente.

## Validade

- **Datas futuras/negativas são clampadas para `0` silenciosamente em três lugares distintos**,
  mascarando a anomalia em vez de sinalizá-la:
  - `js/extrator.js:313-327` (`calcularDiasParadoNoEstagio`): `const dias = ...; registro[CAMPO] = dias >= 0 ? dias : 0;` — se `MOVED_TIME` estiver no futuro (erro de digitação, fuso incorreto, relógio do servidor Bitrix dessincronizado), o negócio aparece como teoricamente "recém-movido" (0 dias parado) em vez de reportar a inconsistência.
  - `js/jornada.js:390-394` (`diferencaDiasAteReferencia`): `Math.max(0, Math.floor(...))` — mesmo padrão.
  - `js/catalogo-relatorios.js:386` (`decisao_final_sdr`): `diasParado = ... Math.max(0, Math.floor(...))` — mesmo padrão, usado para decidir se um lead deve ser "recontatado"/"escalado"; uma data futura em `MOVED_TIME`/`DATE_CREATE` do lead resultaria em "0 dias parado" e a recomendação ficaria `null` ("dentro do prazo"), quando na verdade os dados estão inconsistentes.
  - Risco sinalizado conforme pedido: **valor default silencioso que pode mascarar dado ausente/inconsistente** — nenhum desses três pontos emite log, contador de auditoria ou aviso na UI quando o clamp é acionado.
- **Fuso horário hardcoded como `-03:00`** em todos os filtros de período que tocam o Bitrix:
  `js/extrator.js:171-172` (`inicio + "T00:00:00-03:00"`), `js/bitrix-api.js:350-351`
  (mesmo padrão em `montarFiltro`), e replicado no script Node. Não há leitura do fuso horário
  real configurado na conta Bitrix (`TIME_ZONE` existe como campo de usuário em `ENTIDADES.usuarios`
  em `js/config.js:257`, mas não é usado para ajustar os filtros de data). Para uma operação
  100% Brasília isso é uma assunção razoável (comentário em `.github/workflows/forecast-semanal.yml`
  confirma "Brasília, sem horário de verão desde 2019") mas **não é verificável nesta sessão** se a
  conta Bitrix real está de fato configurada nesse fuso, nem o que acontece se um usuário abrir o
  dashboard fora do Brasil (o `new Date()` do navegador do usuário usaria o fuso local dele para
  "hoje", enquanto o filtro de data enviado ao Bitrix assume `-03:00` fixo — divergência potencial
  entre "hoje" na tela e "hoje" no filtro aplicado).
- **Sem validação de que a data "De" ou "Até" não é ela própria uma data futura absurda** —
  `validarPeriodo()` (`js/bitrix-api.js:538-545`) só valida `inicio > fim`, não valida limites
  razoáveis (ex. ano muito distante).
- **`totalBitrix == null` é tratado como "não informável"**, não como erro (`js/jornada.js:257`),
  o que é o comportamento correto dado que o Bitrix nem sempre retorna `total` — mas confirma que
  quando o Bitrix omite o total, a completude do lote simplesmente não é auditável por esse
  mecanismo (sem fallback alternativo de verificação).

## Atualidade (freshness)

- **Modelo de atualização é híbrido**: (a) extração/consulta manual sob demanda pelo usuário
  (`extracao.html`/`totaltrac-extracao.html`, botão "Extrair"); (b) Cockpit com auto-atualização
  a cada 5 minutos **somente se o usuário já salvou um webhook no navegador**
  (`COCKPIT_AUTO_ATUALIZACAO_MS = 5 * 60 * 1000`, `js/cockpit.js:130-142`); (c) automação server-side
  fixa, semanal, via GitHub Actions (`cron: "0 16 * * 5"` = sexta 13h Brasília,
  `.github/workflows/forecast-semanal.yml`). Não há atualização automática para os demais
  relatórios do catálogo (Jornada, SDR, etc.) fora do Cockpit — eles só recalculam quando o
  usuário clica.
- **A UI mostra "Última atualização" no Cockpit** (`cockpit.html:110`, `js/cockpit.js:144-155`),
  mas **o timestamp é gravado incondicionalmente com `new Date()` no momento da chamada**
  (`js/cockpit.js:311`, dentro de `atualizarCockpit()`), **independente de a resposta ter vindo de
  rede ou do cache de 5 minutos em `localStorage`** (`bitrixFetchComRetentativa`,
  `js/bitrix-api.js:579-592`, TTL de `5 * 60 * 1000` ms). Consequência verificável no código: se o
  usuário clicar em "↻ Atualizar agora" duas vezes dentro de 5 minutos, a segunda vez mostra um
  novo horário "Última atualização: HH:MM" idêntico ao clique, mesmo que os dados por trás sejam
  exatamente os mesmos da consulta anterior (cache hit) — o rótulo comunica uma frescura que os
  dados não necessariamente têm.
- **Cache de 5 minutos persiste em `localStorage` (não `sessionStorage`)**: sobrevive a fechar e
  reabrir a aba/navegador dentro da janela de 5 minutos (`js/bitrix-api.js:579-592`). Não há
  indicador de "dados em cache" na UI nem menção disso em `COCKPIT_COMERCIAL.md`/`PORTAL.md` — o
  usuário não tem como saber, olhando a tela, se está vendo uma resposta fresca ou cacheada. Existe
  um botão de força (`window.FORCAR_ATUALIZACAO_BITRIX`/`limparCacheBitrix()`), mas não há
  elemento de UI padrão que o exponha (não verificado se algum botão específico o aciona — não
  encontrado nas buscas realizadas nesta sessão).
- **Falha do cron semanal não gera alerta proativo**: o único mecanismo de aviso é
  `ALERTA_WEBHOOK_URL` (opcional, avisa quando a *projeção do mês* não bate a meta — regra de
  negócio, não de falha técnica) — se o job falhar por webhook revogado, erro de rede ou erro de
  SMTP, o único registro é o log padrão do GitHub Actions; ninguém é notificado ativamente
  (confirmado também por `AUDITORIA_ESTADO_ATUAL.md`, seção 12).
- **Não verificável nesta sessão**: frequência real com que os usuários efetivamente clicam
  "Extrair"/"Atualizar agora" em produção, e se o cron semanal está de fato rodando com sucesso
  hoje (isso exigiria checar a aba Actions do GitHub, fora do escopo desta análise estática).

## Unicidade / duplicidade

- **Deduplicação por `ID` na paginação está implementada e é usada de forma consistente**:
  `mesclarSemDuplicarPorId(acumulado, chunk, campoId = "ID")` em `js/bitrix-api.js:386-401`,
  usada tanto na extração genérica (`js/extrator.js:22-24`, `184`) quanto no carregamento de
  listas auxiliares (`carregarListaPaginada`, `js/bitrix-api.js:409-431`). Ela existe
  especificamente para lidar com o CRM mudando durante uma extração longa (comentário na linha
  377 de `bitrix-api.js`: "ordenação determinística evita páginas inconsistentes quando o CRM
  muda durante a extração") — mitigação correta e já madura para esse cenário concreto.
  O contador de duplicados é reportado ao usuário ("X duplicado(s) de paginação ignorado(s))",
  `js/extrator.js:48`).
- **Duplicidade de Empresas** é detectada por nome normalizado, e-mail e telefone
  (`construirSinaisDuplicidadeEmpresas`, `js/jornada.js:183-230`), exposta tanto na Jornada do
  Cliente quanto no relatório dedicado `duplicidades`
  (`js/catalogo-relatorios.js:302-310`). O relatório é explícito sobre não fundir automaticamente
  registros ("Sinal de duplicidade não implica mesclagem automática", linha 309).
- **Repetição de Negócios para o mesmo cliente dentro do mesmo funil** também é detectada
  (agrupamento por `COMPANY_ID` ou, na ausência dele, por título normalizado + `CATEGORY_ID`,
  `js/catalogo-relatorios.js:303`), reportado como "Cliente repetido no mesmo pipeline".
- **Gap confirmado: não há detecção de duplicidade de Leads** (`crm.lead.list`) em nenhum ponto do
  código pesquisado — nem por nome/telefone/e-mail, nem por reentrada. Diferente de Empresas, o
  Lead é uma entidade de alto volume e alta chance de duplicidade real (a mesma pessoa preenchendo
  um formulário duas vezes, ou um SDR recriando manualmente um lead perdido) e hoje não é coberta
  por nenhum dos ~20 relatórios do catálogo nem pelos relatórios especiais (Diário SDR, Análise
  SDR, Jornada). O relatório `duplicidades` cobre apenas Empresas e Negócios.
- **Não verificável nesta sessão**: volume real de leads/negócios duplicados na base de produção —
  isso exigiria rodar os relatórios existentes (ou uma extensão do relatório `duplicidades` para
  Leads) contra o Bitrix real.

## Riscos por severidade

| Severidade | Achado | Confiança | Evidência |
|---|---|---|---|
| **Alto** | Datas futuras/negativas (`MOVED_TIME`, referência de estagnação) são clampadas para `0` silenciosamente em 3 pontos, mascarando inconsistência de dado como "tudo em dia" — inclusive alimentando uma recomendação automática (`decisao_final_sdr`) | Alta (código lido diretamente) | `js/extrator.js:313-327`; `js/jornada.js:390-394`; `js/catalogo-relatorios.js:386` |
| **Alto** | Nenhuma reconciliação entre a lógica de forecast do navegador (`js/jornada.js`/`js/config.js`) e a automação Node (`scripts/forecast-semanal.mjs`) além de comentários manuais — divergência de meta/estágio pode gerar dois relatórios de forecast incompatíveis sem alerta | Alta (já documentado e parcialmente corrigido antes; risco estrutural remanescente confirmado) | `AUDITORIA_ESTADO_ATUAL.md` seção 11; duplicação confirmada de `METAS_FORECAST_MENSAL_PADRAO` em `js/config.js:335-338` |
| **Médio** | "Última atualização" do Cockpit não distingue resposta de rede de resposta em cache (até 5 min de defasagem possível), comunicando frescura que os dados podem não ter | Alta (código lido diretamente) | `js/cockpit.js:311`; `js/bitrix-api.js:579-592` |
| **Médio** | Nenhum teste automatizado, validação de schema ou verificação de tipos cobre as fórmulas de negócio (forecast, aging, SLA, completude) | Alta (ausência confirmada por busca no repo) | Busca por `describe(`/`assert(`/`expect(` sem resultados; `package.json` sem dependências de teste; `AUDITORIA_ESTADO_ATUAL.md` seção 12 |
| **Médio** | Sem detecção de duplicidade de Leads (só Empresas e repetição de Negócios) | Alta (ausência confirmada por busca no repo) | `js/catalogo-relatorios.js:302-310`; nenhuma ocorrência equivalente para `crm.lead.list` |
| **Médio** | Ticket médio (Cockpit/Forecast) divide por contagem de negócios "Ganhos" sem excluir os que têm `OPPORTUNITY` ausente/zero, deflacionando a média silenciosamente | Média (padrão de código confirmado; magnitude real do efeito depende de dados de produção não verificáveis nesta sessão) | `js/cockpit.js:496,549,591,670`; contraste com o princípio declarado em `js/cockpit.js:16-18` |
| **Baixo** | Fuso horário `-03:00` hardcoded em vez de derivado da conta Bitrix real | Média (assunção razoável para operação brasileira, mas não verificável sem acesso à conta real) | `js/extrator.js:171-172`; `js/bitrix-api.js:350-351`; `scripts/forecast-semanal.mjs` |
| **Baixo** | `CATEGORY_ID=0` como funil "Comercial" hardcoded em múltiplos pontos — renumeração de funil no Bitrix quebraria filtros silenciosamente | Média (padrão confirmado no código; probabilidade de a conta real mudar isso não é verificável) | `AUDITORIA_ESTADO_ATUAL.md` seção 15; uso confirmado de `baseDealsCatalogo(webhook, true)` |
| **Baixo** | `metaMensalPadrao` retorna `0` silenciosamente para meses fora da tabela hardcoded, pré-preenchendo campos de meta com "R$ 0,00" sem aviso | Alta (código lido diretamente) | `js/config.js:335-342` |
| **Informativo (não é problema, é mitigação já existente)** | Deduplicação por `ID` na paginação, reconciliação de contagem vs. `total` do Bitrix, tratamento de `COMPANY_ID=0`, dois relatórios dedicados de completude | Alta | `js/bitrix-api.js:386-401`; `js/jornada.js:257,875`; `js/catalogo-relatorios.js:329-376` |

## Recomendações priorizadas

1. **(Alto)** Nos três pontos de clamp de dias negativos (`calcularDiasParadoNoEstagio`,
   `diferencaDiasAteReferencia`, `decisao_final_sdr`), substituir o `Math.max(0, ...)` silencioso
   por: preservar o valor negativo/anômalo em um campo separado de auditoria (ex.
   `DIAS_PARADO_INCONSISTENTE`) e contabilizá-lo num contador visível na UI (seguindo o mesmo
   padrão já usado para `idsZeroIgnorados`/`duplicadosAPI`), em vez de apenas reportar "0 dias".
2. **(Alto)** Formalizar a reconciliação entre `js/jornada.js`/`js/config.js` (browser) e
   `scripts/forecast-semanal.mjs` (Node): no mínimo, um teste automatizado simples (Node) que
   compare as constantes/tabelas dos dois lados a cada execução do cron e falhe/alerte se
   divergirem — mais barato do que extrair um módulo compartilhado (já avaliado e descartado por
   `AUDITORIA_ESTADO_ATUAL.md` por causa do `file://`/CORS).
3. **(Médio)** No Cockpit, marcar visualmente quando `atualizarCockpit()` serviu dados de cache
   (bastaria `bitrixFetchComRetentativa` retornar um flag `_deCache` e o rótulo "Última
   atualização" exibir "(cache, dado de até 5 min atrás)" quando aplicável).
4. **(Médio)** Introduzir testes unitários Node para as funções puras de cálculo já identificadas
   em `AUDITORIA_ESTADO_ATUAL.md` (`probabilidadeFallbackForecast`, `classificarBucketForecast`,
   `taxaPct`, `cicloDealDias`, `mesclarSemDuplicarPorId`) — não exige framework pesado, `node:test`
   nativo (Node 20, já usado no workflow) é suficiente.
5. **(Médio)** Estender o relatório `duplicidades` para cobrir Leads (mesmo critério de
   nome/e-mail/telefone já usado para Empresas em `construirSinaisDuplicidadeEmpresas`).
6. **(Médio)** No cálculo de ticket médio (Cockpit e Forecast), excluir do denominador negócios
   "Ganhos" com `OPPORTUNITY` ausente/zero, ou pelo menos expor a contagem de quantos foram
   excluídos/incluídos com valor zero, para que o número não seja lido como puro sem essa ressalva.
7. **(Baixo)** Adicionar validação de sanidade de data no filtro de período (`validarPeriodo`):
   rejeitar ou avisar quando "De"/"Até" estiverem muito distantes da data atual (ex. > 5 anos),
   reduzindo o impacto de erro de digitação no seletor de data.
8. **(Baixo)** Mover `METAS_FORECAST_MENSAL_PADRAO` para fora do código-fonte duplicado (já
   recomendado como P0.3 em `AUDITORIA_ESTADO_ATUAL.md`) e fazer `metaMensalPadrao` emitir um
   aviso explícito na UI (não apenas retornar `0`) quando o mês solicitado não estiver na tabela.

## Dependências e próximos agentes indicados

- **Agente de Segurança/Credenciais**: aprofundar os riscos já mapeados em
  `AUDITORIA_ESTADO_ATUAL.md` seção 13 (webhook em `localStorage`, mesmo que ofuscado; ausência de
  controle de acesso real além da senha única por navegador em `js/auth.js`) — fora do escopo
  deste agente (qualidade de dado), mas adjacente e já parcialmente documentado.
- **Agente de Arquitetura/Refatoração**: avaliar a extração de um módulo de regras de forecast
  compartilhado entre navegador e Node (recomendação P0.1 de `AUDITORIA_ESTADO_ATUAL.md`) — é
  pré-requisito estrutural para eliminar de vez o risco de divergência silenciosa apontado na
  seção "Consistência" acima.
- **Agente de QA/Testes**: usar a lista de funções puras já identificada (seção "Recomendações
  priorizadas", item 4) como ponto de partida para uma primeira suíte de testes unitários — hoje
  zero cobertura confirmada.
- **Validação com dados reais do Bitrix (fora do escopo desta sessão)**: todos os itens marcados
  "não verificável nesta sessão" ao longo deste documento (volume real de leads/negócios
  duplicados, completude real de `OPPORTUNITY`/`SOURCE_ID` na base de produção, fuso horário
  configurado na conta real, status atual do cron semanal) requerem rodar os relatórios
  `qualidade_crm`/`auditoria_sdr`/`duplicidades` contra o webhook real da AtlasGR/Total Trac —
  recomenda-se que o próximo agente com acesso a dados reais (ou um humano) execute esses três
  relatórios e anexe a saída a este documento como apêndice de validação.

## Confiança e limitações

- Esta análise é **inteiramente estática**: nenhuma chamada foi feita ao Bitrix24, nenhum dado de
  produção foi inspecionado. Toda constatação sobre *comportamento do código* tem confiança alta
  (trecho lido diretamente); toda constatação sobre *dados reais* (volumes, completude efetiva,
  fuso horário real da conta, se o cron está passando) está marcada como não verificável e não
  deve ser tratada como fato até validação com o Bitrix real.
- A base de código é grande (~10 mil linhas de JS entre `js/*.js`, mais `scripts/forecast-semanal.mjs`)
  e parte de `js/catalogo-relatorios.js` é extremamente densa (uma linha por relatório, sem quebras) —
  não é possível garantir cobertura de 100% de todos os ~20 relatórios do catálogo linha a linha
  nesta sessão; a amostragem focou nos relatórios mais diretamente ligados a completude/duplicidade/
  data (`qualidade_crm`, `auditoria_sdr`, `duplicidades`, `reentradas`, `implantacao_posvenda`) e nos
  módulos centrais de extração/cache/paginação (`bitrix-api.js`, `extrator.js`) e do Cockpit
  (`cockpit.js`).
- `AUDITORIA_ESTADO_ATUAL.md` (datada de 2026-08-15) foi usada como evidência adicional apenas
  onde suas afirmações puderam ser cruzadas com o código atual (ex.: ausência de testes, duplicação
  de metas/forecast entre browser e Node, tratamento de `COMPANY_ID=0`) — suas referências de
  número de linha ao arquivo monolítico antigo (`Relatorios AtlasGR.html`) estão desatualizadas
  desde a reestruturação em página/módulos separados, mas o próprio documento já observa isso e a
  lógica de negócio citada permanece localizável nos arquivos `js/*.js` atuais.
