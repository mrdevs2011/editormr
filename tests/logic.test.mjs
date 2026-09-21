// Sof mantiq testlari (Faza 0, work.md checklist).
// clipDuration, timelineToSource/sourceToTimeline, resolveVideoStartTimeOnTrack,
// getTransitionMaxDuration — bu funksiyalar DOM'ga bog'liq emas, shuning uchun
// Playwright/brauzer kerak emas: js/state.js va js/drag.js manbasini vm bilan
// bitta sandbox'ga yuklab, to'g'ridan-to'g'ri chaqiramiz.
//
// Ishga tushirish: node tests/logic.test.mjs   (hech qanday npm install kerak emas)

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// state.js/drag.js index.html'da klassik <script> sifatida yuklanadi (module
// emas, global funksiyalar) — shuning uchun shu ikkalasini xuddi shunday
// (ketma-ket, bitta global kontekstda) vm.runInContext bilan yuklaymiz.
// Ikkalasi ham bu yerda TEKSHIRILAYOTGAN funksiyalar doirasida DOM'ga
// tegmaydi (grep bilan tasdiqlangan) — window/document faqat boshqa,
// chaqirilmaydigan funksiyalar ichida ishlatiladi, shuning uchun bo'sh stub
// yetarli.
const sandbox = {
  window: { innerWidth: 1024, addEventListener() {}, removeEventListener() {} },
  document: { getElementById() { return null; } },
  console,
};
vm.createContext(sandbox);

// state.js/drag.js'dagi top-level `const`/`let` vm kontekst obyektiga
// avtomatik chiqmaydi (faqat `var`/funksiya e'lonlari chiqadi — bu Node vm
// modulining xususiyati). Shuning uchun ikkala faylni BITTA skriptga
// birlashtirib, oxirida kerakli narsalarni aniq `globalThis`ga yozamiz —
// shu bitta ijro doirasida ular hali lexical scope'da ko'rinadi.
const stateSrc = fs.readFileSync(path.join(ROOT, 'js/state.js'), 'utf8');
const dragSrc = fs.readFileSync(path.join(ROOT, 'js/drag.js'), 'utf8');
const exportLine = `
globalThis.__TEST_EXPORTS__ = {
  state, clipDuration, timelineToSource, sourceToTimeline,
  resolveVideoStartTimeOnTrack, getTransitionMaxDuration, createClip,
};
`;
vm.runInContext(stateSrc + '\n' + dragSrc + '\n' + exportLine, sandbox, { filename: 'state+drag.js' });

const {
  state,
  clipDuration,
  timelineToSource,
  sourceToTimeline,
  resolveVideoStartTimeOnTrack,
  getTransitionMaxDuration,
  createClip,
} = sandbox.__TEST_EXPORTS__ || {};

// Sog'lik tekshiruvi: agar funksiyalar sandbox'ga chiqmagan bo'lsa (masalan
// state.js struktura o'zgargan), testlar "aniq sabab yo'q" xato bermasin.
for (const [name, fn] of Object.entries({
  clipDuration, timelineToSource, sourceToTimeline,
  resolveVideoStartTimeOnTrack, getTransitionMaxDuration, createClip,
})) {
  if (typeof fn !== 'function') {
    console.error(`FATAL: ${name} sandbox'ga yuklanmadi (js/state.js yoki js/drag.js o'zgargan bo'lishi mumkin)`);
    process.exit(2);
  }
}

let pass = 0;
let fail = 0;
function test(name, fn) {
  try {
    fn();
    pass++;
    console.log('OK   ', name);
  } catch (err) {
    fail++;
    console.log('FAIL ', name, '-', err.message);
  }
}

// ===== clipDuration =====
test('clipDuration: oddiy trim, speed 1x', () => {
  const c = createClip({ trimStart: 2, trimEnd: 7, speed: 1 });
  assert.equal(clipDuration(c), 5);
});
test('clipDuration: speed 2x -> timeline uzunligi yarmiga qisqaradi', () => {
  const c = createClip({ trimStart: 0, trimEnd: 10, speed: 2 });
  assert.equal(clipDuration(c), 5);
});
test('clipDuration: speed 0.5x -> timeline uzunligi ikki baravar', () => {
  const c = createClip({ trimStart: 0, trimEnd: 5, speed: 0.5 });
  assert.equal(clipDuration(c), 10);
});
test('clipDuration: speed <= 0 xato qiymat sifatida 1x deb olinadi', () => {
  const c = createClip({ trimStart: 0, trimEnd: 4, speed: 0 });
  assert.equal(clipDuration(c), 4);
});

