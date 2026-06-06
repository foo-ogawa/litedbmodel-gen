import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    exclude: ['test/bundle/**', '**/node_modules/**'],
  },
});
