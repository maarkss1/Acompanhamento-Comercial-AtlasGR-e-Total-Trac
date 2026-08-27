import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BITRIX_BRONZE_SELECT,
  normalizarWebhookBitrix,
  listarBitrixPaginado,
  criarEnvelopeBronzeDoBitrix,
  prepararBronzeDiretoDoBitrix,
} from '../scripts/bitrix-bronze-source.mjs';

const WEBHOOK_FICTICIO = 'https://empresa-ficticia.bitrix24.com.br/rest/123/token-ficticio/';

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
  };
}

function mockBitrix() {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const params = new URLSearchParams(options.body);
    const start = Number(params.get('start') || 0);
    calls.push({ url, options, params, start });

    if (url.endsWith('/crm.deal.list.json')) {
      if (start === 0) {
        return response({
          result: [
            { ID: '10', TITLE: 'DEAL FICTICIO A', STAGE_ID: 'NEW', CATEGORY_ID: '0', OPPORTUNITY: '1000', COMPANY_ID: '77', CLOSED: 'N' },
            { ID: '11', TITLE: 'DEAL FICTICIO B', STAGE_ID: 'NEW', CATEGORY_ID: '0', OPPORTUNITY: '2000', COMPANY_ID: '78', CLOSED: 'N' },
          ],
          next: 50,
        });
      }
      return response({
        result: [
          { ID: '11', TITLE: 'DUPLICADO', STAGE_ID: 'NEW', CATEGORY_ID: '0', OPPORTUNITY: '2000', COMPANY_ID: '78', CLOSED: 'N' },
          { ID: '12', TITLE: 'DEAL FICTICIO C', STAGE_ID: 'WON', CATEGORY_ID: '0', OPPORTUNITY: '3000', COMPANY_ID: '79', CLOSED: 'Y' },
        ],
      });
    }

    if (url.endsWith('/crm.lead.list.json')) {
      return response({
        result: [
          {
            ID: '20', TITLE: 'LEAD FICTICIO', STATUS_ID: 'NEW', COMPANY_TITLE: 'EMPRESA FICTICIA',
            NAME: 'Pessoa', LAST_NAME: 'Teste',
            PHONE: [{ VALUE: '+55 16 90000-0000' }],
            EMAIL: [{ VALUE: 'pessoa@example.invalid' }],
          },
        ],
      });
    }

    return response({ error: 'METHOD_NOT_FOUND' }, 404);
  };
  return { fetchImpl, calls };
}

