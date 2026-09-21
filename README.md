# EMR VideoEditor

Brauzerda ishlaydigan video-editor.

## Config (faqat env)

Kalitlar kodga yozilmaydi. `scripts/build-config.js` env dan `js/supabase-config.js` yasaydi.

| O‘zgaruvchi | Mazmun |
|-------------|--------|
| `SUPABASE_URL` | Project URL (`https://...`) |
| `SUPABASE_ANON_KEY` | anon / publishable key |

**Vercel:** Project → Settings → Environment Variables (Production + Preview). Deploy = avtomatik `build`.

**Local Google login:**

```bash
cp .env.example .env
# .env ga URL va key yozing
node scripts/build-config.js
npx serve .
```

Env bo‘sh bo‘lsa — accountsiz (IndexedDB) rejim.

## Papkalar

- `js/` — ilova
- `css/` — stillar
- `render/` — canvas
- `scripts/build-config.js` — env → config
