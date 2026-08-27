# Gate de Integração — Sprint 02 → Sprint 03

Data: 2026-08-27  
Branch: `cpi-sprint02-integration`  
Base: `main` (`31c0b806943d2fa4d0af192fc9a141ba5f9cdbc2`)

## Objetivo

Validar em conjunto as entregas técnicas do Sprint 02 antes de qualquer integração em `main` e antes de iniciar o Executive Command Center como produto executivo.

Este documento **não autoriza merge nem deploy**. Ele registra apenas fatos reproduzíveis e mantém separados: teste sintético, validação de runtime, fonte Bitrix real, ambiente corporativo e decisões humanas.

## Estado executivo do gate

### PASSA no escopo técnico verificável dentro do GitHub

- Forecast Node × navegador reconciliado nos casos tratados;
- regra de Entregue/Fechado Node alinhada ao Financeiro em `Contrato Assinado`;
- dependência de alta severidade tratada e `npm audit --audit-level=high` bloqueante;
- Bronze/Staging formalizado com migrations, views `latest`, RLS deny-by-default e quarentena sem payload bruto;
- migrations executadas em PostgreSQL 16 efêmero;
- ingestão Bronze sintética validada ponta a ponta e de forma idempotente;
- isolamento AtlasGR × Total Trac comprovado no PostgreSQL com IDs sintéticos iguais entre portais;
- `MASTER_ENTITY_ID` / entity resolution integrado;
- catálogo Bitrix e camada semântica versionados;
- adaptador Bitrix read-only preparado e testado com `fetch` simulado;
- live probe manual preparado com amostra limitada, `contents: read` e sem publicação de PII/secret.

### NÃO PASSA ainda para Sprint 03 executivo / produção

1. A PR #16 ainda está draft e a `main` não recebeu o pacote.
2. O Bitrix real ainda não foi lido pelo novo pipeline.
3. O repository secret `BITRIX_WEBHOOK_URL` está ausente no GitHub Actions, bloqueando a validação AtlasGR live.
4. Total Trac também precisa validação live separada antes de declarar cobertura dos dois portais.
5. Banco corporativo/produção ainda não foi validado.
6. Owners dos KPIs ainda não foram ratificados.
7. Thresholds executivos pendentes ainda não foram ratificados.
8. Forecast Total, Bucket e Coverage ainda possuem variantes que exigem escolha de governança.
9. Faturado, Realizado e Recebido continuam fora do modelo por ausência de fonte/modelagem real.

## Baseline técnico limpo

Commit validado: `183796ccd35091b91ec1f790c2b915e45e4899bf`.

| Gate | Run | Resultado |
|---|---:|---|
| Quality | `33097450924` | **success — 163 testes, 40 suítes, 163 pass, 0 fail, 0 vulnerabilities** |
| Bronze Ingestion Validation | `33097450932` | **success** |
| Database Validation | `33097450916` | **success** |

O Bronze E2E atual executa AtlasGR e Total Trac com envelopes sintéticos, aplica as cargas duas vezes e valida simultaneamente idempotência e isolamento de tenant/portal.

## Tentativa autorizada de Bitrix live

Em 27/08/2026 foi autorizada uma leitura real controlada do AtlasGR.

Evidência:

- Quality run `33097111260`;
- job `98604794509` (`bitrix-live-probe-atlasgr`);
- falha na etapa `Verify authorized read-only mode and secret`;
- `BITRIX_WEBHOOK_URL` chegou vazio ao runtime.

A trava encerrou o job **antes de qualquer chamada externa**. Não houve checkout, migrations, chamada ao Bitrix, payload real nem carga Bronze live.

Interpretação correta:

- não é falha da API Bitrix;
- não valida o Bitrix ao vivo;
- comprova que o secret necessário não está configurado/disponível no GitHub Actions;
- `bitrix_live_verified=false` continua correto;
- `bronze_live_source_ingestion_validated=false` continua correto.

Documento detalhado: `09_BITRIX_LIVE_PROBE_TENTATIVA_AUTORIZADA.md`.

## Workflow definitivo de live probe

`.github/workflows/bitrix-bronze-live-probe.yml` permanece exclusivamente manual (`workflow_dispatch`).

Controles:

- portal `atlasgr` ou `totaltrac`;
- amostra máxima 50/100/250 registros por entidade;
- confirmação textual `READ_ONLY_LIVE_PROBE`;
- `contents: read`;
- PostgreSQL 16 efêmero;
- SQL/manifesto em `$RUNNER_TEMP` via `GITHUB_ENV`;
- sem upload de artifacts;
- sem `git push`;
- sem publicação de webhook, SQL ou payload bruto.

## Próxima transição técnica

Para AtlasGR, o blocker imediato é cadastrar um webhook atual e legítimo diretamente como GitHub Actions repository secret:

`BITRIX_WEBHOOK_URL`

Depois disso, executar o workflow manual inicialmente com `max_records=100`.

Para Total Trac, usar separadamente:

`BITRIX_TOTALTRAC_WEBHOOK_URL`

O webhook antigo removido do repositório não deve ser recuperado nem reutilizado.

## Governança ainda pendente

Mesmo após validar Bitrix live, o Sprint 03 executivo continua bloqueado até:

- ratificação dos owners dos KPIs;
- decisão sobre thresholds 2x/3x e aging de 45 dias;
- escolha das variantes executivas de Forecast Total, Bucket e Coverage;
- decisão explícita de manter Faturado/Realizado/Recebido fora do escopo ou modelá-los com fonte real.

## Critério de liberação

O Sprint 03 somente fica `release_ready` quando o pacote estiver integrado conforme autorização, CI final verde, fonte Bitrix real validada para os portais necessários, owners/thresholds/metodologias ratificados e sem regressão crítica ou dado fictício apresentado como real.

## Segurança operacional

A PR #16 deve permanecer revisável. Não efetuar merge na `main` nem deploy como consequência deste gate sem autorização explícita.
