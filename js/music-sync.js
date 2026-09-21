// ===================== AUDIO SYNC (preview) =====================
// Barcha audioClips EMRAudioEngine orqali; state.music faqat moslik uchun.

function startMusicIfNeeded() {
  if (typeof EMRAudioEngine !== 'undefined') {
    EMRAudioEngine.startEngine();
    EMRAudioEngine.seekEngine(state.currentTime || 0);
    return;
  }
  // Fallback eski yo'l
  if (!state.music || !state.music.audio) return;
  var m = state.music;
  var t = state.currentTime;
  var visible = m.trimEnd - m.trimStart;
  if (t >= m.startTime && t < m.startTime + visible) {
    if (typeof applyMusicVolume === 'function') applyMusicVolume();
    m.audio.currentTime = t - m.startTime + m.trimStart;
    m.audio.play().catch(function () {});
    musicWasInRange = true;
  }
}

function syncMusicPlaybackSmooth() {
  if (typeof EMRAudioEngine !== 'undefined') {
    EMRAudioEngine.syncEngineTick();
    return;
  }
  if (!state.music || !state.music.audio || !state.isPlaying) return;
  var m = state.music;
  var t = state.currentTime;
  var visible = m.trimEnd - m.trimStart;
  var end = m.startTime + visible;
  var inMusic = t >= m.startTime && t < end;
  if (inMusic) {
    if (typeof applyMusicVolume === 'function') applyMusicVolume();
    if (!musicWasInRange) {
      m.audio.currentTime = t - m.startTime + m.trimStart;
      m.audio.play().catch(function () {});
      musicWasInRange = true;
    } else if (m.audio.paused) {
      m.audio.play().catch(function () {});
    }
  } else {
    if (musicWasInRange) {
      m.audio.pause();
      musicWasInRange = false;
    }
  }
}
