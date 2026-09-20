// ===================== SUPABASE CONFIG =====================
// Production: Vercel env orqali scripts/build-config.js yozadi.
// Local: url va anonKey ni to'ldiring.
// service_role HECH QACHON bu yerga qo'yilmasin.
//
// Barcha Google hisoblari kira oladi. Har user faqat o'z loyihalarini ko'radi (RLS).
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
