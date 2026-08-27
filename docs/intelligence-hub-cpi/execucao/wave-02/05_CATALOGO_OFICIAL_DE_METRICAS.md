# Agente 05 — Catálogo Oficial de Métricas (Wave 2.1)

Esta tarefa revisita `docs/intelligence-hub-cpi/execucao/wave-01-fundacao/05_METRICS_GOVERNANCE_AGENT_CATALOGO_DE_METRICAS.md`
(catálogo preliminar de ~19 famílias de métricas, com fórmula e evidência
arquivo:linha já levantadas naquela wave) e o converte para o formato oficial
`TEMPLATE_KPI.txt`, seguindo o item 2.1.2 do plano do Agente 00
(`00_CHIEF_ORCHESTRATOR_DIAGNOSTICO_E_PLANO.md`). Nenhuma fórmula foi
recalculada ou reinterpretada nesta wave — os campos `Fórmula`, `Numerador`,
`Denominador`, `Filtros`, `Exclusões`, `Fonte` e `Data de referência` abaixo
são a mesma leitura de código da Wave 1, apenas reorganizada no formato do
template. Onde algo é proposta desta wave (Owner interino, decisão de
threshold, mapeamento Vendido/Faturado/Realizado/Recebido), isso está
marcado explicitamente como proposta — nenhuma decisão de negócio foi tomada
por este agente.

## Resumo executivo

- **26 variantes de métrica** foram convertidas ao formato `TEMPLATE_KPI`,
  cobrindo as 19 famílias do catálogo da Wave 1. Onde uma família tem mais de
  uma fórmula coexistindo sob o mesmo nome na UI (Fechado no Mês, Forecast
  Total, Bucket, Coverage, Win Rate, Ticket Médio, Data Quality, Pipeline por
  Estágio), cada variante ganhou seu próprio `METRIC_ID` — é assim que a
  governança torna visível que "Win Rate" não é uma métrica, são três.
- **Nenhuma métrica tem owner formal.** Este documento propõe um **owner
  interino por papel/área** (nunca uma pessoa) para cada família — ver seção
  dedicada. É proposta para ratificação humana, não uma atribuição já
  decidida.
- **4 thresholds estão marcados no próprio código-fonte como "não validados
  com a diretoria"** (localizados por busca direta no código nesta wave, não
  assumidos do catálogo da Wave 1): coverage 2x/3x, aging crítico de
  elegibilidade (45 dias), aging alto de alerta (45 dias, constante separada
  da anterior) e "Pipeline necessário = Meta M+1 ÷ Win Rate". Todos viram
  pendência formal de decisão de negócio nesta wave — nenhum foi ratificado
  nem descartado por este agente.
- **Vendido/Faturado/Realizado/Recebido**: só "Vendido" tem um equivalente
  real e razoavelmente direto no código hoje (negócio ganho no funil
  Comercial). "Faturado", "Realizado" e "Recebido" não têm campo, etapa ou
  integração correspondente em lugar nenhum do projeto — mapear os três
  exigiria decisão de modelagem de negócio antes de qualquer código.
- **Desambiguação de UI (Parte B)**: implementadas 11 mudanças de rótulo
  (texto puro, sem tocar em nenhuma fórmula) nos cards de "Win Rate" e
  "Ticket Médio" do Cockpit, do Catálogo de Relatórios e do relatório visual
  do Forecast — os pontos de maior ambiguidade documentados na Wave 1, onde o
  mesmo nome aparecia sem qualificar a coorte/funil usado. Sintaxe validada
  após cada edição (`node -e "new Function(...)"`, ver seção correspondente).
  Recomendações de maior risco (renomear no e-mail semanal Node, tooltip
  explicativo completo, reconciliar Win Rate do relatório de SDR) ficaram
  como recomendação não implementada, com o motivo.

---

## Catálogo (formato TEMPLATE_KPI)

Convenção de `METRIC_ID`: `<FAMÍLIA>-<variante>`. Campos ausentes no
código/documentação (ex.: `Versão`, `Data de vigência`, `Testes`) estão
marcados como `não existe hoje` — não foram inventados.

### META_MENSAL-01 · Meta Mensal

```
METRIC_ID:        META_MENSAL-01
Nome:              Meta Mensal (New MRR)
Descrição:         Valor de meta comercial pré-preenchido por mês-calendário,
                    editável pelo usuário antes de cada extração.
Objetivo:           Servir de denominador para % da Meta, Gap, Coverage e
                    Pipeline Necessário em todos os relatórios do projeto.
Fórmula:            Tabela fixa mês→valor (METAS_FORECAST_MENSAL_PADRAO),
                    sem ano associado — reaplica os mesmos 12 valores todo ano.
Numerador:          — (constante, não é uma razão)
Denominador:        — 
Filtros:            Mês da data de referência do relatório.
Exclusões:          Nenhuma.
Granularidade:      Por mês-calendário (1 valor/mês, sem distinção de ano).
Dimensões:          Nenhuma (não segmenta por vendedor/produto/origem).
Data de referência: Mês da extração/relatório.
Fonte:              Constante hardcoded — `js/config.js:335-341`
                    (`metaMensalPadrao`), réplica manual em
                    `scripts/forecast-semanal.mjs:91-94,165-168`. Não vem do
                    Bitrix; é só o valor pré-preenchido de um campo editável.
Owner:              PROPOSTO — Comercial/Forecast (ver seção de owners).
Versão:             não existe hoje (sem versionamento de metas).
Freshness:          Estático até edição manual do código-fonte.
Regras de nulo:     Mês fora da tabela retorna R$ 0,00 silenciosamente
                    (achado do Agente 03/00, já registrado como risco).
Regras de duplicidade: N/A.
Testes:             não existe hoje.
Dashboards:         Cockpit (Resultado do Mês, Proteção de Receita M..M+3,
                    Geração de Pipeline), Forecast Semanal, Catálogo
                    (Pipeline & Coverage).
Riscos:             (1) Duplicação manual entre `js/config.js` e
                    `scripts/forecast-semanal.mjs` sem teste de divergência.
                    (2) Sem "ano de vigência" — mesma tabela reaplicada todo
                    ano. (3) `0` silencioso para meses fora da tabela.
```

### FECHADO_MES-01a · Fechado no Mês (Cockpit / Resultado do Mês)

