import {
  AnimationState,
  AnimationStateData,
  Physics,
  Skeleton,
} from '@esotericsoftware/spine-core'
import type { Animation } from '@esotericsoftware/spine-core'
import type { AnySkeletonData } from './spineRuntime'
import {
  applyAnimationAtTime,
  setAnimationObject,
  skeletonSetupPose,
  skeletonSetupPoseSlots,
} from './spineCompat'

export interface SpineBounds {
  x: number
  y: number
  width: number
  height: number
}

/** Assumed playback rate for screenshot frame picker (frame index ↔ time). */
export const SCREENSHOT_FPS = 30

/** Segment delimiter — single `_` is ambiguous when base/anim/skin contain underscores. */
export const SPINE_SCREENSHOT_FILENAME_SEGMENT_SEP = '__'

/**
 * Fixed screenshot export filename pattern. All placeholders are always emitted;
 * use sentinel values (e.g. skin `default`, anim `none`) when not applicable.
 * Segments are joined with {@link SPINE_SCREENSHOT_FILENAME_SEGMENT_SEP}.
 */
export const SPINE_SCREENSHOT_FILENAME_TEMPLATE =
  '$base__$anim__$skin__$mode__$frame__$scale__$size__$hash__$date.png'

const SPINE_SCREENSHOT_SEGMENT_COUNT = 9

export type SpineScreenshotBoundsModeTag = 'ff' | 'fa' | 'aa'

export interface SpineScreenshotFilenameFields {
  base: string
  anim: string
  skin: string
  mode: SpineScreenshotBoundsModeTag
  frame: number
  scale: number
  width: number
  height: number
  hash: string
  date?: string
}

export function boundsModeToTag(
  mode: 'first-frame' | 'full-animation' | 'all-animations',
): SpineScreenshotBoundsModeTag {
  return mode === 'first-frame' ? 'ff' : mode === 'full-animation' ? 'fa' : 'aa'
}

export function formatScreenshotFrame(frameIndex: number): string {
  return `f${String(Math.max(0, Math.round(frameIndex))).padStart(4, '0')}`
}

export function formatScreenshotScale(scale: number): string {
  return scale === Math.floor(scale) ? `${scale}x` : `${scale.toFixed(2)}x`
}

export function frameIndexToTime(frameIndex: number, fps = SCREENSHOT_FPS): number {
  return Math.max(0, frameIndex) / fps
}

export function timeToFrameIndex(time: number, fps = SCREENSHOT_FPS): number {
  return Math.max(0, Math.round(time * fps))
}

export function getAnimationDuration(
  skeletonData: AnySkeletonData,
  animationName?: string,
): number {
  const anim = animationName
    ? skeletonData.findAnimation(animationName)
    : (skeletonData.animations[0] ?? null)
  return anim?.duration ?? 0
}

export function getMaxScreenshotFrameIndex(
  skeletonData: AnySkeletonData,
  animationName?: string,
  fps = SCREENSHOT_FPS,
): number {
  const duration = getAnimationDuration(skeletonData, animationName)
  return Math.max(0, Math.round(duration * fps))
}

export function frameIndexToAnimationProgress(
  frameIndex: number,
  duration: number,
  fps = SCREENSHOT_FPS,
): number {
  if (duration <= 0) return 0
  const time = Math.min(frameIndexToTime(frameIndex, fps), duration)
  return Math.min(1, time / duration)
}

