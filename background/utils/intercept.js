/**
 * Web Request Interception Module
 * Handles all web request monitoring and manipulation for BLS sites
 */

// ========================= CONSTANTS =========================
const MSG_CODES = {
  LIVENESS_ERROR: 'lfjqvx2nulagjpkl6ftax8btshjvtsegaj1lwdqossc%3d',
  SESSION_EXPIRED: 's7lsv591mgbwoto%2bm9rifftmx7h5o7ytocu4nrzjjaw%3d',
  REQUEST_FLOW: 'kjbpmkbtogc0ror5plfvih%2fug7qprasugdrfydmeb7k%3d',
  CAPTCHA_ERROR: 'gpjbxowr7oxjf3myh9qdlp3dahebf3tlptnwsfctojs%3d',
  HORS_DATE: '9kcy7iotdvtkxohj8razfxw4wqp04u%2fjqpnaktfp%2beaojtivos9t%2fr79izwmhswd',
  SLOTS_NOT_AVAILABLE: 'zokwwxtcwrl2wwydqer8imsec%2bfrgm9yofag67yf%2fe46mhpkot4e5b42dnnltdwr'
};

const URL_PATHS = {
  LOGIN: '/mar/account/login',
  APPOINTMENT_CAPTCHA: '/mar/appointment/appointmentcaptcha',
  NEW_APPOINTMENT: '/mar/appointment/newappointment',
  SLOT_SELECTION: '/mar/appointment/slotselection',
  PENDING: '/mar/appointment/pendingappointment',
  HOME_ERROR: '/home/error',
  APPLICANT: '/mar/appointment/applicantselection',
  LIVENESS_RESPONSE: '/mar/appointment/livenessresponse',
  PAYMENT: '/mar/appointment/payment',
  PAYMENT_CONFIRM: '/mar/appointment/paymentrequest'
};

// ========================= INTERCEPT MANAGER =========================
class InterceptManager {
  constructor(config, state, timeSync, wsManager, telegramNotifier, cookieManager) {
    this.config = config; // Use passed configuration
    this.state = state;
    this.timeSync = timeSync;
    this.wsManager = wsManager;
    this.sendTelegramNotification = telegramNotifier; // Use the passed function
    this.manageCookies = cookieManager; // Cookie management function
    this.setupListeners();
  }

  setupListeners() {
    // Before Request Handler
    chrome.webRequest.onBeforeRequest.addListener(
      (details) => this.handleBeforeRequest(details),
      { urls: ["<all_urls>"] },
      ["blocking"]
    );

    // Headers Received Handler
    chrome.webRequest.onHeadersReceived.addListener(
      (details) => this.handleHeadersReceived(details),
      { urls: ["<all_urls>"] },
      ["blocking", "responseHeaders"]
    );

    // Request Completed Handler
    chrome.webRequest.onCompleted.addListener(
      (details) => this.handleRequestCompleted(details),
      {
        urls: [
          this.config.URL_PATTERNS.WEBFILTER_SPAIN,
          this.config.URL_PATTERNS.WEBFILTER_PORTUGAL
        ]
      },
      ["responseHeaders"]
    );

    // Request Error Handler
    chrome.webRequest.onErrorOccurred.addListener(
      (details) => this.handleRequestError(details),
      {
        urls: [
          this.config.URL_PATTERNS.WEBFILTER_SPAIN,
          this.config.URL_PATTERNS.WEBFILTER_PORTUGAL
        ]
      }
    );
  }

  handleBeforeRequest(details) {
    const { url, requestId, method } = details;
    const urlLower = url.toLowerCase();

    // Redirect appointmentcaptcha to newappointment (Spain & Portugal, GET without params)
    if (method === 'GET' && (urlLower.includes(this.config.BLS_SITES.SPAIN) || urlLower.includes(this.config.BLS_SITES.PORTUGAL)) && urlLower.includes(URL_PATHS.APPOINTMENT_CAPTCHA) && !url.includes('?'))
      return { redirectUrl: `${new URL(url).origin}${URL_PATHS.NEW_APPOINTMENT}` };

    // Track request start time for Telegram notifications
    const path = new URL(url).pathname.toLowerCase();
    if ((urlLower.includes(this.config.BLS_SITES.SPAIN) ||
      urlLower.includes(this.config.BLS_SITES.PORTUGAL)) &&
      (path === URL_PATHS.SLOT_SELECTION || path === URL_PATHS.PAYMENT_CONFIRM)) {

      // Store the synced time when request starts
      const syncedTime = this.timeSync.getCurrentTime();
      this.state.requestTimes.set(requestId, {
        url: url,
        method: method,
        requestStartTime: syncedTime,
        requestStartDate: new Date(syncedTime)
      });
    }

    return { cancel: false };
  }

