import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js/text-core.js'), 'utf8');
const sandbox = { console, globalThis: {}, TextDecoder, TextEncoder, Uint8Array };
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'text-core.js' });
const C = sandbox.TextCore;
if (!C) { console.error('FATAL: TextCore yoq'); process.exit(2); }

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('OK   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '-', e.message); }
}

function measure(text) { return String(text || '').length * 10; }

test('migrateTextClip: fontSize 36 -> size 36/720, x/y -> pos', () => {
  const m = C.migrateTextClip({ fontSize: 36, x: 0.2, y: 0.9, bold: true, text: 'a' });
  assert.equal(m.size, 36 / 720);
  assert.equal(m.posX, 0.2);
  assert.equal(m.posY, 0.9);
  assert.equal(m.weight, 700);
  assert.equal(m.fontFamily, 'sans-serif');
});

test('migrateTextClip: yangi maydonlar saqlanadi', () => {
  const m = C.migrateTextClip({ size: 0.1, posX: 0.3, posY: 0.4, fontFamily: 'EMR Inter' });
  assert.equal(m.size, 0.1);
  assert.equal(m.fontFamily, 'EMR Inter');
});

test('layoutText: bosh matn', () => {
  const L = C.layoutText('', { size: 0.05 }, 1000, 1000, measure);
  assert.equal(L.lines.length, 1);
  assert.equal(L.lines[0].text, '');
});

test('layoutText: \\n hurmat', () => {
  const L = C.layoutText('a\n\nb', { size: 0.05, maxWidth: 0.9 }, 1000, 720, measure);
  assert.equal(L.lines.length, 3);
  assert.equal(L.lines[1].text, '');
});

test('layoutText: wrap soz boyicha', () => {
  const L = C.layoutText('aaa bbb ccc', { size: 0.05, maxWidth: 0.07 }, 1000, 720, measure);
  assert.ok(L.lines.length >= 2);
});

test('layoutText: uzun soz belgi boyicha', () => {
  const L = C.layoutText('aaaaaaaaaaaa', { size: 0.05, maxWidth: 0.05 }, 1000, 720, measure);
  assert.ok(L.lines.length >= 2);
});

test('layoutText: ozbekcha uzun gap', () => {
  const t = "Bugun ertalab bozordan non, sut va olma olib keldim";
  const L = C.layoutText(t, { size: 0.04, maxWidth: 0.2 }, 1080, 1920, measure);
  assert.ok(L.lines.length >= 2);
  assert.ok(L.box.width <= 0.2 * 1080 + 1);
});

test('textAnimState chegaralar', () => {
  const a = C.textAnimState('fade', 0, 'in');
  const b = C.textAnimState('fade', 1, 'in');
  const c = C.textAnimState('fade', 1, 'out');
  assert.equal(a.alpha, 0);
  assert.equal(b.alpha, 1);
  assert.equal(c.alpha, 0);
  const p = C.textAnimState('pop', 0, 'in');
  assert.ok(Math.abs(p.scale - 0.8) < 1e-9);
  const tw = C.textAnimState('typewriter', 0.5, 'in');
  assert.equal(tw.revealChars, 0.5);
});

test('clipAnimAt: kirish+chiqish clipdan uzun — qisqaradi', () => {
  const clip = { startTime: 0, duration: 0.4, anim: { in: { type: 'fade', dur: 1 }, out: { type: 'fade', dur: 1 } } };
  const mid = C.clipAnimAt(clip, 0.2);
  assert.ok(mid.alpha > 0.4 && mid.alpha <= 1);
});

test('TEXT_PRESETS nusxa, boglanmagan', () => {
  const a = C.applyPreset('sarlavha');
  const b = C.applyPreset('sarlavha');
  a.size = 0;
  assert.ok(b.size > 0);
  assert.equal(C.TEXT_PRESETS.length, 5);
});

test('normalizeUzbekApostrophes', () => {
  assert.equal(C.normalizeUzbekApostrophes("so'z"), 'so\u02BBz');
  assert.equal(C.normalizeUzbekApostrophes("to'g'ri"), 'to\u02BBg\u02BBri');
  assert.equal(C.normalizeUzbekApostrophes("ma'no"), 'ma\u02BCno');
  assert.equal(C.normalizeUzbekApostrophes("e'lon"), 'e\u02BClon');
  assert.equal(C.normalizeUzbekApostrophes("don't"), 'don\u02BCt');
  assert.equal(C.normalizeUzbekApostrophes('"hello"'), '"hello"');
});

