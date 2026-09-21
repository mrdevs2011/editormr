-- 006_analytics_errors.sql
-- Faza 9C/9D: anonim analitika + client xato loglari.
-- project_id text — projects.id (text) bilan mos.

create table if not exists public.analytics_events (
  id bigserial primary key,
  event_name text not null,
  project_id text null,
  created_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'analytics_events'
      and column_name = 'project_id' and data_type = 'uuid'
  ) then
    alter table public.analytics_events
      alter column project_id type text using project_id::text;
  end if;
end $$;

create table if not exists public.client_errors (
  id bigserial primary key,
  message text not null,
  stack text null,
  url text null,
  created_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);

comment on table public.analytics_events is
  'Anonim voqealar (project_created, export_*, ...). PII yo''q. Faza 9.';
comment on table public.client_errors is
  'Brauzer xato loglari (rate-limited). PII yo''q. Faza 9.';

alter table public.analytics_events enable row level security;
alter table public.client_errors enable row level security;

drop policy if exists analytics_events_insert on public.analytics_events;
drop policy if exists client_errors_insert on public.client_errors;

create policy analytics_events_insert on public.analytics_events
  for insert to anon, authenticated
  with check (true);

create policy client_errors_insert on public.client_errors
  for insert to anon, authenticated
  with check (true);

notify pgrst, 'reload schema';
