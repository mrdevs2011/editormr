// ===================== LOCAL MEDIA (Faza 7C) =====================
// OPFS (navigator.storage.getDirectory) yoki IndexedDB Blob fallback
(function () {
  'use strict';

  const IDB_NAME = 'editormr-media';
  const IDB_VER = 1;
  const IDB_STORE = 'blobs';

  /** @type {'opfs'|'idb-blob'|null} */
  let backend = null;
  let opfsRoot = null;
  let idbPromise = null;
  let persistAsked = false;
  let persistGranted = null;

  function detectOPFS() {
    try {
      return !!(navigator.storage && typeof navigator.storage.getDirectory === 'function');
    } catch (_) {
      return false;
    }
  }

  async function ensureBackend() {
    if (backend) return backend;
    const has = detectOPFS();
    const pick = (window.StorageAdapter && window.StorageAdapter.pickMediaBackend)
      ? window.StorageAdapter.pickMediaBackend(has)
      : (has ? 'opfs' : 'idb-blob');
    if (pick === 'opfs') {
      try {
        opfsRoot = await navigator.storage.getDirectory();
        backend = 'opfs';
      } catch (e) {
        console.warn('[local-media] OPFS ochilmadi, IDB fallback:', e.message);
        backend = 'idb-blob';
      }
    } else {
      backend = 'idb-blob';
    }
    return backend;
  }

  function openIdb() {
    if (idbPromise) return idbPromise;
    idbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, IDB_VER);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE); // key = projectId/fileId
        }
      };
    });
    return idbPromise;
  }

  function mediaKey(projectId, fileId) {
    return projectId + '/' + fileId;
  }

  async function ensureProjectDir(projectId) {
    await ensureBackend();
    if (backend !== 'opfs') return null;
    return opfsRoot.getDirectoryHandle(projectId, { create: true });
  }

  async function saveFile(projectId, fileId, blob, meta) {
    await ensureBackend();
    if (backend === 'opfs') {
      const dir = await ensureProjectDir(projectId);
      const fh = await dir.getFileHandle(fileId, { create: true });
      const w = await fh.createWritable();
      await w.write(blob);
      await w.close();
    } else {
      const db = await openIdb();
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const val = { blob, name: (meta && meta.name) || fileId, type: (meta && meta.type) || blob.type };
      await new Promise((res, rej) => {
        const r = tx.objectStore(IDB_STORE).put(val, mediaKey(projectId, fileId));
        r.onsuccess = () => res();
        r.onerror = () => rej(r.error);
      });
    }
  }

  async function getFile(projectId, fileId) {
    await ensureBackend();
    if (backend === 'opfs') {
      try {
        const dir = await opfsRoot.getDirectoryHandle(projectId, { create: false });
        const fh = await dir.getFileHandle(fileId, { create: false });
        return await fh.getFile();
      } catch (e) {
        return null;
      }
    } else {
      const db = await openIdb();
      const tx = db.transaction(IDB_STORE, 'readonly');
      const val = await new Promise((res, rej) => {
        const r = tx.objectStore(IDB_STORE).get(mediaKey(projectId, fileId));
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      if (!val) return null;
      if (val.blob instanceof Blob) {
        return val.blob.type ? val.blob : new Blob([val.blob], { type: val.type || 'application/octet-stream' });
      }
      return null;
    }
  }

  async function deleteFile(projectId, fileId) {
    await ensureBackend();
    if (backend === 'opfs') {
      try {
        const dir = await opfsRoot.getDirectoryHandle(projectId, { create: false });
        await dir.removeEntry(fileId);
      } catch (_) {}
    } else {
      const db = await openIdb();
      const tx = db.transaction(IDB_STORE, 'readwrite');
      await new Promise((res, rej) => {
        const r = tx.objectStore(IDB_STORE).delete(mediaKey(projectId, fileId));
        r.onsuccess = () => res();
        r.onerror = () => rej(r.error);
      });
    }
  }

  async function deleteProjectFiles(projectId) {
    await ensureBackend();
    if (backend === 'opfs') {
      try {
        await opfsRoot.removeEntry(projectId, { recursive: true });
      } catch (_) {}
    } else {
      const db = await openIdb();
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const keys = await new Promise((res, rej) => {
        const r = store.getAllKeys();
        r.onsuccess = () => res(r.result || []);
        r.onerror = () => rej(r.error);
      });
      const prefix = projectId + '/';
      for (const k of keys) {
        if (String(k).startsWith(prefix)) {
          await new Promise((res, rej) => {
            const r = store.delete(k);
            r.onsuccess = () => res();
            r.onerror = () => rej(r.error);
          });
        }
      }
    }
  }

  async function listFiles(projectId) {
    await ensureBackend();
    const ids = [];
    if (backend === 'opfs') {
      try {
        const dir = await opfsRoot.getDirectoryHandle(projectId, { create: false });
        for await (const [name] of dir.entries()) ids.push(name);
      } catch (_) {}
    } else {
      const db = await openIdb();
      const tx = db.transaction(IDB_STORE, 'readonly');
      const keys = await new Promise((res, rej) => {
        const r = tx.objectStore(IDB_STORE).getAllKeys();
        r.onsuccess = () => res(r.result || []);
        r.onerror = () => rej(r.error);
      });
      const prefix = projectId + '/';
      for (const k of keys) {
        if (String(k).startsWith(prefix)) ids.push(String(k).slice(prefix.length));
      }
    }
    return ids;
  }

  /** navigator.storage.persist() — bir marta so'rash */
  async function requestPersist() {
    if (persistAsked) return persistGranted;
    persistAsked = true;
    try {
      if (navigator.storage && navigator.storage.persist) {
        persistGranted = await navigator.storage.persist();
      } else {
        persistGranted = false;
      }
    } catch (_) {
      persistGranted = false;
    }
    return persistGranted;
  }

  async function estimate() {
    try {
      if (navigator.storage && navigator.storage.estimate) {
        return await navigator.storage.estimate();
      }
    } catch (_) {}
    return { usage: 0, quota: 0 };
  }

  function getBackend() {
    return backend;
  }

  function isAvailable() {
    try {
      return typeof indexedDB !== 'undefined';
    } catch (_) {
      return false;
    }
  }

  window.LocalMedia = {
    saveFile,
    getFile,
    deleteFile,
    deleteProjectFiles,
    listFiles,
    requestPersist,
    estimate,
    getBackend,
    isAvailable,
    ensureBackend,
  };

  console.info('[local-media] modul yuklandi');
})();
