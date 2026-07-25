import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// fileURLToPath decodes %20 etc. — the project path contains a space ("claude code").
const root = fileURLToPath(new URL(".", import.meta.url)).replace(/[/\\]$/, "");

export default defineConfig({
  resolve: { alias: { "@": root } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    /* Specs that exercise real tenant/DB behaviour boot a throwaway PGlite (WASM Postgres)
       and run the migrations in beforeAll, which comfortably exceeds the 10s default when
       several files boot one concurrently. */
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
