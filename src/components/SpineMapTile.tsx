import { useLayoutEffect, useMemo, useSyncExternalStore } from 'react'
import { useExtend } from '@pixi/react'
import { Container } from 'pixi.js'
import { ChevronLeft, ChevronRight, Loader2, MoreVertical } from 'lucide-react'
import { SpineBase } from '../lib/SpineBase'
import { FileSpineLoader } from '../lib/FileSpineLoader'
import { boundsToContainTransform, computeMaxAnimationBounds } from '../lib/spineUtils'
import { formatSkinDisplayName } from '../lib/spineCompat'
import type { SpineEntry, SpineAction, SpineBoundsData } from '../types/spinesMap'
import {
  EMPTY_SPINE_MAP_TILE_SNAPSHOT,
  initSpineMapTileModel,
  getSpineMapTileSnapshot,
  setSpineMapTileAnimIndex,
  setSpineMapTileSkinIndex,
  subscribeSpineMapTile,
} from '../lib/spineMapTileModel'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@radix-ui/react-dropdown-menu'

const PADDING = 14

/** DOM-safe hook: reads the same external store as {@link SpineMapTilePixi}. */
function useSpineMapTileModel(path: string) {
  return useSyncExternalStore(
    (cb) => subscribeSpineMapTile(path, cb),
    () => getSpineMapTileSnapshot(path),
    () => EMPTY_SPINE_MAP_TILE_SNAPSHOT,
  )
}

// ---------------------------------------------------------------------------
// PIXI subtree only — must be a direct/Application descendant (no DOM, no portals).
// ---------------------------------------------------------------------------

export interface SpineMapTilePixiProps {
  spine: SpineEntry
  loader: FileSpineLoader
  spineKey: string
  tileW: number
  tileH: number
  pixiX: number
  pixiY: number
  boundsFollowAnim: boolean
  /** Optional saved bounds/position for this skeleton (skips bounds recompute). */
  boundsData?: SpineBoundsData
}

export function SpineMapTilePixi({
  spine,
  loader,
  spineKey,
  tileW,
  tileH,
  pixiX,
  pixiY,
  boundsFollowAnim,
  boundsData,
}: SpineMapTilePixiProps) {
  useExtend({ Container })

  const skeletonData = loader.getSkeletonData(spineKey)
  const animationNames = useMemo(
    () => skeletonData?.animations.map((a) => a.name) ?? [],
    [skeletonData],
  )
  const skinNames = useMemo(
    () => skeletonData?.skins.map((s) => s.name) ?? [],
    [skeletonData],
  )

  /** Default animation: explicit defaultAnimation wins, else saved bounds animation. */
  const defaultAnimation = spine.defaultAnimation ?? boundsData?.animation

  useLayoutEffect(() => {
    if (!skeletonData) return
    let ai = 0
    if (defaultAnimation) {
      const i = animationNames.indexOf(defaultAnimation)
      if (i >= 0) ai = i
    }
    let si = 0
    if (spine.defaultSkin) {
      const i = skinNames.indexOf(spine.defaultSkin)
      if (i >= 0) si = i
    }
    const marker = `${spineKey}|${defaultAnimation ?? ''}|${spine.defaultSkin ?? ''}`
    initSpineMapTileModel(spine.path, marker, ai, si)
  }, [
    skeletonData,
    spine.path,
    spineKey,
    defaultAnimation,
    spine.defaultSkin,
    animationNames,
    skinNames,
  ])

  const { animIndex, skinIndex } = useSpineMapTileModel(spine.path)

  const firstAnimName = animationNames[0] ?? ''
  const refBoundsAnim = useMemo(() => {
    if (!skeletonData || !firstAnimName) return ''
    if (spine.boundsAnimation) {
      const f = skeletonData.findAnimation(spine.boundsAnimation)
      if (f) return f.name
    }
    if (boundsData?.animation) {
      const f = skeletonData.findAnimation(boundsData.animation)
      if (f) return f.name
    }
    return firstAnimName
  }, [skeletonData, spine.boundsAnimation, boundsData?.animation, firstAnimName])

  const selectedAnimName = animationNames[animIndex] ?? firstAnimName
  const selectedSkinName = skinNames[skinIndex] ?? ''

  // Position data passed → fit using the saved AABB. Otherwise fit by animation.
  let transform = { x: tileW / 2, y: tileH / 2, scale: 0.5 }
  const savedAabb = boundsData?.aabb
  if (!boundsFollowAnim && savedAabb && savedAabb.width > 0 && savedAabb.height > 0) {
    transform = boundsToContainTransform(savedAabb, tileW, tileH, PADDING)
  } else {
    const boundsAnim = boundsFollowAnim ? selectedAnimName : refBoundsAnim
    if (skeletonData && boundsAnim) {
      const b = computeMaxAnimationBounds(skeletonData, boundsAnim)
      if (b) transform = boundsToContainTransform(b, tileW, tileH, PADDING)
    }
  }

  return (
    <pixiContainer x={pixiX} y={pixiY}>
      <SpineBase
        spine={spineKey}
        spineLoader={loader}
        animation={selectedAnimName}
        skin={skinNames.length > 0 ? selectedSkinName : undefined}
        loop
        playing
        scale={{ x: transform.scale, y: transform.scale }}
        x={transform.x}
        y={transform.y}
        scaleAnimationDuration={0}
      />
    </pixiContainer>
  )
}

