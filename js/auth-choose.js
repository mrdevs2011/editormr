// ===================== AUTH CHOOSE (Faza 7A) =====================
// Session yo'q + guest flag yo'q → ikki tugma: Mehmon / Kirish
(function () {
  'use strict';

  function S(key) {
    if (typeof window.S === 'function') return window.S(key);
    const map = {
      'auth.chooseTitle': 'Qanday davom etasiz?',
      'auth.guest': 'Mehmon sifatida davom etish',
      'auth.guestHint': 'Loyiha shu qurilmada saqlanadi, kirish shart emas',
      'auth.login': 'Kirish',
      'auth.loginHint': 'Google orqali — loyihalar bulutda',
    };
    return map[key] || key;
  }

  function showAuthChoose() {
    if (document.getElementById('auth-choose-overlay')) return;

    const ov = document.createElement('div');
    ov.id = 'auth-choose-overlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;padding:24px;';
    ov.innerHTML = `
      <div style="background:#1a1a1e;border-radius:16px;padding:28px 24px;max-width:360px;width:100%;color:#eee;font-family:system-ui,sans-serif;text-align:center;">
        <h2 style="margin:0 0 20px;font-size:1.25rem;">${S('auth.chooseTitle')}</h2>
        <button type="button" id="auth-guest-btn" style="display:block;width:100%;padding:14px 16px;margin-bottom:12px;border:none;border-radius:10px;background:#3b82f6;color:#fff;font-size:1rem;cursor:pointer;">
          ${S('auth.guest')}
        </button>
        <p style="margin:0 0 20px;font-size:.85rem;color:#999;">${S('auth.guestHint')}</p>
        <button type="button" id="auth-login-btn" style="display:block;width:100%;padding:14px 16px;border:1px solid #444;border-radius:10px;background:transparent;color:#eee;font-size:1rem;cursor:pointer;">
          ${S('auth.login')}
        </button>
        <p style="margin:12px 0 0;font-size:.85rem;color:#999;">${S('auth.loginHint')}</p>
      </div>`;
    document.body.appendChild(ov);

    document.getElementById('auth-guest-btn').onclick = () => {
      Auth.enterGuest();
      ov.remove();
      document.documentElement.classList.remove('auth-choose');
      // Header mehmon belgi
      const chip = document.getElementById('user-chip');
      if (chip) {
        chip.hidden = false;
        const emailEl = document.getElementById('user-email');
        if (emailEl) emailEl.textContent = S('auth.guestBadge') || 'Mehmon';
      }
      const so = document.getElementById('signout-btn');
      if (so) {
        so.textContent = S('auth.login') || 'Kirish';
        so.onclick = () => { Auth.setGuestFlag(false); location.href = Auth.LOGIN_PAGE; };
      }
      // Dashboard / upload ochish
      if (typeof renderDashboard === 'function') renderDashboard();
      else if (typeof window.renderDashboard === 'function') window.renderDashboard();
    };

    document.getElementById('auth-login-btn').onclick = () => {
      Auth.setGuestFlag(false);
      location.href = Auth.LOGIN_PAGE;
    };
  }

  window.showAuthChoose = showAuthChoose;

  // Agar boot auth-choose class qo'ygan bo'lsa va script kech yuklangan bo'lsa
  if (document.documentElement.classList.contains('auth-choose')) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', showAuthChoose);
    } else {
      showAuthChoose();
    }
  }
})();
