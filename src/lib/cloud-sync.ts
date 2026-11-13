"use client";

import { useSyncExternalStore } from "react";
import {
  createEntryId,
  parseEntryList,
  readEntries,
  replaceEntries,
  subscribeEntries,
} from "@/lib/auth-store";
import { decrypt, encrypt, exportKey, importKey, randomKey } from "@/lib/sync-crypto";
import { canSyncWithCloud, cloudGetMany, cloudRemove, cloudSet } from "@/lib/telegram";
import { fingerprint, planSync, type CloudSnapshot } from "@/lib/sync-merge";
import type { AuthEntry } from "@/types/auth";

/**
 * Cross-device sync over Telegram `CloudStorage`.
 *
 * `CloudStorage` is per Telegram user and per bot, so every device signed in to
 * the same Telegram account reads the same values — which is exactly the gap
 * this closes: `localStorage` and `DeviceStorage` are both per device, so a
 * second device used to open the app empty.
 *
 * On by itself, with nothing to set up. The list travels as AES-GCM ciphertext
 * under a key generated on the device and kept in `CloudStorage` beside it, so
 * a new device picks both up and the codes are simply there.
 *
 * The cloud copy is the authority on the key: every reconcile re-reads it
 * rather than trusting the local cache. Two devices opening the app for the
 * first time at the same moment would otherwise each publish under their own
 * key, and the loser's ciphertext would be unreadable for good.
 *
 * A push never writes over the copy that is currently live — the ciphertext
 * alternates between two slots and one small write switches which is live — so
 * a save that is cut off halfway leaves the previous snapshot intact.
 */

/* ─────────────────────────────────  Keys  ──────────────────────────────── */

/** `CloudStorage` keys are `[A-Za-z0-9_-]{1,128}`. */
const META_KEY = "tfa_sync_meta";
const DEK_KEY = "tfa_sync_dek";
/** One of the two alternating chunk slots — see `pushSnapshot`. */
const CHUNK_PREFIX = "tfa_sync_g";
/** The single-slot layout written before double buffering; still readable. */
const LEGACY_CHUNK_PREFIX = "tfa_sync_";

/** Values cap at 4096 characters; leave room rather than discover the edge. */
const CHUNK_SIZE = 3800;
const MAX_CHUNKS = 64;

/** Local: the key, so a return visit shows codes without waiting on a round trip. */
const KEY_STORAGE = "authSyncKey";
/** Local: what this device last agreed with the cloud on. */
const STATE_STORAGE = "authSyncState";

const PUSH_DEBOUNCE_MS = 1200;
const REFRESH_INTERVAL_MS = 15_000;

/** Which of the two chunk slots a snapshot sits in. */
type Slot = 0 | 1;

function chunkKey(slot: Slot, index: number): string {
  return `${CHUNK_PREFIX}${slot}_${index}`;
}

/* ────────────────────────────────  Records  ────────────────────────────── */

interface CloudMeta {
  v: 1;
  iv: string;
  /** Number of ciphertext chunks in the live slot. */
  n: number;
  rev: number;
  /** Epoch ms of the write. Nothing reads it; it is here to debug a bad copy. */
  at: number;
  /**
   * The slot this meta's payload was written to. Absent on records from before
   * double buffering, which used one unnumbered slot.
   */
  g?: Slot;
  /** Chunks left in the *other* slot, so the next push can trim its tail. */
  pn?: number;
}

interface LocalState {
  rev: number;
  fingerprint: string;
}

function isMeta(value: unknown): value is CloudMeta {
  if (typeof value !== "object" || value === null) return false;
  const meta = value as Record<string, unknown>;
  return (
    meta.v === 1 &&
    typeof meta.iv === "string" &&
    typeof meta.n === "number" &&
    meta.n >= 0 &&
    meta.n <= MAX_CHUNKS &&
    typeof meta.rev === "number" &&
    (meta.g === undefined || meta.g === 0 || meta.g === 1) &&
    (meta.pn === undefined ||
      (typeof meta.pn === "number" && meta.pn >= 0 && meta.pn <= MAX_CHUNKS))
  );
}

