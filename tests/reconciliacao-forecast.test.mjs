// Teste de RECONCILIAÇÃO entre a lógica de forecast do navegador
// (js/jornada.js, script clássico) e a do script Node standalone
// (scripts/forecast-semanal.mjs, roda fora do navegador via GitHub Actions).
//
// Contexto (achado do Agente 03, Wave 1 — Data Quality Guardian):
// scripts/forecast-semanal.mjs documenta, nos seus próprios comentários, que
// replica manualmente normalizarTextoChave(), ehEstagioPiloto() e
// probabilidadeFallbackForecast() de js/jornada.js porque não há bundler/
// módulo compartilhado entre navegador e Node neste projeto. Não havia,
// até este teste, nenhuma verificação automatizada de que as réplicas
// continuam batendo.
//
// scripts/forecast-semanal.mjs NÃO pode ser importado direto num teste: ele
// tem efeitos colaterais de nível superior (process.exit(1) sem
// BITRIX_WEBHOOK_URL definida, e dispara main() -> chamadas reais ao Bitrix
// assim que o módulo carrega). Por isso este teste extrai, por casamento de
// chaves, só o texto-fonte das funções/trechos puros que precisa comparar —
// ver tests/helpers/extrair-funcoes-mjs.mjs. Isso não duplica/inventa regra
// de negócio nova: é o texto literal do arquivo real, lido em tempo de
// teste.
//
// Fixtures abaixo são negócios FICTÍCIOS, só para este teste — não são dados
// reais de cliente.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { carregarScriptClassico } from "./helpers/carregar-script-classico.mjs";
import { extrairTextoFuncao, extrairTrechoEntreAncoras, avaliarTrechos } from "./helpers/extrair-funcoes-mjs.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAMINHO_JORNADA = path.join(__dirname, "..", "js", "jornada.js");
const CAMINHO_FORECAST_SEMANAL = path.join(__dirname, "..", "scripts", "forecast-semanal.mjs");

const jornada = carregarScriptClassico(CAMINHO_JORNADA);

const codigoForecastSemanal = readFileSync(CAMINHO_FORECAST_SEMANAL, "utf8");

const fnNormalizarTextoChave = extrairTextoFuncao(codigoForecastSemanal, "normalizarTextoChave");
const fnEhEstagioPiloto = extrairTextoFuncao(codigoForecastSemanal, "ehEstagioPiloto");
const fnProbabilidadeFallback = extrairTextoFuncao(codigoForecastSemanal, "probabilidadeFallbackForecast");
// ehEstagioPiloto() lê o Set de nível superior STAGE_IDS_PILOTO — precisa vir
// junto no mesmo contexto vm, senão a função extraída isoladamente lança
// "STAGE_IDS_PILOTO is not defined" ao ser chamada.
const constStageIdsPiloto = extrairTrechoEntreAncoras(
  codigoForecastSemanal,
  "const STAGE_IDS_PILOTO = new Set(",
  ");"
);

// A classificação de semântica agora é uma função pura nomeada no script Node,
// reconciliada diretamente com semanticaDeal() do navegador.
const fnClassificarSemantica = extrairTextoFuncao(codigoForecastSemanal, "classificarSemanticaForecastSemanal");

const forecastSemanal = avaliarTrechos([
  constStageIdsPiloto,
  fnNormalizarTextoChave,
  fnEhEstagioPiloto,
  fnProbabilidadeFallback,
  fnClassificarSemantica,
]);

describe("Reconciliação — probabilidadeFallbackForecast (js/jornada.js vs scripts/forecast-semanal.mjs)", () => {
  // Ambas as funções são, hoje, réplicas literalmente idênticas (ver
  // comentário "⚠️ Réplica manual" nos dois arquivos). Este teste confirma
  // isso automaticamente para um conjunto representativo de labels — se
  // alguém editar um dos dois arquivos sem replicar no outro, este teste
  // passa a falhar.
  const labelsFixture = [
    { label: "Nova oportunidade", semantica: "process" },
    { label: "Reunião de diagnóstico", semantica: "process" },
    { label: "Proposta enviada", semantica: "process" },
    { label: "Negociação final", semantica: "process" },
    { label: "Contrato Assinado", semantica: "process" },
    { label: "Piloto Comercial", semantica: "process" },
    { label: "Estágio Customizado Sem Palavra-Chave", semantica: "process" },
    { label: "", semantica: "process" },
    { label: "Contrato Assinado", semantica: "success" },
    { label: "Contrato Assinado", semantica: "failure" },
  ];

  for (const { label, semantica } of labelsFixture) {
    test(`label="${label}" semantica="${semantica}" → mesmo resultado nos dois arquivos`, () => {
      const doNavegador = jornada.probabilidadeFallbackForecast(label, semantica);
      const doNode = forecastSemanal.probabilidadeFallbackForecast(label, semantica);
      assert.equal(doNavegador, doNode);
    });
  }
});

