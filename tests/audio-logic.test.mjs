// Node testlar: audio sof mantiq (buildMixPlan, countFileRefs, peaks, normalize, crossfade)
import assert from 'assert';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { pathToFileURL } from 'url';
import vm from 'vm';

const require = createRequire(import.meta.url);
const src = readFileSync(new URL('../js/audio-logic.js', import.meta.url), 'utf8');
const sandbox = { module: { exports: {} }, globalThis: {} };
vm.runInNewContext(src, sandbox);
const L = sandbox.module.exports || sandbox.globalThis.EMRAudioLogic;
assert.ok(L, 'EMRAudioLogic yuklanmadi');

let ok = 0, fail = 0;
function test(name, fn) {
  try {
    fn();
    console.log('OK   ', name);
    ok++;
  } catch (e) {
    console.log('FAIL ', name, e.message);
    fail++;
  }
}

// --- musicToAudioClip ---
test('musicToAudioClip: asosiy maydonlar', () => {
  const ac = L.musicToAudioClip({
    fileId: 'f1', name: 'song.mp3', startTime: 2, trimStart: 1, trimEnd: 10,
    volume: 0.8, muted: false, fadeIn: 0.5, fadeOut: 1,
  });
  assert.strictEqual(ac.kind, 'music');
  assert.strictEqual(ac.fileId, 'f1');
  assert.strictEqual(ac.track, 0);
  assert.strictEqual(ac.gain, 0.8);
  assert.strictEqual(ac.duck, true);
  assert.strictEqual(ac.fadeIn, 0.5);
});

// --- migrateMusicToAudioClips ---
test('migrate: music → audioClips[0], ducking default', () => {
  const meta = { music: { fileId: 'm1', name: 'a.mp3', startTime: 0, trimStart: 0, trimEnd: 5, volume: 1 } };
  L.migrateMusicToAudioClips(meta);
  assert.strictEqual(meta.audioClips.length, 1);
  assert.strictEqual(meta.audioClips[0].fileId, 'm1');
  assert.strictEqual(meta.ducking.enabled, false);
  assert.strictEqual(meta.ducking.amountDb, -12);
});

test('migrate: mavjud audioClips saqlanadi', () => {
  const meta = {
    music: { fileId: 'm1' },
    audioClips: [{ id: 'x', kind: 'sfx', fileId: 's1', track: 1, startTime: 0, trimStart: 0, trimEnd: 1, gain: 1 }],
  };
  L.migrateMusicToAudioClips(meta);
  assert.strictEqual(meta.audioClips.length, 1);
  assert.strictEqual(meta.audioClips[0].kind, 'sfx');
});

// --- countFileRefs ---
test('countFileRefs: video + audio + music', () => {
  const c = L.countFileRefs({
    clips: [{ fileId: 'v1' }, { fileId: 'v1' }, { fileId: 'v2' }],
    audioClips: [{ fileId: 'v1' }, { fileId: 'a1' }],
    music: { fileId: 'm1' },
  });
  assert.strictEqual(c.get('v1'), 3);
  assert.strictEqual(c.get('v2'), 1);
  assert.strictEqual(c.get('a1'), 1);
  assert.strictEqual(c.get('m1'), 1);
});

test('countFileRefs: ajratilgan audio — video o\'chirilsa ham fileId qoladi', () => {
  // Video clip o'chirilgan, lekin audioClips da o'sha fileId bor
  const c = L.countFileRefs({
    clips: [],
    audioClips: [{ fileId: 'shared' }],
  });
  assert.strictEqual(c.get('shared'), 1);
});

test('countFileRefs: oxirgi havola o\'chirilganda 0', () => {
  const c = L.countFileRefs({ clips: [], audioClips: [], music: null });
  assert.strictEqual(c.size, 0);
});

// --- buildMixPlan ---
test('buildMixPlan: muted clip chiqmaydi', () => {
  const plan = L.buildMixPlan({
    audioClips: [
      { id: '1', kind: 'music', fileId: 'f', startTime: 0, trimStart: 0, trimEnd: 5, gain: 1, muted: true },
      { id: '2', kind: 'sfx', fileId: 'f2', startTime: 1, trimStart: 0, trimEnd: 2, gain: 0.5, muted: false },
    ],
  });
  assert.strictEqual(plan.length, 1);
  assert.strictEqual(plan[0].id, '2');
});

test('buildMixPlan: fadeIn/out curve nuqtalari', () => {
  const plan = L.buildMixPlan({
    audioClips: [{
      id: '1', kind: 'music', fileId: 'f', startTime: 10,
      trimStart: 0, trimEnd: 10, gain: 1, muted: false, fadeIn: 2, fadeOut: 2,
    }],
  });
  const curve = plan[0].curve;
  assert.ok(curve.length >= 3);
  // boshi 0
  assert.strictEqual(curve[0].t, 10);
  assert.strictEqual(curve[0].g, 0);
  // fadeIn oxiri
  const fi = curve.find((p) => Math.abs(p.t - 12) < 1e-6);
  assert.ok(fi);
  assert.strictEqual(fi.g, 1);
});

// --- computePeaks ---
test('computePeaks: sinus → min/max', () => {
  const sr = 1000;
  const len = 1000;
  const data = new Float32Array(len);
  for (let i = 0; i < len; i++) data[i] = Math.sin(2 * Math.PI * i / 100);
  const peaks = L.computePeaks(data, sr, 10); // 10 peak/s → 10 peaks for 1s
  assert.strictEqual(peaks.length, 10);
  for (const p of peaks) {
    assert.ok(p.min <= 0 && p.max >= 0);
  }
});

