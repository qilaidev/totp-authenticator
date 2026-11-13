import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Verbatim source captured from clone targets — never our code to lint.
    "docs/research/**/source/**",
    // Plain service-worker script — no modules, worker globals, not app code.
    "public/sw.js",
  ]),
]);

export default eslintConfig;
