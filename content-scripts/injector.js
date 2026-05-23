/**
 * BLS Minimal Injector - Handles messaging and script injection
 */

// Message handler
(() => {
  // Function to handle iframe script injection
  function handleIframeScripts() {
    // Only run in iframes
    if (window === window.top) return;

    const url = window.location.pathname.toLowerCase();
    const isPortugal = window.location.hostname.includes('blsportugal.com');
    const region = isPortugal ? 'portugal' : 'spain';

    // Helper to inject scripts
    const injectPageScript = (scriptPath) => {
      const script = document.createElement('script');
      const filename = scriptPath.split('/').pop();
      script.src = chrome.runtime.getURL(scriptPath);
      script.onload = () => console.log(`Injector: ${filename} loaded in iframe`);
      script.onerror = () => console.error(`Injector: Failed to load ${filename}`);
      document.documentElement.appendChild(script);
    };

    // Page configurations with only allowed scripts
    const pageConfigs = {
      '/account/login': {
        name: 'login page',
        scripts: [
          'content-scripts/utils/shared/countdown.js',  // Only countdown allowed
          `content-scripts/${region}/login-page.js`
        ]
      },
      '/newcaptcha/logincaptcha': {
        name: 'logincaptcha page',
        scripts: [
          'content-scripts/utils/shared/countdown.js',  // Only countdown allowed
          `content-scripts/${region}/logincaptcha-page.js`,
          'content-scripts/utils/captcha/captchasolver.js'
        ]
      }
    };

    // Find matching page config and inject scripts
    for (const [pattern, config] of Object.entries(pageConfigs)) {
      if (url.includes(pattern)) {
        console.log(`Injector: Detected ${config.name} in iframe`);
        config.scripts.forEach(injectPageScript);
        break;
      }
    }
  }

  // Execute iframe handler
  handleIframeScripts();
  
  // Script injection helper
  const injectScript = (code, path) => {
    const script = document.createElement('script');
    script.textContent = code;
    script.setAttribute('data-path', path);
    document.documentElement.appendChild(script);
    script.remove();
  };

  // Inject helper functions into page
  injectScript(`
    window.getExtensionData = () => new Promise((resolve, reject) => {
      const id = Date.now() + Math.random();
      const handler = (e) => {
        if (e.data.type === 'DATA_RESPONSE' && e.data.requestId === id) {
          window.removeEventListener('message', handler);
          e.data.error ? reject(new Error(e.data.error)) : resolve(e.data.data);
        }
      };
      window.addEventListener('message', handler);
      window.postMessage({ type: 'REQUEST_DATA', requestId: id }, '*');
    });

    window.setExtensionData = (path, value) => new Promise((resolve, reject) => {
      const id = Date.now() + Math.random();
      const handler = (e) => {
        if (e.data.type === 'SAVE_RESPONSE' && e.data.requestId === id) {
          window.removeEventListener('message', handler);
          e.data.error ? reject(new Error(e.data.error)) : resolve(e.data.success);
        }
      };
      window.addEventListener('message', handler);
      window.postMessage({ type: 'SAVE_DATA', requestId: id, dataPath: path, value }, '*');
    });

    // Minimalist ext-loader declarations
    window.ShowExtLoader = () => {
      let el = document.getElementById("ext-loader");
      if (!el) {
        el = document.createElement("div");
        el.id = "ext-loader";
        el.style.cssText = "position:fixed;top:50%;left:50%;width:40px;height:40px;margin:-20px;border:3px solid #f3f3f3;border-top:3px solid #333;border-radius:50%;animation:spin 1s linear infinite;z-index:99999";
        document.body?.appendChild(el);
        if (!document.getElementById("ext-spin")) {
          const style = document.createElement("style");
          style.id = "ext-spin";
          style.textContent = "@keyframes spin{to{transform:rotate(360deg)}}";
          document.head?.appendChild(style);
        }
      }
      el.style.display = "block";
    };

    window.HideExtLoader = () => {
      const el = document.getElementById("ext-loader");
      if (el) el.style.display = "none";
    };
  `, 'helpers');

  // Handle messages from background
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (sender.tab) return false;

    if (msg.action === 'injectScript') {
      // Block ALL scripts in iframes except countdown and page-specific scripts
      if (window !== window.top) {
        const allowedInIframe = ['countdown', 'login-page', 'logincaptcha-page', 'captchasolver'];
        const isAllowed = allowedInIframe.some(allowed => msg.path && msg.path.includes(allowed));
        if (!isAllowed) {
          console.log(`Injector: Blocked ${msg.path} in iframe`);
          sendResponse({ success: true }); // Pretend success but don't inject
          return true;
        }
      }

      try {
        injectScript(msg.script, msg.path);
        sendResponse({ success: true });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
      return true;
    }

    // Handle cookie expiry update
    if (msg.action === 'cookieExpiryUpdate') {
      window.postMessage({
        type: 'COOKIE_EXPIRY_UPDATE',
        cookieExpiry: msg.cookieExpiry
      }, '*');
      sendResponse({ success: true });
      return true;
    }

    // Handle time sync update broadcast
    if (msg.action === 'timeSyncUpdate') {
      window.postMessage({ type: 'TIME_SYNC_UPDATE', offset: msg.offset, rtt: msg.rtt, success: true }, '*');
      sendResponse({ success: true });
      return true;
    }

    // Handle GroupSubmit status update
    if (msg.action === 'groupSubmitStatus') {
      console.log('[Injector] Forwarding GroupSubmit status to page:', { connected: msg.connected, targetTime: msg.targetTime, order: msg.order, subscribe: msg.subscribe });
      window.postMessage({ type: 'GROUPSUBMIT_STATUS', connected: msg.connected, targetTime: msg.targetTime, order: msg.order, subscribe: msg.subscribe }, '*');
      sendResponse({ success: true });
      return true;
    }

    // Handle WAF token deleted
    if (msg.action === 'wafTokenDeleted') {
      window.postMessage({ type: 'WAF_TOKEN_DELETED' }, '*');
      sendResponse({ success: true });
      return true;
    }

    // Forward all messages with action to page
    if (msg.action) {
      window.postMessage({ type: 'FROM_EXTENSION_TO_PAGE', action: msg.action, ...msg }, '*');
      sendResponse({ success: true });
      return true;
    }
  });

  // Handle messages from page
  window.addEventListener('message', async (e) => {
    if (e.source !== window || !e.data) return;
    const { type, requestId, dataPath, value, action, ...data } = e.data;

    switch (type) {
      case 'REQUEST_DATA':
        try {
          const stored = await new Promise(resolve => {
            chrome.storage.local.get(['selectedClientId', 'clients', 'settings', 'visa_applicants', 'timeOffset', 'timeRTT', 'timeSyncTimestamp', 'SiteCookiesExpiry', 'websocketGroup', 'calendarReachedAt', 'otpReachedAt'], resolve);
          });
          window.postMessage({
            type: 'DATA_RESPONSE',
            requestId,
            data: {
              client: stored.clients?.find(c => c.id === stored.selectedClientId) || null,
              allClients: stored.clients || [],
              settings: stored.settings || {},
              visa_applicants: stored.visa_applicants || [],
              timeSyncData: stored.timeOffset !== undefined ? {
                offset: stored.timeOffset,
                rtt: stored.timeRTT,
                timestamp: stored.timeSyncTimestamp
              } : null,
              cookieExpiry: stored.SiteCookiesExpiry || null,
              websocketGroup: stored.websocketGroup || null,
              calendarReachedAt: stored.calendarReachedAt || null,
              otpReachedAt: stored.otpReachedAt || null
            }
          }, '*');
        } catch (error) {
          window.postMessage({ type: 'DATA_RESPONSE', requestId, error: error.message }, '*');
        }
        break;

      case 'SAVE_DATA':
        try {
          if (dataPath === 'selectedClientCategory') {
            const { selectedClientId, clients } = await storage.get(['selectedClientId', 'clients']);
            await storage.set({
              clients: clients?.map(c => c.id === selectedClientId ? { ...c, category: value } : c)
            });
          } else if (['visa_applicants', 'clients'].includes(dataPath)) {
            await storage.set({ [dataPath]: value });
          } else {
            const { settings = {} } = await storage.get(['settings']);
            const path = dataPath.split('.');
            let target = settings;
            path.slice(0, -1).forEach(p => target = target[p] = target[p] || {});
            target[path[path.length - 1]] = value;
            await storage.set({ settings });
          }
          window.postMessage({ type: 'SAVE_RESPONSE', requestId, success: true }, '*');
        } catch (error) {
          window.postMessage({ type: 'SAVE_RESPONSE', requestId, error: error.message }, '*');
        }
        break;

      case 'FROM_PAGE_TO_CONTENT_SCRIPT':
        console.log('[Injector] Received message from page:', { action, data });

        if (action === 'requestOTP') {
          chrome.runtime.sendMessage({ action: 'get_otp', email: data.email, app_password: data.app_password },
            res => window.postMessage({
              type: 'FROM_EXTENSION_TO_PAGE',
              action: 'otpResponse',
              messageId: data.messageId,
              ...(res?.success ? { success: true, otp: res.otp } : { success: false, error: res?.error })
            }, '*'));
            
        } else if (action === 'manageCookies') {
          // Forward cookie management request to background
          console.log('[Injector] Forwarding manageCookies request to background');
          chrome.runtime.sendMessage({
            action: 'manageCookies',
            visitorId: data.visitorId
          });
          console.log('[Injector] Forwarded cookie management request to background');
        } else if (action === 'wipeCookies') {
          console.log('[Injector] Forwarding wipeCookies request to background');
          // Forward cookie wipe request to background
          chrome.runtime.sendMessage({
            action: 'wipeCookies'
          }, response => {
            console.log('[Injector] wipeCookies response:', response);
          });
        } else {
          console.log('[Injector] Unknown action received:', action);
        }
        break;

      case 'GROUPSUBMIT_REQUEST':
        console.log('[Injector] Received GroupSubmit request from page');
        chrome.runtime.sendMessage({ action: 'handleGroupSubmit', subscribe: e.data.subscribe });
        break;

      case 'PING_GROUPSUBMIT':
        chrome.runtime.sendMessage({ action: 'pingGroupSubmit' });
        break;

      case 'GROUPSUBMIT_TRIGGER':
        chrome.runtime.sendMessage({ action: 'handleGroupSubmit', triggerDelay: e.data.triggerDelay, submitType: e.data.submitType, timestamp: e.data.timestamp });
        break;


      case 'REQUEST_TIME_SYNC':
        console.log('[Injector] Received time sync request from page');

        // Send time sync request to background
        chrome.runtime.sendMessage({ action: 'triggerTimeSync' }, (response) => {
          console.log('[Injector] Time sync response from background:', response);

          if (response && response.success) {
            // Broadcast the new offset to all tabs
            // chrome.runtime.sendMessage({
            //   action: 'broadcastTimeSyncUpdate',
            //   offset: response.offset,
            //   rtt: response.rtt
            // });

            // Also send directly to current tab
            window.postMessage({
              type: 'TIME_SYNC_UPDATE',
              offset: response.offset,
              rtt: response.rtt,
              success: true
            }, '*');
            
          } else {
            // Send error to current tab
            window.postMessage({
              type: 'TIME_SYNC_UPDATE',
              offset: false,
              success: false,
              error: response ? response.error : 'Unknown error'
            }, '*');
          }
        });
        break;
    }
  });

  // Token extraction
  document.addEventListener('blsTokensExtracted', e =>
    chrome.runtime.sendMessage({
      action: 'storeTokens',
      tokens: { requestVerificationToken: e.detail.token, dataParam: e.detail.dataParam }
    })
  );

  // Ready signal
  document.dispatchEvent(new CustomEvent('blsInjectorInitialized'));
})();