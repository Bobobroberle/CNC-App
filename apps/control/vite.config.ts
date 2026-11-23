import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The build is a single self-contained index.html: it runs from file://, from
// any static server and later from the companion computer. A plain http page
// is required because browsers block ws:// connections from https pages.
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  base: './',
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  test: {
    include: ['test/**/*.test.ts'],
    coverage: { provider: 'v8', include: ['src/lib/**/*.ts', 'src/i18n/**/*.ts'] },
  },
});
