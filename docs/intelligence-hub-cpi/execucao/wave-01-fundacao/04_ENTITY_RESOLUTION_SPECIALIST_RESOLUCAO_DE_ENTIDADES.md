# Agente 04 — Entity Resolution Specialist

## Resumo executivo

O dashboard **tem, hoje, uma camada não-trivial de resolução de identidade de cliente** — mas ela existe em apenas **um** dos módulos (`js/jornada.js`, relatório "Jornada do Cliente"), é **auditoria/relatório**, não uma tabela mestre persistida, e **não é aplicada de forma consistente** nos demais módulos (`js/cockpit.js`, `js/sdr.js`, `js/catalogo-relatorios.js`). Não existe deduplicação automática de cadastros: o código detecta duplicidade **candidata** (nome/e-mail/telefone) e a expõe como sinal para revisão humana — nunca funde registros. Não há uso de CNPJ em lugar nenhum do código. AtlasGR e Total Trac são segregadas por **convenção de portal estático** (atributo `data-empresa`, storage/webhook próprios por marca), não por um campo de identidade ou por categoria de funil compartilhada — cada uma aponta para o webhook Bitrix que for colado nela, sem garantia de código de que sejam contas diferentes. Não existe uma "visão 360" persistida do cliente: cada relatório recalcula sua própria chave de cliente a partir do zero, a cada extração, sem armazenamento entre sessões. O CPI pede exatamente essa lacuna (`MASTER_ENTITY_ID` com `source_record_ids[]`, `confidence`, `match_rules[]`, `manual_review_required`) — hoje o mais próximo disso é o par `CLIENTE_KEY`/`CLIENTE_KEY_CONFIANCA` de `jornada.js`, que é um bom ponto de partida conceitual, mas roda só em memória do navegador, só para um relatório, e é descartado ao fechar a aba.

## Como entidades são identificadas hoje (com evidência)

**Não há normalização, deduplicação nem MASTER_ENTITY_ID no nível do Bitrix.** O dashboard não escreve nada de volta no CRM; ele lê negócios/leads/empresas/contatos via `crm.*.list` (`js/config.js:50-194`, `ENTIDADES`) e usa o **ID retornado pelo Bitrix como identidade primária de cada entidade individual** — não há remapeamento nem tabela de "de-para".

O relacionamento entre entidades é o nativo do Bitrix, lido diretamente dos campos de negócio: `COMPANY_ID`, `CONTACT_ID`, `LEAD_ID` (`js/config.js:119-123`). Não existe join client-side com uma tabela de "cliente único" persistida — cada consulta busca o negócio e, à parte, busca a empresa/contato/lead relacionados por esses IDs (`js/jornada.js:836-849`, `js/sdr.js:483-489`, `js/cockpit.js:330-344`).

O único lugar do código que constrói uma **chave de identidade de cliente que cruza negócios de fontes diferentes** é `extrairJornada()` em `js/jornada.js:864-901`. A hierarquia de resolução implementada é, literalmente:

```
COMPANY_ID (confiança ALTA)
  > CONTACT_ID, quando não há COMPANY_ID (confiança ALTA)
  > LEAD_ID, quando não há nem COMPANY_ID nem CONTACT_ID (confiança MÉDIA)
  > nome normalizado do título do negócio, limpo de sufixos de departamento
    (confiança MÉDIA) — só quando o nome não parece um registro operacional
    interno (ex.: "Preencher formulário de CRM", "Testando")
  > DEAL_ID isolado (confiança BAIXA) — o negócio fica "sozinho", sem cruzar
    com nada
```

Isso gera, por negócio, os campos `CLIENTE_KEY`, `CLIENTE_KEY_TIPO`, `CLIENTE_KEY_CONFIANCA` — o embrião de um esquema `entity_id + confidence + match_rule` (linhas 921-927 e 1103-1106). `ID=0` do Bitrix é tratado explicitamente como "sem vínculo" e nunca vira uma chave `COMPANY:0` (linha 835, 875) — um cuidado correto que evita uma classe comum de bug de join.

Normalização de nome existe (`normalizarTextoChave`, `js/jornada.js:1-9`): remove acentos (NFD + strip de diacríticos), baixa para minúsculas, colapsa tudo que não é `[a-z0-9]` em espaço único e faz trim. Não há normalização de CNPJ (nenhuma ocorrência de "CNPJ" em `js/*`), nem de razão social/nome fantasia, nem de domínio de e-mail. Normalização de telefone existe separadamente (`normalizarTelefone`, linha 54-57): mantém só dígitos e usa os últimos 11.

