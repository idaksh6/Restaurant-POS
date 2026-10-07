import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'
import { colorMixFallback } from './vite-plugins/colorMixFallback.ts'

export default defineConfig(({ mode }) => {
  // Web (BrowserRouter): absolute `/` so refresh on /settings/... loads /assets/* correctly.
  // Electron desktop mode (HashRouter + file://): relative `./`.
  const desktop = mode === 'desktop'

  return {
    base: desktop ? './' : '/',
    css: {
      postcss: {
        plugins: [colorMixFallback(fileURLToPath(new URL('./src', import.meta.url)))],
      },
    },
    server: {
      host: true,
      port: 5173,
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'favicon.png', 'apple-touch-icon.png', 'pwa-192.png', 'pwa-512.png', 'pwa-maskable-512.png'],
        manifest: {
          name: 'Isarva Restaurant POS',
          short_name: 'Isarva POS',
          description: 'Saudi restaurant POS — local-first',
          theme_color: '#1f6b5c',
          background_color: '#eef2ef',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            { src: desktop ? 'pwa-192.png' : '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: desktop ? 'pwa-512.png' : '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            {
              src: desktop ? 'pwa-maskable-512.png' : '/pwa-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,svg,woff,woff2,png,webmanifest}'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//, /^\/sync\//, /^\/health/, /^\/assets\//, /^\/downloads\//],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'mesa-google-fonts-css',
                expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'mesa-google-fonts-files',
                expiration: { maxEntries: 16, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
    ],
  }
})
