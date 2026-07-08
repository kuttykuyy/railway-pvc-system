import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
  test: {
    environment: 'node',
    // Only run our unit tests (pure logic); ignore build/app/e2e trees.
    include: ['lib/**/*.test.ts', 'try-bill/lib/**/*.test.ts'],
    globals: false,
  },
});
