# Agente 01 — Camada de Staging (Bronze) Formalizada (Wave 2.2, Sprint 02)

> Escopo: continuação direta do próprio relatório da Wave 1
> (`docs/intelligence-hub-cpi/execucao/wave-01-fundacao/01_ENTERPRISE_DATA_ARCHITECT_ARQUITETURA_DE_DADOS.md`),
> conforme item 5 do "Plano da Wave 2" do Agente 00
> (`docs/intelligence-hub-cpi/execucao/wave-01-fundacao/00_CHIEF_ORCHESTRATOR_DIAGNOSTICO_E_PLANO.md`),
> avançando o Sprint 02 (`03_SPRINTS/SPRINT_02_MODELO_CORPORATIVO_DE_DADOS.txt`) sob a arquitetura de
> camadas RAW → STAGING → CORE → SEMANTIC → MARTS (`01_ARQUITETURA/02_ARQUITETURA_DADOS.txt`).
> Nenhum dado real de cliente foi usado ou inventado nesta tarefa — todo exemplo está rotulado
> explicitamente como fictício.

## Resumo executivo

O relatório da Wave 1 propôs estender o padrão já validado pelo Forecast semanal (automação
GitHub Actions → JSON versionado em `relatorios/forecast-semanal/historico.json`) para negócios e
leads brutos das duas empresas, como forma de criar a Camada 1 (Staging/Bronze) que hoje não
existe no projeto. Antes de implementar isso, esta tarefa parou em uma restrição que os cinco
relatórios da Wave 1 e a síntese do Agente 00 não haviam colocado lado a lado com essa proposta
específica: **o repositório GitHub deste projeto é público**, e os dois formatos de dado bruto em
questão (Negócios e, principalmente, Leads) carregam PII real de cliente — nome, telefone, e-mail,
nome de empresa, valor de contrato. Persistir isso como JSON versionado em git, do jeito que o
Forecast semanal já faz para números agregados, significaria commitar PII de cliente real em
histórico git público, **permanentemente** (remover do HEAD não remove do histórico — o mesmo
princípio já registrado na Wave 1 para o webhook exposto).

Por decisão explícita do usuário nesta sessão, esta tarefa **formaliza apenas o design** — o
contrato de dados (schema) da Camada 1 para Negócios e Leads — e implementa **funções puras de
transformação/validação** (`js/staging-schema.js`), sem persistência nenhuma. Nenhum workflow de
GitHub Actions foi criado. Nenhum arquivo dentro de `relatorios/` foi criado ou alterado. A Camada
1 continua, depois desta tarefa, **não pronta para uso em produção** enquanto o repositório
continuar público — ver seção de bloqueio abaixo.

O que foi entregue:
1. Contrato de dados formal (campos, tipos, obrigatoriedade, chave de negócio, versionamento de
   schema, proveniência) para Negócios e Leads — a lacuna "Contrato de dados formal por campo
   inexistente" citada tanto pelo relatório da Wave 1 quanto pela síntese do Agente 00.
2. `js/staging-schema.js` — funções puras `transformarNegocioParaStaging` e
   `transformarLeadParaStaging`, que recebem um registro bruto no formato já usado por
   `js/jornada.js`/`js/bitrix-api.js` e devolvem o registro no formato do contrato, com validação
   de obrigatoriedade e sinalização de inconsistências. Reaproveita `parteDataISO`,
   `idBitrixValido`, `idBitrixString` e `valoresMulticampo` de `js/jornada.js` — nada foi
   duplicado.
3. `tests/staging-schema.test.mjs` — 16 testes novos, dados fictícios, seguindo o mesmo padrão
   (`node:vm`) de `tests/jornada.test.mjs`. Suíte completa (`node --test tests/*.test.mjs`):
   **62 testes, 20 suites, 0 falhas** (as 46 já existentes + as 16 novas).
4. Quatro opções reais de persistir isso no futuro sem expor PII publicamente, com prós/contras —
   sem escolher nenhuma, por ser decisão do usuário/negócio.

## ⚠️ Bloqueio de privacidade — leia antes de tudo

**A Camada 1 (Staging) de Negócios e, principalmente, Leads NÃO deve ser persistida como JSON
versionado em git enquanto o repositório GitHub deste projeto continuar público.**

