import type { DraftEntry, TotpAlgorithm } from "@/types/auth";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export const DEFAULT_PERIOD = 30;
export const DEFAULT_DIGITS = 6;
export const DEFAULT_ALGORITHM: TotpAlgorithm = "SHA1";

const HASH_NAMES: Record<TotpAlgorithm, string> = {
  SHA1: "SHA-1",
  SHA256: "SHA-256",
  SHA512: "SHA-512",
};

/** Reverse lookup built once — `indexOf` per character is O(32) per char. */
const BASE32_VALUES = new Int8Array(128).fill(-1);
for (let i = 0; i < BASE32_ALPHABET.length; i += 1) {
  BASE32_VALUES[BASE32_ALPHABET.charCodeAt(i)] = i;
}

/** Uppercase, drop spaces/dashes/underscores and base32 padding. */
export function normalizeSecret(raw: string): string {
  return raw
    .replace(/[\s\-_]/g, "")
    .replace(/=+$/, "")
    .toUpperCase();
}

/**
 * The original app claimed to validate secrets but never did — its
 * `base32Decode` silently skipped every invalid character, so "密钥格式不正确"
 * was unreachable and a typo produced a plausible-looking but wrong code.
 *
 * 8 characters is the shortest base32 string that yields a full 5 bytes; RFC
 * 4226 wants at least 16 bytes of key material, but real-world providers
 * (including several banks) issue 10- and 16-character secrets, so rejecting
 * below 16 would lock users out of accounts that work fine elsewhere.
 */
export function isValidSecret(raw: string): boolean {
  const secret = normalizeSecret(raw);
  return secret.length >= 8 && /^[A-Z2-7]+$/.test(secret);
}

