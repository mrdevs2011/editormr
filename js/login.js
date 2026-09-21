// ===================== LOGIN PAGE (Google + account-siz local) =====================
(function () {
  const $ = (id) => document.getElementById(id);
  const googleBtn = $('google-btn');
  const msg = $('msg');

  function showMsg(text) {
    if (!msg) return;
    msg.textContent = text || '';
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
    if (/supabase|anon|config|PASTE_|keys are missing/i.test(t)) {
      return 'Google orqali kirish hozir ishlamayapti. Accountsiz davom etishingiz mumkin.';
    }
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

  (function setupGuestLink() {
    const a = $('guest-continue');
    if (a) {
      a.addEventListener('click', (ev) => {
        ev.preventDefault();
        goGuest();
      });
    }
    const note = $('dev-note');
    if (note) {
      note.hidden = true;
      note.innerHTML = '';
    }
  })();

  (function showReturnError() {
    const p = new URLSearchParams(location.hash.replace(/^#/, '') || location.search);
    const d = p.get('error_description');
    if (d) {
      showMsg(d.replace(/\+/g, ' '));
      history.replaceState(null, '', location.pathname);
    }
  })();

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

  googleBtn.addEventListener('click', async () => {
    showMsg('');
    // Localhost / kalit yo'q — Google OAuth ishlamaydi, accountsiz ochamiz
    if (!Auth.configured) {
      goGuest();
      return;
    }
    setLoading(googleBtn, true);
    try {
      await Auth.signInWithGoogle();
    } catch (e) {
      showMsg(friendly(e));
      setLoading(googleBtn, false);
    }
  });
})();
