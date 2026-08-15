/**
 * load-env.js — parse fanika `.env` for the service worker.
 * Call from background via importScripts('load-env.js').
 */
(function (global) {
  function parseEnvText(text) {
    const out = {};
    String(text || '')
      .split(/\r?\n/)
      .forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const eq = trimmed.indexOf('=');
        if (eq === -1) return;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        out[key] = value;
      });
    return out;
  }

  async function loadEnv(path = '.env') {
    const url = chrome.runtime.getURL(path);
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`Failed to load ${path}: HTTP ${res.status}`);
    }
    return parseEnvText(await res.text());
  }

  global.parseEnvText = parseEnvText;
  global.loadEnv = loadEnv;
})(self);