test('parse SRT oddiy + aylanma', () => {
  const srt = '1\n00:00:01,000 --> 00:00:02,500\nSalom\n\n2\n00:00:03,000 --> 00:00:04,000\nDunyo\n';
  const p = C.parseSubtitles(srt);
  assert.equal(p.cues.length, 2);
  assert.equal(p.cues[0].text, 'Salom');
  const back = C.parseSubtitles(C.formatSrt(p.cues));
  assert.equal(back.cues.length, 2);
  assert.equal(back.cues[0].text, 'Salom');
  assert.ok(Math.abs(back.cues[0].start - 1) < 1e-6);
});

test('parse VTT + teglar + start>=end skip', () => {
  const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n<b>Hi</b> {\\an8}\n\n00:00:05.000 --> 00:00:04.000\nbad\n';
  const p = C.parseSubtitles(vtt);
  assert.equal(p.format, 'vtt');
  assert.equal(p.cues.length, 1);
  assert.equal(p.cues[0].text, 'Hi');
  assert.equal(p.skipped, 1);
});

test('parse indeks yoq, vergul/nuqta', () => {
  const s = '00:00:00,500 --> 00:00:01.000\nA';
  const p = C.parseSubtitles(s);
  assert.equal(p.cues.length, 1);
  assert.ok(Math.abs(p.cues[0].start - 0.5) < 1e-6);
});

test('detectAndDecode utf-8', () => {
  const bytes = new TextEncoder().encode('Salom');
  const d = C.detectAndDecode(bytes);
  assert.equal(d.encoding, 'utf-8');
  assert.equal(d.text, 'Salom');
});

test('splitScriptIntoCues', () => {
  const cues = C.splitScriptIntoCues('Birinchi gap. Ikkinchi gap juda uzun bolishi mumkin.\nUchinchi.', { maxChars: 20 });
  assert.ok(cues.length >= 2);
});

test('applyTapTimes offset', () => {
  const cues = C.applyTapTimes(['a', 'b'], [1, 2], { offsetMs: -200, tailSec: 1 });
  assert.ok(Math.abs(cues[0].start - 0.8) < 1e-9);
  assert.ok(Math.abs(cues[0].end - 1.8) < 1e-9);
  assert.ok(cues[1].end > cues[1].start);
});

test('activeWordIndex', () => {
  const words = [{ t0: 0, t1: 1, w: 'a' }, { t0: 1, t1: 2, w: 'b' }];
  assert.equal(C.activeWordIndex(words, 0.5), 0);
  assert.equal(C.activeWordIndex(words, 1.2), 1);
  assert.equal(C.activeWordIndex([], 0), -1);
});

test('estimateWordTimings', () => {
  const w = C.estimateWordTimings('bir ikki', 0, 2);
  assert.equal(w.length, 2);
  assert.equal(w[0].estimated, true);
  assert.ok(w[1].t1 > w[0].t1);
});

test('groupWordsIntoCues pauza', () => {
  const words = [
    { t0: 0, t1: 0.2, w: 'Salom' },
    { t0: 0.21, t1: 0.4, w: 'aka' },
    { t0: 1.2, t1: 1.4, w: 'xayr' }
  ];
  const cues = C.groupWordsIntoCues(words, { pauseSplitSec: 0.4 });
  assert.equal(cues.length, 2);
});

test('computeWer', () => {
  assert.equal(C.computeWer('a b c', 'a b c'), 0);
  assert.ok(C.computeWer('a b c', 'a b') > 0);
  assert.equal(C.computeWer("So'z", 'soʻz'), 0);
});

test('collectFontNeeds', () => {
  const n = C.collectFontNeeds([{ fontFamily: 'EMR Inter', weight: 700 }], { style: { fontFamily: 'sans-serif', weight: 400 } });
  assert.equal(n.length, 2);
});

console.log('---');
console.log(pass + ' OK, ' + fail + ' FAIL');
if (fail) process.exit(1);
