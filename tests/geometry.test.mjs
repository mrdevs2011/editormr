// Faza 2A-3 / 2C-2: computeFit, interpolateTransform sof testlari.
// Ishga tushirish: node tests/geometry.test.mjs

import assert from 'node:assert/strict';
import { computeFit, interpolateTransform, canvasSizeFromPreset, resolveCanvasSize } from '../render/geometry.js';

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('OK   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '-', e.message); }
}

test('contain: keng manba — chetlari qora (ust/past)', () => {
  // 16:9 manba, 9:16 kanvas
  const f = computeFit(1920, 1080, 1080, 1920, 'contain');
  assert.ok(f.dw <= 1080 + 0.01);
  assert.ok(f.dh <= 1920 + 0.01);
  // kenglik to'liq, balandlik kichik
  assert.ok(Math.abs(f.dw - 1080) < 1);
  assert.ok(f.dh < 1920);
  assert.ok(f.dy > 0);
});

test('cover: vertikal kanvasda gorizontal manba — yonlar kesiladi', () => {
  const f = computeFit(1920, 1080, 1080, 1920, 'cover');
  // cover to'ldiradi: dh >= canvasH yoki dw >= canvasW
  assert.ok(f.dw >= 1080 - 1 || f.dh >= 1920 - 1);
  // markazga joylashgan
  assert.ok(f.dx <= 0 || f.dy <= 0);
});

test('blur: blur qatlami cover, asosiy contain', () => {
  const f = computeFit(1920, 1080, 1080, 1920, 'blur');
  assert.ok(f.blur, 'blur maydoni bor');
  // asosiy contain: kenglik to'liq
  assert.ok(Math.abs(f.dw - 1080) < 1);
  // blur cover: balandlik to'liq yoki kengroq
  assert.ok(f.blur.dh >= 1920 - 1 || f.blur.dw >= 1080 - 1);
});

test('kvadrat manba + kvadrat kanvas — contain=cover', () => {
  const a = computeFit(1000, 1000, 500, 500, 'contain');
  const b = computeFit(1000, 1000, 500, 500, 'cover');
  assert.ok(Math.abs(a.dw - 500) < 0.01);
  assert.ok(Math.abs(b.dw - 500) < 0.01);
  assert.ok(Math.abs(a.dx) < 0.01);
});

test('interpolateTransform: 0 → from, 1 → to, 0.5 → o\'rtacha', () => {
  const from = { x: 0, y: 0, scale: 1, rotation: 0 };
  const to = { x: 0.2, y: -0.1, scale: 1.4, rotation: 20 };
  const a = interpolateTransform(from, to, 0);
  assert.equal(a.x, 0);
  assert.equal(a.scale, 1);
  const b = interpolateTransform(from, to, 1);
  assert.equal(b.x, 0.2);
  assert.equal(b.scale, 1.4);
  assert.equal(b.rotation, 20);
  const m = interpolateTransform(from, to, 0.5);
  assert.ok(Math.abs(m.x - 0.1) < 1e-9);
  assert.ok(Math.abs(m.scale - 1.2) < 1e-9);
  assert.ok(Math.abs(m.rotation - 10) < 1e-9);
});

test('canvasSizeFromPreset 9:16 1080 → juft', () => {
  const s = canvasSizeFromPreset('9:16', '1080');
  assert.ok(s);
  assert.equal(s.w % 2, 0);
  assert.equal(s.h % 2, 0);
  assert.ok(Math.abs(s.w / s.h - 9 / 16) < 0.01);
});

test('canvasSizeFromPreset fit → null', () => {
  assert.equal(canvasSizeFromPreset('fit', '720'), null);
  assert.equal(canvasSizeFromPreset(null, '720'), null);
});

test('resolveCanvasSize: aniq canvas + 720p', () => {
  const s = resolveCanvasSize({ w: 1080, h: 1920, fps: 30 }, null, '720');
  assert.equal(s.w % 2, 0);
  assert.equal(s.h % 2, 0);
  assert.ok(Math.abs(s.w / s.h - 1080 / 1920) < 0.01);
  assert.equal(s.fps, 30);
});

console.log('---');
console.log(pass + ' OK, ' + fail + ' FAIL');
if (fail > 0) process.exit(1);
