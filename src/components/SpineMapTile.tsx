import { useLayoutEffect, useMemo, useSyncExternalStore } from 'react'
import { useExtend } from '@pixi/react'
import { Container } from 'pixi.js'
import { ChevronLeft, ChevronRight, Loader2, MoreVertical } from 'lucide-react'
import { SpineBase } from '../lib/SpineBase'
import { FileSpineLoader } from '../lib/FileSpineLoader'
import { boundsToContainTransform, computeMaxAnimationBounds } from '../lib/spineUtils'
import type { SpineEntry, SpineAction } from '../types/spinesMap'
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
  canvasH: number
  pixiX: number
  pixiY: number
  boundsFollowAnim: boolean
}

export function SpineMapTilePixi({
  spine,
  loader,
  spineKey,
  tileW,
  canvasH,
  pixiX,
  pixiY,
  boundsFollowAnim,
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

  useLayoutEffect(() => {
    if (!skeletonData) return
    let ai = 0
    if (spine.defaultAnimation) {
      const i = animationNames.indexOf(spine.defaultAnimation)
      if (i >= 0) ai = i
    }
    let si = 0
    if (spine.defaultSkin) {
      const i = skinNames.indexOf(spine.defaultSkin)
      if (i >= 0) si = i
    }
    const marker = `${spineKey}|${spine.defaultAnimation ?? ''}|${spine.defaultSkin ?? ''}`
    initSpineMapTileModel(spine.path, marker, ai, si)
  }, [
    skeletonData,
    spine.path,
    spineKey,
    spine.defaultAnimation,
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
    return firstAnimName
  }, [skeletonData, spine.boundsAnimation, firstAnimName])

  const selectedAnimName = animationNames[animIndex] ?? firstAnimName
  const selectedSkinName = skinNames[skinIndex] ?? ''

  const boundsAnim = boundsFollowAnim ? selectedAnimName : refBoundsAnim

  let transform = { x: tileW / 2, y: canvasH / 2, scale: 0.5 }
  if (skeletonData && boundsAnim) {
    const b = computeMaxAnimationBounds(skeletonData, boundsAnim)
    if (b) transform = boundsToContainTransform(b, tileW, canvasH, PADDING)
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
  chromeH: number
  chromeLeft: number
  chromeTop: number
  onOpenViewer: (e: React.MouseEvent) => void
  viewerLoading: boolean
  onActionClick: (actionName: string, action: SpineAction, e: React.MouseEvent) => void
}

export function SpineMapTileChrome({
  spine,
  loader,
  spineKey,
  tileW,
  chromeH,
  chromeLeft,
  chromeTop,
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
      className="pointer-events-auto flex flex-col gap-1 border-b border-border/40 bg-card/95 px-2 py-2 text-left shadow-sm backdrop-blur-sm"
      style={{
        position: 'absolute',
        left: chromeLeft,
        top: chromeTop,
        width: tileW,
        height: chromeH,
        boxSizing: 'border-box',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-1">
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

      {animationNames.length > 1 && (
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
      )}

      {animationNames.length <= 1 && (
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
            {selectedSkinName}
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

      {skinNames.length === 1 && (
        <div className="text-center text-[10px] text-muted-foreground">{selectedSkinName}</div>
      )}

      <Button
        type="button"
        className="mt-auto h-8 w-full text-xs"
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
  )
}

/** Loading / error overlay for full tile (chrome + preview area). */
export function SpineMapTilePlaceholder({
  spine,
  chromeLeft,
  chromeTop,
  tileW,
  tileTotalH,
  status,
}: {
  spine: SpineEntry
  chromeLeft: number
  chromeTop: number
  tileW: number
  tileTotalH: number
  status: 'loading' | { error: string }
}) {
  return (
    <div
      className="pointer-events-auto flex flex-col items-center justify-center gap-2 border border-dashed border-border/50 bg-muted/40 px-2 py-2 text-center"
      style={{
        position: 'absolute',
        left: chromeLeft,
        top: chromeTop,
        width: tileW,
        height: tileTotalH,
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
