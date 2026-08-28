# Agente 02 — Bitrix Discovery Specialist — Catálogo formalizado (Wave 2 / Sprint 02)

Data: 2026-08-27  
Escopo: continuação do inventário da Wave 1 com transformação do diagnóstico em contrato legível por máquina e teste de consistência estática.

## Resumo executivo

A Wave 1 já havia produzido um inventário detalhado do que o repositório usa do Bitrix24. O problema remanescente era de governança: esse inventário existia apenas como relatório Markdown. Ele podia envelhecer silenciosamente enquanto o código ganhava novos métodos, novos campos ou novas entidades.

Esta Wave 2 não repete o levantamento. Ela converte o inventário em uma peça operacional:

1. `data/bitrix-capabilities.json` passa a ser o catálogo legível por máquina das capacidades Bitrix efetivamente observadas no código.
2. `tests/bitrix-capabilities.test.mjs` valida a estrutura do catálogo, a cobertura dos métodos declarados em `js/config.js`, limites de escrita, marcação de PII e a separação entre fato conhecido e item não verificável sem API ao vivo.
3. Este documento registra o handoff, dependências, riscos e o gate do Agente 02.

Nenhuma chamada ao Bitrix24 foi realizada nesta tarefa. Nenhum dado de cliente foi lido, persistido ou inventado. O campo `live_api_verified` do catálogo permanece `false` por desenho.

## Artefatos produzidos

### `data/bitrix-capabilities.json`

Catálogo versionado com:

- versão do schema;
- origem da evidência;
- flag explícita de verificação ao vivo;
- segregação AtlasGR / Total Trac;
- entidades centrais;
- métodos de listagem e descoberta de campos;
- campos conhecidos usados no código;
- campos PII conhecidos;
- relacionamentos observáveis;
- suporte de escrita atual;
- histórico disponível;
- capacidades auxiliares;
- capacidades não verificáveis sem API real;
- lacunas conhecidas.

Entidades formalizadas:

| Entidade | Estado | Listagem | Descoberta dinâmica de campos | Escrita atual |
|---|---|---|---|---|
| Negócios | implementado | `crm.deal.list` | `crm.deal.fields` | `crm.item.update`, entityTypeId 2 |
| Leads | implementado | `crm.lead.list` | `crm.lead.fields` | `crm.item.update`, entityTypeId 1 |
| Empresas | implementado | `crm.company.list` | `crm.company.fields` | `crm.item.update`, entityTypeId 4 |
| Contatos | implementado | `crm.contact.list` | `crm.contact.fields` | `crm.item.update`, entityTypeId 3 |
| Atividades | implementado | `crm.activity.list` | `crm.activity.fields` | não confirmado/implementado |
| Usuários | implementado | `user.get` | não há método dinâmico usado | não implementado |

Capacidades auxiliares formalizadas:

- `crm.category.list` — descoberta de pipelines de negócios;
- `crm.status.list` — estágios de negócio e origens;
- `crm.stagehistory.list` — histórico real de estágios;
- `crm.deal.productrows.get` — linhas de produto por negócio;
- `crm.item.get` / `crm.item.fields` — leitura genérica;
- `crm.item.update` — escrita genérica, classificada como **parcial** por depender de governança de acesso/auditoria.

### `tests/bitrix-capabilities.test.mjs`

O teste foi criado para impedir que o catálogo se torne apenas documentação decorativa. Ele verifica:

- JSON válido e schema versionado;
- `live_api_verified=false` enquanto não houver evidência ao vivo;
- IDs únicos de entidade;
- status válidos;
- evidência obrigatória por entidade;
- entidades com descoberta dinâmica precisam declarar `*.fields`;
- PII declarada precisa existir no conjunto de campos conhecidos;
- campos conhecidos não podem se repetir;
- escrita suportada continua limitada ao padrão atualmente observado de `crm.item.update` com entityTypeId 1–4;
- todos os `method`/`fieldsMethod` declarados em `js/config.js` precisam existir no catálogo;
- conjunto crítico de métodos da Wave 1 continua representado;
- catálogo não pode conter webhook/token Bitrix literal;
- capacidades sem evidência suficiente precisam permanecer `not_verifiable`;
- pipeline/estágios da Total Trac não podem ser promovidos a fato sem validação própria.

## Dados e evidências usados

Somente arquivos do repositório GitHub foram usados como evidência, principalmente:

- `js/config.js`;
- `js/bitrix-api.js`;
- `js/extrator.js`;
- `js/jornada.js`;
- `js/sdr.js`;
- `js/forecast.js`;
- `js/catalogo-relatorios.js`;
- `js/cockpit.js`;
- `js/ui.js`;
- `js/exportacoes.js`;
- `scripts/forecast-semanal.mjs`;
- relatório da Wave 1 `02_BITRIX_DISCOVERY_SPECIALIST_INVENTARIO.md`;
- especificação CPI `02_DADOS_E_BITRIX/02_CATALOGO_DADOS.txt`.

O catálogo não afirma existência de campo, pipeline ou entidade que não tenha evidência estática no código. Quando a existência só poderia ser confirmada consultando o portal real, o status usado é `not_verifiable`.

## O que está implementado, parcial e não verificável

### Implementado

- extração paginada das cinco entidades CRM centrais e usuários;
- descoberta dinâmica de campos de Negócio, Lead, Empresa, Contato e Atividade;
- descoberta de categorias e estágios de negócio;
- leitura do histórico de mudança de estágio de negócio;
- leitura de produtos por negócio;
- leitura genérica de item CRM;
- atualização genérica de Deal/Lead/Company/Contact já presente no produto;
- metadados de origem (`SOURCE`) via `crm.status.list`;
- relações principais por IDs Bitrix.

### Parcial

