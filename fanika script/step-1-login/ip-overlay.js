/**
 * Step 1 — Public IP overlay on targeted BLS pages
 * Reads IP from background (fetched via https://ipv4.icanhazip.com/).
 */
(function () {
  if (window.__fanikaIpOverlayInstalled) return;
  window.__fanikaIpOverlayInstalled = true;

  const OVERLAY_ID = 'fanika-public-ip-overlay';

  function ensureOverlay() {
    let el = document.getElementById(OVERLAY_ID);
    if (el) return el;

    el = document.createElement('div');
    el.id = OVERLAY_ID;
    el.setAttribute('data-fanika', 'ip-overlay');
    el.textContent = 'IP: …';
    el.style.cssText = [
      'position:fixed',
      'top:12px',
      'right:12px',
      'z-index:2147483647',
      'padding:8px 12px',
      'font:600 13px/1.3 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      'color:#0b1f14',
      'background:rgba(232,245,233,0.95)',
      'border:1px solid #2e7d32',
      'border-radius:6px',
      'box-shadow:0 2px 8px rgba(0,0,0,0.18)',
      'pointer-events:none',
      'user-select:none'
    ].join(';');

    (document.documentElement || document.body).appendChild(el);
    return el;
  }

  function setOverlayText(text) {
    const el = ensureOverlay();
    el.textContent = text;
  }

  function requestIp() {
    chrome.runtime.sendMessage({ action: 'getPublicIp' }, (response) => {
      if (chrome.runtime.lastError) {
        setOverlayText('IP: unavailable');
        console.warn('[fanika/ip-overlay]', chrome.runtime.lastError.message);
        return;
      }
      if (response?.success && response.ip) {
        setOverlayText('IP: ' + response.ip);
      } else {
        setOverlayText('IP: ' + (response?.error || 'unavailable'));
      }
    });
  }

  function mount() {
    ensureOverlay();
    requestIp();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
