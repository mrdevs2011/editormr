// ===================== LOCAL → CLOUD (Faza 7D) =====================
// Bir yo'nalish: foydalanuvchi bosganda local loyihani Supabase'ga ko'chirish.
// Local nusxa o'chirilmaydi (xavfsizlik).
(function () {
  'use strict';

  function S(key, vars) {
    if (typeof window.S === 'function') return window.S(key, vars);
    return key;
  }

  function remainingUploads(fileIds, uploadedIds) {
    if (window.StorageAdapter && StorageAdapter.remainingUploads) {
      return StorageAdapter.remainingUploads(fileIds, uploadedIds);
    }
    const done = uploadedIds instanceof Set ? uploadedIds : new Set(uploadedIds || []);
    return (fileIds || []).filter((id) => !done.has(id));
  }

  /**
   * Progress overlay: nechta/jami, qaysi fayl, xato.
   */
  function showProgress(title) {
    let ov = document.getElementById('local-cloud-progress');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'local-cloud-progress';
      ov.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;padding:20px;';
      ov.innerHTML = '<div style="background:#1a1a1e;border-radius:12px;padding:24px;max-width:400px;width:100%;color:#eee;font-family:system-ui,sans-serif;">' +
        '<h3 id="lcp-title" style="margin:0 0 12px;"></h3>' +
        '<div id="lcp-bar" style="height:8px;background:#333;border-radius:4px;overflow:hidden;margin-bottom:8px;"><div id="lcp-fill" style="height:100%;width:0;background:#3b82f6;transition:width .2s;"></div></div>' +
        '<div id="lcp-text" style="font-size:.9rem;color:#aaa;"></div>' +
        '<div id="lcp-err" style="font-size:.85rem;color:#f66;margin-top:8px;display:none;"></div>' +
        '<button type="button" id="lcp-retry" style="display:none;margin-top:12px;padding:8px 14px;border:none;border-radius:8px;background:#3b82f6;color:#fff;cursor:pointer;">Qayta urinish</button>' +
        '<button type="button" id="lcp-close" style="display:none;margin-top:12px;margin-left:8px;padding:8px 14px;border:1px solid #555;border-radius:8px;background:transparent;color:#eee;cursor:pointer;">Yopish</button>' +
        '</div>';
      document.body.appendChild(ov);
    }
    ov.style.display = 'flex';
    document.getElementById('lcp-title').textContent = title || 'Bulutga saqlash';
    document.getElementById('lcp-fill').style.width = '0%';
    document.getElementById('lcp-text').textContent = '';
    document.getElementById('lcp-err').style.display = 'none';
    document.getElementById('lcp-retry').style.display = 'none';
    document.getElementById('lcp-close').style.display = 'none';
    return {
      set(done, total, label) {
        const pct = total ? Math.round((done / total) * 100) : 0;
        document.getElementById('lcp-fill').style.width = pct + '%';
        document.getElementById('lcp-text').textContent = (label || '') + ' (' + done + '/' + total + ')';
      },
      error(msg, onRetry) {
        const el = document.getElementById('lcp-err');
        el.style.display = 'block';
        el.textContent = msg;
        const rb = document.getElementById('lcp-retry');
        const cb = document.getElementById('lcp-close');
        cb.style.display = 'inline-block';
        cb.onclick = () => { ov.style.display = 'none'; };
        if (onRetry) {
          rb.style.display = 'inline-block';
          rb.onclick = () => { el.style.display = 'none'; rb.style.display = 'none'; onRetry(); };
        }
      },
      done() {
        document.getElementById('lcp-text').textContent = 'Tayyor';
        document.getElementById('lcp-fill').style.width = '100%';
        setTimeout(() => { ov.style.display = 'none'; }, 800);
      },
      close() { ov.style.display = 'none'; },
    };
  }

  async function uploadLocalProjectToCloud(projectId) {
    if (!window.Auth || !Auth.session) {
      if (typeof showToast === 'function') showToast('Avval kiring');
      return;
    }
    if (!window.LocalAdapter || !window.CloudAdapter) {
      if (typeof showToast === 'function') showToast('Adapterlar tayyor emas');
      return;
    }

    const progress = showProgress(S('auth.saveToCloud') || 'Bulutga saqlash');
    const uploaded = new Set();

    async function run() {
      try {
        const meta = await LocalAdapter.getProject(projectId);
        if (!meta) throw new Error('Local loyiha topilmadi');

        const files = await LocalAdapter.getFiles(projectId);
        const fileIds = files.map((f) => f.id);
        const todo = remainingUploads(fileIds, uploaded);
        const total = fileIds.length;
        let done = uploaded.size;

        progress.set(done, Math.max(total, 1), 'Meta yozilmoqda…');

        // Yangi cloud id — local id bilan bir xil saqlaymiz (oddiy)
        const cloudMeta = Object.assign({}, meta, {
          storageMode: 'cloud',
          updatedAt: Date.now(),
        });

        // Avval bo'sh meta (faylsiz), keyin fayllar
        const pendingFiles = files.filter((f) => !uploaded.has(f.id));

        // Birinchi marta meta + barcha fayllar birga (yoki qisman qayta)
        // Qayta urinishda faqat qolganlari
        const batch = pendingFiles.map((f) => ({
          id: f.id,
          name: f.name,
          type: f.type,
          blob: f.blob,
        }));

        // Progress bilan birma-bir yuklash (katta fayllar uchun)
        const uploadedThisRun = [];
        for (let i = 0; i < batch.length; i++) {
          const f = batch[i];
          progress.set(done + i, Math.max(total, 1), f.name || f.id);
          try {
            // Har bir faylni alohida saqlash: cloud adapter saveProject
            await CloudAdapter.saveProject(
              Object.assign({}, cloudMeta, {
                // faqat shu fayl "yangi"
              }),
              [f],
              [],
              { expectedUpdatedAt: null }
            );
            uploaded.add(f.id);
            uploadedThisRun.push(f.id);
          } catch (e) {
            const msg = (e && e.message) || String(e);
            progress.error(
              'Xato (' + (f.name || f.id) + '): ' + msg + '. Yuklangan: ' + uploaded.size + '/' + total,
              () => run()
            );
            return;
          }
        }

        // Yakuniy meta (barcha fileNames bilan)
        await CloudAdapter.saveProject(cloudMeta, [], [], { expectedUpdatedAt: null });

        progress.set(total, Math.max(total, 1), 'Tayyor');
        progress.done();
        if (typeof showToast === 'function') {
          showToast(S('auth.savedToCloud') || 'Bulutda saqlangan');
        }
      } catch (e) {
        progress.error((e && e.message) || String(e), () => run());
      }
    }

    await run();
  }

  window.uploadLocalProjectToCloud = uploadLocalProjectToCloud;
  window.remainingUploads = remainingUploads;
})();