  // -------------------- HEADERS RECEIVED (MAIN ROUTER) --------------------
  handleHeadersReceived(details) {
    const { url, statusCode, responseHeaders } = details;
    const path = new URL(url).pathname.toLowerCase();

    // Log successful slotselection requests and send CALENDAR notification
    if (path === URL_PATHS.SLOT_SELECTION && statusCode === 200) {
      
      const originalRequest = this.state.requestTimes.get(details.requestId);
      const clientInfo = this.state.getSelectedClient();
      if (originalRequest?.requestStartDate) {
        const t = this.formatTime(originalRequest.requestStartDate);
        chrome.storage.local.set({ calendarReachedAt: `${t.hour}:${t.minute}:${t.second}:${t.millisecond}` });
        this.sendTelegramNotification?.('CALENDAR', clientInfo, t);
        this.state.requestTimes.delete(details.requestId);
      }
    }

    // Log successful paymentconfirm requests and send PAYMENT_CONFIRM notification
    if (path === URL_PATHS.PAYMENT_CONFIRM && statusCode === 200) {
      const originalRequest = this.state.requestTimes.get(details.requestId);
      const clientInfo = this.state.getSelectedClient();
      if (originalRequest?.requestStartDate) {
        this.sendTelegramNotification?.('PAYMENT_CONFIRM', clientInfo, this.formatTime(originalRequest.requestStartDate));
        this.state.requestTimes.delete(details.requestId);
      }
    }

    if (statusCode !== 302) return {};

    const isSlotSelection = path === URL_PATHS.SLOT_SELECTION;
    const isAppointmentCaptcha = path === URL_PATHS.APPOINTMENT_CAPTCHA;
    const isLivenessResponse = path === URL_PATHS.LIVENESS_RESPONSE;

    if (!isSlotSelection && !isAppointmentCaptcha && !isLivenessResponse) return {};

    const locationHeader = responseHeaders.find(h => h.name.toLowerCase() === "location");
    if (!locationHeader) return {};

    const locationValue = locationHeader.value;
    const locationLower = locationValue.toLowerCase();

    // Handle login redirects - strip returnUrl parameter
    if (this.getPathname(locationValue) === URL_PATHS.LOGIN && locationLower.includes('?returnurl=')) {
      return { responseHeaders: this.setLocationHeader(responseHeaders, locationValue.split('?')[0].replace('http://', 'https://')) };
    }

    // Route to specific handlers
    if (isLivenessResponse) return this.handleLivenessRedirect(details, responseHeaders, locationValue, locationLower);
    if (isAppointmentCaptcha) return this.handleCaptchaRedirect(responseHeaders, locationValue);
    return this.handleSlotSelectionRedirect(details, responseHeaders, locationValue, locationLower);
  }

  // -------------------- LIVENESS RESPONSE HANDLER --------------------
  handleLivenessRedirect(details, responseHeaders, locationValue, locationLower) {
    
    // Case 1: Error redirect - block and notify
    if (locationLower.includes(`msg=${MSG_CODES.LIVENESS_ERROR}`)) {
      chrome.tabs.sendMessage(details.tabId, {
        action: 'REQUEST_STATUS_UPDATE',
        data: { type: 'LivenessError_InvalidRequestParam', url: details.url, timestamp: Date.now() }
      }, () => chrome.runtime.lastError && console.log('Tab might not have content script'));

      return { responseHeaders: this.clearLocationHeader(responseHeaders) };
    }

    // Case 2: Payment redirect - add location param and redirect
    if (this.getPathname(locationLower) === URL_PATHS.PAYMENT) {
      const clientInfo = this.state.getSelectedClient();
      const paymentUrl = clientInfo?.location ? `${locationValue}&loc=${clientInfo.location}` : locationValue;
      this.handleTabRedirect(details.url, paymentUrl, 'payment');
      return { responseHeaders: this.removeLocationHeader(responseHeaders) };
    }

    // Case 3: Navigate to liveness page with loc param
    const clientInfo = this.state.getSelectedClient();
    const livenessUrl = clientInfo?.location ? `${locationValue}&loc=${clientInfo.location}` : locationValue;
    this.handleTabRedirect(details.url, livenessUrl, 'liveness');
    return { responseHeaders: this.removeLocationHeader(responseHeaders) };
  }

