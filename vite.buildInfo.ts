import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

export function readAppPackageVersion(rootDir = projectRoot): string {
  return JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8')).version as string
}

/** Vite `define` entries for app build metadata (injected at bundle time). */
export function appBuildInfoDefines(rootDir = projectRoot) {
  return {
    __APP_VERSION__: JSON.stringify(readAppPackageVersion(rootDir)),
    __APP_BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  }
}
