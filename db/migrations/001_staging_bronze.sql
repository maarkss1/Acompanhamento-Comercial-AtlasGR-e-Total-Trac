-- AtlasGR Intelligence Hub — Camada Bronze/Staging
-- Wave 2 / Sprint 02
-- Compatível com PostgreSQL (Supabase / Neon).
--
-- IMPORTANTE:
-- 1) Este arquivo define somente estrutura. Não contém dados reais nem credenciais.
-- 2) PII de leads/negócios deve permanecer exclusivamente no banco privado.
-- 3) RLS é habilitado e nenhuma policy de leitura/escrita é criada por padrão.
--    Em Supabase isso mantém acesso de cliente bloqueado até políticas explícitas.

begin;

create schema if not exists intelligence;

create table if not exists intelligence.ingestion_runs (
  run_id text primary key,
  portal text not null check (portal in ('atlasgr', 'totaltrac')),
  entidade text not null check (entidade in ('negocios', 'leads')),
  schema_version text not null,
  extraido_via text not null,
  iniciado_em timestamptz not null,
  concluido_em timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'failed')),
  registros_lidos bigint not null default 0 check (registros_lidos >= 0),
  registros_validos bigint not null default 0 check (registros_validos >= 0),
  registros_invalidos bigint not null default 0 check (registros_invalidos >= 0),
  erro_resumo text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (position('http://' in lower(extraido_via)) = 0),
  check (position('https://' in lower(extraido_via)) = 0)
);

create table if not exists intelligence.staging_negocios (
  snapshot_id bigint generated always as identity primary key,
  run_id text references intelligence.ingestion_runs(run_id) on delete set null,
  staging_id text not null,
  bitrix_id text not null check (bitrix_id ~ '^[0-9]+$'),
  portal text not null check (portal in ('atlasgr', 'totaltrac')),
  titulo text,
  estagio_id text not null,
  categoria_id text,
  valor numeric(18,2),
  moeda text,
  data_criacao date,
  data_modificacao date,
  data_movido_estagio date,
  data_fechamento date,
  data_inicio date,
  data_contrato_assinado date,
  responsavel_id text check (responsavel_id is null or responsavel_id ~ '^[0-9]+$'),
  criado_por_id text check (criado_por_id is null or criado_por_id ~ '^[0-9]+$'),
  modificado_por_id text check (modificado_por_id is null or modificado_por_id ~ '^[0-9]+$'),
  movido_por_id text check (movido_por_id is null or movido_por_id ~ '^[0-9]+$'),
  empresa_id text check (empresa_id is null or empresa_id ~ '^[0-9]+$'),
  contato_id text check (contato_id is null or contato_id ~ '^[0-9]+$'),
  lead_id text check (lead_id is null or lead_id ~ '^[0-9]+$'),
  origem_id text,
  fechado boolean,
  extraido_em timestamptz not null,
  extraido_via text not null,
  schema_version text not null,
  campos_ausentes text[] not null default '{}'::text[],
  inconsistencias text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  unique (staging_id, extraido_em),
  check (staging_id = portal || ':' || bitrix_id),
  check (position('http://' in lower(extraido_via)) = 0),
  check (position('https://' in lower(extraido_via)) = 0)
);

create table if not exists intelligence.staging_leads (
  snapshot_id bigint generated always as identity primary key,
  run_id text references intelligence.ingestion_runs(run_id) on delete set null,
  staging_id text not null,
  bitrix_id text not null check (bitrix_id ~ '^[0-9]+$'),
  portal text not null check (portal in ('atlasgr', 'totaltrac')),
  titulo text,
  estagio_id text not null,
  origem_id text,
  valor numeric(18,2),
  data_criacao date,
  data_modificacao date,
  responsavel_id text check (responsavel_id is null or responsavel_id ~ '^[0-9]+$'),
  empresa_id text check (empresa_id is null or empresa_id ~ '^[0-9]+$'),
  empresa_titulo text,
  contato_id text check (contato_id is null or contato_id ~ '^[0-9]+$'),
  nome text,
  sobrenome text,
  telefones text[] not null default '{}'::text[],
  emails text[] not null default '{}'::text[],
  extraido_em timestamptz not null,
  extraido_via text not null,
  schema_version text not null,
  campos_ausentes text[] not null default '{}'::text[],
  inconsistencias text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  unique (staging_id, extraido_em),
  check (staging_id = portal || ':' || bitrix_id),
  check (position('http://' in lower(extraido_via)) = 0),
  check (position('https://' in lower(extraido_via)) = 0)
);

create index if not exists idx_staging_negocios_portal_bitrix
  on intelligence.staging_negocios (portal, bitrix_id);
create index if not exists idx_staging_negocios_extraido_em
  on intelligence.staging_negocios (extraido_em desc);
create index if not exists idx_staging_negocios_estagio
  on intelligence.staging_negocios (portal, categoria_id, estagio_id);
create index if not exists idx_staging_negocios_responsavel
  on intelligence.staging_negocios (portal, responsavel_id);

create index if not exists idx_staging_leads_portal_bitrix
  on intelligence.staging_leads (portal, bitrix_id);
create index if not exists idx_staging_leads_extraido_em
  on intelligence.staging_leads (extraido_em desc);
create index if not exists idx_staging_leads_estagio
  on intelligence.staging_leads (portal, estagio_id);
create index if not exists idx_staging_leads_responsavel
  on intelligence.staging_leads (portal, responsavel_id);

create or replace view intelligence.staging_negocios_latest as
select distinct on (portal, bitrix_id) *
from intelligence.staging_negocios
order by portal, bitrix_id, extraido_em desc, snapshot_id desc;

create or replace view intelligence.staging_leads_latest as
select distinct on (portal, bitrix_id) *
from intelligence.staging_leads
order by portal, bitrix_id, extraido_em desc, snapshot_id desc;

alter table intelligence.ingestion_runs enable row level security;
alter table intelligence.staging_negocios enable row level security;
alter table intelligence.staging_leads enable row level security;

comment on schema intelligence is 'AtlasGR Intelligence Hub — camada corporativa de dados.';
comment on table intelligence.ingestion_runs is 'Auditoria de cada execução de ingestão Bitrix.';
comment on table intelligence.staging_negocios is 'Snapshots históricos de negócios Bitrix. Pode conter PII em titulo.';
comment on table intelligence.staging_leads is 'Snapshots históricos de leads Bitrix. Contém PII e exige acesso restrito.';

commit;
