/**
 * Fanika background
 * Fight / Too Many on NA·VisaType·slots: visitor reload limits; NA×3 → login wipe.
 * Cold Too Many (login/etc.): wipe×3 → rotation wipe → login.
 * Access Denied: rotation wipe immediately.
 */
importScripts(
  'load-env.js',
  'services/debugger.js',
  'proxy-rotation.js',
  'services/rotate-proxies.js',
  'shared/new-appointment-redirect.js',
  'step-5-slot-selection/slot-hold-guard.js'
);

const LOGIN_URL = 'https://www.blsspainmorocco.net/MAR/account/login';
const IP_LOOKUP_URL = 'https://ipv4.icanhazip.com/';
const IP_GEO_URL = 'https://ipwho.is/';
const TRY_STORE_KEY = 'fanikaLoginSubmitTries';
const TOO_MANY_WIPE_KEY = 'fanikaTooManyWipeCount';
const MAX_WIPES_BEFORE_ROTATE = 3;
let cachedPublicIp = null;
let cachedIpGeo = { ip: null, city: null, country: null };
let ipFetchPromise = null;
const rotationWipeInFlight = new Set();

async function ensureTrueCaptchaFromEnv() {
  // Avoid reloading env repeatedly.
  const current = await chrome.storage.local.get(['fanikaSettings']);
  const existing = current?.fanikaSettings?.captchaService?.truecaptcha || {};
  if (existing?.userId && existing?.apiKey) return;

  try {
    const env = await loadEnv('.env');
    const userId = env.USER_ID || env.USERID || env.TRUECAPTCHA_USER_ID || env.TRUECAPTCHA_USERID || '';
    const apiKey = env.API_KEY || env.APIKEY || env.TRUECAPTCHA_API_KEY || env.TRUECAPTCHA_APIKEY || '';
    if (!userId || !apiKey) {
      await debugLog('truecaptcha.env.missing', { hasUserId: Boolean(userId), hasApiKey: Boolean(apiKey) });
      return;
    }

    const next = current?.fanikaSettings || {};
    next.captchaService = {
      ...(next.captchaService || {}),
      activeService: 'truecaptcha',
      nocaptchaai: { enabled: false, apiKey: '' },
      servercaptcha: { enabled: false, endpoint: '' },
      truecaptcha: { enabled: true, userId, apiKey }
    };
    await chrome.storage.local.set({ fanikaSettings: next });
    await debugLog('truecaptcha.env.loaded', { userIdPresent: Boolean(userId), apiKeyPresent: Boolean(apiKey) });
  } catch (err) {
    await debugLog('truecaptcha.env.load.fail', { error: err.message });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPublicIp(force) {
  if (!force && ipFetchPromise) return ipFetchPromise;

  const run = (async () => {
    try {
      const res = await fetch(IP_LOOKUP_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`IP lookup HTTP ${res.status}`);
      const text = (await res.text()).trim();
      if (!text) throw new Error('Empty IP response');
      cachedPublicIp = text;
      await debugLog('ip.fetch.ok', { ip: cachedPublicIp });
      return cachedPublicIp;
    } catch (err) {
      console.error('[fanika] IP lookup failed:', err);
      await debugLog('ip.fetch.fail', { error: err.message });
      throw err;
    } finally {
      ipFetchPromise = null;
    }
  })();

  if (!force) ipFetchPromise = run;
  return run;
}

async function lookupIpCity(ip) {
  if (!ip) return null;
  if (cachedIpGeo.ip === ip && cachedIpGeo.city) return cachedIpGeo.city;

  try {
    const res = await fetch(IP_GEO_URL + encodeURIComponent(ip), { cache: 'no-store' });
    if (!res.ok) throw new Error(`Geo lookup HTTP ${res.status}`);
    const data = await res.json();
    if (data?.success !== true) throw new Error(data?.message || 'Geo lookup failed');
    cachedIpGeo = {
      ip,
      city: data.city || null,
      country: data.country || null
    };
    await debugLog('ip.geo.ok', cachedIpGeo);
    return cachedIpGeo.city;
  } catch (err) {
    await debugLog('ip.geo.fail', { ip, error: err.message });
    cachedIpGeo = { ip, city: null, country: null };
    return null;
  }
}

async function getPublicIpInfo(force) {
  const ip = await fetchPublicIp(force);
  const city = await lookupIpCity(ip);
  return { ip, city, country: cachedIpGeo.country };
}

function tryStore() {
  return chrome.storage.session || chrome.storage.local;
}

async function getTooManyWipeCount() {
  const store = tryStore();
  const stored = await store.get(TOO_MANY_WIPE_KEY);
  return Number(stored[TOO_MANY_WIPE_KEY] || 0) || 0;
}

async function setTooManyWipeCount(n) {
  const store = tryStore();
  await store.set({ [TOO_MANY_WIPE_KEY]: Math.max(0, n) });
}

async function setLoginSubmitTry(tabId, count) {
  const store = tryStore();
  const stored = await store.get(TRY_STORE_KEY);
  const map = { ...(stored[TRY_STORE_KEY] || {}) };
  if (count <= 0) delete map[tabId];
  else map[tabId] = count;
  await store.set({ [TRY_STORE_KEY]: map });
}

async function notifyOverlay(tabId, text, phase) {
  if (tabId == null) return;
  try {
    await chrome.tabs.sendMessage(tabId, {
      action: 'overlayStatus',
      text,
      phase: phase || 'info'
    });
  } catch (_) {
    // content script may not be ready yet
  }
  await debugLog('overlay.status', { tabId, text, phase });
}

async function goToLogin(tabId) {
  if (tabId != null) await setLoginSubmitTry(tabId, 0);
  const url = LOGIN_URL + '?fresh=1';
  if (tabId != null) {
    await chrome.tabs.update(tabId, { url });
  } else {
    await chrome.tabs.create({ url });
  }
}

async function wipeAllCookies() {
  const cookies = await chrome.cookies.getAll({});
  let count = 0;
  for (const cookie of cookies) {
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
      console.warn('[fanika] cookie remove failed:', cookie.name, err.message);
    }
  }
  await debugLog('cookies.wipe.done', { count });
  return count;
}

async function openLogin() {
  await debugLog('login.open.start', { url: LOGIN_URL });
  const cookieCount = await wipeAllCookies();
  await debugLog('login.open.cookiesWiped', { count: cookieCount });
  try {
    await fetchPublicIp(true);
  } catch (_) {}
  chrome.tabs.create({ url: LOGIN_URL + '?fresh=1' });
  return {
    success: true,
    url: LOGIN_URL + '?fresh=1',
    cookiesWiped: cookieCount,
    ip: cachedPublicIp
  };
}

/**
 * Wipe site data + rotate until public IP changes, then open login.
 * Used for Access Denied and after Too Many wipe streak.
 */
async function runRotationWipeProtocol(tabId, meta) {
  const key = tabId != null ? String(tabId) : 'global';
  if (rotationWipeInFlight.has(key)) {
    return { success: false, reason: 'inFlight' };
  }
  rotationWipeInFlight.add(key);

  const info = meta || {};
  try {
    await debugLog('rotationWipe.start', { tabId, ...info });
    await notifyOverlay(tabId, 'Wipe + rotate IP…', 'rotating');

    let waited = null;
    try {
      waited = await rotateProxies.rotateUntilIpChanges();
    } catch (err) {
      await debugLog('rotationWipe.fail', { tabId, error: err.message, ...info });
      await notifyOverlay(tabId, 'Rotate failed — ' + err.message, 'error');
      return { success: false, action: 'rotateFailed', error: err.message };
    }

    if (!waited.changed) {
      await notifyOverlay(
        tabId,
        'IP unchanged after rotate (' + (waited.ip || '?') + ')',
        'error'
      );
      await debugLog('rotationWipe.unchanged', { tabId, ...waited, ...info });
      return { success: false, action: 'ipUnchanged', ...waited };
    }

    cachedPublicIp = waited.ip;
    await lookupIpCity(waited.ip);
    const citySuffix = cachedIpGeo.city ? ' (' + cachedIpGeo.city + ')' : '';
    await notifyOverlay(tabId, 'New IP: ' + waited.ip + citySuffix + ' — login…', 'ok');
    await setTooManyWipeCount(0);
    await goToLogin(tabId);
    await debugLog('rotationWipe.done', { tabId, ...waited, ...info });
    return {
      success: true,
      action: 'rotationWipe',
      previousIp: waited.previousIp,
      ip: waited.ip,
      redirected: LOGIN_URL
    };
  } finally {
    rotationWipeInFlight.delete(key);
  }
}

async function handleAccessDenied(tabId, pageUrl) {
  return runRotationWipeProtocol(tabId, {
    url: pageUrl || '',
    reason: 'accessDenied'
  });
}

/** Cold Too Many: full cookie wipe → login (streak 1..3, then rotation wipe). */
async function handleColdTooManyLogin(tabId, pageUrl) {
  const url = pageUrl || '';
  let wipeStreak = await getTooManyWipeCount();
  await debugLog('tooMany.cold.start', { tabId, url, wipeStreak });

  if (wipeStreak >= MAX_WIPES_BEFORE_ROTATE) {
    const res = await runRotationWipeProtocol(tabId, { url, wipeStreak, via: 'tooMany' });
    if (res.success) {
      return { ...res, action: 'rotated' };
    }
    return { ...res, wipeStreak };
  }

  wipeStreak += 1;
  await setTooManyWipeCount(wipeStreak);
  await notifyOverlay(
    tabId,
    'Too Many — cookie wipe ' + wipeStreak + '/' + MAX_WIPES_BEFORE_ROTATE,
    'wipe'
  );

  const count = await wipeAllCookies();
  await debugLog('tooMany.cookiesWiped', { count, url, wipeStreak });
  await goToLogin(tabId);
  await debugLog('tooMany.redirect', {
    url: LOGIN_URL,
    tabId,
    cookiesWiped: count,
    wipeStreak
  });
  return {
    success: true,
    action: 'goLogin',
    count,
    wipeStreak,
    maxWipes: MAX_WIPES_BEFORE_ROTATE,
    redirected: LOGIN_URL,
    ip: cachedPublicIp
  };
}

async function runFightRecoverOrEscalate(tabId, pageUrl) {
  const res = await fanikaSlotHold.recoverFightVisitorReload(tabId, pageUrl);
  if (res?.action !== 'escalateLoginWipe') return res;

  await debugLog('tooMany.naEscalateLogin', {
    tabId,
    url: pageUrl,
    attempt: res.attempt,
    max: res.max
  });
  await notifyOverlay(tabId, 'NA reload failed 3× — login wipe…', 'wipe');
  return handleColdTooManyLogin(tabId, pageUrl);
}

async function handleTooMany(tabId, pageUrl) {
  const url = pageUrl || '';

  // Fight flow / msg= / hold: visitor reload (VisaType/slots/NA limits) or escalate login wipe.
  const hold = tabId != null ? await fanikaSlotHold.getHold(tabId) : null;
  const hasMsg = /[?&]msg=/i.test(url);
  const fightFlow = fanikaSlotHold.isFightFlowUrl(url);
  if (hasMsg || fightFlow || fanikaSlotHold.canRecover(hold)) {
    const res = await runFightRecoverOrEscalate(tabId, url);
    const softOk = res?.reason === 'inFlight' || res?.reason === 'cooldown';
    const loginActions = res?.action === 'goLogin' || res?.action === 'rotated';
    await notifyOverlay(
      tabId,
      loginActions
        ? res.action === 'rotated'
          ? 'New IP — opening login…'
          : 'Cookie wipe — opening login…'
        : res?.ok
          ? res.action === 'fallbackNewAppointment'
            ? 'Reload failed 3× — New Appointment'
            : res.action === 'naReloadRetry'
              ? 'NA reload ' + (res.attempt || '?') + '/3 — visitorId cleared…'
              : res.action === 'reloadRetry'
                ? 'Reload ' + (res.attempt || '?') + '/3 — visitorId cleared…'
                : 'Cleared visitorId_current — reloading…'
          : softOk
            ? 'Reload already in progress / cooldown'
            : 'visitorId_current reload failed',
      res?.ok || softOk || loginActions ? 'ok' : 'error'
    );
    return {
      success: Boolean(res?.ok || softOk || loginActions),
      action: res?.action || 'visitorReload',
      redirected: res?.target || res?.redirected || null,
      reason: res?.reason || null,
      visitorCookiesWiped: res?.visitorCookiesWiped ?? null,
      holdUrl: hold?.url || null,
      visaTypeUrl: hold?.visaTypeUrl || null,
      wipeStreak: res?.wipeStreak,
      attempt: res?.attempt,
      max: res?.max
    };
  }

  return handleColdTooManyLogin(tabId, url);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const action = message?.action || message?.type;
  debugLog('message.in', {
    action,
    tabId: sender?.tab?.id,
    url: sender?.tab?.url,
    from: sender?.url
  });

  if (action === 'ensureTrueCaptchaFromEnv') {
    ensureTrueCaptchaFromEnv()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === 'debugLog') {
    debugLog(message.event || 'client.log', message.data)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === 'overlayStatus') {
    const tabId = sender?.tab?.id;
    notifyOverlay(tabId, message.text, message.phase)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === 'slotHoldRemember') {
    const tabId = sender?.tab?.id;
    fanikaSlotHold
      .rememberSlotHold(tabId, message.url || sender?.tab?.url)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === 'slotHoldRememberVisa') {
    const tabId = sender?.tab?.id;
    fanikaSlotHold
      .rememberVisaType(tabId, message.url || sender?.tab?.url)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === 'slotHoldRecoverVisa') {
    const tabId = sender?.tab?.id;
    const pageUrl = message.url || sender?.tab?.url;
    (async () => {
      try {
        let res = await fanikaSlotHold.recoverFightVisitorReload(tabId, pageUrl);
        if (res?.action === 'escalateLoginWipe') {
          res = await handleColdTooManyLogin(tabId, pageUrl);
        }
        const ok = Boolean(
          res?.ok ||
            res?.success ||
            res?.reason === 'inFlight' ||
            res?.reason === 'cooldown' ||
            res?.action === 'goLogin' ||
            res?.action === 'rotated'
        );
        sendResponse({
          success: ok,
          bounced: Boolean(res?.ok && res?.target),
          ok: res?.ok,
          ...res
        });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (action === 'slotHoldFightSuccess') {
    const tabId = sender?.tab?.id;
    fanikaSlotHold
      .resetVisaSlotsReloadAttempts(tabId)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === 'slotHoldNaFightSuccess') {
    const tabId = sender?.tab?.id;
    fanikaSlotHold
      .resetNaReloadAttempts(tabId)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === 'slotHoldClear') {
    const tabId = sender?.tab?.id ?? message.tabId;
    fanikaSlotHold
      .clearSlotHold(tabId)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === 'slotHoldBounceIfNeeded') {
    const tabId = sender?.tab?.id;
    (async () => {
      const from = message.url || sender?.tab?.url || '';
      const hold = await fanikaSlotHold.getHold(tabId);
      const hasMsg = /[?&]msg=/i.test(from);

      // msg= / kick-out → visitor wipe + same-page (or hold) reload
      if (hasMsg || fanikaSlotHold.isKickoutUrl(from)) {
        if (!fanikaSlotHold.canRecover(hold) && !hasMsg && !fanikaSlotHold.isFightFlowUrl(from)) {
          sendResponse({ success: true, bounced: false, holdActive: false });
          return;
        }
        // Content Too Many handler owns clean NA / VisaType / slots pages
        if (
          fanikaSlotHold.isSlotSelectionUrl(from) ||
          fanikaSlotHold.isVisaTypeUrl(from) ||
          fanikaSlotHold.isCleanNewAppointmentUrl(from)
        ) {
          sendResponse({
            success: true,
            bounced: false,
            holdActive: Boolean(hold && fanikaSlotHold.canRecover(hold)),
            url: fanikaSlotHold.samePageReloadUrl(from, hold)
          });
          return;
        }

        await debugLog('slotHold.earlyBounce', {
          tabId,
          from,
          via: 'visitorWipe+reload',
          wipeRotate: false,
          hasMsg
        });

        const res = await fanikaSlotHold.recoverFightVisitorReload(tabId, from);
        const softOk = res?.reason === 'inFlight' || res?.reason === 'cooldown';
        sendResponse({
          success: Boolean(res?.ok || softOk),
          bounced: Boolean(res?.ok),
          holdActive: Boolean(hold && fanikaSlotHold.canRecover(hold)),
          url: res?.target || fanikaSlotHold.samePageReloadUrl(from, hold),
          action: 'visitorReload',
          reason: res?.reason || null
        });
        return;
      }

      if (!fanikaSlotHold.canRecover(hold)) {
        sendResponse({ success: true, bounced: false, holdActive: false });
        return;
      }
      sendResponse({
        success: true,
        bounced: false,
        holdActive: true,
        url: hold.visaTypeUrl || hold.url || fanikaSlotHold.samePageReloadUrl(from, hold)
      });
    })().catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === 'getDebugLog') {
    getDebugLog()
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === 'clearDebugLog') {
    clearDebugLog()
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === 'openStep1Login' || action === 'openLogin') {
    openLogin()
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === 'wipeAllCookies') {
    wipeAllCookies()
      .then((count) => sendResponse({ success: true, count }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === 'getPublicIp') {
    getPublicIpInfo(false)
      .then((info) => sendResponse({ success: true, ...info }))
      .catch((err) => sendResponse({ success: false, error: err.message, ip: null, city: null }));
    return true;
  }

  if (action === 'getTooManyWipeCount') {
    getTooManyWipeCount()
      .then((wipeStreak) => sendResponse({ success: true, wipeStreak, max: MAX_WIPES_BEFORE_ROTATE }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (
    action === 'rotateProxy' ||
    action === 'rotateProxies' ||
    action === 'enableProxy' ||
    action === 'disableProxy' ||
    action === 'rotateProxiesStatus'
  ) {
    if (action === 'rotateProxy' || action === 'rotateProxies') {
      const tabId = sender?.tab?.id;
      (async () => {
        await notifyOverlay(tabId, 'Rotating IP…', 'rotating');
        const waited = await rotateProxies.rotateUntilIpChanges();
        if (waited.changed) {
          cachedPublicIp = waited.ip;
          await lookupIpCity(waited.ip);
          await setTooManyWipeCount(0);
          const citySuffix = cachedIpGeo.city ? ' (' + cachedIpGeo.city + ')' : '';
          await notifyOverlay(tabId, 'New IP: ' + waited.ip + citySuffix, 'ok');
        } else {
          await notifyOverlay(tabId, 'IP unchanged after rotate', 'error');
        }
        sendResponse({ success: waited.changed, ...waited });
      })().catch(async (err) => {
        await notifyOverlay(tabId, 'Rotate failed: ' + err.message, 'error');
        sendResponse({ success: false, error: err.message });
      });
      return true;
    }

    debugLog('proxy.action.disabled', { action }).then(() => {
      sendResponse({
        success: false,
        skipped: true,
        error: 'Unsupported proxy action'
      });
    });
    return true;
  }

  if (action === 'wipeAllCookiesAndReload' || action === 'handleTooMany') {
    handleTooMany(sender?.tab?.id, message.pageUrl || sender?.tab?.url)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === 'handleAccessDenied' || action === 'rotationWipe') {
    runRotationWipeProtocol(sender?.tab?.id, {
      url: message.pageUrl || sender?.tab?.url || '',
      reason: message.reason || action
    })
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === 'injectVisaTypeMain') {
    const tabId = sender?.tab?.id;
    const pageUrl = message.url || sender?.tab?.url;
    if (tabId == null) {
      sendResponse({ success: false, error: 'no tab' });
      return false;
    }
    injectVisaTypeOnTab(tabId, pageUrl)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  sendResponse({ success: false, error: `Unknown action: ${action}` });
  debugLog('message.unknown', { action });
  return false;
});

function isVisaTypeUrl(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.includes('blsspainmorocco.net') && lower.includes('/appointment/visatype');
}

const visaTypeInjectInFlight = new Set();

async function injectVisaTypeOnTab(tabId, pageUrl) {
  if (!tabId || visaTypeInjectInFlight.has(tabId)) return;
  visaTypeInjectInFlight.add(tabId);
  try {
    if (pageUrl) {
      await fanikaSlotHold.rememberVisaType(tabId, pageUrl);
    }
    await debugLog('visaType.inject.main.start', { tabId, url: pageUrl });
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      injectImmediately: true,
      files: [
        'shared/page-helpers.js',
        'shared/countdown.js',
        'step-4-visa-type/visa-type-page.js'
      ]
    });
    await debugLog('visaType.inject.main.done', { tabId, url: pageUrl });
    setTimeout(() => visaTypeInjectInFlight.delete(tabId), 1500);
  } catch (err) {
    visaTypeInjectInFlight.delete(tabId);
    await debugLog('visaType.inject.main.fail', {
      tabId,
      url: pageUrl,
      error: err.message
    });
  }
}

const redirectCooldown = new Map();

async function maybeInterceptNewAppointment(tabId, url) {
  if (!url || !fanikaRedirect?.shouldRedirectToNewAppointment(url)) return;
  const hold = await fanikaSlotHold.getHold(tabId);
  if (fanikaSlotHold.canRecover(hold)) {
    await debugLog('redirect.skip.slotHold', { tabId, url });
    return;
  }
  const now = Date.now();
  const last = redirectCooldown.get(tabId) || 0;
  if (now - last < 600) return;
  redirectCooldown.set(tabId, now);
  const target = fanikaRedirect.newAppointmentUrl(url);
  debugLog('redirect.intercept', { tabId, from: url, to: target });
  chrome.tabs.update(tabId, { url: target });
}

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  const url = info.url || tab.url;
  if (info.status === 'loading' && url) {
    maybeInterceptNewAppointment(tabId, url);
  }
  if (info.status !== 'complete') return;
  if (!isVisaTypeUrl(url || tab.url)) return;
  injectVisaTypeOnTab(tabId, url || tab.url);
});

fanikaSlotHold.installSlotHoldGuard();

rotateProxies.start()
  .then((res) => {
    if (res?.ip) cachedPublicIp = res.ip;
  })
  .catch(() => {});

console.log('[fanika] Ready — VisaType/slots×3→NA; NA Too Many×3→login wipe');

// Best-effort early load: prepares TrueCaptcha creds for content scripts.
ensureTrueCaptchaFromEnv().catch(() => {});