// ===== timelineToSource / sourceToTimeline =====
test('timelineToSource: clip boshida trimStart qaytadi', () => {
  const c = createClip({ startTime: 3, trimStart: 1, trimEnd: 6, speed: 1 });
  assert.equal(timelineToSource(c, 3), 1);
});
test('timelineToSource: speed 2x manba vaqtini 2x tezlashtiradi', () => {
  const c = createClip({ startTime: 0, trimStart: 0, trimEnd: 10, speed: 2 });
  assert.equal(timelineToSource(c, 2), 4);
});
test('sourceToTimeline: timelineToSource bilan round-trip mos keladi', () => {
  const c = createClip({ startTime: 5, trimStart: 2, trimEnd: 12, speed: 1.5 });
  const t = 8;
  const src = timelineToSource(c, t);
  const back = sourceToTimeline(c, src);
  assert.ok(Math.abs(back - t) < 1e-9, `round-trip: ${back} !== ${t}`);
});

// ===== resolveVideoStartTimeOnTrack =====
test('resolveVideoStartTimeOnTrack: bo\'sh qatorda desiredStart o\'zgarmaydi', () => {
  state.videoClips = [];
  const c = createClip({ id: 'x', trimStart: 0, trimEnd: 3 });
  assert.equal(resolveVideoStartTimeOnTrack(c, 5, 0), 5);
});
test('resolveVideoStartTimeOnTrack: to\'qnashganda eng yaqin bo\'sh joyga suradi', () => {
  const other = createClip({ id: 'a', startTime: 0, trimStart: 0, trimEnd: 4, track: 0 }); // band: 0..4
  state.videoClips = [other];
  const moving = createClip({ id: 'b', trimStart: 0, trimEnd: 2 }); // 2s uzunlik
  // desiredStart=1 -> [1,3) band [0,4) bilan to'qnashadi; before=-1 (yaroqsiz) -> after=4
  const start = resolveVideoStartTimeOnTrack(moving, 1, 0, new Set(['b']));
  assert.equal(start, 4);
});
test('resolveVideoStartTimeOnTrack: manfiy desiredStart 0 ga cheklanadi', () => {
  state.videoClips = [];
  const c = createClip({ id: 'y', trimStart: 0, trimEnd: 2 });
  assert.equal(resolveVideoStartTimeOnTrack(c, -5, 0), 0);
});

// ===== getTransitionMaxDuration =====
test('getTransitionMaxDuration: keyingi clip yo\'q bo\'lsa 0', () => {
  const c = createClip({ id: 'solo', startTime: 0, trimStart: 0, trimEnd: 5, track: 0 });
  state.videoClips = [c];
  assert.equal(getTransitionMaxDuration(c), 0);
});
test('getTransitionMaxDuration: keyingi clip bo\'lsa CHAP (A) uzunligi', () => {
  const a = createClip({ id: 'a', startTime: 0, trimStart: 0, trimEnd: 3, track: 0 }); // 3s
  const b = createClip({ id: 'b', startTime: 3, trimStart: 0, trimEnd: 1, track: 0 }); // 1s
  state.videoClips = [a, b];
  assert.equal(getTransitionMaxDuration(a), 3);
});
test('getTransitionMaxDuration: O\'NG (B) uzunligi natijaga ta\'sir qilmaydi', () => {
  const a = createClip({ id: 'a', startTime: 0, trimStart: 0, trimEnd: 10, track: 0 }); // 10s
  const b = createClip({ id: 'b', startTime: 10, trimStart: 0, trimEnd: 100, track: 0 }); // 100s
  state.videoClips = [a, b];
  assert.equal(getTransitionMaxDuration(a), 10);
});

console.log('---');
console.log(pass + ' OK, ' + fail + ' FAIL');
if (fail > 0) process.exit(1);
