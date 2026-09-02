// Helper de teste (não é código de produção).
//
// Os arquivos em js/*.js são scripts clássicos de navegador (carregados via
// <script src="..."> nos .html deste projeto): não usam `import`/`export`,
// declaram funções e constantes direto no escopo global (`window`) e algumas
// delas leem `document`/`localStorage`/`fetch` quando chamadas.
//
// package.json tem "type":"module", então esses arquivos não podem ser
// importados com `import` diretamente em um teste Node. Este helper lê o
// arquivo com `fs` e o executa dentro de um `node:vm` Context isolado — um
// "documento" fake o suficiente para as funções PURAS (sem DOM real) do
// arquivo poderem ser chamadas e testadas, sem tocar em produção.
//
// Não usar para testar código que de fato manipula o DOM/UI — só para expor
// funções puras (cálculo, formatação, classificação) que hoje vivem
// misturadas nesses arquivos de script clássico.

import { readFileSync } from "node:fs";
import vm from "node:vm";

/**
 * Carrega um arquivo JS clássico (sem import/export) num contexto vm isolado
 * e devolve esse contexto — que expõe toda função/const de nível superior do
 * arquivo como propriedade (equivalente a `window.nomeDaFuncao` no navegador).
 *
 * @param {string} caminhoAbsoluto - caminho absoluto do arquivo js/*.js
 * @param {object} [opcoes]
 * @param {object} [opcoes.contextoExtra] - propriedades extras para injetar
 *   no sandbox antes de rodar o script (ex.: stubs de outra função global que
 *   o arquivo espera encontrar já carregada, como no navegador real onde
 *   vários <script src> compartilham o mesmo `window`).
 * @returns {vm.Context} contexto vm com as funções/consts do arquivo
 */
export function carregarScriptClassico(caminhoAbsoluto, { contextoExtra = {} } = {}) {
  const codigoFonte = readFileSync(caminhoAbsoluto, "utf8");

  const documentoFake = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    createElement: () => ({ style: {}, classList: { add: () => {}, remove: () => {} } }),
  };

  const sandbox = {
    console,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    AbortController,
    Set,
    Map,
    Promise,
    Date,
    Math,
    Number,
    String,
    Array,
    Object,
    RegExp,
    document: documentoFake,
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    fetch: () => Promise.reject(new Error("fetch indisponível no ambiente de teste (vm sandbox)")),
    setTimeout,
    clearTimeout,
    AbortSignal,
    FormData,
    Headers,
    Request,
    Response,
    atualizarStatus: () => {},
    esconderErro: () => {},
    mostrarErro: (msg) => { console.error("mostrarErro:", msg); },
    ...contextoExtra,
  };
  // No navegador, funções/consts de nível superior de um <script> viram
  // propriedades de `window` (que É o objeto global da página). Replicamos
  // isso apontando `window` para o próprio objeto global do contexto vm.
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const contexto = vm.createContext(sandbox);
  vm.runInContext(codigoFonte, contexto, { filename: caminhoAbsoluto });
  return contexto;
}
