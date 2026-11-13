import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Node 20+ exposes WebCrypto on `globalThis.crypto`, which is all the TOTP
    // code needs — no DOM, so no jsdom cost.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
