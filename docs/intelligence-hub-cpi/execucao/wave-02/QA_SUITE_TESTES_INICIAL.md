# QA — Suíte de Testes Automatizados Inicial (Wave 2.1, item 3)

Fecha a dependência citada pelo Agente 03 na Wave 1
(`docs/intelligence-hub-cpi/execucao/wave-01-fundacao/03_DATA_QUALITY_GUARDIAN_QUALIDADE_DE_DADOS.md`):
não havia nenhum teste automatizado nem reconciliação formal entre a lógica
de forecast do navegador (`js/forecast.js`/`js/jornada.js`) e a do script
Node (`scripts/forecast-semanal.mjs`). Este documento cobre a primeira
suíte de testes do projeto — nenhum arquivo de produção (`js/*.js`,
`scripts/forecast-semanal.mjs`, `*.html`) foi alterado; só `tests/`,
a adição aditiva em `package.json` e este relatório.

## Como rodar

```
npm test
```

equivalente a `node --test tests/*.test.mjs` (ver nota sobre o comando na
seção "Desvio do comando pedido", abaixo).

Resultado atual: **46 testes, 15 suites, 0 falhas** (`node --test`, formato
TAP). Nenhum teste está marcado `skip`/`todo`.

## Por que node:vm, e não import direto

`package.json` tem `"type": "module"`, mas os arquivos em `js/*.js`
(`jornada.js`, `cockpit.js`, ...) são scripts clássicos de navegador —
carregados via `<script src="...">` nos `.html` do projeto, sem
`import`/`export`, declarando funções direto no escopo global (`window`) e
esperando que outros `<script>` já carregados antes (ex.: `jornada.js` antes
de `cockpit.js`, ver `cockpit.html`) já tenham definido helpers que eles
reusam. Não dá para fazer `import` desses arquivos num teste Node.

A solução adotada — a mais simples que funcionou de forma confiável, testada
e comparada com outras alternativas antes de decidir por ela — foi:

- `tests/helpers/carregar-script-classico.mjs`: lê o arquivo `js/*.js` com
  `fs.readFileSync` e o executa dentro de um `node:vm` Context isolado, com
  um `document`/`localStorage`/`fetch` fake mínimo (só o suficiente pra o
  arquivo carregar sem lançar erro; nenhuma função que de fato manipula DOM é
  testada por este helper) e `window` apontando pro próprio objeto global do
  contexto — igual ao navegador, onde `window` É o global da página. Devolve
  esse contexto, que expõe cada função/`const` de nível superior do arquivo
  como propriedade chamável.
- Para `js/cockpit.js`, que depende de funções já definidas em
  `js/jornada.js` (mesma ordem de `<script>` do `cockpit.html`), o contexto
  de `jornada.js` já carregado é passado como `contextoExtra` ao carregar
  `cockpit.js` — reproduzindo a mesma composição de globals que acontece no
  navegador real.

`scripts/forecast-semanal.mjs` é um módulo ES de verdade, mas **não pode ser
importado direto** num teste: ele tem efeitos colaterais de nível superior —
`process.exit(1)` se `BITRIX_WEBHOOK_URL` não estiver definida, e a chamada
final `main().catch(...)` dispara chamadas reais ao Bitrix assim que o
arquivo é carregado. `tests/helpers/extrair-funcoes-mjs.mjs` extrai, por
casamento de chaves (`{ ... }`) sobre o texto-fonte real do arquivo, só as
funções/trechos puros necessários (`normalizarTextoChave`,
`ehEstagioPiloto`, `probabilidadeFallbackForecast`, o `const
STAGE_IDS_PILOTO` do qual `ehEstagioPiloto` depende, e o trecho inline de
classificação de semântica dentro do laço de `main()`), e os avalia num
`node:vm` Context separado. Nenhuma lógica de negócio foi reescrita ou
reinventada — é o texto literal do arquivo real, lido em tempo de teste; se
alguém renomear/mover uma dessas funções no arquivo real, a extração falha
ruidosamente (erro explícito, não um teste que silenciosamente compara a
versão antiga).

## Funções testadas e por quê

### `js/jornada.js` (`tests/jornada.test.mjs`)

