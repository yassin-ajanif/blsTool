/**
 * Fanika storage bridge for content scripts (Trump getExtensionData equivalent).
 */
(function () {
  const DEFAULT_SETTINGS = {
    submitPages: {
      loginPage: true,
      loginPageMs: 0,
      loginCaptchaPage: true,
      loginCaptchaPageMs: 0,
      appointmentCaptchaPage: true,
      appointmentCaptchaPageMs: 0,
      visaTypePage: true,
      visaTypePageMs: 0
    },
    captchaService: {
      // Always use TrueCaptcha. Credentials are loaded from fanika `.env` by the background service worker.
      activeService: 'truecaptcha',
      nocaptchaai: { enabled: false, apiKey: '' },
      truecaptcha: { enabled: true, userId: '', apiKey: '' },
      servercaptcha: { enabled: false, endpoint: '' }
    },
    redirects: { pageRedirectMs: 500 },
    refreshError: { enabled: true, refreshErrorMs: 1000 }
  };

  async function getFanikaData() {
    const stored = await chrome.storage.local.get([
      'fanikaClients',
      'fanikaSelectedClientId',
      'fanikaSettings'
    ]);
    const clients = stored.fanikaClients || [];
    const selectedId = stored.fanikaSelectedClientId;
    let client = clients.find((c) => c.id === selectedId) || clients[0] || null;
    const settings = { ...DEFAULT_SETTINGS, ...(stored.fanikaSettings || {}) };
    settings.submitPages = { ...DEFAULT_SETTINGS.submitPages, ...(settings.submitPages || {}) };
    settings.captchaService = {
      ...DEFAULT_SETTINGS.captchaService,
      ...(settings.captchaService || {})
    };

    // Ensure TrueCaptcha creds are loaded from `.env` (background) before captcha starts.
    const tc = settings?.captchaService?.truecaptcha || {};
    if (!tc.userId || !tc.apiKey) {
      await new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage({ action: 'ensureTrueCaptchaFromEnv' }, () => resolve());
        } catch (_) {
          resolve();
        }
      });
    }

    // Force TrueCaptcha-only configuration regardless of any previously saved settings.
    const stored2 = await chrome.storage.local.get(['fanikaSettings']);
    const settings2 = { ...DEFAULT_SETTINGS, ...(stored2.fanikaSettings || {}) };
    settings2.submitPages = { ...DEFAULT_SETTINGS.submitPages, ...(settings2.submitPages || {}) };
    settings2.captchaService = {
      ...DEFAULT_SETTINGS.captchaService,
      ...(settings2.captchaService || {})
    };
    settings2.captchaService.activeService = 'truecaptcha';
    settings2.captchaService.nocaptchaai.enabled = false;
    settings2.captchaService.servercaptcha.enabled = false;
    settings2.captchaService.truecaptcha.enabled = true;

    return { client, clients, settings: settings2, selectedClientId: client?.id || null };
  }

  window.getFanikaData = getFanikaData;
  // Alias for captcha-solver copied from Trump
  window.getExtensionData = getFanikaData;
})();
