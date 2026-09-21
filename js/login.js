// ===================== LOGIN PAGE (Google + account-siz local) =====================
(function () {
  const $ = (id) => document.getElementById(id);
  const googleBtn = $('google-btn');
  const msg = $('msg');

  // ---- helpers ----
  function showMsg(text) {
    msg.textContent = text;
    msg.hidden = !text;
  }
  function setLoading(btn, on) {
    btn.classList.toggle('loading', on);
    btn.disabled = on;
  }
  function friendly(err) {
    const t = (err && err.message) || String(err);
    if (/rate limit|too many/i.test(t) || (err && err.status === 429)) return 'Juda ko‘p urinish. Bir daqiqa kuting.';
    if (/provider is not enabled|unsupported provider/i.test(t)) return 'Google orqali kirish hali yoqilmagan.';
    if (/failed to fetch|network/i.test(t)) return 'Tarmoq xatosi. Internetni tekshiring.';
    return t;
  }

  function goGuest() {
    if (typeof Auth.enterGuest === 'function') Auth.enterGuest();
    else {
      try { localStorage.setItem('emr-guest', '1'); } catch (_) {}
      try { sessionStorage.setItem('emr-dev-bypass', '1'); } catch (_) {}
    }
    location.href = Auth.APP_PAGE;
  }

  // ---- Accountsiz davom etish (Privacy Policy ostida) ----
  (function setupGuestLink() {
    const a = $('guest-continue');
    if (a) {
      a.addEventListener('click', (ev) => {
        ev.preventDefault();
        goGuest();
      });
    }
    // Supabase sozlanmagan bo'lsa — qo'shimcha dev eslatma (ixtiyoriy)
    const note = $('dev-note');
    if (note && !Auth.configured) {
      note.innerHTML =
        '<b>Supabase hali sozlanmagan.</b> Kalitlarni <code>js/supabase-config.js</code> ga qo‘ying.';
      note.hidden = false;
    }
  })();

  // OAuth xatosi bilan qaytgan bo'lsa ko'rsatamiz
  (function showReturnError() {
    const p = new URLSearchParams(location.hash.replace(/^#/, '') || location.search);
    const d = p.get('error_description');
    if (d) {
      showMsg(d.replace(/\+/g, ' '));
      history.replaceState(null, '', location.pathname);
    }
  })();

  // Allaqachon kirgan bo'lsa — login sahifasini ko'rsatmay, to'g'ri app'ga
  const reveal = () => document.documentElement.classList.remove('auth-check');
  const goAppIfSignedIn = () =>
    Auth.getSession().then((s) => {
      if (s) {
        Auth.setGuestFlag(false);
        location.replace(Auth.APP_PAGE);
        return true;
      }
      return false;
    });

  if (!Auth.configured) reveal();
  else goAppIfSignedIn().then((redirected) => { if (!redirected) reveal(); }).catch(reveal);

  window.addEventListener('pageshow', (e) => { if (e.persisted && Auth.configured) goAppIfSignedIn(); });

  // ---- Google ----
  googleBtn.addEventListener('click', async () => {
    showMsg('');
    if (!Auth.configured) return showMsg('Supabase kalitlari yo‘q. js/supabase-config.js ga qo‘ying.');
    setLoading(googleBtn, true);
    try {
      await Auth.signInWithGoogle();
    } catch (e) {
      showMsg(friendly(e));
      setLoading(googleBtn, false);
    }
  });
})();
