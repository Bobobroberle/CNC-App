import { defineConfig } from 'vitest/config';
export default defineConfig({
  root: '/tmp/claude-0/-home-user-CNC-App/1ce98923-8f91-56af-9afb-756f81efa0a2/scratchpad/skripte-sicherheit',
  server: { fs: { strict: false } },
  test: { include: ['*.test.ts'], globals: true, environment: 'node' },
});
