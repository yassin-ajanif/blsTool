/**
 * Step 1 — Public IP overlay + status (wipe / rotating)
 */
(function () {
  if (window.__fanikaIpOverlayInstalled) return;
  window.__fanikaIpOverlayInstalled = true;

  const OVERLAY_ID = 'fanika-public-ip-overlay';

  const PHASE_STYLE = {
    info: { color: '#0b1f14', bg: 'rgba(232,245,233,0.95)', border: '#2e7d32' },
    wipe: { color: '#1a237e', bg: 'rgba(227,242,253,0.96)', border: '#1565c0' },
    rotating: { color: '#e65100', bg: 'rgba(255,243,224,0.96)', border: '#ef6c00' },
    ok: { color: '#1b5e20', bg: 'rgba(232,245,233,0.96)', border: '#2e7d32' },
    error: { color: '#b71c1c', bg: 'rgba(255,235,238,0.96)', border: '#c62828' }
  };

  function ensureOverlay() {
    let el = document.getElementById(OVERLAY_ID);
    if (el) return el;

    el = document.createElement('div');
    el.id = OVERLAY_ID;
    el.setAttribute('data-fanika', 'ip-overlay');
    el.style.cssText = [
      'position:fixed',
      'top:12px',
      'right:12px',
      'z-index:2147483647',
      'padding:8px 12px',
      'font:600 13px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      'color:#0b1f14',
      'background:rgba(232,245,233,0.95)',
      'border:1px solid #2e7d32',
      'border-radius:6px',
      'box-shadow:0 2px 8px rgba(0,0,0,0.18)',
      'pointer-events:auto',
      'user-select:none',
      'max-width:320px'
    ].join(';');

    const label = document.createElement('div');
    label.id = OVERLAY_ID + '-label';
    label.textContent = 'IP: …';

    const status = document.createElement('div');
    status.id = OVERLAY_ID + '-status';
    status.style.cssText = 'margin-top:4px;font-weight:500;font-size:12px;display:none';

    el.appendChild(label);
    el.appendChild(status);
    (document.documentElement || document.body).appendChild(el);
    return el;
  }

  function applyPhase(phase) {
    const el = ensureOverlay();
    const style = PHASE_STYLE[phase] || PHASE_STYLE.info;
    el.style.color = style.color;
    el.style.background = style.bg;
    el.style.borderColor = style.border;
  }

  function setOverlayIp(text) {
    ensureOverlay();
    const label = document.getElementById(OVERLAY_ID + '-label');
    if (label) label.textContent = text;
  }

  function setOverlayStatus(text, phase) {
    ensureOverlay();
    applyPhase(phase || 'info');
    const status = document.getElementById(OVERLAY_ID + '-status');
    if (!status) return;
    if (!text) {
      status.style.display = 'none';
      status.textContent = '';
      return;
    }
    status.style.display = 'block';
    status.textContent = text;
  }

  function requestIp() {
    chrome.runtime.sendMessage({ action: 'getPublicIp' }, (response) => {
      if (chrome.runtime.lastError) {
        setOverlayIp('IP: unavailable');
        return;
      }
      if (response?.success && response.ip) {
        setOverlayIp('IP: ' + response.ip);
      } else {
        setOverlayIp('IP: ' + (response?.error || 'unavailable'));
      }
    });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.action !== 'overlayStatus') return;
    setOverlayStatus(message.text || '', message.phase || 'info');
    if (message.phase === 'ok' || message.phase === 'rotating') {
      requestIp();
    }
  });

  function mount() {
    ensureOverlay();
    requestIp();
    chrome.runtime.sendMessage({ action: 'getTooManyWipeCount' }, (res) => {
      if (chrome.runtime.lastError || !res?.success) return;
      if (res.wipeStreak > 0) {
        setOverlayStatus(
          'Wipe streak ' + res.wipeStreak + '/' + res.max,
          'wipe'
        );
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
