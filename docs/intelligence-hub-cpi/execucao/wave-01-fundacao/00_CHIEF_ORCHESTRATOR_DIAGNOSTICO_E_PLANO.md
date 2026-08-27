# Agente 00 — Chief Intelligence Orchestrator — Diagnóstico da Wave 1 e Plano da Wave 2

Data: 2026-08-27. Base: leitura integral dos 5 relatórios da Wave 1 — Fundação
(Agentes 01-05), do pacote de especificação (`SPRINT_00`, `SPRINT_01`,
`99_ORDEM_E_DEPENDENCIAS.txt`) e verificação pontual no código-fonte real do
repositório para cruzar/confirmar achados que os relatórios individuais
citavam de forma parcialmente divergente entre si. Nenhum achado abaixo foi
inventado: cada linha da tabela de riscos remete a um agente de origem e a
uma evidência de arquivo/linha já levantada na Wave 1 (ou confirmada nesta
síntese por grep direto, quando indicado).

## Resumo executivo

A Wave 1 confirma, com cinco leituras independentes e convergentes, que o
"Acompanhamento Comercial AtlasGR e Total Trac" é hoje um **dashboard
100% client-side sem backend, sem banco de dados e sem camada de dados
corporativa** — apenas HTML/JS estático que fala diretamente com dois
portais Bitrix24 (AtlasGR e Total Trac) a cada sessão de navegador, mais uma
única automação Node semanal (forecast por e-mail, só para a AtlasGR). Isso
não é uma falha de execução: é uma decisão de arquitetura que funcionou bem
para o problema que a ferramenta resolvia até aqui, mas que está muito atrás
da ambição do programa Intelligence Hub (70 agentes, 58 relatórios do
catálogo-mestre, séries temporais, Customer 360, churn/LTV/cohort — nenhum
desses tem hoje qualquer base de dado, conforme o próprio Agente 05
confirmou por varredura de código).

Os cinco relatórios, lidos em conjunto, contam a mesma história por ângulos
diferentes — e as histórias se cruzam de forma que nenhum relatório sozinho
deixa claro:

1. **A "chave mestra de cliente" existe, mas em três versões que discordam
   entre si.** O Agente 01 encontrou a lógica de identidade de cliente em
   `js/jornada.js:864-901` (`COMPANY_ID > CONTACT_ID > LEAD_ID > nome
   normalizado > DEAL_ID isolado`, com confiança ALTA/MÉDIA/BAIXA) e já
   sinalizou que ela "provavelmente" não é reaproveitada em outros módulos.
   O Agente 04 confirmou exatamente isso com leitura direta: `js/jornada.js`
   usa a hierarquia completa; `clientes_receita`
   (`js/catalogo-relatorios.js:250`) usa só `COMPANY_ID > nome normalizado`
   (sem `CONTACT_ID`/`LEAD_ID`); e `js/sdr.js:285` usa `COMPANY_ID >
   CONTACT_ID > LEAD_ID > DEAL_ID` (sem o passo de nome normalizado). O
   Agente 05 fecha o ciclo mostrando a consequência de negócio: o KPI "Top
   10 clientes"/concentração de receita (`clientes_receita`) roda sobre a
   variante mais fraca das três, o que **subestima concentração de receita**
   sempre que duas grafias do mesmo cliente (com/sem "Ltda", erro de
   digitação) não têm `COMPANY_ID` idêntico. Ou seja: não são três achados
   isolados de "falta consolidar chave de cliente" — é uma cadeia única:
   heurística boa mas isolada (01) → reimplementada de 3 formas divergentes
   (04) → distorcendo um KPI executivo específico hoje em produção (05).

2. **O webhook de produção da AtlasGR não está exposto em "pelo menos 3
   arquivos" — está em pelo menos 8.** O Agente 01 citou `js/bitrix-api.js:7`;
   o Agente 02 citou `js/config.js`, `extracao.html` e
   `scripts/forecast-semanal.mjs` (citação de arquivo com imprecisão de
   linha, mas a essência do achado é correta). A verificação direta feita
   nesta síntese (`grep` pelo valor literal do webhook) confirma que o
   mesmo token aparece, em texto puro, em **`js/bitrix-api.js`,
   `scripts/forecast-semanal.mjs` e nos cinco arquivos HTML de página da
   AtlasGR** (`extracao.html`, `forecast.html`, `home.html`, `cockpit.html`,
   `sdr.html` — cada um duplica o valor em `value=` **e** `placeholder=` do
   campo de webhook). O repositório é público no GitHub
   (`github.com/maarkss1/Acompanhamento-Comercial-AtlasGR-e-Total-Trac`) e
   publicado via GitHub Pages (`.github/workflows/pages.yml` existe e roda a
   cada push em `main`) — ou seja, qualquer visitante do site publicado ou
   do repositório já tem essa credencial de produção, sem precisar de acesso
   privilegiado. Este é o achado mais grave que os dois relatórios (01, 02)
   descrevem parcialmente, mas nenhum dos dois tinha o quadro completo (nem
   contava quantos arquivos, nem confirmava se o repositório é público).

3. **O e-mail semanal automático de forecast, que vai para
   `comercial@atlasgr.com.br`, usa uma fórmula diferente da que a tela
   mostra — e isso já está em produção, não é um risco hipotético.** O
   Agente 05 encontrou que "Fechado no mês" tem 4 variantes ativas
   simultaneamente na mesma extração do Forecast Semanal: o card de KPI em
   texto (funil Comercial + `CLOSEDATE`) e o relatório visual/tendência
   (funil Financeiro + `MOVED_TIME`) mostram números diferentes **na mesma
   tela, no mesmo clique**; o script Node do e-mail semanal
   (`scripts/forecast-semanal.mjs`) usa a mesma fórmula "antiga" do card de
   texto, nunca recebeu a correção que foi aplicada só ao relatório visual.
   O Agente 01 e o Agente 03 já haviam sinalizado, cada um por seu ângulo,
   que as regras de forecast estão duplicadas entre navegador e Node sem
   módulo compartilhado e sem reconciliação automática — o Agente 05 é quem
   mostra que essa duplicação já produziu uma divergência real e ativa,
   entregue por e-mail à diretoria comercial toda sexta-feira.

