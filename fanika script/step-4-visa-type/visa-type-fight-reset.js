/**
 * Reset VisaType reload counter when the real form is present (not an error page).
 */
(function () {
  if (window.__fanikaVisaTypeFightResetInstalled) return;
  window.__fanikaVisaTypeFightResetInstalled = true;

  if (!window.fanikaPage?.isVisaType()) return;

  function check() {
    if (window.fanikaPage.isRestrictedBanner()) return;
    if (!document.getElementById('btnSubmit')) return;
    chrome.runtime.sendMessage({ action: 'slotHoldFightSuccess' });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', check);
  } else {
    check();
  }
  setTimeout(check, 800);
})();
