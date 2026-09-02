import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { carregarScriptClassico } from "./helpers/carregar-script-classico.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAMINHO_CONFIG = path.join(__dirname, "..", "js", "config.js");
const CAMINHO_BITRIX_API = path.join(__dirname, "..", "js", "bitrix-api.js");
const CAMINHO_JORNADA = path.join(__dirname, "..", "js", "jornada.js");
const CAMINHO_SDR = path.join(__dirname, "..", "js", "sdr.js");
const CAMINHO_CATALOGO = path.join(__dirname, "..", "js", "catalogo-relatorios.js");

// Stubs de UI e DOM
const elementStubs = {
  spinner: { style: {} },
  btnExtrair: { disabled: false },
  btnParar: { disabled: false },
  "bloco-relatorio-catalogo": { classList: { add: () => {}, remove: () => {}, toggle: () => {} } },
  relatorioResultadoTitulo: { textContent: "", classList: { add: () => {}, remove: () => {}, toggle: () => {} } },
  relatorioResultadoSubtitulo: { innerHTML: "", classList: { add: () => {}, remove: () => {}, toggle: () => {} } },
  relatorioResultadoKpis: { innerHTML: "", classList: { add: () => {}, remove: () => {}, toggle: () => {} } },
  relatorioResultadoTabelas: { innerHTML: "", classList: { add: () => {}, remove: () => {}, toggle: () => {} } },
  relatorioResultadoNota: { textContent: "", classList: { add: () => {}, remove: () => {}, toggle: () => {} } },
  dataInicio: { value: "" },
  dataFim: { value: "2026-09-02" },
};

const documentoFake = {
  getElementById: (id) => elementStubs[id] || { value: "", classList: { add: () => {}, remove: () => {}, toggle: () => {} } },
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  createElement: () => ({ style: {}, classList: { add: () => {}, remove: () => {}, toggle: () => {} } }),
};

const config = carregarScriptClassico(CAMINHO_CONFIG, { contextoExtra: { document: documentoFake } });
const bitrixApi = carregarScriptClassico(CAMINHO_BITRIX_API, { contextoExtra: { ...config, document: documentoFake } });
const jornada = carregarScriptClassico(CAMINHO_JORNADA, { contextoExtra: { ...config, ...bitrixApi, document: documentoFake } });
const sdr = carregarScriptClassico(CAMINHO_SDR, { contextoExtra: { ...config, ...bitrixApi, ...jornada, document: documentoFake } });

const catalogo = carregarScriptClassico(CAMINHO_CATALOGO, {
  contextoExtra: {
    ...config,
    ...bitrixApi,
    ...jornada,
    ...sdr,
    document: documentoFake,
    esconderErro: () => {},
    mostrarErro: (err) => console.error("Erro relatório:", err),
    atualizarStatus: () => {},
  },
});

// Stubs de metadados e entidades sintéticas
const mockMeta = {
  categorias: { "0": "Comercial" },
  estagios: {
    "0": {
      "C0:NEW": { label: "Nova Oportunidade", semantics: "process" },
      "C0:PROPOSAL": { label: "Proposta Enviada", semantics: "process" },
      "C0:WON": { label: "Contrato Assinado", semantics: "success" },
      "C0:LOST": { label: "Perdido", semantics: "failure" },
    },
  },
};

const mockDeals = [
  // 1. Deal saudável (com cliente, origem, responsável, valor e CLOSEDATE futura)
  {
    ID: "201",
    TITLE: "Negócio Oportuno Alfa",
    CATEGORY_ID: "0",
    STAGE_ID: "C0:PROPOSAL",
    STAGE_SEMANTIC_ID: "P",
    PROBABILITY: "70",
    OPPORTUNITY: "60000",
    ASSIGNED_BY_ID: "1",
    COMPANY_ID: "10",
    SOURCE_ID: "WEB",
    CLOSEDATE: "2026-10-15T00:00:00-03:00",
    DATE_CREATE: "2026-08-01T10:00:00-03:00",
    DATE_MODIFY: "2026-09-01T10:00:00-03:00",
    MOVED_TIME: "2026-09-01T10:00:00-03:00",
  },
  // 2. Deal com inconsistências (sem CLOSEDATE, sem probabilidade, valor zerado)
  {
    ID: "202",
    TITLE: "Negócio Inconsistente Beta",
    CATEGORY_ID: "0",
    STAGE_ID: "C0:NEW",
    STAGE_SEMANTIC_ID: "P",
    PROBABILITY: "",
    OPPORTUNITY: "0",
    ASSIGNED_BY_ID: "2",
    COMPANY_ID: "",
    SOURCE_ID: "",
    CLOSEDATE: "",
    DATE_CREATE: "2026-07-01T10:00:00-03:00",
    DATE_MODIFY: "2026-07-05T10:00:00-03:00",
    MOVED_TIME: "2026-07-05T10:00:00-03:00", // >30 dias parado
  },
  // 3. Deal com CLOSEDATE no passado (vencida)
  {
    ID: "203",
    TITLE: "Negócio Data Vencida Gama",
    CATEGORY_ID: "0",
    STAGE_ID: "C0:PROPOSAL",
    STAGE_SEMANTIC_ID: "P",
    PROBABILITY: "50",
    OPPORTUNITY: "40000",
    ASSIGNED_BY_ID: "1",
    COMPANY_ID: "30",
    SOURCE_ID: "CALL",
    CLOSEDATE: "2026-08-01T00:00:00-03:00", // vencida em relação a 2026-09-02
    DATE_CREATE: "2026-07-15T10:00:00-03:00",
    DATE_MODIFY: "2026-08-01T10:00:00-03:00",
    MOVED_TIME: "2026-08-01T10:00:00-03:00",
  },
];

