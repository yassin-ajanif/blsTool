/**
 * Appointment Captcha Page — v2.1 Fixed
 * MutationObserver pattern: token setup, captcha solve, OnCaptchaSubmit fix → countdown
 */
(async () => {
  let settings = {}, solving = false, status = { token: false, captcha: false, submitFixed: false };
  try { settings = (await window.getExtensionData()).settings || {}; } catch (e) { }

  const fixOnCaptchaSubmit = () => {
    if (!window.OnCaptchaSubmit || status.submitFixed) return;
    const funcStr = window.OnCaptchaSubmit.toString();
    if (funcStr.includes("ShowLoader()") || funcStr.includes("HideLoader()")) {
      try {
        const body = funcStr.match(/\{([\s\S]*)\}/)?.[1];
        if (body) window.OnCaptchaSubmit = new Function(
          body.replace(/ShowLoader\(\)/g, 'ShowExtLoader()')
              .replace(/HideLoader\(\)/g, 'HideExtLoader()')
        );
      } catch (e) { }
    }
    status.submitFixed = true;
    checkReady();
  };

  let allDone = false;

  const checkReady = () => {
    if (!Object.values(status).includes(false) && !allDone) {
      // Button should already exist at this point
      const btn = document.getElementById('btnVerify');
      if (!btn) return; // No button = nothing to do
      allDone = true;
      intervalId && clearInterval(intervalId); // Stop interval - we're done!
      const delay = settings?.submitPages?.appointmentCaptchaPageMs || 0;
      if (settings?.submitPages?.appointmentCaptchaPage) {
        delay && window.startCountdown ? window.startCountdown(delay, 'btnVerify') : !delay && jQuery('#btnVerify').click();
      }
    }
  };

  let intervalId;
  const checkElements = () => {
    if (!jQuery || allDone) { intervalId && clearInterval(intervalId); return; }
    const $ = jQuery;

    if (!status.token) {
      const $token = $('input:hidden[name="__RequestVerificationToken"]');
      if ($token.length) {
        $.ajaxSetup({ beforeSend: (xhr, opts) => opts.type.toUpperCase() === "POST" && xhr.setRequestHeader("RequestVerificationToken", $token.val()) });
        status.token = true;
        checkReady();
      }
    }

    if (!status.captcha && !solving) {
      const $container = $('#captcha-main-div .main-div-container').first();
      const $imgs = $container.find('img');
      if ($container.length && $imgs.length && $imgs.toArray().every(img => img.complete)) {
        const svc = settings?.captchaService?.activeService || 'nocaptchaai';
        const needsKey = ['nocaptchaai', 'truecaptcha'].includes(svc.toLowerCase());
        if (!needsKey || settings?.captchaService?.[svc]?.apiKey) {
          solving = true;
          CaptchaSolver.solve({}, () => { status.captcha = true; checkReady(); });
        }
      }
    }

    if (!status.submitFixed && window.OnCaptchaSubmit) fixOnCaptchaSubmit();
  };

  const startInterval = () => {
    document.body ? (intervalId = setInterval(checkElements, 100)) : setTimeout(startInterval, 10);
  };
  startInterval();
})();