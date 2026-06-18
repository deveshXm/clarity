import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// Scenario tests drive the real coaching agent (live LLM calls), so they need
// generous timeouts and must run serially to keep the LangWatch trace timeline
// readable.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ['scenarios/**/*.test.ts'],
    setupFiles: ['scenarios/setup.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
