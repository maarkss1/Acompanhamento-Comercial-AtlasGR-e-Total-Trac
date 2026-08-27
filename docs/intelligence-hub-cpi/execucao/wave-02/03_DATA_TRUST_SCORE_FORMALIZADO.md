# Agente 03 — Data Trust Score (Wave 2.1)

> Escopo: continuação direta do relatório da Wave 1
> (`docs/intelligence-hub-cpi/execucao/wave-01-fundacao/03_DATA_QUALITY_GUARDIAN_QUALIDADE_DE_DADOS.md`),
> conforme item 2.1.1 do plano do Agente 00
> (`docs/intelligence-hub-cpi/execucao/wave-01-fundacao/00_CHIEF_ORCHESTRATOR_DIAGNOSTICO_E_PLANO.md`).
> Análise estática de código real, sem acesso à API Bitrix24 ao vivo nesta sessão — mesma limitação
> já registrada na Wave 1. Toda constatação cita arquivo/linha verificado no repositório. Nenhum
> número de exemplo abaixo é dado real da AtlasGR/Total Trac; onde há exemplo de cálculo, está
> rotulado explicitamente como **ilustrativo/fictício**.

## Resumo executivo

O Sprint 01 (`03_SPRINTS/SPRINT_01_DATA_TRUST_FOUNDATION.txt`) e a especificação de referência
(`02_DADOS_E_BITRIX/04_DATA_TRUST_SCORE.txt`) pedem um Data Trust Score combinando completude,
consistência, validade, unicidade, atualidade, rastreabilidade e integridade referencial, com
saídas em score global / por área / por objeto / por campo crítico / por fonte / tendência /
causas de queda / impacto nos relatórios afetados.

Esta tarefa formaliza uma versão **mínima e tecnicamente honesta** desse score, calculável hoje
sem backend e sem histórico persistido: **completude + consistência + atualidade**, por entidade
(Negócios, Leads), reaproveitando integralmente a base de dados e as regras já existentes em
`qualidade_crm` e `auditoria_sdr` (`js/catalogo-relatorios.js`). As dimensões de unicidade,
rastreabilidade e integridade referencial da especificação **não** entram no score formalizado
aqui — ver justificativa na seção "Riscos e limitações".

A fórmula foi implementada com confiança alta em um novo arquivo isolado, `js/data-trust-score.js`,
de forma inteiramente aditiva: nenhuma função existente foi alterada, nenhum comportamento visível
mudou, e a nova função **não** foi registrada em `js/config.js` (menu de relatórios) nem incluída
em nenhum `<script src>` de página HTML — permanece desconectada da UI até uma decisão de UX futura,
conforme pedido.

Como efeito colateral da leitura linha a linha de `qualidade_crm`/`auditoria_sdr` necessária para
esta tarefa, foi encontrado um **bug real e verificável** (não hipotético, não dependente de dados
de produção) no código já existente: o check de completude "Telefone ou e-mail" desses dois
relatórios está quebrado e sempre reporta 100% de leads sem telefone/e-mail, independentemente do
dado real. Ver seção "Achado adicional verificado nesta tarefa".

## O que já existe (`qualidade_crm`, `auditoria_sdr`) com evidência

Ambos vivem em `js/catalogo-relatorios.js` e seguem o mesmo padrão estrutural: uma lista de
"checks" `{ENTIDADE, CAMPO, TOTAL, FALTANTES}`, convertida em `COMPLETUDE_PCT = TOTAL ? round((1 -
FALTANTES/TOTAL) × 10000)/100 : 100`.

**`qualidade_crm`** (`js/catalogo-relatorios.js:329-347`) — mede completude de Negócios e Leads:
- Base de dados: `baseDealsCatalogo(webhook, false)` (todos os funis, não só Comercial) +
  `baseLeadsCatalogo(webhook)`, chamados em paralelo (`Promise.all`).
- Negócios (`ds`): vínculo com cliente (`COMPANY_ID`/`CONTACT_ID`/`LEAD_ID`, linha 333),
  `SOURCE_ID` (334), `ASSIGNED_BY_ID` (335), `OPPORTUNITY > 0` (336), e `CLOSEDATE` só para
  negócios **abertos** e fora do estágio "Piloto" (337, usa `semanticaDeal` + `ehEstagioPiloto` de
  `js/jornada.js`).
