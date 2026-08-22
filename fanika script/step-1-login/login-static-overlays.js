/**
 * Two persistent login-time badges on every BLS page (does not touch IP overlay).
 * 1) Login — first login page success
 * 2) Submit — login submit success
 */
(function () {
  if (window.__fanikaLoginStaticOverlaysInstalled) return;
  window.__fanikaLoginStaticOverlaysInstalled = true;

  const BADGE_BASE = [
    'position:fixed',
    'left:12px',
    'z-index:2147483645',
    'padding:6px 10px',
    'font:700 13px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    'color:#0b1f14',
    'background:rgba(255,255,255,0.94)',
    'border:1px solid #90a4ae',
    'border-radius:6px',
    'box-shadow:0 2px 6px rgba(0,0,0,0.12)',
    'pointer-events:none',
    'user-select:none',
    'max-width:320px'
  ].join(';');

  function timesApi() {
    return window.fanikaLoginTimes || null;
  }

  function mountBadge(id, topPx, label, value) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.setAttribute('data-fanika', 'login-static');
      el.style.cssText = BADGE_BASE + ';top:' + topPx + 'px';
      (document.documentElement || document.body).appendChild(el);
    }
    el.textContent = label + ': ' + value;
  }

  function refreshBadges() {
    const api = timesApi();
    const first = api ? api.getLoginFirstTime() : '—';
    const submit = api ? api.getLoginSubmitTime() : '—';
    mountBadge('fanika-login-first-badge', 12, 'Login', first);
    mountBadge('fanika-login-submit-badge', 48, 'Submit', submit);
  }

  function mount() {
    refreshBadges();
    window.addEventListener('fanikaLoginTimesUpdated', refreshBadges);
    window.addEventListener('storage', (e) => {
      if (!e.key || e.key.startsWith('fanikaLogin') || e.key === 'logintime') {
        refreshBadges();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
