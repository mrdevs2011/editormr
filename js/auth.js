// ===================== AUTH (Supabase) =====================
// Istalgan Google hisobi bilan kirish mumkin.
// Ma'lumotlar izolyatsiyasi: Supabase RLS (auth.uid() = user_id).
(function () {
  const cfg = window.SUPABASE_CONFIG || {};
  const SCRIPT_SRC = (document.currentScript && document.currentScript.src) || (location.origin + '/js/auth.js');
  const ROOT = new URL('../', SCRIPT_SRC).href;
  const isFile = location.protocol === 'file:';
  const LOGIN_PAGE = ROOT + 'login/' + (isFile ? 'index.html' : '');
  const APP_PAGE = ROOT + (isFile ? 'index.html' : '');

  const IS_LOCAL =
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1' ||
    location.hostname === '' ||
    isFile;

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
    IS_LOCAL,

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

    async requireSession() {
      if (!configured) {
        if (!IS_LOCAL) {
          console.error('[auth] Supabase not configured — production blocked');
          location.replace(LOGIN_PAGE);
          return new Promise(() => {});
        }
        let bypass = false;
        try { bypass = sessionStorage.getItem('emr-dev-bypass') === '1'; } catch (_) {}
        if (!bypass) {
          location.replace(LOGIN_PAGE);
          return new Promise(() => {});
        }
        console.warn('[auth] local dev bypass');
        return null;
      }

      if (/error_description=/.test(location.hash + location.search)) {
        location.replace(LOGIN_PAGE + (location.hash || ''));
        return new Promise(() => {});
      }

      const s = await this.getSession();
      if (!s) {
        location.replace(LOGIN_PAGE);
        return new Promise(() => {});
      }

      this.session = s;
      client.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') location.replace(LOGIN_PAGE);
      });
      return s;
    },
  };

  window.Auth = Auth;
  try { localStorage.removeItem('mrdrive_pass'); } catch (_) {}
})();
