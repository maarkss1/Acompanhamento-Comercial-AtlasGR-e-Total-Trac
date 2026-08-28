# Gate — Forecast Node: Fechado/Entregue Financeiro

## Contexto

O e-mail semanal automatizado em `scripts/forecast-semanal.mjs` calculava `fechadoSemana` e `fechadoMes` a partir de negócios do funil Comercial classificados como `success`, usando `CLOSEDATE` como referência de período.

Essa regra divergia da base já usada pelo Cockpit e pelo relatório visual do Forecast, onde o indicador de entregue/fechado considera negócios dos funis Financeiro na etapa equivalente a **Contrato Assinado**, com **MOVED_TIME** como data principal e **DATE_CREATE** apenas como fallback.

## Correção implementada

A branch `fix/forecast-node-fechado-financeiro` passa a:

1. descobrir dinamicamente as categorias cujo nome contém `Financeiro` via `crm.category.list`;
2. usar `CATEGORY_ID=20` como fallback conhecido da AtlasGR somente quando a descoberta dinâmica falhar ou não retornar categoria correspondente;
3. carregar os metadados de estágio das categorias Financeiro;
4. identificar como fechado apenas o estágio `Contrato Assinado` ou equivalente semântico de sucesso cujo label contenha `assin`;
5. usar `MOVED_TIME` como data de fechamento para a janela semanal/mensal e `DATE_CREATE` apenas como fallback;
6. manter o pipeline aberto/projetado baseado no funil Comercial, sem alterar a lógica de probabilidade e sem incluir estágios Piloto;
7. atualizar a nota explicativa do relatório para deixar explícita a diferença entre `Entregue` e pipeline projetado.

## Testes adicionados

Arquivo: `tests/forecast-financeiro-node.test.mjs`.

Cobertura específica:

- descoberta de funis `Financeiro` e `Financeiro (Reembolsos)`;
- compatibilidade com formatos `id/name` e `ID/NAME`;
- `Contrato Assinado` conta como entregue mesmo sem `STAGE_SEMANTIC_ID` no negócio quando a metadata do estágio traz a semântica;
- `Negócios Ganhos` do Comercial não é aceito pela regra Financeiro apenas por ser `success`;
- etapas abertas como `Aguardando Assinatura` não contam como fechado;
- `MOVED_TIME` tem prioridade sobre `DATE_CREATE`;
- soma mensal e semanal respeitam limites inclusivos do período;
- ausência de negócios retorna zero, sem fabricar valor.

## Evidência de validação

GitHub Actions run `33084738037` concluiu com sucesso após aplicar a alteração e executar a suíte completa.

Resultado observado no gate:

- 23 suítes;
- 71 testes;
- 71 aprovados;
- 0 falhas;
- 0 ignorados.

O workflow temporário usado apenas para aplicar/validar o patch foi removido da branch após o gate. O diff final contra `fix/forecast-node-semantics` contém somente:

- `scripts/forecast-semanal.mjs`;
- `tests/forecast-financeiro-node.test.mjs`;
- este documento de evidência.

## Segurança e dados

Nenhum webhook real, segredo, SMTP real ou dado de cliente foi usado nos testes desta alteração. Os testes usam fixtures fictícias e extraem funções puras do arquivo de produção sem executar `main()`.

## Dependência entre PRs

Esta alteração depende da correção de semântica de estágio preparada na branch `fix/forecast-node-semantics` / PR #13. Por isso a PR desta correção deve ter `fix/forecast-node-semantics` como base enquanto o PR #13 não estiver mergeado.

## Gate do Sprint 2

Este item fecha a divergência catalogada como `FECHADO_MES-01d` no Catálogo Oficial de Métricas: o e-mail semanal deixa de usar a fórmula antiga de Comercial + `CLOSEDATE` para o valor entregue.

Ainda não autoriza, sozinho, a passagem ao Sprint 3. Os blockers remanescentes devem ser avaliados separadamente no gate consolidado do Sprint 2.
