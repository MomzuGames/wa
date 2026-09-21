import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Production builds are served from GitHub Pages at https://<user>.github.io/wa/.
const BASE = '/wa/';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? BASE : '/',
  plugins: [
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Chōwa',
        short_name: 'Chōwa',
        description: 'A calm, wordless puzzle journey.',
        theme_color: '#0B0B10',
        background_color: '#0B0B10',
        display: 'standalone',
        orientation: 'any',
        start_url: BASE,
        scope: BASE,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Everything the game needs is in the bundle: levels are baked in, fonts are local.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: `${BASE}index.html`,
      },
    }),
  ],
  test: {
    environment: 'node',
  },
}));
