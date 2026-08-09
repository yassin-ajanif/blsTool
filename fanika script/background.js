/**
 * Fanika standalone background (MV3 service worker)
 * Step 1: open login URL; wipe ALL cookies + reload on Too Many.
 */

const LOGIN_URL = 'https://www.blsspainmorocco.net/MAR/account/login';

function openLogin() {
  chrome.tabs.create({ url: LOGIN_URL });
  return { success: true, url: LOGIN_URL };
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
  if (tabId != null) {
    await chrome.tabs.reload(tabId);
  }
  console.log(`[fanika] Wiped ${count} cookies and reloaded tab ${tabId}`);
  return { success: true, count, reloaded: tabId != null };
}

// Toolbar icon → open login
chrome.action.onClicked.addListener(() => {
  openLogin();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const action = message?.action || message?.type;

  if (action === 'openStep1Login' || action === 'openLogin') {
    sendResponse(openLogin());
    return false;
  }

  if (action === 'wipeAllCookiesAndReload') {
    wipeAllCookiesAndReload(sender?.tab?.id)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // async
  }

  sendResponse({ success: false, error: `Unknown action: ${action}` });
  return false;
});

console.log('[fanika] Background ready — click the icon to open login');
