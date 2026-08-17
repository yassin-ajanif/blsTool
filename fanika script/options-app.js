/**
 * Fanika options — clients, settings, debug log.
 */
const mgr = window.fanikaClientManager;
const DEBUG_KEY = 'fanikaDebugLog';

let selectedId = null;

// --- Tabs ---
document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('main section').forEach((s) => s.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// --- Visa dropdowns (Spain) ---
function fillCategories() {
  const sel = document.getElementById('client-category');
  sel.innerHTML = '<option value="">-- Category --</option>';
  visaConfig.getCategories().forEach((c) => {
    const o = document.createElement('option');
    o.value = c;
    o.textContent = c;
    sel.appendChild(o);
  });
}

function fillLocations() {
  const loc = document.getElementById('client-location').value;
  const sel = document.getElementById('client-location');
  sel.innerHTML = '<option value="">-- Location --</option>';
  visaConfig.getLocationsByCountry('Spain').forEach((l) => {
    const o = document.createElement('option');
    o.value = l;
    o.textContent = l;
    sel.appendChild(o);
  });
  if (loc) sel.value = loc;
  fillVisaTypes();
}

function fillVisaTypes() {
  const location = document.getElementById('client-location').value;
  const prev = document.getElementById('client-visa-type').value;
  const sel = document.getElementById('client-visa-type');
  sel.innerHTML = '<option value="">-- Visa type --</option>';
  if (!location) return;
  visaConfig.getVisaTypes('Spain', location).forEach((t) => {
    const o = document.createElement('option');
    o.value = t;
    o.textContent = t;
    sel.appendChild(o);
  });
  if (prev) sel.value = prev;
  fillVisaSubtypes();
}

function fillVisaSubtypes() {
  const location = document.getElementById('client-location').value;
  const visaType = document.getElementById('client-visa-type').value;
  const prev = document.getElementById('client-visa-subtype').value;
  const sel = document.getElementById('client-visa-subtype');
  sel.innerHTML = '<option value="">-- Subtype --</option>';
  if (!location || !visaType) return;
  visaConfig.getVisaSubtypes('Spain', location, visaType).forEach((s) => {
    const o = document.createElement('option');
    o.value = s;
    o.textContent = s || '(default)';
    sel.appendChild(o);
  });
  if (prev) sel.value = prev;
}

document.getElementById('client-location').addEventListener('change', fillVisaTypes);
document.getElementById('client-visa-type').addEventListener('change', fillVisaSubtypes);

// --- Clients list ---
async function renderClients() {
  const clients = await mgr.loadClients();
  selectedId = (await mgr.getSelectedId()) || clients[0]?.id || null;
  const ul = document.getElementById('clients-list');
  ul.innerHTML = '';
  if (!clients.length) {
    ul.innerHTML = '<li class="hint">No clients yet — click Add client.</li>';
    return;
  }
  clients.forEach((c) => {
    const li = document.createElement('li');
    li.className = 'client-item' + (c.id === selectedId ? ' selected' : '');
    li.innerHTML = `
      <div class="meta">
        <div class="name">${escapeHtml(c.name)}</div>
        <div>${escapeHtml(c.email)} · ${escapeHtml(c.location || '?')} · ${escapeHtml(c.visaType || '?')}</div>
      </div>
      <button type="button" class="btn edit-btn">Edit</button>
      <button type="button" class="btn btn-danger del-btn">Delete</button>`;
    li.addEventListener('click', async (e) => {
      if (e.target.classList.contains('edit-btn')) {
        openForm(c);
        return;
      }
      if (e.target.classList.contains('del-btn')) {
        if (confirm('Delete ' + c.name + '?')) {
          await mgr.deleteClient(c.id);
          renderClients();
        }
        return;
      }
      await mgr.selectClient(c.id);
      selectedId = c.id;
      renderClients();
    });
    ul.appendChild(li);
  });
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function openForm(client) {
  document.getElementById('client-form-wrap').classList.remove('hidden');
  document.getElementById('form-title').textContent = client?.id ? 'Edit client' : 'Add client';
  document.getElementById('client-id').value = client?.id || '';
  document.getElementById('client-name').value = client?.name || '';
  document.getElementById('client-email').value = client?.email || '';
  document.getElementById('client-password').value = client?.password || '';
  document.getElementById('client-applicants').value = client?.applicantsCount || 1;
  document.getElementById('client-category').value = client?.category || 'Normal';
  fillLocations();
  if (client?.location) {
    document.getElementById('client-location').value = client.location;
    fillVisaTypes();
    document.getElementById('client-visa-type').value = client.visaType || '';
    fillVisaSubtypes();
    document.getElementById('client-visa-subtype').value = client.visaSubtype || '';
  }
}

document.getElementById('add-client-btn').addEventListener('click', () => openForm(null));
document.getElementById('cancel-form-btn').addEventListener('click', () => {
  document.getElementById('client-form-wrap').classList.add('hidden');
});

document.getElementById('client-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('client-id').value;
  const payload = {
    id: id || undefined,
    name: document.getElementById('client-name').value.trim(),
    email: document.getElementById('client-email').value.trim(),
    password: document.getElementById('client-password').value,
    applicantsCount: Number(document.getElementById('client-applicants').value) || 1,
    category: document.getElementById('client-category').value,
    location: document.getElementById('client-location').value,
    visaType: document.getElementById('client-visa-type').value,
    visaSubtype: document.getElementById('client-visa-subtype').value,
    country: 'Spain'
  };
  await mgr.addOrUpdateClient(payload);
  if (!id) {
    const clients = await mgr.loadClients();
    await mgr.selectClient(clients[clients.length - 1].id);
  }
  document.getElementById('form-status').textContent = 'Saved.';
  document.getElementById('client-form-wrap').classList.add('hidden');
  renderClients();
});

document.getElementById('launch-btn').addEventListener('click', async () => {
  const formWrap = document.getElementById('client-form-wrap');
  const email = document.getElementById('client-email')?.value?.trim();
  if (formWrap && !formWrap.classList.contains('hidden') && email) {
    document.getElementById('client-form').requestSubmit();
    await new Promise((r) => setTimeout(r, 200));
  }
  const client = await mgr.getSelectedClient();
  if (!client) {
    alert('Save a client first (click Save), then Launch.');
    return;
  }
  mgr.launchLogin(client);
});

// --- Settings ---
async function loadSettingsUI() {
  const s = await mgr.loadSettings();
  document.getElementById('submit-login').checked = !!s.submitPages?.loginPage;
  document.getElementById('submit-login-ms').value = s.submitPages?.loginPageMs ?? 0;
  document.getElementById('submit-captcha').checked = !!s.submitPages?.loginCaptchaPage;
  document.getElementById('submit-captcha-ms').value = s.submitPages?.loginCaptchaPageMs ?? 0;
  document.getElementById('submit-visatype').checked = !!s.submitPages?.visaTypePage;
  document.getElementById('submit-visatype-ms').value = s.submitPages?.visaTypePageMs ?? 0;
  document.getElementById('redirect-ms').value = s.redirects?.pageRedirectMs ?? 500;
}

document.getElementById('save-settings-btn').addEventListener('click', async () => {
  const settings = {
    submitPages: {
      loginPage: document.getElementById('submit-login').checked,
      loginPageMs: Number(document.getElementById('submit-login-ms').value) || 0,
      loginCaptchaPage: document.getElementById('submit-captcha').checked,
      loginCaptchaPageMs: Number(document.getElementById('submit-captcha-ms').value) || 0,
      visaTypePage: document.getElementById('submit-visatype').checked,
      visaTypePageMs: Number(document.getElementById('submit-visatype-ms').value) || 0
    },
    redirects: { pageRedirectMs: Number(document.getElementById('redirect-ms').value) || 500 }
  };
  await mgr.saveSettings(settings);
  document.getElementById('settings-status').textContent = 'Settings saved.';
});

// --- Debug log ---
async function loadDebugLog() {
  const stored = await chrome.storage.local.get([DEBUG_KEY]);
  document.getElementById('debug-log').value = stored[DEBUG_KEY] || '(empty)';
}

document.getElementById('refresh-log').addEventListener('click', loadDebugLog);
document.getElementById('clear-log').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'clearDebugLog' }, loadDebugLog);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[DEBUG_KEY]) {
    document.getElementById('debug-log').value = changes[DEBUG_KEY].newValue || '';
  }
});

// --- Init ---
fillCategories();
fillLocations();
renderClients();
loadSettingsUI();
loadDebugLog();
