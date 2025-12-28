import { defineConfig } from 'vitest/config';
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

export default defineConfig({
  root: projectRoot,
  resolve: {
    alias: {
      "@main": resolve(projectRoot, "chrome-extension/src/main"),
      "@test": resolve(projectRoot, "chrome-extension/src/test"),
    },
  },
  test: {
    environment: 'node',
    include: ['chrome-extension/src/test/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: [
        "text",
        "json-summary",
        "json",
        "lcov",
      ],
      include: ['chrome-extension/src/main/**/*.{ts,tsx}'], // カバレッジ対象
    },
  },
});
