function setStatus(text, cls) {
  const el = document.getElementById('status');
  el.className = cls || '';
  el.textContent = text;
}

function applyResult(data) {
  if (data?.ip) document.getElementById('ip').textContent = data.ip;
  const session = data?.sessionId || data?.proxy?.sessionId;
  if (session) document.getElementById('session').textContent = session;
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
  const status = await send('rotateProxiesStatus');
  applyResult(status);
  if (!status?.ip) {
    const ip = await send('getPublicIp');
    applyResult(ip);
  }
}

document.getElementById('start').addEventListener('click', async () => {
  setStatus('Starting tunnel…');
  const res = await send('enableProxy');
  if (!res.success) {
    setStatus(res.error || 'Start failed', 'err');
    return;
  }
  const ip = await send('getPublicIp');
  applyResult({ ...res, ...ip });
  setStatus(ip.ip ? 'Tunnel on — IP ' + ip.ip : 'Tunnel on', 'ok');
});

document.getElementById('rotate').addEventListener('click', async () => {
  setStatus('Rotating…');
  const res = await send('rotateProxy');
  applyResult(res);
  if (!res.success) {
    setStatus(res.error || 'Rotate failed', 'err');
    return;
  }
  const msg = res.changed
    ? 'IP changed (' + (res.attempts || '?') + ' tries): ' + (res.previousIp || '?') + ' → ' + res.ip
    : (res.error || 'IP still the same after rotates — did not reload');
  setStatus(msg, res.changed ? 'ok' : 'err');
});

document.getElementById('login').addEventListener('click', async () => {
  await send('openLogin');
});

document.getElementById('openLog').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

refresh();
