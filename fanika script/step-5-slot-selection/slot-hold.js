/**
 * Step 5 — Slot hold on /slotselection.
 * Empty calendar → reload slots every 5s.
 * Too Many / restricted → after 5s go back to saved VisaType and restart.
 */
(function () {
  if (window.__fanikaSlotHoldInstalled) return;
  window.__fanikaSlotHoldInstalled = true;

  const RELOAD_MS = 5000;
  const OVERLAY_STATUS_ID = 'fanika-public-ip-overlay-status';
  const OVERLAY_ID = 'fanika-public-ip-overlay';

  let reloadTimer = null;
  let tickTimer = null;
  let deadline = 0;
  let active = false;

  function pathLower() {
    return (location.pathname || '').toLowerCase();
  }

  function isSlotSelection() {
    return pathLower().includes('/appointment/slotselection');
  }

  function isRestrictedBanner() {
    const h1 = (document.querySelector('h1')?.textContent || '').trim();
    return (
      h1.includes('Too Many') ||
      h1.includes('Temporarily Restricted') ||
      /service\s+unavailable/i.test(h1) ||
      /access\s+denied/i.test(h1)
    );
  }

  function isEmptyOrRestrictedSlots() {
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
    } else if (phase === 'reload') {
      el.style.color = '#e65100';
      el.style.background = 'rgba(255,243,224,0.96)';
      el.style.borderColor = '#ef6c00';
    } else if (phase === 'ok') {
      el.style.color = '#1b5e20';
      el.style.background = 'rgba(232,245,233,0.96)';
      el.style.borderColor = '#2e7d32';
    }
  }

  function clearTimers() {
    if (reloadTimer) {
      clearTimeout(reloadTimer);
      reloadTimer = null;
    }
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  }

  function stopHold(reason) {
    if (!active && !reloadTimer) return;
    active = false;
    clearTimers();
    if (reason) setOverlay(reason, 'ok');
  }

  function rememberHold() {
    chrome.runtime.sendMessage({
      action: 'slotHoldRemember',
      url: location.href
    });
  }

  function startHold() {
    if (!isEmptyOrRestrictedSlots()) return;
    if (active) return;

    active = true;
    rememberHold();

    const restricted = isRestrictedBanner();
    const phase = restricted ? 'restricted' : 'reload';
    const label = restricted
      ? 'Too Many — back to Visa Type in'
      : 'Empty calendar — reload slots in';

    chrome.runtime.sendMessage({
      action: 'debugLog',
      event: 'slotHold.start',
      data: { url: location.href, restricted, recoverVisa: restricted }
    });

    deadline = Date.now() + RELOAD_MS;

    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setOverlay(label + ' ' + left + 's', phase);
    };
    tick();
    tickTimer = setInterval(tick, 250);

    reloadTimer = setTimeout(() => {
      clearTimers();
      active = false;
      if (restricted) {
        setOverlay('Restarting from Visa Type…', 'restricted');
        chrome.runtime.sendMessage({
          action: 'slotHoldRecoverVisa',
          url: location.href
        });
      } else {
        setOverlay('Reloading slots…', 'reload');
        location.reload();
      }
    }, RELOAD_MS);
  }

  function evaluate() {
    if (!isSlotSelection()) return;

    rememberHold();

    if (hasRealCalendar()) {
      stopHold('Calendar ready');
      chrome.runtime.sendMessage({
        action: 'debugLog',
        event: 'slotHold.calendarReady',
        data: { url: location.href }
      });
      return;
    }

    startHold();
  }

  document.addEventListener(
    'click',
    (e) => {
      if (!active && !isEmptyOrRestrictedSlots()) return;
      const a = e.target?.closest?.('a[href]');
      if (!a) return;
      const href = a.href || '';
      if (!href || href.includes('slotselection')) return;
      e.preventDefault();
      e.stopPropagation();
      setOverlay('Blocked leave — staying on slots', 'restricted');
    },
    true
  );

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
