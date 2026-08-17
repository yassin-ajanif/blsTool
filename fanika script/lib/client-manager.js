/**
 * Fanika client storage (Trump-style, Spain BLS only).
 */
(function (global) {
  const CLIENTS_KEY = 'fanikaClients';
  const SELECTED_KEY = 'fanikaSelectedClientId';
  const SETTINGS_KEY = 'fanikaSettings';

  function uuid() {
    return crypto.randomUUID?.() || 'fanika-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  }

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
      // TrueCaptcha-only. Credentials are loaded from fanika `.env` by the background worker.
      activeService: 'truecaptcha',
      nocaptchaai: { enabled: false, apiKey: '' },
      truecaptcha: { enabled: true, userId: '', apiKey: '' },
      servercaptcha: { enabled: false, endpoint: '' }
    },
    redirects: { pageRedirectMs: 500 }
  };

  class FanikaClientManager {
    async loadClients() {
      const r = await chrome.storage.local.get([CLIENTS_KEY]);
      return r[CLIENTS_KEY] || [];
    }

    async saveClients(clients) {
      await chrome.storage.local.set({ [CLIENTS_KEY]: clients });
      return clients;
    }

    async getSelectedId() {
      const r = await chrome.storage.local.get([SELECTED_KEY]);
      return r[SELECTED_KEY] || null;
    }

    async selectClient(id) {
      const clients = await this.loadClients();
      if (!clients.some((c) => c.id === id)) throw new Error('Client not found');
      await chrome.storage.local.set({ [SELECTED_KEY]: id });
      return clients.find((c) => c.id === id);
    }

    async getSelectedClient() {
      const clients = await this.loadClients();
      const id = await this.getSelectedId();
      return clients.find((c) => c.id === id) || clients[0] || null;
    }

    async addOrUpdateClient(data) {
      const clients = await this.loadClients();
      const now = new Date().toISOString();
      if (data.id) {
        const i = clients.findIndex((c) => c.id === data.id);
        if (i >= 0) {
          clients[i] = { ...clients[i], ...data, updatedAt: now };
        } else {
          clients.push({ ...data, id: data.id, createdAt: now, updatedAt: now });
        }
      } else {
        clients.push({
          id: uuid(),
          country: 'Spain',
          applicantsCount: 1,
          category: 'Normal',
          ...data,
          createdAt: now,
          updatedAt: now
        });
      }
      await this.saveClients(clients);
      return clients;
    }

    async deleteClient(id) {
      let clients = await this.loadClients();
      clients = clients.filter((c) => c.id !== id);
      await this.saveClients(clients);
      const sel = await this.getSelectedId();
      if (sel === id) {
        await chrome.storage.local.set({ [SELECTED_KEY]: clients[0]?.id || null });
      }
    }

    async loadSettings() {
      const r = await chrome.storage.local.get([SETTINGS_KEY]);
      return { ...DEFAULT_SETTINGS, ...(r[SETTINGS_KEY] || {}) };
    }

    async saveSettings(settings) {
      await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
    }

    launchLogin(client) {
      const url = 'https://www.blsspainmorocco.net/MAR/account/login';
      chrome.tabs.create({ url });
      return { url, client: client?.name };
    }
  }

  global.FanikaClientManager = FanikaClientManager;
  global.fanikaClientManager = new FanikaClientManager();
})(typeof window !== 'undefined' ? window : self);
