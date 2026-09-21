// tests/verify-b15-ffmpeg-lazyload.mjs
//
// B15 tekshiruvi: "ffmpeg.js va @ffmpeg/util endi sahifa ochilganda emas,
// faqat birinchi MP4 export chaqirilganda yuklanadi" (js/export.js:getFFmpeg,
// js/export.js:loadFFmpegScripts).
//
// Bu skript loyihani (EMR/) lokal statik server orqali production'dagi bilan
// bir xil header'lar (vercel.json: CSP, COOP, COEP) bilan ko'taradi, so'ng
// haqiqiy Chromium'da ochib, tarmoq so'rovlarini kuzatadi:
//
//   1) Sahifa ochilganda hech qanday "ffmpeg" so'rovi BO'LMASLIGI kerak.
//   2) window.getFFmpeg funksiyasi global (window) da mavjud bo'lishi kerak
//      (upload.js/export.js kabi barcha .js fayllar oddiy <script> — modul
//      emas — bo'lgani uchun top-level function'lar window'ga yopishadi).
//   3) window.getFFmpeg() birinchi marta chaqirilganda — ffmpeg.js va
//      @ffmpeg/util so'rovlari ENDI paydo bo'lishi, va funksiya xatosiz
//      tugashi (FFmpeg instance qaytarishi) kerak. Bu qadam HAQIQIY
//      internetga (cdn.jsdelivr.net) muhtoj.
//   4) window.getFFmpeg() ikkinchi marta chaqirilsa — ffmpeg.js/util uchun
//      YANGI <script> so'rovi BO'LMASLIGI kerak (keshlangan promise/instance).
//
// Muvaffaqiyatsiz bo'lsa aniq sababi bilan process.exit(1); hammasi o'tsa
// exit(0). Batafsil ishga tushirish qo'llanmasi: tests/README.md

import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..'); // EMR/
const PORT = 8934;

// vercel.json'dagi header'larning aynan o'zi — production muhitini
// mumkin qadar aniq taqlid qilish uchun (ayniqsa CSP script-src va
// COOP/COEP, chunki dinamik <script> inject aynan shu CSP ostida ishlashi
// kerak edi).
const SECURITY_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; " +
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://cdn.jsdelivr.net; " +
    "worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.wasm': 'application/wasm',
};

