/**
 * Step 2 — Login captcha (Trump logincaptcha-page.js):
 * fill password → solve captcha → click Verify.
 */
(async () => {
  if (!window.fanikaPage?.isLoginCaptcha()) return;

  const dom = window.fanikaDom;
  let client = {};
  let settings = {};
  let solving = false;
  const status = { pwd: false, captcha: false };

  try {
    const data = await window.getFanikaData();
    client = data.client || {};
    settings = data.settings || {};
  } catch (e) {
    console.warn('[fanika/login-captcha]', e);
  }

  chrome.runtime.sendMessage({
    action: 'debugLog',
    event: 'loginCaptcha.start',
    data: { hasPassword: Boolean(client.password), url: location.href }
  });

  if (!client.password) {
    chrome.runtime.sendMessage({
      action: 'overlayStatus',
      text: 'No password on selected client — save client in Options',
      phase: 'error'
    });
  }

  let allDone = false;
  let intervalId;

  function fillPassword() {
    if (status.pwd || !client.password) return;
    const pwds = [...document.querySelectorAll('input[type="password"]')];
    const visible = pwds.filter(dom.isVisible);
    const targets = visible.length ? visible : pwds;
    if (!targets.length) return;
    targets.forEach((el) => dom.setNativeValue(el, client.password));
    status.pwd = true;
    chrome.runtime.sendMessage({
      action: 'debugLog',
      event: 'loginCaptcha.passwordFilled',
      data: { count: targets.length }
    });
  }

  const trySubmit = () => {
    if (!status.pwd || !status.captcha || allDone) return;
    const btn = document.getElementById('btnVerify');
    if (!btn) return;
    allDone = true;
    clearInterval(intervalId);
    chrome.runtime.sendMessage({
      action: 'debugLog',
      event: 'loginCaptcha.ready',
      data: { client: client.name }
    });
    if (!settings?.submitPages?.loginCaptchaPage) return;
    const delay = settings.submitPages.loginCaptchaPageMs || 0;
    const click = () => btn.click();
    if (delay && window.startCountdown) window.startCountdown(delay, 'btnVerify', click);
    else click();
  };

  const checkElements = () => {
    if (allDone) {
      clearInterval(intervalId);
      return;
    }

    fillPassword();

    if (!status.captcha && !solving && typeof CaptchaSolver !== 'undefined') {
      const container =
        document.querySelector('#captcha-main-div .main-div-container') ||
        document.querySelector('#captcha-main-div') ||
        document.querySelector('.main-div-container');
      const imgs = container ? [...container.querySelectorAll('img, .captcha-img')] : [];
      const label = document.querySelector('.box-label');
      if (container && (imgs.length || label)) {
        solving = true;
        console.log('[fanika/login-captcha] solving captcha with TrueCaptcha…');
        chrome.runtime.sendMessage({
          action: 'overlayStatus',
          text: 'Solving captcha (TrueCaptcha)…',
          phase: 'wipe'
        });
        CaptchaSolver.solve({}, () => {
          status.captcha = true;
          trySubmit();
        });
      }
    }

    trySubmit();
  };

  const start = () => {
    intervalId = setInterval(checkElements, 100);
    checkElements();
  };
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
