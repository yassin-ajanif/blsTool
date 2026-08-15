/**
 * Fanika standalone background
 * Too Many → wipe cookies, rotate until IP changes, then go to login.
 */
importScripts('load-env.js', 'services/debugger.js', 'proxy-rotation.js', 'services/rotate-proxies.js');

const LOGIN_URL = 'https://www.blsspainmorocco.net/MAR/account/login';
const IP_LOOKUP_URL = 'https://ipv4.icanhazip.com/';
const LOGIN_SUBMIT_MAX_TRIES = 3;
const TRY_STORE_KEY = 'fanikaLoginSubmitTries';

let cachedPublicIp = null;
let ipFetchPromise = null;
let proxyReady = null;

async function ensureProxy() {
  await debugLog('proxy.ensure.start');
  if (!proxyReady) {
    proxyReady = rotateProxies.start().then(async (started) => {
      await debugLog('proxy.ensure.ok', started);
      return started;
    }).catch(async (err) => {
      proxyReady = null;
      await debugLog('proxy.ensure.fail', { error: err.message });
      console.error('[fanika] Proxy init failed:', err);
      throw err;
    });
  }
  return proxyReady;
}

async function fetchPublicIp() {
  if (ipFetchPromise) return ipFetchPromise;

  ipFetchPromise = (async () => {
    try {
      const res = await fetch(IP_LOOKUP_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`IP lookup HTTP ${res.status}`);
      const text = (await res.text()).trim();
      if (!text) throw new Error('Empty IP response');
      cachedPublicIp = text;
      rotateProxies.lastIp = text;
      await debugLog('ip.fetch.ok', { ip: cachedPublicIp });
      return cachedPublicIp;
    } catch (err) {
      console.error('[fanika] IP lookup failed:', err);
      ipFetchPromise = null;
      await debugLog('ip.fetch.fail', { error: err.message });
      throw err;
    }
  })();

  return ipFetchPromise;
}

function invalidateIpCache() {
  cachedPublicIp = null;
  ipFetchPromise = null;
}

