import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const contractText = readFileSync(path.join(ROOT, "data", "semantic-contract.json"), "utf8");
const contract = JSON.parse(contractText);
const catalogText = readFileSync(
  path.join(ROOT, "docs", "intelligence-hub-cpi", "execucao", "wave-02", "05_CATALOGO_OFICIAL_DE_METRICAS.md"),
  "utf8"
);
const bitrixCapabilities = JSON.parse(readFileSync(path.join(ROOT, "data", "bitrix-capabilities.json"), "utf8"));

// METRIC_IDs oficiais podem terminar em variantes minúsculas, ex. -01a/-01b.
// Capturamos literalmente o token inteiro após "METRIC_ID:" em vez de impor
// uma gramática que poderia rejeitar IDs já existentes no catálogo humano.
const metricIdsFromCatalog = new Set(
  [...catalogText.matchAll(/METRIC_ID:\s*([A-Za-z0-9_-]+)/g)].map((m) => m[1])
);

describe("data/semantic-contract.json — contrato semântico mínimo", () => {
  test("é versionado, pertence ao Sprint 02 e não finge validação ao vivo", () => {
    assert.match(contract.schema_version, /^\d+\.\d+\.\d+$/);
    assert.equal(contract.sprint, "02");
    assert.equal(contract.layer, "semantic");
    assert.equal(contract.live_data_verified, false);
  });

  test("entidades canônicas têm IDs únicos e MASTER_ENTITY_ID está formalizado como CORE", () => {
    const entities = contract.canonical_entities || [];
    const ids = entities.map((e) => e.entity_id);
    assert.equal(new Set(ids).size, ids.length, "entity_id duplicado");
    const master = entities.find((e) => e.entity_id === "master_entity");
    assert.ok(master, "master_entity ausente");
    assert.equal(master.layer, "core");
    assert.equal(master.business_key, "master_entity_id");
    assert.equal(master.manual_review_supported, true);
  });

  test("todo KPI candidato referencia um METRIC_ID já existente no catálogo oficial", () => {
    const missing = (contract.executive_metric_candidates || [])
      .map((m) => m.metric_id)
      .filter((id) => !metricIdsFromCatalog.has(id));
    assert.deepEqual(missing, [], `métricas inventadas/ausentes no catálogo: ${missing.join(", ")}`);
  });

  test("METRIC_IDs candidatos são únicos", () => {
    const ids = (contract.executive_metric_candidates || []).map((m) => m.metric_id);
    assert.equal(new Set(ids).size, ids.length, "METRIC_ID duplicado na camada semântica");
  });

  test("nenhuma métrica é promovida a owner ratificado enquanto catálogo declara apenas owners propostos", () => {
    assert.match(catalogText, /Nenhuma métrica tem owner formal/i);
    for (const metric of contract.executive_metric_candidates || []) {
      assert.notEqual(metric.owner_status, "ratified", `${metric.metric_id}: owner não pode ser ratified`);
      assert.equal(metric.executive_eligible, false, `${metric.metric_id}: não pode estar executivamente elegível sem owner formal`);
    }
  });

  test("threshold pendente bloqueia elegibilidade executiva", () => {
    const pending = (contract.executive_metric_candidates || []).filter(
      (m) => m.threshold_status === "pending_business_decision"
    );
    assert.ok(pending.length > 0, "esperava ao menos um threshold pendente formalizado");
    for (const metric of pending) {
      assert.equal(metric.executive_eligible, false, `${metric.metric_id}: threshold pendente não pode ser executivo`);
      assert.ok(metric.blocked_by?.some((x) => x.includes("threshold")), `${metric.metric_id}: blocker de threshold ausente`);
    }
  });

  test("métrica apoiada no Bitrix não é marcada live_source_verified antes da descoberta ao vivo", () => {
    assert.equal(bitrixCapabilities.live_api_verified, false);
    const bitrixBacked = (contract.executive_metric_candidates || []).filter((m) => m.source_type.includes("bitrix"));
    assert.ok(bitrixBacked.length > 0);
    for (const metric of bitrixBacked) {
      assert.equal(metric.live_source_verified, false, `${metric.metric_id}: validação Bitrix ao vivo foi inventada`);
      assert.equal(metric.executive_eligible, false);
    }
  });

  test("variantes metodológicas permanecem separadas, sem colapsar fórmulas diferentes sob um único KPI", () => {
    const groups = contract.methodology_variants_that_must_remain_distinct || [];
    for (const group of groups) {
      assert.ok(group.variants.length >= 2, `${group.concept}: precisa ter pelo menos duas variantes`);
      assert.equal(new Set(group.variants).size, group.variants.length, `${group.concept}: variante duplicada`);
      for (const id of group.variants) {
        assert.ok(metricIdsFromCatalog.has(id), `${group.concept}: variante ${id} não está no catálogo oficial`);
      }
    }
  });

  test("Faturado, Realizado e Recebido continuam explicitamente fora do modelo, sem KPI fictício", () => {
    const excluded = new Map((contract.explicitly_out_of_scope_until_modeled || []).map((x) => [x.concept, x.status]));
    for (const concept of ["faturado", "realizado", "recebido"]) {
      assert.equal(excluded.get(concept), "absent_from_current_model", `${concept}: estado esperado ausente`);
    }
    const semanticNames = (contract.executive_metric_candidates || []).map((m) => m.semantic_name).join(" ").toLowerCase();
    assert.doesNotMatch(semanticNames, /faturado|realizado|recebido/);
  });

  test("gate do Sprint 03 permanece fechado até DB, Bitrix, owners e thresholds serem validados", () => {
    assert.equal(contract.gate.semantic_contract_implemented, true);
    assert.equal(contract.gate.runtime_database_validated, false);
    assert.equal(contract.gate.bitrix_live_verified, false);
    assert.equal(contract.gate.metric_owners_ratified, false);
    assert.equal(contract.gate.pending_business_thresholds_resolved, false);
    assert.equal(contract.gate.sprint_03_release_ready, false);
  });

  test("contrato não contém webhook Bitrix literal", () => {
    assert.doesNotMatch(contractText, /https?:\/\/[^\s"']+\/rest\/\d+\/[A-Za-z0-9_-]+/i);
  });
});
