/**
 * Fanika standalone background (MV3 service worker)
 * Step 1: fetch public IP, open login; wipe ALL cookies + reload on Too Many.
 */

const LOGIN_URL = 'https://www.blsspainmorocco.net/MAR/account/login';
const IP_LOOKUP_URL = 'https://ipv4.icanhazip.com/';

/** Cached public IPv4 from icanhazip */
let cachedPublicIp = null;
let ipFetchPromise = null;

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

async function openLogin() {
  // Resolve IP in background before opening the login page
  try {
    await fetchPublicIp();
  } catch (_) {
    // Still open login even if IP lookup fails; overlay will show error/retry
  }
  chrome.tabs.create({ url: LOGIN_URL });
  return { success: true, url: LOGIN_URL, ip: cachedPublicIp };
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
  // Refresh IP after cookie wipe (egress may be unchanged, but keep cache warm)
  ipFetchPromise = null;
  try {
    await fetchPublicIp();
  } catch (_) {}
  if (tabId != null) {
    await chrome.tabs.reload(tabId);
  }
  console.log(`[fanika] Wiped ${count} cookies and reloaded tab ${tabId}`);
  return { success: true, count, reloaded: tabId != null, ip: cachedPublicIp };
}

// Toolbar icon → fetch IP then open login
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

  if (action === 'wipeAllCookiesAndReload') {
    wipeAllCookiesAndReload(sender?.tab?.id)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  sendResponse({ success: false, error: `Unknown action: ${action}` });
  return false;
});

// Warm IP cache when the service worker starts
fetchPublicIp().catch(() => {});

console.log('[fanika] Background ready — click the icon to open login');