**Essa chave de identidade não é persistida.** É recalculada em memória (`window`/variáveis globais) a cada clique em "Extrair", vive só durante a sessão do navegador e não é gravada em `localStorage`, banco ou arquivo — ao recarregar a página, tudo é refeito do zero contra o Bitrix.

## Deduplicação existente (ou ausência dela)

**Não existe fusão automática de cadastros em nenhum lugar do código.** Isso é dito explicitamente no próprio relatório do catálogo: o KPI "Fusão automática" é hard-coded como `"não"` (`js/catalogo-relatorios.js:306`).

O que existe é **detecção de sinais de duplicidade candidata**, sempre para revisão humana, nunca para merge:

- `construirSinaisDuplicidadeEmpresas()` (`js/jornada.js:183-230`, reaproveitada em `js/catalogo-relatorios.js:303`) agrupa empresas (`crm.company.list`) por três chaves — nome normalizado, e-mail (lowercase/trim) e telefone normalizado — e, para cada empresa, marca `duplicado: true/false`, a lista de `motivos` (`nome`, `email`, `telefone`) e os `COMPANY_ID`s relacionados, **sem nunca alterar os IDs originais**.
- Esse sinal aparece em duas saídas: o relatório dedicado "🧬 Duplicidades e identidade do cliente" (`RELATORIOS.duplicidades`, `js/config.js:300`) e os campos `POSSIVEL_DUPLICIDADE_CADASTRAL` / `MOTIVO_DUPLICIDADE_CADASTRAL` / `COMPANY_IDS_RELACIONADOS` anexados a cada linha da jornada (`js/jornada.js:1135-1137`).
- Há uma segunda noção de "duplicidade", distinta da de cadastro: **duplicidade de contagem no mesmo funil** — quando o mesmo `CLIENTE_CONTAGEM_KEY` aparece mais de uma vez na mesma categoria de pipeline (`js/jornada.js:908-916, 1123-1129`). Aqui **sim** há uma forma de unificação, mas só para fins de contagem de KPI (não deduplica o cadastro): se duas empresas com `COMPANY_ID` diferentes têm exatamente o mesmo nome normalizado, o negócio mais antigo conta como "o" cliente único no funil e os demais são marcados `DUPLICADO_CLIENTE_NO_FUNIL = "S"` e excluídos da contagem — mas os `COMPANY_ID`s brutos continuam preservados e distintos no dado exportado. O próprio código comenta a intenção: "Fusão automática: não... IDs preservados... Critério: nome/e-mail/telefone" (`js/catalogo-relatorios.js:306`).
- Nenhuma dessas verificações roda para **contatos** ou **leads** — só para empresas (`crm.company.list`). Um lead e um contato cadastrados duas vezes com nomes/telefones parecidos não geram nenhum sinal.
- A lógica de chave de cliente **não é idêntica entre módulos**: `js/jornada.js` usa a hierarquia completa `COMPANY_ID > CONTACT_ID > LEAD_ID > NOME`; já `clientes_receita` em `js/catalogo-relatorios.js:250` usa apenas `COMPANY_ID > nome normalizado` (sem passar por `CONTACT_ID`/`LEAD_ID`), e a análise SDR (`js/sdr.js:285`) usa `COMPANY_ID > CONTACT_ID > LEAD_ID > DEAL_ID` (sem o passo de nome normalizado). Ou seja, o mesmo negócio pode ser "o mesmo cliente" em um relatório e "clientes diferentes" em outro, dependendo de qual módulo o processa.

## Segregação AtlasGR x Total Trac

A separação é feita por **convenção de página estática**, não por um identificador de conta/portal no dado:

