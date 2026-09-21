import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'LUMA',
        short_name: 'LUMA',
        description: 'A calm, wordless puzzle journey.',
        theme_color: '#0B0B10',
        background_color: '#0B0B10',
        display: 'standalone',
        // Real pastel-on-black icons are added in Phase 8 (PWA polish).
        icons: [],
      },
    }),
  ],
  test: {
    environment: 'node',
  },
});
