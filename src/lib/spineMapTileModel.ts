/**
 * External store so {@link SpineMapTilePixi} (under PIXI reconciler) and
 * {@link SpineMapTileChrome} (DOM) share animation/skin indices without mixing reconcilers.
 */

type TileModel = { animIndex: number; skinIndex: number }

/** Stable fallback for `useSyncExternalStore` when a path has no store entry yet. */
export const EMPTY_SPINE_MAP_TILE_SNAPSHOT: TileModel = Object.freeze({
  animIndex: 0,
  skinIndex: 0,
})

const tiles = new Map<string, TileModel>()
const listeners = new Map<string, Set<() => void>>()
const initMarker = new Map<string, string>()

function notify(path: string) {
  listeners.get(path)?.forEach((cb) => {
    cb()
  })
}

export function subscribeSpineMapTile(path: string, cb: () => void) {
  let set = listeners.get(path)
  if (!set) {
    set = new Set()
    listeners.set(path, set)
  }
  set.add(cb)
  return () => {
    set!.delete(cb)
    if (set!.size === 0) listeners.delete(path)
  }
}

export function getSpineMapTileSnapshot(path: string): TileModel {
  return tiles.get(path) ?? EMPTY_SPINE_MAP_TILE_SNAPSHOT
}

export function setSpineMapTileAnimIndex(path: string, updater: (i: number) => number) {
  const prev = getSpineMapTileSnapshot(path)
  const next = updater(prev.animIndex)
  if (next === prev.animIndex) return
  tiles.set(path, { ...prev, animIndex: next })
  notify(path)
}

export function setSpineMapTileSkinIndex(path: string, updater: (i: number) => number) {
  const prev = getSpineMapTileSnapshot(path)
  const next = updater(prev.skinIndex)
  if (next === prev.skinIndex) return
  tiles.set(path, { ...prev, skinIndex: next })
  notify(path)
}

/** Call when skeleton is ready; runs once per unique `marker` per `path`. */
export function initSpineMapTileModel(
  path: string,
  marker: string,
  animIndex: number,
  skinIndex: number,
) {
  if (initMarker.get(path) === marker) return
  initMarker.set(path, marker)
  tiles.set(path, { animIndex, skinIndex })
  notify(path)
}

/** Drop tiles removed from the map (paths not in `validPaths`). */
export function pruneSpineMapTileModels(validPaths: ReadonlySet<string>) {
  for (const path of tiles.keys()) {
    if (!validPaths.has(path)) {
      tiles.delete(path)
      initMarker.delete(path)
      listeners.delete(path)
    }
  }
}

export function clearAllSpineMapTileModels() {
  tiles.clear()
  listeners.clear()
  initMarker.clear()
}
