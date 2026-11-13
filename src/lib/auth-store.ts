"use client";

import { useSyncExternalStore } from "react";
import type {
  AuthEntry,
  DraftEntry,
  ImportSummary,
  SaveResult,
  TotpAlgorithm,
} from "@/types/auth";
import { forgetKey, isValidSecret, normalizeSecret } from "@/lib/totp";
import { deviceStorageGet, deviceStorageSet } from "@/lib/telegram";

/** Standard storage key and array shape (`[{ remark, secret }]`). */
const STORAGE_KEY = "authList";
const EMPTY: AuthEntry[] = [];

/**
 * A malformed file should not be able to fill a user's origin quota with
 * garbage, and nobody has 500 authenticator accounts.
 */
const MAX_ENTRIES = 500;
const MAX_REMARK_LENGTH = 64;
const MAX_SECRET_LENGTH = 256;

let cachedRaw: string | null = null;
let cachedValue: AuthEntry[] = EMPTY;
const listeners = new Set<() => void>();

/**
 * Set once a write has been rejected (quota exhausted, Safari private mode,
 * storage blocked in an in-app WebView). From then on memory is the only
 * source of truth: re-reading localStorage would hand back the pre-failure
 * list and silently undo everything the user did in this session.
 */
let storageWritable = true;

function isAlgorithm(value: unknown): value is TotpAlgorithm {
  return value === "SHA1" || value === "SHA256" || value === "SHA512";
}

let idCounter = 0;

/**
 * Ids only need to be unique within one browser profile. `randomUUID` is not
 * available on plain-http origins in older WebViews, hence the counter fallback.
 */
