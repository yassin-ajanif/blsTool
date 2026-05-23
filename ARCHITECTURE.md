# Trump Extension — Architecture & Workflow

## Overview

This is a **Chrome Extension** (Manifest V2) that automates visa appointment booking on two **BLS International** websites:

- **Spain**: `https://www.blsspainmorocco.net/MAR/*`
- **Portugal**: `https://morocco.blsportugal.com/MAR/*`

It targets users in Morocco applying for Schengen/National visas to Spain or Portugal visas. The extension automates the **entire booking flow** from login through payment, with precise time-synchronized slot submissions.

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────┐
│                    Background Script                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │ State    │  │ Intercept│  │ PageMgr  │  │ WebSocket│ │
│  │ Manager  │  │ Manager  │  │          │  │ Client   │ │
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐   │
│  │ TimeSync │  │ Auth     │  │ Message Router       │   │
│  └──────────┘  │ Manager  │  │ (listeners.js)       │   │
│                └──────────┘  └──────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│                 Content Script (Injector)                │
│  ┌─────────────────────────────────────────────────────┐│
│  │  - Message bridge (page ↔ background)              ││
│  │  - Data relay (storage ↔ page context)             ││
│  │  - Script injection (page-specific automations)    ││
│  └─────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────┤
│              Injected Page Scripts (per page)            │
│  ┌────────┐ ┌──────────┐ ┌────────────┐ ┌───────────┐  │
│  │ Login  │ │ Captcha  │ │ Slot Sel.  │ │ Payment   │  │
│  │ Page   │ │ Solver   │ │ (1483 lines)│ │ Page      │  │
│  └────────┘ └──────────┘ └────────────┘ └───────────┘  │
├─────────────────────────────────────────────────────────┤
│              Options Page (HTML Dashboard)               │
│  Clients | Applicants | Settings | Page Codes           │
├─────────────────────────────────────────────────────────┤
│             Remote Server (trumpservices.org)            │
│  Auth | Endpoints | Captcha | OTP | Telegram | WS      │
└─────────────────────────────────────────────────────────┘
```

---

## 1. Extension Initialization Flow

### Startup Sequence (`background.js`)

1. **State Initialization** — `ExtensionState` loads saved `selectedClientId`, `clients`, and `settings` from `chrome.storage.local`
2. **Auth Loading** — `loadAuthData()` reads authentication from storage; fallback to `auth.json` (bundled token)
3. **Endpoints Fetch** — Calls `POST https://trumpservices.org/api/dashboard/endpoints` with token + deviceHash to get dynamic API endpoints (captcha, OTP, Telegram, records, timesync, etc.)
4. **Time Synchronization** — `TimeSync.startSync(endpoints.timesync)` calibrates clock offset against a server timestamp
5. **Intercept Manager** — Sets up `chrome.webRequest` listeners to monitor/manipulate BLS site traffic
6. **Page Manager** — Watches for tab navigation on BLS sites and injects appropriate page scripts

### Authentication (`auth.json` / `trumpservices.org`)

```json
{ "token": "TKRSQCP0SD" }
```

The token is verified against `POST https://trumpservices.org/api/dashboard/tokens/validate`. On success, the server returns a `deviceHash` and user name. If verification fails, the extension can self-uninstall.

---

## 2. Time Synchronization System

This is the **core mechanism** enabling competitive slot booking.

### How it works (`lib/utils.js` `TimeSync` class)

1. The extension sends a `GET` request to a timesync endpoint (e.g. `http://timesync.trumpservices.org`)
2. It captures `t0` (client send time), `t1` (server time from response body), `t2` (client receive time)
3. Calculates **RTT** (Round Trip Time) = `t2 - t0`
4. Filters out samples where RTT > 200ms (up to 15 attempts)
5. **NTP-style offset**: `offset = t1 - ((t0 + t2) / 2)`
6. Saves offset to `chrome.storage.local` for persistence

