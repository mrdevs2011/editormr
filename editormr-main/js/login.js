// ===================== LOGIN PAGE (faqat Google) =====================
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
    if (/rate limit|too many/i.test(t) || (err && err.status === 429)) return 'Too many attempts. Wait a minute and try again.';
    if (/provider is not enabled|unsupported provider/i.test(t)) return 'Google sign-in is not enabled in Supabase yet.';
    if (/failed to fetch|network/i.test(t)) return 'Network error. Check your connection and try again.';
    return t;
  }

  // ---- state on load ----
  if (!Auth.configured) {
    $('dev-note').hidden = false;
    // "Continue without account" — shu tab uchun dev rejim
    $('dev-note').querySelector('a').addEventListener('click', (ev) => {
      ev.preventDefault();
      try { sessionStorage.setItem('emr-dev-bypass', '1'); } catch (_) {}
      location.href = Auth.APP_PAGE;
    });
  }

  // OAuth xatosi bilan qaytgan bo'lsa ko'rsatamiz
  (function showReturnError() {
    const p = new URLSearchParams(location.hash.replace(/^#/, '') || location.search);
    const d = p.get('error_description');
    if (d) {
      showMsg(d.replace(/\+/g, ' '));
      history.replaceState(null, '', location.pathname);
    }
  })();

  // Allaqachon kirgan bo'lsa — login sahifasini ko'rsatmay, to'g'ri app'ga (replace: Back bosilsa login'ga qaytmaydi)
  const reveal = () => document.documentElement.classList.remove('auth-check');
  const goAppIfSignedIn = () =>
    Auth.getSession().then((s) => {
      if (s) { location.replace(Auth.APP_PAGE); return true; }
      return false;
    });

  if (!Auth.configured) reveal();
  else goAppIfSignedIn().then((redirected) => { if (!redirected) reveal(); }).catch(reveal);

  // Orqa/oldinga (Back/Forward) tugmasi bilan keshdan qaytganda ham tekshiramiz
  window.addEventListener('pageshow', (e) => { if (e.persisted && Auth.configured) goAppIfSignedIn(); });

  // ---- Google ----
  googleBtn.addEventListener('click', async () => {
    showMsg('');
    if (!Auth.configured) return showMsg('Supabase keys are missing. Add them in js/supabase-config.js');
    setLoading(googleBtn, true);
    try {
      await Auth.signInWithGoogle(); // brauzer Google'ga yo'naladi
    } catch (e) {
      showMsg(friendly(e));
      setLoading(googleBtn, false);
    }
  });
})();
