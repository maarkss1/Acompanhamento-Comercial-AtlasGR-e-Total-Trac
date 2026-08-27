# Agente 01 — Enterprise Data Architect

Data do diagnóstico: 2026-08-27. Escopo: repositório
`Acompanhamento-Comercial-AtlasGR-e-Total-Trac`, estado do código na árvore de
trabalho atual (não um commit específico). Este documento é **diagnóstico**:
descreve o que existe no código hoje, não o modelo corporativo alvo do
Intelligence Hub (que está no pacote `docs/intelligence-hub-cpi/ATLASGR_INTELLIGENCE_HUB_CPI/`).

## Resumo executivo

A ferramenta é um **dashboard 100% client-side** (HTML/CSS/JS puro, sem
bundler, sem framework, sem backend próprio e sem banco de dados). Não existe
hoje nenhum "modelo corporativo de dados" no sentido de camadas
bronze/silver/gold, chaves estáveis persistidas ou um repositório central: os
dados do Bitrix24 são buscados **ao vivo, no navegador**, a cada sessão, via
`fetch` direto para o webhook REST do Bitrix, processados inteiramente em
memória (variáveis JS globais) e descartados ao fechar a aba — com exceção de
um cache de 5 minutos e algumas "fotos" agregadas em `localStorage`, e de um
único artefato realmente persistido em repositório: `relatorios/forecast-semanal/historico.json`,
gerado por uma automação Node semanal.

AtlasGR e Total Trac são duas empresas com **dois portais Bitrix24 distintos**
(domínios diferentes: `atlasgr.bitrix24.com.br` vs. `totaltrac.bitrix24.com.br`),
não um portal único filtrado — ou seja, são duas fontes de dados
completamente independentes, acessadas pelo mesmo código-fonte compartilhado,
diferenciado em runtime por um atributo `data-empresa` no HTML de cada
página. Isso funciona bem para segregar o *dado remoto* (cada empresa só
enxerga seu próprio Bitrix), mas a segregação do *dado local* (localStorage)
é **inconsistente**: parte das chaves tem sufixo por empresa e parte não —
ver achado de risco abaixo.

A "chave de identidade de cliente" que o pacote de especificação do
Intelligence Hub pede (`03_ENTITY_RESOLUTION.txt`: `MASTER_ENTITY_ID`,
`source_record_ids[]`, `confidence`, `match_rules[]`) já tem um equivalente
funcional, mas **efêmero e não persistido**, implementado em `js/jornada.js`
(prioridade `COMPANY_ID > CONTACT_ID > LEAD_ID > nome normalizado > DEAL_ID
isolado`, com uma classificação de confiança ALTA/MEDIA/BAIXA). Ele só existe
durante a execução da extração "Jornada do Cliente" e nunca é gravado em
lugar nenhum — cada sessão recalcula do zero.

Em suma: há uma camada de **extração** e uma camada de **negócio/apresentação**
razoavelmente maduras (com cálculos de forecast, jornada, SDR bem
documentados), mas **não há camada de dados corporativa** — não há staging
persistente, não há histórico versionado de fatos (só um histórico agregado
semanal), não há contrato de dados formal, e não há chave mestra de cliente
persistida entre sessões ou entre pessoas.

## Estado atual (inventário com evidências: arquivo + trecho)

### 1. Entidades Bitrix consumidas

Definidas centralmente em `js/config.js:50-291` (objeto `ENTIDADES`):

