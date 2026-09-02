import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";
import { extrairTextoFuncao, extrairTrechoEntreAncoras, avaliarTrechos } from "./helpers/extrair-funcoes-mjs.mjs";

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

describe("Financeiro × Comercial — persistência local e suporte a múltiplas NFs (js/financeiro.js)", () => {
  const CAMINHO_FINANCEIRO = path.join(__dirname, "..", "js", "financeiro.js");

  function criarAmbienteFinanceiro(empresa = "atlasgr") {
    const memoryStorage = new Map();
    const docFake = {
      documentElement: {
        getAttribute: (attr) => (attr === "data-empresa" ? empresa : null),
      },
    };
    const storageFake = {
      getItem: (key) => memoryStorage.get(key) || null,
      setItem: (key, val) => memoryStorage.set(key, String(val)),
      removeItem: (key) => memoryStorage.delete(key),
    };
    const code = readFileSync(CAMINHO_FINANCEIRO, "utf8");
    const sandbox = {
      console,
      document: docFake,
      localStorage: storageFake,
      crypto: {
        randomUUID: () => `uuid-${Math.random().toString(36).substring(2, 9)}`,
      },
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;

    const contexto = vm.createContext(sandbox);
    vm.runInContext(code, contexto, { filename: CAMINHO_FINANCEIRO });
    return { contexto, memoryStorage };
  }

  test("getChaveFaturamentos isola os dados de acordo com a empresa ativa", () => {
    const { contexto: ctxAtlas } = criarAmbienteFinanceiro("atlasgr");
    assert.equal(ctxAtlas.getChaveFaturamentos(), "atlas-extrator-faturamentos");

    const { contexto: ctxTotal } = criarAmbienteFinanceiro("totaltrac");
    assert.equal(ctxTotal.getChaveFaturamentos(), "atlas-extrator-faturamentos__totaltrac");
  });

  test("suporta múltiplos faturamentos (múltiplas NFs) e faturamento parcial para o mesmo negócio", () => {
    const { contexto } = criarAmbienteFinanceiro("atlasgr");

    // NF 1: Faturamento parcial (R$ 3.000 de um contrato de R$ 10.000)
    ctxContextoSave(contexto, {
      bitrix_id: "deal-100",
      cliente: "Cliente ABC",
      valor_vendido: 10000,
      valor_faturado: 3000,
      numero_nf: "NF-001",
      data_faturamento: "2026-08-10",
    });

    // NF 2: Segundo faturamento parcial no mesmo deal (R$ 4.000)
    ctxContextoSave(contexto, {
      bitrix_id: "deal-100",
      cliente: "Cliente ABC",
      valor_vendido: 10000,
      valor_faturado: 4000,
      numero_nf: "NF-002",
      data_faturamento: "2026-08-20",
    });

    const faturamentos = contexto.getFaturamentosPorNegocio("deal-100");
    assert.equal(faturamentos.length, 2);

    const agrupado = contexto.agruparFaturamentosPorNegocio();
    assert.equal(agrupado["deal-100"].faturado, 7000);
    assert.equal(agrupado["deal-100"].nfs, 2);

    const saldoPendente = Math.max(0, 10000 - agrupado["deal-100"].faturado);
    assert.equal(saldoPendente, 3000);
  });
});

function ctxContextoSave(ctx, obj) {
  ctx.saveFaturamento(obj);
}

describe("Financeiro × Comercial — documentação de dependência do localStorage e classificação B/C", () => {
  const CAMINHO_CATALOGO = path.join(__dirname, "..", "js", "catalogo-relatorios.js");
  const codigoCatalogo = readFileSync(CAMINHO_CATALOGO, "utf8");

  test("Card 49 (vendido_faturado) contém ressalva explícita de localStorage e classificação B/C (nunca A)", () => {
    const trechoVendidoFaturado = extrairTrechoEntreAncoras(
      codigoCatalogo,
      'else if(chave==="vendido_faturado"){',
      'else if(chave==="backlog_financeiro"){'
    );
    assert.match(trechoVendidoFaturado, /localStorage/i);
    assert.match(trechoVendidoFaturado, /Classe B\/C/i);
    assert.match(trechoVendidoFaturado, /nunca Classe A/i);
    assert.match(trechoVendidoFaturado, /PostgreSQL \/ camada Bronze/i);
  });

  test("Card 50 (backlog_financeiro) contém ressalva explícita de localStorage e classificação B/C (nunca A)", () => {
    const trechoBacklog = extrairTrechoEntreAncoras(
      codigoCatalogo,
      'else if(chave==="backlog_financeiro"){',
      'else if(chave==="qualidade_crm"){'
    );
    assert.match(trechoBacklog, /localStorage/i);
    assert.match(trechoBacklog, /Classe B\/C/i);
    assert.match(trechoBacklog, /nunca Classe A/i);
    assert.match(trechoBacklog, /PostgreSQL \/ camada Bronze/i);
  });
});

