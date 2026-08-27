# Agente 05 — Metrics Governance Agent

Catálogo real de métricas/KPIs extraído do código do dashboard estático
(`js/cockpit.js`, `js/forecast.js`, `scripts/forecast-semanal.mjs`, `js/sdr.js`,
`js/jornada.js`, `js/catalogo-relatorios.js`, `js/config.js`), confrontado com
o formato-alvo do pacote de especificação
(`06_RELATORIOS_E_METRICAS/00_CATALOGO_MESTRE_RELATORIOS.txt`,
`01_VENDIDO_FATURADO_REALIZADO_RECEBIDO.txt`, `12_TEMPLATES/TEMPLATE_KPI.txt`).

Todas as fórmulas abaixo foram lidas diretamente do código-fonte nesta wave
(nenhuma foi inferida do nome do KPI ou copiada de documentação sem checar o
código). Onde o próprio código já documentava a fórmula em comentário
(`COCKPIT_COMERCIAL.md` é excepcionalmente detalhado nesse sentido), isso é
citado como reforço, nunca como substituto da leitura do código.

## Resumo executivo

- O projeto **não tem** um catálogo de métricas versionado, formal, único.
  O que existe é (a) código espalhado em 6 arquivos JS que calculam ~25
  indicadores distintos, e (b) um documento de engenharia excelente mas não
  normativo, `COCKPIT_COMERCIAL.md`, que descreve as fórmulas de um único
  módulo (o Cockpit) — os outros 5 módulos (Forecast Semanal, o script Node
  de e-mail, SDR, Catálogo de Relatórios, Jornada) não têm documentação de
  fórmula fora do próprio código.
- **Nenhuma métrica tem "owner" definido** em lugar nenhum do projeto — nem
  no código, nem em `COCKPIT_COMERCIAL.md`, nem em `AUDITORIA_ESTADO_ATUAL.md`.
  O único conceito de "responsável" que existe é `ASSIGNED_BY_ID` (o vendedor
  dono do negócio no Bitrix), que é um dado de negócio, não um dono de
  definição de métrica. Isso é reportado como lacuna em **todas** as métricas
  abaixo.
- **A distinção Vendido → Faturado → Realizado → Recebido**, que o pacote de
  especificação trata como 4 conceitos e uma cadeia de gaps
  (`01_VENDIDO_FATURADO_REALIZADO_RECEBIDO.txt`), **não existe no código**.
  O projeto tem só dois momentos de receita: "negócio ganho" (`_SEMANTICA ===
  "success"` no funil Comercial) e "contrato assinado" (etapa nomeada no
  funil Financeiro). Nenhum dos dois é claramente "Faturado" (nota fiscal),
  "Realizado" (execução/entrega) ou "Recebido" (caixa) no sentido contábil
  que a especificação usa — é um mapeamento pendente, não uma
  implementação divergente.
- **A inconsistência mais grave encontrada não é teórica — está ativa na
  tela hoje**: o Forecast Semanal (`js/forecast.js`) mostra **dois valores
  diferentes para "Fechado no mês"** na mesma sessão, dependendo de qual
  parte da tela o usuário olha (ver Inconsistência 1). O relatório semanal
  por e-mail (`scripts/forecast-semanal.mjs`, gerado toda semana via GitHub
  Actions) usa uma terceira fórmula, diferente das duas anteriores (ver
  Inconsistência 2).
- **"Win Rate" tem pelo menos 3 fórmulas diferentes** coexistindo no projeto
  (coorte por data de criação vs. coorte por data de fechamento vs. coorte
  por Lead com atividade no período) — ver Inconsistência 3.
- **"Ticket Médio" tem pelo menos 4 bases de cálculo diferentes** (funil
  Comercial vs. Financeiro, coorte por criação vs. por fechamento, ganhos vs.
  pipeline aberto) — ver Inconsistência 4.
- Pontos fortes a reconhecer: o Cockpit (`js/cockpit.js`) e seu
  `COCKPIT_COMERCIAL.md` já fizeram um trabalho de governança informal
  notável — documentam explicitamente 3 "divergências" resolvidas contra um
  projeto irmão (Central de Inteligência Comercial), nunca escondem "não
  disponível" atrás de zero, e sinalizam limitações conhecidas. Isso deveria
  virar o ponto de partida do catálogo oficial, não ser descartado.

---

## Catálogo de métricas

Cada métrica traz: nome, fórmula com evidência (arquivo:linha), fonte de
dados Bitrix, granularidade, periodicidade, owner (quando existir) e
confiança/limitações. "Owner: **não definido em lugar nenhum do projeto**"
se repete porque é, de fato, o estado real em todos os casos — não é
omissão deste catálogo.

### 1. Meta Mensal (`METAS_FORECAST_MENSAL_PADRAO` / `metaMensalPadrao`)
- **Fórmula**: tabela fixa mês→valor no código-fonte, sem ano associado:
  `js/config.js:335-341` — `{1: 13650.00, 2: 27300.00, ..., 12: 21195.70}`.
  `metaMensalPadrao(dataISO)` pega o mês da data e retorna o valor da tabela.
  **Réplica manual idêntica** em `scripts/forecast-semanal.mjs:91-94,165-168`
  (comentário no próprio código, `js/config.js:330-334`, avisa que as duas
  cópias precisam ser mantidas sincronizadas manualmente — não há
  compartilhamento de módulo entre navegador e o script Node do GitHub
  Actions).
- **Fonte de dados**: nenhuma — é uma constante hardcoded no código, não vem
  do Bitrix. É só o valor pré-preenchido; o usuário pode sobrescrever no
  campo editável antes de cada extração.
- **Granularidade**: por mês-calendário (1 valor por mês do ano, reaplicado
  todo ano — não há um valor por ano+mês, só por mês).
- **Periodicidade**: mensal.
- **Owner**: não definido. Não há indicação de quem definiu esses valores,
  quando, nem para qual ano-calendário eles valem (a tabela reaplica os
  mesmos 12 valores todo ano, o que é uma limitação/lacuna, não uma feature).
- **Confiança**: alta quanto à leitura do código. **Limitação**: valores de
  meta são dado de negócio sensível fora do escopo deste agente validar; o
  risco de governança é a duplicação manual entre dois arquivos e a ausência
  de "ano de vigência".

### 2. "Fechado no mês" / Resultado do Mês — **3 fórmulas distintas coexistindo**
Ver **Inconsistência 1 e 2** abaixo para o detalhe comparativo. Resumo das
3 variantes, todas rotuladas como "Fechado" ou "Entregue":

