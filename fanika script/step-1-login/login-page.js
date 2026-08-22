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

  let loginFirstSaved = false;

  function saveLoginFirstSuccess() {
    if (loginFirstSaved || !window.fanikaLoginTimes) return;
    loginFirstSaved = true;
    const ts = window.fanikaLoginTimes.saveLoginFirstTime();
    chrome.runtime.sendMessage({
      action: 'debugLog',
      event: 'loginPage.firstSuccess',
      data: { email: client.email, time: ts }
    });
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

    saveLoginFirstSuccess();

    allDone = true;
    clearInterval(intervalId);
    chrome.runtime.sendMessage({
      action: 'debugLog',
      event: 'loginPage.ready',
      data: { email: client.email }
    });

    if (!settings?.submitPages?.loginPage) return;

    const delay = settings.submitPages.loginPageMs || 0;
    const click = () => {
      if (window.fanikaLoginTimes) {
        const ts = window.fanikaLoginTimes.saveLoginSubmitTime();
        chrome.runtime.sendMessage({
          action: 'debugLog',
          event: 'loginPage.submitClick',
          data: { email: client.email, time: ts }
        });
      }
      dom.clickEl(btn);
    };
    if (delay && window.startCountdown) window.startCountdown(delay, 'btnVerify', click);
    else click();
  };

  const start = () => {
    intervalId = setInterval(fillAndSubmit, 100);
    fillAndSubmit();
  };

  // Login page loaded with form ready — record first success even if auto-submit is off.
  const firstSuccessInterval = setInterval(() => {
    const email = dom.visibleInputs('input[type="text"], input[type="email"]')[0];
    const btn = document.getElementById('btnVerify');
    if (email && btn) {
      saveLoginFirstSuccess();
      clearInterval(firstSuccessInterval);
    }
  }, 100);

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
