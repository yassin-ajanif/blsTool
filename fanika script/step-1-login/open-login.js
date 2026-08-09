/**
 * Step 1 — Open BLS Spain login (helper for messaging / future UI)
 * Background already opens login on toolbar click; this mirrors the same URL.
 */
const STEP1_LOGIN_URL = 'https://www.blsspainmorocco.net/MAR/account/login';

function openStep1Login() {
  return chrome.runtime.sendMessage({ action: 'openStep1Login' });
}
