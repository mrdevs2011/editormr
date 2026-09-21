# EditorMR — Production package

Birlashtirilgan: pase0 + phase1..9 (parallel branch union + Faza 9 sayqal).

## Supabase migratsiyalar (tartib)

1. migrations/001_add_text_clips.sql
2. migrations/002_add_canvas_schema.sql
3. migrations/003_add_extras.sql
4. migrations/004_add_audio_clips.sql
5. migrations/005_add_subtitles.sql
6. migrations/006_analytics_errors.sql

Har birini SQL Editor da Run qiling, keyin kodni oching.

## Ishga tushirish

```bash
npx vercel dev
# yoki static + COOP/COEP header bilan
```

## Cheklovlar

- Fazalar parallel yozilgan — ba'zi feature modullar core save bilan to'liq sinxron emas.
- Brauzerda to'liq regressiya shu paket uchun avtomatik o'tkazilmagan.
- Batafsil: PRODUCTION-MERGE.md, work.md Progress log.
