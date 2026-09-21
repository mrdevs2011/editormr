/**
 * Faza 9B: birinchi marta ochganda 3 qadamli onboarding.
 * localStorage 'emr.onboarding_seen' = '1'
 */
(function (global) {
  'use strict';

  var LS_KEY = 'emr.onboarding_seen';

  function shouldShowOnboarding(flags) {
    flags = flags || {};
    if (flags.force) return true;
    if (flags.seen === true) return false;
    if (flags.seen === false) return true;
    try {
      return global.localStorage.getItem(LS_KEY) !== '1';
    } catch (_) {
      return true;
    }
  }

  function markOnboardingSeen() {
    try { global.localStorage.setItem(LS_KEY, '1'); } catch (_) {}
  }

  function t(key) {
    if (typeof global.t === 'function') return global.t(key);
    return key;
  }

  var steps = [
    { titleKey: 'onboarding_step1_title', bodyKey: 'onboarding_step1_body' },
    { titleKey: 'onboarding_step2_title', bodyKey: 'onboarding_step2_body' },
    { titleKey: 'onboarding_step3_title', bodyKey: 'onboarding_step3_body' },
  ];

  var overlay = null;
  var stepIdx = 0;

  function close(skipped) {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
    markOnboardingSeen();
    try {
      if (global.track) {
        global.track(skipped ? 'onboarding_skipped' : 'onboarding_completed');
      }
    } catch (_) {}
  }

  function render() {
    if (!overlay) return;
    var s = steps[stepIdx];
    var title = overlay.querySelector('.ob-title');
    var body = overlay.querySelector('.ob-body');
    var dots = overlay.querySelectorAll('.ob-dot');
    var nextBtn = overlay.querySelector('.ob-next');
    if (title) title.textContent = t(s.titleKey);
    if (body) body.textContent = t(s.bodyKey);
    for (var i = 0; i < dots.length; i++) {
      dots[i].classList.toggle('is-on', i === stepIdx);
    }
    if (nextBtn) {
      nextBtn.textContent = stepIdx >= steps.length - 1 ? t('onboarding_done') : t('onboarding_next');
    }
  }

  function showOnboarding() {
    if (!shouldShowOnboarding()) return;
    if (overlay) return;

    overlay = document.createElement('div');
    overlay.className = 'ob-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML =
      '<div class="ob-panel">' +
        '<button type="button" class="ob-skip">' + t('onboarding_skip') + '</button>' +
        '<h2 class="ob-title"></h2>' +
        '<p class="ob-body"></p>' +
        '<div class="ob-dots" aria-hidden="true">' +
          '<span class="ob-dot"></span><span class="ob-dot"></span><span class="ob-dot"></span>' +
        '</div>' +
        '<button type="button" class="ob-next"></button>' +
      '</div>';
    document.body.appendChild(overlay);
    stepIdx = 0;
    render();

    overlay.querySelector('.ob-skip').addEventListener('click', function () { close(true); });
    overlay.querySelector('.ob-next').addEventListener('click', function () {
      if (stepIdx >= steps.length - 1) close(false);
      else { stepIdx++; render(); }
    });
  }

  function enhanceEmptyDashboard() {
    var dash = document.getElementById('dashboard-screen') || document.getElementById('upload-screen');
    if (!dash) return;
    // Bo'sh holat chaqiruvi — upload screen ichida
    var existing = document.getElementById('ob-empty-hint');
    if (existing) return;
    var hint = document.createElement('div');
    hint.id = 'ob-empty-hint';
    hint.className = 'ob-empty-hint';
    hint.innerHTML =
      '<strong>' + t('dashboard_empty_title') + '</strong>' +
      '<span>' + t('dashboard_empty_body') + '</span>';
    var target = dash.querySelector('.upload-zone, .upload-area, .drop-zone, #upload-screen .inner, #dashboard-screen') || dash;
    try { target.insertBefore(hint, target.firstChild); } catch (_) {
      try { target.appendChild(hint); } catch (_) {}
    }
  }

  global.EMR_onboarding = {
    shouldShowOnboarding: shouldShowOnboarding,
    showOnboarding: showOnboarding,
    markOnboardingSeen: markOnboardingSeen,
    enhanceEmptyDashboard: enhanceEmptyDashboard,
  };

  if (typeof document !== 'undefined') {
    function boot() {
      enhanceEmptyDashboard();
      // Login tugagach biroz kechiktirib ko'rsat
      setTimeout(function () {
        try { showOnboarding(); } catch (_) {}
      }, 600);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
