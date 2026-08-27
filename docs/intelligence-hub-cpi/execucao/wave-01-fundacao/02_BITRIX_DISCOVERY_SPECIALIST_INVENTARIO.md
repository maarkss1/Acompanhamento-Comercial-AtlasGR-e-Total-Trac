# Agente 02 — Bitrix Discovery Specialist

Data da inventariação: 2026-08-27. Base: código-fonte do repositório
`Acompanhamento-Comercial-AtlasGR-e-Total-Trac` no estado atual do checkout local
(sem acesso à API Bitrix24 ao vivo nesta sessão). Todos os achados abaixo são
citações diretas do código; nada foi inferido sem evidência de arquivo/linha.

Arquivos lidos integralmente: `js/bitrix-api.js`, `js/config.js`, `js/extrator.js`.
Arquivos lidos por trecho relevante (grep + leitura de contexto):
`js/catalogo-relatorios.js`, `js/jornada.js`, `js/sdr.js`, `js/forecast.js`,
`js/ui.js`, `js/exportacoes.js`, `js/cockpit.js`, `scripts/forecast-semanal.mjs`,
`extracao.html`, `totaltrac-extracao.html`. Também foram cruzadas (não tomadas
como verdade absoluta, mas usadas como pista e checadas contra o código real)
duas auditorias pré-existentes no repo: `AUDITORIA_ESTADO_ATUAL.md` (2026-08-15)
e `COCKPIT_COMERCIAL.md`.

## Resumo executivo

A ferramenta é 100% client-side (HTML+JS vanilla, sem backend, sem bundler) e
fala com o Bitrix24 fazendo `fetch` direto do navegador do usuário para a URL
do webhook de entrada, com paginação manual via `start`/`next`. Ela cobre bem
as 5 entidades centrais do CRM (Negócios, Leads, Empresas, Contatos,
Atividades) mais Usuários, com descoberta dinâmica de campos (inclusive
`UF_CRM_*`) via `crm.*.fields` na extração genérica e no modo "Extração
completa". Os relatórios prontos (Jornada, Forecast, SDR, Catálogo de ~20
relatórios), porém, usam uma lista fixa e bem mais estreita de campos, e
praticamente nenhum campo `UF_CRM_*` customizado além de um único campo
("Data do contrato assinado", `UF_CRM_1770928318695`) — ou seja, o Bitrix
provavelmente tem mais dados úteis (motivo de perda, setor, porte etc.) do
que a ferramenta hoje extrai para qualquer relatório fixo.

Existe uma funcionalidade de escrita de volta no Bitrix (`crm.item.update`,
em `js/exportacoes.js`/`js/ui.js`) para Negócio/Lead/Empresa/Contato — não é
só leitura. Há tratamento de erro e retentativa robustos (timeout, backoff
exponencial, distinção entre erro temporário e definitivo, tratamento
específico de `QUERY_LIMIT_EXCEEDED`). Não há, porém, nenhum versionamento
real dos dados extraídos: cada extração manual sobrescreve o estado em
memória e é exportada para arquivo local (CSV/JSON) — a única exceção é o
Forecast semanal automatizado via GitHub Actions, que acumula histórico em
`relatorios/forecast-semanal/historico.json` e arquivos datados.

Achado de segurança confirmado (não é apenas risco teórico): o webhook de
produção da AtlasGR, incluindo o token de autenticação, está **hardcoded em
texto puro em pelo menos três arquivos versionados no repositório** —
`js/config.js`, `extracao.html` (atributo `value`/`placeholder` do campo de
input) e `scripts/forecast-semanal.mjs` (fallback quando a variável de
ambiente não está definida). Qualquer pessoa com acesso de leitura ao
repositório (ou ao site publicado via GitHub Pages) tem esse webhook.

