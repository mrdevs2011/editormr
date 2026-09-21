// ===================== SUPABASE CONFIG =====================
// 1) Supabase Dashboard → Project Settings → API
//    - Project URL  → url
//    - anon public  → anonKey  (service_role HECH QACHON)
// 2) Authentication → Providers → Google: Enable
//    Redirect URL: https://YOUR_DOMAIN/  va  http://localhost:3000/
// 3) SQL Editor → SETUP-ALL.sql ni Run qiling
//
// Production (Vercel): SUPABASE_URL + SUPABASE_ANON_KEY env
//   → scripts/build-config.js avtomatik yozadi.
// Local: quyidagi ikkita qiymatni to'ldiring.

window.SUPABASE_CONFIG = {
  url: 'PASTE_SUPABASE_URL_HERE',
  anonKey: 'PASTE_SUPABASE_ANON_KEY_HERE',
};

window.MRDRIVE_CONFIG = {
  url: '',
  anonKey: '',
  maxUploadsPerWindow: 5,
  windowMs: 10 * 60 * 1000,
};