| Entidade | Método Bitrix | Campos-chave usados | Evidência |
|---|---|---|---|
| Negócios (Deals) | `crm.deal.list` / `crm.deal.fields` | `ID, TITLE, STAGE_ID, CATEGORY_ID, OPPORTUNITY, CURRENCY_ID, DATE_CREATE, DATE_MODIFY, MOVED_TIME, CLOSEDATE, BEGINDATE, UF_CRM_1770928318695, ASSIGNED_BY_ID, CREATED_BY_ID, MODIFY_BY_ID, MOVED_BY_ID, COMPANY_ID, CONTACT_ID, SOURCE_ID, CLOSED, LEAD_ID` | `js/config.js:94-124` |
| Leads | `crm.lead.list` / `crm.lead.fields` | `ID, TITLE, STATUS_ID, SOURCE_ID, OPPORTUNITY, DATE_CREATE, DATE_MODIFY, ASSIGNED_BY_ID, COMPANY_ID, COMPANY_TITLE, CONTACT_ID, NAME, LAST_NAME, PHONE, EMAIL` | `js/config.js:145-161` |
| Empresas | `crm.company.list` / `crm.company.fields` | `ID, TITLE, COMPANY_TYPE, INDUSTRY, DATE_CREATE, ASSIGNED_BY_ID` | `js/config.js:169-176` |
| Contatos | `crm.contact.list` / `crm.contact.fields` | `ID, NAME, LAST_NAME, COMPANY_ID, DATE_CREATE, ASSIGNED_BY_ID, PHONE, EMAIL` | `js/config.js:184-193` |
| Atividades | `crm.activity.list` / `crm.activity.fields` | `ID, SUBJECT, TYPE_ID, PROVIDER_TYPE_ID, DIRECTION, COMPLETED, STATUS, RESPONSIBLE_ID, OWNER_ID, OWNER_TYPE_ID, PRIORITY, CREATED, LAST_UPDATED, START_TIME, END_TIME, DEADLINE, DESCRIPTION` | `js/config.js:214-232` |
| Usuários | `user.get` (sem `*.fields`, lista fixa) | `ID, XML_ID, NAME, LAST_NAME, ACTIVE, WORK_POSITION, EMAIL, LOGIN, ...` | `js/config.js:240-260` |
| Linhas de produto | `crm.deal.productrows.get` (por negócio, N+1) | `PRODUCT_NAME, QUANTITY, PRICE, PRICE_ACCOUNT, DISCOUNT_*, TAX_*, PRODUCT_ID` | `js/config.js:403-422`, `js/extrator.js:441` |
| Histórico de estágio | `crm.stagehistory.list` (`entityTypeId=2`) | `ID, OWNER_ID, STAGE_ID, CATEGORY_ID, STAGE_SEMANTIC_ID, CREATED_TIME` | `js/jornada.js:151-181` |
| Metadados de funil/estágio | `crm.category.list`, `crm.status.list` | categorias e estágios dinâmicos, com fallback hardcoded | `js/jornada.js:84-124` |
| Origens (Source) | `crm.status.list` (`ENTITY_ID=SOURCE`) | `STATUS_ID, NAME` | `js/bitrix-api.js:466-505` |

Confiança: **alta** — lista extraída diretamente do código-fonte de configuração central.

### 2. Chaves e relacionamentos entre entidades

- `Negócio.COMPANY_ID → Empresa.ID`, `Negócio.CONTACT_ID → Contato.ID`,
  `Negócio.LEAD_ID → Lead.ID`, `Negócio.ASSIGNED_BY_ID/CREATED_BY_ID/MODIFY_BY_ID/MOVED_BY_ID → Usuário.ID`
  (`js/config.js:115-123`).
- `Atividade.OWNER_ID + OWNER_TYPE_ID` aponta para Lead(1)/Negócio(2)/Contato(3)/Empresa(4)
  — chave polimórfica, sem tabela de tipos formalizada em código, apenas comentário
  (`js/config.js:223-224`).
