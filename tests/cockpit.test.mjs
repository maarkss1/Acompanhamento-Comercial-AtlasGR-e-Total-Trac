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
const CAMINHO_JORNADA = path.join(__dirname, "..", "js", "jornada.js");
const CAMINHO_COCKPIT = path.join(__dirname, "..", "js", "cockpit.js");

const jornada = carregarScriptClassico(CAMINHO_JORNADA);
const cockpit = carregarScriptClassico(CAMINHO_COCKPIT, { contextoExtra: jornada });

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

describe("cockpit.js — cockpitClassificarBucketForecast (thresholds 70/40/10 + tier 'Upside')", () => {
  test("classifica por faixas de probabilidade", () => {
    assert.equal(cockpit.cockpitClassificarBucketForecast(70), "Commit");
    assert.equal(cockpit.cockpitClassificarBucketForecast(40), "Best Case");
    assert.equal(cockpit.cockpitClassificarBucketForecast(10), "Pipeline");
    assert.equal(cockpit.cockpitClassificarBucketForecast(9), "Upside");
    assert.equal(cockpit.cockpitClassificarBucketForecast(0), "Upside");
  });
});

describe("cockpit.js vs jornada.js — divergência DOCUMENTADA de thresholds do bucket de forecast", () => {
  // Achado do Agente 05 (Wave 1, Catálogo de Métricas): classificarBucketForecast
  // (js/jornada.js — fonte de verdade do Forecast Semanal e do Catálogo de
  // Relatórios) e cockpitClassificarBucketForecast (js/cockpit.js — só do
  // Cockpit, convergida com thresholds de outro projeto) usam faixas
  // DIFERENTES de propósito (ver comentário em js/cockpit.js:383-398):
  //   classificarBucketForecast:        Commit >=80, Best Case >=50, senão Pipeline (sem tier "Upside")
  //   cockpitClassificarBucketForecast: Commit >=70, Best Case >=40, Pipeline >=10, senão Upside
  //
  // Este teste não corrige a divergência (está fora de escopo) — só a torna
  // explícita e detectável: se algum dia os thresholds forem unificados sem
  // atualizar este teste, ele vai falhar e apontar exatamente para este
  // comentário.
  test("uma mesma probabilidade de 60% é 'Best Case' nos dois — mas por faixas diferentes", () => {
    assert.equal(jornada.classificarBucketForecast(60, "process"), "Best Case");
    assert.equal(cockpit.cockpitClassificarBucketForecast(60), "Best Case");
  });

  test("probabilidade de 45%: Best Case no Cockpit, mas só Pipeline no Forecast Semanal/Catálogo", () => {
    assert.equal(jornada.classificarBucketForecast(45, "process"), "Pipeline");
    assert.equal(cockpit.cockpitClassificarBucketForecast(45), "Best Case");
  });

  test("probabilidade de 20%: Pipeline no Cockpit, mas já é o piso 'Pipeline' também no Forecast Semanal — sem tier 'Upside' lá", () => {
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
