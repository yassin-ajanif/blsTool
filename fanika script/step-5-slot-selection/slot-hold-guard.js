/**
 * Background: remember SlotSelection + VisaType URLs.
 * Fight kick-out / slots unavailable → clean NewAppointment (keep cookies, no rotate).
 * MV3 cannot clear Location headers — we snap the tab instead.
 */
(function (global) {
  const HOLD_STORE = 'fanikaSlotHoldByTab';
  const RELOAD_HINT_MS = 5000;
  const DEFAULT_NEW_APPOINTMENT =
    'https://www.blsspainmorocco.net/MAR/appointment/newappointment';
  const recoverInFlight = new Set();

  function isBls(url) {
    try {
      const h = new URL(url).hostname.toLowerCase();
      return h === 'www.blsspainmorocco.net' || h === 'blsspainmorocco.net';
    } catch (_) {
      return false;
    }
  }

  function isSlotSelectionUrl(url) {
    return /\/appointment\/slotselection/i.test(url || '');
  }

  function isVisaTypeUrl(url) {
    return /\/appointment\/visatype/i.test(url || '');
  }

  function isNewAppointmentUrl(url) {
    return /\/appointment\/newappointment/i.test(url || '');
  }

  /** Clean NewAppointment (no msg=) — recovery landing; do not bounce away. */
  function isCleanNewAppointmentUrl(url) {
    const lower = (url || '').toLowerCase();
    if (!isNewAppointmentUrl(lower)) return false;
    return !(lower.includes('msg=') || lower.includes('?msg'));
  }

  function newAppointmentUrl(fromUrl) {
    if (typeof fanikaRedirect !== 'undefined' && fanikaRedirect.newAppointmentUrl) {
      return fanikaRedirect.newAppointmentUrl(fromUrl || DEFAULT_NEW_APPOINTMENT);
    }
    try {
      return new URL('/MAR/appointment/newappointment', new URL(fromUrl).origin).href;
    } catch (_) {
      return DEFAULT_NEW_APPOINTMENT;
    }
  }

  function isAllowedLeaveUrl(url) {
    const lower = (url || '').toLowerCase();
    if (!lower) return false;
    if (lower.includes('/appointment/applicantselection')) return true;
    if (lower.includes('/appointment/liveness')) return true;
    if (lower.includes('/appointment/payment')) return true;
    if (lower.includes('/account/login')) return true;
    return false;
  }

  /** Kick-outs while fight active. Clean NewAppointment is recovery target, not kick-out. */
  function isKickoutUrl(url) {
    const lower = (url || '').toLowerCase();
    if (!lower || !isBls(lower)) return false;
    if (isSlotSelectionUrl(lower)) return false;
    if (isVisaTypeUrl(lower)) return false;
    if (isCleanNewAppointmentUrl(lower)) return false;
    if (isAllowedLeaveUrl(lower)) return false;

    if (lower.includes('/home/error')) return true;
    if (lower.includes('/home/index')) return true;
    if (lower.includes('/appointment/pendingappointment')) return true;
    if (lower.includes('/appointment/appointmentcaptcha')) return true;
    // NewAppointment?msg=… (no-slots / errors)
    if (isNewAppointmentUrl(lower)) return true;
    return false;
  }

  function looksLikeTooManyKickout(url) {
    const lower = (url || '').toLowerCase();
    if (!lower) return false;
    if (isNewAppointmentUrl(lower) && (lower.includes('msg=') || lower.includes('?msg'))) {
      return true;
    }
    if (lower.includes('/home/error')) return true;
    return false;
  }

  function canRecover(hold) {
    return Boolean(hold && (hold.active || hold.visaTypeUrl) && (hold.visaTypeUrl || hold.url));
  }

  async function getHoldMap() {
    const store = chrome.storage.session || chrome.storage.local;
    const data = await store.get(HOLD_STORE);
    return data[HOLD_STORE] || {};
  }

  async function setHoldMap(map) {
    const store = chrome.storage.session || chrome.storage.local;
    await store.set({ [HOLD_STORE]: map });
  }

  async function rememberVisaType(tabId, url) {
    if (tabId == null || !isVisaTypeUrl(url)) return;
    const map = await getHoldMap();
    const prev = map[String(tabId)] || {};
    map[String(tabId)] = {
      ...prev,
      visaTypeUrl: url,
      active: true,
      updatedAt: Date.now()
    };
    await setHoldMap(map);
    if (typeof debugLog === 'function') {
      await debugLog('slotHold.rememberVisa', { tabId, url, active: true });
    }
  }

  async function rememberSlotHold(tabId, url) {
    if (tabId == null || !isSlotSelectionUrl(url)) return;
    const map = await getHoldMap();
    const prev = map[String(tabId)] || {};
    map[String(tabId)] = {
      ...prev,
      url,
      active: true,
      updatedAt: Date.now()
    };
    await setHoldMap(map);
    if (typeof debugLog === 'function') {
      await debugLog('slotHold.remember', { tabId, url, hasVisa: Boolean(prev.visaTypeUrl) });
    }
  }

  async function clearSlotHold(tabId) {
    if (tabId == null) return;
    const map = await getHoldMap();
    if (!map[String(tabId)]) return;
    delete map[String(tabId)];
    await setHoldMap(map);
    if (typeof debugLog === 'function') {
      await debugLog('slotHold.clear', { tabId });
    }
  }

  async function getHold(tabId) {
    const map = await getHoldMap();
    return map[String(tabId)] || null;
  }

  async function navigateHold(tabId, targetUrl, overlayText) {
    if (!targetUrl) return false;
    try {
      await chrome.tabs.update(tabId, { url: targetUrl });
    } catch (err) {
      if (typeof debugLog === 'function') {
        await debugLog('slotHold.nav.fail', { tabId, error: err.message, targetUrl });
      }
      return false;
    }
    setTimeout(() => {
      chrome.tabs
        .sendMessage(tabId, {
          action: 'overlayStatus',
          text: overlayText || 'Recovering…',
          phase: 'error'
        })
        .catch(() => {});
    }, 400);
    return true;
  }

  async function bounceToSlots(tabId, fromUrl) {
    const hold = await getHold(tabId);
    if (!canRecover(hold) || !hold.url) return false;
    if (typeof debugLog === 'function') {
      await debugLog('slotHold.bounce', { tabId, fromUrl, backTo: hold.url });
    }
    return navigateHold(tabId, hold.url, 'Kick-out blocked — back to slots (reload in 5s)');
  }

  /**
   * Redirect to clean NewAppointment only (keep cookies, no IP rotate).
   * Allowed when fight hold is active OR fromUrl is a msg=/kick-out page.
   */
  async function recoverToNewAppointment(tabId, fromUrl) {
    const hold = await getHold(tabId);
    const forceMsgKick =
      looksLikeTooManyKickout(fromUrl) ||
      (isKickoutUrl(fromUrl) && isNewAppointmentUrl(fromUrl));
    if (!canRecover(hold) && !forceMsgKick) return { ok: false, reason: 'noHold' };
    if (recoverInFlight.has(tabId)) return { ok: false, reason: 'inFlight' };
    recoverInFlight.add(tabId);

    try {
      const target = newAppointmentUrl(
        fromUrl || hold?.visaTypeUrl || hold?.url || DEFAULT_NEW_APPOINTMENT
      );

      if (typeof debugLog === 'function') {
        await debugLog('slotHold.recoverNA', {
          tabId,
          fromUrl,
          backTo: target,
          wipe: false,
          rotate: false,
          forceMsgKick
        });
      }

      await clearSlotHold(tabId);
      const navOk = await navigateHold(tabId, target, 'Slots unavailable — New Appointment');
      return { ok: navOk, target };
    } finally {
      recoverInFlight.delete(tabId);
    }
  }

  /** @deprecated name kept for callers — now redirect → NewAppointment */
  async function bounceToVisaType(tabId, fromUrl) {
    const res = await recoverToNewAppointment(tabId, fromUrl);
    return Boolean(res?.ok);
  }

  async function recoverFromTooMany(tabId, fromUrl) {
    const res = await recoverToNewAppointment(tabId, fromUrl);
    return Boolean(res?.ok);
  }

  async function onTabUrl(tabId, url) {
    if (!url || !isBls(url)) return;

    if (isCleanNewAppointmentUrl(url)) {
      // Recovery landing — leave hold cleared / do not re-bounce
      return;
    }

    if (isVisaTypeUrl(url)) {
      await rememberVisaType(tabId, url);
      return;
    }

    if (isSlotSelectionUrl(url)) {
      await rememberSlotHold(tabId, url);
      return;
    }

    if (isAllowedLeaveUrl(url)) {
      await clearSlotHold(tabId);
      return;
    }

    const hold = await getHold(tabId);
    if (!canRecover(hold)) return;

    if (isKickoutUrl(url)) {
      await recoverToNewAppointment(tabId, url);
    }
  }

  function installSlotHoldGuard() {
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      const url = changeInfo.url || tab?.url;
      if (!url) return;
      if (changeInfo.url || changeInfo.status === 'loading' || changeInfo.status === 'complete') {
        onTabUrl(tabId, url);
      }
    });

    chrome.tabs.onRemoved.addListener((tabId) => {
      clearSlotHold(tabId);
    });

    if (typeof debugLog === 'function') {
      debugLog('slotHold.guard.installed', { reloadHintMs: RELOAD_HINT_MS });
    }
  }

  global.fanikaSlotHold = {
    rememberSlotHold,
    rememberVisaType,
    clearSlotHold,
    getHold,
    canRecover,
    bounceToSlots,
    bounceToVisaType,
    recoverFromTooMany,
    recoverToNewAppointment,
    newAppointmentUrl,
    installSlotHoldGuard,
    isSlotSelectionUrl,
    isVisaTypeUrl,
    isNewAppointmentUrl,
    isCleanNewAppointmentUrl,
    isKickoutUrl,
    looksLikeTooManyKickout
  };
})(typeof self !== 'undefined' ? self : this);