async function openLogin() {
  await debugLog('login.open.start', { url: LOGIN_URL });
  try {
    await ensureProxy();
  } catch (err) {
    console.warn('[fanika] Opening login without proxy:', err.message);
    await debugLog('login.open.proxySkip', { error: err.message });
  }

  try {
    await fetchPublicIp();
  } catch (_) {}

  chrome.tabs.create({ url: LOGIN_URL });
  const result = {
    success: true,
    url: LOGIN_URL,
    ip: cachedPublicIp,
    proxy: rotateProxies.getStatus().proxy
  };
  await debugLog('login.open.done', result);
  return result;
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

function isLoginSubmitUrl(url) {
  return String(url || '').toLowerCase().includes('/account/loginsubmit');
}

function tryStore() {
  return chrome.storage.session || chrome.storage.local;
}

async function getLoginSubmitTry(tabId) {
  const stored = await tryStore().get(TRY_STORE_KEY);
  const map = stored[TRY_STORE_KEY] || {};
  return Number(map[tabId]) || 0;
}

async function setLoginSubmitTry(tabId, count) {
  const store = tryStore();
  const stored = await store.get(TRY_STORE_KEY);
  const map = { ...(stored[TRY_STORE_KEY] || {}) };
  if (count <= 0) delete map[tabId];
  else map[tabId] = count;
  await store.set({ [TRY_STORE_KEY]: map });
}

async function goToLogin(tabId) {
  if (tabId != null) await setLoginSubmitTry(tabId, 0);
  if (tabId != null) {
    await chrome.tabs.update(tabId, { url: LOGIN_URL });
  } else {
    await chrome.tabs.create({ url: LOGIN_URL });
  }
}

async function waitForNewProxy() {
  try {
    await ensureProxy();
    const rotated = await rotateProxies.rotateUntilIpChanges();
    if (rotated.ip) cachedPublicIp = rotated.ip;
    await debugLog('proxy.waitNew', {
      changed: rotated.changed,
      previousIp: rotated.previousIp,
      ip: rotated.ip,
      attempts: rotated.attempts,
      error: rotated.error || null
    });
    return rotated;
  } catch (err) {
    await debugLog('tooMany.rotateFail', { error: err.message });
    return { changed: false, error: err.message };
  }
}

async function handleTooMany(tabId, pageUrl) {
  const url = pageUrl || '';
  await debugLog('tooMany.start', { tabId, url });

  if (isLoginSubmitUrl(url)) {
    const used = await getLoginSubmitTry(tabId);
    const next = used + 1;

    if (next <= LOGIN_SUBMIT_MAX_TRIES) {
      const cookieCount = await wipeAllCookies();
      const rotated = await waitForNewProxy();
      if (!rotated.changed) {
        await debugLog('loginSubmit.skipReload', {
          reason: 'same-proxy',
          try: used,
          ip: rotated.ip,
          cookieCount
        });
        return {
          success: false,
          action: 'ipUnchanged',
          try: used,
          ip: rotated.ip,
          error: rotated.error || 'Same proxy — not reloading (avoid ban)'
        };
      }
      await setLoginSubmitTry(tabId, next);
      await debugLog('loginSubmit.retry', {
        try: next,
        max: LOGIN_SUBMIT_MAX_TRIES,
        cookieCount,
        previousIp: rotated.previousIp,
        ip: rotated.ip,
        sessionId: rotated.sessionId
      });
      if (tabId != null) {
        await chrome.tabs.reload(tabId);
      }
      return {
        success: true,
        action: 'retryLoginSubmit',
        try: next,
        max: LOGIN_SUBMIT_MAX_TRIES,
        previousIp: rotated.previousIp,
        ip: rotated.ip
      };
    }

    await debugLog('loginSubmit.giveUpGoLogin', { tries: used, tabId });
    const cookieCount = await wipeAllCookies();
    const rotated = await waitForNewProxy();
    if (!rotated.changed) {
      await debugLog('loginSubmit.skipGoLogin', { reason: 'same-proxy', ip: rotated.ip, cookieCount });
      return {
        success: false,
        action: 'ipUnchanged',
        tries: LOGIN_SUBMIT_MAX_TRIES,
        ip: rotated.ip,
        error: 'Same proxy — not opening login (avoid ban)'
      };
    }
    await goToLogin(tabId);
    return {
      success: true,
      action: 'goLogin',
      tries: LOGIN_SUBMIT_MAX_TRIES,
      cookiesWiped: cookieCount,
      previousIp: rotated.previousIp,
      ip: rotated.ip,
      redirected: LOGIN_URL
    };
  }

  const count = await wipeAllCookies();
  await debugLog('tooMany.cookiesWiped', { count });
  const rotated = await waitForNewProxy();
  if (!rotated.changed) {
    await debugLog('tooMany.skipRedirect', { reason: 'same-proxy', ip: rotated.ip });
    return {
      success: false,
      action: 'ipUnchanged',
      count,
      ip: rotated.ip,
      error: 'Same proxy — not opening login (avoid ban)'
    };
  }
  await goToLogin(tabId);
  await debugLog('tooMany.redirect', { url: LOGIN_URL, ip: rotated.ip, tabId });
  return {
    success: true,
    action: 'goLogin',
    count,
    redirected: LOGIN_URL,
    previousIp: rotated.previousIp,
    ip: rotated.ip
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

  if (action === 'getPublicIp') {
    if (cachedPublicIp) {
      sendResponse({ success: true, ip: cachedPublicIp });
      return false;
    }
    fetchPublicIp()
      .then((ip) => sendResponse({ success: true, ip }))
      .catch((err) => sendResponse({ success: false, error: err.message, ip: null }));
    return true;
  }

  if (action === 'rotateProxy' || action === 'rotateProxies') {
    ensureProxy()
      .then(() => rotateProxies.rotateUntilIpChanges())
      .then(async (result) => {
        if (result.ip) cachedPublicIp = result.ip;
        await debugLog('proxy.rotateUntilDone', result);
        sendResponse(result);
      })
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === 'rotateProxiesStatus') {
    sendResponse(rotateProxies.getStatus());
    return false;
  }

  if (action === 'enableProxy') {
    ensureProxy()
      .then((started) => sendResponse({ success: true, proxy: started.proxy || started }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === 'disableProxy') {
    rotateProxies.stop()
      .then(() => {
        proxyReady = null;
        sendResponse({ success: true });
      })
      .catch((err) => sendResponse({ success: false, error: err.message }));
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

ensureProxy()
  .then(() => fetchPublicIp())
  .catch(() => {});

console.log('[fanika] Background ready');