- Leads (`ls`): `SOURCE_ID` (338), `ASSIGNED_BY_ID` (339), "Empresa / nome" (340), "Telefone ou
  e-mail" via `valoresMulticampo` (341 — **ver bug abaixo**).
- Nota explícita no próprio relatório (linha 346): "Completude mede disponibilidade para operação
  e análise; não afirma que todo campo seja obrigatório."

**`auditoria_sdr`** (`js/catalogo-relatorios.js:349-376`) — mede completude + aderência ao plano de
contato de Leads, escopado ao período selecionado (`dentroPeriodoCatalogo`):
- Leads sem nenhuma atividade vinculada (352-353, via `bindingsDaAtividade`).
- Atividades concluídas sem assunto/resultado (354).
- Leads **abertos** sem contato nos últimos 7 dias (355-360 — usa a última `END_TIME` de atividade
  ou, na ausência, `LAST_ACTIVITY_TIME`/`DATE_CREATE`; **este limiar de 7 dias foi reaproveitado
  literalmente** na dimensão de atualidade da nova função, ver abaixo).
- Mais 3 checks de completude idênticos em espírito aos de `qualidade_crm` (telefone/e-mail,
  `SOURCE_ID`, `ASSIGNED_BY_ID`, linhas 365-367).
- Nota explícita (linha 375): "valida existência e completude, não a qualidade do conteúdo
  registrado em cada atividade."

**Sinais de consistência já existentes fora desses dois relatórios**, reaproveitados na nova
função: a correção de produção da Wave 1 (`WAVE_01_CORRECOES_PRODUCAO.md`, item 4) introduziu em
`decisao_final_sdr` (`js/catalogo-relatorios.js:378-399`) a distinção entre `diasParado` (clampado
em 0) e o valor bruto sem clamp, usado para detectar `MOVED_TIME`/`DATE_CREATE` no futuro. A mesma
lógica (sem clamp, usando `dtsDiasDesde`) foi generalizada na nova função para Negócios e Leads.

### Achado adicional verificado nesta tarefa (bug real, não hipotético)

`js/jornada.js:59` declara `function valoresMulticampo(registro, campo)`. Os únicos dois usos desse
check em `js/catalogo-relatorios.js` chamam a função com **1 argumento apenas**:
`valoresMulticampo(l.PHONE)` / `valoresMulticampo(l.EMAIL)` (linhas 341 e 365). Com `campo`
`undefined`, o corpo da função (`const v = registro?.[campo]`) sempre avalia `l.PHONE?.[undefined]`
— que é `undefined` tanto para arrays (Bitrix retorna `PHONE`/`EMAIL` como array de objetos
`{VALUE, VALUE_TYPE}`) quanto para qualquer outro tipo — logo `!v` é sempre verdadeiro e a função
sempre retorna `[]`. Isso é verificável apenas lendo o código (confiança alta, sem depender de dado
de produção): **o check "Telefone ou e-mail" em `qualidade_crm` e `auditoria_sdr` sempre reporta
100% de Leads sem telefone/e-mail**, mesmo que o telefone/e-mail esteja de fato preenchido no
Bitrix. Isso não foi corrigido no código existente nesta tarefa (fora do escopo pedido — "aditivo,
sem alterar comportamento existente" e restrição de só editar o arquivo do relatório e o novo
código do Data Trust Score); a nova função chama `valoresMulticampo(l, "PHONE")` corretamente (2
argumentos), então o check equivalente dentro do Data Trust Score **é confiável**, diferente do
check homônimo hoje em produção nesses dois relatórios. Recomenda-se uma correção pontual de baixo
esforço em uma próxima wave de correções de produção.

## Fórmula proposta do Data Trust Score

Por entidade (`Negócios`, `Leads`), o score combina 3 dimensões, cada uma calculada a partir de uma
lista de "checks" no mesmo formato `{TOTAL, OCORRENCIAS, SCORE_PCT}` já usado por `qualidade_crm`:

```
score_dimensão = média simples dos SCORE_PCT de cada check dessa dimensão
score_entidade = (completude × 0.45 + consistência × 0.30 + atualidade × 0.25) / soma_dos_pesos_aplicáveis
score_global   = média de score_entidade ponderada pelo nº de registros de cada entidade
```

