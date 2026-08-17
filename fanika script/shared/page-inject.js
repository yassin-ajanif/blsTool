/**
 * Isolated-world bridge for visa-type MAIN-world scripts.
 * Does not insert <script> tags (BLS CSP blocks them). Background uses
 * chrome.scripting.executeScript({ world: 'MAIN' }).
 */
(function () {
  if (window.__fanikaPageInjectInstalled) return;
  window.__fanikaPageInjectInstalled = true;

  function dbg(event, data) {
    console.log('[fanika/page-inject]', event, data || '');
    try {
      chrome.runtime.sendMessage({ action: 'debugLog', event, data });
    } catch (_) {}
  }

  const getData = () =>
    typeof window.getFanikaData === 'function'
      ? window.getFanikaData()
      : Promise.reject(new Error('no getFanikaData'));

  window.addEventListener('message', async (e) => {
    if (e.source !== window || !e.data) return;
    if (e.data.type === 'FANIKA_REQUEST_DATA') {
      try {
        const data = await getData();
        dbg('visaType.bridge.dataOk', {
          client: data?.client?.name || null,
          requestId: e.data.requestId
        });
        window.postMessage(
          { type: 'FANIKA_DATA_RESPONSE', requestId: e.data.requestId, data },
          '*'
        );
      } catch (err) {
        dbg('visaType.bridge.dataFail', { error: err.message, requestId: e.data.requestId });
        window.postMessage(
          {
            type: 'FANIKA_DATA_RESPONSE',
            requestId: e.data.requestId,
            error: err.message
          },
          '*'
        );
      }
    }
    if (e.data.type === 'FANIKA_DEBUG') {
      chrome.runtime.sendMessage({
        action: 'debugLog',
        event: e.data.event,
        data: e.data.data
      });
    }
    if (e.data.type === 'FANIKA_OVERLAY') {
      chrome.runtime.sendMessage({
        action: 'overlayStatus',
        text: e.data.text,
        phase: e.data.phase || 'info'
      });
    }
  });

  function isVisaTypeUrl() {
    return (location.pathname || '').toLowerCase().includes('/appointment/visatype');
  }

  function requestMainWorldInject() {
    if (!isVisaTypeUrl()) return;
    dbg('visaType.inject.request', { from: 'content', url: location.href });
    chrome.runtime.sendMessage(
      { action: 'injectVisaTypeMain', url: location.href },
      (res) => {
        if (chrome.runtime.lastError) {
          dbg('visaType.inject.requestFail', { error: chrome.runtime.lastError.message });
          return;
        }
        dbg('visaType.inject.requestAck', res || {});
      }
    );
  }

  dbg('visaType.inject.listenerReady', { url: location.href, path: location.pathname });
  requestMainWorldInject();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', requestMainWorldInject);
  }
  window.addEventListener('load', requestMainWorldInject);
})();