```
METRIC_ID:        FECHADO_MES-01a
Nome:              Fechado no Mês — Cockpit (Resultado do Mês)
Descrição:         Receita fechada no mês-calendário atual, base Financeiro.
Objetivo:           Medir receita já realizada (contrato assinado) no mês
                    corrente para acompanhamento executivo.
Fórmula:            Soma de _VALOR dos negócios do funil Financeiro cuja
                    etapa é "Contrato Assinado", com data de referência
                    (MOVED_TIME, fallback DATE_CREATE) no mês-calendário atual.
Numerador:          Σ _VALOR (negócios "Contrato Assinado" no mês)
Denominador:        — (valor absoluto)
Filtros:            Funil Financeiro; etapa "Contrato Assinado"
                    (cockpitEhFechadoFinanceiro); MOVED_TIME/DATE_CREATE no
                    mês-calendário atual.
Exclusões:          Nenhuma exclusão adicional além do filtro de etapa/mês.
Granularidade:      Agregado mensal; drill-down por negócio; filtrável por
                    vendedor/origem.
Dimensões:          Vendedor, origem (via filtro do Cockpit).
Data de referência: MOVED_TIME, fallback DATE_CREATE.
Fonte:              `crm.deal.list` funil Financeiro —
                    `js/cockpit.js:485-498` (cockpitCalcular, bloco A),
                    busca dedicada em `cockpitBuscarDealsFinanceiro`.
Owner:              PROPOSTO — Comercial/Forecast.
Versão:             não existe hoje.
Freshness:          Recalculado a cada clique em "Atualizar agora" (sem
                    cache entre sessões).
Regras de nulo:     Negócio sem MOVED_TIME cai no fallback DATE_CREATE.
Regras de duplicidade: Deduplicação por ID na paginação (mitigação já
                    existente, `js/bitrix-api.js:386-401`).
Testes:             não existe hoje.
Dashboards:         Cockpit — card "Fechado no mês".
Riscos:             É a base "correta"/mais recente (adotada por convergência
                    com a Central de Inteligência Comercial, ver
                    COCKPIT_COMERCIAL.md) — mas 3 outras variantes deste
                    mesmo conceito continuam em produção (ver 01b/01c/01d),
                    algumas já corrigidas nesta sessão (ver
                    WAVE_01_CORRECOES_PRODUCAO.md item 2), outras não.
```

### FECHADO_MES-01b · Fechado no Mês — Forecast Semanal, relatório visual ("Entregue")

```
METRIC_ID:        FECHADO_MES-01b
Nome:              Entregue — Forecast Semanal (relatório visual)
Descrição:         Mesma fórmula em espírito de FECHADO_MES-01a, mas com
                    janela de período do relatório (não sempre o mês-
                    calendário atual).
Fórmula:            r.resumo.FECHADOS_VALOR — funil Financeiro, "Contrato
                    assinado", DATA_MOVIMENTO (=MOVED_TIME, fallback
                    DATE_CREATE) dentro do período do relatório.
Numerador:          Σ VALOR (negócios "Contrato assinado" no período)
Denominador:        —
Filtros:            Funil Financeiro; ehFechado(); período do Forecast
                    Mensal (não necessariamente mês-calendário atual).
Exclusões:          Nenhuma além do filtro de etapa/período.
Granularidade:      Agregado por período do relatório.
Dimensões:          Nenhuma segmentação adicional neste card.
Data de referência: MOVED_TIME, fallback DATE_CREATE.
Fonte:              `js/forecast.js:128-223` (construirDadosModeloForecast),
                    `js/forecast.js:274-287,300-301`.
Owner:              PROPOSTO — Comercial/Forecast.
Versão/Freshness/Testes: não existe hoje.
Regras de nulo:     Idem 01a.
Dashboards:         Forecast Semanal — relatório visual, card "Entregue".
Riscos:             Após WAVE_01_CORRECOES_PRODUCAO.md item 2, o card de KPI
                    em texto do Forecast Semanal (01c) passou a usar esta
                    mesma base como fonte primária (com fallback) — reduz,
                    mas não elimina, a divergência com 01d (script Node).
```

### FECHADO_MES-01c · Fechado no Mês — Forecast Semanal, card de KPI em texto

```
METRIC_ID:        FECHADO_MES-01c
Nome:              Fechado no mês — card de KPI (Forecast Semanal)
Descrição:         Card de texto do Forecast Semanal. Após a correção desta
                    sessão, usa como fonte primária a mesma base de
                    FECHADO_MES-01b (FECHADOS_VALOR/Financeiro), com fallback
                    para a fórmula antiga (funil Comercial/CLOSEDATE) apenas
                    se `modelo_visual` não estiver disponível.
Fórmula (pré-correção, histórica): soma de OPPORTUNITY dos negócios do funil
                    Comercial com STAGE_SEMANTIC_ID==="success" e CLOSEDATE
                    no mês-calendário atual.
Fórmula (atual, pós-correção desta sessão): FECHADOS_VALOR (= FECHADO_MES-01b)
                    como fonte primária; fallback para a fórmula antiga só
                    se o modelo visual não carregar.
Fonte:              `js/forecast.js:575-591,624,635,676`
                    (resultadoForecastSemanal.resumo.FECHADO_MES).
Owner:              PROPOSTO — Comercial/Forecast.
Versão/Freshness/Testes: não existe hoje.
Dashboards:         Forecast Semanal — card de KPI em texto.
Riscos:             Corrigido nesta sessão (ver
                    WAVE_01_CORRECOES_PRODUCAO.md item 2) — deixa de divergir
                    de 01b no caso comum. Continua divergindo de 01d
                    (script Node, não corrigido).
```

### FECHADO_MES-01d · Fechado no Mês — script Node do e-mail semanal

```
METRIC_ID:        FECHADO_MES-01d
Nome:              fechadoMes — e-mail semanal automático (GitHub Actions)
Descrição:         Reimplementação inline, em Node, da fórmula "antiga"
                    (funil Comercial + CLOSEDATE) — NÃO recebeu a correção
                    Financeiro/MOVED_TIME aplicada ao navegador.
Fórmula:            Funil Comercial (CATEGORY_ID="0", hardcoded), 
                    STAGE_SEMANTIC_ID==="success", CLOSEDATE no mês.
Numerador:          Σ OPPORTUNITY (negócios ganhos, funil Comercial, no mês)
Denominador:        —
Filtros:            CATEGORY_ID="0" hardcoded (só Comercial); STAGE_SEMANTIC_ID
                    via reimplementação inline própria de `semanticaDeal`,
                    SEM o fallback `metaStage?.semantics` que a função
                    canônica de `js/jornada.js` possui.
Exclusões:          Nenhuma.
Granularidade:      Agregado mensal.
Dimensões:          Nenhuma.
Data de referência: CLOSEDATE.
Fonte:              `scripts/forecast-semanal.mjs:271,289-292`.
Owner:              PROPOSTO — Comercial/Forecast (execução automatizada,
                    sem supervisão humana direta a cada disparo).
Versão/Freshness:   Semanal, disparado por GitHub Actions (sexta-feira),
                    envia e-mail para `comercial@atlasgr.com.br` e outros
                    destinatários, sem revisão humana antes do envio.
Testes:             não existe hoje.
Dashboards:         E-mail semanal de forecast.
Riscos:             ALTO — ainda não corrigido (ver
                    WAVE_01_CORRECOES_PRODUCAO.md item 2, "não foi
                    corrigido nesta sessão"). É a variante que efetivamente
                    chega à diretoria por e-mail toda semana, divergente das
                    variantes 01a/01b/01c mostradas no navegador. Trazer para
                    paridade exigiria buscar metadados de estágio por
                    categoria dentro do script Node — mudança que toca uma
                    chamada adicional à API do Bitrix em job agendado sem
                    supervisão, não testável nesta sessão sem webhook real.
```

### FORECAST_TOTAL-01a · Forecast Total — Cockpit

