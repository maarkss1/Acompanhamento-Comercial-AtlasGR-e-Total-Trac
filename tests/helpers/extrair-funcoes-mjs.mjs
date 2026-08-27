// Helper de teste (não é código de produção).
//
// scripts/forecast-semanal.mjs é um módulo ES real, mas não pode ser
// importado direto num teste: ele tem efeitos colaterais de nível superior
// (sai do processo com `process.exit(1)` se BITRIX_WEBHOOK_URL não estiver
// definida, e a chamada final `main().catch(...)` dispara requisições reais
// ao Bitrix/SMTP assim que o arquivo é carregado). Importar esse arquivo em
// teste executaria automação de produção — não é seguro nem determinístico.
//
// Em vez disso, este helper extrai do texto-fonte só as funções PURAS
// nomeadas que a gente precisa comparar (por nome, via casamento de chaves
// `{ ... }`), sem reescrever/reinventar a lógica: o texto de cada função é
// lido literalmente do arquivo real e avaliado num contexto `node:vm`
// isolado. Isso mantém o teste honesto — se alguém mudar a função no
// arquivo real, o teste passa a rodar a versão nova automaticamente (ou
// falha ao extrair, se a função for renomeada/removida, o que é um sinal
// útil por si só).
//
// Limitação conhecida: o casamento de chaves é ingênuo (não entende strings
// nem comentários com chaves dentro). É seguro para as funções puras deste
// projeto (sem `{`/`}` literais em strings/regex), mas não é um parser JS de
// verdade — não usar para extrair funções arbitrárias sem checar antes.

import vm from "node:vm";

/**
 * Extrai o texto-fonte de uma função nomeada (`function nome(...) { ... }`)
 * de um trecho maior de código, por casamento de chaves.
 * @param {string} codigoFonte
 * @param {string} nomeFuncao
 * @returns {string} texto-fonte completo da função, do `function` até o `}` final
 */
export function extrairTextoFuncao(codigoFonte, nomeFuncao) {
  const marcador = `function ${nomeFuncao}(`;
  const inicio = codigoFonte.indexOf(marcador);
  if (inicio === -1) {
    throw new Error(`extrairTextoFuncao: função "${nomeFuncao}" não encontrada no código-fonte fornecido.`);
  }
  const inicioChave = codigoFonte.indexOf("{", inicio);
  if (inicioChave === -1) {
    throw new Error(`extrairTextoFuncao: não encontrei o "{" de abertura da função "${nomeFuncao}".`);
  }
  let profundidade = 0;
  let fim = -1;
  for (let i = inicioChave; i < codigoFonte.length; i++) {
    const ch = codigoFonte[i];
    if (ch === "{") profundidade++;
    else if (ch === "}") {
      profundidade--;
      if (profundidade === 0) {
        fim = i;
        break;
      }
    }
  }
  if (fim === -1) {
    throw new Error(`extrairTextoFuncao: não encontrei o "}" de fechamento da função "${nomeFuncao}".`);
  }
  return codigoFonte.slice(inicio, fim + 1);
}

/**
 * Extrai um trecho de código delimitado por duas âncoras literais (inclusive
 * as duas âncoras), usado para pegar um bloco de lógica que não é uma função
 * nomeada isolada (ex.: um `const` calculado inline dentro de um laço).
 * @param {string} codigoFonte
 * @param {string} ancoraInicio - primeira ocorrência marca o início do trecho
 * @param {string} ancoraFim - primeira ocorrência de âncoraFim após o início marca o fim (inclusive)
 * @returns {string}
 */
export function extrairTrechoEntreAncoras(codigoFonte, ancoraInicio, ancoraFim) {
  const inicio = codigoFonte.indexOf(ancoraInicio);
  if (inicio === -1) {
    throw new Error(`extrairTrechoEntreAncoras: âncora de início não encontrada: ${JSON.stringify(ancoraInicio)}`);
  }
  const posFim = codigoFonte.indexOf(ancoraFim, inicio);
  if (posFim === -1) {
    throw new Error(`extrairTrechoEntreAncoras: âncora de fim não encontrada: ${JSON.stringify(ancoraFim)}`);
  }
  return codigoFonte.slice(inicio, posFim + ancoraFim.length);
}

/**
 * Avalia um ou mais trechos de código-fonte extraídos (declarações de função,
 * `const`, etc.) num contexto vm isolado e devolve esse contexto, expondo
 * cada símbolo de nível superior como propriedade.
 * @param {string[]} trechos
 * @returns {vm.Context}
 */
export function avaliarTrechos(trechos) {
  const sandbox = { console };
  const contexto = vm.createContext(sandbox);
  vm.runInContext(trechos.join("\n\n"), contexto);
  return contexto;
}