  // -------------------- APPOINTMENT CAPTCHA HANDLER --------------------
  handleCaptchaRedirect(responseHeaders, locationValue) {
    // Redirect captcha error to newappointment
    if (locationValue.toLowerCase().includes(`msg=${MSG_CODES.CAPTCHA_ERROR}`)) {
      return { responseHeaders: this.setLocationHeader(responseHeaders, URL_PATHS.NEW_APPOINTMENT) };
    }
    // Allow all other redirects (including visatype)
    return {};
  }

  // -------------------- SLOT SELECTION HANDLER --------------------
  handleSlotSelectionRedirect(details, responseHeaders, locationValue, locationLower) {
    const path = this.getPathname(locationValue);

    // Priority: Redirect appointmentcaptcha to newappointment
    if (path === URL_PATHS.APPOINTMENT_CAPTCHA) {
      return { responseHeaders: this.setLocationHeader(responseHeaders, URL_PATHS.NEW_APPOINTMENT) };
    }

    const isNewAppointment = path === URL_PATHS.NEW_APPOINTMENT;
    const isSlotSelection = path === URL_PATHS.SLOT_SELECTION;
    const isPending = path === URL_PATHS.PENDING;
    const isHomeError = path === URL_PATHS.HOME_ERROR;
    const isApplicant = path === URL_PATHS.APPLICANT;
    const hasErrorMsg = locationLower.includes("&msg=") || locationLower.includes("?msg=") ||
      locationLower.includes(`msg=${MSG_CODES.HORS_DATE}`) || locationLower.includes(`msg=${MSG_CODES.SLOTS_NOT_AVAILABLE}`);

    // Allow specific expiry/flow messages
    const hasSpecificMsg = locationLower.includes(`msg=${MSG_CODES.SESSION_EXPIRED}`) ||
      locationLower.includes(`msg=${MSG_CODES.REQUEST_FLOW}`);
    if (hasSpecificMsg && isNewAppointment) return {};

    // Handle applicant selection - send OTP notification
    if (isApplicant) {
      const originalRequest = this.state.requestTimes.get(details.requestId);
      const clientInfo = this.state.getSelectedClient();

      if (originalRequest?.requestStartDate) {
        const t = this.formatTime(originalRequest.requestStartDate);
        chrome.storage.local.set({ otpReachedAt: `${t.hour}:${t.minute}:${t.second}:${t.millisecond}` });
        this.sendTelegramNotification?.('OTP', clientInfo, t);
        this.state.requestTimes.delete(details.requestId);
      }

      this.handleTabRedirect(details.url, locationValue, 'applicant');
      return { responseHeaders: this.removeLocationHeader(responseHeaders) };
    }

    // Block error redirects (newappointment?msg, pending, home error, slotselection without error)
    if ((isNewAppointment && hasErrorMsg) || isPending || isHomeError || (isSlotSelection && !hasErrorMsg)) {
      return { responseHeaders: this.clearLocationHeader(responseHeaders) };
    }

    return {};
  }

  // -------------------- UTILITIES --------------------
  formatTime(d) {
    return { hour: d.getHours().toString().padStart(2, '0'), minute: d.getMinutes().toString().padStart(2, '0'), second: d.getSeconds().toString().padStart(2, '0'), millisecond: d.getMilliseconds().toString().padStart(3, '0') };
  }

  getPathname(url) {
    try { return new URL(url, 'http://x').pathname.toLowerCase(); }
    catch { return url.split('?')[0].toLowerCase(); }
  }

  clearLocationHeader(headers) {
    return headers.map(h => h.name.toLowerCase() === 'location' ? { ...h, value: '' } : h);
  }

  removeLocationHeader(headers) {
    return headers.filter(h => h.name.toLowerCase() !== 'location');
  }

