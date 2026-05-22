import type { SpineEntry } from '../types/spinesMap'

/** Ordered PNG URLs from a map entry (png, png2, …). */
export function getSortedPngUrlsFromEntry(spine: SpineEntry): string[] {
  const pngKeys = Object.keys(spine)
    .filter((k) => k.startsWith('png') && typeof spine[k] === 'string')
    .sort((a, b) => {
      const numA = a === 'png' ? 0 : parseInt(a.replace('png', ''), 10) || 0
      const numB = b === 'png' ? 0 : parseInt(b.replace('png', ''), 10) || 0
      return numA - numB
    })
  return pngKeys.map((k) => spine[k] as string).filter(Boolean)
}

/** Safe unique key for FileSpineLoader / SpineBase inside one Application. */
export function spineKeyFromMapPath(path: string): string {
  return `map-${path.replace(/[^a-zA-Z0-9_-]+/g, '_')}`
}