describe("Reconciliação — ehEstagioPiloto (js/jornada.js vs scripts/forecast-semanal.mjs)", () => {
  test("mesma lista de STAGE_ID piloto e mesma detecção por texto do label", () => {
    assert.equal(jornada.ehEstagioPiloto("UC_R1YAOS", "Qualquer label"), true);
    assert.equal(forecastSemanal.ehEstagioPiloto("UC_R1YAOS", "Qualquer label"), true);

    assert.equal(jornada.ehEstagioPiloto("STAGE_X", "Piloto Financeiro"), true);
    assert.equal(forecastSemanal.ehEstagioPiloto("STAGE_X", "Piloto Financeiro"), true);

    assert.equal(jornada.ehEstagioPiloto("STAGE_X", "Proposta enviada"), false);
    assert.equal(forecastSemanal.ehEstagioPiloto("STAGE_X", "Proposta enviada"), false);
  });
});

describe("Reconciliação — classificação de semântica: caso em que STAGE_SEMANTIC_ID está presente (CONCORDÂNCIA)", () => {
  // Fixture: negócios fictícios com STAGE_SEMANTIC_ID preenchido pelo Bitrix
  // (o caso comum/esperado). Nesse caso as duas lógicas concordam, porque
  // ambas leem STAGE_SEMANTIC_ID primeiro.
  const negociosFicticios = [
    { ID: "fixture-1", STAGE_SEMANTIC_ID: "S", _label: "ganho, semantic id presente" },
    { ID: "fixture-2", STAGE_SEMANTIC_ID: "F", _label: "perdido, semantic id presente" },
    { ID: "fixture-3", STAGE_SEMANTIC_ID: "P", _label: "em aberto, semantic id presente" },
  ];

  for (const deal of negociosFicticios) {
    test(`negócio fictício "${deal._label}" → mesma classificação nos dois arquivos`, () => {
      // js/jornada.js: semanticaDeal(deal, metaStage) — metaStage é irrelevante
      // aqui porque STAGE_SEMANTIC_ID já está presente no deal.
      const doNavegador = jornada.semanticaDeal(deal, { semantics: "" });
      const doNode = forecastSemanal.classificarSemanticaForecastSemanal(deal);
      assert.equal(doNavegador, doNode);
    });
  }
});

describe("Reconciliação — classificação de semântica: STAGE_SEMANTIC_ID ausente usa metadata do estágio (CONCORDÂNCIA)", () => {
  const negocioFicticioSemStageSemanticId = {
    ID: "fixture-4",
    STAGE_SEMANTIC_ID: "",
    _label: "estágio sem semantic id no negócio",
  };

  test("fallback de ganho mantém navegador e Node em success", () => {
    const metaStage = { label: "Contrato Assinado (Financeiro)", semantics: "S" };
    const doNavegador = jornada.semanticaDeal(negocioFicticioSemStageSemanticId, metaStage);
    const doNode = forecastSemanal.classificarSemanticaForecastSemanal(negocioFicticioSemStageSemanticId, metaStage);
    assert.equal(doNavegador, "success");
    assert.equal(doNode, "success");
    assert.equal(doNavegador, doNode);
  });

  test("fallback de perda mantém navegador e Node em failure", () => {
    const metaStage = { label: "Negócio Perdido", semantics: "F" };
    const doNavegador = jornada.semanticaDeal(negocioFicticioSemStageSemanticId, metaStage);
    const doNode = forecastSemanal.classificarSemanticaForecastSemanal(negocioFicticioSemStageSemanticId, metaStage);
    assert.equal(doNavegador, "failure");
    assert.equal(doNode, "failure");
    assert.equal(doNavegador, doNode);
  });

  test("sem semântica no negócio nem no estágio, ambos mantêm process", () => {
    const metaStage = { label: "Etapa sem semântica", semantics: "" };
    const doNavegador = jornada.semanticaDeal(negocioFicticioSemStageSemanticId, metaStage);
    const doNode = forecastSemanal.classificarSemanticaForecastSemanal(negocioFicticioSemStageSemanticId, metaStage);
    assert.equal(doNavegador, "process");
    assert.equal(doNode, "process");
    assert.equal(doNavegador, doNode);
  });
});
