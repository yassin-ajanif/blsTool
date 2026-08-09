/**
 * Background script for the extension
 *
 * Note: Chrome APIs (storage, tabs, etc.) are used with callback wrappers for proper async handling
 * to ensure compatibility with Manifest V2/V3 differences
 */


// ========================= CONFIGURATION =========================

// Global endpoints object - will be populated from storage
let endpoints = null;
const VERSION = chrome.runtime.getManifest().version;

const CONFIG = {
  // Hardcoded endpoint for token verification
  TOKEN_VERIFY: 'https://trumpservices.org/api/dashboard/tokens/validate',

  // Endpoint to fetch all API endpoints after verification
  ENDPOINTS_FETCH: 'https://trumpservices.org/api/dashboard/endpoints',
  
  // endpoint for the GroupSbmit service
  GROUP_SUBMIT: 'wss://groupsubmit.trumpservices.org',

  // BLS Sites
  BLS_SITES: {
    SPAIN: 'blsspainmorocco.net',
    PORTUGAL: 'blsportugal.com'
  },

  // URL Patterns
  URL_PATTERNS: {
    SLOT_SELECTION_SPAIN: 'https://www.blsspainmorocco.net/MAR/Appointment/SlotSelection*',
    SLOT_SELECTION_PORTUGAL: 'https://morocco.blsportugal.com/MAR/Appointment/SlotSelection*',
    ALL_SPAIN: 'https://www.blsspainmorocco.net/MAR/*',
    ALL_PORTUGAL: 'https://morocco.blsportugal.com/MAR/*',
    WEBFILTER_SPAIN: '*://*.blsspainmorocco.net/*',
    WEBFILTER_PORTUGAL: '*://*.blsportugal.com/*'
  }
};

// ========================= BROWSER ACTION HANDLER =========================


// Load endpoints from storage
async function loadEndpoints() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['endpoints'], (result) => {
      if (result.endpoints) {
        endpoints = result.endpoints;
        console.log('📦 Endpoints loaded from storage');
        resolve(true);
      } else {
        console.log('⚠️ No endpoints in storage');
        resolve(false);
      }
    });
  });
}

// ========================= AUTH STORAGE FUNCTIONS =========================

/**
 * Save auth data to localStorage
 * @param {Object} data - Auth data containing token and/or deviceHash
 */
async function saveAuthData(data) {
  // Get existing auth data first
  const currentAuth = await loadAuthData();

  // Merge with new data (preserving all fields)
  const updatedAuth = {
    token: data.token !== undefined ? data.token : currentAuth.token,
    deviceHash: data.deviceHash !== undefined ? data.deviceHash : currentAuth.deviceHash,
    User: data.User !== undefined ? data.User : currentAuth.User,
    installDate: data.installDate !== undefined ? data.installDate : currentAuth.installDate,
    installVersion: data.installVersion !== undefined ? data.installVersion : currentAuth.installVersion
  };

  // Save to localStorage
  return new Promise((resolve) => {
    chrome.storage.local.set({ auth: updatedAuth }, () => {

      resolve(updatedAuth);
    });
  });
}

/**
 * Load auth data from localStorage
 * @returns {Promise<Object>} Auth data object
 */
async function loadAuthData() {
  return new Promise((resolve) => {
    chrome.storage.local.get('auth', (result) => {
      if (result.auth) {

        resolve(result.auth);
      } else {
        // Try to load from auth.json if no auth data in localStorage
        fetch(chrome.runtime.getURL('auth.json'))
          .then(response => response.json())
          .then(jsonData => {
            const authData = { token: jsonData.token, deviceHash: null, User: null };
            // Don't save here to avoid infinite loop - let verifyExtension handle saving
            resolve(authData);
          })
          .catch(() => {

            resolve({ token: null, deviceHash: null, User: null });
          });
      }
    });
  });
}

// ========================= GLOBAL VARIABLES =========================

class SubscriptionManager {
  constructor() {
    this.subscriptions = new Map(); // tabId -> Set of paths
  }

  addTab(tabId) {
    if (!this.subscriptions.has(tabId)) {
      this.subscriptions.set(tabId, new Set());
    }
  }