function startServer() {
  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    // "/login/" -> "/login/index.html" kabi papka-marshrutlarni qo'llab-quvvatlash
    let filePath = path.join(PROJECT_ROOT, urlPath);
    if (filePath.endsWith('/')) filePath = path.join(filePath, 'index.html');

    // Path traversal himoyasi
    if (!filePath.startsWith(PROJECT_ROOT)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.readFile(filePath, (err, data) => {
      const headers = { ...SECURITY_HEADERS };
      if (err) {
        res.writeHead(404, headers);
        res.end('Not found: ' + urlPath);
        return;
      }
      const ext = path.extname(filePath);
      headers['Content-Type'] = MIME[ext] || 'application/octet-stream';
      res.writeHead(200, headers);
      res.end(data);
    });
  });
  return new Promise((resolve) => {
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('  OK  ' + msg);
}

async function main() {
  console.log(`[1/6] Lokal server ko'tarilmoqda (${PROJECT_ROOT}) -> http://127.0.0.1:${PORT}/`);
  const server = await startServer();

  const browser = await chromium.launch();
  const page = await browser.newPage();

  const requests = [];
  page.on('request', (req) => requests.push(req.url()));
  page.on('pageerror', (err) => console.warn('  [brauzer JS xatosi, ehtimol Supabase config placeholder tufayli — e\'tiborsiz qoldiramiz]', err.message));

  // auth.js'dagi tayyor local dev-bypass: Supabase sozlanmagan (SETUP-SUPABASE.sql
  // qo'lda to'ldirilmagan) holatda ham login'ga qaytarib yubormasligi uchun.
  // Bu — ilovaning o'zidagi rasmiy mexanizm (auth.js:requireSession), biz hech
  // narsani soxtalashtirmayapmiz.
  await page.addInitScript(() => {
    try { sessionStorage.setItem('emr-dev-bypass', '1'); } catch (_) {}
  });

  let exitCode = 0;
  try {
    console.log('[2/6] Sahifa ochilmoqda...');
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load', timeout: 30000 });
    // Barcha <script> teglar parse/run bo'lishi uchun bir zum kutamiz
    await page.waitForFunction(() => typeof window.getFFmpeg === 'function', { timeout: 10000 });

    console.log('[3/6] Dastlabki holat tekshirilmoqda (ffmpeg HALI yuklanmagan bo\'lishi kerak)...');
    const ffmpegReqsBeforeCount = requests.filter((u) => /ffmpeg/i.test(u)).length;
    assert(ffmpegReqsBeforeCount === 0, `sahifa ochilganda ffmpeg so'rovi yo'q (topildi: ${ffmpegReqsBeforeCount})`);

    const hasFFmpegGlobalBefore = await page.evaluate(() => !!(window.FFmpegWASM || window.FFmpeg));
    assert(hasFFmpegGlobalBefore === false, 'window.FFmpegWASM / window.FFmpeg hali aniqlanmagan');

    const getFFmpegType = await page.evaluate(() => typeof window.getFFmpeg);
    assert(getFFmpegType === 'function', 'window.getFFmpeg global funksiya sifatida mavjud');

    console.log('[4/6] window.getFFmpeg() birinchi marta chaqirilmoqda (haqiqiy internet kerak, sekin bo\'lishi mumkin)...');
    const t0 = Date.now();
    const firstCallOk = await page.evaluate(async () => {
      try {
        const ffmpeg = await window.getFFmpeg();
        return !!ffmpeg;
      } catch (e) {
        return 'ERR: ' + (e && e.message);
      }
    });
    console.log(`      (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    assert(firstCallOk === true, `getFFmpeg() muvaffaqiyatli qaytdi (natija: ${firstCallOk})`);

    const ffmpegReqsAfterFirst = requests.filter((u) => /ffmpeg/i.test(u));
    assert(ffmpegReqsAfterFirst.length >= 2, `birinchi chaqiruvdan keyin ffmpeg so'rovlari paydo bo'ldi (${ffmpegReqsAfterFirst.length} ta)`);
    const hasFFmpegGlobalAfter = await page.evaluate(() => !!(window.FFmpegWASM || window.FFmpeg));
    assert(hasFFmpegGlobalAfter === true, 'window.FFmpegWASM / window.FFmpeg endi aniqlangan');

    console.log('[5/6] window.getFFmpeg() ikkinchi marta chaqirilmoqda (keshlanishi kerak)...');
    const countBefore = requests.filter((u) => /ffmpeg\.js|@ffmpeg\/util/i.test(u)).length;
    const secondCallOk = await page.evaluate(async () => {
      try {
        const ffmpeg = await window.getFFmpeg();
        return !!ffmpeg;
      } catch (e) {
        return 'ERR: ' + (e && e.message);
      }
    });
    assert(secondCallOk === true, 'getFFmpeg() ikkinchi chaqiruvda ham muvaffaqiyatli');
    const countAfter = requests.filter((u) => /ffmpeg\.js|@ffmpeg\/util/i.test(u)).length;
    assert(countAfter === countBefore, `ikkinchi chaqiruvda yangi <script> so'rovi yo'q (oldin: ${countBefore}, keyin: ${countAfter})`);

    console.log('[6/6] Hammasi o\'tdi.');
  } catch (e) {
    console.error('\n' + (e && e.message ? e.message : e));
    console.error('\nUshbu payt kuzatilgan barcha so\'rovlar (oxirgi 20 tasi):');
    requests.slice(-20).forEach((u) => console.error('  ' + u));
    exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }

  if (exitCode === 0) {
    console.log('\n✅ B15 TASDIQLANDI: ffmpeg faqat kerak bo\'lganda, bir marta yuklanadi.');
  } else {
    console.log('\n❌ B15 TEST MUVAFFAQIYATSIZ.');
  }
  process.exit(exitCode);
}

main();
