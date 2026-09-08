import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { carregarScriptClassico } from "./helpers/carregar-script-classico.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAMINHO_CONFIG = path.join(__dirname, "..", "js", "config.js");
const CAMINHO_BITRIX = path.join(__dirname, "..", "js", "bitrix-api.js");
const CAMINHO_JORNADA = path.join(__dirname, "..", "js", "jornada.js");
const CAMINHO_SDR = path.join(__dirname, "..", "js", "sdr.js");
const CAMINHO_CATALOGO = path.join(__dirname, "..", "js", "catalogo-relatorios.js");

const config = carregarScriptClassico(CAMINHO_CONFIG);
const bitrix = carregarScriptClassico(CAMINHO_BITRIX, { contextoExtra: config });
const jornada = carregarScriptClassico(CAMINHO_JORNADA, { contextoExtra: { ...config, ...bitrix } });
const sdr = carregarScriptClassico(CAMINHO_SDR, { contextoExtra: { ...config, ...bitrix, ...jornada } });

const mockMeta = {
  categorias: { "0": "Comercial" },
  estagios: {
    "0": {
      "C0:NEW": { label: "Nova Oportunidade", semantics: "process" },
      "C0:PROPOSAL": { label: "Proposta Enviada", semantics: "process" },
      "C0:WON": { label: "Contrato Assinado", semantics: "success" },
      "C0:LOST": { label: "Perdido - Preço", semantics: "failure" },
    },
  },
};

const mockDeals = [
  // 1. Deal saudável (process)
  {
    ID: "101",
    TITLE: "Empresa Alfa",
    CATEGORY_ID: "0",
    STAGE_ID: "C0:PROPOSAL",
    STAGE_SEMANTIC_ID: "P",
    PROBABILITY: "80",
    OPPORTUNITY: "50000",
    ASSIGNED_BY_ID: "1",
    COMPANY_ID: "10",
    CLOSEDATE: "2026-12-31T00:00:00-03:00",
    DATE_CREATE: "2026-08-01T10:00:00-03:00",
    DATE_MODIFY: "2026-09-01T10:00:00-03:00",
    MOVED_TIME: "2026-09-01T10:00:00-03:00",
    LAST_ACTIVITY_TIME: "2026-09-01T10:00:00-03:00",
  },
  // 2. Deal em risco (sem CLOSEDATE, inativo, aging alto)
  {
    ID: "102",
    TITLE: "Empresa Beta",
    CATEGORY_ID: "0",
    STAGE_ID: "C0:NEW",
    STAGE_SEMANTIC_ID: "P",
    PROBABILITY: "20",
    OPPORTUNITY: "100000",
    ASSIGNED_BY_ID: "2",
    COMPANY_ID: "20",
    CLOSEDATE: "",
    DATE_CREATE: "2026-05-01T10:00:00-03:00",
    DATE_MODIFY: "2026-06-01T10:00:00-03:00",
    MOVED_TIME: "2026-06-01T10:00:00-03:00",
    LAST_ACTIVITY_TIME: "2026-06-01T10:00:00-03:00",
  },
  // 3. Deal ganho
  {
    ID: "103",
    TITLE: "Empresa Gama",
    CATEGORY_ID: "0",
    STAGE_ID: "C0:WON",
    STAGE_SEMANTIC_ID: "S",
    PROBABILITY: "100",
    OPPORTUNITY: "150000",
    ASSIGNED_BY_ID: "1",
    COMPANY_ID: "30",
    CLOSEDATE: "2026-08-15T00:00:00-03:00",
    DATE_CREATE: "2026-08-01T10:00:00-03:00",
    DATE_MODIFY: "2026-08-15T10:00:00-03:00",
    MOVED_TIME: "2026-08-15T10:00:00-03:00",
    LAST_ACTIVITY_TIME: "2026-08-15T10:00:00-03:00",
  },
  // 4. Deal perdido
  {
    ID: "104",
    TITLE: "Empresa Delta",
    CATEGORY_ID: "0",
    STAGE_ID: "C0:LOST",
    STAGE_SEMANTIC_ID: "F",
    PROBABILITY: "0",
    OPPORTUNITY: "80000",
    ASSIGNED_BY_ID: "2",
    COMPANY_ID: "40",
    CLOSEDATE: "2026-08-20T00:00:00-03:00",
    DATE_CREATE: "2026-08-01T10:00:00-03:00",
    DATE_MODIFY: "2026-08-20T10:00:00-03:00",
    MOVED_TIME: "2026-08-20T10:00:00-03:00",
    LAST_ACTIVITY_TIME: "2026-08-20T10:00:00-03:00",
    ADDITIONAL_INFO: "Orçamento estourado",
  },
];

