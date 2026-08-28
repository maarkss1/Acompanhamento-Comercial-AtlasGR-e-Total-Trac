import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SQL_PATH = path.join(ROOT, "db", "migrations", "001_staging_bronze.sql");
const sql = readFileSync(SQL_PATH, "utf8");
const normalizado = sql.replace(/\s+/g, " ").toLowerCase();

describe("001_staging_bronze.sql — contrato estrutural", () => {
  test("migração é transacional e cria o schema intelligence", () => {
    assert.match(normalizado, /\bbegin\s*;/);
    assert.match(normalizado, /create schema if not exists intelligence\s*;/);
    assert.match(normalizado, /\bcommit\s*;/);
  });

  test("declara as três tabelas mínimas do Bronze/Staging", () => {
    for (const tabela of ["ingestion_runs", "staging_negocios", "staging_leads"]) {
      assert.match(normalizado, new RegExp(`create table if not exists intelligence\\.${tabela}\\s*\\(`));
    }
  });

  test("segrega explicitamente AtlasGR e Total Trac", () => {
    const checksPortal = normalizado.match(/portal in \('atlasgr', 'totaltrac'\)/g) || [];
    assert.ok(checksPortal.length >= 3, "portal deve ser restringido nas tabelas de ingestão e staging");
  });

  test("staging_id é amarrado a portal + bitrix_id para evitar colisão entre portais", () => {
    const businessKeyChecks = normalizado.match(/staging_id = portal \|\| ':' \|\| bitrix_id/g) || [];
    assert.ok(businessKeyChecks.length >= 2, "Negócios e Leads precisam validar a chave composta");
  });

  test("RLS está habilitado em todas as tabelas e nenhuma policy permissiva é criada", () => {
    for (const tabela of ["ingestion_runs", "staging_negocios", "staging_leads"]) {
      assert.match(normalizado, new RegExp(`alter table intelligence\\.${tabela} enable row level security\\s*;`));
    }
    assert.doesNotMatch(normalizado, /\bcreate\s+policy\b/, "a migração-base deve permanecer fechada por padrão");
  });

  test("não permite URL de webhook em extraido_via", () => {
    assert.match(normalizado, /position\('http:\/\/' in lower\(extraido_via\)\) = 0/);
    assert.match(normalizado, /position\('https:\/\/' in lower\(extraido_via\)\) = 0/);
  });

  test("cria views latest determinísticas para negócios e leads", () => {
    assert.match(normalizado, /create or replace view intelligence\.staging_negocios_latest/);
    assert.match(normalizado, /create or replace view intelligence\.staging_leads_latest/);
    assert.match(normalizado, /distinct on \(portal, bitrix_id\)/);
    assert.match(normalizado, /order by portal, bitrix_id, extraido_em desc, snapshot_id desc/);
  });

  test("PII é reconhecida nos comentários e nenhum webhook literal aparece no SQL", () => {
    assert.match(normalizado, /contém pii|contem pii/);
    assert.doesNotMatch(sql, /https?:\/\/[^\s"']+\/rest\/\d+\/[A-Za-z0-9_-]+/i);
  });
});