  subscribe(tabId, path) {
    if (!this.subscriptions.has(tabId)) {
      this.subscriptions.set(tabId, new Set());
    }
    this.subscriptions.get(tabId).add(path);
  }

  removeTab(tabId) {
    this.subscriptions.delete(tabId);
  }

  hasTab(tabId) {
    return this.subscriptions.has(tabId);
  }
}


// ========================= STATE MANAGEMENT =========================
class ExtensionState {
  constructor() {
    this.settings = {};
    this.selectedClientId = null;
    this.selectedClientData = null; // Cache the full client data
    this.requestTimes = new Map();

    // Create initialization promise
    this.initPromise = this.initialize();
  }

  async initialize() {
    try {
      // Load selectedClientId and settings during initialization
      await Promise.all([
        this.loadSelectedClientId(),
        this.loadSettings()
      ]);

    } catch (error) {
      //
    }
  }

  async waitForInit() {
    await this.initPromise;

    // Only set up intervals once
    if (!this.intervalsSetup) {
      this.intervalsSetup = true;
      // Cleanup old request times periodically (every 5 minutes)
      setInterval(() => this.cleanupOldRequestTimes(), 5 * 60 * 1000);
    }
  }

  cleanupOldRequestTimes() {
    const now = timeSync.getCurrentTime();
    const maxAge = 10 * 60 * 1000; // 10 minutes

    for (const [requestId, data] of this.requestTimes) {
      if (now - data.requestStartTime > maxAge) {
        this.requestTimes.delete(requestId);
      }
    }
  }

  async loadSelectedClientId() {
    try {
      const data = await new Promise((resolve) => {
        chrome.storage.local.get(['selectedClientId', 'clients'], (result) => resolve(result));
      });

      this.selectedClientId = data.selectedClientId || null;
      // Update cached client data
      this.updateCachedClientData(data.clients);

      return true;
    } catch (error) {
      //
      return false;
    }
  }

  // Single method to update cached client data
  updateCachedClientData(clients) {
    if (this.selectedClientId && clients && Array.isArray(clients)) {
      this.selectedClientData = clients.find(client => client.id === this.selectedClientId) || null;
    } else {
      this.selectedClientData = null;
    }
  }

  // Single source of truth - synchronous method that returns cached data
  getSelectedClient() {
    return this.selectedClientData;
  }

  async loadSettings() {
    try {
      const result = await new Promise((resolve) => {
        chrome.storage.local.get('settings', (data) => resolve(data));
      });

      if (result.settings && Object.keys(result.settings).length > 0) {
        this.settings = result.settings;
      } else {
        // Apply default settings when no settings exist

        this.settings = this.getDefaultSettings();
        // Save the default settings
        await new Promise((resolve) => {
          chrome.storage.local.set({ settings: this.settings }, resolve);
        });
      }


    } catch (error) {

      // Apply defaults on error
      this.settings = this.getDefaultSettings();
    }
  }

  getDefaultSettings() {
    return {
      submitPages: {
        loginPage: true,
        loginPageMs: 1000,
        loginCaptchaPage: true,
        loginCaptchaPageMs: 1000,
        appointmentCaptchaPage: true,
        appointmentCaptchaPageMs: 1000,
        visaTypePage: true,
        visaTypePageMs: 1000,
        slotSelectionPage: true,
        slotSelectionPageMs: 5350,
        paymentPage: true,
        paymentPageMs: 0
      },
      captchaService: {
        activeService: 'servercaptcha',
        nocaptchaai: {
          enabled: false,
          apiKey: ''
        },
        truecaptcha: {
          enabled: false,
          userId: '',
          apiKey: ''
        },
        servercaptcha: {
          enabled: true,
          endpoint: (endpoints && endpoints.captcha) || ''
        }
      }
    };
  }

}

// ========================= UTILITIES =========================