function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Private mode / full quota. Sync still works this session; the next open
    // just starts from the cloud copy again.
  }
}

function loadState(): LocalState | null {
  const raw = readLocal(STATE_STORAGE);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<LocalState>;
    if (typeof data.rev !== "number" || typeof data.fingerprint !== "string") return null;
    return { rev: data.rev, fingerprint: data.fingerprint };
  } catch {
    return null;
  }
}

function saveState(state: LocalState): void {
  writeLocal(STATE_STORAGE, JSON.stringify(state));
}

/* ────────────────────────────────  Status  ─────────────────────────────── */

export type SyncPhase =
  /** No `CloudStorage` here — outside Telegram, or a client older than 6.9. */
  | "unavailable"
  /** Syncing. */
  | "on";

export interface SyncStatus {
  phase: SyncPhase;
  busy: boolean;
  error: string | null;
}

const INITIAL: SyncStatus = { phase: "unavailable", busy: false, error: null };

let status: SyncStatus = INITIAL;
const listeners = new Set<() => void>();

function setStatus(patch: Partial<SyncStatus>): void {
  const next = { ...status, ...patch };
  if (
    next.phase === status.phase &&
    next.busy === status.busy &&
    next.error === status.error
  ) {
    return;
  }
  status = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** For code outside React — the boot sequence and the tests. */
export function getSyncStatus(): SyncStatus {
  return status;
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    subscribe,
    () => status,
    () => INITIAL,
  );
}

/* ───────────────────────────────  Transport  ───────────────────────────── */

let key: CryptoKey | null = null;

function parseMeta(raw: string): CloudMeta | null {
  try {
    const data: unknown = JSON.parse(raw);
    return isMeta(data) ? data : null;
  } catch {
    return null;
  }
}

interface CloudHead {
  meta: CloudMeta | null;
  /** The key, exported raw and base64'd, exactly as it sits in the cloud. */
  dek: string | null;
}

/**
 * Meta and key in one round trip. `undefined` means the call itself failed and
 * the caller must not read it as "nothing up there" — that mistake is how a
 * device would decide the account is empty and republish over a real copy.
 */
async function readHead(): Promise<CloudHead | undefined> {
  const values = await cloudGetMany([META_KEY, DEK_KEY]);
  if (!values) return undefined;
  const rawMeta = values[META_KEY];
  const rawDek = values[DEK_KEY];
  return {
    meta: typeof rawMeta === "string" && rawMeta !== "" ? parseMeta(rawMeta) : null,
    dek: typeof rawDek === "string" && rawDek !== "" ? rawDek : null,
  };
}

/** The keys a given meta's payload actually sits under. */
function chunkKeysOf(meta: CloudMeta): string[] {
  const keys: string[] = [];
  for (let i = 0; i < meta.n; i += 1) {
    keys.push(meta.g === undefined ? `${LEGACY_CHUNK_PREFIX}${i}` : chunkKey(meta.g, i));
  }
  return keys;
}

/** Pull and decrypt the snapshot. `undefined` = could not read it. */
async function pullSnapshot(
  meta: CloudMeta,
  withKey: CryptoKey,
): Promise<CloudSnapshot | undefined> {
  let data = "";
  const keys = chunkKeysOf(meta);
  if (keys.length > 0) {
    const values = await cloudGetMany(keys);
    if (!values) return undefined;
    for (const name of keys) {
      const part = values[name];
      if (typeof part !== "string" || part === "") return undefined;
      data += part;
    }
  }

  const plaintext = await decrypt(withKey, { iv: meta.iv, data });
  if (plaintext === null) return undefined;
  const entries = parseEntryList(plaintext);
  if (entries === null) return undefined;
  return { entries, rev: meta.rev };
}

