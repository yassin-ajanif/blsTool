/**
 * Step 5 — Slot hold on /slotselection.
 * Too Many / empty / no calendar → immediately New Appointment (keep cookies).
 * No 5s reload loop.
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
    // Empty shell = no real calendar
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

  function goNewAppointment(reason) {
    if (recovering) return;
    recovering = true;
    rememberHold();
    setOverlay('Slots unavailable — New Appointment…', 'restricted');
    chrome.runtime.sendMessage({
      action: 'debugLog',
      event: 'slotHold.slotsUnavailable',
      data: { url: location.href, reason }
    });
    chrome.runtime.sendMessage({
      action: 'slotHoldRecoverVisa',
      url: location.href
    });
  }

  function evaluate() {
    if (!isSlotSelection()) return;

    rememberHold();

    if (hasRealCalendar()) {
      recovering = false;
      setOverlay('Calendar ready', 'ok');
      chrome.runtime.sendMessage({
        action: 'debugLog',
        event: 'slotHold.calendarReady',
        data: { url: location.href }
      });
      return;
    }

    if (isSlotsUnavailable()) {
      const reason = isRestrictedBanner() ? 'restrictedOrNoSlotsText' : 'emptyPage';
      goNewAppointment(reason);
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
