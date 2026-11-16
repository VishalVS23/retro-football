import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

// Note: run `npm test` from PowerShell. Git Bash uses a lowercase "c:" drive path,
// which makes the test runner load itself twice and crash.

export default defineConfig(({ command }) => ({
  // GitHub Pages serves the game from /retro-football/, local dev from /.
  base: command === 'build' ? '/retro-football/' : '/',
  // Build time stamp, shown in the ⚙ panel so you can tell which version the phone is running.
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
  server: {
    host: true, // lets your phone open the game over Wi-Fi
    port: 5173,
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate', // phones pick up new versions automatically
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        name: 'Retro Football',
        short_name: 'Retro Football',
        description: 'Retro arcade football with deep franchise management.',
        theme_color: '#14202b',
        background_color: '#14202b',
        display: 'fullscreen',
        orientation: 'landscape',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'], // woff2 = the pixel font, so it works offline
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // Phaser is ~1.2 MB
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
  },
}));