```
METRIC_ID:        FORECAST_TOTAL-01a
Nome:              Forecast Total do Mês — Cockpit
Descrição:         Projeção de fechamento do mês combinando fechado + tiers
                    de pipeline aberto, com Commit/Best Case em valor cheio.
Fórmula:            ForecastTotal = FechadoMes(FECHADO_MES-01a) +
                    Commit(bruto) + BestCase(bruto) + Pipeline(ponderado).
                    Upside (prob<10%) fica de fora do total.
Numerador/Denominador: N/A (soma de componentes, não uma razão).
Filtros:            Negócios abertos (_SEMANTICA==="process"), excluindo
                    estágios Piloto, CLOSEDATE no mês atual.
Exclusões:          Upside (prob<10%) não entra no total; estágios Piloto.
Granularidade:      Agregado mensal.
Dimensões:          Vendedor/origem via filtro.
Data de referência: CLOSEDATE (para classificar no mês) + probabilidade via
                    PROBABILITY do Bitrix ou PROB_FALLBACK-01.
Fonte:              `js/cockpit.js:500-527` (cockpitCalcular, bloco B),
                    thresholds próprios `cockpitClassificarBucketForecast`
                    (70%/40%/10%, ver BUCKET_FORECAST-01b).
Owner:              PROPOSTO — Comercial/Forecast.
Versão:             Documentado como "convergência com a Central de
                    Inteligência Comercial" — divergência 1 de
                    `COCKPIT_COMERCIAL.md`. Sem versionamento formal além
                    disso.
Testes:             não existe hoje.
Dashboards:         Cockpit — cards de Forecast.
Riscos:             Coexiste com FORECAST_TOTAL-01b, metodologia de
                    ponderação diferente — mesmo negócio pode ter Forecast
                    Total diferente dependendo da tela.
```

### FORECAST_TOTAL-01b · Forecast Total — Forecast Semanal / Forecast Mensal do Catálogo

```
METRIC_ID:        FORECAST_TOTAL-01b
Nome:              Forecast Total — Forecast Semanal / Catálogo
Descrição:         Todo o pipeline aberto do período entra ponderado por
                    probabilidade — sem separar tiers em valor cheio.
Fórmula:            ForecastTotal = Fechado + Σ(valor × probabilidade/100)
                    para todos os negócios abertos do período.
Fonte:              `js/forecast.js:538,591`;
                    `js/catalogo-relatorios.js:144-159`. Bucket via
                    BUCKET_FORECAST-01a (80%/50%, sem "Upside"), usado só
                    para exibição, não para decidir ponderação.
Owner:              PROPOSTO — Comercial/Forecast.
Versão:             Descrito no comentário do Cockpit
                    (`js/cockpit.js:512-516`) como "cálculo antigo", mantido
                    deliberadamente em produção nestes dois relatórios para
                    não alterar comportamento fora do escopo daquela tarefa
                    (ver `COCKPIT_COMERCIAL.md`, "Divergência 1").
Testes:             não existe hoje.
Dashboards:         Forecast Semanal, Forecast Mensal do Catálogo.
Riscos:             O próprio Cockpit documenta que esta fórmula "subestimava
                    sistematicamente o forecast em negócios de alta
                    probabilidade" — decisão consciente de não migrar,
                    registrada, mas não comunicada ao usuário final fora do
                    código-fonte.
```

### BUCKET_FORECAST-01a · Classificação de Bucket — compartilhada (jornada.js)

```
METRIC_ID:        BUCKET_FORECAST-01a
Nome:              classificarBucketForecast (Forecast Semanal / Catálogo)
Fórmula:            prob≥80 → Commit; prob≥50 → Best Case; resto → Pipeline.
                    Sem tier "Upside".
Fonte:              `js/jornada.js:478-484`. Fonte de verdade do Forecast
                    Semanal e do "Forecast Mensal" do Catálogo.
Owner:              PROPOSTO — Comercial/Forecast.
Testes/Versão:      não existe hoje.
Riscos:             Thresholds sem comentário explícito de "não validado",
                    mas coexistem com BUCKET_FORECAST-01b (thresholds
                    diferentes) sob o mesmo conceito — mesmo negócio pode
                    ter bucket diferente conforme a tela (ex.: prob=60% é
                    "Best Case" aqui e "Commit" no Cockpit).
```

### BUCKET_FORECAST-01b · Classificação de Bucket — Cockpit

```
METRIC_ID:        BUCKET_FORECAST-01b
Nome:              cockpitClassificarBucketForecast (Cockpit)
Fórmula:            prob≥70 → Commit; prob≥40 → Best Case; prob≥10 →
                    Pipeline; resto → Upside.
Fonte:              `js/cockpit.js` (cockpitClassificarBucketForecast) —
                    isolada da função compartilhada de `js/jornada.js` por
                    decisão deliberada de convergência com a Central de
                    Inteligência Comercial (`COCKPIT_COMERCIAL.md`,
                    Divergência 1).
Owner:              PROPOSTO — Comercial/Forecast.
Riscos:             Ver BUCKET_FORECAST-01a — mesma consequência prática.
```

### PROB_FALLBACK-01 · Probabilidade de Fechamento (fallback)

```
METRIC_ID:        PROB_FALLBACK-01
Nome:              probabilidadeFallbackForecast
Descrição:         Probabilidade heurística usada quando PROBABILITY do
                    Bitrix está vazio ou fora de 1-100.
Fórmula:            success→100; failure→0; texto do estágio contém
                    "assinatura/contrato assinado/piloto/termo aceito"→80;
                    "proposta/negociação"→60; "call/visita/reunião/
                    diagnóstico"→40; "nova oportunidade/novo/entrada"→20;
                    senão→30.
Fonte:              `js/jornada.js:467-476` (fonte de verdade, conforme
                    comentário `js/jornada.js:465-466`), réplica manual em
                    `scripts/forecast-semanal.mjs:75-84`.
Owner:              PROPOSTO — Comercial/Forecast.
Testes/Versão:      não existe hoje.
Riscos:             2 cópias manuais da mesma regra em arquivos que não
                    compartilham módulo — risco de manutenção alto, já
                    sinalizado em comentário no próprio código.
```

### PIPELINE_TOTAL-01 · Pipeline Total (bloco C do Cockpit)

```
METRIC_ID:        PIPELINE_TOTAL-01
Fórmula:            Σ _VALOR de todos os negócios abertos do Comercial
                    (_SEMANTICA==="process"), incluindo estágios "Piloto".
Fonte:              `js/cockpit.js:558-559`. Base `baseDealsCatalogo`
                    (CATEGORY_ID=0).
Granularidade:      Agregado, filtrável por vendedor/origem/produto.
Owner:              PROPOSTO — Comercial/Forecast.
Riscos:             Único indicador do Cockpit que deliberadamente não
                    filtra Piloto nem aging — decisão documentada
                    (`COCKPIT_COMERCIAL.md`, bloco 3), não um bug.
```

### PIPELINE_ELEGIVEL-01 · Pipeline Elegível (bloco C do Cockpit)

```
METRIC_ID:        PIPELINE_ELEGIVEL-01
Descrição:         Pipeline aberto que passa em 5 critérios de elegibilidade
                    (convergido com fonte externa citada no código).
Fórmula:            Aberto + não-Piloto + _VALOR>0 + CLOSEDATE preenchida +
                    ASSIGNED_BY_ID válido + aging na etapa ≤45 dias — mais
                    CLOSEDATE dentro do período filtrado.
Exclusões:          Não implementa um 6º critério da fonte externa citada
                    ("próxima ação preenchida") — campo não extraído pelo
                    projeto. Torna este cálculo mais permissivo que a
                    referência (limitação documentada,
                    `js/cockpit.js:407-423`).
Fonte:              `js/cockpit.js:438-449` (cockpitVerificarElegibilidade).
Owner:              PROPOSTO — Comercial/Forecast.
Riscos:             **Threshold de aging 45 dias (COCKPIT_AGING_CRITICO_
                    ELEGIBILIDADE_DIAS, `js/cockpit.js:433`) é PENDÊNCIA DE
                    DECISÃO — ver seção de thresholds.** Exclusivo do
                    Cockpit; não existe em nenhum outro relatório.
```

