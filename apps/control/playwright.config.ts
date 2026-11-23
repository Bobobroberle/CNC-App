import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    // A fake camera for the camera card.
    launchOptions: {
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
  },
  projects: [
    {
      name: 'tablet',
      testIgnore: /ipad\.spec\.ts/,
      use: { ...devices['Galaxy Tab S4 landscape'], browserName: 'chromium' },
    },
    { name: 'desktop', testIgnore: /ipad\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    // The iPad Air (11", 1180 × 820 pt lying down) with a focused set of touch
    // tests. Chromium with touch emulation, not WebKit: CI and the development
    // machines install Chromium only, and real multi-touch is sent through the
    // DevTools protocol, which only Chromium has.
    {
      name: 'ipad',
      testMatch: /ipad\.spec\.ts/,
      use: {
        ...devices['iPad Pro 11 landscape'],
        browserName: 'chromium',
        viewport: { width: 1180, height: 820 },
      },
    },
  ],
  webServer: {
    command: 'pnpm build && pnpm preview --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
