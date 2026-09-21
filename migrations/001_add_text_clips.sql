-- 001_add_text_clips.sql
-- B1 tuzatish: matn overlay'lar (state.textClips) hozirgacha faqat brauzer
-- xotirasida edi — sahifa yangilansa yo'qolardi. Bu ustun ularni saqlaydi.
--
-- Qo'lda ishga tushirish: Supabase Dashboard → SQL Editor → shu faylni yopishtir → Run.
-- Eski SETUP SQL fayliga tegilmadi, bu — alohida, qo'shimcha migratsiya.

alter table public.projects
  add column if not exists text_clips jsonb not null default '[]'::jsonb;

comment on column public.projects.text_clips is
  'Matn overlay klip-lari (id, text, startTime, duration, x, y, fontSize, color, bold, align, bgColor, bgOpacity). js/projects.js:saveProjectNow yozadi, js/storage.js:rowToMeta o''qiydi.';
