import { defineConfig } from 'vitest/config'
import path from 'node:path'
/**
 * Test infrastructure (audit: "No test files found — Project-wide, no
 * unit/integration/e2e tests"). `vitest` was already a dependency with a
 * `test` script in package.json, but no config and zero test files
 * existed — this is that missing setup.
 *
 * Scope: unit tests for pure, dependency-free logic (scoring, CSV
 * formatting, permission checks) that need no database or Next.js
 * runtime. Testing the ~30 Prisma-backed services properly would need a
 * real test-database strategy (a Neon branch, testcontainers, or
 * similar) — deliberately out of scope for this initial setup so as not
 * to ship tests that either hit production data or are silently
 * skipped/mocked into meaninglessness.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      'server-only': path.resolve(import.meta.dirname, './vitest.mocks.ts'),
    },
  },
})
