import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { carregarScriptClassico } from "./helpers/carregar-script-classico.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAMINHO_BITRIX = path.join(__dirname, "..", "js", "bitrix-api.js");
const CAMINHO_CONFIG = path.join(__dirname, "..", "js", "config.js");
const CAMINHO_JORNADA = path.join(__dirname, "..", "js", "jornada.js");
const CAMINHO_CATALOGO = path.join(__dirname, "..", "js", "catalogo-relatorios.js");

const mockMeta = {
  categorias: { "0": "Comercial" },
  estagios: {
    "0": {
      "NEW": { label: "Nova Oportunidade", semantics: "process" },
      "WON": { label: "Ganho", semantics: "success" },
      "LOST": { label: "Perdido", semantics: "failure" }
    }
  }
};

const mockDeals = [
  {
    ID: "101",
    TITLE: "Negócio Hoje",
    CATEGORY_ID: "0",
    STAGE_ID: "NEW",
    STAGE_SEMANTIC_ID: "P",
    OPPORTUNITY: "10000",
    ASSIGNED_BY_ID: "1",
    DATE_CREATE: "2026-09-02T10:00:00-03:00",
    DATE_MODIFY: "2026-09-02T11:00:00-03:00",
    CLOSEDATE: "2026-09-15",
    COMPANY_ID: "10"
  },
  {
    ID: "102",
    TITLE: "Negócio Vencido",
    CATEGORY_ID: "0",
    STAGE_ID: "NEW",
    STAGE_SEMANTIC_ID: "P",
    OPPORTUNITY: "5000",
    ASSIGNED_BY_ID: "2",
    DATE_CREATE: "2026-08-01T10:00:00-03:00",
    DATE_MODIFY: "2026-09-01T11:00:00-03:00",
    CLOSEDATE: "2026-08-20",
    COMPANY_ID: "20"
  },
  {
    ID: "103",
    TITLE: "Negócio Sem CloseDate",
    CATEGORY_ID: "0",
    STAGE_ID: "NEW",
    STAGE_SEMANTIC_ID: "P",
    OPPORTUNITY: "8000",
    ASSIGNED_BY_ID: "1",
    DATE_CREATE: "2026-09-01T10:00:00-03:00",
    DATE_MODIFY: "2026-09-01T11:00:00-03:00",
    CLOSEDATE: "",
    COMPANY_ID: "30"
  }
];

const mockEmpresas = {
  "10": { ID: "10", TITLE: "Cliente A" },
  "20": { ID: "20", TITLE: "Cliente B" },
  "30": { ID: "30", TITLE: "Cliente C" }
};

const bitrix = carregarScriptClassico(CAMINHO_BITRIX);
const config = carregarScriptClassico(CAMINHO_CONFIG);
const jornada = carregarScriptClassico(CAMINHO_JORNADA, { contextoExtra: { ...bitrix, ...config } });

const elementStubs = {
  spinner: { style: {} },
  btnExtrair: { disabled: false },
  btnParar: { disabled: false },
  dataInicio: { value: "2026-09-01" },
  dataFim: { value: "2026-09-02" },
  "bloco-relatorio-catalogo": { classList: { add: () => {}, remove: () => {} } },
  relatorioResultadoTitulo: { textContent: "" },
  relatorioResultadoSubtitulo: { innerHTML: "" },
  relatorioResultadoKpis: { innerHTML: "" },
  relatorioResultadoTabelas: { innerHTML: "" },
  relatorioResultadoNota: { textContent: "" },
};

const documentoFake = {
  getElementById: (id) => elementStubs[id] || { value: "", classList: { add: () => {}, remove: () => {}, toggle: () => {} } },
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  createElement: () => ({ style: {}, classList: { add: () => {}, remove: () => {}, toggle: () => {} } }),
};

function criarContextoTestesPipeline() {
  return carregarScriptClassico(CAMINHO_CATALOGO, {
    contextoExtra: {
      ...bitrix,
      ...config,
      ...jornada,
      document: documentoFake,
      esconderErro: () => {},
      atualizarStatus: () => {},
      mostrarErro: (msg) => { console.error("mostrarErro em teste:", msg); },
      buscarMetadadosFunisEEstagios: async () => mockMeta,
      buscarUsuariosJornada: async () => ({ "1": { NAME: "Vendedor A" }, "2": { NAME: "Vendedor B" } }),
      listarCompletoRelatorio: async () => ({ dados: mockDeals }),
      buscarEntidadesPorIds: async () => mockEmpresas,
      ehEstagioPiloto: () => false,
    }
  });
}

