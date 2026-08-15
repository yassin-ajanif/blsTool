/**
 * RotateProxies service
 * Chrome-only IPRoyal tunnel: enable proxy, rotate sticky session, verify public IP.
 *
 * Requires: load-env.js, proxy-rotation.js (importScripts before this file)
 */
(function (global) {
  const IP_LOOKUP_URL = 'https://ipv4.icanhazip.com/';
  const DEFAULT_MAX_ATTEMPTS = 20;
  const DEFAULT_RETRY_MS = 400;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  class RotateProxiesService {
    constructor() {
      this.lastIp = null;
      this.lastRotateAt = null;
    }

    get maxAttempts() {
      const n = Number(proxyRotation.env?.PROXY_ROTATE_MAX_ATTEMPTS);
      return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_ATTEMPTS;
    }

    get retryMs() {
      const n = Number(proxyRotation.env?.PROXY_ROTATE_RETRY_MS);
      return Number.isFinite(n) && n >= 0 ? n : DEFAULT_RETRY_MS;
    }

    async start() {
      await proxyRotation.init();
      const config = await proxyRotation.enable();
      console.log('[fanika/rotate-proxies] tunnel on', config.host + ':' + config.port, 'session=', config.sessionId);
      return { success: true, proxy: this._safeProxy(config) };
    }

    async stop() {
      await proxyRotation.disable();
      return { success: true };
    }

    async rotate() {
      const previousSession = proxyRotation.sessionId;
      const previousIp = this.lastIp;
      const config = await proxyRotation.rotate();
      this.lastRotateAt = Date.now();
      console.log('[fanika/rotate-proxies] rotated', previousSession, '→', config.sessionId);
      return {
        success: true,
        previousSession,
        previousIp,
        proxy: this._safeProxy(config)
      };
    }

    async verifyIp() {
      const res = await fetch(IP_LOOKUP_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`IP lookup HTTP ${res.status}`);
      const ip = (await res.text()).trim();
      if (!ip) throw new Error('Empty IP response');
      this.lastIp = ip;
      return { success: true, ip, sessionId: proxyRotation.sessionId };
    }

    async rotateAndVerify() {
      const rotated = await this.rotate();
      let ipResult = { success: false, ip: null };
      try {
        ipResult = await this.verifyIp();
      } catch (err) {
        ipResult = { success: false, ip: null, error: err.message };
      }
      const changed = Boolean(
        rotated.previousIp && ipResult.ip && rotated.previousIp !== ipResult.ip
      );
      return {
        success: true,
        changed,
        attempts: 1,
        previousIp: rotated.previousIp,
        ip: ipResult.ip,
        ipError: ipResult.error || null,
        previousSession: rotated.previousSession,
        sessionId: proxyRotation.sessionId,
        proxy: rotated.proxy
      };
    }

    /**
     * Keep rotating until icanhazip IP differs. Does not reload pages.
     */
    async rotateUntilIpChanges() {
      if (!this.lastIp) {
        try {
          await this.verifyIp();
        } catch (err) {
          console.warn('[fanika/rotate-proxies] could not read current IP:', err.message);
        }
      }

      const previousIp = this.lastIp;
      const maxAttempts = this.maxAttempts;
      let last = {
        success: false,
        changed: false,
        attempts: 0,
        previousIp,
        ip: previousIp,
        sessionId: proxyRotation.sessionId,
        proxy: this._safeProxy(proxyRotation.env ? proxyRotation.getConfig() : null)
      };

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        last = await this.rotateAndVerify();
        last.attempts = attempt;
        last.previousIp = previousIp;
        last.changed = Boolean(previousIp && last.ip && previousIp !== last.ip);

        console.log(
          '[fanika/rotate-proxies] attempt',
          attempt + '/' + maxAttempts,
          previousIp || '?',
          '→',
          last.ip || '?',
          'changed=',
          last.changed
        );

        if (typeof debugLog === 'function') {
          debugLog('proxy.rotate.attempt', {
            attempt,
            maxAttempts,
            previousIp,
            ip: last.ip,
            changed: last.changed,
            sessionId: last.sessionId
          });
        }

        if (last.changed) {
          last.success = true;
          return last;
        }

        if (attempt < maxAttempts) await sleep(this.retryMs);
      }

      last.success = false;
      last.changed = false;
      last.error = 'IP did not change after ' + maxAttempts + ' rotates — not reloading';
      return last;
    }

    getStatus() {
      const enabled = Boolean(proxyRotation.enabled);
      let proxy = null;
      try {
        if (proxyRotation.env) proxy = this._safeProxy(proxyRotation.getConfig());
      } catch (_) {}
      return {
        success: true,
        enabled,
        ip: this.lastIp,
        lastRotateAt: this.lastRotateAt,
        proxy
      };
    }

    _safeProxy(config) {
      if (!config) return null;
      return {
        host: config.host,
        port: config.port,
        username: config.username,
        sessionId: config.sessionId,
        lifetime: config.lifetime,
        country: config.country
      };
    }
  }

  global.RotateProxiesService = RotateProxiesService;
  global.rotateProxies = new RotateProxiesService();
})(self);
