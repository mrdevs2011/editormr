-- 002_add_canvas_schema.sql
-- FAZA 2A-1: loyiha kanvas o'lchami va sxema versiyasi.
--
-- MUHIM: shu SQL'ni Supabase Dashboard → SQL Editor'da BIRINCHI ishga tushir,
-- KEYIN kodni deploy/sinab ko'r. Ustunlar yo'q bo'lsa HAR saqlash to'xtaydi.
--
-- canvas jsonb: { "w": 1080, "h": 1920, "fps": 30 } yoki null (= asl nisbat,
-- birinchi asosiy qator clipidan).
-- schema_version: loyiha meta versiyasi (migrateProjectMeta uchun).

alter table public.projects
  add column if not exists canvas jsonb;

alter table public.projects
  add column if not exists schema_version int not null default 1;

comment on column public.projects.canvas is
  'Loyiha kanvas o''lchami {w,h,fps}. null = asl nisbat (birinchi asosiy qator clip). js/projects.js yozadi, js/storage.js:rowToMeta o''qiydi.';

comment on column public.projects.schema_version is
  'Loyiha meta sxema versiyasi. migrateProjectMeta() eski loyihalarni ko''taradi.';

-- PostgREST schema cache'ni yangilash (Supabase REST API yangi ustunlarni ko'rsin)
notify pgrst, 'reload schema';
