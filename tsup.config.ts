import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "matchers/vitest": "src/matchers/vitest.ts",
    "matchers/jest": "src/matchers/jest.ts",
    "cli/index": "src/cli/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  target: "node18",
  outDir: "dist",
});
