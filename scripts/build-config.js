// Vercel build: env o'zgaruvchilardan js/supabase-config.js ni generatsiya qiladi.
const fs = require('fs');
const path = require('path');

const url = (process.env.SUPABASE_URL || '').trim();
const key = (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();

if (!url || !key) {
  console.log('[build-config] SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY yo\'q — js/supabase-config.js o\'zgarmadi.');
  process.exit(0);
}
if (!/^https:\/\//.test(url)) {
  console.error('[build-config] SUPABASE_URL "https://" bilan boshlanishi kerak.');
  process.exit(1);
}
if (/^postgres(ql)?:/i.test(url) || /service_role/i.test(key)) {
  console.error('[build-config] Noto\'g\'ri qiymat: connection string yoki service_role key brauzerga chiqmaydi!');
  process.exit(1);
}

const config = { url, anonKey: key };

const out =
  '// AVTO-GENERATSIYA (scripts/build-config.js). Qo\'lda tahrirlama.\n' +
  'window.SUPABASE_CONFIG = ' +
  JSON.stringify(config, null, 2) +
  ';\n' +
  '\n' +
  'window.MRDRIVE_CONFIG = window.MRDRIVE_CONFIG || {\n' +
  '  url: "",\n' +
  '  anonKey: "",\n' +
  '  maxUploadsPerWindow: 5,\n' +
  '  windowMs: 600000,\n' +
  '};\n';

fs.writeFileSync(path.join(__dirname, '..', 'js', 'supabase-config.js'), out);
console.log('[build-config] js/supabase-config.js yozildi:', url);
