# Gate de Integração — Sprint 02 → Sprint 03

Data: 2026-08-27  
Branch: `cpi-sprint02-integration`  
Base: `main` (`31c0b806943d2fa4d0af192fc9a141ba5f9cdbc2`)

## Objetivo

Validar em conjunto as entregas técnicas do Sprint 02 antes de qualquer integração em `main` e antes de iniciar o Executive Command Center como produto executivo.

Este documento não autoriza merge nem deploy. Ele registra o estado técnico verificável no GitHub e mantém explícitas as dependências que exigem dado real, ambiente alvo ou decisão humana.

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
- teste estático dedicado para estrutura e segurança da migração;
- workflow `Database Validation` executa a migração em **PostgreSQL 16 real isolado** e valida o comportamento em runtime.

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
- Faturado/Realizado/Recebido permanecem `absent_from_current_model`;
- validação de banco isolado é registrada separadamente de produção e de ingestão.

## Evidência de CI da integração

A branch foi construída incrementalmente e testada a cada bloco relevante:

| GitHub Actions run | Estado acumulado | Testes | Suítes | Falhas | Vulnerabilidades |
|---|---|---:|---:|---:|---:|
| `33086949741` | Forecast + segurança + Bitrix catalog | 82 | 26 | 0 | 0 |
| `33087142393` | + `MASTER_ENTITY_ID` | 100 | 32 | 0 | 0 |
| `33087305626` | + Bronze/Staging migration gate estático | 108 | 33 | 0 | 0 |
| `33087757057` | + camada semântica mínima | **119** | **34** | **0** | **0** |
| `33087902030` | Quality no contexto real da PR #16 → main | **119** | **34** | **0** | **0** |

No gate de qualidade consolidado:

- `npm ci` → sucesso;
- `npm audit --audit-level=high` → **0 vulnerabilities**;
- `npm test` → **119 pass / 0 fail / 0 skipped / 0 todo**.

## Validação real da migração em PostgreSQL 16

O workflow `.github/workflows/database-validation.yml` sobe um container descartável `postgres:16`, aplica a migração com `psql -v ON_ERROR_STOP=1` e executa provas comportamentais.

O run de pull request **`33088050969`** concluiu com sucesso em todos os passos:

1. inicialização do PostgreSQL 16;
2. aplicação de `001_staging_bronze.sql`;
3. confirmação das três tabelas do schema `intelligence`;
4. confirmação de RLS nas três tabelas;
5. confirmação de ausência de policy permissiva na base;
6. confirmação das views `staging_negocios_latest` e `staging_leads_latest`;
7. rejeição de portal inválido;
8. rejeição de URL em `extraido_via`;
9. rejeição de `staging_id` incompatível com `portal:bitrix_id`;
10. prova de que a view `latest` escolhe o snapshot mais recente;
11. prova de deny-by-default do RLS para um papel não-owner.

Portanto, a migração deixou de estar apenas “validada estaticamente”. Ela está **runtime-validada em PostgreSQL 16 isolado no GitHub Actions**.

Esta evidência não equivale a produção: nenhuma conexão com banco corporativo, PII real ou ingestão Bitrix foi utilizada.

## Falha intermediária tratada corretamente

Os runs `33087614680` e `33087684599` falharam depois da introdução do primeiro teste semântico. A causa não era fórmula nem produção: o regex do próprio teste aceitava IDs maiúsculos mas truncava sufixos oficiais minúsculos, como `FECHADO_MES-01a` e `FORECAST_TOTAL-01b`.

A correção mudou o parser do teste para capturar literalmente tokens alfanuméricos/underscore/hífen após `METRIC_ID:`. O gate seguinte passou integralmente. A falha intermediária é preservada como evidência de que o CI efetivamente bloqueia inconsistências em vez de apenas registrar sucesso.

## Resultado técnico atual

### PASSA no escopo verificável dentro do GitHub

- não há regressão conhecida na suíte atual;
- as duas divergências de forecast tratadas nesta wave estão corrigidas na branch;
- dependência com vulnerabilidade alta foi removida da branch;
- audit de alta severidade está bloqueante e verde;
- catálogo Bitrix tem limites de confiança explícitos;
- Bronze tem estrutura SQL testada estaticamente **e executada com sucesso em PostgreSQL 16 real isolado**;
- RLS deny-by-default, constraints e views foram comprovados em runtime;
- CORE inicial tem chave canônica e resolução de entidades;
- camada semântica mínima existe e não promove propostas a fatos;
- Quality também passou no evento `pull_request` da PR #16 para `main`;
- nenhuma credencial real foi necessária para os testes.

### NÃO PASSA ainda como liberação de produção/Sprint 03 executivo

1. **Banco alvo/produção não validado**: a migração passou em PostgreSQL 16 isolado, mas não foi aplicada a um banco corporativo escolhido.
2. **Ingestão real não implementada/validada**: o Bronze ainda não recebe snapshots reais do Bitrix por backend.
3. **Bitrix ao vivo não verificado nesta execução**: `live_api_verified=false` continua correto, inclusive para AtlasGR/Total Trac.
4. **Owners não ratificados**: o catálogo oficial continua declarando ausência de owner formal para as métricas.
5. **Thresholds pendentes**: coverage 2x/3x, aging crítico/alto de 45 dias e regra de pipeline necessário continuam decisões de negócio.
6. **Metodologia executiva ainda precisa escolha**: Forecast Total, Bucket e Coverage possuem variantes distintas que não devem ser fundidas automaticamente.
7. **Faturado/Realizado/Recebido ainda não existem no modelo**: o Executive Command Center deve omiti-los até modelagem real.

## Critério recomendado para próxima transição

O núcleo técnico que pode ser validado **somente dentro do GitHub** avançou mais um nível: schema, migration runtime, forecast, segurança, CORE e contrato semântico estão cobertos por gates automáticos.

Os próximos blockers se dividem em duas classes:

- **dados/ambiente corporativo**: banco alvo, ingestão Bronze e validação Bitrix ao vivo;
- **decisão humana de governança**: ratificar owners, thresholds e metodologia executiva.

Até lá, `data/semantic-contract.json` mantém `sprint_03_release_ready=false` por desenho.

## Segurança operacional

A branch de integração deve permanecer revisável. Não efetuar merge na `main` nem deploy automático como consequência deste gate sem autorização explícita, pois a `main` contém automações de produção e histórico de publicação.
