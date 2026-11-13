"use client";

import { useSyncExternalStore } from "react";

/**
 * Telegram Mini App integration.
 *
 * The page is a plain static site, so it has to work in three environments:
 *
 *   1. inside Telegram (Android / iOS / Desktop / Web),
 *   2. in a normal browser where telegram-web-app.js loaded but reports
 *      `platform === "unknown"`,
 *   3. in a normal browser where the script never loaded at all (offline,
 *      telegram.org blocked).
 *
 * Nothing here may throw in cases 2 and 3 — the original app did, and one
 * `tg.ready()` on a missing object killed the entire page script.
 */

export interface TelegramState {
  /** telegram-web-app.js has loaded and `ready()` has been called. */
  ready: boolean;
  /** Running inside a real Telegram client, not just a page that loaded the SDK. */
  inTelegram: boolean;
  colorScheme: "light" | "dark" | null;
  platform: string;
  version: string;
}

const INITIAL: TelegramState = {
  ready: false,
  inTelegram: false,
  colorScheme: null,
  platform: "unknown",
  version: "6.0",
};

let state: TelegramState = INITIAL;
const listeners = new Set<() => void>();

function setState(patch: Partial<TelegramState>): void {
  const next = { ...state, ...patch };
  if (
    next.ready === state.ready &&
    next.inTelegram === state.inTelegram &&
    next.colorScheme === state.colorScheme &&
    next.platform === state.platform &&
    next.version === state.version
  ) {
    return;
  }
  state = next;
  for (const listener of listeners) listener();
}

export function getWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

/** Bot API version gate. Falls back to "supported" only for 6.0 baseline calls. */
function atLeast(webApp: TelegramWebApp, version: string): boolean {
  try {
    return webApp.isVersionAtLeast?.(version) === true;
  } catch {
    return false;
  }
}

function isRealClient(webApp: TelegramWebApp): boolean {
  const platform = webApp.platform ?? "unknown";
  return platform !== "" && platform !== "unknown";
}

/** Concrete hex for the Telegram chrome — must match `--g-bg` in globals.css. */
function chromeColor(scheme: "light" | "dark"): string {
  return scheme === "dark" ? "#202124" : "#ffffff";
}

function applyTheme(webApp: TelegramWebApp): void {
  const scheme = webApp.colorScheme === "dark" ? "dark" : "light";

  // Follow the Telegram theme instead of the OS theme. Users very often run a
  // dark Telegram on a light phone; the OS media query gets that backwards.
  document.documentElement.dataset.theme = scheme;

  const color = chromeColor(scheme);
  if (atLeast(webApp, "6.1")) {
    try {
      webApp.setHeaderColor?.(color);
      webApp.setBackgroundColor?.(color);
    } catch {
      // some clients reject colors outside their allowed set — cosmetic only
    }
  }
  if (atLeast(webApp, "7.10")) {
    try {
      webApp.setBottomBarColor?.(color);
    } catch {
      // cosmetic only
    }
  }

  setState({ colorScheme: scheme });
}

let initialised = false;

/**
 * Idempotent — called both from the `<Script onLoad>` callback and from an
 * effect on mount, because the script may already be cached and executed
 * before React hydrates.
 */
export function initTelegram(): void {
  const webApp = getWebApp();
  if (!webApp) return;

  const real = isRealClient(webApp);
  setState({
    ready: true,
    inTelegram: real,
    platform: webApp.platform ?? "unknown",
    version: webApp.version ?? "6.0",
  });

  if (initialised) return;
  initialised = true;

  try {
    webApp.ready?.();
    webApp.expand?.();
  } catch {
    // never let SDK quirks stop the app from rendering
  }

  if (!real) return;

  // Without this a vertical drag anywhere on the page minimises or closes the
  // mini app — which, on a list you scroll, happens constantly.
  if (atLeast(webApp, "7.7")) {
    try {
      webApp.disableVerticalSwipes?.();
    } catch {
      // older client than it claimed; harmless
    }
  }

  applyTheme(webApp);

  try {
    webApp.onEvent?.("themeChanged", () => applyTheme(webApp));
  } catch {
    // event API missing on very old clients
  }
}

