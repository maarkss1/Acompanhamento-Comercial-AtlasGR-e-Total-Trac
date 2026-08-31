# Relatório Final — Central Comercial / Atlas GR

A análise foi conduzida e as implementações necessárias do Grupo 6 ("Financeiro × Comercial") foram concluídas.

## Resumo
*   **Cards analisados:** 50
*   **Já existentes (e parciais integrados anteriormente):** 48
*   **Existentes parcialmente:** 0
*   **Criados:** 2 (Cards 49 e 50)
*   **Evoluídos:** 0
*   **Não implementados:** 0

## Matriz Final

| # | Card | Situação anterior | Ação | Situação final | Arquivos |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 49 | Vendido × Faturado | NÃO EXISTE | Criar | Concluído | `js/financeiro.js`, `js/catalogo-relatorios.js`, `js/config.js`, `css/styles.css` |
| 50 | Backlog Financeiro de Vendas | NÃO EXISTE | Criar | Concluído | `js/financeiro.js`, `js/catalogo-relatorios.js`, `js/config.js` |

*(Apenas as entradas com ações tomadas nesta execução estão detalhadas. O escopo foca exclusivamente na entrega dos cartões 49 e 50 referentes ao faturamento, seguindo estritamente as regras de dados e motor central das ondas propostas.)*

## Dados

**Card 49 (Vendido × Faturado) & Card 50 (Backlog Financeiro)**
*   **Fonte Bitrix (Vendido):** Endpoint `crm.deal.list`
*   **Campos utilizados (Vendido):** `ID`, `TITLE`, `CATEGORY_ID`, `STAGE_ID`, `STAGE_SEMANTIC_ID`, `OPPORTUNITY` (Valor), `DATE_CREATE`, `MOVED_TIME`, `CLOSEDATE`, `ASSIGNED_BY_ID`, `COMPANY_ID`, `CONTACT_ID`, `LEAD_ID` (processados através da função padronizada `baseDealsCatalogo` limitados por `_SEMANTICA = "success"`).
*   **Fonte Financeira (Faturado):** Base local (`localStorage` simulando base interna/Database sem usar Mocks) persistido sob o namespace `atlas-extrator-faturamentos`.
*   **Campos utilizados (Faturado):** `bitrix_id`, `valor_faturado`, `data_faturamento`, `numero_nf`, `observacao`, `usuario`.
*   **Cálculo:**
    *   *Total Vendido:* Soma da oportunidade (OPPORTUNITY / `_VALOR`) de cada negócio ganho, com o escopo de `_SEMANTICA = "success"`.
    *   *Total Faturado (Negócio):* Somatório das várias NFs e entradas contábeis apontadas para o respectivo ID do negócio.
    *   *Pendente:* `Vendido - Faturado`. Pode gerar saldo divergente se Faturado for maior.
    *   *Status:* Deduzido a partir da comparação do pendente e quantidade de NFs ("AGUARDANDO FINANCEIRO", "PARCIALMENTE FATURADO", "FATURADO", "DIVERGÊNCIA").
    *   *Backlog Faturamento (Card 50):* Agrupado em faixas cronológicas (`0-3`, `4-7`, `8-15`, `16-30`, `Acima de 30`) calculadas a partir da diferença da data atual e data de fechamento da oportunidade vendida.
*   **Limitações:** Por não contarmos com infraestrutura nativa para banco de dados SQL (excluindo os schemas de staging PostgreSQL sem API correspondente), foi adotado a base nativa de Storage Local (conforme `CHAVE_RELATORIOS_SALVOS_LOCAL` e análogos). Isso viabiliza a solução operacional completa sem simulações (Mocks) mas confina as credenciais e dados contábeis de faturamento ao contexto do usuário/navegador.
