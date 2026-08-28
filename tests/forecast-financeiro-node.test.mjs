import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { extrairTextoFuncao, avaliarTrechos } from "./helpers/extrair-funcoes-mjs.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAMINHO_FORECAST = path.join(__dirname, "..", "scripts", "forecast-semanal.mjs");
const codigo = readFileSync(CAMINHO_FORECAST, "utf8");

const nomes = [
  "normalizarTextoChave",
  "parteDataISO",
  "dentroFaixa",
  "classificarSemanticaForecastSemanal",
  "idsCategoriasFinanceiro",
  "ehFechadoFinanceiroForecastSemanal",
  "dataFechamentoFinanceiroForecastSemanal",
  "somarFechadosFinanceiroForecastSemanal",
];

const forecast = avaliarTrechos(nomes.map((nome) => extrairTextoFuncao(codigo, nome)));

function plano(valor) {
  return JSON.parse(JSON.stringify(valor));
}

describe("Forecast Node — descoberta dos funis Financeiro", () => {
  test("encontra Financeiro e Financeiro (Reembolsos), sem incluir outros funis", () => {
    const categorias = [
      { id: 0, name: "Comercial" },
      { id: 20, name: "Financeiro" },
      { id: 44, name: "Financeiro (Reembolsos)" },
      { id: 8, name: "RH" },
    ];
    assert.deepEqual(plano(forecast.idsCategoriasFinanceiro(categorias)), ["20", "44"]);
  });

  test("aceita também chaves ID/NAME e elimina categoria duplicada", () => {
    const categorias = [
      { ID: "20", NAME: "Financeiro" },
      { id: 20, name: "Financeiro" },
    ];
    assert.deepEqual(plano(forecast.idsCategoriasFinanceiro(categorias)), ["20"]);
  });
});

describe("Forecast Node — regra canônica de Fechado/Entregue Financeiro", () => {
  test("Contrato Assinado é fechado mesmo quando STAGE_SEMANTIC_ID está ausente", () => {
    const deal = { ID: "f1", STAGE_SEMANTIC_ID: "" };
    const metaStage = { label: "Contrato Assinado", semantics: "S" };
    assert.equal(forecast.ehFechadoFinanceiroForecastSemanal(deal, metaStage), true);
  });

  test("Negócios Ganhos do Comercial não satisfaz a regra Financeiro só por ser success", () => {
    const deal = { ID: "c1", STAGE_SEMANTIC_ID: "S" };
    const metaStage = { label: "Negócios Ganhos", semantics: "S" };
    assert.equal(forecast.ehFechadoFinanceiroForecastSemanal(deal, metaStage), false);
  });

  test("etapa aberta de assinatura não é confundida com Contrato Assinado", () => {
    const deal = { ID: "f2", STAGE_SEMANTIC_ID: "P" };
    const metaStage = { label: "Aguardando Assinatura de Contrato", semantics: "P" };
    assert.equal(forecast.ehFechadoFinanceiroForecastSemanal(deal, metaStage), false);
  });

  test("usa MOVED_TIME como data principal e DATE_CREATE apenas como fallback", () => {
    assert.equal(
      forecast.dataFechamentoFinanceiroForecastSemanal({ MOVED_TIME: "2026-08-21T10:00:00-03:00", DATE_CREATE: "2026-07-01" }),
      "2026-08-21"
    );
    assert.equal(
      forecast.dataFechamentoFinanceiroForecastSemanal({ MOVED_TIME: "", DATE_CREATE: "2026-07-01T09:00:00-03:00" }),
      "2026-07-01"
    );
  });
});

describe("Forecast Node — soma de Entregue Financeiro no período", () => {
  const metadata = {
    "20": {
      WON: { label: "Contrato Assinado", semantics: "S" },
      NEW: { label: "Análise de Documentos", semantics: "P" },
      WAIT: { label: "Aguardando Assinatura de Contrato", semantics: "P" },
    },
    "44": {
      DONE: { label: "Reembolso Concluído", semantics: "S" },
    },
    "0": {
      WON: { label: "Negócios Ganhos", semantics: "S" },
    },
  };

  const deals = [
    { ID: "1", CATEGORY_ID: "20", STAGE_ID: "WON", STAGE_SEMANTIC_ID: "S", OPPORTUNITY: "1000", MOVED_TIME: "2026-08-05" },
    { ID: "2", CATEGORY_ID: "20", STAGE_ID: "WON", STAGE_SEMANTIC_ID: "", OPPORTUNITY: "2500", MOVED_TIME: "2026-08-20" },
    { ID: "3", CATEGORY_ID: "20", STAGE_ID: "WAIT", STAGE_SEMANTIC_ID: "P", OPPORTUNITY: "9000", MOVED_TIME: "2026-08-20" },
    { ID: "4", CATEGORY_ID: "20", STAGE_ID: "WON", STAGE_SEMANTIC_ID: "S", OPPORTUNITY: "4000", MOVED_TIME: "2026-07-31" },
    { ID: "5", CATEGORY_ID: "44", STAGE_ID: "DONE", STAGE_SEMANTIC_ID: "S", OPPORTUNITY: "800", MOVED_TIME: "2026-08-10" },
    { ID: "6", CATEGORY_ID: "0", STAGE_ID: "WON", STAGE_SEMANTIC_ID: "S", OPPORTUNITY: "7000", MOVED_TIME: "2026-08-10" },
    { ID: "7", CATEGORY_ID: "20", STAGE_ID: "WON", STAGE_SEMANTIC_ID: "S", OPPORTUNITY: "500", MOVED_TIME: "", DATE_CREATE: "2026-08-25" },
  ];

  test("soma somente Contrato Assinado dentro de agosto, pela data de movimento", () => {
    const total = forecast.somarFechadosFinanceiroForecastSemanal(deals, metadata, "2026-08-01", "2026-08-31");
    assert.equal(total, 4000); // 1000 + 2500 + 500
  });

  test("janela semanal respeita os limites inclusivos", () => {
    const total = forecast.somarFechadosFinanceiroForecastSemanal(deals, metadata, "2026-08-17", "2026-08-23");
    assert.equal(total, 2500);
  });

  test("sem deals retorna zero, sem inventar valor", () => {
    assert.equal(forecast.somarFechadosFinanceiroForecastSemanal([], metadata, "2026-08-01", "2026-08-31"), 0);
  });
});