/* ────────────────────────────────  React  ──────────────────────────────── */

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): TelegramState {
  return state;
}

function getServerSnapshot(): TelegramState {
  return INITIAL;
}

export function useTelegram(): TelegramState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/* ──────────────────────────────  Back button  ─────────────────────────── */

let backHandler: (() => void) | null = null;

/**
 * Wire Telegram's native back button to an in-app overlay. Without this the
 * back gesture closes the whole mini app while a dialog is open, which users
 * read as the app crashing.
 */
export function setBackButton(handler: (() => void) | null): void {
  const webApp = getWebApp();
  const button = webApp?.BackButton;
  if (!webApp || !button || !atLeast(webApp, "6.1")) return;

  if (backHandler) {
    try {
      button.offClick?.(backHandler);
    } catch {
      // ignore
    }
    backHandler = null;
  }

  if (handler) {
    backHandler = handler;
    try {
      button.onClick?.(handler);
      button.show?.();
    } catch {
      backHandler = null;
    }
  } else {
    try {
      button.hide?.();
    } catch {
      // ignore
    }
  }
}

/* ─────────────────────────────────  Haptics  ───────────────────────────── */

export type Haptic = "tap" | "success" | "warning" | "error";

export function haptic(kind: Haptic): void {
  const webApp = getWebApp();
  if (!webApp || !atLeast(webApp, "6.1")) return;
  const feedback = webApp.HapticFeedback;
  if (!feedback) return;

  try {
    if (kind === "tap") feedback.impactOccurred?.("light");
    else feedback.notificationOccurred?.(kind);
  } catch {
    // haptics are a nicety; never surface a failure
  }
}

/* ────────────────────────────────  QR scanner  ─────────────────────────── */

export type TelegramScanResult =
  | { status: "unsupported" }
  | { status: "cancelled" }
  | { status: "ok"; text: string };

/**
 * Clients that actually implement `showScanQrPopup`.
 *
 * The desktop and web clients report a Bot API version well past 6.4 but never
 * answer the request, and the SDK's callback simply never fires — the scan
 * button would look dead. There is no capability check for this, so the
 * allowlist is the honest option; everywhere else falls back to the in-page
 * camera, which is what desktop users want anyway.
 */
const SCANNER_PLATFORMS = new Set(["android", "android_x", "ios"]);

export function canScanWithTelegram(): boolean {
  const webApp = getWebApp();
  return Boolean(
    webApp &&
      isRealClient(webApp) &&
      SCANNER_PLATFORMS.has(webApp.platform ?? "") &&
      atLeast(webApp, "6.4") &&
      typeof webApp.showScanQrPopup === "function",
  );
}

/**
 * Telegram's own camera sheet. Preferred over `getUserMedia` inside Telegram:
 * the in-app WebView routinely denies camera access on iOS, and when it does
 * work it competes with the client for the camera.
 *
 * `isAcceptable` keeps the popup open when the user points it at an unrelated
 * QR code, instead of closing with something this app cannot use.
 */
export function scanQrWithTelegram(
  hint: string,
  isAcceptable: (text: string) => boolean,
): Promise<TelegramScanResult> {
  const webApp = getWebApp();
  if (!canScanWithTelegram() || !webApp) {
    return Promise.resolve({ status: "unsupported" });
  }

  return new Promise((resolve) => {
    let settled = false;

    const onClosed = () => finish({ status: "cancelled" });

    const finish = (result: TelegramScanResult) => {
      if (settled) return;
      settled = true;
      try {
        webApp.offEvent?.("scanQrPopupClosed", onClosed);
      } catch {
        // ignore
      }
      resolve(result);
    };

    try {
      webApp.onEvent?.("scanQrPopupClosed", onClosed);
      webApp.showScanQrPopup?.({ text: hint }, (data) => {
        if (typeof data !== "string" || !isAcceptable(data)) return false;
        try {
          webApp.closeScanQrPopup?.();
        } catch {
          // ignore
        }
        finish({ status: "ok", text: data });
        return true;
      });
    } catch {
      finish({ status: "unsupported" });
    }
  });
}

