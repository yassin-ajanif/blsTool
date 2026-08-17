/**
 * Fanika background
 * Too Many: wipe up to 3 times → still 429 → gost helper rotate → wipe → login.
 * chrome.proxy disabled — FoxyProxy + gost-rotate.
 */
importScripts('load-env.js', 'services/debugger.js', 'proxy-rotation.js', 'services/rotate-proxies.js');

const LOGIN_URL = 'https://www.blsspainmorocco.net/MAR/account/login';
const IP_LOOKUP_URL = 'https://ipv4.icanhazip.com/';
const TRY_STORE_KEY = 'fanikaLoginSubmitTries';
const TOO_MANY_WIPE_KEY = 'fanikaTooManyWipeCount';
const MAX_WIPES_BEFORE_ROTATE = 3;
const GOST_HELPER_URL = 'http://127.0.0.1:9999';
const ROTATE_IP_MAX_ATTEMPTS = 12;
const ROTATE_IP_RETRY_MS = 1500;

let cachedPublicIp = null;
let ipFetchPromise = null;

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

/** Drop leftover chrome.proxy so FoxyProxy / gost can own the tunnel. */
async function releaseChromeProxy() {
  try {
    await chrome.proxy.settings.clear({ scope: 'regular' });
    await debugLog('proxy.released', { reason: 'gost-foxyproxy-manual' });
  } catch (err) {
    await debugLog('proxy.release.fail', { error: err.message });
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
  chrome.tabs.create({ url: LOGIN_URL });
  return {
    success: true,
    url: LOGIN_URL,
    cookiesWiped: cookieCount,
    ip: cachedPublicIp
  };
}

/** Ask gost-rotate helper to restart gost with a new sticky session. */
async function callGostRotate() {
  await debugLog('gost.rotate.request', { url: GOST_HELPER_URL + '/rotate' });
  const res = await fetch(GOST_HELPER_URL + '/rotate', {
    method: 'POST',
    cache: 'no-store'
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `gost helper HTTP ${res.status}`);
  }
  await debugLog('gost.rotate.response', body);
  return body;
}

/** After gost restarts, poll icanhazip via FoxyProxy until IP differs. */
async function waitForIpChange(previousIp) {
  let lastIp = previousIp;
  for (let i = 1; i <= ROTATE_IP_MAX_ATTEMPTS; i++) {
    await sleep(ROTATE_IP_RETRY_MS);
    try {
      const ip = await fetchPublicIp(true);
      lastIp = ip;
      if (previousIp && ip && ip !== previousIp) {
        return { changed: true, previousIp, ip, attempt: i };
      }
    } catch (err) {
      await debugLog('gost.waitIp.fail', { attempt: i, error: err.message });
    }
  }
  return { changed: false, previousIp, ip: lastIp, attempt: ROTATE_IP_MAX_ATTEMPTS };
}

async function handleTooMany(tabId, pageUrl) {
  const url = pageUrl || '';
  let wipeStreak = await getTooManyWipeCount();
  await debugLog('tooMany.start', { tabId, url, wipeStreak });

  // Already wiped 3 times and still on 429 → rotate IP first
  if (wipeStreak >= MAX_WIPES_BEFORE_ROTATE) {
    await notifyOverlay(tabId, 'Rotating IP via gost…', 'rotating');
    let previousIp = cachedPublicIp;
    try {
      previousIp = await fetchPublicIp(true);
    } catch (_) {}

    let helperResult = null;
    try {
      helperResult = await callGostRotate();
      if (helperResult?.ip) {
        // helper saw a change through gost; Chrome may need a moment
        await notifyOverlay(
          tabId,
          'IP rotating… ' + (helperResult.previousIp || '?') + ' → ' + helperResult.ip,
          'rotating'
        );
      }
    } catch (err) {
      await debugLog('gost.rotate.fail', { error: err.message });
      await notifyOverlay(
        tabId,
        'Rotate failed — is gost-rotate running? ' + err.message,
        'error'
      );
      return {
        success: false,
        action: 'rotateFailed',
        error: err.message,
        wipeStreak
      };
    }

    await notifyOverlay(tabId, 'Waiting for new IP…', 'rotating');
    const waited = await waitForIpChange(previousIp || helperResult?.previousIp);
    if (!waited.changed) {
      await notifyOverlay(
        tabId,
        'IP unchanged after rotate (' + (waited.ip || '?') + ') — check gost',
        'error'
      );
      await debugLog('tooMany.ipUnchanged', waited);
      return {
        success: false,
        action: 'ipUnchanged',
        ...waited,
        wipeStreak
      };
    }

    cachedPublicIp = waited.ip;
    await notifyOverlay(tabId, 'New IP: ' + waited.ip + ' — wiping cookies…', 'ok');
    await setTooManyWipeCount(0);
    const count = await wipeAllCookies();
    await goToLogin(tabId);
    await debugLog('tooMany.rotated', { ...waited, cookiesWiped: count });
    return {
      success: true,
      action: 'rotated',
      previousIp: waited.previousIp,
      ip: waited.ip,
      count,
      redirected: LOGIN_URL
    };
  }

  // Wipe streak 1..3
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
    fetchPublicIp(false)
      .then((ip) => sendResponse({ success: true, ip }))
      .catch((err) => sendResponse({ success: false, error: err.message, ip: null }));
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
    // Manual rotate via gost helper (optional)
    if (action === 'rotateProxy' || action === 'rotateProxies') {
      const tabId = sender?.tab?.id;
      (async () => {
        await notifyOverlay(tabId, 'Rotating IP via gost…', 'rotating');
        let previousIp = cachedPublicIp;
        try {
          previousIp = await fetchPublicIp(true);
        } catch (_) {}
        const helperResult = await callGostRotate();
        const waited = await waitForIpChange(previousIp || helperResult?.previousIp);
        if (waited.changed) {
          await setTooManyWipeCount(0);
          await notifyOverlay(tabId, 'New IP: ' + waited.ip, 'ok');
        } else {
          await notifyOverlay(tabId, 'IP unchanged after rotate', 'error');
        }
        sendResponse({ success: waited.changed, ...waited, helper: helperResult });
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
        error: 'Use gost-rotate helper (FoxyProxy)'
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

  sendResponse({ success: false, error: `Unknown action: ${action}` });
  debugLog('message.unknown', { action });
  return false;
});

function isVisaTypeUrl(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  return (
    lower.includes('blsspainmorocco.net') &&
    (lower.includes('/appointment/visatype') ||
      (lower.includes('/appointment/newappointment') && !lower.includes('captcha')))
  );
}

async function injectVisaTypeOnTab(tabId) {
  const helpers = `
    if (!window.__fanikaPageHelpersInstalled) {
      window.__fanikaPageHelpersInstalled = true;
      window.getFanikaData = function () {
        return new Promise(function (resolve, reject) {
          var id = Date.now() + Math.random();
          function handler(e) {
            if (!e.data || e.data.type !== 'FANIKA_DATA_RESPONSE' || e.data.requestId !== id) return;
            window.removeEventListener('message', handler);
            if (e.data.error) reject(new Error(e.data.error));
            else resolve(e.data.data);
          }
          window.addEventListener('message', handler);
          window.postMessage({ type: 'FANIKA_REQUEST_DATA', requestId: id }, '*');
        });
      };
      window.fanikaDebug = function (event, data) {
        window.postMessage({ type: 'FANIKA_DEBUG', event: event, data: data }, '*');
      };
      window.fanikaOverlay = function (text, phase) {
        window.postMessage({ type: 'FANIKA_OVERLAY', text: text, phase: phase }, '*');
      };
    }
  `;

  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      await chrome.tabs.sendMessage(tabId, { action: 'injectVisaType' });
      await debugLog('visaType.inject.sent', { tabId, attempt });
      return;
    } catch (err) {
      await debugLog('visaType.inject.retry', { tabId, attempt, error: err.message });
      if (attempt === 4) break;
      await sleep(400 * attempt);
    }
  }

  try {
    await chrome.tabs.sendMessage(tabId, { action: 'injectScript', script: helpers, path: 'page-helpers' });
    const scripts = ['shared/countdown.js', 'step-4-visa-type/visa-type-page.js'];
    for (const path of scripts) {
      const res = await fetch(chrome.runtime.getURL(path));
      if (!res.ok) continue;
      await chrome.tabs.sendMessage(tabId, {
        action: 'injectScript',
        script: await res.text(),
        path
      });
    }
    await debugLog('visaType.inject.fallback', { tabId });
  } catch (err) {
    await debugLog('visaType.inject.fail', { tabId, error: err.message });
  }
}

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status !== 'complete') return;
  if (!isVisaTypeUrl(tab.url)) return;
  injectVisaTypeOnTab(tabId);
});

releaseChromeProxy()
  .then(() => fetchPublicIp(true))
  .catch(() => {});

console.log('[fanika] Ready — Too Many: wipe×3 then gost rotate @ :9999');

// Best-effort early load: prepares TrueCaptcha creds for content scripts.
ensureTrueCaptchaFromEnv().catch(() => {});
