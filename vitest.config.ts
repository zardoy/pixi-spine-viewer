import path from 'path'
import { defineConfig } from 'vitest/config'
import { spineRuntimeVersionDefines } from './vite.spineVersions'

export default defineConfig({
  define: spineRuntimeVersionDefines(),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Must precede the bare "pixi-svelte" entry — see vite.config.ts for why.
      'pixi-svelte/src': path.resolve(__dirname, './src/vendor/pixi-svelte/src'),
      'pixi-svelte': path.resolve(__dirname, './src/vendor/pixi-svelte/index.ts'),
      'spine-svelte': path.resolve(__dirname, './src/vendor/spine-svelte/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