- Cada página HTML se autodeclara com `<html data-empresa="atlasgr">` ou `<html data-empresa="totaltrac">` (confirmado em `totaltrac-home.html:2`; ver também o comentário de topo de `js/config.js:1-13`). `empresaAtiva()` (`js/config.js:38-40`) só lê esse atributo do DOM.
- `MARCAS` (`js/config.js:14-37`) guarda, por marca: cor, hash de senha, **sufixo de `localStorage`** (`sufixoStorage`) e **webhook padrão** (`webhookPadrao`). AtlasGR tem um webhook fixo hard-coded (`WEBHOOK_FIXO_PADRAO = "https://atlasgr.bitrix24.com.br/rest/450/..."`, `js/bitrix-api.js:7`). **Total Trac não tem webhook padrão nenhum** (`webhookPadrao` retorna `""`, `js/config.js:35`) — o usuário precisa colar manualmente a URL do webhook Total Trac e salvá-la (fica em `localStorage` sob uma chave com sufixo `__totaltrac`, isolada da chave da AtlasGR).
- Isso significa que **o código não garante, nem verifica, que os dois portais apontem para contas Bitrix diferentes** — essa garantia depende inteiramente de qual URL de webhook a pessoa colar na tela da Total Trac. Se alguém colar por engano o mesmo webhook da AtlasGR ali, o código não detecta nem impede.
- As categorias de funil (`CATEGORY_ID`) mapeadas em `ENTIDADES.negocios.categorias` (`js/config.js:56-71`) são explicitamente descritas como "Metadados conhecidos do Bitrix da AtlasGR" (comentário de `js/config.js:45-48`) — não há um mapa equivalente documentado para a Total Trac; o código usa fallback dinâmico (`crm.category.list`, `js/jornada.js:84-124`) quando a API responde, então funciona para qualquer portal, mas o mapa fixo do arquivo é só da AtlasGR.
- Não há nenhum campo do tipo `EMPRESA_GRUPO` ou `PORTAL_ID` gravado nos dados extraídos que amarre um registro à marca — a separação acontece inteiramente por qual página/qual webhook foi usado na sessão do navegador, nunca dentro do dado em si.
- Resultado prático: são, na melhor hipótese, **dois portais Bitrix diferentes acessados pela mesma base de código duplicada em páginas HTML separadas** (`totaltrac-*.html` espelhando `*.html`) — não há uma "instância" de código realmente distinta (o comentário de `PORTAL.md` confirma: "Nenhuma lógica de negócio foi duplicada entre páginas... os mesmos 11 arquivos `js/*.js`"), e não há nenhuma tentativa de cruzar cliente entre as duas marcas (o que provavelmente é o comportamento correto de negócio, já que são empresas distintas — mas vale registrar que isso é garantido por processo, não por código).

## Lacuna: visão única do cliente

**Não existe hoje uma visão 360 do cliente.** Nenhum arquivo do repositório junta, sob uma única identidade persistida, dados de: negócios comerciais (Cockpit/Forecast), atividade de SDR (`js/sdr.js`), jornada/pipeline (`js/jornada.js`) e histórico de pós-venda/CS (categorias 46/5/48). Evidências diretas dessa fragmentação:

- Cada relatório do catálogo (`RELATORIOS`, `js/config.js:296-324`) roda sua própria extração isolada contra o Bitrix, com sua própria chave de cliente ad-hoc (ver seção anterior) — não há uma tabela/objeto `clientes[]` compartilhado entre `cockpit.js`, `sdr.js`, `jornada.js` e `catalogo-relatorios.js`.
- Nada é persistido entre sessões além de: (a) o webhook (ofuscado em `localStorage`), (b) o histórico semanal de forecast (`relatorios/forecast-semanal/historico.json`, só para a AtlasGR, só o agregado do funil Comercial — não por cliente) e (c) preferências de UI. Não há um `localStorage`/backend com "cliente X → {negócios, atividades, jornada, CS}".
- O "cruzamento entre áreas" mais próximo que existe é o card SDR de "contato, empresa, atividade realizada e próxima atividade" (`js/sdr.js:754-768, 815-818`), que junta lead/negócio/contato/atividade **por um único lead ou negócio**, não por uma identidade de cliente que sobrevive à conversão lead→negócio→pós-venda.
- A arquitetura é 100% estática client-side sem backend (`AUDITORIA_ESTADO_ATUAL.md`, `PORTAL.md`) — não há onde armazenar um `MASTER_ENTITY_ID` de forma central e compartilhada entre usuários/sessões mesmo que se quisesse, sem introduzir uma peça de infraestrutura nova (banco/API própria).

Isso é exatamente a lacuna que `02_DADOS_E_BITRIX/03_ENTITY_RESOLUTION.txt` do pacote CPI pede para resolver (saída-alvo: `MASTER_ENTITY_ID`, `source_record_ids[]`, `confidence`, `match_rules[]`, `manual_review_required`). O par `CLIENTE_KEY` / `CLIENTE_KEY_CONFIANCA` de `jornada.js` é conceitualmente o precursor certo desse esquema (já tem confiança em 3 níveis e regra de match implícita), mas falta: (1) persistência fora da sessão do navegador, (2) `source_record_ids[]` explícito (hoje o vínculo é implícito pelo agrupamento em memória), (3) `manual_review_required` como campo de fato acionável (hoje é só um relatório de leitura), e (4) aplicação consistente nos outros três módulos que hoje reinventam sua própria chave.

## Estratégia de resolução de entidades proposta

Dado o contexto real (site estático, sem backend, sem acesso à API ao vivo nesta wave, múltiplos módulos JS independentes), a proposta é evolutiva e não exige infraestrutura nova na primeira etapa:

