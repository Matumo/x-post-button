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
      name: 'browser-headless',
      testDir: "./src/test/browser-headless",
      testMatch: ['**/*.test.ts'],
    },
    {
      name: 'browser-xvfb',
      testDir: "./src/test/browser-xvfb",
      testMatch: ['**/*.test.ts'],
    },
  ],
});