### PIPELINE_CRIADO-01 · Pipeline Criado no Período

```
METRIC_ID:        PIPELINE_CRIADO-01
Fórmula:            Σ _VALOR dos negócios cujo DATE_CREATE cai no período
                    filtrado.
Fonte:              `js/cockpit.js:589-590` (bloco C) e `js/cockpit.js:726-727`
                    (bloco Geração de Pipeline, mesma fórmula reaproveitada).
Owner:              PROPOSTO — Comercial/Forecast.
```

### COVERAGE-01a · Coverage Atual (Cockpit)

```
METRIC_ID:        COVERAGE-01a
Fórmula:            Pipeline Elegível ÷ Gap da Meta (não ÷ meta cheia).
                    "meta batida" se gap=0; "não disponível" se meta ausente.
Fonte:              `js/cockpit.js:578-583`.
Owner:              PROPOSTO — Comercial/Forecast.
Riscos:             **Threshold de status (crítico <2x, atenção 2x-3x,
                    saudável ≥3x) é PENDÊNCIA DE DECISÃO — ver seção de
                    thresholds.**
```

### COVERAGE-01b · Coverage Recomendado (Cockpit)

```
METRIC_ID:        COVERAGE-01b
Fórmula:            1 ÷ (Win Rate do bloco Eficiência / 100) —
                    cockpitCoverageRecomendado, `js/cockpit.js:456-459`.
                    Depende de WIN_RATE-01a especificamente.
Fonte:              `js/cockpit.js:456-459`.
Owner:              PROPOSTO — Comercial/Forecast.
Riscos:             Derivado de dado real (não um threshold fixo) — exibido
                    ao lado de COVERAGE-01a como referência, sem substituí-lo.
```

### COVERAGE-01c · Coverage 90d (Catálogo — Pipeline & Coverage)

```
METRIC_ID:        COVERAGE-01c
Fórmula:            (pipeline com CLOSEDATE em até 90 dias) ÷ meta informada
                    (meta cheia, sem conceito de "Pipeline Elegível" nem "gap").
Fonte:              `js/catalogo-relatorios.js:175-187`.
Owner:              PROPOSTO — Comercial/Forecast.
Riscos:             Nome "Coverage" idêntico a COVERAGE-01a/01b, fórmula e
                    denominador diferentes — mesma classe de risco de
                    confiança que Win Rate/Ticket Médio.
```

### PROTECAO_RECEITA-01 · Proteção de Receita M/M+1/M+2/M+3

```
METRIC_ID:        PROTECAO_RECEITA-01
Fórmula:            Para cada um dos 4 meses: Pipeline = Σ _VALOR de
                    negócios abertos, não-Piloto, CLOSEDATE naquele mês
                    (recorte histórico simplificado, NÃO reaplica os 5
                    critérios completos de PIPELINE_ELEGIVEL-01 — decisão
                    deliberada documentada). Coverage = Pipeline ÷ Meta
                    (meta cheia).
Fonte:              `js/cockpit.js:597-617`.
Owner:              PROPOSTO — Comercial/Forecast.
Riscos:             **Threshold de status (2x/3x, mesma constante de
                    COVERAGE-01a) é PENDÊNCIA DE DECISÃO.**
```

### PIPELINE_ESTAGIO-01a · Pipeline por Estágio (base sem filtro)

```
METRIC_ID:        PIPELINE_ESTAGIO-01a
Fórmula:            Todo pipeline aberto agrupado por _ESTAGIO, com aging
                    médio (MOVED_TIME até data de referência) — sem filtro
                    de janela.
Fonte:              `js/cockpit.js:619-644` (c.estagios).
Owner:              PROPOSTO — Comercial/Forecast.
Riscos:             Alimenta o alerta de aging alto — filtrar aqui esconderia
                    os piores casos (decisão deliberada, documentada).
```

### PIPELINE_ESTAGIO-01b · Pipeline por Estágio (cards visíveis, ≤60 dias)

```
METRIC_ID:        PIPELINE_ESTAGIO-01b
Fórmula:            Só negócios parados na etapa atual há ≤60 dias, sem
                    estágios Piloto — mesmo recorte do Forecast (dentroJanela60d).
Fonte:              `js/cockpit.js:653-661` (c.estagiosForecast).
Owner:              PROPOSTO — Comercial/Forecast.
```

### AGING-01 · Aging (dias parado na etapa atual)

```
METRIC_ID:        AGING-01
Fórmula:            hoje − MOVED_TIME, em dias (cockpitAgingAtualDias).
                    Reaproveitada em `aging_sla` (SLA editável, padrão 30d)
                    e `implantacao_posvenda` (30d fixo).
Fonte:              `js/cockpit.js:429-433`;
                    `js/catalogo-relatorios.js:199-206,311-319`.
Regras de nulo:     Negócio sem MOVED_TIME fica "não disponível" (nunca
                    estimado).
Owner:              PROPOSTO — Comercial/Forecast (com sobreposição de
                    Qualidade de Dados no sentido de completude de
                    MOVED_TIME).
Riscos:             **3 thresholds diferentes para "quanto tempo parado é
                    demais" — dois deles (45d Cockpit) marcados no código
                    como PENDÊNCIA DE DECISÃO (ver seção dedicada); o
                    terceiro (aging_sla, 30d) é editável pelo usuário, não
                    marcado como pendente de diretoria; implantacao_posvenda
                    usa 30d fixo, sem marcação de validação.**
```

### WIN_RATE-01a · Win Rate — coorte por fechamento (Cockpit / Catálogo)

```
METRIC_ID:        WIN_RATE-01a
Nome:              Win Rate (coorte por fechamento)
Fórmula:            Ganhos / (Ganhos + Perdidos) × 100, sobre negócios cuja
                    _FECHAMENTO (UF_CRM_1770928318695, fallback CLOSEDATE)
                    cai no período filtrado.
Fonte:              `js/cockpit.js:542-547` (bloco Eficiência da Máquina);
                    `js/catalogo-relatorios.js:213,224`
                    (performance_vendedores, ganhos_perdas_ciclo).
Owner:              PROPOSTO — Comercial/Forecast.
Riscos:             Alimenta COVERAGE-01b e GERACAO_PIPELINE-01 (Pipeline
                    Necessário) — qualquer decisão sobre esta fórmula
                    propaga para essas duas métricas derivadas.
```

### WIN_RATE-01b · Win Rate — coorte por criação (Catálogo, conversão comercial)

