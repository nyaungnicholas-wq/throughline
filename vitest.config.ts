import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// fileURLToPath decodes %20 etc. — the project path contains a space ("claude code").
const root = fileURLToPath(new URL(".", import.meta.url)).replace(/[/\\]$/, "");

export default defineConfig({
  resolve: { alias: { "@": root } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