Por quê:
- A síntese do Agente 00 já confirmou, por verificação direta (`git remote`, `.github/workflows/pages.yml`),
  que este repositório é público no GitHub e publicado via GitHub Pages a cada push em `main` — é
  o mesmo achado usado para justificar a gravidade do webhook exposto (correção já aplicada na
  Wave 2.0, ver `docs/intelligence-hub-cpi/execucao/WAVE_01_CORRECOES_PRODUCAO.md`).
- O contrato de Leads definido abaixo (`STAGING_SCHEMA_LEAD`) tem **6 campos marcados `pii: true`**:
  `titulo`, `empresa_titulo`, `nome`, `sobrenome`, `telefones`, `emails` — dados reais de pessoas e
  empresas clientes, vindos direto de `crm.lead.list` (`js/config.js:145-161`). O contrato de
  Negócios tem 1 campo PII (`titulo`, que frequentemente contém nome de cliente — visto em
  `js/jornada.js:limparNomeClienteParaChave`, que existe justamente para remover sufixos
  operacionais de títulos que já carregam nome de cliente).
- Um snapshot diário gerado a partir desses contratos e commitado em `relatorios/snapshots/...`
  (como o relatório da Wave 1 chegou a esboçar como exemplo de caminho de arquivo) exporia telefone,
  e-mail e nome de clientes/leads reais das duas empresas a qualquer visitante do repositório
  público — de forma cumulativa e permanente no histórico git, ao contrário de um vazamento pontual.
- Isso é qualitativamente diferente do que já é versionado hoje: `relatorios/forecast-semanal/historico.json`
  contém só números agregados (meta mensal, valor fechado, valor vencido) — nenhum nome, telefone
  ou e-mail de cliente. Não é o mesmo padrão de risco, mesmo usando a mesma mecânica técnica
  (GitHub Actions + JSON versionado).

**Por isso, nesta tarefa:**
- ✅ Foi formalizado o contrato de dados (schema) completo — pode ser usado hoje para validar
  formato/obrigatoriedade em memória, no navegador, sem persistir nada.
- ✅ Foram implementadas funções puras de transformação/validação — não escrevem em disco, git,
  localStorage ou rede.
