import { Skeleton, AnimationState, AnimationStateData, Physics } from '@esotericsoftware/spine-core'
import type { SkeletonData } from '@esotericsoftware/spine-core'

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
 * Compute the UNION bounding box of every sampled frame across the full
 * duration of the given animation (or the first animation if none is named).
 *
 * This is the "max AABB" approach used by SkinsAndAnimationBoundsProvider in
 * the official Spine runtime: it steps through the animation at `timeStep`
 * intervals and accumulates the tightest box that fits all positions.
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
  const animState = new AnimationState(new AnimationStateData(skeletonData))

  const anim = animationName
    ? skeletonData.findAnimation(animationName)
    : (skeletonData.animations[0] ?? null)

  // No animation or zero-duration → fall back to first-frame
  if (!anim || anim.duration <= 0) {
    return computeFirstFrameBounds(skeletonData, animationName)
  }

  animState.setAnimationWith(0, anim, false)

  let minX = Infinity,  minY = Infinity
  let maxX = -Infinity, maxY = -Infinity

  const steps = Math.max(Math.ceil(anim.duration / timeStep), 2)

  for (let i = 0; i < steps; i++) {
    const delta = i === 0 ? 0 : timeStep
    animState.update(delta)
    animState.apply(skeleton)
    skeleton.update(delta)
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