function sendTelegramNotificationFast(notificationType, clientInfo, requestTime) {
  const hour = requestTime.hour;
  const minute = requestTime.minute;
  const second = requestTime.second;
  const millisecond = requestTime.millisecond;

  // Load auth data from localStorage
  loadAuthData().then(authData => {
    // Check if auth data is available
    if (!authData.token) {
      return;
    }

    {
      // Prepare payload for new API endpoint
      const payload = {
        token: authData.token,
        devicehash: authData.deviceHash,
        payload: {
          notificationType: notificationType,
          clientInfo: {
            location: clientInfo.location,
            visaType: clientInfo.visaType,
            visaSubtype: clientInfo.visaSubtype,
            category: clientInfo.category,
            country: clientInfo.country
          },
          requestTime: {
            hour: hour,
            minute: minute,
            second: second,
            millisecond: millisecond
          }
        }
      };

      // Create fetch request to new API endpoint
      const controller = new AbortController();

      // Skip if endpoints not loaded yet
      if (!endpoints || !endpoints.telegram) return;

      fetch(endpoints.telegram, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      })
        .then(response => {
          if (response.ok) {

          } else {
            return response.text().then(text => {
              try {
                const errorResponse = JSON.parse(text);
              } catch (e) {

              }
            });
          }
        })
    }
  });
}


// ========================= INITIALIZATION =========================

const state = new ExtensionState();
const subscriptionManager = new SubscriptionManager();


// ========================= EVENT LISTENERS =========================

async function initializeExtension() {
  try {

    // Initialize time synchronization with auto-retry
    if (endpoints && endpoints.timesync) {
      timeSync.startSync(endpoints.timesync);
    }

    // Token verification removed
    if (typeof initializeExtensionModel === 'function') {
      try {
        await initializeExtensionModel();

      } catch (error) {
        //
      }
    }



  } catch (error) {
    //
  }
}


// ========================= MESSAGE HANDLERS =========================
// Message listener moved to background/utils/listeners.js

async function handleMessage(message, sender) {
  switch (message.type || message.action) {

    // Handle heartbeat requests
    case 'heartbeat':
      // Simple heartbeat to check if extension is alive
      return {
        success: true,
        timestamp: Date.now(),
        online: navigator.onLine
      };

    // Handle logout request
    case 'logout':
      return await logoutExtension();

    // Token verification cases removed

    case 'updateSettings':
      return await handleUpdateSettings(message.settings);

    case 'SUBSCRIBE':
      if (!subscriptionManager.hasTab(sender.tab.id)) {
        subscriptionManager.addTab(sender.tab.id);
      }
      subscriptionManager.subscribe(sender.tab.id, message.path);
      return { success: true };

    case 'storeTokens':
      return await handleStoreTokens(message);

    case 'triggerTimeSync':
      // Manually trigger time sync (e.g., when client is selected)
      if (!endpoints || !endpoints.timesync) {
        return {
          success: false,
          error: 'Timesync endpoint not available'
        };
      }

      const syncResult = await timeSync.startSync(endpoints.timesync);
      return {
        success: syncResult.success,
        offset: syncResult.offset,
        rtt: syncResult.rtt,
        fromCache: syncResult.fromCache || false
      };

    case 'getTimeSyncStatus':
      return {
        offset: timeSync.offset,
        rtt: timeSync.rtt,
        synced: timeSync.offset !== 0
      };

    case 'getSyncedTime':
      // Return offset for time calculation (backward compatibility)
      const currentOffset = await timeSync.getOffset();
      return {
        offset: currentOffset,
        rtt: timeSync.rtt,
        timestamp: timeSync.getCurrentTime(), // For backward compatibility
        currentTime: timeSync.getCurrentTime()
      };

    case 'getServerTime':
      // Return current synced time
      const currentTime = timeSync.getCurrentTime();
      return {
        timestamp: currentTime,
        dateString: new Date(currentTime).toISOString()
      };

    case 'get_otp':
      return await handleGetOTP(message);

    case 'manageCookies':
      return await handleManageCookies(message);

    case 'wipeCookies':
      return await handleWipeCookies();

    case 'handleGroupSubmit':
      handleGroupSubmit(message.triggerDelay, message.submitType, message.timestamp, message.subscribe);
      return { success: true };

    case 'broadcastTimeSyncUpdate':
      // Broadcast time sync update to all tabs
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          if (tab.url && (tab.url.includes('blsspainmorocco.net') || tab.url.includes('blsportugal.com'))) {
            chrome.tabs.sendMessage(tab.id, {
              action: 'timeSyncUpdate',
              offset: message.offset,
              rtt: message.rtt
            }, () => {
              if (chrome.runtime.lastError) {
                // Tab might not have content script, ignore
              }
            });
          }
        });
      });
      return { success: true, broadcast: 'sent' };

    default:
      throw new Error(`Unknown action: ${message.type || message.action}`);
  }
}

