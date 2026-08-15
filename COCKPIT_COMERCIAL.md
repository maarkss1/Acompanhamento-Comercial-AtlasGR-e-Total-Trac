# Cockpit Comercial Executivo

Documentação do que foi implementado na tarefa "Cockpit Comercial Executivo" (ver
`AUDITORIA_ESTADO_ATUAL.md` para o mapeamento geral do projeto). O Cockpit é uma
nova visão dentro da mesma ferramenta client-side (`Relatorios AtlasGR.html`),
não um projeto novo, e não removeu nenhuma funcionalidade existente.

Arquivos alterados/criados:
- `js/cockpit.js` (novo) — toda a lógica do Cockpit.
- `Relatorios AtlasGR.html` — nova seção `#cockpit-executivo` (landing), nav
  reorganizada em 4 áreas, modal de drill-down, `<script src="js/cockpit.js">`.
- `css/styles.css` — estilos do Cockpit (bloco final do arquivo).
- `js/app.js` — chama `iniciarCockpitExecutivo()` no boot.

## Navegação reorganizada

A `quick-nav` do topo passou a ter 4 grupos visuais (mesmos links de antes,
nenhum removido): **Cockpit Executivo**, **Relatórios Comerciais** (Forecast
semanal, Central de Inteligência v10, Catálogo), **SDR & Operação** (Diário
SDR, Análise SDR, Jornada) e **Extração & Diagnóstico** (wizard passos 1–8).
O Cockpit passou a ser a primeira seção da página (`<main>`), antes do
wizard de extração manual — a "nova tela inicial" pedida, sem excluir o
acesso às telas antigas.

## Indicadores implementados

Todos os blocos abaixo usam **somente** negócios do funil Comercial
(`CATEGORY_ID=0`), obtidos via `baseDealsCatalogo(webhook, true)` — mesma
função usada pelos relatórios `pipeline_coverage`, `performance_vendedores`
etc. do catálogo (`js/catalogo-relatorios.js:6`). Cada negócio é enriquecido
por `enriquecerDealCatalogo` (`js/catalogo-relatorios.js:22`), que já calcula
`_SEMANTICA`, `_ESTAGIO`, `_CLIENTE`, `_RESPONSAVEL`, `_VALOR`, `_FECHAMENTO`
e `_CICLO` — o Cockpit não recalcula essas fórmulas, só as consome.

### 1. Resultado do Mês (`cockpitCalcular`, `js/cockpit.js:257`, bloco A)
- **Fonte**: negócios com `_SEMANTICA==="success"` e `_FECHAMENTO` dentro do
  **mês-calendário atual** (`cockpitMesAtual`, `js/cockpit.js:238` — mesma
  convenção do Forecast semanal, que também sempre olha o mês atual
  independente do período filtrado, ver `js/forecast.js:303-307`).
- **Meta New MRR**: campo editável `#cockpitMetaMensal`, pré-preenchido por
  `metaMensalPadrao()` (`js/config.js:289`, tabela `METAS_FORECAST_MENSAL_PADRAO`).
- **Fechado** = soma de `_VALOR` dos ganhos do mês.
- **% da Meta** = `Fechado / Meta × 100` (uma casa decimal). "não disponível"
  se meta não informada.
- **Gap** = `max(0, Meta − Fechado)`.
- **Negócios ganhos** = contagem.
- **Ticket médio** = `Fechado / Negócios ganhos`.

### 2. Forecast (`js/cockpit.js:257`, bloco B)
- **Fonte**: negócios abertos (`_SEMANTICA==="process"`), **excluindo
  estágios "Piloto"** (`ehEstagioPiloto`, `js/jornada.js:421`), com
  `CLOSEDATE` dentro do mês atual.
- **Classificação**: reaproveita exatamente `probabilidadeFallbackForecast`
  e `classificarBucketForecast` (`js/jornada.js:426` e `:437`) via o helper
  `cockpitClassificarAberto` (`js/cockpit.js:249`) — a mesma fórmula do
  Forecast semanal/mensal, não uma nova regra.
