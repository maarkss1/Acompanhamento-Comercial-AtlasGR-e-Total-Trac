# Gate de Integração — Sprint 02 → Sprint 03

Data: 2026-08-27  
Branch: `cpi-sprint02-integration`  
Base: `main` (`31c0b806943d2fa4d0af192fc9a141ba5f9cdbc2`)

## Objetivo

Validar em conjunto as entregas técnicas do Sprint 02 antes de qualquer integração em `main` e antes de iniciar o Executive Command Center como produto executivo.

Este documento **não autoriza merge nem deploy**. Ele registra apenas fatos reproduzíveis e mantém separados: teste sintético, validação de runtime, ambiente corporativo e decisões humanas.

## Componentes integrados

### Forecast e cálculo

- reconciliação Node × navegador quando `STAGE_SEMANTIC_ID` está vazio;
- Entregue/Fechado Node alinhado ao Financeiro em `Contrato Assinado`, usando `MOVED_TIME` e fallback `DATE_CREATE`;
- pipeline projetado continua baseado no Comercial, preservando regras existentes de piloto/probabilidade.

### Segurança e CI

- Nodemailer `9.0.5`;
- `npm audit --audit-level=high` bloqueante;
- `npm test` bloqueante;
- workflows com `contents: read`;
- nenhum webhook/secret adicionado.

### Data Foundation / Bronze

- `js/staging-schema.js` como contrato canônico de transformação;
- `db/migrations/001_staging_bronze.sql` para runs, snapshots, índices e views `latest`;
- `db/migrations/002_bronze_ingestion_audit.sql` para quarentena auditável;
- RLS deny-by-default, sem policy permissiva na base;
- chave `staging_id = portal:bitrix_id`;
- `scripts/bronze-ingest.mjs` para preparação e geração transacional de ingestão;
- reexecução idempotente para a mesma extração;
- rejeições guardam motivos + fingerprint SHA-256, **sem payload bruto**;
- workflow `Database Validation` executa as migrations em PostgreSQL 16 real e isolado;
- workflow `Bronze Ingestion Validation` executa o fluxo sintético ponta a ponta.

### Bitrix Discovery

- `data/bitrix-capabilities.json` integrado;
- métodos/entidades/PII/relacionamentos versionados;
- `live_api_verified=false` preservado;
- teste detecta drift estático entre `js/config.js` e catálogo.

### CORE / Entity Resolution

- `js/entity-resolution.js` integrado a partir do trabalho validado na PR #9;
- `MASTER_ENTITY_ID` formalizado;
- hierarquia de resolução e níveis de confiança testados;
- revisão manual obrigatória para baixa confiança/ambiguidade.

### Camada Semântica e Governança

- `data/semantic-contract.json`;
- `data/governance-decisions.json`;
- candidatos executivos referenciam somente `METRIC_ID`s existentes no catálogo oficial;
- owners continuam `proposed`;
- thresholds não ratificados bloqueiam elegibilidade executiva;
- variantes de Forecast/Bucket/Coverage permanecem separadas;
- Faturado/Realizado/Recebido permanecem `absent_from_current_model`;
- banco isolado, ingestão sintética, produção e Bitrix real possuem flags separadas.

## Evidência acumulada de CI

| GitHub Actions run | Estado acumulado | Testes | Suítes | Falhas | Vulnerabilidades |
|---|---|---:|---:|---:|---:|
| `33086949741` | Forecast + segurança + Bitrix catalog | 82 | 26 | 0 | 0 |
| `33087142393` | + `MASTER_ENTITY_ID` | 100 | 32 | 0 | 0 |
| `33087305626` | + Bronze/Staging gate estático | 108 | 33 | 0 | 0 |
| `33087757057` | + camada semântica mínima | 119 | 34 | 0 | 0 |
| `33088751476` | + governança formalizada | 129 | 35 | 0 | 0 |
| `33089662008` | + pipeline/quarentena Bronze | **137** | **36** | **0** | **0** |

Último Quality confirmado, run **`33089662008`**:

- `npm ci`: sucesso;
- `npm audit --audit-level=high`: **0 vulnerabilities**;
- `npm test`: **137 pass / 0 fail / 0 skipped / 0 todo**.

## PostgreSQL 16 — migrations validadas em runtime

O workflow `.github/workflows/database-validation.yml` usa um `postgres:16` descartável.

Último run confirmado: **`33089662033`**, resultado **success**.

