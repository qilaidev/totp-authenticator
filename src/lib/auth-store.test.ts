import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The store talks to `window.localStorage` directly (no injected dependency —
 * it is a module singleton on purpose, so two components cannot disagree about
 * what is stored). A minimal stub is cheaper here than a full jsdom.
 */
class FakeStorage {
  private map = new Map<string, string>();
  /** Set to make `setItem` throw, the way a full quota or private mode does. */
  failWrites = false;

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new DOMException("QuotaExceededError");
    this.map.set(key, value);
  }

  clear(): void {
    this.map.clear();
  }
}

const storage = new FakeStorage();

vi.stubGlobal("window", {
  localStorage: storage,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
});

const {
  exportBackup,
  findDuplicateSecret,
  importBackup,
  removeEntry,
  saveEntry,
} = await import("./auth-store");

// Reading the current list without React: `saveEntry` returns nothing useful
// for assertions, so go through the export envelope.
function entries() {
  return JSON.parse(exportBackup()).entries as Array<Record<string, unknown>>;
}

function seed(raw: unknown): void {
  storage.clear();
  storage.failWrites = false;
  storage.setItem("authList", JSON.stringify(raw));
}

beforeEach(() => {
  seed([]);
});

describe("storage compatibility with legacy authList format", () => {
  it("reads a bare {remark, secret} array and adds ids", () => {
    seed([{ remark: "GitHub", secret: "jbswy3dpehpk3pxp" }]);
    const list = entries();
    expect(list).toHaveLength(1);
    expect(list[0].remark).toBe("GitHub");
    expect(list[0].secret).toBe("JBSWY3DPEHPK3PXP"); // normalised on read
    expect(typeof list[0].id).toBe("string");
  });

  it("drops malformed rows instead of rendering broken cards", () => {
    seed([null, 42, { remark: "no secret" }, { secret: "JBSWY3DPEHPK3PXP" }]);
    const list = entries();
    expect(list).toHaveLength(1);
    expect(list[0].remark).toBe("未命名");
  });

  it("survives a non-array or corrupt value", () => {
    storage.clear();
    storage.setItem("authList", "{not json");
    expect(entries()).toHaveLength(0);
    storage.setItem("authList", '{"a":1}');
    expect(entries()).toHaveLength(0);
  });

  it("clamps a hostile period and an over-long remark", () => {
    seed([
      { remark: "x".repeat(500), secret: "JBSWY3DPEHPK3PXP", period: 1e9, digits: 99 },
    ]);
    const [entry] = entries();
    expect((entry.remark as string).length).toBe(64);
    expect(entry.period).toBeUndefined();
    expect(entry.digits).toBeUndefined();
  });
});

describe("saveEntry", () => {
  it("adds, then upserts by remark like the original", () => {
    expect(saveEntry({ remark: "A", secret: "JBSWY3DPEHPK3PXP" }).result).toBe("added");
    expect(saveEntry({ remark: "A", secret: "MZXW6YTBOIJBSWY3" }).result).toBe("updated");
    const list = entries();
    expect(list).toHaveLength(1);
    expect(list[0].secret).toBe("MZXW6YTBOIJBSWY3");
  });

  it("an update replaces the old entry's algorithm, digits and period", () => {
    saveEntry({
      remark: "A",
      secret: "JBSWY3DPEHPK3PXP",
      issuer: "Old",
      algorithm: "SHA256",
      digits: 8,
      period: 60,
    });
    // Hand-typed secret: no metadata at all.
    saveEntry({ remark: "A", secret: "MZXW6YTBOIJBSWY3" });
    const [row] = entries();
    expect(row.secret).toBe("MZXW6YTBOIJBSWY3");
    expect(row.algorithm).toBeUndefined();
    expect(row.digits).toBeUndefined();
    expect(row.period).toBeUndefined();
    expect(row.issuer).toBeUndefined();
  });

  it("keeps the id stable across an update, so React keys do not churn", () => {
    saveEntry({ remark: "A", secret: "JBSWY3DPEHPK3PXP" });
    const before = entries()[0].id;
    saveEntry({ remark: "A", secret: "MZXW6YTBOIJBSWY3" });
    expect(entries()[0].id).toBe(before);
  });

  /**
   * A rejected write latches the store into memory-only mode for the rest of
   * the session, so this runs against a fresh copy of the module rather than
   * leaking that state into every test after it.
   */
  it("reports a rejected write and keeps serving the session from memory", async () => {
    vi.resetModules();
    const fresh = await import("./auth-store");

    seed([]);
    storage.failWrites = true;

    expect(fresh.saveEntry({ remark: "A", secret: "JBSWY3DPEHPK3PXP" }).persisted).toBe(
      "quota",
    );

    // Nothing reached storage...
    expect(JSON.parse(storage.getItem("authList") ?? "[]")).toHaveLength(0);
    // ...but the entry the user just added is still on screen.
    const list = JSON.parse(fresh.exportBackup()).entries as unknown[];
    expect(list).toHaveLength(1);

    storage.failWrites = false;
  });
});

