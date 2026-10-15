import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',
    // The integration test shares one SQLite file + an in-process session
    // manager, so run test files serially to avoid cross-file contention.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/session/**', 'src/util/**'],
    },
  },
  resolve: {
    alias: {
      '@livevote/shared': new URL('../shared/src/index.ts', import.meta.url)
        .pathname,
    },
  },
});
