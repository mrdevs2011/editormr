// Lokal dev server — vercel.json dagi COOP/COEP/CSP headerlari bilan.
// Oddiy `npx serve` SharedArrayBuffer/ffmpeg.wasm uchun yetarli emas.
// Ishga tushirish: node scripts/dev-headers.js
// Default: http://127.0.0.1:4173

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://cdn.jsdelivr.net; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

function safeJoin(urlPath) {
  const decoded = decodeURIComponent((urlPath || '/').split('?')[0]);
  let rel = decoded.replace(/\\/g, '/');
  if (rel.endsWith('/')) rel += 'index.html';
  if (rel === '') rel = '/index.html';
  const abs = path.normalize(path.join(ROOT, rel));
  if (!abs.startsWith(ROOT)) return null;
  return abs;
}

const server = http.createServer((req, res) => {
  const file = safeJoin(req.url || '/');
  if (!file) {
    res.writeHead(400);
    res.end('bad path');
    return;
  }
  fs.stat(file, (err, st) => {
    let target = file;
    if (err || !st.isFile()) {
      const asIndex = path.join(file, 'index.html');
      if (fs.existsSync(asIndex)) target = asIndex;
      else {
        res.writeHead(404, HEADERS);
        res.end('not found');
        return;
      }
    }
    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, Object.assign({ 'Content-Type': TYPES[ext] || 'application/octet-stream' }, HEADERS));
    fs.createReadStream(target).pipe(res);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('EditorMR dev: http://127.0.0.1:' + PORT + ' (COOP/COEP yoqilgan)');
});
