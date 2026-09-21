-- Faza 5: subtitr ustuni + schema_version.
-- AVVAL shu faylni Supabase SQL Editor'da ishga tushir.
-- Keyin information_schema bilan tekshir. Keyin kodni deploy qil.
-- Ustun yo'q bo'lsa dbSaveProject HAMMA saqlashni to'xtatadi.

alter table if exists public.projects
  add column if not exists subtitles jsonb not null default '{}'::jsonb;

alter table if exists public.projects
  add column if not exists schema_version integer not null default 1;

notify pgrst, 'reload schema';
