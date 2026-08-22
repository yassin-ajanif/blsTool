/**
 * Step 1 — Too Many + Access Denied handler
 * Access Denied → rotation wipe (wipe + rotate IP → login) immediately.
 * Fight VisaType / slots: show page 3s → visitorId wipe → New Appointment.
 * Fight New Appointment Too Many: visitorId wipe + reload (max 3×) → login wipe.
 * Cold Too Many: wipe×3 → rotation wipe → login.
 */
(function () {
  if (window.__fanikaStep1TooManyInstalled) return;
  window.__fanikaStep1TooManyInstalled = true;

  let handled = false;
  let checking = false;

  function isAccessDeniedPage() {
    const h1Text = document.querySelector('h1')?.textContent?.trim() || '';
    if (/access\s+denied/i.test(h1Text)) return true;
    const snippet = (document.body?.innerText || '').slice(0, 800);
    return /access\s+denied/i.test(snippet);
  }

  function isTooManyPage() {
    const h1Text = document.querySelector('h1')?.textContent?.trim() || '';
    return h1Text.includes('Too Many') || h1Text.includes('Temporarily Restricted');
  }

  function hasMsgParam() {
    const href = location.href || '';
    return /[?&]msg=/i.test(href);
  }

  function pathLower() {
    return (location.pathname || '').toLowerCase();
  }

  function isFightFlowPage() {
    const p = pathLower();
    return (
      p.includes('/appointment/newappointment') ||
      p.includes('/appointment/visatype') ||
      p.includes('/appointment/slotselection')
    );
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

  function recoverVisitorReload(reason) {
    setLocalOverlay('Invalid page — New Appointment in 3s…', 'restricted');
    chrome.runtime.sendMessage({
      action: 'debugLog',
      event: 'page.tooMany.recoverVisitorReload',
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
          setLocalOverlay('visitorId_current reload error', 'error');
          handled = false;
          return;
        }
        console.log('[fanika/step-1-login] recoverVisitorReload:', response);
        if (response?.bounced || response?.success || response?.ok) {
          if (response.action === 'goLogin' || response.action === 'rotated') {
            setLocalOverlay(
              response.action === 'rotated'
                ? 'NA failed 3× — new IP, login…'
                : 'NA failed 3× — cookie wipe, login…',
              'wipe'
            );
          } else if (response.action === 'fallbackNewAppointment') {
            setLocalOverlay('VisaType/slots fail — New Appointment', 'ok');
          } else if (response.action === 'naReloadRetry') {
            setLocalOverlay(
              'NA reload ' + (response.attempt || '?') + '/3 — visitorId cleared…',
              'ok'
            );
          } else {
            setLocalOverlay('Cleared visitorId_current — reloading…', 'ok');
          }
        } else if (response?.reason === 'cooldown' || response?.reason === 'inFlight') {
          setLocalOverlay('Reload cooldown — waiting…', 'wipe');
          handled = false;
        } else {
          setLocalOverlay('visitorId_current reload failed', 'error');
          handled = false;
        }
      }
    );
  }

  function requestHandleAccessDenied() {
    if (handled || checking) return;

    checking = true;
    handled = true;
    console.log('[fanika/step-1-login] Access Denied detected');

    chrome.runtime.sendMessage({
      action: 'debugLog',
      event: 'page.accessDenied.detected',
      data: { url: location.href, h1: document.querySelector('h1')?.textContent?.trim() }
    });

    setLocalOverlay('Access Denied — wipe + rotate IP…', 'rotating');
    chrome.runtime.sendMessage(
      { action: 'handleAccessDenied', pageUrl: location.href },
      (response) => {
        checking = false;
        if (chrome.runtime.lastError) {
          console.error('[fanika/step-1-login]', chrome.runtime.lastError.message);
          setLocalOverlay('Rotation wipe error', 'error');
          handled = false;
          return;
        }
        console.log('[fanika/step-1-login] Access Denied response:', response);

        if (response?.success) {
          setLocalOverlay('New IP — opening login…', 'ok');
          return;
        }

        if (response?.reason === 'inFlight') {
          setLocalOverlay('Rotation wipe in progress…', 'wipe');
          handled = false;
          return;
        }

        if (response?.action === 'rotateFailed' || response?.action === 'ipUnchanged') {
          setLocalOverlay(response.error || 'IP rotate failed — retry in a moment', 'error');
          setTimeout(() => {
            handled = false;
          }, 5000);
          return;
        }

        setLocalOverlay('Rotation wipe failed', 'error');
        handled = false;
      }
    );
  }

  function requestHandleTooMany() {
    if (handled || checking) return;

    checking = true;
    handled = true;
    console.log('[fanika/step-1-login] Too Many detected');

    chrome.runtime.sendMessage({
      action: 'debugLog',
      event: 'page.tooMany.detected',
      data: { url: location.href, h1: document.querySelector('h1')?.textContent?.trim() }
    });

    // Fight flow pages / msg= → visitor wipe + same-page reload (never wipe→login, never → NA)
    if (hasMsgParam() || isFightFlowPage()) {
      recoverVisitorReload(hasMsgParam() ? 'msgParam' : 'fightFlowPage');
      return;
    }

    chrome.runtime.sendMessage(
      { action: 'slotHoldBounceIfNeeded', url: location.href },
      (holdRes) => {
        if (chrome.runtime.lastError) {
          // Fall through to cold handleTooMany
        } else if (holdRes?.bounced || holdRes?.holdActive) {
          if (holdRes.bounced) {
            checking = false;
            setLocalOverlay('Cleared visitorId_current — reloading…', 'ok');
            return;
          }
          recoverVisitorReload('fightHold');
          return;
        }

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

            if (response?.action === 'fallbackNewAppointment') {
              setLocalOverlay('VisaType/slots fail — New Appointment', 'ok');
              handled = false;
              return;
            }

            if (
              response?.action === 'redirectNewAppointment' ||
              response?.action === 'visitorReload' ||
              response?.action === 'naReloadRetry'
            ) {
              setLocalOverlay('Cleared visitorId_current — reloading…', 'ok');
              handled = false;
              return;
            }

            if (response?.action === 'goLogin' || response?.action === 'rotated') {
              setLocalOverlay('NA failed 3× — login wipe…', 'wipe');
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
    if (isAccessDeniedPage()) requestHandleAccessDenied();
    else if (isTooManyPage()) requestHandleTooMany();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', check);
  } else {
    check();
  }

  setInterval(check, 1000);
})();
