import { setTimeout as sleep } from 'node:timers/promises';
import {
  prepararIngestaoBronze,
  gerarSqlIngestaoBronze,
  gerarManifestoBronze,
} from './bronze-ingest.mjs';

const ALLOWED_METHODS = new Set(['crm.deal.list', 'crm.lead.list']);
const MAX_RETRIES = 5;
const DEFAULT_PAGE_DELAY_MS = 350;
const DEFAULT_TIMEOUT_MS = 30_000;

export const BITRIX_BRONZE_SELECT = Object.freeze({
  'crm.deal.list': [
    'ID', 'TITLE', 'STAGE_ID', 'CATEGORY_ID', 'OPPORTUNITY', 'CURRENCY_ID',
    'DATE_CREATE', 'DATE_MODIFY', 'MOVED_TIME', 'CLOSEDATE', 'BEGINDATE',
    'UF_CRM_1770928318695', 'ASSIGNED_BY_ID', 'CREATED_BY_ID', 'MODIFY_BY_ID',
    'MOVED_BY_ID', 'COMPANY_ID', 'CONTACT_ID', 'LEAD_ID', 'SOURCE_ID', 'CLOSED',
  ],
  'crm.lead.list': [
    'ID', 'TITLE', 'STATUS_ID', 'SOURCE_ID', 'OPPORTUNITY', 'DATE_CREATE',
    'DATE_MODIFY', 'ASSIGNED_BY_ID', 'COMPANY_ID', 'COMPANY_TITLE', 'CONTACT_ID',
    'NAME', 'LAST_NAME', 'PHONE', 'EMAIL',
  ],
});

function erroSeguro(message) {
  const err = new Error(message);
  err.safe = true;
  return err;
}

export function normalizarWebhookBitrix(webhook) {
  const raw = String(webhook || '').trim();
  if (!raw) throw erroSeguro('BITRIX_WEBHOOK_URL não configurado');
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw erroSeguro('BITRIX_WEBHOOK_URL inválido');
  }
  if (url.protocol !== 'https:') throw erroSeguro('BITRIX_WEBHOOK_URL deve usar HTTPS');
  if (!/\/rest\/\d+\/[A-Za-z0-9_-]+\/?$/i.test(url.pathname)) {
    throw erroSeguro('BITRIX_WEBHOOK_URL não possui o formato esperado de webhook de entrada');
  }
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}

function construirBody(select, start) {
  const params = new URLSearchParams();
  for (const field of select) params.append('select[]', field);
  params.append('order[ID]', 'ASC');
  params.append('start', String(start || 0));
  return params;
}

function endpoint(webhookBase, method) {
  if (!ALLOWED_METHODS.has(method)) throw erroSeguro(`método Bitrix não permitido no adaptador Bronze: ${method}`);
  return `${webhookBase}/${method}.json`;
}

function chunkResult(body) {
  if (Array.isArray(body?.result)) return body.result;
  if (body?.result && typeof body.result === 'object') return Object.values(body.result);
  return [];
}

function mergeUniqueById(acc, chunk) {
  const seen = new Set(acc.map((x) => String(x?.ID || '')).filter(Boolean));
  for (const row of chunk) {
    const id = String(row?.ID || '');
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    acc.push(row);
  }
  return acc;
}

async function fetchPage({ webhookBase, method, start, fetchImpl, timeoutMs, retries }) {
  const url = endpoint(webhookBase, method);
  const select = BITRIX_BRONZE_SELECT[method];
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: construirBody(select, start).toString(),
        signal: controller.signal,
      });
      const body = await response.json();

      if (body?.error === 'QUERY_LIMIT_EXCEEDED' || response.status === 429) {
        lastError = erroSeguro('Bitrix temporariamente limitou as chamadas de leitura');
      } else if (body?.error || body?.error_description) {
        throw erroSeguro(`Bitrix rejeitou uma chamada de leitura (${body.error || 'erro'})`);
      } else if (!response.ok) {
        if (response.status >= 400 && response.status < 500) {
          throw erroSeguro(`Bitrix respondeu HTTP ${response.status} em chamada de leitura`);
        }
        lastError = erroSeguro(`falha HTTP temporária ${response.status} no Bitrix`);
      } else {
        return body;
      }
    } catch (err) {
      if (err?.safe && !/temporariamente|temporária/i.test(err.message)) throw err;
      if (err?.name === 'AbortError') lastError = erroSeguro('timeout em chamada de leitura do Bitrix');
      else lastError = err?.safe ? err : erroSeguro('falha temporária em chamada de leitura do Bitrix');
    } finally {
      clearTimeout(timer);
    }

    if (attempt < retries) await sleep(Math.min(1000 * (2 ** (attempt - 1)), 8000));
  }

  throw lastError || erroSeguro('falha de leitura do Bitrix após retentativas');
}

