import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Only run our unit tests (pure logic); ignore build/app/e2e trees.
    include: ['lib/**/*.test.ts'],
    globals: false,
  },
});
