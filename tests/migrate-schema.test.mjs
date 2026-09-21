// Faza 2A-1 + v3: migrateProjectMeta v0/v1 → v2 → v3 sof testlari.
// projects.js DOM-ga bog'liq, shuning uchun migrate mantiqini shu yerda
// qayta yaratib (kod bilan bir xil) tekshiramiz. Kod o'zgarsa shu testni
// ham yangilash kerak.
//
// Ishga tushirish: node tests/migrate-schema.test.mjs

import assert from 'node:assert/strict';

function migrateProjectMeta(meta) {
  if (!meta) return meta;
  let v = meta.schemaVersion || 0;
  if (v < 1) {
    v = 1;
  }
  if (v < 2) {
    if (typeof meta.canvas === 'string') {
      meta.canvas = null;
    } else if (meta.canvas && typeof meta.canvas === 'object') {
      // keep
    } else {
      meta.canvas = null;
    }
    const clips = Array.isArray(meta.clips) ? meta.clips : [];
    for (let i = 0; i < clips.length; i++) {
      const c = clips[i];
      if (!c || typeof c !== 'object') continue;
      if (c.fit == null) c.fit = 'contain';
      if (!c.transform || typeof c.transform !== 'object') {
        c.transform = { x: 0, y: 0, scale: 1, rotation: 0 };
      } else {
        if (c.transform.x == null) c.transform.x = 0;
        if (c.transform.y == null) c.transform.y = 0;
        if (c.transform.scale == null) c.transform.scale = 1;
        if (c.transform.rotation == null) c.transform.rotation = 0;
      }
      if (c.opacity == null) c.opacity = 1;
    }
    v = 2;
  }
  if (v < 3) {
    // v2 -> v3: audioClips + ducking, subtitles, extras/markers
    if (!Array.isArray(meta.audioClips)) meta.audioClips = [];
    if (!meta.ducking || typeof meta.ducking !== 'object') {
      meta.ducking = { enabled: false, amountDb: -12, attackMs: 150, releaseMs: 400, includeVideoAudio: true };
    }
    if (!meta.subtitles || typeof meta.subtitles !== 'object') {
      meta.subtitles = { cues: [], style: {} };
    }
    if (!meta.extras || typeof meta.extras !== 'object') meta.extras = {};
    if (!Array.isArray(meta.markers)) {
      meta.markers = Array.isArray(meta.extras.markers) ? meta.extras.markers : [];
    }
    if (meta.inPoint == null && meta.extras.inPoint != null) meta.inPoint = meta.extras.inPoint;
    if (meta.outPoint == null && meta.extras.outPoint != null) meta.outPoint = meta.extras.outPoint;
    v = 3;
  }
  meta.schemaVersion = v;
  return meta;
}

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('OK   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '-', e.message); }
}

test('v0 (schemaVersion yo\'q) → v3: canvas=null, fit=contain, audioClips=[]', () => {
  const meta = {
    clips: [{ id: 'c1', startTime: 0, trimStart: 0, trimEnd: 5 }],
  };
  migrateProjectMeta(meta);
  assert.equal(meta.schemaVersion, 3);
  assert.equal(meta.canvas, null);
  assert.equal(meta.clips[0].fit, 'contain');
  assert.equal(meta.clips[0].opacity, 1);
  assert.equal(meta.clips[0].transform.scale, 1);
  assert.equal(meta.clips[0].transform.x, 0);
  assert.ok(Array.isArray(meta.audioClips));
  assert.equal(meta.ducking.enabled, false);
});

test('v1 + eski string canvas → v3: canvas=null', () => {
  const meta = {
    schemaVersion: 1,
    canvas: '9:16',
    clips: [{ id: 'c1' }],
  };
  migrateProjectMeta(meta);
  assert.equal(meta.schemaVersion, 3);
  assert.equal(meta.canvas, null);
  assert.equal(meta.clips[0].fit, 'contain');
});

test('v1 + canvas obyekt saqlanadi', () => {
  const meta = {
    schemaVersion: 1,
    canvas: { w: 1080, h: 1920, fps: 30 },
    clips: [{ id: 'c1', fit: 'cover', transform: { x: 0.1, y: 0, scale: 1.2, rotation: 0 }, opacity: 0.9 }],
  };
  migrateProjectMeta(meta);
  assert.equal(meta.schemaVersion, 3);
  assert.equal(meta.canvas.w, 1080);
  assert.equal(meta.canvas.h, 1920);
  assert.equal(meta.clips[0].fit, 'cover');
  assert.equal(meta.clips[0].opacity, 0.9);
  assert.equal(meta.clips[0].transform.scale, 1.2);
});

test('v2 → v3: audio/subtitles/extras default', () => {
  const meta = {
    schemaVersion: 2,
    canvas: { w: 720, h: 1280, fps: 24 },
    clips: [{ id: 'c1', fit: 'blur' }],
  };
  migrateProjectMeta(meta);
  assert.equal(meta.schemaVersion, 3);
  assert.equal(meta.canvas.w, 720);
  assert.equal(meta.clips[0].fit, 'blur');
  assert.ok(Array.isArray(meta.audioClips));
  assert.ok(meta.ducking);
  assert.ok(meta.subtitles);
  assert.ok(meta.extras);
});

test('v3 allaqachon — o\'zgarmaydi', () => {
  const meta = {
    schemaVersion: 3,
    canvas: { w: 720, h: 1280, fps: 24 },
    audioClips: [{ id: 'a1', kind: 'music' }],
    clips: [{ id: 'c1', fit: 'blur' }],
  };
  migrateProjectMeta(meta);
  assert.equal(meta.schemaVersion, 3);
  assert.equal(meta.audioClips.length, 1);
  assert.equal(meta.clips[0].fit, 'blur');
});

test('bo\'sh clips massivi — xato bermaydi', () => {
  const meta = { schemaVersion: 0, clips: [] };
  migrateProjectMeta(meta);
  assert.equal(meta.schemaVersion, 3);
  assert.equal(meta.canvas, null);
});

test('null meta — null qaytaradi', () => {
  assert.equal(migrateProjectMeta(null), null);
});

console.log('---');
console.log(pass + ' OK, ' + fail + ' FAIL');
if (fail > 0) process.exit(1);
