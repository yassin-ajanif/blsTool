/**
 * After login captcha: home / login submit → new appointment
 * (then step 3 appointment captcha, then step 4 visa type).
 */
(function () {
  async function getRedirectDelay() {
    try {
      const data = await window.getFanikaData();
      return data?.settings?.redirects?.pageRedirectMs ?? 500;
    } catch (_) {
      return 500;
    }
  }

  async function maybeRedirect() {
    if (!window.fanikaPage?.shouldGoNewAppointment()) return false;

    const target = location.origin + '/MAR/appointment/newappointment';
    const delay = await getRedirectDelay();
    console.log('[fanika/redirect] → newappointment in', delay, 'ms');
    chrome.runtime.sendMessage({
      action: 'debugLog',
      event: 'redirect.newAppointment',
      data: { from: location.href, to: target, delayMs: delay }
    });
    await new Promise((r) => setTimeout(r, delay));
    location.href = target;
    return true;
  }

  async function onLoad() {
    await maybeRedirect();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onLoad);
  } else {
    onLoad();
  }
})();
