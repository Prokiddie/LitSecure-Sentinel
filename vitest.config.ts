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
      // Thresholds raised incrementally as test suite grows (start: sprint 2)
      // thresholds: { lines: 30, functions: 30, branches: 25 },
    },
    testTimeout: 15000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