// ========================= MESSAGE HANDLER FUNCTIONS =========================

async function handleUpdateSettings(newSettings) {


  state.settings = newSettings;

  // Ensure captcha service structure exists (only if it's completely missing)
  if (!state.settings.captchaService) {
    state.settings.captchaService = {
      activeService: "nocaptchaai",
      nocaptchaai: { enabled: true, apiKey: "" },
      truecaptcha: { enabled: false, userId: "", apiKey: "" },
      servercaptcha: { enabled: false, endpoint: "" }
    };
  }

  await new Promise((resolve) => {
    chrome.storage.local.set({ settings: state.settings }, resolve);
  });

  return {
    success: true,
    settings: state.settings
  };
}



async function handleStoreTokens(message) {
  if (!message.tokens) {
    return { success: false, message: 'No tokens provided' };
  }

  const { requestVerificationToken, dataParam } = message.tokens;

  await new Promise((resolve) => {
    chrome.storage.local.set({
      'requestVerificationToken': requestVerificationToken,
      'dataParam': dataParam
    }, resolve);
  });

  return { success: true, message: 'Tokens stored successfully' };
}


async function handleGetOTP(message) {
  try {
    const { email, app_password } = message;

    if (!email || !app_password) {
      throw new Error('Email and app password are required');
    }

    // Check if endpoints are loaded
    if (!endpoints || !endpoints.otp) {
      throw new Error('OTP endpoint not configured');
    }

    const response = await fetch(endpoints.otp, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password: app_password,
        imap_server: 'imap.gmail.com',
        port: 993
      })
    });

    const data = await response.json();



    if (response.ok && data.otp) {
      const result = {
        success: true,
        otp: data.otp
      };

      return result;
    } else {
      throw new Error(data.detail || data.error || 'Failed to retrieve OTP');
    }
  } catch (error) {
    //
    return {
      success: false,
      error: error.message || 'Failed to get OTP'
    };
  }
}

async function handleManageCookies(message) {
  try {
    const { visitorId } = message;

    if (!visitorId) {
      throw new Error('Visitor ID is required');
    }

    // Use the BLS sites from CONFIG
    const domains = [
      `https://www.${CONFIG.BLS_SITES.SPAIN}`,
      `https://morocco.${CONFIG.BLS_SITES.PORTUGAL}`
    ];

    // For each domain, set visitor ID and remove aws-waf-token
    for (const domain of domains) {
      try {
        // Set visitorId_current cookie
        await chrome.cookies.set({
          url: domain,
          name: 'visitorId_current',
          value: visitorId.toString(),
          path: '/',
          sameSite: 'strict'
        });
      } catch (err) {
        console.log(`[Background] Cookie operation failed for ${domain}:`, err.message);
      }
    }

    console.log('[Background] Managed cookies - Set visitor ID:', visitorId, 'and removed aws-waf-token');

    return {
      success: true,
      visitorId: visitorId
    };
  } catch (error) {
    console.error('[Background] Error managing cookies:', error);
    return {
      success: false,
      error: error.message || 'Failed to manage cookies'
    };
  }
}

let groupWs = null;
chrome.storage.local.set({ websocketGroup: null });

function broadcastGroupSubmitStatus(connected, targetTime, order, subscribe) {
  chrome.storage.local.set({ websocketGroup: connected ? { status: true, order, subscribe } : null });
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.url && (tab.url.includes('blsspainmorocco.net') || tab.url.includes('blsportugal.com'))) {
        chrome.tabs.sendMessage(tab.id, { action: 'groupSubmitStatus', connected, targetTime, order, subscribe }, () => chrome.runtime.lastError);
      }
    });
  });
}


