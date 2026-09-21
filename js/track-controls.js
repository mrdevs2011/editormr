    // ===================== QATOR MUTE / HIDE / LOCK (Faza 3D) =====================

    function getTrackState(trackIndex) {
      const ts = state.trackState || {};
      const t = ts[trackIndex] || ts[String(trackIndex)] || {};
      return {
        muted: !!t.muted,
        hidden: !!t.hidden,
        locked: !!t.locked,
      };
    }

    function setTrackState(trackIndex, patch) {
      if (!state.trackState) state.trackState = {};
      const cur = getTrackState(trackIndex);
      state.trackState[trackIndex] = { ...cur, ...patch };
      if (typeof scheduleSave === 'function') scheduleSave();
      if (typeof renderVideoBlock === 'function') renderVideoBlock();
      if (typeof updateTrackControlUi === 'function') updateTrackControlUi();
    }

    function isTrackLocked(trackIndex) {
      return getTrackState(trackIndex).locked;
    }

    function isTrackHidden(trackIndex) {
      return getTrackState(trackIndex).hidden;
    }

    function isTrackMuted(trackIndex) {
      return getTrackState(trackIndex).muted;
    }

    // Drag/trim/delete oldidan tekshiruv
    function guardLockedTrack(clip) {
      if (!clip) return false;
      const tr = typeof clipTrackIndex === 'function' ? clipTrackIndex(clip) : (clip.track || 0);
      if (isTrackLocked(tr)) {
        if (typeof showToast === 'function') {
          showToast(typeof S === 'function' ? S('track.lockedToast') : 'Qator qulflangan');
        }
        return true;
      }
      return false;
    }

    function updateTrackControlUi() {
      // video track label yoniga tugmalar
      const track = document.getElementById('video-track');
      if (!track) return;
      let bar = document.getElementById('track-controls-bar');
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'track-controls-bar';
        bar.style.cssText = 'display:flex;gap:4px;padding:2px 6px;align-items:center;';
        const header = track.querySelector('.track-label') || track;
        header.appendChild(bar);
      }
      // Asosiy qator (0) uchun
      const st = getTrackState(0);
      bar.innerHTML =
        '<button type="button" class="trk-btn' + (st.muted ? ' is-on' : '') + '" data-act="mute" title="Ovozsiz">M</button>' +
        '<button type="button" class="trk-btn' + (st.hidden ? ' is-on' : '') + '" data-act="hide" title="Yashirish">H</button>' +
        '<button type="button" class="trk-btn' + (st.locked ? ' is-on' : '') + '" data-act="lock" title="Qulflash">L</button>';
      bar.querySelectorAll('.trk-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const act = btn.getAttribute('data-act');
          const cur = getTrackState(0);
          if (act === 'mute') setTrackState(0, { muted: !cur.muted });
          if (act === 'hide') setTrackState(0, { hidden: !cur.hidden });
          if (act === 'lock') setTrackState(0, { locked: !cur.locked });
        });
      });
    }

    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(updateTrackControlUi, 500);
      });
    }
