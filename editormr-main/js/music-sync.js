    // ===================== MUSIC SYNC =====================
    function startMusicIfNeeded() {
      if (!state.music?.audio) return;
      const m = state.music;
      const t = state.currentTime;
      const visible = m.trimEnd - m.trimStart;
      if (t >= m.startTime && t < m.startTime + visible) {
        applyMusicVolume();
        m.audio.currentTime = t - m.startTime + m.trimStart;
        m.audio.play().catch(() => {});
        musicWasInRange = true;
      }
    }

    // Musiqa: faqat oralig'ga kirganda/chiqganda boshqariladi — har frameda seek yo'q
    function syncMusicPlaybackSmooth() {
      if (!state.music?.audio || !state.isPlaying) return;
      const m = state.music;
      const t = state.currentTime;
      const visible = m.trimEnd - m.trimStart;
      const end = m.startTime + visible;
      const inMusic = t >= m.startTime && t < end;

      if (inMusic) {
        applyMusicVolume();
        if (!musicWasInRange) {
          m.audio.currentTime = t - m.startTime + m.trimStart;
          m.audio.play().catch(() => {});
          musicWasInRange = true;
        } else if (m.audio.paused) {
          m.audio.play().catch(() => {});
        }
      } else {
        if (musicWasInRange) {
          m.audio.pause();
          musicWasInRange = false;
        }
      }
    }
