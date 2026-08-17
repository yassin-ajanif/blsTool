/**
 * Inject visa-type bot into the PAGE world (Kendo/jQuery live there).
 * Scripts are fetched and injected inline — external chrome-extension:// src is blocked by BLS CSP.
 */
(function () {
  if (window.__fanikaPageInjectInstalled) return;
  window.__fanikaPageInjectInstalled = true;

  const getData = () =>
    typeof window.getFanikaData === 'function' ? window.getFanikaData() : Promise.reject(new Error('no getFanikaData'));

  window.addEventListener('message', async (e) => {
    if (e.source !== window || !e.data) return;
    if (e.data.type === 'FANIKA_REQUEST_DATA') {
      try {
        const data = await getData();
        window.postMessage(
          { type: 'FANIKA_DATA_RESPONSE', requestId: e.data.requestId, data },
          '*'
        );
      } catch (err) {
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

  function injectInline(code, label) {
    const s = document.createElement('script');
    s.textContent = code;
    if (label) s.setAttribute('data-fanika', label);
    (document.head || document.documentElement).appendChild(s);
    s.remove();
  }

  async function injectExtensionScript(path) {
    const url = chrome.runtime.getURL(path);
    const res = await fetch(url);
    if (!res.ok) throw new Error(path + ' HTTP ' + res.status);
    injectInline(await res.text(), path);
    console.log('[fanika/page-inject] injected', path);
  }

  function injectPageHelpers() {
    if (window.__fanikaPageHelpersInstalled) return;
    window.__fanikaPageHelpersInstalled = true;
    injectInline(
      `
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
    `,
      'page-helpers'
    );
  }

  let injectPromise = null;

  async function injectVisaTypeBot() {
    if (!window.fanikaPage?.isVisaType()) return { skipped: true };

    if (!injectPromise) {
      injectPromise = (async () => {
        console.log('[fanika/page-inject] VisaType page — injecting page-world bot');
        chrome.runtime.sendMessage({
          action: 'debugLog',
          event: 'visaType.inject.start',
          data: { url: location.href }
        });

        injectPageHelpers();
        await injectExtensionScript('shared/countdown.js');
        await injectExtensionScript('step-4-visa-type/visa-type-page.js');
        return { success: true };
      })().catch((err) => {
        injectPromise = null;
        console.error('[fanika/page-inject] inject failed', err);
        chrome.runtime.sendMessage({
          action: 'debugLog',
          event: 'visaType.inject.fail',
          data: { error: err.message, url: location.href }
        });
        throw err;
      });
    }

    return injectPromise;
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'injectScript') {
      try {
        injectInline(msg.script, msg.path || 'background-inject');
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }
    if (msg.action === 'injectVisaType') {
      injectVisaTypeBot()
        .then((r) => sendResponse({ success: true, ...r }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }
    return false;
  });

  function tryInject() {
    injectVisaTypeBot().catch(() => {});
  }

  tryInject();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInject);
  }
  window.addEventListener('load', tryInject);
})();