```
Local Time        Server Time
    │                  │
    t0 ──────GET──────►│
    │                  │
    │◄───response t1───│
    t2                 │
    
    offset = t1 - ((t0 + t2) / 2)
    serverNow = localNow + offset
```

### Precision Usage

The slot selection page uses **microsecond precision**:

```javascript
precision: {
    milliseconds: Math.floor(timestamp % 1000),
    microseconds: Math.floor((timestamp % 1) * 1000)
}
```

This enables scheduling submissions at exact seconds + milliseconds of each minute.

---

## 3. Web Request Interception (`background/utils/intercept.js`)

The `InterceptManager` uses `chrome.webRequest` API with `"blocking"` to intercept BLS HTTP traffic.

### Key Interceptions

| Scenario | Action |
|---|---|
| `GET /appointmentcaptcha` (no params) | Redirect to `/newappointment` (skip captcha page) |
| `302` from `slotselection` → `appointmentcaptcha` | Rewrite redirect to `newappointment` |
| `302` from `slotselection` → `newappointment?msg=*` (error) | **Clear Location header** (block the redirect) |
| `302` from `slotselection` → `pendingappointment` | **Clear Location header** (block it) |
| `302` from `slotselection` → `home/error` | **Clear Location header** (block it) |
| `302` from `slotselection` → `applicantselection` | Remove Location, handle via tab redirect (triggers OTP) |
| `302` from `livenessresponse` → `payment?*` | Add `&loc=...` param, redirect via tab |
| `302` → `/account/login?ReturnUrl=` | Strip ReturnUrl to avoid loops |
| `200` from `/slotselection` | Send Telegram **CALENDAR** notification |
| `200` from `/paymentrequest` | Send Telegram **PAYMENT_CONFIRM** notification |

The interception is **aggressive**: it blocks error pages, session-expired redirects, and captcha prompts to keep the automated flow moving forward.

---

## 4. Page Detection & Script Injection (`page-manager.js`)

The `PageManager` class watches tab updates and detects which BLS page the user is on using regex patterns from `lib/page-patterns.json`:

```json
{
    "login": "/account/login",
    "logincaptcha": "/newcaptcha/logincaptcha",
    "appointmentcaptcha": "/appointment/(appointmentcaptcha|newappointment)",
    "visatype": "/appointment/visatype",
    "applicantselection": "/appointment/applicantselection",
    "slotselection": "/appointment/slotselection",
    "liveness": "/appointment/liveness",
    "payment": "/appointment/payment"
}
```

### Injection Process

1. PageManager detects a page match (e.g. `slotselection`)
2. It fetches the JS file from `content-scripts/spain/slotselection-page.js` (or `portugal/` variant)
3. Sends a message to the content script injector: `{ action: 'injectScript', script: <code>, path: 'spain/slotselection-page' }`
4. The injector creates a `<script>` tag with the code and appends it to the page's DOM

**Shared scripts** (injected on every page):
- `countdown.js` — visual countdown timer before auto-submit
- `RedirectOrRefresh.js` — error handling, page refresh logic
- `Infos.js` — displays client info overlay
- `overlays.js` — UI overlay utilities

---

## 5. The Booking Flow (Step by Step)

### Step 1: Client Selection (Options Page)

User creates a client in the options dashboard with:
- Country (Spain / Portugal)
- Location (Tetouan, Casablanca, Rabat, etc.)
- Visa type & subtype
- Category (Normal / Premium / Prime Time)
- BLS account credentials (email + password)
- App password (for Gmail OTP retrieval)
- Applicant count (1-6)
- Profile photo

When the user clicks "Launch" (`UnifiedClientManager.selectClient()`):
1. Selected client ID saved to storage
2. Time sync triggered
3. New tab opens to the appropriate BLS login URL

### Step 2: Login Page (`login-page.js`)

The injected script:
1. Fetches client credentials from the extension via `window.getExtensionData()`
2. Fills in email + password fields
3. Patches the `OnSubmitVerify()` function (replaces `ShowLoader`/`HideLoader` with extension versions)
4. After optional delay (configured in settings, default 1000ms), clicks the login button

