/**
 * Center-top live clock — HH:MM:SS:mmm (same style as Fanika BLS).
 */
(function () {
  if (window.__proxyLabCenterTimerInstalled) return;
  window.__proxyLabCenterTimerInstalled = true;

  const TIMER_ID = 'proxy-lab-center-timer';

  function pad(n, len) {
    return String(n).padStart(len || 2, '0');
  }

  function formatNow() {
    const t = new Date();
    return (
      pad(t.getHours()) +
      ':' +
      pad(t.getMinutes()) +
      ':' +
      pad(t.getSeconds()) +
      ':' +
      pad(t.getMilliseconds(), 3)
    );
  }

  function ensureTimer() {
    let el = document.getElementById(TIMER_ID);
    if (el) return el;

    el = document.createElement('div');
    el.id = TIMER_ID;
    el.setAttribute('data-proxy-lab', 'center-timer');
    el.style.cssText = [
      'position:fixed',
      'top:8px',
      'left:50%',
      'transform:translateX(-50%)',
      'z-index:2147483646',
      'font:900 42px/1 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
      'letter-spacing:0.02em',
      'color:#000',
      'background:transparent',
      'pointer-events:none',
      'user-select:none',
      'white-space:nowrap',
      'text-shadow:0 0 6px rgba(255,255,255,0.85)'
    ].join(';');
    el.textContent = formatNow();
    (document.documentElement || document.body).appendChild(el);
    return el;
  }

  function tick() {
    const el = ensureTimer();
    el.textContent = formatNow();
    requestAnimationFrame(tick);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tick);
  } else {
    tick();
  }
})();
