// ===================== STORAGE ADAPTER (Faza 7) =====================
// Bitta interfeys, ikkita backend: local (IndexedDB + OPFS) va cloud (Supabase).
(function () {
  'use strict';

  const adapters = {
    local: null,
    cloud: null,
  };

  /** @type {'local'|'cloud'} */
  let currentMode = 'cloud';

  function setAdapter(mode, impl) {
    if (mode !== 'local' && mode !== 'cloud') throw new Error('Noto\'g\'ri storageMode: ' + mode);
    adapters[mode] = impl;
  }

  function getAdapter(mode) {
    const m = mode || currentMode;
    const a = adapters[m];
    if (!a) throw new Error('Storage adapter topilmadi: ' + m);
    return a;
  }

  function setMode(mode) {
    if (mode !== 'local' && mode !== 'cloud') throw new Error('Noto\'g\'ri storageMode');
    currentMode = mode;
    try {
      window.EMR = window.EMR || {};
      window.EMR.storageMode = mode;
    } catch (_) {}
  }

  function getMode() {
    return currentMode;
  }

  /** Sof: session + guest-flag → ekran */
  function resolveEntryMode(hasSession, guestFlag) {
    if (hasSession) return 'dashboard';
    if (guestFlag) return 'guest';
    return 'choose';
  }

  function pickMediaBackend(hasOPFS) {
    return hasOPFS ? 'opfs' : 'idb-blob';
  }

  /**
   * Loyiha id bo'yicha adapter topish:
   * avval local, keyin cloud (login bo'lsa).
   */
  async function findProject(id) {
    if (adapters.local) {
      try {
        const m = await adapters.local.getProject(id);
        if (m) return { meta: m, mode: 'local', adapter: adapters.local };
      } catch (_) {}
    }
    if (adapters.cloud && window.Auth && window.Auth.session) {
      try {
        const m = await adapters.cloud.getProject(id);
        if (m) return { meta: m, mode: 'cloud', adapter: adapters.cloud };
      } catch (_) {}
    }
    return null;
  }

  /** Dashboard uchun: local + cloud ro'yxatni birlashtirish */
  async function listAllProjects() {
    const out = [];
    const seen = new Set();
    if (adapters.local) {
      try {
        const local = await adapters.local.listProjects();
        for (const p of local) {
          p.storageMode = 'local';
          out.push(p);
          seen.add(p.id);
        }
      } catch (e) {
        console.warn('[adapter] local list:', e.message);
      }
    }
    if (adapters.cloud && window.Auth && window.Auth.session) {
      try {
        const cloud = await adapters.cloud.listProjects();
        for (const p of cloud) {
          if (seen.has(p.id)) continue;
          p.storageMode = p.storageMode || 'cloud';
          out.push(p);
        }
      } catch (e) {
        console.warn('[adapter] cloud list:', e.message);
      }
    }
    out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return out;
  }

  /**
   * Sof: qaysi fayllar hali cloud'ga yuklanmagan (7D progress).
   * uploadedIds = Set yoki array
   */
  function remainingUploads(fileIds, uploadedIds) {
    const done = uploadedIds instanceof Set ? uploadedIds : new Set(uploadedIds || []);
    return (fileIds || []).filter((id) => !done.has(id));
  }

  window.StorageAdapter = {
    setAdapter,
    getAdapter,
    setMode,
    getMode,
    resolveEntryMode,
    pickMediaBackend,
    findProject,
    listAllProjects,
    remainingUploads,
    adapters,
  };

  window.EMR = window.EMR || {};
  window.EMR.storageMode = currentMode;
  window.EMR.getAdapter = getAdapter;

  console.info('[storage-adapter] yuklandi. EMR.storageMode =', currentMode);
})();