### Step 3: Login Captcha (`logincaptcha-page.js` + `captchasolver.js`)

1. A captcha image grid appears (typically 12-15 images with numbers)
2. The page shows a target number (e.g., "3")
3. The captcha solver captures all image sources and sends them to a solving service:
   - **NoCaptchaAI** (`https://pro.nocaptchaai.com/solve`)
   - **TrueCaptcha** (`https://api.apitruecaptcha.org/one/gettext`)
   - **ServerCaptcha** (custom endpoint on `trumpservices.org`)
4. The service identifies which images contain the target number
5. The script clicks those images, then clicks the verify button

### Step 4: Visa Type Selection (`visatype-page.js`)

1. Selects the configured visa type (e.g., "Schengen Visa" or "National Visa")
2. Selects the visa subtype (e.g., "Tourism", "Student Visa", etc.)
3. Clicks submit after configured delay

### Step 5: Applicant Selection (`applicantselection-page.js`)

1. The page may show existing applicants
2. Script retrieves OTP from email via the background script (IMAP → `endpoints.otp` → Gmail)
3. Fills applicant details, uploads photos if needed
4. Confirms selection

### Step 6: Slot Selection / Calendar (`slotselection-page.js` — **1483 lines, the most complex script**)

This is the **make-or-break** page where appointments are actually booked.

#### Two Modes:

**A. Simple Mode (Burst Mode)**
- Refreshes the page every N milliseconds (e.g. every 5000ms)
- Checks if slots are available after each reload
- Submits immediately when found

**B. Scheduled Mode (Precision Mode)**
- Uses time-synced clock
- Targets a specific second + millisecond of each minute (e.g. `:15.000`)
- Calculates exact delay until target time
- Submits at the precise millisecond for maximum chances

#### Submission Strategies:
- **Burst submission** — sends multiple rapid requests at the target time
- **Group submission** — coordinates with other users via WebSocket (`wss://groupsubmit.trumpservices.org`) to submit simultaneously
- Multi-slot selection (multiple applicant IDs)

#### The `EmptyPageHandler` (`content-scripts/utils/slotselection/emptyPageHandler.js`)

A secondary UI overlay on blank/error pages that:
- Shows a control panel with Start/Stop/Refresh buttons
- Handles "too many requests" errors (displays red warning)
- Auto-refreshes when a WebSocket broadcast `TSIGNAL_CALENDAR_OPEN` is received (server notifies that slots just opened)
- Has a 20-second cooldown to avoid rapid refresh loops
- Supports Group Refresh mode (refreshes in sync with other users)

### Step 7: Liveness Detection (`liveness-page.js`)

Some BLS flows require a "liveness" selfie check:
1. Clicks a liveness button in an iframe
2. Captures/extracts the liveness response
3. Handles errors (e.g., `LivenessError_InvalidRequestParam`)
4. Proceeds to payment on success

### Step 8: Payment (`payment-page.js`)

1. Shows the payment section
2. Hides optional VAS add-ons (`[id^="vas_"]`)
3. Calls `OnPaymentConfirm()`
4. After configured delay, confirms payment

---

## 6. Captcha Solving (`content-scripts/utils/captcha/captchasolver.js`)

The captcha system supports **3 services** configured in the options:

### NoCaptchaAI (`$0.003/solve` approximately)

```javascript
POST https://pro.nocaptchaai.com/solve
Headers: { apiKey: "..." }
Body: { method: 'ocr', id: 'morocco', images: { "0": "data:image/...", ... } }
```

### TrueCaptcha (`$0.002/solve` approximately)

```javascript
POST https://api.apitruecaptcha.org/one/gettext
Body: { userid: "...", apikey: "...", data: "<base64 image>" }
```

### ServerCaptcha (Custom Server)

```javascript
POST <endpoint from trumpservices.org>
Body: { images: { "0": "data:image/...", ... } }
```

