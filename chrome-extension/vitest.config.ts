import { defineConfig } from 'vitest/config';
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

export default defineConfig({
  root: projectRoot,
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
    },
  },
});
