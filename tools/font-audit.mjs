#!/usr/bin/env node
// Shrift glif auditi. fontkit tests/node_modules da bo'lsa ishlatiladi.
// Majburiy kodpointlar: ʻ ʼ ‘ ’ ' Ў ў Қ қ Ғ ғ Ҳ ҳ № raqamlar tinish.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FONT_DIR = path.join(ROOT, 'fonts');
const NEEDED = [
  0x02BB, 0x02BC, 0x2018, 0x2019, 0x0027,
  0x040E, 0x045E, 0x049A, 0x049B, 0x0492, 0x0493, 0x04B2, 0x04B3,
  0x2116, 0x0030, 0x0031, 0x002E, 0x002C, 0x003F
];

let fontkit = null;
try {
  fontkit = (await import(path.join(ROOT, 'tests/node_modules/fontkit/index.js'))).default;
} catch (_) {
  console.log('fontkit yoq — audit o\'tkazilmadi (sinalmagan). npm install fontkit --prefix tests');
  process.exit(0);
}

if (!fs.existsSync(FONT_DIR)) {
  console.log('fonts/ yoq. TERMINAL dagi @fontsource nusxa buyruqlarini yugurtir.');
  process.exit(0);
}

const files = fs.readdirSync(FONT_DIR).filter((f) => f.endsWith('.woff2') || f.endsWith('.ttf'));
if (!files.length) {
  console.log('woff2 yoq — audit o\'tkazilmadi');
  process.exit(0);
}

for (const f of files) {
  const fp = path.join(FONT_DIR, f);
  const font = fontkit.openSync(fp);
  const miss = NEEDED.filter((cp) => !font.hasGlyphForCodePoint(cp));
  const ok = miss.length === 0;
  console.log((ok ? 'OK  ' : 'FAIL') + ' ' + f + (ok ? '' : ' missing: ' + miss.map((c) => 'U+' + c.toString(16)).join(',')));
}
