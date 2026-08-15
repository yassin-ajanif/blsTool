/**
 * Step 1 — Public IP overlay + Rotate button
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
      'pointer-events:auto',
      'user-select:none'
    ].join(';');

    const label = document.createElement('div');
    label.id = OVERLAY_ID + '-label';
    label.textContent = 'IP: …';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Rotate';
    btn.style.cssText = 'margin-top:6px;width:100%;cursor:pointer;font:600 12px system-ui';
    btn.addEventListener('click', () => {
      btn.disabled = true;
      label.textContent = 'IP: rotating…';
      chrome.runtime.sendMessage({
        action: 'debugLog',
        event: 'overlay.rotate.click'
      });
      chrome.runtime.sendMessage({ action: 'rotateProxy' }, (response) => {
        btn.disabled = false;
        if (chrome.runtime.lastError) {
          label.textContent = 'IP: ' + chrome.runtime.lastError.message;
          return;
        }
        if (response?.changed && response.ip) {
          label.textContent = 'IP: ' + response.ip + ' (changed)';
        } else if (response?.ip) {
          label.textContent = 'IP: ' + response.ip + ' (same — kept rotating)';
        } else {
          label.textContent = 'IP: ' + (response?.error || 'rotate failed');
        }
      });
    });

    el.appendChild(label);
    el.appendChild(btn);
    (document.documentElement || document.body).appendChild(el);
    return el;
  }

  function setOverlayText(text) {
    ensureOverlay();
    const label = document.getElementById(OVERLAY_ID + '-label');
    if (label) label.textContent = text;
  }

  function requestIp() {
    chrome.runtime.sendMessage({ action: 'getPublicIp' }, (response) => {
      if (chrome.runtime.lastError) {
        setOverlayText('IP: unavailable');
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
