# EMR Production merge (pase0 + phase1..5)

## Qanday birlashtirildi

Fazalar **parallel branch** edi (har biri asosan Faza 0 ustiga alohida).
Shu production paketi:

| Manba | Nima olindi |
|-------|-------------|
| **pase0** | Asos (Faza 0 bug-bash, tuzilma, assets) |
| **phase2** | Yagona renderer (`render/`), canvas schema, export→renderFrame, core js (state/projects/storage/export/canvas/history/…) |
| **phase3** | snap, silence, beat, markers, inspector, track-controls, strings |
| **phase4** | audio-engine, audio-logic, voice-over, music.js peaks |
| **phase1** | exporter / export-core / export-render, text-core, text-fonts, subtitles, captions-beta, fonts/, tools/ |
| **phase5** | (phase1 bilan deyarli bir xil; exporter stub — phase1 ustunlik qildi) |

## Migratsiyalar (tartib bilan Supabase SQL Editor)

1. `migrations/001_add_text_clips.sql`
2. `migrations/002_add_canvas_schema.sql`  — canvas jsonb, schema_version
3. `migrations/003_add_extras.sql`         — extras jsonb, schema_version
4. `migrations/004_add_audio_clips.sql`    — audio_clips, ducking, schema_version
5. `migrations/005_add_subtitles.sql`      — subtitles

**Avval hammasi Run, keyin deploy.** Ustun yo‘q = saqlash o‘lishi mumkin.

## Integratsiya holati (schema v3 — 100% core)

- Core `state.js` / `projects.js` / `storage.js` — **audioClips, ducking, subtitles, extras/markers** to‘liq save/load/migrate.
- `PROJECT_SCHEMA_VERSION = 3`; migrateProjectMeta v0→v3 (music→audioClips, defaults).
- phase1 WebCodecs exporter **beta**; asosiy export hali MediaRecorder + phase2 renderFrame.
- phase3 playback o‘rniga phase2 playback qoldi (canvas hook).
- Node testlar 0 FAIL. **Brauzerda to‘liq regressiya** qo‘lda: silence, audio, captions, export, A/B renderer.

## Tavsiya

1. SQL 001→006 (SETUP-SUPABASE.sql + migrations)
2. `js/supabase-config.js` da url + anonKey
3. `npx vercel dev`
4. `?renderer=canvas` va `?renderer=legacy`
5. Har faza feature’ini alohida sinang (silence, audio, captions, export)