| Função | Por que foi escolhida |
|---|---|
| `normalizarTextoChave` | Base de toda comparação de texto (labels de estágio) usada por várias outras funções puras do catálogo; já citada no achado do Agente 05 como réplica manual entre navegador e Node. |
| `moedaRelatorio` | Formatação pura (pt-BR), usada em vários relatórios; sem I/O. |
| `formatarDataBR` | Formatação de data pura; cobre caso com hora (`T...`) e entrada inválida/vazia. |
| `chaveMesISO` | Usada para agrupar por mês; cobre o fallback `"sem-data"`. |
| `diferencaDiasAteReferencia` vs `diferencaDiasBrutaAteReferencia` | Citadas explicitamente no prompt como candidatas — o comentário v29 do próprio código documenta que a versão "bruta" existe porque a clampada (`Math.max(0, ...)`) esconde silenciosamente datas no futuro; o teste comprova a diferença de comportamento (clampada trava em `0`, a bruta expõe `-3`) em vez de só repetir o comentário. |
| `dataDentroFaixa` | Usada em quase todo filtro de período do projeto; cobre limites inclusivos e ausência de `inicio`/`fim`. |
| `semanticaDeal` | **Função central da divergência documentada na Wave 1** — o fallback `metaStage?.semantics` é exatamente o que falta em `scripts/forecast-semanal.mjs` (ver seção de reconciliação). |
| `probabilidadeFallbackForecast` | Já identificada no catálogo de métricas (Agente 05) como replicada manualmente em mais de um arquivo — reconciliada contra `scripts/forecast-semanal.mjs` na suíte de reconciliação. |
| `classificarBucketForecast` | Fonte de verdade dos thresholds 80%/50% do Forecast Semanal e do Catálogo de Relatórios — comparada com a versão divergente do Cockpit (ver abaixo). |

### `js/cockpit.js` (`tests/cockpit.test.mjs`)

| Função | Por que foi escolhida |
|---|---|
| `cockpitContarComValor` | Correção aplicada nesta sessão (ver `WAVE_01_CORRECOES_PRODUCAO.md`) — evita que negócios com `_VALOR` ausente/zero/negativo deflacionem o ticket médio no denominador; teste cobre o filtro `> 0` e lista vazia/nula. |
| `cockpitClassificarBucketForecast` | Thresholds 70%/40%/10% + tier `"Upside"` — **deliberadamente diferentes** de `classificarBucketForecast` (80%/50%, sem `"Upside"`), documentado no próprio comentário do código (linhas 383-398) como convergência com outro projeto (Central de Inteligência Comercial). |

Um bloco de testes dedicado (`cockpit.js vs jornada.js — divergência
DOCUMENTADA de thresholds do bucket de forecast`) roda as duas funções lado
a lado com as mesmas probabilidades (60%, 45%, 20%, 5%) e comprova
explicitamente onde concordam e onde não — ex.: 45% de probabilidade é
`"Best Case"` no Cockpit mas só `"Pipeline"` no Forecast Semanal/Catálogo;
5% vira `"Upside"` só no Cockpit. Não corrige nada — só torna a divergência
já conhecida (achado do Agente 05) detectável em CI.

### Reconciliação Node vs navegador (`tests/reconciliacao-forecast.test.mjs`)

1. **`probabilidadeFallbackForecast`** — comparada em 10 combinações de
   label/semântica entre `js/jornada.js` e `scripts/forecast-semanal.mjs`.
   Hoje as duas são réplicas literalmente idênticas (o próprio código
   documenta isso com comentários `⚠️ Réplica manual`); a suíte confirma
   isso automaticamente e vai falhar se um dos dois arquivos for editado sem
   replicar no outro.
2. **`ehEstagioPiloto`** — mesma checagem, comparando `STAGE_IDS_PILOTO` e a
   detecção por texto do label ("Piloto").
3. **Classificação de semântica — caso concordante**: com negócios
   fictícios em que `STAGE_SEMANTIC_ID` está preenchido (`"S"`, `"F"`,
   `"P"`), `semanticaDeal()` (navegador) e a lógica inline equivalente em
   `main()` de `scripts/forecast-semanal.mjs` produzem o mesmo resultado —
   3 casos, todos passam.
4. **Classificação de semântica — caso divergente (o achado da Wave 1)**:
   com um negócio fictício em que `STAGE_SEMANTIC_ID` está **vazio**, mas o
   metadado do estágio (`metaStage.semantics`) indica um estágio de ganho
   (`"S"`):
   - `js/jornada.js` → `semanticaDeal(deal, metaStage)` usa o fallback
     `metaStage?.semantics` e classifica corretamente como `"success"`.
   - `scripts/forecast-semanal.mjs` → não tem esse fallback (a lógica
     inline só lê `d.STAGE_SEMANTIC_ID`) e classifica como `"process"` —
     incorretamente, se o estágio real for de ganho ou perda.
   - Causa raiz confirmada por leitura de código: `buscarLabelsEstagiosComercial()`
     em `scripts/forecast-semanal.mjs` busca só `NAME` via
     `crm.status.list` (`labels[STATUS_ID] = st.NAME`) — nunca busca o
     campo de semântica por estágio. No navegador,
     `buscarMetadadosFunisEEstagios()` (`js/jornada.js`) busca
     `st?.EXTRA?.SEMANTICS || st.SEMANTICS` por estágio e é isso que
     `semanticaDeal()` usa como fallback.
   - Os 3 testes deste bloco **passam hoje** — não porque a divergência foi
     corrigida (está fora do escopo desta tarefa), mas porque cada teste
     captura o comportamento atual: um confirma o resultado do navegador
     (`"success"`), outro confirma o resultado do Node (`"process"`), e o
     terceiro (`assert.notEqual`) confirma que os dois **de fato divergem**
     nesse cenário. Se algum dia o fallback for adicionado ao script Node
     (fora do escopo aqui), esse terceiro teste passa a falhar — sinal
     correto de que a documentação/reconciliação precisa ser atualizada.

