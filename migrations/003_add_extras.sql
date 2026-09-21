-- 002_add_extras.sql
-- Faza 3: markers, inPoint/outPoint, trackState va boshqa kengaytmalar uchun
-- bitta extras jsonb ustuni + schema_version ustuni.
--
-- Qo'lda ishga tushirish: Supabase Dashboard → SQL Editor → Run.
-- information_schema bilan tekshirgandan KEYIN kodni deploy qil.

alter table public.projects
  add column if not exists extras jsonb not null default '{}'::jsonb;

alter table public.projects
  add column if not exists schema_version int not null default 1;

comment on column public.projects.extras is
  'Kengaytma maydonlar: markers [{id,time,label,kind}], inPoint, outPoint, trackState { [trackIndex]: {muted,hidden,locked} }. js/projects.js yozadi, js/storage.js:rowToMeta o''qiydi.';

comment on column public.projects.schema_version is
  'Loyiha meta sxema versiyasi. js/projects.js PROJECT_SCHEMA_VERSION bilan sinxron.';

notify pgrst, 'reload schema';
