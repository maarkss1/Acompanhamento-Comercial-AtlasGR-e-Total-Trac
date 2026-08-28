import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  prepararIngestaoBronze,
  gerarSqlIngestaoBronze,
  gerarManifestoBronze,
} from '../scripts/bronze-ingest.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, 'fixtures', 'bronze-ingestion.synthetic.json');
const fixtureText = readFileSync(fixturePath, 'utf8');
const fixture = JSON.parse(fixtureText);

describe('scripts/bronze-ingest.mjs — preparação Bronze', () => {
  test('separa válidos e rejeitados sem descarte silencioso', () => {
    const p = prepararIngestaoBronze(fixture);
    assert.equal(p.runs.length, 2);
    assert.equal(p.negocios.length, 1);
    assert.equal(p.leads.length, 1);
    assert.equal(p.rejections.length, 2);

    const negociosRun = p.runs.find((r) => r.entidade === 'negocios');
    const leadsRun = p.runs.find((r) => r.entidade === 'leads');

    assert.deepEqual(
      [negociosRun.registros_lidos, negociosRun.registros_validos, negociosRun.registros_invalidos, negociosRun.status],
      [2, 1, 1, 'partial']
    );
    assert.deepEqual(
      [leadsRun.registros_lidos, leadsRun.registros_validos, leadsRun.registros_invalidos, leadsRun.status],
      [2, 1, 1, 'partial']
    );
  });

  test('preserva dados necessários no snapshot válido e normaliza IDs opcionais vazios para null', () => {
    const p = prepararIngestaoBronze(fixture);
    assert.equal(p.negocios[0].staging_id, 'atlasgr:7001');
    assert.equal(p.negocios[0].valor, 12500.5);
    assert.equal(p.negocios[0].contato_id, null);
    assert.equal(p.negocios[0].lead_id, null);
    assert.equal(p.leads[0].staging_id, 'atlasgr:8001');
    assert.equal(p.leads[0].telefones.length, 1);
    assert.equal(p.leads[0].emails[0], 'pessoa.teste@example.invalid');
  });

  test('quarentena guarda motivo + fingerprint, nunca payload bruto', () => {
    const p = prepararIngestaoBronze(fixture);
    for (const r of p.rejections) {
      assert.match(r.source_fingerprint, /^[a-f0-9]{64}$/);
      assert.ok(Array.isArray(r.campos_ausentes));
      assert.ok(Array.isArray(r.inconsistencias));
      assert.equal(Object.hasOwn(r, 'payload'), false);
      assert.equal(Object.hasOwn(r, 'raw'), false);
    }
    assert.ok(p.rejections.some((r) => r.campos_ausentes.includes('staging_id')));
    assert.ok(p.rejections.some((r) => r.campos_ausentes.includes('estagio_id')));
  });

  test('run_id é determinístico para a mesma extração e permite reexecução idempotente', () => {
    const a = prepararIngestaoBronze(fixture);
    const b = prepararIngestaoBronze(fixture);
    assert.deepEqual(a.runs.map((r) => r.run_id), b.runs.map((r) => r.run_id));
  });

  test('manifesto não expõe PII do fixture', () => {
    const manifest = JSON.stringify(gerarManifestoBronze(prepararIngestaoBronze(fixture)));
    assert.doesNotMatch(manifest, /pessoa\.teste@example\.invalid/i);
    assert.doesNotMatch(manifest, /90000-0000/);
    assert.doesNotMatch(manifest, /CLIENTE FICTICIO ALFA/i);
    assert.equal(JSON.parse(manifest).contem_payload_bruto, false);
  });

  test('SQL é transacional, idempotente e inclui a quarentena', () => {
    const sql = gerarSqlIngestaoBronze(prepararIngestaoBronze(fixture));
    assert.match(sql, /BEGIN;/);
    assert.match(sql, /COMMIT;/);
    assert.match(sql, /ON CONFLICT \(staging_id, extraido_em\) DO UPDATE/);
    assert.match(sql, /intelligence\.ingestion_rejections/);
    assert.match(sql, /ON CONFLICT \(run_id, entidade, source_fingerprint\) DO NOTHING/);
  });

  test('rejeita URL/token em extraido_via antes de gerar qualquer SQL', () => {
    assert.throws(
      () => prepararIngestaoBronze({ ...fixture, extraido_via: 'https://atlasgr.bitrix24.com.br/rest/1/token/' }),
      /nunca URL\/token/i
    );
  });

  test('fixture é explicitamente sintético', () => {
    assert.match(fixtureText, /FICTICIO/i);
    assert.match(fixtureText, /example\.invalid/i);
  });
});
