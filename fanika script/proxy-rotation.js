/**
 * proxy-rotation.js — IPRoyal sticky session via chrome.proxy (no gost).
 * City picked in Options → Settings; password bases live in .env.
 */
(function (global) {
  const CITY_ENV_KEYS = {
    random: 'PROXY_PASSWORD_RANDOM',
    tetouan: 'PROXY_PASSWORD_TETOUAN',
    tangier: 'PROXY_PASSWORD_TANGIER',
    casablanca: 'PROXY_PASSWORD_CASABLANCA'
  };

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function randomSessionId(len = 10) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let out = '';
    const arr = new Uint8Array(len);
    crypto.getRandomValues(arr);
    for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
    return out;
  }

  /** Strip _session / _lifetime; append fresh session + lifetime on rotate. */
  function buildRotatingPassword(basePassword, { session, lifetime } = {}) {
    let base = String(basePassword || '')
      .replace(/_session-[^_]+/gi, '')
      .replace(/_lifetime-[^_]+/gi, '')
      .trim();
    if (session) base += `_session-${session}`;
    if (lifetime != null && lifetime !== '') base += `_lifetime-${lifetime}`;
    return base;
  }

  async function readProxyCitySetting() {
    try {
      const r = await chrome.storage.local.get(['fanikaSettings']);
      return r.fanikaSettings?.proxyCity || 'tetouan';
    } catch (_) {
      return 'tetouan';
    }
  }

  class ProxyRotation {
    constructor() {
      this.env = null;
      this.sessionId = null;
      this.passwordBase = null;
      this.proxyCity = 'tetouan';
      this.enabled = false;
      this._authListener = null;
    }

    async init() {
      this.env = await loadEnv('.env');
      const host = this.env.PROXY_HOST;
      const port = Number(this.env.PROXY_PORT);
      const username = this.env.PROXY_USERNAME;

      if (!host || !port || !username) {
        throw new Error('Missing PROXY_HOST / PROXY_PORT / PROXY_USERNAME in .env');
      }

      await this._resolvePasswordBase();

      if (!this.sessionId) this.sessionId = randomSessionId();
      return this.getConfig();
    }

    get lifetime() {
      const raw = String(this.env?.PROXY_LIFETIME || '').trim();
      return raw || '30m';
    }

    async _resolvePasswordBase() {
      const city = await readProxyCitySetting();
      this.proxyCity = city;
      const envKey = CITY_ENV_KEYS[city] || CITY_ENV_KEYS.tetouan;
      const base = this.env?.[envKey] || this.env?.PROXY_PASSWORD;
      if (!base) {
        throw new Error(`Missing ${envKey} (or PROXY_PASSWORD) in .env for proxy city "${city}"`);
      }
      this.passwordBase = base;
      if (typeof debugLog === 'function') {
        debugLog('proxy.city', { proxyCity: city, envKey });
      }
      return base;
    }

    getCredentials() {
      if (!this.env || !this.passwordBase) throw new Error('ProxyRotation not initialized');
      return {
        username: this.env.PROXY_USERNAME,
        password: buildRotatingPassword(this.passwordBase, {
          session: this.sessionId,
          lifetime: this.lifetime
        })
      };
    }

    getConfig() {
      const creds = this.getCredentials();
      return {
        host: this.env.PROXY_HOST,
        port: Number(this.env.PROXY_PORT),
        username: creds.username,
        password: creds.password,
        sessionId: this.sessionId,
        lifetime: this.lifetime,
        proxyCity: this.proxyCity
      };
    }

    _ensureAuthListener() {
      if (this._authListener) return;

      this._authListener = (details, callback) => {
        if (!details.isProxy || !this.enabled) {
          callback({});
          return;
        }
        const { username, password } = this.getCredentials();
        if (typeof debugLog === 'function') {
          debugLog('proxy.auth.407', {
            host: details.challenger?.host,
            session: this.sessionId,
            proxyCity: this.proxyCity
          });
        }
        callback({ authCredentials: { username, password } });
      };

      chrome.webRequest.onAuthRequired.addListener(
        this._authListener,
        { urls: ['<all_urls>'] },
        ['asyncBlocking']
      );
    }

    async enable() {
      if (!this.env) await this.init();
      else await this._resolvePasswordBase();
      this._ensureAuthListener();
      this.enabled = true;

      const { host, port } = this.getConfig();
      await chrome.proxy.settings.set({
        value: {
          mode: 'fixed_servers',
          rules: {
            singleProxy: { scheme: 'http', host, port },
            bypassList: ['localhost', '127.0.0.1', '::1']
          }
        },
        scope: 'regular'
      });
      if (typeof debugLog === 'function') {
        debugLog('proxy.enable', { host, port, session: this.sessionId, proxyCity: this.proxyCity });
      }
      console.log('[fanika/proxy] Enabled', host + ':' + port, 'city=', this.proxyCity, 'session=', this.sessionId);
      return this.getConfig();
    }

    async disable() {
      await chrome.proxy.settings.clear({ scope: 'regular' });
      this.enabled = false;
      if (typeof debugLog === 'function') debugLog('proxy.disable', {});
      console.log('[fanika/proxy] Disabled');
      return { success: true };
    }

    async rotate() {
      if (!this.env) await this.init();
      this.sessionId = randomSessionId();
      await this._resolvePasswordBase();
      this._ensureAuthListener();
      this.enabled = true;
      if (typeof debugLog === 'function') {
        debugLog('proxy.rotate.session', { sessionId: this.sessionId, proxyCity: this.proxyCity });
      }
      console.log('[fanika/proxy] Rotating session →', this.sessionId, 'city=', this.proxyCity);
      await chrome.proxy.settings.clear({ scope: 'regular' });
      await sleep(250);
      return this.getConfig();
    }
  }

  global.sleep = global.sleep || sleep;
  global.randomSessionId = randomSessionId;
  global.buildRotatingPassword = buildRotatingPassword;
  global.ProxyRotation = ProxyRotation;
  global.proxyRotation = new ProxyRotation();
})(self);
