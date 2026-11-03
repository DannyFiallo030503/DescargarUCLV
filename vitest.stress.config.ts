import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['src/**/*.stress.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    maxWorkers: 1,
    fileParallelism: false,
  },
})
