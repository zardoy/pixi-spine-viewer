import { readSpineExportVersionString } from './spineRuntime'

/** Legacy Spine 4.2 viewer deployment (this app is 4.3-only). */
export const SPINE_42_VIEWER_URL = 'https://pixi-spine-viewer-42.vercel.app'

export function isSpine42Export(exportVersion: string | null): boolean {
  return exportVersion != null && exportVersion.startsWith('4.2')
}

/** Skip redirect when already on the 4.2 viewer host. */
export function shouldRedirectToSpine42Viewer(): boolean {
  const host = window.location.hostname
  return !host.includes('pixi-spine-viewer-42')
}

/** Build a URL on the legacy 4.2 viewer with the same spine URL query params. */
export function buildSpine42ViewerUrlFromSpineUrls(
  jsonUrl: string,
  atlasUrl: string,
  pngUrls: string[] = [],
): string {
  const params = new URLSearchParams()
  params.set('jsonUrl', jsonUrl)
  params.set('atlasUrl', atlasUrl)
  pngUrls.forEach((url, index) => {
    params.set(index === 0 ? 'pngUrl' : `pngUrl${index + 1}`, url)
  })
  return `${SPINE_42_VIEWER_URL}?${params.toString()}`
}

/**
 * Redirect to the legacy 4.2 viewer. Preserves URL query params when present
 * (jsonUrl/atlasUrl/pngUrl loads work across deployments).
 */
export function redirectToSpine42Viewer(exportVersion?: string | null): never {
  const params = window.location.search
  const target = params
    ? `${SPINE_42_VIEWER_URL}${window.location.pathname}${params}`
    : SPINE_42_VIEWER_URL
  const label = exportVersion ? `Spine ${exportVersion}` : 'Spine 4.2'
  console.info(`[Spine] ${label} asset — redirecting to ${target}`)
  window.location.replace(target)
  throw new Error('Redirecting to Spine 4.2 viewer')
}

export function assertSpine43OrRedirect(
  input: string | Record<string, unknown> | ArrayBuffer | Uint8Array,
): void {
  if (!shouldRedirectToSpine42Viewer()) return
  const exportVersion = readSpineExportVersionString(input)
  if (isSpine42Export(exportVersion)) {
    redirectToSpine42Viewer(exportVersion)
  }
}

/** Check dropped/selected files; redirect to 4.2 viewer when needed. Returns true if redirecting. */
export async function checkSpineFilesAndRedirect(files: { jsonFile: File }): Promise<boolean> {
  if (!shouldRedirectToSpine42Viewer()) return false
  const isSkel = files.jsonFile.name.toLowerCase().endsWith('.skel')
  const data = isSkel ? await files.jsonFile.arrayBuffer() : await files.jsonFile.text()
  const exportVersion = readSpineExportVersionString(data)
  if (isSpine42Export(exportVersion)) {
    redirectToSpine42Viewer(exportVersion)
    return true
  }
  return false
}
