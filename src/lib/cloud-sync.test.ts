import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The two-device story, end to end, against a fake `CloudStorage`.
 *
 * This is the bug this layer exists for: the same Telegram account on a second
 * device opened the app empty, because `localStorage` and `DeviceStorage` are
 * both per device. So the test really does run two devices — separate module
 * registries, separate `localStorage`, one shared cloud — because a single
 * instance cannot show that anything crossed between them.
 */

class FakeStorage {
  readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

/** Telegram's side: one store per account, shared by every device. */
const cloud = new Map<string, string>();

const META_KEY = "tfa_sync_meta";

/** Set to fail the next pointer write, i.e. cut a push short — see the test. */
let dropNextMetaWrite = false;
/** How many times the ciphertext itself was downloaded. */
let payloadReads = 0;

function isChunkKey(key: string): boolean {
  return key !== META_KEY && key !== DEK_KEY && key.startsWith("tfa_sync_");
}

const cloudStorage = {
  getItem(key: string, callback: (error: string | null, value?: string | null) => void) {
    callback(null, cloud.get(key) ?? null);
  },
  getItems(
    keys: string[],
    callback: (error: string | null, values?: Record<string, string> | null) => void,
  ) {
    if (keys.some(isChunkKey)) payloadReads += 1;
    const values: Record<string, string> = {};
    for (const key of keys) values[key] = cloud.get(key) ?? "";
    callback(null, values);
  },
  setItem(key: string, value: string, callback?: (error: string | null, ok?: boolean) => void) {
    if (key === META_KEY && dropNextMetaWrite) {
      dropNextMetaWrite = false;
      callback?.("write failed");
      return;
    }
    cloud.set(key, value);
    callback?.(null, true);
  },
  removeItems(keys: string[], callback?: (error: string | null, ok?: boolean) => void) {
    for (const key of keys) cloud.delete(key);
    callback?.(null, true);
  },
};

interface Device {
  storage: FakeStorage;
  store: typeof import("@/lib/auth-store");
  sync: typeof import("@/lib/cloud-sync");
}

/** Point the globals at one device; every module reads them lazily. */
function activate(device: Device): Device {
  vi.stubGlobal("window", {
    localStorage: device.storage,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    Telegram: {
      WebApp: {
        platform: "ios",
        version: "9.0",
        isVersionAtLeast: () => true,
        CloudStorage: cloudStorage,
      },
    },
  });
  vi.stubGlobal("document", {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    visibilityState: "visible",
  });
  return device;
}

async function bootDevice(): Promise<Device> {
  vi.resetModules();
  const partial = { storage: new FakeStorage() } as Device;
  activate(partial);
  partial.store = await import("@/lib/auth-store");
  partial.sync = await import("@/lib/cloud-sync");
  return partial;
}

/**
 * Open the app on this device and let it settle. `syncNow` queues behind the
 * boot reconcile, so awaiting it awaits both.
 */
async function open(device: Device): Promise<Device> {
  activate(device);
  device.sync.initCloudSync();
  await device.sync.syncNow();
  return device;
}

const DEK_KEY = "tfa_sync_dek";
const NETEASE = { remark: "网易", secret: "JBSWY3DPEHPK3PXP" };
const GOOGLE = { remark: "谷歌", secret: "KRSXG5CTMVRXEZLU" };

const remarks = (device: Device) => device.store.readEntries().map((entry) => entry.remark);

describe("cross-device sync", () => {
  beforeEach(() => {
    cloud.clear();
    dropNextMetaWrite = false;
    payloadReads = 0;
  });

  it("carries the codes to a second device with nothing to set up", async () => {
    const first = await open(await bootDevice());
    first.store.saveEntry(NETEASE);
    await first.sync.syncNow();

    // The point of the whole feature: a fresh device just has them.
    const second = await open(await bootDevice());
    expect(remarks(second)).toEqual(["网易"]);
    expect(second.sync.getSyncStatus().phase).toBe("on");
  });

  it("starts syncing without being switched on", async () => {
    const device = await bootDevice();
    activate(device);
    device.sync.initCloudSync();
    expect(device.sync.getSyncStatus().phase).toBe("on");
    await device.sync.syncNow();
    expect(cloud.has(DEK_KEY)).toBe(true);
  });

  it("puts nothing readable in the cloud", async () => {
    const device = await open(await bootDevice());
    device.store.saveEntry(NETEASE);
    await device.sync.syncNow();

    const dump = [...cloud.entries()].map(([key, value]) => `${key}=${value}`).join("\n");
    expect(dump).not.toContain(NETEASE.secret);
    expect(dump).not.toContain(NETEASE.remark);
  });

  it("keeps the account's key instead of minting a second one", async () => {
    const first = await open(await bootDevice());
    first.store.saveEntry(NETEASE);
    await first.sync.syncNow();
    const original = cloud.get(DEK_KEY);

    // A device that minted its own key here would leave the existing copy
    // encrypted under a key nobody holds.
    const second = await open(await bootDevice());
    expect(cloud.get(DEK_KEY)).toBe(original);
    expect(remarks(second)).toEqual(["网易"]);
  });

  it("propagates a deletion instead of letting the other device push it back", async () => {
    const first = await open(await bootDevice());
    first.store.saveEntry(NETEASE);
    first.store.saveEntry(GOOGLE);
    await first.sync.syncNow();

    const second = await open(await bootDevice());
    const target = second.store.readEntries().find((entry) => entry.remark === "谷歌");
    second.store.removeEntry(target!.id);
    await second.sync.syncNow();

    activate(first);
    await first.sync.syncNow();
    expect(remarks(first)).toEqual(["网易"]);
  });

  it("keeps both sides when two devices added while out of touch", async () => {
    const first = await open(await bootDevice());
    first.store.saveEntry(NETEASE);
    await first.sync.syncNow();

    const second = await open(await bootDevice());

    // Each adds something the other has not seen.
    second.store.saveEntry(GOOGLE);
    await second.sync.syncNow();

    activate(first);
    first.store.saveEntry({ remark: "微软", secret: "MFRGGZDFMZTWQ2LK" });
    await first.sync.syncNow();
    expect(remarks(first).sort()).toEqual(["微软", "网易", "谷歌"].sort());

    activate(second);
    await second.sync.syncNow();
    expect(remarks(second).sort()).toEqual(["微软", "网易", "谷歌"].sort());
  });

  it("keeps the last good copy when a push is cut short", async () => {
    const first = await open(await bootDevice());
    first.store.saveEntry(NETEASE);
    await first.sync.syncNow();

    // The mini app closes (or the bridge drops the call) after the ciphertext
    // went up but before the pointer moved to it. Overwriting the live payload
    // in place would have left the account with ciphertext that no key opens.
    first.store.saveEntry(GOOGLE);
    dropNextMetaWrite = true;
    await first.sync.syncNow();
    expect(first.sync.getSyncStatus().error).not.toBeNull();

    // A device holding nothing of its own is what that would have cost.
    const fresh = await open(await bootDevice());
    expect(remarks(fresh)).toEqual(["网易"]);

    // And the interrupted device still gets its addition up on the retry.
    activate(first);
    await first.sync.syncNow();
    expect(first.sync.getSyncStatus().error).toBeNull();

    const later = await open(await bootDevice());
    expect(remarks(later).sort()).toEqual(["网易", "谷歌"].sort());
  });

  it("reads, and moves on from, a copy written by the single-slot version", async () => {
    const first = await open(await bootDevice());
    first.store.saveEntry(NETEASE);
    await first.sync.syncNow();

    // Rewrite what is up there the way the shipped version wrote it: chunks
    // under bare indexes, and a pointer that names no slot. This is what every
    // account already syncing has in it right now.
    const meta = JSON.parse(cloud.get(META_KEY)!) as Record<string, unknown>;
    for (let i = 0; i < (meta.n as number); i += 1) {
      cloud.set(`tfa_sync_${i}`, cloud.get(`tfa_sync_g${meta.g}_${i}`)!);
      cloud.delete(`tfa_sync_g${meta.g}_${i}`);
    }
    delete meta.g;
    delete meta.pn;
    cloud.set(META_KEY, JSON.stringify(meta));

    const second = await open(await bootDevice());
    expect(remarks(second)).toEqual(["网易"]);

    // Its own first push migrates the account off that layout for good.
    second.store.saveEntry(GOOGLE);
    await second.sync.syncNow();
    expect(cloud.has("tfa_sync_0")).toBe(false);

    const third = await open(await bootDevice());
    expect(remarks(third).sort()).toEqual(["网易", "谷歌"].sort());
  });

  it("does not re-download the list when nothing moved", async () => {
    const device = await open(await bootDevice());
    device.store.saveEntry(NETEASE);
    await device.sync.syncNow();

    // Reopening the app is the common case, and it is the case where the
    // revision up there is the one this device published a moment ago.
    const before = payloadReads;
    await device.sync.syncNow();
    await device.sync.syncNow();
    expect(payloadReads).toBe(before);
  });

  it("stays local-only outside Telegram", async () => {
    vi.resetModules();
    const device = { storage: new FakeStorage() } as Device;
    vi.stubGlobal("window", {
      localStorage: device.storage,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    vi.stubGlobal("document", {
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      visibilityState: "visible",
    });
    device.store = await import("@/lib/auth-store");
    device.sync = await import("@/lib/cloud-sync");

    device.sync.initCloudSync();
    device.store.saveEntry(NETEASE);
    await device.sync.syncNow();

    expect(device.sync.getSyncStatus().phase).toBe("unavailable");
    expect(cloud.size).toBe(0);
  });
});
