# BOT FLOW - Full Page Sequence

## Overview
The bot automates BLS visa appointment booking. Below is every page it goes through, in order.

---

## Page 1: Login Page
```
┌──────────────────────────────────┐
│          B L S  S p a i n        │
│                                  │
│   Email:    [____________]       │
│                                  │
│   Password: [____________]       │
│                                  │
│        [Verify]                  │
│                                  │
│   (hidden CSRF token)            │
└──────────────────────────────────┘
```

**Bot does:**
- Fills email only
- Clicks Verify

---

## Page 2: Login Captcha Page
```
┌──────────────────────────────────┐
│       BLS - Login Captcha        │
│                                  │
│   Password:  [____________]      │
│                                  │
│   Select number:  5              │
│                                  │
│    ┌──┐ ┌──┐ ┌──┐               │
│    │3 │ │5 │ │2 │               │
│    └──┘ └──┘ └──┘               │
│    ┌──┐ ┌──┐ ┌──┐               │
│    │5 │ │1 │ │4 │               │
│    └──┘ └──┘ └──┘               │
│    ┌──┐ ┌──┐ ┌──┐               │
│    │5 │ │3 │ │5 │               │
│    └──┘ └──┘ └──┘               │
│                                  │
│        [Verify]                  │
│                                  │
│   (hidden CSRF token)            │
└──────────────────────────────────┘
```

**Bot does:**
- Fills password
- Reads target number from `.box-label`
- Sends captcha images to NoCaptchaAI/TrueCaptcha API
- Clicks images that match the target number
- Clicks Verify

---

## Page 3: Visa Type Selection
```
┌──────────────────────────────────┐
│     BLS - New Appointment        │
│                                  │
│   Location:   [Rabat        ▾]  │
│                                  │
│   Visa Type:  [Tourist      ▾]  │
│                                  │
│   Sub Type:   [Standard     ▾]  │
│                                  │
│   Category:   [Normal       ▾]  │
│                                  │
│   Applicants:   [1]              │
│                                  │
│        [Next]                    │
└──────────────────────────────────┘
```

**Bot does:**
- Selects all dropdowns from saved client data
- Clicks Next

---

## Page 4: Applicant Details
```
┌──────────────────────────────────┐
│     BLS - Applicant Details      │
│                                  │
│   Applicant  1  ● ○ ○ ○         │
│               (1 of 4)           │
│                                  │
│   Photo:  [Upload]               │
│                                  │
│   Travel Date: [2026-10-21]      │
│                                  │
│   Email Code: [______] [Get OTP] │
│                                  │
│        [Save & Continue]         │
└──────────────────────────────────┘
```

**Bot does:**
- Uploads photo
- Sets travel date to 5 months ahead
- Reads OTP from email (using app password)
- Fills OTP field
- Clicks Save & Continue
- Repeats for each applicant (1 to N)

---

## Page 5: Appointment Captcha
```
┌──────────────────────────────────┐
│   BLS - Appointment Captcha      │
│                                  │
│   Select number:  3              │
│                                  │
│    ┌──┐ ┌──┐ ┌──┐               │
│    │5 │ │3 │ │1 │               │
│    └──┘ └──┘ └──┘               │
│    ┌──┐ ┌──┐ ┌──┐               │
│    │3 │ │2 │ │4 │               │
│    └──┘ └──┘ └──┘               │
│    ┌──┐ ┌──┐ ┌──┐               │
│    │6 │ │3 │ │7 │               │
│    └──┘ └──┘ └──┘               │
│                                  │
│        [Verify]                  │
└──────────────────────────────────┘
```

**Bot does:**
- Same captcha solving as Page 2
- Clicks Verify

---

