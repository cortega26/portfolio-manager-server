import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    css: true,
    fileParallelism: false,
    maxWorkers: '50%',
    minWorkers: 1,
    poolOptions: {
      threads: {
        execArgv: ['--max-old-space-size=4096'],
      },
    },
    include: ['src/__tests__/**/*.{test,spec}.{ts,tsx}', 'src/__smoke__/**/*.test.tsx'],
    exclude: ['src/__tests__/**/*.test.jsx', 'src/__tests__/**/*.spec.jsx', 'server/**'],
    testTimeout: 10000,
    hookTimeout: 10000,
    clearMocks: true,
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
    coverage: {
      provider: 'v8',
      enabled: false,
      reporter: ['text-summary', 'lcov'],
      include: ['src/**/*.{js,jsx,ts,tsx}'],
      exclude: ['src/main.*', 'src/vite-env.d.ts'],
    },
  },
});
