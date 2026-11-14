import { defineConfig } from 'vitest/config';

// Note: run `npm test` from PowerShell. Git Bash uses a lowercase "c:" drive path,
// which makes the test runner load itself twice and crash.

export default defineConfig({
  base: './',
  server: {
    host: true, // lets your phone open the game over Wi-Fi
    port: 5173,
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