The solver:
1. Waits for all `<img class="captcha-img">` elements to load (checks every 50ms)
2. Sorts them into a 5x3 grid by position (top/left)
3. Picks the top 3 images per row by z-index
4. Sends image data to the selected captcha service
5. Receives which images contain the target number
6. Clicks those images
7. Submits the form

---

## 7. Group Submission System

The extension connects via **WebSocket** to `wss://groupsubmit.trumpservices.org/?grouptoken=<token>&devicehash=<hash>`.

### Purpose
Multiple users coordinate to submit slot requests simultaneously, increasing the chance that at least one gets through.

### Flow
1. User clicks "Group Submit" in the EmptyPageHandler UI
2. Background script opens WebSocket connection
3. Server broadcasts a `targetTime` to all connected clients
4. Each client calculates delay using time sync: `delay = targetTime - (Date.now() + offset)`
5. All clients submit at the exact same millisecond

### Group Refresh Variant
- Users can join a "Group Refresh" channel
- All users refresh their slot selection page simultaneously at intervals
- If any user's refresh shows available slots, they can notify others

---

## 8. OTP Retrieval

The extension can fetch OTP codes from Gmail via IMAP:

```javascript
POST <endpoints.otp>
Body: {
    email: "user@gmail.com",
    password: "<app-password>",
    imap_server: "imap.gmail.com",
    port: 993
}
```

This is used on the applicant selection page where BLS sends an OTP to confirm applicant selection.

---

## 9. Cookie & WAF Management

### Visitor ID Injection
The extension sets `visitorId_current` cookies on BLS domains to maintain consistent session identity.

### AWS WAF Token Removal
`aws-waf-token` cookies are deleted to bypass AWS WAF bot protection.

### Session Cookie Monitoring
The extension monitors `.AspNetCore.Cookies` expiry and broadcasts updates to all tabs.

### Full Cookie Wipe
The `wipeCookies` handler clears ALL cookies from `.blsspainmorocco.net` and `.blsportugal.com` domains — used for session reset.

---

## 10. Settings & Configuration

### Options Page (`options/options.html`)

A full dashboard with:

- **Clients** — CRUD for visa applicants with country/location/type/subtype
- **Applicants** — Manage applicant details
- **Settings**:
  - **Auto-Submit Pages**: Enable/disable + delay (ms) per page (login, captcha, visa type, slot selection, payment)
  - **Redirection/Refresh**: Page redirect delay, error refresh interval
  - **Captcha Service**: Select provider + API keys
  - **Clear All Data**: Wipes all extension storage

### Client Configuration (`lib/visa-config.js`)

All visa types, locations, categories are centralized:

```javascript
Spain: {
    locations: ['Tetouan', 'Nador', 'Agadir', 'Rabat', 'Tangier', 'Casablanca'],
    visaTypeOrder: { default: ['National Visa', 'Schengen Visa'], Casablanca: [...] },
    visaSubtypes: { Tetouan: { 'Schengen Visa': [...], 'National Visa': [...] }, ... }
}
Portugal: {
    locations: ['Rabat', 'Casablanca'],
    visaTypes: ['Short Stay Visa', 'Long Stay Visa'],
    visaSubtypes: { ... }
}
```

---

## 11. Notifications (Telegram)

When key events happen, the extension sends Telegram notifications via the `endpoints.telegram` API:

| Event | Description |
|---|---|
| `CALENDAR` | Successfully reached slot selection page (shows available dates) |
| `OTP` | Reached applicant selection page (OTP sent) |
| `PAYMENT_CONFIRM` | Payment request successful |

Payload:
```json
{
    "token": "...",
    "devicehash": "...",
    "payload": {
        "notificationType": "CALENDAR",
        "clientInfo": { "location": "Casablanca", "visaType": "Schengen Visa", ... },
        "requestTime": { "hour": "14", "minute": "30", "second": "15", "millisecond": "003" }
    }
}
```

---

## 12. Summary Diagram

