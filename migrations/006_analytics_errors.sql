-- 006_analytics_errors.sql
-- Faza 9C/9D: anonim analitika + client xato loglari.
--
-- Qo'lda: Supabase SQL Editor → Run.
-- RLS: faqat INSERT (anon + authenticated). SELECT/UPDATE/DELETE yo'q.

create table if not exists public.analytics_events (
  id bigserial primary key,
  event_name text not null,
  project_id uuid null,
  created_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);

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

-- Eski policy bo'lsa o'chirib qayta yaratamiz
drop policy if exists analytics_events_insert on public.analytics_events;
drop policy if exists client_errors_insert on public.client_errors;

create policy analytics_events_insert on public.analytics_events
  for insert to anon, authenticated
  with check (true);

create policy client_errors_insert on public.client_errors
  for insert to anon, authenticated
  with check (true);

-- SELECT/UPDATE/DELETE policy YO'Q — hech kim o'qiy/o'zgartira olmaydi (service_role dan tashqari).

notify pgrst, 'reload schema';
