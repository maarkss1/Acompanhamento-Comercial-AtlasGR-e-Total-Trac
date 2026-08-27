import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORTAIS = new Set(['atlasgr', 'totaltrac']);

function sandboxClassico() {
  const document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    createElement: () => ({ style: {}, classList: { add: () => {}, remove: () => {} } }),
  };
  const sandbox = {
    console,
    document,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    fetch: () => Promise.reject(new Error('fetch desabilitado no runtime de transformação Bronze')),
    setTimeout,
    clearTimeout,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  return sandbox;
}

export function carregarRuntimeStaging(root = ROOT) {
  const ctx = vm.createContext(sandboxClassico());
  for (const rel of ['js/jornada.js', 'js/staging-schema.js']) {
    const full = path.join(root, rel);
    vm.runInContext(readFileSync(full, 'utf8'), ctx, { filename: full });
  }
  if (typeof ctx.transformarNegocioParaStaging !== 'function' || typeof ctx.transformarLeadParaStaging !== 'function') {
    throw new Error('runtime Staging não expôs os transformadores esperados');
  }
  return ctx;
}

function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
}

function validarExtraidoVia(value) {
  const v = String(value || '').trim();
  if (!v) throw new Error('extraido_via é obrigatório');
  if (v.length > 128) throw new Error('extraido_via excede 128 caracteres');
  if (/https?:\/\//i.test(v) || /\/rest\/\d+\//i.test(v)) {
    throw new Error('extraido_via deve ser um identificador, nunca URL/token de webhook');
  }
  if (!/^[A-Za-z0-9._:-]+$/.test(v)) {
    throw new Error('extraido_via contém caracteres não permitidos');
  }
  return v;
}

function validarTimestamp(value) {
  const d = new Date(value);
  if (!value || Number.isNaN(d.getTime())) throw new Error('extraido_em deve ser timestamp ISO válido');
  return d.toISOString();
}

function nuloSeVazio(v) {
  return v === '' || v === undefined ? null : v;
}

function negocioParaDb(registro, runId, camposAusentes, avisos) {
  return {
    run_id: runId,
    staging_id: registro.staging_id,
    bitrix_id: registro.bitrix_id,
    portal: registro.portal,
    titulo: nuloSeVazio(registro.titulo),
    estagio_id: registro.estagio_id,
    categoria_id: nuloSeVazio(registro.categoria_id),
    valor: registro.valor,
    moeda: nuloSeVazio(registro.moeda),
    data_criacao: nuloSeVazio(registro.data_criacao),
    data_modificacao: nuloSeVazio(registro.data_modificacao),
    data_movido_estagio: nuloSeVazio(registro.data_movido_estagio),
    data_fechamento: nuloSeVazio(registro.data_fechamento),
    data_inicio: nuloSeVazio(registro.data_inicio),
    data_contrato_assinado: nuloSeVazio(registro.data_contrato_assinado),
    responsavel_id: nuloSeVazio(registro.responsavel_id),
    criado_por_id: nuloSeVazio(registro.criado_por_id),
    modificado_por_id: nuloSeVazio(registro.modificado_por_id),
    movido_por_id: nuloSeVazio(registro.movido_por_id),
    empresa_id: nuloSeVazio(registro.empresa_id),
    contato_id: nuloSeVazio(registro.contato_id),
    lead_id: nuloSeVazio(registro.lead_id),
    origem_id: nuloSeVazio(registro.origem_id),
    fechado: registro.fechado,
    extraido_em: registro.extraido_em,
    extraido_via: registro.extraido_via,
    schema_version: registro.schema_version,
    campos_ausentes: camposAusentes || [],
    inconsistencias: avisos || [],
  };
}