const mockLeads = [
  {
    ID: "501",
    TITLE: "Lead Completo",
    COMPANY_TITLE: "Empresa Solar",
    NAME: "João",
    LAST_NAME: "Silva",
    ASSIGNED_BY_ID: "1",
    SOURCE_ID: "WEB",
    PHONE: [{ VALUE: "11999998888" }],
    EMAIL: [{ VALUE: "joao@solar.com" }],
    DATE_CREATE: "2026-08-20T10:00:00-03:00",
    STATUS_SEMANTIC_ID: "P",
  },
  {
    ID: "502",
    TITLE: "Lead Incompleto",
    COMPANY_TITLE: "",
    NAME: "",
    LAST_NAME: "",
    ASSIGNED_BY_ID: "",
    SOURCE_ID: "",
    PHONE: [],
    EMAIL: [],
    DATE_CREATE: "2026-08-22T10:00:00-03:00",
    STATUS_SEMANTIC_ID: "P",
  },
];

const mockAtividades = [
  // Atividade vinculada ao Deal 201 (futura / dentro do prazo)
  {
    ID: "1001",
    RESPONSIBLE_ID: "1",
    TYPE_ID: "2",
    SUBJECT: "Enviar proposta revisada",
    COMPLETED: "N",
    DEADLINE: "2026-09-05T18:00:00-03:00",
    BINDINGS: [{ OWNER_TYPE_ID: "2", OWNER_ID: "201" }],
  },
  // Atividade vinculada ao Deal 203 (atrasada)
  {
    ID: "1002",
    RESPONSIBLE_ID: "1",
    TYPE_ID: "1",
    SUBJECT: "Reunião de alinhamento",
    COMPLETED: "N",
    DEADLINE: "2026-08-25T15:00:00-03:00",
    BINDINGS: [{ OWNER_TYPE_ID: "2", OWNER_ID: "203" }],
  },
];

const mockEmpresas = {
  "10": { TITLE: "Empresa Alfa" },
  "30": { TITLE: "Empresa Gama" },
};

// Injeta mocks para o ambiente vm
catalogo.baseDealsCatalogo = async () => ({
  meta: mockMeta,
  deals: mockDeals,
  empresas: mockEmpresas,
});
catalogo.baseLeadsCatalogo = async () => ({
  leads: mockLeads,
  statusMap: {},
  statusLeads: [],
});
catalogo.atividadesCatalogo = async () => ({
  dados: mockAtividades,
});

