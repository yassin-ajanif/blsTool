/**
 * proxy-rotation.js — IPRoyal sticky session rotation for Fanika (Chrome only).
 * Does NOT use the OS network proxy. Uses chrome.proxy + proxy auth.
 *
 * Requires: load-env.js (importScripts before this file)
 * Permissions: proxy, webRequest, webRequestAuthProvider
 */
(function (global) {
  function randomSessionId(len = 10) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let out = '';
    const arr = new Uint8Array(len);
    crypto.getRandomValues(arr);
    for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
    return out;
  }

  /**
   * Strip _session / _lifetime; keep _country (and any other base suffix).
   * Append fresh session + lifetime for on-demand sticky IP rotation.
   */
  function buildRotatingPassword(basePassword, { country, session, lifetime } = {}) {
    let base = String(basePassword || '')
      .replace(/_session-[^_]+/gi, '')
      .replace(/_lifetime-[^_]+/gi, '')
      .trim();

    if (country && !/_country-/i.test(base)) {
      base += `_country-${country}`;
    }
    if (session) base += `_session-${session}`;
    if (lifetime != null && lifetime !== '') base += `_lifetime-${lifetime}`;
    return base;
  }

  class ProxyRotation {
    constructor() {
      this.env = null;
      this.sessionId = null;
      this.enabled = false;
      this._authListener = null;
    }

    async init() {
      this.env = await loadEnv('.env');
      const host = this.env.PROXY_HOST;
      const port = Number(this.env.PROXY_PORT);
      const username = this.env.PROXY_USERNAME;
      const password = this.env.PROXY_PASSWORD;

      if (!host || !port || !username || !password) {
        throw new Error('Missing PROXY_HOST / PROXY_PORT / PROXY_USERNAME / PROXY_PASSWORD in .env');
      }

      if (!this.sessionId) {
        this.sessionId = randomSessionId();
      }
      return this.getConfig();
    }

    get lifetime() {
      const n = Number(this.env?.PROXY_LIFETIME);
      return Number.isFinite(n) && n > 0 ? n : 3600;
    }

    get country() {
      return (this.env?.PROXY_COUNTRY || '').trim();
    }

    /** Current proxy auth: username + password with session params */
    getCredentials() {
      if (!this.env) throw new Error('ProxyRotation not initialized');
      return {
        username: this.env.PROXY_USERNAME,
        password: buildRotatingPassword(this.env.PROXY_PASSWORD, {
          country: this.country,
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
        country: this.country || null
      };
    }

    _ensureAuthListener() {
      if (this._authListener) return;

      this._authListener = (details) => {
        if (!details.isProxy || !this.enabled) return {};
        const { username, password } = this.getCredentials();
        return { authCredentials: { username, password } };
      };

      chrome.webRequest.onAuthRequired.addListener(
        this._authListener,
        { urls: ['<all_urls>'] },
        ['blocking']
      );
    }

    async enable() {
      if (!this.env) await this.init();
      this._ensureAuthListener();

      const { host, port } = this.getConfig();
      await chrome.proxy.settings.set({
        value: {
          mode: 'fixed_servers',
          rules: {
            singleProxy: {
              scheme: 'http',
              host,
              port
            },
            bypassList: ['localhost', '127.0.0.1', '::1']
          }
        },
        scope: 'regular'
      });

      this.enabled = true;
      console.log('[fanika/proxy] Enabled', host + ':' + port, 'session=', this.sessionId);
      return this.getConfig();
    }

    async disable() {
      await chrome.proxy.settings.clear({ scope: 'regular' });
      this.enabled = false;
      console.log('[fanika/proxy] Disabled (Chrome proxy cleared)');
      return { success: true };
    }

    /**
     * On-demand IP rotate: new sticky session id (no TTL wait).
     * Re-applies chrome.proxy so new connections use the new session.
     */
    async rotate() {
      if (!this.env) await this.init();
      this.sessionId = randomSessionId();
      console.log('[fanika/proxy] Rotating session →', this.sessionId);
      await this.enable();
      return this.getConfig();
    }
  }

  global.randomSessionId = randomSessionId;
  global.buildRotatingPassword = buildRotatingPassword;
  global.ProxyRotation = ProxyRotation;
  global.proxyRotation = new ProxyRotation();
})(self);
