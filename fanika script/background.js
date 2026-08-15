/**
 * Fanika standalone background (MV3 service worker)
 * Step 1: Chrome-only IPRoyal proxy, public IP overlay, Too Many → wipe + rotate + reload.
 */
importScripts('load-env.js', 'proxy-rotation.js');

const LOGIN_URL = 'https://www.blsspainmorocco.net/MAR/account/login';
const IP_LOOKUP_URL = 'https://ipv4.icanhazip.com/';

/** Cached public IPv4 from icanhazip */
let cachedPublicIp = null;
let ipFetchPromise = null;
let proxyReady = null;

async function ensureProxy() {
  if (!proxyReady) {
    proxyReady = (async () => {
      await proxyRotation.init();
      await proxyRotation.enable();
      return proxyRotation.getConfig();
    })().catch((err) => {
      proxyReady = null;
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
      console.log('[fanika] Public IP:', cachedPublicIp);
      return cachedPublicIp;
    } catch (err) {
      console.error('[fanika] IP lookup failed:', err);
      ipFetchPromise = null;
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
  try {
    await ensureProxy();
  } catch (err) {
    console.warn('[fanika] Opening login without proxy:', err.message);
  }

  try {
    await fetchPublicIp();
  } catch (_) {}

  chrome.tabs.create({ url: LOGIN_URL });
  return {
    success: true,
    url: LOGIN_URL,
    ip: cachedPublicIp,
    proxy: proxyRotation.enabled ? proxyRotation.getConfig() : null
  };
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
  return count;
}

async function wipeAllCookiesAndReload(tabId) {
  const count = await wipeAllCookies();

  // On-demand IP rotate (new sticky session) — not TTL-based
  let proxy = null;
  try {
    await ensureProxy();
    proxy = await proxyRotation.rotate();
  } catch (err) {
    console.warn('[fanika] Proxy rotate failed:', err.message);
  }

  invalidateIpCache();
  try {
    await fetchPublicIp();
  } catch (_) {}

  if (tabId != null) {
    await chrome.tabs.reload(tabId);
  }

  console.log(`[fanika] Wiped ${count} cookies, rotated proxy, reloaded tab ${tabId}`);
  return {
    success: true,
    count,
    reloaded: tabId != null,
    ip: cachedPublicIp,
    proxy
  };
}

chrome.action.onClicked.addListener(() => {
  openLogin();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const action = message?.action || message?.type;

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

  if (action === 'rotateProxy') {
    ensureProxy()
      .then(() => proxyRotation.rotate())
      .then((proxy) => {
        invalidateIpCache();
        return fetchPublicIp()
          .then((ip) => ({ success: true, proxy, ip }))
          .catch(() => ({ success: true, proxy, ip: null }));
      })
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === 'enableProxy') {
    ensureProxy()
      .then((proxy) => sendResponse({ success: true, proxy }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === 'disableProxy') {
    proxyRotation.disable()
      .then(() => {
        proxyReady = null;
        sendResponse({ success: true });
      })
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === 'wipeAllCookiesAndReload') {
    wipeAllCookiesAndReload(sender?.tab?.id)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  sendResponse({ success: false, error: `Unknown action: ${action}` });
  return false;
});

ensureProxy()
  .then(() => fetchPublicIp())
  .catch(() => {});

console.log('[fanika] Background ready — click the icon to open login (Chrome proxy only)');
