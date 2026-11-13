"use client";

/**
 * Clock-skew detection.
 *
 * TOTP is a pure function of the wall clock, so a phone whose clock is a minute
 * off produces codes that every server rejects — and the app looks broken while
 * being entirely correct. The original site had no answer for this at all; the
 * only symptom users see is "验证码错误" forever.
 *
 * There is no server component here, so the reference time is the `Date`
 * response header of the site's own origin. That header has one-second
 * resolution, which is far below the 30-second TOTP step, so it is plenty.
 */

/** Below this the clock is fine for TOTP and nothing is worth saying. */
export const SKEW_THRESHOLD_SECONDS = 10;

/** A response that took longer than this tells us nothing useful about `now`. */
const MAX_ROUND_TRIP_MS = 5000;

/** A cached response carries a stale `Date`; anything fresher than this is fine. */
const MAX_AGE_SECONDS = 2;

/**
 * Returns `serverNow - localNow` in milliseconds, or null when the offset
 * cannot be trusted (offline, blocked, a proxy serving a cached response).
 */
export async function measureClockOffset(signal?: AbortSignal): Promise<number | null> {
  if (typeof fetch !== "function" || typeof location === "undefined") return null;

  // A unique query string keeps CDNs from answering out of cache with an old
  // `Date`; `no-store` covers the browser's own HTTP cache.
  const url = `${location.origin}${location.pathname}?_ts=${Date.now().toString(36)}`;

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(url, { method: "HEAD", cache: "no-store", signal });
  } catch {
    return null;
  }
  const finishedAt = Date.now();

  const roundTrip = finishedAt - startedAt;
  if (roundTrip > MAX_ROUND_TRIP_MS) return null;

  const age = Number(response.headers.get("age") ?? "0");
  if (Number.isFinite(age) && age > MAX_AGE_SECONDS) return null;

  const dateHeader = response.headers.get("date");
  if (!dateHeader) return null;

  const serverTime = Date.parse(dateHeader);
  if (!Number.isFinite(serverTime)) return null;

  // The header was generated somewhere inside the round trip; the midpoint is
  // the standard estimate and is accurate to half the round-trip time.
  const localMidpoint = startedAt + roundTrip / 2;
  return serverTime - localMidpoint;
}
