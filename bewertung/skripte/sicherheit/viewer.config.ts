import { defineConfig, devices } from '/home/user/CNC-App/apps/control/node_modules/@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: /viewer\.spec\.ts/,
  timeout: 90000,
  use: { baseURL: 'http://localhost:4173' },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: '/home/user/CNC-App/apps/control/node_modules/.bin/vite preview --strictPort --port 4173', cwd: '/home/user/CNC-App/apps/control', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 60000 },
});
