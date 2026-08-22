/**
 * Step 5 — Slot hold on /slotselection.
 * Too Many / empty → show page 3s → visitorId wipe → New Appointment.
 */
(function () {
  if (window.__fanikaSlotHoldInstalled) return;
  window.__fanikaSlotHoldInstalled = true;

  const OVERLAY_STATUS_ID = 'fanika-public-ip-overlay-status';
  const OVERLAY_ID = 'fanika-public-ip-overlay';

  let recovering = false;

  function pathLower() {
    return (location.pathname || '').toLowerCase();
  }

  function isSlotSelection() {
    return pathLower().includes('/appointment/slotselection');
  }

  function isAccessDeniedBanner() {
    const h1 = (document.querySelector('h1')?.textContent || '').trim();
    if (/access\s+denied/i.test(h1)) return true;
    const snippet = (document.body?.innerText || '').slice(0, 800);
    return /access\s+denied/i.test(snippet);
  }

  function isRestrictedBanner() {
    const h1 = (document.querySelector('h1')?.textContent || '').trim();
    const bodyText = (document.body?.innerText || '').slice(0, 2000);
    return (
      h1.includes('Too Many') ||
      h1.includes('Temporarily Restricted') ||
      /service\s+unavailable/i.test(h1) ||
      /access\s+denied/i.test(h1) ||
      /no slots are available/i.test(bodyText) ||
      /currently,?\s*no slots/i.test(bodyText)
    );
  }

  function isSlotsUnavailable() {
    if (!isSlotSelection()) return false;
    if (isRestrictedBanner()) return true;
    return !(document.querySelector('header') || document.querySelector('footer'));
  }

  function hasRealCalendar() {
    if (!isSlotSelection()) return false;
    if (isRestrictedBanner()) return false;
    return !!(document.querySelector('header') || document.querySelector('footer'));
  }

  function setOverlay(text, phase) {
    const el = document.getElementById(OVERLAY_ID);
    if (!el) {
      chrome.runtime.sendMessage({
        action: 'overlayStatus',
        text,
        phase: phase || 'info'
      });
      return;
    }
    const status = document.getElementById(OVERLAY_STATUS_ID);
    if (status) {
      status.style.display = 'block';
      status.textContent = text;
    }
    if (phase === 'error' || phase === 'restricted') {
      el.style.color = '#b71c1c';
      el.style.background = 'rgba(255,235,238,0.96)';
      el.style.borderColor = '#c62828';
    } else if (phase === 'ok') {
      el.style.color = '#1b5e20';
      el.style.background = 'rgba(232,245,233,0.96)';
      el.style.borderColor = '#2e7d32';
    }
  }

  function rememberHold() {
    chrome.runtime.sendMessage({
      action: 'slotHoldRemember',
      url: location.href
    });
  }

  function recoverVisitorReload(reason) {
    if (recovering) return;
    recovering = true;
    rememberHold();
    setOverlay('Invalid slots — New Appointment in 3s…', 'restricted');
    chrome.runtime.sendMessage({
      action: 'debugLog',
      event: 'slotHold.slotsUnavailable',
      data: { url: location.href, reason, protocol: 'wait3s→visitorWipe→NA' }
    });
    chrome.runtime.sendMessage(
      {
        action: 'slotHoldRecoverVisa',
        url: location.href
      },
      (res) => {
        if (chrome.runtime.lastError || !(res?.ok || res?.success || res?.bounced)) {
          recovering = false;
          return;
        }
        if (res.action === 'fallbackNewAppointment') {
          setOverlay('Slots fail — New Appointment', 'ok');
        }
      }
    );
  }

  function evaluate() {
    if (!isSlotSelection()) return;

    rememberHold();

    if (hasRealCalendar()) {
      recovering = false;
      setOverlay('Calendar ready', 'ok');
      chrome.runtime.sendMessage({ action: 'slotHoldFightSuccess' });
      chrome.runtime.sendMessage({
        action: 'debugLog',
        event: 'slotHold.calendarReady',
        data: { url: location.href }
      });
      return;
    }

    if (isSlotsUnavailable()) {
      if (isAccessDeniedBanner()) return;
      const reason = isRestrictedBanner() ? 'restrictedOrNoSlotsText' : 'emptyPage';
      recoverVisitorReload(reason);
    }
  }

  function mount() {
    if (!isSlotSelection()) return;
    evaluate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  setTimeout(evaluate, 400);
  setTimeout(evaluate, 1200);
})();
