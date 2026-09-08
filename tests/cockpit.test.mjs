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
const CAMINHO_FORECAST = path.join(__dirname, "..", "js", "forecast.js");
const CAMINHO_COCKPIT = path.join(__dirname, "..", "js", "cockpit.js");

const config = carregarScriptClassico(CAMINHO_CONFIG);
const jornada = carregarScriptClassico(CAMINHO_JORNADA, { contextoExtra: config });
// forecast.js precisa entrar no contexto do Cockpit por causa de
// chaveClienteDealModelo (conciliação Comercial↔Financeiro) — ver
// cockpitFinanceiroConciliadoComFiltro/cockpitClassificarComercialFinanceiro.
const forecast = carregarScriptClassico(CAMINHO_FORECAST, { contextoExtra: { ...config, ...jornada } });
const cockpit = carregarScriptClassico(CAMINHO_COCKPIT, { contextoExtra: { ...config, ...jornada, ...forecast } });

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

describe("cockpit.js — cockpitFinanceiroConciliadoComFiltro (regressão: Win Rate/Resultado do Mês zerados ao filtrar Vendedor/Origem)", () => {
  // Cenário relatado pelo usuário: o Cockpit tinha um negócio Comercial
  // GANHO (vendedor A) já confirmado no Financeiro (Contrato Assinado), mas
  // o registro do funil Financeiro pertence a outro responsável no Bitrix
  // (equipe financeira, não o vendedor A) — comum quando o pipeline
  // Financeiro tem dono/origem próprios. Ao trocar o filtro "Todos os
  // vendedores" para o vendedor A, Win Rate e Resultado do Mês zeravam
  // porque o registro Financeiro era descartado pelo filtro de vendedor
  // ANTES de chegar em cockpitClassificarComercialFinanceiro — a conciliação
  // Comercial↔Financeiro é por CLIENTE (chaveClienteDealModelo), nunca por
  // vendedor/origem (o Financeiro não tem esse conceito aplicável).
  const dealComercial = {
    ID: "1001", COMPANY_ID: "500", ASSIGNED_BY_ID: "1", SOURCE_ID: "CALL",
    _SEMANTICA: "success", _VALOR: 10000, _FECHAMENTO: "2026-08-15",
  };
  const dealFinanceiroDonoDiferente = {
    ID: "2001", COMPANY_ID: "500", ASSIGNED_BY_ID: "999", SOURCE_ID: "",
    _SEMANTICA: "success", _ESTAGIO: "Contrato Assinado", _VALOR: 10000,
  };

  test("sem filtro ativo (Todos/Todas): devolve a lista completa, sem restringir por cliente", () => {
    const resultado = cockpit.cockpitFinanceiroConciliadoComFiltro(
      [dealFinanceiroDonoDiferente], [dealComercial], false
    );
    assert.deepEqual(resultado, [dealFinanceiroDonoDiferente]);
  });

  test("com filtro ativo: mantém o registro Financeiro cujo CLIENTE está nos negócios Comerciais filtrados, mesmo com dono/origem diferentes", () => {
    const dealsComerciaisFiltrados = [dealComercial]; // já filtrado por Vendedor=1
    const resultado = cockpit.cockpitFinanceiroConciliadoComFiltro(
      [dealFinanceiroDonoDiferente], dealsComerciaisFiltrados, true
    );
    assert.deepEqual(resultado, [dealFinanceiroDonoDiferente]);
  });

  test("com filtro ativo: descarta registros Financeiro de clientes que não sobraram no filtro Comercial", () => {
    const outroClienteFinanceiro = { ...dealFinanceiroDonoDiferente, ID: "2002", COMPANY_ID: "777" };
    const resultado = cockpit.cockpitFinanceiroConciliadoComFiltro(
      [dealFinanceiroDonoDiferente, outroClienteFinanceiro], [dealComercial], true
    );
    assert.deepEqual(resultado, [dealFinanceiroDonoDiferente]);
  });

  test("efeito fim-a-fim: com a conciliação por cliente, o negócio é classificado 'ganho' (não 'pendente') mesmo filtrando por vendedor", () => {
    const financeiroConciliado = cockpit.cockpitFinanceiroConciliadoComFiltro(
      [dealFinanceiroDonoDiferente], [dealComercial], true
    );
    const [classificado] = cockpit.cockpitClassificarComercialFinanceiro([dealComercial], financeiroConciliado, null);
    assert.equal(classificado._RESULTADO, "ganho");
  });
});
