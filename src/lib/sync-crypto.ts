/**
 * Encryption for the cross-device copy.
 *
 * The local copy (`localStorage`) stays plaintext — the device already holds
 * the secrets, encrypting them against itself would only hide them from their
 * owner. What this covers is the copy that leaves the device: it goes out as
 * AES-GCM ciphertext under a generated key that travels with it, so the
 * payload is never in the clear on the wire or at rest under someone's key by
 * accident.
 *
 * Deliberately small: AES-GCM is in WebCrypto, so this adds no dependency and
 * no bytes beyond this file.
 */

const KEY_BITS = 256;
const IV_BYTES = 12;

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array | null {
  try {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/**
 * The account's key. Extractable on purpose: `cloud-sync.ts` exports it so the
 * account's other devices can pick it up, which is what makes sync need
 * nothing typed. That is not a downgrade on the device itself — the same
 * `localStorage` already holds every secret in the clear.
 */
export async function randomKey(): Promise<CryptoKey | null> {
  try {
    return await crypto.subtle.generateKey({ name: "AES-GCM", length: KEY_BITS }, true, [
      "encrypt",
      "decrypt",
    ]);
  } catch {
    return null;
  }
}

export async function exportKey(key: CryptoKey): Promise<string | null> {
  try {
    return toBase64(new Uint8Array(await crypto.subtle.exportKey("raw", key)));
  } catch {
    return null;
  }
}

export async function importKey(rawBase64: string): Promise<CryptoKey | null> {
  const raw = fromBase64(rawBase64);
  if (!raw || raw.length !== KEY_BITS / 8) return null;
  try {
    return await crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", true, [
      "encrypt",
      "decrypt",
    ]);
  } catch {
    return null;
  }
}

export interface Ciphertext {
  /** Fresh per write — reusing an IV under one AES-GCM key breaks it outright. */
  iv: string;
  data: string;
}

export async function encrypt(key: CryptoKey, plaintext: string): Promise<Ciphertext | null> {
  const iv = randomBytes(IV_BYTES);
  try {
    const buffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      new TextEncoder().encode(plaintext),
    );
    return { iv: toBase64(iv), data: toBase64(new Uint8Array(buffer)) };
  } catch {
    return null;
  }
}

/**
 * `null` covers both "wrong key" and "the bytes were tampered with" — GCM's
 * tag fails the same way for either, and the app has nothing different to say
 * about them.
 */
export async function decrypt(key: CryptoKey, payload: Ciphertext): Promise<string | null> {
  const iv = fromBase64(payload.iv);
  const data = fromBase64(payload.data);
  if (!iv || !data) return null;
  try {
    const buffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      data as BufferSource,
    );
    return new TextDecoder().decode(buffer);
  } catch {
    return null;
  }
}
