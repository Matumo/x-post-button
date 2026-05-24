import { defineConfig } from '@playwright/test';

const second = 1000;
const minute = 60 * second;

const baseProject = {
  timeout: 90 * second,
  globalTimeout: 10 * minute,
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
