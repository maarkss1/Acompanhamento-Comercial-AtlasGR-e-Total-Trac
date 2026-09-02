import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { carregarScriptClassico } from "./helpers/carregar-script-classico.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAMINHO_CONFIG = path.join(__dirname, "..", "js", "config.js");
const CAMINHO_BITRIX = path.join(__dirname, "..", "js", "bitrix-api.js");
const CAMINHO_JORNADA = path.join(__dirname, "..", "js", "jornada.js");
const CAMINHO_CATALOGO = path.join(__dirname, "..", "js", "catalogo-relatorios.js");
const CAMINHO_SDR = path.join(__dirname, "..", "js", "sdr.js");

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
  {
    ID: "101",
    TITLE: "Empresa Alfa",
    CATEGORY_ID: "0",
    STAGE_ID: "C0:WON",
    STAGE_SEMANTIC_ID: "S",
    PROBABILITY: "100",
    OPPORTUNITY: "50000",
    ASSIGNED_BY_ID: "1",
    COMPANY_ID: "10",
    LEAD_ID: "1",
    SOURCE_ID: "WEB",
    UTM_SOURCE: "google",
    CLOSEDATE: "2026-08-10T00:00:00-03:00",
    DATE_CREATE: "2026-08-01T10:00:00-03:00",
    DATE_MODIFY: "2026-08-10T10:00:00-03:00",
    MOVED_TIME: "2026-08-10T10:00:00-03:00",
  },
  {
    ID: "102",
    TITLE: "Empresa Beta",
    CATEGORY_ID: "0",
    STAGE_ID: "C0:WON",
    STAGE_SEMANTIC_ID: "S",
    PROBABILITY: "100",
    OPPORTUNITY: "30000",
    ASSIGNED_BY_ID: "1",
    COMPANY_ID: "20",
    LEAD_ID: "2",
    SOURCE_ID: "CALL",
    UTM_SOURCE: "facebook",
    CLOSEDATE: "2026-08-15T00:00:00-03:00",
    DATE_CREATE: "2026-08-05T10:00:00-03:00",
    DATE_MODIFY: "2026-08-15T10:00:00-03:00",
    MOVED_TIME: "2026-08-15T10:00:00-03:00",
  },
  {
    ID: "103",
    TITLE: "Empresa Gama",
    CATEGORY_ID: "0",
    STAGE_ID: "C0:WON",
    STAGE_SEMANTIC_ID: "S",
    PROBABILITY: "100",
    OPPORTUNITY: "20000",
    ASSIGNED_BY_ID: "2",
    COMPANY_ID: "30",
    LEAD_ID: "3",
    SOURCE_ID: "WEB",
    UTM_SOURCE: "google",
    CLOSEDATE: "2026-08-20T00:00:00-03:00",
    DATE_CREATE: "2026-08-02T10:00:00-03:00",
    DATE_MODIFY: "2026-08-20T10:00:00-03:00",
    MOVED_TIME: "2026-08-20T10:00:00-03:00",
  },
  {
    ID: "104",
    TITLE: "Empresa Delta",
    CATEGORY_ID: "0",
    STAGE_ID: "C0:LOST",
    STAGE_SEMANTIC_ID: "F",
    PROBABILITY: "0",
    OPPORTUNITY: "10000",
    ASSIGNED_BY_ID: "2",
    COMPANY_ID: "40",
    LEAD_ID: "4",
    SOURCE_ID: "EMAIL",
    UTM_SOURCE: "",
    CLOSEDATE: "2026-08-25T00:00:00-03:00",
    DATE_CREATE: "2026-08-01T10:00:00-03:00",
    DATE_MODIFY: "2026-08-25T10:00:00-03:00",
    MOVED_TIME: "2026-08-25T10:00:00-03:00",
  },
];

const mockLeads = [
  { ID: "1", DATE_CREATE: "2026-08-01T10:00:00-03:00", SOURCE_ID: "WEB", UTM_SOURCE: "google" },
  { ID: "2", DATE_CREATE: "2026-08-05T10:00:00-03:00", SOURCE_ID: "CALL", UTM_SOURCE: "facebook" },
  { ID: "3", DATE_CREATE: "2026-08-02T10:00:00-03:00", SOURCE_ID: "WEB", UTM_SOURCE: "google" },
  { ID: "4", DATE_CREATE: "2026-08-01T10:00:00-03:00", SOURCE_ID: "EMAIL", UTM_SOURCE: "" },
];

