/** Vite `define` entries for app build metadata (injected at bundle time). */
export function appBuildInfoDefines() {
  return {
    __APP_BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  }
}
