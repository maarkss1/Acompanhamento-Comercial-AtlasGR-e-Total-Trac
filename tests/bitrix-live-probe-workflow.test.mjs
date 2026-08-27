import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const workflow = readFileSync(path.join(ROOT, '.github', 'workflows', 'bitrix-bronze-live-probe.yml'), 'utf8');

describe('bitrix-bronze-live-probe.yml — safety contract', () => {
  test('é exclusivamente manual, sem push/pull_request/schedule', () => {
    assert.match(workflow, /workflow_dispatch:/);
    assert.doesNotMatch(workflow, /^\s{2}(push|pull_request|schedule):/m);
  });

  test('exige confirmação textual explícita antes da leitura', () => {
    assert.match(workflow, /READ_ONLY_LIVE_PROBE/);
    assert.match(workflow, /Verify explicit read-only confirmation/);
  });

  test('tem somente contents: read e não faz git push', () => {
    assert.match(workflow, /permissions:\s*\n\s+contents:\s*read/);
    assert.doesNotMatch(workflow, /git\s+push/i);
    assert.doesNotMatch(workflow, /contents:\s*write/i);
  });

  test('usa arquivos efêmeros do runner e não publica artifacts', () => {
    assert.match(workflow, /runner\.temp/);
    assert.match(workflow, /Remove ephemeral files/);
    assert.doesNotMatch(workflow, /actions\/upload-artifact/i);
  });

  test('não imprime o webhook e seleciona segredo por portal', () => {
    assert.match(workflow, /secrets\.BITRIX_WEBHOOK_URL/);
    assert.match(workflow, /secrets\.BITRIX_TOTALTRAC_WEBHOOK_URL/);
    assert.match(workflow, /::add-mask::/);
    assert.doesNotMatch(workflow, /echo\s+"?\$BITRIX_WEBHOOK_URL/i);
    assert.doesNotMatch(workflow, /cat\s+.*BRONZE_SQL_OUT/i);
  });

  test('probe é limitado por amostra e usa PostgreSQL efêmero', () => {
    assert.match(workflow, /max_records:/);
    assert.match(workflow, /BITRIX_MAX_RECORDS/);
    assert.match(workflow, /image:\s*postgres:16/);
    assert.match(workflow, /bitrix-bronze-live-probe\.mjs/);
  });
});
