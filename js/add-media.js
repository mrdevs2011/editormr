    // ===================== ADD MEDIA (+) =====================
    const addMediaBtn = document.getElementById('add-media-btn');
    const addMediaInput = document.getElementById('add-media-input');
    addMediaBtn.addEventListener('click', () => addMediaInput.click());
    addMediaInput.addEventListener('change', async () => {
      const files = [...addMediaInput.files];
      addMediaInput.value = '';
      for (const f of files) {
        await addMediaToTimeline(f);
      }
    });

    const floatBtn = document.getElementById('float-btn');
    if (floatBtn) {
      floatBtn.addEventListener('click', () => {
        const clip = getSelectedClip() || findClipAtTime(state.currentTime);
        if (clip) toggleFloatClip(clip);
        else showToast('Float uchun clip tanlang');
      });
    }

    const splitBtn = document.getElementById('split-btn');
    if (splitBtn) {
      splitBtn.addEventListener('click', () => {
        const id = state.selectedClipId || findClipAtTime(state.currentTime)?.id;
        if (id) {
          focusClip(id);
          splitClipAtPlayhead(id);
        } else {
          showToast('Clip tanlang yoki playhead ni clip ustiga qo\'ying');
        }
      });
    }

    document.getElementById('zoom-in')?.addEventListener('click', () => zoomTimeline(1.25));
    document.getElementById('zoom-out')?.addEventListener('click', () => zoomTimeline(0.8));

    // Editor da drag-drop
    editorScreen.addEventListener('dragover', (e) => {
      e.preventDefault();
    });
    editorScreen.addEventListener('drop', async (e) => {
      e.preventDefault();
      const files = [...(e.dataTransfer?.files || [])];
      for (const f of files) {
        if (f.type.startsWith('video/') || f.type.startsWith('image/')) {
          if (state.videoClips.length) await addMediaToTimeline(f);
          else handleFile(f);
        }
      }
    });

