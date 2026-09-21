// ===================== CLOUD ADAPTER (Faza 7B) =====================
// Mavjud storage.js funksiyalarini o'rab, local-adapter bilan bir xil signature
(function () {
  'use strict';

  async function listProjects() {
    const list = await dbListProjects();
    return (list || []).map((m) => {
      m.storageMode = m.storageMode || 'cloud';
      return m;
    });
  }

  async function getProject(id) {
    const m = await dbGetProject(id);
    if (m) m.storageMode = m.storageMode || 'cloud';
    return m;
  }

  async function saveProject(meta, newFiles, removedFileIds, opts) {
    meta.storageMode = 'cloud';
    await dbSaveProject(meta, newFiles || [], removedFileIds || [], opts || {});
    return meta;
  }

  async function deleteProject(id) {
    return dbDeleteProject(id);
  }

  async function getFiles(projectId) {
    return dbGetFiles(projectId);
  }

  async function renameProject(id, name) {
    return dbRenameProject(id, name);
  }

  async function ownsLock(projectId) {
    if (typeof dbOwnsProjectLock === 'function') return dbOwnsProjectLock(projectId);
    return true;
  }

  async function acquireLock(projectId, opts) {
    if (typeof dbAcquireProjectLock === 'function') return dbAcquireProjectLock(projectId, opts);
    return true;
  }

  async function heartbeatLock(projectId) {
    if (typeof dbHeartbeatProjectLock === 'function') return dbHeartbeatProjectLock(projectId);
    return true;
  }

  async function releaseLock(projectId) {
    if (typeof dbReleaseProjectLock === 'function') return dbReleaseProjectLock(projectId);
  }

  const CloudAdapter = {
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
    mode: 'cloud',
  };

  window.CloudAdapter = CloudAdapter;

  if (window.StorageAdapter) {
    window.StorageAdapter.setAdapter('cloud', CloudAdapter);
  }

  console.info('[cloud-adapter] Supabase o\'ram tayyor');
})();
