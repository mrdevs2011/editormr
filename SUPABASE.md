# EMR × Supabase

## 1. Loyiha ochish
Supabase.com → New project.

## 2. SQL (bir marta)
Dashboard → **SQL Editor** → `SETUP-ALL.sql` ni butunlay yopishtir → **Run**.

Natija:
- `projects` (schema v3: text_clips, canvas, audio_clips, ducking, subtitles, extras…)
- RLS (har user faqat o'z qatorlari)
- Storage bucket `project-media` (private, 500 MB)
- `analytics_events` + `client_errors` (faqat INSERT)

## 3. Google Auth
Authentication → Providers → **Google** → Enable  
Redirect URLs:
- `http://localhost:3000/`
- `https://YOUR_DOMAIN/`

## 4. Kalitlar
Project Settings → API:
- **URL** → `js/supabase-config.js` → `url`
- **anon public** → `anonKey`

Vercel: env `SUPABASE_URL` + `SUPABASE_ANON_KEY` (yoki `SUPABASE_PUBLISHABLE_KEY`).

## 5. Tekshiruv
```sql
select column_name from information_schema.columns
where table_name = 'projects' order by 1;

select id, public from storage.buckets where id = 'project-media';
```

Brauzer: login → yangi loyiha → saqlash → yangilash → loyiha qayta ochilishi kerak.