function handleGroupSubmit(triggerDelay, submitType, timestamp, subscribe) {
  if (triggerDelay && groupWs && groupWs.readyState === WebSocket.OPEN) {
    groupWs.send(JSON.stringify({ type: submitType, delay: triggerDelay, timestamp }));
    return;
  }
  if (groupWs && groupWs.readyState === WebSocket.OPEN) {
    groupWs.close();
    broadcastGroupSubmitStatus(false);
  } else {
    const token = authData?.token;
    if (!token) return;
    groupWs = new WebSocket(`${CONFIG.GROUP_SUBMIT}/?grouptoken=${token}&devicehash=${authData.deviceHash}${subscribe ? `&subscribe=${subscribe}` : ''}`);
    groupWs.onopen = () => {  broadcastGroupSubmitStatus(true, undefined, undefined, subscribe); };
    groupWs.onclose = () => {  broadcastGroupSubmitStatus(false); };
    groupWs.onerror = (e) => console.log('gs_error:' + e.message);
    groupWs.onmessage = (e) => {
      try {
        const json = JSON.parse(e.data);
        console.log('gs_msg:', json, 'subscribe:', json.subscribe);
        broadcastGroupSubmitStatus(true, json.targetTime, json.order, json.subscribe);
      } catch {}
    };
  }
}

async function handleWipeCookies() {
  try {
    let totalDeleted = 0;
    const domains = [
      `.${CONFIG.BLS_SITES.SPAIN}`,  // .blsspainmorocco.net
      `.${CONFIG.BLS_SITES.PORTUGAL}` // .blsportugal.com
    ];

    for (const domain of domains) {
      // Wrap callback API in Promise
      const cookies = await new Promise((resolve) => {
        chrome.cookies.getAll({ domain: domain }, (cookies) => {
          resolve(cookies || []);
        });
      });

      for (const cookie of cookies) {
        await new Promise((resolve) => {
          chrome.cookies.remove({
            url: `https://${cookie.domain.replace(/^\./, '')}${cookie.path}`,
            name: cookie.name
          }, () => resolve());
        });
        totalDeleted++;
      }
    }

    //console.log(`[Background] Wiped ${totalDeleted} cookies from BLS domains`);
    return { success: true, count: totalDeleted };

  } catch (error) {
    console.error('[Background] Cookie wipe failed:', error);
    return { success: false, error: error.message };
  }
}

// ========================= WEB REQUEST HANDLERS =========================

// Initialize the intercept manager to handle all web request monitoring
let interceptManager = null;
let pageManager = null;

// Initialize page manager
function initializePageManager() {
  console.log('Initializing PageManager...');
  if (typeof PageManager !== 'undefined') {
    pageManager = new PageManager();
    console.log('PageManager created');
  } else {
    console.log('PageManager class not found');
  }
}

// Initialize intercept manager after state is ready
function initializeInterceptManager() {
  if (typeof InterceptManager !== 'undefined') {
    // Pass CONFIG, state, timeSync, wsManager, telegram notifier, and cookie manager to InterceptManager
    interceptManager = new InterceptManager(CONFIG, state, timeSync, null, sendTelegramNotificationFast, handleManageCookies);

  } else {
    //
  }
}

// ========================= STARTUP =========================
// Initialize immediately when background script loads
(async function () {


  // Always ensure state is initialized first
  await state.waitForInit();

  // Try to fetch fresh endpoints from API first
  const authData = await loadAuthData();
  if (authData?.token && authData?.deviceHash) {
    await getEndpoints(authData.token, authData.deviceHash);
  }

  // Load endpoints from storage (will use cached if getEndpoints failed)
  await loadEndpoints();

  // Then run full extension initialization
  await initializeExtension();

  // Initialize the intercept manager after everything else is ready
  initializeInterceptManager();

  // Initialize the page manager for script injection
  initializePageManager();

  //setInterval(() => chrome.tabs.query({}, tabs => tabs.filter(t => t.url?.includes(CONFIG.BLS_SITES.SPAIN) || t.url?.includes(CONFIG.BLS_SITES.PORTUGAL)).forEach(t => chrome.tabs.sendMessage(t.id, { action: 'quickWarmup' }, () => chrome.runtime.lastError))), 30000);
})();



