/**
 * Page detection (case-insensitive) — Trump PageManager equivalent.
 */
(function () {
  function path() {
    return (location.pathname || '').toLowerCase();
  }

  window.fanikaPage = {
    path,
    isLogin() {
      const p = path();
      return p.includes('/account/login') && !p.includes('loginsubmit') && !p.includes('captcha');
    },
    isLoginCaptcha() {
      return path().includes('logincaptcha');
    },
    hasCaptchaUi() {
      return !!(
        document.querySelector('#captcha-main-div') ||
        document.querySelector('.box-label') ||
        document.querySelector('.captcha-img')
      );
    },
    isAppointmentCaptcha() {
      const p = path();
      if (p.includes('appointmentcaptcha')) return true;
      return p.includes('/appointment/newappointment') && this.hasCaptchaUi();
    },
    isVisaType() {
      return path().includes('/appointment/visatype');
    },
    isSlotSelection() {
      return path().includes('/appointment/slotselection');
    },
    isRestrictedBanner() {
      const h1 = (document.querySelector('h1')?.textContent || '').trim();
      return (
        h1.includes('Too Many') ||
        h1.includes('Temporarily Restricted') ||
        /service\s+unavailable/i.test(h1) ||
        /access\s+denied/i.test(h1)
      );
    },
    /** Blank / rate-limited slotselection — keep reloading. */
    isCalendarHoldPage() {
      if (!this.isSlotSelection()) return false;
      if (this.isRestrictedBanner()) return true;
      const hasChrome = !!(document.querySelector('header') || document.querySelector('footer'));
      return !hasChrome;
    },
    shouldGoNewAppointment() {
      if (window.fanikaRedirect) {
        return window.fanikaRedirect.shouldRedirectToNewAppointment(location.href);
      }
      const p = path();
      return (
        p.includes('/home/index') ||
        p.includes('logincaptchasubmit') ||
        p.includes('loginsubmit') ||
        p.includes('/account/changepassword') ||
        p === '/mar' ||
        p === '/'
      );
    }
  };
})();