function leadParaDb(registro, runId, camposAusentes, avisos) {
  return {
    run_id: runId,
    staging_id: registro.staging_id,
    bitrix_id: registro.bitrix_id,
    portal: registro.portal,
    titulo: nuloSeVazio(registro.titulo),
    estagio_id: registro.estagio_id,
    origem_id: nuloSeVazio(registro.origem_id),
    valor: registro.valor,
    data_criacao: nuloSeVazio(registro.data_criacao),
    data_modificacao: nuloSeVazio(registro.data_modificacao),
    responsavel_id: nuloSeVazio(registro.responsavel_id),
    empresa_id: nuloSeVazio(registro.empresa_id),
    empresa_titulo: nuloSeVazio(registro.empresa_titulo),
    contato_id: nuloSeVazio(registro.contato_id),
    nome: nuloSeVazio(registro.nome),
    sobrenome: nuloSeVazio(registro.sobrenome),
    telefones: registro.telefones || [],
    emails: registro.emails || [],
    extraido_em: registro.extraido_em,
    extraido_via: registro.extraido_via,
    schema_version: registro.schema_version,
    campos_ausentes: camposAusentes || [],
    inconsistencias: avisos || [],
  };
}

function statusRun(lidos, validos, invalidos) {
  if (lidos > 0 && validos === 0 && invalidos > 0) return 'failed';
  if (invalidos > 0) return 'partial';
  return 'success';
}

function runId(portal, entidade, extraidoEm, bruto) {
  const stamp = extraidoEm.replace(/[^0-9]/g, '').slice(0, 14);
  return `bronze:${portal}:${entidade}:${stamp}:${fingerprint(bruto).slice(0, 12)}`;
}

export function prepararIngestaoBronze(envelope, { runtime = carregarRuntimeStaging() } = {}) {
  const portal = String(envelope?.portal || '').trim().toLowerCase();
  if (!PORTAIS.has(portal)) throw new Error(`portal inválido: ${portal || '(vazio)'}`);
  const extraidoEm = validarTimestamp(envelope?.extraido_em);
  const extraidoVia = validarExtraidoVia(envelope?.extraido_via);
  const negociosBrutos = Array.isArray(envelope?.negocios) ? envelope.negocios : [];
  const leadsBrutos = Array.isArray(envelope?.leads) ? envelope.leads : [];

  const saida = { runs: [], negocios: [], leads: [], rejections: [] };
  const processar = (entidade, brutos, fn, paraDb) => {
    const idRun = runId(portal, entidade, extraidoEm, brutos);
    let validos = 0;
    let invalidos = 0;
    for (const bruto of brutos) {
      const r = fn.call(runtime, bruto, { portal, extraidoEm, extraidoVia });
      if (r.valido) {
        validos += 1;
        saida[entidade].push(paraDb(r.registro, idRun, r.camposAusentes, r.avisos));
      } else {
        invalidos += 1;
        const id = /^\d+$/.test(String(r.registro?.bitrix_id || '')) ? String(r.registro.bitrix_id) : null;
        saida.rejections.push({
          run_id: idRun,
          portal,
          entidade,
          bitrix_id: id,
          staging_id: r.registro?.staging_id || null,
          campos_ausentes: r.camposAusentes || [],
          inconsistencias: r.avisos || [],
          source_fingerprint: fingerprint(bruto),
        });
      }
    }
    saida.runs.push({
      run_id: idRun,
      portal,
      entidade,
      schema_version: String(runtime.STAGING_SCHEMA_VERSION || '1.0.0'),
      extraido_via: extraidoVia,
      iniciado_em: extraidoEm,
      concluido_em: extraidoEm,
      status: statusRun(brutos.length, validos, invalidos),
      registros_lidos: brutos.length,
      registros_validos: validos,
      registros_invalidos: invalidos,
      erro_resumo: invalidos ? `${invalidos} registro(s) rejeitado(s) pelo contrato Staging` : null,
      metadata: {
        generator: 'scripts/bronze-ingest.mjs',
        raw_payload_persisted: false,
        rejection_payload_persisted: false,
      },
    });
  };

  processar('negocios', negociosBrutos, runtime.transformarNegocioParaStaging, negocioParaDb);
  processar('leads', leadsBrutos, runtime.transformarLeadParaStaging, leadParaDb);
  return saida;
}

