import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// Unit tests: no network, no LLM, no database, no credentials. They must stay
// that way — this is the suite that can run on every commit and in CI without
// costing money or needing a .env.local, which is what makes it a usable
// regression net. Anything needing a live model belongs in the eval suites;
// anything needing a running server belongs in the integration scripts.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    environment: 'node',
    testTimeout: 10_000,
  },
});
