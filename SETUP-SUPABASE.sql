-- ============================================================
-- EMR — loyihalarni Supabase'ga saqlash uchun sozlash
-- Supabase Dashboard -> SQL Editor -> New query -> shu faylni
-- to'liq nusxalab, RUN bos. Qayta ishga tushirsang ham xavfsiz
-- (hammasi "if exists" / "or replace" bilan yozilgan, mavjud
-- jadval/fayllaringizga tegmaydi).
-- ============================================================

-- 1) Loyihalar jadvali (meta: nomi, clip'lar, musiqa, fayl nomlari)
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

-- 2) RLS: istalgan Google hisobi bilan kirish mumkin, lekin har kim
--    faqat O'Z loyihalarini ko'radi/o'zgartiradi (auth.uid() = user_id).
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

-- 3) Storage bucket: media fayllar (video/rasm/audio) uchun
--    Buni SQL bilan yaratib bo'lmaydi — Dashboard'da qo'lda qil:
--      Storage -> New bucket -> Name: project-media -> Public: OFF (albatta yopiq)
--    Bucket allaqachon yaratilgan bo'lsa, shu policy'larni qayta RUN qilish yetadi.

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

-- Eslatma: agar avval is_allowed_user() funksiyasini yaratgan bo'lsangiz,
-- endi hech qaysi policy uni chaqirmaydi — xohlasangiz shu buyruq bilan
-- butunlay o'chirib tashlashingiz ham mumkin (ixtiyoriy):
-- drop function if exists public.is_allowed_user();


-- ============================================================
-- 4) (Tavsiya) Email allowlist — Supabase Dashboard:
--    Authentication -> Hooks / yoki RLS qo'shimcha:
--    Client allowedEmails faqat UX; serverda ham cheklang.
--    Vercel: ALLOWED_EMAILS=you@gmail.com
-- ============================================================