export async function listarBitrixPaginado({
  webhook,
  method,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  retries = MAX_RETRIES,
  pageDelayMs = DEFAULT_PAGE_DELAY_MS,
}) {
  if (typeof fetchImpl !== 'function') throw erroSeguro('fetch indisponível para leitura Bitrix');
  const webhookBase = normalizarWebhookBitrix(webhook);
  if (!ALLOWED_METHODS.has(method)) throw erroSeguro(`método Bitrix não permitido no adaptador Bronze: ${method}`);

  let start = 0;
  const result = [];
  const seenStarts = new Set();

  while (true) {
    if (seenStarts.has(String(start))) throw erroSeguro('Bitrix retornou paginação cíclica; extração interrompida');
    seenStarts.add(String(start));

    const body = await fetchPage({ webhookBase, method, start, fetchImpl, timeoutMs, retries });
    const chunk = chunkResult(body);
    mergeUniqueById(result, chunk);

    if (body?.next === undefined || body?.next === null || chunk.length === 0) break;
    const next = Number(body.next);
    if (!Number.isFinite(next) || next < 0) throw erroSeguro('Bitrix retornou cursor de paginação inválido');
    start = next;
    if (pageDelayMs > 0) await sleep(pageDelayMs);
  }

  return result;
}

export async function criarEnvelopeBronzeDoBitrix({
  portal,
  webhook,
  fetchImpl = globalThis.fetch,
  extraidoEm = new Date(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  retries = MAX_RETRIES,
  pageDelayMs = DEFAULT_PAGE_DELAY_MS,
}) {
  const portalNormalizado = String(portal || '').trim().toLowerCase();
  if (!['atlasgr', 'totaltrac'].includes(portalNormalizado)) throw erroSeguro('portal inválido para fonte Bitrix Bronze');
  normalizarWebhookBitrix(webhook);

  // Sequencial por desenho: reduz pressão sobre o rate limit e torna o run mais auditável.
  const negocios = await listarBitrixPaginado({ webhook, method: 'crm.deal.list', fetchImpl, timeoutMs, retries, pageDelayMs });
  const leads = await listarBitrixPaginado({ webhook, method: 'crm.lead.list', fetchImpl, timeoutMs, retries, pageDelayMs });

  const timestamp = extraidoEm instanceof Date ? extraidoEm : new Date(extraidoEm);
  if (Number.isNaN(timestamp.getTime())) throw erroSeguro('extraidoEm inválido');

  return {
    portal: portalNormalizado,
    extraido_em: timestamp.toISOString(),
    extraido_via: `bitrix-read:${portalNormalizado}`,
    negocios,
    leads,
  };
}

export async function prepararBronzeDiretoDoBitrix(opcoes = {}) {
  const envelope = await criarEnvelopeBronzeDoBitrix(opcoes);
  return prepararIngestaoBronze(envelope);
}

export async function gerarCargaBronzeDiretoDoBitrix(opcoes = {}) {
  const preparado = await prepararBronzeDiretoDoBitrix(opcoes);
  return {
    sql: gerarSqlIngestaoBronze(preparado),
    manifesto: gerarManifestoBronze(preparado),
  };
}

// Não há CLI deliberadamente nesta fase.
// O adaptador só será ligado a uma execução real quando houver autorização para
// uma fonte Bitrix real e um destino seguro. Isso também evita que um operador
// redirecione acidentalmente um envelope bruto com PII para arquivo/log.
