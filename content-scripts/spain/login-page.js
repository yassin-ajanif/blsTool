/**
 * Login page script - v4.2 Interval Approach
 * Interval checking every 100ms instead of MutationObserver
 */
(async function () {
  let client = {}, settings = {}, status = { email: false, token: false, submitReady: false };
  try {
    const data = await window.getExtensionData();
    [client, settings] = [data.client || {}, data.settings || {}];
  } catch (e) { client = { name: 'Default', email: '', password: '' }; }

  const fixOnSubmitVerify = () => {
    if (!window.OnSubmitVerify || status.submitReady) return;
    const funcStr = window.OnSubmitVerify.toString();
    if (funcStr.includes("ShowLoader()") || funcStr.includes("HideLoader()")) {
      try {
        const body = funcStr.match(/\{([\s\S]*)\}/)?.[1];
        if (body) window.OnSubmitVerify = new Function(
          body.replace(/ShowLoader\(\)/g, 'ShowExtLoader()')
              .replace(/HideLoader\(\)/g, 'HideExtLoader()')
        );
      } catch (e) { }
    }
    status.submitReady = true;
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
      if (settings?.submitPages?.loginPage) {
        try { localStorage.setItem('logintime', new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })); } catch (e) { }
        const delay = settings.submitPages.loginPageMs || 0;
        delay && window.startCountdown ? window.startCountdown(delay, 'btnVerify') : !delay && $('#btnVerify').click();
      }
    }
  };

  let intervalId;
  const checkElements = () => {
    if (typeof $ === 'undefined' || allDone) { intervalId && clearInterval(intervalId); return; }

    if (!status.email) {
      const $email = $('input[type="text"]:visible').first();
      if ($email.length && client?.email) {
        $email.val(client.email).trigger('input').trigger('change');
        status.email = true;
        checkReady();
      }
    }

    if (!status.token) {
      const $token = $('input:hidden[name="__RequestVerificationToken"]');
      if ($token.length) {
        $.ajaxSetup({ beforeSend: (xhr, opts) => opts.type.toUpperCase() === "POST" && xhr.setRequestHeader("RequestVerificationToken", $token.val()) });
        status.token = true;
        checkReady();
      }
    }

    if (!status.submitReady && window.OnSubmitVerify) fixOnSubmitVerify();
  };

  const startInterval = () => {
    document.body ? (intervalId = setInterval(checkElements, 100)) : setTimeout(startInterval, 10);
  };
  startInterval();
})();