```
METRIC_ID:        WIN_RATE-01b
Nome:              Win Rate (coorte por criação)
Fórmula:            won / (won+lost), sobre negócios cujo DATE_CREATE cai no
                    período — inclui só os que já fecharam, independente de
                    quando fecharam.
Fonte:              `js/catalogo-relatorios.js:189-194` (conversao_comercial).
Owner:              PROPOSTO — Comercial/Forecast.
Riscos:             Mede pergunta diferente de WIN_RATE-01a ("taxa de
                    conversão do que entrou" vs. "eficiência do que fechou
                    agora") — nenhuma das duas está errada, mas comparar os
                    dois números do mesmo período sem qualificar a coorte
                    leva a conclusão equivocada.
```

### WIN_RATE-01c · Win Rate — SDR (oportunidades originadas de Lead)

```
METRIC_ID:        WIN_RATE-01c
Nome:              Win rate das oportunidades criadas (SDR)
Fórmula:            ganhos / oportunidadesPeriodo, coorte = negócios
                    originados de Lead cujo Lead teve atividade no período E
                    cujo DATE_CREATE (do negócio) cai no período.
                    STAGE_SEMANTIC_ID lido direto do negócio, sem o fallback
                    metaStage?.semantics.
Fonte:              `js/sdr.js:281-289,328` (WIN_RATE_OPORTUNIDADES).
Owner:              PROPOSTO — SDR.
Riscos:             Já tem rótulo relativamente qualificado na UI ("Win rate
                    das oportunidades criadas") — menor ambiguidade que
                    01a/01b, não alterado nesta wave.
```

### TICKET_MEDIO-01a · Ticket Médio — Cockpit (mês, Financeiro)

```
METRIC_ID:        TICKET_MEDIO-01a
Fórmula:            Fechado do mês (FECHADO_MES-01a) ÷ quantidade de ganhos
                    financeiros do mês (denominador exclui negócios com
                    _VALOR ausente/zero desde a correção desta sessão, ver
                    WAVE_01_CORRECOES_PRODUCAO.md item 5).
Fonte:              `js/cockpit.js:496` + `cockpitContarComValor()`.
Owner:              PROPOSTO — Comercial/Forecast.
```

### TICKET_MEDIO-01b · Ticket Médio — Cockpit (vendido, Comercial)

```
METRIC_ID:        TICKET_MEDIO-01b
Fórmula:            Receita ganha no período (coorte por _FECHAMENTO, funil
                    Comercial) ÷ quantidade de ganhos.
Fonte:              `js/cockpit.js:549`.
Owner:              PROPOSTO — Comercial/Forecast.
Riscos:             Base diferente de TICKET_MEDIO-01a (Comercial vs.
                    Financeiro) apesar de aparecerem na mesma tela do
                    Cockpit — motivo da desambiguação de rótulo feita nesta
                    tarefa (ver Parte B).
```

### TICKET_MEDIO-01c · Ticket Médio — Cockpit (pipeline aberto)

```
METRIC_ID:        TICKET_MEDIO-01c
Fórmula:            Pipeline Total (PIPELINE_TOTAL-01) ÷ quantidade de
                    negócios abertos.
Fonte:              `js/cockpit.js:591`.
Owner:              PROPOSTO — Comercial/Forecast.
Riscos:             Mede tamanho médio de negócio em aberto, não de venda
                    concluída — conceito distinto das outras 5 variantes.
```

### TICKET_MEDIO-01d · Ticket Médio — Catálogo (performance_vendedores / clientes_receita)

```
METRIC_ID:        TICKET_MEDIO-01d
Fórmula:            Receita ganha (coorte por _FECHAMENTO) ÷ ganhos —
                    mesma base de TICKET_MEDIO-01b, segmentada por vendedor
                    (performance_vendedores) ou por cliente (clientes_receita).
Fonte:              `js/catalogo-relatorios.js:213` (performance_vendedores,
                    coluna "Ticket"); `js/catalogo-relatorios.js:253`
                    (clientes_receita, confirmado nesta wave por leitura de
                    código — coorte por _FECHAMENTO).
Owner:              PROPOSTO — Comercial/Forecast.
```

### TICKET_MEDIO-01e · Ticket Médio — Catálogo (conversão comercial, coorte por criação)

```
METRIC_ID:        TICKET_MEDIO-01e
Fórmula:            Receita ganha (coorte por DATE_CREATE, igual a
                    WIN_RATE-01b) ÷ ganhos dessa coorte.
Fonte:              `js/catalogo-relatorios.js:194` (conversao_comercial).
Owner:              PROPOSTO — Comercial/Forecast.
```

### TICKET_MEDIO-01f · Ticket Médio — Forecast visual (fechados, Financeiro)

```
METRIC_ID:        TICKET_MEDIO-01f
Fórmula:            Σ VALOR dos "fechados" (Financeiro, "Contrato assinado",
                    coorte por MOVED_TIME) ÷ quantidade — mesma base que
                    TICKET_MEDIO-01a.
Fonte:              `js/forecast.js:216` (TICKET_MEDIO_FECHADOS).
Owner:              PROPOSTO — Comercial/Forecast.
Riscos:             6 variantes de "Ticket Médio" no total (01a-01f), quatro
                    bases de cálculo distintas (Financeiro/mês, Comercial/
                    vendido, pipeline aberto, coorte por criação) sob nomes
                    parecidos — motivo central da desambiguação de rótulo
                    feita nesta tarefa (Parte B).
```

### SALES_CYCLE-01 · Ciclo de Venda (média e mediana)

```
METRIC_ID:        SALES_CYCLE-01
Fórmula:            cicloDealDias(d) = fecharDataDeal(d) − DATE_CREATE(d),
                    em dias. fecharDataDeal prioriza UF_CRM_1770928318695
                    ("Data do contrato assinado", campo oficial) sobre
                    CLOSEDATE. Média/mediana só sobre ganhos com as duas
                    datas preenchidas (amostra sempre exibida).
Fonte:              `js/jornada.js:573,575-577` (fecharDataDeal,
                    cicloDealDias); `js/cockpit.js:550-552` (agregação).
Owner:              PROPOSTO — Comercial/Forecast.
Riscos:             "Data de fechamento" já significa 3 campos Bitrix
                    diferentes no projeto conforme a métrica:
                    UF_CRM_1770928318695/CLOSEDATE aqui e em WIN_RATE-01a;
                    MOVED_TIME em FECHADO_MES-01a/01b; CLOSEDATE isolado em
                    FECHADO_MES-01c/01d. Risco documentado em
                    `COCKPIT_COMERCIAL.md` limitação 5.
```

### GERACAO_PIPELINE-01 · Pipeline Necessário, Gap de Geração, Creation Coverage, Pace

```
METRIC_ID:        GERACAO_PIPELINE-01
Fórmula:            Pipeline Necessário = Meta M+1 ÷ (Win Rate [WIN_RATE-01a]
                    / 100). Gap de Geração = max(0, necessário − criado).
                    Creation Coverage = criado ÷ necessário. Pace compara
                    dias úteis decorridos no mês contra o total, projetando
                    quanto já deveria ter sido criado.
Fonte:              `js/cockpit.js:715-737` (cockpitCalcularGeracaoPipeline).
Owner:              PROPOSTO — Comercial/Forecast.
Riscos:             **"Pipeline necessário = Meta ÷ Win Rate" é PENDÊNCIA DE
                    DECISÃO — o próprio código chama isso de "hipótese
                    matemática documentada, não uma regra validada com a
                    diretoria" (ver seção dedicada).** Exclusivo do Cockpit.
```

