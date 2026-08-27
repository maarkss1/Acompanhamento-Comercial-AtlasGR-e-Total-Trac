import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gerarCargaBronzeDiretoDoBitrix } from './bitrix-bronze-source.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIRMACAO = 'READ_ONLY_LIVE_PROBE';

function erroSeguro(message) {
  const err = new Error(message);
  err.safe = true;
  return err;
}

export function validarCaminhoEfemero(filePath, root = ROOT) {
  const raw = String(filePath || '').trim();
  if (!raw) throw erroSeguro('caminho de saída efêmera não configurado');
  const target = path.resolve(raw);
  const repoRoot = path.resolve(root);
  const rel = path.relative(repoRoot, target);
  const dentroDoRepo = rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
  if (dentroDoRepo) {
    throw erroSeguro('saída do live probe deve ficar fora do workspace do repositório');
  }
  return target;
}

function validarConfirmacao(value) {
  if (String(value || '') !== CONFIRMACAO) {
    throw erroSeguro(`confirmação inválida; use exatamente ${CONFIRMACAO}`);
  }
}

export async function executarLiveProbe({
  portal,
  webhook,
  maxRecords = 100,
  sqlOut,
  manifestOut,
  confirmation,
  fetchImpl = globalThis.fetch,
  extraidoEm = new Date(),
  root = ROOT,
}) {
  validarConfirmacao(confirmation);
  const sqlPath = validarCaminhoEfemero(sqlOut, root);
  const manifestPath = validarCaminhoEfemero(manifestOut, root);
  if (sqlPath === manifestPath) throw erroSeguro('SQL e manifesto precisam de caminhos diferentes');

  const carga = await gerarCargaBronzeDiretoDoBitrix({
    portal,
    webhook,
    maxRecords,
    fetchImpl,
    extraidoEm,
  });

  mkdirSync(path.dirname(sqlPath), { recursive: true });
  mkdirSync(path.dirname(manifestPath), { recursive: true });
  writeFileSync(sqlPath, carga.sql, { encoding: 'utf8', mode: 0o600 });
  writeFileSync(manifestPath, JSON.stringify(carga.manifesto, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });

  return carga.manifesto;
}

function resumoSeguro(manifesto) {
  return {
    runs: (manifesto?.runs || []).map((r) => ({
      portal: r.portal,
      entidade: r.entidade,
      status: r.status,
      registros_lidos: r.registros_lidos,
      registros_validos: r.registros_validos,
      registros_invalidos: r.registros_invalidos,
    })),
    snapshots_validos: manifesto?.snapshots_validos || {},
    rejeicoes: Number(manifesto?.rejeicoes || 0),
    contem_payload_bruto: manifesto?.contem_payload_bruto === true,
  };
}

async function main() {
  const manifesto = await executarLiveProbe({
    portal: process.env.BITRIX_PORTAL,
    webhook: process.env.BITRIX_WEBHOOK_URL,
    maxRecords: process.env.BITRIX_MAX_RECORDS || '100',
    sqlOut: process.env.BRONZE_SQL_OUT,
    manifestOut: process.env.BRONZE_MANIFEST_OUT,
    confirmation: process.env.BITRIX_LIVE_PROBE_CONFIRMATION,
  });

  // Única saída do processo: contagens/status sem título, contato, e-mail,
  // telefone, IDs de cliente, SQL, payload bruto ou webhook.
  console.log(JSON.stringify(resumoSeguro(manifesto)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err?.safe ? err.message : 'live probe falhou sem expor detalhes sensíveis');
    process.exitCode = 1;
  });
}
