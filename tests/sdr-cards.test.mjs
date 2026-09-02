// Testes unitários dos Cards 34 a 40 (SDR & Leads) em js/catalogo-relatorios.js
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

const mockElement = { style: {}, classList: { add: () => {}, remove: () => {}, toggle: () => {} }, textContent: "", innerHTML: "" };
const mockDocument = {
  getElementById: () => mockElement,
  querySelector: () => mockElement,
  querySelectorAll: () => [],
  addEventListener: () => {},
  createElement: () => mockElement,
};

const config = carregarScriptClassico(CAMINHO_CONFIG);
const bitrix = carregarScriptClassico(CAMINHO_BITRIX, { contextoExtra: config });
const jornada = carregarScriptClassico(CAMINHO_JORNADA, { contextoExtra: { ...config, ...bitrix } });
const sdr = carregarScriptClassico(CAMINHO_SDR, { contextoExtra: { ...config, ...bitrix, ...jornada, mapaUsuariosJornada: {} } });
const catalogo = carregarScriptClassico(CAMINHO_CATALOGO, {
  contextoExtra: {
    ...config,
    ...bitrix,
    ...jornada,
    ...sdr,
    RELATORIOS: config.RELATORIOS || {},
    TIPOS_ATIVIDADE_BITRIX: bitrix.TIPOS_ATIVIDADE_BITRIX || config.TIPOS_ATIVIDADE_BITRIX || {},
    mapaUsuariosJornada: {},
    document: mockDocument,
    esconderErro: () => {},
    mostrarErro: (msg) => { throw new Error(msg); },
    atualizarStatus: () => {},
    periodoCatalogo: () => ({ referencia: "2026-09-01", inicio: "2026-09-01", fim: "2026-09-02" }),
    periodoFiltroCatalogo: () => ({ referencia: "2026-09-01", inicio: "2026-09-01", fim: "2026-09-02" }),
  }
});

