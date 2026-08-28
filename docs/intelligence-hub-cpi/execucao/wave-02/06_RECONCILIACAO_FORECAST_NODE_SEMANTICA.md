# Wave 2 — Reconciliação de semântica do Forecast Node × navegador

Data: 2026-08-27

## Problema

A suíte inicial de QA registrava uma divergência real entre `js/jornada.js` e `scripts/forecast-semanal.mjs`.

Quando `STAGE_SEMANTIC_ID` vinha preenchido no negócio, os dois caminhos concordavam. Quando vinha vazio, o navegador ainda consultava `metaStage.semantics`, enquanto o script Node classificava o registro como `process` independentemente da semântica real do estágio.

O efeito potencial atingia o forecast semanal automatizado: um negócio em estágio semanticamente ganho/perdido podia ser tratado como pipeline aberto se o campo no registro estivesse vazio.

## Correção

O script Node agora:

1. busca `crm.status.list` como antes;
2. preserva, por `STATUS_ID`, tanto o `label` quanto `EXTRA.SEMANTICS`/`SEMANTICS` quando disponível;
3. usa a função pura `classificarSemanticaForecastSemanal(d, metaStage)`;
4. prioriza `d.STAGE_SEMANTIC_ID` e usa `metaStage.semantics` como fallback;
5. mantém `process` apenas quando nenhuma das duas fontes informa ganho/perda.

A regra passa a espelhar `semanticaDeal()` do navegador.

## Testes

`tests/reconciliacao-forecast.test.mjs` deixou de aceitar a divergência como comportamento esperado.

A suíte agora exige paridade nos cenários:

- semantic ID presente no negócio;
- semantic ID ausente + estágio semanticamente ganho;
- semantic ID ausente + estágio semanticamente perdido;
- nenhuma semântica disponível, mantendo `process`.

O GitHub Actions run `33083842467` aplicou o patch em ambiente limpo e executou a suíte completa com sucesso antes de gerar o commit.

## Escopo e segurança

- nenhuma API Bitrix real foi chamada nesta validação;
- nenhum webhook/secret foi lido;
- nenhum dado real de cliente foi usado nos testes;
- a chamada `crm.status.list` já existia no script, portanto não foi adicionada nova chamada de rede por negócio;
- apenas a estrutura do retorno em memória passou de `STATUS_ID -> label` para `STATUS_ID -> {label, semantics}`.

## Gate

**Fechado:** divergência Node × navegador de classificação semântica quando `STAGE_SEMANTIC_ID` está ausente.

**Ainda não fechado pelo Sprint 2:** existem outras divergências de definição de forecast documentadas, principalmente thresholds de buckets Cockpit × Forecast Semanal/Catálogo. Elas não devem ser alteradas automaticamente sem primeiro decidir se representam métricas distintas ou uma mesma métrica com fórmulas conflitantes.
