import { describe, expect, it } from "vitest";
import { fingerprint, mergeEntries, planSync } from "@/lib/sync-merge";
import type { AuthEntry } from "@/types/auth";

function entry(remark: string, secret: string, id = `${remark}-id`): AuthEntry {
  return { id, remark, secret };
}

const a = entry("网易", "JBSWY3DPEHPK3PXP");
const b = entry("谷歌", "KRSXG5CTMVRXEZLU");

let counter = 0;
const makeId = () => `new-${(counter += 1)}`;

describe("fingerprint", () => {
  it("ignores ids, which are generated per device", () => {
    expect(fingerprint([a])).toBe(fingerprint([{ ...a, id: "elsewhere" }]));
  });

  it("changes when the parameters change", () => {
    expect(fingerprint([a])).not.toBe(fingerprint([{ ...a, digits: 8 }]));
    expect(fingerprint([a])).not.toBe(fingerprint([a, b]));
    expect(fingerprint([a, b])).not.toBe(fingerprint([b, a]));
  });
});

describe("mergeEntries", () => {
  it("keeps both sides and never drops a secret", () => {
    expect(mergeEntries([a], [b], makeId).map((item) => item.remark)).toEqual(["网易", "谷歌"]);
  });

  it("treats remark + secret as the same row", () => {
    const sameRow = { ...a, id: "other-device" };
    expect(mergeEntries([a], [sameRow], makeId)).toEqual([a]);
  });

  it("re-ids a remote row that collides with a local one", () => {
    const collision = { ...b, id: a.id };
    const merged = mergeEntries([a], [collision], makeId);
    expect(merged).toHaveLength(2);
    expect(merged[1].id).not.toBe(a.id);
  });
});

describe("planSync", () => {
  it("does nothing when there is neither a cloud copy nor anything to send", () => {
    expect(planSync([], null, null, makeId)).toEqual({ action: "none" });
  });

  it("publishes the local list when the cloud has nothing", () => {
    expect(planSync([a], null, null, makeId)).toEqual({ action: "push", entries: [a], rev: 1 });
  });

  it("adopts a newer cloud snapshot when nothing changed locally", () => {
    const state = { rev: 1, fingerprint: fingerprint([a, b]) };
    const plan = planSync([a, b], state, { entries: [a], rev: 2 }, makeId);
    // Deleting on the other device has to delete here too, or it comes back.
    expect(plan).toEqual({ action: "adopt", entries: [a], rev: 2 });
  });

  it("merges when both sides moved, rather than letting one win", () => {
    const state = { rev: 1, fingerprint: fingerprint([]) };
    const plan = planSync([a], state, { entries: [b], rev: 2 }, makeId);
    expect(plan.action).toBe("merge");
    if (plan.action !== "merge") return;
    expect(plan.entries.map((item) => item.remark)).toEqual(["网易", "谷歌"]);
    expect(plan.rev).toBe(3);
  });

  it("pushes local changes when the cloud has not moved on", () => {
    const state = { rev: 2, fingerprint: fingerprint([]) };
    expect(planSync([a], state, { entries: [], rev: 2 }, makeId)).toEqual({
      action: "push",
      entries: [a],
      rev: 3,
    });
  });

  it("stays quiet when both sides already agree", () => {
    const state = { rev: 2, fingerprint: fingerprint([a]) };
    expect(planSync([a], state, { entries: [a], rev: 2 }, makeId)).toEqual({ action: "none" });
  });

  it("adopts on a fresh device instead of pushing back an identical list", () => {
    // First unlock: no state, empty list, everything is in the cloud copy.
    expect(planSync([], null, { entries: [a, b], rev: 4 }, makeId)).toEqual({
      action: "adopt",
      entries: [a, b],
      rev: 4,
    });
  });
});