describe("Agente 05 — Card 21: pipeline_novo_gerado", () => {
  test("calcula pipeline criado hoje, na semana e no mês sem mutar Date", async () => {
    const catalogo = criarContextoTestesPipeline();
    await catalogo.extrairRelatorioCatalogo("https://mock.webhook", "pipeline_novo_gerado");
    const res = catalogo.resultadoRelatorioCatalogo;
    assert.equal(res.chave, "pipeline_novo_gerado");
    assert.ok(res.kpis.some(k => k.rotulo === "Criado Hoje"));
    assert.ok(res.kpis.some(k => k.rotulo === "Criado Semana"));
    assert.ok(res.kpis.some(k => k.rotulo === "Criado Mês"));
  });
});

describe("Agente 05 — Card 22: pipeline_carryover", () => {
  test("identifica negócios postergados e trata histórico snapshot com projecaoMes/fechadoMes", async () => {
    const catalogo = criarContextoTestesPipeline();
    catalogo.carregarHistoricoCompartilhadoForecast = async () => [
      { data: "2026-08-21", projecaoMes: 15000, fechadoMes: 5000 }
    ];
    catalogo.carregarHistoricoForecastLocal = () => [];
    catalogo.mesclarHistoricosForecast = (c, l) => [...c, ...l];

    await catalogo.extrairRelatorioCatalogo("https://mock.webhook", "pipeline_carryover");
    const res = catalogo.resultadoRelatorioCatalogo;
    assert.equal(res.chave, "pipeline_carryover");
    assert.ok(res.kpis.some(k => k.rotulo === "Negócios Postergados"));
    assert.ok(res.kpis.some(k => k.rotulo === "Histórico Projeção" && k.valor !== "NaN" && k.valor !== "R$ NaN"));
    assert.ok(res.kpis.some(k => k.rotulo === "Histórico Fechado" && k.valor !== "NaN" && k.valor !== "R$ NaN"));
  });

  test("trata ausência de histórico com mensagem amigável e sem NaN", async () => {
    const catalogo = criarContextoTestesPipeline();
    catalogo.carregarHistoricoCompartilhadoForecast = async () => [];
    await catalogo.extrairRelatorioCatalogo("https://mock.webhook", "pipeline_carryover");
    const res = catalogo.resultadoRelatorioCatalogo;
    assert.equal(res.chave, "pipeline_carryover");
    const kpiProj = res.kpis.find(k => k.rotulo === "Histórico Projeção");
    assert.equal(kpiProj.valor, "Dados históricos insuficientes");
  });
});

describe("Agente 05 — Card 23: closedate_intelligence", () => {
  test("categoriza oportunidades em vencidas, sem data e no mês", async () => {
    const catalogo = criarContextoTestesPipeline();
    await catalogo.extrairRelatorioCatalogo("https://mock.webhook", "closedate_intelligence");
    const res = catalogo.resultadoRelatorioCatalogo;
    assert.equal(res.chave, "closedate_intelligence");
    assert.ok(res.kpis.some(k => k.rotulo === "Vencidas" && Number(k.valor) >= 1));
    assert.ok(res.kpis.some(k => k.rotulo === "Sem Data" && Number(k.valor) >= 1));
    assert.ok(res.kpis.some(k => k.rotulo === "Vence no Mês" && Number(k.valor) >= 0));
  });
});

describe("Agente 05 — Card 24: forecast_accuracy", () => {
  test("calcula acurácia comparando projecaoMes vs fechadoMes do histórico", async () => {
    const catalogo = criarContextoTestesPipeline();
    catalogo.carregarHistoricoCompartilhadoForecast = async () => [
      { data: "2026-08-21", projecaoMes: 10000, fechadoMes: 8000 }
    ];
    catalogo.carregarHistoricoForecastLocal = () => [];
    catalogo.mesclarHistoricosForecast = (c, l) => [...c, ...l];

    await catalogo.extrairRelatorioCatalogo("https://mock.webhook", "forecast_accuracy");
    const res = catalogo.resultadoRelatorioCatalogo;
    assert.equal(res.chave, "forecast_accuracy");
    const kpiAcc = res.kpis.find(k => k.rotulo === "Accuracy");
    assert.equal(kpiAcc.valor, "80%");
  });

  test("trata ausência de histórico com mensagem amigável sem quebrar", async () => {
    const catalogo = criarContextoTestesPipeline();
    catalogo.carregarHistoricoCompartilhadoForecast = async () => [];
    await catalogo.extrairRelatorioCatalogo("https://mock.webhook", "forecast_accuracy");
    const res = catalogo.resultadoRelatorioCatalogo;
    assert.equal(res.chave, "forecast_accuracy");
    const kpiAcc = res.kpis.find(k => k.rotulo === "Accuracy");
    assert.equal(kpiAcc.valor, "Dados históricos insuficientes");
    assert.ok(res.nota.includes("Dados históricos insuficientes"));
  });
});
