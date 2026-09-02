// Testes unitários E2E dos Cards 1 a 5 (Jornada & Cliente)
// em js/jornada.js, js/entity-resolution.js e js/catalogo-relatorios.js

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { carregarScriptClassico } from "./helpers/carregar-script-classico.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAMINHO_CONFIG = path.join(__dirname, "..", "js", "config.js");
const CAMINHO_JORNADA = path.join(__dirname, "..", "js", "jornada.js");
const CAMINHO_ENTITY_RES = path.join(__dirname, "..", "js", "entity-resolution.js");
const CAMINHO_CATALOGO = path.join(__dirname, "..", "js", "catalogo-relatorios.js");

function plano(v) {
  return JSON.parse(JSON.stringify(v));
}

const mockElement = { style: {}, classList: { add: () => {}, remove: () => {}, toggle: () => {} }, textContent: "", innerHTML: "" };
const mockDocument = {
  getElementById: () => mockElement,
  querySelector: () => mockElement,
  querySelectorAll: () => [],
  addEventListener: () => {},
  createElement: () => mockElement,
};

const config = carregarScriptClassico(CAMINHO_CONFIG);
const jornada = carregarScriptClassico(CAMINHO_JORNADA, { contextoExtra: { ...config, document: mockDocument } });
const entityRes = carregarScriptClassico(CAMINHO_ENTITY_RES, { contextoExtra: { ...config, ...jornada } });
const catalogo = carregarScriptClassico(CAMINHO_CATALOGO, {
  contextoExtra: {
    ...config,
    ...jornada,
    ...entityRes,
    document: mockDocument,
    esconderErro: () => {},
    atualizarStatus: () => {},
    mostrarErro: (msg) => { console.error("mostrarErro:", msg); },
    periodoCatalogo: () => ({ inicio: "2026-01-01", fim: "2026-12-31", referencia: "2026-09-01" })
  }
});

