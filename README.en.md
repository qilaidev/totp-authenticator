English | [简体中文](README.md) | [llms.txt](llms.txt) | [Architecture](docs/architecture.md) | [Sync Protocol](docs/sync-protocol.md) | [Security](SECURITY.md) | [Contributing](CONTRIBUTING.md) | [License](LICENSE)

# TOTP Authenticator

**Zero-network, offline-first RFC 6238 2FA TOTP authenticator for Web (PWA) and Telegram Mini App, built with native WebCrypto and Next.js static export.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js 16 Static Export](https://img.shields.io/badge/Next.js-16_Static_Export-black)](next.config.ts)
[![RFC 6238 WebCrypto](https://img.shields.io/badge/RFC_6238-WebCrypto-0b8043)](src/lib/totp.ts)
[![Zero Network](https://img.shields.io/badge/Runtime-Zero_Network-1a73e8)](SECURITY.md)
[![PWA & Telegram Mini App](https://img.shields.io/badge/Platform-PWA_%7C_Telegram_Mini_App-229ED9)](src/lib/telegram.ts)
[![Vitest](https://img.shields.io/badge/Tests-Vitest_RFC_Vectors-6e9f18)](vitest.config.ts)

`totp-authenticator` is a pure client-side two-factor authentication (2FA) code generator that computes 6–8 digit TOTP codes locally via `crypto.subtle` without any backend server, telemetry, or external API calls. It runs both as an installable Progressive Web App (PWA) and inside Telegram Mini Apps with automatic cross-device sync over Telegram `CloudStorage`.

---

## Positioning: What It Is & What It Is Not

| Dimension | What It Is | What It Is Not |
| --- | --- | --- |
| **Runtime** | 100% static HTML/JS/CSS (`output: "export"`) running in the browser | Not a SaaS backend, Node.js server, or hosted auth API |
| **Cryptography** | Native WebCrypto (`crypto.subtle`) implementing RFC 6238 (SHA-1/256/512, 64-bit counter) & strict RFC 4648 Base32 | Not a custom JS crypto reimplementation or HOTP counter token generator |
| **Network Policy** | Strict CSP (`connect-src 'self'`), zero analytics, zero error reporting, offline-capable via Service Worker | Not a cloud password manager that phones home to third-party servers |
| **Dependencies** | Minimal 4 runtime packages (`next`, `react`, `react-dom`, `jsqr`) | Not bloated with UI frameworks, icon packs, or tracking SDKs |

---

## Security & Three-Layer Storage Architecture

| Layer | Mechanism | Scope & Behavior |
| --- | --- | --- |
| **1. Primary Local Store** | `localStorage` (`authList`) + Service Worker (`public/sw.js`) | Stores entries locally per origin (`[{ id, remark, secret, issuer?, period?, digits?, algorithm? }]`), compatible with standard `[{ remark, secret }]` JSON backups. Service Worker caches the app shell for zero-network repeat visits. |
| **2. Local Recovery** | Telegram `DeviceStorage` (Bot API 9.0+) | Device-only local backup inside Telegram client. Automatically restores `authList` if the WebView evicts `localStorage` (only when the key is missing, never overriding an intentional clear to `[]`). |
| **3. Cross-Device Sync** | Telegram `CloudStorage` (Bot API 6.9+) + AES-GCM | Automatically syncs encrypted snapshots across devices signed into the same Telegram account via the SDK `postMessage` bridge (no toggle or passphrase). Uses double-buffered chunk writes and non-destructive 3-way merge ([`docs/sync-protocol.md`](docs/sync-protocol.md)). |

> **Honest Security Boundary**: Because `CloudStorage` sync requires zero user passphrase, the AES-GCM key (`tfa_sync_dek`) is stored alongside the ciphertext in the user's Telegram `CloudStorage`. This protects against accidental plaintext exposure, **not** against Telegram itself. For strict single-device isolation, use the standalone Web PWA in a dedicated browser origin.

---

## Quickstart & Local Verification

Requires **Node.js >= 24** (see [`.nvmrc`](.nvmrc) and [`package.json`](package.json)).

```bash
git clone https://github.com/qilaidev/totp-authenticator.git
cd totp-authenticator
npm install
npm run check   # Runs lint + typecheck + Vitest unit tests + static build (out/)
npm start       # Serves out/ over localhost Secure Context -> http://localhost:3000
```

| Script | Underlying Command | Purpose |
| --- | --- | --- |
| `npm run dev` | `next dev` | Local development server (`http://localhost:3000`) |
| `npm run build` | `next build` | Static export to `out/` |
| `npm start` | `npx --yes serve out` | Preview static build over local HTTP (Secure Context) |
| `npm test` | `vitest run` | Run full Vitest suite (RFC 6238/4648 vectors, storage, sync crypto & merge) |
| `npm run lint` | `eslint` | Static lint check |
| `npm run typecheck` | `tsc --noEmit` | Strict TypeScript check |
| `npm run check` | `lint && typecheck && test && build` | Full pre-commit quality gate |

---

## Static Hosting & Subpath Deployment

`npm run build` outputs a pure static bundle to `out/` that can be hosted on **Nginx**, **Cloudflare Pages**, **GitHub Pages**, **Vercel (static)**, or any static file server:

- **Root domain / dedicated subdomain (Recommended)**: Leave `NEXT_PUBLIC_BASE_PATH` unset. Hosting on a dedicated origin (e.g., `2fa.example.com`) isolates `localStorage.authList` from other apps on your domain.
- **Subpath deployment (e.g. GitHub Pages `/2fa`)**:
  ```bash
  NEXT_PUBLIC_BASE_PATH=/2fa npm run build
  ```
  `next.config.ts` and `src/lib/base-path.ts` read `NEXT_PUBLIC_BASE_PATH` from a single source, and `public/sw.js` dynamically derives its scope from `self.location`.
- **Custom app branding (Optional)**: Override `NEXT_PUBLIC_APP_TITLE` (default `"2FA 身份验证器（TOTP）"`) and `NEXT_PUBLIC_APP_SHORT_TITLE` (default `"2FA 验证码"`) at build time to customize the document title, header, and PWA manifest name.
- **Recommended HTTP response headers** (configure at your web server / CDN):
  - `Referrer-Policy: no-referrer`
  - `X-Content-Type-Options: nosniff`
  - `Content-Security-Policy: frame-ancestors https://web.telegram.org https://*.telegram.org 'self'` (required only if embedding in Telegram Web)

---

## Repository Structure

```text
totp-authenticator/
├── README.en.md / README.md      # English & Chinese documentation
├── llms.txt                      # Machine-readable project map (llmstxt.org)
├── SECURITY.md / CONTRIBUTING.md # Security policy, threat model & contribution guide
├── docs/
│   ├── architecture.md           # Static export, CSP, basePath, WebCrypto & QR pipeline
│   └── sync-protocol.md          # 3-layer storage & CloudStorage AES-GCM merge protocol
├── public/sw.js                  # Scope-aware offline Service Worker
└── src/
    ├── app/                      # Next.js App Router (layout.tsx CSP, manifest.ts, page.tsx)
    ├── components/               # 14 lightweight UI components (inline SVG, zero UI library bloat)
    ├── hooks/                    # use-totp.ts (step-aligned tick & wake sync), use-focus-trap.ts
    ├── lib/                      # totp.ts, auth-store.ts, sync-crypto.ts, sync-merge.ts, cloud-sync.ts, telegram.ts, time-sync.ts, qr.ts, base-path.ts
    └── types/                    # AuthEntry & Telegram WebApp TypeScript declarations
```

---

## Frequently Asked Questions (FAQ)

### 1. Does it really make zero network requests? How can I verify?
Yes. All TOTP codes are computed locally using `crypto.subtle`. Open browser DevTools → **Network** tab: after the initial static asset load (which is cached by `public/sw.js` for offline reuse), adding accounts, generating codes, and exporting backups produce zero external requests. The only network call is an optional same-origin `HEAD` request (`src/lib/time-sync.ts`) to read the HTTP `Date` header for clock-skew detection.

### 2. Why does opening `out/index.html` via `file://` fail?
Browser security models restrict `crypto.subtle` (WebCrypto), Service Workers, Clipboard access, and Camera APIs to **Secure Contexts** (`https://` or `http://localhost`). Always serve `out/` over HTTP (`npm start` locally, or HTTPS in production).

### 3. How does Telegram Mini App cross-device sync work without a backend?
When running inside Telegram (Bot API 6.9+), `src/lib/cloud-sync.ts` encrypts your `authList` with AES-GCM (`src/lib/sync-crypto.ts`) and writes chunked ciphertext to `Telegram.WebApp.CloudStorage` via Telegram's client `postMessage` bridge. New devices signed into the same Telegram account read the authoritative `tfa_sync_dek` key and merge changes non-destructively (`src/lib/sync-merge.ts`). Outside Telegram, `src/lib/telegram.ts` safely no-ops.

### 4. Which RFC 6238 / Base32 edge cases are supported?
`src/lib/totp.ts` implements full 64-bit big-endian counters (preventing the 2106 32-bit overflow), `SHA1` / `SHA256` / `SHA512`, 6–8 digits, custom periods, and strict RFC 4648 Base32 validation (ignoring spaces, dashes, underscores, and padding `=`, while rejecting invalid characters). If your device clock drifts by more than 10 seconds from the same-origin HTTP `Date` header, `time-sync.ts` automatically compensates the counter.

### 5. How do QR code scanning and JSON backup import/export work?
On mobile Telegram, scanning prefers `Telegram.WebApp.showScanQrPopup`. In standard browsers, `src/lib/qr.ts` uses the native `BarcodeDetector` API first and lazy-loads `jsqr` as a fallback for camera streams or uploaded QR images. Standard `otpauth://totp/...` URIs are supported (`otpauth-migration://` Google Authenticator batch Protobuf exports are detected with a clear unsupported notice). JSON backups use the standard `[{ remark, secret, ... }]` format and validate structure/limits on import.

### 6. How do I deploy to a subpath such as `/2fa`?
Set `NEXT_PUBLIC_BASE_PATH=/2fa` before building (`NEXT_PUBLIC_BASE_PATH=/2fa npm run build`). Both `next.config.ts` and `src/lib/base-path.ts` normalize this value, and `public/sw.js` infers its mount path from `self.location`.
