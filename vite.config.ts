/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Served from https://beitz.github.io/ToFoo/
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  base: '/ToFoo/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'ToFoo',
        short_name: 'ToFoo',
        description: 'Personal nutrition tracker that models your body stores.',
        lang: 'en',
        start_url: '/ToFoo/',
        scope: '/ToFoo/',
        display: 'standalone',
        // Chrome on Android paints the system navigation bar of the installed app in this colour, and the
        // manifest cannot switch it for dark mode (the theme-color meta tags can, but they only tint the
        // status bar). Dark surface colour, matching the tab bar in dark mode, the owner's setting.
        background_color: '#1b221e',
        theme_color: '#2f6f4e',
        // Long-press the app icon (docs/SPEC.md, "Faster repeat logging"). Hash routes, like the rest of the app.
        shortcuts: [
          { name: 'Log meal', short_name: 'Log meal', url: '/ToFoo/#/log', icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Start fast', short_name: 'Start fast', url: '/ToFoo/#/fast', icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Write in journal', short_name: 'Journal', url: '/ToFoo/#/journal/new', icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }] },
          // One shortcut both ways ("Going to sleep" or "I'm up"), to stay within the four Android shows.
          { name: 'Sleep or wake up', short_name: 'Sleep', url: '/ToFoo/#/sleep', icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }] },
        ],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The bundled BLS data (~3 MB) must be available offline.
        globPatterns: ['**/*.{js,css,html,svg,png,json,woff2}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'model/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
