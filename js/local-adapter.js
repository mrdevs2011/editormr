// ===================== LOCAL ADAPTER (Faza 7B) =====================
// Loyiha metadata — IndexedDB (object store: projects, key = id)
// Media fayllar — local-media.js (OPFS yoki IDB Blob)
(function () {
  'use strict';

  const DB_NAME = 'emr-local';
  const DB_VER = 1;
  const STORE = 'projects';

  let _dbPromise = null;

  function openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB yo\'q'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onerror = () => reject(req.error || new Error('IDB open fail'));
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
    });
    return _dbPromise;
  }

  function idbReq(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function listProjects() {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readonly');
    const all = await idbReq(tx.objectStore(STORE).getAll());
    return (all || []).map((m) => {
      m.storageMode = 'local';
      m.locked = false;
      return m;
    }).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  async function getProject(id) {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readonly');
    const m = await idbReq(tx.objectStore(STORE).get(id));
    if (!m) return null;
    m.storageMode = 'local';
    m.locked = false;
    return m;
  }

  /**
   * @param {object} meta
   * @param {Array<{id,name,type,blob}>} newFiles
   * @param {string[]} removedFileIds
   * @param {object} [opts]
   */
  async function saveProject(meta, newFiles, removedFileIds, opts) {
    opts = opts || {};
    const Media = window.LocalMedia;
    if (!Media) throw new Error('LocalMedia yuklanmagan');

    // Media yozish / o'chirish
    for (const f of newFiles || []) {
      await Media.saveFile(meta.id, f.id, f.blob, { name: f.name, type: f.type });
    }
    for (const fid of removedFileIds || []) {
      try { await Media.deleteFile(meta.id, fid); } catch (_) {}
    }

    // file_names xarita (cloud bilan mos) — mavjud meta + yangi
    const existing = await getProject(meta.id);
    const fileNames = { ...((existing && existing.fileNames) || meta.fileNames || {}) };
    for (const f of newFiles || []) fileNames[f.id] = f.name;
    for (const fid of removedFileIds || []) delete fileNames[fid];

    const now = Date.now();
    const record = {
      id: meta.id,
      name: meta.name || 'Loyiha',
      createdAt: meta.createdAt || now,
      updatedAt: now,
      thumb: meta.thumb || null,
      duration: meta.duration || 0,
      clipCount: meta.clipCount || 0,
      clips: meta.clips || [],
      music: meta.music || null,
      textClips: meta.textClips || [],
      audioClips: Array.isArray(meta.audioClips) ? meta.audioClips : [],
      ducking: meta.ducking && typeof meta.ducking === 'object' ? meta.ducking : null,
      subtitles: meta.subtitles && typeof meta.subtitles === 'object' ? meta.subtitles : null,
      currentTime: meta.currentTime || 0,
      pps: meta.pps || 40,
      fileNames,
      extras: meta.extras && typeof meta.extras === 'object' ? meta.extras : {},
      markers: Array.isArray(meta.markers) ? meta.markers : [],
      inPoint: meta.inPoint != null ? meta.inPoint : null,
      outPoint: meta.outPoint != null ? meta.outPoint : null,
      schemaVersion: meta.schemaVersion != null ? Number(meta.schemaVersion) : 3,
      canvas: meta.canvas || null,
      storageMode: 'local',
    };

    const db = await openDB();
    const tx = db.transaction(STORE, 'readwrite');
    await idbReq(tx.objectStore(STORE).put(record));
    return record;
  }

  async function deleteProject(id) {
    const Media = window.LocalMedia;
    if (Media) {
      try { await Media.deleteProjectFiles(id); } catch (_) {}
    }
    const db = await openDB();
    const tx = db.transaction(STORE, 'readwrite');
    await idbReq(tx.objectStore(STORE).delete(id));
  }

  async function getFiles(projectId) {
    const Media = window.LocalMedia;
    if (!Media) return [];
    const meta = await getProject(projectId);
    const names = (meta && meta.fileNames) || {};
    const out = [];
    for (const [id, name] of Object.entries(names)) {
      if (id.startsWith('__')) continue; // reserved
      try {
        const blob = await Media.getFile(projectId, id);
        if (blob) out.push({ id, projectId, name, type: blob.type || 'application/octet-stream', blob });
      } catch (e) {
        console.warn('[local-adapter] media yo\'q:', id, e.message);
      }
    }
    return out;
  }

  async function renameProject(id, name) {
    const m = await getProject(id);
    if (!m) throw new Error('Loyiha topilmadi');
    m.name = name;
    m.updatedAt = Date.now();
    const db = await openDB();
    const tx = db.transaction(STORE, 'readwrite');
    await idbReq(tx.objectStore(STORE).put(m));
  }

  // Lock — local rejimda kerak emas (bitta qurilma)
  async function ownsLock() { return true; }
  async function acquireLock() { return true; }
  async function heartbeatLock() { return true; }
  async function releaseLock() {}

  const LocalAdapter = {
    listProjects,
    getProject,
    saveProject,
    deleteProject,
    getFiles,
    renameProject,
    ownsLock,
    acquireLock,
    heartbeatLock,
    releaseLock,
    mode: 'local',
  };

  window.LocalAdapter = LocalAdapter;

  if (window.StorageAdapter) {
    window.StorageAdapter.setAdapter('local', LocalAdapter);
  }

  console.info('[local-adapter] IndexedDB tayyor');
})();
