import { defineConfig } from '@playwright/test';

const baseProject = {
  timeout: 30000,
  globalTimeout: 600000,
  reporter: 'list',
  use: {
    channel: 'chromium',
  },
};

export default defineConfig({
  ...baseProject,
  projects: [
    {
      name: 'browser-unit',
      testDir: "./src/test/browser-unit",
      testMatch: ['**/*.test.ts'],
    },
    {
      name: 'browser-integration',
      testDir: "./src/test/browser-integration",
      testMatch: ['**/*.test.ts'],
    },
  ],
});
