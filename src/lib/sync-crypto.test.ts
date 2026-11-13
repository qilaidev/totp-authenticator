import { describe, expect, it } from "vitest";
import { decrypt, encrypt, exportKey, importKey, randomKey } from "@/lib/sync-crypto";

async function freshKey() {
  const key = await randomKey();
  if (!key) throw new Error("randomKey returned null");
  return key;
}

describe("sync-crypto", () => {
  it("round-trips the payload", async () => {
    const key = await freshKey();
    const payload = await encrypt(key, '[{"remark":"网易","secret":"JBSWY3DPEHPK3PXP"}]');
    expect(payload).not.toBeNull();
    await expect(decrypt(key, payload!)).resolves.toBe(
      '[{"remark":"网易","secret":"JBSWY3DPEHPK3PXP"}]',
    );
  });

  it("refuses another account's key", async () => {
    const payload = await encrypt(await freshKey(), "secrets");
    await expect(decrypt(await freshKey(), payload!)).resolves.toBeNull();
  });

  it("refuses tampered ciphertext", async () => {
    const key = await freshKey();
    const payload = await encrypt(key, "secrets");
    const flipped = payload!.data[0] === "A" ? "B" : "A";
    await expect(
      decrypt(key, { iv: payload!.iv, data: flipped + payload!.data.slice(1) }),
    ).resolves.toBeNull();
  });

  it("uses a fresh IV for every write", async () => {
    const key = await freshKey();
    const first = await encrypt(key, "same plaintext");
    const second = await encrypt(key, "same plaintext");
    expect(first!.iv).not.toBe(second!.iv);
    expect(first!.data).not.toBe(second!.data);
  });

  it("survives the export/import round trip sync puts every key through", async () => {
    const key = await freshKey();
    const payload = await encrypt(key, "secrets");
    const exported = await exportKey(key);
    expect(exported).not.toBeNull();
    const restored = await importKey(exported!);
    expect(restored).not.toBeNull();
    await expect(decrypt(restored!, payload!)).resolves.toBe("secrets");
  });

  it("rejects a stored key that is not an AES key", async () => {
    await expect(importKey("bm90LWEta2V5")).resolves.toBeNull();
    await expect(importKey("not base64 at all!!")).resolves.toBeNull();
  });
});