describe("AGENTE 09 — CRM QUALITY (Cards 41, 42, 43, 44 e 45)", () => {
  test("Card 41: atividades_pendentes agrupa backlog por responsável e situação", async () => {
    await catalogo.extrairRelatorioCatalogo("https://mock.webhook", "atividades_pendentes");
    const res = catalogo.resultadoRelatorioCatalogo;

    assert.equal(res.chave, "atividades_pendentes");
    assert.equal(res.titulo, "Atividades pendentes e atrasadas");
    assert.ok(res.kpis.length >= 6);

    const kpiPendentes = res.kpis.find((k) => k.rotulo === "Pendentes");
    const kpiAtrasadas = res.kpis.find((k) => k.rotulo === "Atrasadas");
    const kpiHoje = res.kpis.find((k) => k.rotulo === "Vencem hoje");

    assert.equal(kpiPendentes.valor, 2);
    assert.equal(kpiAtrasadas.valor, 1);
    assert.equal(kpiHoje.valor, 0);

    assert.equal(res.tabelas.length, 2);
    const tabelaAtividades = res.tabelas[1].dados;
    assert.equal(tabelaAtividades.length, 2);
    assert.equal(tabelaAtividades.find((a) => a.ATIVIDADE_ID === "1002").SITUACAO, "Atrasada");
    assert.equal(tabelaAtividades.find((a) => a.ATIVIDADE_ID === "1001").SITUACAO, "Futura");
  });

  test("Card 42: crm_health_score calcula pontuação 0-100 com os 3 pilares de qualidade", async () => {
    await catalogo.extrairRelatorioCatalogo("https://mock.webhook", "crm_health_score");
    const res = catalogo.resultadoRelatorioCatalogo;

    assert.equal(res.chave, "crm_health_score");
    assert.equal(res.titulo, "CRM Health Score — Saúde Operacional");

    const kpiScore = res.kpis.find((k) => k.rotulo === "CRM Health Score");
    assert.ok(kpiScore);
    const scoreVal = parseInt(kpiScore.valor.split("/")[0], 10);
    assert.ok(scoreVal >= 0 && scoreVal <= 100, "Score deve estar no intervalo [0, 100]");

    assert.equal(res.tabelas.length, 2);
    const pilares = res.tabelas[0].dados;
    assert.equal(pilares.length, 3, "Deve listar os 3 pilares principais");
    assert.equal(pilares[0].PILAR, "Completude de Dados");
    assert.equal(pilares[1].PILAR, "Higiene de Atividades (Backlog)");
    assert.equal(pilares[2].PILAR, "CLOSEDATE Válida em Abertos");
  });

  test("Card 43: qualidade_crm evolui auditoria de completude sem duplicar e traz detalhamento", async () => {
    await catalogo.extrairRelatorioCatalogo("https://mock.webhook", "qualidade_crm");
    const res = catalogo.resultadoRelatorioCatalogo;

    assert.equal(res.chave, "qualidade_crm");
    assert.equal(res.titulo, "Qualidade do CRM & campos faltantes");

    const kpiChecks = res.kpis.find((k) => k.rotulo === "Checks");
    assert.equal(kpiChecks.valor, 10, "Deve auditar 10 regras de completude e higiene");

    assert.equal(res.tabelas.length, 3, "Deve incluir completude por regra + detalhamento de Deals + detalhamento de Leads");
    const dealsComPendencia = res.tabelas[1].dados;
    assert.ok(dealsComPendencia.some((d) => d.DEAL_ID === "202" && d.PENDENCIAS.includes("Sem cliente")));
    
    const leadsComPendencia = res.tabelas[2].dados;
    assert.ok(leadsComPendencia.some((l) => l.LEAD_ID === "502" && l.PENDENCIAS.includes("Sem telefone/e-mail")));
  });

  test("Card 44: negocios_sem_proxima_atividade identifica negócios abertos sem ação futura", async () => {
    await catalogo.extrairRelatorioCatalogo("https://mock.webhook", "negocios_sem_proxima_atividade");
    const res = catalogo.resultadoRelatorioCatalogo;

    assert.equal(res.chave, "negocios_sem_proxima_atividade");
    assert.equal(res.titulo, "Negócios Abertos Sem Próxima Atividade");

    const kpiSemAtividade = res.kpis.find((k) => k.rotulo === "Sem Próxima Atividade");
    assert.ok(kpiSemAtividade);
    assert.equal(kpiSemAtividade.valor, 2, "Deals 202 e 203 devem ser apontados sem próxima atividade futura");

    const tabelaDeals = res.tabelas[1].dados;
    assert.ok(tabelaDeals.some((d) => d.DEAL_ID === "202"));
    assert.ok(tabelaDeals.some((d) => d.DEAL_ID === "203"));
  });

  test("Card 45: auditoria_pipeline lista inconsistências de estágio, datas vencidas e valores", async () => {
    await catalogo.extrairRelatorioCatalogo("https://mock.webhook", "auditoria_pipeline");
    const res = catalogo.resultadoRelatorioCatalogo;

    assert.equal(res.chave, "auditoria_pipeline");
    assert.equal(res.titulo, "Auditoria de Pipeline & Higiene");

    const kpiInconsistentes = res.kpis.find((k) => k.rotulo === "Com Inconsistência");
    assert.equal(kpiInconsistentes.valor, 2, "Deals 202 e 203 possuem inconsistências");

    const tabelaInconsistencias = res.tabelas[1].dados;
    const deal202 = tabelaInconsistencias.find((d) => d.DEAL_ID === "202");
    assert.ok(deal202.INCONSISTENCIAS.includes("Sem probabilidade no Bitrix"));
    assert.ok(deal202.INCONSISTENCIAS.includes("CLOSEDATE ausente"));
    assert.ok(deal202.INCONSISTENCIAS.includes("Valor zerado"));
    assert.ok(deal202.INCONSISTENCIAS.includes("Estagnado"));

    const deal203 = tabelaInconsistencias.find((d) => d.DEAL_ID === "203");
    assert.ok(deal203.INCONSISTENCIAS.includes("CLOSEDATE no passado"));
  });
});
