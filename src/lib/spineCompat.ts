/**
 * Spine 4.3 helpers for pixi-spine-viewer.
 */
import { MixFrom, Physics } from '@esotericsoftware/spine-core'
import type { AnySpine } from './spineRuntime'

/** Resolve a skin name from skeleton data, falling back to default / first skin. */
export function resolveSkinName(
  skeletonData: { skins?: { name: string }[]; defaultSkin?: { name: string } | null },
  preferred?: string | null,
): string | null {
  const names = skeletonData.skins?.map((s) => s.name) ?? []
  if (preferred && names.includes(preferred)) return preferred
  if (names.includes('default')) return 'default'
  return skeletonData.defaultSkin?.name ?? names[0] ?? null
}

/** Set skin, reset slot setup bindings, and re-apply animation state. */
export function skeletonApplySkin(spine: AnySpine, skinData: unknown): void {
  spine.skeleton.setSkin(skinData as never)
  spine.skeleton.setupPoseSlots()
  spine.state.apply(spine.skeleton)
  spine.skeleton.updateWorldTransform(Physics.update)
}

export function skeletonSetupPose(skeleton: { setupPose(): void }): void {
  skeleton.setupPose()
}

export function skeletonSetupPoseSlots(skeleton: { setupPoseSlots(): void }): void {
  skeleton.setupPoseSlots()
}

/** Apply a single animation time from setup pose (bounds sampling). */
export function applyAnimationAtTime(
  skeleton: unknown,
  anim: {
    apply(
      skeleton: unknown,
      lastTime: number,
      time: number,
      loop: boolean,
      events: null,
      alpha: number,
      from: number,
      add: boolean,
      out: boolean,
      appliedPose: boolean,
    ): void
  },
  time: number,
): void {
  anim.apply(skeleton, 0, time, false, null, 1, MixFrom.setup, false, false, false)
}

/** Set track animation from an Animation object (not a name string). */
export function setAnimationObject(
  animState: { setAnimation(trackIndex: number, animation: unknown, loop?: boolean): unknown },
  trackIndex: number,
  animation: unknown,
  loop: boolean,
): unknown {
  return animState.setAnimation(trackIndex, animation, loop)
}
