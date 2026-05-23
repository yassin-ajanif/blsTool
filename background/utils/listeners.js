/**
 * Background Event Listeners Registry
 * All Chrome API listener registrations
 * Handler functions are implemented in background.js
 */

function registerAllListeners() {

  // ========================= RUNTIME LISTENERS =========================

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender)
      .then(response => {
        sendResponse(response);
      })
      .catch(error => {
        console.error('Message handling error:', error);
        sendResponse({ error: error.message });
      });
    return true; // Will respond asynchronously
  });

  // ========================= STORAGE LISTENERS =========================

  chrome.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName === 'local') {
      // Handle selectedClientId change
      if (changes.selectedClientId) {
        state.selectedClientId = changes.selectedClientId.newValue;

        // Fetch current clients and update cache
        if (state.selectedClientId) {
          const data = await new Promise((resolve) => {
            chrome.storage.local.get('clients', (result) => resolve(result));
          });
          state.updateCachedClientData(data.clients);
        } else {
          state.selectedClientData = null;
        }
      }

      // Handle clients array change
      if (changes.clients) {
        state.updateCachedClientData(changes.clients.newValue);
      }
    }
  });

  // ========================= TAB LISTENERS =========================

  chrome.tabs.onRemoved.addListener((tabId) => {
    subscriptionManager.removeTab(tabId);
  });

  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url &&
      (tab.url.includes('chrome-extension://' + chrome.runtime.id + '/options/'))) {

      // Ensure global auth data is loaded
      await authDataPromise;

      // Handle authentication based on token and deviceHash presence
      if (authData?.token && authData?.deviceHash) {
        // Both exist: fetch dashboard directly without verification
        fetchDashboardData('clients', authData.token, authData.deviceHash);
      } else if (authData?.token && !authData?.deviceHash) {
        // Only token exists: verify first
        const verified = await verifyExtension(authData.token);

        if (verified) {
          // Fetch dashboard data if verification successful
          fetchDashboardData('clients', authData.token, authData.deviceHash); // Use token for both params when no deviceHash
        }
      }
    }
  });

  // ========================= BROWSER ACTION LISTENERS =========================

  chrome.browserAction.onClicked.addListener(async function () {
    chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html') });
  });

  // ========================= COOKIE LISTENERS =========================

  // Listen for .AspNetCore.Cookies changes
  // chrome.cookies.onChanged.addListener((changeInfo) => {
  //   // Check if it's the AspNetCore.Cookies cookie
  //   if (changeInfo.cookie && changeInfo.cookie.name === '.AspNetCore.Cookies') {

  //     // Check if cookie was added or updated (not removed)
  //     if (!changeInfo.removed && changeInfo.cookie.expirationDate) {
  //       // Convert Unix timestamp to ISO string format
  //       const expiryDate = new Date(changeInfo.cookie.expirationDate * 1000).toISOString();

  //       // Save to storage
  //       chrome.storage.local.set({
  //         SiteCookiesExpiry: expiryDate
  //       }, () => {
  //         console.log(`[Cookies] Saved .AspNetCore.Cookies expiry: ${expiryDate}`);

  //         // Send update message to all tabs
  //         chrome.tabs.query({}, (tabs) => {
  //           tabs.forEach(tab => {
  //             if (tab.url && (tab.url.includes('blsspainmorocco.net') || tab.url.includes('blsportugal.com'))) {
  //               chrome.tabs.sendMessage(tab.id, {
  //                 action: 'cookieExpiryUpdate',
  //                 cookieExpiry: expiryDate
  //               }, () => {
  //                 if (chrome.runtime.lastError) {
  //                   // Tab might not have content script, ignore
  //                 }
  //               });
  //             }
  //           });
  //         });
  //       });
  //     } else if (changeInfo.removed) {
  //       // Cookie was removed, clear the expiry from storage
  //       chrome.storage.local.remove('SiteCookiesExpiry', () => {
  //         console.log('[Cookies] Cleared .AspNetCore.Cookies expiry (cookie removed)');
  //       });
  //     }
  //   }
  // });

  console.log('All listeners registered successfully');
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { registerAllListeners };
}