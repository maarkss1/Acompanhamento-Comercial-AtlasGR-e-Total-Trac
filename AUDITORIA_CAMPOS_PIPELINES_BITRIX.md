# Auditoria de Campos, Funis e Pipelines — Bitrix24 AtlasGR

**Data:** 03/09/2026
**Método:** inspeção ao vivo via API do Bitrix (webhook AtlasGR, só leitura — `crm.category.list`, `crm.status.list`, `crm.deal.fields`, `crm.deal.userfield.list`, `crm.lead.fields`, `crm.company.fields`, `crm.contact.fields`, mais amostragem de negócios/leads recentes para medir preenchimento real).
**Objetivo:** mapear o que existe hoje no CRM (funis, estágios, campos customizados) e apontar o que falta — tanto no Bitrix (campos/estágios a criar ou corrigir) quanto na ferramenta (relatórios que já poderiam usar dado que já existe e não usam).

Este documento é um retrato do momento da inspeção — o Bitrix muda com o tempo (novos campos, novos estágios). Revalidar antes de confiar cegamente nele daqui a alguns meses.

---

## 1. Funis (pipelines) — mapa completo

13 funis de negócio (`crm.category.list`, `entityTypeId=2`) hoje na conta:

| ID | Nome | Estágios | Uso já coberto pela ferramenta |
|----|------|----------|-------------------------------|
| 0  | Comercial | 6 | Sim — Forecast, Cockpit, Jornada, todo o catálogo |
| 20 | Financeiro | 10 | Sim — Cockpit (Resultado do Mês), Forecast, e agora [Acompanhamento do Pipeline Financeiro](acompanhamento-financeiro.html) (Análise de Documentos / Aguardando Assinatura) |
| 3  | Implantação | 7 | Parcial — relatório "Implantação, Onboarding e Pós-Venda" |
| 48 | Implantação Logística | 12 | Parcial — mesmo relatório acima, mas não diferencia deste funil especificamente |
| 50 | Perfil Securitário | 6 | Não tem relatório dedicado — aparece só nos relatórios genéricos "qualquer funil" (Jornada, Clientes Parados) |
| 46 | **Sucesso do Cliente** | 7 | **Não tem relatório dedicado** — existe de verdade no Bitrix, mas hoje só aparece nos relatórios genéricos |
| 5  | Pós-Vendas | 11 | Parcial — mesmo relatório de Implantação/Pós-Venda. **Ver problema grave abaixo.** |
| 32 | T.I | 7 | Excluído da Jornada (classificado como "interno") |
| 8  | RH | 6 | Excluído da Jornada (classificado como "interno") |
| 44 | Financeiro - Reembolsos | 6 | Excluído da Jornada (classificado como "interno") |
| 42 | Área de Teste | 9 | Excluído da Jornada (classificado como "interno") — e o próprio Bitrix já rotula como dado de teste |
| 30 | Negócios Perdidos | 3 | Tratado como arquivo histórico |
| 56 | Chamados SC | 9 | Não tem relatório dedicado |

**Não existe** nenhum funil chamado "Closer e Account" ou equivalente — se isso é um pipeline real, ele ainda não foi criado no Bitrix (ou está descrito com outro nome). Por isso o card "Closer e Account" na Home ficou como "em construção": não dá para inventar um relatório sem saber de onde tirar o dado. Assim que você mapear isso, me diga qual funil/estágio corresponde (ou se precisa ser criado do zero no Bitrix).

**"Sucesso do Cliente" já existe de verdade** (funil 46, 7 estágios, nomes fazem sentido: Onboarding → Apresentação Realizada → 1ª/2ª/3ª Etapa → Negócios Concluído/Cancelado). Card na Home pode virar relatório real assim que você confirmar o que quer medir ali (aging por etapa? volume por CS responsável?).

### 1.1 Problema grave encontrado — Pipeline 5 "Pós-Vendas"

