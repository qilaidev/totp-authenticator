**English** | [简体中文](README.md) | [llms.txt](llms.txt) | [codemeta.json](codemeta.json) | [Architecture](docs/architecture.md) | [Sync Protocol](docs/sync-protocol.md) | [Security](SECURITY.md) | [Contributing](CONTRIBUTING.md) | [License](LICENSE)

# TOTP Authenticator (Zero-Network 2FA Web PWA & Telegram Mini App)

**`totp-authenticator` is an open-source (MIT), pure-static, offline-first RFC 6238 2FA TOTP authenticator built with Next.js 16 static export (`output: "export"`) and native browser WebCrypto (`crypto.subtle`), supporting both standalone Web PWA offline installation and zero-passphrase Telegram Mini App sync.**

[![CI](https://github.com/qilaidev/totp-authenticator/actions/workflows/ci.yml/badge.svg)](https://github.com/qilaidev/totp-authenticator/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js 16 Static Export](https://img.shields.io/badge/Next.js-16_Static_Export-black)](next.config.ts)
[![RFC 6238 WebCrypto](https://img.shields.io/badge/RFC_6238-WebCrypto-0b8043)](src/lib/totp.ts)
[![Zero Network](https://img.shields.io/badge/Runtime-Zero_Network-1a73e8)](SECURITY.md)
[![PWA & Telegram Mini App](https://img.shields.io/badge/Platform-PWA_%7C_Telegram_Mini_App-229ED9)](src/lib/telegram.ts)
[![Vitest](https://img.shields.io/badge/Tests-Vitest_82_Vectors-6e9f18)](vitest.config.ts)

All TOTP secrets remain on the user's device (`localStorage`), and 6–8 digit codes are computed locally via `crypto.subtle` with **no backend server, no user accounts, no telemetry, and no external API requests**. Built as static assets (`out/`), it deploys cleanly to Nginx, Cloudflare Pages, or GitHub Pages—including subpath mounts via `NEXT_PUBLIC_BASE_PATH`.

---

## Entity Snapshot

| Field | Verified Specification |
| --- | --- |
| **Entity Name** | `totp-authenticator` (default UI branding: `"2FA 身份验证器（TOTP）"`) |
| **Repository & License** | [`qilaidev/totp-authenticator`](https://github.com/qilaidev/totp-authenticator) · MIT License (v1.0.0) |
| **Core Stack** | Next.js 16.3 (`output: "export"`) · React 19 · TypeScript · Tailwind CSS v4 · WebCrypto (`crypto.subtle`) · `jsqr` |
| **Standards & Crypto** | RFC 6238 (64-bit big-endian counter, post-2106 safe), HMAC-SHA1/SHA256/SHA512, 6–8 digits, strict RFC 4648 Base32, `otpauth://totp/...` |
| **Runtime Modes** | Standalone Web PWA (Service Worker offline cache) + Telegram Mini App (`DeviceStorage` local recovery & `CloudStorage` AES-GCM sync) |
| **Security & Network** | Strict `<meta>` CSP (`connect-src 'self'`, `base-uri 'none'`, `form-action 'none'`, `object-src 'none'`), zero external requests, same-origin `HEAD` clock check |
| **Prerequisites** | Node.js `>= 24` to build; browser requires a Secure Context (`https://` or `http://localhost`; `file://` is unsupported) |
| **Studio Ecosystem** | [qilai · qilaidav.com](https://qilaidav.com/en/) · [05 · Enterprise Requirement Ops & AI Foundation](https://qilaidav.com/en/workspace/) |

---

## Positioning: What It Is / What It Is Not

| Dimension | What It Is | What It Is Not |
| --- | --- | --- |
| **Runtime** | 100% static HTML/JS/CSS (`output: "export"`) running in the browser | **Not** a SaaS backend, Node.js server, or hosted auth API |
| **Cryptography** | Native WebCrypto (`crypto.subtle`) implementing RFC 6238 (SHA-1/256/512, 64-bit counter) & strict RFC 4648 Base32 | **Not** a custom JS crypto reimplementation or HOTP counter token generator (`otpauth://hotp/...`) |
| **Network Policy** | Strict CSP (`connect-src 'self'`), zero analytics, zero error reporting, offline-capable via Service Worker | **Not** a cloud password manager that phones home to third-party servers |
| **Sync & Migration** | Standalone PWA local storage + optional Telegram `CloudStorage` AES-GCM sync + plain JSON backup import/export | **Not** a vendor-locked proprietary vault, and does not decode `otpauth-migration://` Protobuf batches |
| **Dependencies** | Minimal 4 runtime packages (`next`, `react`, `react-dom`, `jsqr`) with inline SVG icons | **Not** bloated with third-party UI frameworks, icon packs, or tracking SDKs |

---

## Use Cases & Alternatives Comparison

### Primary Use Cases

- **Self-hosted personal 2FA workbench**: Deploy static files to a private domain or GitHub Pages subpath (`/2fa`) for cross-OS offline code generation.
- **Zero-passphrase Telegram Mini App 2FA**: Attach to a Telegram Bot so your encrypted TOTP vault syncs across devices signed into the same Telegram account.
- **Privacy-auditable zero-backend environments**: Inspect minimal source code and strict `connect-src 'self'` CSP headers before storing sensitive TOTP seeds.
- **Portable JSON backup workflows**: Export and import human-readable `[{ remark, secret }]` JSON snapshots without proprietary lock-in.

### Architectural Comparison (Fact-Based, Zero Fabricated Benchmarks)

| Dimension | `totp-authenticator` | Cloud Mobile 2FA Apps (e.g., Authy) | Cloud Password Managers (1Password / Bitwarden) | Self-Hosted Node/DB Web 2FA Apps |
| --- | --- | --- | --- | --- |
| **Open Source & License** | 100% Open Source (MIT) | Mostly proprietary / closed-source | Mixed / subscription tiers | Varies by project |
| **Backend Requirement** | None (pure static `out/` bundle) | Mandatory vendor cloud & account | Sync server / cloud vault required | Requires running backend + database |
| **Telemetry & Outbound Calls** | `connect-src 'self'`, zero telemetry | Account sync & app telemetry | Vault server sync | Per-request server API calls |
| **Crypto Execution** | Browser-native WebCrypto (`crypto.subtle`) | Native client crypto | Client vault crypto (master password) | May process or store keys server-side |
| **Telegram Mini App Sync** | Native (`CloudStorage` + `DeviceStorage`) | No | No | Custom integration required |
| **Subpath Static Hosting** | Built-in `NEXT_PUBLIC_BASE_PATH` support | N/A | N/A | Reverse proxy + backend routing needed |

---

## Security & Three-Layer Storage Architecture

| Layer | Mechanism | Scope & Behavior |
| --- | --- | --- |
| **1. Primary Local Store** | `localStorage` (`authList`) + Service Worker ([`public/sw.js`](public/sw.js)) | Stores up to 500 entries locally per origin (`[{ id, remark, secret, issuer?, period?, digits?, algorithm? }]`), compatible with standard `[{ remark, secret }]` JSON backups. Service Worker caches the app shell for zero-network repeat visits. |
| **2. Local Recovery** | Telegram `DeviceStorage` (Bot API 9.0+) | Device-only local backup inside Telegram client. Automatically restores `authList` if the WebView evicts `localStorage` (only when the key is missing, never overriding an intentional clear to `[]`). |
| **3. Cross-Device Sync** | Telegram `CloudStorage` (Bot API 6.9+) + AES-GCM | Automatically syncs encrypted snapshots across devices signed into the same Telegram account via the SDK `postMessage` bridge (no toggle or passphrase). Uses double-buffered `3800`-char chunks (`tfa_sync_g0_*` / `tfa_sync_g1_*`, up to 64 chunks) and non-destructive 3-way merge ([`docs/sync-protocol.md`](docs/sync-protocol.md)). |

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
| `npm test` | `vitest run` | Run full Vitest suite (5 files / 82 tests covering RFC 6238/4648 vectors, store, sync crypto & merge) |
| `npm run lint` | `eslint` | Static lint check |
| `npm run typecheck` | `tsc --noEmit` | Strict TypeScript check |
| `npm run check` | `lint && typecheck && test && build` | Full pre-commit quality gate |

---

## Static Hosting & Subpath Deployment

`npm run build` outputs a pure static bundle to `out/` that can be hosted on **Nginx**, **Cloudflare Pages**, **GitHub Pages**, or any static file server:

- **Root domain / dedicated subdomain (Recommended)**: Leave `NEXT_PUBLIC_BASE_PATH` unset. Hosting on a dedicated origin (e.g., `2fa.example.com`) isolates `localStorage.authList` from other apps on your domain.
- **Subpath deployment (e.g. GitHub Pages `/2fa`)**:
  ```bash
  NEXT_PUBLIC_BASE_PATH=/2fa npm run build
  ```
  [`next.config.ts`](next.config.ts) and [`src/lib/base-path.ts`](src/lib/base-path.ts) read `NEXT_PUBLIC_BASE_PATH` from a single source, and [`public/sw.js`](public/sw.js) dynamically derives its scope from `self.location`.
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
├── codemeta.json                 # CodeMeta 2.0 structured software metadata
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
Yes—all TOTP codes are computed locally using `crypto.subtle` with zero external analytics, error reporting, or secret transmission. Open browser DevTools → **Network** tab: after the initial static asset load is cached by [`public/sw.js`](public/sw.js), adding secrets, generating codes, and importing/exporting backups trigger zero outbound calls except an optional same-origin `HEAD` request ([`src/lib/time-sync.ts`](src/lib/time-sync.ts)) to read the HTTP `Date` header for clock-skew compensation.

### 2. Why does opening `out/index.html` via `file://` fail?
Modern browsers restrict `crypto.subtle` (WebCrypto), Service Workers, Clipboard access, and Camera APIs to **Secure Contexts** (`https://` or `http://localhost`). Always serve `out/` over HTTP (`npm start` locally, or HTTPS in production).

### 3. How does Telegram Mini App cross-device sync work without a backend?
When opened inside Telegram (Bot API 6.9+), [`src/lib/cloud-sync.ts`](src/lib/cloud-sync.ts) encrypts `authList` with AES-GCM ([`src/lib/sync-crypto.ts`](src/lib/sync-crypto.ts)) and writes chunked ciphertext to `Telegram.WebApp.CloudStorage` via Telegram's SDK `postMessage` bridge. New devices signed into the same Telegram account read the authoritative `tfa_sync_dek` key and run a non-destructive 3-way merge ([`src/lib/sync-merge.ts`](src/lib/sync-merge.ts)); outside Telegram, [`src/lib/telegram.ts`](src/lib/telegram.ts) safely no-ops.

### 4. How does Telegram `CloudStorage` sync security compare to standalone Web PWA?
In standalone Web PWA mode, secrets stay strictly inside your browser origin's `localStorage` and never leave the device. In Telegram Mini App mode, `tfa_sync_dek` is stored alongside the encrypted chunks in Telegram `CloudStorage` for zero-passphrase onboarding—protecting against accidental plaintext exposure, **not** against Telegram itself.

### 5. Which RFC 6238 / Base32 edge cases are supported?
[`src/lib/totp.ts`](src/lib/totp.ts) implements full 64-bit big-endian counters (preventing the 2106 32-bit overflow), `SHA1` / `SHA256` / `SHA512`, 6–8 digits, 1–300s custom periods, and strict RFC 4648 Base32 validation (ignoring spaces, dashes, underscores, and padding `=` while rejecting invalid characters). If your device clock drifts more than 10 seconds from the same-origin HTTP `Date` header, [`src/lib/time-sync.ts`](src/lib/time-sync.ts) compensates the counter automatically.

### 6. Does it support HOTP or `otpauth-migration://` QR batch exports?
No. `totp-authenticator` is purpose-built for time-based RFC 6238 TOTP (`otpauth://totp/...`) and standard Base32 keys; it deliberately omits counter-based HOTP (`otpauth://hotp/...`) and does not bundle a Protobuf decoder for Google Authenticator's `otpauth-migration://` batch QR format (displaying a clear unsupported notice when scanned).

### 7. How do QR code scanning and JSON backup import/export work?
On mobile Telegram, scanning prefers `Telegram.WebApp.showScanQrPopup`; in standard browsers, [`src/lib/qr.ts`](src/lib/qr.ts) tries native `BarcodeDetector` first and lazy-loads `jsqr` as a fallback for camera streams or uploaded QR images. JSON backups preserve the standard `[{ remark, secret, ... }]` schema and validate entry count limits (up to 500) and secret formats on import.

### 8. How do I deploy to a subpath such as `/2fa` or customize the title?
Set `NEXT_PUBLIC_BASE_PATH=/2fa` before building (`NEXT_PUBLIC_BASE_PATH=/2fa npm run build`). Both [`next.config.ts`](next.config.ts) and [`src/lib/base-path.ts`](src/lib/base-path.ts) normalize this value, and [`public/sw.js`](public/sw.js) derives its mount scope dynamically from `self.location`; set `NEXT_PUBLIC_APP_TITLE` and `NEXT_PUBLIC_APP_SHORT_TITLE` to override default display names.

---

<details>
<summary><strong>Search Intent & Query Mapping</strong></summary>

| User Search Intent | Typical Queries (EN / ZH) | Verified Implementation Surface |
| --- | --- | --- |
| Zero-backend offline 2FA generator | zero-network TOTP authenticator · offline-first 2FA PWA · 离线 2FA 验证器 | Next.js `output: "export"` + WebCrypto `crypto.subtle` ([`src/lib/totp.ts`](src/lib/totp.ts)) |
| Telegram Mini App synced 2FA | Telegram Mini App TOTP · Telegram CloudStorage 2FA sync · TG 小程序验证码 | [`src/lib/cloud-sync.ts`](src/lib/cloud-sync.ts) · [`docs/sync-protocol.md`](docs/sync-protocol.md) |
| Static subpath deployment | NEXT_PUBLIC_BASE_PATH 2FA · GitHub Pages TOTP PWA · 静态子路径部署 | [`next.config.ts`](next.config.ts) · [`public/sw.js`](public/sw.js) · [`docs/architecture.md`](docs/architecture.md) |
| RFC 6238 & strict CSP audit | WebCrypto RFC 6238 SHA256 SHA512 · connect-src self 2FA · strict Base32 TOTP | [`src/app/layout.tsx`](src/app/layout.tsx) · [`SECURITY.md`](SECURITY.md) |

</details>

<sub>**Keywords**: zero-network TOTP authenticator · offline-first 2FA PWA · RFC 6238 WebCrypto · Next.js static export authenticator · Telegram Mini App 2FA · strict CSP connect-src self · self-hosted static 2FA · Base32 OTP generator · 离线 2FA 身份验证器 · 开源 TOTP 验证器</sub>

---

## Architecture & Ecosystem · qilai (`qilaidav.com`)

This open-source project is engineered and maintained by **[qilai · qilaidav](https://qilaidav.com/en/)** — an independent systems engineering studio focused on **Deterministic Systems Engineering & High-Signal Technical Diagnostics**.

- **Pillar Alignment**: [05 · Enterprise Requirement Ops & AI Foundation (Workspace)](https://qilaidav.com/en/workspace/) · [中文专栏](https://qilaidav.com/workspace/)
- **Studio Website**: [https://qilaidav.com/en/](https://qilaidav.com/en/) · [中文主站](https://qilaidav.com/)
- **Technical Notes & Field Reports**: [https://qilaidav.com/notes/](https://qilaidav.com/notes/)
- **GitHub Open-Source Matrix**: [https://github.com/qilaidev](https://github.com/qilaidev)
- **Direct Engineering Contact**: [Telegram @BD8888](https://t.me/BD8888) · [Public Channel @AIKB8](https://t.me/AIKB8) · `hello@qilaidav.com`