test('computePeaks: jimlik', () => {
  const data = new Float32Array(500);
  const peaks = L.computePeaks(data, 1000, 100);
  assert.ok(peaks.length > 0);
  for (const p of peaks) {
    assert.strictEqual(p.min, 0);
    assert.strictEqual(p.max, 0);
  }
});

// --- computeNormalizeGain ---
test('computeNormalizeGain: -20 dB RMS → ~1.58 gain (-16 target)', () => {
  const g = L.computeNormalizeGain(-20, -6, -16);
  assert.ok(Math.abs(g - Math.pow(10, 4 / 20)) < 0.01);
});

test('computeNormalizeGain: peak cheklovi', () => {
  // RMS past, lekin peak 0 dB → gain peak -1 dan oshmasin
  const g = L.computeNormalizeGain(-30, 0, -16);
  const peakAfterDb = 0 + 20 * Math.log10(g);
  assert.ok(peakAfterDb <= -1 + 0.1);
});

// --- isClipping ---
test('isClipping: peak*gain > 1', () => {
  assert.strictEqual(L.isClipping(0.6, 2), true);
  assert.strictEqual(L.isClipping(0.4, 2), false);
  assert.strictEqual(L.isClipping(1, 1), false);
});

// --- crossfadeGains ---
test('crossfadeGains: 0 → out=1 in=0; 1 → out=0 in=1; 0.5 teng', () => {
  const a = L.crossfadeGains(0);
  assert.ok(Math.abs(a.out - 1) < 1e-6 && Math.abs(a.in - 0) < 1e-6);
  const b = L.crossfadeGains(1);
  assert.ok(Math.abs(b.out - 0) < 1e-6 && Math.abs(b.in - 1) < 1e-6);
  const c = L.crossfadeGains(0.5);
  assert.ok(Math.abs(c.out - c.in) < 1e-6);
  assert.ok(Math.abs(c.out * c.out + c.in * c.in - 1) < 1e-6); // quvvat
});


// --- ducking envelope ---
test('computeDuckingEnvelope: bitta interval attack/release', () => {
  const pts = L.computeDuckingEnvelope([{ start: 2, end: 4 }], { amountDb: -12, attackMs: 200, releaseMs: 400 }, 10);
  assert.ok(pts.length >= 4);
  // middle of interval should be ducked
  const mid = L.sampleEnvelope(pts, 3);
  const duck = Math.pow(10, -12 / 20);
  assert.ok(Math.abs(mid - duck) < 0.05, 'mid=' + mid);
  // before attack
  assert.ok(Math.abs(L.sampleEnvelope(pts, 0.5) - 1) < 0.05);
  // after release
  assert.ok(Math.abs(L.sampleEnvelope(pts, 5) - 1) < 0.05);
});

test('computeDuckingEnvelope: ustma-ust intervallar birlashadi', () => {
  const pts = L.computeDuckingEnvelope(
    [{ start: 1, end: 3 }, { start: 2.5, end: 5 }],
    { amountDb: -6, attackMs: 0, releaseMs: 0 },
    10
  );
  const mid = L.sampleEnvelope(pts, 3);
  const duck = Math.pow(10, -6 / 20);
  assert.ok(Math.abs(mid - duck) < 0.05);
});

test('buildMixPlan: ducking music pastga tushadi', () => {
  const project = {
    audioClips: [
      { id: 'm1', kind: 'music', fileId: 'f', startTime: 0, trimStart: 0, trimEnd: 10, gain: 1, muted: false, duck: true },
      { id: 'v1', kind: 'voice', fileId: 'f2', startTime: 3, trimStart: 0, trimEnd: 2, gain: 1, muted: false },
    ],
    ducking: { enabled: true, amountDb: -12, attackMs: 0, releaseMs: 0, includeVideoAudio: false },
    duration: 20,
  };
  const plan = L.buildMixPlan(project);
  const music = plan.find((p) => p.id === 'm1');
  assert.ok(music);
  const gBefore = L.gainAtFromPlanEntry(music, 1);
  const gDuring = L.gainAtFromPlanEntry(music, 3.5);
  assert.ok(gBefore > 0.9);
  assert.ok(gDuring < 0.4, 'during=' + gDuring);
});

test('resolveAudioStartTimeOnTrack: overlap suradi', () => {
  const clips = [
    { id: 'a', track: 0, startTime: 0, trimStart: 0, trimEnd: 5 },
  ];
  const ns = L.resolveAudioStartTimeOnTrack(clips, 0, 'b', 2, 3);
  assert.ok(ns >= 5);
});

test('sampleClipGain: muted=0, fade', () => {
  const c = { startTime: 0, trimStart: 0, trimEnd: 4, gain: 1, muted: false, fadeIn: 1, fadeOut: 1 };
  assert.ok(Math.abs(L.sampleClipGain(c, 0) - 0) < 0.01);
  assert.ok(Math.abs(L.sampleClipGain(c, 1) - 1) < 0.01);
  assert.ok(Math.abs(L.sampleClipGain(c, 2) - 1) < 0.01);
  assert.ok(L.sampleClipGain({ ...c, muted: true }, 2) === 0);
});


console.log('---');
console.log(ok + ' OK, ' + fail + ' FAIL');
process.exit(fail > 0 ? 1 : 0);
