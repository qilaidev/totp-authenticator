import type { AuthEntry } from "@/types/auth";

/**
 * Deciding what the device and the cloud copy owe each other. Pure functions,
 * no storage and no Telegram — the interesting part of syncing is the rules,
 * and the rules are what tests can actually pin down.
 *
 * Model: the cloud holds one snapshot of the whole list plus a revision
 * counter. A device remembers the revision it last reconciled with and a
 * fingerprint of the list as it stood at that moment. That pair is enough to
 * tell "the other device changed something" from "I changed something", which
 * is the only distinction that matters here:
 *
 *   - only the cloud moved  → adopt it verbatim, so deletions propagate
 *   - only this device moved → push
 *   - both moved            → union, then push
 *
 * The union is deliberately non-destructive. Two devices that edited while
 * apart can end up with a duplicate row, which the user can delete in one tap;
 * the alternative — letting one side win — silently destroys a secret, and a
 * lost TOTP secret locks someone out of an account.
 */

/** Identity for merging. Ids are generated per device, so they cannot be it. */
function contentKey(entry: AuthEntry): string {
  return JSON.stringify([entry.remark, entry.secret]);
}

/** Everything that makes two lists meaningfully different, ids excluded. */
function contentOf(entries: AuthEntry[]): string {
  return JSON.stringify(
    entries.map((entry) => [
      entry.remark,
      entry.secret,
      entry.issuer ?? "",
      entry.period ?? 0,
      entry.digits ?? 0,
      entry.algorithm ?? "",
    ]),
  );
}

/**
 * cyrb53 — a 53-bit non-cryptographic hash. Storing the full content string as
 * the "last synced" marker would double this app's storage footprint; nothing
 * here is a security decision, a collision would only mean one skipped push.
 */
export function fingerprint(entries: AuthEntry[]): string {
  const text = contentOf(entries);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * Union, local order first. An entry present on both sides keeps the local
 * row — same remark and secret means the two only differ in id.
 */
export function mergeEntries(
  local: AuthEntry[],
  cloud: AuthEntry[],
  makeId: () => string,
): AuthEntry[] {
  const seenContent = new Set(local.map(contentKey));
  const seenIds = new Set(local.map((entry) => entry.id));
  const merged = local.slice();

  for (const entry of cloud) {
    const key = contentKey(entry);
    if (seenContent.has(key)) continue;
    seenContent.add(key);
    const id = seenIds.has(entry.id) ? makeId() : entry.id;
    seenIds.add(id);
    merged.push({ ...entry, id });
  }
  return merged;
}

export interface CloudSnapshot {
  entries: AuthEntry[];
  rev: number;
}

/** What this device last agreed with the cloud on. Absent before the first sync. */
export interface SyncState {
  rev: number;
  fingerprint: string;
}

export type SyncPlan =
  /** Both sides already agree. */
  | { action: "none" }
  /** Take the cloud list as-is; nothing to send back. */
  | { action: "adopt"; entries: AuthEntry[]; rev: number }
  /** Send the local list up; nothing to change locally. */
  | { action: "push"; entries: AuthEntry[]; rev: number }
  /** Both moved: write the union locally *and* send it up. */
  | { action: "merge"; entries: AuthEntry[]; rev: number };

export function planSync(
  local: AuthEntry[],
  state: SyncState | null,
  cloud: CloudSnapshot | null,
  makeId: () => string,
): SyncPlan {
  const localPrint = fingerprint(local);
  const dirty = state === null || state.fingerprint !== localPrint;
  const knownRev = state?.rev ?? 0;

  if (cloud === null) {
    // Nothing up there yet. An empty list is not worth a first revision.
    if (local.length === 0) return { action: "none" };
    return { action: "push", entries: local, rev: knownRev + 1 };
  }

  if (cloud.rev <= knownRev) {
    return dirty ? { action: "push", entries: local, rev: cloud.rev + 1 } : { action: "none" };
  }

  // The cloud is ahead. Untouched locally → take it, deletions included.
  if (!dirty) return { action: "adopt", entries: cloud.entries, rev: cloud.rev };

  const merged = mergeEntries(local, cloud.entries, makeId);
  // The local changes turned out to be things the cloud already had; adopting
  // keeps the cloud's ids and saves a pointless round trip.
  if (fingerprint(merged) === fingerprint(cloud.entries)) {
    return { action: "adopt", entries: cloud.entries, rev: cloud.rev };
  }
  return { action: "merge", entries: merged, rev: cloud.rev + 1 };
}
