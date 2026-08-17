/**
 * Step 1 — Login: fill email, click Verify.
 * Runs in the content-script world (no page jQuery).
 */
(async function () {
  if (!window.fanikaPage?.isLogin()) return;

  const dom = window.fanikaDom;
  let client = {};
  let settings = {};
  const status = { email: false };

  try {
    const data = await window.getFanikaData();
    client = data.client || {};
    settings = data.settings || {};
  } catch (e) {
    console.warn('[fanika/login-page]', e);
  }

  if (!client?.email) {
    console.warn('[fanika/login-page] No client email — Save a client in Options, then Launch');
    chrome.runtime.sendMessage({
      action: 'overlayStatus',
      text: 'No client saved — Options → Save, then Launch',
      phase: 'error'
    });
    return;
  }

  chrome.runtime.sendMessage({
    action: 'debugLog',
    event: 'loginPage.start',
    data: { email: client.email, name: client.name }
  });

  let allDone = false;
  let intervalId;

  const fillAndSubmit = () => {
    if (allDone) return;
    const email = dom.visibleInputs('input[type="text"], input[type="email"]')[0];
    if (!email) return;

    if (!status.email) {
      dom.setNativeValue(email, client.email);
      status.email = true;
    }

    const btn = document.getElementById('btnVerify');
    if (!btn) return;

    allDone = true;
    clearInterval(intervalId);
    chrome.runtime.sendMessage({
      action: 'debugLog',
      event: 'loginPage.ready',
      data: { email: client.email }
    });

    if (!settings?.submitPages?.loginPage) return;
    try {
      localStorage.setItem(
        'logintime',
        new Date().toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
      );
    } catch (_) {}

    const delay = settings.submitPages.loginPageMs || 0;
    const click = () => dom.clickEl(btn);
    if (delay && window.startCountdown) window.startCountdown(delay, 'btnVerify', click);
    else click();
  };

  const start = () => {
    intervalId = setInterval(fillAndSubmit, 100);
    fillAndSubmit();
  };

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
