# AGENTS.md — Governança Multiagente do Acompanhamento Comercial

## Projeto
Acompanhamento-Comercial-AtlasGR-e-Total-Trac

Portal de BI Comercial sobre Bitrix24 para AtlasGR e Total Trac. O projeto combina HTML/CSS/JS clássico, migração incremental para TypeScript, extrações Bitrix, camada bronze, métricas comerciais, conciliação comercial-financeira, forecast e automação de envio por e-mail.

## Roster oficial
- 00 — Coordenador e Governança
- 01 — Bitrix, Extração e Camada Bronze
- 02 — Métricas Comerciais, BI e Data Trust
- 03 — Forecast, Pipeline e Revenue Intelligence
- 04 — Financeiro, Faturamento e Conciliação
- 05 — Produto, UX, Relatórios e Multi-marca
- 06 — Segurança, Autenticação e Governança de Escrita
- 07 — Automações, E-mail, Exportações e Jobs
- 08 — QA, TypeScript, Build e Release

Prompts: `.agents/prompts/`.

## Regras globais
1. A fonte da verdade operacional é o Bitrix24; não fabricar métricas nem preencher lacunas com estimativas silenciosas.
2. Toda métrica precisa declarar população, período, timezone, denominador e regra de status quando isso afetar o resultado.
3. Escrita no Bitrix deve ser fail-closed e respeitar `usuarioAtual().podeEscrever`; nunca transformar proteção de UI em falsa alegação de segurança do webhook.
4. Arquivos `ts/*.ts` geram `js/*.js` correspondentes. Não editar JS gerado diretamente.
5. Migração TypeScript é incremental e deve preservar comportamento antes de tipar/refatorar.
6. Nunca versionar webhook, token, senha, e-mail real de cliente, dados pessoais ou exportação nominal.
7. Alterações em fórmulas comerciais exigem testes matemáticos e casos de borda.
8. Alterações em integração Bitrix exigem paginação, rate-limit, retry seguro e proteção contra duplicidade.
9. Antes de concluir: `npm test`, `npm run build` e `npm run verify-build` quando aplicáveis.
10. Agentes não editam prompts de outros agentes durante uma missão. Cruzamentos são resolvidos por handoff.

## Propriedade
- 01: `js/bitrix-api.js`, extratores, `scripts/bitrix-*`, `scripts/bronze-*`, normalização e ingestão.
- 02: Data Trust, entity resolution, catálogo de indicadores e fórmulas de BI.
- 03: cockpit, pipeline, forecast, Win Rate, ciclo, aging, metas e previsibilidade.
- 04: faturamento, financeiro, vendido x faturado/realizado, conciliações e regras financeiras.
- 05: navegação, HTML/CSS, catálogo de relatórios, acessibilidade, AtlasGR/Total Trac e experiência executiva.
- 06: `js/auth.js`, permissões, armazenamento de credenciais/config sensível, controles de escrita e hardening client-side.
- 07: `scripts/forecast-semanal.mjs`, Nodemailer, exportações, agendamentos e artefatos de saída.
- 08: `tests/**`, CI, tsconfig, build gerado, regressão, smoke e critérios de release.

## Arquivos compartilhados
`package.json`, lockfile, `js/config.js`, `ts/config.ts` e arquivos HTML centrais têm dono único por missão. Quem precisar alterar fora do próprio domínio deve registrar handoff.

## Handoffs
Formato: `.agents/handoffs/<de>-para-<para>-<slug>.md` com problema, evidência, arquivos, alteração necessária, teste esperado e prioridade.

## Critério de release
Nenhum agente declara release por conta própria. O 08 emite PASS/BLOCKED com evidência, e o 00 consolida o veredito.