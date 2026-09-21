// Env → js/supabase-config.js (local, Vercel, CI — bir xil).
// O'qiydi: process.env, keyin ixtiyoriy .env / .env.local (repo ildizida).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function loadDotEnv(file) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) return;
  const text = fs.readFileSync(p, 'utf8');
  for (const line of text.split(/\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(s);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[m[1]] == null || process.env[m[1]] === '') {
      process.env[m[1]] = v;
    }
  }
}

loadDotEnv('.env');
loadDotEnv('.env.local');

const url = (process.env.SUPABASE_URL || '').trim();
const key = (
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  ''
).trim();

if (url && !/^https:\/\//.test(url)) {
  console.error('[build-config] SUPABASE_URL "https://" bilan boshlanishi kerak.');
  process.exit(1);
}
if (/^postgres(ql)?:/i.test(url) || /service_role/i.test(key)) {
  console.error('[build-config] Connection string yoki service_role brauzerga yozilmaydi!');
  process.exit(1);
}

const config = { url: url || '', anonKey: key || '' };

const out =
  '// AVTO-GENERATSIYA (scripts/build-config.js). Qo\'lda tahrirlama — faqat env.\n' +
  'window.SUPABASE_CONFIG = ' +
  JSON.stringify(config, null, 2) +
  ';\n\n' +
  'window.MRDRIVE_CONFIG = window.MRDRIVE_CONFIG || {\n' +
  '  url: "",\n' +
  '  anonKey: "",\n' +
  '  maxUploadsPerWindow: 5,\n' +
  '  windowMs: 600000,\n' +
  '};\n';

fs.writeFileSync(path.join(root, 'js', 'supabase-config.js'), out);

if (url && key) {
  console.log('[build-config] OK —', url);
} else {
  console.log('[build-config] Env bo\'sh — guest/local rejim (SUPABASE_URL / SUPABASE_ANON_KEY yo\'q).');
}