A Total Trac, diferentemente da AtlasGR, não tem webhook fixo (conexão
manual) e — achado relevante — **usa a mesma estrutura de funil/estágio
(`ENTIDADES.negocios.categorias`/`estagiosPorCategoria`) hardcoded para
AtlasGR**, já que `ENTIDADES` em `js/config.js` é um objeto único, não
particionado por empresa. Isso não impede a extração genérica (que descobre
campos e pode aceitar `CATEGORY_ID`/`STAGE_ID` livres digitados), mas os
rótulos de categoria/estágio pré-preenchidos nos seletores da UI da Total
Trac são, tecnicamente, os da AtlasGR — não verificado se coincidem com a
estrutura real do Bitrix da Total Trac.

## Entidades Bitrix24 consumidas (com evidência)

| Entidade | Método(s) de listagem | Método de descoberta de campos | Evidência (arquivo) |
|---|---|---|---|
| Negócios (Deals) | `crm.deal.list` | `crm.deal.fields` | `js/config.js:53-54` (`ENTIDADES.negocios`), `js/config.js:356` (`SUBENTIDADES_TUDO`), usado também em `js/jornada.js:818`, `js/sdr.js:226/409/1162/1213`, `js/forecast.js:134/410`, `js/catalogo-relatorios.js:11`, `js/cockpit.js:340`, `scripts/forecast-semanal.mjs:256` |
| Categorias de negócio (funil) | `crm.category.list?entityTypeId=2` | — | `js/jornada.js:90` (`buscarMetadadosFunisEEstagios`) |
| Estágios de negócio (por categoria) | `crm.status.list` (`filter[ENTITY_ID]=DEAL_STAGE[_catId]`) | — | `js/jornada.js:96-99`; réplica no Node em `scripts/forecast-semanal.mjs:231` |
| Histórico de mudança de estágio | `crm.stagehistory.list` (`entityTypeId=2`, filtro `@OWNER_ID`, lotes de 100 IDs) | — | `js/jornada.js:151-181` (`buscarHistoricoEstagios`), também referenciado em `extracao.html:184` e `totaltrac-extracao.html:184` (checkbox "Incluir histórico real de mudanças de estágio") |
| Linhas de produto por negócio | `crm.deal.productrows.get` (uma chamada por ID de negócio — N+1) | — (lista fixa `CAMPOS_PRODUTO_BITRIX`, `js/config.js:403-422`) | `js/extrator.js:441`, `js/cockpit.js:247` |
| Leads | `crm.lead.list` | `crm.lead.fields` | `js/config.js:128-129`; também `js/sdr.js:416/433/1147/1198`, `js/jornada.js:848`, `js/catalogo-relatorios.js:33/284` |
| Empresas (Companies) | `crm.company.list` (lista) / `crm.company.get` (individual, com cache) | `crm.company.fields` | `js/config.js:165-166`; `crm.company.get` usado em `js/extrator.js:433` (nome do cliente por produto); listas em `js/jornada.js:846`, `js/sdr.js:491/1230`, `js/catalogo-relatorios.js:18/303`, `js/cockpit.js:343`, `js/forecast.js:139/421` |
| Contatos | `crm.contact.list` | `crm.contact.fields` | `js/config.js:180-181`; `js/jornada.js:847`, `js/sdr.js:483/1223` |
| Atividades (ligações, reuniões, tarefas, e-mail, WhatsApp) | `crm.activity.list` | `crm.activity.fields` | `js/config.js:197-198`; `js/sdr.js:88/388/1136` |
| Origens (Source) / Status de origem | `crm.status.list` com `filter[ENTITY_ID]=SOURCE` | — | `js/bitrix-api.js:480` (`carregarOrigens`), `js/catalogo-relatorios.js:2/31`, `js/sdr.js:350/1105` |
| Usuários (vendedores/responsáveis) | `user.get` | não existe `user.fields` público — lista fixa (`CAMPOS_USUARIO_COMPLETO`, `js/config.js:346-350`) | `js/config.js:236`; `carregarVendedores` em `js/bitrix-api.js:444` |
| Item CRM genérico (leitura/escrita universal) | `crm.item.get` / `crm.item.fields` / `crm.item.update` | `crm.item.fields` | `js/ui.js:581-582/656`; `entityTypeId` mapeado em `js/exportacoes.js:284-288` para Deal(2)/Lead(1)/Company(4)/Contact(3) — não há uso de Smart Process Automation (SPA) com `entityTypeId` customizado |

