import {
  Skeleton,
  AnimationState,
  AnimationStateData,
  Physics,
  MixBlend,
  MixDirection,
} from '@esotericsoftware/spine-core'
import type { Animation, SkeletonData } from '@esotericsoftware/spine-core'

export interface SpineBounds {
  x: number
  y: number
  width: number
  height: number
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
  skeletonData: SkeletonData,
  animationName?: string,
): SpineBounds | null {
  const skeleton = new Skeleton(skeletonData)
  const animState = new AnimationState(new AnimationStateData(skeletonData))

  const anim = animationName
    ? skeletonData.findAnimation(animationName)
    : (skeletonData.animations[0] ?? null)

  if (anim) {
    animState.setAnimationWith(0, anim, false)
    animState.update(0)
    animState.apply(skeleton)
  } else {
    skeleton.setToSetupPose()
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
  skeletonData: SkeletonData,
  animationName?: string,
  timeStep = 0.05,
): SpineBounds | null {
  const skeleton = new Skeleton(skeletonData)

  const anim = animationName
    ? skeletonData.findAnimation(animationName)
    : (skeletonData.animations[0] ?? null)

  // No animation or zero-duration → fall back to first-frame
  if (!anim || anim.duration <= 0) {
    return computeFirstFrameBounds(skeletonData, animationName)
  }

  let minX = Infinity, minY = Infinity
  let maxX = -Infinity, maxY = -Infinity

  const sampleTimes = collectMaxAnimationSampleTimes(anim, timeStep)

  for (const t of sampleTimes) {
    skeleton.setToSetupPose()
    anim.apply(skeleton, t, t, false, [], 1, MixBlend.setup, MixDirection.mixIn)
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
