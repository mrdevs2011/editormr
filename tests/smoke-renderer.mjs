/**
 * Faza 2B-6: Playwright smoke — sahifa ochilganda pageerror yo'q,
 * canvas renderer bilan asosiy elementlar bor.
 *
 * Ishga tushirish (Chrome channel H.264 uchun):
 *   cd tests && npx playwright install chromium
 *   node smoke-renderer.mjs
 *
 * COOP/COEP kerak bo'lsa: npx vercel dev (alohida terminal).
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function startServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let path = (req.url || '/').split('?')[0];
      if (path === '/') path = '/index.html';
      const file = join(ROOT, path.replace(/^\//, ''));
      if (!file.startsWith(ROOT) || !existsSync(file)) {
        res.writeHead(404); res.end('not found'); return;
      }
      const body = readFileSync(file);
      res.writeHead(200, {
        'Content-Type': MIME[extname(file)] || 'application/octet-stream',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      });
      res.end(body);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

async function main() {
  const { server, port } = await startServer();
  const base = `http://127.0.0.1:${port}`;
  const errors = [];
  let browser;
  try {
    browser = await chromium.launch({
      channel: process.env.PW_CHANNEL || undefined,
      headless: true,
    });
    const page = await browser.newPage();
    page.on('pageerror', (err) => errors.push(String(err)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push('console: ' + msg.text());
    });

    // Dev bypass auth (auth.js emr-dev-bypass)
    await page.addInitScript(() => {
      try { localStorage.setItem('emr-dev-bypass', '1'); } catch (_) {}
      try { localStorage.setItem('emr.renderer', 'canvas'); } catch (_) {}
    });

    await page.goto(base + '/index.html?renderer=canvas', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);

    const hasCanvas = await page.evaluate(() => {
      return !!(window.EMR && window.EMR.renderFrame && document.getElementById('emr-preview-canvas'));
    });

    console.log('[1] pageerror count:', errors.length);
    if (errors.length) {
      errors.slice(0, 5).forEach((e) => console.log('  ', e));
    }
    console.log('[2] EMR.renderFrame + canvas element:', hasCanvas ? 'OK' : 'FAIL');

    const mode = await page.evaluate(() => window.EMR && window.EMR.getRendererMode && window.EMR.getRendererMode());
    console.log('[3] renderer mode:', mode);

    if (errors.length > 0 || !hasCanvas || mode !== 'canvas') {
      process.exitCode = 1;
      console.log('SMOKE FAIL');
    } else {
      console.log('SMOKE OK');
    }
  } catch (err) {
    console.error('SMOKE ERROR', err);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

main();
