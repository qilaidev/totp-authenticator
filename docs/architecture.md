# Technical Architecture

`totp-authenticator` is a static-first, zero-network RFC 6238 TOTP authenticator built with Next.js 16 (App Router, `output: "export"`), React 19, TypeScript (strict mode), and Tailwind CSS v4.

## 1. Zero-Network Runtime & Content Security Policy

All cryptographic operations execute locally in the browser using native WebCrypto (`crypto.subtle`):

- **TOTP generation** (`src/lib/totp.ts`): HMAC-SHA1 / HMAC-SHA256 / HMAC-SHA512 over a 64-bit big-endian time counter (`Math.floor(unixSeconds / period)`), supporting 6–8 digit codes and dynamic truncation per RFC 6238 / RFC 4226.
- **Base32 decoding** (`src/lib/totp.ts`): Strict RFC 4648 alphabet validation (`A-Z2-7`, ignoring whitespace, hyphens, underscores, and trailing `=`). Rejects invalid characters instead of silently producing wrong codes.
- **Content Security Policy** (`src/app/layout.tsx`): Enforces `connect-src 'self'`, `base-uri 'none'`, `form-action 'none'`, and `object-src 'none'` in a `<meta http-equiv="Content-Security-Policy">` tag. No runtime analytics, telemetry, or external API calls exist.
- **Static hosting headers**: Because `output: "export"` produces static files, response-only headers such as `frame-ancestors` (e.g., `frame-ancestors https://web.telegram.org https://*.telegram.org 'self'` when embedding in Telegram Web) and `Referrer-Policy: no-referrer` should be configured at your web server or CDN (Nginx, Cloudflare Pages, etc.).

## 2. Static Export & Subpath Mounting (`NEXT_PUBLIC_BASE_PATH`)

`next.config.ts` sets `output: "export"`, `poweredByHeader: false`, `productionBrowserSourceMaps: false`, and `trailingSlash: false`.

When deploying under a subpath (for example `/2fa` on GitHub Pages), set `NEXT_PUBLIC_BASE_PATH=/2fa` at build time:

1. `next.config.ts` applies `basePath` and `assetPrefix` to Next.js-managed routes and assets.
2. `src/lib/base-path.ts` exposes `BASE_PATH` and `withBase()` for string literals that Next.js does not rewrite (`src/app/manifest.ts` and `src/components/ServiceWorker.tsx`).
3. `public/sw.js` derives its own mount scope dynamically from `self.location` at runtime, caching the app shell and hashed static assets under a scope-isolated `2fa-*` cache key.

## 3. Clock Skew Compensation (`src/lib/time-sync.ts`)

TOTP depends on accurate device time. On startup and visibility resume, `src/lib/time-sync.ts` sends a same-origin `HEAD` request and compares the HTTP `Date` response header against `Date.now()`. If the offset exceeds 10 seconds, it compensates the TOTP counter and surfaces a non-blocking notice (`ClockSkewNotice.tsx`).

## 4. QR Code Scanning (`src/lib/qr.ts`)

1. In Telegram Mini App (mobile), prefers `Telegram.WebApp.showScanQrPopup`.
2. In standard browsers, prefers the native `BarcodeDetector` API when available, falling back to lazy-loaded `jsqr` for camera streams or uploaded QR images.
3. Parses standard `otpauth://totp/...` URIs (including `issuer`, `period`, `digits`, `algorithm`) and detects `otpauth-migration://` payloads with an explicit unsupported notice.