**2a. Cockpit — `cockpitCalcular` bloco A (`js/cockpit.js:485-498`)**
- **Fórmula**: soma de `_VALOR` dos negócios do **funil Financeiro** cuja
  etapa (`_ESTAGIO`) contém "contrato assinado" (`cockpitEhFechadoFinanceiro`,
  `js/cockpit.js:468-471`) e cuja data de referência — `MOVED_TIME`, com
  fallback `DATE_CREATE` (`cockpitDataFechamentoFinanceiro`,
  `js/cockpit.js:475-477`) — cai no mês-calendário atual.
- **Fonte**: `crm.deal.list` no funil Financeiro (`cockpitBuscarDealsFinanceiro`,
  `js/cockpit.js:332-347`), campos `STAGE_ID`, `STAGE_SEMANTIC_ID`,
  `OPPORTUNITY`, `MOVED_TIME`, `DATE_CREATE`.
- **Granularidade**: mês-calendário atual, agregado (com drill-down por
  negócio); pode ser filtrado por vendedor/origem.
- **Periodicidade**: recalculado a cada clique em "Atualizar agora".

**2b. Forecast Semanal — cartão "Entregue" do relatório visual
(`js/forecast.js:274-287,300-301`)**
- **Fórmula**: idêntica em espírito à 2a — usa
  `r.resumo.FECHADOS_VALOR`, calculado por `construirDadosModeloForecast`
  (`js/forecast.js:128-223`), que filtra o funil Financeiro por
  `ehFechado()` (mesmo texto "contrato assinado", `js/forecast.js:164-167`)
  com `DATA_MOVIMENTO` (= `MOVED_TIME` com fallback `DATE_CREATE`,
  `js/forecast.js:145`) dentro do período. **Só que o período aqui é o
  período do relatório (semana/mês do Forecast Mensal), não sempre o
  mês-calendário atual** — diferença sutil de janela frente a 2a.
- **Fonte**: igual a 2a, buscada de novo dentro de `extrairForecastSemanal`
  (`js/forecast.js:595`, chamada a `construirDadosModeloForecast`).

**2c. Forecast Semanal — cartões de KPI em texto ("Fechado no mês",
`js/forecast.js:575-591,624,635,676`)**
- **Fórmula**: soma de `OPPORTUNITY` dos negócios do **funil Comercial**
  (não Financeiro) com `semanticaDeal(...) === "success"` e `CLOSEDATE`
  (não `MOVED_TIME`) dentro do mês-calendário atual —
  `js/forecast.js:575-582`. Guardado em `resultadoForecastSemanal.resumo.FECHADO_MES`
  e renderizado em `renderizarForecastSemanal` (`js/forecast.js:676`) como o
  KPI "Fechado no mês" — **na mesma tela e no mesmo carregamento** em que o
  relatório visual (2b) mostra o outro número.
- **Fonte**: `crm.deal.list` funil Comercial (`CATEGORY_ID` descoberto por
  `encontrarCategoriasPorPalavras`), campos `STAGE_SEMANTIC_ID`,
  `OPPORTUNITY`, `CLOSEDATE`.

**2d. Script Node do e-mail semanal — `fechadoMes`
(`scripts/forecast-semanal.mjs:271,289-292`)**
- **Fórmula**: igual a 2c (funil Comercial, `STAGE_SEMANTIC_ID===success`,
  `CLOSEDATE` no mês) — mas com sua própria reimplementação de
  `semanticaDeal` inline (linhas 283-286), não uma cópia literal da função
  `semanticaDeal` de `js/jornada.js` (que também usa `metaStage?.semantics`
  como alternativa a `STAGE_SEMANTIC_ID` — o script Node não tem esse
  fallback porque não busca metadados de estágio por categoria).
- **Fonte**: `crm.deal.list` filtrado só por `CATEGORY_ID: "0"` (Comercial
  hardcoded — `scripts/forecast-semanal.mjs:43,257`).
- **Periodicidade**: semanal, disparado por GitHub Actions; envia e-mail e
  webhook de alerta.
- **Owner**: não definido para nenhuma das 4 variantes.
- **Confiança**: alta (comportamento lido diretamente do código, com
  comentários do próprio autor confirmando a divergência intencional entre
  2a/2b e 2c — ver Inconsistência 1).

### 3. Forecast Total (previsão de fechamento do mês) — **2 fórmulas distintas**
**3a. Cockpit (`cockpitCalcular` bloco B, `js/cockpit.js:500-527`)**
- **Fórmula**: `ForecastTotal = FechadoMes(2a) + Commit(bruto) + BestCase(bruto)
  + Pipeline(ponderado)`. Commit e Best Case entram em valor cheio; só o
  tier "Pipeline" entra ponderado (`valor × probabilidade/100`); o tier
  "Upside" (probabilidade <10%) fica de fora do total (linhas 517-527).
- Documentado como "convergência com a Central de Inteligência Comercial"
  em comentário extenso (`js/cockpit.js:377-395,398-424,451-459`) e em
  `COCKPIT_COMERCIAL.md` seção "Divergência 1".

**3b. Forecast Semanal / Forecast Mensal do Catálogo
(`js/forecast.js:538,591`; `js/catalogo-relatorios.js:144-159`)**
- **Fórmula**: `ForecastTotal = Fechado + Σ(valor × probabilidade/100)` para
  **todos** os negócios abertos do período (Commit, Best Case e Pipeline
  juntos, todos ponderados) — não separa tiers de alta probabilidade em
  valor cheio. Bucket usado só para exibição (`classificarBucketForecast`,
  thresholds 80%/50%, sem tier "Upside" — `js/jornada.js:466-472`), não para
  decidir se entra ponderado ou cheio no total.
- Este é exatamente o "cálculo antigo" que o comentário do Cockpit
  (`js/cockpit.js:512-516`) descreve como "subestimava sistematicamente o
  forecast em negócios de alta probabilidade" — só que **continua em
  produção no Forecast Semanal e no Forecast Mensal do Catálogo**, que não
  foram migrados para a fórmula nova (decisão deliberada documentada em
  `COCKPIT_COMERCIAL.md`, "Divergência 1", para não alterar dois relatórios
  fora do escopo daquela tarefa).
- **Fonte**: `crm.deal.list`, `PROBABILITY` do Bitrix com fallback
  `probabilidadeFallbackForecast` (ver métrica 5).
- **Owner**: não definido.
- **Confiança**: alta — divergência documentada pelo próprio autor do
  código, não inferida por este agente.

### 4. Classificação de Bucket (Commit / Best Case / Pipeline / Upside) — **2 conjuntos de thresholds**
- **`classificarBucketForecast(prob, semantica)`** (`js/jornada.js:466-472`,
  fonte de verdade do Forecast Semanal e do Forecast Mensal do Catálogo):
  `prob≥80 → Commit`, `prob≥50 → Best Case`, resto → `Pipeline`. Sem tier
  "Upside".
