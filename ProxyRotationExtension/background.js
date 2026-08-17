/**
 * Step 1 — silent IPRoyal auth (no gost).
 *
 * Click "Rotate":
 *   1. wipe cookies + site data (all time)
 *   2. new session id
 *   3. new proxy password (..._session-XXXX_lifetime-30m)
 *   4. chrome.proxy off → on
 *   5. onAuthRequired answers with the new password
 *   6. fetch + open https://ipv4.icanhazip.com/
 */

const IP_LOOKUP = 'https://ipv4.icanhazip.com/';

let env = null;
let sessionId = null;
let username = '';
let password = ''; // full IPRoyal password including _session- / _lifetime-

function log(...args) {
  console.log('[proxy-lab]', ...args);
}

function randomSession() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  for (const b of bytes) out += chars[b % chars.length];
  return out;
}

function parseEnv(text) {
  const out = {};
  String(text || '')
    .split(/\r?\n/)
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eq = trimmed.indexOf('=');
      if (eq === -1) return;
      out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    });
  return out;
}

async function loadEnv() {
  if (env) return env;
  const res = await fetch(chrome.runtime.getURL('.env'), { cache: 'no-store' });
  if (!res.ok) throw new Error('Missing .env — copy .env.example to .env');
  env = parseEnv(await res.text());
  if (!env.PROXY_HOST || !env.PROXY_PORT || !env.PROXY_USERNAME || !env.PROXY_PASSWORD) {
    throw new Error('PROXY_HOST / PORT / USERNAME / PASSWORD required in .env');
  }
  username = env.PROXY_USERNAME;
  return env;
}

function buildPassword(session) {
  const lifetime = env.PROXY_LIFETIME || '30m';
  const base = String(env.PROXY_PASSWORD)
    .replace(/_session-[^_]+/gi, '')
    .replace(/_lifetime-[^_]+/gi, '')
    .trim();
  return `${base}_session-${session}_lifetime-${lifetime}`;
}

function applySession(id) {
  sessionId = id;
  password = buildPassword(id);
  log('session', sessionId);
  log('password suffix', password.replace(/^[^_]+/, '***'));
}

// Silent 407 handler — MV3 needs asyncBlocking + callback (a return value is ignored).
chrome.webRequest.onAuthRequired.addListener(
  (details, callback) => {
    if (!details.isProxy || !username || !password) {
      callback({});
      return;
    }
    log('407 from', details.challenger?.host, 'session=', sessionId);
    callback({ authCredentials: { username, password } });
  },
  { urls: ['<all_urls>'] },
  ['asyncBlocking']
);

async function setChromeProxy(on) {
  if (!on) {
    await chrome.proxy.settings.clear({ scope: 'regular' });
    log('chrome.proxy cleared');
    return;
  }
  const host = env.PROXY_HOST;
  const port = Number(env.PROXY_PORT);
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
  log('chrome.proxy set', host + ':' + port);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchPublicIp() {
  const res = await fetch(IP_LOOKUP, { cache: 'no-store' });
  if (!res.ok) throw new Error('icanhazip HTTP ' + res.status);
  const ip = (await res.text()).trim();
  if (!ip) throw new Error('empty icanhazip response');
  return ip;
}

async function openIcanhazip() {
  const existing = await chrome.tabs.query({ url: 'https://ipv4.icanhazip.com/*' });
  if (existing[0]?.id) {
    await chrome.tabs.reload(existing[0].id);
    await chrome.tabs.update(existing[0].id, { active: true });
    return;
  }
  await chrome.tabs.create({ url: IP_LOOKUP });
}

async function wipeCookies() {
  await chrome.browsingData.remove(
    { since: 0 },
    {
      cookies: true,
      localStorage: true,
      indexedDB: true,
      serviceWorkers: true,
      cacheStorage: true,
      fileSystems: true
    }
  );
  log('wiped cookies and site data (all time)');
}

async function rotate() {
  await loadEnv();
  await wipeCookies();
  applySession(randomSession());

  await setChromeProxy(false);
  await sleep(250);
  await setChromeProxy(true);

  const ip = await fetchPublicIp();
  log('public ip', ip);
  await openIcanhazip();

  return {
    ok: true,
    ip,
    sessionId,
    host: env.PROXY_HOST,
    port: Number(env.PROXY_PORT)
  };
}

async function disconnect() {
  await chrome.proxy.settings.clear({ scope: 'regular' });
  username = '';
  password = '';
  sessionId = null;
  log('chrome.proxy cleared — Chrome is no longer using IPRoyal');
  let ip = null;
  try {
    ip = await fetchPublicIp();
  } catch (_) {}
  return { ok: true, disconnected: true, ip };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const run =
    message?.action === 'rotate'
      ? rotate
      : message?.action === 'disconnect'
        ? disconnect
        : null;
  if (!run) return;
  run()
    .then(sendResponse)
    .catch((err) => {
      log('fail', err.message);
      sendResponse({ ok: false, error: err.message });
    });
  return true;
});

log('ready — click Rotate in the popup');
