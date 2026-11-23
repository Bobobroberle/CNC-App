import { defineConfig, devices } from '/tmp/claude-0/-home-user-CNC-App/1ce98923-8f91-56af-9afb-756f81efa0a2/scratchpad/src/cnc-steuerung/apps/control/node_modules/@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: /ui\.spec\.ts/,
  timeout: 30000,
  use: { baseURL: 'http://localhost:4173' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
  ],
  webServer: { command: '/tmp/claude-0/-home-user-CNC-App/1ce98923-8f91-56af-9afb-756f81efa0a2/scratchpad/src/cnc-steuerung/apps/control/node_modules/.bin/vite preview --strictPort --port 4173', cwd: '/tmp/claude-0/-home-user-CNC-App/1ce98923-8f91-56af-9afb-756f81efa0a2/scratchpad/src/cnc-steuerung/apps/control', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 60000 },
});