// ===================== STANDALONE VERIFICATION MODULE ===================================

// === VERIFICATION VARIABLES ===
let authData = null; // Single global auth data variable
let authDataPromise = null;

// === Initialize auth data once ===
authDataPromise = (async function initializeAuthData() {
  authData = await loadAuthData();
  return authData;
})();

// === HELPER FUNCTIONS (defined first to be available everywhere) ===


function uninstallExtension(showDialog = false, reason = "User requested") {
  chrome.management.uninstallSelf({
    showConfirmDialog: showDialog
  }, () => {
    if (chrome.runtime.lastError) {
      console.error(`Uninstall failed (${reason}):`, chrome.runtime.lastError);
    } else {
      console.log(`Extension uninstalled: ${reason}`);
    }
  });
}

/**
 * Shutdown the extension - close tabs and clear storage
 */
function shutdownExtension() {

  // Close all relevant tabs
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      // Close options tabs or BLS site tabs
      if (tab.url &&
        (tab.url.includes('chrome-extension://' + chrome.runtime.id + '/options/') ||
         tab.url.includes('blsspainmorocco.net') ||
         tab.url.includes('blsportugal.com'))) {
        chrome.tabs.remove(tab.id, () => {
          // Ignore errors if tab doesn't exist
          if (chrome.runtime.lastError) {
            // Tab already closed or doesn't exist
          }
        });
      }
    });
  });

  // Uninstall after shutdown
  setTimeout(() => {
    uninstallExtension(false, "Verification failed");
  }, 500); // Small delay to ensure cleanup completes
}

async function logoutExtension() {
  try {
    // Check if endpoints are loaded
    if (!endpoints || !endpoints.logout) {
      console.error('⚠️ Logout endpoint not configured');
      return { success: false, error: 'Logout endpoint not available' };
    }

    // Get auth data from storage
    const result = await new Promise((resolve) => {
      chrome.storage.local.get('auth', resolve);
    });

    if (result.auth && result.auth.token && result.auth.deviceHash) {
      // Send logout request to server
      const response = await fetch(endpoints.logout, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          token: result.auth.token,
          deviceHash: result.auth.deviceHash
        })
      });

      if (response.ok) {
        // Clear all local storage
        await new Promise((resolve) => {
          chrome.storage.local.clear(resolve);
        });

        // Close all extension tabs
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            if (tab.url && tab.url.includes(chrome.runtime.id)) {
              chrome.tabs.remove(tab.id);
            }
          });
        });

        // Uninstall the extension after successful logout
        uninstallExtension(false, "Logout completed");

        return { success: true };
      } else {
        throw new Error('Logout API failed');
      }
    } else {
      throw new Error('No auth data found');
    }
  } catch (error) {
    console.error('Logout error:', error);
    return { success: false, error: error.message };
  }
}

