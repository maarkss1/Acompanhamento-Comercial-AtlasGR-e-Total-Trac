import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executarLiveProbe, validarCaminhoEfemero } from '../scripts/bitrix-bronze-live-probe.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const WEBHOOK = 'https://empresa-ficticia.bitrix24.com.br/rest/123/token-ficticio/';

function response(body) {
  return { ok: true, status: 200, async json() { return body; } };
}

function fetchFicticio() {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.endsWith('/crm.deal.list.json')) {
      return response({ result: [{ ID: '1', TITLE: 'DEAL FICTICIO', STAGE_ID: 'NEW', CATEGORY_ID: '0', COMPANY_ID: '50', CLOSED: 'N' }] });
    }
    if (url.endsWith('/crm.lead.list.json')) {
      return response({ result: [{ ID: '2', TITLE: 'LEAD FICTICIO', STATUS_ID: 'NEW', COMPANY_TITLE: 'EMPRESA FICTICIA', EMAIL: [{ VALUE: 'probe@example.invalid' }] }] });
    }
    throw new Error('endpoint inesperado');
  };
  return { fetchImpl, calls };
}

describe('scripts/bitrix-bronze-live-probe.mjs — guard rails', () => {
  test('recusa SQL/manifesto dentro do workspace do repositório', () => {
    assert.throws(
      () => validarCaminhoEfemero(path.join(ROOT, 'saida-com-pii.sql'), ROOT),
      /fora do workspace/i
    );
  });

  test('aceita saída em diretório temporário externo ao repositório', () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'cpi-probe-path-'));
    try {
      const out = path.join(tmp, 'bronze.sql');
      assert.equal(validarCaminhoEfemero(out, ROOT), path.resolve(out));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('confirmação textual é obrigatória antes de qualquer chamada externa', async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'cpi-probe-confirm-'));
    const { fetchImpl, calls } = fetchFicticio();
    try {
      await assert.rejects(
        executarLiveProbe({
          portal: 'atlasgr',
          webhook: WEBHOOK,
          sqlOut: path.join(tmp, 'bronze.sql'),
          manifestOut: path.join(tmp, 'manifest.json'),
          confirmation: 'NAO_CONFIRMADO',
          fetchImpl,
          root: ROOT,
        }),
        /confirmação inválida/i
      );
      assert.equal(calls.length, 0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('probe simulado grava SQL apenas no temporário e manifesto sem PII/webhook', async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'cpi-probe-ok-'));
    const sqlOut = path.join(tmp, 'bronze.sql');
    const manifestOut = path.join(tmp, 'manifest.json');
    const { fetchImpl, calls } = fetchFicticio();
    try {
      const manifest = await executarLiveProbe({
        portal: 'atlasgr',
        webhook: WEBHOOK,
        maxRecords: 100,
        sqlOut,
        manifestOut,
        confirmation: 'READ_ONLY_LIVE_PROBE',
        fetchImpl,
        extraidoEm: '2026-08-27T16:30:00Z',
        root: ROOT,
      });

      assert.equal(calls.length, 2);
      assert.equal(manifest.snapshots_validos.negocios, 1);
      assert.equal(manifest.snapshots_validos.leads, 1);
      const manifestText = readFileSync(manifestOut, 'utf8');
      assert.doesNotMatch(manifestText, /probe@example\.invalid/i);
      assert.doesNotMatch(manifestText, /token-ficticio/i);
      assert.doesNotMatch(manifestText, /DEAL FICTICIO|LEAD FICTICIO/i);

      const sqlText = readFileSync(sqlOut, 'utf8');
      assert.match(sqlText, /^\\set ON_ERROR_STOP on/m);
      assert.doesNotMatch(sqlText, /token-ficticio/i);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
