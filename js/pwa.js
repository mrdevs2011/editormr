    (function () {
      var S = (typeof EMR_STRINGS !== 'undefined') ? EMR_STRINGS : {};
      var deferredPrompt = null;
      function standaloneNow() {
        try {
          if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
          if (navigator.standalone) return true;
        } catch (_) {}
        return false;
      }
      function showBanner(id, html) {
        var el = document.getElementById(id);
        if (el) { el.hidden = false; return el; }
        el = document.createElement('div');
        el.id = id; el.className = 'pwa-banner'; el.innerHTML = html;
        document.body.appendChild(el);
        return el;
      }
      function hideBanner(id) { var el = document.getElementById(id); if (el) el.hidden = true; }
      function registerSw() {
        if (!('serviceWorker' in navigator)) return;
        if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
        navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(function (reg) {
          if (reg.waiting) offerReload();
          reg.addEventListener('updatefound', function () {
            var w = reg.installing; if (!w) return;
            w.addEventListener('statechange', function () {
              if (w.state === 'installed' && navigator.serviceWorker.controller) offerReload();
            });
          });
        }).catch(function (err) { console.warn('[pwa] sw', err); });
      }
      function offerReload() {
        var b = showBanner('pwa-update',
          '<span>' + (S.PWA_UPDATE || 'Yangi versiya bor, sahifani qayta yuklang') + '</span>' +
          '<button type="button" class="pwa-banner-btn" id="pwa-reload">' + (S.PWA_RELOAD || 'Yangilash') + '</button>');
        var btn = b.querySelector('#pwa-reload');
        if (btn) btn.onclick = function () {
          if (navigator.serviceWorker.getRegistration) {
            navigator.serviceWorker.getRegistration().then(function (reg) {
              if (reg && reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
              location.reload();
            }).catch(function () { location.reload(); });
          } else location.reload();
        };
      }
      function wireOffline() {
        function sync() {
          var online = navigator.onLine !== false;
          document.documentElement.classList.toggle('is-offline', !online);
          if (online) hideBanner('pwa-offline');
          else showBanner('pwa-offline', '<span>' + (S.PWA_OFFLINE || 'Internet yo\'q — saqlash uchun internet kerak') + '</span>');
        }
        window.addEventListener('online', function () { sync(); if (typeof scheduleSave === 'function') scheduleSave(); });
        window.addEventListener('offline', sync);
        sync();
      }
      function createdCount() { try { return Number(localStorage.getItem('emr.projectsCreated') || '0'); } catch (_) { return 0; } }
      function dismissed() { try { return localStorage.getItem('emr.installDismissed') === '1'; } catch (_) { return false; } }
      function maybeShowInstall() {
        if (!PwaCore.shouldOfferInstall({ standalone: standaloneNow(), dismissed: dismissed(), projectCount: createdCount() })) return;
        if (!deferredPrompt) return;
        var b = showBanner('pwa-install',
          '<span>' + (S.PWA_INSTALL || 'Ilovani bosh ekranga qo\'shing') + '</span>' +
          '<button type="button" class="pwa-banner-btn" id="pwa-install-go">' + (S.PWA_INSTALL_BTN || 'O\'rnatish') + '</button>' +
          '<button type="button" class="pwa-banner-btn ghost" id="pwa-install-no">Yo\'q</button>');
        b.querySelector('#pwa-install-go').onclick = function () { deferredPrompt.prompt(); deferredPrompt = null; hideBanner('pwa-install'); };
        b.querySelector('#pwa-install-no').onclick = function () { try { localStorage.setItem('emr.installDismissed', '1'); } catch (_) {} hideBanner('pwa-install'); };
      }
      function maybeShowIosHint() {
        if (!PwaCore.shouldOfferInstall({ standalone: standaloneNow(), dismissed: dismissed(), projectCount: createdCount() })) return;
        if (!PwaCore.isIosSafari(navigator.userAgent, standaloneNow(), navigator.maxTouchPoints || 0)) return;
        var b = showBanner('pwa-ios',
          '<span>' + (S.PWA_IOS_HINT || 'Ulashish tugmasi → Bosh ekranga qo\'shish') + '</span>' +
          '<button type="button" class="pwa-banner-btn ghost" id="pwa-ios-ok">OK</button>');
        b.querySelector('#pwa-ios-ok').onclick = function () { try { localStorage.setItem('emr.installDismissed', '1'); } catch (_) {} hideBanner('pwa-ios'); };
      }
      window.pwaNoteProjectCreated = function () {
        try { localStorage.setItem('emr.projectsCreated', String(createdCount() + 1)); } catch (_) {}
        maybeShowInstall(); maybeShowIosHint();
      };
      window.pwaShareExport = async function (blob, name) {
        if (!blob) return false;
        var mime = blob.type || 'video/webm';
        var fileName = name || 'export.webm';
        var file = new File([blob], fileName, { type: mime });
        if (!PwaCore.canShareFile(mime, blob.size, navigator).ok) return false;
        try { await navigator.share({ files: [file], title: fileName, text: fileName }); return true; }
        catch (e) { if (e && e.name === 'AbortError') return false; console.warn('[pwa] share', e); return false; }
      };
      window.pwaCanShareExport = function (blob) {
        return !!(blob && PwaCore.canShareFile(blob.type || 'video/webm', blob.size, navigator).ok);
      };
      window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredPrompt = e; maybeShowInstall(); });
      function boot() { registerSw(); wireOffline(); maybeShowIosHint(); }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
      else boot();
    })();