- **`cockpitClassificarBucketForecast(prob)`** (`js/cockpit.js:390-395`,
  exclusiva do Cockpit): `prob≥70 → Commit`, `prob≥40 → Best Case`,
  `prob≥10 → Pipeline`, resto → `Upside`.
- **Consequência prática**: um negócio com `prob=55%` é "Best Case" no
  Forecast Semanal e também "Best Case" no Cockpit (por coincidência caem no
  mesmo bucket aqui), mas um negócio com `prob=75%` é "Commit" no Forecast
  Semanal e também "Commit" no Cockpit — já um com `prob=45%` é "Best Case"
  no Forecast Semanal mas "Best Case" no Cockpit também (40-70%); a real
  divergência aparece em `prob` entre 50-70% (Best Case no Forecast Semanal,
  Commit no Cockpit) e abaixo de 10% (Pipeline no Forecast Semanal, Upside
  no Cockpit, que sai do Forecast Total). **O mesmo negócio pode aparecer
  com bucket e inclusão no forecast diferentes conforme a tela.**
- **Owner**: não definido.

### 5. Probabilidade de Fechamento (fallback quando Bitrix não informa)
- **Fórmula** (única, replicada em 2 lugares — não é uma inconsistência de
  regra, é risco de manutenção): `probabilidadeFallbackForecast(label,
  semantica)` — sucesso→100, falha→0; senão por texto do nome do estágio:
  contém "assinatura/contrato assinado/piloto/termo aceito"→80,
  "proposta/negociação"→60, "call/visita/reunião/diagnóstico"→40,
  "nova oportunidade/novo/entrada"→20, senão→30.
  `js/jornada.js:455-464` (fonte de verdade, conforme comentário
  `js/jornada.js:439-446`) e réplica manual em
  `scripts/forecast-semanal.mjs:75-84` (comentário confirma réplica manual,
  linhas 70-74). Usado quando `PROBABILITY` do Bitrix está vazio/fora de
  1-100 (`js/forecast.js:445-447`, `js/cockpit.js:367-369`,
  `js/catalogo-relatorios.js:144`).
- **Fonte**: texto do nome do estágio (`STAGE_ID` → label via
  `crm.status.list`/metadados de funil), não um campo numérico do Bitrix.
- **Risco de governança**: 2 cópias manuais da mesma regra em arquivos que
  não compartilham módulo — qualquer mudança de regra exige lembrar de
  editar os dois (comentários no próprio código já alertam para isso).
- **Owner**: não definido.

### 6. Pipeline Total (bloco C do Cockpit)
- **Fórmula**: soma de `_VALOR` de todos os negócios do funil Comercial com
  `_SEMANTICA === "process"` (aberto), **incluindo** estágios "Piloto" —
  `js/cockpit.js:558-559`. É o único indicador do Cockpit que
  deliberadamente não filtra Piloto nem janela de aging (ver
  `COCKPIT_COMERCIAL.md` bloco 3).
- **Fonte**: `baseDealsCatalogo` (funil Comercial, `CATEGORY_ID=0`).
- **Granularidade**: agregado, com filtro de vendedor/origem/produto.
- **Periodicidade**: por carregamento (não há cache entre sessões).
- **Owner**: não definido.

### 7. Pipeline Elegível (bloco C do Cockpit) — critério próprio, não usado em nenhum outro relatório
- **Fórmula**: negócio precisa passar em **todos** os 5 critérios de
  `cockpitVerificarElegibilidade` (`js/cockpit.js:438-449`): (1) não é
  estágio Piloto, (2) `_VALOR > 0`, (3) `CLOSEDATE` preenchida, (4)
  `ASSIGNED_BY_ID` válido, (5) aging na etapa atual (`MOVED_TIME` até hoje)
  ≤ 45 dias (`COCKPIT_AGING_CRITICO_ELEGIBILIDADE_DIAS`,
  `js/cockpit.js:424`) — **mais** `CLOSEDATE` dentro do período filtrado
  (`js/cockpit.js:570-573`).
- **Limitação documentada no próprio código** (`js/cockpit.js:407-423`): um
  6º critério da fonte de referência externa citada no código ("próxima
  ação preenchida") não é aplicado porque o projeto não extrai esse campo —
  tornando este cálculo mais permissivo que a referência externa citada.
- **Fonte**: mesma base do Pipeline Total, com os campos acima.
- **Owner**: não definido. Threshold de 45 dias é descrito no próprio
  código como "critério inicial e configurável" (`js/cockpit.js:887`,
  reafirmado em `COCKPIT_COMERCIAL.md` limitação 4), **não uma meta
  corporativa validada**.
- Não existe em nenhum outro relatório do projeto (Forecast Semanal,
  Catálogo) — "Pipeline Elegível" é um conceito exclusivo do Cockpit.

### 8. Pipeline Criado no Período
- **Fórmula**: soma de `_VALOR` dos negócios cujo `DATE_CREATE` cai no
  período filtrado — `js/cockpit.js:589-590` (bloco C) e repetida como
  input de outra métrica em `js/cockpit.js:726-727` (bloco Geração de
  Pipeline, mesma fórmula, não redefinida).
- **Fonte**: `DATE_CREATE` do funil Comercial.
- **Owner**: não definido.

### 9. Coverage (atual) e Coverage Recomendado
- **Coverage atual** = `Pipeline Elegível ÷ Gap da Meta` (não ÷ meta cheia);
  `"meta batida"` se gap=0; `null` ("não disponível") se meta não
  informada — `js/cockpit.js:578-583`.
- **Coverage Recomendado** = `1 ÷ (Win Rate do período filtrado / 100)` —
  `cockpitCoverageRecomendado`, `js/cockpit.js:456-459`. Depende de qual
  "Win Rate" (ver métrica 12 — há 3 fórmulas de Win Rate no projeto; este
  Coverage usa especificamente a variante do bloco F do Cockpit).
- **Threshold de status (crítico <2x, atenção 2x-3x, saudável ≥3x)**:
  `cockpitStatusProtecao`, `js/cockpit.js:850-855` — comentário no código
  chama isso explicitamente de "critério inicial e configurável", "não é
  uma regra fixa acordada com a diretoria".
- **Fonte/Granularidade/Periodicidade**: idem Pipeline Elegível.
- **Owner**: não definido.
- Não existe em nenhum outro relatório fora do Cockpit — "Pipeline &
  Coverage" no Catálogo (`js/catalogo-relatorios.js:175-187`) calcula um
  **"Coverage 90d" diferente**: `(pipeline com CLOSEDATE em até 90 dias) ÷
  meta informada`, sem o conceito de "Pipeline Elegível" nem de "gap" — mais
  uma variante do mesmo nome genérico "coverage" com fórmula distinta.

### 10. Proteção de Receita M / M+1 / M+2 / M+3
- **Fórmula**: para cada um dos 4 meses (atual + 3 seguintes): Pipeline =
  soma de `_VALOR` de negócios abertos, não-Piloto, com `CLOSEDATE` naquele
  mês (`js/cockpit.js:597-617`) — **não** reaplica os 5 critérios completos
  de elegibilidade da métrica 7, só o recorte "aberto + não-Piloto +
  CLOSEDATE no mês" (documentado como decisão deliberada em
  `COCKPIT_COMERCIAL.md`, item 4, "para não alterar o comportamento já
  existente desta tabela específica"). Coverage = `Pipeline ÷ Meta` (meta
  cheia, diferente da métrica 9 que usa gap).