function base64Json(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

export function gerarSqlIngestaoBronze(preparado) {
  const payload64 = base64Json(preparado);
  return `\\set ON_ERROR_STOP on\nBEGIN;\n\nCREATE TEMP TABLE _bronze_payload AS\nSELECT convert_from(decode('${payload64}', 'base64'), 'UTF8')::jsonb AS j;\n\nINSERT INTO intelligence.ingestion_runs\n  (run_id, portal, entidade, schema_version, extraido_via, iniciado_em, concluido_em, status, registros_lidos, registros_validos, registros_invalidos, erro_resumo, metadata)\nSELECT run_id, portal, entidade, schema_version, extraido_via, iniciado_em, concluido_em, status, registros_lidos, registros_validos, registros_invalidos, erro_resumo, metadata\nFROM jsonb_to_recordset((SELECT j->'runs' FROM _bronze_payload)) AS x(\n  run_id text, portal text, entidade text, schema_version text, extraido_via text, iniciado_em timestamptz, concluido_em timestamptz,\n  status text, registros_lidos bigint, registros_validos bigint, registros_invalidos bigint, erro_resumo text, metadata jsonb\n)\nON CONFLICT (run_id) DO UPDATE SET\n  concluido_em = EXCLUDED.concluido_em, status = EXCLUDED.status, registros_lidos = EXCLUDED.registros_lidos,\n  registros_validos = EXCLUDED.registros_validos, registros_invalidos = EXCLUDED.registros_invalidos,\n  erro_resumo = EXCLUDED.erro_resumo, metadata = EXCLUDED.metadata;\n\nINSERT INTO intelligence.staging_negocios\n  (run_id, staging_id, bitrix_id, portal, titulo, estagio_id, categoria_id, valor, moeda, data_criacao, data_modificacao, data_movido_estagio, data_fechamento, data_inicio, data_contrato_assinado, responsavel_id, criado_por_id, modificado_por_id, movido_por_id, empresa_id, contato_id, lead_id, origem_id, fechado, extraido_em, extraido_via, schema_version, campos_ausentes, inconsistencias)\nSELECT * FROM jsonb_to_recordset((SELECT j->'negocios' FROM _bronze_payload)) AS x(\n  run_id text, staging_id text, bitrix_id text, portal text, titulo text, estagio_id text, categoria_id text, valor numeric, moeda text,\n  data_criacao date, data_modificacao date, data_movido_estagio date, data_fechamento date, data_inicio date, data_contrato_assinado date,\n  responsavel_id text, criado_por_id text, modificado_por_id text, movido_por_id text, empresa_id text, contato_id text, lead_id text, origem_id text,\n  fechado boolean, extraido_em timestamptz, extraido_via text, schema_version text, campos_ausentes text[], inconsistencias text[]\n)\nON CONFLICT (staging_id, extraido_em) DO UPDATE SET\n  run_id = EXCLUDED.run_id, titulo = EXCLUDED.titulo, estagio_id = EXCLUDED.estagio_id, categoria_id = EXCLUDED.categoria_id, valor = EXCLUDED.valor,\n  moeda = EXCLUDED.moeda, data_criacao = EXCLUDED.data_criacao, data_modificacao = EXCLUDED.data_modificacao, data_movido_estagio = EXCLUDED.data_movido_estagio,\n  data_fechamento = EXCLUDED.data_fechamento, data_inicio = EXCLUDED.data_inicio, data_contrato_assinado = EXCLUDED.data_contrato_assinado,\n  responsavel_id = EXCLUDED.responsavel_id, criado_por_id = EXCLUDED.criado_por_id, modificado_por_id = EXCLUDED.modificado_por_id, movido_por_id = EXCLUDED.movido_por_id,\n  empresa_id = EXCLUDED.empresa_id, contato_id = EXCLUDED.contato_id, lead_id = EXCLUDED.lead_id, origem_id = EXCLUDED.origem_id, fechado = EXCLUDED.fechado,\n  extraido_via = EXCLUDED.extraido_via, schema_version = EXCLUDED.schema_version, campos_ausentes = EXCLUDED.campos_ausentes, inconsistencias = EXCLUDED.inconsistencias;\n\nINSERT INTO intelligence.staging_leads\n  (run_id, staging_id, bitrix_id, portal, titulo, estagio_id, origem_id, valor, data_criacao, data_modificacao, responsavel_id, empresa_id, empresa_titulo, contato_id, nome, sobrenome, telefones, emails, extraido_em, extraido_via, schema_version, campos_ausentes, inconsistencias)\nSELECT * FROM jsonb_to_recordset((SELECT j->'leads' FROM _bronze_payload)) AS x(\n  run_id text, staging_id text, bitrix_id text, portal text, titulo text, estagio_id text, origem_id text, valor numeric, data_criacao date, data_modificacao date,\n  responsavel_id text, empresa_id text, empresa_titulo text, contato_id text, nome text, sobrenome text, telefones text[], emails text[],\n  extraido_em timestamptz, extraido_via text, schema_version text, campos_ausentes text[], inconsistencias text[]\n)\nON CONFLICT (staging_id, extraido_em) DO UPDATE SET\n  run_id = EXCLUDED.run_id, titulo = EXCLUDED.titulo, estagio_id = EXCLUDED.estagio_id, origem_id = EXCLUDED.origem_id, valor = EXCLUDED.valor,\n  data_criacao = EXCLUDED.data_criacao, data_modificacao = EXCLUDED.data_modificacao, responsavel_id = EXCLUDED.responsavel_id, empresa_id = EXCLUDED.empresa_id,\n  empresa_titulo = EXCLUDED.empresa_titulo, contato_id = EXCLUDED.contato_id, nome = EXCLUDED.nome, sobrenome = EXCLUDED.sobrenome,\n  telefones = EXCLUDED.telefones, emails = EXCLUDED.emails, extraido_via = EXCLUDED.extraido_via, schema_version = EXCLUDED.schema_version,\n  campos_ausentes = EXCLUDED.campos_ausentes, inconsistencias = EXCLUDED.inconsistencias;\n\nINSERT INTO intelligence.ingestion_rejections\n  (run_id, portal, entidade, bitrix_id, staging_id, campos_ausentes, inconsistencias, source_fingerprint)\nSELECT run_id, portal, entidade, bitrix_id, staging_id, campos_ausentes, inconsistencias, source_fingerprint\nFROM jsonb_to_recordset((SELECT j->'rejections' FROM _bronze_payload)) AS x(\n  run_id text, portal text, entidade text, bitrix_id text, staging_id text, campos_ausentes text[], inconsistencias text[], source_fingerprint text\n)\nON CONFLICT (run_id, entidade, source_fingerprint) DO NOTHING;\n\nDROP TABLE _bronze_payload;\nCOMMIT;\n`;
}

export function gerarManifestoBronze(preparado) {
  return {
    runs: preparado.runs.map(({ run_id, portal, entidade, status, registros_lidos, registros_validos, registros_invalidos }) => ({
      run_id, portal, entidade, status, registros_lidos, registros_validos, registros_invalidos,
    })),
    snapshots_validos: { negocios: preparado.negocios.length, leads: preparado.leads.length },
    rejeicoes: preparado.rejections.length,
    contem_payload_bruto: false,
  };
}

function arg(nome) {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : null;
}

async function main() {
  const input = arg('--input');
  const sqlOut = arg('--sql');
  const manifestOut = arg('--manifest');
  if (!input || !sqlOut || !manifestOut) {
    throw new Error('uso: node scripts/bronze-ingest.mjs --input envelope.json --sql saida.sql --manifest manifesto.json');
  }
  const envelope = JSON.parse(readFileSync(input, 'utf8'));
  const preparado = prepararIngestaoBronze(envelope);
  writeFileSync(sqlOut, gerarSqlIngestaoBronze(preparado), 'utf8');
  writeFileSync(manifestOut, JSON.stringify(gerarManifestoBronze(preparado), null, 2) + '\n', 'utf8');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err?.stack || err);
    process.exitCode = 1;
  });
}