Os nomes dos estágios deste funil não fazem sentido como pipeline de vendas — parecem ter sido reaproveitados para outra finalidade (roteamento por carteira/pessoa?), o que quebra qualquer cálculo de Win Rate/ganho-perda automático baseado em semântica:

```
C5:NEW         Designar Pós-Venda        (process)
C5:2           Sucesso do Cliente        (process)
C5:WON         Cancelamento              (success)   <- "Cancelamento" marcado como GANHO
C5:LOSE        Lorena Bueno              (failure)   <- nome de pessoa como PERDA
C5:UC_NDRZLS   Valdir Fernandes          (apology)   <- nome de pessoa
C5:UC_6ALC45   Carteira D                (apology)
C5:UC_UC4NGL   Carteira E                (apology)
C5:UC_7CWYEI   Apenas Jornada            (apology)
C5:UC_7OTXOG   Apenas Sistemas           (apology)
C5:UC_J8PABJ   Apenas Cadastro e Consulta (apology)
C5:UC_1J3WHL   Pedido de Cancelamento    (apology)
```

Isso quer dizer: **hoje, qualquer relatório "todo funil" que use a semântica padrão (ganho/perda) para o Pós-Vendas vai mostrar número sem sentido** — "Cancelamento" contando como sucesso, nomes de pessoa aparecendo como motivo de perda. A ferramenta atualmente não exclui este funil dos relatórios cross-pipeline (só exclui T.I/RH/Financeiro-Reembolsos/Área de Teste). Duas saídas possíveis, sua escolha:
- **Corrigir no Bitrix**: renomear os estágios do Pós-Vendas para nomes reais de etapa (o que esse pipeline de fato controla?) e ajustar qual estágio é sucesso/falha de verdade.
- **Ou**: se esse pipeline é usado como "roteamento por responsável" e não como funil de vendas de verdade, me avisa que eu excluo ele dos relatórios de ganho/perda cross-pipeline (mesmo tratamento que T.I/RH já recebem).

### 1.2 Outro problema — Pipeline 32 "T.I"

Semântica invertida: `C32:WON` (marcado sucesso) = "Projeto Cancelado"; `C32:LOSE` (marcado falha) = "Montar Projeto Técnico" (soa como etapa em andamento, não perda). Este funil já está excluído dos relatórios cross-pipeline da ferramenta, então não quebra nada hoje — só fica registrado aqui caso algum dia vocês queiram relatório dedicado de T.I.

### 1.3 Nomes de estágio duplicados/confusos (menor gravidade)

- Pipeline 30 (Negócios Perdidos): `C30:WON` e `C30:LOSE` têm o **mesmo nome** ("Negócios Fechados") — sucesso e falha com rótulo idêntico.
- Pipeline 42 (Área de Teste): `C42:LOSE` = "Pagamento Realizado" (soa como sucesso). Baixa prioridade — o próprio Bitrix já marca esse funil como "dado de teste, não recomendado".

---

## 2. Campos customizados — visão geral

| Entidade | Campos totais | Customizados (UF_CRM_*) |
|----------|---------------|--------------------------|
| Negócio (Deal) | 385 | 334 |
| Lead | 108 | 49 |
| Empresa (Company) | 75 | 18 |
| Contato (Contact) | 84 | 34 |

A esmagadora maioria dos 334 campos de Negócio é formulário operacional específico de um funil (Implantação Logística, Perfil Securitário, questionários de diagnóstico, dados de veículo/frota, WhatsApp/Vibra etc.) — não é "campo de relatório comercial", é coleta de dado operacional daquele pipeline. Isso é normal e não é problema; só explica o número alto.

### 2.1 Campos duplicados encontrados

*Correção: a primeira versão desta seção media o preenchimento errado — o Bitrix devolve o valor `false` (booleano) para campo de lista vazio, e meu script inicial contava isso como "preenchido". Corrigido e remedido em cima de negócios **realmente perdidos** (`STAGE_ID=LOSE`), não nos mais recentes (que são, na maioria, negócios ainda abertos). Números abaixo já estão corretos.*

