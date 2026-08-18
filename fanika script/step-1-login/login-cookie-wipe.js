/**
 * Step 1 — Login cookie wipe (proxy rotation is handled in the background)
 *
 * - /account/login: wipe cookies once, then open login again
 * - form submit → LoginSubmit: wipe cookies before the POST continues
 *   so Too Many (if any) lands with a clean cookie jar
 */
(function () {
  if (window.__fanikaLoginCookieWipeInstalled) return;
  window.__fanikaLoginCookieWipeInstalled = true;

  const LOGIN_URL = 'https://www.blsspainmorocco.net/MAR/account/login';
  const WIPE_ONCE_KEY = 'fanikaLoginWipeOnce';

  function isLoginPage() {
    const path = location.pathname.toLowerCase();
    return path.includes('/account/login') && !path.includes('loginsubmit');
  }

  function forceFresh() {
    return /(?:^|[?&])fresh=1(?:&|$)/.test(location.search);
  }

  function formTargetsLoginSubmit(form) {
    if (!(form instanceof HTMLFormElement)) return false;
    const action = String(form.getAttribute('action') || form.action || '').toLowerCase();
    return action.includes('loginsubmit') || (isLoginPage() && form.method.toLowerCase() === 'post');
  }

  function wipeCookies(done) {
    chrome.runtime.sendMessage({ action: 'wipeAllCookies' }, (res) => {
      if (chrome.runtime.lastError) {
        console.warn('[fanika/login-wipe]', chrome.runtime.lastError.message);
      } else {
        console.log('[fanika/login-wipe] cookies wiped', res);
      }
      if (typeof done === 'function') done(res);
    });
  }

  // Login GET: wipe once (or when ?fresh=1), then open login again
  if (isLoginPage() && (forceFresh() || !sessionStorage.getItem(WIPE_ONCE_KEY))) {
    sessionStorage.setItem(WIPE_ONCE_KEY, '1');
    chrome.runtime.sendMessage({
      action: 'debugLog',
      event: 'login.wipeThenOpen',
      data: { url: location.href, fresh: forceFresh() }
    });
    wipeCookies(() => {
      location.replace(LOGIN_URL);
    });
  }

  // Submit: wipe before POST so Too Many response does not keep old cookies
  document.addEventListener(
    'submit',
    (event) => {
      const form = event.target;
      if (!formTargetsLoginSubmit(form)) return;
      if (form.dataset.fanikaWipedBeforeSubmit === '1') return;

      event.preventDefault();
      event.stopPropagation();

      chrome.runtime.sendMessage({
        action: 'debugLog',
        event: 'loginSubmit.wipeBeforePost',
        data: { url: location.href, action: form.action }
      });

      wipeCookies(() => {
        form.dataset.fanikaWipedBeforeSubmit = '1';
        HTMLFormElement.prototype.submit.call(form);
      });
    },
    true
  );
})();
