function setStatus(text, cls) {
  const el = document.getElementById('status');
  el.className = cls || '';
  el.textContent = text;
}

function send(action, extra) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action, ...extra }, (res) => {
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
  if (ip?.ip) document.getElementById('ip').textContent = ip.ip;

  const stored = await chrome.storage.local.get(['fanikaClients', 'fanikaSelectedClientId']);
  const clients = stored.fanikaClients || [];
  const sel = clients.find((c) => c.id === stored.fanikaSelectedClientId) || clients[0];
  document.getElementById('client').textContent = sel ? sel.name : '(no client — open Options)';
}

document.getElementById('login').addEventListener('click', async () => {
  setStatus('Opening login (wipe cookies)…');
  const res = await send('openLogin');
  if (!res.success) {
    setStatus(res.error || 'Open login failed', 'err');
    return;
  }
  setStatus('Login opened — cookies wiped: ' + (res.cookiesWiped ?? '?'), 'ok');
});

document.getElementById('launch').addEventListener('click', async () => {
  const stored = await chrome.storage.local.get(['fanikaClients', 'fanikaSelectedClientId']);
  const clients = stored.fanikaClients || [];
  const sel = clients.find((c) => c.id === stored.fanikaSelectedClientId) || clients[0];
  if (!sel) {
    setStatus('Add a client in Options first', 'err');
    chrome.runtime.openOptionsPage();
    return;
  }
  setStatus('Launching ' + sel.name + '…');
  chrome.tabs.create({ url: 'https://www.blsspainmorocco.net/MAR/account/login' });
  setStatus('Opened login for ' + sel.name, 'ok');
});

document.getElementById('options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

refresh();
