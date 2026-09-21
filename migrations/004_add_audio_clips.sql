-- 002_add_audio_clips.sql
-- Faza 4 (Audio): ko'p qatorli audio (music / sfx / voice) + ducking sozlamalari.
--
-- MUHIM: Avval shu SQL ni Supabase Dashboard → SQL Editor da ishga tushir.
-- information_schema.columns dan audio_clips / ducking / schema_version ustunlarini
-- tekshir. KEYIN kodni deploy/sinab ko'r. Ustun yo'q bo'lsa HARSAQLASH to'xtaydi.
--
-- Eski music ustuni saqlanadi (bir versiya moslik uchun); Faza 9 da olib tashlanadi.

alter table public.projects
  add column if not exists audio_clips jsonb not null default '[]'::jsonb;

alter table public.projects
  add column if not exists ducking jsonb not null default '{"enabled":false,"amountDb":-12,"attackMs":150,"releaseMs":400,"includeVideoAudio":true}'::jsonb;

alter table public.projects
  add column if not exists schema_version integer not null default 1;

comment on column public.projects.audio_clips is
  'Audio klip-lar: [{id, kind: music|sfx|voice, fileId, name, track, startTime, trimStart, trimEnd, gain, muted, fadeIn, fadeOut, duck}]. Eski music → migrateProjectMeta orqali audioClips[0].';

comment on column public.projects.ducking is
  'Loyiha darajasidagi ducking: {enabled, amountDb, attackMs, releaseMs, includeVideoAudio}.';

comment on column public.projects.schema_version is
  'Loyiha JSON sxema versiyasi. js/projects.js PROJECT_SCHEMA_VERSION bilan sinxron.';

-- PostgREST sxemasini yangilash (Supabase)
notify pgrst, 'reload schema';
