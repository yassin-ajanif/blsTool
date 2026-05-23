# Login Page — Full Execution Flow

## Overview
When the user navigates to `https://blsspainmorocco.net/account/login`, the following chain of events happens automatically. Five scripts are injected into the page, each with a specific role.

---

## Phase 0: User Sets Up Clients (Options Page)

Before the bot runs, the user configures clients in the extension's **options page** (`options/options.html`):

```
┌──────────────────────────────────────────────────────┐
│  Trump Extension Dashboard                           │
├──────────────────────────────────────────────────────┤
│  [+ Add Client]                                      │
│                                                      │
│  ┌──────────────────────────────────────────────────┐│
│  │ ○ John Doe  ─── Spain / Tourist / Normal [✏️🗑️]  ││
│  │ ● Alice Smith ─ Spain / Business / Premium [✏️🗑️] ││ ← selected
│  │ ○ Bob  ────── Portugal / Tourist / Normal [✏️🗑️]  ││
│  └──────────────────────────────────────────────────┘│
│                                                      │
│              [ LAUNCH ]                               │
└──────────────────────────────────────────────────────┘
```

**What happens when user clicks a client then LAUNCH:**

1. `options.js` calls `clientManager.selectClient(id)` (line 977)
2. `unified-client.js:360` saves `selectedClientId` to `chrome.storage.local`
3. `unified-client.js:363` triggers time sync with BLS server
4. `unified-client.js:373` opens BLS login page: `chrome.tabs.create({ url: loginUrl })`

So `chrome.storage.local` already has the data before the login page loads:

```
chrome.storage.local
├── clients: [{ id:"...", name:"Alice Smith", email:"alice@...", password:"...", ... }]
├── selectedClientId: "the-selected-client-uuid"
├── settings: { submitPages: { loginPage: true, loginPageMs: 5000 }, ... }
└── ...
```

When the login page scripts call `getExtensionData()`, they get the selected client's data from this storage.

---

## Phase 1: Content Script Activation (Browser-Level)

### 1.1 Manifest Triggers injector.js
**File:** `manifest.json:48-51,57`

Chrome matches the URL pattern `https://www.blsspainmorocco.net/*` and automatically runs `injector.js` as a content script in an isolated context.

### 1.2 injector.js Injects Helpers
**File:** `injector.js:59-64, 68-115`

Creates a `<script>` element with helper functions and appends it to the page DOM. These now run in the **page's JavaScript context**:

| Function | Role |
|----------|------|
| `window.getExtensionData()` | Requests client data (email, password, settings) from `chrome.storage` via postMessage bridge |
| `window.setExtensionData()` | Saves data back to `chrome.storage` |
| `window.ShowExtLoader()` | Shows a CSS spinner overlay |
| `window.HideExtLoader()` | Hides the spinner overlay |

### 1.3 injector.js Signals Readiness
**File:** `injector.js:333`

Dispatches `blsInjectorInitialized` event on the document.

---

## Phase 2: Background Script Detects the Page (Parallel to Phase 1)

### 2.1 PageManager Listens for Tab Changes
**File:** `page-manager.js:28-33`

Listens to `chrome.tabs.onUpdated`. When `info.status === 'loading'` and URL contains a BLS domain, calls `handleTab(tabId, url)`.

### 2.2 URL Pattern Matching
**File:** `page-manager.js:44-47`, `page-patterns.json:3`

`detect()` checks if the lowercase URL contains `/account/login` → returns `"login"`.

### 2.3 Script List Built
**File:** `page-manager.js:54-64`

```js
scriptsToInject = [
  // From page-patterns.json "shared" array:
  "utils/shared/countdown",
  "utils/shared/RedirectOrRefresh",
  "utils/shared/Infos",
  "utils/shared/overlays",
  // From line 62-63 (main page script):
  "spain/login-page"
]
```

### 2.4 Scripts Fetched and Injected
**File:** `page-manager.js:70-93`

For each script in order:
1. Fetch the `.js` file from extension directory
2. Send `{ action: 'injectScript', script: <file content>, path: <path> }` to the injector

### 2.5 injector.js Receives and Injects
**File:** `injector.js:121-139`

Creates a `<script>` element, sets `textContent` to the script code, appends to DOM → script executes immediately. Scripts run in the order they were sent.

---

## Phase 3: Script Execution on the Page (in Order)

### 3.1 countdown.js
**File:** `content-scripts/utils/shared/countdown.js`

**What it does:**
- Defines `window.startCountdown(delayMs, elementId, callback)`

**Business logic:**
- When called by another script, shows a countdown on a button (e.g. "Submit (4.2s)")
- After the delay, either clicks the button or runs a callback
- Purpose: delay auto-submission to avoid looking like a bot

### 3.2 RedirectOrRefresh.js
**File:** `content-scripts/utils/shared/RedirectOrRefresh.js`

**What it does (runs immediately + interval):**
- Sets up a `DOMContentLoaded` listener (line 130) to check page state
- Sets up a 500ms `setInterval` (line 142) for continuous error monitoring

**Two responsibilities:**