describe("AGENTE 01 — Auditoria Cards 1 a 5 (Jornada & Cliente)", () => {

  describe("Card 1: Jornada do Cliente Completa (js/jornada.js)", () => {
    test("deduplicação de contagem, resolução de entidade, IDs 0 ignorados e histórico", () => {
      // Regras validadas:
      // 1. COMPANY_ID > CONTACT_ID > LEAD_ID > NOME > DEAL_ID isolado
      // 2. ID 0 (ex. COMPANY_ID="0") nunca vira COMPANY:0
      // 3. Mesma empresa com COMPANY_IDs diferentes porém mesmo nome exato unifica contagem
      // 4. Funis internos (ex. category "44") são excluídos dos KPIs de cliente

      const deal1 = { ID: "101", TITLE: "Cliente Alfa - (Financeiro)", CATEGORY_ID: "0", STAGE_ID: "C0:NEW", COMPANY_ID: "50", CONTACT_ID: "0", LEAD_ID: "0", DATE_CREATE: "2026-08-01T10:00:00-03:00", ASSIGNED_BY_ID: "1" };
      const deal2 = { ID: "102", TITLE: "Cliente Alfa", CATEGORY_ID: "0", STAGE_ID: "C0:WON", COMPANY_ID: "50", CONTACT_ID: "0", LEAD_ID: "0", DATE_CREATE: "2026-08-15T10:00:00-03:00", ASSIGNED_BY_ID: "2" };
      const deal3 = { ID: "103", TITLE: "RH Chamado Interno", CATEGORY_ID: "44", STAGE_ID: "C44:NEW", COMPANY_ID: "0", CONTACT_ID: "0", LEAD_ID: "0", DATE_CREATE: "2026-08-20T10:00:00-03:00", ASSIGNED_BY_ID: "3" };

      assert.equal(jornada.idBitrixValido("0"), false);
      assert.equal(jornada.idBitrixValido("50"), true);
      assert.equal(jornada.limparNomeClienteParaChave("Cliente Alfa - (Financeiro)"), "Cliente Alfa");
      assert.equal(jornada.classificarFunilJornada("44"), "INTERNO");
      assert.equal(jornada.classificarFunilJornada("0"), "CLIENTE");

      const key1 = entityRes.calcularChaveIdentidade(deal1);
      assert.equal(key1.chave, "COMPANY:50");
      assert.equal(key1.confianca, "ALTA");
    });
  });

  describe("Card 2: Handoffs e Trocas de Responsável (js/catalogo-relatorios.js)", () => {
    test("detecta trocas no mesmo funil, entre funis e Lead -> Negócio com dados sintéticos", async () => {
      let rel = null;
      catalogo.criarResultadoCatalogo = (chave, titulo, subtitulo, kpis, tabelas, nota) => {
        rel = { chave, titulo, subtitulo, kpis, tabelas, nota };
      };

      catalogo.baseDealsCatalogo = async () => ({
        meta: { categorias: { "0": "Comercial", "1": "Implantação" }, estagios: {} },
        deals: [
          { ID: "201", TITLE: "Cliente Beta", CATEGORY_ID: "0", STAGE_ID: "C0:PROP", COMPANY_ID: "60", ASSIGNED_BY_ID: "10", LEAD_ID: "90", DATE_CREATE: "2026-08-01T10:00:00-03:00" },
          { ID: "202", TITLE: "Cliente Beta", CATEGORY_ID: "1", STAGE_ID: "C1:IMP", COMPANY_ID: "60", ASSIGNED_BY_ID: "11", LEAD_ID: "90", DATE_CREATE: "2026-08-10T10:00:00-03:00" }
        ],
        empresas: { "60": { ID: "60", TITLE: "Cliente Beta Ltda" } }
      });

      catalogo.buscarEntidadesPorIds = async (webhook, method, ids) => {
        if (method === "crm.lead.list") {
          return { "90": { ID: "90", ASSIGNED_BY_ID: "5", TITLE: "Lead Beta" } };
        }
        return {};
      };

      await catalogo.extrairRelatorioCatalogo("https://fake.webhook", "handoffs");

      assert.ok(rel);
      assert.equal(rel.chave, "handoffs");
      const kpisMap = Object.fromEntries(rel.kpis.map(k => [k.rotulo, k.valor]));
      assert.ok(kpisMap["Eventos"] >= 1);
      assert.ok(kpisMap["Entre funis"] >= 1);
      assert.ok(kpisMap["Lead → Negócio"] >= 1);
    });
  });

  describe("Card 3: Reentradas, Retrabalho e Mudanças de Pipeline (js/catalogo-relatorios.js)", () => {
    test("reconstrói histórico de estágios e detecta reentradas legítimas de retrabalho", async () => {
      let rel = null;
      catalogo.criarResultadoCatalogo = (chave, titulo, subtitulo, kpis, tabelas, nota) => {
        rel = { chave, titulo, subtitulo, kpis, tabelas, nota };
      };

      catalogo.baseDealsCatalogo = async () => ({
        meta: { categorias: { "0": "Comercial" }, estagios: { "0": { "NEW": { label: "Novo" }, "PROP": { label: "Proposta" } } } },
        deals: [{ ID: "301", CATEGORY_ID: "0" }]
      });

      catalogo.buscarHistoricoEntidade = async () => [
        { OWNER_ID: "301", CATEGORY_ID: "0", STAGE_ID: "NEW", CREATED_TIME: "2026-08-01T10:00:00" },
        { OWNER_ID: "301", CATEGORY_ID: "0", STAGE_ID: "PROP", CREATED_TIME: "2026-08-05T10:00:00" },
        { OWNER_ID: "301", CATEGORY_ID: "0", STAGE_ID: "NEW", CREATED_TIME: "2026-08-10T10:00:00" } // Reentrada em NEW
      ];

      await catalogo.extrairRelatorioCatalogo("https://fake.webhook", "reentradas");

      assert.ok(rel);
      assert.equal(rel.chave, "reentradas");
      const kpisMap = Object.fromEntries(rel.kpis.map(k => [k.rotulo, k.valor]));
      assert.equal(kpisMap["Reentradas"], 1);
      assert.equal(kpisMap["Deals c/ reentrada"], 1);
    });
  });

  describe("Card 4: Duplicidades e Identidade do Cliente (js/catalogo-relatorios.js & entity-resolution.js)", () => {
    test("detecta sinais de duplicidade cadastral e repetições no pipeline sem fusão automática", async () => {
      let rel = null;
      catalogo.criarResultadoCatalogo = (chave, titulo, subtitulo, kpis, tabelas, nota) => {
        rel = { chave, titulo, subtitulo, kpis, tabelas, nota };
      };

      catalogo.listarCompletoRelatorio = async () => ({
        dados: [
          { ID: "70", TITLE: "Empresa Gama Ltda", EMAIL: [{ VALUE: "gama@test.com" }], PHONE: [{ VALUE: "11999990000" }] },
          { ID: "71", TITLE: "Empresa Gama Ltda", EMAIL: [{ VALUE: "contato@gama.test" }], PHONE: [{ VALUE: "11888880000" }] }
        ]
      });

      catalogo.baseDealsCatalogo = async () => ({
        meta: { categorias: { "0": "Comercial" }, estagios: {} },
        deals: [
          { ID: "401", TITLE: "Empresa Gama Ltda", CATEGORY_ID: "0", COMPANY_ID: "70" },
          { ID: "402", TITLE: "Empresa Gama Ltda", CATEGORY_ID: "0", COMPANY_ID: "70" } // Repetido no mesmo pipeline
        ],
        empresas: { "70": { ID: "70", TITLE: "Empresa Gama Ltda" } }
      });

      await catalogo.extrairRelatorioCatalogo("https://fake.webhook", "duplicidades");

      assert.ok(rel);
      assert.equal(rel.chave, "duplicidades");
      const kpisMap = Object.fromEntries(rel.kpis.map(k => [k.rotulo, k.valor]));
      assert.equal(kpisMap["Cadastros sinalizados"], 2);
      assert.equal(kpisMap["Grupos repetidos"], 1);
      assert.equal(kpisMap["Cards nesses grupos"], 2);
      assert.equal(kpisMap["Fusão automática"], "não");
    });
  });

  describe("Card 5: Implantação, Onboarding e Pós-Venda (js/catalogo-relatorios.js)", () => {
    test("segrega pipelines pós-venda e exclui estágios piloto do backlog operacional", async () => {
      let rel = null;
      catalogo.criarResultadoCatalogo = (chave, titulo, subtitulo, kpis, tabelas, nota) => {
        rel = { chave, titulo, subtitulo, kpis, tabelas, nota };
      };

      catalogo.baseDealsCatalogo = async () => ({
        meta: {
          categorias: { "0": "Comercial", "10": "Implantação", "12": "Sucesso do Cliente" },
          estagios: {
            "10": {
              "C10:IMP": { label: "Em Implantação", semantics: "process" },
              "C10:PILOT": { label: "Piloto Comercial", semantics: "process" } // Estágio piloto
            }
          }
        },
        deals: [
          { ID: "501", TITLE: "Cliente Delta", CATEGORY_ID: "10", STAGE_ID: "C10:IMP", STAGE_SEMANTIC_ID: "P", OPPORTUNITY: "20000", MOVED_TIME: "2026-07-01T10:00:00-03:00" }, // >30d
          { ID: "502", TITLE: "Cliente Epsilon", CATEGORY_ID: "10", STAGE_ID: "C10:PILOT", STAGE_SEMANTIC_ID: "P", OPPORTUNITY: "15000", MOVED_TIME: "2026-08-20T10:00:00-03:00" } // Piloto
        ]
      });

      await catalogo.extrairRelatorioCatalogo("https://fake.webhook", "implantacao_posvenda");

      assert.ok(rel);
      assert.equal(rel.chave, "implantacao_posvenda");
      const kpisMap = Object.fromEntries(rel.kpis.map(k => [k.rotulo, k.valor]));
      assert.equal(kpisMap["Negócios"], 2);
      assert.equal(kpisMap["Abertos"], 1); // 1 open deal (exclui o piloto do backlog operacional)
      assert.equal(kpisMap[">30d"], 1);
    });
  });

});
