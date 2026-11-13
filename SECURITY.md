# Security Policy

## Security Architecture

`totp-authenticator` is designed as a **zero-network, client-side-only** RFC 6238 TOTP authenticator:

1. **Zero-Network Runtime & Strict CSP**
   - The application ships a strict `<meta http-equiv="Content-Security-Policy">` in [`src/app/layout.tsx`](src/app/layout.tsx) with `connect-src 'self'`, `base-uri 'none'`, `form-action 'none'`, and `object-src 'none'`.
   - No TOTP secrets, derived codes, telemetry, or analytics are ever transmitted to any application backend.
   - Note: `HEAD` requests to the same origin (`src/lib/time-sync.ts`) are used solely to read the HTTP `Date` response header for clock skew compensation.

2. **Native WebCrypto & Secure Context Requirement**
   - All HMAC-SHA1/SHA256/SHA512 TOTP computations (`src/lib/totp.ts`) and AES-GCM sync encryption (`src/lib/sync-crypto.ts`) use the browser's native `crypto.subtle` API.
   - Because `crypto.subtle`, Service Workers, Clipboard, and Camera APIs require a **Secure Context** (`https://` or `http://localhost`), opening `out/index.html` via `file://` is unsupported and will fail by browser design.

3. **Storage & Optional Telegram `CloudStorage` Sync Threat Model**
   - **Standard Web (PWA)**: Secrets are stored locally in `localStorage` (`authList`). Always host this app on its own dedicated origin/subdomain so no other web app shares its `localStorage` namespace.
   - **Telegram Mini App**:
     - `DeviceStorage` (Bot API 9.0+) keeps a local device-only recovery copy.
     - `CloudStorage` (Bot API 6.9+) automatically syncs an AES-GCM encrypted snapshot across devices signed into the same Telegram account via the Telegram SDK `postMessage` bridge (not a page network request).
     - **Honest Threat Model**: To enable zero-passphrase cross-device setup, the encryption key (`tfa_sync_dek`) is stored alongside the ciphertext in `CloudStorage`. This protects against accidental plaintext exposure, **not** against Telegram itself.
   - **JSON Backups**: Exported JSON backups are plaintext—store them securely.

4. **Static Hosting Headers**
   - Configure `Referrer-Policy: no-referrer` and `X-Content-Type-Options: nosniff` at your web server or CDN.
   - If embedding as a Telegram Mini App, configure `Content-Security-Policy: frame-ancestors https://web.telegram.org https://*.telegram.org 'self'` at your host/proxy.

## Reporting a Vulnerability

If you discover a security issue (e.g., XSS, CSP bypass, cryptographic bug, or secret leakage), please **do not** open a public GitHub issue with exploit details.

Instead, report it privately via [GitHub Security Advisories](https://github.com/qilaidev/totp-authenticator/security/advisories/new) on `qilaidev/totp-authenticator`. Please include:

- Steps to reproduce or a minimal proof of concept
- Affected file(s) and browser / Telegram client version
- Potential impact

We will acknowledge receipt and work on a fix promptly.
