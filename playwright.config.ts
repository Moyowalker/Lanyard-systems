import { defineConfig } from '@playwright/test';

/**
 * E2E against the running dev apps (start them first):
 *   API :4000 (seeded), web-store :3000, web-admin :3001.
 * Real-browser smoke of the SSR + BFF + client layers; the transactional purchase
 * invariants are covered by the API integration suite.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    headless: true,
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  // Use the system Chrome (channel) to avoid downloading Playwright's browser binary.
  projects: [{ name: 'chrome', use: { browserName: 'chromium', channel: 'chrome' } }],
});
