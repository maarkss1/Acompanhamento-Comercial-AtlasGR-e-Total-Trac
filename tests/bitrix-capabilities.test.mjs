import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const MANIFEST_PATH = path.join(ROOT, "data", "bitrix-capabilities.json");
const CONFIG_PATH = path.join(ROOT, "js", "config.js");

const manifestText = readFileSync(MANIFEST_PATH, "utf8");
const manifest = JSON.parse(manifestText);
const configText = readFileSync(CONFIG_PATH, "utf8");

function methodsFromManifest(m) {
  const out = new Set();
  for (const entity of m.entities || []) {
    for (const key of ["list_method", "fields_method", "get_method"]) {
      if (entity[key]) out.add(entity[key]);
    }
    if (entity.write?.method) out.add(entity.write.method);
    for (const method of entity.related_methods || []) out.add(method);
  }
  for (const capability of m.supporting_capabilities || []) {
    if (capability.method) out.add(capability.method);
    for (const method of capability.methods || []) out.add(method);
  }
  return out;
}

function methodsDeclaredInConfig(source) {
  return new Set(
    [...source.matchAll(/\b(?:method|fieldsMethod):\s*"([^"]+)"/g)]
      .map((m) => m[1])
      .filter((m) => m.startsWith("crm.") || m.startsWith("user."))
  );
}

const allowedStatus = new Set(["implemented", "partial", "not_verifiable"]);

describe("data/bitrix-capabilities.json — contrato do catálogo", () => {
  test("é JSON válido, versionado e explicitamente não verificado contra API ao vivo", () => {
    assert.match(manifest.schema_version, /^\d+\.\d+\.\d+$/);
    assert.equal(manifest.generated_from, "static_repository_evidence");
    assert.equal(manifest.live_api_verified, false);
  });

  test("IDs de entidades são únicos e toda entidade tem evidência rastreável", () => {
    const ids = (manifest.entities || []).map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length, "entity.id duplicado no catálogo");
    for (const entity of manifest.entities || []) {
      assert.ok(entity.id, "entidade sem id");
      assert.ok(allowedStatus.has(entity.status), `${entity.id}: status inválido`);
      assert.ok(Array.isArray(entity.evidence) && entity.evidence.length > 0, `${entity.id}: sem evidência`);
      assert.ok(entity.key_field, `${entity.id}: sem chave declarada`);
    }
  });

  test("entidade com descoberta dinâmica declara fields_method", () => {
    for (const entity of manifest.entities || []) {
      if (entity.dynamic_fields) {
        assert.ok(entity.fields_method, `${entity.id}: dynamic_fields=true sem fields_method`);
        assert.match(entity.fields_method, /\.fields$/);
      }
    }
  });

  test("PII declarada é subconjunto dos campos conhecidos", () => {
    for (const entity of manifest.entities || []) {
      const fields = new Set(entity.known_fields || []);
      for (const pii of entity.pii_fields || []) {
        assert.ok(fields.has(pii), `${entity.id}: PII ${pii} não existe em known_fields`);
      }
    }
  });

  test("campos conhecidos não se repetem dentro da mesma entidade", () => {
    for (const entity of manifest.entities || []) {
      const fields = entity.known_fields || [];
      assert.equal(new Set(fields).size, fields.length, `${entity.id}: known_fields contém duplicata`);
    }
  });

  test("escrita habilitada está explicitamente limitada ao crm.item.update e entityTypeId conhecido", () => {
    for (const entity of manifest.entities || []) {
      if (!entity.write?.supported) continue;
      assert.equal(entity.write.method, "crm.item.update", `${entity.id}: método de escrita inesperado`);
      assert.ok(Number.isInteger(entity.write.entity_type_id), `${entity.id}: entity_type_id ausente`);
      assert.ok([1, 2, 3, 4].includes(entity.write.entity_type_id), `${entity.id}: entity_type_id fora do escopo atual`);
    }
  });
});

describe("reconciliação estática com js/config.js", () => {
  test("todo method/fieldsMethod declarado em config.js aparece no catálogo legível por máquina", () => {
    const catalogMethods = methodsFromManifest(manifest);
    const configMethods = methodsDeclaredInConfig(configText);
    const missing = [...configMethods].filter((method) => !catalogMethods.has(method));
    assert.deepEqual(missing, [], `métodos de config.js ausentes do catálogo: ${missing.join(", ")}`);
  });

  test("métodos críticos observados na Wave 1 continuam representados", () => {
    const methods = methodsFromManifest(manifest);
    const required = [
      "crm.deal.list",
      "crm.deal.fields",
      "crm.lead.list",
      "crm.lead.fields",
      "crm.company.list",
      "crm.company.fields",
      "crm.contact.list",
      "crm.contact.fields",
      "crm.activity.list",
      "crm.activity.fields",
      "user.get",
      "crm.category.list",
      "crm.status.list",
      "crm.stagehistory.list",
      "crm.deal.productrows.get",
      "crm.item.get",
      "crm.item.fields",
      "crm.item.update"
    ];
    const missing = required.filter((method) => !methods.has(method));
    assert.deepEqual(missing, [], `métodos críticos ausentes: ${missing.join(", ")}`);
  });
});

describe("segurança e limites de confiança", () => {
  test("catálogo não contém URL de webhook Bitrix nem token REST literal", () => {
    assert.doesNotMatch(manifestText, /https?:\/\/[^\s"']+\/rest\/\d+\/[A-Za-z0-9_-]+/i);
  });

  test("capacidades sem evidência no código ficam marcadas como não verificáveis", () => {
    assert.ok((manifest.not_verifiable_without_live_api || []).length > 0);
    for (const item of manifest.not_verifiable_without_live_api || []) {
      assert.equal(item.status, "not_verifiable");
      assert.ok(item.reason);
    }
  });

  test("metadados de pipeline da Total Trac não são promovidos a fato sem API ao vivo", () => {
    assert.equal(manifest.tenants.totaltrac.metadata_confidence, "not_verifiable_without_live_api");
  });
});