// === DASHBOARD DATA FETCH FUNCTION ===
async function fetchDashboardData(dataType, token, deviceHash) {
  try {
    // Check if endpoints are loaded
    if (!endpoints || !endpoints.records) {
      console.error('⚠️ Records endpoint not configured');
      return false;
    }

    const response = await fetch(`${endpoints.records}/${dataType}?token=${token}&devicehash=${deviceHash}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      console.error(`⚠️ Failed to fetch ${dataType}:`, response.status);
    }

    const data = response.ok ? await response.json() : null;

    // Delete clients from storage if fetch failed or data is invalid
    if (!response.ok || !data?.success || !data?.[dataType]) {
      if (dataType === 'clients') {
        chrome.storage.local.remove('clients', () => {
          console.log('🗑️ Removed stale clients data from storage');
        });
      }
      return false;
    }

    await new Promise((resolve) => {
      const storageData = { [dataType]: data[dataType] };

      // Add timestamp for clients fetch
      if (dataType === 'clients') {
        storageData.lastClientsFetchedAt = Date.now();
      }

      chrome.storage.local.set(storageData, () => {
        console.log(`✅ Synced ${data.count || data[dataType].length} ${dataType} from server`);
        resolve();
      });
    });

    return true;
  } catch (error) {
    console.error(`⚠️ ${dataType} fetch failed:`, error);
    return false;
  }
}

// === GET ENDPOINTS FUNCTION ===
async function getEndpoints(token, deviceHash) {
  try {
    const response = await fetch(CONFIG.ENDPOINTS_FETCH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, deviceHash })
    });

    if (!response.ok) return false;

    const data = await response.json();
    if (data?.status === 'success' && data?.endpoints) {
      // Save to storage and global variable
      await new Promise((resolve) => {
        chrome.storage.local.set({ endpoints: data.endpoints }, resolve);
      });
      endpoints = data.endpoints;

      // Sync settings with new endpoints
      await syncSettingsWithEndpoints(data.endpoints);

      console.log('✅ Endpoints fetched and settings synced');
      return true;
    }
    return false;
  } catch (error) {
    console.error('⚠️ Error fetching endpoints:', error);
    return false;
  }
}

// === SYNC SETTINGS WITH ENDPOINTS ===
async function syncSettingsWithEndpoints(newEndpoints) {
  try {
    const result = await new Promise((resolve) => {
      chrome.storage.local.get(['settings'], (data) => resolve(data));
    });

    const settings = result.settings || {};

    // Ensure captchaService structure exists
    if (!settings.captchaService) {
      settings.captchaService = {};
    }

    // Sync servercaptcha endpoint
    if (!settings.captchaService.servercaptcha) {
      settings.captchaService.servercaptcha = {};
    }
    if (newEndpoints.captcha) {
      settings.captchaService.servercaptcha.endpoint = newEndpoints.captcha;
    }

    // Sync nocaptchaai API key
    if (!settings.captchaService.nocaptchaai) {
      settings.captchaService.nocaptchaai = {};
    }
    if (newEndpoints.nocaptchaai) {
      settings.captchaService.nocaptchaai.apiKey = newEndpoints.nocaptchaai;
    }

    // Save updated settings
    await new Promise((resolve) => {
      chrome.storage.local.set({ settings }, resolve);
    });

    // Update state settings if state exists
    if (state && state.settings) {
      state.settings = settings;
    }

    console.log('✅ Settings synced with endpoints');
  } catch (error) {
    console.error('⚠️ Error syncing settings:', error);
  }
}

// === VERIFICATION FUNCTION ===
async function verifyExtension(token, deviceHash = null) {
  try {

    if (!token) return false;
    const verificationPayload = deviceHash ? { token, deviceHash } : { token };

    // Start verification request
    try {
      // Verification - starts immediately and processes independently
      const verificationPromise = fetch(`${CONFIG.TOKEN_VERIFY}?v=${VERSION}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(verificationPayload)
      }).then(async (response) => {
        console.log('🔍 Verification response received');
        return response;
      });

      // Wait for verification (critical) but let clients process independently
      const response = await verificationPromise;

      if (response.status === 200) {
        const data = await response.json();
        if (data?.name) {
          // Save auth data only when verification succeeds
          // ALWAYS save the deviceHash from server response
          await saveAuthData({
            token: token,
            deviceHash: data.deviceHash,
            User: data.name
          });

          // Update global authData variable
          authData = {
            token: token,
            deviceHash: data.deviceHash,
            User: data.name
          };

          // Fetch endpoints from separate API (non-blocking - continues even if it fails)
          const endpointsFetched = await getEndpoints(token, data.deviceHash);
          if (!endpointsFetched) {
            console.log('⚠️ Endpoints fetch failed, but verification succeeded');
          }

          return true;
        }
      }

      // shutdownExtension(); // Commented to prevent self-uninstall on network failure
      return false;
    } catch (error) {
      //shutdownExtension();
      return false;
    }
  } catch (error) {
    //
    return false;
  }
}


// ========================= INITIALIZE ALL LISTENERS =====================================
if (typeof registerAllListeners === 'function') {
  registerAllListeners();
  console.log('All listeners registered from listeners.js');
} else {
  console.error('registerAllListeners function not found - check listeners.js is loaded');
}
// ========================================================================================

