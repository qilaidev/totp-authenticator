"use client";

import { useEffect } from "react";
import Script from "next/script";
import { initTelegram } from "@/lib/telegram";

/**
 * Loads telegram-web-app.js and initialises the mini app.
 *
 * Two entry points on purpose: `onLoad` covers a cold load, and the mount
 * effect covers the case where the script was already in the HTTP cache and
 * executed before React hydrated. `initTelegram` is idempotent.
 *
 * If telegram.org is unreachable the script simply never loads, `initTelegram`
 * finds no `window.Telegram` and returns — the page keeps working as a normal
 * web app. The original threw here and took the whole script down with it.
 */
export function TelegramWebApp() {
  useEffect(() => {
    initTelegram();
  }, []);

  return (
    <Script
      src="https://telegram.org/js/telegram-web-app.js"
      strategy="afterInteractive"
      onLoad={initTelegram}
      onError={() => {
        // Nothing to do — the app is fully functional without the SDK.
      }}
    />
  );
}
