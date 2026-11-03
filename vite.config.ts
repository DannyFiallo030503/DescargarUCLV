import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

function offlineShell(): Plugin {
  return {
    name: 'descargar-uclv-offline-shell',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = ['index.html', ...Object.keys(bundle).filter((name) => name.startsWith('assets/'))]
      files.push('manifest.webmanifest', 'favicon.svg', 'pwa-192.svg', 'pwa-512.svg')
      const urls = files.map((file) => `/${file}`)
      const cacheKey = urls.filter((file) => file.startsWith('/assets/')).join('|')
      const source = `const CACHE = ${JSON.stringify(`descargar-uclv-shell-${cacheKey}`)};\nconst FILES = ${JSON.stringify(urls)};\nself.addEventListener('install', (event) => { event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting())); });\nself.addEventListener('activate', (event) => { event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('descargar-uclv-shell-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())); });\nself.addEventListener('fetch', (event) => { const request = event.request; const url = new URL(request.url); if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return; if (request.mode === 'navigate') { event.respondWith(fetch(request).catch(() => caches.match('/index.html'))); return; } if (url.pathname.startsWith('/assets/') || url.pathname === '/manifest.webmanifest' || url.pathname.endsWith('.svg')) { event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => { if (response.ok) { const copy = response.clone(); void caches.open(CACHE).then((cache) => cache.put(request, copy)); } return response; }))); } });\n`
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [
    react(),
    offlineShell(),
  ],
  server: {
    host: '127.0.0.1',
    proxy: { '/api': 'http://127.0.0.1:4179' },
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts', 'server/**/*.test.mjs'],
    exclude: ['**/*.stress.test.ts'],
  },
})