Não verificável sem acesso à API real: se existem outras entidades no Bitrix
da AtlasGR/Total Trac (ex.: SPA/processos inteligentes customizados,
Invoices, Quotes/Orçamentos, Timeline/comentários de negócio) — nenhuma
referência a esses métodos foi encontrada no código.

## Campos por entidade (padrão e customizados)

### Negócios (`crm.deal.list`)
Campos padrão declarados em `ENTIDADES.negocios.campos` (`js/config.js:102-124`):
`ID`, `TITLE`, `STAGE_ID`, `CATEGORY_ID`, `OPPORTUNITY`, `CURRENCY_ID`,
`DATE_CREATE`, `DATE_MODIFY`, `MOVED_TIME`, `CLOSEDATE`, `BEGINDATE`,
`ASSIGNED_BY_ID`, `CREATED_BY_ID`, `MODIFY_BY_ID`, `MOVED_BY_ID`,
`COMPANY_ID`, `CONTACT_ID`, `SOURCE_ID`, `CLOSED`, `LEAD_ID`.
Único campo customizado hardcoded: `UF_CRM_1770928318695` — "Data do contrato
assinado (campo oficial)" (`js/config.js:100/114`, também usado em
`js/jornada.js:573` — `fecharDataDeal`).

Campos adicionais usados apenas em relatórios do catálogo/forecast (não
listados em `ENTIDADES.negocios.campos`, mas selecionados explicitamente nas
queries): `STAGE_SEMANTIC_ID`, `PROBABILITY`, `SOURCE_ID`, `UTM_SOURCE`,
`UTM_MEDIUM`, `UTM_CAMPAIGN`, `UTM_CONTENT`, `UTM_TERM`,
`LAST_ACTIVITY_TIME`, `LAST_ACTIVITY_BY` — evidência: `js/catalogo-relatorios.js:12-15`.