### DATA_QUALITY-01a · Data Quality Score — Cockpit

```
METRIC_ID:        DATA_QUALITY-01a
Fórmula:            Completude (%) de 5 campos (OPPORTUNITY>0,
                    ASSIGNED_BY_ID, STAGE_ID, CLOSEDATE, SOURCE_ID) sobre
                    negócios abertos do filtro atual. Score = média simples
                    das 5%. "Motivo de perda" sempre 0%, não entra na média
                    (campo não existe no Bitrix configurado).
Fonte:              `js/cockpit.js:813-845` (cockpitCalcularQualidadeDados).
Owner:              PROPOSTO — Qualidade de Dados.
Riscos:             Explicitamente documentado para NUNCA ser confundido com
                    "Forecast Confidence" (`js/cockpit.js:801-804`). Não
                    reconciliável com DATA_QUALITY-01b (ver abaixo).
```

### DATA_QUALITY-01b · Qualidade do CRM — Catálogo

```
METRIC_ID:        DATA_QUALITY-01b
Fórmula:            Completude (%) de 9 checks cobrindo Negócios (vínculo
                    cliente, SOURCE_ID, ASSIGNED_BY_ID, OPPORTUNITY>0,
                    CLOSEDATE só para abertos) e Leads (SOURCE_ID,
                    ASSIGNED_BY_ID, nome/empresa, telefone-ou-email). Base =
                    todos os negócios (não só abertos) + todos os Leads. Não
                    agrega em score único — mostra completude por regra.
Fonte:              `js/catalogo-relatorios.js:329-346` (qualidade_crm).
Owner:              PROPOSTO — Qualidade de Dados.
Riscos:             Campos, população-base e forma de agregação diferentes
                    de DATA_QUALITY-01a — não há como comparar um "Data
                    Quality Score" do Cockpit com o resultado deste
                    relatório do mesmo período. Recomendação: reconciliar ou
                    documentar formalmente como propósitos diferentes
                    (executivo vs. auditoria operacional) — não implementado
                    nesta wave (mudança de fórmula, fora de escopo).
```

### SDR_METRICS-01 · Métricas de SDR (funil de qualificação)

```
METRIC_ID:        SDR_METRICS-01
Descrição:         Família de taxas de conversão do funil de qualificação
                    (LEADS_TRABALHADOS, REUNIOES/LIGACOES/TAREFAS/EMAILS/
                    WHATSAPP, TAXA_LEAD_REUNIAO, TAXA_LEAD_OPORTUNIDADE,
                    TAXA_REUNIAO_OPORTUNIDADE, TAXA_LEAD_GANHO).
Fonte:              `js/sdr.js:268-335` (resumoAtividadesPeriodoSDR).
Owner:              PROPOSTO — SDR.
Riscos:             O Cockpit deliberadamente NÃO recalcula estas métricas
                    (evita N+1) — boa prática de não-duplicação preservada;
                    resumo do Cockpit mostra "não disponível" para Leads
                    trabalhados/Reuniões, documentado explicitamente na UI.
```

### CLIENTE_IDENTITY-01 · Identidade do Cliente (infraestrutura de dado, não KPI)

```
METRIC_ID:        CLIENTE_IDENTITY-01
Descrição:         Chave de identidade heurística usada para agrupar
                    negócios/receita por cliente — não é um KPI executivo
                    (sem meta, sem card no Cockpit), mas sustenta qualquer
                    métrica de concentração de receita/Top 10/Customer 360.
Fórmula:            Prioridade COMPANY_ID (confiança ALTA) > CONTACT_ID
                    (ALTA) > LEAD_ID (MÉDIA) > nome normalizado (MÉDIA) >
                    DEAL_ID isolado (BAIXA). Nunca funde registros
                    automaticamente.
Fonte:              `js/jornada.js:864-901` (versão mais completa) —
                    reimplementada de forma DIVERGENTE em
                    `js/catalogo-relatorios.js:250` (só COMPANY_ID > nome
                    normalizado, sem CONTACT_ID/LEAD_ID) e `js/sdr.js:285`
                    (COMPANY_ID > CONTACT_ID > LEAD_ID > DEAL_ID, sem nome
                    normalizado) — achado do Agente 04, confirmado pela
                    síntese do Agente 00.
Owner:              PROPOSTO — Qualidade de Dados.
Riscos:             A variante mais fraca (clientes_receita) alimenta o KPI
                    de concentração de receita/Top 10 — risco de subestimar
                    concentração quando duas grafias do mesmo cliente não
                    compartilham COMPANY_ID. Fora do escopo desta tarefa
                    corrigir (é mandato do Agente 04/Entity Resolution).
```

---

## Owners interinos propostos por família

**Isto é proposta para ratificação humana — nenhum owner foi atribuído
oficialmente por este agente.** Nenhuma métrica do projeto tem owner formal
hoje (nem no código, nem em `COCKPIT_COMERCIAL.md`, nem em nenhum outro
documento) — o único conceito de "responsável" existente é `ASSIGNED_BY_ID`
(vendedor dono do negócio no Bitrix), que é dado de negócio, não owner de
definição de métrica.

| Papel/Área (owner interino proposto) | Métricas cobertas |
|---|---|
| **Comercial/Forecast** | META_MENSAL, FECHADO_MES (todas as variantes), FORECAST_TOTAL, BUCKET_FORECAST, PROB_FALLBACK, PIPELINE_TOTAL, PIPELINE_ELEGIVEL, PIPELINE_CRIADO, COVERAGE (todas), PROTECAO_RECEITA, PIPELINE_ESTAGIO, AGING (compartilhado com Qualidade de Dados), WIN_RATE-01a/01b, TICKET_MEDIO-01a a 01f, SALES_CYCLE, GERACAO_PIPELINE |
| **SDR** | SDR_METRICS-01, WIN_RATE-01c |
| **Qualidade de Dados** | DATA_QUALITY-01a, DATA_QUALITY-01b, CLIENTE_IDENTITY-01, AGING (compartilhado com Comercial/Forecast) |

Critério usado: papel/área que já opera o relatório/tela onde a métrica
aparece hoje, não uma pessoa nomeada — o programa CPI (`01_GOVERNANCA_
METRICAS.txt`) exige owner por KPI; como não existe estrutura de owners
formal no projeto ainda, este é o menor compromisso possível para destravar
o campo `Owner:` do template sem inventar um responsável individual.
Ratificação (ou substituição por nomes reais) é decisão da diretoria/gestão
comercial, não deste agente.

---

## Thresholds pendentes de validação com a diretoria

Localizados por busca direta no código-fonte nesta wave (não copiados do
catálogo da Wave 1 sem conferência — a busca confirmou que são exatamente
estes 4, nem mais nem menos, os que o próprio código rotula explicitamente
como não ratificados):

