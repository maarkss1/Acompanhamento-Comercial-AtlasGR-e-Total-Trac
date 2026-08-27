# Agente 04 — Entity Resolution: módulo compartilhado e schema MASTER_ENTITY_ID (Wave 2.2)

> Escopo: continuação direta do relatório da Wave 1
> (`docs/intelligence-hub-cpi/execucao/wave-01-fundacao/04_ENTITY_RESOLUTION_SPECIALIST_RESOLUCAO_DE_ENTIDADES.md`),
> conforme item 2.2.6 do plano do Agente 00
> (`docs/intelligence-hub-cpi/execucao/wave-01-fundacao/00_CHIEF_ORCHESTRATOR_DIAGNOSTICO_E_PLANO.md`).
> Análise estática de código real, sem acesso à API Bitrix24 ao vivo nesta sessão — mesma limitação
> já registrada na Wave 1. Toda constatação cita arquivo/linha verificado no repositório. Todo dado
> de exemplo (nomes de empresa, IDs) neste documento e nos testes é **fictício**, criado só para
> ilustrar/testar — nenhum é cliente real da AtlasGR/Total Trac.

## Resumo executivo

A Wave 1 encontrou a heurística de resolução de identidade de cliente mais completa do projeto em
`js/jornada.js` (`extrairJornada()`, hierarquia `COMPANY_ID > CONTACT_ID > LEAD_ID > nome
normalizado > DEAL_ID isolado`, 3 níveis de confiança), reimplementada de forma **divergente** em
`js/cockpit.js`, `js/sdr.js` e `js/catalogo-relatorios.js`. Esta tarefa:

1. Extrai essa hierarquia para um módulo compartilhado novo, `js/entity-resolution.js` (script
   clássico, sem `import`/`export`, mesmo padrão do resto do projeto) — **sem alterar** nenhum dos
   4 arquivos que hoje têm sua própria variação (eles continuam exatamente como estavam).
2. Formaliza o schema `MASTER_ENTITY_ID` no vocabulário do CPI (`source_record_ids[]`,
   `match_rules[]` como lista, `confidence`, `manual_review_required`, `criado_em`/`atualizado_em`).
3. Implementa `resolverMasterEntity(negocio, contexto)`, função pura, reaproveitando literalmente a
   lógica de match já existente em `js/jornada.js` — nenhuma regra nova foi inventada.
4. Cobre as 3 confiança com testes (`tests/entity-resolution.test.mjs`, mesmo padrão de
   `tests/jornada.test.mjs`), incluindo um caso de match ambíguo (`manual_review_required=true`
   sem a confiança ser BAIXA). `node --test tests/*.test.mjs` passa: **80/80 testes** (16 novos +
   64 já existentes de `jornada`/`cockpit`/`reconciliacao-forecast`/`staging-schema`, este último
   fruto do trabalho paralelo do Agente 01 nesta mesma wave — ver seção final).

**Decisão explícita do usuário nesta tarefa, não negociável — leia a seção seguinte antes de
qualquer coisa**: nenhuma persistência de `master-entities.json` foi criada, e nenhum workflow do
GitHub Actions foi tocado ou proposto como pronto para uso. O repositório é público.

## ⚠️ Bloqueio de privacidade — leia antes de tudo

A Wave 1 (recomendação 5, item 4 da "Estratégia de resolução de entidades proposta") sugeriu
persistir `relatorios/entity-resolution/master-entities.json` pelo mesmo padrão GitHub Actions já
usado pelo Forecast semanal (`scripts/forecast-semanal.mjs` → `relatorios/forecast-semanal/
historico.json`, comitado no repositório). **Essa sugestão foi explicitamente vetada pelo usuário
nesta tarefa** e não foi implementada: o `MASTER_ENTITY_ID`, por definição, cruza `COMPANY_ID` /
`CONTACT_ID` / `LEAD_ID` / `DEAL_ID` reais e — no tier `NOME_NORMALIZADO` — o próprio nome do
cliente normalizado. Comitar isso em `relatorios/` significaria colocar identificadores cruzados de
clientes reais da AtlasGR e da Total Trac em histórico git **público e permanente**: mesmo que o
arquivo fosse apagado depois, qualquer pessoa que já tenha clonado o repositório (ou usado
`git log`) continuaria com o dado.