A divisão por "soma dos pesos aplicáveis" (em vez de sempre por 1) é proposital: quando uma
dimensão não é aplicável (ex.: atualidade sem nenhum registro aberto), ela é **omitida**, não
tratada como 0 — mesmo princípio "nunca 0 silencioso" já declarado em `js/cockpit.js:16-18` e
citado no relatório da Wave 1.

**Completude** (peso 0.45) — reaproveita exatamente as regras de `qualidade_crm`/`auditoria_sdr`
(vínculo de cliente, `SOURCE_ID`, `ASSIGNED_BY_ID`, `OPPORTUNITY > 0`, `CLOSEDATE` em abertos para
Negócios; `SOURCE_ID`, `ASSIGNED_BY_ID`, nome/empresa, telefone/e-mail para Leads — este último com
o bug acima corrigido na nova implementação). **Peso mais alto** porque é a dimensão com mais
regras já maduras e testadas em produção (2 relatórios dedicados, usados hoje pela equipe).

**Consistência** (peso 0.30) — contradições lógicas detectáveis nos próprios campos já extraídos,
sem nenhuma chamada adicional ao Bitrix:
- Negócios: `MOVED_TIME` no futuro (mesmo padrão da correção de `decisao_final_sdr`); `DATE_MODIFY`
  anterior a `DATE_CREATE` (ordem cronológica impossível); `CLOSEDATE` vencido em negócio ainda
  aberto (a data que o próprio registro diz que devia estar fechado já passou, mas o estágio
  continua "em andamento").
- Leads: `MOVED_TIME`/`DATE_CREATE` no futuro; `DATE_MODIFY` anterior a `DATE_CREATE`; lead marcado
  como "convertido" (`STATUS_SEMANTIC_ID`/`STATUS_ID=CONVERTED`) sem nenhum negócio no extrato
  apontando para ele via `LEAD_ID` (cruzamento possível porque `qualidade_crm` já carrega Negócios
  e Leads na mesma chamada). **Peso intermediário**: o raciocínio é sólido e reaproveita uma
  correção de produção já validada, mas cobre só 3 regras por entidade (bem menor superfície que a
  completude) — um conjunto de regras ainda pequeno para pesar mais que a completude.

**Atualidade** (peso 0.25) — escopada **somente a registros abertos** (`semanticaDeal`/
`semanticaLead` = "process", excluindo estágio Piloto para Negócios): % de registros cujo "último
toque" (o mais recente entre `DATE_MODIFY`, `MOVED_TIME`, `LAST_ACTIVITY_TIME`) está dentro de um
limiar de dias. Para Leads, o limiar é **7 dias — literalmente o mesmo já usado em
`auditoria_sdr`** (linha 356-360). Para Negócios não existe limiar equivalente já validado no
código; foi usado 30 dias como default proposto (rotulado explicitamente como não validado com a
diretoria, no mesmo espírito do aging de 45 dias e do coverage 2x/3x já sinalizados como não
ratificados pelo Agente 05/Chief Orchestrator). **Peso mais baixo**: um registro fechado não
precisa ser "atual" (não é um defeito de dado um negócio Ganho de 2 anos atrás não ter sido tocado
desde então), então a dimensão é mais estreita em aplicabilidade que as outras duas, e seu limiar
de Negócios é o único dos três "pilares" que não tem precedente já validado em produção.

Esta divisão de pesos é o entregável central desta tarefa e é **uma proposta**, não uma decisão de
negócio ratificada — ver "Riscos e limitações".

### Exemplo de cálculo (ilustrativo, dados fictícios — não são dados reais da AtlasGR/Total Trac)

Rodando `montarDataTrustScore` contra um conjunto de 3 negócios e 2 leads fabricados apenas para
teste (ver `js/data-trust-score.js` — carregado junto com `js/jornada.js` e
`js/catalogo-relatorios.js` reais em um sandbox Node para validar a lógica), obteve-se, por
exemplo, `Negócios: completude 63.34% / consistência 88.89% / atualidade 50% → score 67.67 (C)`.
Estes números são apenas para demonstrar que a fórmula produz resultados coerentes com os dados de
entrada fabricados — **não representam a base real da AtlasGR ou da Total Trac**, que não foi
acessada nesta sessão.

## Granularidade e justificativa

A especificação de referência (`04_DATA_TRUST_SCORE.txt`) pede score global, por área, por objeto,
por campo crítico, por fonte, tendência e causas de queda. Decisão tomada, item a item:

- **Score global** — implementado. Média dos scores de Negócios/Leads ponderada pelo nº de
  registros de cada um.
- **Score por entidade** (Negócios, Leads) — implementado como granularidade primária. É o nível
  em que `qualidade_crm`/`auditoria_sdr` já operam hoje, então reaproveita máximo de infraestrutura
  já validada e é o nível mais diretamente acionável (um "dono de dado" pensa em termos de
  "Negócios" ou "Leads", não em termos de "área" de negócio, que não existe como conceito no código
  hoje).
- **Score por campo crítico** — implementado (`camposCriticos`, lista ordenada de todos os checks
  de completude+consistência+atualidade das duas entidades, do pior para o melhor SCORE_PCT).
  Funciona como um proxy para "principais causas" no estado atual (ver limitação de tendência
  abaixo).
- **Score por responsável (vendedor/SDR)** — implementado como quebra adicional, só na dimensão de
  completude (`porResponsavel`). Decisão: é barato de calcular (mesmos dados já carregados,
  agrupamento simples por `ASSIGNED_BY_ID`) e é genuinamente acionável — aponta quem precisa de
  reforço de higiene de CRM — mas não foi estendido a consistência/atualidade nesta primeira
  formalização por não haver um caso de uso claramente pedido para isso ainda (ver limitações).
- **Score por fonte** (AtlasGR vs. Total Trac) — **não implementado como dimensão interna**, por
  decisão deliberada: cada chamada da função já opera sobre o webhook de uma única empresa (mesmo
  padrão de segregação usado em todo o resto do catálogo — cada portal Bitrix é consultado
  separadamente). Rodar a função uma vez por empresa já produz o score "por fonte" sem nenhuma
  lógica extra; adicionar uma dimensão de fonte dentro da própria função seria redundante com a
  arquitetura já existente.
- **Score por negócio/lead individual** — decidido **não implementar como saída primária**. Os
  sinais por registro (funções `dtsAnalisarNegocio`/`dtsAnalisarLead`) já existem internamente e
  poderiam alimentar uma extensão futura, mas um score 0-100 por registro individual, na prática,
  colapsaria em um pequeno conjunto de valores discretos (cada entidade tem só 4-5 checks binários
  por dimensão), tornando um "score por negócio" pouco mais informativo que simplesmente listar
  quais checks aquele registro falhou — e sem UI para navegar milhares de registros individuais,
  não há hoje um consumidor claro para esse nível de granularidade. Preferiu-se manter esse nível
  como extensão futura documentada, não como entregável desta formalização.