/**
 * Write the new snapshot somewhere else, then move the pointer.
 *
 * The payload goes into whichever of the two slots is *not* the live one, and
 * only the last write — the meta — makes it the live one. That is what makes a
 * push atomic as far as every other device is concerned: a push cut short (the
 * mini app closed mid-save, the bridge dropping the call, the client killed)
 * leaves the previous snapshot whole, because not one byte of it was touched.
 *
 * Writing chunks in place, which is what this did before, had no such
 * guarantee: an interruption between the first chunk and the meta left the
 * live pointer naming a payload that is half old ciphertext and half new, and
 * AES-GCM will never open that again. On a device holding no local copy — the
 * new phone, which is the whole reason this sync exists — that is every secret
 * gone.
 */
async function pushSnapshot(
  entries: AuthEntry[],
  rev: number,
  withKey: CryptoKey,
  previous: CloudMeta | null,
): Promise<boolean> {
  const payload = await encrypt(withKey, JSON.stringify(entries));
  if (!payload) return false;

  const chunks: string[] = [];
  for (let i = 0; i < payload.data.length; i += CHUNK_SIZE) {
    chunks.push(payload.data.slice(i, i + CHUNK_SIZE));
  }
  if (chunks.length > MAX_CHUNKS) return false;

  // The slot the live snapshot is not in. A legacy record is in neither.
  const slot: Slot = previous?.g === 0 ? 1 : 0;
  for (let i = 0; i < chunks.length; i += 1) {
    if (!(await cloudSet(chunkKey(slot, i), chunks[i]))) return false;
  }

  const meta: CloudMeta = {
    v: 1,
    iv: payload.iv,
    n: chunks.length,
    rev,
    at: Date.now(),
    g: slot,
    // What the other slot holds from now on: the snapshot this one replaces.
    pn: previous?.g === undefined ? 0 : previous.n,
  };
  if (!(await cloudSet(META_KEY, JSON.stringify(meta)))) return false;

  // Only now is anything else up there unreachable: the tail of what this slot
  // held before, and the single-slot layout if this push just migrated off it.
  const stale: string[] = [];
  for (let i = chunks.length; i < (previous?.pn ?? 0); i += 1) stale.push(chunkKey(slot, i));
  if (previous && previous.g === undefined) {
    for (let i = 0; i < previous.n; i += 1) stale.push(`${LEGACY_CHUNK_PREFIX}${i}`);
  }
  if (stale.length > 0) void cloudRemove(stale);
  return true;
}

/* ─────────────────────────────  Reconciliation  ────────────────────────── */

/** One at a time: two overlapping syncs would race on the revision counter. */
let running: Promise<void> = Promise.resolve();
let lastSyncAt = 0;