- **Owner**: não definido. Meta de cada mês vem de campos editáveis
  `#cockpitMetaM0..M3`, pré-preenchidos por `metaMensalPadrao` (métrica 1).
- Exclusivo do Cockpit.

### 11. Pipeline por Estágio (com e sem filtro de 60 dias)
- **Base sem filtro** (`c.estagios`, `agruparPorEstagio(abertosTodos)`,
  `js/cockpit.js:619-644`): todo pipeline aberto, agrupado por `_ESTAGIO`,
  com aging médio (`MOVED_TIME` até a data de referência).
- **Base "Pipeline por Estágio" visível nos cards** (`c.estagiosForecast`,
  `js/cockpit.js:653-661`): só negócios parados na etapa atual há ≤60 dias
  (`MOVED_TIME` com fallback `DATE_CREATE`), sem estágios Piloto — mesmo
  recorte usado por `dentroJanela60d` no Forecast Semanal/visual
  (`js/forecast.js:171-177`).
- **Motivo documentado da divisão em duas bases**: a base sem filtro
  alimenta o alerta de aging alto (item 12) e "Pipeline Total"/"Saúde do
  Pipeline", que precisam enxergar negócios muito parados — filtrar ali
  esconderia os piores casos (`js/cockpit.js:638-652`,
  `COCKPIT_COMERCIAL.md` item 5).
- **Owner**: não definido.

### 12. Aging (dias parado na etapa atual) e threshold de alerta
- **Fórmula**: `hoje − MOVED_TIME`, em dias — `cockpitAgingAtualDias`
  (`js/cockpit.js:429-433`), reaproveitada em `aging_sla`
  (`js/catalogo-relatorios.js:199-206`, com SLA configurável pelo usuário,
  padrão 30 dias) e em `implantacao_posvenda`
  (`js/catalogo-relatorios.js:311-319`, threshold fixo de 30 dias).
  Negócios sem `MOVED_TIME` ficam "não disponível" (nunca estimados).
- **Threshold de alerta "aging alto"** no Cockpit: 45 dias
  (`ALERTA_AGING_ALTO_DIAS`, `js/cockpit.js:887`) — mesmo valor do critério
  de elegibilidade (métrica 7), mas é uma constante separada no código (não
  a mesma variável), então uma mudança em uma não propaga para a outra.
- **Inconsistência de threshold**: Cockpit usa 45 dias como "crítico";
  `aging_sla` do Catálogo usa um SLA **editável pelo usuário** (padrão 30);
  `implantacao_posvenda` usa 30 dias fixo. Três números diferentes para
  "quanto tempo parado é demais", nenhum validado como meta corporativa.
- **Owner**: não definido.

### 13. Win Rate — **3 fórmulas distintas coexistindo** (ver Inconsistência 3)
**13a. Cockpit, bloco Eficiência da Máquina (`js/cockpit.js:542-547`)** e
**Catálogo, `ganhos_perdas_ciclo`/`performance_vendedores`**
(`js/catalogo-relatorios.js:213,224`): coorte por **data de fechamento**
(`_FECHAMENTO` = `UF_CRM_1770928318695` com fallback `CLOSEDATE`, ver
métrica 15) dentro do período filtrado. `WinRate = Ganhos / (Ganhos +
Perdidos) × 100`.

**13b. Catálogo, `conversao_comercial` (`js/catalogo-relatorios.js:189-194`)**:
coorte por **data de criação** (`DATE_CREATE`) dentro do período — pega
negócios *criados* no período e olha se, entre esses, os que já fecharam
foram ganhos ou perdidos, **independente de quando fecharam**. `WinRate =
won / (won+lost)` sobre essa coorte diferente.

**13c. SDR, `WIN_RATE_OPORTUNIDADES` (`js/sdr.js:281-289,328`)**: coorte
= negócios originados de Lead (`LEAD_ID`) cujo Lead teve atividade no
período E cujo `DATE_CREATE` (do negócio) cai no período —
`STAGE_SEMANTIC_ID` lido direto do negócio (sem passar por
`enriquecerDealCatalogo`/`_SEMANTICA`, então sem o fallback de
`metaStage?.semantics`). `WinRate = ganhos / oportunidadesPeriodo`.
- **Consequência prática**: rodando os três no mesmo período, para o mesmo
  Bitrix, os três números serão diferentes — nenhum está "errado" por si
  (são coortes diferentes, legítimas para perguntas diferentes: "eficiência
  do que fechou agora" vs. "taxa de conversão do que entrou agora" vs.
  "conversão da produção do SDR") — o problema de governança é que **todos
  são rotulados só como "Win Rate"** na UI, sem qualificação da coorte.
- **Owner**: não definido para nenhuma variante.

### 14. Ticket Médio — **pelo menos 4 bases de cálculo diferentes** (ver Inconsistência 4)
- **Cockpit "Ticket médio (mês)"** (`js/cockpit.js:496`) = Fechado do mês
  (Financeiro, métrica 2a) ÷ quantidade de ganhos financeiros do mês.
- **Cockpit "Ticket médio vendido"** (bloco Eficiência,
  `js/cockpit.js:549`) = receita ganha no período (Comercial, coorte por
  `_FECHAMENTO`) ÷ quantidade de ganhos — **base diferente da anterior**
  (Comercial vs. Financeiro) apesar de ambas aparecerem na mesma tela do
  Cockpit.
- **Cockpit "Ticket médio do pipeline"** (`js/cockpit.js:591`) = Pipeline
  Total (aberto, não fechado) ÷ quantidade de negócios abertos — mede outra
  coisa (tamanho médio de negócio em aberto, não de venda concluída).
- **Catálogo `performance_vendedores`** (`js/catalogo-relatorios.js:213`)
  = receita ganha por vendedor (coorte por `_FECHAMENTO`) ÷ ganhos daquele
  vendedor — mesma base que a Cockpit "vendido", mas segmentado.