const mockEmpresas = {
  "10": { ID: "10", TITLE: "Empresa Alfa" },
  "20": { ID: "20", TITLE: "Empresa Beta" },
  "30": { ID: "30", TITLE: "Empresa Gama" },
  "40": { ID: "40", TITLE: "Empresa Delta" },
};

const mockElement = {
  style: {},
  classList: { add: () => {}, remove: () => {}, toggle: () => {} },
  textContent: "",
  innerHTML: "",
};

const documentoFake = {
  getElementById: () => mockElement,
  querySelector: () => mockElement,
  querySelectorAll: () => [],
  addEventListener: () => {},
  createElement: () => mockElement,
};

// Códigos reais dos dois campos de "Motivo da Negociação Perdida" no
// Bitrix (ver comentário de CAMPO_MOTIVO_PERDA/CAMPO_MOTIVO_PERDA_ANTIGO em
// js/catalogo-relatorios.js) — hardcoded aqui porque o mock precisa existir
// ANTES de `catalogo` ser carregado (não dá pra referenciar
// catalogo.CAMPO_MOTIVO_PERDA ainda).
const CAMPO_MOTIVO_PERDA_MOCK = "UF_CRM_1582845737741";
const CAMPO_MOTIVO_PERDA_ANTIGO_MOCK = "UF_CRM_6908AECC40696";

const catalogo = carregarScriptClassico(CAMINHO_CATALOGO, {
  contextoExtra: {
    ...config,
    ...bitrix,
    ...jornada,
    ...sdr,
    document: documentoFake,
    esconderErro: () => {},
    atualizarStatus: () => {},
    mostrarErro: (msg) => { console.error("mostrarErro em teste:", msg); },
    buscarMetadadosFunisEEstagios: async () => mockMeta,
    buscarUsuariosJornada: async () => ({}),
    listarCompletoRelatorio: async () => ({ dados: mockDeals }),
    // Card 28 (motivos_ganho_perda) chama buscarEntidadesPorIds duas vezes
    // com propósitos diferentes: "crm.company.list" para enriquecer nome de
    // empresa (mockEmpresas) e "crm.deal.list" para buscar o motivo de
    // perda por negócio (js/catalogo-relatorios.js:1204) — sem distinguir
    // pelo `method`, o segundo uso recebia mockEmpresas por engano.
    buscarEntidadesPorIds: async (webhook, method) => {
      if (method === "crm.deal.list") {
        // Deal 104 (Empresa Delta, perdido) tem o motivo "Orçamento
        // estourado" registrado no campo novo — ID "1" na enumeração
        // devolvida por bitrixFetchComRetentativa abaixo.
        return { "104": { ID: "104", [CAMPO_MOTIVO_PERDA_MOCK]: "1" } };
      }
      return mockEmpresas;
    },
    // motivos_ganho_perda também chama mapaOpcoesEnumeracaoDeal, que faz
    // bitrixFetchComRetentativa direto em crm.deal.fields.json — sem
    // mockar isso, a chamada caía no `fetch` stub do sandbox de teste
    // (sempre rejeita), o card nunca terminava de calcular, e o teste
    // falhava com "fetch indisponível no ambiente de teste" (ver PR de
    // diagnóstico). Mocka só o suficiente pro de-para ID→VALUE do motivo.
    bitrixFetchComRetentativa: async (url) => {
      if (String(url).includes("crm.deal.fields")) {
        return {
          result: {
            [CAMPO_MOTIVO_PERDA_MOCK]: { items: [{ ID: "1", VALUE: "Orçamento estourado" }] },
            [CAMPO_MOTIVO_PERDA_ANTIGO_MOCK]: { items: [] },
          },
        };
      }
      throw new Error(`bitrixFetchComRetentativa não mockado neste teste: ${url}`);
    },
  },
});

