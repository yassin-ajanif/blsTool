/**
 * Persist login milestones across the whole BLS flow (localStorage, same origin).
 */
(function () {
  if (window.__fanikaLoginTimesInstalled) return;
  window.__fanikaLoginTimesInstalled = true;

  const KEY_FIRST = 'fanikaLoginFirstTime';
  const KEY_SUBMIT = 'fanikaLoginSubmitTime';
  /** @deprecated alias kept for older reads */
  const KEY_LEGACY = 'logintime';

  function pad(n, len) {
    return String(n).padStart(len || 2, '0');
  }

  function formatNow() {
    const t = new Date();
    return (
      pad(t.getHours()) +
      ':' +
      pad(t.getMinutes()) +
      ':' +
      pad(t.getSeconds()) +
      ':' +
      pad(t.getMilliseconds(), 3)
    );
  }

  function read(key) {
    try {
      return localStorage.getItem(key) || '';
    } catch (_) {
      return '';
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (_) {
      return false;
    }
  }

  function notifyChange() {
    try {
      window.dispatchEvent(new CustomEvent('fanikaLoginTimesUpdated'));
    } catch (_) {}
  }

  window.fanikaLoginTimes = {
    KEY_FIRST,
    KEY_SUBMIT,

    formatNow,

    getLoginFirstTime() {
      return read(KEY_FIRST) || '—';
    },

    getLoginSubmitTime() {
      return read(KEY_SUBMIT) || read(KEY_LEGACY) || '—';
    },

    saveLoginFirstTime() {
      const ts = formatNow();
      write(KEY_FIRST, ts);
      notifyChange();
      return ts;
    },

    saveLoginSubmitTime() {
      const ts = formatNow();
      write(KEY_SUBMIT, ts);
      write(KEY_LEGACY, ts);
      notifyChange();
      return ts;
    },

    clearLoginTimes() {
      try {
        localStorage.removeItem(KEY_FIRST);
        localStorage.removeItem(KEY_SUBMIT);
        localStorage.removeItem(KEY_LEGACY);
      } catch (_) {}
      notifyChange();
    }
  };
})();
