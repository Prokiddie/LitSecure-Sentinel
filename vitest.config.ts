import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals:     true,
    environment: "node",
    setupFiles:  ["./server/__tests__/setup.ts"],
    include:     ["server/__tests__/**/*.test.ts"],
    coverage: {
      provider:   "v8",
      reporter:   ["text", "json", "html"],
      include:    ["server/**/*.ts"],
      exclude:    ["server/__tests__/**", "server/db/seed.ts"],
      thresholds: { lines: 50, functions: 50, branches: 40 },
    },
    testTimeout: 15000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
