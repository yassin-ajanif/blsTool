/**
 * Early bounce: if kicked to home/error (etc.) while slot-hold is active, snap back ASAP.
 */
(function () {
  const lower = (location.href || '').toLowerCase();
  if (!lower.includes('blsspainmorocco.net')) return;
  if (lower.includes('/appointment/slotselection')) return;
  if (lower.includes('/appointment/applicantselection')) return;
  if (lower.includes('/account/login')) return;

  const looksKickout =
    lower.includes('/home/error') ||
    lower.includes('/home/index') ||
    lower.includes('/appointment/pendingappointment') ||
    lower.includes('/appointment/newappointment') ||
    lower.includes('/appointment/appointmentcaptcha');

  // VisaType is a recovery target — never bounce away from it here.
  if (lower.includes('/appointment/visatype')) return;

  if (!looksKickout) return;

  chrome.runtime.sendMessage({ action: 'slotHoldBounceIfNeeded', url: location.href }, (res) => {
    if (chrome.runtime.lastError) return;
    if (res?.bounced && res.url) {
      location.replace(res.url);
    }
  });
})();
