-- ============================================================
-- EMR — Supabase sozlash
--
-- YANGI O'RNATISH: SETUP-ALL.sql ni ishlat (bitta fayl, hammasi ichida).
-- Eski loyiha: migrations/001 → 006 ni tartib bilan Run qiling.
--
-- Bu fayl — faqat asosiy jadval + storage policy (eski moslik).
-- To'liq schema v3 uchun SETUP-ALL.sql tavsiya etiladi.
-- ============================================================

create table if not exists public.projects (
  id               text primary key,
  user_id          uuid not null references auth.users(id) on delete cascade,
  name             text not null default 'Untitled',
  created_at       bigint not null,
  updated_at       bigint not null,
  thumb            text,
  duration         numeric,
  clip_count       int,
  clips            jsonb not null default '[]'::jsonb,
  music            jsonb,
  current_time_sec numeric,
  pps              numeric,
  file_names       jsonb not null default '{}'::jsonb
);

create index if not exists projects_user_id_idx on public.projects (user_id);

alter table public.projects enable row level security;

drop policy if exists "select own projects" on public.projects;
create policy "select own projects" on public.projects
  for select using (auth.uid() = user_id);

drop policy if exists "insert own projects" on public.projects;
create policy "insert own projects" on public.projects
  for insert with check (auth.uid() = user_id);

drop policy if exists "update own projects" on public.projects;
create policy "update own projects" on public.projects
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "delete own projects" on public.projects;
create policy "delete own projects" on public.projects
  for delete using (auth.uid() = user_id);

drop policy if exists "select own media" on storage.objects;
create policy "select own media" on storage.objects
  for select using (
    bucket_id = 'project-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "insert own media" on storage.objects;
create policy "insert own media" on storage.objects
  for insert with check (
    bucket_id = 'project-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "update own media" on storage.objects;
create policy "update own media" on storage.objects
  for update using (
    bucket_id = 'project-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "delete own media" on storage.objects;
create policy "delete own media" on storage.objects
  for delete using (
    bucket_id = 'project-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Keyingi qadam: SETUP-ALL.sql (yoki migrations/001–006)
