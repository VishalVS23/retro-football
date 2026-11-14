import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Turns public/icon.svg into all the PNG icon sizes phones need.
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, padding: 0.1, resizeOptions: { background: '#14202b' } },
    apple: { ...minimal2023Preset.apple, padding: 0.1, resizeOptions: { background: '#14202b' } },
  },
  images: ['public/icon.svg'],
});