1. **Extrair a lógica de chave de cliente de `jornada.js` para uma função compartilhada** (ex. `js/entity-resolution.js`), com a mesma hierarquia `COMPANY_ID > CONTACT_ID > LEAD_ID > NOME_NORMALIZADO > DEAL_ID_ISOLADO` e o mesmo trio `chave/tipo/confiança`. Fazer `cockpit.js`, `sdr.js` e `catalogo-relatorios.js` chamarem essa mesma função em vez de reimplementar sua própria variação — hoje há pelo menos 3 variações divergentes da mesma ideia (ver seção "Deduplicação existente").
2. **Formalizar o esquema de saída pedido pelo CPI** já dentro dessa função: renomear/mapear `CLIENTE_KEY → MASTER_ENTITY_ID`, manter `source_record_ids[]` explícito (a lista de `DEAL_ID`/`LEAD_ID`/`CONTACT_ID` que caíram na mesma chave — hoje implícito no agrupamento `grupos[chave]`), `confidence` (já existe, 3 níveis), `match_rules[]` (já existe como `tipo`, mas hoje é singular — trocar para lista permite registrar "nome + telefone" quando mais de um sinal bate) e `manual_review_required` (hoje é o campo `POSSIVEL_DUPLICIDADE_CADASTRAL`, mas só existe para empresas — estender a leads/contatos).
3. **Estender a checagem de duplicidade de `construirSinaisDuplicidadeEmpresas` para leads e contatos**, reaproveitando o mesmo padrão (nome/e-mail/telefone normalizados), já que hoje só empresas são checadas.
4. **Persistir o resultado da resolução como um artefato versionado**, no mesmo padrão já usado para o forecast semanal (`relatorios/forecast-semanal/historico.json`, gerado por `scripts/forecast-semanal.mjs` via GitHub Actions): um job agendado que roda a resolução de entidades contra o Bitrix e grava `relatorios/entity-resolution/master-entities.json` (ou similar), com `MASTER_ENTITY_ID`, `source_record_ids[]`, `confidence`, `match_rules[]`, `manual_review_required`, timestamp de geração. Isso dá a única forma de "visão 360" persistida possível sem sair da arquitetura 100% estática atual: um arquivo JSON gerado por automação, versionado no repo, consumido pelas páginas — o mesmo padrão que já funciona para o forecast.
5. **Introduzir CNPJ como sinal de match assim que o campo existir no Bitrix** (hoje nenhum campo de `crm.company.fields` mapeado em `js/config.js` inclui CNPJ — verificar se a conta tem um campo customizado `UF_CRM_*` de CNPJ; se sim, é o sinal de maior confiança possível e deveria ficar acima de nome/e-mail/telefone na hierarquia de duplicidade). Isso não pôde ser confirmado nesta wave por falta de acesso à API ao vivo — é uma dependência explícita do Agente de Dados/Bitrix.
6. **Manter "nunca fundir automaticamente"** como princípio de produto (consistente com o que já existe e com o princípio 5 do CPI, "nunca inventar dados ausentes"): a saída da resolução deve sempre alimentar uma fila de revisão humana antes de qualquer ação que dependa de "é o mesmo cliente" (ex. antes de somar receita de dois `COMPANY_ID` como se fossem um só cliente em `clientes_receita`).

## Riscos

- **Concentração de receita mascarada por cadastro duplicado**: hoje `clientes_receita` (`js/catalogo-relatorios.js:250`) só funde por `COMPANY_ID` idêntico ou nome normalizado idêntico — duas grafias ligeiramente diferentes do mesmo cliente (ex. com/sem sufixo "Ltda", erro de digitação) aparecem como clientes distintos, subestimando concentração de receita por cliente (KPI "Top 10" citado em `js/config.js:312`).
- **Inconsistência entre relatórios**: como cada módulo tem sua própria variação de chave de cliente (ver seção "Deduplicação"), o mesmo negócio pode contar como cliente único em um relatório e como duplicata em outro — risco de números que não batem entre Cockpit, SDR e Jornada quando alguém comparar os três.
- **Ausência de CNPJ como chave**: nome e telefone são sinais fracos para empresas B2B com múltiplas filiais/CNPJs sob a mesma razão social, ou fantasia de nome diferente da razão social — sem CNPJ, o dedupe de empresa tem taxa de falso-negativo desconhecida e não mensurada.
- **Sem persistência entre sessões**: qualquer decisão de "estes dois cadastros são o mesmo cliente" tomada por um analista hoje (fora do sistema) não é registrada em lugar nenhum consultável pelo próprio dashboard — não há como o sistema "aprender" da correção humana.
- **Segregação AtlasGR/Total Trac depende de disciplina manual**: nada no código impede colar o webhook errado na página errada; um erro de configuração misturaria dados de duas empresas distintas sem nenhum alerta.
- **Falta de dedupe para leads/contatos**: leads duplicados inflam KPIs de SDR (volume de leads atendidos, taxa de conversão) sem nenhum sinal de alerta equivalente ao que já existe para empresas.

