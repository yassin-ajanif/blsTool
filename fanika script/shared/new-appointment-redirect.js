/**
 * Shared rules: skip home/index (and post-login hops) → go straight to newappointment.
 */
(function (global) {
  const PATH_MARKERS = [
    '/mar/home/index',
    '/mar/newcaptcha/logincaptchasubmit',
    '/mar/newcaptcha/loginsubmit',
    '/mar/account/loginsubmit',
    '/mar/account/changepassword'
  ];

  const SKIP_IF_INCLUDES = [
    '/mar/appointment/newappointment',
    '/mar/appointment/visatype',
    '/mar/appointment/appointmentcaptcha',
    '/mar/account/login',
    '/mar/newcaptcha/logincaptcha'
  ];

  function isBlsSpain(href) {
    try {
      const host = new URL(href).hostname.toLowerCase();
      return host === 'www.blsspainmorocco.net' || host === 'blsspainmorocco.net';
    } catch (_) {
      return false;
    }
  }

  function shouldRedirectToNewAppointment(href) {
    if (!href || !isBlsSpain(href)) return false;
    const lower = href.toLowerCase();
    if (SKIP_IF_INCLUDES.some((p) => lower.includes(p))) return false;
    if (PATH_MARKERS.some((p) => lower.includes(p))) return true;
    try {
      const u = new URL(href);
      const path = u.pathname.replace(/\/+$/, '') || '/';
      if (path === '/' || path === '/mar') return true;
    } catch (_) {}
    return false;
  }

  function newAppointmentUrl(href) {
    try {
      return new URL('/MAR/appointment/newappointment', new URL(href).origin).href;
    } catch (_) {
      return 'https://www.blsspainmorocco.net/MAR/appointment/newappointment';
    }
  }

  global.fanikaRedirect = {
    isBlsSpain,
    shouldRedirectToNewAppointment,
    newAppointmentUrl
  };
})(
  typeof window !== 'undefined'
    ? window
    : typeof self !== 'undefined'
      ? self
      : this
);
