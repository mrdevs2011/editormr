/**
 * Faza 9C/9D: maxfiylikni hurmat qiluvchi analitika + xato monitoring.
 * Uchinchi tomon yo'q — faqat o'z Supabase jadvali (insert-only RLS).
 * Xato bo'lsa jim yutiladi — foydalanuvchi ishini to'xtatmaydi.
 */
(function (global) {
  'use strict';

  // Meta allow-list — PII o'tib ketmasin
  var META_ALLOW = {
    duration_s: true,
    quality: true,
    renderer: true,
    reason: true,
    clip_count: true,
    has_music: true,
    has_text: true,
    schema_version: true,
    mode: true, // guest|cloud
  };

  var ALLOWED_EVENTS = {
    project_created: true,
    export_started: true,
    export_completed: true,
    export_failed: true,
    guest_started: true,
    saved_to_cloud: true,
    pwa_installed: true,
    onboarding_completed: true,
    onboarding_skipped: true,
  };

  // Sessiya id — faqat tab xotirasi, cookie emas
  var sessionId = 's' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  // Xato dedup: bir sessiyada bir xil message 1 marta
  var errorSeen = Object.create(null);
  var ERROR_STACK_MAX = 2000;

  function sanitizeMeta(meta) {
    if (!meta || typeof meta !== 'object') return {};
    var out = {};
    for (var k in meta) {
      if (!Object.prototype.hasOwnProperty.call(meta, k)) continue;
      if (!META_ALLOW[k]) continue;
      var v = meta[k];
      if (v == null) continue;
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        out[k] = v;
      }
    }
    return out;
  }

  function sb() {
    try {
      if (global.Auth && global.Auth.client) return global.Auth.client;
    } catch (_) {}
    return null;
  }

  /**
   * @param {string} eventName
   * @param {object} [meta]
   * @param {string|null} [projectId]
   */
  function track(eventName, meta, projectId) {
    try {
      if (!ALLOWED_EVENTS[eventName]) return;
      var client = sb();
      if (!client) return;
      var row = {
        event_name: eventName,
        project_id: projectId || null,
        meta: Object.assign({ sid: sessionId }, sanitizeMeta(meta || {})),
      };
      // fire-and-forget
      Promise.resolve(client.from('analytics_events').insert(row)).catch(function () {});
    } catch (_) {}
  }

  function truncateStack(stack) {
    if (!stack) return null;
    var s = String(stack);
    // local path noise
    s = s.replace(/file:\/\/\/[^\s)]+/g, '[local]');
    s = s.replace(/https?:\/\/[^/]+/g, '');
    if (s.length > ERROR_STACK_MAX) s = s.slice(0, ERROR_STACK_MAX);
    return s;
  }

  /**
   * Sof: shu xabar yuborilsinmi? (dedup)
   * @param {Record<string,boolean>} seen
   * @param {string} message
   */
  function shouldReportError(seen, message) {
    var key = String(message || '').slice(0, 200);
    if (!key) return false;
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  }

  function reportError(payload) {
    try {
      var msg = (payload && payload.message) || 'unknown';
      if (!shouldReportError(errorSeen, msg)) return;
      var client = sb();
      if (!client) return;
      var row = {
        message: String(msg).slice(0, 500),
        stack: truncateStack(payload && payload.stack),
        url: (payload && payload.url) ? String(payload.url).slice(0, 500) : null,
        meta: { sid: sessionId, kind: (payload && payload.kind) || 'error' },
      };
      Promise.resolve(client.from('client_errors').insert(row)).catch(function () {});
    } catch (_) {}
  }

  function installGlobalHandlers() {
    if (global.__emrErrorHandlersInstalled) return;
    global.__emrErrorHandlersInstalled = true;

    global.addEventListener('error', function (ev) {
      try {
        var msg = (ev && ev.message) || (ev && ev.error && ev.error.message) || 'error';
        var stack = (ev && ev.error && ev.error.stack) || null;
        reportError({ message: msg, stack: stack, url: (ev && ev.filename) || (global.location && global.location.href), kind: 'error' });
      } catch (_) {}
    });

    global.addEventListener('unhandledrejection', function (ev) {
      try {
        var r = ev && ev.reason;
        var msg = (r && r.message) ? r.message : String(r || 'rejection');
        var stack = (r && r.stack) || null;
        reportError({ message: msg, stack: stack, url: global.location && global.location.href, kind: 'unhandledrejection' });
      } catch (_) {}
    });
  }

  // Export for tests / callers
  global.EMR_analytics = {
    track: track,
    reportError: reportError,
    sanitizeMeta: sanitizeMeta,
    shouldReportError: shouldReportError,
    truncateStack: truncateStack,
    META_ALLOW: META_ALLOW,
    ALLOWED_EVENTS: ALLOWED_EVENTS,
    installGlobalHandlers: installGlobalHandlers,
  };
  global.track = track;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', installGlobalHandlers);
    } else {
      installGlobalHandlers();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
