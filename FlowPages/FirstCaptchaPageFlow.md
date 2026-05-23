# First Captcha Page (LogInCaptcha) — Full Execution Flow

## Overview
After login succeeds, BLS redirects to `https://blsspainmorocco.net/MAR/NewCaptcha/LogInCaptcha`. This page fills the **password** (skipped on login) and solves the **first captcha challenge**. Six scripts are injected into this page.

---

## Phase 0: Pre-requisite — Login Page Already Ran

The user already clicked a client on the dashboard and the login page already filled the email. Now BLS redirected to the captcha page. Same `selectedClientId` still in storage.

---

## Phase 1: Content Script Activation (Browser-Level)

Same as login page — `injector.js` runs automatically (manifest), injects helpers (`getExtensionData`, `setExtensionData`, loader), fires `blsInjectorInitialized`.

---

## Phase 2: Background Script Detects the Page

### 2.1 PageManager Listens for Tab Changes
**File:** `page-manager.js:28`

`chrome.tabs.onUpdated` fires with new URL.

### 2.2 URL Pattern Matching
**File:** `page-manager.js:46`, `page-patterns.json:4`

URL contains `/newcaptcha/logincaptcha` → returns `"logincaptcha"`.

### 2.3 Script List Built
**File:** `page-manager.js:54-64`

```js
scriptsToInject = [
  // Shared (from page-patterns.json):
  "utils/shared/countdown",
  "utils/shared/RedirectOrRefresh",
  "utils/shared/Infos",
  "utils/shared/overlays",
  // Page-specific (from page-patterns.json "logincaptcha"):
  "utils/captcha/captchasolver",
  // Main page script:
  "spain/logincaptcha-page"
]
```

### 2.4 Scripts Fetched and Injected
**File:** `page-manager.js:70-93`

Same as login page — fetch `.js` files, send to injector, injector appends to DOM as `<script>` elements.

---

## Phase 3: Script Execution on the Page (in Order)

### 3.1-3.4 Shared Scripts (Same as Login Page)

- `countdown.js` — provides `startCountdown()` for delayed auto-submit
- `RedirectOrRefresh.js` — monitors `<h1>` for errors, checks URL for redirect patterns
- `Infos.js` — shows `CLIENT_NAME|CATEGORY|[SES:MM:SS]` after first `<h5>`, stores `window.currentTimeOffset`
- `overlays.js` — creates the topbar toolbar with all control buttons and response bar

### 3.5 captchasolver.js
**File:** `content-scripts/utils/captcha/captchasolver.js`

This is the **captcha solving engine**. It does **not** run automatically — it's called by `logincaptcha-page.js`.

**Flow when called (`solve()` at line 57):**

```
1. Read settings via getExtensionData() (line 81-85)
   → Which captcha service to use (nocaptchaai / truecaptcha / servercaptcha)
   → API keys

2. Wait for captcha images to load on page (line 136-196)
   → Polls every 50ms until all .captcha-img elements are loaded
   → Max 40 attempts (2 seconds)

3. Extract target number (line 200-204)
   → Reads the .box-label text (e.g. "Click on all images with number 5")
   → Extracts just the digit: "5"

4. Build captcha grid (line 209-225)
   → Finds all visible captcha image containers
   → Sorts by position (top→bottom, left→right)
   → Extracts only the top 3 images per row
   → Returns array of <img> elements in grid order

5. Send to external API (line 240-255)
   ┌──────────────────────┬──────────────────────┐
   │ Service              │ Endpoint             │
   ├──────────────────────┼──────────────────────┤
   │ NoCaptchaAI (default)│ pro.nocaptchaai.com  │
   │ TrueCaptcha          │ api.apitruecaptcha.org│
   │ ServerCaptcha        │ custom user endpoint │
   └──────────────────────┴──────────────────────┘
   → Sends all image base64 data as JSON
   → API returns: { solution: { '0': '3', '1': '5', '2': '5', ... } }

6. Click matching images (line 314-318)
   → For each image index where solution value === target number
   → Calls grid[index].click() to select that image
   → Then calls success callback → submits form
```

**Key detail:** The captcha images are already in **base64** format embedded in the page HTML. The bot extracts their `src` attributes and forwards them directly to the API — no screenshot or DOM rendering needed.

### 3.6 logincaptcha-page.js (The Bot Logic)
**File:** `content-scripts/spain/logincaptcha-page.js`

**What it does (runs immediately as async IIFE):**

1. **Calls `getExtensionData()`** (line 8) to get client password and settings.

2. **Starts an interval (100ms)** (line 84, 45-82) checking for:

   | Check | What it does | Line |
   |-------|-------------|------|
   | Password field | Finds visible `input[type="password"]`, fills it with client password, triggers `change` | 49-56 |
   | CSRF token | Same as login page — sets up `$.ajaxSetup` with token header | 58-65 |
   | Captcha | Waits for `#captcha-main-div` with all images loaded, then calls `CaptchaSolver.solve()` | 67-79 |
   | onSubmit | Patches BLS's `onSubmit()` — replaces `ShowLoader()`/`HideLoader()` with extension's versions | 12-26 |

3. **When all four conditions are met** (line 30-42):
   - If auto-submit enabled in settings (`submitPages.loginCaptchaPage`): starts countdown via `startCountdown()`, then clicks `btnVerify`
   - If disabled: does nothing (user solves manually and submits)

4. **Stops the interval** (`clearInterval`) once done.

---

## Phase 4: What Happens After Submit

When `btnVerify` is clicked (by bot or user):

1. BLS validates **password** + **captcha** answer (which images were clicked)
2. If both correct: BLS redirects to `/MAR/Appointment/NewAppointment` (visa type selection page)
3. If captcha wrong: BLS stays on same page with a new captcha — `logincaptcha-page.js` re-solves automatically (interval still running, `captcha` status reset)
4. **RedirectOrRefresh.js** checks URL — `/mar/newcaptcha/loginsubmit` matches redirect pattern (`RedirectOrRefresh.js:107`) → redirects to `/MAR/appointment/newappointment`
5. **PageManager** detects new URL → matches `visatype` → injects `visatype-page.js`

## Notes

- The **password is filled on this page**, not on the login page. On login, only email was filled.
- Captcha solving is **asynchronous** — the API call takes 5-30 seconds depending on the service.
- Two captcha services are supported: **NoCaptchaAI** (default, costs credits) and **TrueCaptcha** (free/paid). User chooses in settings.
- The captcha grid is 3×N (3 images per row, variable rows). Only the **top 3 images per row** are considered (line 221).
- If retries fail, `CaptchaSolver.onError()` shows a failure message on the page.