- **escrita de volta no CRM**: tecnicamente existe, mas o CPI exige RLS/segregação/auditabilidade. O catálogo não a promove a capacidade plenamente governada;
- **campos customizados `UF_CRM_*`**: são descobertos dinamicamente, mas ainda não existe dicionário corporativo persistente campo a campo;
- **histórico corporativo**: negócio possui histórico de estágio consultável, mas as demais entidades não têm histórico persistido pelo sistema;
- **metadados multiempresa**: o portal suporta AtlasGR e Total Trac, mas o fallback hardcoded de pipelines/estágios nasceu da AtlasGR.

### Não verificável sem API ao vivo

Mantidos explicitamente no catálogo:

- Smart Process Automation / processos inteligentes customizados;
- faturas/invoices;
- quotes/orçamentos;
- comentários completos de timeline;
- gravações de chamadas;
- corpo e anexos completos de e-mails.

A ausência de referência no código **não significa que a conta Bitrix não possua o recurso**. Significa apenas que o sistema atual não prova seu consumo.

## PII e segurança

O catálogo marca como PII, no mínimo:

- negócio: `TITLE`;
- lead: `TITLE`, `COMPANY_TITLE`, `NAME`, `LAST_NAME`, `PHONE`, `EMAIL`;
- empresa: `TITLE`, `PHONE`, `EMAIL`;
- contato: `NAME`, `LAST_NAME`, `PHONE`, `EMAIL`;
- atividade: `SUBJECT`, `DESCRIPTION`;
- usuário: nome, e-mail/login, telefones, aniversário e foto.

Isso conversa diretamente com a decisão da Camada Bronze: snapshots reais dessas entidades não devem ser tratados como artefato comum de documentação ou exportados inadvertidamente para repositório.

## Divergência AtlasGR × Total Trac

Fato observável no código:

- as duas marcas possuem conexão separada;
- AtlasGR e Total Trac usam os mesmos objetos `ENTIDADES` como fallback de metadados conhecidos;
- esses metadados foram documentados originalmente como metadados AtlasGR.

Por isso o catálogo registra:

- AtlasGR: `metadata_confidence=partial`;
- Total Trac: `metadata_confidence=not_verifiable_without_live_api`.

O teste impede que alguém altere o JSON e declare a estrutura da Total Trac como confirmada sem mudar deliberadamente essa condição.

## Lacunas priorizadas

### P0 — Gate antes de afirmar “Bitrix completamente mapeado”

Executar uma descoberta **somente leitura** em cada portal quando houver autorização explícita para usar o acesso Bitrix, capturando apenas schema/metadados necessários, sem commitar PII.

Saídas esperadas dessa futura validação:

- pipelines reais por portal;
- estágios e semântica por pipeline;
- catálogo real de campos `UF_CRM_*` por entidade;
- entidades adicionais disponíveis;
- campos de negócio necessários aos relatórios do CPI;
- permissões efetivas do webhook por operação.

### P1 — Dicionário corporativo de campos

Evoluir `data/bitrix-capabilities.json` ou artefato irmão para o modelo completo definido em `02_CATALOGO_DADOS.txt`, com, para cada campo:

- nome técnico/amigável;
- tipo;
- nullable/obrigatório;
- PII/sensível;
- relacionamento;
- histórico;
- granularidade;
- periodicidade;
- qualidade/completude;
- KPI/IA que usam o campo;
- owner.

Sem API real, vários desses atributos continuam legitimamente `unknown` e não devem ser inventados.

### P1 — Governança de escrita

Antes de expandir qualquer ação `crm.item.update`:

- declarar papéis/autorização;
- registrar auditoria antes/depois;
- bloquear alteração cruzada entre portais;
- separar funções analíticas das funções de mutação;
- testar permissões mínimas.

### P2 — Performance

`crm.deal.productrows.get` continua uma chamada por negócio. Para grandes volumes, esse padrão N+1 precisa ser medido e eventualmente replanejado.

## Gate do Agente 02

### Passa

- inventário estático anterior foi transformado em contrato versionado;
- há rastreabilidade de métodos e campos conhecidos;
- PII está explicitamente marcada;
- capacidades sem evidência são classificadas como não verificáveis;
- existe teste automatizado para detectar parte relevante do drift futuro.

### Não fecha a descoberta real do Bitrix

O gate **não autoriza** afirmar que todos os dados existentes nos portais AtlasGR/Total Trac foram descobertos. Isso depende de uma futura execução ao vivo, somente leitura, que não faz parte desta tarefa e não foi realizada.

## Dependências e handoff

- **Agente 01 / Data Architect**: usar este catálogo para decidir quais entidades entram na camada Bronze e quais campos precisam persistência histórica.
- **Agente 03 / Data Quality**: usar `known_fields`, PII e relacionamentos como entrada para regras de completude e integridade.
- **Agente 04 / Entity Resolution**: relacionamentos `COMPANY_ID`, `CONTACT_ID`, `LEAD_ID` e PII identificada suportam o `MASTER_ENTITY_ID` formalizado no PR correspondente.
- **Agente 05 / Metrics Governance**: cada KPI deve apontar para campos catalogados; indicador que depende de campo não catalogado passa a carregar dependência explícita.
- **Agente 69 / Data Privacy** e **Agente 44 / Access Governance**: revisar qualquer persistência ou escrita futura baseada neste catálogo.

## Confiança e limitações

**Confiança alta** na existência dos métodos/entidades explicitamente referenciados no código atual.  
**Confiança média** na lista de campos “conhecidos”, pois combina o conjunto base de `js/config.js` com campos adicionais usados por relatórios específicos.  
**Confiança não atribuída** à existência de entidades/campos extras no Bitrix real. Esses itens permanecem `not_verifiable` até consulta autorizada aos portais.
