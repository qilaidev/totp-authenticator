# Contributing to TOTP Authenticator

Thank you for your interest in contributing to `totp-authenticator`!

## Prerequisites

- **Node.js >= 24** (see `.nvmrc` and `package.json`)
- **npm**

## Local Setup

```bash
git clone https://github.com/qilaidev/totp-authenticator.git
cd totp-authenticator
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

## Quality Gate

Before opening a pull request, run the full check suite:

```bash
npm run check
```

This runs:
1. `npm run lint` (`eslint`)
2. `npm run typecheck` (`tsc --noEmit`)
3. `npm test` (`vitest run`)
4. `npm run build` (`next build` static export to `out/`)

## Engineering Guidelines

- **Minimal dependency footprint**: Runtime dependencies are strictly limited to `next`, `react`, `react-dom`, and `jsqr`. Do not introduce third-party UI kits, icon packages, or utility libraries.
- **RFC 6238 / RFC 4648 correctness**: Never modify `src/lib/totp.ts` without running `npm test` and verifying all official test vectors pass.
- **Static export only**: Keep `output: "export"` in `next.config.ts`. Do not add API routes, Server Actions, or Middleware.
- **Subpath safety**: Any new internal absolute path not rewritten by Next.js must use `withBase()` from `src/lib/base-path.ts`.
- **Zero-network guarantee**: Never add analytics, telemetry, external API calls, or relax `connect-src 'self'` in `src/app/layout.tsx`.
- **Non-blocking UI**: Never use `alert()` or `confirm()`, which freeze Telegram WebViews.

## Pull Request Process

1. Fork the repository and create a branch from `main`.
2. Make focused, well-tested changes.
3. Ensure `npm run check` passes with zero warnings or errors.
4. Open a pull request describing the change and why it is needed.
