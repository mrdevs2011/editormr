# EMR Production — 100% integratsiya

## Migratsiyalar (tartib)

1. migrations/001_add_text_clips.sql
2. migrations/002_add_canvas_schema.sql
3. migrations/003_add_extras.sql
4. migrations/004_add_audio_clips.sql
5. migrations/005_add_subtitles.sql
6. migrations/006_analytics_errors.sql

Har birini SQL Editor da Run qiling, keyin kodni oching.

## Schema version

- **v2**: canvas {w,h,fps}, clip fit/transform/opacity
- **v3** (joriy): audioClips + ducking, subtitles, extras/markers — core `state` / `projects` / `storage` bilan to'liq sinxron

## Ishga tushirish

```bash
# js/supabase-config.js da url + anonKey to'ldiring
npx vercel dev
# yoki static + COOP/COEP header bilan
```

## Integratsiya holati (100%)

- Core `state.js` / `projects.js` / `storage.js` — audioClips, ducking, subtitles, extras saqlanadi va yuklanadi
- migrateProjectMeta v0→v3
- Node testlar (sintaksis + logic + migrate) 0 FAIL
- Parallel faza branch'lari core save yo'liga birlashtirilgan

## Cheklovlar (brauzer)

- Brauzerda to'liq regressiya shu paket uchun avtomatik o'tkazilmagan — qo'lda: silence, audio, captions, export, A/B renderer
- Supabase config placeholder — production da env orqali to'ldiriladi
- Batafsil: PRODUCTION-MERGE.md, work.md
