/**
 * Background: remember SlotSelection + VisaType URLs.
 * Fight / Too Many on NA · VisaType · slots → erase visitorId_current + reload same page.
 * No redirect to NewAppointment.
 */
(function (global) {
  const HOLD_STORE = 'fanikaSlotHoldByTab';
  const RECOVER_COOLDOWN_MS = 5000;
  const RELOAD_HINT_MS = 5000;
  const DEFAULT_NEW_APPOINTMENT =
    'https://www.blsspainmorocco.net/MAR/appointment/newappointment';
  const VISITOR_COOKIE_NAMES = ['visitorId_current'];
  const recoverInFlight = new Set();
  const lastRecoverAt = new Map();

  function isBls(url) {
    try {
      const h = new URL(url).hostname.toLowerCase();
      return h === 'www.blsspainmorocco.net' || h === 'blsspainmorocco.net';
    } catch (_) {
      return false;
    }
  }

  function isBlsCookieDomain(domain) {
    const d = String(domain || '')
      .replace(/^\./, '')
      .toLowerCase();
    return d === 'blsspainmorocco.net' || d.endsWith('.blsspainmorocco.net');
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

  /** Pages where fight Too Many → wipe visitor + reload (not cold login wipe). */
  function isFightFlowUrl(url) {
    return (
      isNewAppointmentUrl(url) ||
      isVisaTypeUrl(url) ||
      isSlotSelectionUrl(url)
    );
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

  /** Kick-outs while fight active. */
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

  /**
   * Same-page reload target: keep path; drop msg= error ticket.
   * Kick-out off-flow → last slots or VisaType hold URL.
   */
  function samePageReloadUrl(fromUrl, hold) {
    const holdFallback = hold?.url || hold?.visaTypeUrl || null;

    if (!isFightFlowUrl(fromUrl) && isKickoutUrl(fromUrl)) {
      return holdFallback || fromUrl;
    }

    try {
      const u = new URL(fromUrl);
      u.searchParams.delete('msg');
      const q = u.searchParams.toString();
      return u.origin + u.pathname + (q ? '?' + q : '');
    } catch (_) {
      return fromUrl;
    }
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

  async function wipeVisitorIdCookies() {
    const cookies = await chrome.cookies.getAll({});
    let count = 0;
    for (const cookie of cookies) {
      if (!VISITOR_COOKIE_NAMES.includes(cookie.name)) continue;
      if (!isBlsCookieDomain(cookie.domain)) continue;
      const domain = cookie.domain.replace(/^\./, '');
      const scheme = cookie.secure ? 'https' : 'http';
      const url = `${scheme}://${domain}${cookie.path || '/'}`;
      try {
        await chrome.cookies.remove({
          url,
          name: cookie.name,
          storeId: cookie.storeId
        });
        count++;
      } catch (err) {
        console.warn('[fanika] visitor cookie remove failed:', cookie.name, err.message);
      }
    }
    if (typeof debugLog === 'function') {
      await debugLog('cookies.visitorWipe.done', { count, names: VISITOR_COOKIE_NAMES });
    }
    return count;
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
    return navigateHold(tabId, hold.url, 'Kick-out blocked — back to slots');
  }

  /**
   * Fight protocol: erase visitorId_current only, reload same page (no NewAppointment redirect).
   */
  async function recoverFightVisitorReload(tabId, fromUrl) {
    const hold = await getHold(tabId);
    const url = fromUrl || '';
    const forceFlow =
      isFightFlowUrl(url) ||
      looksLikeTooManyKickout(url) ||
      (isKickoutUrl(url) && isNewAppointmentUrl(url));

    if (!canRecover(hold) && !forceFlow && !isFightFlowUrl(url)) {
      return { ok: false, reason: 'noHold' };
    }
    if (recoverInFlight.has(tabId)) return { ok: false, reason: 'inFlight' };

    const last = lastRecoverAt.get(tabId) || 0;
    if (Date.now() - last < RECOVER_COOLDOWN_MS) {
      return { ok: false, reason: 'cooldown' };
    }

    recoverInFlight.add(tabId);
    lastRecoverAt.set(tabId, Date.now());

    try {
      const target = samePageReloadUrl(url, hold);
      const wiped = await wipeVisitorIdCookies();

      if (typeof debugLog === 'function') {
        await debugLog('slotHold.recoverVisitorReload', {
          tabId,
          fromUrl: url,
          backTo: target,
          visitorCookiesWiped: wiped,
          wipeAuth: false,
          rotate: false
        });
      }

      const navOk = await navigateHold(
        tabId,
        target,
        'Too Many — cleared visitorId_current, reloading…'
      );
      return { ok: navOk, target, visitorCookiesWiped: wiped };
    } finally {
      recoverInFlight.delete(tabId);
    }
  }

  /** @deprecated — fight recovery is visitor wipe + reload */
  async function recoverToNewAppointment(tabId, fromUrl) {
    return recoverFightVisitorReload(tabId, fromUrl);
  }

  async function bounceToVisaType(tabId, fromUrl) {
    const res = await recoverFightVisitorReload(tabId, fromUrl);
    return Boolean(res?.ok);
  }

  async function recoverFromTooMany(tabId, fromUrl) {
    const res = await recoverFightVisitorReload(tabId, fromUrl);
    return Boolean(res?.ok);
  }

  async function onTabUrl(tabId, url) {
    if (!url || !isBls(url)) return;

    if (isCleanNewAppointmentUrl(url)) {
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
      await recoverFightVisitorReload(tabId, url);
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
      lastRecoverAt.delete(tabId);
    });

    if (typeof debugLog === 'function') {
      debugLog('slotHold.guard.installed', {
        reloadHintMs: RELOAD_HINT_MS,
        protocol: 'visitorWipe+reload'
      });
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
    recoverFightVisitorReload,
    wipeVisitorIdCookies,
    samePageReloadUrl,
    newAppointmentUrl,
    installSlotHoldGuard,
    isSlotSelectionUrl,
    isVisaTypeUrl,
    isNewAppointmentUrl,
    isCleanNewAppointmentUrl,
    isFightFlowUrl,
    isKickoutUrl,
    looksLikeTooManyKickout
  };
})(typeof self !== 'undefined' ? self : this);
