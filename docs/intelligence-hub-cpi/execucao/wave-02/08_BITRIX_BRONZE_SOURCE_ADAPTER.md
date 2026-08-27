# Wave 2 — Adaptador Bitrix → Bronze (read-only)

Data: 2026-08-27  
Branch: `cpi-sprint02-integration`

## Objetivo

Preparar o elo de leitura entre Bitrix24 e o pipeline Bronze com controles de segurança suficientes para uma validação live limitada, sem habilitar escrita no CRM nem persistir payload bruto no repositório.

O adaptador está em `scripts/bitrix-bronze-source.mjs` e alimenta diretamente `scripts/bronze-ingest.mjs` em memória.

## Regra de segurança

Allowlist explícita:

- `crm.deal.list`;
- `crm.lead.list`.

Qualquer método fora dessa allowlist é rejeitado antes da chamada. Não existe `add`, `update`, `delete` ou outro método de escrita no adaptador Bronze.

## Segredo

O webhook:

- precisa usar HTTPS e o formato esperado de webhook Bitrix;
- não entra no envelope Bronze;
- não entra no manifesto;
- não é incluído nas mensagens de erro;
- não é versionado.

AtlasGR usa o contrato de secret `BITRIX_WEBHOOK_URL`. Total Trac usa `BITRIX_TOTALTRAC_WEBHOOK_URL` no workflow manual.

## Leitura e paginação

O adaptador implementa:

- `POST` com `application/x-www-form-urlencoded`;
- `select[]` explícito;
- `order[ID]=ASC`;
- paginação por `start/next`;
- deduplicação por `ID`;
- timeout e retentativas limitadas;
- tratamento de `QUERY_LIMIT_EXCEEDED` / HTTP 429;
- interrupção em cursor cíclico/inválido;
- `maxRecords` para limitar uma amostra live.

## Campos

Negócios e leads usam apenas campos já reconciliados com `data/bitrix-capabilities.json`. Um teste de drift bloqueia a suíte se o adaptador passar a solicitar campo não catalogado ou se PII selecionada deixar de estar marcada como PII.

## Integração direta com Bronze

`prepararBronzeDiretoDoBitrix()` executa:

`Bitrix read-only → envelope em memória → prepararIngestaoBronze()`

`gerarCargaBronzeDiretoDoBitrix()` adiciona SQL transacional e manifesto seguro de contagens.

O envelope bruto não possui opção de exportação versionada.

## Live probe manual

O workflow `.github/workflows/bitrix-bronze-live-probe.yml` é exclusivamente `workflow_dispatch` e exige:

- portal AtlasGR ou Total Trac;
- amostra 50/100/250;
- confirmação `READ_ONLY_LIVE_PROBE`;
- secret específico do portal.

Ele usa PostgreSQL 16 efêmero, grava SQL/manifesto somente em `$RUNNER_TEMP`, não faz upload de artifacts e publica apenas agregados seguros.

## Tentativa autorizada de 27/08/2026

Foi autorizada uma leitura real AtlasGR. O run `33097111260`, job `98604794509`, foi bloqueado antes da chamada externa porque `BITRIX_WEBHOOK_URL` estava vazio no runtime do GitHub Actions.

Logo:

- nenhuma chamada ao Bitrix ocorreu;
- nenhum dado real foi lido;
- `bitrix_live_verified=false` permanece correto;
- o blocker atual é cadastrar um webhook legítimo como repository secret.

Ver `09_BITRIX_LIVE_PROBE_TENTATIVA_AUTORIZADA.md`.

## Evidência automatizada atual

Baseline limpo no commit `183796ccd35091b91ec1f790c2b915e45e4899bf`:

- Quality `33097450924`: **163 testes, 40 suítes, 163 pass, 0 fail, 0 vulnerabilities**;
- Bronze E2E `33097450932`: **success**, incluindo AtlasGR + Total Trac e isolamento por portal;
- Database Validation `33097450916`: **success**.

## Limite de confiança

O adaptador e o workflow estão tecnicamente preparados, mas a fonte live continua não validada. Não afirmar permissão, campos disponíveis, volume, rate limit real ou qualidade dos dados de AtlasGR/Total Trac até um probe com secret válido concluir.
