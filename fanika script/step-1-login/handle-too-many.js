/**
 * Step 1 — Too Many handler
 * If URL has msg= OR fight hold active → only recoverToNewAppointment (never wipe→login).
 * Else (cold login/etc.): wipe×3 → rotate → login via handleTooMany.
 */
(function () {
  if (window.__fanikaStep1TooManyInstalled) return;
  window.__fanikaStep1TooManyInstalled = true;

  let handled = false;
  let checking = false;

  function isTooManyPage() {
    const h1Text = document.querySelector('h1')?.textContent?.trim() || '';
    return h1Text.includes('Too Many') || h1Text.includes('Temporarily Restricted');
  }

  function hasMsgParam() {
    const href = location.href || '';
    return /[?&]msg=/i.test(href);
  }

  function setLocalOverlay(text, phase) {
    const status = document.getElementById('fanika-public-ip-overlay-status');
    const el = document.getElementById('fanika-public-ip-overlay');
    if (!status || !el) return;
    status.style.display = 'block';
    status.textContent = text;
    if (phase === 'rotating') {
      el.style.color = '#e65100';
      el.style.background = 'rgba(255,243,224,0.96)';
      el.style.borderColor = '#ef6c00';
    } else if (phase === 'wipe') {
      el.style.color = '#1a237e';
      el.style.background = 'rgba(227,242,253,0.96)';
      el.style.borderColor = '#1565c0';
    } else if (phase === 'error' || phase === 'restricted') {
      el.style.color = '#b71c1c';
      el.style.background = 'rgba(255,235,238,0.96)';
      el.style.borderColor = '#c62828';
    } else if (phase === 'ok') {
      el.style.color = '#1b5e20';
      el.style.background = 'rgba(232,245,233,0.96)';
      el.style.borderColor = '#2e7d32';
    }
  }

  function isSlotSelectionPath() {
    if (window.fanikaPage?.isSlotSelection?.()) return true;
    return (location.pathname || '').toLowerCase().includes('/appointment/slotselection');
  }

  function recoverNewAppointmentOnly(reason) {
    setLocalOverlay('Slots/kick-out — New Appointment…', 'restricted');
    chrome.runtime.sendMessage({
      action: 'debugLog',
      event: 'page.tooMany.recoverNAOnly',
      data: {
        url: location.href,
        reason,
        h1: document.querySelector('h1')?.textContent?.trim()
      }
    });

    chrome.runtime.sendMessage(
      { action: 'slotHoldRecoverVisa', url: location.href },
      (response) => {
        checking = false;
        if (chrome.runtime.lastError) {
          console.error('[fanika/step-1-login]', chrome.runtime.lastError.message);
          setLocalOverlay('New Appointment redirect error', 'error');
          handled = false;
          return;
        }
        console.log('[fanika/step-1-login] recoverNA only:', response);
        if (response?.bounced || response?.success || response?.ok) {
          setLocalOverlay('Redirected to New Appointment', 'ok');
        } else {
          setLocalOverlay('New Appointment redirect failed', 'error');
          handled = false;
        }
      }
    );
  }

  function requestHandleTooMany() {
    if (handled || checking) return;
    if (isSlotSelectionPath()) return;

    checking = true;
    handled = true;
    console.log('[fanika/step-1-login] Too Many detected');

    chrome.runtime.sendMessage({
      action: 'debugLog',
      event: 'page.tooMany.detected',
      data: { url: location.href, h1: document.querySelector('h1')?.textContent?.trim() }
    });

    // msg= kick-out → only NewAppointment recovery (never handleTooMany)
    if (hasMsgParam()) {
      recoverNewAppointmentOnly('msgParam');
      return;
    }

    // Fight hold active → only NewAppointment (never handleTooMany wipe→login)
    chrome.runtime.sendMessage(
      { action: 'slotHoldBounceIfNeeded', url: location.href },
      (holdRes) => {
        if (chrome.runtime.lastError) {
          // Fall through to cold handleTooMany
        } else if (holdRes?.bounced || holdRes?.holdActive) {
          if (holdRes.bounced) {
            checking = false;
            setLocalOverlay('Redirected to New Appointment', 'ok');
            return;
          }
          // hold active but not bounced yet (e.g. VisaType Too Many) → recover only
          recoverNewAppointmentOnly('fightHold');
          return;
        }

        // Cold path only — no fight / no msg=
        setLocalOverlay('Too Many — handling…', 'wipe');
        chrome.runtime.sendMessage(
          {
            action: 'handleTooMany',
            pageUrl: location.href
          },
          (response) => {
            checking = false;
            if (chrome.runtime.lastError) {
              console.error('[fanika/step-1-login]', chrome.runtime.lastError.message);
              setLocalOverlay('Too Many handler error', 'error');
              handled = false;
              return;
            }
            console.log('[fanika/step-1-login] Too Many response:', response);

            if (response?.action === 'redirectNewAppointment') {
              setLocalOverlay('Redirected to New Appointment', 'ok');
              handled = false;
              return;
            }

            if (response?.action === 'rotateFailed' || response?.action === 'ipUnchanged') {
              setLocalOverlay(
                response.error || 'IP rotate failed — retry in a moment',
                'error'
              );
              setTimeout(() => {
                handled = false;
              }, 5000);
              return;
            }
          }
        );
      }
    );
  }

  function check() {
    if (isSlotSelectionPath()) return;
    if (isTooManyPage()) requestHandleTooMany();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', check);
  } else {
    check();
  }

  setInterval(check, 1000);
})();
