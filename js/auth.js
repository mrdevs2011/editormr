// ===================== AUTH (Supabase) =====================
// Istalgan Google hisobi bilan kirish mumkin.
// Account yo'q (guest): IndexedDB/local — Auth.session = null, isGuest() = true.
// Ma'lumotlar izolyatsiyasi: Supabase RLS (auth.uid() = user_id).
(function () {
  const cfg = window.SUPABASE_CONFIG || {};
  const SCRIPT_SRC = (document.currentScript && document.currentScript.src) || (location.origin + '/js/auth.js');
  const ROOT = new URL('../', SCRIPT_SRC).href;
  const isFile = location.protocol === 'file:';
  const LOGIN_PAGE = ROOT + 'login/' + (isFile ? 'index.html' : '');
  const APP_PAGE = ROOT + (isFile ? 'index.html' : '');

  const GUEST_KEY = 'emr-guest';

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

  function getGuestFlag() {
    try {
      return localStorage.getItem(GUEST_KEY) === '1';
    } catch (_) {
      return false;
    }
  }

  function setGuestFlag(on) {
    try {
      if (on) localStorage.setItem(GUEST_KEY, '1');
      else localStorage.removeItem(GUEST_KEY);
    } catch (_) {}
  }

  /** Mehmon rejimiga o'tish: session yo'q, local storage. */
  function enterGuest() {
    setGuestFlag(true);
    Auth.session = null;
    try {
      if (window.StorageAdapter && typeof window.StorageAdapter.setMode === 'function') {
        window.StorageAdapter.setMode('local');
      }
      window.EMR = window.EMR || {};
      window.EMR.storageMode = 'local';
    } catch (_) {}
  }

  function isGuest() {
    return !Auth.session && getGuestFlag();
  }

  const Auth = {
    configured,
    client,
    LOGIN_PAGE,
    APP_PAGE,
    session: null,
    IS_LOCAL,

    getGuestFlag,
    setGuestFlag,
    enterGuest,
    isGuest,

    async getSession() {
      if (!client) return null;
      const { data, error } = await client.auth.getSession();
      if (error) console.warn('[auth] getSession:', error.message);
      return data && data.session ? data.session : null;
    },

    async signInWithGoogle() {
      // Login oldidan guest flag o'chadi
      setGuestFlag(false);
      const { error } = await need().auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: APP_PAGE },
      });
      if (error) throw error;
    },

    async signOut() {
      setGuestFlag(false);
      if (client) await client.auth.signOut();
      location.replace(LOGIN_PAGE);
    },

    /**
     * App ochilishi:
     * - session bor → cloud
     * - guest flag bor → local (IndexedDB), redirect yo'q
     * - yo'q → login sahifasiga
     * - Supabase sozlanmagan + local host → guest yoki eski bypass
     */
    async requireSession() {
      // OAuth xato hash
      if (/error_description=/.test(location.hash + location.search)) {
        location.replace(LOGIN_PAGE + (location.hash || ''));
        return new Promise(() => {});
      }

      // Supabase sozlangan — sessiya tekshir
      if (configured && client) {
        const s = await this.getSession();
        if (s) {
          this.session = s;
          setGuestFlag(false); // account bor — guest emas
          try {
            if (window.StorageAdapter) window.StorageAdapter.setMode('cloud');
            window.EMR = window.EMR || {};
            window.EMR.storageMode = 'cloud';
          } catch (_) {}
          client.auth.onAuthStateChange((event) => {
            if (event === 'SIGNED_OUT') {
              this.session = null;
              location.replace(LOGIN_PAGE);
            }
          });
          return s;
        }
        // Session yo'q, lekin guest tanlangan
        if (getGuestFlag()) {
          enterGuest();
          console.info('[auth] guest mode (local IndexedDB)');
          return null;
        }
        location.replace(LOGIN_PAGE);
        return new Promise(() => {});
      }

      // Supabase yo'q
      if (!IS_LOCAL) {
        console.error('[auth] Supabase not configured — production blocked');
        location.replace(LOGIN_PAGE);
        return new Promise(() => {});
      }

      // Local host: guest yoki eski sessionStorage bypass
      let bypass = false;
      try { bypass = sessionStorage.getItem('emr-dev-bypass') === '1'; } catch (_) {}
      if (getGuestFlag() || bypass) {
        if (bypass && !getGuestFlag()) setGuestFlag(true);
        enterGuest();
        console.warn('[auth] local guest / dev bypass');
        return null;
      }
      location.replace(LOGIN_PAGE);
      return new Promise(() => {});
    },
  };

  window.Auth = Auth;
  try { localStorage.removeItem('mrdrive_pass'); } catch (_) {}
})();
