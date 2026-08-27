# Correções de produção aplicadas após a Wave 1 (Fundação)

Conforme `00_CHIEF_ORCHESTRATOR_DIAGNOSTICO_E_PLANO.md`, as 3 correções de produção
mais urgentes (independentes do programa CPI) foram implementadas nesta sessão.
Este documento registra o que foi feito, o que ainda depende de uma ação humana
fora do código, e o que foi deliberadamente deixado de fora por exigir validação
com dados reais que esta sessão não tem como fazer.

## 1. Webhook de produção da AtlasGR exposto em texto puro — CORRIGIDO NO CÓDIGO, AÇÃO HUMANA PENDENTE

**O que foi feito:**
- Removido o valor literal do webhook (`WEBHOOK_FIXO_PADRAO`) de `js/bitrix-api.js`.
- Removido `value="..."` e `placeholder="..."` com o webhook literal de
  `cockpit.html`, `forecast.html`, `home.html`, `sdr.html`, `extracao.html`
  (as 5 páginas da AtlasGR que tinham o valor hardcoded).
- Removido o fallback hardcoded em `scripts/forecast-semanal.mjs` — o script
  agora exige exclusivamente a variável de ambiente `BITRIX_WEBHOOK_URL`
  (já configurada como Secret do GitHub Actions em
  `.github/workflows/forecast-semanal.yml`) e falha alto se ela não existir.
- Atualizados os textos estáticos ("Webhook fixo padrão configurado para a
  AtlasGR...") nas 5 páginas para refletir que não há mais um webhook
  pré-configurado — o comportamento dinâmico da UI (`atualizarStatusWebhookSalvo`,
  `esquecerWebhookSalvo` em `js/bitrix-api.js`) já tratava esse caso
  corretamente (é o mesmo caminho que a Total Trac sempre usou), só o texto
  estático precisava de ajuste.
- Confirmado por grep em todo o repositório: nenhuma ocorrência remanescente
  do valor literal do webhook.

**Ação humana pendente (não pode ser feita nesta sessão):**
- **Revogar e regenerar o webhook no Bitrix24 da AtlasGR.** O valor antigo
  ficou publicamente exposto (repositório público + GitHub Pages) por tempo
  indeterminado — remover do código não desfaz uma exposição já ocorrida.
  Enquanto o webhook antigo não for revogado, ele continua válido e utilizável
  por qualquer pessoa que já o tenha visto.
- Após regenerar, colar o novo webhook em cada página da AtlasGR (usando o
  botão "💾 Salvar webhook") e atualizar o Secret `BITRIX_WEBHOOK_URL` do
  GitHub Actions.
- Confirmar no Bitrix24 se o escopo do webhook antigo incluía permissão de
  escrita (`crm.item.update` é usado pela ferramenta) e, ao gerar o novo,
  aplicar o menor escopo necessário.
- Recomendado (fora do escopo desta correção): revisar o log de acessos do
  Bitrix24 no período em que o webhook esteve exposto, em busca de uso
  anômalo.

## 2. Divergência de "Fechado no mês" no Forecast Semanal — CORRIGIDO

**O que foi feito:** em `js/forecast.js`, a função `renderizarForecastSemanal()`
exibia `r.resumo.FECHADO_MES` (funil Comercial, `CLOSEDATE`) no card de KPI
"Fechado no mês", enquanto o relatório visual da mesma extração (função
`gerarHTMLForecastModelo()`, já alinhada por um commit anterior — v21) mostra
`r.modelo_visual.resumo.FECHADOS_VALOR` (funil Financeiro, "Contrato
assinado") no card "Entregue". Os dois apareciam lado a lado na mesma sessão
de extração com valores diferentes para o mesmo conceito.

A correção usa, no card de KPI, a mesma base já estabelecida pelo commit v21
(`FECHADOS_VALOR`), com fallback para o valor antigo apenas se `modelo_visual`
não estiver disponível. Isso segue a decisão de alinhamento já tomada pelo
projeto (documentada em `COCKPIT_COMERCIAL.md`), em vez de esta sessão impor
uma nova decisão de negócio sobre qual fórmula é "a certa".

**Limitação/o que NÃO foi corrigido nesta sessão:**
- `scripts/forecast-semanal.mjs` (o e-mail semanal automático) ainda usa sua
  própria reimplementação inline de classificação de estágio, que replica o
  cálculo antigo (funil Comercial, `CLOSEDATE`) e **não tem** o fallback
  `metaStage?.semantics` que a função canônica `semanticaDeal` (`js/jornada.js`)
  possui — usado quando `STAGE_SEMANTIC_ID` vem vazio do Bitrix. Trazer o
  e-mail para paridade completa exigiria buscar metadados de estágio por
  categoria (`crm.dealcategory.stage.list` ou equivalente) dentro do script
  Node, uma mudança que toca uma chamada adicional à API do Bitrix em um job
  agendado que roda sem supervisão e que esta sessão não tem como testar
  contra dados reais. Registrado aqui como item para a Wave 2, não corrigido
  às cegas.
- A divergência mais profunda — Cockpit (funil Financeiro) vs. Forecast
  Semanal/Mensal do Catálogo (funil Comercial em alguns pontos) representando
  possivelmente dois conceitos de negócio distintos (linha com o mapeamento
  Vendido/Faturado/Realizado/Recebido do pacote CPI) — permanece como decisão
  de modelagem de negócio em aberto, não uma correção de bug. Ver
  recomendação 6 do Agente 05.

## 3. Chaves de `localStorage` sem segregação por empresa — CORRIGIDO

**O que foi feito:** as 6 chaves identificadas pelo Agente 01
(`atlas-metas-desdobradas`, `atlas-layout-ordem`, `atlas-filtros-globais`,
`atlas-extrator-tema`, `atlas-extrator-auditoria-sync`, `atlas-extrator-chave-ia`)
agora recebem o mesmo sufixo por empresa (`sufixoStorage`, definido em
`MARCAS` em `js/config.js`) já usado pela chave do webhook. Para o tema
(lido antes de `config.js` carregar, em um script inline no `<head>` de cada
página), o sufixo é calculado diretamente a partir do atributo
`data-empresa` do `<html>`, que já está disponível nesse ponto.

**Efeito colateral esperado (não é uma regressão):** como a AtlasGR mantém
sufixo vazio (`""`, mesmo comportamento de antes) e a Total Trac passa a usar
uma chave nova (`__totaltrac`), qualquer preferência que já estivesse salva
no navegador de um usuário de Total Trac sob a chave antiga e compartilhada
(tema, filtros, metas desdobradas, ordem do layout, chave de IA, auditoria de
sync local) será lida como vazia uma única vez — a pessoa só precisa
reconfigurar essas preferências de UI (não é perda de dado de negócio, é
preferência local do navegador).

## Itens do diagnóstico da Wave 1 que permanecem em aberto (não são bugs pontuais)

Os demais achados dos agentes 01-05 — ausência de camada de staging/histórico
persistente, `MASTER_ENTITY_ID` não persistido, escrita no Bitrix sem controle
de acesso por papel, ausência de testes automatizados/reconciliação entre o
navegador e o script Node, ausência de owners de métrica, mapeamento
Vendido/Faturado/Realizado/Recebido, entre outros — são lacunas estruturais do
programa CPI, não bugs de produção, e foram propositalmente deixados para a
Wave 2 (Sprint 01/02), conforme o plano do Agente 00.
