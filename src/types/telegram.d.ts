/**
 * Hand-written subset of the Telegram Mini Apps SDK surface this app touches.
 * Everything is optional: the SDK is loaded from telegram.org at runtime, older
 * Telegram clients ship older Bot API versions, and outside Telegram the whole
 * object is absent. Guard every call site with `isVersionAtLeast`.
 *
 * Reference: https://core.telegram.org/bots/webapps
 */

type TelegramHapticStyle = "light" | "medium" | "heavy" | "rigid" | "soft";
type TelegramNotificationType = "error" | "success" | "warning";

interface TelegramHapticFeedback {
  impactOccurred?: (style: TelegramHapticStyle) => void;
  notificationOccurred?: (type: TelegramNotificationType) => void;
  selectionChanged?: () => void;
}

interface TelegramBackButton {
  isVisible?: boolean;
  show?: () => void;
  hide?: () => void;
  onClick?: (handler: () => void) => void;
  offClick?: (handler: () => void) => void;
}

/**
 * Bot API 9.0 — key/value storage kept by the Telegram client on this device.
 * Nothing is uploaded, and it survives the WebView clearing its own site data,
 * which is what makes saved codes reappear.
 */
interface TelegramDeviceStorage {
  setItem?: (key: string, value: string, callback?: (error: string | null, ok?: boolean) => void) => void;
  getItem?: (key: string, callback: (error: string | null, value?: string | null) => void) => void;
}

/**
 * Bot API 6.9 — key/value storage kept by Telegram, per user and per bot, and
 * therefore shared by every device that user signs in on. Telegram can read
 * whatever is written here, so this app only ever puts ciphertext in it
 * (`src/lib/sync-crypto.ts`).
 *
 * Limits: 1024 keys, key `[A-Za-z0-9_-]{1,128}`, value up to 4096 characters.
 */
interface TelegramCloudStorage {
  setItem?: (key: string, value: string, callback?: (error: string | null, ok?: boolean) => void) => void;
  getItem?: (key: string, callback: (error: string | null, value?: string | null) => void) => void;
  getItems?: (
    keys: string[],
    callback: (error: string | null, values?: Record<string, string> | null) => void,
  ) => void;
  removeItems?: (keys: string[], callback?: (error: string | null, ok?: boolean) => void) => void;
}

interface TelegramSafeAreaInset {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface TelegramWebApp {
  /** `"unknown"` when the SDK is loaded outside a real Telegram client. */
  platform?: string;
  version?: string;
  colorScheme?: "light" | "dark";
  initData?: string;
  isExpanded?: boolean;
  viewportStableHeight?: number;
  safeAreaInset?: TelegramSafeAreaInset;
  contentSafeAreaInset?: TelegramSafeAreaInset;

  isVersionAtLeast?: (version: string) => boolean;
  ready?: () => void;
  expand?: () => void;

  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  setBottomBarColor?: (color: string) => void;

  /** Bot API 7.7 — stops a vertical drag from dismissing the mini app. */
  disableVerticalSwipes?: () => void;

  BackButton?: TelegramBackButton;
  CloudStorage?: TelegramCloudStorage;
  DeviceStorage?: TelegramDeviceStorage;
  HapticFeedback?: TelegramHapticFeedback;

  /** Bot API 6.4 — the client's own camera UI; works where getUserMedia does not. */
  showScanQrPopup?: (
    params: { text?: string },
    callback?: (data: string) => boolean | void,
  ) => void;
  closeScanQrPopup?: () => void;

  onEvent?: (event: string, handler: (...args: unknown[]) => void) => void;
  offEvent?: (event: string, handler: (...args: unknown[]) => void) => void;
}

interface Window {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
}