| # | Threshold | Valor atual | Evidência (comentário no próprio código) |
|---|---|---|---|
| 1 | Coverage de Proteção de Receita/Alertas | `<2x` crítico, `2x–3x` atenção, `≥3x` saudável | `js/cockpit.js:868-870` — "critério inicial e configurável (não é regra fixa acordada com a diretoria)"; reafirmado em `COCKPIT_COMERCIAL.md`, limitação 4 |
| 2 | Aging crítico de elegibilidade de pipeline | 45 dias (`COCKPIT_AGING_CRITICO_ELEGIBILIDADE_DIAS`) | `js/cockpit.js:433`; comentário `js/cockpit.js:430-432` cita que é "o mesmo threshold... usado pela Central", mas o valor em si não tem ratificação própria da diretoria da AtlasGR |
| 3 | Aging alto — Alertas Gerenciais | 45 dias (`ALERTA_AGING_ALTO_DIAS`, constante separada da #2) | `js/cockpit.js:892-893,908` — "critério inicial/configurável, mesmo espírito do threshold 2x/3x... não é uma regra validada" |
| 4 | Pipeline Necessário (Geração de Pipeline) | `Meta M+1 ÷ (Win Rate / 100)` | `js/cockpit.js:726` — "FÓRMULA (hipótese matemática, documentada e visível, não escondida)"; `COCKPIT_COMERCIAL.md`, limitação 8: "não uma fórmula validada com a diretoria"; repetido em `cockpit.html:237-239`/`totaltrac-cockpit.html:240-242` como nota de rodapé visível ao usuário |

**Nenhum destes 4 foi ratificado ou descartado por este agente** — são
decisões de negócio que cabem à diretoria comercial, conforme o próprio
código já sinaliza. Ficam registrados aqui como pendência formal do Sprint
01 (Data Trust Foundation), não como recomendação técnica de qual valor
adotar.

Thresholds correlatos que existem no código mas **não** têm o mesmo tipo de
marcação explícita "não validado" (mencionados aqui por transparência, não
incluídos na lista acima porque a busca não encontrou o comentário
correspondente): os thresholds de `classificarBucketForecast`/
`cockpitClassificarBucketForecast` (80/50 vs. 70/40/10 — ver
BUCKET_FORECAST-01a/01b), o SLA de aging do Catálogo (`aging_sla`, 30 dias,
mas editável pelo usuário a cada relatório, não hardcoded) e o SLA de
primeiro contato (`sla_primeiro_contato`, 4 horas, também editável). Não
tratar esses como "pendência formal" não significa que estão corretos — só
que o próprio código não os rotula como aguardando ratificação; recomenda-se
que a diretoria revise também estes ao decidir sobre os 4 da tabela acima.

---

## Mapeamento Vendido/Faturado/Realizado/Recebido

Verificação técnica direta no código (`js/config.js`, `ENTIDADES`,
`js/catalogo-relatorios.js`, `js/cockpit.js`, `js/forecast.js`) — nenhum
mapeamento foi inventado; onde não existe equivalente, isto está declarado
explicitamente.

| Conceito (spec) | Equivalente real no código hoje | Confiança |
|---|---|---|
| **Vendido** | Negócio ganho no funil Comercial (`STAGE_SEMANTIC_ID`/`_SEMANTICA==="success"`, data por `_FECHAMENTO`/`CLOSEDATE`) — usado em WIN_RATE-01a/01b, TICKET_MEDIO-01b/01d/01e, CLIENTE_IDENTITY-01 | **Média** — é o candidato mais próximo (venda fechada), mas nenhum campo/rótulo do código chama isso de "Vendido"; é uma inferência de mapeamento, não uma correspondência já nomeada |
| **Faturado** | Nenhum campo/etapa dedicado. O candidato mais próximo é "Contrato Assinado" no funil Financeiro (usado em FECHADO_MES-01a/01b/01f, TICKET_MEDIO-01a/01f) — mas isso representa assinatura de contrato, não emissão de nota fiscal | **Baixa** — não há campo de nota fiscal, número de NF, ou data de faturamento em nenhum lugar do projeto (`ENTIDADES` em `js/config.js` não lista nenhum) |
| **Realizado** | **Não existe.** Nenhum campo de execução/entrega/data de conclusão de serviço foi encontrado em `js/*.js` nem `scripts/*.mjs` | **Nenhuma** — ausência confirmada, não "não localizado" |
| **Recebido** | **Não existe.** Nenhuma integração com contas a receber, fluxo de caixa, ou status de pagamento em nenhum arquivo do projeto | **Nenhuma** — ausência confirmada |
| Gaps (venda→faturamento, faturamento→realização, realização→recebimento) | **Não computáveis hoje** — dependem dos 3 campos ausentes acima | — |
| Aging por etapa da cadeia / valores em risco | **Não computáveis hoje** pela mesma razão | — |

**Conclusão**: apenas "Vendido" tem candidato razoável no código atual, e
mesmo esse é uma inferência de mapeamento (não uma correspondência já
declarada em nenhum lugar do projeto). "Faturado", "Realizado" e "Recebido"
exigem decisão de modelagem de negócio — que campo/etapa do Bitrix (se
algum existir e não estiver mapeado em `ENTIDADES`) ou qual integração
externa (ERP, contas a receber) alimentaria cada um — antes de qualquer
implementação dos relatórios 01-04 do catálogo-mestre. Isto não foi
decidido nesta wave.

---

## Desambiguações de UI implementadas nesta tarefa

Todas as mudanças abaixo são **puramente de rótulo/texto exibido** — nenhuma
fórmula, filtro, numerador ou denominador foi alterado. Cada arquivo foi
validado com `node -e "new Function(require('fs').readFileSync('CAMINHO','utf8'))"`
após a edição (sem erro em nenhum dos três arquivos).

### `js/cockpit.js`

| Local | Antes | Depois |
|---|---|---|
| Card KPI, Resultado do Mês (linha ~1235) | `"Ticket médio (mês)"` | `"Ticket médio (mês, Financeiro)"` |
| Card KPI, Eficiência da Máquina (linha ~1292) | `"Win Rate"` | `"Win Rate (coorte por fechamento)"` |
| Card KPI, Eficiência da Máquina (linha ~1295) | `"Ticket médio vendido"` | `"Ticket médio vendido (Comercial)"` |
| Modal "Situação Comercial Agora" (linha ~1059) | `["Win Rate", ...]` | `["Win Rate (coorte por fechamento)", ...]` |
| Export CSV/HTML — `cockpitListaKpisExport` (linha ~1429) | `"Ticket médio (mês)"` | `"Ticket médio (mês, Financeiro)"` |
| Export CSV/HTML — `cockpitListaKpisExport` (linha ~1456) | `"Win Rate"` | `"Win Rate (coorte por fechamento)"` |
| Export CSV/HTML — `cockpitListaKpisExport` (linha ~1459) | `"Ticket médio vendido"` | `"Ticket médio vendido (Comercial)"` |
| Lista-resumo interna/tooltip (linha ~106) | `` `Win Rate: ...` `` | `` `Win Rate (coorte por fechamento): ...` `` |

### `js/forecast.js`

| Local | Antes | Depois |
|---|---|---|
| Relatório visual — stat item (linha ~333) | `"Ticket médio (fechados)"` | `"Ticket médio (fechados, Financeiro)"` |

### `js/catalogo-relatorios.js`

| Local | Antes | Depois |
|---|---|---|
| `conversao_comercial` — card KPI (linha ~194) | `"Win Rate"` | `"Win Rate (coorte por criação)"` |
| `conversao_comercial` — card KPI (linha ~194) | `"Ticket médio"` | `"Ticket médio (coorte por criação)"` |
| `performance_vendedores` — card KPI (linha ~215) | `"Win Rate geral"` | `"Win Rate geral (coorte por fechamento)"` |
| `ganhos_perdas_ciclo` — card KPI (linha ~224) | `"Win Rate"` | `"Win Rate (coorte por fechamento)"` |
| `ganhos_perdas_ciclo` — card KPI (linha ~224) | `"Ticket ganho"` | `"Ticket ganho (coorte por fechamento)"` |
| `clientes_receita` — card KPI (linha ~253) | `"Ticket médio"` | `"Ticket médio (coorte por fechamento)"` |

**Cohorts confirmados por leitura de código nesta wave** (não assumidos do
catálogo da Wave 1 sem conferência): `clientes_receita` filtra por
`_SEMANTICA==="success"` com `dentroPeriodoCatalogo(d._FECHAMENTO,p)`
(`js/catalogo-relatorios.js:249`) — confirma coorte por fechamento, mesma
família de `performance_vendedores`/`ganhos_perdas_ciclo`.

**Validação de sintaxe** (executada após todas as edições):

```
node -e "new Function(require('fs').readFileSync('js/cockpit.js','utf8'))"           → OK
node -e "new Function(require('fs').readFileSync('js/forecast.js','utf8'))"          → OK
node -e "new Function(require('fs').readFileSync('js/catalogo-relatorios.js','utf8'))" → OK
```

`git diff --stat` confirma que só estes 3 arquivos JS foram tocados (16
linhas em `js/cockpit.js`, 8 em `js/catalogo-relatorios.js`, 2 em
`js/forecast.js`) — nenhum outro arquivo do repositório foi alterado por
esta tarefa além deste relatório.

---

## Recomendações não implementadas (motivo)

1. **Renomear/qualificar "Fechado no mês" no script Node do e-mail semanal
   (`scripts/forecast-semanal.mjs`)** — não implementado porque corrigir a
   *fórmula* (não só o rótulo) exigiria buscar metadados de estágio por
   categoria dentro do script Node, uma mudança de comportamento em job
   agendado sem supervisão humana, não testável nesta sessão sem webhook
   real — já registrado como pendência em
   `WAVE_01_CORRECOES_PRODUCAO.md` item 2. Está fora do escopo desta tarefa
   (Parte B só cobre rótulo puro, sem tocar cálculo), mas mesmo um rótulo
   puro no e-mail (texto do assunto/corpo) tocaria um arquivo Node que roda
   sem supervisão — preferiu-se não editar sem poder testar contra um
   disparo real do workflow.
2. **Reconciliar DATA_QUALITY-01a e DATA_QUALITY-01b em um único
   score/conjunto de campos** — é uma mudança de fórmula (unificar campos,
   população-base e forma de agregação), explicitamente fora do escopo desta
   tarefa (Agente 03/Data Quality ou decisão de negócio futura).
3. **Ratificar ou descartar os 4 thresholds da seção dedicada** — decisão de
   negócio que cabe à diretoria comercial, não a este agente; documentados
   como pendência formal, não decididos.
4. **Adicionar tooltip/`title` explicativo (não só rótulo) em cada card** —
   avaliado e descartado nesta wave: `cockpitKpiCard()` não aceita um
   parâmetro de tooltip hoje (só rótulo, valor, chave de drill-down, classe
   extra e sub-texto de MoM já usado para outro propósito); adicionar um
   novo parâmetro/atributo `title` a uma função reaproveitada em ~30 chamadas
   é uma mudança de maior superfície do que a confiança desta tarefa permite
   sem testar visualmente no navegador real — o rótulo qualificado no texto
   (implementado) já comunica a coorte sem essa mudança estrutural.
5. **Qualificar cabeçalhos de coluna em tabelas de detalhe** (ex.: coluna
   "Win Rate" em `performance_vendedores`, linha ~216) — não alterado; o
   rótulo do card-resumo do mesmo relatório já foi qualificado, e a coluna
   de tabela aparece dentro do contexto do título do relatório (menor
   ambiguidade que comparar cards entre telas diferentes); manter os
   cabeçalhos compactos evita quebra de layout em tabelas já densas.
6. **Renomear WIN_RATE-01c (SDR)** — o rótulo já existente ("Win rate das
   oportunidades criadas") já qualifica razoavelmente a coorte; não alterado
   por já ter menor ambiguidade que os outros casos.
7. **Definir owners com nomes reais (não papel/área)** e **ratificar
   versionamento formal (Metric ID definitivo, data de vigência, testes)**
   — decisões que exigem estrutura organizacional/decisão humana que este
   agente não tem mandato para criar.

---

## Confiança e limitações

- **Alta confiança**: os campos `Fórmula`/`Numerador`/`Denominador`/`Fonte`
  de cada `METRIC_ID` replicam exatamente a leitura de código já feita na
  Wave 1 (não recalculados, não reinterpretados). Os 4 thresholds da seção
  de pendências foram confirmados por busca direta no código nesta wave
  (não apenas copiados do catálogo da Wave 1), com citação de linha exata.
  As 11 edições de rótulo (Parte B) foram sintaticamente validadas
  (`node -e "new Function(...)"`) e conferidas por `git diff --stat` para
  garantir que nenhum outro arquivo foi tocado.
- **Média confiança**: os "Owners interinos propostos" são uma proposta
  razoável baseada em qual tela/relatório já opera cada métrica hoje, mas é
  uma inferência deste agente, não uma estrutura organizacional existente —
  precisa de ratificação humana, podendo a diretoria preferir um
  agrupamento diferente (ex.: por domínio de negócio em vez de por área
  operacional).
- **Baixa confiança / decisão pendente, não deste agente**: o mapeamento
  Vendido/Faturado/Realizado/Recebido é uma inferência de qual conceito do
  código mais se aproxima de "Vendido" — mesmo esse mapeamento não está
  declarado em lugar nenhum do projeto; Faturado/Realizado/Recebido são
  ausências confirmadas, não estimativas. Os 4 thresholds pendentes não
  foram avaliados quanto a "qual valor seria correto" — só localizados e
  registrados como pendência, conforme escopo desta tarefa.
- **Não verificado nesta wave**: nenhum teste visual no navegador real das
  11 mudanças de rótulo (só validação de sintaxe JS) — não há ambiente com
  webhook Bitrix disponível nesta sessão para renderizar o Cockpit/Catálogo
  de fato e confirmar que os rótulos mais longos não quebram o layout dos
  cards (mesma limitação já registrada em `COCKPIT_COMERCIAL.md`, item 6,
  para a tarefa original do Cockpit). Os rótulos usados seguem o mesmo
  padrão de parênteses já existente em outros cards do próprio Cockpit
  (ex.: "Coverage recomendado (Win Rate histórico)", já em produção antes
  desta tarefa), o que reduz o risco, mas não o elimina.
- **Cobertura do catálogo**: como já registrado na Wave 1, ~15 relatórios do
  Catálogo (`funil_leads`, `produtos_receita`, `sla_primeiro_contato`,
  `decisao_final_sdr`, `produtividade_atividades`, etc.) não tiveram suas
  fórmulas extraídas em nenhuma das duas waves — este catálogo cobre os
  ~26 METRIC_IDs que cruzam com os achados centrais da Wave 1 (Fechado no
  Mês, Forecast, Coverage, Win Rate, Ticket Médio, Data Quality, SDR,
  identidade de cliente), não a totalidade de todo indicador do projeto.