- `crm.stagehistory.list` relaciona-se por `OWNER_ID → Negócio.ID` (`js/jornada.js:160-165`).
- **Chave de identidade de "cliente"** (não nativa do Bitrix, construída em runtime,
  só dentro do relatório "Jornada do Cliente"): prioridade
  `COMPANY_ID > CONTACT_ID > LEAD_ID > nome normalizado > DEAL_ID isolado`,
  com confiança ALTA/MEDIA/BAIXA associada a cada regra
  (`js/jornada.js:864-901`, campos `__CLIENTE_KEY`, `__CLIENTE_KEY_TIPO`,
  `__CLIENTE_KEY_CONFIANCA`). Regra de "0 = sem vínculo" tratada explicitamente
  (`idBitrixValido`, `js/jornada.js:11-17`) para não confundir `COMPANY_ID=0` com
  uma empresa real. Sinais adicionais de duplicidade por nome/e-mail/telefone
  normalizado são calculados só para **auditoria**, nunca para fundir
  automaticamente registros (`js/jornada.js:183-230`, comentário explícito em
  `js/jornada.js:854-855`: "Telefone/e-mail continuam sendo sinal de auditoria,
  nunca fusão automática").
- Único campo customizado (`UF_CRM_*`) hardcoded em regra de negócio:
  `UF_CRM_1770928318695` ("Data do contrato assinado (campo oficial)"),
  usado em `fecharDataDeal` (`js/jornada.js:573`) como data de fechamento
  preferencial sobre `CLOSEDATE`. Confirmado também em `AUDITORIA_ESTADO_ATUAL.md:149-161`.

Confiança: **alta** para a lógica em si (lida diretamente no código);
**não verificável** se essa é a única chave de identidade de cliente que
faz sentido para o negócio real, ou se o Bitrix real tem outros campos
(ex.: CNPJ) que poderiam ser um identificador mais forte — isso exigiria
acesso à API Bitrix real ou a alguém do time comercial.

### 3. Persistência de dados (o que sobrevive ao fechar a aba)

Não há banco de dados nem backend. A "persistência" existente é toda em
`localStorage` do navegador (por definição: local a um navegador/dispositivo,
nunca compartilhada entre pessoas) mais um único artefato versionado em git:

| Chave/artefato | Onde é gravado | Sufixo por empresa? | Evidência |
|---|---|---|---|
| Webhook Bitrix (ofuscado XOR+base64) | `localStorage`, chave `atlas-extrator-bitrix-webhook[__totaltrac]` | **Sim** | `js/bitrix-api.js:8,16-18` |
| Cache de resposta HTTP do Bitrix (TTL 5 min) | `localStorage`, chave `atlas_cache_<hash>` | Indiretamente (hash inclui URL, que já contém domínio do webhook) | `js/bitrix-api.js:579-591` |
| Flag de login do portal | `localStorage`, chave `atlas-portal-auth-ok[__totaltrac]` | **Sim** | `js/auth.js:29` |
| Histórico local de Forecast (snapshots diários para o sparkline/Evolução) | `localStorage`, chave `atlas-extrator-historico-forecast[__totaltrac]` | **Sim** | `js/jornada.js:615-621` |
| Metas desdobradas (Cockpit) | `localStorage`, chave `atlas-metas-desdobradas` | **Não** | `js/cockpit.js:1642,1663` |
| Ordem de layout do Cockpit | `localStorage`, chave `atlas-layout-ordem` | **Não** | `js/cockpit.js:1717,1722` |
| Filtros globais da UI | `localStorage`, chave `atlas-filtros-globais` | **Não** | `js/ui.js:38,56` |
| Tema claro/escuro | `localStorage`, chave `atlas-extrator-tema` | **Não** | `js/ui.js:73` |
| Auditoria de sincronização com Bitrix | `localStorage`, chave `atlas-extrator-auditoria-sync` | **Não** | `js/ui.js:632-641` |
| Chave de API de IA (se o usuário configurar) | `localStorage`, chave `atlas-extrator-chave-ia` | **Não** | `js/ui.js:694,1173-1219` |
| Relatórios salvos do Forecast (favoritos) | `localStorage`, chave `atlas-extrator-relatorios-salvos` | **Não** | `js/forecast.js:68-88` |
| **Histórico oficial semanal (único dado versionado em git)** | `relatorios/forecast-semanal/historico.json` + `latest.md` + `AAAA-MM-DD.md`, gerado por `scripts/forecast-semanal.mjs` via GitHub Actions (`forecast-semanal.yml`, cron sexta 13h Brasília) | Só existe para **AtlasGR** (webhook fixo); Total Trac não tem automação equivalente | `js/jornada.js:752-758` (comentário explícito), `AUDITORIA_ESTADO_ATUAL.md:247-253` |

Confiança: **alta**, obtida por grep direto de todos os `localStorage.setItem/getItem` em `js/*.js`.

### 4. Isolamento AtlasGR × Total Trac

- Confirmado via código: são **dois portais Bitrix24 diferentes**
  (`js/bitrix-api.js:7`, `WEBHOOK_FIXO_PADRAO = "https://atlasgr.bitrix24.com.br/rest/..."`;
  placeholders `https://totaltrac.bitrix24.com.br/rest/.../` em
  `totaltrac-extracao.html:114`, `totaltrac-cockpit.html:96`, `totaltrac-forecast.html:95`,
  `totaltrac-home.html:102`, `totaltrac-sdr.html:95`) — não é o mesmo portal
  com filtro de categoria/campo customizado.
  Total Trac **não tem webhook fixo padrão** (`js/config.js:35`, getter retorna `""`),
  então cada usuário precisa colar o webhook manualmente e salvá-lo no navegador.
- Todo o código-fonte (`js/*.js`) é **compartilhado** entre as duas empresas; a
  diferenciação acontece via `data-empresa="atlasgr"|"totaltrac"` no `<html>` de
  cada página HTML e o objeto `MARCAS` (`js/config.js:14-37`), que centraliza
  cor, nome, hash de senha, sufixo de storage e webhook padrão por marca.
- Páginas duplicadas fisicamente por empresa: `cockpit.html`/`totaltrac-cockpit.html`,
  `extracao.html`/`totaltrac-extracao.html`, `forecast.html`/`totaltrac-forecast.html`,
  `sdr.html`/`totaltrac-sdr.html`, `evolucao.html`/`totaltrac-evolucao.html`,
  `home.html`/`totaltrac-home.html` — arquivos HTML separados que carregam os
  mesmos `js/*.js`.

Confiança: **alta**.

### 5. Camada de "negócio"/cálculo (regras aplicadas sobre os dados extraídos)

Documentado em detalhe em `AUDITORIA_ESTADO_ATUAL.md` (seções 6-7, já existente
no repositório e ainda válido para a lógica de `js/*.js`, embora escrito antes
da divisão atual em módulos separados). Achados relevantes para o modelo de
dados, confirmados nesta leitura:
- Regras de forecast (probabilidade fallback, estágios "piloto", metas mensais)
  vivem **duplicadas** em `js/jornada.js` (fonte da verdade, conforme comentário
  em `js/jornada.js:439-446`) e em `scripts/forecast-semanal.mjs` (Node, roda
  fora do navegador) — sem módulo compartilhado, porque o site não tem bundler
  e precisa continuar funcionando aberto via `file://`.
- Campo calculado `DIAS_PARADO_NO_ESTAGIO` é derivado em runtime
  (`js/extrator.js:313-331`), não existe no Bitrix.
- `metaMensalPadrao` (`js/config.js:335-342`) é uma tabela mês→valor **hardcoded
  para um ciclo/ano específico**, duplicada manualmente em `scripts/forecast-semanal.mjs`
  (aviso explícito no próprio código, `js/config.js:326-334`).

Confiança: **alta** (código + auditoria pré-existente convergem).

## Classificação (implementado / parcial / ausente / inconsistente / não verificável)

| Item | Classificação | Evidência/observação |
|---|---|---|
| Catálogo de entidades e campos Bitrix consumidos | **Implementado** | `js/config.js` (`ENTIDADES`), consistente e centralizado. |
| Chaves de relacionamento nativas do Bitrix (COMPANY_ID, CONTACT_ID, LEAD_ID, ASSIGNED_BY_ID etc.) | **Implementado** | Usadas de forma consistente em `jornada.js`, `catalogo-relatorios.js`. |
| Chave mestra de cliente (Entity Resolution) | **Parcial** | Existe lógica de prioridade + confiança (`jornada.js:864-901`), mas é recalculada a cada sessão, nunca persistida, e só roda dentro do relatório "Jornada do Cliente" — não é usada pelos outros ~20 relatórios do catálogo nem pelo Cockpit. |
| Camada de staging/bronze persistente dos dados brutos do Bitrix | **Ausente** | Nenhum dado bruto é salvo além do cache de 5 min em `localStorage`; cada sessão refaz a extração completa. |
| Histórico de fatos versionado (série temporal confiável) | **Parcial** | Só existe para o Forecast semanal da AtlasGR (`relatorios/forecast-semanal/historico.json`, gerado semanalmente); não existe para Total Trac nem para qualquer outro relatório do catálogo (SDR, Jornada, etc.). |
| Contrato de dados formal (schema/versão/owner por campo) | **Ausente** | Não há schema declarado além do objeto `ENTIDADES` (que documenta rótulo, mas não tipo, obrigatoriedade, owner ou SLA de atualização). |
| Segregação AtlasGR × Total Trac no dado remoto (Bitrix) | **Implementado** | Dois portais Bitrix distintos, dois webhooks. |
| Segregação AtlasGR × Total Trac no dado local (localStorage) | **Inconsistente** | Webhook, login e histórico de forecast têm sufixo por empresa; metas desdobradas, ordem de layout do Cockpit, filtros globais, tema, auditoria de sync e chave de API de IA **não têm** — se as duas aplicações forem servidas do mesmo domínio/origem, esses valores vazam entre as duas marcas no mesmo navegador. |
| Descoberta dinâmica de campos customizados (`UF_CRM_*`) | **Implementado** (extração genérica/"Extração completa") / **Parcial** (relatórios do catálogo, que só usam 1 campo customizado fixo) | `js/extrator.js:158-162`, `js/config.js:100`. |
| Segurança/RLS/segregação por perfil dentro de uma mesma empresa | **Ausente** | Existe só uma senha única por empresa (`js/auth.js`), sem papéis/permissões por usuário. |
| Auditabilidade de quem alterou o quê no Bitrix via sincronização (`crm.*.update`) | **Não verificável nesta leitura** | Mencionado em `AUDITORIA_ESTADO_ATUAL.md:261-263,363-366` como não auditado em profundidade; não foi lido a fundo nesta wave (fora do escopo desta tarefa, focada em modelo de dados de leitura). |
| Estrutura real de campos customizados no Bitrix de produção (além do já mapeado) | **Não verificável** | Requer acesso à API Bitrix real (`crm.deal.fields` etc.), que esta sessão não tem. |
| Volume real de dados (nº de negócios/leads/empresas) em cada portal | **Não verificável** | Idem — sem acesso à API real. |

## Lacunas identificadas

1. **Sem camada de staging/bronze persistente.** Toda extração é recomeçada do
   zero a cada sessão de navegador; não há um "snapshot" reprodutível dos dados
   brutos do Bitrix em um ponto no tempo (fora do histórico agregado semanal do
   Forecast). Isso impede auditoria retroativa ("como estava o pipeline há 3
   meses?") e reprocessamento de regras de negócio sobre dados históricos.
2. **Sem chave de identidade de cliente persistida/compartilhada.** A lógica de
   `jornada.js` é um bom começo de Entity Resolution, mas vive só na sessão de
   quem clicou em "extrair Jornada"; não é reaproveitada pelos outros
   relatórios (ex.: `clientes_receita`, `duplicidades` no catálogo recalculam
   duplicidade de forma independente — não confirmado com leitura completa de
   `catalogo-relatorios.js`, citado como possível redundância a verificar por
   um próximo agente).
3. **Duplicação estrutural de regras de negócio** entre navegador (`js/jornada.js`,
   `js/config.js`) e automação Node (`scripts/forecast-semanal.mjs`) — já
   identificada e parcialmente mitigada conforme `AUDITORIA_ESTADO_ATUAL.md`
   seção 11, mas a causa raiz (sem módulo compartilhado, sem bundler) continua.
4. **Segregação de localStorage incompleta entre AtlasGR e Total Trac** —
   6 chaves identificadas sem sufixo de empresa (seção "Persistência" acima).
5. **Nenhum contrato de dados formal por campo**: `ENTIDADES` documenta rótulo
   e uso, mas não declara tipo esperado, nulidade, unidade (ex.: moeda de
   `OPPORTUNITY`), regra de atualização (SLA), nem owner do dado dentro da
   organização.
6. **Sem versionamento de esquema**: se o Bitrix mudar um `STAGE_ID`/`CATEGORY_ID`,
   a única defesa é o fallback hardcoded em `js/config.js` — não há alerta
   automático de "schema drift".
7. **Total Trac sem automação de histórico** (nenhum `historico.json`
   equivalente): a página `evolucao.html`/`totaltrac-evolucao.html` já prevê
   isso explicitamente e usa só o histórico local do navegador para Total Trac
   (`js/jornada.js:749-761`).
8. **Câmbio de ano nas metas**: tabela de metas mensais hardcoded por ano/ciclo,
   sem fonte de dados editável fora do código (já registrado em
   `AUDITORIA_ESTADO_ATUAL.md` item P0.3, ainda não resolvido no código lido).
9. **Sem data warehouse / não há lugar único para "a verdade" cruzando as duas
   empresas** — hoje, para qualquer visão consolidada AtlasGR+Total Trac seria
   necessário abrir as duas aplicações separadamente; não há um dataset unificado.

## Modelo corporativo de dados proposto (camadas, chaves, contratos)

Proposta adequada à realidade atual (site estático, GitHub Pages, sem
orçamento/mandato hoje para infraestrutura de backend) — evolutiva, não uma
reescrita completa:

### Camada 0 — Fonte (existente, sem mudança)
Bitrix24 REST API, dois portais independentes (AtlasGR, Total Trac). Continua
sendo a fonte de verdade transacional. Nenhuma mudança necessária aqui além de
eventualmente formalizar quais `UF_CRM_*` são "oficiais" (com um dicionário
de dados publicado, não só descoberto dinamicamente).

### Camada 1 — Staging/Bronze (hoje: cache de 5 min em localStorage; proposta: snapshot versionado)
- Manter a extração ao vivo via navegador para uso interativo (não eliminar).
- Estender o padrão já usado pelo Forecast semanal (`scripts/forecast-semanal.mjs`
  → `relatorios/forecast-semanal/historico.json`, versionado em git via GitHub
  Actions) para as demais entidades críticas: negócios, leads, e a chave de
  identidade de cliente. Isto é, gerar periodicamente (ex.: diário) um
  snapshot JSON versionado por entidade (`relatorios/snapshots/negocios/AAAA-MM-DD.json`
  etc.), com metadado de `extraido_em`, `portal` (atlasgr/totaltrac) e
  `total_bitrix` (para medir completude, como já faz `renderizarAuditoriaJornada`).
- Isso não exige banco de dados — apenas mais automações Node + arquivos
  versionados, seguindo o padrão já validado. É o menor incremento possível
  compatível com "site estático sem backend".

### Camada 2 — Negócio/Conformação (hoje: funções JS espalhadas; proposta: contrato explícito)
- Formalizar um "contrato de dados" por entidade: tipo de cada campo,
  obrigatoriedade, chave estrangeira, e — crucialmente — **qual é a chave de
  identidade de cliente oficial** (hoje só implementada dentro de `jornada.js`).
  Recomenda-se extrair `COMPANY_ID > CONTACT_ID > LEAD_ID > nome normalizado >
  DEAL_ID isolado` (`js/jornada.js:864-901`) para uma função utilitária única,
  reaproveitada por todo relatório que precise agrupar por cliente (hoje
  potencialmente reimplementada em outros pontos do catálogo — a confirmar).
- Adotar o vocabulário do pacote de especificação (`02_DADOS_E_BITRIX/03_ENTITY_RESOLUTION.txt`):
  `MASTER_ENTITY_ID`, `source_record_ids[]`, `confidence`, `match_rules[]` —
  já existe o equivalente informal (`__CLIENTE_KEY`, `__CLIENTE_KEY_TIPO`,
  `__CLIENTE_KEY_CONFIANCA`); a lacuna é persistência e reuso, não o conceito.
- Consolidar as regras de forecast duplicadas (browser vs. Node) em um único
  arquivo de regras, carregado nos dois lados por convenção (ex.: JSON de
  configuração lido tanto por `fetch` quanto por `fs.readFileSync`, aceitando
  a limitação de `file://` já documentada em `AUDITORIA_ESTADO_ATUAL.md`, ou
  aceitando que o modo `file://` deixe de ser suportado em favor de eliminar a
  duplicação — decisão de produto, não técnica).

### Camada 3 — Apresentação (hoje: HTML/JS por página; sem mudança estrutural)
- Cockpit, Forecast, SDR, Jornada continuam consumindo a camada de negócio.
- Padronizar que todo relatório proveniente do catálogo declare, junto com seu
  card, a fonte de dados usada, a data de referência do snapshot e o nível de
  confiança dos números (fato vs. estimativa/fallback) — hoje isso já
  acontece parcialmente no Forecast (a UI já evita "0 silencioso", conforme
  comentário em `js/cockpit.js:16-18`), mas não é um padrão obrigatório
  documentado.

### Chaves recomendadas (mínimo formal)
- `deal_key` = `Negocio.ID` (nativo Bitrix, estável).
- `master_entity_id` = a chave de `jornada.js` promovida a função/contrato
  oficial, com `confidence` explícita (ALTA/MEDIA/BAIXA) e `match_rules`
  (`COMPANY_ID`, `CONTACT_ID`, `LEAD_ID`, `NOME_NORMALIZADO`, `DEAL_ISOLADO`).
- `portal_key` = `atlasgr` | `totaltrac` — hoje implícito no atributo
  `data-empresa`/objeto `MARCAS`; deveria acompanhar todo registro persistido
  (snapshot, histórico) para permitir uma futura visão consolidada.

## Riscos

1. **Vazamento de dado entre empresas no mesmo navegador** (achado nesta wave,
   confiança alta): 6 chaves de `localStorage` sem sufixo de empresa
   (`atlas-metas-desdobradas`, `atlas-layout-ordem`, `atlas-filtros-globais`,
   `atlas-extrator-tema`, `atlas-extrator-auditoria-sync`, `atlas-extrator-chave-ia`).
   Se AtlasGR e Total Trac forem acessadas no mesmo navegador/dispositivo (ex.:
   um gestor que acompanha as duas empresas), a meta desdobrada, o layout do
   Cockpit, os filtros e a chave de API de IA de uma empresa vazam/sobrescrevem
   a da outra. Risco funcional (dado errado exibido), não de segurança grave,
   mas gera relatório incorreto silenciosamente.
2. **Webhook do Bitrix da AtlasGR hardcoded em texto claro no código-fonte
   público do repositório** (`js/bitrix-api.js:7`, `WEBHOOK_FIXO_PADRAO`) —
   isto já é uma URL de webhook de produção do Bitrix real, versionada em git.
   Isso está documentado como risco conhecido em `AUDITORIA_ESTADO_ATUAL.md`
   seção 13, mas vale reforçar aqui porque qualquer trabalho futuro de "modelo
   corporativo de dados" (ex.: expor esse repositório a mais colaboradores,
   torná-lo público) amplifica esse risco. Recomenda-se revogar/rotacionar
   esse webhook e reavaliar se deveria estar no código-fonte.
3. **Sem staging persistente = sem trilha de auditoria histórica real.** Hoje,
   se o Bitrix mudar um dado (ex.: um negócio for reaberto, um estágio
   renomeado), não há como comparar com o estado de dias/semanas atrás fora do
   único histórico agregado do Forecast semanal da AtlasGR.
4. **Duplicação de regras de negócio entre navegador e Node** — risco já
   identificado e parcialmente mitigado (`AUDITORIA_ESTADO_ATUAL.md` seção 11),
   mas continua sendo risco estrutural para qualquer nova métrica introduzida
   pelo Intelligence Hub: cada nova fórmula terá que ser implementada duas
   vezes manualmente enquanto não houver módulo compartilhado.
5. **Ambição do pacote de especificação (`04_AGENTES/`, 35+ agentes cobrindo
   LTV, churn, anomaly detection, "what-if simulator") está muito à frente da
   infraestrutura de dados real hoje** (sem banco, sem staging, sem pipeline
   ETL). Qualquer sprint que assuma existência de um data warehouse ou de
   histórico rico por entidade vai travar em uma pré-condição não atendida
   até que a Camada 1 proposta acima exista.

## Recomendações priorizadas

**P0 — correção de risco imediato, baixo esforço:**
1. Adicionar sufixo de empresa (`marcaAtiva().sufixoStorage`) às 6 chaves de
   `localStorage` hoje compartilhadas entre AtlasGR e Total Trac
   (`js/cockpit.js:1642,1663,1717,1722`; `js/ui.js:38,56,73,632-641,694`).
   Baixo risco de regressão, mesmo padrão já usado em `js/bitrix-api.js` e
   `js/jornada.js`.
2. Revisar a exposição do webhook fixo da AtlasGR em texto claro no
   código-fonte (`js/bitrix-api.js:7`) — decisão de negócio/segurança, não
   apenas técnica; ao menos confirmar que o repositório não é público sem
   necessidade, ou rotacionar o webhook.

**P1 — pré-requisito estrutural para o Intelligence Hub:**
3. Extrair a lógica de identidade de cliente de `js/jornada.js:864-901` para
   uma função utilitária única e reutilizável (`resolverClienteId(deal)`),
   documentada com o vocabulário do pacote de spec (`MASTER_ENTITY_ID`,
   `confidence`, `match_rules`), e conectar o próximo Agente
   (Entity Resolution Specialist / Agente 04) a essa função como ponto de
   partida real, em vez de propor uma solução do zero.
4. Estender o padrão de automação Node + snapshot versionado (hoje só para o
   Forecast semanal da AtlasGR) para negócios/leads brutos das duas empresas,
   criando a Camada 1 (staging/bronze) descrita acima — pré-requisito para
   qualquer sprint que precise de histórico real (Sprint 02, 14, 15, 16, 17
   do pacote de especificação, que dependem de séries temporais).
5. Formalizar um contrato de dados mínimo (arquivo de configuração) por campo
   usado em cálculo de negócio: tipo, unidade, obrigatoriedade, campo de
   origem (nativo vs. `UF_CRM_*`), para reduzir o risco de "schema drift"
   silencioso já mencionado em `AUDITORIA_ESTADO_ATUAL.md`.

**P2 — evolutivo:**
6. Avaliar consolidar as regras de forecast duplicadas (browser/Node) antes de
   adicionar novas métricas do Intelligence Hub, para não triplicar a
   duplicação existente.
7. Criar automação equivalente de histórico para Total Trac (hoje inexistente).
8. Investigar se `catalogo-relatorios.js` reimplementa lógica de duplicidade/
   identidade de cliente de forma independente de `jornada.js` (não confirmado
   nesta leitura — recomenda-se leitura dedicada por um próximo agente).

## Dependências e próximos agentes indicados

- **Agente 02 — Bitrix Discovery Specialist**: validar contra a API Bitrix
  real (que esta sessão não tem acesso) todos os campos `UF_CRM_*`
  disponíveis além de `UF_CRM_1770928318695`, e confirmar estrutura real de
  categorias/estágios em produção (o fallback hardcoded em `js/config.js`
  pode estar desatualizado).
- **Agente 03 — Data Quality Guardian**: auditar completude/consistência real
  dos dados extraídos (esta wave não teve acesso a dados reais do Bitrix,
  só ao código que os processa).
- **Agente 04 — Entity Resolution Specialist**: usar a lógica de
  `js/jornada.js:864-901` como ponto de partida real (não construir do zero)
  para formalizar `MASTER_ENTITY_ID` conforme pedido em
  `02_DADOS_E_BITRIX/03_ENTITY_RESOLUTION.txt`.
- **Agente 05 — Metrics Governance Agent**: revisar as fórmulas já
  catalogadas em `AUDITORIA_ESTADO_ATUAL.md` seção 6 (forecast, aging, SLA,
  win rate) contra o requisito "nenhum indicador sem definição, fonte,
  fórmula, granularidade, periodicidade e owner" — hoje as fórmulas existem,
  mas não têm owner nem contrato formal documentado fora do código-fonte.
- **Agente de Segurança/Governança (09_GOVERNANCA_E_SEGURANCA)**: avaliar os
  dois riscos P0 acima (localStorage cruzado entre empresas; webhook em texto
  claro no repositório).

## Confiança e limitações

- **Alta confiança**: inventário de entidades/campos/métodos Bitrix, chaves de
  relacionamento, localização e sufixação de chaves de `localStorage`,
  separação de portal Bitrix entre AtlasGR e Total Trac, existência e
  mecanismo do único histórico persistido em git — todos obtidos por leitura
  direta do código-fonte (`js/config.js`, `js/bitrix-api.js`, `js/jornada.js`,
  `js/extrator.js`, `js/auth.js`, `js/cockpit.js`, `js/ui.js`, `js/forecast.js`,
  `AUDITORIA_ESTADO_ATUAL.md`) e confirmados por grep cruzado.
- **Média confiança**: afirmação de que a lógica de identidade de cliente de
  `jornada.js` não é reutilizada pelos relatórios do catálogo — baseada no
  fato de que `catalogo-relatorios.js` (916 linhas) não foi lido integralmente
  nesta wave, só referenciado via `AUDITORIA_ESTADO_ATUAL.md`. Recomenda-se
  confirmação por leitura dedicada.
- **Não verificável nesta sessão** (requer acesso à API Bitrix24 real dos dois
  portais, que esta sessão não possui): volume real de dados, existência de
  outros campos `UF_CRM_*` além do já mapeado, estrutura real de categorias/
  estágios em produção hoje (o código tem fallback hardcoded que pode estar
  desatualizado desde 08/08/2026 conforme comentário em `js/config.js:46-47`),
  e qualidade/completude real dos dados armazenados no CRM.
- Este documento não leu `js/exportacoes.js`, `js/app.js`, `js/sdr.js`
  (1646 linhas) e `js/catalogo-relatorios.js` (916 linhas) linha a linha —
  apenas via grep/citação cruzada com `AUDITORIA_ESTADO_ATUAL.md`. Achados
  sobre esses arquivos específicos (além dos citados) têm confiança mais
  baixa e deveriam ser confirmados por uma leitura dedicada se decisões de
  arquitetura de dados dependerem deles diretamente.
