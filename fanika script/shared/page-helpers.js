/**
 * Page-world helpers (MAIN world). Bridge to the content script via postMessage.
 */
(function () {
  if (window.__fanikaPageHelpersInstalled) return;
  window.__fanikaPageHelpersInstalled = true;

  window.getFanikaData = function () {
    return new Promise(function (resolve, reject) {
      var id = Date.now() + Math.random();
      function handler(e) {
        if (!e.data || e.data.type !== 'FANIKA_DATA_RESPONSE' || e.data.requestId !== id) return;
        window.removeEventListener('message', handler);
        if (e.data.error) reject(new Error(e.data.error));
        else resolve(e.data.data);
      }
      window.addEventListener('message', handler);
      window.postMessage({ type: 'FANIKA_REQUEST_DATA', requestId: id }, '*');
    });
  };

  window.fanikaDebug = function (event, data) {
    window.postMessage({ type: 'FANIKA_DEBUG', event: event, data: data }, '*');
  };

  window.fanikaOverlay = function (text, phase) {
    window.postMessage({ type: 'FANIKA_OVERLAY', text: text, phase: phase }, '*');
  };
})();
