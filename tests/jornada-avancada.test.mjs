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

const mockFetch = async () => ({ ok: true, status: 200, json: async () => ({ result: [] }), text: async () => "{}" });
const config = carregarScriptClassico(CAMINHO_CONFIG);
const bitrix = carregarScriptClassico(CAMINHO_BITRIX, { contextoExtra: { ...config, fetch: mockFetch } });
const jornada = carregarScriptClassico(CAMINHO_JORNADA, { contextoExtra: { ...config, ...bitrix, fetch: mockFetch } });
const sdr = carregarScriptClassico(CAMINHO_SDR, { contextoExtra: { ...config, ...bitrix, ...jornada, fetch: mockFetch } });

describe("Jornada Avançada — 5 Novos Cards no Catálogo", () => {

  const mockMeta = {
    categorias: { "0": "Funil Comercial", "1": "Implantação" },
    estagios: {
      "0": {
        "C0:NEW": { label: "Nova Oportunidade", semantics: "process" },
        "C0:PREP": { label: "Reunião de Diagnóstico", semantics: "process" },
        "C0:PROP": { label: "Proposta Enviada", semantics: "process" },
        "C0:WON": { label: "Contrato Assinado", semantics: "success" },
        "C0:LOST": { label: "Perdido", semantics: "failure" }
      }
    }
  };

  const mockDeals = [
    { ID: "101", TITLE: "Cliente Alfa", CATEGORY_ID: "0", STAGE_ID: "C0:NEW", STAGE_SEMANTIC_ID: "P", OPPORTUNITY: "10000", MOVED_TIME: "2026-08-01T10:00:00-03:00", DATE_CREATE: "2026-08-01T10:00:00-03:00", DATE_MODIFY: "2026-08-01T10:00:00-03:00", ASSIGNED_BY_ID: "1" },
    { ID: "102", TITLE: "Cliente Beta", CATEGORY_ID: "0", STAGE_ID: "C0:PREP", STAGE_SEMANTIC_ID: "P", OPPORTUNITY: "25000", MOVED_TIME: "2026-08-15T10:00:00-03:00", DATE_CREATE: "2026-08-10T10:00:00-03:00", DATE_MODIFY: "2026-08-20T10:00:00-03:00", ASSIGNED_BY_ID: "2" },
    { ID: "103", TITLE: "Cliente Gama", CATEGORY_ID: "0", STAGE_ID: "C0:PROP", STAGE_SEMANTIC_ID: "P", OPPORTUNITY: "50000", MOVED_TIME: "2026-06-01T10:00:00-03:00", DATE_CREATE: "2026-05-01T10:00:00-03:00", DATE_MODIFY: "2026-06-01T10:00:00-03:00", ASSIGNED_BY_ID: "1" },
    { ID: "104", TITLE: "Cliente Delta (Ganho)", CATEGORY_ID: "0", STAGE_ID: "C0:WON", STAGE_SEMANTIC_ID: "S", OPPORTUNITY: "30000", MOVED_TIME: "2026-08-25T10:00:00-03:00", DATE_CREATE: "2026-07-01T10:00:00-03:00", DATE_MODIFY: "2026-08-25T10:00:00-03:00", ASSIGNED_BY_ID: "2" },
  ];

  const mockEmpresas = {};

  const mockHistorico = [
    { ID: "1", OWNER_ID: "101", STAGE_ID: "C0:NEW", CATEGORY_ID: "0", STAGE_SEMANTIC_ID: "P", CREATED_TIME: "2026-08-01T10:00:00-03:00" },
    { ID: "2", OWNER_ID: "102", STAGE_ID: "C0:NEW", CATEGORY_ID: "0", STAGE_SEMANTIC_ID: "P", CREATED_TIME: "2026-08-10T10:00:00-03:00" },
    { ID: "3", OWNER_ID: "102", STAGE_ID: "C0:PREP", CATEGORY_ID: "0", STAGE_SEMANTIC_ID: "P", CREATED_TIME: "2026-08-15T10:00:00-03:00" },
    { ID: "4", OWNER_ID: "104", STAGE_ID: "C0:NEW", CATEGORY_ID: "0", STAGE_SEMANTIC_ID: "P", CREATED_TIME: "2026-07-01T10:00:00-03:00" },
    { ID: "5", OWNER_ID: "104", STAGE_ID: "C0:LOST", CATEGORY_ID: "0", STAGE_SEMANTIC_ID: "F", CREATED_TIME: "2026-07-15T10:00:00-03:00" },
    { ID: "6", OWNER_ID: "104", STAGE_ID: "C0:PROP", CATEGORY_ID: "0", STAGE_SEMANTIC_ID: "P", CREATED_TIME: "2026-08-01T10:00:00-03:00" },
    { ID: "7", OWNER_ID: "104", STAGE_ID: "C0:WON", CATEGORY_ID: "0", STAGE_SEMANTIC_ID: "S", CREATED_TIME: "2026-08-25T10:00:00-03:00" },
  ];

  function criarContextoCatalogo(dealsList = mockDeals, histList = mockHistorico) {
    const mockElement = { style: {}, classList: { add: () => {}, remove: () => {}, toggle: () => {} }, textContent: "", innerHTML: "" };
    const mockDocument = {
      getElementById: () => mockElement,
      querySelector: () => mockElement,
      querySelectorAll: () => [],
      addEventListener: () => {},
      createElement: () => mockElement,
    };

    const contextoExtra = {
      ...config,
      ...bitrix,
      ...jornada,
      ...sdr,
      ENTIDADES: config.ENTIDADES,
      RELATORIOS: config.RELATORIOS,
      document: mockDocument,
      periodoCatalogo: () => ({ referencia: "2026-09-01", inicio: "2026-08-01", fim: "2026-08-31" }),
      baseDealsCatalogo: async () => ({ meta: mockMeta, deals: dealsList, empresas: mockEmpresas }),
      buscarHistoricoEntidade: async () => histList,
      bitrixFetchComRetentativa: async () => ({ result: histList }),
      fetch: async () => ({ ok: true, status: 200, json: async () => ({ result: histList }), text: async () => JSON.stringify({ result: histList }) }),
      atualizarStatus: () => {},
      esconderErro: () => {},
      mostrarErro: (msg) => { console.error("mostrarErro DETALHADO:", msg); },
      idBitrixValido: (id) => !!(id && id !== "0"),
      idBitrixString: (id) => String(id || ""),
      nomeUsuario: (id) => (id === "1" ? "Vendedor Um" : id === "2" ? "Vendedor Dois" : "Sistema"),
      nomeFunilSemCodigo: (nome) => nome || "Funil Comercial",
      parteDataISO: (d) => (d ? String(d).slice(0, 10) : ""),
      formatarDataISO: (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d || "").slice(0, 10)),
      formatarDataBR: (d) => {
        if (!d) return "";
        const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
        return m ? `${m[3]}/${m[2]}/${m[1]}` : String(d);
      },
      moedaRelatorio: (v) => `R$ ${(Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      escapeHtmlRelatorio: (s) => String(s || ""),
      taxaPct: (num, den) => {
        const n = Number(num) || 0;
        const d = Number(den) || 0;
        if (!d || !Number.isFinite(n) || !Number.isFinite(d)) return 0;
        return Math.round((n / d) * 1000) / 10;
      },
      ehEstagioPiloto: () => false,
      kpi: (rotulo, valor) => ({ rotulo, valor }),
    };

    const cat = carregarScriptClassico(CAMINHO_CATALOGO, { contextoExtra });
    cat.baseDealsCatalogo = async () => ({ meta: mockMeta, deals: dealsList, empresas: mockEmpresas });
    cat.buscarHistoricoEntidade = async () => histList;
    return cat;
  }

  test("Card 6 — tempo_por_etapa calcula Média, Mediana, P75 e P90 em dias sem NaN", async () => {
    const cat = criarContextoCatalogo();
    await cat.extrairRelatorioCatalogo("https://mock.webhook", "tempo_por_etapa");
    const res = cat.resultadoRelatorioCatalogo;

    assert.equal(res.chave, "tempo_por_etapa");
    assert.equal(res.titulo, "Tempo de Permanência por Etapa");

    // Verificar KPIs
    const kpis = res.kpis;
    assert.ok(kpis.some(k => k.rotulo === "Média Geral" && !String(k.valor).includes("NaN")));
    assert.ok(kpis.some(k => k.rotulo === "Mediana Geral" && !String(k.valor).includes("NaN")));
    assert.ok(kpis.some(k => k.rotulo === "P75 Geral" && !String(k.valor).includes("NaN")));
    assert.ok(kpis.some(k => k.rotulo === "P90 Geral" && !String(k.valor).includes("NaN")));

    // Verificar Tabela
    assert.ok(res.tabelas.length >= 1);
    const tabEstagios = res.tabelas[0];
    assert.equal(tabEstagios.titulo, "Permanência por Estágio");
    assert.ok(tabEstagios.dados.length > 0);
  });

  test("Card 7 — gargalos identifica estágios com acúmulo e retenção", async () => {
    const cat = criarContextoCatalogo();
    await cat.extrairRelatorioCatalogo("https://mock.webhook", "gargalos");
    const res = cat.resultadoRelatorioCatalogo;

    assert.equal(res.chave, "gargalos");
    assert.equal(res.titulo, "Gargalos do Funil");

    const kpis = res.kpis;
    assert.ok(kpis.some(k => k.rotulo === "Oportunidades Abertas" && k.valor === 3));
    assert.ok(kpis.some(k => k.rotulo === "Gargalos Críticos"));

    const tabGargalos = res.tabelas[0];
    assert.equal(tabGargalos.titulo, "Análise de Gargalos por Estágio");
    assert.ok(tabGargalos.dados.some(row => ["🔴 Gargalo Crítico", "🟡 Alta Retenção", "🟠 Alto Acúmulo", "🟢 Fluindo"].includes(row.STATUS_GARGALO)));
  });

  test("Card 8 — mapa_transicoes gera matriz de transição a partir do histórico", async () => {
    const cat = criarContextoCatalogo();
    await cat.extrairRelatorioCatalogo("https://mock.webhook", "mapa_transicoes");
    const res = cat.resultadoRelatorioCatalogo;

    assert.equal(res.chave, "mapa_transicoes");
    assert.equal(res.titulo, "Mapa de Transições de Estágios");

    const kpis = res.kpis;
    assert.ok(kpis.some(k => k.rotulo === "Transições Registradas"));
    assert.ok(kpis.some(k => k.rotulo === "Deals com Movimentação"));

    const tabMatriz = res.tabelas[0];
    assert.equal(tabMatriz.titulo, "Matriz de Transição entre Estágios (Origem ➔ Destino)");
    assert.ok(tabMatriz.dados.length > 0);
  });

  test("Card 9 — clientes_parados classifica estagnação >15, 30 e 60 dias", async () => {
    const cat = criarContextoCatalogo();
    await cat.extrairRelatorioCatalogo("https://mock.webhook", "clientes_parados");
    const res = cat.resultadoRelatorioCatalogo;

    assert.equal(res.chave, "clientes_parados");
    assert.equal(res.titulo, "Clientes Parados (Estagnados)");

    const kpis = res.kpis;
    assert.ok(kpis.some(k => k.rotulo === "Oportunidades Abertas" && k.valor === 3));
    assert.ok(kpis.some(k => k.rotulo.includes("Estagnados")));

    const tabFaixas = res.tabelas[0];
    assert.equal(tabFaixas.titulo, "Resumo por Faixa de Estagnação");
    assert.equal(tabFaixas.dados.length, 4); // >60, 31-60, 16-30, 0-15
  });

  test("Card 10 — clientes_recuperados identifica negócios reativados após perda", async () => {
    const cat = criarContextoCatalogo();
    await cat.extrairRelatorioCatalogo("https://mock.webhook", "clientes_recuperados");
    const res = cat.resultadoRelatorioCatalogo;

    assert.equal(res.chave, "clientes_recuperados");
    assert.equal(res.titulo, "Clientes Recuperados");

    const kpis = res.kpis;
    assert.ok(kpis.some(k => k.rotulo === "Negócios Reativados" && k.valor === 1));

    const tabRecuperados = res.tabelas[0];
    assert.equal(tabRecuperados.titulo, "Listagem de Negócios Reativados");
    assert.equal(tabRecuperados.dados.length, 1);
    assert.equal(tabRecuperados.dados[0].DEAL_ID, "104");
  });

  test("Tratamento de lista vazia — sem lançar exceções e sem NaN/Infinity", async () => {
    const cat = criarContextoCatalogo([], []);
    const cards = ["tempo_por_etapa", "gargalos", "mapa_transicoes", "clientes_parados", "clientes_recuperados"];

    for (const card of cards) {
      await cat.extrairRelatorioCatalogo("https://mock.webhook", card);
      const res = cat.resultadoRelatorioCatalogo;
      assert.ok(res.kpis, `KPIs ausentes no card ${card}`);
      res.kpis.forEach(k => {
        assert.ok(!String(k.valor).includes("NaN"), `NaN encontrado no card ${card} (${k.rotulo}: ${k.valor})`);
        assert.ok(!String(k.valor).includes("Infinity"), `Infinity encontrado no card ${card} (${k.rotulo}: ${k.valor})`);
      });
    }
  });

});
