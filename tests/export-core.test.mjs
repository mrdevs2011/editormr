// Faza 1 — ExportCore sof mantiq testlari.
// Ishga tushirish: node tests/export-core.test.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js/export-core.js'), 'utf8');
const sandbox = { console, globalThis: {} };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'export-core.js' });
const C = sandbox.ExportCore || sandbox.globalThis.ExportCore;
if (!C) {
  console.error('FATAL: ExportCore yuklanmadi');
  process.exit(2);
}

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('OK   ', name); }
  catch (err) { fail++; console.log('FAIL ', name, '-', err.message); }
}

test('normalizeSettings: noma\'lum qiymat defaultga tushadi', () => {
  const s = C.normalizeSettings({ quality: '4k', fps: 24, bitrate: 'ultra' });
  assert.equal(s.quality, '720p');
  assert.equal(s.fps, 30);
  assert.equal(s.bitrate, 'good');
});

test('normalizeSettings: 1080p va 60 fps qabul qilinadi', () => {
  const s = C.normalizeSettings({ quality: '1080p', fps: 60, bitrate: 'telegram' });
  assert.equal(s.quality, '1080p');
  assert.equal(s.fps, 60);
  assert.equal(s.bitrate, 'telegram');
});

test('load/saveSettings localStorage o\'rniga mock', () => {
  const store = {
    data: {},
    getItem(k) { return this.data[k] || null; },
    setItem(k, v) { this.data[k] = String(v); }
  };
  const saved = C.saveSettings({ quality: '1080p', fps: 60, bitrate: 'high' }, store);
  assert.equal(saved.quality, '1080p');
  const loaded = C.loadSettings(store);
  assert.equal(loaded.quality, '1080p');
  assert.equal(loaded.fps, 60);
  assert.equal(loaded.bitrate, 'high');
});

test('videoBitrate: 720p good = 4 Mbps (eski default)', () => {
  assert.equal(C.videoBitrate({ quality: '720p', bitrate: 'good' }), 4000000);
});

test('videoBitrate: 1080p telegram < good < high', () => {
  const a = C.videoBitrate({ quality: '1080p', bitrate: 'telegram' });
  const b = C.videoBitrate({ quality: '1080p', bitrate: 'good' });
  const c = C.videoBitrate({ quality: '1080p', bitrate: 'high' });
  assert.ok(a < b && b < c);
});

test('maxSide: 720p=1280, 1080p=1920', () => {
  assert.equal(C.maxSide({ quality: '720p' }), 1280);
  assert.equal(C.maxSide({ quality: '1080p' }), 1920);
});

test('parseForcedPath: legacy|mp4|fast, boshqasi null', () => {
  assert.equal(C.parseForcedPath('?export=fast'), 'fast');
  assert.equal(C.parseForcedPath('foo=1&export=mp4'), 'mp4');
  assert.equal(C.parseForcedPath('?export=legacy&x=1'), 'legacy');
  assert.equal(C.parseForcedPath('?export=webm'), null);
  assert.equal(C.parseForcedPath(''), null);
});

test('defaultStartPath: forced ustun, keyin fast flag, aks holda mp4', () => {
  assert.equal(C.defaultStartPath('legacy', true), 'legacy');
  assert.equal(C.defaultStartPath(null, true), 'fast');
  assert.equal(C.defaultStartPath(null, false), 'mp4');
});

test('fallbackChain: fast → mp4 → legacy', () => {
  assert.equal(C.fallbackChain('fast').join(','), 'fast,mp4,legacy');
  assert.equal(C.fallbackChain('mp4').join(','), 'mp4,legacy');
  assert.equal(C.fallbackChain('legacy').join(','), 'legacy');
});

test('pickMp4Mime: birinchi supported candidate', () => {
  const supported = new Set(['video/mp4;codecs=avc1,mp4a']);
  const m = C.pickMp4Mime((x) => supported.has(x));
  assert.equal(m, 'video/mp4;codecs=avc1,mp4a');
});

test('pickMp4Mime: hech biri yo\'q — bo\'sh', () => {
  assert.equal(C.pickMp4Mime(() => false), '');
});

test('sourceTimeAt: trimStart + (t-start)*speed', () => {
  const clip = { startTime: 2, trimStart: 1.5, speed: 2 };
  assert.equal(C.sourceTimeAt(clip, 2), 1.5);
  assert.equal(C.sourceTimeAt(clip, 4), 1.5 + 4);
});

test('sourceTimeAt: speed <=0 → 1x', () => {
  const clip = { startTime: 0, trimStart: 3, speed: 0 };
  assert.equal(C.sourceTimeAt(clip, 2), 5);
});

test('estimateRemainingSec: 25% 10s → ~30s qoladi', () => {
  const rem = C.estimateRemainingSec(0.25, 10000);
  assert.ok(Math.abs(rem - 30) < 0.01);
});

test('estimateRemainingSec: erta bosqichda null', () => {
  assert.equal(C.estimateRemainingSec(0.01, 200), null);
});

test('formatEta', () => {
  assert.equal(C.formatEta(12), '12 s qoldi');
  assert.equal(C.formatEta(75), '1 daq 15 s qoldi');
  assert.equal(C.formatEta(null), '');
});

test('outputSizeForRatio 9:16 720p juft tomonlar', () => {
  const s = C.outputSizeForRatio(9 / 16, 1280);
  assert.equal(s.h, 1280);
  assert.equal(s.w % 2, 0);
  assert.equal(s.h % 2, 0);
});

test('outputSizeForRatio 16:9 1080p', () => {
  const s = C.outputSizeForRatio(16 / 9, 1920);
  assert.equal(s.w, 1920);
  assert.ok(Math.abs(s.h - 1080) <= 2);
});

test('isAbortError', () => {
  assert.equal(C.isAbortError(C.ExportAbortedError()), true);
  assert.equal(C.isAbortError(new Error('x')), false);
});

test('blobExt', () => {
  assert.equal(C.blobExt('video/mp4;codecs=avc1'), 'mp4');
  assert.equal(C.blobExt('video/webm;codecs=vp9'), 'webm');
});

test('isMp4Mime', () => {
  assert.equal(C.isMp4Mime('video/mp4'), true);
  assert.equal(C.isMp4Mime('video/webm'), false);
});

console.log('---');
console.log(pass + ' OK, ' + fail + ' FAIL');
if (fail) process.exit(1);
