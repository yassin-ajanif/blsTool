# BLS 4-Page Local Clone

Static UI clone of the BLS Morocco booking flow (mock navigation only — no real BLS backend).

## Pages

| Step | URL |
|------|-----|
| Login | `/MAR/account/login/` |
| Login captcha | `/MAR/NewCaptcha/LogInCaptcha/` |
| Visa type | `/MAR/appointment/newappointment/` |
| Slot selection | `/MAR/appointment/slotselection/` |
| Submitted | `/MAR/appointment/submitted/` |

Flow: **Login → Captcha → Visa Type → Calendar → Submitted**

## Run locally

From this folder (`website copy bls`), start a static server (do **not** open via `file://`):

```bash
npx --yes serve -l 3000 .
```

Or:

```bash
python -m http.server 3000
```

Then open: http://localhost:3000/

## Deploy to VPS

Upload **this entire folder** as the web root. Point nginx (or any static host) at it. No dependency on the `blsTool` extension folder.

## Notes

- Submit buttons only redirect between local pages (`assets/js/mock-nav.js`).
- AWS WAF / reCAPTCHA remote scripts were removed.
- Logo is a placeholder SVG at `assets/images/logo.svg`.
- Applicant / second captcha / liveness / payment pages are not included yet.
