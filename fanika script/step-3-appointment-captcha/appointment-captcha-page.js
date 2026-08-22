/**
 * Step 3 — Appointment captcha (Trump appointmentcaptcha-page.js).
 * URL: /appointment/newappointment or /appointment/appointmentcaptcha
 * Solve TrueCaptcha → click Verify/Submit.
 */
(async () => {
  if (!window.fanikaPage?.isAppointmentCaptcha()) return;

  let settings = {};
  let solving = false;
  const status = { captcha: false };

  try {
    settings = (await window.getFanikaData()).settings || {};
  } catch (_) {}

  chrome.runtime.sendMessage({
    action: 'debugLog',
    event: 'appointmentCaptcha.start',
    data: { url: location.href }
  });
  chrome.runtime.sendMessage({ action: 'slotHoldNaFightSuccess' });
  chrome.runtime.sendMessage({
    action: 'overlayStatus',
    text: 'Appointment captcha — solving…',
    phase: 'wipe'
  });

  let allDone = false;
  let intervalId;

  function submitBtn() {
    return (
      document.getElementById('btnVerify') ||
      document.getElementById('btnSubmit') ||
      [...document.querySelectorAll('button')].find((b) =>
        /submit|verify/i.test(b.textContent || '')
      )
    );
  }

  const trySubmit = () => {
    if (!status.captcha || allDone) return;
    const btn = submitBtn();
    if (!btn) return;
    allDone = true;
    clearInterval(intervalId);
    chrome.runtime.sendMessage({
      action: 'debugLog',
      event: 'appointmentCaptcha.ready',
      data: { btn: btn.id || btn.textContent }
    });
    const auto = settings?.submitPages?.appointmentCaptchaPage !== false;
    if (!auto) return;
    const delay = settings?.submitPages?.appointmentCaptchaPageMs || 0;
    const click = () => btn.click();
    if (delay && window.startCountdown) window.startCountdown(delay, btn.id || null, click);
    else click();
  };

  const checkElements = () => {
    if (allDone) {
      clearInterval(intervalId);
      return;
    }

    if (!status.captcha && !solving && typeof CaptchaSolver !== 'undefined') {
      const container =
        document.querySelector('#captcha-main-div .main-div-container') ||
        document.querySelector('#captcha-main-div') ||
        document.querySelector('.main-div-container');
      const label = document.querySelector('.box-label');
      const imgs = document.getElementsByClassName('captcha-img');
      if (container || label || imgs.length) {
        solving = true;
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