Esta tarefa entrega **só o módulo de código** (`js/entity-resolution.js`) e o schema. Não existe,
neste repositório, nenhum arquivo em `relatorios/entity-resolution/` nem nenhum workflow em
`.github/workflows/` relacionado a entity resolution. **Nada aqui está pronto para produção
enquanto o repositório continuar público** — ver "Opções de persistência futura" abaixo, cuja
escolha cabe ao usuário/negócio, não a este agente.

Esse é exatamente o mesmo bloqueio que o Agente 01 (Enterprise Data Architect) já documentou em
paralelo nesta mesma wave para a camada de staging
(`docs/intelligence-hub-cpi/execucao/wave-02/01_CAMADA_STAGING_FORMALIZADA.md`, seção "⚠️ Bloqueio
de privacidade"): os dois achados reforçam um ao outro — qualquer persistência real de dado bruto
ou resolvido do Bitrix neste projeto, hoje, esbarra na mesma restrição de repositório público.

## As 4 implementações divergentes hoje, com evidência

Nenhum dos 4 arquivos abaixo foi alterado por esta tarefa — são citados só como evidência do estado
atual (mesmo achado da Wave 1, reconferido linha a linha nesta tarefa).

### 1. `js/jornada.js:875-913` (`extrairJornada()`) — a mais completa, usada como canônica

```
COMPANY_ID (ALTA) > CONTACT_ID, se sem COMPANY_ID (ALTA) > LEAD_ID, se sem os dois (MEDIA)
  > nome limpo+normalizado, se não parecer registro operacional (MEDIA) > DEAL_ID isolado (BAIXA)
```

Usa `normalizarTextoChave` (linhas 1-9), `limparNomeClienteParaChave` (24-29),
`nomePareceOperacionalJornada` (31-43) e `idBitrixValido`/`idBitrixString` (11-22). `ID=0` do
Bitrix nunca vira `COMPANY:0` (linha 887 trata isso explicitamente). É a única das 4 que passa
pelos 5 tiers completos, na ordem correta, com os 3 níveis de confiança.

### 2. `js/catalogo-relatorios.js:250` (relatório `clientes_receita`) — pula 2 tiers

```js
const k = idBitrixValido(d.COMPANY_ID) ? `C:${idBitrixString(d.COMPANY_ID)}` : `N:${normalizarTextoChave(d._CLIENTE)}`;
```

Só `COMPANY_ID > nome normalizado` — **nunca olha `CONTACT_ID` nem `LEAD_ID`**. Um negócio sem
empresa mas com contato/lead válido cai direto no nome (podendo colidir com outro cliente de nome
parecido, ou nem ter nome confiável e virar uma chave vazia/genérica). Sem confiança explícita.

### 3. `js/catalogo-relatorios.js:285` (relatório `handoffs`) — pula o tier de nome

```js
let k = idBitrixValido(d.COMPANY_ID) ? `C:${idBitrixString(d.COMPANY_ID)}`
  : idBitrixValido(d.CONTACT_ID) ? `T:${idBitrixString(d.CONTACT_ID)}`
  : idBitrixValido(d.LEAD_ID) ? `L:${idBitrixString(d.LEAD_ID)}`
  : `D:${d.ID}`;
```

`COMPANY_ID > CONTACT_ID > LEAD_ID > DEAL_ID` — **pula direto para DEAL_ID isolado**, sem tentar o
nome normalizado como `jornada.js` faz. Um negócio sem nenhum ID vinculado nunca é agrupado com
outro de mesmo nome aqui, mesmo quando `jornada.js` os agruparia.

### 4. `js/sdr.js:493-524` (`infoClienteLead`/`infoClienteDeal`/`infoClienteContato`) — 3 hierarquias parcialmente distintas na mesma função

- `infoClienteLead` (493-502): `COMPANY_ID > nome normalizado > LEAD:id isolado` — **sem tier de
  CONTACT_ID**.
- `infoClienteDeal` (503-515): `COMPANY_ID > LEAD_ID (via infoClienteLead, que já reintroduz nome)
  > nome normalizado > DEAL:id isolado` — **sem tier de CONTACT_ID próprio do negócio**, e a ordem
  LEAD_ID-antes-de-nome é diferente da ordem nome-antes-de-DEAL_ID de `jornada.js`.
- `infoClienteContato` (516-524): `COMPANY_ID > nome do contato normalizado > CONTACT:id isolado` —
  hierarquia própria, terceira variação dentro do mesmo arquivo.

Nenhuma das três usa `limparNomeClienteParaChave` nem `nomePareceOperacionalJornada` — um contato
ou negócio chamado "Teste" vira uma chave de nome válida aqui, mas seria isolado (BAIXA) em
`jornada.js`.

### 5. `js/cockpit.js` — não tem hierarquia própria; herda a mais fraca das 4

`cockpit.js` não implementa nenhuma lógica de identidade de cliente por conta própria. Ele chama
`baseDealsCatalogo`/`enriquecerDealCatalogo` de `catalogo-relatorios.js` diretamente
(`js/cockpit.js:303-304`, `355`), e o campo de cliente que usa (`_CLIENTE`, exibido na coluna
"Empresa / Cliente" do drill-down, `js/cockpit.js:1362`) vem de
`enriquecerDealCatalogo` (`js/catalogo-relatorios.js:22-28`):

```js
const emp = idBitrixValido(d.COMPANY_ID) ? b.empresas[idBitrixString(d.COMPANY_ID)] : null;
// ..._CLIENTE: emp?.TITLE || d.TITLE || ""
```

Essa é a variação **mais fraca das 5**: `COMPANY_ID > TÍTULO BRUTO DO NEGÓCIO` — sem `CONTACT_ID`,
sem `LEAD_ID`, sem normalização de nome, sem filtro de registro operacional, sem nível de
confiança. Dois negócios "Cliente X" e "cliente x — Financeiro" contam como clientes diferentes
aqui, mas seriam o mesmo em `jornada.js`.

**Conclusão da evidência**: são pelo menos 5 variações de comportamento (jornada.js sendo a única
completa), não 4 — mas agrupadas nos 4 arquivos pedidos pela missão, já que `cockpit.js` não tem
uma quinta lógica própria, apenas herda a de `catalogo-relatorios.js`.

## Schema MASTER_ENTITY_ID

Formalizado em `js/entity-resolution.js` (comentário de bloco "schema MASTER_ENTITY_ID", linhas
175-229) no vocabulário do CPI (`docs/intelligence-hub-cpi/ATLASGR_INTELLIGENCE_HUB_CPI/
02_DADOS_E_BITRIX/03_ENTITY_RESOLUTION.txt`):

| Campo | Tipo | Descrição |
|---|---|---|
| `master_entity_id` | string | Mesma chave já usada por `jornada.js` (`CLIENTE_KEY`): `"COMPANY:123"` \| `"CONTACT:456"` \| `"LEAD:789"` \| `"NOME:<texto normalizado>"` \| `"DEAL:<id>"` \| `"LEAD:<id>"` (isolado). |
| `source_record_ids[]` | array de `{entidade, id, empresa}` | `entidade` ∈ `NEGOCIO`\|`LEAD`\|`CONTATO`\|`EMPRESA`; `id` = ID Bitrix bruto (string); `empresa` = `"atlasgr"`\|`"totaltrac"`\|outro identificador de portal, ou `null` quando não informado. Explícito — hoje implícito no agrupamento `grupos[chave]` de `jornada.js:941` (Wave 1, recomendação 2). |
| `match_rules[]` | array de string | Lista (não string única). Valores possíveis: `"company_id_exato"` \| `"contact_id_exato"` \| `"lead_id_exato"` \| `"nome_normalizado"` \| `"deal_id_isolado"` \| `"lead_id_isolado"`. Hoje sempre `length 1` (a hierarquia é "primeira regra que bate vence") — já é lista para suportar, no futuro, um matcher multi-sinal sem quebrar o schema. |
| `confidence` | string | `"ALTA"` (COMPANY_ID ou CONTACT_ID exato) \| `"MEDIA"` (LEAD_ID exato OU nome normalizado confiável) \| `"BAIXA"` (isolado, sem vínculo nem nome confiável) — mesmos 3 níveis de `CLIENTE_KEY_CONFIANCA` de `jornada.js`. |
| `manual_review_required` | boolean | `true` quando `confidence === "BAIXA"`, **OU** quando a chave é `COMPANY_ID` mas a própria empresa tem sinal de possível cadastro duplicado (mesmo nome/e-mail/telefone que outro `COMPANY_ID` — sinal já existente em `jornada.js:183-230`, reaproveitado, nunca fundido automaticamente). |
| `criado_em` / `atualizado_em` | string ISO 8601 | Como a função é pura e sem persistência, as duas datas são iguais por padrão (calculadas na chamada); `contexto.criadoEmAnterior` permite preservar o `criado_em` original para uma futura camada com estado — nada usa isso hoje. |

## Módulo implementado

`js/entity-resolution.js` — script clássico (mesmo padrão de `js/data-trust-score.js`: aditivo, não
carregado por nenhum `<script src>` ainda, funções em escopo global via `function nome(){}`).

- **`calcularChaveIdentidade(registro, opcoes)`** — núcleo isolado da hierarquia de
  `jornada.js:881-913`, sem I/O. `opcoes.tipoRegistro` aceita `"NEGOCIO"` (padrão) ou `"LEAD"`
  (leads não têm um `LEAD_ID` circular apontando pra si mesmos, então o tier LEAD_ID é omitido e o
  fallback isolado usa `LEAD_ID_ISOLADO` em vez de `DEAL_ID_ISOLADO` — mesmos sinais, nenhuma regra
  nova).
- **`resolverMasterEntity(negocio, contexto)`** — função pura principal. Recebe um negócio/lead já
  carregado e um `contexto` opcional (`empresasPorId`, `negociosDaExtracao`, `empresa`, `agora`,
  `criadoEmAnterior`, `tipoRegistro`) e devolve o registro no formato do schema acima. Reaproveita
  `calcularChaveIdentidade` para a chave e `erConstruirSinaisDuplicidadeEmpresas` (port literal de
  `construirSinaisDuplicidadeEmpresas`, `jornada.js:183-230`) para o sinal de ambiguidade cadastral.
- Utilitários portados **literalmente** (mesma regex, mesma lista de prefixos, prefixo `er` só para
  nunca colidir com o global homônimo se este arquivo um dia carregar na mesma página que
  `jornada.js`): `erIdBitrixValido`, `erIdBitrixString`, `erNormalizarTextoChave`,
  `erNormalizarTelefone`, `erLimparNomeClienteParaChave`, `erNomeAparentaOperacional`,
  `erValoresMulticampo`, `erConstruirSinaisDuplicidadeEmpresas`. Motivo de portar em vez de chamar
  direto: o projeto não tem bundler/import (comentário no topo do arquivo explica em detalhe), e o
  módulo precisa ser carregável isoladamente pelo harness de teste
  (`tests/helpers/carregar-script-classico.mjs` roda só o arquivo pedido em um `node:vm` isolado).

**Testes** — `tests/entity-resolution.test.mjs`, mesmo padrão de `tests/jornada.test.mjs`. Dados
100% fictícios, rotulados como tal no cabeçalho do arquivo. Cobertura:
- Hierarquia completa em `calcularChaveIdentidade` (COMPANY > CONTACT > LEAD > NOME > DEAL,
  variante LEAD, tratamento de `ID=0`).
- Os 3 níveis de confiança em `resolverMasterEntity` (ALTA via COMPANY_ID, MEDIA via LEAD_ID,
  BAIXA via DEAL_ID_ISOLADO com nome operacional).
- **Match ambíguo**: COMPANY_ID exato (confiança ALTA) mas duas empresas fictícias diferentes com
  o mesmo nome normalizado → `manual_review_required=true` mesmo sem confiança BAIXA — e um caso
  espelho sem duplicidade, confirmando que o sinal não dispara à toa.
- `source_record_ids[]` agregado a partir de `negociosDaExtracao` (dois negócios fictícios com
  mesmo nome normalizado aparecem juntos; um terceiro, sem relação, não aparece).
- Registro tipo `LEAD` (âncora `EMPRESA`, fallback `LEAD_ID_ISOLADO`).
- `criado_em` preservável via `contexto.criadoEmAnterior`; erro claro para entrada inválida.

`node --test tests/*.test.mjs` (comando pedido, não `node --test tests/`):

```
# tests 80
# suites 26
# pass 80
# fail 0
```

16 testes novos deste módulo + 64 já existentes (`jornada`, `cockpit`, `reconciliacao-forecast`, e
`staging-schema` — este último do trabalho paralelo do Agente 01 nesta mesma wave, não desta
tarefa) — todos passando, nenhuma regressão.

**Nota técnica registrada no código e nos testes**: comparar objetos devolvidos por um script
carregado via `node:vm` com `assert.deepEqual` contra um literal do arquivo de teste falha
("same structure but not reference-equal") porque pertencem a realms V8 diferentes
(`Object.prototype`/`Array.prototype` distintos) — os testes fazem um round-trip
`JSON.parse(JSON.stringify(...))` antes de comparar. Pelo mesmo motivo, `contexto.agora instanceof
Date` dentro do módulo falharia para um `Date` construído no realm do teste — `resolverMasterEntity`
usa duck-typing (`typeof contexto.agora.toISOString === "function"`) em vez de `instanceof Date`
para evitar esse problema (mesmo padrão de `opcoes.agora instanceof Date` em
`js/data-trust-score.js:258` continua fragile lá, mas esse arquivo não foi tocado por esta tarefa).

## Migração futura dos 3 arquivos divergentes (não feita aqui)

Por decisão explícita do escopo desta tarefa, **nenhuma chamada dentro de `js/cockpit.js`,
`js/sdr.js` ou `js/catalogo-relatorios.js` foi alterada** — os 3 (mais o comportamento herdado por
`cockpit.js`) continuam com suas implementações originais, listadas na seção de evidência acima.
Migrá-los para chamar `resolverMasterEntity`/`calcularChaveIdentidade` é trabalho futuro,
propositalmente fora desta tarefa: **arriscado sem uma suíte de regressão visual** dos relatórios
afetados (`clientes_receita`, `handoffs`, os cards de cliente do Cockpit, os agregados de atividade
do SDR) — trocar a chave de identidade muda quantos "clientes únicos" cada relatório reporta, o que
é visível diretamente no dashboard e pode mudar números que a diretoria já está acompanhando.

Pontos exatos de duplicação a migrar, quando essa suíte de regressão existir:

| Arquivo:linha | O que muda ao migrar |
|---|---|
| `js/catalogo-relatorios.js:250` (`clientes_receita`) | Ganha os tiers `CONTACT_ID`/`LEAD_ID` que hoje pula — número de "clientes únicos" nesse relatório provavelmente **diminui** (mais negócios se agrupam sob a mesma chave). |
| `js/catalogo-relatorios.js:285` (`handoffs`) | Ganha o tier `NOME_NORMALIZADO` que hoje pula — negócios hoje isolados por `DEAL:id` podem passar a se agrupar por nome. |
| `js/catalogo-relatorios.js:22-28` (`enriquecerDealCatalogo`, usado por `js/cockpit.js:303-304,355`) | Ganha toda a hierarquia (hoje só `COMPANY_ID > TÍTULO BRUTO`) — maior mudança de comportamento das 3, porque a base atual não filtra nem normaliza nada. |
| `js/sdr.js:493-524` (`infoClienteLead`/`infoClienteDeal`/`infoClienteContato`) | Unifica as 3 sub-hierarquias divergentes numa só, ganhando `CONTACT_ID` em `infoClienteDeal`/`infoClienteLead` e a limpeza/filtro de nome operacional que hoje faltam. |

Recomendação de sequência (não implementada aqui): migrar um relatório por vez, capturar o
`master_entity_id`/contagem de clientes únicos ANTES e DEPOIS para o mesmo conjunto de dados
extraído, e revisar a diferença com quem acompanha aquele número antes de publicar.

## Opções de persistência futura sem expor PII

O Agente 01 já detalhou prós/contras das 4 opções reais (repositório privado / repositório separado
privado / backend com banco / anonimizar-hashear) na Wave 2.2, em profundidade equivalente ao que
esta tarefa produziria — ver `docs/intelligence-hub-cpi/execucao/wave-02/
01_CAMADA_STAGING_FORMALIZADA.md`, seção "Opções de persistência futura sem expor PII". Resumo,
mais a ressalva específica de entity resolution:

- **(a) Repositório privado**: menor mudança, reaproveita o padrão GitHub Actions já validado;
  perde distribuição gratuita via GitHub Pages público e não apaga o que já está no histórico git
  até a mudança.
- **(b) Repositório separado privado**: isola o raio de exposição de PII sem tocar no site público
  atual; exige gerenciar acesso a um segundo repositório, e não resolve sozinho consumo direto pelo
  navegador (precisaria de API autenticada).
- **(c) Backend com banco de dados**: é o alvo real da arquitetura do CPI (RLS, auditoria, CDC);
  mudança de arquitetura maior, fora do escopo de qualquer incremento desta wave.
- **(d) Anonimizar/hashear identificadores antes de persistir**: mesma mecânica de hoje, sem trocar
  infraestrutura nem tornar nada privado. **Ressalva específica de Entity Resolution**: hash
  irreversível (ex. SHA-256) sobre `master_entity_id`/`source_record_ids` preservaria a capacidade
  de saber "estes registros são o mesmo cliente" (comparar hashes), mas **inviabiliza a revisão
  manual humana dos matches** — quando `manual_review_required=true`, quem revisa precisa ver o
  nome/telefone/e-mail em claro para decidir se de fato é o mesmo cliente ou uma colisão de hash;
  um hash irreversível não permite essa checagem. Hash reversível (mapa hash→valor mantido à parte)
  resolveria isso, mas reintroduz o mesmo problema de PII em outro arquivo — só muda onde o dado em
  claro mora, não o elimina.

Nenhuma das quatro foi escolhida ou implementada — é decisão do usuário/negócio, não deste agente.

## Riscos

1. **Módulo formalizado, mas ainda não é a fonte de verdade de nada**: enquanto `cockpit.js`,
   `sdr.js` e `catalogo-relatorios.js` não migrarem para `resolverMasterEntity`, os números que o
   dashboard já mostra continuam vindo das 5 variações divergentes originais — este módulo, por si
   só, não corrige nenhuma inconsistência visível hoje.
2. **Custo O(n²) se usado ingenuamente em escala**: `resolverMasterEntity` recalcula
   `calcularChaveIdentidade` para cada item de `contexto.negociosDaExtracao` a cada chamada. Chamar
   a função uma vez por negócio, dentro de um laço sobre toda uma extração grande, é O(n²). Aceitável
   hoje (módulo ainda não ligado a nenhum relatório real), mas uma integração futura em produção
   deveria pré-agrupar por chave uma única vez (O(n)) em vez de chamar a função em loop — documentado
   também no comentário do código.
3. **`match_rules[]` hoje sempre tem 1 elemento**: a hierarquia portada de `jornada.js` é
   "primeira regra que bate vence" — o campo já é lista (conforme pedido pelo CPI) para suportar um
   futuro matcher multi-sinal, mas esse matcher não foi implementado nesta tarefa (fora do escopo:
   "reaproveite a lógica de match já existente, não invente uma nova").
4. **Sinal de ambiguidade cadastral cobre só empresas**: `manual_review_required` via duplicidade
   reaproveita `erConstruirSinaisDuplicidadeEmpresas`, que (como o original em `jornada.js`) só
   compara `crm.company.list` — leads e contatos duplicados não geram esse sinal aqui, mesma lacuna
   já registrada na Wave 1 ("Falta de dedupe para leads/contatos").
5. **Ausência de CNPJ continua sem resolução**: nenhum campo de CNPJ foi confirmado na conta Bitrix
   real (dependência do Agente de Dados/Bitrix, mesma pendência da Wave 1) — o schema já tem espaço
   em `match_rules[]` para um futuro `"cnpj_exato"` como sinal de maior confiança, mas nada usa isso
   hoje.
6. **Bloqueio de privacidade é o risco mais alto de todos**: qualquer pessoa que pegue este módulo e
   o ligue a um script que grava `source_record_ids[]`/`master_entity_id` (tier `NOME_NORMALIZADO`)
   em `relatorios/` ou em qualquer artefato comitado neste repositório público recria exatamente o
   incidente que esta tarefa foi instruída a evitar. Isso está destacado no topo deste documento e
   no cabeçalho do próprio `js/entity-resolution.js`, mas depende de quem for integrar este módulo
   no futuro respeitar o aviso.

## Confiança e limitações

- **Alta confiança** nas 4 (5) implementações divergentes documentadas: cada uma foi lida linha a
  linha nesta tarefa (não só citada da Wave 1) e as citações de arquivo/linha foram reconferidas no
  código real.
- **Alta confiança** no módulo e nos testes: `resolverMasterEntity`/`calcularChaveIdentidade` são
  funções puras, sem I/O, com 16 testes cobrindo os 3 níveis de confiança, o caso ambíguo e os
  casos de borda de `jornada.js` (ID=0, nome operacional) — `node --test tests/*.test.mjs` passa
  80/80, incluindo toda a suíte pré-existente (nenhuma regressão).
- **Sem acesso à API Bitrix24 ao vivo nesta sessão** — mesma limitação da Wave 1: não foi possível
  confirmar campo de CNPJ nem volume real de matches ambíguos em produção.
- **Migração dos 3 (4) arquivos divergentes é, por decisão explícita da missão, não implementada
  nesta tarefa** — documentada como trabalho futuro com file:linha exato, não como um "quase
  pronto".
- **Persistência é, por decisão explícita do usuário nesta tarefa, não implementada** — o bloqueio
  de privacidade é uma restrição de produto, não uma limitação técnica deste agente; a escolha
  entre as 4 opções documentadas cabe ao usuário/negócio.