- ❌ **Nenhuma automação GitHub Actions foi criada.** Nenhum workflow em `.github/workflows/`.
- ❌ **Nenhum arquivo em `relatorios/` foi criado ou editado.**
- ❌ A Camada 1 **não deve ser anunciada como "pronta para uso em produção"** até que o usuário
  decida qual das opções da seção "Opções de persistência futura" adotar (ou outra) — o gate do
  Sprint 02 (`SPRINT_02_MODELO_CORPORATIVO_DE_DADOS.txt`: "Não avançar com... dado fictício,
  permissão incorreta...") se aplicaria de forma direta a "persistir PII de cliente real em um
  repositório público" se isso fosse feito sem essa decisão.

## Contrato de dados (schema)

Implementado em `js/staging-schema.js` como dois objetos de dados (`STAGING_SCHEMA_NEGOCIO`,
`STAGING_SCHEMA_LEAD`), cada um com `entidade`, `schemaVersion`, `chaveNegocio` e uma lista
`campos: [{ campo, tipo, obrigatorio, origem, pii, descricao? }]`. Versão atual do contrato:
`STAGING_SCHEMA_VERSION = "1.0.0"`.

### Chave de negócio (business key)

`staging_id = "${portal}:${bitrix_id}"` — por exemplo `"atlasgr:501"` ou `"totaltrac:501"`.

**Refinamento sobre a proposta original da Wave 1:** o relatório da Wave 1 sugeriu `deal_key =
Negocio.ID` (nativo Bitrix, estável) como chave mínima. Esta tarefa formaliza isso com um ajuste
importante: como AtlasGR e Total Trac são **dois portais Bitrix independentes** (cada um numerando
seus próprios IDs a partir de 1 — confirmado em `js/config.js:14-40` e no achado "Isolamento
AtlasGR × Total Trac" da Wave 1), usar só `Negocio.ID` colidiria silenciosamente sempre que as duas
empresas tivessem um negócio com o mesmo número de ID. `stagingConstruirId(portal, bitrixId)`
resolve isso prefixando pelo portal — o mesmo `portal_key` que a Wave 1 já havia recomendado
"acompanhar todo registro persistido", aqui incorporado diretamente na chave em vez de como campo
solto.

### Versionamento de schema

`schema_version` é um campo obrigatório em todo registro de staging, preenchido com
`STAGING_SCHEMA_VERSION` no momento da transformação. Convenção proposta (não implementada como
mecanismo automático — é uma convenção documentada para quem vier a persistir isto):
- Adicionar um campo novo opcional → incrementa a versão **patch** (`1.0.0` → `1.0.1`).
- Adicionar um campo novo obrigatório, ou tornar um campo opcional em obrigatório → incrementa a
  versão **minor** (`1.0.0` → `1.1.0`) e exige revalidar registros já persistidos contra o novo
  contrato antes de considerá-los conformes.
- Remover ou renomear um campo, ou mudar o tipo/semântica de um campo existente → incrementa a
  versão **major** (`1.0.0` → `2.0.0`) e exige migração explícita de qualquer snapshot já
  persistido (não é compatível retroativamente).
- Cada registro individual carrega sua própria `schema_version` — não é um número global do
  repositório — para que um snapshot histórico continue interpretável mesmo depois do contrato
  evoluir (mesmo princípio de "nunca inventar/perder dado" já declarado no pacote de especificação,
  princípio 5).

### Timestamp de extração e proveniência

Todo registro carrega três campos de proveniência, obrigatórios nos dois contratos:
- `extraido_em`: timestamp ISO 8601 (UTC) do momento em que a transformação rodou — não a data do
  dado em si (que já está nos campos `data_*`). Permite, no futuro, saber "como estava esse
  registro quando foi capturado", mesmo que o Bitrix mude depois.
- `extraido_via`: identificador curto da fonte, ex. `"webhook:atlasgr"` ou `"webhook:totaltrac"`.
  **Deliberadamente NUNCA a URL/token do webhook em si** — dado o achado crítico já corrigido na
  Wave 2.0 (webhook em texto puro exposto em repositório público), este contrato marca
  explicitamente esse campo como "nunca a URL/token" para não reabrir o mesmo risco por outra
  porta.
- `portal`: `"atlasgr"` ou `"totaltrac"` — qual dos dois portais Bitrix (empresa) gerou o registro.
  Também compõe a chave de negócio (`staging_id`), ver acima.

### Campos — Negócios (`STAGING_SCHEMA_NEGOCIO`)

Alinhado a `ENTIDADES.negocios` (`js/config.js:50-125`). 24 campos: 8 obrigatórios (`staging_id`,
`bitrix_id`, `portal`, `estagio_id`, `extraido_em`, `extraido_via`, `schema_version`), os demais
opcionais. 1 campo PII (`titulo`).

| Campo | Tipo | Obrigatório | Origem Bitrix | PII |
|---|---|---|---|---|
| `staging_id` | string | sim | derivado | não |
| `bitrix_id` | string numérica | sim | `ID` | não |
| `portal` | enum atlasgr\|totaltrac | sim | proveniência | não |
| `titulo` | string | não | `TITLE` | **sim** |
| `estagio_id` | string | sim | `STAGE_ID` | não |
| `categoria_id` | string | não | `CATEGORY_ID` | não |
| `valor` | number | não | `OPPORTUNITY` | não |
| `moeda` | string | não | `CURRENCY_ID` | não |
| `data_criacao` / `data_modificacao` / `data_movido_estagio` / `data_fechamento` / `data_inicio` | data ISO | não | `DATE_CREATE` / `DATE_MODIFY` / `MOVED_TIME` / `CLOSEDATE` / `BEGINDATE` | não |
| `data_contrato_assinado` | data ISO | não | `UF_CRM_1770928318695` (campo customizado oficial) | não |
| `responsavel_id` / `criado_por_id` / `modificado_por_id` / `movido_por_id` | string numérica | não | `ASSIGNED_BY_ID` / `CREATED_BY_ID` / `MODIFY_BY_ID` / `MOVED_BY_ID` | não |
| `empresa_id` / `contato_id` / `lead_id` | string numérica | não | `COMPANY_ID` / `CONTACT_ID` / `LEAD_ID` (0 = ausente, ver `idBitrixValido`) | não |
| `origem_id` | string | não | `SOURCE_ID` | não |
| `fechado` | boolean\|null | não | `CLOSED` (`Y`/`N` convertido) | não |
| `extraido_em` / `extraido_via` / `schema_version` | proveniência | sim | — | não |

### Campos — Leads (`STAGING_SCHEMA_LEAD`)

Alinhado a `ENTIDADES.leads` (`js/config.js:126-162`). 20 campos: 7 obrigatórios, os demais
opcionais. **6 campos PII** — concentra a maior parte do risco de privacidade deste contrato.

| Campo | Tipo | Obrigatório | Origem Bitrix | PII |
|---|---|---|---|---|
| `staging_id` / `bitrix_id` / `portal` | — | sim | derivado / `ID` / proveniência | não |
| `titulo` | string | não | `TITLE` | **sim** |
| `estagio_id` | string | sim | `STATUS_ID` | não |
| `origem_id` | string | não | `SOURCE_ID` | não |
| `valor` | number | não | `OPPORTUNITY` | não |
| `data_criacao` / `data_modificacao` | data ISO | não | `DATE_CREATE` / `DATE_MODIFY` | não |
| `responsavel_id` | string numérica | não | `ASSIGNED_BY_ID` | não |
| `empresa_id` | string numérica | não | `COMPANY_ID` | não |
| `empresa_titulo` | string | não | `COMPANY_TITLE` | **sim** |
| `contato_id` | string numérica | não | `CONTACT_ID` | não |
| `nome` / `sobrenome` | string | não | `NAME` / `LAST_NAME` | **sim** |
| `telefones` | string[] | não | `PHONE` (multicampo Bitrix) | **sim** |
| `emails` | string[] | não | `EMAIL` (multicampo Bitrix) | **sim** |
| `extraido_em` / `extraido_via` / `schema_version` | proveniência | sim | — | não |

### O que o contrato deliberadamente NÃO inclui (fora de escopo desta tarefa)

- **Chave mestra de cliente (`MASTER_ENTITY_ID`)** — o plano da Wave 2 (item 6, Agente 00) já
  atribui essa formalização ao Agente 04 (Entity Resolution Specialist), com base na heurística já
  existente em `js/jornada.js:864-901`. O contrato de staging aqui expõe os campos que a resolução
  de entidade precisa (`empresa_id`, `contato_id`, `lead_id`, `titulo`/`nome` normalizável), mas
  não calcula a chave — Camada 2 (Negócio/Conformação), não Camada 1.
- **Checagem de tipo em runtime** — `stagingValidarContraSchema` verifica só obrigatoriedade
  (campo ausente/vazio). O `tipo` declarado em cada campo do contrato é documentação, não uma
  validação de schema em tempo de execução (ex.: `zod`/`ajv`) — decisão consciente de não
  adicionar dependência nova (mesmo princípio de baixo risco/aditivo desta tarefa).

## Implementação

`js/staging-schema.js` (script clássico, sem `import`/`export`, mesmo padrão de `js/jornada.js` e
`js/data-trust-score.js`) — precisa carregar **depois** de `js/jornada.js` na ordem de `<script>`
de qualquer página que venha a usá-lo (mesma dependência que `js/cockpit.js` já tem hoje). Não está
incluído em nenhum `<script src>` de página HTML ainda — mesmo status inicial de
`js/data-trust-score.js`, decisão de exposição/UX fica para uma wave futura.

Funções expostas:
- `stagingConstruirId(portal, bitrixId)` — monta a chave de negócio.
- `stagingValidarContraSchema(registro, schema)` — validador genérico de obrigatoriedade,
  reaproveitado pelas duas funções de transformação abaixo.
- `transformarNegocioParaStaging(dealBruto, { portal, extraidoEm, extraidoVia })` → `{ registro,
  valido, camposAusentes, avisos }`.
- `transformarLeadParaStaging(leadBruto, { portal, extraidoEm, extraidoVia })` → mesmo formato de
  retorno.

`avisos` sinaliza inconsistências sem descartar o dado (mesmo princípio "nunca 0 silencioso" já
declarado em `js/cockpit.js:16-18` e reforçado pelo Data Trust Score na Wave 2.1): `bitrix_id_invalido`,
`portal_desconhecido`, `sem_vinculo_cliente` (Negócios: sem `empresa_id`/`contato_id`/`lead_id`),
`sem_valor` (Negócios: `OPPORTUNITY` ausente/zero), `data_movido_estagio_no_futuro`,
`data_modificacao_anterior_a_criacao` (mesma classe de inconsistência de data que a Wave 1/2.1 já
tratou em `decisao_final_sdr`/Data Trust Score — aqui só sinalizada, não corrigida, por estar fora
do escopo desta transformação), `sem_nome_identificavel` e `sem_contato` (Leads).

Nenhuma função escreve em `document`, `localStorage`, `fetch` ou disco — confirmado por leitura
direta do arquivo: são funções puras (entrada → saída), testáveis sem qualquer mock de rede/DOM.

### Testes (`tests/staging-schema.test.mjs`)

Segue o padrão já estabelecido em `tests/jornada.test.mjs`/`tests/cockpit.test.mjs`
(`tests/helpers/carregar-script-classico.mjs`, `node:vm`), carregando `js/jornada.js` primeiro e
passando seu contexto como `contextoExtra` ao carregar `js/staging-schema.js` — reproduz a mesma
composição de globals que acontece no navegador real. Todos os negócios/leads usados são fictícios
e rotulados como tal no próprio código do teste (nomes como "Negócio Fictício de Teste — Empresa
Exemplo", telefone/e-mail inventados em domínio `.invalid`); nenhum dado real de cliente aparece em
nenhum arquivo desta tarefa.

16 testes novos, cobrindo: `stagingConstruirId` (prefixo por portal evita colisão de ID entre
AtlasGR/Total Trac; portal desconhecido ou ID inválido devolve vazio); `stagingValidarContraSchema`
(campo obrigatório ausente/vazio é detectado; registro completo é válido); `transformarNegocioParaStaging`
(negócio completo transforma e valida; negócio sem ID válido é inválido e sinaliza
`bitrix_id_invalido`; negócio sem vínculo de cliente sinaliza `sem_vinculo_cliente`; negócio sem
valor sinaliza `sem_valor`; data de modificação anterior à criação é preservada no registro **e**
sinalizada em `avisos`, não corrigida silenciosamente; o mesmo `bitrix_id` em portais diferentes
gera `staging_id` diferentes); `transformarLeadParaStaging` (lead completo com telefone/e-mail
fictícios transforma corretamente; lead sem contato sinaliza `sem_contato`; lead sem nome
identificável sinaliza `sem_nome_identificavel`; lead sem ID válido é inválido); e dois testes que
verificam o próprio contrato declarado (todo campo PII do schema de Leads está de fato marcado
`pii: true`; `staging_id` é a chave de negócio declarada nos dois contratos).

**Achado técnico registrado durante a implementação dos testes** (não é um bug de produção, é uma
armadilha do ambiente de teste que vale documentar para quem escrever a próxima suíte): comparar
com `assert.deepEqual`/`deepStrictEqual` um array retornado de dentro do contexto `node:vm` (como
`camposAusentes` ou `telefones`) contra um array literal do módulo de teste falha com "Values have
same structure but are not reference-equal" — os dois contextos têm construtores `Array` diferentes
(realms diferentes). A correção usada aqui foi envolver o lado vindo do `vm` com `Array.from(...)`
antes de comparar. Nenhum teste dos arquivos já existentes (`jornada.test.mjs`, `cockpit.test.mjs`,
`reconciliacao-forecast.test.mjs`) usava `deepEqual` em arrays antes desta tarefa, então essa
armadilha não havia aparecido ainda na suíte do projeto.

**Comando de execução**: `node --test tests/*.test.mjs` (equivalente a `npm test`) — **não**
`node --test tests/`, que falha neste ambiente com `Error: Cannot find module '.../tests'` (mesmo
desvio já documentado em `QA_SUITE_TESTES_INICIAL.md`, confirmado novamente nesta tarefa).

**Resultado confirmado nesta tarefa**: `node --test tests/*.test.mjs` → **62 testes, 20 suites, 0
falhas** (as 46 testes/15 suites já existentes da Wave 2.1, mais os 16 testes/5 suites novos desta
tarefa). Nenhum teste pré-existente foi alterado; nenhum arquivo de produção fora de
`js/staging-schema.js` foi tocado.

> Nota: se `node --test tests/*.test.mjs` for rodado depois desta tarefa e mostrar mais de 20
> suites e alguma falha em `entity-resolution.test.mjs`, isso não vem deste entregável —
> `js/entity-resolution.js`/`tests/entity-resolution.test.mjs` apareceram no repositório durante
> esta sessão, provavelmente trabalho em andamento de outro agente em paralelo (Agente 04, item 6
> do plano do Agente 00), e não foram criados, alterados nem revisados aqui. Isolando só os
> arquivos desta tarefa e os já existentes antes dela (`node --test tests/jornada.test.mjs
> tests/cockpit.test.mjs tests/reconciliacao-forecast.test.mjs tests/staging-schema.test.mjs`), o
> resultado é o mesmo 62/62 relatado acima.

## Opções de persistência futura sem expor PII

Nenhuma foi implementada — escolha é do usuário/negócio. Todas assumem que o contrato de dados
acima (ou uma evolução dele) já está pronto para consumo; a diferença é só **onde e como** o
resultado da transformação seria armazenado.

**(a) Tornar o repositório GitHub privado antes de persistir**
- Prós: menor mudança possível — o padrão GitHub Actions + JSON versionado (já validado pelo
  Forecast semanal) passaria a funcionar exatamente como esboçado na Wave 1, sem nenhuma mudança de
  arquitetura. Continua sem custo de infraestrutura nova.
- Contras: perde a distribuição gratuita via GitHub Pages pública (teria que trocar por Pages
  privado, algo pago no plano atual do GitHub, ou outro host); qualquer colaborador com acesso ao
  repositório passa a enxergar PII de cliente das duas empresas — dependendo de quantas pessoas têm
  acesso hoje, isso pode não reduzir o risco tanto quanto parece, só troca "público na internet"
  por "visível a todo colaborador do repo". Não resolve o histórico de commits já público até a
  mudança (o que já estava lá permanece recuperável por quem tiver clonado antes).

**(b) Repositório separado privado só para os dados, referenciado por submodule/API**
- Prós: mantém o repositório de código (este) público, sem tocar no GitHub Pages atual; isola o
  raio de exposição — só quem tem acesso ao segundo repositório vê PII; ainda usa a mesma mecânica
  técnica (GitHub Actions + JSON versionado), só apontando para outro destino.
- Contras: mais um repositório para gerenciar permissão/acesso; se usado como submodule, qualquer
  processo que precise ler o dado (ex.: um relatório no navegador) precisaria de uma forma de buscar
  esse conteúdo — via API do GitHub autenticada (o navegador não pode simplesmente fazer `fetch` de
  um repo privado sem token, e um token no código-fonte do site público recria o mesmo problema do
  webhook exposto). Funciona bem para automação Node → Node (ex.: script de CI lendo o outro repo
  via token de Secret), mas não resolve sozinho o caso de consumo direto pelo navegador.

**(c) Backend com banco de dados real**
- Prós: é o que a arquitetura de dados do próprio pacote de especificação descreve como alvo
  (`RAW → STAGING → CORE → SEMANTIC → MARTS`, com RLS, auditoria, CDC) — resolve não só o problema
  de PII, mas também outras lacunas já registradas (sem controle de acesso por perfil, sem
  auditoria de escrita, sem RLS). Permite consultas/filtros que um arquivo JSON estático não
  permite bem em escala.
- Contras: é uma mudança de arquitetura maior, não um incremento — o projeto hoje é
  deliberadamente "site estático sem backend" (GitHub Pages); adicionar banco de dados implica
  hospedagem, autenticação de API, custo recorrente, e um esforço de implementação/manutenção muito
  maior que qualquer item desta wave. Fora de escopo para decidir ou implementar aqui.

**(d) Anonimizar/hashear PII antes de persistir**
- Prós: pode ser feito com o mesmo padrão GitHub Actions + JSON versionado, sem trocar
  infraestrutura nem tornar nada privado; reduz o risco de exposição de PII "em claro" mesmo que o
  repositório continue público.
- Contras: **perde a capacidade de resolução de identidade por nome/telefone** — a própria lógica
  de `js/jornada.js:864-901` usa nome normalizado como um dos sinais de chave de cliente (prioridade
  `COMPANY_ID > CONTACT_ID > LEAD_ID > nome normalizado > DEAL isolado`); hashear o nome sem manter
  também o valor em claro em algum lugar consultável inviabiliza esse sinal para qualquer análise
  futura que precise decidir se duas grafias diferentes são o mesmo cliente. Hash reversível
  (ex.: um mapa hash→nome mantido só localmente) reintroduziria o mesmo problema em outro arquivo;
  hash irreversível (ex.: SHA-256) resolve a exposição mas é permanente — não dá para "desfazer"
  depois se a decisão for revista.

Nenhuma dessas quatro é superior às outras em todos os eixos — a escolha depende de quanto controle
de acesso o negócio já tem hoje sobre "quem vê dado de cliente", de orçamento para
hospedagem/backend, e de quão importante é preservar resolução de identidade por nome/telefone para
os relatórios futuros do Intelligence Hub (Customer 360, Entity Resolution — Agente 04).

## Riscos

1. **Risco já mitigado por esta tarefa, mas que reaparece se alguém pular o bloqueio acima**: gerar
   um snapshot com `transformarNegocioParaStaging`/`transformarLeadParaStaging` e commitá-lo em
   `relatorios/` sem primeiro resolver a persistência (seção anterior) recriaria, para PII de
   cliente, o mesmo tipo de incidente que o webhook exposto já foi para uma credencial — só que sem
   uma ação de revogação disponível (não dá para "revogar" o nome/telefone de um cliente do jeito
   que se revoga um webhook).
2. **Contrato ainda não validado contra dados reais do Bitrix.** Como toda a Wave 1 e esta tarefa,
   não houve acesso à API Bitrix24 real de nenhum dos dois portais — o contrato foi derivado de
   `ENTIDADES` (`js/config.js`) e do uso real em `js/jornada.js`/`js/data-trust-score.js`, mas
   campos customizados (`UF_CRM_*`) além do único já mapeado (`UF_CRM_1770928318695`) podem existir
   e não estão neste contrato — mesma lacuna que o Agente 02 (Bitrix Discovery) já está encarregado
   de fechar na Wave 2.2 (item 7 do plano do Agente 00).
3. **`stagingValidarContraSchema` não checa tipo, só obrigatoriedade.** Um valor do tipo errado
   (ex.: `valor` como string não numérica) passa despercebido pela validação hoje — decisão
   consciente de escopo (ver seção "O que o contrato deliberadamente NÃO inclui"), não uma omissão
   descoberta tarde.
4. **`extraido_via` depende de disciplina de quem chamar a função** — nada no código impede alguém
   de passar a URL do webhook nesse campo por engano (o contrato documenta que não deve, mas não
   há validação de formato). Se este arquivo vier a ser conectado a uma extração real no futuro,
   vale adicionar uma checagem simples (ex.: rejeitar valores que pareçam URL) antes de qualquer
   persistência.
5. **A armadilha de `assert.deepEqual` em arrays de contextos `vm` diferentes** (documentada na
   seção de testes) pode se repetir em qualquer suíte futura que compare arrays retornados de um
   `carregarScriptClassico` — vale considerar documentar isso no próprio
   `tests/helpers/carregar-script-classico.mjs` ou em `QA_SUITE_TESTES_INICIAL.md` como nota para
   quem escrever a próxima suíte (não fiz essa edição aqui por estar fora do escopo desta tarefa,
   que não deveria tocar em outros arquivos além dos entregáveis pedidos).

## Confiança

- **Alta confiança**: o catálogo de campos dos dois contratos (nomes, tipos, obrigatoriedade
  proposta, origem Bitrix) — derivado por leitura direta de `js/config.js` (`ENTIDADES.negocios`,
  `ENTIDADES.leads`), `js/jornada.js` e `js/data-trust-score.js`, com correspondência 1:1
  confirmada campo a campo. A execução da suíte de testes (62/62 passando) foi confirmada nesta
  sessão, não presumida.
- **Alta confiança** também no bloqueio de privacidade em si: a visibilidade pública do repositório
  já havia sido confirmada por verificação direta na síntese do Agente 00 (não presumida nesta
  tarefa), e a presença de campos PII em `crm.lead.list`/`crm.deal.list` é um fato conhecido do
  domínio do Bitrix24 CRM (nome/telefone/e-mail de lead são o propósito central da entidade), não
  uma suposição.
- **Média confiança**: a convenção de versionamento semântico do `schema_version` (patch/minor/major)
  é uma proposta desta tarefa, não uma prática já adotada em outro lugar do projeto para comparar
  — não há precedente no repositório de versionamento de schema para validar contra.
- **Não verificável nesta sessão**: se existem campos customizados (`UF_CRM_*`) adicionais em
  produção que deveriam entrar no contrato de Negócios além do já mapeado, e se a estrutura real de
  `crm.lead.list` da Total Trac diverge da AtlasGR em algum campo — ambos dependem de acesso à API
  Bitrix24 real, que esta sessão não tem (mesma limitação de todas as waves anteriores).
- Este documento e a implementação cobrem só Negócios e Leads, conforme escopo desta tarefa — não
  Empresas, Contatos ou Atividades (também listadas em `ENTIDADES`), que ficariam para uma extensão
  futura do mesmo contrato se o usuário decidir que vale a pena.
