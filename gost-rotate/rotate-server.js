/**
 * Local gost rotate helper.
 * Fanika → POST http://127.0.0.1:9999/rotate → restart gost with new _session-
 *
 * Run:  node rotate-server.js
 * Keep this terminal open while using Fanika + FoxyProxy → 127.0.0.1:8888
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const ROOT = __dirname;

function loadEnv(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

const env = { ...loadEnv(path.join(ROOT, '.env')), ...process.env };

const PROXY_HOST = env.PROXY_HOST || 'geo.iproyal.com';
const PROXY_PORT = env.PROXY_PORT || '11231';
const PROXY_USERNAME = env.PROXY_USERNAME;
const PROXY_PASSWORD = env.PROXY_PASSWORD;
const PROXY_LIFETIME = env.PROXY_LIFETIME || '30m';
const GOST_LISTEN = env.GOST_LISTEN || '127.0.0.1:8888';
const HELPER_HOST = env.HELPER_HOST || '127.0.0.1';
const HELPER_PORT = Number(env.HELPER_PORT || 9999);

if (!PROXY_USERNAME || !PROXY_PASSWORD) {
  console.error('[gost-rotate] Missing PROXY_USERNAME / PROXY_PASSWORD in .env');
  process.exit(1);
}

let gostChild = null;
let currentSession = null;
let rotating = false;

function randomSession(len = 10) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function buildPassword(sessionId) {
  let base = String(PROXY_PASSWORD)
    .replace(/_session-[^_]+/gi, '')
    .replace(/_lifetime-[^_]+/gi, '')
    .trim();
  return `${base}_session-${sessionId}_lifetime-${PROXY_LIFETIME}`;
}

function listenPort() {
  const m = String(GOST_LISTEN).match(/:(\d+)$/);
  return m ? m[1] : '8888';
}

function freeListenPort() {
  const port = listenPort();
  try {
    execSync(`fuser -k ${port}/tcp 2>/dev/null || true`, { stdio: 'ignore' });
  } catch (_) {}
  try {
    execSync(`pkill -f "gost -L http://${GOST_LISTEN}" 2>/dev/null || true`, { stdio: 'ignore' });
  } catch (_) {}
}

function stopGost() {
  if (gostChild && !gostChild.killed) {
    try {
      gostChild.kill('SIGTERM');
    } catch (_) {}
    gostChild = null;
  }
  freeListenPort();
}

function startGost(sessionId) {
  stopGost();
  currentSession = sessionId || randomSession();
  const pass = buildPassword(currentSession);
  const forward = `http://${PROXY_USERNAME}:${pass}@${PROXY_HOST}:${PROXY_PORT}`;

  gostChild = spawn('gost', ['-L', `http://${GOST_LISTEN}`, '-F', forward], {
    stdio: ['ignore', 'ignore', 'pipe'],
    detached: false
  });

  gostChild.stderr?.on('data', (buf) => {
    const line = buf.toString().trim();
    if (line) console.warn('[gost]', line.slice(0, 200));
  });

  gostChild.on('exit', (code, signal) => {
    console.log('[gost-rotate] gost exited', { code, signal, session: currentSession });
    if (gostChild && gostChild.pid) gostChild = null;
  });

  console.log('[gost-rotate] gost up', GOST_LISTEN, '→', `${PROXY_HOST}:${PROXY_PORT}`, 'session=', currentSession);
  return currentSession;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchIpViaGost() {
  const proxyUrl = `http://${GOST_LISTEN}`;
  try {
    const out = execSync(
      `curl -sS --max-time 15 -x ${proxyUrl} https://ipv4.icanhazip.com/`,
      { encoding: 'utf8' }
    ).trim();
    if (!out || !/^\d+\.\d+\.\d+\.\d+$/.test(out)) {
      throw new Error('bad ip: ' + out);
    }
    return out;
  } catch (err) {
    throw new Error(err.message || String(err));
  }
}

async function rotateUntilIpChanges(maxAttempts = 8) {
  rotating = true;
  let previousIp = null;
  try {
    try {
      previousIp = await fetchIpViaGost();
    } catch (_) {
      previousIp = null;
    }

    let lastIp = previousIp;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const session = startGost();
      await sleep(1200);
      let ip = null;
      try {
        ip = await fetchIpViaGost();
      } catch (err) {
        console.warn('[gost-rotate] ip check fail', attempt, err.message);
        continue;
      }
      lastIp = ip;
      if (previousIp && ip && ip !== previousIp) {
        return {
          ok: true,
          changed: true,
          previousIp,
          ip,
          session,
          attempt
        };
      }
      if (!previousIp && ip) {
        previousIp = ip;
        // first successful read — rotate once more to force change
      }
    }

    return {
      ok: true,
      changed: Boolean(previousIp && lastIp && previousIp !== lastIp),
      previousIp,
      ip: lastIp,
      session: currentSession,
      attempt: maxAttempts
    };
  } finally {
    rotating = false;
  }
}

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(data);
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    json(res, 204, {});
    return;
  }

  const url = new URL(req.url || '/', `http://${HELPER_HOST}:${HELPER_PORT}`);

  if (url.pathname === '/health' || url.pathname === '/') {
    json(res, 200, {
      ok: true,
      gostListen: GOST_LISTEN,
      session: currentSession,
      rotating,
      pid: gostChild?.pid || null
    });
    return;
  }

  if (url.pathname === '/ip') {
    try {
      const ip = await fetchIpViaGost();
      json(res, 200, { ok: true, ip, session: currentSession });
    } catch (err) {
      json(res, 500, { ok: false, error: err.message });
    }
    return;
  }

  if (url.pathname === '/rotate' && (req.method === 'POST' || req.method === 'GET')) {
    if (rotating) {
      json(res, 409, { ok: false, error: 'rotation already in progress' });
      return;
    }
    console.log('[gost-rotate] /rotate requested');
    try {
      const result = await rotateUntilIpChanges();
      console.log('[gost-rotate] /rotate done', result);
      json(res, 200, result);
    } catch (err) {
      console.error('[gost-rotate] /rotate fail', err);
      json(res, 500, { ok: false, error: err.message });
    }
    return;
  }

  json(res, 404, { ok: false, error: 'not found' });
});

process.on('SIGINT', () => {
  stopGost();
  process.exit(0);
});
process.on('SIGTERM', () => {
  stopGost();
  process.exit(0);
});

startGost();
server.listen(HELPER_PORT, HELPER_HOST, () => {
  console.log(`[gost-rotate] helper listening http://${HELPER_HOST}:${HELPER_PORT}`);
  console.log('[gost-rotate] FoxyProxy →', GOST_LISTEN, '| Fanika → POST /rotate');
});
