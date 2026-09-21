// ===================== VOICE-OVER RECORDING =====================
(function () {
  'use strict';

  var mediaRecorder = null;
  var mediaStream = null;
  var chunks = [];
  var recording = false;
  var countdownTimer = null;
  var maxMs = 30 * 60 * 1000;
  var startTs = 0;
  var latencyOffsetMs = 0;

  try {
    latencyOffsetMs = parseInt(localStorage.getItem('emr-vo-latency-ms') || '0', 10) || 0;
  } catch (_) {}

  function ensureVoButton() {
    if (document.getElementById('vo-btn')) return;
    var musicBtn = document.getElementById('music-btn');
    if (!musicBtn || !musicBtn.parentNode) return;
    var btn = document.createElement('button');
    btn.className = 'tool-btn';
    btn.id = 'vo-btn';
    btn.title = 'Ovoz yozish';
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="6" fill="currentColor"/></svg>';
    musicBtn.parentNode.appendChild(btn);
    btn.addEventListener('click', function () {
      if (recording) stopRecording(true);
      else startCountdown();
    });
  }

  function pickMime() {
    var candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
    ];
    for (var i = 0; i < candidates.length; i++) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(candidates[i])) {
        return candidates[i];
      }
    }
    return '';
  }

  function startCountdown() {
    if (recording) return;
    var n = 3;
    if (typeof showToast === 'function') showToast('Yozish: ' + n + '...');
    countdownTimer = setInterval(function () {
      n--;
      if (n <= 0) {
        clearInterval(countdownTimer);
        countdownTimer = null;
        beginRecording();
      } else if (typeof showToast === 'function') {
        showToast('Yozish: ' + n + '...');
      }
    }, 1000);
  }

  async function beginRecording() {
    try {
      if (typeof EMRAudioEngine !== 'undefined') {
        await EMRAudioEngine.resumeAudioContext();
      }
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        },
      });
      chunks = [];
      var mime = pickMime();
      var opts = mime ? { mimeType: mime } : undefined;
      mediaRecorder = new MediaRecorder(mediaStream, opts);
      mediaRecorder.ondataavailable = function (e) {
        if (e.data && e.data.size) chunks.push(e.data);
      };
      mediaRecorder.onstop = onStop;
      mediaRecorder.start(1000);
      recording = true;
      startTs = Date.now();
      var btn = document.getElementById('vo-btn');
      if (btn) btn.classList.add('recording');
      if (typeof showToast === 'function') {
        showToast('Yozilmoqda... (naushnik tavsiya). To\'xtatish: tugma yoki Space');
      }
      // Optional: start preview muted-ish
      if (!state.isPlaying && typeof togglePlay === 'function') {
        try { togglePlay(); } catch (_) {}
      }
      setTimeout(function () {
        if (recording) {
          if (typeof showToast === 'function') showToast('Maksimal 30 daqiqa — to\'xtatiladi');
          stopRecording(true);
        }
      }, maxMs);
    } catch (err) {
      console.error(err);
      var msg = 'Mikrofon ochilmadi';
      if (err && err.name === 'NotAllowedError') {
        msg = 'Mikrofon ruxsati rad etildi. Brauzer sozlamalaridan ruxsat bering.';
      } else if (err && err.name === 'NotFoundError') {
        msg = 'Mikrofon topilmadi.';
      } else if (err && err.name === 'NotReadableError') {
        msg = 'Mikrofon boshqa ilova tomonidan band.';
      } else if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
        msg = 'Mikrofon faqat HTTPS yoki localhost da ishlaydi.';
      }
      if (typeof showToast === 'function') showToast(msg);
      cleanupStream();
    }
  }

  function stopRecording(save) {
    if (!recording || !mediaRecorder) return;
    recording = false;
    try {
      if (mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    } catch (_) {}
    var btn = document.getElementById('vo-btn');
    if (btn) btn.classList.remove('recording');
    if (state.isPlaying && typeof pauseAll === 'function') pauseAll();
  }

  async function onStop() {
    cleanupStream();
    if (!chunks.length) return;
    var mime = (mediaRecorder && mediaRecorder.mimeType) || 'audio/webm';
    var blob = new Blob(chunks, { type: mime });
    chunks = [];
    var ext = mime.indexOf('mp4') >= 0 ? 'm4a' : (mime.indexOf('ogg') >= 0 ? 'ogg' : 'webm');
    var file = new File([blob], 'voice-' + Date.now() + '.' + ext, { type: mime });
    var offsetSec = latencyOffsetMs / 1000;
    var startTime = Math.max(0, (state.currentTime || 0) + offsetSec);
    // Actually recording started at playhead then; place at start of recording
    // We don't track exact playhead at start easily — use current - duration approx after decode
    try {
      if (typeof loadAudioClipFromFile === 'function') {
        if (typeof pushHistory === 'function') pushHistory();
        var clip = await loadAudioClipFromFile(file, {
          kind: 'voice',
          startTime: Math.max(0, startTime - 0.01),
          track: 2,
        });
        // Apply latency offset to startTime
        if (clip && latencyOffsetMs) {
          clip.startTime = Math.max(0, clip.startTime + offsetSec);
          if (typeof renderAllAudioBlocks === 'function') renderAllAudioBlocks();
        }
        if (typeof showToast === 'function') showToast('Ovoz yozuvi qo\'shildi');
        if (typeof scheduleSave === 'function') scheduleSave();
      }
    } catch (e) {
      console.error(e);
      if (typeof showToast === 'function') showToast('Yozuvni saqlab bo\'lmadi');
    }
  }

  function cleanupStream() {
    if (mediaStream) {
      mediaStream.getTracks().forEach(function (tr) {
        try { tr.stop(); } catch (_) {}
      });
      mediaStream = null;
    }
    mediaRecorder = null;
  }

  // Visibility: stop and save
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && recording) stopRecording(true);
  });

  // Space stops recording if active
  document.addEventListener('keydown', function (e) {
    if (recording && (e.code === 'Space' || e.key === ' ')) {
      e.preventDefault();
      stopRecording(true);
    }
  }, true);

  // Latency setting via long-press on VO button — simple prompt
  function setupLatencyUi() {
    var btn = document.getElementById('vo-btn');
    if (!btn) return;
    btn.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      var v = prompt('Yozuvni siljitish (ms), -500..500. Bluetooth kechikishi uchun.', String(latencyOffsetMs));
      if (v == null) return;
      var n = parseInt(v, 10);
      if (!isFinite(n)) return;
      n = Math.max(-500, Math.min(500, n));
      latencyOffsetMs = n;
      try { localStorage.setItem('emr-vo-latency-ms', String(n)); } catch (_) {}
      if (typeof showToast === 'function') showToast('Latency: ' + n + ' ms');
    });
  }

  function init() {
    ensureVoButton();
    setupLatencyUi();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.EMRVoiceOver = {
    startCountdown: startCountdown,
    stopRecording: stopRecording,
    isRecording: function () { return recording; },
  };
})();
