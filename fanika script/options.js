const STORAGE_KEY = 'fanikaDebugLog';
const logEl = document.getElementById('log');

function setLog(text) {
  logEl.value = text || '(empty)';
  logEl.scrollTop = logEl.scrollHeight;
}

async function loadLog() {
  const stored = await chrome.storage.local.get([STORAGE_KEY]);
  setLog(stored[STORAGE_KEY] || '');
}

document.getElementById('refresh').addEventListener('click', loadLog);

document.getElementById('clear').addEventListener('click', async () => {
  chrome.runtime.sendMessage({ action: 'clearDebugLog' }, () => loadLog());
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEY]) {
    setLog(changes[STORAGE_KEY].newValue || '');
  }
});

loadLog();