Todos os dados de negócio usados nos testes (`fixture-1`, `fixture-2`,
"negócio fictício", etc.) são fictícios, criados só para este teste — não
são dados reais de cliente extraídos do Bitrix.

## Desvio do comando pedido: `node --test tests/*.test.mjs` em vez de `node --test tests/`

O `package.json` usa `"test": "node --test tests/*.test.mjs"` em vez do
literal `"node --test tests/"`. Motivo: testado neste ambiente (Node
v22.22.2), passar o diretório `tests/` (com ou sem barra final, com ou sem
`./`) como argumento posicional de `node --test` falha com
`Error: Cannot find module '.../tests'` — o runner tenta `require()` o
diretório como módulo em vez de escanear recursivamente os arquivos
`*.test.mjs` dentro dele. Reproduzido também num diretório mínimo fora do
projeto (um único arquivo de teste, sem `package.json`), então não é efeito
de nenhum arquivo deste repositório. `node --test` sem nenhum argumento (que
escaneia o diretório atual) e `node --test tests/*.test.mjs` (glob explícito
— resolvido pelo shell antes de chegar ao Node) funcionam normalmente nesse
mesmo ambiente. Optou-se pelo glob explícito porque é determinístico e não
depende do `cwd` de onde `npm test` é chamado. Se o ambiente de quem rodar
isto tiver um build de Node onde `node --test tests/` funciona normalmente
(é o comportamento documentado/esperado do Node ≥ 18.9), os dois comandos
são equivalentes hoje, já que todos os arquivos de teste estão direto em
`tests/` (sem subpastas de teste — só `tests/helpers/`, que não casa com
`*.test.mjs`).

## Limitações — o que NÃO está coberto ainda

- **Nenhuma função que toca DOM/rede foi testada.** Tudo que lê
  `document.getElementById`, faz `fetch` ao Bitrix, renderiza HTML/tabela
  (`tabelaRelatorio`, `cockpitCalcular`, extratores, etc.) fica de fora —
  exigiria um DOM real (jsdom ou similar, que não está instalado; nenhuma
  dependência nova foi adicionada, conforme pedido) ou mocks muito mais
  elaborados para testar com confiança.
- **`moedaRelatorio`/`formatarDataBR` foram verificadas como puras e
  testadas** (não dependem de `Intl` com dados externos além do que o
  próprio Node/ICU já embute) — mas não há teste de locale/ICU
  (`toLocaleString("pt-BR")`) em ambientes Node com ICU reduzido
  (`small-icu`); este ambiente tem `full-icu` e os testes passam.
- **Só 3 das várias funções puras replicadas manualmente** entre navegador
  e Node foram reconciliadas (`normalizarTextoChave`, `ehEstagioPiloto`,
  `probabilidadeFallbackForecast`, mais a classificação de semântica
  inline). `js/config.js` (`METAS_FORECAST_MENSAL_PADRAO`) também é citado
  nos comentários de `scripts/forecast-semanal.mjs` como precisando bater
  manualmente com o `const` homônimo no script Node — **não foi
  reconciliado nesta suíte** (fica como próximo candidato natural).
- **`classificarBucketForecast`/`cockpitClassificarBucketForecast` não
  foram comparados contra nenhum equivalente em `scripts/forecast-semanal.mjs`**
  porque esse script não tem uma função de bucket própria (só calcula
  probabilidade ponderada, não classifica em Commit/Best Case/Pipeline) —
  não há nada para reconciliar aí hoje.
- **Nenhum teste de integração/end-to-end** (abrir um `.html` de verdade,
  clicar em algo, verificar o que aparece na tela). Esta suíte é só de
  unidade, sobre funções puras.
- **A divergência de semântica documentada aqui não foi corrigida** —
  propositalmente, por estar fora do escopo desta tarefa (ver missão,
  item 3). Corrigi-la implicaria decidir se `scripts/forecast-semanal.mjs`
  deveria passar a buscar `SEMANTICS` por estágio via `crm.status.list`
  (mudança de comportamento em produção, não coberta aqui).
- Este relatório e a suíte cobrem só o item 3 da Wave 2.1 (fundação de
  testes) — não é uma auditoria completa de todas as funções puras do
  catálogo do Agente 05; é o conjunto inicial pedido nesta tarefa.