describe("Cards 34 a 40 — SDR & Leads (js/catalogo-relatorios.js)", () => {
  describe("resumoReunioesFunilRelatorio & No-Show", () => {
    test("não considera atividade COMPLETED=N automaticamente como no-show", () => {
      const baseMock = {
        reunioes: [
          { ID: "101", SUBJECT: "Reunião Comercial", COMPLETED: "N", RESPONSIBLE_ID: "5", START_TIME: "2026-09-01T10:00:00", END_TIME: "2026-09-01T11:00:00" },
          { ID: "102", SUBJECT: "Reunião alinhamento - no show", COMPLETED: "N", RESPONSIBLE_ID: "5", START_TIME: "2026-09-01T14:00:00", END_TIME: "2026-09-01T15:00:00" },
          { ID: "103", SUBJECT: "Apresentação de solução", COMPLETED: "Y", RESPONSIBLE_ID: "5", START_TIME: "2026-09-01T16:00:00", END_TIME: "2026-09-01T17:00:00" }
        ],
        meta: { categorias: {}, estagios: {} },
        mapaDeals: {},
        eventosEstagioLead: [
          { ID: "1", LEAD_ID: "501", STATUS_ID: "C1_NO_SHOW", ETAPA: "No-Show", CRIADO: "2026-09-01T12:00:00" }
        ],
        mapaLeadsResponsavel: { "501": { responsavelId: "5", titulo: "Empresa ABC" } }
      };

      const resumo = catalogo.resumoReunioesFunilRelatorio(baseMock);
      assert.equal(resumo.linhas.length, 4);
      assert.equal(resumo.agendadas.length, 1); // Apenas ID 101 é agendada pendente
      assert.equal(resumo.realizadas.length, 1); // ID 103 é realizada
      assert.equal(resumo.noShow.length, 2); // ID 102 (marcação no assunto) + evento de etapa No-Show
    });
  });

  describe("Card 34 — Auditoria SDR", () => {
    test("audita leads e atividades verificando completude e faltantes sem erros", async () => {
      let relatorioResultado = null;
      catalogo.criarResultadoCatalogo = (chave, titulo, subtitulo, kpis, tabelas, nota) => {
        relatorioResultado = { chave, titulo, subtitulo, kpis, tabelas, nota };
      };

      catalogo.baseLeadsCatalogo = async () => ({
        leads: [
          { ID: "101", DATE_CREATE: "2026-09-01T08:00:00-03:00", STATUS_ID: "NEW", ASSIGNED_BY_ID: "1", SOURCE_ID: "WEB", PHONE: [{ VALUE: "1199999" }] }
        ],
        statusMap: {}
      });

      catalogo.atividadesCatalogo = async () => ({
        dados: [
          { ID: "1", COMPLETED: "Y", SUBJECT: "Ligação realizada", BINDINGS: [{ OWNER_TYPE_ID: "1", OWNER_ID: "101" }] }
        ]
      });

      await catalogo.extrairRelatorioCatalogo("https://fake.webhook", "auditoria_sdr");

      assert.equal(relatorioResultado.chave, "auditoria_sdr");
      assert.equal(relatorioResultado.titulo, "Auditoria SDR • validar dados e plano");
    });
  });

  describe("Card 35 — Decisão Final SDR", () => {
    test("classifica leads estagnados por ação recomendada", async () => {
      let relatorioResultado = null;
      catalogo.criarResultadoCatalogo = (chave, titulo, subtitulo, kpis, tabelas, nota) => {
        relatorioResultado = { chave, titulo, subtitulo, kpis, tabelas, nota };
      };

      catalogo.baseLeadsCatalogo = async () => ({
        leads: [
          { ID: "201", TITLE: "Lead Parado", STATUS_ID: "IN_PROCESS", DATE_CREATE: "2026-01-01T08:00:00-03:00", MOVED_TIME: "2026-01-01T08:00:00-03:00", ASSIGNED_BY_ID: "1" }
        ],
        statusMap: {}
      });

      catalogo.atividadesCatalogo = async () => ({ dados: [] });

      await catalogo.extrairRelatorioCatalogo("https://fake.webhook", "decisao_final_sdr");

      assert.equal(relatorioResultado.chave, "decisao_final_sdr");
      assert.equal(relatorioResultado.titulo, "Decisão Final SDR • saneamento seguro");
    });
  });

  describe("Card 37 — Meeting Rate", () => {
    test("reutiliza motor de buscarReunioesFunilRelatorio e contabiliza agendadas e realizadas", async () => {
      let relatorioResultado = null;
      catalogo.criarResultadoCatalogo = (chave, titulo, subtitulo, kpis, tabelas, nota) => {
        relatorioResultado = { chave, titulo, subtitulo, kpis, tabelas, nota };
      };

      catalogo.buscarReunioesFunilRelatorio = async () => ({
        reunioes: [
          { ID: "1", SUBJECT: "Reunião de Diagnóstico", COMPLETED: "N", RESPONSIBLE_ID: "2", BINDINGS: [{ OWNER_TYPE_ID: "1", OWNER_ID: "201" }] },
          { ID: "2", SUBJECT: "Demonstração", COMPLETED: "Y", RESPONSIBLE_ID: "2", BINDINGS: [{ OWNER_TYPE_ID: "1", OWNER_ID: "202" }] }
        ],
        meta: { categorias: {}, estagios: {} },
        mapaDeals: {},
        eventosEstagioLead: [],
        mapaLeadsResponsavel: {}
      });

      catalogo.atividadesCatalogo = async () => ({
        dados: [
          { ID: "1", RESPONSIBLE_ID: "2", BINDINGS: [{ OWNER_TYPE_ID: "1", OWNER_ID: "201" }] },
          { ID: "2", RESPONSIBLE_ID: "2", BINDINGS: [{ OWNER_TYPE_ID: "1", OWNER_ID: "202" }] }
        ]
      });

      await catalogo.extrairRelatorioCatalogo("https://fake.webhook", "meeting_rate");

      assert.equal(relatorioResultado.chave, "meeting_rate");
      const kpisMap = Object.fromEntries(relatorioResultado.kpis.map(k => [k.rotulo, k.valor]));
      assert.equal(kpisMap["Reuniões Agendadas"], 2);
      assert.equal(kpisMap["Reuniões Realizadas"], 1);
      assert.equal(kpisMap["Show Rate"], "50%");
    });
  });

  describe("Card 38 — No-show SDR", () => {
    test("integra com buscarReunioesFunilRelatorio e detecta no-shows reais e recuperados", async () => {
      let relatorioResultado = null;
      catalogo.criarResultadoCatalogo = (chave, titulo, subtitulo, kpis, tabelas, nota) => {
        relatorioResultado = { chave, titulo, subtitulo, kpis, tabelas, nota };
      };

      catalogo.buscarReunioesFunilRelatorio = async () => ({
        reunioes: [
          { ID: "10", SUBJECT: "Reunião no show", COMPLETED: "N", RESPONSIBLE_ID: "3", START_TIME: "2026-09-01T10:00:00" },
          { ID: "11", SUBJECT: "Reunião no show", COMPLETED: "Y", RESPONSIBLE_ID: "3", START_TIME: "2026-09-02T10:00:00" }
        ],
        meta: { categorias: {}, estagios: {} },
        mapaDeals: {},
        eventosEstagioLead: [],
        mapaLeadsResponsavel: {}
      });

      await catalogo.extrairRelatorioCatalogo("https://fake.webhook", "no_show_sdr");

      assert.equal(relatorioResultado.chave, "no_show_sdr");
      const kpisMap = Object.fromEntries(relatorioResultado.kpis.map(k => [k.rotulo, k.valor]));
      assert.equal(kpisMap["Agendadas (Total)"], 2);
      assert.equal(kpisMap["No-show"], 1);
      assert.equal(kpisMap["Realizadas"], 1);
      assert.equal(kpisMap["Recuperadas"], 1);
    });
  });

  describe("Card 36 — Contact Rate", () => {
    test("calcula proporção de contatos efetivos sobre leads trabalhados", async () => {
      let relatorioResultado = null;
      catalogo.criarResultadoCatalogo = (chave, titulo, subtitulo, kpis, tabelas, nota) => {
        relatorioResultado = { chave, titulo, subtitulo, kpis, tabelas, nota };
      };

      catalogo.atividadesCatalogo = async () => ({
        dados: [
          { ID: "1", COMPLETED: "Y", TYPE_ID: "2", BINDINGS: [{ OWNER_TYPE_ID: "1", OWNER_ID: "301" }] },
          { ID: "2", COMPLETED: "N", TYPE_ID: "2", BINDINGS: [{ OWNER_TYPE_ID: "1", OWNER_ID: "302" }] }
        ]
      });

      await catalogo.extrairRelatorioCatalogo("https://fake.webhook", "contact_rate");

      assert.equal(relatorioResultado.chave, "contact_rate");
      const kpisMap = Object.fromEntries(relatorioResultado.kpis.map(k => [k.rotulo, k.valor]));
      assert.equal(kpisMap["Leads Trabalhados"], 2);
      assert.equal(kpisMap["Contatos Efetivos"], 1);
      assert.equal(kpisMap["Contact Rate"], "50%");
    });
  });

  describe("Card 39 — Tentativas até Conversão", () => {
    test("calcula média e métricas de tentativas até contato, reunião e oportunidade", async () => {
      let relatorioResultado = null;
      catalogo.criarResultadoCatalogo = (chave, titulo, subtitulo, kpis, tabelas, nota) => {
        relatorioResultado = { chave, titulo, subtitulo, kpis, tabelas, nota };
      };

      catalogo.baseLeadsCatalogo = async () => ({
        leads: [
          { ID: "501", DATE_CREATE: "2026-09-01T08:00:00-03:00" }
        ]
      });

      catalogo.baseDealsCatalogo = async () => ({
        deals: [
          { ID: "801", LEAD_ID: "501", DATE_CREATE: "2026-09-02T10:00:00-03:00" }
        ]
      });

      catalogo.atividadesCatalogo = async () => ({
        dados: [
          { ID: "1", COMPLETED: "Y", TYPE_ID: "2", CREATED: "2026-09-01T09:00:00-03:00", END_TIME: "2026-09-01T09:10:00-03:00", BINDINGS: [{ OWNER_TYPE_ID: "1", OWNER_ID: "501" }] }
        ]
      });

      await catalogo.extrairRelatorioCatalogo("https://fake.webhook", "tentativas_conversao");

      assert.equal(relatorioResultado.chave, "tentativas_conversao");
      const kpisMap = Object.fromEntries(relatorioResultado.kpis.map(k => [k.rotulo, k.valor]));
      assert.equal(kpisMap["Contatos"], 1);
      assert.equal(kpisMap["Média (Contato)"], 1);
    });
  });

  describe("Card 40 — Receita SDR", () => {
    test("soma receita de oportunidades ganhas originadas por leads trabalhados por SDR", async () => {
      let relatorioResultado = null;
      catalogo.criarResultadoCatalogo = (chave, titulo, subtitulo, kpis, tabelas, nota) => {
        relatorioResultado = { chave, titulo, subtitulo, kpis, tabelas, nota };
      };

      catalogo.baseLeadsCatalogo = async () => ({
        leads: [
          { ID: "401", DATE_CREATE: "2026-09-01T09:00:00-03:00" }
        ]
      });

      catalogo.baseDealsCatalogo = async () => ({
        deals: [
          { ID: "901", LEAD_ID: "401", STAGE_SEMANTIC_ID: "S", OPPORTUNITY: "15000", TITLE: "Venda Atlas" }
        ]
      });

      catalogo.atividadesCatalogo = async () => ({
        dados: [
          { ID: "1", COMPLETED: "Y", BINDINGS: [{ OWNER_TYPE_ID: "1", OWNER_ID: "401" }] }
        ]
      });

      await catalogo.extrairRelatorioCatalogo("https://fake.webhook", "receita_sdr");

      assert.equal(relatorioResultado.chave, "receita_sdr");
      const kpisMap = Object.fromEntries(relatorioResultado.kpis.map(k => [k.rotulo, k.valor]));
      assert.equal(kpisMap["Leads Trabalhados"], 1);
      assert.equal(kpisMap["Oportunidades Ganhas"], 1);
      assert.match(kpisMap["Receita Originada"], /15\.000/);
    });
  });
});
