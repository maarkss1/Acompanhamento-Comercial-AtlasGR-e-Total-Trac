import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const raw = readFileSync(path.join(ROOT, "data", "governance-decisions.json"), "utf8");
const governance = JSON.parse(raw);
const semantic = JSON.parse(readFileSync(path.join(ROOT, "data", "semantic-contract.json"), "utf8"));
const catalogText = readFileSync(
  path.join(ROOT, "docs", "intelligence-hub-cpi", "execucao", "wave-02", "05_CATALOGO_OFICIAL_DE_METRICAS.md"),
  "utf8"
);
const officialMetricIds = new Set(
  [...catalogText.matchAll(/METRIC_ID:\s*([A-Za-z0-9_-]+)/g)].map((m) => m[1])
);

describe("data/governance-decisions.json — decisões pendentes do Sprint 02", () => {
  test("é versionado e não contém decisão silenciosamente ratificada", () => {
    assert.match(governance.schema_version, /^\d+\.\d+\.\d+$/);
    assert.equal(governance.sprint, "02");
    assert.equal(governance.policy.no_silent_defaults, true);
    for (const decision of governance.decisions || []) {
      assert.notEqual(decision.status, "ratified", `${decision.decision_id}: ratificação não autorizada`);
      assert.equal(decision.status, "pending_human_ratification", `${decision.decision_id}: status inesperado`);
      assert.equal(decision.selected_value, null, `${decision.decision_id}: selected_value deve permanecer null`);
    }
  });

  test("decision_id é único e toda decisão possui efeito de release explícito", () => {
    const ids = (governance.decisions || []).map((d) => d.decision_id);
    assert.equal(new Set(ids).size, ids.length, "decision_id duplicado");
    for (const decision of governance.decisions || []) {
      assert.ok(decision.release_effect, `${decision.decision_id}: release_effect ausente`);
      assert.equal(typeof decision.blocking, "boolean", `${decision.decision_id}: blocking deve ser boolean`);
    }
  });

  test("todos os METRIC_IDs citados em scope/allowed_values existem no catálogo oficial", () => {
    const metricLike = [];
    for (const decision of governance.decisions || []) {
      metricLike.push(...(decision.scope_metric_ids || []));
      for (const value of decision.allowed_values || []) {
        if (/^[A-Z][A-Z0-9_]+-\d+[a-z]?$/.test(value)) metricLike.push(value);
      }
    }
    const missing = [...new Set(metricLike)].filter((id) => !officialMetricIds.has(id));
    assert.deepEqual(missing, [], `governança cita METRIC_ID inexistente: ${missing.join(", ")}`);
  });

  test("owners continuam pendentes para todos os candidatos executivos do contrato semântico", () => {
    const ownerDecision = (governance.decisions || []).find((d) => d.decision_id === "GOV-OWNER-EXECUTIVE-KPIS");
    assert.ok(ownerDecision);
    const ownerScope = new Set(ownerDecision.scope_metric_ids || []);
    const semanticIds = (semantic.executive_metric_candidates || []).map((m) => m.metric_id);
    assert.deepEqual([...ownerScope].sort(), [...semanticIds].sort());
    for (const metric of semantic.executive_metric_candidates || []) {
      assert.equal(metric.owner_status, "proposed");
      assert.equal(metric.executive_eligible, false);
    }
  });

  test("thresholds pendentes do contrato semântico têm decisão de governança correspondente", () => {
    const thresholdScope = new Set(
      (governance.decisions || [])
        .filter((d) => d.category === "threshold" || d.category === "threshold_or_formula")
        .flatMap((d) => d.scope_metric_ids || [])
    );
    const pendingMetrics = (semantic.executive_metric_candidates || [])
      .filter((m) => m.threshold_status === "pending_business_decision")
      .map((m) => m.metric_id);
    for (const id of pendingMetrics) {
      assert.ok(thresholdScope.has(id), `${id}: threshold pendente sem decisão de governança`);
    }
  });

  test("variantes metodológicas têm decisão explícita antes de escolher uma definição enterprise", () => {
    const methodology = new Map(
      (governance.decisions || [])
        .filter((d) => d.category === "methodology")
        .map((d) => [d.decision_id, d])
    );
    for (const id of ["GOV-METHOD-FORECAST-TOTAL", "GOV-METHOD-FORECAST-BUCKET", "GOV-METHOD-COVERAGE"]) {
      assert.ok(methodology.has(id), `${id}: decisão metodológica ausente`);
      assert.equal(methodology.get(id).selected_value, null);
    }
  });

  test("Faturado/Realizado/Recebido usam somente o default seguro de omissão enquanto não modelados", () => {
    const scopeDecision = (governance.decisions || []).find((d) => d.decision_id === "GOV-SCOPE-FINANCIAL-STATES");
    assert.ok(scopeDecision);
    assert.equal(scopeDecision.safe_default_until_decision, "omit_from_executive_ui_until_modeled");
    const concepts = new Set(scopeDecision.concepts || []);
    for (const concept of ["faturado", "realizado", "recebido"]) assert.ok(concepts.has(concept));
    const semanticExcluded = new Map((semantic.explicitly_out_of_scope_until_modeled || []).map((x) => [x.concept, x.status]));
    for (const concept of concepts) assert.equal(semanticExcluded.get(concept), "absent_from_current_model");
  });

  test("summary é derivado do conteúdo e mantém gate de governança fechado", () => {
    const decisions = governance.decisions || [];
    const pending = decisions.filter((d) => d.status === "pending_human_ratification").length;
    const ratified = decisions.filter((d) => d.status === "ratified").length;
    const blockingPending = decisions.filter((d) => d.blocking && d.status !== "ratified").length;
    assert.equal(governance.summary.total_decisions, decisions.length);
    assert.equal(governance.summary.pending_human_ratification, pending);
    assert.equal(governance.summary.ratified, ratified);
    assert.equal(governance.summary.blocking_pending, blockingPending);
    assert.equal(governance.summary.sprint_03_governance_ready, false);
    assert.equal(semantic.gate.metric_owners_ratified, false);
    assert.equal(semantic.gate.pending_business_thresholds_resolved, false);
    assert.equal(semantic.gate.sprint_03_release_ready, false);
  });

  test("arquivo não contém webhook Bitrix literal", () => {
    assert.doesNotMatch(raw, /https?:\/\/[^\s"']+\/rest\/\d+\/[A-Za-z0-9_-]+/i);
  });
});