function sanitizeScreenshotFilenamePart(value: string): string {
  return value
    .replace(/[/\\?%*:|"<>$]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/__+/g, '_')
    || 'none'
}

function isBoundsModeTag(value: string): value is SpineScreenshotBoundsModeTag {
  return value === 'ff' || value === 'fa' || value === 'aa'
}

function parseScreenshotFrameSegment(segment: string): number | null {
  const match = segment.match(/^f(\d+)$/)
  return match ? Number(match[1]) : null
}

function parseScreenshotScaleSegment(segment: string): number | null {
  const match = segment.match(/^(\d+(?:\.\d+)?)x$/)
  return match ? Number(match[1]) : null
}

function parseScreenshotSizeSegment(segment: string): { width: number; height: number } | null {
  const match = segment.match(/^(\d+)x(\d+)$/)
  return match ? { width: Number(match[1]), height: Number(match[2]) } : null
}

/** Build export filename from {@link SPINE_SCREENSHOT_FILENAME_TEMPLATE} placeholders (no `$` in output). */
/** Stable key for auto-capture dedupe (excludes frame — frame scrub must not re-download). */
export function buildScreenshotAutoCaptureSignature(
  boundsMode: string,
  selectedAnim: string,
  selectedSkin: string,
  outputScale: number,
  activeBounds: SpineBounds | null,
): string {
  return JSON.stringify({
    boundsMode,
    selectedAnim,
    selectedSkin,
    outputScale,
    bounds: activeBounds
      ? {
          x: Math.round(activeBounds.x * 100) / 100,
          y: Math.round(activeBounds.y * 100) / 100,
          w: Math.round(activeBounds.width),
          h: Math.round(activeBounds.height),
        }
      : null,
  })
}

export function buildSpineScreenshotFilename(fields: SpineScreenshotFilenameFields): string {
  const date = fields.date ?? new Date().toISOString().slice(0, 10)
  const parts = [
    sanitizeScreenshotFilenamePart(fields.base),
    sanitizeScreenshotFilenamePart(fields.anim),
    sanitizeScreenshotFilenamePart(fields.skin),
    fields.mode,
    formatScreenshotFrame(fields.frame),
    formatScreenshotScale(fields.scale),
    `${Math.max(0, Math.round(fields.width))}x${Math.max(0, Math.round(fields.height))}`,
    sanitizeScreenshotFilenamePart(fields.hash),
    date,
  ]
  return `${parts.join(SPINE_SCREENSHOT_FILENAME_SEGMENT_SEP)}.png`
}

/** Parse a filename produced by {@link buildSpineScreenshotFilename}. */
export function parseSpineScreenshotFilename(filename: string): SpineScreenshotFilenameFields | null {
  const stem = filename.replace(/\.png$/i, '')
  const segments = stem.split(SPINE_SCREENSHOT_FILENAME_SEGMENT_SEP)
  if (segments.length !== SPINE_SCREENSHOT_SEGMENT_COUNT) return null

  const [base, anim, skin, mode, frameSeg, scaleSeg, sizeSeg, hash, date] = segments
  if (!isBoundsModeTag(mode)) return null

  const frame = parseScreenshotFrameSegment(frameSeg)
  const scale = parseScreenshotScaleSegment(scaleSeg)
  const size = parseScreenshotSizeSegment(sizeSeg)
  if (frame === null || scale === null || size === null) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null

  return {
    base,
    anim,
    skin,
    mode,
    frame,
    scale,
    width: size.width,
    height: size.height,
    hash,
    date,
  }
}

function applySkeletonSkin(
  skeleton: { setSkin(skin: unknown): void },
  skeletonData: AnySkeletonData,
  skinName?: string,
): void {
  if (!skinName) return
  const skin = skeletonData.findSkin(skinName)
  if (skin) {
    skeleton.setSkin(skin)
    skeletonSetupPoseSlots(skeleton as never)
  }
}

/**
 * Compute the bounding box at t=0 (first frame) of the given animation,
 * or the setup pose when no animation is provided.
 *
 * Uses a temporary, isolated skeleton — never touches the live PIXI instance.
 * Returns null when the skeleton has no visible attachments.
 *
 * Why not skeletonData.x / .y / .width / .height?
 *   Those come from the JSON's `skeleton.bounds` block = setup-pose AABB.
 *   When an animation offsets bones at time=0 the numbers can differ
 *   significantly from the actual first-frame visual extent.
 */
export function computeFirstFrameBounds(
  skeletonData: AnySkeletonData,
  animationName?: string,
  skinName?: string,
): SpineBounds | null {
  const skeleton = new Skeleton(skeletonData)
  applySkeletonSkin(skeleton, skeletonData, skinName)
  const animState = new AnimationState(new AnimationStateData(skeletonData as never) as never)

  const anim = animationName
    ? skeletonData.findAnimation(animationName)
    : (skeletonData.animations[0] ?? null)

  if (anim) {
    setAnimationObject(animState, 0, anim, false)
    animState.update(0)
    ;(animState as { apply: (skeleton: unknown) => void }).apply(skeleton)
  } else {
    skeletonSetupPose(skeleton)
  }

  skeleton.update(0)
  skeleton.updateWorldTransform(Physics.update)

  const r = skeleton.getBoundsRect()
  if (r.width === Number.NEGATIVE_INFINITY || r.width <= 0) return null
  return { x: r.x, y: r.y, width: r.width, height: r.height }
}

/**
 * Bounding box for a single pose at `time` seconds on the given animation.
 */
export function computeBoundsAtTime(
  skeletonData: AnySkeletonData,
  animationName: string | undefined,
  time: number,
  skinName?: string,
): SpineBounds | null {
  const skeleton = new Skeleton(skeletonData)
  applySkeletonSkin(skeleton, skeletonData, skinName)

  const anim = animationName
    ? skeletonData.findAnimation(animationName)
    : (skeletonData.animations[0] ?? null)

  if (anim && anim.duration > 0) {
    const t = Math.max(0, Math.min(time, anim.duration))
    skeletonSetupPose(skeleton)
    applySkeletonSkin(skeleton, skeletonData, skinName)
    applyAnimationAtTime(skeleton, anim, t)
  } else {
    skeletonSetupPose(skeleton)
  }

  skeleton.update(0)
  skeleton.updateWorldTransform(Physics.update)

  const r = skeleton.getBoundsRect()
  if (r.width === Number.NEGATIVE_INFINITY || r.width <= 0) return null
  return { x: r.x, y: r.y, width: r.width, height: r.height }
}

/**
 * Build distinct sample times = uniform grid (`timeStep`) ∪ every authored key
 * time on {@link Animation.timelines} (rotate / translate / RGBA / deform /
 * attachments / IK / etc.). Curve peaks can still fall strictly between keys,
 * so the temporal grid stays.
 */
function collectMaxAnimationSampleTimes(anim: Animation, timeStep: number): number[] {
  const duration = anim.duration
  const times = new Set<number>()

  const add = (raw: number) => {
    if (!Number.isFinite(raw)) return
    times.add(Math.max(0, Math.min(raw, duration)))
  }

  add(0)
  add(duration)

  const gridSteps = Math.max(Math.ceil(duration / timeStep), 2)
  for (let i = 1; i < gridSteps; i++) {
    add(Math.min(i * timeStep, duration))
  }

  for (const timeline of anim.timelines) {
    const stride = timeline.getFrameEntries()
    const frames = timeline.frames
    for (let i = 0; i < frames.length; i += stride) {
      add(frames[i])
    }
  }

  return [...times].sort((a, b) => a - b)
}

/**
 * Compute the UNION bounding box across the full duration of the given
 * animation (or the first animation if none is named).
 *
 * Samples at each merged time from {@link collectMaxAnimationSampleTimes}:
 * uniform stepping plus every timeline keyframe time from skeleton data (same
 * sources as Spine JSON like Horse.json → `activation` bone/slot keys).
 *
 * Each pose is evaluated with {@link Animation.apply}(…, t, t, …) from setup
 * pose (matches {@link SpineDisplay.calculateAnimationViewport}).
 *
 * Falls back to `computeFirstFrameBounds` for zero-duration animations
 * (single-frame / static spines) and when no animation is found.
 */
export function computeMaxAnimationBounds(
  skeletonData: AnySkeletonData,
  animationName?: string,
  timeStep = 0.05,
  skinName?: string,
): SpineBounds | null {
  const skeleton = new Skeleton(skeletonData)
  applySkeletonSkin(skeleton, skeletonData, skinName)

  const anim = animationName
    ? skeletonData.findAnimation(animationName)
    : (skeletonData.animations[0] ?? null)

  // No animation or zero-duration → fall back to first-frame
  if (!anim || anim.duration <= 0) {
    return computeFirstFrameBounds(skeletonData, animationName, skinName)
  }

  let minX = Infinity, minY = Infinity
  let maxX = -Infinity, maxY = -Infinity

  const sampleTimes = collectMaxAnimationSampleTimes(anim as never, timeStep)

  for (const t of sampleTimes) {
    skeletonSetupPose(skeleton)
    applySkeletonSkin(skeleton, skeletonData, skinName)
    applyAnimationAtTime(skeleton, anim, t)
    skeleton.updateWorldTransform(Physics.update)

    const r = skeleton.getBoundsRect()
    if (r.width === Number.NEGATIVE_INFINITY) continue

    minX = Math.min(minX, r.x)
    minY = Math.min(minY, r.y)
    maxX = Math.max(maxX, r.x + r.width)
    maxY = Math.max(maxY, r.y + r.height)
  }

  if (!isFinite(minX)) return null
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * Union of `computeMaxAnimationBounds` across every animation in the skeleton.
 * Produces the tightest AABB that encloses all poses from all animations.
 */
export function computeAllAnimationsBounds(
  skeletonData: AnySkeletonData,
  timeStep = 0.05,
  skinName?: string,
): SpineBounds | null {
  let minX = Infinity, minY = Infinity
  let maxX = -Infinity, maxY = -Infinity

  for (const anim of skeletonData.animations) {
    const b = computeMaxAnimationBounds(skeletonData, anim.name, timeStep, skinName)
    if (!b) continue
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.width)
    maxY = Math.max(maxY, b.y + b.height)
  }

  if (!isFinite(minX)) return null
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * Given a first-frame bounds rect, return the PIXI position and uniform scale
 * that centres the spine's visual AABB inside the given canvas area.
 *
 * `padding` (px, default 12) is subtracted from each side of the available area.
 */
export function boundsToContainTransform(
  bounds: SpineBounds,
  canvasW: number,
  canvasH: number,
  padding = 12,
): { x: number; y: number; scale: number } {
  const availW = canvasW - padding * 2
  const availH = canvasH - padding * 2
  const scale = Math.min(availW / bounds.width, availH / bounds.height)

  // Centre the bounds rect in the canvas
  const boundsCX = bounds.x + bounds.width / 2
  const boundsCY = bounds.y + bounds.height / 2
  return {
    x: canvasW / 2 - boundsCX * scale,
    y: canvasH / 2 - boundsCY * scale,
    scale,
  }
}