describe('scripts/bitrix-bronze-source.mjs — fonte read-only', () => {
  test('aceita somente webhook HTTPS no formato de entrada esperado', () => {
    assert.equal(
      normalizarWebhookBitrix(WEBHOOK_FICTICIO),
      'https://empresa-ficticia.bitrix24.com.br/rest/123/token-ficticio'
    );
    assert.throws(() => normalizarWebhookBitrix('http://empresa/rest/1/token/'), /HTTPS/);
    assert.throws(() => normalizarWebhookBitrix('https://empresa.bitrix24.com.br/outro'), /formato esperado/);
  });

  test('erros de validação não ecoam o token recebido', () => {
    const token = 'segredo-super-sensivel';
    let message = '';
    try {
      normalizarWebhookBitrix(`https://empresa.bitrix24.com.br/rest/invalido/${token}/`);
    } catch (err) {
      message = err.message;
    }
    assert.doesNotMatch(message, new RegExp(token));
  });

  test('paginação usa POST, order ID ASC, select canônico e deduplica por ID', async () => {
    const { fetchImpl, calls } = mockBitrix();
    const deals = await listarBitrixPaginado({
      webhook: WEBHOOK_FICTICIO,
      method: 'crm.deal.list',
      fetchImpl,
      pageDelayMs: 0,
    });

    assert.deepEqual(deals.map((d) => d.ID), ['10', '11', '12']);
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.equal(call.options.method, 'POST');
      assert.equal(call.params.get('order[ID]'), 'ASC');
      assert.deepEqual(call.params.getAll('select[]'), BITRIX_BRONZE_SELECT['crm.deal.list']);
      assert.equal(call.url.includes('?'), false);
    }
    assert.deepEqual(calls.map((c) => c.start), [0, 50]);
  });

  test('maxRecords interrompe a leitura assim que a amostra fica suficiente', async () => {
    const { fetchImpl, calls } = mockBitrix();
    const deals = await listarBitrixPaginado({
      webhook: WEBHOOK_FICTICIO,
      method: 'crm.deal.list',
      fetchImpl,
      pageDelayMs: 0,
      maxRecords: 1,
    });
    assert.deepEqual(deals.map((d) => d.ID), ['10']);
    assert.equal(calls.length, 1, 'probe limitado não deveria abrir uma segunda página');
  });

  test('maxRecords inválido é rejeitado antes de ler o Bitrix', async () => {
    const { fetchImpl, calls } = mockBitrix();
    await assert.rejects(
      listarBitrixPaginado({ webhook: WEBHOOK_FICTICIO, method: 'crm.deal.list', fetchImpl, maxRecords: 0 }),
      /entre 1 e 20000/i
    );
    assert.equal(calls.length, 0);
  });

  test('bloqueia qualquer método fora da allowlist de leitura Bronze', async () => {
    const { fetchImpl } = mockBitrix();
    await assert.rejects(
      listarBitrixPaginado({ webhook: WEBHOOK_FICTICIO, method: 'crm.deal.update', fetchImpl, pageDelayMs: 0 }),
      /não permitido/i
    );
  });

  test('envelope contém dados e proveniência, mas nunca contém webhook/token', async () => {
    const { fetchImpl } = mockBitrix();
    const envelope = await criarEnvelopeBronzeDoBitrix({
      portal: 'atlasgr',
      webhook: WEBHOOK_FICTICIO,
      fetchImpl,
      extraidoEm: '2026-08-27T16:00:00Z',
      pageDelayMs: 0,
    });

    assert.equal(envelope.portal, 'atlasgr');
    assert.equal(envelope.extraido_via, 'bitrix-read:atlasgr');
    assert.equal(envelope.negocios.length, 3);
    assert.equal(envelope.leads.length, 1);
    const serialized = JSON.stringify(envelope);
    assert.doesNotMatch(serialized, /token-ficticio/);
    assert.doesNotMatch(serialized, /\/rest\/123\//);
  });

  test('fonte simulada alimenta diretamente o mesmo pipeline Bronze já validado', async () => {
    const { fetchImpl } = mockBitrix();
    const prepared = await prepararBronzeDiretoDoBitrix({
      portal: 'atlasgr',
      webhook: WEBHOOK_FICTICIO,
      fetchImpl,
      extraidoEm: '2026-08-27T16:00:00Z',
      pageDelayMs: 0,
    });

    assert.equal(prepared.negocios.length, 3);
    assert.equal(prepared.leads.length, 1);
    assert.equal(prepared.rejections.length, 0);
    assert.equal(prepared.runs.length, 2);
    assert.ok(prepared.runs.every((r) => r.status === 'success'));
    assert.ok(prepared.runs.every((r) => r.extraido_via === 'bitrix-read:atlasgr'));
  });

  test('selects são estritamente de leitura e cobrem os campos exigidos pelo Staging', () => {
    assert.ok(BITRIX_BRONZE_SELECT['crm.deal.list'].includes('ID'));
    assert.ok(BITRIX_BRONZE_SELECT['crm.deal.list'].includes('STAGE_ID'));
    assert.ok(BITRIX_BRONZE_SELECT['crm.lead.list'].includes('ID'));
    assert.ok(BITRIX_BRONZE_SELECT['crm.lead.list'].includes('STATUS_ID'));
    assert.equal(Object.keys(BITRIX_BRONZE_SELECT).some((m) => /update|delete|add/i.test(m)), false);
  });
});
