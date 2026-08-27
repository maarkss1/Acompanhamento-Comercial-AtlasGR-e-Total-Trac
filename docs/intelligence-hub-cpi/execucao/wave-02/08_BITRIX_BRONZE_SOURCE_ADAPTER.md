# Wave 2 — Adaptador Bitrix → Bronze (read-only)

Data: 2026-08-27  
Branch: `cpi-sprint02-integration`

## Objetivo

Preparar o elo de leitura entre Bitrix24 e o pipeline Bronze sem ativar uma extração real nesta entrega.

O adaptador está em `scripts/bitrix-bronze-source.mjs` e foi desenhado para alimentar diretamente `scripts/bronze-ingest.mjs` em memória.

## Regra de segurança

O adaptador possui allowlist explícita de métodos:

- `crm.deal.list`;
- `crm.lead.list`.

Qualquer método fora dessa allowlist é rejeitado antes da chamada. Não existe `add`, `update`, `delete` ou método de escrita no adaptador.

## Segredo

O webhook:

- precisa usar HTTPS;
- precisa ter formato de webhook de entrada Bitrix;
- não entra no envelope Bronze;
- não entra no manifesto;
- não é incluído nas mensagens de erro do adaptador;
- não é versionado.

O projeto já possui um contrato existente para `BITRIX_WEBHOOK_URL` no workflow de forecast semanal. Isso não significa que o secret esteja validado ou disponível para esta branch, apenas que o nome já é usado pelo projeto.

## Leitura e paginação

O adaptador replica as propriedades importantes do extrator web existente:

- `POST` com `application/x-www-form-urlencoded`;
- `select[]` explícito;
- `order[ID]=ASC`;
- paginação por `start/next`;
- deduplicação por `ID`;
- atraso opcional entre páginas;
- timeout;
- retentativas limitadas;
- tratamento de `QUERY_LIMIT_EXCEEDED`/HTTP 429;
- interrupção em cursor cíclico ou inválido.

## Campos lidos

### Negócios

São selecionados os campos que alimentam o contrato Staging existente, incluindo ID, título, estágio, categoria, valor, moeda, datas, responsáveis, vínculos com empresa/contato/lead, origem e estado fechado.

O campo já documentado `UF_CRM_1770928318695` permanece incluído porque o Staging o usa como data oficial de contrato assinado.

### Leads

São selecionados ID, título, status, origem, valor, datas, responsável, empresa, contato, nome, sobrenome, telefone e e-mail.

Telefone/e-mail são PII e, em uma execução real, permanecem somente no fluxo necessário para Staging. O adaptador não possui opção de exportar o envelope bruto para arquivo.

## Integração direta com Bronze

`prepararBronzeDiretoDoBitrix()` executa:

`Bitrix read-only → envelope em memória → prepararIngestaoBronze()`

`gerarCargaBronzeDiretoDoBitrix()` adiciona a geração de:

- SQL transacional da carga;
- manifesto seguro de contagens.

Nenhuma dessas funções é chamada automaticamente por workflow de `push` ou `pull_request`.

## Evidência automatizada

`tests/bitrix-bronze-source.test.mjs` adicionou sete testes:

1. formato HTTPS do webhook;
2. erro não ecoa token;
3. paginação POST + `order[ID]=ASC` + selects + deduplicação;
4. método fora da allowlist é bloqueado;
5. envelope não contém webhook/token;
6. fonte simulada alimenta diretamente o pipeline Bronze;
7. selects são somente leitura.

Quality run **`33090390248`**:

- **146 testes**;
- **37 suítes**;
- **146 pass**;
- **0 fail**;
- `npm audit --audit-level=high`: **0 vulnerabilities**.

No mesmo head:

- Bronze E2E `33090389370`: **success**;
- Database Validation `33090388200`: **success**.

## Limite de confiança

Esta entrega prova que o adaptador funciona contra um `fetch` simulado com paginação e respostas no formato esperado.

Ela **não prova**:

- permissão real do webhook;
- campos realmente disponíveis em AtlasGR/Total Trac hoje;
- volume/paginação reais;
- comportamento real do rate limit;
- disponibilidade do secret para esta branch;
- qualidade dos dados reais;
- ingestão corporativa aprovada.

Portanto:

- `bitrix_live_verified=false` continua correto;
- `bronze_live_source_ingestion_validated=false` continua correto.

## Próximo passo preparado

O próximo estágio pode ser um **probe manual read-only**, executado somente mediante autorização, usando o secret por variável de ambiente e um PostgreSQL efêmero. O probe deve imprimir apenas contagens e estados de validação, nunca payloads, SQL com PII ou o webhook.