- **Commit / Best Case / Pipeline (forecast)** = soma de `_VALOR` por bucket.
- **Forecast ponderado** = soma de `_VALOR × probabilidade / 100`.
- **Forecast total do mês** = Fechado do mês + Forecast ponderado.
- **Gap do Forecast** = `max(0, Meta − Forecast total)`.
- O aviso fixo no bloco "Saúde do Pipeline" (`#cockpitAvisoPipelineForecast`)
  deixa explícito que **Pipeline Total não é o mesmo número que aparece
  aqui como previsão** — requisito P0 do escopo.

### 3. Saúde do Pipeline (bloco C)
- **Pipeline Total** = soma de `_VALOR` de todos os negócios abertos do
  Comercial (inclui estágios "Piloto" — é o valor bruto do funil, não uma
  previsão).
- **Pipeline Elegível** = negócios abertos, sem "Piloto", com `CLOSEDATE`
  dentro do **período selecionado no filtro** (`cockpitPeriodoFiltro`,
  `js/cockpit.js:78` — usa `calcularIntervaloPreset`, `js/bitrix-api.js:119`,
  a mesma função de intervalo rápido do wizard). Se nenhum período estiver
  selecionado, cai no mês atual.
- **Coverage** = `Pipeline Elegível ÷ Gap da meta` (não ÷ meta cheia). Se o
  Gap for zero, mostra "meta batida"; se a meta não foi informada, mostra
  "não disponível".
- **Pipeline criado no período** = soma de `_VALOR` dos negócios cujo
  `DATE_CREATE` cai no período filtrado.
- **Ticket médio do pipeline** = `Pipeline Total ÷ quantidade de negócios abertos`.

### 4. Proteção de Receita M / M+1 / M+2 / M+3 (bloco D, `js/cockpit.js:305-321`)
- Para cada um dos 4 meses (atual + 3 seguintes): Meta (campo editável,
  pré-preenchida por `metaMensalPadrao` do mês correspondente), Pipeline
  Elegível daquele mês (mesma regra do item 3, sem "Piloto"), Coverage
  (`Pipeline ÷ Meta`) e Status.
- **Threshold de status** (`cockpitStatusProtecao`, `js/cockpit.js:381`):
  `<2x` = crítico, `2x–3x` = atenção, `≥3x` = saudável. **Critério inicial e
  configurável**, documentado em comentário no código — não é uma regra de
  negócio fixa acordada com a diretoria, só um ponto de partida razoável.

### 5. Pipeline por Estágio (bloco G, `js/cockpit.js:339-354`)
- Agrupa **todos** os negócios abertos do Comercial (inclui "Piloto", para
  mostrar o funil completo) por `_ESTAGIO`.
- Por estágio: quantidade, soma de valor, % do total, e **aging médio** —
  média de dias entre `MOVED_TIME` e a data de referência, mesma lógica de
  aging usada em `aging_sla` (`js/catalogo-relatorios.js:169-176`). Estágios
  sem `MOVED_TIME` preenchido ficam com aging "não disponível" (não entram
  na média, mas contam na quantidade/valor).
- Clique no estágio abre o drill-down com os negócios daquele estágio.

### 6. Eficiência da Máquina (bloco F, `js/cockpit.js:325-336`)
- **Fonte**: negócios fechados (`_SEMANTICA!=="process"`) com `_FECHAMENTO`
  dentro do período filtrado — mesmo recorte do relatório
  `ganhos_perdas_ciclo` (`js/catalogo-relatorios.js:190-196`).
- **Win Rate** = `Ganhos / (Ganhos + Perdidos) × 100`. "não disponível" se
  não houver nenhum fechamento no período.
- **Ticket médio vendido** = receita ganha ÷ quantidade de ganhos.
- **Sales Cycle** = média e mediana de `_CICLO` (dias entre `DATE_CREATE` e
  a data de fechamento, `cicloDealDias`, `js/jornada.js:508`) só dos ganhos
  com as duas datas preenchidas. O tamanho da amostra é mostrado
  explicitamente na nota abaixo do bloco.

## Drill-down (requisito 9)

Toda métrica numérica relevante tem `data-drill` associado a uma lista de
negócios guardada em `cockpitDrill` (populada dentro de `cockpitCalcular`).
Clicar no card/linha chama `cockpitAbrirDrill(chave, titulo)`
(`js/cockpit.js:471`), que abre um modal (reaproveitando a mesma estrutura
visual do modal de ajuda já existente, `#helpModal`) com a tabela via
`tabelaRelatorio` (`js/jornada.js:471`): Empresa/Cliente, Valor, Etapa,
Vendedor, CLOSEDATE.

