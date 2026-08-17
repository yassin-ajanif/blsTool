function setStatus(text, cls) {
  const el = document.getElementById('status');
  el.className = cls || '';
  el.textContent = text;
}

function applyResult(data) {
  if (data?.ip) document.getElementById('ip').textContent = data.ip;
}

function send(action) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action }, (res) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(res || { success: false, error: 'No response' });
    });
  });
}

async function refresh() {
  const ip = await send('getPublicIp');
  applyResult(ip);
}

/* --- Start tunnel / Rotate — DISABLED ---
document.getElementById('start').addEventListener('click', async () => { ... });
document.getElementById('rotate').addEventListener('click', async () => { ... });
--- */

document.getElementById('login').addEventListener('click', async () => {
  setStatus('Opening login (wipe cookies)…');
  const res = await send('openLogin');
  if (!res.success) {
    setStatus(res.error || 'Open login failed', 'err');
    return;
  }
  setStatus('Login opened — cookies wiped: ' + (res.cookiesWiped ?? '?'), 'ok');
});

document.getElementById('openLog').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

refresh();