4. **A segregação AtlasGR × Total Trac é sólida no dado remoto, frágil no
   dado local e não garantida por código em nenhum dos dois casos de
   verdade.** O Agente 01 mapeou 6 chaves de `localStorage` sem sufixo de
   empresa (metas desdobradas, layout do Cockpit, filtros globais, tema,
   auditoria de sync, chave de API de IA) — se alguém acompanha as duas
   empresas no mesmo navegador, esses valores vazam entre marcas. O Agente 04
   aprofunda o ponto seguinte: mesmo a separação "forte" (dois webhooks, dois
   portais Bitrix) **não é verificada por código** — nada impede colar por
   engano o webhook da AtlasGR na tela da Total Trac; a segregação depende
   inteiramente de disciplina humana. O Agente 02 acrescenta que a própria UI
   da Total Trac herda rótulos de categoria/estágio de funil que são,
   textualmente, os da AtlasGR (não confirmados contra o Bitrix real da Total
   Trac). As três leituras descrevem a mesma fragilidade estrutural em três
   camadas diferentes (armazenamento local, configuração de conexão,
   metadados de funil).

5. **Qualidade de dado silenciosa em pontos que alimentam decisão
   automática.** O Agente 03 encontrou que datas futuras/negativas são
   "clampeadas" para 0 em três lugares — inclusive dentro de
   `decisao_final_sdr`, que decide se um lead deve ser recontatado/escalado.
   Isso não é um problema cosmético: é uma regra de negócio automatizada
   tomando decisão sobre um dado inconsistente sem sinalizar a
   inconsistência. O mesmo padrão de "valor default silencioso" aparece no
   ticket médio (negócios "Ganhos" sem `OPPORTUNITY` preenchido entram no
   denominador com valor zero, deflacionando a média) e na meta mensal
   (`metaMensalPadrao` retorna R$ 0,00 silenciosamente para meses fora da
   tabela hardcoded) — o Agente 01 já havia sinalizado a tabela de metas
   hardcoded como P0.3 pendente; o Agente 03 mostra o efeito concreto desse
   `0` silencioso na prática.