function queue<T>(task: () => Promise<T>): Promise<T> {
  const result = running.catch(() => undefined).then(task);
  running = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/**
 * Set while a remote snapshot is being written into the local store, so the
 * store's own change notification does not schedule a push of what we just
 * pulled.
 */
let applyingRemote = false;

/** Mint a key, publish it, and forget any revision this device thought it knew. */
async function mintKey(): Promise<CryptoKey | null> {
  const fresh = await randomKey();
  if (!fresh) return null;
  const raw = await exportKey(fresh);
  if (!raw || !(await cloudSet(DEK_KEY, raw))) return null;
  key = fresh;
  writeLocal(KEY_STORAGE, raw);
  // Whatever revision this device last agreed to was under a different key.
  writeLocal(STATE_STORAGE, null);
  return key;
}

/**
 * Settle on the key this account syncs under.
 *
 * The cloud copy wins whenever there is one. A key is minted only for an
 * account with nothing up there — minting one while a copy exists would strand
 * that copy behind a key nobody holds.
 */
async function settleKey(head: CloudHead): Promise<CryptoKey | null> {
  if (head.dek) {
    if (key && readLocal(KEY_STORAGE) === head.dek) return key;
    const imported = await importKey(head.dek);
    if (!imported) return null;
    key = imported;
    writeLocal(KEY_STORAGE, head.dek);
    return key;
  }

  // First device on this account.
  if (!head.meta) return mintKey();

  // A copy with no key beside it: nothing can open it any more. Republishing
  // from this device is the only way forward, and only worth doing when this
  // device actually holds codes — otherwise an empty list would take its place.
  if (readEntries().length === 0) return null;
  return mintKey();
}

async function reconcile(): Promise<void> {
  setStatus({ busy: true });
  try {
    const head = await readHead();
    if (!head) {
      setStatus({ error: "同步暂时不可用" });
      return;
    }

    const withKey = await settleKey(head);
    if (!withKey) {
      setStatus({ error: "同步暂时不可用" });
      return;
    }

    const local = readEntries();
    const state = loadState();
    const localPrint = fingerprint(local);

    // Neither side moved: the revision up there is still the one this device
    // agreed to, and its list is still the list it agreed with. Downloading and
    // decrypting the snapshot could only confirm that, so skip the round trip —
    // this is the common case every time the app is reopened.
    if (head.meta && state && head.meta.rev <= state.rev && state.fingerprint === localPrint) {
      lastSyncAt = Date.now();
      setStatus({ error: null });
      return;
    }

    // `settleKey` may have minted a new key, which leaves the existing payload
    // unreadable; only pull when the key that is up there is the one we hold.
    let cloud: CloudSnapshot | null = null;
    if (head.meta && head.dek) {
      const pulled = await pullSnapshot(head.meta, withKey);
      if (pulled === undefined) {
        setStatus({ error: "同步暂时不可用" });
        return;
      }
      cloud = pulled;
    }

    const plan = planSync(local, state, cloud, createEntryId);

    if (plan.action === "none") {
      lastSyncAt = Date.now();
      setStatus({ error: null });
      return;
    }

    if (plan.action === "adopt" || plan.action === "merge") {
      applyingRemote = true;
      try {
        replaceEntries(plan.entries);
      } finally {
        applyingRemote = false;
      }
    }

    let rev = plan.rev;
    if (plan.action !== "adopt") {
      // Never publish under a revision the cloud is already past. Re-minting the
      // key resets this device's counter, and a snapshot numbered below what the
      // other devices last agreed to is one they would ignore for good.
      rev = Math.max(rev, (head.meta?.rev ?? 0) + 1);
      const ok = await pushSnapshot(plan.entries, rev, withKey, head.meta);
      if (!ok) {
        setStatus({ error: "同步失败，稍后重试" });
        return;
      }
    }

    saveState({ rev, fingerprint: fingerprint(plan.entries) });
    lastSyncAt = Date.now();
    setStatus({ error: null });
  } finally {
    setStatus({ busy: false });
  }
}

/** Manual retry after a failure, and the pull on returning to the app. */
export function syncNow(): Promise<void> {
  if (status.phase !== "on") return Promise.resolve();
  return queue(reconcile);
}

/* ──────────────────────────────────  Boot  ─────────────────────────────── */

let started = false;

/** Called once Telegram is ready. Safe to call again; it only runs once. */
export function initCloudSync(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  if (!canSyncWithCloud()) {
    setStatus({ phase: "unavailable" });
    return;
  }

  setStatus({ phase: "on" });

  void queue(async () => {
    // The cached key is only a head start on the round trip; `settleKey` still
    // has the cloud's answer overrule it.
    const cached = readLocal(KEY_STORAGE);
    if (cached) key = await importKey(cached);
    await reconcile();
  });

  // A local add/delete/import has to reach the other devices without waiting
  // for the next open.
  let timer: ReturnType<typeof setTimeout> | null = null;
  subscribeEntries(() => {
    if (status.phase !== "on" || applyingRemote) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void queue(reconcile);
    }, PUSH_DEBOUNCE_MS);
  });

  // Coming back to the app is when another device's change should show up.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (status.phase !== "on") return;
    if (Date.now() - lastSyncAt < REFRESH_INTERVAL_MS) return;
    void queue(reconcile);
  });
}
