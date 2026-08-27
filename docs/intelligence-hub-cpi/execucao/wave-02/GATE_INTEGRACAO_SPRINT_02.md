# Gate de Integração — Sprint 02 → Sprint 03

Data: 2026-08-27  
Branch: `cpi-sprint02-integration`  
Base: `main` (`31c0b806943d2fa4d0af192fc9a141ba5f9cdbc2`)

## Objetivo

Validar em conjunto as entregas técnicas do Sprint 02 antes de qualquer integração em `main` e antes de iniciar o Executive Command Center como produto executivo.

Este documento não autoriza merge nem deploy. Ele registra o estado técnico verificável no GitHub e mantém explícitas as dependências que exigem ambiente/dado real ou decisão humana.

## Componentes integrados na branch

### Forecast e cálculo

- reconciliação da semântica Node × navegador quando `STAGE_SEMANTIC_ID` está vazio;
- Entregue/Fechado do forecast Node alinhado ao Financeiro em `Contrato Assinado`, com `MOVED_TIME` e fallback `DATE_CREATE`;
- pipeline projetado continua baseado no Comercial e preserva regras existentes de piloto/probabilidade.

### Segurança e CI

- Nodemailer atualizado para `9.0.5`;
- `npm audit --audit-level=high` é bloqueante no workflow `Quality`;
- `npm test` é bloqueante;
- workflow tem somente `contents: read`;
- nenhuma credencial/webhook foi adicionada.

### Data Foundation

- contrato Bronze/Staging já existente em `js/staging-schema.js` permanece como base;
- migração `db/migrations/001_staging_bronze.sql` integrada;
- RLS habilitado e fechado por padrão, sem policies permissivas na migração-base;
- chave `staging_id = portal:bitrix_id`;
- views `latest` determinísticas;
- teste estático dedicado para estrutura e segurança da migração.

### Bitrix Discovery

- `data/bitrix-capabilities.json` integrado;
- métodos/entidades/PII/relacionamentos versionados;
- `live_api_verified=false` preservado;
- teste detecta drift estático entre `js/config.js` e catálogo.

### CORE / Entity Resolution

- `js/entity-resolution.js` integrado exatamente a partir do trabalho já validado na PR #9;
- `MASTER_ENTITY_ID` formalizado;
- hierarquia de resolução e níveis de confiança testados;
- revisão manual obrigatória para baixa confiança/ambiguidade.

### Camada Semântica mínima

- `data/semantic-contract.json`;
- candidatos executivos referenciam somente `METRIC_ID`s existentes no catálogo oficial;
- owners continuam `proposed`, nunca falsamente `ratified`;
- thresholds não ratificados bloqueiam elegibilidade executiva;
- métricas Bitrix continuam não verificadas ao vivo;
- variantes de Forecast/Bucket/Coverage permanecem separadas;
- Faturado/Realizado/Recebido permanecem `absent_from_current_model`.

## Evidência de CI da integração

A branch foi construída incrementalmente e testada a cada bloco relevante:

| GitHub Actions run | Estado acumulado | Testes | Suítes | Falhas | Vulnerabilidades |
|---|---|---:|---:|---:|---:|
| `33086949741` | Forecast + segurança + Bitrix catalog | 82 | 26 | 0 | 0 |
| `33087142393` | + `MASTER_ENTITY_ID` | 100 | 32 | 0 | 0 |
| `33087305626` | + Bronze/Staging migration gate | 108 | 33 | 0 | 0 |
| `33087757057` | + camada semântica mínima | **119** | **34** | **0** | **0** |

No run final `33087757057`:

- `npm ci` → sucesso;
- `npm audit --audit-level=high` → **0 vulnerabilities**;
- `npm test` → **119 pass / 0 fail / 0 skipped / 0 todo**.

## Falha intermediária tratada corretamente

Os runs `33087614680` e `33087684599` falharam depois da introdução do primeiro teste semântico. A causa não era fórmula nem produção: o regex do próprio teste aceitava IDs maiúsculos mas truncava sufixos oficiais minúsculos, como `FECHADO_MES-01a` e `FORECAST_TOTAL-01b`.

A correção mudou o parser do teste para capturar literalmente tokens alfanuméricos/underscore/hífen após `METRIC_ID:`. O gate seguinte (`33087757057`) passou integralmente. A falha intermediária é preservada como evidência de que o CI efetivamente bloqueia inconsistências em vez de apenas registrar sucesso.

## Resultado técnico atual

### PASSA no escopo estático/GitHub

- não há regressão conhecida na suíte atual;
- as duas divergências de forecast tratadas nesta wave estão corrigidas na branch;
- dependência com vulnerabilidade alta foi removida da branch;
- audit de alta severidade está bloqueante e verde;
- catálogo Bitrix tem limites de confiança explícitos;
- Bronze tem estrutura SQL testada estaticamente;
- CORE inicial tem chave canônica e resolução de entidades;
- camada semântica mínima existe e não promove propostas a fatos;
- nenhuma credencial real foi necessária para os testes.

### NÃO PASSA ainda como liberação de produção/Sprint 03 executivo

1. **Banco real não validado**: a migração PostgreSQL ainda não foi executada em ambiente isolado. Constraints, RLS e views foram verificadas estaticamente, não por engine PostgreSQL real.
2. **Ingestão real não implementada/validada**: o Bronze ainda não recebe snapshots reais do Bitrix por backend.
3. **Bitrix ao vivo não verificado nesta execução**: `live_api_verified=false` continua correto, inclusive para AtlasGR/Total Trac.
4. **Owners não ratificados**: o catálogo oficial continua declarando ausência de owner formal para as métricas.
5. **Thresholds pendentes**: coverage 2x/3x, aging crítico/alto de 45 dias e regra de pipeline necessário continuam decisões de negócio.
6. **Metodologia executiva ainda precisa escolha**: Forecast Total, Bucket e Coverage possuem variantes distintas que não devem ser fundidas automaticamente.
7. **Faturado/Realizado/Recebido ainda não existem no modelo**: o Executive Command Center deve omiti-los até modelagem real.

## Critério recomendado para próxima transição

Tecnicamente, o trabalho que pode ser feito **somente dentro do GitHub** para o núcleo do Sprint 02 está consolidado e coberto por CI. O próximo nível de evidência exige uma destas duas classes de ação:

- **ambiente real autorizado**: validar PostgreSQL e/ou Bitrix ao vivo;
- **decisão humana de governança**: ratificar owners, thresholds e metodologia executiva.

Até lá, `data/semantic-contract.json` mantém `sprint_03_release_ready=false` por desenho.

## Segurança operacional

A branch de integração deve permanecer revisável. Não efetuar merge na `main` nem deploy automático como consequência deste gate sem autorização explícita, pois a `main` contém automações de produção e histórico de publicação.