## Filtros

- **Período**: presets rápidos (mensal/semana atual/trimestral/todas/
  personalizado) reaproveitando `calcularIntervaloPreset`.
- **Vendedor**: `carregarVendedoresCockpit()` busca `user.get` (mesmo padrão
  de `carregarVendedores`, `js/bitrix-api.js:355`), popula `#cockpitVendedor`;
  a troca de vendedor **não refaz a chamada ao Bitrix** — só refiltra o
  cache local (`cockpitReaplicarFiltros`).
- **Origem**: `carregarOrigensCockpit()` usa `mapaOrigensRelatorio`
  (`js/catalogo-relatorios.js:1`), mesmo padrão de origem do catálogo.
- **Produto**: **limitação conhecida** — o Bitrix não tem filtro de produto
  em `crm.deal.list`; produtos só são obtidos via `crm.deal.productrows.get`
  **por negócio** (N+1, já sinalizado como gargalo de performance na
  auditoria, seção 14). Para não pagar esse custo em todo carregamento do
  Cockpit, o filtro de produto é opt-in: só dispara buscas quando o usuário
  digita um termo, e só sobre os negócios já carregados na tela (não refaz a
  extração completa). Ver `aplicarFiltroProdutoCockpit`, `js/cockpit.js:146`.

## Limitações conhecidas (não implementado ou implementado com ressalva)

1. **Filtro de produto é uma busca sob demanda, não um filtro de query** —
   por causa do custo de `crm.deal.productrows.get` por negócio (mesma
   limitação já documentada na auditoria original, seção 14). Não há como
   evitar isso sem uma mudança maior (batch de produtos, cache persistente,
   ou um endpoint agregado que o Bitrix não oferece).
2. **Coverage e Proteção de Receita dependem de `CLOSEDATE` preenchido** —
   negócios abertos sem `CLOSEDATE` não entram no "Pipeline Elegível" de
   nenhum mês (nem M, nem M+1/2/3). Isso é intencional (não adivinha data de
   fechamento), mas significa que Pipeline Elegível pode subestimar o
   pipeline real se a higiene de CLOSEDATE estiver ruim — mesmo aviso já
   feito no Forecast semanal sobre negócios "Sem CLOSEDATE".
3. **`ASSIGNED_BY_ID` é o responsável atual, não histórico** — igual ao
   resto do projeto (ver auditoria, seção 15), o filtro de "Vendedor" reflete
   quem é responsável **hoje**, não quem trabalhou o negócio ao longo do
   tempo.
4. **Threshold de Proteção de Receita (2x/3x) é um ponto de partida, não uma
   meta corporativa validada** — precisa de validação com a diretoria antes
   de virar critério oficial de alerta.
5. **Sales Cycle usa `UF_CRM_1770928318695` (data de contrato assinado) como
   preferência sobre `CLOSEDATE`** (via `fecharDataDeal`/`cicloDealDias`,
   igual ao resto do catálogo) — se esse campo customizado não estiver
   preenchido em negócios antigos, o ciclo cai para `CLOSEDATE`; se nenhum
   dos dois estiver preenchido, o negócio não entra na amostra (mostrado no
   contador de amostra, nunca disfarçado).
6. **Não há teste automatizado end-to-end contra um Bitrix real** — como já
   apontado na auditoria (seção 12), o projeto não tem testes automatizados;
   a verificação desta tarefa foi `node --check` em `js/cockpit.js` e revisão
   estática cuidadosa dos IDs/handlers entre HTML e JS (sem webhook real
   disponível neste ambiente para testar contra dados de produção).
7. **Performance**: o Cockpit reusa `baseDealsCatalogo`, que já busca todos
   os campos de todos os negócios do Comercial numa única extração paginada
   — não há cache entre a aba do Cockpit e as abas antigas do catálogo
   (mesma limitação de "sem cache de sessão" já registrada na auditoria,
   seção 14, item P1.5). Cada clique em "↻ Atualizar agora" refaz a busca
   completa.
