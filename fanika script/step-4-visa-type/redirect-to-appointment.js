/**
 * Skip home/index after login — go straight to /MAR/appointment/newappointment.
 */
(function () {
  async function getRedirectDelay() {
    try {
      const data = await window.getFanikaData();
      return data?.settings?.redirects?.pageRedirectMs ?? 0;
    } catch (_) {
      return 0;
    }
  }

  async function maybeRedirect() {
    if (!window.fanikaRedirect?.shouldRedirectToNewAppointment(location.href)) return false;

    const target = window.fanikaRedirect?.newAppointmentUrl(location.href) ||
      location.origin + '/MAR/appointment/newappointment';
    const delay = await getRedirectDelay();

    console.log('[fanika/redirect] → newappointment', delay ? `in ${delay}ms` : 'now');
    chrome.runtime.sendMessage({
      action: 'debugLog',
      event: 'redirect.newAppointment',
      data: { from: location.href, to: target, delayMs: delay }
    });

    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    location.replace(target);
    return true;
  }

  maybeRedirect();
})();