/* ──────────────────────────────  Device storage  ───────────────────────── */

function deviceStorage(): TelegramDeviceStorage | null {
  const webApp = getWebApp();
  if (!webApp || !isRealClient(webApp) || !atLeast(webApp, "9.0")) return null;
  return webApp.DeviceStorage ?? null;
}

/**
 * Read one key from the client's on-device storage.
 * `undefined` = not available here (old client, outside Telegram, error);
 * `null` = available but never written.
 */
export function deviceStorageGet(key: string): Promise<string | null | undefined> {
  const storage = deviceStorage();
  if (!storage?.getItem) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    try {
      storage.getItem?.(key, (error, value) => {
        resolve(error ? undefined : typeof value === "string" && value !== "" ? value : null);
      });
    } catch {
      resolve(undefined);
    }
  });
}

/** Fire-and-forget write; localStorage stays the primary copy. */
export function deviceStorageSet(key: string, value: string): void {
  const storage = deviceStorage();
  if (!storage?.setItem) return;
  try {
    storage.setItem(key, value, () => undefined);
  } catch {
    // an old client that claimed 9.0; localStorage still has the data
  }
}

/* ──────────────────────────────  Cloud storage  ─────────────────────────── */

/**
 * Bot API 6.9. Per user and per bot, so every device that Telegram account
 * signs in on reads the same values — that is the whole point of it here.
 * Telegram holds it, so only ciphertext goes in (see `src/lib/cloud-sync.ts`).
 *
 * It travels over the SDK's postMessage bridge to the client, not over the
 * network from this page, so `connect-src 'self'` in the CSP is untouched.
 */
function cloudStorage(): TelegramCloudStorage | null {
  const webApp = getWebApp();
  if (!webApp || !isRealClient(webApp) || !atLeast(webApp, "6.9")) return null;
  return webApp.CloudStorage ?? null;
}

export function canSyncWithCloud(): boolean {
  const storage = cloudStorage();
  return Boolean(storage?.getItem && storage.setItem);
}

/**
 * `undefined` = the call itself failed (no client, offline, SDK error) and the
 * caller must not treat it as "nothing stored"; `null` = never written.
 */
export function cloudGet(key: string): Promise<string | null | undefined> {
  const storage = cloudStorage();
  if (!storage?.getItem) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    try {
      storage.getItem?.(key, (error, value) => {
        resolve(error ? undefined : typeof value === "string" && value !== "" ? value : null);
      });
    } catch {
      resolve(undefined);
    }
  });
}

/** One round trip for the whole payload; `undefined` on any failure. */
export function cloudGetMany(
  keys: string[],
): Promise<Record<string, string> | undefined> {
  const storage = cloudStorage();
  if (keys.length === 0) return Promise.resolve({});
  if (!storage?.getItems) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    try {
      storage.getItems?.(keys, (error, values) => {
        resolve(error || !values ? undefined : values);
      });
    } catch {
      resolve(undefined);
    }
  });
}

export function cloudSet(key: string, value: string): Promise<boolean> {
  const storage = cloudStorage();
  if (!storage?.setItem) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      storage.setItem?.(key, value, (error, ok) => resolve(!error && ok !== false));
    } catch {
      resolve(false);
    }
  });
}

export function cloudRemove(keys: string[]): Promise<boolean> {
  const storage = cloudStorage();
  if (keys.length === 0) return Promise.resolve(true);
  if (!storage?.removeItems) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      storage.removeItems?.(keys, (error, ok) => resolve(!error && ok !== false));
    } catch {
      resolve(false);
    }
  });
}

/** Telegram cannot save a blob download; export has to go through the clipboard there. */
export function canDownloadFiles(): boolean {
  const webApp = getWebApp();
  return !webApp || !isRealClient(webApp);
}
