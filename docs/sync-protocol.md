# Three-Layer Storage & Cross-Device Sync Protocol

`totp-authenticator` stores secrets locally on the user's device and optionally synchronizes encrypted snapshots across devices belonging to the same Telegram account via `Telegram.WebApp.CloudStorage`.

## 1. Storage Layers

| Layer | Scope | Purpose |
| --- | --- | --- |
| **Primary (`localStorage`)** | Per-origin, per-device | Stores `authList` as JSON (`[{ id, remark, secret, issuer?, period?, digits?, algorithm? }]`). Compatible with legacy `[{ remark, secret }]` exports. |
| **Local Recovery (`Telegram.WebApp.DeviceStorage`, Bot API 9.0+)** | Per-device (not uploaded) | Mirrors `authList` inside Telegram's client-side device storage. Automatically restores entries if the WebView evicts `localStorage` (when `authList` key is missing, not when intentionally cleared to `[]`). |
| **Cross-Device Sync (`Telegram.WebApp.CloudStorage`, Bot API 6.9+)** | Per-user, per-bot | Automatically syncs encrypted snapshots across devices signed into the same Telegram account. No passphrase or manual toggle required. |

## 2. Client-Side Encryption (`src/lib/sync-crypto.ts`)

- Snapshots are encrypted with **AES-GCM** using a 256-bit Data Encryption Key (`tfa_sync_dek`) generated via `crypto.subtle`.
- Ciphertext is base64-encoded and split into chunks of up to `3800` characters (`MAX_CHUNKS = 64`) to stay within Telegram `CloudStorage`'s 4096-character per-key limit.
- **Double-buffered writes** (`src/lib/cloud-sync.ts`): New snapshots are written to an alternating generation slot (`tfa_sync_g0_*` / `tfa_sync_g1_*`), and `tfa_sync_meta` atomically switches the active generation pointer. Interrupted writes leave the previous snapshot intact.

### Honest Security Boundary

`tfa_sync_dek` is stored alongside the ciphertext in `CloudStorage` so a newly opened device can decrypt entries without a user passphrase. This protects against accidental plaintext exposure in transit/storage, **not** against Telegram itself (which holds both the ciphertext and `tfa_sync_dek` in the user's bot `CloudStorage`).

## 3. Authoritative Key & Non-Destructive Merge (`src/lib/sync-merge.ts`)

- **Authoritative key**: Every reconcile re-reads `tfa_sync_dek` from `CloudStorage` rather than trusting a local cache, preventing two devices opened simultaneously from publishing under divergent keys.
- **Deterministic 3-way-like state machine** (`planSync`):
  - Tracks `rev` (cloud revision counter) and `fingerprint(entries)` (53-bit `cyrb53` hash of entry content excluding local `id`s).
  - **Only cloud changed**: Adopt cloud snapshot verbatim (propagates deletions).
  - **Only local changed**: Push local snapshot to cloud.
  - **Both changed**: Compute a non-destructive union keyed by `(remark, secret)` and push the merged list, ensuring no TOTP secret is silently lost.