| Campo | Preenchimento real (negócios perdidos, funil Comercial) |
|---|---|
| `UF_CRM_1582845737741` "Motivo da Negociação Perdida **(N)**" | 45% (68/150) |
| `UF_CRM_6908AECC40696` "Motivo da Negociação Perdida" (sem "(N)") | 45% (67/150) |

Estes dois **não são** um "ativo" e um "abandonado" — são dois campos com listas de opção diferentes, os dois em uso real e paralelo pelo time (provavelmente aparecem em telas/fluxos diferentes do Bitrix, ou vendedores diferentes usam um ou outro). Nos 150 negócios perdidos amostrados: 57 têm os dois preenchidos, 11 só o novo, 10 só o antigo, 72 nenhum — somando os dois, ~52% dos negócios perdidos têm algum motivo registrado, 48% não têm nenhum. Por isso o relatório "Motivos de Ganho e Perda" (seção 3) agora consulta os **dois** campos, preferindo o mais novo e caindo para o antigo quando só ele estiver preenchido — cobre mais casos do que confiar em só um.

**Recomendação Bitrix**: os dois campos claramente competem entre si e fragmentam o dado. Decidir com o time comercial qual lista de motivos é a "oficial" (ou juntar as duas listas em um único campo) e migrar/desativar o outro — assim o relatório passa a ter uma fonte só e o preenchimento (hoje ~52%) fica mais fácil de cobrar/melhorar.

Outros campos com duplicidade clara de nome, sem risco imediato (não usados em nenhum relatório hoje), mas que valem uma limpeza:

- Existe ainda um 3º campo de motivo de perda, mas no **Contato** (`UF_CRM_66D0E99239057`), não no Negócio.
- **Origem**: dos 3 campos "Origem" no Negócio, só `UF_CRM_6855C08ACB72B` está em uso real (86% preenchido numa amostra de negócios recentes); `UF_CRM_1690414835062` e `UF_CRM_6977620C2978B` estão vazios (0%). Isso não afeta a ferramenta hoje — os relatórios de origem já existentes usam o campo de sistema `SOURCE_ID`, não estes customizados — mas vale saber qual desses 3 é o "oficial" antes de qualquer relatório novo se basear neles.
- Dois campos "Temperatura da Negociação" quase idênticos (`UF_CRM_1787943569540` e `UF_CRM_1770227972151`), preenchimento baixo (0%/11% em negócios perdidos).
- Dois campos "PGR" (`UF_CRM_1648298835` e `UF_CRM_1742934067721`).
- Três campos sem nome próprio, só "Nova lista" (`UF_CRM_1763046910772`, `UF_CRM_1785956548318`, `UF_CRM_1785980865848`).
- Dois campos "Horizonte de Decisão", dois "Nível de autoridade".
- "Contrato de Prestação de Serviço - Atlas GR (N)" existe em **dois** códigos diferentes (`UF_CRM_1678719203215` e `UF_CRM_1753472054187`).

**Recomendação Bitrix**: pedir para quem administra a conta consolidar/arquivar os campos duplicados listados acima — reduz o catálogo de 334 para um número bem menor e evita erro de "qual desses eu uso" no futuro (foi exatamente esse tipo de erro — usar o campo errado — que a ferramenta tinha, ver seção 3).

### 2.2 Campos com potencial de relatório, mas hoje praticamente vazios

Existem no Bitrix, o time simplesmente não preenche ainda — não são candidatos a relatório até isso mudar (senão o relatório fica com dado quase todo "não informado"):

- Negócio: "Principal Concorrente" (0%), "Principal Objeção" (0%), "Fase do negócio" (0%)
- Lead: "Temperatura do Lead" (0%), "Horizonte de Decisão" (0%), "Nível de autoridade" (0%), "Motivo de desqualificação" (4%)

