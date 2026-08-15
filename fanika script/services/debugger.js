/**
 * Fanika debugger — one log in chrome.storage, shown on the Options page.
 */
(function (global) {
  const STORAGE_KEY = 'fanikaDebugLog';
  const MAX_CHARS = 400000;
  const WRITE_DEBOUNCE_MS = 400;

  let buffer = '';
  let loaded = false;
  let writeTimer = null;

  function nowIso() {
    return new Date().toISOString();
  }

  function redact(value) {
    if (value == null) return value;
    if (typeof value === 'string') {
      return value.replace(/(_session-)[a-z0-9]+/gi, '$1***');
    }
    if (Array.isArray(value)) return value.map(redact);
    if (typeof value === 'object') {
      const out = {};
      for (const key of Object.keys(value)) {
        const lower = key.toLowerCase();
        if (lower.includes('password') || lower === 'authcredentials') {
          out[key] = '[REDACTED]';
        } else {
          out[key] = redact(value[key]);
        }
      }
      return out;
    }
    return value;
  }

  function lineFor(event, data) {
    let payload = '';
    try {
      payload = data === undefined ? '' : ' ' + JSON.stringify(redact(data));
    } catch (_) {
      payload = ' [unserializable]';
    }
    return '[' + nowIso() + '] ' + event + payload + '\n';
  }

  async function loadBuffer() {
    if (loaded) return;
    loaded = true;
    try {
      const stored = await chrome.storage.local.get([STORAGE_KEY]);
      buffer = stored[STORAGE_KEY] || '';
    } catch (_) {
      buffer = '';
    }
  }

  async function persist() {
    if (buffer.length > MAX_CHARS) {
      buffer = buffer.slice(buffer.length - MAX_CHARS);
    }
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: buffer });
    } catch (_) {}
  }

  function scheduleWrite() {
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(() => persist().catch(() => {}), WRITE_DEBOUNCE_MS);
  }

  async function debugLog(event, data) {
    await loadBuffer();
    buffer += lineFor(event, data);
    console.log('[fanika/debug]', event, data !== undefined ? redact(data) : '');
    scheduleWrite();
    return { success: true };
  }

  async function getDebugLog() {
    await loadBuffer();
    return { success: true, text: buffer };
  }

  async function clearDebugLog() {
    buffer = lineFor('debugger.cleared', {});
    await persist();
    return { success: true };
  }

  function installNetworkDebug() {
    if (!chrome.webRequest) return;

    chrome.webRequest.onAuthRequired.addListener(
      (details) => {
        debugLog('net.proxyAuthRequired', {
          url: details.url,
          method: details.method,
          isProxy: details.isProxy,
          challenger: details.challenger,
          scheme: details.scheme,
          statusCode: details.statusCode
        });
      },
      { urls: ['<all_urls>'] }
    );

    chrome.webRequest.onErrorOccurred.addListener(
      (details) => {
        debugLog('net.error', {
          url: details.url,
          method: details.method,
          type: details.type,
          error: details.error,
          tabId: details.tabId
        });
      },
      { urls: ['<all_urls>'] }
    );

    chrome.webRequest.onCompleted.addListener(
      (details) => {
        if (details.statusCode >= 400 || (details.url || '').includes('icanhazip') || (details.url || '').includes('account/login')) {
          debugLog('net.completed', {
            url: details.url,
            method: details.method,
            type: details.type,
            statusCode: details.statusCode,
            fromCache: details.fromCache,
            ip: details.ip,
            tabId: details.tabId
          });
        }
      },
      { urls: ['<all_urls>'] }
    );
  }

  global.debugLog = debugLog;
  global.getDebugLog = getDebugLog;
  global.clearDebugLog = clearDebugLog;

  loadBuffer().then(() => debugLog('debugger.start', { where: 'options page' }));
  installNetworkDebug();
})(self);