Na "Extração completa" e na extração manual genérica, todos os campos do
negócio (incluindo qualquer `UF_CRM_*` adicional configurado no Bitrix) são
descobertos dinamicamente via `crm.deal.fields` (`buscarCamposDinamicos`,
`js/extrator.js:158-162`) — logo, campos customizados além do de contrato
assinado **existem potencialmente no Bitrix e são acessíveis por essa via**,
mas não alimentam nenhum relatório pronto hoje (confirmado por comentário em
`js/cockpit.js:808`: "'motivo de perda' (UF_CRM_* ou nativo) — não há
relatório nem extração que use esse [campo]").

### Leads (`crm.lead.list`)
`ID`, `TITLE`, `STATUS_ID`, `SOURCE_ID`, `OPPORTUNITY`, `DATE_CREATE`,
`DATE_MODIFY`, `ASSIGNED_BY_ID`, `COMPANY_ID`, `COMPANY_TITLE`, `CONTACT_ID`,
`NAME`, `LAST_NAME`, `PHONE`, `EMAIL` (`js/config.js:145-161`). Nos
relatórios do catálogo, também: `UTM_SOURCE/MEDIUM/CAMPAIGN/CONTENT/TERM`,
`CREATED_BY_ID`, `DATE_CLOSED`, `LAST_ACTIVITY_TIME`, `LAST_ACTIVITY_BY`
(`js/catalogo-relatorios.js:35-36`). Nenhum `UF_CRM_*` de lead hardcoded;
descoberta dinâmica via `crm.lead.fields` disponível na extração genérica.

### Empresas (`crm.company.list`)
`ID`, `TITLE`, `COMPANY_TYPE`, `INDUSTRY`, `DATE_CREATE`, `ASSIGNED_BY_ID`
(`js/config.js:170-176`). Em jornada/catálogo, também `PHONE`, `EMAIL`
(`js/jornada.js:846`, `js/catalogo-relatorios.js:18/303`).

### Contatos (`crm.contact.list`)
`ID`, `NAME`, `LAST_NAME`, `COMPANY_ID`, `DATE_CREATE`, `ASSIGNED_BY_ID`,
`PHONE`, `EMAIL` (`js/config.js:185-193`).

### Atividades (`crm.activity.list`)
`ID`, `SUBJECT`, `TYPE_ID`, `PROVIDER_TYPE_ID`, `DIRECTION`, `COMPLETED`,
`STATUS`, `RESPONSIBLE_ID`, `OWNER_ID`, `OWNER_TYPE_ID`, `PRIORITY`,
`CREATED`, `LAST_UPDATED`, `START_TIME`, `END_TIME`, `DEADLINE`,
`DESCRIPTION` (`js/config.js:214-232`).

### Usuários (`user.get`)
`ID`, `XML_ID`, `NAME`, `LAST_NAME`, `SECOND_NAME`, `ACTIVE`,
`WORK_POSITION`, `EMAIL`, `LOGIN`, `PERSONAL_PHONE`, `PERSONAL_MOBILE`,
`PERSONAL_WWW`, `PERSONAL_BIRTHDAY`, `PERSONAL_PHOTO`, `LAST_LOGIN`,
`DATE_REGISTER`, `TIME_ZONE`, `UF_DEPARTMENT`, `IS_ONLINE`
(`js/config.js:241-260`). Lista fixa — Bitrix não expõe `user.fields`.

### Linhas de produto (`crm.deal.productrows.get`)
`PRODUCT_NAME`, `QUANTITY`, `MEASURE_NAME`, `PRICE`, `PRICE_ACCOUNT`,
`PRICE_BRUTTO`, `PRICE_NETTO`, `PRICE_EXCLUSIVE`, `DISCOUNT_RATE`,
`DISCOUNT_SUM`, `DISCOUNT_TYPE_ID`, `TAX_RATE`, `TAX_INCLUDED`,
`PRODUCT_ID`, `ID`, `TYPE`, `SORT`, `CUSTOMIZED` (`js/config.js:403-421`,
lista fixa — sem método `*.fields` para esta entidade).

### Histórico de estágio (`crm.stagehistory.list`)
Campos selecionados explicitamente: `ID`, `OWNER_ID`, `STAGE_ID`,
`CATEGORY_ID`, `STAGE_SEMANTIC_ID`, `CREATED_TIME` (`js/jornada.js:161`).

## Métodos de extração e limitações (paginação, filtros, erros)

**Paginação**: baseada no padrão `start`/`next` do Bitrix REST, implementada
em três lugares equivalentes: `carregarListaPaginada` (`js/bitrix-api.js:409-431`,
para listas auxiliares como vendedores/origens), `executarLoteExtracao`
(`js/extrator.js:1-76`, extração manual) e `extrairEntidadeCompleta`
(`js/extrator.js:164-194`, modo "Extração completa"). Cada requisição usa
`order[ID]=ASC` por padrão quando o método aceita ordenação
(`metodoAceitaOrderId`, `js/bitrix-api.js:366-368`) para evitar páginas
inconsistentes se o CRM mudar durante a extração.

**Deduplicação**: `mesclarSemDuplicarPorId` (`js/bitrix-api.js:386-401`)
descarta registros repetidos entre páginas por `ID`, contando quantos foram
ignorados.

**Teto de segurança por lote**: `TAMANHO_LOTE_SEGURANCA = 20000` registros por
clique em "Extrair"/"Continuar" (`js/bitrix-api.js:512`) — na extração manual
genérica, uma base maior que isso exige clicar em "Continuar extração"
manualmente. No modo "Extração completa" (`SUBENTIDADES_TUDO`), esse teto é
explicitamente removido (`LIMITE_POR_ENTIDADE_TUDO = Number.POSITIVE_INFINITY`,
`js/config.js:363`, comentário: "não truncar extrações completas
silenciosamente").

**Throttling / rate limit**: `ATRASO_ENTRE_PAGINAS_MS = 350` ms entre páginas
(~3 chamadas/seg, dentro do limite padrão do Bitrix) — `js/bitrix-api.js:513`.
Erro específico `QUERY_LIMIT_EXCEEDED` do Bitrix é tratado como falha
temporária e retentado (`js/bitrix-api.js:609-611`).

**Retentativa/erros**: `bitrixFetchComRetentativa` (`js/bitrix-api.js:566-651`)
implementa timeout de 30s por requisição via `AbortController`
(`TIMEOUT_REQUISICAO_MS`), até `TENTATIVAS_MAX = 5` tentativas com backoff
exponencial (1s, 2s, 4s, 8s, capado em 8s), e distingue explicitamente:
- Erros temporários (HTTP 429/5xx, timeout, `QUERY_LIMIT_EXCEEDED`) → retry.
- Erros definitivos (Bitrix retornou `error`/`error_description`, ou HTTP
  4xx exceto 429) → falha imediata, sem retry, mensagem explica a causa
  provável (filtro inválido, permissão do webhook, campo inexistente).
Em caso de falha após todas as tentativas, a UI oferece "Continuar extração"
retomando do ponto onde parou (`ctx.acumulado`, `js/extrator.js:63-69`).

**Cache local (não é versionamento)**: cada resposta HTTP crua é cacheada em
`localStorage` por 5 minutos (`atlas_cache_*`, TTL fixo em
`js/bitrix-api.js:585`) para evitar rechamadas idênticas na mesma sessão;
`window.limparCacheBitrix()` e `window.FORCAR_ATUALIZACAO_BITRIX` permitem
invalidar. Isso é cache de curtíssimo prazo, não histórico de dados.

**Filtros aplicados**: por entidade — categoria (`CATEGORY_ID`), estágio
(campo definido por `campoEstagio`, ex. `STAGE_ID`/`STATUS_ID`/`COMPLETED`),
vendedor/responsável (`ASSIGNED_BY_ID` ou `RESPONSIBLE_ID` para atividades),
origem (`SOURCE_ID`), campo personalizado livre (código+valor digitados pelo
usuário), e período por um campo de data configurável por entidade
(`camposData` em `ENTIDADES`, com filtro `>=`/`<=` formatado em ISO com fuso
`-03:00` fixo — `js/bitrix-api.js:314-355`). Ver seção "Diferenças
AtlasGR x Total Trac" quanto ao fuso fixo.

**Escrita de volta no Bitrix (não é só leitura)**: `crm.item.update` grava
alterações de campo em Negócio/Lead/Empresa/Contato
(`executarSyncBitrix`, `js/exportacoes.js:649-665`; UI de metadados em
`js/ui.js:540-624`). Exige digitar "SINCRONIZAR" e marcar um checkbox de
confirmação antes de habilitar o botão (`atualizarBotaoSync`,
`js/exportacoes.js:624`). Toda tentativa (sucesso ou falha) é registrada em
um log de auditoria **local ao navegador** (`localStorage`,
`CHAVE_AUDITORIA_SYNC_LOCAL`, `js/exportacoes.js:632-641`) — não é um audit
trail de servidor, pode ser apagado pelo próprio usuário
(`limparAuditoriaSync`).

**Não verificável sem acesso à API real**: se o webhook de produção
efetivamente tem permissão de escrita habilitada no Bitrix hoje, e se algum
`crm.item.update` real já foi executado em produção.

## Diferenças AtlasGR x Total Trac

- **Webhook**: AtlasGR tem webhook fixo hardcoded (`WEBHOOK_FIXO_PADRAO`,
  `js/bitrix-api.js:7`); Total Trac não tem webhook padrão — getter retorna
  string vazia (`js/config.js:35`) e a página `totaltrac-extracao.html`
  instrui o usuário a colar e salvar manualmente (linha 111: "A Total Trac
  ainda não tem um webhook fixo configurado nesta ferramenta").
- **Configuração de funil/estágio compartilhada e potencialmente incorreta
  para Total Trac**: `ENTIDADES` em `js/config.js` é um único objeto global
  (não existe `ENTIDADES_TOTALTRAC`); os comentários do próprio arquivo
  (`js/config.js:45-48`) dizem que os metadados de categoria/estágio foram
  "confirmados via API em 08/08/2026" — mas não especificam de qual empresa,
  e o padrão de nomes/cores (Comercial, Financeiro, Implantação Logística
  etc.) é consistente com o domínio da AtlasGR (seguro logístico), não com
  Total Trac. **Não verificável sem acesso à API real da Total Trac** se a
  estrutura de categorias/estágios usada nos seletores da UI coincide com o
  Bitrix real dela — a extração genérica funciona de qualquer forma porque
  aceita `CATEGORY_ID`/`STAGE_ID` digitados livremente e a Jornada do Cliente
  descobre categorias/estágios dinamicamente via `crm.category.list`/
  `crm.status.list` com fallback para o hardcoded (`js/jornada.js:84-124`).
- **Metas mensais** (`METAS_FORECAST_MENSAL_PADRAO`, `js/config.js:335-338`):
  valores únicos, não diferenciados por empresa — mesmo objeto usado
  independente de `empresaAtiva()`.
  Duplicado, com os mesmos valores, em `scripts/forecast-semanal.mjs`
  (comentário explícito no código apontando a necessidade de manter os dois
  sincronizados manualmente).
  O script Node (`forecast-semanal.mjs`) só roda contra o webhook fixo da
  AtlasGR (fallback hardcoded, ver seção Riscos) — **não há automação
  equivalente rodando para Total Trac** (nenhuma referência a Total Trac em
  `scripts/forecast-semanal.mjs` ou em `.github/workflows/`).
- **Persistência de webhook por marca**: `sufixoStorage` diferente por
  empresa (`""` para AtlasGR, `"__totaltrac"` para Total Trac,
  `js/config.js:20/30`) evita que salvar um webhook em uma marca sobrescreva
  o da outra no mesmo navegador.
- **Cor/identidade visual** (`corPrimaria`/`corSecundaria*`, `logoSvg`) e
  arquivos de página são distintos (`totaltrac-*.html`), mas a lógica de
  extração (`js/*.js`) é 100% compartilhada entre as duas marcas — não há
  bifurcação de código por empresa, só de configuração e templates HTML.

## Riscos (inclui segurança de credenciais, se aplicável)

1. **[CRÍTICO — confirmado] Webhook de produção da AtlasGR em texto puro,
   versionado em pelo menos 3 arquivos do repositório**:
   - `js/config.js:7` — constante `WEBHOOK_FIXO_PADRAO`.
   - `extracao.html` (linha do `<input id="webhook" ... value="..." placeholder="...">`)
     — o mesmo valor aparece duas vezes no HTML (`value` e `placeholder`).
   - `scripts/forecast-semanal.mjs:29` — usado como fallback quando
     `BITRIX_WEBHOOK_URL` não está definido como Secret do GitHub Actions.
   O valor segue o padrão `https://atlasgr.bitrix24.com.br/rest/{ID}/{token}/`
   (token de 16 caracteres alfanuméricos visível nas três ocorrências). Como
   o repositório é publicado via GitHub Pages (`pages.yml`, conforme
   `AUDITORIA_ESTADO_ATUAL.md`, seção 13), **qualquer visitante do site
   publicado já vê esse webhook diretamente no HTML servido**, mesmo sem
   acessar o repositório Git. Recomenda-se tratar esse webhook como
   comprometido e revogá-lo/regenerá-lo no Bitrix24, movendo o valor de
   produção para fora do código-fonte (variável de ambiente/secret em todos
   os pontos de uso, incluindo o valor default do campo de input HTML).
2. **[Ofuscação local não é criptografia — reconhecido no próprio código]**:
   o webhook salvo pelo usuário no `localStorage` é ofuscado por XOR+base64
   com uma chave fixa embutida no código-fonte público
   (`CHAVE_OFUSCACAO_WEBHOOK`, `js/bitrix-api.js:39`) — o próprio comentário
   do arquivo (linhas 24-38) admite que isso não é proteção real contra
   alguém com acesso ao navegador (DevTools, extensão maliciosa, backup de
   perfil).
3. **Escrita no CRM de produção sem controle de acesso de aplicação**:
   `crm.item.update` (via UI de sincronização) permite editar Negócio, Lead,
   Empresa e Contato diretamente; qualquer pessoa com o webhook (que, dado o
   achado 1, está exposto publicamente) pode potencialmente escrever no CRM
   se o webhook tiver escopo de escrita habilitado no Bitrix. Não verificável
   sem acesso à API real se o webhook atual tem esse escopo habilitado.
4. **N+1 de performance em `crm.deal.productrows.get`**: uma chamada HTTP por
   negócio para buscar produtos (`js/extrator.js:441`, `js/cockpit.js:247`) —
   para bases grandes de negócios, isso é lento e aumenta a chance de
   esbarrar em `QUERY_LIMIT_EXCEEDED` ou timeout no meio da extração (mitigado
   parcialmente por retry, mas não eliminado).
5. **Duplicação de lógica entre navegador e Node**: metas mensais e regras de
   fallback de forecast existem tanto em `js/config.js`/`js/jornada.js`
   quanto em `scripts/forecast-semanal.mjs`, com sincronização manual — risco
   de divergência silenciosa entre o relatório interativo e o automatizado
   (mesmo ponto já registrado em `AUDITORIA_ESTADO_ATUAL.md`, seção 11/13,
   confirmado aqui pela leitura direta do código).
6. **Configuração de funil/estágio da Total Trac não confirmada**: ver seção
   "Diferenças AtlasGR x Total Trac" — usar rótulos de categoria/estágio da
   AtlasGR como fallback visual para Total Trac pode gerar confusão na UI
   (embora não quebre a extração genérica, que aceita valores livres).
7. **Sem verificação, nesta sessão, de que o webhook exposto ainda está
   ativo** — não verificável sem acesso à API real; deve ser tratado como
   "assumir comprometido" independentemente disso.

## Recomendações priorizadas

**P0 — segurança, antes de qualquer nova extração/expansão:**
1. Revogar/regenerar o webhook da AtlasGR no Bitrix24 (o valor atual está
   público via GitHub Pages) e remover o valor literal de `js/config.js`,
   `extracao.html` e `scripts/forecast-semanal.mjs`, substituindo por: campo
   vazio + instrução de colar (como já é feito para Total Trac) no HTML, e
   variável de ambiente obrigatória (sem fallback hardcoded) no script Node.
2. Confirmar no Bitrix24 se o escopo do webhook inclui permissão de escrita
   (`crm.item.update`); se a intenção é só leitura para os relatórios,
   restringir o escopo do webhook a leitura.
3. Auditar se o repositório GitHub é público; se for, tratar isso como
   incidente de exposição de credencial (não apenas como "boa prática a
   melhorar").

**P1 — cobertura de dados (para os próximos agentes de dados/métricas):**
4. Rodar (com acesso real à API, fora desta sessão) `crm.deal.fields` e
   `crm.lead.fields` para levantar a lista completa de `UF_CRM_*` existentes
   no Bitrix da AtlasGR e da Total Trac — hoje só um campo customizado
   (data de contrato assinado) é usado por qualquer relatório pronto.
5. Confirmar via API real (Agente 01/04, Enterprise Data Architect / Entity
   Resolution) se a estrutura de `CATEGORY_ID`/`STAGE_ID` hardcoded em
   `ENTIDADES.negocios` corresponde de fato ao Bitrix da Total Trac, já que
   ela é hoje reaproveitada sem confirmação.
6. Investigar se existe campo de "motivo de perda" nativo ou customizado no
   Bitrix (nenhuma referência encontrada no código atual) — importante para
   qualquer métrica de win/loss mais rica.

**P2 — robustez de extração:**
7. Resolver o N+1 de `crm.deal.productrows.get` (batch, se o Bitrix suportar
   `batch.json`, ou paralelismo controlado).
8. Unificar a lógica de metas/forecast duplicada entre navegador e Node em
   um único módulo fonte, para eliminar risco de divergência.

## Dependências e próximos agentes indicados

- **Agente 01 — Enterprise Data Architect**: precisa deste inventário para
  desenhar o modelo de dados canônico; em especial, decidir se os `UF_CRM_*`
  ainda não descobertos (achado P1.4) entram no escopo da Wave 1.
- **Agente 03 — Data Quality Guardian**: os campos "não usados por nenhum
  relatório" (ex. `UF_CRM_*` além do de contrato assinado, possível motivo de
  perda) são candidatos a checagem de completude/qualidade antes de virarem
  métricas oficiais.
- **Agente 04 — Entity Resolution Specialist**: a lógica de duplicidade de
  empresas já existe parcialmente (`construirSinaisDuplicidadeEmpresas`,
  `js/jornada.js`) por nome/e-mail/telefone — ponto de partida, não solução
  pronta.
- **Agente 05 — Metrics Governance Agent**: as fórmulas de forecast
  (probabilidade fallback, buckets, pipeline ponderado) já existem
  implementadas em `js/jornada.js`/`js/catalogo-relatorios.js` e duplicadas
  em `scripts/forecast-semanal.mjs` — precisam de definição formal única
  (fonte, fórmula, owner) antes de virar métrica "oficial" do Hub.
- **Agente 09_GOVERNANCA_E_SEGURANCA (pasta do programa)**: o achado de
  segurança P0 (webhook exposto) deveria ser escalado imediatamente ao dono
  do repositório, independente da sequência normal de agentes — é uma
  credencial de produção exposta publicamente, não uma melhoria de wave
  futura.

## Confiança e limitações

- **Alta confiança** (evidência direta lida no código-fonte, com
  arquivo/linha citados): lista de métodos Bitrix usados, campos padrão por
  entidade, mecanismo de paginação/retry/cache, existência do webhook
  hardcoded em texto puro em 3 arquivos, existência de `crm.item.update`.
- **Confiança média** (inferido de comentários do próprio código, não de
  teste ao vivo): que o webhook hardcoded ainda está ativo hoje; que a
  estrutura de funil/estágio hardcoded reflete de fato o Bitrix atual da
  AtlasGR (o comentário do código diz "confirmados via API em 08/08/2026",
  mas essa confirmação não foi refeita nesta sessão).
- **Não verificável sem acesso à API Bitrix24 real** (marcado explicitamente
  ao longo do documento):
  - Lista completa de campos `UF_CRM_*` existentes no Bitrix de cada empresa
    além dos poucos citados no código.
  - Se a estrutura de categorias/estágios da Total Trac corresponde à
    hardcoded (que é da AtlasGR).
  - Se o webhook exposto continua válido/ativo.
  - Se o escopo do webhook inclui permissão de escrita.
  - Existência de entidades Bitrix não referenciadas no código (SPA
    customizado, Invoices, Timeline/Comments, Duplicates API nativa etc.).
- **Nenhum campo ou entidade foi inventado**: todo item listado nas seções
  de entidades/campos tem uma citação de arquivo correspondente; onde não foi
  possível confirmar algo, isso foi marcado explicitamente como "não
  verificável sem acesso à API real" em vez de presumido.