Provas executadas:

1. todas as migrations `db/migrations/*.sql` aplicadas em ordem;
2. quatro tabelas esperadas no schema `intelligence`;
3. RLS habilitado em todas;
4. nenhuma policy permissiva criada pela base;
5. views `staging_negocios_latest` e `staging_leads_latest` presentes;
6. constraints de portal, webhook/URL e business key funcionando;
7. quarentena `ingestion_rejections` operante;
8. deny-by-default comprovado também para a quarentena.

Isso comprova **compatibilidade/runtime em PostgreSQL 16 isolado**. Não equivale a banco corporativo/produção.

## Bronze Ingestion — validação E2E sintética

Workflow `.github/workflows/bronze-ingestion-validation.yml`.

Run confirmado: **`33089661965`**, resultado **success**.

Fluxo exercitado:

`envelope Bitrix sintético → jornada.js/staging-schema.js → bronze-ingest.mjs → SQL → PostgreSQL 16 → snapshots + quarentena → views latest`

O mesmo SQL foi executado **duas vezes**, comprovando idempotência para a mesma extração.

Resultado validado:

| Medida | Resultado |
|---|---:|
| Registros lidos | 4 |
| Válidos | 2 |
| Inválidos | 2 |
| Runs | 2 |
| Runs parciais | 2 |
| Snapshot negócio válido | 1 |
| Snapshot lead válido | 1 |
| Rejeições auditadas | 2 |
| Duplicações após reexecução | 0 |

A quarentena não contém coluna de payload bruto e exige fingerprint SHA-256 válido.

Documento detalhado: `07_BRONZE_INGESTION_E2E.md`.

## Resultado técnico atual

### PASSA no escopo verificável dentro do GitHub

- suíte atual sem regressão conhecida;
- divergências de forecast tratadas nesta wave corrigidas;
- dependência de alta severidade removida;
- audit de alta severidade bloqueante e verde;
- catálogo Bitrix com limites de confiança explícitos;
- migrations executadas em PostgreSQL 16 real isolado;
- RLS, constraints, views e quarentena comprovados em runtime;
- pipeline Bronze sintético comprovado ponta a ponta;
- reexecução idempotente comprovada;
- rejeições não são descartadas silenciosamente;
- quarentena não persiste payload bruto;
- CORE inicial com chave canônica e resolução de entidades;
- camada semântica e contrato de decisões formalizados;
- nenhuma credencial real necessária para esses testes.

### NÃO PASSA ainda como liberação de produção/Sprint 03 executivo

1. **Banco corporativo/produção não validado**: PostgreSQL 16 isolado passou, mas nenhum banco alvo recebeu a estrutura.
2. **Ingestão Bitrix real não validada**: o pipeline está funcional com envelope sintético, mas ainda não foi alimentado por AtlasGR ou Total Trac ao vivo.
3. **Bitrix ao vivo não verificado**: `live_api_verified=false` continua correto.
4. **Owners não ratificados**: o catálogo ainda não possui owner formal para os KPIs.
5. **Thresholds pendentes**: coverage 2x/3x, aging de 45 dias e regra de pipeline necessário continuam decisões humanas.
6. **Metodologia executiva pendente**: Forecast Total, Bucket e Coverage possuem variantes que precisam de escolha explícita.
7. **Faturado/Realizado/Recebido não modelados**: devem continuar omitidos do Command Center.

## Estado do contrato semântico

O contrato agora registra, separadamente:

- `runtime_database_validated=true`;
- `runtime_database_validation_scope=isolated_postgresql_16_github_actions`;
- `production_database_validated=false`;
- `bronze_ingestion_pipeline_validated=true`;
- `bronze_ingestion_validation_scope=synthetic_bitrix_envelope_to_postgresql16_github_actions`;
- `bronze_live_source_ingestion_validated=false`;
- `bitrix_live_verified=false`;
- `sprint_03_release_ready=false`.

## Próxima transição

O **pipeline Bronze em si deixou de ser o blocker principal**. O próximo passo técnico exige conectar uma fonte Bitrix real autorizada ao envelope já validado, sem versionar segredo ou PII e mantendo leitura controlada.

Em paralelo, as decisões humanas de owners, thresholds e metodologia executiva continuam independentes do trabalho técnico.

## Segurança operacional

A branch e a PR #16 devem permanecer revisáveis. Não efetuar merge na `main` nem deploy como consequência deste gate sem autorização explícita.
