-- ============================================================
-- EMR VideoEditor — SUPABASE TO'LIQ SOZLASH (bir marta RUN)
-- Supabase Dashboard → SQL Editor → New query → shu faylni
-- butunlay yopishtir → Run.
-- Idempotent: qayta ishga tushirish xavfsiz.
-- ============================================================

-- ---------- 1) projects jadvali (barcha ustunlar schema v3) ----------
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

-- Migratsiya ustunlari (eski jadvalga ham qo'shiladi)
alter table public.projects add column if not exists text_clips jsonb not null default '[]'::jsonb;
alter table public.projects add column if not exists canvas jsonb;
alter table public.projects add column if not exists schema_version int not null default 1;
alter table public.projects add column if not exists extras jsonb not null default '{}'::jsonb;
alter table public.projects add column if not exists audio_clips jsonb not null default '[]'::jsonb;
alter table public.projects add column if not exists ducking jsonb not null default '{"enabled":false,"amountDb":-12,"attackMs":150,"releaseMs":400,"includeVideoAudio":true}'::jsonb;
alter table public.projects add column if not exists subtitles jsonb not null default '{}'::jsonb;

create index if not exists projects_user_id_idx on public.projects (user_id);
create index if not exists projects_user_updated_idx on public.projects (user_id, updated_at desc);

comment on column public.projects.text_clips is 'Matn overlay klip-lari (Faza 0/B1)';
comment on column public.projects.canvas is 'Kanvas {w,h,fps} yoki null (Faza 2)';
comment on column public.projects.schema_version is 'Meta sxema versiyasi (joriy kod: 3)';
comment on column public.projects.extras is 'markers, inPoint, outPoint, trackState (Faza 3)';
comment on column public.projects.audio_clips is 'Ko''p qatorli audio (Faza 4)';
comment on column public.projects.ducking is 'Loyiha ducking sozlamalari (Faza 4)';
comment on column public.projects.subtitles is 'Subtitr cues + style (Faza 5)';

-- ---------- 2) RLS: projects ----------
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

-- ---------- 3) Storage bucket: project-media ----------
-- Bucket yaratish (yo'q bo'lsa). Public: false.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-media',
  'project-media',
  false,
  524288000, -- 500 MB
  array[
    'video/mp4','video/webm','video/quicktime','video/x-msvideo',
    'image/jpeg','image/png','image/webp','image/gif',
    'audio/mpeg','audio/mp4','audio/wav','audio/webm','audio/ogg','audio/x-m4a','audio/aac'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

-- Storage RLS: yo'l = <user_id>/<projectId>/<fileId>
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

-- ---------- 4) Analitika + client xatolari (Faza 9) ----------
-- project_id text — projects.id bilan mos
create table if not exists public.analytics_events (
  id bigserial primary key,
  event_name text not null,
  project_id text null,
  created_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);

-- Agar eski jadvalda project_id uuid bo'lsa — text ga o'tkazish
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

-- ---------- 5) PostgREST schema cache ----------
notify pgrst, 'reload schema';

-- ---------- Tekshiruv (ixtiyoriy natija) ----------
-- select column_name, data_type from information_schema.columns
--   where table_schema='public' and table_name='projects' order by ordinal_position;
