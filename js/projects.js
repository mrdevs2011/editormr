    // ===================== PROJECTS (dashboard + autosave + open/close) =====================
    // Oqim:  dashboard  --(fayl tanlash)-->  yangi project  --(autosave, IndexedDB)-->  editor
    //        dashboard  --(kartani bosish)-->  openProject()  ...  "back" --> closeProject()

    function baseName(fileName) {
      return fileName.replace(/\.[^.]+$/, '') || fileName;
    }

    // Editor holatini to'liq tozalaydi (yangi project / boshqa project ochishdan oldin)
    function resetEditorState() {
      if (state.isPlaying) pauseAll();

      const urls = new Set(state.videoClips.map(c => c.url));
      if (state.videoUrl) urls.add(state.videoUrl);
      urls.forEach(u => { if (typeof releaseObjectUrl === "function") releaseObjectUrl(u); else if (u) try { URL.revokeObjectURL(u); } catch(_){} });

      if (state.music) {
        if (state.music.audio) state.music.audio.pause();
        if (state.music.url) URL.revokeObjectURL(state.music.url);
        state.music = null;
      }

      previewVideo.onloadedmetadata = null;
      previewVideo.onerror = null;
      previewVideo.pause();
      previewVideo.removeAttribute('src');
      previewVideo.load();
      previewVideo.style.display = 'block';
      const imgPreview = document.getElementById('image-preview');
      if (imgPreview) imgPreview.style.display = 'none';

      state.videoFile = null;
      state.videoUrl = null;
      state.videoDuration = 0;
      state.videoClips = [];
      if (typeof invalidateClipOrder === 'function') invalidateClipOrder();
      state.textClips = [];
      state.canvasRatio = 'fit';
      if (typeof applyCanvas === 'function') applyCanvas();
      state.clipboard = null;
      state.selectedClipId = null;
      state.selectedIds = new Set();
      state.isImage = false;
      state.filmstrip = null;
      state.currentTime = 0;
      state.pixelsPerSecond = ZOOM_DEFAULT;
      state.projectId = null;
      state.projectName = '';
      state.projectThumb = null;
      state.savedFileIds = new Set();
      state.projectUpdatedAt = null;
      state.saveForceOverwrite = false;
      if (typeof stopProjectWatch === 'function') stopProjectWatch();

      videoLane.innerHTML = '';
      musicLane.innerHTML = '';
      musicTrack.style.display = 'none';
      const textLaneEl = document.getElementById('text-lane');
      const textTrackEl = document.getElementById('text-track');
      if (textLaneEl) textLaneEl.innerHTML = '';
      if (textTrackEl) textTrackEl.style.display = 'none';
      const overlayRoot = document.getElementById('text-overlay-root');
      if (overlayRoot) overlayRoot.innerHTML = '';
      timelineScroll.scrollLeft = 0;
      timelineScroll.scrollTop = 0;
      updateZoomLabel();
      if (typeof clearHistory === 'function') clearHistory();
    }

    // ---------- Yangi project ----------
    function beginProject(file, isImage) {
      const pid = makeProjectId();
      state.projectId = pid;
      state.projectName = baseName(file.name);
      state.projectCreatedAt = Date.now();
      state.projectThumb = null;
      state.savedFileIds = new Set();
      state.projectUpdatedAt = null;
      state.saveForceOverwrite = false;
      makeThumbnail(file, isImage).then((thumb) => {
        if (state.projectId !== pid) return;
        state.projectThumb = thumb;
        scheduleSave();
      });
      setHashForProject(pid);
    }

    // Dashboard kartasi uchun kichik JPEG (dataURL)
    function makeThumbnail(file, isImage) {
      return new Promise((resolve) => {
        const url = (typeof trackObjectUrl==="function"?trackObjectUrl(URL.createObjectURL(file)):URL.createObjectURL(file));
        let finished = false;
        const finish = (source, w, h) => {
          if (finished) return;
          finished = true;
          let out = null;
          try {
            if (source && w && h) {
              const canvas = document.createElement('canvas');
              canvas.width = 320;
              canvas.height = Math.max(1, Math.round(320 * h / w));
              canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
              out = canvas.toDataURL('image/jpeg', 0.7);
            }
          } catch (e) { /* thumbnail majburiy emas */ }
          URL.revokeObjectURL(url);
          resolve(out);
        };

        if (isImage) {
          const img = new Image();
          img.onload = () => finish(img, img.naturalWidth, img.naturalHeight);
          img.onerror = () => finish(null);
          img.src = url;
        } else {
          const v = document.createElement('video');
          v.muted = true;
          v.preload = 'auto';
          v.onloadeddata = () => {
            const d = isFinite(v.duration) ? v.duration : 1;
            v.currentTime = Math.min(1, d * 0.1);
          };
          v.onseeked = () => finish(v, v.videoWidth, v.videoHeight);
          v.onerror = () => finish(null);
          v.src = url;
        }
        setTimeout(() => finish(null), 6000);
      });
    }

    // ---------- Autosave ----------
    let saveTimer = null;
    let saveChain = Promise.resolve(); // yozuvlar ketma-ket, bir-birini bosib ketmasin

    function scheduleSave() {
      if (!state.projectId || state.isRestoring) return;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(flushSave, 300);
    }

    function flushSave() {
      clearTimeout(saveTimer);
      saveTimer = null;
      if (!state.projectId || !state.videoClips.length) return saveChain;
      saveChain = saveChain.then(saveProjectNow).catch((err) => {
        if (typeof isSaveConflictError === 'function' && isSaveConflictError(err)) return;
        console.warn('Save failed', err);
        showToast('Saqlab bo\'lmadi — internetni tekshir yoki qayta kirib ko\'r', 4000);
      });
      return saveChain;
    }

    async function saveProjectNow() {
      if (!state.projectId || !state.videoClips.length) return;
      const pid = state.projectId;
      if (typeof dbOwnsProjectLock === 'function') {
        const mine = await dbOwnsProjectLock(pid);
        if (!mine) {
          evictEditorStolen();
          return;
        }
      }

      // --- Snapshot (sinxron): await dan oldin, state o'zgarib ketmasin ---
      const used = new Map(); // fileId -> File
      const clips = state.videoClips.map((c) => {
        const fid = fileIdOf(c.file);
        used.set(fid, c.file);
        return {
          id: c.id, fileId: fid, name: c.name,
          startTime: c.startTime, trimStart: c.trimStart, trimEnd: c.trimEnd,
          offsetY: c.offsetY || 0, track: (typeof clipTrackIndex === 'function' ? clipTrackIndex(c) : (c.track || 0)), duration: c.duration, isImage: !!c.isImage,
          volume: c.volume != null ? c.volume : 1,
          muted: !!c.muted,
          speed: (c.speed && c.speed > 0) ? c.speed : 1,
          fadeIn: c.fadeIn || 0,
          fadeOut: c.fadeOut || 0,
          transitionType: c.transitionType || 'none',
          transitionDuration: c.transitionDuration != null ? c.transitionDuration : 0.3,
          floated: !!c.floated,
        };
      });
      let music = null;
      if (state.music) {
        const m = state.music;
        const fid = fileIdOf(m.file);
        used.set(fid, m.file);
        music = {
          fileId: fid, name: m.file.name,
          startTime: m.startTime, offsetY: m.offsetY || 0,
          trimStart: m.trimStart, trimEnd: m.trimEnd, duration: m.duration,
          volume: m.volume != null ? m.volume : 1,
          muted: !!m.muted,
          fadeIn: m.fadeIn || 0,
          fadeOut: m.fadeOut || 0,
        };
      }

      // Faqat yangi fayllar yoziladi; endi ishlatilmayotganlar (o'chirilgan clip) tozalanadi
      const newFiles = [];
      for (const [fid, f] of used) {
        if (!state.savedFileIds.has(fid)) newFiles.push({ id: fid, projectId: pid, name: f.name, type: f.type, blob: f });
      }
      const removed = [...state.savedFileIds].filter(id => !used.has(id));

      const textClips = (state.textClips || []).map((tc) => ({
        id: tc.id,
        text: tc.text,
        startTime: tc.startTime,
        duration: tc.duration,
        offsetY: tc.offsetY || 0,
        x: tc.x != null ? tc.x : 0.5,
        y: tc.y != null ? tc.y : 0.85,
        fontSize: tc.fontSize || 32,
        color: tc.color || '#ffffff',
        bold: !!tc.bold,
        align: tc.align || 'center',
        bgColor: tc.bgColor || '#000000',
        bgOpacity: tc.bgOpacity != null ? tc.bgOpacity : 0.45,
      }));

      const meta = {
        id: pid,
        name: state.projectName,
        createdAt: state.projectCreatedAt,
        updatedAt: Date.now(),
        thumb: state.projectThumb,
        duration: videoTimelineEnd(),
        clipCount: clips.length,
        clips,
        music,
        textClips,
        canvas: state.canvasRatio || 'fit',
        currentTime: state.currentTime,
        pps: state.pixelsPerSecond,
      };

      const expected = state.saveForceOverwrite ? null : state.projectUpdatedAt;
      try {
        await dbSaveProject(meta, newFiles, removed, { expectedUpdatedAt: expected });
      } catch (err) {
        if (typeof isSaveConflictError === 'function' && isSaveConflictError(err)) {
          const choice = await askSaveConflict();
          if (choice === 'reload') {
            await openProject(pid);
            return;
          }
          if (choice === 'overwrite') {
            state.saveForceOverwrite = true;
            await dbSaveProject(meta, newFiles, removed, { expectedUpdatedAt: null });
          } else {
            return;
          }
        } else {
          throw err;
        }
      }

      if (state.projectId === pid) {
        newFiles.forEach(f => state.savedFileIds.add(f.id));
        removed.forEach(id => state.savedFileIds.delete(id));
        state.projectUpdatedAt = meta.updatedAt;
        state.saveForceOverwrite = false;
        startProjectWatch();
        if (typeof dbHeartbeatProjectLock === 'function') {
          dbHeartbeatProjectLock(pid).catch(() => {});
        }
      }
    }

    let _conflictOpen = false;
    function askSaveConflict() {
      if (_conflictOpen) {
        return Promise.resolve('cancel');
      }
      _conflictOpen = true;
      return new Promise((resolve) => {
        const existing = document.getElementById('save-conflict-modal');
        if (existing) existing.remove();
        const overlay = document.createElement('div');
        overlay.id = 'save-conflict-modal';
        overlay.className = 'save-conflict-overlay';
        overlay.innerHTML =
          '<div class="save-conflict-card" role="dialog" aria-modal="true">' +
          '<div class="save-conflict-title">Loyiha boshqa joyda o\'zgargan</div>' +
          '<p class="save-conflict-text">Aka-uka / boshqa kompyuter shu projectni saqlagan. ' +
          'Hozir yozsangiz u yerda qilingan ish o\'chishi mumkin.</p>' +
          '<div class="save-conflict-actions">' +
          '<button type="button" class="save-conflict-btn primary" data-act="reload">Bulutdagini yuklash</button>' +
          '<button type="button" class="save-conflict-btn danger" data-act="overwrite">Shu kompyuterdagini yozish</button>' +
          '<button type="button" class="save-conflict-btn ghost" data-act="cancel">Bekor</button>' +
          '</div></div>';
        document.body.appendChild(overlay);
        const done = (act) => {
          _conflictOpen = false;
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          resolve(act);
        };
        overlay.addEventListener('click', (e) => {
          const btn = e.target.closest('[data-act]');
          if (btn) done(btn.getAttribute('data-act'));
        });
      });
    }

    let watchTimer = null;
    let watchWarned = false;
    function stopProjectWatch() {
      if (watchTimer) {
        clearInterval(watchTimer);
        watchTimer = null;
      }
      watchWarned = false;
    }
    function startProjectWatch() {
      stopProjectWatch();
      watchTimer = setInterval(async () => {
        if (!state.projectId || state.isRestoring || _conflictOpen) return;
        if (typeof dbHeartbeatProjectLock === 'function') {
          try {
            const mine = await dbHeartbeatProjectLock(state.projectId);
            if (mine === false) {
              evictEditorStolen();
              return;
            }
          } catch (_) {}
        }
        if (typeof dbPeekUpdatedAt !== 'function') return;
        try {
          const remote = await dbPeekUpdatedAt(state.projectId);
          if (remote == null || state.projectUpdatedAt == null) return;
          if (Number(remote) !== Number(state.projectUpdatedAt)) {
            if (!watchWarned) {
              watchWarned = true;
              showToast('Boshqa qurilmada saqlandi. Keyingi saqlashda tanlov chiqadi.', 4000);
            }
          } else {
            watchWarned = false;
          }
        } catch (_) {}
      }, 12000);
    }

    // Sahifa yopilayotganda / tab yashirilganda — kutmasdan yozib qo'yamiz
    window.addEventListener('pagehide', flushSave);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushSave();
    });

    // ---------- Dashboard ----------
    function timeAgo(ts) {
      const s = Math.max(0, (Date.now() - ts) / 1000);
      if (s < 60) return 'just now';
      if (s < 3600) return Math.floor(s / 60) + ' min ago';
      if (s < 86400) return Math.floor(s / 3600) + ' h ago';
      if (s < 86400 * 30) return Math.floor(s / 86400) + ' d ago';
      return new Date(ts).toLocaleDateString();
    }

    function buildProjectCard(p) {
      const card = document.createElement('div');
      card.className = 'project-card' + (p.locked ? ' is-locked' : '');
      card.title = p.locked ? (p.name + ' — boshqa qurilmada ochiq') : p.name;
      card.tabIndex = 0;

      const thumb = document.createElement('div');
      thumb.className = 'project-thumb';
      if (p.thumb) {
        const img = document.createElement('img');
        img.src = p.thumb;
        img.alt = '';
        thumb.appendChild(img);
      } else {
        const ph = document.createElement('div');
        ph.className = 'project-thumb-placeholder';
        ph.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 15l5-4 4 3 3-2 6 5"/></svg><span>preview yo\'q</span>';
        thumb.appendChild(ph);
      }

      const play = document.createElement('div');
      play.className = 'project-play';
      play.innerHTML = '<span><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>';
      thumb.appendChild(play);

      const dur = document.createElement('span');
      dur.className = 'project-dur';
      dur.textContent = formatTime(p.duration || 0);
      thumb.appendChild(dur);
      if (p.locked) {
        const lock = document.createElement('span');
        lock.className = 'project-lock';
        lock.textContent = 'Ochiq';
        thumb.appendChild(lock);
      }
      card.appendChild(thumb);

      const actions = document.createElement('div');
      actions.className = 'project-actions';

      const renameBtn = document.createElement('button');
      renameBtn.type = 'button';
      renameBtn.title = 'Nomlash';
      renameBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>';
      renameBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const name = prompt('Loyiha nomi', p.name);
        if (name && name.trim()) {
          try {
            await dbRenameProject(p.id, name.trim());
          } catch (err) {
            showToast('Nomlab bo\'lmadi: ' + (err.message || 'xato'));
          }
          renderDashboard();
        }
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'danger';
      delBtn.title = 'O\'chirish';
      delBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('"' + p.name + '" o\'chirilsinmi? Qaytarib bo\'lmaydi.')) return;
        try {
          await dbDeleteProject(p.id);
        } catch (err) {
          showToast('O\'chirib bo\'lmadi: ' + (err.message || 'xato'));
        }
        renderDashboard();
      });

      actions.append(renameBtn, delBtn);
      card.appendChild(actions);

      const info = document.createElement('div');
      info.className = 'project-info';
      const name = document.createElement('div');
      name.className = 'project-name';
      name.textContent = p.name;
      const meta = document.createElement('div');
      meta.className = 'project-meta';
      const clips = p.clipCount || 0;
      meta.textContent = clips + (clips === 1 ? ' clip' : ' clips') + ' · ' + timeAgo(p.updatedAt);
      info.append(name, meta);
      card.appendChild(info);

      card.addEventListener('click', async () => {
        if (p.locked) {
          const ok = await askStealLock(p.name);
          if (!ok) return;
          openProject(p.id, { steal: true });
          return;
        }
        openProject(p.id);
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          card.click();
        }
      });
      return card;
    }

    async function renderDashboard() {
      let list = [];
      let failed = false;
      try {
        list = await dbListProjects();
      } catch (err) {
        console.warn('Projects unavailable', err);
        failed = true;
      }

      const sortEl = document.getElementById('project-sort');
      const sortMode = (sortEl && sortEl.value) || 'updated';
      if (sortMode === 'name') {
        list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'uz'));
      } else if (sortMode === 'created') {
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      } else {
        list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      }

      projectGrid.innerHTML = '';
      for (const p of list) projectGrid.appendChild(buildProjectCard(p));

      const label = document.getElementById('projects-label');
      if (label) {
        label.textContent = list.length
          ? ('Projects (' + list.length + ')')
          : 'Projects';
      }
      const sortWrap = document.getElementById('dash-sort');
      if (sortWrap) {
        if (list.length) sortWrap.removeAttribute('hidden');
        else sortWrap.setAttribute('hidden', '');
      }

      if (list.length) {
        dashEmpty.classList.remove('is-visible');
        dashEmpty.setAttribute('hidden', '');
      } else {
        dashEmpty.removeAttribute('hidden');
        dashEmpty.classList.add('is-visible');
        const title = dashEmpty.querySelector('.dash-empty-title');
        const desc = dashEmpty.querySelector('.dash-empty-desc');
        const cta = dashEmpty.querySelector('.dash-empty-cta');
        if (failed) {
          if (title) title.textContent = 'Saqlash ishlamayapti';
          if (desc) desc.textContent = 'Bu brauzerda loyihalar saqlanmaydi — sahifa yangilanganda yo\'qolishi mumkin.';
          if (cta) cta.style.display = 'none';
        } else {
          if (title) title.textContent = 'Hali loyihalar yo\'q';
          if (desc) desc.textContent = 'Video yoki rasm yuklab birinchi montajingizni boshlang. Faylni shu yerga tashlashingiz yoki Ctrl+V qilishingiz ham mumkin.';
          if (cta) cta.style.display = '';
        }
      }
    }

    // ---------- Har bir project uchun URL (#p/<id>) ----------
    // Shu tufayli har bir loyiha o'zining havolasiga ega bo'ladi; havola ochilganda
    // Auth.requireSession() avval ishga tushadi (index.html), shuning uchun havola
    // faqat ruxsat etilgan hisob (mrdevs2011@gmail.com) bilan kirilganda ochiladi.
    function projectHash(id) { return '#p/' + encodeURIComponent(id); }
    function hashProjectId() {
      const m = /^#p\/(.+)$/.exec(location.hash);
      return m ? decodeURIComponent(m[1]) : null;
    }
    let syncingHash = false;
    function setHashForProject(id) {
      syncingHash = true;
      if (id) location.hash = projectHash(id);
      else history.replaceState(null, '', location.pathname + location.search);
      setTimeout(() => { syncingHash = false; }, 0);
    }
    window.addEventListener('hashchange', () => {
      if (syncingHash) return;
      const id = hashProjectId();
      if (id) {
        if (state.projectId !== id) openProject(id);
      } else if (state.projectId) {
        closeProject();
      }
    });

    // ---------- Open / Close ----------
    let opening = false;

    function loadImageEl(url) {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
      });
    }

    function askStealLock(projectName) {
      return new Promise((resolve) => {
        const existing = document.getElementById('steal-lock-modal');
        if (existing) existing.remove();
        const overlay = document.createElement('div');
        overlay.id = 'steal-lock-modal';
        overlay.className = 'save-conflict-overlay';
        overlay.innerHTML =
          '<div class="save-conflict-card" role="dialog" aria-modal="true">' +
          '<div class="save-conflict-title">Loyiha boshqa kompyuterda ochiq</div>' +
          '<p class="save-conflict-text">"' + String(projectName || 'Project').replace(/[<>]/g, '') +
          '" hozir boshqa joyda ochiq. Yopib, shu kompyuterda ochasizmi? ' +
          'U yerda saqlanmagan o\'zgarishlar yo\'qolishi mumkin.</p>' +
          '<div class="save-conflict-actions">' +
          '<button type="button" class="save-conflict-btn danger" data-act="steal">Yopib ochish</button>' +
          '<button type="button" class="save-conflict-btn ghost" data-act="cancel">Bekor</button>' +
          '</div></div>';
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => {
          const btn = e.target.closest('[data-act]');
          if (!btn) return;
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          resolve(btn.getAttribute('data-act') === 'steal');
        });
      });
    }

    function evictEditorStolen() {
      if (!state.projectId) return;
      const pid = state.projectId;
      state.saveForceOverwrite = false;
      state.projectId = null;
      stopProjectWatch();
      if (typeof pauseAll === 'function') pauseAll();
      showToast('Boshqa kompyuter bu loyihani ochib yubordi', 4000);
      resetEditorState();
      setHashForProject(null);
      editorScreen.style.display = 'none';
      uploadScreen.style.display = 'flex';
      renderDashboard();
      void pid;
    }

    async function openProject(id, opts) {
      if (opening) return;
      opening = true;
      loading.classList.add('show');
      let lockTaken = false;
      let lockedByOther = false;
      try {
        if (typeof dbAcquireProjectLock === 'function') {
          await dbAcquireProjectLock(id, { steal: !!(opts && opts.steal) });
          lockTaken = true;
        }
        const [meta, recs] = await Promise.all([dbGetProject(id), dbGetFiles(id)]);

        // Fayllar: bitta manba = bitta File + bitta URL (split qilingan clip'lar ulashadi)
        const clipFileIds = new Set((meta?.clips || []).map(c => c.fileId));
        const sources = new Map();
        for (const r of recs) {
          const file = new File([r.blob], r.name, { type: r.type });
          rememberFileId(file, r.id);
          sources.set(r.id, { file, url: clipFileIds.has(r.id) ? (typeof trackObjectUrl==="function"?trackObjectUrl(URL.createObjectURL(file)):URL.createObjectURL(file)) : null });
        }
        const clips = (meta?.clips || []).filter(c => sources.get(c.fileId)?.url).map((c) => {
          const s = sources.get(c.fileId);
          return {
            id: c.id, name: c.name, startTime: c.startTime, trimStart: c.trimStart, trimEnd: c.trimEnd,
            offsetY: c.offsetY || 0, track: c.track != null ? c.track : 0, duration: c.duration, isImage: !!c.isImage,
            url: s.url, file: s.file, filmstrip: null,
            volume: c.volume != null ? c.volume : 1,
            muted: !!c.muted,
            speed: (c.speed && c.speed > 0) ? c.speed : 1,
            fadeIn: c.fadeIn || 0,
            fadeOut: c.fadeOut || 0,
            transitionType: c.transitionType || 'none',
            transitionDuration: c.transitionDuration != null ? c.transitionDuration : 0.3,
            floated: !!c.floated,
          };
        });
        if (!meta || !clips.length) {
          sources.forEach(s => s.url && URL.revokeObjectURL(s.url));
          showToast('Project fayllari topilmadi');
          setHashForProject(null);
          renderDashboard();
          return;
        }

        setHashForProject(id);
        resetEditorState();
        state.isRestoring = true;
        state.projectId = meta.id;
        state.projectName = meta.name;
        state.projectCreatedAt = meta.createdAt;
        state.projectThumb = meta.thumb || null;
        state.projectUpdatedAt = meta.updatedAt != null ? meta.updatedAt : null;
        state.saveForceOverwrite = false;
        state.savedFileIds = new Set(recs.map(r => r.id));
        state.videoClips = clips;
        if (typeof invalidateClipOrder === 'function') invalidateClipOrder();
        state.textClips = Array.isArray(meta.textClips) ? meta.textClips.map(tc => ({ ...tc })) : [];
        state.canvasRatio = (typeof canvasValidId === 'function') ? canvasValidId(meta.canvas) : 'fit';
        // Eski saqlangan overlap'larni tuzatish
        if (typeof normalizeVideoOverlaps === 'function') normalizeVideoOverlaps();
        if (typeof invalidateClipOrder === 'function') invalidateClipOrder();
        state.pixelsPerSecond = meta.pps || ZOOM_DEFAULT;
        state.currentTime = Math.max(0, meta.currentTime || 0);
        updateZoomLabel();

        const earliest = [...state.videoClips].sort((a, b) => a.startTime - b.startTime)[0];
        const startClip = findClipAtTime(state.currentTime) || earliest;
        selectOnly(startClip.id);
        await ensurePreviewForClip(startClip);
        if (typeof seekPreviewToTime === 'function') {
          await seekPreviewToTime(state.currentTime);
        } else if (!startClip.isImage && findClipAtTime(state.currentTime)) {
          previewVideo.currentTime = timelineToSource(startClip, state.currentTime);
        }

        switchToEditor(true);
        if (typeof applyCanvas === 'function') applyCanvas();

        if (meta.music && sources.has(meta.music.fileId)) {
          const m = meta.music;
          await loadMusicFromFile(sources.get(m.fileId).file, {
            startTime: m.startTime, offsetY: m.offsetY || 0, trimStart: m.trimStart, trimEnd: m.trimEnd,
            volume: m.volume != null ? m.volume : 1,
            muted: !!m.muted,
            fadeIn: m.fadeIn || 0,
            fadeOut: m.fadeOut || 0,
          });
        }
        state.isRestoring = false;
        updateTimeDisplay();
        startProjectWatch();
        restoreFilmstrips(meta.id); // fonda — editor darrov ochiladi, kadrlar keyin to'ladi
      } catch (err) {
        console.error(err);
        state.isRestoring = false;
        if (lockTaken && typeof dbReleaseProjectLock === 'function') {
          await dbReleaseProjectLock(id);
        }
        if (typeof isProjectLockedError === 'function' && isProjectLockedError(err)) {
          lockedByOther = true;
        } else {
          setHashForProject(null);
          showToast('Project ochilmadi: ' + (err.message || 'xato'));
          if (editorScreen.style.display !== 'flex') renderDashboard();
        }
      } finally {
        loading.classList.remove('show');
        opening = false;
      }
      if (lockedByOther && !(opts && opts.steal)) {
        const ok = await askStealLock('Project');
        if (ok) {
          await openProject(id, { steal: true });
          return;
        }
        setHashForProject(null);
        if (editorScreen.style.display !== 'flex') renderDashboard();
      }
    }

    // Filmstrip har bir manba uchun BIR marta chiziladi, split qilingan clip'lar ulashadi
    async function restoreFilmstrips(pid) {
      const groups = new Map();
      for (const c of state.videoClips) {
        if (!groups.has(c.file)) groups.set(c.file, []);
        groups.get(c.file).push(c);
      }
      for (const clips of groups.values()) {
        if (state.projectId !== pid) return; // orada project yopilgan
        const lead = clips[0];
        if (lead.isImage) {
          const img = await loadImageEl(lead.url);
          if (img) lead.filmstrip = buildImageFilmstrip(img, lead.duration || 5);
        } else {
          await generateVideoFilmstripForClip(lead);
        }
        if (state.projectId !== pid) return;
        for (const c of clips) c.filmstrip = lead.filmstrip;
        renderVideoBlock();
      }
    }

    async function closeProject() {
      if (state.isExporting) return;
      const pid = state.projectId;
      pauseAll();
      hideClipContextMenu();
      await flushSave();
      if (pid && typeof dbReleaseProjectLock === 'function') {
        await dbReleaseProjectLock(pid);
      }
      resetEditorState();
      setHashForProject(null);
      editorScreen.style.display = 'none';
      uploadScreen.style.display = 'flex';
      renderDashboard();
    }

    backBtn.addEventListener('click', closeProject);

    // Brauzer xotirani "vaqtincha" deb o'chirib yubormasligi uchun
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

    // Sahifa `#p/<id>` havolasi bilan ochilgan bo'lsa (shu project'ning shaxsiy URL'i),
    // dashboard o'rniga to'g'ridan-to'g'ri o'sha project'ni ochamiz.
    const initialProjectId = hashProjectId();
    if (initialProjectId) {
      openProject(initialProjectId);
    } else {
      renderDashboard();
    }


    // Dashboard empty CTA + sort
    document.getElementById('empty-new-btn')?.addEventListener('click', () => {
      document.getElementById('upload-btn')?.click();
    });
    document.getElementById('project-sort')?.addEventListener('change', () => {
      renderDashboard();
    });
