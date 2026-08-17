const btn = document.getElementById('btn');
const disconnectBtn = document.getElementById('disconnect');
const out = document.getElementById('out');

function show(res, fallback) {
  if (chrome.runtime.lastError) {
    out.textContent = 'Error: ' + chrome.runtime.lastError.message;
    return;
  }
  if (!res?.ok) {
    out.textContent = 'Failed: ' + (res?.error || 'unknown');
    return;
  }
  out.textContent = fallback(res);
}

btn.addEventListener('click', () => {
  btn.disabled = true;
  out.textContent = 'Rotating…';
  chrome.runtime.sendMessage({ action: 'rotate' }, (res) => {
    btn.disabled = false;
    show(
      res,
      (r) =>
        'IP: ' + r.ip + '\nSession: ' + r.sessionId + '\nProxy: ' + r.host + ':' + r.port
    );
  });
});

disconnectBtn.addEventListener('click', () => {
  disconnectBtn.disabled = true;
  out.textContent = 'Disconnecting…';
  chrome.runtime.sendMessage({ action: 'disconnect' }, (res) => {
    disconnectBtn.disabled = false;
    show(
      res,
      (r) =>
        'Disconnected.\nChrome is not using IPRoyal.\nIP: ' + (r.ip || '(reload icanhazip)')
    );
  });
});