- **Catálogo `conversao_comercial`** (`js/catalogo-relatorios.js:194`) =
  receita ganha (coorte por `DATE_CREATE`, igual ao Win Rate 13b) ÷ ganhos
  dessa coorte — coorte diferente das anteriores.
- **Forecast visual `TICKET_MEDIO_FECHADOS`**
  (`js/forecast.js:216`) = soma de `VALOR` dos "fechados" (Financeiro,
  "Contrato assinado", coorte por `MOVED_TIME`) ÷ quantidade — mesma base
  que a Cockpit "Ticket médio (mês)".
- **Owner**: não definido.

### 15. Sales Cycle / Ciclo de Venda (média e mediana)
- **Fórmula da data de fechamento usada no ciclo**: `fecharDataDeal(d) =
  parteDataISO(d.UF_CRM_1770928318695 || d.CLOSEDATE || "")`
  (`js/jornada.js:573`) — **prioriza um campo customizado** ("Data do
  contrato assinado (campo oficial)", `js/config.js:100,114`) sobre o campo
  nativo `CLOSEDATE`. `cicloDealDias(d) = fecharDataDeal(d) − DATE_CREATE(d)`,
  em dias (`js/jornada.js:575-577`).
- **Média/Mediana** calculadas em `js/cockpit.js:550-552` só sobre ganhos
  com as duas datas preenchidas (tamanho de amostra mostrado
  explicitamente, nunca escondido).
- **Risco já documentado no próprio projeto**
  (`COCKPIT_COMERCIAL.md` limitação 5): se `UF_CRM_1770928318695` não
  estiver preenchido em negócios antigos, o ciclo usa `CLOSEDATE`; **não é
  o mesmo campo usado pela métrica "Fechado no mês" do Cockpit** (que usa
  `MOVED_TIME` no funil Financeiro, métrica 2a) — ou seja, "data de
  fechamento" já significa 3 campos diferentes dentro do mesmo módulo
  (`UF_CRM_1770928318695`/`CLOSEDATE` para ciclo e Win Rate 13a;
  `MOVED_TIME` para "Fechado no mês"; `CLOSEDATE` isolado para o Forecast
  Semanal 2c/2d).
- **Owner**: não definido.

### 16. Geração de Pipeline: Pipeline Necessário, Gap de Geração, Creation Coverage, Pace
- **Pipeline Necessário** = `Meta M+1 ÷ (Win Rate / 100)` —
  `cockpitCalcularGeracaoPipeline`, `js/cockpit.js:715-737`. O próprio
  código rotula isso como **"hipótese matemática documentada, não uma regra
  validada com a diretoria"** (comentário `js/cockpit.js:701-714`,
  reafirmado em `COCKPIT_COMERCIAL.md` limitação 8).
- **Gap de Geração** = `max(0, necessário − criado)`. **Creation Coverage**
  = `criado ÷ necessário`. **Pace** = compara dias úteis decorridos no mês
  (via `ehDiaUtilISO`, reaproveitado de `js/sdr.js:157-160`) contra o total,
  projetando quanto já deveria ter sido criado.
- **Owner**: não definido. Exclusivo do Cockpit — não existe em nenhum
  outro relatório.

### 17. Data Quality Score / Completude do CRM — **2 implementações não reconciliadas**
**17a. Cockpit — `cockpitCalcularQualidadeDados` (`js/cockpit.js:813-845`)**:
- **Fórmula**: completude (%) de 5 campos (`OPPORTUNITY>0`,
  `ASSIGNED_BY_ID`, `STAGE_ID`, `CLOSEDATE`, `SOURCE_ID`) sobre a base de
  negócios **abertos** do filtro atual (cai para todos os filtrados se não
  houver abertos). **Score = média simples das 5%.** "Motivo de perda"
  sempre 0% (campo documentado como inexistente no Bitrix configurado —
  `js/cockpit.js:806-812`, `COCKPIT_COMERCIAL.md` item 10), e **não entra**
  na média do score.
- Explicitamente documentado no código para **nunca** ser confundido com
  "Forecast Confidence" (`js/cockpit.js:801-804`).

**17b. Catálogo — relatório `qualidade_crm`
(`js/catalogo-relatorios.js:329-346`)**:
- **Fórmula**: completude (%) de **9 checks diferentes** cobrindo Negócios
  (vínculo com cliente, `SOURCE_ID`, `ASSIGNED_BY_ID`, `OPPORTUNITY>0`,
  `CLOSEDATE` só para abertos) **e Leads** (`SOURCE_ID`, `ASSIGNED_BY_ID`,
  nome/empresa, telefone-ou-email) — base é **todos** os negócios (não só
  abertos) mais todos os Leads. **Não calcula um score agregado único** —
  mostra completude por regra, sem média.
- **Inconsistência**: os dois relatórios se chamam de "qualidade
  dos dados"/"qualidade do CRM", olham o mesmo Bitrix, mas usam conjuntos de
  campos diferentes, populações-base diferentes (abertos vs. todos, com ou
  sem Leads) e o Cockpit produz 1 número agregado enquanto o Catálogo produz
  9 números sem agregação — não há como comparar um "Data Quality Score" do
  Cockpit com o resultado do relatório `qualidade_crm` do mesmo período.
- **Owner**: não definido para nenhuma das duas.

### 18. Métricas de SDR (funil de qualificação) — `resumoAtividadesPeriodoSDR`, `js/sdr.js:268-335`
- **LEADS_TRABALHADOS** = quantidade de Leads distintos vinculados a alguma
  atividade no período (`bindings` do tipo Lead) — linha 313.
- **REUNIOES / LIGACOES / TAREFAS / EMAILS / WHATSAPP** = contagem de
  atividades por `TYPE_ID` (Reunião=1, Ligação=2, Tarefa=3, E-mail=4) ou por
  canal reconhecido (`canalAtividadeSDR`, `js/sdr.js:1-10`) no período —
  linhas 273-277,307-312.
- **TAXA_LEAD_REUNIAO** = `leadsComReuniao / leadsTrabalhados × 100`
  (linha 325).
- **TAXA_LEAD_OPORTUNIDADE** = `leadsComOportunidade / leadsTrabalhados ×
  100`, onde "oportunidade" = negócio com `LEAD_ID` daquele Lead e
  `DATE_CREATE` no período (linhas 281-285,326).
- **TAXA_REUNIAO_OPORTUNIDADE** = `leadsComOportunidadeEQueTiveramReunião /
  leadsComReuniao × 100` (linha 327).
- **TAXA_LEAD_GANHO** = `leadsComNegócioGanho / leadsTrabalhados × 100`
  (linha 329).