function createId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // fall through to the counter
  }
  idCounter += 1;
  return `e${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

/** Identity used for de-duplication; JSON keeps the two fields unambiguous. */
function dedupeKey(entry: Pick<AuthEntry, "remark" | "secret">): string {
  return JSON.stringify([entry.remark, entry.secret]);
}

/** Normalise one unknown record from storage or an import file. */
function toEntry(item: unknown, seenIds: Set<string>): AuthEntry | null {
  if (typeof item !== "object" || item === null) return null;
  const record = item as Record<string, unknown>;

  const secret =
    typeof record.secret === "string"
      ? normalizeSecret(record.secret.slice(0, MAX_SECRET_LENGTH))
      : "";
  if (!secret) return null;

  // An id from the file is only trusted if it is a plausible, unused string.
  const rawId = typeof record.id === "string" ? record.id.slice(0, 64) : "";
  const id = rawId && !seenIds.has(rawId) ? rawId : createId();
  seenIds.add(id);

  const period = typeof record.period === "number" ? record.period : NaN;

  return {
    id,
    remark:
      typeof record.remark === "string" && record.remark.trim()
        ? record.remark.slice(0, MAX_REMARK_LENGTH)
        : "未命名",
    secret,
    issuer:
      typeof record.issuer === "string" && record.issuer
        ? record.issuer.slice(0, MAX_REMARK_LENGTH)
        : undefined,
    period: Number.isFinite(period) && period >= 1 && period <= 300 ? period : undefined,
    digits:
      record.digits === 6 || record.digits === 7 || record.digits === 8
        ? record.digits
        : undefined,
    algorithm: isAlgorithm(record.algorithm) ? record.algorithm : undefined,
  };
}

function parse(raw: string | null): AuthEntry[] {
  if (!raw) return EMPTY;
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return EMPTY;

    const seenIds = new Set<string>();
    const entries: AuthEntry[] = [];
    for (const item of data.slice(0, MAX_ENTRIES)) {
      const entry = toEntry(item, seenIds);
      if (entry) entries.push(entry);
    }
    return entries.length > 0 ? entries : EMPTY;
  } catch {
    return EMPTY;
  }
}

function readSnapshot(): AuthEntry[] {
  if (typeof window === "undefined") return EMPTY;
  if (!storageWritable) return cachedValue;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // private mode / blocked storage — keep whatever is in memory
    return cachedValue;
  }
  if (raw === cachedRaw) return cachedValue;
  cachedRaw = raw;
  cachedValue = parse(raw);
  return cachedValue;
}

function getServerSnapshot(): AuthEntry[] {
  return EMPTY;
}

function emit(): void {
  for (const listener of listeners) listener();
}

/**
 * Another tab wrote the same storage key.
 * Invalidate the cache only; `readSnapshot` re-parses on the next render, which
 * keeps `getSnapshot` referentially stable for `useSyncExternalStore`.
 */
function handleStorage(event: StorageEvent): void {
  if (event.key !== null && event.key !== STORAGE_KEY) return;
  if (!storageWritable) return;
  cachedRaw = null;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener("storage", handleStorage);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("storage", handleStorage);
    }
  };
}

export type PersistResult = "ok" | "quota";

function persist(entries: AuthEntry[]): PersistResult {
  const raw = JSON.stringify(entries);
  let result: PersistResult = "ok";
  try {
    window.localStorage.setItem(STORAGE_KEY, raw);
    // A later write can succeed again — the user freed space, or left private
    // mode — and the store should go back to trusting what is on disk.
    storageWritable = true;
  } catch {
    // Storage is full, or blocked (Safari private mode, some in-app WebViews).
    // The session keeps working from memory, but the user has to be told the
    // change will not survive a reload.
    storageWritable = false;
    result = "quota";
  }
  cachedRaw = raw;
  cachedValue = entries;
  // Second copy in Telegram's on-device storage: the WebView's localStorage can
  // be wiped (iOS storage eviction, "clear cache"), this one is not.
  deviceStorageSet(STORAGE_KEY, raw);
  emit();
  return result;
}

let deviceSynced = false;

/**
 * Called once Telegram is ready. If this WebView has never stored the list
 * (key absent — an emptied list is "[]", not absent) but the client's device
 * storage has one, bring it back. Otherwise make device storage match.
 */
export async function syncDeviceStorage(): Promise<void> {
  if (deviceSynced || typeof window === "undefined") return;
  deviceSynced = true;

  let local: string | null;
  try {
    local = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    local = null;
  }

  const saved = await deviceStorageGet(STORAGE_KEY);
  if (saved === undefined) return;

  if (local === null) {
    if (saved !== null && parse(saved).length > 0) persist(parse(saved));
    return;
  }
  if (saved !== local) deviceStorageSet(STORAGE_KEY, local);
}

export function useAuthEntries(): AuthEntry[] {
  return useSyncExternalStore(subscribe, readSnapshot, getServerSnapshot);
}

/** Id generator for the sync layer, so merged rows cannot collide. */
export function createEntryId(): string {
  return createId();
}

/** Current list, for code outside React (the cloud sync layer). */
export function readEntries(): AuthEntry[] {
  return readSnapshot();
}

/** Same subscription React uses, so sync reacts to every add/delete/import. */
export function subscribeEntries(listener: () => void): () => void {
  return subscribe(listener);
}

/**
 * Parse a stored/transferred `authList` array. Unlike `parse`, an empty array
 * stays an empty array: a synced snapshot of "[]" means the other device
 * deleted everything, which is not the same as a payload we failed to read.
 */
export function parseEntryList(text: string): AuthEntry[] | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(data)) return null;

  const seenIds = new Set<string>();
  const entries: AuthEntry[] = [];
  for (const item of data.slice(0, MAX_ENTRIES)) {
    const entry = toEntry(item, seenIds);
    if (entry && isValidSecret(entry.secret)) entries.push(entry);
  }
  return entries;
}

/**
 * Replace the whole list — what adopting a synced snapshot does. Keys cached
 * for secrets that are no longer present have to go with them, otherwise a
 * deleted account's key handle outlives the entry.
 */
export function replaceEntries(entries: AuthEntry[]): PersistResult {
  const current = readSnapshot();
  const kept = new Set(entries.map((item) => item.secret));
  for (const item of current) {
    if (!kept.has(item.secret)) forgetKey(item.secret);
  }
  return persist(entries.slice(0, MAX_ENTRIES));
}

/** Upsert by remark, exactly like the original's `findIndex(item => item.remark === remark)`. */
export function saveEntry(draft: DraftEntry): {
  result: SaveResult;
  persisted: PersistResult;
} {
  const entries = readSnapshot();
  const index = entries.findIndex((item) => item.remark === draft.remark);

  if (index >= 0) {
    const next = entries.slice();
    // The secret may have changed under the same remark; drop the stale key.
    forgetKey(entries[index].secret);
    // Replace the whole row: a hand-typed secret carries no algorithm/digits/period,
    // and inheriting the old entry's would show a well-formed but wrong code.
    next[index] = { ...draft, id: entries[index].id };
    return { result: "updated", persisted: persist(next) };
  }

  const entry: AuthEntry = { ...draft, id: createId() };
  return {
    result: "added",
    persisted: persist([...entries.slice(0, MAX_ENTRIES - 1), entry]),
  };
}

export function removeEntry(id: string): void {
  const entries = readSnapshot();
  const target = entries.find((item) => item.id === id);
  if (!target) return;
  forgetKey(target.secret);
  persist(entries.filter((item) => item.id !== id));
}

/** The same secret already stored under a different remark, if any. */
export function findDuplicateSecret(
  secret: string,
  remark: string,
): AuthEntry | undefined {
  return readSnapshot().find(
    (item) => item.secret === secret && item.remark !== remark,
  );
}

/* ─────────────────────────────  Backup / restore  ──────────────────────── */

export interface BackupFile {
  app: "google-authenticator-2fa";
  version: 1;
  exportedAt: string;
  entries: AuthEntry[];
}

export function exportBackup(): string {
  const backup: BackupFile = {
    app: "google-authenticator-2fa",
    version: 1,
    exportedAt: new Date().toISOString(),
    entries: readSnapshot(),
  };
  return JSON.stringify(backup);
}

/**
 * Accepts either this app's backup envelope or a bare `authList` array, so a
 * file copied straight out of the original site's localStorage also restores.
 * Existing entries are never overwritten — same remark + secret means skip.
 */
export function importBackup(text: string): ImportSummary | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }

  const envelope = data as Partial<BackupFile> | null;
  const raw = Array.isArray(data)
    ? data
    : typeof data === "object" && envelope !== null && Array.isArray(envelope.entries)
      ? envelope.entries
      : null;
  if (!raw) return null;

  const current = readSnapshot();
  const seenIds = new Set(current.map((item) => item.id));
  const existing = new Set(current.map(dedupeKey));

  const next = current.slice();
  let added = 0;
  let skipped = 0;

  for (const item of raw.slice(0, MAX_ENTRIES)) {
    const entry = toEntry(item, seenIds);
    if (!entry || !isValidSecret(entry.secret)) {
      skipped += 1;
      continue;
    }
    const key = dedupeKey(entry);
    if (existing.has(key) || next.length >= MAX_ENTRIES) {
      skipped += 1;
      continue;
    }
    existing.add(key);
    next.push(entry);
    added += 1;
  }

  const persisted = added > 0 ? persist(next) : "ok";
  return { added, skipped, persisted };
}