- **Tendência ao longo do tempo** — **não implementado, não calculável hoje**. Não existe camada de
  staging/histórico persistente de Negócios/Leads brutos (só o forecast semanal da AtlasGR é
  persistido, conforme já mapeado pelo Agente 01 e pelo Agente 00 na síntese da Wave 1, item
  "Lacunas estruturais" #1). Este é um bloqueio de dado, não de fórmula — a fórmula de score em si
  já está pronta para ser comparada contra uma execução anterior assim que houver onde persistir os
  snapshots (proposta do Agente 01, Wave 2.2).
- **Principais causas de queda** — mesma limitação: "queda" implica comparação temporal. O que foi
  entregue (`camposCriticos`) é um ranking do estado atual, não de variação — está documentado
  explicitamente no array `limitacoes` retornado pela própria função.
- **Impacto nos relatórios afetados** — não implementado como mapeamento em código nesta tarefa
  (adicionaria uma tabela estática a manter sincronizada manualmente, com risco de desatualizar
  silenciosamente). Registrado aqui como conhecimento descritivo: campos como `OPPORTUNITY`
  afetam ticket médio (`js/cockpit.js`, `js/forecast.js`) e o próprio Forecast; `SOURCE_ID` afeta
  relatórios de origem/funil de leads (`funil_leads`, `js/config.js:316`); `ASSIGNED_BY_ID` afeta
  `handoffs`, `produtividade_atividades`, `decisao_final_sdr` e qualquer relatório "por
  responsável". Um mapeamento formal e mantido pertence ao catálogo de métricas do Agente 05
  (`Wave 2.1`, item 2 do plano do Agente 00), não a este documento.

## Implementação

Implementado com confiança alta em **`js/data-trust-score.js`** (arquivo novo, ~314 linhas,
comentado). Estrutura:

- `DTS_PESOS_PADRAO`, `DTS_LIMIAR_DIAS_SEM_TOQUE_NEGOCIO`, `DTS_LIMIAR_DIAS_SEM_TOQUE_LEAD` —
  constantes ajustáveis (linhas 37-39).
- `dtsDiasDesde`, `dtsHojeISO`, `dtsCheck`, `dtsMediaChecks`, `dtsComporScore`, `dtsGrade` —
  utilitários pequenos e puros (linhas 42-88).
- `dtsAnalisarNegocio` / `dtsAnalisarLead` — análise por registro, reaproveitando
  `semanticaDeal`/`ehEstagioPiloto` (`js/jornada.js`) e `semanticaLead` (`js/catalogo-relatorios.js`)
  (linhas 94-172).
- `dtsAgregarNegocios` / `dtsAgregarLeads` — monta os checks de completude/consistência/atualidade
  por entidade (linhas 175-237).
- `dtsPorResponsavel` — quebra por `ASSIGNED_BY_ID` (linhas 240-251).
- `montarDataTrustScore(db, lb, opcoes)` — função pura principal, testável sem rede; recebe
  exatamente o formato de retorno de `baseDealsCatalogo`/`baseLeadsCatalogo` (linhas 256-308).
- `calcularDataTrustScore(webhook, opcoes)` — wrapper assíncrono que chama
  `baseDealsCatalogo(webhook, false)` + `baseLeadsCatalogo(webhook)` em paralelo, **a mesma base
  exata que `qualidade_crm` usa** (`js/catalogo-relatorios.js:330`) (linhas 311-314).

**Não registrado** em `RELATORIOS_CATALOGO` (`js/config.js:319-323`) nem incluído em nenhum
`<script src>` de página HTML — o arquivo existe no repositório mas não é carregado por nenhuma
página hoje, exatamente como pedido ("decisão de UX para depois, fora do escopo desta tarefa"). Uma
wave futura que queira expor isso precisa: (a) adicionar `<script src="js/data-trust-score.js">`
nas páginas relevantes, respeitando a ordem de carregamento (depois de `jornada.js` e
`catalogo-relatorios.js`, de quem depende); (b) decidir se vira um relatório do catálogo (registrar
em `js/config.js`) ou um card dedicado.

**Validação de sintaxe** (conforme instruído, script clássico de navegador, não módulo ES):
```
node -e "new Function(require('fs').readFileSync('js/data-trust-score.js','utf8'))"
```
retornou sem erro. Adicionalmente, o arquivo foi carregado junto com os arquivos **reais**
`js/jornada.js` e `js/catalogo-relatorios.js` em um sandbox Node (`vm.createContext`) e
`montarDataTrustScore` foi executado contra um conjunto de dados fabricados (ver seção "Exemplo de
cálculo" acima) para confirmar que os números produzidos batem manualmente com os dados de entrada
— não é um teste automatizado permanente (não foi pedido nem adicionado ao repositório), mas
elevou a confiança de "sintaticamente válido" para "logicamente correto contra as dependências
reais do projeto".

## Riscos e limitações

- **Pesos e limiares não ratificados pelo negócio.** 0.45/0.30/0.25 e os limiares de 30/7 dias são
  defaults propostos com justificativa registrada acima, não uma decisão de diretoria — mesmo
  padrão de ressalva já usado no código para coverage/aging (sinalizado pelo Agente 05/Chief
  Orchestrator como "não validado com a diretoria").
- **Dimensões da especificação não cobertas**: unicidade, rastreabilidade e integridade
  referencial (pedidas em `04_DATA_TRUST_SCORE.txt`) ficaram fora do score formalizado.
  Unicidade já tem relatório próprio (`duplicidades`) mas exige uma chamada adicional
  (`crm.company.list` para sinais de duplicidade de Empresas) que `qualidade_crm` não faz — incluir
  aumentaria o custo de chamadas à API sem reaproveitar a base já compartilhada; deixado como
  extensão futura explícita, não como omissão silenciosa. Duplicidade de Leads é um gap já
  registrado na Wave 1 e continua sem nenhuma implementação no catálogo. Rastreabilidade e
  integridade referencial exigiriam conceitos (origem/linhagem do dado, chaves estrangeiras
  validadas contra o schema real do Bitrix) que não existem hoje no código do projeto.
- **Consistência é uma superfície pequena e deliberadamente conservadora** (3 regras por entidade,
  todas contradições lógicas objetivas — data no futuro, ordem cronológica invertida, conversão sem
  negócio correspondente). Não inclui, por exemplo, `CATEGORY_ID=0` hardcoded quebrando
  silenciosamente (já documentado na Wave 1 como risco de consistência, mas não é uma verificação
  por registro) nem a duplicação de regra de negócio entre navegador e Node (`forecast-semanal.mjs`)
  — ambos são riscos de consistência de **sistema**, não de **registro**, e não cabem no formato de
  "check por entidade" usado aqui.
- **Atualidade mede o dado do Bitrix, não a frescura da extração local.** Este score responde
  "quando o registro foi tocado pela última vez no CRM", não "há quanto tempo esta tela buscou o
  dado do Bitrix" — essa segunda pergunta já foi tratada separadamente na correção de produção da
  Wave 1 (flag `_deCache`/`ULTIMA_CARGA_TEVE_CACHE`, ver `WAVE_01_CORRECOES_PRODUCAO.md` item 6) e
  é um conceito diferente, não duplicado aqui.
- **Fuso horário**: `dtsHojeISO`/`dtsDiasDesde` usam o relógio local do navegador (`new Date()`),
  mesma limitação de "-03:00 hardcoded"/sem derivar do fuso real da conta Bitrix já registrada na
  Wave 1 — não foi introduzido um problema novo, apenas herdado o já existente.
  Reaproveitando o mesmo `agora` para as duas entidades dentro de uma execução, não há risco de
  inconsistência interna entre Negócios e Leads na mesma chamada.
- **Não verificável nesta sessão**: qualquer número real de score para a base de produção da
  AtlasGR ou Total Trac — isso exige chamar `calcularDataTrustScore(webhook)` contra um webhook
  real, o que esta sessão não tem como fazer. Todo exemplo numérico neste documento é fictício e
  está rotulado como tal.
- **Ordem de carregamento de script**: se uma wave futura incluir `js/data-trust-score.js` em uma
  página HTML, ele precisa vir depois de `js/jornada.js` e `js/catalogo-relatorios.js` (dependências
  diretas: `semanticaDeal`, `ehEstagioPiloto`, `idBitrixValido`, `idBitrixString`, `parteDataISO`,
  `valoresMulticampo`, `nomeUsuario`, `semanticaLead`, `baseDealsCatalogo`, `baseLeadsCatalogo`) —
  não verificado nem testado em uma página real nesta tarefa, porque isso exigiria editar HTML, fora
  do escopo autorizado desta tarefa.

## Confiança

- **Alta confiança**: leitura de `qualidade_crm`/`auditoria_sdr` e de todas as funções reaproveitadas
  (`semanticaDeal`, `ehEstagioPiloto`, `semanticaLead`, `idBitrixValido`, `parteDataISO`,
  `valoresMulticampo`) — trechos lidos diretamente, com linha citada. O bug de
  `valoresMulticampo(l.PHONE)` é uma dedução lógica direta da assinatura da função contra o site de
  chamada, não depende de dado de produção, e foi confirmado por grep exaustivo (nenhuma outra
  definição da função no repositório).
- **Alta confiança na correção sintática e lógica de `js/data-trust-score.js`**: validado com
  `new Function(...)` sobre o arquivo isolado, e adicionalmente carregado junto aos arquivos reais
  `jornada.js`/`catalogo-relatorios.js` em sandbox Node, executado contra dados fabricados e
  conferido manualmente campo a campo (ver seção "Implementação").
- **Média confiança nos pesos/limiares propostos**: a lógica de que "completude tem mais regras
  maduras, logo peso maior" e "atualidade é mais estreita em aplicabilidade, logo peso menor" é
  defensável e documentada, mas é uma escolha de design desta tarefa, não uma validação de negócio
  — precisa de ratificação humana antes de virar critério oficial de qualidade usado em decisões.
- **Baixa confiança / não verificável**: qualquer afirmação sobre o score real da base de produção
  (não foi calculado — sem acesso ao Bitrix real nesta sessão) e sobre como este score se
  compararia a uma execução futura (não há histórico para comparar).
