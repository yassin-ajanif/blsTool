/**
 * Background: remember SlotSelection + VisaType URLs.
 * Empty calendar → stay/reload slots.
 * Too Many → go back to saved VisaType and restart fill/submit.
 * MV3 cannot clear Location headers — we snap the tab instead.
 */
(function (global) {
  const HOLD_STORE = 'fanikaSlotHoldByTab';
  const RELOAD_HINT_MS = 5000;

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

  function isAllowedLeaveUrl(url) {
    const lower = (url || '').toLowerCase();
    if (!lower) return false;
    if (lower.includes('/appointment/applicantselection')) return true;
    if (lower.includes('/appointment/liveness')) return true;
    if (lower.includes('/appointment/payment')) return true;
    if (lower.includes('/account/login')) return true;
    return false;
  }

  /** Kick-outs we bounce away from while hold is active. VisaType is allowed (recovery). */
  function isKickoutUrl(url) {
    const lower = (url || '').toLowerCase();
    if (!lower || !isBls(lower)) return false;
    if (isSlotSelectionUrl(lower)) return false;
    if (isVisaTypeUrl(lower)) return false;
    if (isAllowedLeaveUrl(lower)) return false;

    if (lower.includes('/home/error')) return true;
    if (lower.includes('/home/index')) return true;
    if (lower.includes('/appointment/pendingappointment')) return true;
    if (lower.includes('/appointment/appointmentcaptcha')) return true;
    if (lower.includes('/appointment/newappointment')) return true;
    return false;
  }

  function looksLikeTooManyKickout(url) {
    const lower = (url || '').toLowerCase();
    if (!lower) return false;
    if (lower.includes('/appointment/newappointment') && (lower.includes('msg=') || lower.includes('?msg'))) {
      return true;
    }
    if (lower.includes('/home/error')) return true;
    return false;
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
      updatedAt: Date.now()
    };
    await setHoldMap(map);
    if (typeof debugLog === 'function') {
      await debugLog('slotHold.rememberVisa', { tabId, url });
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
    if (!hold?.active || !hold.url) return false;
    if (typeof debugLog === 'function') {
      await debugLog('slotHold.bounce', { tabId, fromUrl, backTo: hold.url });
    }
    return navigateHold(tabId, hold.url, 'Kick-out blocked — back to slots (reload in 5s)');
  }

  /** Too Many: restart from VisaType (fresh submit → new SlotSelection attempt). */
  async function bounceToVisaType(tabId, fromUrl) {
    const hold = await getHold(tabId);
    if (!hold?.active) return false;
    const target = hold.visaTypeUrl || hold.url;
    if (!target) return false;

    if (typeof debugLog === 'function') {
      await debugLog('slotHold.bounceVisa', {
        tabId,
        fromUrl,
        backTo: target,
        usedVisa: Boolean(hold.visaTypeUrl)
      });
    }

    return navigateHold(
      tabId,
      target,
      hold.visaTypeUrl
        ? 'Too Many — back to Visa Type (restart)'
        : 'Too Many — no Visa URL saved, back to slots'
    );
  }

  async function recoverFromTooMany(tabId, fromUrl) {
    const hold = await getHold(tabId);
    if (!hold?.active) return false;
    if (hold.visaTypeUrl) return bounceToVisaType(tabId, fromUrl);
    return bounceToSlots(tabId, fromUrl);
  }

  async function onTabUrl(tabId, url) {
    if (!url || !isBls(url)) return;

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
    if (!hold?.active) return;

    if (isKickoutUrl(url)) {
      if (looksLikeTooManyKickout(url)) {
        await recoverFromTooMany(tabId, url);
      } else {
        await bounceToSlots(tabId, url);
      }
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
    bounceToSlots,
    bounceToVisaType,
    recoverFromTooMany,
    installSlotHoldGuard,
    isSlotSelectionUrl,
    isVisaTypeUrl,
    isKickoutUrl,
    looksLikeTooManyKickout
  };
})(typeof self !== 'undefined' ? self : this);
