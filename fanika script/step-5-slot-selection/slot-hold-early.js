/**
 * Early bounce: kick-out / NewAppointment?msg= while fight active
 * → erase visitorId_current + reload same page (no NewAppointment redirect).
 */
(function () {
  const lower = (location.href || '').toLowerCase();
  if (!lower.includes('blsspainmorocco.net')) return;
  if (lower.includes('/appointment/slotselection')) return;
  if (lower.includes('/appointment/applicantselection')) return;
  if (lower.includes('/account/login')) return;
  if (lower.includes('/appointment/visatype')) return;
  if (
    lower.includes('/appointment/newappointment') &&
    !(lower.includes('msg=') || lower.includes('?msg'))
  ) {
    return;
  }

  const looksKickout =
    lower.includes('/home/error') ||
    lower.includes('/home/index') ||
    lower.includes('/appointment/pendingappointment') ||
    (lower.includes('/appointment/newappointment') &&
      (lower.includes('msg=') || lower.includes('?msg'))) ||
    lower.includes('/appointment/appointmentcaptcha');

  if (!looksKickout) return;

  chrome.runtime.sendMessage({ action: 'slotHoldBounceIfNeeded', url: location.href }, (res) => {
    if (chrome.runtime.lastError) return;
    if (res?.bounced && res.url) {
      location.replace(res.url);
    }
  });
})();
