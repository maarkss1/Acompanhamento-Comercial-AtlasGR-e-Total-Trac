# Wave 2 — Bronze Ingestion E2E

Data: 2026-08-27  
Branch: `cpi-sprint02-integration`  
PR de integração: `#16`

## Objetivo

Fechar a lacuna entre o contrato Bronze/Staging e uma ingestão executável, sem usar credenciais, dados corporativos ou payloads reais do Bitrix.

A validação desta entrega é deliberadamente dividida em duas afirmações diferentes:

1. **pipeline de ingestão sintético validado**: sim;
2. **ingestão a partir do Bitrix real / produção validada**: não.

Essa separação evita transformar um teste técnico forte em uma alegação indevida sobre ambiente corporativo.

## Artefatos entregues

### `scripts/bronze-ingest.mjs`

Pipeline reproduzível que:

- carrega `js/jornada.js` e `js/staging-schema.js` em `node:vm`;
- reutiliza os transformadores canônicos existentes em vez de duplicar regras;
- mantém `fetch` desabilitado no runtime de transformação;
- valida `portal`, `extraido_em` e `extraido_via`;
- rejeita URL/token de webhook em `extraido_via`;
- separa registros válidos e inválidos;
- produz auditoria de `ingestion_runs`;
- gera SQL transacional;
- suporta reexecução idempotente;
- gera manifesto de contagem sem PII.

### `db/migrations/002_bronze_ingestion_audit.sql`

Cria `intelligence.ingestion_rejections`, uma quarentena auditável para registros que falham no contrato Staging.

A quarentena guarda somente:

- run;
- portal;
- entidade;
- ID Bitrix quando seguro/disponível;
- `staging_id` quando disponível;
- campos ausentes;
- inconsistências;
- fingerprint SHA-256 do registro de origem.

**O payload bruto rejeitado não é persistido na quarentena.** Isso permite rastreabilidade sem duplicar PII em uma tabela de erro.

RLS permanece habilitado e sem policy permissiva na base.

### Fixture sintético

`tests/fixtures/bronze-ingestion.synthetic.json` representa um envelope Bitrix fictício com:

- 1 negócio válido;
- 1 negócio inválido;
- 1 lead válido;
- 1 lead inválido.

Todos os nomes, telefone e e-mail são explicitamente fictícios; o domínio usado no e-mail é `example.invalid`.

### Testes unitários

`tests/bronze-ingestion.test.mjs` cobre:

- separação entre válidos e rejeitados;
- contadores/status dos runs;
- normalização de IDs opcionais;
- fingerprint e ausência de payload bruto na quarentena;
- determinismo de `run_id`;
- ausência de PII no manifesto;
- SQL transacional/idempotente;
- rejeição de URL/token em `extraido_via`;
- natureza sintética do fixture.

## Validação ponta a ponta

Workflow: `.github/workflows/bronze-ingestion-validation.yml`

Run de PR: **`33089661965`**  
Resultado: **success**.

O workflow executou, em sequência:

1. PostgreSQL 16 real e descartável;
2. todas as migrations `db/migrations/*.sql` em ordem;
3. transformação do envelope sintético pelo runtime Staging real do projeto;
4. geração de SQL de ingestão;
5. primeira execução do SQL;
6. segunda execução do mesmo SQL para provar idempotência;
7. validação de `ingestion_runs`;
8. validação de snapshots válidos;
9. validação da quarentena;
10. validação das views `latest`.

Resultado esperado e observado no banco isolado:

| Item | Resultado |
|---|---:|
| Registros lidos | 4 |
| Válidos | 2 |
| Inválidos | 2 |
| Runs | 2 |
| Runs `partial` | 2 |
| Snapshot negócio válido | 1 |
| Snapshot lead válido | 1 |
| Rejeições auditadas | 2 |
| Duplicações após segunda execução | 0 |

## Gate de banco

Workflow `Database Validation`, run **`33089662033`**: **success**.

Além das provas anteriores de schema, constraints, views e RLS, o gate passou a:

- aplicar todas as migrations em ordem;
- exigir `intelligence.ingestion_rejections`;
- comprovar RLS também na quarentena;
- comprovar deny-by-default da quarentena para papel não-owner;
- inserir e consultar uma rejeição de prova.

## Gate de qualidade

Workflow `Quality`, run **`33089662008`**: **success**.

Resultado:

- `npm audit --audit-level=high`: **0 vulnerabilities**;
- **137 testes**;
- **36 suítes**;
- **137 pass**;
- **0 fail**;
- **0 skipped**;
- **0 todo**.

## O que esta entrega prova

Podemos afirmar com evidência reproduzível que:

- o contrato Staging consegue transformar envelopes no formato esperado;
- válidos e inválidos são tratados separadamente;
- inválidos não desaparecem silenciosamente;
- a quarentena não precisa guardar payload bruto;
- o SQL gerado é aceito por PostgreSQL 16;
- a carga é idempotente para a mesma extração;
- os snapshots válidos aparecem nas views `latest`;
- as migrations e a ingestão convivem com os gates atuais sem regressão conhecida.

## O que esta entrega NÃO prova

Ainda não podemos afirmar que:

- o webhook/API real AtlasGR foi consultado nesta execução;
- o portal Total Trac foi consultado ao vivo;
- a paginação e o volume reais do Bitrix foram exercitados pelo pipeline novo;
- permissões reais do usuário/webhook foram validadas;
- um banco corporativo de produção recebeu a migration ou snapshots;
- PII real foi persistida de forma operacionalmente aprovada;
- freshness, SLA ou recuperação de falhas de uma ingestão real estão fechados.

Por isso o contrato semântico usa:

- `bronze_ingestion_pipeline_validated=true`;
- `bronze_ingestion_validation_scope=synthetic_bitrix_envelope_to_postgresql16_github_actions`;
- `bronze_live_source_ingestion_validated=false`;
- `bitrix_live_verified=false`;
- `production_database_validated=false`.

## Próximo blocker técnico

O pipeline não é mais o blocker principal. O próximo salto técnico requer uma **fonte Bitrix real autorizada** alimentando o mesmo envelope, mantendo segredo fora de arquivos/versionamento e com execução de leitura controlada.

Enquanto isso não acontece, o GitHub já possui um caminho testado para receber o envelope, validar, persistir válidos e auditar rejeições.

## Segurança

Nenhum webhook, segredo ou payload real foi incluído na branch. A fixture é sintética e o E2E usa apenas infraestrutura efêmera do GitHub Actions.