/** Throws `INVALID_SECRET` on any character outside the base32 alphabet. */
export function base32Decode(encoded: string): Uint8Array {
  const clean = normalizeSecret(encoded);
  const bytes = new Uint8Array(Math.floor((clean.length * 5) / 8));

  let buffer = 0;
  let bits = 0;
  let index = 0;

  for (let i = 0; i < clean.length; i += 1) {
    const code = clean.charCodeAt(i);
    const value = code < 128 ? BASE32_VALUES[code] : -1;
    if (value < 0) throw new Error("INVALID_SECRET");

    buffer = (buffer << 5) | value;
    bits += 5;

    if (bits >= 8) {
      bits -= 8;
      bytes[index] = (buffer >> bits) & 0xff;
      index += 1;
    }
  }

  // Trailing bits that do not complete a byte are padding and are dropped.
  return index === bytes.length ? bytes : bytes.subarray(0, index);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

/** The RFC 6238 time step that `at` (ms since epoch) falls into. */
export function counterFor(period: number = DEFAULT_PERIOD, at: number = Date.now()): number {
  return Math.floor(at / 1000 / period);
}

/**
 * Imported keys are cached per secret+algorithm. `importKey` is the expensive
 * half of a TOTP round on mobile WebViews, and with a stable set of entries the
 * same handful of keys is reused for the lifetime of the page.
 */
const keyCache = new Map<string, Promise<CryptoKey>>();

function importHmacKey(secret: string, algorithm: TotpAlgorithm): Promise<CryptoKey> {
  const cacheKey = `${algorithm}:${secret}`;
  const cached = keyCache.get(cacheKey);
  if (cached) return cached;

  const keyBytes = base32Decode(secret);
  if (keyBytes.length === 0) throw new Error("INVALID_SECRET");

  const promise = crypto.subtle
    .importKey(
      "raw",
      toArrayBuffer(keyBytes),
      { name: "HMAC", hash: HASH_NAMES[algorithm] },
      false,
      ["sign"],
    )
    .catch((error: unknown) => {
      // A rejected import must not poison the cache — the next tick retries.
      keyCache.delete(cacheKey);
      throw error;
    });

  keyCache.set(cacheKey, promise);
  return promise;
}

/** Drop a cached key when its entry is deleted, so nothing lingers in memory. */
export function forgetKey(secret: string): void {
  for (const algorithm of Object.keys(HASH_NAMES)) {
    keyCache.delete(`${algorithm}:${secret}`);
  }
}

/** RFC 6238 TOTP. Runs entirely in the browser via WebCrypto. */
export async function generateTotp(
  entry: Pick<DraftEntry, "secret" | "period" | "digits" | "algorithm">,
  at: number = Date.now(),
): Promise<string> {
  const period = entry.period ?? DEFAULT_PERIOD;
  const digits = entry.digits ?? DEFAULT_DIGITS;
  const algorithm = entry.algorithm ?? DEFAULT_ALGORITHM;

  const key = await importHmacKey(entry.secret, algorithm);

  const counter = counterFor(period, at);
  const message = new ArrayBuffer(8);
  const view = new DataView(message);
  // The original only wrote the low 32 bits; writing both words keeps this
  // correct past 2106 and matches every other RFC 6238 implementation.
  view.setUint32(0, Math.floor(counter / 2 ** 32), false);
  view.setUint32(4, counter >>> 0, false);

  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
  const offset = signature[signature.length - 1] & 0x0f;
  const binary =
    ((signature[offset] & 0x7f) << 24) |
    ((signature[offset + 1] & 0xff) << 16) |
    ((signature[offset + 2] & 0xff) << 8) |
    (signature[offset + 3] & 0xff);

  return (binary % 10 ** digits).toString().padStart(digits, "0");
}

export function remainingSeconds(
  period: number = DEFAULT_PERIOD,
  at: number = Date.now(),
): number {
  return period - (Math.floor(at / 1000) % period);
}

/** `317639` → `317 639`, `12345678` → `1234 5678` (Google Authenticator grouping). */
export function formatCode(code: string): string {
  if (code.length < 4) return code;
  const mid = Math.ceil(code.length / 2);
  return `${code.slice(0, mid)} ${code.slice(mid)}`;
}

/**
 * Parse an `otpauth://totp/Issuer:account?secret=...` URI, as produced by the
 * QR codes every 2FA provider shows. Returns null for anything unusable
 * (including `otpauth://hotp/...`, which this app does not support).
 */
export function parseOtpAuth(input: string): DraftEntry | null {
  const text = input.trim();
  if (!/^otpauth:\/\//i.test(text)) return null;

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }

  if (url.host.toLowerCase() !== "totp") return null;

  const params = url.searchParams;
  const secret = normalizeSecret(params.get("secret") ?? "");
  if (!isValidSecret(secret)) return null;

  let label = url.pathname.replace(/^\//, "");
  try {
    label = decodeURIComponent(label);
  } catch {
    // keep the raw label if it is not valid percent-encoding
  }

  const separator = label.indexOf(":");
  const labelIssuer = separator >= 0 ? label.slice(0, separator) : "";
  const account = (separator >= 0 ? label.slice(separator + 1) : label).trim();
  const issuer = (params.get("issuer") ?? labelIssuer).trim();
  const remark = [issuer, account].filter(Boolean).join(" · ") || "未命名";

  const digits = Number(params.get("digits"));
  const period = Number(params.get("period"));
  const rawAlgorithm = (params.get("algorithm") ?? "").toUpperCase();
  const algorithm: TotpAlgorithm =
    rawAlgorithm === "SHA256" || rawAlgorithm === "SHA512" ? rawAlgorithm : "SHA1";

  return {
    remark,
    secret,
    issuer: issuer || undefined,
    digits: digits === 6 || digits === 7 || digits === 8 ? digits : undefined,
    // Cap the period: a hostile QR with `period=1e9` would otherwise render a
    // countdown that never moves, and `period=0` would divide by zero.
    period: Number.isFinite(period) && period >= 1 && period <= 300 ? period : undefined,
    algorithm: algorithm === DEFAULT_ALGORITHM ? undefined : algorithm,
  };
}

/** Accepts either a bare base32 secret or a full `otpauth://` URI. */
export function parseScannedText(text: string): DraftEntry | null {
  const fromUri = parseOtpAuth(text);
  if (fromUri) return fromUri;

  const secret = normalizeSecret(text);
  if (isValidSecret(secret)) {
    return { remark: "", secret };
  }
  return null;
}

/**
 * Google Authenticator's own export QR (`otpauth-migration://offline?data=…`)
 * is a protobuf payload, which this app deliberately does not carry a decoder
 * for. Detecting it lets the scanner say so instead of "no 2FA key here".
 */
export function isMigrationUri(text: string): boolean {
  return /^otpauth-migration:\/\//i.test(text.trim());
}
