/**
 * Record login submit success when LoginSubmit page loads.
 */
(function () {
  if (window.__fanikaLoginSubmitTrackerInstalled) return;
  window.__fanikaLoginSubmitTrackerInstalled = true;

  function pathLower() {
    return (location.pathname || '').toLowerCase();
  }

  if (!pathLower().includes('/account/loginsubmit')) return;

  function recordSubmitSuccess() {
    const api = window.fanikaLoginTimes;
    if (!api) return;
    const ts = api.saveLoginSubmitTime();
    chrome.runtime.sendMessage({
      action: 'debugLog',
      event: 'loginSubmit.pageSuccess',
      data: { url: location.href, time: ts }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', recordSubmitSuccess);
  } else {
    recordSubmitSuccess();
  }
})();
