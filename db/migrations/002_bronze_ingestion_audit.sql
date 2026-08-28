-- AtlasGR Intelligence Hub — auditoria de rejeições da ingestão Bronze
-- Wave 2 / Sprint 02
--
-- Objetivo: impedir descarte silencioso de registros que falham no contrato
-- de Staging sem persistir o payload bruto rejeitado. A tabela guarda apenas
-- identificadores não sensíveis, motivos de rejeição e um fingerprint SHA-256.

begin;

create table if not exists intelligence.ingestion_rejections (
  rejection_id bigint generated always as identity primary key,
  run_id text not null references intelligence.ingestion_runs(run_id) on delete cascade,
  portal text not null check (portal in ('atlasgr', 'totaltrac')),
  entidade text not null check (entidade in ('negocios', 'leads')),
  bitrix_id text check (bitrix_id is null or bitrix_id ~ '^[0-9]+$'),
  staging_id text,
  campos_ausentes text[] not null default '{}'::text[],
  inconsistencias text[] not null default '{}'::text[],
  source_fingerprint text not null check (source_fingerprint ~ '^[a-f0-9]{64}$'),
  registrado_em timestamptz not null default now(),
  unique (run_id, entidade, source_fingerprint),
  check (
    staging_id is null
    or bitrix_id is null
    or staging_id = portal || ':' || bitrix_id
  )
);

create index if not exists idx_ingestion_rejections_run
  on intelligence.ingestion_rejections (run_id);
create index if not exists idx_ingestion_rejections_portal_entidade
  on intelligence.ingestion_rejections (portal, entidade, registrado_em desc);

alter table intelligence.ingestion_rejections enable row level security;

comment on table intelligence.ingestion_rejections is
  'Quarentena auditável da ingestão Bronze. Não armazena payload bruto/PII; somente IDs seguros, motivos e fingerprint SHA-256.';
comment on column intelligence.ingestion_rejections.source_fingerprint is
  'SHA-256 do registro bruto usado apenas para rastreabilidade/idempotência; o payload bruto não é persistido nesta tabela.';

commit;