const mockEmpresas = {
  "10": { ID: "10", TITLE: "Empresa Alfa" },
  "20": { ID: "20", TITLE: "Empresa Beta" },
  "30": { ID: "30", TITLE: "Empresa Gama" },
  "40": { ID: "40", TITLE: "Empresa Delta" },
};

const config = carregarScriptClassico(CAMINHO_CONFIG);
const bitrix = carregarScriptClassico(CAMINHO_BITRIX, { contextoExtra: config });
const jornada = carregarScriptClassico(CAMINHO_JORNADA, { contextoExtra: { ...config, ...bitrix } });
const sdr = carregarScriptClassico(CAMINHO_SDR, { contextoExtra: { ...config, ...bitrix, ...jornada } });

const elementStubs = {
  spinner: { style: {} },
  btnExtrair: { disabled: false },
  btnParar: { disabled: false },
  "bloco-relatorio-catalogo": { classList: { add: () => {}, remove: () => {}, toggle: () => {} } },
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

const catalogo = carregarScriptClassico(CAMINHO_CATALOGO, {
  contextoExtra: {
    ...config,
    ...bitrix,
    ...jornada,
    ...sdr,
    document: documentoFake,
    esconderErro: () => {},
    atualizarStatus: () => {},
    mostrarErro: (msg) => { console.error("MOSTRAR ERRO EM TESTE:", msg); },
    buscarMetadadosFunisEEstagios: async () => mockMeta,
    buscarUsuariosJornada: async () => ({ "1": { NAME: "Vendedor Um" }, "2": { NAME: "Vendedor Dois" } }),
    listarCompletoRelatorio: async (w, m) => {
      if (m === "crm.deal.list") return { dados: mockDeals };
      if (m === "crm.lead.list") return { dados: mockLeads };
      return { dados: [] };
    },
    carregarListaPaginada: async () => [
      { STATUS_ID: "WEB", NAME: "Website" },
      { STATUS_ID: "CALL", NAME: "Ligação Direta" },
      { STATUS_ID: "EMAIL", NAME: "E-mail Marketing" },
    ],
    buscarEntidadesPorIds: async () => mockEmpresas,
    bitrixFetchComRetentativa: async (url) => {
      if (url.includes("productrows.get")) {
        if (url.includes("id=101")) return { result: [{ PRODUCT_NAME: "Licença Software", PRICE_ACCOUNT: 25000, QUANTITY: 2 }] };
        if (url.includes("id=102")) return { result: [{ PRODUCT_NAME: "Consultoria", PRICE_ACCOUNT: 30000, QUANTITY: 1 }] };
        if (url.includes("id=103")) return { result: [{ PRODUCT_NAME: "Suporte Anual", PRICE_ACCOUNT: 20000, QUANTITY: 1 }] };
      }
      return { result: [] };
    },
  },
});

catalogo.baseDealsCatalogo = async () => ({ meta: mockMeta, deals: mockDeals, empresas: mockEmpresas });
catalogo.baseLeadsCatalogo = async () => ({ leads: mockLeads, statusMap: {}, statusLeads: [] });

describe("AGENTE 04 — Performance Comercial (Cards 16 a 20)", () => {
  test("Card 16: performance_vendedores calcula mediana de ticket, UTM principal e concentração Top 1/5/10", async () => {
    await catalogo.extrairRelatorioCatalogo("https://mock.webhook", "performance_vendedores");
    const res = catalogo.resultadoRelatorioCatalogo;

    assert.equal(res.chave, "performance_vendedores");
    assert.equal(res.titulo, "Performance por vendedor");

    const kpiMediana = res.kpis.find((k) => k.rotulo === "Mediana Ticket");
    const kpiTop1 = res.kpis.find((k) => k.rotulo === "Top 1 Conc.");
    const kpiTop5 = res.kpis.find((k) => k.rotulo === "Top 5 Conc.");
    assert.ok(kpiMediana, "Deve apresentar KPI de Mediana de Ticket");
    assert.ok(kpiTop1, "Deve apresentar KPI de Concentração Top 1");
    assert.ok(kpiTop5, "Deve apresentar KPI de Concentração Top 5");

    const dados = Array.from(res.tabelas[0].dados);
    assert.equal(dados.length, 2, "Deve retornar 2 vendedores");
    const v1 = dados.find((r) => r.RESPONSAVEL === "Vendedor Um" || r.RESPONSAVEL === "ID 1");
    assert.ok(v1, "Deve encontrar o primeiro vendedor");
    assert.equal(v1.GANHOS, 2);
    assert.equal(v1.RECEITA, 80000);
    assert.equal(v1.TICKET, 40000);
    assert.equal(v1.MEDIANA_TICKET, 40000);
    assert.ok(v1.TOP_UTM.includes("UTM: google") || v1.TOP_UTM.includes("facebook"));
  });

  test("Card 17: ganhos_perdas_ciclo audita ciclo de vendas e separa ciclo de ganhos vs perdas", async () => {
    await catalogo.extrairRelatorioCatalogo("https://mock.webhook", "ganhos_perdas_ciclo");
    const res = catalogo.resultadoRelatorioCatalogo;

    assert.equal(res.chave, "ganhos_perdas_ciclo");
    assert.equal(res.titulo, "Ganhos, perdas e ciclo de vendas");

    const kpiCicloGanhos = res.kpis.find((k) => k.rotulo === "Ciclo médio (Ganhos)");
    const kpiCicloPerdas = res.kpis.find((k) => k.rotulo === "Ciclo médio (Perdas)");
    assert.ok(kpiCicloGanhos, "Deve incluir KPI de ciclo médio para ganhos");
    assert.ok(kpiCicloPerdas, "Deve incluir KPI de ciclo médio para perdas");

    const dados = Array.from(res.tabelas[0].dados);
    assert.equal(dados.length, 4, "4 negócios fechados no período");
  });

  test("Card 18: origens_canais valida agrupamento por SOURCE_ID e UTM_SOURCE", async () => {
    await catalogo.extrairRelatorioCatalogo("https://mock.webhook", "origens_canais");
    const res = catalogo.resultadoRelatorioCatalogo;

    assert.equal(res.chave, "origens_canais");
    assert.equal(res.titulo, "Origens, canais e conversão");

    const dados = Array.from(res.tabelas[0].dados);
    assert.ok(dados.length >= 3, "Deve agrupar origens por UTM / Source");

    const googleRow = dados.find((r) => r.ORIGEM.includes("google"));
    assert.ok(googleRow, "Deve incluir agrupamento por UTM: google");
    assert.equal(googleRow.LEADS, 2);
  });

  test("Card 19: produtos_receita calcula receita total de linhas (preco x qtd) e Curva ABC", async () => {
    await catalogo.extrairRelatorioCatalogo("https://mock.webhook", "produtos_receita");
    const res = catalogo.resultadoRelatorioCatalogo;

    assert.equal(res.chave, "produtos_receita");
    assert.equal(res.titulo, "Produtos e receita");

    const dados = Array.from(res.tabelas[0].dados);
    assert.equal(dados.length, 3, "3 produtos vendidos");

    const licensa = dados.find((r) => r.PRODUTO === "Licença Software");
    assert.ok(licensa, "Deve listar Licença Software");
    assert.equal(licensa.QUANTIDADE, 2);
    assert.equal(licensa.RECEITA, 50000, "Preço unitário (25000) * Qtd (2) = 50000");
    assert.ok(licensa.CURVA_ABC === "A" || licensa.CURVA_ABC === "B", "Licença Software deve ter classificação ABC");
  });

  test("Card 20: clientes_receita valida receita por cliente, concentração Top 1/5/10 e Curva ABC", async () => {
    await catalogo.extrairRelatorioCatalogo("https://mock.webhook", "clientes_receita");
    const res = catalogo.resultadoRelatorioCatalogo;

    assert.equal(res.chave, "clientes_receita");
    assert.equal(res.titulo, "Clientes, receita e concentração");

    const kpiTop1 = res.kpis.find((k) => k.rotulo === "Top 1");
    const kpiTop5 = res.kpis.find((k) => k.rotulo === "Top 5");
    const kpiTop10 = res.kpis.find((k) => k.rotulo === "Top 10");
    assert.ok(kpiTop1, "Deve exibir KPI Top 1");
    assert.ok(kpiTop5, "Deve exibir KPI Top 5");
    assert.ok(kpiTop10, "Deve exibir KPI Top 10");

    const dados = Array.from(res.tabelas[0].dados);
    assert.equal(dados.length, 3, "3 clientes com negócios ganhos");

    const topCliente = dados[0];
    assert.equal(topCliente.CLIENTE, "Empresa Alfa");
    assert.equal(topCliente.RECEITA, 50000);
    assert.equal(topCliente.CURVA_ABC, "A", "Maior cliente deve ter Curva ABC A");
  });
});
