# Wave 2 — Tentativa autorizada de Bitrix Live Probe

Data: 2026-08-27  
Branch: `cpi-sprint02-integration`  
Escopo autorizado: leitura Bitrix **read-only**, amostra limitada, sem merge/deploy.

## Resultado

A tentativa de validação live do portal AtlasGR foi autorizada e chegou a iniciar como job do GitHub Actions, porém foi **bloqueada antes de qualquer chamada externa ao Bitrix** porque o repository secret `BITRIX_WEBHOOK_URL` não está configurado/disponível no runtime do GitHub Actions.

Evidência principal:

- workflow: `Quality`;
- run: `33097111260`;
- job: `98604794509` (`bitrix-live-probe-atlasgr`);
- etapa de bloqueio: `Verify authorized read-only mode and secret`;
- resultado: `failure` por secret ausente;
- checkout: não executado;
- migrations: não executadas;
- leitura Bitrix: não executada;
- carga Bronze live: não executada.

## Interpretação correta

Este resultado **não é uma falha do Bitrix**, não prova indisponibilidade da API e não valida os dados ao vivo.

Ele prova apenas que, na data desta evidência, o GitHub Actions não recebeu valor para `BITRIX_WEBHOOK_URL`. A trava de segurança interrompeu o job antes do acesso externo.

Portanto permanecem corretas as flags:

- `bitrix_live_probe_executed=false`;
- `bronze_live_source_ingestion_validated=false`;
- `bitrix_live_verified=false`;
- `live_data_verified=false`.

## Segurança observada

Nenhum webhook foi impresso ou versionado. Nenhum token histórico foi reutilizado. Nenhum payload real, título, telefone, e-mail ou SQL contendo PII foi produzido pelo probe.

O antigo webhook que já havia sido removido do repositório **não deve ser recuperado nem reutilizado**. A continuação exige um webhook atual e legítimo cadastrado diretamente como GitHub Actions repository secret.

## Limpeza pós-tentativa

Os gatilhos temporários usados exclusivamente para a tentativa foram removidos. O workflow `Quality` voltou a executar apenas a suíte normal.

O workflow definitivo `.github/workflows/bitrix-bronze-live-probe.yml` permanece:

- exclusivamente manual (`workflow_dispatch`);
- `contents: read`;
- com confirmação textual `READ_ONLY_LIVE_PROBE`;
- limite de amostra 50/100/250;
- PostgreSQL 16 efêmero;
- arquivos temporários em `$RUNNER_TEMP`;
- sem upload de artifact;
- sem `git push`;
- sem publicação de payload bruto.

## Baseline após limpeza

Commit limpo validado: `183796ccd35091b91ec1f790c2b915e45e4899bf`.

GitHub Actions:

- Quality `33097450924`: **success**, 163 testes, 40 suítes, 163 pass, 0 fail, 0 vulnerabilities;
- Bronze Ingestion Validation `33097450932`: **success**, incluindo AtlasGR + Total Trac e isolamento por portal;
- Database Validation `33097450916`: **success** em PostgreSQL 16 efêmero.

O estado consolidado também está refletido em:

- `GATE_INTEGRACAO_SPRINT_02.md`;
- Issue #15;
- PR #16.

## Blocker exato para a próxima execução

Cadastrar no repositório, em **Settings → Secrets and variables → Actions**, um repository secret novo e válido:

`BITRIX_WEBHOOK_URL`

Depois disso, o workflow manual pode ser executado novamente com:

- portal: `atlasgr`;
- max_records: `100` inicialmente;
- confirmation: `READ_ONLY_LIVE_PROBE`.

Para Total Trac, o contrato prevê separadamente:

`BITRIX_TOTALTRAC_WEBHOOK_URL`

Nenhum valor de secret deve ser colocado em issue, PR, arquivo versionado ou mensagem de log.
