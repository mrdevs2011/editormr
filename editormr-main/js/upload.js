    // ===================== UPLOAD =====================
    // Eng yaqin kesik (split / clip cheti) nuqtasini topish
    function findNearestCutPoint(t) {
      const cuts = [0];
      for (const c of state.videoClips) {
        cuts.push(c.startTime);
        cuts.push(clipEnd(c));
      }
      // Unique + sort
      const uniq = [...new Set(cuts.map(x => Math.round(x * 1000) / 1000))].sort((a, b) => a - b);
      if (!uniq.length) return 0;
      let best = uniq[0];
      let bestDist = Math.abs(t - best);
      for (const c of uniq) {
        const d = Math.abs(t - c);
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      return Math.max(0, best);
    }

    // Birinchi yuklash (upload screen) — timeline ni tozalab qo'yadi
    function handleFile(file) {
      if (!file) return;
      const isVideo = file.type.startsWith('video/');
      const isImage = file.type.startsWith('image/');
      if (!isVideo && !isImage) {
        showToast('Please select a video or image file');
        return;
      }

      // Agar editorda allaqachon video bor bo'lsa — qo'shish rejimi
      if (editorScreen.style.display === 'flex' && state.videoClips.length > 0) {
        addMediaToTimeline(file);
        return;
      }

      // Yangi loyiha (projects.js: id, nom, thumbnail)
      resetEditorState();
      beginProject(file, isImage);
      state.videoFile = file;
      state.videoUrl = URL.createObjectURL(file);
      state.isImage = isImage;

      loadMediaAsMain(file, state.videoUrl, isImage);
    }

    function loadMediaAsMain(file, url, isImage) {
      if (isImage) {
        state.videoDuration = 5;
        const id = makeClipId();
        state.videoClips = [{
          id, startTime: 0, trimStart: 0, trimEnd: 5, offsetY: 0,
          url, file, duration: 5, isImage: true, filmstrip: null, name: file.name,
          volume: 1, muted: false, speed: 1, fadeIn: 0, fadeOut: 0, transitionType: 'none', transitionDuration: 0.3,
        }];
        selectOnly(id);
        const img = new Image();
        img.onload = () => {
          const fs = buildImageFilmstrip(img, 5);
          state.videoClips[0].filmstrip = fs;
          state.filmstrip = fs;
          setupImagePreview(img);
          switchToEditor();
          renderVideoBlock();
        };
        img.onerror = () => { switchToEditor(); };
        img.src = url;
      } else {
        previewVideo.style.display = 'block';
        const imgPreview = document.getElementById('image-preview');
        if (imgPreview) imgPreview.style.display = 'none';
        previewVideo.src = url;
        // Handler BIR MARTALIK: aks holda keyingi previewVideo.src o'zgarishida (+ tugma,
        // project ochish) qayta ishga tushib, barcha clip'larni 1 taga reset qilib yuborardi
        previewVideo.onloadedmetadata = async () => {
          previewVideo.onloadedmetadata = null;
          previewVideo.onerror = null;
          state.videoDuration = previewVideo.duration || 5;
          if (!isFinite(state.videoDuration) || state.videoDuration === 0) state.videoDuration = 5;
          const id = makeClipId();
          state.videoClips = [{
            id, startTime: 0, trimStart: 0, trimEnd: state.videoDuration, offsetY: 0,
            url, file, duration: state.videoDuration, isImage: false, filmstrip: null, name: file.name,
            volume: 1, muted: false, speed: 1, fadeIn: 0, fadeOut: 0, transitionType: 'none', transitionDuration: 0.3,
          }];
          selectOnly(id);
          switchToEditor();
          renderVideoBlock();
          generateVideoFilmstripForClip(state.videoClips[0]);
        };
        previewVideo.onerror = () => {
          previewVideo.onloadedmetadata = null;
          previewVideo.onerror = null;
          state.videoDuration = 5;
          const id = makeClipId();
          state.videoClips = [{
            id, startTime: 0, trimStart: 0, trimEnd: 5, offsetY: 0,
            url, file, duration: 5, isImage: false, filmstrip: null, name: file.name,
            volume: 1, muted: false, speed: 1, fadeIn: 0, fadeOut: 0, transitionType: 'none', transitionDuration: 0.3,
          }];
          selectOnly(id);
          switchToEditor();
        };
      }
    }

    // + / Ctrl+V / drag-drop — asosiy timeline ga qo'shish
    async function addMediaToTimeline(file) {
      if (!file) return;
      const isVideo = file.type.startsWith('video/');
      const isImage = file.type.startsWith('image/');
      if (!isVideo && !isImage) {
        showToast('Video yoki photo tanlang');
        return;
      }

      const url = URL.createObjectURL(file);
      const placeAt = findNearestCutPoint(state.currentTime);

      let duration = 5;
      if (isImage) {
        duration = 5;
      } else {
        duration = await getVideoDuration(url);
      }

      const id = makeClipId();
      const clip = {
        id,
        startTime: placeAt,
        trimStart: 0,
        trimEnd: duration,
        offsetY: 0,
        url,
        file,
        duration,
        isImage,
        filmstrip: null,
        name: file.name,
        volume: 1,
        muted: false,
        speed: 1,
        fadeIn: 0,
        fadeOut: 0,
        transitionType: 'none',
        transitionDuration: 0.3,
      };
      pushHistory();
      state.videoClips.push(clip);
      selectOnly(id);

      // Preview ni yangi clip ga o'tkazish
      await ensurePreviewForClip(clip);

      if (isImage) {
        const img = new Image();
        img.onload = () => {
          clip.filmstrip = buildImageFilmstrip(img, duration);
          renderVideoBlock();
          updateTimelineLayout();
        };
        img.src = url;
      } else {
        generateVideoFilmstripForClip(clip);
      }

      renderVideoBlock();
      updateTimelineLayout();
      updateBlackOverlay();
      scheduleSave();
      showToast('Media qo\'shildi (' + formatTime(placeAt) + ' dan)');
    }

    function getVideoDuration(url) {
      return new Promise((resolve) => {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.src = url;
        v.onloadedmetadata = () => {
          const d = v.duration;
          resolve(isFinite(d) && d > 0 ? d : 5);
        };
        v.onerror = () => resolve(5);
        setTimeout(() => resolve(5), 4000);
      });
    }

    async function ensurePreviewForClip(clip) {
      if (!clip) return;
      state.videoFile = clip.file;
      state.videoUrl = clip.url;
      state.videoDuration = clip.duration;
      state.isImage = !!clip.isImage;
      state.filmstrip = clip.filmstrip;

      if (clip.isImage) {
        const img = new Image();
        await new Promise((r) => { img.onload = r; img.onerror = r; img.src = clip.url; });
        setupImagePreview(img);
      } else {
        const imgPreview = document.getElementById('image-preview');
        if (imgPreview) imgPreview.style.display = 'none';
        previewVideo.style.display = 'block';
        if (previewVideo.src !== clip.url) {
          previewVideo.src = clip.url;
          await new Promise((r) => {
            previewVideo.onloadeddata = r;
            previewVideo.onerror = r;
            setTimeout(r, 3000);
          });
        }
        applyPreviewClipVolume(clip);
        applyPreviewClipSpeed(clip);
      }
    }

    function setupImagePreview(img) {
      // Create or reuse an <img> for still preview
      let imgEl = document.getElementById('image-preview');
      if (!imgEl) {
        imgEl = document.createElement('img');
        imgEl.id = 'image-preview';
        imgEl.style.cssText = 'display:block;max-width:100%;max-height:100%;width:auto;height:auto;background:#000;object-fit:contain;object-position:center;border-radius:6px;';
        previewVideo.parentNode.insertBefore(imgEl, previewVideo);
      }
      imgEl.src = img.src;
      imgEl.style.display = 'block';
      previewVideo.style.display = 'none';
    }

    function buildImageFilmstrip(img, duration) {
      const frameH = 36;
      const frameW = Math.round(frameH * (img.naturalWidth / img.naturalHeight)) || 64;
      const canvas = document.createElement('canvas');
      canvas.width = frameW;
      canvas.height = frameH;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, frameW, frameH);
      return {
        canvas,
        frameWidth: frameW,
        frameCount: 1,
        duration: duration || 5,
        isImage: true
      };
    }

    async function generateVideoFilmstripForClip(clip) {
      if (!clip || clip.isImage || !clip.url) return;
      const duration = clip.duration || 5;
      const targetFrames = Math.max(4, Math.min(40, Math.ceil(duration / 0.7)));
      const frameH = 36;
      let aspect = 16 / 9;
      const tempVideo = document.createElement('video');
      tempVideo.src = clip.url;
      tempVideo.muted = true;
      tempVideo.preload = 'auto';
      tempVideo.crossOrigin = 'anonymous';

      await new Promise((resolve) => {
        tempVideo.onloadeddata = resolve;
        tempVideo.onerror = resolve;
        setTimeout(resolve, 4000);
      });
      if (tempVideo.videoWidth && tempVideo.videoHeight) {
        aspect = tempVideo.videoWidth / tempVideo.videoHeight;
      }
      const frameW = Math.round(frameH * aspect) || 64;
      const stripCanvas = document.createElement('canvas');
      stripCanvas.width = frameW * targetFrames;
      stripCanvas.height = frameH;
      const ctx = stripCanvas.getContext('2d');

      for (let i = 0; i < targetFrames; i++) {
        const t = (i / Math.max(1, targetFrames - 1)) * Math.max(0.01, duration - 0.05);
        try {
          tempVideo.currentTime = t;
          await new Promise((resolve) => {
            const onSeeked = () => {
              tempVideo.removeEventListener('seeked', onSeeked);
              resolve();
            };
            tempVideo.addEventListener('seeked', onSeeked);
            setTimeout(resolve, 800);
          });
          ctx.drawImage(tempVideo, i * frameW, 0, frameW, frameH);
        } catch (e) {
          ctx.fillStyle = BRAND.blueDeep;
          ctx.fillRect(i * frameW, 0, frameW, frameH);
        }
      }
      tempVideo.src = '';
      tempVideo.load();

      clip.filmstrip = {
        canvas: stripCanvas,
        frameWidth: frameW,
        frameCount: targetFrames,
        duration,
        isImage: false
      };
      if (state.selectedClipId === clip.id) state.filmstrip = clip.filmstrip;
      if (editorScreen.style.display === 'flex') renderVideoBlock();
    }

    function switchToEditor(quiet) {
      uploadScreen.style.display = 'none';
      editorScreen.style.display = 'flex';
      renderVideoBlock();
      updateTimelineLayout();
      updatePlayhead();
      updateTimeDisplay();
      updateBlackOverlay();
      if (!quiet) {
        showToast('Video loaded — chetlaridan trim, o\'rtasidan suring');
        scheduleSave(); // yangi loyiha birinchi marta Projects ga tushadi
      }
    }

    // Drag & drop / click / paste — dashboard ning ixtiyoriy joyiga tashlash mumkin
    uploadScreen.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadScreen.classList.add('drag-over');
    });
    uploadScreen.addEventListener('dragleave', (e) => {
      if (!uploadScreen.contains(e.relatedTarget)) uploadScreen.classList.remove('drag-over');
    });
    uploadScreen.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadScreen.classList.remove('drag-over');
      handleFile(e.dataTransfer.files[0]);
    });
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      handleFile(fileInput.files[0]);
      fileInput.value = ''; // shu faylni qayta tanlash ham ishlasin
    });

    document.addEventListener('paste', async (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (!file) continue;
          if (file.type.startsWith('video/') || file.type.startsWith('image/')) {
            e.preventDefault();
            if (editorScreen.style.display === 'flex' && state.videoClips.length) {
              await addMediaToTimeline(file);
            } else {
              handleFile(file);
            }
            break;
          }
        }
      }
    });

