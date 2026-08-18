/**
 * Step 1 — Too Many handler
 * Wipe×3 → still 429 → background rotates Chrome proxy → login.
 * Overlay shows wipe / rotating status.
 */
(function () {
  if (window.__fanikaStep1TooManyInstalled) return;
  window.__fanikaStep1TooManyInstalled = true;

  let handled = false;

  function isTooManyPage() {
    const h1Text = document.querySelector('h1')?.textContent?.trim() || '';
    return h1Text.includes('Too Many') || h1Text.includes('Temporarily Restricted');
  }

  function setLocalOverlay(text, phase) {
    const status = document.getElementById('fanika-public-ip-overlay-status');
    const el = document.getElementById('fanika-public-ip-overlay');
    if (!status || !el) return;
    status.style.display = 'block';
    status.textContent = text;
    if (phase === 'rotating') {
      el.style.color = '#e65100';
      el.style.background = 'rgba(255,243,224,0.96)';
      el.style.borderColor = '#ef6c00';
    } else if (phase === 'wipe') {
      el.style.color = '#1a237e';
      el.style.background = 'rgba(227,242,253,0.96)';
      el.style.borderColor = '#1565c0';
    } else if (phase === 'error') {
      el.style.color = '#b71c1c';
      el.style.background = 'rgba(255,235,238,0.96)';
      el.style.borderColor = '#c62828';
    }
  }

  function requestHandleTooMany() {
    if (handled) return;
    handled = true;
    console.log('[fanika/step-1-login] Too Many detected');
    setLocalOverlay('Too Many — handling…', 'wipe');

    chrome.runtime.sendMessage({
      action: 'debugLog',
      event: 'page.tooMany.detected',
      data: { url: location.href, h1: document.querySelector('h1')?.textContent?.trim() }
    });

    chrome.runtime.sendMessage({
      action: 'handleTooMany',
      pageUrl: location.href
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[fanika/step-1-login]', chrome.runtime.lastError.message);
        setLocalOverlay('Too Many handler error', 'error');
        handled = false;
        return;
      }
      console.log('[fanika/step-1-login] Too Many response:', response);

      if (response?.action === 'rotateFailed' || response?.action === 'ipUnchanged') {
        setLocalOverlay(
          response.error || 'IP rotate failed — retry in a moment',
          'error'
        );
        // Allow retry after a pause
        setTimeout(() => {
          handled = false;
        }, 5000);
      }
    });
  }

  function check() {
    if (isTooManyPage()) requestHandleTooMany();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', check);
  } else {
    check();
  }

  setInterval(check, 1000);
})();