- **WIN_RATE_OPORTUNIDADES**: ver métrica 13c.
- **Fonte**: `crm.activity.list` (bindings por Lead/Negócio) + `crm.deal.list`
  filtrado por `@LEAD_ID` (`buscarDealsPorLeadIdsAnaliseSDR`,
  `js/sdr.js:211-243`).
- **Granularidade**: por SDR (via `extrairAnaliseSDR`/`extrairDiarioSDR`,
  que segmentam por usuário configurado), por período configurável.
- **Owner**: não definido.
- **Limitação relevante já documentada no Cockpit**
  (`js/cockpit.js:768-796`, `COCKPIT_COMERCIAL.md` item 8): o Cockpit
  mostra um proxy parcial ("negócios com `LEAD_ID` válido criados no
  período") e explicitamente **não** tenta recalcular estas métricas de
  SDR — evita uma duplicação de fórmula que teria custo de N+1 chamadas.
  Isso é uma boa prática de não-duplicação que vale preservar no catálogo
  oficial.

### 19. Identidade do Cliente / Duplicidade / Handoffs (Jornada) — auditoria de dados, não KPI de negócio
- **Chave de identidade do cliente** (`js/jornada.js:864-901`): prioridade
  `COMPANY_ID` (confiança ALTA) > `CONTACT_ID` (ALTA) > `LEAD_ID` (MÉDIA) >
  nome normalizado do negócio, se não parecer operacional (MÉDIA) > negócio
  isolado por `DEAL_ID` (BAIXA).
- **Sinal de duplicidade de empresa** (`construirSinaisDuplicidadeEmpresas`,
  `js/jornada.js:183-231`) e **contagem "mesmo cliente no mesmo pipeline"**
  (`js/jornada.js:908-952`) — explicitamente **nunca fundem** registros
  automaticamente (comentário linha 854-856): telefone/e-mail são "sinal de
  auditoria", só nome exato normalizado agrupa para contagem.
- Não é uma métrica de KPI executivo (não tem meta, não entra em nenhum
  card do Cockpit) — é infraestrutura de qualidade de dados que sustenta as
  outras métricas (evita contar o mesmo cliente 2x). Incluída aqui porque
  qualquer catálogo oficial de métricas de cliente/receita por conta
  (Customer 360, Cohort, LTV — itens 23,27,29 do catálogo-mestre) vai
  depender desta chave de identidade, que hoje é heurística e documentada
  como tal (confiança ALTA/MÉDIA/BAIXA já é parte do dado).
- **Owner**: não definido.

---

## Inconsistências e duplicações encontradas

1. **"Fechado no mês" tem 4 variantes ativas simultaneamente** (métrica 2,
   detalhe acima) — a mais grave é 2b vs. 2c: **dentro da mesma extração do
   Forecast Semanal**, `renderizarForecastSemanal` (KPI de texto, funil
   Comercial + `CLOSEDATE`) e `gerarHTMLForecastModelo` (relatório visual,
   funil Financeiro + `MOVED_TIME`) mostram números diferentes para
   "Fechado no mês" ao mesmo usuário, no mesmo clique de "Extrair". O
   próprio código reconhece isso como bug corrigido **só no relatório
   visual e no histórico de tendência** (`js/forecast.js:275-287,598-606`,
   comentários "para a tendência não repetir a mesma divergência
   corrigida") — mas **não corrigiu** o card de KPI em texto
   (`js/forecast.js:676`, `FECHADO_MES`), que continua usando a fórmula
   antiga. Isso é uma correção parcial, não uma correção completa.
2. **O e-mail semanal automático (GitHub Actions) usa uma 3ª/4ª fórmula**
   (`scripts/forecast-semanal.mjs:271,289-292`) que nunca recebeu a
   correção Financeiro/`MOVED_TIME` aplicada no navegador — o relatório que
   chega por e-mail para a diretoria (`comercial@atlasgr.com.br` está na
   lista de destinatários padrão, `scripts/forecast-semanal.mjs:35-39`) usa
   a mesma base "antiga" que o card de KPI do navegador, divergente do
   relatório visual e do Cockpit.
3. **Win Rate tem 3 coortes diferentes** com o mesmo nome na UI — ver
   métrica 13. Nenhuma tela qualifica qual coorte está mostrando.
4. **Ticket Médio tem ao menos 4 bases diferentes** com o mesmo nome — ver
   métrica 14.
5. **Bucket de Forecast (Commit/Best Case/Pipeline/Upside) usa 2 conjuntos
   de thresholds** (80/50 vs. 70/40/10) dependendo da tela — ver métrica 4.
   Documentado como decisão deliberada, mas o efeito prático (mesmo negócio,
   classificação diferente por tela) não está comunicado ao usuário final
   fora do código-fonte.
6. **Forecast Total usa 2 metodologias de ponderação** (tudo ponderado vs.
   Commit/Best Case cheios + só Pipeline ponderado) — ver métrica 3.
7. **"Coverage" tem 3 fórmulas**: Coverage do Cockpit (elegível ÷ gap),
   Coverage Recomendado do Cockpit (1÷WinRate), Coverage 90d do Catálogo
   (pipeline≤90 dias ÷ meta cheia) — nomes parecidos, fórmulas e
   denominadores diferentes.
8. **"Data Quality"/"Qualidade do CRM" tem 2 implementações não
   reconciliáveis** (campos diferentes, população-base diferente, uma
   agrega em score único e a outra não) — ver métrica 17.
9. **"Data de fechamento" é 3 campos Bitrix diferentes** conforme a
   métrica: `MOVED_TIME` (Fechado do mês no Cockpit/relatório visual),
   `CLOSEDATE` (Fechado do mês no card de KPI do Forecast Semanal e no
   script Node), `UF_CRM_1770928318695` com fallback `CLOSEDATE` (Ciclo de
   Venda e Win Rate por coorte de fechamento) — ver métrica 15.
10. **Threshold de "aging alto/parado"** varia por relatório sem
    reconciliação: 45 dias (Cockpit, elegibilidade e alerta), 30 dias fixo
    (`implantacao_posvenda`), 30 dias editável pelo usuário
    (`aging_sla`) — ver métrica 12.
11. **Vendido vs. Faturado vs. Realizado vs. Recebido** (conceitos do
    pacote de especificação, `06_RELATORIOS_E_METRICAS/01_...txt`) **não
    têm equivalente separado no código**: o projeto só distingue "negócio
    ganho" (funil Comercial) de "contrato assinado" (funil Financeiro) — o
    que a especificação chamaria talvez de "Vendido" e algo entre
    "Faturado"/"Realizado", mas nenhum dos dois é claramente "Recebido"
    (não há integração com contas a receber/fluxo de caixa em nenhum
    arquivo do projeto). Isso não é uma divergência de fórmula — é uma
    lacuna de modelagem que qualquer catálogo oficial dessas 4 métricas
    vai precisar resolver antes de nomear os campos existentes.
12. **METAS_FORECAST_MENSAL_PADRAO duplicada em 2 arquivos**
    (`js/config.js` e `scripts/forecast-semanal.mjs`) e
    **`STAGE_IDS_PILOTO`/`probabilidadeFallbackForecast`/`ehEstagioPiloto`
    duplicadas em 2 arquivos** (`js/jornada.js` e
    `scripts/forecast-semanal.mjs`) — risco de manutenção alto: uma edição
    de regra de negócio feita só no navegador (mais visível/mais editado)
    silenciosamente diverge do script Node do e-mail semanal, que roda sem
    supervisão via GitHub Actions.

---

## Métricas referenciadas mas não verificáveis

- **"Leads trabalhados" e "Reuniões agendadas/realizadas" no resumo de SDR
  do Cockpit**: a UI do Cockpit reserva esses rótulos, mas o próprio código
  retorna `null` explicitamente (`js/cockpit.js:794`, comentário nas
  linhas 768-777) porque o Cockpit não extrai Leads/atividades. Isto **não
  é uma fórmula ausente por omissão de investigação** — é uma decisão
  deliberada e documentada; a fórmula real dessas métricas existe em
  `resumoAtividadesPeriodoSDR` (`js/sdr.js:268-335`, ver métrica 18), só
  não está conectada ao Cockpit.
- **"Motivo de perda"** — referenciado no bloco de Qualidade dos Dados do
  Cockpit (`js/cockpit.js:806-812,836-839`) como um campo que sempre
  retorna 0% de completude. Não existe, em nenhum arquivo do projeto
  (`config.js`, `catalogo-relatorios.js`, `forecast.js`, `sdr.js`), um
  campo Bitrix (nativo ou `UF_CRM_*`) mapeado para motivo de perda —
  **fórmula não existe porque o dado de origem não existe**, não por
  fórmula não localizada.
- **"Próxima ação preenchida" como critério de Pipeline Elegível** — citado
  em comentário (`js/cockpit.js:407-423`) como critério de uma fonte de
  referência externa ao projeto, mas nunca implementado aqui porque o campo
  correspondente não é extraído.
- Os 58 relatórios listados em
  `06_RELATORIOS_E_METRICAS/00_CATALOGO_MESTRE_RELATORIOS.txt` do pacote de
  especificação — deste agente foram localizados com fórmula real no código
  apenas os equivalentes a: **Ticket Médio (15)**, **Sales Cycle (24)**,
  **Pipeline & Coverage (40)**, e parcialmente **SDR Command Center (52)**
  e **Forecast & Revenue Intelligence (54)**. Os demais 50+ itens do
  catálogo-mestre (Growth MoM/QoQ/YoY/YTD, NRR/GRR, LTV, LTV×CAC, Cohort,
  Churn Risk/Logo/Revenue, Revenue at Risk, Revenue Momentum, Early Warning
  System, What-if Simulator, Driver Analysis, Executive Intelligence
  Report, Pipeline Movement Waterfall, Sales Velocity, Funnel Leakage,
  Forecast Accuracy & Bias, Revenue Leakage, Next Best Action, Customer
  360, Data Trust Center, Action Center, etc.) **não têm nenhuma
  implementação no código atual** — não é o caso de "fórmula não
  localizada", é ausência confirmada por varredura de todo `js/*.js` e
  `scripts/*.mjs` (nenhuma ocorrência de termos equivalentes a churn, NRR,
  GRR, LTV, cohort, ou growth YoY/MoM em nenhum arquivo).

---

## Riscos

1. **Risco de confiança executiva**: o mesmo relatório (Forecast Semanal)
   mostrando dois números de "Fechado no mês" na mesma tela é o tipo de
   divergência que mina a confiança de quem toma decisão olhando o
   dashboard — e já teria acontecido silenciosamente em produção (o
   comentário do código sobre a "correção" data de uma versão anterior e só
   cobriu parte da tela).
2. **Risco de manutenção**: 2 pares de regras de negócio duplicadas
   manualmente entre navegador e script Node (metas mensais; estágios
   Piloto + fallback de probabilidade) sem nenhum teste automatizado que
   detecte divergência — uma mudança de regra pode ficar "meio aplicada"
   por semanas sem ninguém perceber, porque o e-mail semanal roda sem
   supervisão humana direta.
3. **Risco de decisão sobre número errado**: "Win Rate" e "Ticket Médio"
   sendo usados em conversas de diretoria sem qualificar a coorte (por
   criação vs. por fechamento vs. por atividade do SDR) pode levar a
   comparação de números que não são comparáveis entre si (ex.: comparar o
   Win Rate do Cockpit com o Win Rate do relatório `conversao_comercial` do
   mesmo mês e concluir — errado — que um dos dois "está errado").
4. **Risco de threshold não validado virar regra de fato**: coverage
   2x/3x, aging 45/30 dias e "Pipeline necessário = Meta÷WinRate" são
   descritos no próprio código como não-validados com a diretoria, mas já
   disparam alertas visuais (🔴/🟡) que, na prática, tendem a ser tratados
   como critério oficial pelo usuário final se nunca forem formalmente
   ratificados ou explicitamente descartados.
5. **Risco de modelagem para a wave de Vendido/Faturado/Realizado/
   Recebido**: sem uma decisão de qual campo/etapa do Bitrix mapeia para
   cada um dos 4 conceitos, qualquer agente futuro que tente implementar os
   relatórios 01-04 do catálogo-mestre corre o risco de reaproveitar
   "negócio ganho" ou "contrato assinado" para os 4 rótulos, criando uma 5ª
   variante de "fechado" no projeto.
6. **Risco de escopo**: 50+ dos 58 relatórios do catálogo-mestre de
   especificação não têm nenhuma base de dado ou fórmula hoje — se as
   próximas waves assumirem que "o dado já existe, só falta o relatório",
   vão descobrir tarde que falta extração (histórico de estágio completo,
   contas a receber, dados de churn/contrato por período, custo de
   aquisição) antes mesmo de fórmula.

---

## Recomendações priorizadas (o que formalizar/versionar primeiro)

1. **Resolver a divergência ativa de "Fechado no mês" no Forecast Semanal**
   (Inconsistência 1) — é a única encontrada nesta wave que já está
   afetando o que a diretoria vê hoje, dentro da mesma tela. Prioridade
   imediata, antes de qualquer catalogação formal.
2. **Unificar (ou eliminar) o script Node duplicado**
   (`scripts/forecast-semanal.mjs`) com a fonte de verdade do navegador —
   ou aceitar formalmente que ele é uma cópia com propósito diferente
   (e-mail simples, sem os refinamentos do Cockpit) e documentar isso como
   decisão consciente, não como pendência esquecida.
3. **Nomear as métricas por coorte, não por rótulo genérico**: renomear (ou
   no mínimo subtitular na UI e no catálogo oficial) "Win Rate" e "Ticket
   Médio" para deixar explícita a coorte/funil usados em cada tela — isso
   sozinho resolve boa parte do risco de confiança sem exigir escolher
   "qual está certo".
4. **Adotar `COCKPIT_COMERCIAL.md` como semente do catálogo oficial de
   métricas** (formato TEMPLATE_KPI) — é o único documento do projeto que
   já tem fórmula, fonte e limitação por indicador; falta só granularidade
   formal, periodicidade e (principalmente) owner.
5. **Definir owners de métrica** — nem que seja um único "owner interino"
   por família (Comercial/Forecast, SDR, Qualidade de Dados) enquanto não
   há um dono formal por KPI; hoje o campo simplesmente não existe em
   nenhuma métrica.
6. **Mapear Vendido/Faturado/Realizado/Recebido para campos/etapas Bitrix
   reais** antes de qualquer implementação dos relatórios 01-04 do
   catálogo-mestre — decisão de modelagem, não de código.
7. **Reconciliar os 2 relatórios de qualidade de dados** (Cockpit vs.
   `qualidade_crm`) em um único conjunto de campos/checks com um score
   opcional, ou documentar formalmente que servem a propósitos diferentes
   (executivo vs. auditoria operacional) e devem continuar separados.
8. **Formalizar (ratificar ou descartar) os thresholds hoje marcados como
   "não validados"**: coverage 2x/3x, aging 45 dias, "Pipeline necessário =
   Meta÷WinRate" — decisão de negócio pendente há mais de uma versão do
   código (os próprios comentários já pedem isso).

---

## Dependências e próximos agentes indicados

- **Agente de dados/extração (Bitrix)**: para viabilizar Vendido/Faturado/
  Realizado/Recebido como conceitos distintos, provavelmente é necessário
  mapear novos campos (nota fiscal? data de execução do contrato? conexão
  com contas a receber?) — nenhum existe hoje no schema extraído
  (`ENTIDADES` em `js/config.js`).
- **Agente de arquitetura/plataforma**: a duplicação `js/config.js` ↔
  `scripts/forecast-semanal.mjs` (metas, estágios Piloto, fallback de
  probabilidade) é sintoma de falta de módulo compartilhado entre navegador
  e Node — decisão de bundler/módulo ES é pré-requisito técnico para
  eliminar essa classe de risco, não algo que este agente de métricas
  resolve sozinho.
- **Agente de UX/produto**: qualificação visível de coorte em Win
  Rate/Ticket Médio (recomendação 3) é mudança de interface, não só de
  definição — precisa de alguém que decida como comunicar isso sem
  sobrecarregar a tela.
- **Agente de governança/negócio (diretoria)**: ratificação dos thresholds
  não validados (recomendação 8) e definição de owners de métrica
  (recomendação 5) são decisões que nenhum agente técnico pode tomar
  sozinho — precisam de decisão humana registrada.
- **Próxima wave deste mesmo agente (Metrics Governance)**: uma vez essas
  decisões tomadas, preencher o `TEMPLATE_KPI.txt` formalmente por métrica
  (Metric ID, versão, data de vigência, testes, dashboards consumidores) —
  este catálogo desta wave já traz fórmula/fonte/granularidade/
  periodicidade/owner(ausente), mas não os campos de versionamento formal
  do template (Metric ID, Versão, Freshness, Testes).

---

## Confiança e limitações

- **Confiança geral: alta** para as fórmulas citadas com arquivo:linha —
  foram lidas diretamente do código-fonte nesta wave, não inferidas do nome
  do KPI nem copiadas de `COCKPIT_COMERCIAL.md` sem conferência (esse
  documento foi usado como reforço/checagem cruzada, e uma divergência real
  entre ele e o comportamento atual do código foi encontrada e reportada —
  ver Inconsistência 1, item 2b/2c: o próprio `COCKPIT_COMERCIAL.md` não
  documenta o Forecast Semanal, só o Cockpit, então essa inconsistência só
  apareceu ao ler `js/forecast.js` diretamente).
- **Não foi executado nenhum teste contra um Bitrix real** — este agente
  não tem webhook nem acesso a dados de produção; toda verificação é
  estática (leitura de código). Onde o próprio projeto já registra essa
  mesma limitação (`COCKPIT_COMERCIAL.md` item 6), isso foi citado, não
  reinventado.
- **Não foi lido 100% de `js/sdr.js` (1646 linhas) nem `js/jornada.js`
  (1336 linhas) linha a linha** — foram lidas as funções de cálculo de
  métrica (`resumoAtividadesPeriodoSDR`, chaves de identidade/duplicidade)
  e as assinaturas de todas as funções do arquivo (via busca estrutural),
  mas as ~900 linhas de renderização de HTML/tabelas em `sdr.js`
  (`extrairAnaliseSDR`, `extrairDiarioSDR`, ambas de centenas de linhas) não
  foram lidas por completo. Não há indício, pelas assinaturas e pelos
  trechos lidos, de que essas seções redefinam fórmula de negócio além do
  que já está capturado em `resumoAtividadesPeriodoSDR` — mas isso não foi
  confirmado linha a linha, e deveria ser revisado antes de considerar o
  catálogo de métricas de SDR 100% completo.
- **`js/catalogo-relatorios.js` tem outros ~15 relatórios** (`funil_leads`,
  `produtos_receita`, `clientes_receita`, `sla_primeiro_contato`,
  `decisao_final_sdr`, `produtividade_atividades`, etc.) cujas fórmulas
  **não foram extraídas nesta wave** — foram identificados os principais
  (Forecast Mensal, Pipeline & Coverage, Conversão Comercial, Aging & SLA,
  Performance por Vendedor, Ganhos/Perdas/Ciclo, Qualidade do CRM,
  Duplicidades, Implantação/Pós-venda, Origens & Canais) por serem os que
  mais se cruzam com o Cockpit e o Forecast. Os demais devem ser cobertos
  em uma wave seguinte antes de declarar o catálogo definitivamente
  completo.
- **Metas de negócio (valores de `METAS_FORECAST_MENSAL_PADRAO`) não foram
  questionadas quanto a estarem corretas** — só reportadas como não
  versionadas/sem ano de vigência, que é uma questão de governança, não de
  correção do valor em si (fora do escopo deste agente avaliar).
