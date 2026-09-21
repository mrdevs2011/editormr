import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const sandbox = {
  console,
  localStorage: {
    _d: {},
    getItem(k) { return this._d[k] || null; },
    setItem(k, v) { this._d[k] = String(v); },
  },
  addEventListener() {},
  document: undefined,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/strings.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/analytics.js'), 'utf8'), sandbox);

// Pure onboarding helpers only (no DOM boot)
vm.runInContext(`
  var LS_KEY = 'emr.onboarding_seen';
  function shouldShowOnboarding(flags) {
    flags = flags || {};
    if (flags.force) return true;
    if (flags.seen === true) return false;
    if (flags.seen === false) return true;
    try { return localStorage.getItem(LS_KEY) !== '1'; } catch (_) { return true; }
  }
  function markOnboardingSeen() {
    try { localStorage.setItem(LS_KEY, '1'); } catch (_) {}
  }
  EMR_onboarding = { shouldShowOnboarding: shouldShowOnboarding, markOnboardingSeen: markOnboardingSeen };
`, sandbox);

const { t } = sandbox;
const A = sandbox.EMR_analytics;
const O = sandbox.EMR_onboarding;

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('OK   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '-', e.message); }
}

test('t: mavjud kalit', () => {
  assert.ok(t('toast_export_need_media').includes('Export'));
});
test('t: interpolyatsiya', () => {
  assert.equal(t('toast_export_error', { msg: 'boom' }), 'Export xatosi: boom');
});
test('t: noma\'lum kalit', () => {
  assert.equal(t('no_such_key_xyz'), 'no_such_key_xyz');
});
test('sanitizeMeta allow-list', () => {
  const out = A.sanitizeMeta({ duration_s: 12, email: 'a@b.c', clip_count: 3 });
  assert.equal(out.duration_s, 12);
  assert.equal(out.clip_count, 3);
  assert.equal(out.email, undefined);
});
test('shouldReportError dedup', () => {
  const seen = Object.create(null);
  assert.equal(A.shouldReportError(seen, 'err1'), true);
  assert.equal(A.shouldReportError(seen, 'err1'), false);
  assert.equal(A.shouldReportError(seen, 'err2'), true);
});
test('truncateStack max', () => {
  assert.ok(A.truncateStack('x'.repeat(5000)).length <= 2000);
});
test('shouldShowOnboarding flags', () => {
  assert.equal(O.shouldShowOnboarding({ seen: true }), false);
  assert.equal(O.shouldShowOnboarding({ force: true }), true);
});
test('shouldShowOnboarding localStorage', () => {
  sandbox.localStorage._d = {};
  assert.equal(O.shouldShowOnboarding({}), true);
  O.markOnboardingSeen();
  assert.equal(O.shouldShowOnboarding({}), false);
});

console.log('---');
console.log(pass + ' OK, ' + fail + ' FAIL');
if (fail > 0) process.exit(1);