describe("removeEntry", () => {
  it("deletes by id, not by index — two entries can share a remark", () => {
    seed([
      { id: "a", remark: "same", secret: "JBSWY3DPEHPK3PXP" },
      { id: "b", remark: "same", secret: "MZXW6YTBOIJBSWY3" },
    ]);
    removeEntry("a");
    const list = entries();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("b");
  });

  it("ignores an unknown id", () => {
    seed([{ id: "a", remark: "x", secret: "JBSWY3DPEHPK3PXP" }]);
    removeEntry("nope");
    expect(entries()).toHaveLength(1);
  });
});

describe("findDuplicateSecret", () => {
  it("finds the same secret filed under a different name", () => {
    seed([{ id: "a", remark: "work", secret: "JBSWY3DPEHPK3PXP" }]);
    expect(findDuplicateSecret("JBSWY3DPEHPK3PXP", "personal")?.remark).toBe("work");
    expect(findDuplicateSecret("JBSWY3DPEHPK3PXP", "work")).toBeUndefined();
  });
});

describe("backup round-trip", () => {
  it("exports an envelope that imports back unchanged", () => {
    seed([
      { id: "a", remark: "GitHub", secret: "JBSWY3DPEHPK3PXP" },
      { id: "b", remark: "AWS", secret: "MZXW6YTBOIJBSWY3", digits: 8, algorithm: "SHA256" },
    ]);
    const backup = exportBackup();

    seed([]);
    expect(importBackup(backup)).toEqual({ added: 2, skipped: 0, persisted: "ok" });
    const list = entries();
    expect(list.map((entry) => entry.remark)).toEqual(["GitHub", "AWS"]);
    expect(list[1].digits).toBe(8);
    expect(list[1].algorithm).toBe("SHA256");
  });

  it("merges without overwriting, and reports what it skipped", () => {
    seed([{ id: "a", remark: "GitHub", secret: "JBSWY3DPEHPK3PXP" }]);
    const summary = importBackup(
      JSON.stringify([
        { remark: "GitHub", secret: "JBSWY3DPEHPK3PXP" },
        { remark: "New", secret: "MZXW6YTBOIJBSWY3" },
        { remark: "Broken", secret: "NOTBASE321" },
      ]),
    );
    expect(summary).toEqual({ added: 1, skipped: 2, persisted: "ok" });
    expect(entries()).toHaveLength(2);
  });

  it("accepts a bare authList array copied out of the original site", () => {
    seed([]);
    expect(importBackup('[{"remark":"X","secret":"JBSWY3DPEHPK3PXP"}]')).toEqual({
      added: 1,
      skipped: 0,
      persisted: "ok",
    });
  });

  it("reports a rejected write instead of claiming the import was saved", async () => {
    vi.resetModules();
    const fresh = await import("./auth-store");
    seed([]);
    storage.failWrites = true;
    expect(fresh.importBackup('[{"remark":"X","secret":"JBSWY3DPEHPK3PXP"}]')).toEqual({
      added: 1,
      skipped: 0,
      persisted: "quota",
    });
    storage.failWrites = false;
  });

  it("rejects a file that is not a backup", () => {
    expect(importBackup("not json")).toBeNull();
    expect(importBackup('{"hello":"world"}')).toBeNull();
  });

  it("does not let duplicate ids in a file collide with existing entries", () => {
    seed([{ id: "dup", remark: "A", secret: "JBSWY3DPEHPK3PXP" }]);
    importBackup(JSON.stringify([{ id: "dup", remark: "B", secret: "MZXW6YTBOIJBSWY3" }]));
    const list = entries();
    expect(list).toHaveLength(2);
    expect(new Set(list.map((entry) => entry.id)).size).toBe(2);
  });
});

describe("Telegram device storage", () => {
  function withDevice(saved: Record<string, string>) {
    const win = globalThis.window as unknown as Record<string, unknown>;
    win.Telegram = {
      WebApp: {
        platform: "ios",
        isVersionAtLeast: () => true,
        DeviceStorage: {
          getItem: (key: string, cb: (e: null, v?: string) => void) => cb(null, saved[key] ?? ""),
          setItem: (key: string, value: string, cb?: () => void) => {
            saved[key] = value;
            cb?.();
          },
        },
      },
    };
    return () => {
      delete win.Telegram;
    };
  }

  it("restores the list when this WebView lost its localStorage", async () => {
    vi.resetModules();
    const fresh = await import("./auth-store");
    storage.clear();
    const device = { authList: '[{"remark":"G","secret":"JBSWY3DPEHPK3PXP"}]' };
    const restore = withDevice(device);
    await fresh.syncDeviceStorage();
    restore();
    expect(JSON.parse(fresh.exportBackup()).entries).toMatchObject([{ remark: "G" }]);
  });

  it("does not resurrect entries the user deleted, and mirrors local into device", async () => {
    vi.resetModules();
    const fresh = await import("./auth-store");
    seed([]);
    const device = { authList: '[{"remark":"old","secret":"JBSWY3DPEHPK3PXP"}]' };
    const restore = withDevice(device);
    await fresh.syncDeviceStorage();
    fresh.saveEntry({ remark: "new", secret: "MZXW6YTBOIJBSWY3" });
    restore();
    expect(JSON.parse(fresh.exportBackup()).entries).toMatchObject([{ remark: "new" }]);
    expect(JSON.parse(device.authList)).toMatchObject([{ remark: "new" }]);
  });
});
