/**
 * Step 1 — Too Many handler (content script)
 * On "Too Many" / "Temporarily Restricted": ask background to wipe ALL cookies + reload.
 */
(function () {
  if (window.__fanikaStep1TooManyInstalled) return;
  window.__fanikaStep1TooManyInstalled = true;

  let handled = false;

  function isTooManyPage() {
    const h1Text = document.querySelector('h1')?.textContent?.trim() || '';
    return h1Text.includes('Too Many') || h1Text.includes('Temporarily Restricted');
  }

  function requestWipeAllAndReload() {
    if (handled) return;
    handled = true;
    console.log('[fanika/step-1-login] Too Many detected — wiping all browser cookies and reloading');
    chrome.runtime.sendMessage({ action: 'wipeAllCookiesAndReload' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[fanika/step-1-login]', chrome.runtime.lastError.message);
        handled = false;
        return;
      }
      console.log('[fanika/step-1-login] wipe response:', response);
    });
  }

  function check() {
    if (isTooManyPage()) requestWipeAllAndReload();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', check);
  } else {
    check();
  }

  setInterval(check, 1000);
})();
