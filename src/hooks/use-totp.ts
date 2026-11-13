"use client";

import { useEffect, useState } from "react";
import type { AuthEntry } from "@/types/auth";
import { DEFAULT_PERIOD, counterFor, generateTotp } from "@/lib/totp";
import { SKEW_THRESHOLD_SECONDS, measureClockOffset } from "@/lib/time-sync";

/**
 * `Date.now()` refreshed once per second, re-aligned to the second boundary on
 * every tick so it cannot drift, and suspended while the page is hidden.
 *
 * Suspending matters more than it looks: a Telegram mini app is usually left
 * open in the background, and a timer that keeps firing there wakes the CPU
 * once a second for nothing.
 */
export function useSecondTick(): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let timer = 0;

    const schedule = () => {
      // +20ms so the tick lands just after the boundary rather than just before
      // it, which would show the previous second for a frame.
      const delay = 1000 - (Date.now() % 1000) + 20;
      timer = window.setTimeout(() => {
        setNow(Date.now());
        schedule();
      }, delay);
    };

    const stop = () => window.clearTimeout(timer);

    const resync = () => {
      stop();
      if (document.visibilityState === "visible") {
        // Catch up immediately — the clock moved on while we were paused, and
        // the code on screen must never be one the user could still read as
        // current.
        setNow(Date.now());
        schedule();
      }
    };

    if (document.visibilityState === "visible") schedule();

    document.addEventListener("visibilitychange", resync);
    // `visibilitychange` is the documented signal, but a page restored from the
    // back-forward cache (Telegram's WebView does this when the mini app is
    // reopened) is more reliably caught by `pageshow`, and a desktop window
    // raised from behind another only fires `focus`.
    window.addEventListener("pageshow", resync);
    window.addEventListener("focus", resync);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", resync);
      window.removeEventListener("pageshow", resync);
      window.removeEventListener("focus", resync);
    };
  }, []);

  return now;
}

/**
 * Everything that changes the output of `generateTotp`. Codes are recomputed
 * only when this string changes.
 *
 * The original recomputed every code once per second — an HMAC per entry per
 * second, forever, on a phone. A TOTP code is constant for its whole period, so
 * for the default 30s step that was 30x more crypto (and 30x more React
 * re-renders of the card) than the display could ever reflect.
 */
function codeSignature(entries: AuthEntry[], now: number): string {
  let signature = "";
  for (const entry of entries) {
    const period = entry.period ?? DEFAULT_PERIOD;
    signature += `${entry.id}|${entry.secret}|${entry.digits ?? ""}|${entry.algorithm ?? ""}|${counterFor(period, now)}\n`;
  }
  return signature;
}

export interface CodeState {
  /** Keyed by `entry.id`. */
  codes: Record<string, string>;
  /** Ids whose secret could not be decoded — shown as an error on the card. */
  failed: Record<string, true>;
}

const EMPTY_STATE: CodeState = { codes: {}, failed: {} };

export function useTotpCodes(entries: AuthEntry[], now: number): CodeState {
  const [state, setState] = useState<CodeState>(EMPTY_STATE);
  const signature = codeSignature(entries, now);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const codes: Record<string, string> = {};
      const failed: Record<string, true> = {};

      // Sequential on purpose: WebCrypto calls are already off the main thread,
      // and a user has a handful of entries — Promise.all would only add
      // scheduling overhead here.
      for (const entry of entries) {
        try {
          codes[entry.id] = await generateTotp(entry, now);
        } catch {
          codes[entry.id] = "";
          failed[entry.id] = true;
        }
      }

      if (!cancelled) setState({ codes, failed });
    })();

    return () => {
      cancelled = true;
    };
    // `entries` and `now` are intentionally excluded: `now` changes every
    // second, while `signature` folds in every input that can change a code —
    // including the current time step — and so changes exactly when a code
    // goes stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return state;
}

export interface ClockSkew {
  /** `serverNow - localNow`, in milliseconds. 0 until measured. */
  offsetMs: number;
  /** True once a skew large enough to break TOTP has been confirmed. */
  significant: boolean;
}

const NO_SKEW: ClockSkew = { offsetMs: 0, significant: false };

/**
 * Measures the device clock against the origin's `Date` header once per mount,
 * and again whenever the page comes back to the foreground (phones fix their
 * clock over NTP while backgrounded, and users fix it by hand after being told).
 */
export function useClockSkew(): ClockSkew {
  const [skew, setSkew] = useState<ClockSkew>(NO_SKEW);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;

    const measure = async () => {
      const offsetMs = await measureClockOffset(controller.signal);
      if (disposed || offsetMs === null) return;
      const significant = Math.abs(offsetMs) >= SKEW_THRESHOLD_SECONDS * 1000;
      setSkew((previous) =>
        previous.significant === significant &&
        Math.abs(previous.offsetMs - offsetMs) < 1000
          ? previous
          : { offsetMs, significant },
      );
    };

    void measure();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") void measure();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      disposed = true;
      controller.abort();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return skew;
}
