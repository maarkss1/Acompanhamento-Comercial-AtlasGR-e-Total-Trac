# CLAUDE.md

Guia rápido para quem (humano ou Claude Code) for mexer neste repositório.

## O que é

Portal de Business Intelligence Comercial sobre o CRM Bitrix24, para duas marcas (AtlasGR e Total Trac). HTML/CSS/JS clássico (sem framework, sem bundler), hospedado no GitHub Pages. Ver `AUDITORIA_ESTADO_ATUAL.md` e `COCKPIT_COMERCIAL.md` para contexto de negócio e fórmulas.

## Comandos

```bash
npm test           # suíte de testes (node --test), rodar sempre antes de commitar
npm run build      # compila ts/*.ts -> js/*.js (ver seção TypeScript abaixo)
npm run verify-build  # build + falha se o js/*.js commitado divergir do .ts (roda no CI)
```

CI (`quality.yml`) roda `npm audit`, `verify-build` e `npm test` em todo push/PR.

## Convenções estabelecidas nesta sessão (manter)

### 1. Migração incremental para TypeScript

- Arquivos já migrados vivem em `ts/*.ts` e **geram** o `js/*.js` correspondente via `npm run build` — **nunca edite o `.js` gerado diretamente**, a próxima build sobrescreve.
- Arquivos ainda não migrados continuam em `js/*.js` como scripts clássicos normais — edite-os direto, sem toolchain nenhuma.
- Migração é **arquivo por arquivo**, só quando for mexer nele por outro motivo (bug, feature) — não converter tudo de uma vez. Ao migrar um arquivo novo:
  1. Copie `js/X.js` → `ts/X.ts`, adicione `// @ts-nocheck` no topo, remova o `.js` original, rode `npm run build`, confirme `npm test` e o carregamento da página em navegador antes de committar (zero mudança de comportamento nesse passo).
  2. Só depois, em um commit separado, remova o `@ts-nocheck` e adicione tipos de verdade (comece pelas estruturas de dados centrais do arquivo — é aí que TypeScript pega bugs de verdade, como o de conciliação Comercial↔Financeiro corrigido em `js/cockpit.js`/`ts/cockpit.ts`).

### 2. Arquivos grandes — dividir "de passagem", não "a frio"

Vários arquivos são grandes (`catalogo-relatorios.js` ~3500 linhas, `cockpit.js`/`cockpit.ts` ~2400 linhas). **Não faça uma refatoração de divisão isolada só por estarem grandes** — o risco de quebrar algo sem um motivo funcional que justifique validar tudo de novo não compensa. Em vez disso:

- Quando for mexer numa área de um arquivo grande por outro motivo (bug, feature), e essa área tiver um limite natural de responsabilidade, é o momento de extrair aquele pedaço para seu próprio arquivo/módulo.
- Cada extração deve vir com validação own (testes + carregamento em navegador) antes de seguir para a mudança que motivou tocar o arquivo.

### 3. Segurança — usuários e permissão de escrita

- `USUARIOS_POR_EMPRESA` (`js/auth.js`) substitui a antiga senha única por empresa. Cada usuário tem senha própria e um flag `podeEscrever`. `usuarioAtual()` (global) expõe `{nome, podeEscrever}`.
- Toda tela que escreve no Bitrix (`ui.js`, `temperatura-lead.js`, `faturamento-mensal.js`, `pipeline-financeiro-acompanhamento.js`) deve checar `usuarioAtual().podeEscrever` antes de qualquer chamada de escrita — **fail-closed**: sessão sem usuário identificado nunca pode escrever.
- Isso é controle de UX/auditoria, **não** substitui configurar o escopo correto (leitura vs. escrita) no próprio webhook de entrada do Bitrix — quem tiver a URL do webhook e souber contornar o JS no navegador ainda está sujeito só ao que aquele webhook permitir no Bitrix. Configure os dois.

## Testes

`tests/*.test.mjs` usa `node:vm` para carregar os scripts clássicos (`tests/helpers/carregar-script-classico.mjs`) — não são módulos ES, então não dá pra `import` direto. Ver comentário no helper para como compor o contexto quando um arquivo depende de globals definidos em outro `<script>`.
