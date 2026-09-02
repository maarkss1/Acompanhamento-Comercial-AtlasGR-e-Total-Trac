// Testes unitários das funções PURAS de js/cockpit.js (script clássico de
// navegador, carregado via node:vm). cockpit.js espera, no navegador, que
// js/jornada.js já tenha sido carregado antes dele no mesmo <script src>
// (ver <script> em cockpit.html) — reproduzimos isso passando o contexto de
// jornada.js já carregado como `contextoExtra` ao carregar cockpit.js.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { carregarScriptClassico } from "./helpers/carregar-script-classico.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAMINHO_CONFIG = path.join(__dirname, "..", "js", "config.js");
const CAMINHO_JORNADA = path.join(__dirname, "..", "js", "jornada.js");
const CAMINHO_COCKPIT = path.join(__dirname, "..", "js", "cockpit.js");

const config = carregarScriptClassico(CAMINHO_CONFIG);
const jornada = carregarScriptClassico(CAMINHO_JORNADA, { contextoExtra: config });
const cockpit = carregarScriptClassico(CAMINHO_COCKPIT, { contextoExtra: { ...config, ...jornada } });

describe("cockpit.js — cockpitContarComValor", () => {
  test("conta só itens com _VALOR numérico > 0 (v29 — ver comentário na função)", () => {
    const lista = [
      { _VALOR: 100 },
      { _VALOR: 0 },
      { _VALOR: null },
      { _VALOR: undefined },
      { _VALOR: 50 },
      { _VALOR: -10 },
    ];
    assert.equal(cockpit.cockpitContarComValor(lista), 2);
  });

  test("lista vazia ou ausente devolve 0", () => {
    assert.equal(cockpit.cockpitContarComValor([]), 0);
    assert.equal(cockpit.cockpitContarComValor(null), 0);
    assert.equal(cockpit.cockpitContarComValor(undefined), 0);
  });
});

describe("cockpit.js — cockpitClassificarBucketForecast (thresholds 80/50/10 + tier 'Upside')", () => {
  test("classifica por faixas de probabilidade", () => {
    assert.equal(cockpit.cockpitClassificarBucketForecast(80), "Commit");
    assert.equal(cockpit.cockpitClassificarBucketForecast(50), "Best Case");
    assert.equal(cockpit.cockpitClassificarBucketForecast(10), "Pipeline");
    assert.equal(cockpit.cockpitClassificarBucketForecast(9), "Upside");
    assert.equal(cockpit.cockpitClassificarBucketForecast(0), "Upside");
  });
});

describe("cockpit.js vs jornada.js — alinhamento de thresholds do bucket de forecast", () => {
  test("uma mesma probabilidade de 80% é 'Commit' nos dois", () => {
    assert.equal(jornada.classificarBucketForecast(80, "process"), "Commit");
    assert.equal(cockpit.cockpitClassificarBucketForecast(80), "Commit");
  });

  test("uma mesma probabilidade de 60% é 'Best Case' nos dois", () => {
    assert.equal(jornada.classificarBucketForecast(60, "process"), "Best Case");
    assert.equal(cockpit.cockpitClassificarBucketForecast(60), "Best Case");
  });

  test("probabilidade de 45%: Pipeline no Cockpit e no Forecast Semanal/Catálogo", () => {
    assert.equal(jornada.classificarBucketForecast(45, "process"), "Pipeline");
    assert.equal(cockpit.cockpitClassificarBucketForecast(45), "Pipeline");
  });

  test("probabilidade de 20%: Pipeline no Cockpit e no Forecast Semanal", () => {
    assert.equal(jornada.classificarBucketForecast(20, "process"), "Pipeline");
    assert.equal(cockpit.cockpitClassificarBucketForecast(20), "Pipeline");
  });

  test("probabilidade de 5%: vira 'Upside' só no Cockpit — o Forecast Semanal/Catálogo não têm esse tier, classificam como 'Pipeline'", () => {
    assert.equal(jornada.classificarBucketForecast(5, "process"), "Pipeline");
    assert.equal(cockpit.cockpitClassificarBucketForecast(5), "Upside");
    assert.notEqual(
      jornada.classificarBucketForecast(5, "process"),
      cockpit.cockpitClassificarBucketForecast(5)
    );
  });
});
