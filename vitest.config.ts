import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    include: ["test/**/*.test.ts"],
    exclude: ["test/integration/**"],
    testTimeout: 10_000,
  },
});