Se o objetivo é ter relatório de motivo de objeção/concorrência ou qualificação de lead (BANT-like), o caminho não é criar relatório agora — é primeiro adotar o preenchimento desses campos no processo comercial (treinamento/cobrança de preenchimento), e só depois eu construo o relatório em cima.

---

## 3. Correção já aplicada nesta sessão (bug real encontrado)

O relatório **"Motivos de Ganho e Perda"** (`motivos_ganho_perda`, já existia no catálogo) estava montando a coluna "Motivo" assim:

```js
const motivo = d.ADDITIONAL_INFO || d.UF_CRM_1770928318695 || d._ESTAGIO || "Não especificado";
```

`UF_CRM_1770928318695` é o campo **"Data do contrato assinado"** — uma data, não um texto de motivo. Na prática isso significa que a coluna "Motivo" de negócios perdidos nunca mostrava o motivo real, só caía no nome do estágio. Corrigido em `js/catalogo-relatorios.js` para ler os dois campos reais de motivo de perda (`UF_CRM_1582845737741` e, se vazio, `UF_CRM_6908AECC40696` — ver seção 2.1 sobre por que são dois), resolvendo o(s) ID(s) de lista para o texto de verdade via `crm.deal.fields`. Como só ~52% dos negócios perdidos têm algum motivo registrado hoje, o relatório ainda vai mostrar "Não especificado" (caindo no nome do estágio) em boa parte das linhas — isso é reflexo real do preenchimento no CRM, não um bug da ferramenta; melhora à medida que o time preencher mais. Negócios ganhos continuam usando o estágio (não existe campo de "motivo de ganho" configurado no Bitrix hoje).

---

## 4. Resumo de recomendações

**No Bitrix (para quem administra a conta):**
1. Corrigir os nomes/semântica dos estágios do Pós-Vendas (funil 5) — hoje tem nome de pessoa e "Cancelamento" marcado como ganho.
2. Decidir se T.I (funil 32) precisa de semântica corrigida ou fica como está (já excluído dos relatórios).
3. Decidir qual dos dois campos "Motivo da Negociação Perdida" é o oficial (ou juntar as duas listas em um só) — hoje fragmentam o preenchimento (~52% combinado, nenhum dos dois sozinho passa de 45%). Consolidar os demais campos duplicados listados no item 2.1.
4. Confirmar qual dos 3 campos "Origem" no Negócio é o oficial (ou se todos são legados e o único que importa é o `SOURCE_ID` de sistema, que é o que a ferramenta já usa).
5. Se quiser relatório de motivo de objeção/concorrência/qualificação de lead: cobrar o preenchimento desses campos primeiro (hoje estão vazios).
6. Cobrar preenchimento do motivo de perda de forma geral — hoje quase metade dos negócios perdidos (48%) fecha sem nenhum motivo registrado nos dois campos somados, o que limita qualquer relatório de motivo de perda por mais que a ferramenta melhore.

**Na ferramenta (já feito ou pronto para eu fazer quando você confirmar):**
- ✅ Corrigido: "Motivos de Ganho e Perda" agora lê os dois campos reais de motivo de perda (em vez de uma data, por engano) — mas o relatório só vai ficar realmente completo quando o preenchimento no Bitrix melhorar (item 6 acima).
- Pendente de confirmação sua: excluir o Pós-Vendas (funil 5) dos relatórios cross-pipeline de ganho/perda, igual já é feito com T.I/RH/Financeiro-Reembolsos/Área de Teste — ou você prefere corrigir a semântica no Bitrix primeiro?
- Pendente: relatório dedicado para "Sucesso do Cliente" (funil 46, já existe de verdade) — me diga o que você quer medir ali.
- Aguardando você mandar o mapeamento completo da jornada para popular "Closer e Account" e qualquer outro pipeline que ainda não tem card.