```
┌──────────┐   Select Client   ┌──────────────┐
│ Options  │ ────────────────► │ BLS Login    │
│  Page    │                   │    Page      │
└──────────┘                   └──────┬───────┘
                                      │ Auto-fill credentials
                                      ▼
                               ┌──────────────┐
                               │ Login Captcha│ ◄── Captcha Solver
                               └──────┬───────┘
                                      │
                                      ▼
                               ┌──────────────┐
                               │ Visa Type    │
                               │  Selection   │
                               └──────┬───────┘
                                      │
                                      ▼
                               ┌──────────────┐
                               │ Applicant    │ ◄── OTP from Gmail
                               │  Selection   │
                               └──────┬───────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
                    ▼                 ▼                 ▼
           ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
           │ Slot Sel.    │  │ Liveness     │  │ Payment      │
           │  (Calendar)  │  │  Check       │  │  Page        │
           │              │  │              │  │              │
           │ ◄── TimeSync │  │ ◄── Selfie   │  │ ◄── Confirm  │
           │ ◄── Group WS │  │     Upload   │  │              │
           │ ◄── Burst    │  └──────┬───────┘  └──────┬───────┘
           │     Mode     │         │                  │
           └──────┬───────┘         │                  │
                  │                 │                  │
                  └─────────────────┴──────────────────┘
                                    │
                                    ▼
                           ┌──────────────────┐
                           │ Appointment      │
                           │  BOOKED ✅       │
                           └──────────────────┘
                           Telegram Notification
```

---

## 13. Key Files Reference

| File | Purpose |
|---|---|
| `manifest.json` | Extension config, permissions, content scripts |
| `background/background.js` | Main background script: auth, time sync, state, message handling |
| `background/utils/intercept.js` | WebRequest interceptor: redirect blocking, flow manipulation |
| `background/utils/listeners.js` | Runtime/storage/tab event registration |
| `background/utils/page-manager.js` | Page detection + script injection |
| `background/utils/redirect_resources.js` | Redirect handling utilities |
| `content-scripts/injector.js` | Message bridge + script injection gateway |
| `content-scripts/spain/login-page.js` | Spain login automation |
| `content-scripts/spain/logincaptcha-page.js` | Login captcha handling |
| `content-scripts/spain/appointmentcaptcha-page.js` | Appointment captcha handling |
| `content-scripts/spain/visatype-page.js` | Visa type selection |
| `content-scripts/spain/applicantselection-page.js` | Applicant selection + OTP |
| `content-scripts/spain/slotselection-page.js` | Core slot booking (1483 lines) |
| `content-scripts/spain/liveness-page.js` | Liveness check automation |
| `content-scripts/spain/payment-page.js` | Payment confirmation |
| `content-scripts/portugal/login-page.js` | Portugal login automation |
| `content-scripts/portugal/visatype-page.js` | Portugal visa type selection |
| `content-scripts/utils/captcha/captchasolver.js` | Multi-service captcha solver |
| `content-scripts/utils/slotselection/emptyPageHandler.js` | Blank page refresh UI + group submit |
| `content-scripts/utils/shared/countdown.js` | Visual countdown timer |
| `content-scripts/utils/shared/Infos.js` | Client info overlay |
| `content-scripts/utils/shared/RedirectOrRefresh.js` | Error handling/refresh logic |
| `content-scripts/utils/shared/overlays.js` | UI overlay utilities |
| `content-scripts/utils/applicantselection/savephoto.js` | Photo upload handling |
| `content-scripts/utils/applicantselection/ChangeApplicant.js` | Applicant data changes |
| `content-scripts/utils/applicantselection/DisplayChangedApplicant.js` | UI updates for applicant changes |
| `lib/utils.js` | Shared utilities: UUID, storage wrapper, time sync core |
| `lib/visa-config.js` | Centralized visa configuration (locations, types, subtypes) |
| `lib/unified-client.js` | Client model + manager + server sync |
| `lib/page-patterns.json` | URL pattern definitions + script assignments |
| `auth.json` | Embedded authentication token |
| `options/options.html` | Full dashboard UI |
| `options/options.js` | Dashboard logic, CRUD, settings |
| `options/options.css` | Dashboard styling |