| Condition | Action |
|-----------|--------|
| `<h1>` contains "Too Many" or "Temporarily Restricted" | Sends `wipeCookies` message → background deletes all BLS cookies to reset rate limit |
| `<h1>` contains 502/503/504/"Gateway Time-out"/"Error occurred" | Reloads the page after configurable delay |
| URL contains `/mar/home/index`, `/newcaptcha/loginsubmit`, `/account/changepassword`, etc. | Redirects to `/MAR/appointment/newappointment` (skip intermediary pages) |

### 3.3 Infos.js
**File:** `content-scripts/utils/shared/Infos.js`

**What it does (runs immediately):**
- Calls `getExtensionData()` to get client name, category, and time sync offset
- Stores `window.currentTimeOffset` globally for other scripts
- Starts an interval waiting for the first `<h5>` element on the page
- When `<h5>` found, appends a `<span>` showing: `CLIENT_NAME|CATEGORY|[SES:MM:SS]`
- Updates `[SES:MM:SS]` every second showing remaining session time from `localStorage`

### 3.4 overlays.js
**File:** `content-scripts/utils/shared/overlays.js`

**What it does (runs immediately):**
- Injects custom CSS styles for the topbar buttons
- Creates a persistent **topbar** at the top of the page with these controls:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Response: 200 POST | /appointment/slotselection        [click for details]  │
├─────────────────────────────────────────────────────────────────────────────┤
│ [10:23:45] [CLDR: --:--:--] [Loader] [SES] [🔴] [Premium] [10:23:45.123] [✓] │
└─────────────────────────────────────────────────────────────────────────────┘
│                                                                             │
│              ┌──────────────────────────────────────┐                       │
│              │           BLS LOGIN PAGE             │                       │
│              │                                      │                       │
│              │  Email: [_____________________]      │                       │
│              │                                      │                       │
│              │  [         Verify         ]          │                       │
│              └──────────────────────────────────────┘                       │
```

| Button | ID | Purpose |
|--------|----|---------|
| Login time | `btn-logintime` | Shows login timestamp from localStorage |
| CLDR time | `btn-slotselectiontime` | Shows calendar reached time (hidden by default) |
| Loader | `btn-hideloader` | Manually hides BLS loading overlay |
| SES | `btn-session` | Opens login page in an iframe modal |
| WiFi icon | `btn-groupsubmit` | Shows GroupSubmit connection status (red=disconnected, green=connected) |
| Category selector | `btn-category` | Cycles through Normal/Premium/PrimeTime, saves to storage |
| Time sync | `btn-timesync` | Shows current server time (based on NTP offset), click to resync |
| 202 | `btn-202` | Warms up session by loading `/MAR/home/index` in hidden iframe |

- Adds a **response display bar** showing HTTP request status codes
- Sets up `postMessage` listener for status updates from the extension
- Defines `quickWarmup()`: loads `/MAR/home/index` in hidden iframe to warm up the session before POST requests

### 3.5 login-page.js (The Bot Logic)
**File:** `content-scripts/spain/login-page.js`

**What it does (runs immediately as async IIFE):**

1. **Calls `getExtensionData()`** (line 8) to get client email and settings.

2. **Starts an interval (100ms)** (line 71, 46-68) checking for:

   | Check | What it does | Line |
   |-------|-------------|------|
   | Email input | Finds visible `input[type="text"]`, fills it with client email, triggers `input`+`change` events | 50-55 |
   | CSRF token | Finds hidden `__RequestVerificationToken`, sets up `$.ajaxSetup` to include it in all POST headers | 59-65 |
   | OnSubmitVerify | Patches BLS's `OnSubmitVerify()` function — replaces `ShowLoader()`/`HideLoader()` calls with `ShowExtLoader()`/`HideExtLoader()` (extension's own loader) | 12-26, 67 |

3. **When all three conditions are met** (line 30-43):
   - Saves login time to `localStorage` as `logintime`
   - If auto-submit is enabled in settings (`submitPages.loginPage`): starts countdown via `startCountdown()`, then clicks `btnVerify` (the login submit button)
   - If auto-submit is disabled: does nothing (user submits manually)

4. **Stops the interval** (`clearInterval`) once done.

---

## Phase 4: What Happens After Submit

When `btnVerify` is clicked (by bot or user):

1. **BLS validates credentials** — if correct, BLS returns a session
2. **BLS redirects** to `/MAR/NewCaptcha/LogInCaptcha` (captcha page)
3. **RedirectOrRefresh.js** detects the URL doesn't match any redirect pattern, so does nothing
4. **PageManager** detects the new URL → matches `/newcaptcha/logincaptcha` → injects `logincaptcha-page.js`

## Notes

- The login page **only fills the email**. The password is filled on the **captcha page** (`logincaptcha-page.js`), not on the login page.
- The `btnVerify` button calls BLS's `OnSubmitVerify()` which was patched to use the extension's loader instead of BLS's built-in loader.
- All DOM manipulation is done via jQuery (`$element.val()`, `.trigger()`) — no mouse events or clicks are simulated.