## Recomendações priorizadas

1. **Alta / baixo esforço** — extrair a função de chave de cliente de `jornada.js` para um módulo compartilhado e usá-la em `cockpit.js`, `sdr.js` e `catalogo-relatorios.js`, eliminando as 3 variações divergentes hoje existentes.
2. **Alta / baixo esforço** — confirmar junto ao Bitrix (quando houver acesso à API ao vivo) se existe campo de CNPJ em `crm.company.fields`; se sim, adicionar como sinal de maior prioridade em `construirSinaisDuplicidadeEmpresas`.
3. **Média / médio esforço** — estender a detecção de duplicidade (nome/e-mail/telefone) de empresas para leads e contatos.
4. **Média / médio esforço** — renomear/formalizar a saída da resolução para o esquema do CPI (`MASTER_ENTITY_ID`, `source_record_ids[]`, `match_rules[]` como lista, `manual_review_required`), sem mudar o comportamento, só o contrato de dados — facilita a wave seguinte de "visão 360".
5. **Média / esforço maior** — job agendado (padrão GitHub Actions já existente para o forecast) que gera e versiona um arquivo `master-entities.json`, criando a primeira base persistida de identidade de cliente entre sessões.
6. **Baixa / esforço maior, mas fora do escopo client-side atual** — avaliar introduzir um backend leve (ou usar o próprio Bitrix como fonte de verdade via um campo customizado de "empresa mestre") caso o negócio precise que a fusão vire ação de fato (mesclar cadastros no CRM), não só um relatório de leitura.

## Dependências e próximos agentes indicados

- **Agente de Dados/Bitrix (02_DADOS_E_BITRIX)**: confirmar campos disponíveis em `crm.company.fields`/`crm.contact.fields` na conta real (em especial CNPJ/CPF, domínio de e-mail, endereço) — não verificável nesta wave por falta de acesso à API ao vivo.
- **Agente de Arquitetura (01_ARQUITETURA)**: decidir se a persistência do resultado de resolução de entidades continua no padrão "arquivo JSON gerado por GitHub Actions" (consistente com o que já existe) ou justifica introduzir um backend/banco.
- **Agente de Relatórios e Métricas (06_RELATORIOS_E_METRICAS)**: usar o `MASTER_ENTITY_ID` formalizado como base para qualquer KPI de "receita por cliente"/"concentração"/"recorrência", hoje calculado com uma chave mais frágil.
- **Agente de SDR (05_DEPARTAMENTOS ou equivalente)**: avaliar impacto de estender dedupe a leads/contatos nos KPIs de volume/conversão já publicados.
- **Agente de Governança e Segurança (09_GOVERNANCA_E_SEGURANCA)**: revisar se a separação AtlasGR/Total Trac por convenção manual de webhook é aceitável como controle de segregação de dados entre as duas empresas, ou se precisa de um controle mais forte.

## Confiança e limitações

- **Alta confiança** nas afirmações sobre o código lido diretamente (`js/jornada.js`, `js/config.js`, `js/bitrix-api.js`, `js/cockpit.js`, `js/sdr.js`, `js/catalogo-relatorios.js`, `PORTAL.md`) — todas as citações de linha foram conferidas no arquivo real.
- **Sem acesso à API Bitrix24 ao vivo nesta sessão** — não foi possível confirmar: (a) se existe campo de CNPJ customizado na conta real, (b) se o webhook realmente configurado hoje para Total Trac aponta para uma conta Bitrix diferente da AtlasGR (o código permite os dois cenários), (c) o volume real de duplicidades candidatas hoje sinalizadas em produção.
- Este diagnóstico cobre os arquivos explicitamente listados na missão mais os arquivos que eles importam/reaproveitam (`catalogo-relatorios.js`, `PORTAL.md`, `AUDITORIA_ESTADO_ATUAL.md`); não foi feita uma varredura exaustiva de 100% do repositório (ex. `scripts/`, `extrator.js`, `forecast.js`, `ui.js`, `app.js`, `auth.js`, `exportacoes.js` foram apenas verificados por grep pontual, não lidos por completo) — nenhuma afirmação acima depende desses arquivos não lidos integralmente.
