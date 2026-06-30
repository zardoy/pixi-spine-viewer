import path from 'path'
import { defineConfig } from 'vitest/config'
import { spineRuntimeVersionDefines } from './vite.spineVersions'

export default defineConfig({
  define: spineRuntimeVersionDefines(),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
