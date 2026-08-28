import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BITRIX_BRONZE_SELECT } from '../scripts/bitrix-bronze-source.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const catalog = JSON.parse(readFileSync(path.join(ROOT, 'data', 'bitrix-capabilities.json'), 'utf8'));

const byMethod = new Map(
  (catalog.entities || [])
    .filter((entity) => entity.list_method)
    .map((entity) => [entity.list_method, entity])
);

describe('Bitrix Bronze source — reconciliação com capability catalog', () => {
  test('todo método do adaptador existe no catálogo como entidade implementada', () => {
    for (const method of Object.keys(BITRIX_BRONZE_SELECT)) {
      const entity = byMethod.get(method);
      assert.ok(entity, `${method}: ausente no capability catalog`);
      assert.equal(entity.status, 'implemented', `${method}: entidade não está implemented`);
    }
  });

  test('todo campo selecionado pelo adaptador já é conhecido no catálogo estático', () => {
    for (const [method, selected] of Object.entries(BITRIX_BRONZE_SELECT)) {
      const entity = byMethod.get(method);
      const known = new Set(entity?.known_fields || []);
      const unknown = selected.filter((field) => !known.has(field));
      assert.deepEqual(unknown, [], `${method}: campos selecionados sem evidência no catálogo: ${unknown.join(', ')}`);
    }
  });

  test('campos PII selecionados continuam marcados como PII no catálogo', () => {
    const expectedSelectedPii = {
      'crm.deal.list': ['TITLE'],
      'crm.lead.list': ['TITLE', 'COMPANY_TITLE', 'NAME', 'LAST_NAME', 'PHONE', 'EMAIL'],
    };

    for (const [method, expected] of Object.entries(expectedSelectedPii)) {
      const entity = byMethod.get(method);
      const declaredPii = new Set(entity?.pii_fields || []);
      const selected = new Set(BITRIX_BRONZE_SELECT[method] || []);
      for (const field of expected) {
        assert.ok(selected.has(field), `${method}: PII esperada ${field} não está no select`);
        assert.ok(declaredPii.has(field), `${method}: ${field} deixou de estar catalogado como PII`);
      }
    }
  });

  test('adaptador não promove live_api_verified do catálogo', () => {
    assert.equal(catalog.live_api_verified, false);
  });
});
