# Wave 2 — Camada Semântica Mínima do Sprint 02

Data: 2026-08-27  
Branch de integração: `cpi-sprint02-integration`

## Objetivo

Transformar o catálogo oficial de métricas e as entidades canônicas já implementadas em um contrato semântico mínimo, legível por máquina e testável, sem inventar indicadores, owners, thresholds ou validação de dados que ainda não existem.

O artefato central é `data/semantic-contract.json`, protegido por `tests/semantic-contract.test.mjs`.

## O que esta camada resolve

O Sprint 02 exige “entidades canônicas e camada semântica única”. Antes deste artefato, o projeto já possuía:

- contrato Bronze/Staging para Negócios e Leads;
- migração SQL preparada para a camada `intelligence`;
- `MASTER_ENTITY_ID` e regras de entity resolution;
- catálogo oficial humano com 26 variantes de métricas;
- catálogo Bitrix legível por máquina.

A lacuna era a ausência de um contrato que dissesse, de forma automatizável:

- quais entidades são CORE, Staging, metadata ou apenas fonte;
- quais métricas são candidatas a uso executivo;
- quais variantes metodológicas não podem ser fundidas silenciosamente;
- quais dependências de governança impedem um KPI de ser tratado como oficial;
- quais conceitos ainda não existem no modelo de dados.

## Entidades formalizadas

O contrato registra nove tipos semânticos:

1. `master_entity` — CORE, chave `master_entity_id`, implementada em `js/entity-resolution.js`;
2. `deal` — Staging, `staging_id`, destino projetado `intelligence.staging_negocios`;
3. `lead` — Staging, `staging_id`, destino projetado `intelligence.staging_leads`;
4. `company` — leitura suportada, ainda sem persistência canônica própria;
5. `contact` — leitura suportada, ainda sem persistência canônica própria;
6. `activity` — leitura suportada, ainda sem persistência canônica própria;
7. `user` — leitura suportada, ainda sem persistência canônica própria;
8. `pipeline_stage` — metadata semântica descoberta via `crm.category.list` + `crm.status.list`;
9. `product_row` — fonte de apoio por negócio, ainda com padrão N+1 e sem dimensão canônica persistida.

Isso não declara que todo domínio corporativo está concluído. O contrato diferencia explicitamente `implemented_in_code_not_persisted`, `schema_and_migration_defined_not_runtime_validated` e `read_supported_not_canonical_persisted`.

## KPIs executivos candidatos

A primeira versão inclui somente `METRIC_ID`s que já existem no catálogo oficial:

- `META_MENSAL-01`;
- `FECHADO_MES-01a`;
- `FORECAST_TOTAL-01a`;
- `FORECAST_TOTAL-01b`;
- `PIPELINE_TOTAL-01`;
- `PIPELINE_ELEGIVEL-01`;
- `COVERAGE-01a`;
- `WIN_RATE-01a`;
- `AGING-01`.

Nenhuma fórmula nova foi criada neste contrato. O JSON referencia o `METRIC_ID` oficial e adiciona apenas metadados de governança necessários ao gate.

## Regra de elegibilidade executiva

Neste momento, **todos os candidatos estão `executive_eligible=false`**.

Isso é proposital e coerente com o CPI:

- o catálogo oficial declara que nenhum KPI possui owner formal ratificado;
- os KPIs apoiados no Bitrix ainda não tiveram sua fonte validada ao vivo nesta execução;
- alguns indicadores dependem de thresholds que o próprio código/documentação marca como pendentes de decisão.

A camada semântica não transforma proposta em fato apenas para liberar o dashboard.

## Thresholds pendentes preservados

O contrato bloqueia a elegibilidade executiva quando o indicador depende diretamente das decisões ainda abertas:

- Pipeline Elegível: aging crítico de 45 dias;
- Coverage: faixas 2x / 3x;
- Aging usado como alerta executivo: corte de 45 dias.

Esses valores continuam registrados porque já existem no código/catalogação, mas recebem `threshold_status=pending_business_decision`.

## Variantes que não podem ser colapsadas silenciosamente

O contrato preserva explicitamente três grupos de metodologias:

### Forecast Bucket

- `BUCKET_FORECAST-01a`: 80/50, sem Upside;
- `BUCKET_FORECAST-01b`: 70/40/10 + Upside.

### Forecast Total

- `FORECAST_TOTAL-01a`: metodologia Cockpit;
- `FORECAST_TOTAL-01b`: pipeline aberto todo ponderado.

### Coverage

- `COVERAGE-01a`;
- `COVERAGE-01b`;
- `COVERAGE-01c`.

Elas possuem denominadores/metodologias diferentes. O contrato impede que uma futura UI trate esses IDs como um único número sem decisão explícita.

## Conceitos explicitamente fora do modelo

O catálogo oficial já havia concluído que, hoje, não existe mapeamento real para:

- Faturado;
- Realizado;
- Recebido.

O contrato semântico registra esses conceitos como `absent_from_current_model`. Portanto, o Executive Command Center não deve exibir cards desses conceitos com `0`, `N/A` mascarado como fato ou qualquer estimativa improvisada.

## Teste automatizado

`tests/semantic-contract.test.mjs` valida:

- versão e Sprint do contrato;
- unicidade das entidades;
- existência do CORE `master_entity`;
- todo KPI candidato precisa existir como `METRIC_ID` no catálogo oficial;
- nenhum owner pode ser promovido a ratificado enquanto o documento oficial disser que não há owner formal;
- threshold pendente bloqueia elegibilidade executiva;
- métricas Bitrix não podem ser marcadas como live-verified enquanto `data/bitrix-capabilities.json` estiver com `live_api_verified=false`;
- variantes metodológicas permanecem separadas;
- Faturado/Realizado/Recebido não podem aparecer como KPIs inventados;
- o gate do Sprint 03 continua fechado enquanto DB, Bitrix, owners e thresholds estiverem pendentes;
- nenhum webhook literal pode aparecer no contrato.

## Estado do gate após esta entrega

### Implementado no GitHub

- Bronze/Staging: schema JS + migração SQL + teste estático;
- CORE inicial: `MASTER_ENTITY_ID` + confiança + revisão manual;
- Semântica mínima: contrato de entidades + KPIs candidatos + governança;
- Bitrix capability catalog;
- reconciliação de forecast Node/navegador;
- correção do Entregue Financeiro no Node;
- upgrade Nodemailer 9.0.5;
- quality gate com `npm audit --audit-level=high` e `npm test` bloqueantes.

### Ainda não pode ser declarado concluído

- execução real da migração PostgreSQL em banco isolado;
- ingestão real Bronze;
- validação Bitrix ao vivo AtlasGR e Total Trac;
- ratificação de owners;
- ratificação/remoção dos thresholds pendentes;
- decisão executiva sobre qual metodologia de Forecast Total/Coverage será usada no Command Center.

## Princípio de segurança adotado

Esta camada é um **contrato de verdade e de incerteza**. Ela não tenta deixar o sistema artificialmente “verde” removendo pendências. O papel do contrato é garantir que uma tela executiva só ganhe um indicador como oficial quando a origem, fórmula e governança suportarem essa afirmação.