// ---------------------------------------------------------------------------
// DOM chrome — sibling of Application, not under PIXI reconciler.
// ---------------------------------------------------------------------------

export interface SpineMapTileChromeProps {
  spine: SpineEntry
  loader: FileSpineLoader
  spineKey: string
  tileW: number
  tileH: number
  left: number
  top: number
  onOpenViewer: (e: React.MouseEvent) => void
  viewerLoading: boolean
  onActionClick: (actionName: string, action: SpineAction, e: React.MouseEvent) => void
}

/**
 * DOM chrome overlaid on top of the (tileW × tileH) preview area. The middle is
 * transparent/click-through so the PIXI spine shows; only the top title bar and
 * bottom control bar capture pointer events.
 */
export function SpineMapTileChrome({
  spine,
  loader,
  spineKey,
  tileW,
  tileH,
  left,
  top,
  onOpenViewer,
  viewerLoading,
  onActionClick,
}: SpineMapTileChromeProps) {
  const skeletonData = loader.getSkeletonData(spineKey)
  const animationNames = useMemo(
    () => skeletonData?.animations.map((a) => a.name) ?? [],
    [skeletonData],
  )
  const skinNames = useMemo(
    () => skeletonData?.skins.map((s) => s.name) ?? [],
    [skeletonData],
  )

  const { animIndex, skinIndex } = useSpineMapTileModel(spine.path)
  const selectedAnimName = animationNames[animIndex] ?? (animationNames[0] ?? '')
  const selectedSkinName = skinNames[skinIndex] ?? ''

  return (
    <div
      className="pointer-events-none flex flex-col justify-between rounded-md border border-border/50"
      style={{
        position: 'absolute',
        left,
        top,
        width: tileW,
        height: tileH,
        boxSizing: 'border-box',
      }}
    >
      {/* Top title bar */}
      <div
        className="pointer-events-auto flex items-start justify-between gap-1 rounded-t-md border-b border-border/40 bg-card/80 px-2 py-1.5 backdrop-blur-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-sm leading-tight">{spine.name}</div>
          <div className="truncate font-mono text-[10px] text-muted-foreground">{spine.path}</div>
        </div>
        {spine.actions && Object.keys(spine.actions).length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" type="button">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="z-[100] min-w-[200px] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
            >
              {Object.entries(spine.actions).map(([actionName, action]) => (
                <DropdownMenuItem
                  key={actionName}
                  className="cursor-pointer rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                  onClick={(e) => onActionClick(actionName, action as SpineAction, e)}
                >
                  {actionName}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Bottom control bar */}
      <div
        className="pointer-events-auto flex flex-col gap-1 rounded-b-md border-t border-border/40 bg-card/80 px-2 py-1.5 backdrop-blur-sm"
        onClick={(e) => e.stopPropagation()}
      >
        {animationNames.length > 1 ? (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-7 shrink-0"
              aria-label="Previous animation"
              onClick={() =>
                setSpineMapTileAnimIndex(
                  spine.path,
                  (i) => (i - 1 + animationNames.length) % animationNames.length,
                )
              }
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <span className="min-w-0 flex-1 truncate text-center text-xs text-muted-foreground">
              {selectedAnimName}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-7 shrink-0"
              aria-label="Next animation"
              onClick={() =>
                setSpineMapTileAnimIndex(spine.path, (i) => (i + 1) % animationNames.length)
              }
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <div className="text-center text-xs text-muted-foreground">{selectedAnimName}</div>
        )}

        {skinNames.length > 1 && (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-7 shrink-0"
              aria-label="Previous skin"
              onClick={() =>
                setSpineMapTileSkinIndex(
                  spine.path,
                  (i) => (i - 1 + skinNames.length) % skinNames.length,
                )
              }
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <span className="min-w-0 flex-1 truncate text-center text-xs text-muted-foreground">
              {formatSkinDisplayName(selectedSkinName)}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-7 shrink-0"
              aria-label="Next skin"
              onClick={() => setSpineMapTileSkinIndex(spine.path, (i) => (i + 1) % skinNames.length)}
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        )}

        <Button
          type="button"
          className="h-8 w-full text-xs"
          variant="outline"
          disabled={viewerLoading}
          onClick={onOpenViewer}
        >
          {viewerLoading ? (
            <>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              Loading…
            </>
          ) : (
            'View Spine'
          )}
        </Button>
      </div>
    </div>
  )
}

/** Loading / error overlay covering the full (tileW × tileH) tile. */
export function SpineMapTilePlaceholder({
  spine,
  left,
  top,
  tileW,
  tileH,
  status,
}: {
  spine: SpineEntry
  left: number
  top: number
  tileW: number
  tileH: number
  status: 'loading' | { error: string }
}) {
  return (
    <div
      className="pointer-events-auto flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border/50 bg-muted/40 px-2 py-2 text-center"
      style={{
        position: 'absolute',
        left,
        top,
        width: tileW,
        height: tileH,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="font-semibold text-sm">{spine.name}</div>
      {status === 'loading' ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <p className="text-xs text-destructive">{status.error}</p>
      )}
    </div>
  )
}