describe("AGENTE 06 — Revenue Intelligence (Cards 25, 26, 27 e 28)", () => {
  test("Card 25: opportunity_health_score calcula score 0–100 e decomposição dos 4 pilares", async () => {
    await catalogo.extrairRelatorioCatalogo("https://mock.webhook", "opportunity_health_score");
    const res = catalogo.resultadoRelatorioCatalogo;

    assert.equal(res.chave, "opportunity_health_score");
    assert.equal(res.titulo, "Opportunity Health Score");
    assert.ok(res.kpis.length >= 5, "Deve possuir no mínimo 5 KPIs");
    assert.equal(res.tabelas.length, 1);

    const dados = Array.from(res.tabelas[0].dados);
    assert.equal(dados.length, 2, "Apenas os 2 negócios em aberto devem ser analisados");

    const alfa = dados.find((d) => d.DEAL === "101");
    const beta = dados.find((d) => d.DEAL === "102");

    assert.ok(alfa.SCORE > beta.SCORE, "Deal com atividade e CLOSEDATE deve ter score maior");
    assert.equal(beta.S_DATE, 70, "Sem CLOSEDATE deve penalizar 30 pontos no score de data");
    assert.ok(beta.SCORE < 50, "Deal inativo e sem CLOSEDATE deve estar na faixa crítica");
  });

  test("Card 26: pipeline_velocity calcula velocidade de conversão conforme a fórmula oficial", async () => {
    await catalogo.extrairRelatorioCatalogo("https://mock.webhook", "pipeline_velocity");
    const res = catalogo.resultadoRelatorioCatalogo;

    assert.equal(res.chave, "pipeline_velocity");
    assert.equal(res.titulo, "Pipeline Velocity");
    
    const kpiVelocity = res.kpis.find((k) => k.rotulo.includes("Velocity"));
    const kpiProjecao = res.kpis.find((k) => k.rotulo.includes("Projeção"));
    assert.ok(kpiVelocity, "KPI de Velocity R$/dia deve ser retornado");
    assert.ok(kpiProjecao, "KPI de Projeção Mensal deve ser retornado");

    assert.equal(res.tabelas.length, 1);
    assert.ok(res.tabelas[0].dados.length > 0, "Deve conter tabela de velocity por responsável");
  });

  test("Card 27: receita_em_risco identifica e detalha valor em risco com motivos reais", async () => {
    await catalogo.extrairRelatorioCatalogo("https://mock.webhook", "receita_em_risco");
    const res = catalogo.resultadoRelatorioCatalogo;

    assert.equal(res.chave, "receita_em_risco");
    assert.equal(res.titulo, "Receita em Risco");

    const kpiValorRisco = res.kpis.find((k) => k.rotulo === "Valor em Risco");
    assert.ok(kpiValorRisco);

    const dados = Array.from(res.tabelas[0].dados);
    assert.equal(dados.length, 1, "Apenas o Deal 102 deve ser apontado em risco");
    assert.equal(dados[0].DEAL, "102");
    assert.ok(dados[0].SIT.includes("Sem CLOSEDATE"));
  });

  test("Card 28: motivos_ganho_perda realiza análise viva com campos reais do Bitrix", async () => {
    await catalogo.extrairRelatorioCatalogo("https://mock.webhook", "motivos_ganho_perda");
    const res = catalogo.resultadoRelatorioCatalogo;

    assert.equal(res.chave, "motivos_ganho_perda");
    assert.equal(res.titulo, "Motivos de Ganho e Perda");
    assert.ok(res.kpis.length >= 6);

    const kpiGanhos = res.kpis.find((k) => k.rotulo === "Deals Ganhos");
    const kpiPerdidos = res.kpis.find((k) => k.rotulo === "Deals Perdidos");
    assert.equal(kpiGanhos.valor, 1);
    assert.equal(kpiPerdidos.valor, 1);

    assert.equal(res.tabelas.length, 2, "Deve retornar tabela agrupada de motivos e tabela detalhada");
    
    const agrupado = Array.from(res.tabelas[0].dados);
    const itemPerdido = agrupado.find((r) => r.RESULTADO === "Perdido");
    assert.ok(itemPerdido.MOTIVO_ESTAGIO.includes("Orçamento estourado"), "Deve capturar o ADDITIONAL_INFO como motivo");
  });
});
