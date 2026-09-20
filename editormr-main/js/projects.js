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
      urls.forEach(u => u && URL.revokeObjectURL(u));

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
      state.textClips = [];
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
        const url = URL.createObjectURL(file);
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
        console.warn('Save failed', err);
        showToast('Saqlab bo\'lmadi — internetni tekshir yoki qayta kirib ko\'r', 4000);
      });
      return saveChain;
    }

    async function saveProjectNow() {
      if (!state.projectId || !state.videoClips.length) return;
      const pid = state.projectId;

      // --- Snapshot (sinxron): await dan oldin, state o'zgarib ketmasin ---
      const used = new Map(); // fileId -> File
      const clips = state.videoClips.map((c) => {
        const fid = fileIdOf(c.file);
        used.set(fid, c.file);
        return {
          id: c.id, fileId: fid, name: c.name,
          startTime: c.startTime, trimStart: c.trimStart, trimEnd: c.trimEnd,
          offsetY: c.offsetY || 0, duration: c.duration, isImage: !!c.isImage,
          volume: c.volume != null ? c.volume : 1,
          muted: !!c.muted,
          speed: (c.speed && c.speed > 0) ? c.speed : 1,
          fadeIn: c.fadeIn || 0,
          fadeOut: c.fadeOut || 0,
          transitionType: c.transitionType || 'none',
          transitionDuration: c.transitionDuration != null ? c.transitionDuration : 0.3,
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
        currentTime: state.currentTime,
        pps: state.pixelsPerSecond,
      };

      await dbSaveProject(meta, newFiles, removed);

      if (state.projectId === pid) {
        newFiles.forEach(f => state.savedFileIds.add(f.id));
        removed.forEach(id => state.savedFileIds.delete(id));
      }
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
      card.className = 'project-card';
      card.title = p.name;

      const thumb = document.createElement('div');
      thumb.className = 'project-thumb';
      if (p.thumb) {
        const img = document.createElement('img');
        img.src = p.thumb;
        img.alt = '';
        thumb.appendChild(img);
      } else {
        thumb.textContent = 'no preview';
      }
      const dur = document.createElement('span');
      dur.className = 'project-dur';
      dur.textContent = formatTime(p.duration);
      thumb.appendChild(dur);
      card.appendChild(thumb);

      const actions = document.createElement('div');
      actions.className = 'project-actions';
      const renameBtn = document.createElement('button');
      renameBtn.textContent = '\u270E';
      renameBtn.title = 'Rename';
      renameBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const name = prompt('Project name', p.name);
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
      delBtn.textContent = '\u00D7';
      delBtn.title = 'Delete';
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('Delete "' + p.name + '"? This can\'t be undone.')) return;
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
      meta.textContent = p.clipCount + (p.clipCount === 1 ? ' clip' : ' clips') + ' \u00B7 ' + timeAgo(p.updatedAt);
      info.append(name, meta);
      card.appendChild(info);

      card.addEventListener('click', () => openProject(p.id));
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
      list.sort((a, b) => b.updatedAt - a.updatedAt);
      projectGrid.innerHTML = '';
      for (const p of list) projectGrid.appendChild(buildProjectCard(p));
      dashEmpty.style.display = list.length ? 'none' : 'block';
      dashEmpty.textContent = failed
        ? 'Saving is not available in this browser — projects will not survive a refresh.'
        : 'No projects yet. Upload a video or photo to start one.';
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

    async function openProject(id) {
      if (opening) return;
      opening = true;
      loading.classList.add('show');
      try {
        const [meta, recs] = await Promise.all([dbGetProject(id), dbGetFiles(id)]);

        // Fayllar: bitta manba = bitta File + bitta URL (split qilingan clip'lar ulashadi)
        const clipFileIds = new Set((meta?.clips || []).map(c => c.fileId));
        const sources = new Map();
        for (const r of recs) {
          const file = new File([r.blob], r.name, { type: r.type });
          rememberFileId(file, r.id);
          sources.set(r.id, { file, url: clipFileIds.has(r.id) ? URL.createObjectURL(file) : null });
        }
        const clips = (meta?.clips || []).filter(c => sources.get(c.fileId)?.url).map((c) => {
          const s = sources.get(c.fileId);
          return {
            id: c.id, name: c.name, startTime: c.startTime, trimStart: c.trimStart, trimEnd: c.trimEnd,
            offsetY: c.offsetY || 0, duration: c.duration, isImage: !!c.isImage,
            url: s.url, file: s.file, filmstrip: null,
            volume: c.volume != null ? c.volume : 1,
            muted: !!c.muted,
            speed: (c.speed && c.speed > 0) ? c.speed : 1,
            fadeIn: c.fadeIn || 0,
            fadeOut: c.fadeOut || 0,
            transitionType: c.transitionType || 'none',
            transitionDuration: c.transitionDuration != null ? c.transitionDuration : 0.3,
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
        state.savedFileIds = new Set(recs.map(r => r.id));
        state.videoClips = clips;
        state.textClips = Array.isArray(meta.textClips) ? meta.textClips.map(tc => ({ ...tc })) : [];
        state.pixelsPerSecond = meta.pps || ZOOM_DEFAULT;
        state.currentTime = Math.max(0, meta.currentTime || 0);
        updateZoomLabel();

        const earliest = [...clips].sort((a, b) => a.startTime - b.startTime)[0];
        const startClip = findClipAtTime(state.currentTime) || earliest;
        selectOnly(startClip.id);
        await ensurePreviewForClip(startClip);
        if (!startClip.isImage && findClipAtTime(state.currentTime)) {
          previewVideo.currentTime = timelineToSource(startClip, state.currentTime);
        }

        switchToEditor(true);

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
        restoreFilmstrips(meta.id); // fonda — editor darrov ochiladi, kadrlar keyin to'ladi
      } catch (err) {
        console.error(err);
        state.isRestoring = false;
        setHashForProject(null);
        showToast('Project ochilmadi: ' + (err.message || 'xato'));
        if (editorScreen.style.display !== 'flex') renderDashboard();
      } finally {
        loading.classList.remove('show');
        opening = false;
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
      pauseAll();
      hideClipContextMenu();
      await flushSave();
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
