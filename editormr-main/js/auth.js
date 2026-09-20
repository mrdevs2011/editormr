// ===================== AUTH (Supabase) =====================
// login/index.html va index.html (ildiz) ikkalasi ham shu faylni ishlatadi.
// Kalitlar hali qo'yilmagan bo'lsa (configured=false) — dev rejim: editor login'siz ochiladi.
(function () {
  const cfg = window.SUPABASE_CONFIG || {};
  // Sayt ildizini shu skriptning o'z manzilidan topamiz (js/auth.js -> ../),
  // shunda u qaysi sahifadan yuklanmasin (/ yoki /login/) yo'llar to'g'ri chiqadi.
  const SCRIPT_SRC = (document.currentScript && document.currentScript.src) || (location.origin + '/js/auth.js');
  const ROOT = new URL('../', SCRIPT_SRC).href;
  const isFile = location.protocol === 'file:'; // file:// da papka index.html'ga o'zi ochilmaydi
  const LOGIN_PAGE = ROOT + 'login/' + (isFile ? 'index.html' : '');
  const APP_PAGE = ROOT + (isFile ? 'index.html' : '');

  const configured =
    /^https?:\/\/\S+$/.test(cfg.url || '') &&
    (cfg.anonKey || '').length > 20 &&
    !/PASTE_/i.test(cfg.url + cfg.anonKey);

  const client =
    configured && window.supabase
      ? window.supabase.createClient(cfg.url, cfg.anonKey, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
        })
      : null;

  function need() {
    if (!client) throw new Error('Supabase keys are missing. Add them in js/supabase-config.js');
    return client;
  }

  const Auth = {
    configured,
    client,
    LOGIN_PAGE,
    APP_PAGE,
    session: null,

    async getSession() {
      if (!client) return null;
      const { data, error } = await client.auth.getSession();
      if (error) console.warn('[auth] getSession:', error.message);
      return data && data.session ? data.session : null;
    },

    async signInWithGoogle() {
      const { error } = await need().auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: APP_PAGE },
      });
      if (error) throw error;
    },

    async signOut() {
      if (client) await client.auth.signOut();
      location.replace(LOGIN_PAGE);
    },

    // index.html uchun: sessiya yo'q bo'lsa login'ga otadi
    async requireSession() {
      if (!configured) {
        // Kalitlar yo'q: avval login sahifa ko'rinadi, "Continue without account" bosilsa
        // shu tab uchun dev rejim yoqiladi (sessionStorage).
        let bypass = false;
        try { bypass = sessionStorage.getItem('emr-dev-bypass') === '1'; } catch (_) {}
        if (!bypass) {
          location.replace(LOGIN_PAGE);
          return new Promise(() => {});
        }
        console.warn('[auth] Supabase sozlanmagan — dev rejim (login o\'tkazib yuborilgan).');
        return null;
      }
      // OAuth xatosi bilan qaytgan bo'lsa, xabarni login sahifasiga uzatamiz
      if (/error_description=/.test(location.hash + location.search)) {
        location.replace(LOGIN_PAGE + (location.hash || ''));
        return new Promise(() => {});
      }
      const s = await this.getSession();
      if (!s) {
        location.replace(LOGIN_PAGE);
        return new Promise(() => {}); // redirect bo'lguncha app ishga tushmasin
      }
      this.session = s;
      // boshqa tabda sign out qilinsa, bu tab ham chiqib ketadi
      client.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') location.replace(LOGIN_PAGE);
      });
      return s;
    },
  };

  window.Auth = Auth;
})();
