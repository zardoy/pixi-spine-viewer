import type { SpineEntry, SpineBoundsData } from '../types/spinesMap'

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

/**
 * Resolve saved bounds data for an entry. The `bounds` map is keyed by the
 * skeleton's name; we try the skeleton name first, then the entry name, then
 * fall back to the sole entry when there is exactly one.
 */
export function resolveSpineBoundsData(
  spine: SpineEntry,
  skeletonName?: string | null,
): SpineBoundsData | undefined {
  const map = spine.bounds
  if (!map) return undefined
  if (skeletonName && map[skeletonName]) return map[skeletonName]
  if (map[spine.name]) return map[spine.name]
  const keys = Object.keys(map)
  if (keys.length === 1) return map[keys[0]]
  return undefined
}