## Page 6: Slot Selection (Main Target)
```
┌──────────────────────────────────┐
│   BLS - Select Appointment Slot  │
│                                  │
│   ┌─ Calendar ────────────────┐  │
│   │        June 2026          │  │
│   │    ◀         ▶            │  │
│   │  Mo Tu We Th Fr Sa Su     │  │
│   │         1  2  3  4  5     │  │
│   │   6  7  8  9 10 11 12     │  │
│   │  13 14 15 16 17 18 19     │  │
│   │  20 21 22 23 24 25 26     │  │
│   │  27 28 29 30              │  │
│   └───────────────────────────┘  │
│                                  │
│   ┌─ Time Slots ──────────────┐  │
│   │  ○ 09:00                  │  │
│   │  ● 09:15  ← selected      │  │
│   │  ○ 09:30                  │  │
│   │  ○ 09:45                  │  │
│   └───────────────────────────┘  │
│                                  │
│        [Continue]                │
└──────────────────────────────────┘
```

**Bot does:**
- Uses millisecond-precision time sync
- Reads BLS's internal variable: `global.availDates.ad`
- Filters dates where `AppointmentDateType === 0` (available)
- Picks a random available date
- Triggers date picker → BLS loads time slots for that date
- Reads BLS's internal variable: `window.slotDataSource`
- Filters slots where `Count > 0` (has remaining spots)
- Sorts by most available: `b.Count - a.Count`
- Picks randomly from top 2 slots
- Selects it in the dropdown
- Can use burst mode or group mode

**Example of how BLS slot data looks:**
```json
// BLS internal data that bot reads directly:
[
  { "Id": "101", "Time": "09:00", "Count": 0 },  // ❌ booked
  { "Id": "102", "Time": "09:15", "Count": 5 },  // ✅ 5 spots
  { "Id": "103", "Time": "09:30", "Count": 0 },  // ❌ booked
  { "Id": "104", "Time": "09:45", "Count": 2 },  // ✅ 2 spots
]
```

---

## Page 7: Liveness / Biometrics
```
┌───────────────────────────────────────┐
│   BLS - Biometric Appointment         │
│                                       │
│   You need to be present at:          │
│   Rabat Center                        │
│                                       │
│   Date: June 4, 2026                  │
│   Time: 09:15                         │
│                                       │
│   [ a Distance ]    [ Local ]         │
│                                       │
│      (opens webcam via Oz Forensics)  │
│                                       │
└───────────────────────────────────────┘
```

**Bot does:**
- Adds two buttons: "Local" (webcam selfie) and "a Distance" (send link to someone else)
- Local: creates fullscreen iframe, injects Oz Forensics script, opens webcam
- Distance: generates link, copies to clipboard, polls `myselfie.trumpservices.org` for result
- Waits for `liveness_id` from Oz or polling, then auto-submits form
- Cannot fake liveness — real person must appear on camera

---

## Page 8: Payment
```
┌──────────────────────────────────┐
│   BLS - Payment                  │
│                                  │
│   Appointment fee: €XX           │
│                                  │
│   (payment section auto-shows)   │
│   (upsells hidden)               │
│                                  │
│   BLS handles the rest           │
│                                  │
└──────────────────────────────────┘
```

**Bot does:**
- Shows payment section (`#payment-section`)
- Hides upsells (optional services)
- Calls BLS's own `window.OnPaymentConfirm()` — BLS handles payment method selection and processing
- Waits configurable delay before triggering

---

## Page 9: My Appointments (Confirmation)
```
┌──────────────────────────────────┐
│   BLS - My Appointments          │
│                                  │
│   ✅ Appointment Booked           │
│                                  │
│   Reference: BLS-XXXXXX          │
│   Date: June 4, 2026             │
│   Time: 09:15                    │
│   Center: Rabat                  │
│                                  │
│   Status: Confirmed              │
└──────────────────────────────────┘
```

**Bot does:**
- Confirms booking was successful

---

## Full Flow Summary

```
User clicks client card
       ↓
Login page      → fills email → Verify
       ↓
Login Captcha   → fills password + solves captcha → Verify
       ↓
Visa Type       → selects visa options → Next
       ↓
Applicants      → uploads photo + fills OTP → Save
       ↓
Appt Captcha    → solves captcha → Verify
       ↓
Slot Selection  → picks date + time → Continue
       ↓
Liveness        → uploads selfies → Confirm
       ↓
Payment         → pays → Confirm
       ↓
Done ✅
```
