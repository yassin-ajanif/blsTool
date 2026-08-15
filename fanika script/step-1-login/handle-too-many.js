/**
 * Step 1 — Too Many handler
 * clear cookies → rotate until IP changes → redirect to login
 */
(function () {
  if (window.__fanikaStep1TooManyInstalled) return;
  window.__fanikaStep1TooManyInstalled = true;

  let handled = false;

  function isTooManyPage() {
    const h1Text = document.querySelector('h1')?.textContent?.trim() || '';
    return h1Text.includes('Too Many') || h1Text.includes('Temporarily Restricted');
  }

  function requestHandleTooMany() {
    if (handled) return;
    handled = true;
    console.log('[fanika/step-1-login] Too Many — LoginSubmit: 3 wipe+rotate retries, then login');
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
        handled = false;
        return;
      }
      console.log('[fanika/step-1-login] Too Many response:', response);
      // Same IP — do not treat as done; allow another check after a pause
      if (response && response.action === 'ipUnchanged') {
        setTimeout(() => { handled = false; }, 2000);
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