6. **O programa CPI está pedindo uma casa de 70 cômodos sobre uma fundação
   que ainda não tem nem porão.** O Agente 05, ao tentar localizar no código
   os 58 relatórios do catálogo-mestre de especificação, achou fórmula real
   para menos de 5 (Ticket Médio, Sales Cycle, Pipeline & Coverage e
   parcialmente SDR Command Center e Forecast & Revenue Intelligence); os
   demais 50+ (Growth, NRR/GRR, LTV, Cohort, Churn, Revenue at Risk, Early
   Warning, What-if Simulator, Customer 360, Data Trust Center, Next Best
   Action etc.) **não têm nenhuma implementação, nenhuma extração de dado de
   apoio, nenhuma fórmula** — confirmado por varredura de todo `js/*.js` e
   `scripts/*.mjs` sem nenhuma ocorrência de termos equivalentes. Isso
   confirma, com evidência concreta, o alerta mais abstrato que o Agente 01
   já havia feito ("a ambição do pacote de especificação está muito à frente
   da infraestrutura de dados real hoje").

## Tabela de riscos consolidada

Severidade ordenada CRÍTICO > ALTO > MÉDIO > BAIXO. "Esforço de correção" é
estimado apenas para os itens que são corrigíveis como ação pontual de
produção (ver seção seguinte); itens estruturais do CPI têm esforço marcado
como "arquitetural" em vez de baixo/médio/alto, porque não são um fix de
código único.

| Sev. | Achado | Agente(s) de origem | Evidência (arquivo:linha) | Esforço de correção |
|---|---|---|---|---|
| **CRÍTICO** | Webhook de produção da AtlasGR (URL + token) em texto puro em pelo menos 8 arquivos versionados (`js/bitrix-api.js`, `scripts/forecast-semanal.mjs`, `extracao.html`, `forecast.html`, `home.html`, `cockpit.html`, `sdr.html`); repositório público no GitHub e publicado via GitHub Pages a cada push em `main` | 01, 02 (síntese confirmou o alcance real via grep + `.github/workflows/pages.yml`) | `js/bitrix-api.js:7`; `scripts/forecast-semanal.mjs:29`; `extracao.html:111`; `forecast.html:92`; `home.html:99`; `cockpit.html:93`; `sdr.html:92` | Baixo (revogar/regenerar webhook no Bitrix24 + remover valores literais) |
| **CRÍTICO** | E-mail semanal automatizado de forecast (`scripts/forecast-semanal.mjs`, cron sexta 13h) usa fórmula "Fechado no mês" divergente da que a tela mostra hoje — enviado sem supervisão a `comercial@atlasgr.com.br` e a outros destinatários; o card de KPI em texto do Forecast Semanal no navegador tem a mesma divergência (só o relatório visual/tendência foi corrigido) | 05 (fórmulas), 01 e 03 (duplicação estrutural Node/browser que causa isso) | `js/forecast.js:274-287,300-301` (corrigido) vs. `js/forecast.js:575-591,676` (não corrigido) vs. `scripts/forecast-semanal.mjs:271,289-292` (fórmula antiga); destinatários em `scripts/forecast-semanal.mjs:35-39` | Baixo/Médio (aplicar a mesma correção Financeiro/`MOVED_TIME` no card de KPI e no script Node, ou documentar formalmente por que ficam diferentes) |
| **ALTO** | Resolução de identidade de cliente (`CLIENTE_KEY`) reimplementada de forma divergente em pelo menos 3 arquivos (`jornada.js`, `catalogo-relatorios.js`, `sdr.js`); a variante mais fraca (`clientes_receita`) alimenta o KPI de concentração de receita/Top 10, que fica sujeito a subestimar concentração | 01 (achado inicial), 04 (confirmação com 3 variantes citadas), 05 (impacto no KPI de receita) | `js/jornada.js:864-901`; `js/catalogo-relatorios.js:250`; `js/sdr.js:285`; impacto em `js/config.js:312` (Top 10) | Médio (extrair função única `resolverClienteId`, ver P1 abaixo) |
| **ALTO** | Datas futuras/negativas clampeadas para `0` silenciosamente em 3 pontos, mascarando inconsistência de dado — inclusive dentro de `decisao_final_sdr`, que gera recomendação automática de recontato/escalonamento | 03 | `js/extrator.js:313-327`; `js/jornada.js:390-394`; `js/catalogo-relatorios.js:386` | Baixo/Médio (preservar valor anômalo em campo de auditoria + contador visível, em vez de `Math.max(0,...)` silencioso) |
| **ALTO** | Mínimo de 7 famílias de métricas com múltiplas fórmulas divergentes sob o mesmo nome na UI, sem qualificar coorte/base: Win Rate (3 fórmulas), Ticket Médio (4+ bases), Coverage (3 fórmulas), Forecast Total (2 metodologias de ponderação), Bucket Commit/Best Case/Pipeline/Upside (2 conjuntos de thresholds), Aging "parado" (3 thresholds diferentes: 45/30 fixo/30 editável), Data Quality Score (2 implementações não reconciliáveis) | 05 | Ver métricas 2-4, 9, 12-14, 17 do catálogo do Agente 05 | Arquitetural (ver Lacunas estruturais) — mitigação de curto prazo é rotular a coorte na UI |
| **ALTO** | Ausência de camada de staging/bronze persistente: nenhum snapshot histórico de dado bruto do Bitrix sobrevive além do cache de 5 min em `localStorage`, exceto o agregado semanal de forecast (só AtlasGR); impede auditoria retroativa e é pré-requisito bloqueante confirmado por evidência concreta (50+ dos 58 relatórios do catálogo-mestre do CPI não têm nenhuma base de dado hoje) | 01 (lacuna estrutural), 05 (evidência concreta do efeito: catálogo-mestre sem base) | `relatorios/forecast-semanal/historico.json` é o único artefato persistido; varredura de `js/*.js`+`scripts/*.mjs` sem termos de churn/NRR/LTV/cohort | Arquitetural |
| **ALTO** | Nenhum teste automatizado, validação de schema ou reconciliação entre fontes existe no repositório inteiro (nem para lógica de negócio, nem para detectar divergência Node↔browser) | 03 (achado direto), 01/02/05 (convergem ao descreverem duplicação sem alerta) | Busca por `describe(`/`assert(`/`expect(` sem resultados; `package.json` sem dependências de teste | Médio (suíte `node:test` para funções puras já identificadas: `probabilidadeFallbackForecast`, `classificarBucketForecast`, `taxaPct`, `cicloDealDias`, `mesclarSemDuplicarPorId`) |
| **ALTO** | Duplicação estrutural de regras de negócio (metas mensais, fallback de probabilidade, estágios "Piloto") entre navegador (`js/config.js`/`js/jornada.js`) e automação Node (`scripts/forecast-semanal.mjs`), sem módulo compartilhado e sem verificação automática de divergência | 01, 02, 03, 05 (convergência total dos 4 relatórios) | `js/config.js:335-341` vs. `scripts/forecast-semanal.mjs:91-94,165-168`; `js/jornada.js:455-464` vs. `scripts/forecast-semanal.mjs:75-84` | Médio (teste automatizado que compara as constantes dos dois lados a cada execução do cron, conforme já recomendado pelo Agente 03) |
| **MÉDIO** | 6 chaves de `localStorage` sem sufixo de empresa podem misturar dados AtlasGR/Total Trac no mesmo navegador (metas desdobradas, layout do Cockpit, filtros globais, tema, auditoria de sync, chave de API de IA) | 01 | `js/cockpit.js:1642,1663,1717,1722`; `js/ui.js:38,56,73,632-641,694` | Baixo (adicionar `marcaAtiva().sufixoStorage`, mesmo padrão já usado em `bitrix-api.js`/`jornada.js`) |
| **MÉDIO** | Segregação AtlasGR × Total Trac não é garantida por código em nenhuma camada: nada impede colar o webhook errado na página errada, nem confirma que os dois portais Bitrix são de fato contas distintas | 01 (localStorage), 04 (webhook/configuração, achado mais explícito) | `js/config.js:14-40`; ausência de qualquer campo `EMPRESA_GRUPO`/`PORTAL_ID` no dado extraído | Baixo/Médio (validação simples: checar que o domínio do webhook colado bate com o domínio esperado da marca antes de salvar) |
| **MÉDIO** | Escrita de volta no Bitrix (`crm.item.update`) habilitada sem controle de acesso de aplicação além de senha única por navegador; escopo de permissão do webhook (leitura vs. escrita) não verificado | 02 | `js/exportacoes.js:649-665`; `js/ui.js:540-624`; `js/auth.js` (senha única, sem papéis) | Baixo (confirmar escopo do webhook no Bitrix24; restringir a leitura se a intenção é só relatórios) |
| **MÉDIO** | Ofuscação do webhook salvo no navegador (XOR+base64 com chave fixa embutida no código público) não é proteção real — o próprio código reconhece isso em comentário | 02 | `js/bitrix-api.js:39` (`CHAVE_OFUSCACAO_WEBHOOK`), comentário linhas 24-38 | Baixo (aceitar como limitação documentada; não é corrigível sem backend) |
| **MÉDIO** | "Última atualização" do Cockpit é sempre carimbada com `new Date()` no momento da chamada, mesmo quando a resposta veio do cache de 5 min — comunica frescura que o dado pode não ter | 03 | `js/cockpit.js:311`; `js/bitrix-api.js:579-592` | Baixo (expor flag `_deCache` e ajustar o rótulo) |
| **MÉDIO** | Sem detecção de duplicidade de Leads (só Empresas e repetição de Negócios no mesmo funil); leads duplicados inflam KPIs de volume/conversão de SDR sem alerta | 03, 04 | `js/jornada.js:183-230`; `js/catalogo-relatorios.js:302-310` (só cobre empresas) | Médio (estender `construirSinaisDuplicidadeEmpresas` a Leads/Contatos) |
| **MÉDIO** | Ticket médio (Cockpit e Forecast) divide por contagem de negócios "Ganhos" sem excluir os que têm `OPPORTUNITY` ausente/zero, deflacionando a média silenciosamente — contraria o princípio "nunca 0 silencioso" já declarado no próprio código | 03 (achado), 05 (confirma como uma das 4+ bases divergentes de "Ticket Médio") | `js/cockpit.js:496,549,591,670`; princípio declarado em `js/cockpit.js:16-18` | Baixo (excluir do denominador ou expor contagem de excluídos) |
| **MÉDIO** | Nenhuma métrica do projeto (~25 catalogadas) tem "owner" definido em lugar nenhum — nem no código, nem em documentação | 05 (achado central do relatório) | Catálogo completo do Agente 05, seção "Owner: não definido" repetida em todas as 19 famílias de métrica | Arquitetural (decisão de governança, não de código) |
| **MÉDIO** | Configuração de funil/estágio (`CATEGORY_ID`/`STAGE_ID`) hardcoded em `ENTIDADES.negocios` é documentada como "da AtlasGR"; a Total Trac herda esses rótulos como fallback visual sem confirmação contra o Bitrix real dela | 02 | `js/config.js:45-71` | Médio (confirmar via API real da Total Trac quando houver acesso) |
| **MÉDIO** | Falha do cron semanal de forecast não gera nenhum alerta proativo — se falhar por webhook revogado, erro de rede ou SMTP, ninguém é notificado ativamente | 03 | `.github/workflows/forecast-semanal.yml`; `ALERTA_WEBHOOK_URL` só cobre desvio de meta, não falha técnica | Baixo (adicionar step de notificação em caso de falha do job) |
| **MÉDIO** | Conceitos Vendido → Faturado → Realizado → Recebido (exigidos pelo pacote de especificação) não existem como campos/etapas distintos no código — o projeto só distingue "negócio ganho" de "contrato assinado" | 05 | Ausência confirmada em `js/config.js`/`ENTIDADES`; nenhum campo de nota fiscal/execução/caixa mapeado | Arquitetural (decisão de modelagem de negócio antes de qualquer implementação) |
| **MÉDIO** | Ausência de CNPJ (ou qualquer identificador fiscal) como sinal de match na resolução de entidade — nome/e-mail/telefone são sinais fracos para empresas B2B com múltiplas filiais/CNPJs | 04 | Nenhuma ocorrência de "CNPJ" em `js/*`; `construirSinaisDuplicidadeEmpresas`, `js/jornada.js:183-230` | Médio (depende de confirmar campo no Bitrix real — Agente 02/dados) |
| **MÉDIO** | N+1 de performance em `crm.deal.productrows.get` (uma chamada HTTP por negócio) — risco de timeout/`QUERY_LIMIT_EXCEEDED` em bases grandes | 02 | `js/extrator.js:441`; `js/cockpit.js:247` | Médio (avaliar `batch.json` do Bitrix ou paralelismo controlado) |
| **BAIXO** | Fuso horário hardcoded `-03:00` em todos os filtros de data, não derivado da conta Bitrix real | 03 | `js/extrator.js:171-172`; `js/bitrix-api.js:350-351` | Baixo (assunção razoável hoje; documentar como decisão consciente) |
| **BAIXO** | `CATEGORY_ID=0` hardcoded como funil "Comercial" em múltiplos pontos — renumeração no Bitrix quebraria filtros silenciosamente | 03 | `AUDITORIA_ESTADO_ATUAL.md` seção 15; uso em `baseDealsCatalogo(webhook, true)` | Baixo (adicionar checagem/alerta se a categoria não for encontrada por ID) |
| **BAIXO** | `metaMensalPadrao` retorna `0` silenciosamente para meses fora da tabela hardcoded, sem "ano de vigência"; duplicada em 2 arquivos | 01, 03, 05 (os três citam o mesmo achado por ângulos diferentes) | `js/config.js:335-342`; réplica em `scripts/forecast-semanal.mjs` | Baixo (mover para configuração externa + aviso explícito na UI) |
| **BAIXO** | Total Trac não tem automação de histórico equivalente ao forecast semanal da AtlasGR (nenhum `historico.json`, nenhum cron) | 01, 02 | Ausência confirmada em `scripts/forecast-semanal.mjs` e `.github/workflows/` | Médio (replicar automação para Total Trac quando fizer sentido de negócio) |
| **BAIXO** | Sem validação de sanidade de datas extremas no filtro de período (`validarPeriodo` só valida `inicio > fim`) | 03 | `js/bitrix-api.js:538-545` | Baixo |
| **Informativo (mitigação já existente, não risco)** | Deduplicação por `ID` na paginação, reconciliação de contagem vs. `total` do Bitrix, tratamento correto de `COMPANY_ID=0`, dois relatórios dedicados de completude (`qualidade_crm`, `auditoria_sdr`), princípio "nunca 0 silencioso" já declarado (mesmo que nem sempre seguido) | 01, 02, 03 | `js/bitrix-api.js:386-401`; `js/jornada.js:257,875`; `js/catalogo-relatorios.js:329-376`; `js/cockpit.js:16-18` | — |

## Gate da Wave 1 (Sprint 00/01): NÃO PASSA

O gate declarado em `SPRINT_00_DESCOBERTA_E_INVENT_RIO_TOTAL.txt` e
`SPRINT_01_DATA_TRUST_FOUNDATION.txt` é idêntico nos dois documentos: **"Não
avançar com erro de cálculo conhecido, divergência não explicada, dado
fictício, permissão incorreta ou regressão crítica."** Cruzando esse
critério com os achados da Wave 1:

- **Erro de cálculo conhecido**: sim, e mais de um. Ticket médio deflacionado
  por `OPPORTUNITY=0` no denominador (achado 03); dias parados clampeados
  para 0 mascarando inconsistência (achado 03); `metaMensalPadrao` retornando
  R$ 0,00 silenciosamente (achados 01/03/05).
- **Divergência não explicada**: sim. "Fechado no mês" tem 4 variantes ativas
  simultaneamente, e a divergência entre o card de KPI de texto e o e-mail
  semanal **não é uma decisão documentada** — é uma correção que foi feita
  parcialmente (só no relatório visual) e nunca propagada, segundo o próprio
  Agente 05. Win Rate (3 fórmulas) e Ticket Médio (4+ bases) sob o mesmo
  nome, sem qualificação de coorte na tela, também se enquadram como
  divergência não explicada ao usuário final.
- **Dado fictício**: não encontrado nos 5 relatórios — não há evidência de
  dado inventado; os relatórios são consistentes em nunca inferir números
  ausentes (o princípio "nunca 0 silencioso" é intenção real, mesmo que
  nem sempre seguida na prática).
- **Permissão incorreta**: parcialmente sim — o webhook exposto publicamente
  permite, em tese, que qualquer pessoa com acesso ao site publicado leia
  (e possivelmente escreva, escopo não confirmado) no CRM de produção sem
  nenhum controle de acesso além de conhecer a URL; a segregação AtlasGR ×
  Total Trac não é garantida por código.
- **Regressão crítica que bloqueia avanço**: a exposição do webhook em texto
  puro versionado e publicado é, por si só, um incidente de segurança ativo
  — não uma regressão de funcionalidade, mas bloqueia qualquer decisão
  responsável de "abrir mais o repositório" ou dar mais acesso a
  colaboradores/agentes até ser corrigida.

**Veredito**: o gate do Sprint 00/01 **não passa**. A Wave 1 cumpriu muito
bem seu objetivo de descoberta e inventário (é exatamente o que o Sprint 00
pede) e já produz boa parte do "Data Trust Score" que o Sprint 01 pede
conceitualmente — mas o próprio ato de descobrir revelou dois problemas
ativos em produção (credencial exposta, e-mail de forecast com número
incorreto) e uma divergência de cálculo não explicada ao usuário, que o gate
existe exatamente para capturar antes de avançar. Isso não significa que a
Wave 1 falhou — significa que ela funcionou: o gate está fazendo o que
deveria, sinalizando que não se deve avançar direto para Sprint 3+ (produto
executivo, domínios) sem antes fechar essas pendências.

## Correções de produção recomendadas (independentes do CPI)

Estas seis correções valem a pena independentemente do programa Intelligence
Hub — são bugs/riscos reais e ativos, não lacunas de arquitetura futura.
Ordenadas por severidade/urgência:

1. **Revogar e regenerar o webhook Bitrix da AtlasGR; remover o valor
   literal dos 7 arquivos que o contêm.** Esforço: **baixo**. Ação concreta:
   gerar novo webhook no Bitrix24 (escopo mínimo necessário — confirmar se
   precisa de escrita ou só leitura); substituir em
   `js/bitrix-api.js:7`, `scripts/forecast-semanal.mjs:29` (usar
   `BITRIX_WEBHOOK_URL` como Secret do GitHub Actions, sem fallback
   hardcoded) e nos 5 HTMLs (`extracao.html`, `forecast.html`, `home.html`,
   `cockpit.html`, `sdr.html`) por campo vazio + instrução de colar (mesmo
   padrão já usado para Total Trac). Verificar também se o repositório
   precisa ser tornado privado ou se o histórico de commits precisa ter a
   credencial expurgada (o Git guarda histórico — trocar o valor no HEAD não
   remove do histórico; avaliar `git filter-repo` ou aceitar que o valor
   antigo já está definitivamente comprometido e só importa revogá-lo no
   Bitrix).
2. **Corrigir a divergência de fórmula do e-mail semanal de forecast
   (`scripts/forecast-semanal.mjs`) e do card de KPI de texto
   (`js/forecast.js:676`).** Esforço: **baixo/médio**. Ação concreta: aplicar
   ao script Node e ao card de texto a mesma correção Financeiro/`MOVED_TIME`
   já aplicada ao relatório visual (`js/forecast.js:274-287`), ou, se a
   equipe decidir que as duas fórmulas medem coisas legitimamente diferentes
   (funil Comercial fechado vs. funil Financeiro/contrato assinado),
   renomear os rótulos na tela e no e-mail para deixar isso explícito em vez
   de ambos se chamarem "Fechado no mês".
3. **Adicionar sufixo de empresa às 6 chaves de `localStorage` hoje
   compartilhadas entre AtlasGR e Total Trac.** Esforço: **baixo**. Mesmo
   padrão já usado em `bitrix-api.js`/`jornada.js`
   (`marcaAtiva().sufixoStorage`) aplicado a
   `atlas-metas-desdobradas`, `atlas-layout-ordem`, `atlas-filtros-globais`,
   `atlas-extrator-tema`, `atlas-extrator-auditoria-sync`,
   `atlas-extrator-chave-ia`.
4. **Corrigir o clamp silencioso de dias negativos/futuros em 3 pontos.**
   Esforço: **baixo/médio**. `js/extrator.js:313-327`,
   `js/jornada.js:390-394`, `js/catalogo-relatorios.js:386` — preservar o
   valor anômalo em um campo de auditoria e contá-lo visivelmente, em vez de
   `Math.max(0, ...)` silencioso; prioridade alta porque
   `decisao_final_sdr` usa esse valor para decidir recontato/escalonamento.
5. **Excluir (ou sinalizar) negócios "Ganhos" com `OPPORTUNITY` ausente/zero
   do denominador de ticket médio.** Esforço: **baixo**.
   `js/cockpit.js:496,549,591,670` — ou ao menos expor a contagem de quantos
   negócios entraram com valor zero, para não ler o número como puro sem
   essa ressalva.
6. **Marcar visualmente quando o Cockpit está servindo dado de cache (até 5
   min).** Esforço: **baixo**. Expor um flag `_deCache` em
   `bitrixFetchComRetentativa` (`js/bitrix-api.js:579-592`) e ajustar o
   rótulo "Última atualização" em `js/cockpit.js:311`.

## Lacunas estruturais do programa CPI (dependem de arquitetura/investimento)

Estas não são bugs — são a distância real entre o que existe hoje e o que o
Intelligence Hub pede. Nenhuma se resolve com um fix pontual de código:

1. **Camada de staging/bronze persistente inexistente.** Hoje só existe o
   agregado semanal de forecast da AtlasGR
   (`relatorios/forecast-semanal/historico.json`). É pré-requisito
   bloqueante confirmado por evidência concreta (Sprint 02, e todos os
   Sprints 14-20 de inteligência avançada dependem de histórico real).
   Proposta já desenhada pelo Agente 01: estender o padrão GitHub Actions +
   JSON versionado (já validado para forecast) a negócios/leads brutos das
   duas empresas.
2. **`MASTER_ENTITY_ID` não persistido e implementado de forma divergente em
   3 módulos.** A heurística de `jornada.js` é um bom ponto de partida
   conceitual (o Agente 04 já propõe extrair para
   `js/entity-resolution.js`, adotar o vocabulário do CPI —
   `source_record_ids[]`, `match_rules[]` como lista, `manual_review_required`
   — e persistir via o mesmo padrão de automação GitHub Actions), mas exige
   decisão de arquitetura sobre onde/como persistir entre sessões, e decisão
   de produto sobre nunca fundir automaticamente (princípio que os 5
   relatórios concordam em preservar).
3. **Catálogo oficial de métricas com owner, coorte e versão inexistente.**
   O Agente 05 já produziu a semente (catálogo de ~25 métricas com fórmula e
   fonte), mas falta: owner por métrica/família, formalização das 4 métricas
   Vendido→Faturado→Realizado→Recebido (que hoje não existem como conceitos
   distintos no código), ratificação ou descarte formal dos thresholds hoje
   marcados no próprio código como "não validados com a diretoria" (coverage
   2x/3x, aging 45 dias, "Pipeline necessário = Meta÷WinRate").
4. **Contrato de dados formal por campo inexistente.** `ENTIDADES` documenta
   rótulo e uso, mas não tipo, obrigatoriedade, unidade, SLA de atualização
   nem owner de dado — risco de "schema drift" silencioso se o Bitrix mudar
   `STAGE_ID`/`CATEGORY_ID`.
5. **Duplicação estrutural navegador↔Node sem módulo compartilhado.** Causa
   raiz de pelo menos duas das correções de produção acima (item 2 e a
   duplicação de metas/fallback de probabilidade); resolver definitivamente
   exige decisão de arquitetura (bundler/módulo ES vs. aceitar que o modo
   `file://` deixe de ser suportado), não um fix pontual.
6. **Vendido/Faturado/Realizado/Recebido sem mapeamento para campos/etapas
   Bitrix reais.** Decisão de modelagem de negócio, pré-requisito para os
   relatórios 01-04 do catálogo-mestre e para o Sprint 06 (Financial
   Intelligence)/Agente 13 (Revenue Recognition Analyst).
7. **Ausência de controle de acesso por perfil dentro de uma mesma empresa**
   (só senha única por marca, sem papéis/permissões) — requisito de produto
   explícito do princípio 12 do próprio pacote CPI ("Segurança, RLS,
   segregação por perfil e auditabilidade são requisitos de produto").
8. **50+ dos 58 relatórios do catálogo-mestre não têm nenhuma base de dado**
   (Growth, NRR/GRR, LTV, Cohort, Churn, Revenue at Risk, Early Warning,
   What-if Simulator, Customer 360 etc.) — qualquer sprint que assuma que "o
   dado já existe, só falta o relatório" vai travar em uma pré-condição não
   atendida.

## Plano da Wave 2

O princípio orientador é o próprio `99_ORDEM_E_DEPENDENCIAS.txt`: Sprint 3
(produto executivo) e os domínios 4-13 só devem avançar "após a base
mínima" — e a Wave 1 acabou de mostrar que essa base mínima **não está
pronta** (gate não passa). Portanto a Wave 2 não deveria pular para agentes
de domínio (Commercial, Pipeline, Forecast, SDR, Marketing, Financial...) —
deveria **fechar o Sprint 01 (Data Trust Foundation) e avançar o Sprint 02
(Modelo Corporativo de Dados)**, usando exatamente os pontos de partida que
os Agentes 01, 04 e 05 já deixaram prontos.

**Wave 2.0 — correções de produção (paralelo, começa imediatamente)**
Não depende de nenhuma decisão de arquitetura; ver seção anterior. Pode
rodar em paralelo com o resto da Wave 2 sem bloquear nada.

**Wave 2.1 — fechar Sprint 01 (Data Trust Foundation)**
1. Agente 03 (Data Quality Guardian) revisita, agora com as recomendações já
   priorizadas, para formalizar um Data Trust Score mínimo por entidade
   (completude + consistência + atualidade), usando `qualidade_crm` e
   `auditoria_sdr` como semente.
2. Agente 05 (Metrics Governance) formaliza o catálogo oficial: nomear
   métricas por coorte (não rótulo genérico), definir owners interinos por
   família, e decidir formalmente o destino de cada threshold hoje marcado
   como "não validado".
3. Um agente de QA/Testes (função ainda não nomeada nos 04_AGENTES, mas
   citada como dependência pelo Agente 03) implementa a primeira suíte
   `node:test` para as funções puras já identificadas e um teste de
   reconciliação Node↔browser.
4. Resolver a divergência ativa "Fechado no mês" (já coberta em Wave 2.0,
   mas é também o critério de saída do gate de Sprint 01 — sem ela resolvida,
   o Sprint 01 não pode ser declarado concluído).

**Wave 2.2 — avançar Sprint 02 (Modelo Corporativo de Dados)**
5. Agente 01 (Enterprise Data Architect) formaliza a Camada 1 (staging)
   proposta em seu próprio relatório: estender o padrão
   GitHub Actions + JSON versionado a negócios/leads brutos.
6. Agente 04 (Entity Resolution Specialist) extrai `resolverClienteId` para
   módulo compartilhado, formaliza o esquema `MASTER_ENTITY_ID` no
   vocabulário do CPI, e roda a persistência via o mesmo padrão de
   automação (`relatorios/entity-resolution/master-entities.json`).
7. Agente 02 (Bitrix Discovery), com acesso real à API Bitrix24 (que nenhum
   agente teve nesta wave), confirma: lista completa de `UF_CRM_*` (inclusive
   possível CNPJ), estrutura real de categoria/estágio da Total Trac, e se o
   escopo do webhook (já rotacionado na Wave 2.0) é só leitura.
8. Agentes de governança/rastreabilidade cujo mandato já é exatamente o que
   a Wave 1 encontrou faltando — ainda que numerados "à frente" no programa
   — fazem sentido entrar já nesta wave, não esperar pelos domínios: Agente
   57 (Data Lineage Auditor), Agente 68 (Semantic Layer Guardian) e Agente
   45 (Evidence Traceability Agent) podem trabalhar em paralelo com 01/04/05
   formalizando lineage e camada semântica sobre o que estiver sendo
   construído, em vez de essa formalização ser feita depois, por cima de
   domínios já implementados.

**Só depois disso** — Sprint 3 (Executive Command Center) e os domínios 4-13
(Revenue, Commercial, Pipeline, Forecast, Financial, Customer, Marketing,
Implementation, Support, Technology, Product, People/Capacity) deveriam
começar, porque só a partir daí eles têm uma base mínima de dados confiável,
uma chave de cliente única e um catálogo de métricas com owner para
consumir.

## Agentes desbloqueados x bloqueados (06-70)

**Aviso de confiança**: `99_ORDEM_E_DEPENDENCIAS.txt` só declara a ordem por
número de sprint (0→1→2→3→domínios 4-13 em paralelo→14-20 avançados); não
existe no repositório uma tabela explícita "agente N pertence ao sprint M".
O mapeamento abaixo é **inferência desta síntese**, feita casando o nome de
cada um dos 71 agentes (`04_AGENTES/AGENTE_NN_*.txt`) com o nome/objetivo de
cada sprint (`03_SPRINTS/SPRINT_NN_*.txt`) — é razoável e consistente com a
numeração sequencial observada, mas não é um fato documentado; deveria ser
confirmado formalmente (por exemplo pelo próprio Agente 00 em uma wave de
governança, ou por quem definiu originalmente os 71 agentes).

**Bloqueados hoje — dependem da Wave 2 fechar Sprint 01/02 (base mínima
ainda não pronta, gate da Wave 1 não passou):**
- **Agentes 06-22** (domínios: Commercial, Pipeline, Forecast, Seller
  Performance, SDR, Marketing, Financial, Revenue Recognition, Customer,
  Churn/Retention, Expansion, Implementation, Support, Technology, Product,
  Innovation, Workforce/Capacity) — mapeiam aos Sprints 4-13, que segundo
  `99_ORDEM_E_DEPENDENCIAS.txt` avançam "em paralelo após a base mínima". A
  base mínima (staging, MASTER_ENTITY_ID, catálogo de métricas) não existe
  ainda. Bloqueados até Wave 2.2 fechar.
- **Agentes 23-41 e 51-56** (Growth, Cohort, Ticket Intelligence, Lifecycle,
  LTV, Early Warning, Deterioration Detection, Anomaly Detection, Enterprise
  Risk, Opportunity Detection, Predictive Intelligence, Scenario Simulator,
  Statistical Validation, Root Cause, Cross-Department, Next Best Action,
  Executive Advisor/Narrative; Revenue Leakage, Deal Risk, Customer Health,
  Pricing, Concentration Risk, Seasonality) — mapeiam aos Sprints 14-20, que
  o próprio `99_ORDEM_E_DEPENDENCIAS.txt` já condiciona explicitamente a
  "histórico e definições estáveis" (Sprint 14), "KPIs confiáveis" (Sprint
  15), "séries com qualidade" (Sprint 16), "sinais de múltiplas áreas"
  (Sprint 17), "Customer/Product/Commercial" (Sprint 18), "modelos e
  fórmulas versionadas" (Sprint 19) e "camada semântica, evidências e
  políticas de IA" (Sprint 20) — nenhuma dessas pré-condições existe hoje.
  Mais bloqueados que os agentes 06-22, não menos.
- **Agente 50** (Marcelo Intelligence Layer) — nome sugere camada
  personalizada de inteligência sobre as demais; bloqueado pelas mesmas
  pré-condições dos agentes 23-41.

**Parcialmente desbloqueáveis já na Wave 2 (mandato coincide com o que a
Wave 1 encontrou faltando — recomenda-se antecipar, não esperar):**
- **Agente 44** (Access Governance) — a Wave 1 já encontrou ausência de
  controle de acesso por perfil e escrita no CRM sem controle de aplicação;
  pode começar a desenhar isso em paralelo à Wave 2.0/2.1.
- **Agente 45** (Evidence Traceability Agent), **Agente 57** (Data Lineage
  Auditor), **Agente 68** (Semantic Layer Guardian) — mandato é formalizar
  exatamente a rastreabilidade/lineage/camada semântica que falta hoje;
  fazem mais sentido trabalhando junto com 01/04/05 na Wave 2.2 do que
  esperando os domínios existirem.
- **Agente 58** (Metric Drift Monitor) — poderia nascer já como o mecanismo
  de reconciliação Node↔browser recomendado pelos Agentes 01/03/05.
- **Agente 47** (AI QA Hallucination Guard) e **Agente 69** (Data Privacy
  Agent) — nenhum uso de IA generativa foi encontrado nos 5 relatórios desta
  wave além de uma chave de API opcional (`atlas-extrator-chave-ia`,
  Agente 01); baixo risco imediato, mas o Agente 69 é relevante para revisar
  a exposição de PII (telefone/e-mail de contatos/leads) já mapeada pelos
  Agentes 02/04.
- **Agente 70** (Release Gate Orchestrator) — poderia formalizar,
  já agora, o próprio gate que este documento aplicou manualmente (Sprint
  00/01), para que as próximas waves tenham um checklist executável em vez
  de uma análise manual por wave.

**Seguem bloqueados até então (dependem de artefatos que a Wave 2 ainda vai
produzir):** Agentes 42/43 (UX/Navegação) e 46 (BI QA) fazem mais sentido
depois que existir um Executive Command Center (Sprint 3) para desenhar
UX/navegação e QA de BI sobre — hoje não há "produto" para revisar UX além
das páginas já existentes. Agentes 59-67 (Forecast Accuracy Auditor, Alert
Fatigue Governor, Management Meeting Copilot, Board Pack Generator, KPI
Dependency Mapper, Opportunity Cost Analyst, Benchmark Internal,
Experimentation, Feedback Learning) dependem de haver histórico/KPIs/alertas
já em produção para auditar, comparar ou gerar copiloto sobre — nenhum
existe ainda de forma confiável.

## Riscos remanescentes

- **Confirmação com dados reais do Bitrix ainda pendente.** Nenhum dos 5
  agentes da Wave 1 teve acesso à API Bitrix24 real (nem AtlasGR nem Total
  Trac). Volume real de duplicidades, completude real de `OPPORTUNITY`/
  `SOURCE_ID`, existência de CNPJ como campo customizado, estrutura real de
  funil da Total Trac — tudo isso continua "não verificável" e deveria ser o
  primeiro passo prático da Wave 2.2 assim que houver acesso.
- **Risco de o webhook exposto já ter sido usado por terceiros.** Como o
  valor está em texto puro há tempo indeterminado em um repositório
  possivelmente público, a correção (revogar/regenerar) trata o sintoma daqui
  para frente, mas não descarta uso indevido já ocorrido — recomenda-se, ao
  regenerar, também revisar o log de atividade do Bitrix24 (se disponível)
  por acessos anômalos no período em que o webhook esteve exposto.
- **Risco de a correção do e-mail semanal introduzir uma nova divergência.**
  Ao unificar a fórmula de "Fechado no mês" entre card de texto, relatório
  visual e script Node, existe risco de o número mudar de uma sexta-feira
  para a outra sem aviso à diretoria — recomenda-se comunicar a mudança de
  metodologia junto com a correção, não silenciosamente.
- **Risco de a Wave 2 repetir o mesmo padrão de silo que motivou o Agente
  00.** Os 5 relatórios da Wave 1 já convergiram bem entre si porque cada
  agente citou e cruzou os achados dos outros — a Wave 2 deveria manter essa
  disciplina de leitura cruzada, especialmente entre Agente 01 (staging) e
  Agente 04 (entity resolution), que propõem o mesmo padrão de persistência
  (GitHub Actions + JSON versionado) e deveriam ser implementados como uma
  única automação, não duas.
- **Mapeamento agente↔sprint não confirmado.** Como registrado na seção
  anterior, a tabela de bloqueio 06-70 é inferência desta síntese, não fato
  documentado — se a numeração real dos 71 agentes seguir uma lógica
  diferente da inferida aqui, o plano de desbloqueio precisa ser revisado.

## Confiança e limitações

- **Alta confiança**: a tabela de riscos consolidada e o cruzamento entre
  achados dos 5 agentes (seção "Resumo executivo", itens 1-6) — cada
  afirmação remete a uma citação de arquivo/linha já verificada por pelo
  menos um dos 5 relatórios da Wave 1, e os pontos de maior impacto (webhook
  exposto, divergência do e-mail de forecast, 3 variantes de chave de
  cliente) foram re-verificados nesta síntese por leitura direta do código
  (`grep` pelo valor literal do webhook, confirmação de `pages.yml` e do
  remote do repositório).
- **Média confiança**: o veredito do gate (não passa) é uma aplicação direta
  do critério textual do Sprint 00/01 aos achados da Wave 1 — a lógica é
  direta, mas "gate passa/não passa" é, em última instância, uma decisão de
  produto/negócio que caberia a um humano ratificar formalmente, não apenas
  a este agente.
- **Baixa confiança / inferência explícita**: o mapeamento de quais dos 65
  agentes (06-70) ficam bloqueados por qual sprint é uma inferência baseada
  em nomes, não em uma tabela documentada no repositório — sinalizado
  explicitamente na seção correspondente.
- **Não verificado nesta síntese**: nenhum dado real do Bitrix24 (volumes,
  completude efetiva, se o webhook exposto continua ativo, se o repositório
  GitHub é de fato público sem exceção) — todos os 5 relatórios da Wave 1 já
  marcam esses pontos como não verificáveis sem acesso à API real, e esta
  síntese não teve esse acesso também. A única verificação de infraestrutura
  feita aqui foi ao nível de código/configuração local (git remote,
  workflow do GitHub Pages, grep pelo valor literal do webhook nos arquivos
  do repositório), não ao nível da API Bitrix24 ou da visibilidade real do
  repositório no GitHub.