  setLocationHeader(headers, newValue) {
    return headers.map(h => h.name.toLowerCase() === 'location' ? { ...h, value: newValue } : h);
  }

  async handleRequestCompleted(details) {
    const { url, method, statusCode, tabId, requestId } = details;

    const urlLower = url.toLowerCase();

    // Continue with existing BLS domain request handling
    if (!urlLower.includes(this.config.BLS_SITES.SPAIN) &&
      !urlLower.includes(this.config.BLS_SITES.PORTUGAL)) {
      return;
    }

    const requestData = {
      url: url,
      method: method,
      statusCode: statusCode,
      timestamp: Date.now(),
      type: 'completed'
    };

    console.log('Request completed:', requestData);

    // Send to the specific tab that made the request
    chrome.tabs.sendMessage(tabId, {
      action: 'REQUEST_STATUS_UPDATE',
      data: requestData
    }, () => {
      // Ignore errors if tab doesn't have content script
      if (chrome.runtime.lastError) {
        console.log('Tab might not have content script:', chrome.runtime.lastError.message);
      }
    });

    this.state.requestTimes.delete(requestId);
  }

  async handleRequestError(details) {
    const { url, method, tabId, error, requestId } = details;

    const urlLower = url.toLowerCase();
    if (urlLower.includes(this.config.BLS_SITES.SPAIN) ||
      urlLower.includes(this.config.BLS_SITES.PORTUGAL)) {
      const requestData = {
        url: url,
        method: method,
        statusCode: 0,
        error: error,
        timestamp: this.timeSync.getCurrentTime(),
        type: 'error'
      };

      // Send to the specific tab that made the request
      chrome.tabs.sendMessage(tabId, {
        action: 'REQUEST_STATUS_UPDATE',
        data: requestData
      }, () => {
        // Ignore errors if tab doesn't have content script
        if (chrome.runtime.lastError) {
          console.log('Tab might not have content script:', chrome.runtime.lastError.message);
        }
      });
    }

    // Always clean up request tracking
    this.state.requestTimes.delete(requestId);
  }

  // Helper function to handle tab redirects (login and applicant)
  async handleTabRedirect(originalUrl, redirectUrl, type) {
    let fullRedirectUrl;
    try {
      new URL(redirectUrl);
      fullRedirectUrl = redirectUrl;
    } catch (e) {
      const urlObj = new URL(originalUrl);
      const baseUrl = urlObj.origin;
      const path = redirectUrl.startsWith('/') ? redirectUrl : '/' + redirectUrl;
      fullRedirectUrl = baseUrl + path;
    }

    const tabs = await new Promise((resolve) => {
      chrome.tabs.query({}, (tabs) => resolve(tabs));
    });

    const appointmentTabs = tabs.filter(tab =>
      tab.url && /\/mar\/appointment\/(slotselection|liveness)/i.test(tab.url)
    );

    if (appointmentTabs.length > 0) {
      await chrome.tabs.update(appointmentTabs[0].id, {
        url: fullRedirectUrl,
        active: true
      });
    } else {
      const blsTabs = tabs.filter(tab =>
        tab.url && (tab.url.includes(this.config.BLS_SITES.SPAIN) ||
          tab.url.includes(this.config.BLS_SITES.PORTUGAL))
      );

      if (blsTabs.length > 0) {
        await chrome.tabs.update(blsTabs[0].id, {
          url: fullRedirectUrl,
          active: true
        });
      } else {
        await chrome.tabs.create({ url: fullRedirectUrl });
      }
    }

    // Notify all tabs about session expiration (for login redirects)
    // if (type === 'login') {
    //   await this.notifyAllTabs({
    //     action: 'sessionExpired',
    //     redirectUrl: fullRedirectUrl
    //   });
    // }
  }

  // Utility function to notify all tabs
  async notifyAllTabs(message) {
    try {
      const tabs = await new Promise((resolve) => {
        chrome.tabs.query({}, (tabs) => resolve(tabs));
      });

      for (const tab of tabs) {
        try {
          await new Promise((resolve) => {
            chrome.tabs.sendMessage(tab.id, message, () => resolve());
          });
        } catch (error) {
          // Ignore errors for tabs without content scripts
        }
      }
    } catch (error) {
      // Silent fail
    }
  }

}

// Export for use in background.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = InterceptManager;
}