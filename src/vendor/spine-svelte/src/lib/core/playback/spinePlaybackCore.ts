import { Physics } from '@esotericsoftware/spine-core'
import type { AnySpine } from '../runtime/spineRuntime'
import { skeletonSetupPoseSlots } from '../runtime/spineCompat'

/**
 * Run the frame hooks after driving `updateWorldTransform` by hand.
 *
 * Spine's own pipeline calls `afterUpdateWorldTransforms` before batching; manual paths skip it,
 * so without this force-hide never applies and hidden attachments flash for a frame.
 * `_stateChanged` is set so the attachment revalidation below does not no-op after the last
 * render cleared it.
 */
export function spineAfterManualWorldTransform(spine: AnySpine): void {
	;(spine as AnySpine & { afterUpdateWorldTransforms: (spine: unknown) => void })
		.afterUpdateWorldTransforms(spine)
	;(spine as unknown as { _stateChanged: boolean })._stateChanged = true
	spine._validateAndTransformAttachments()
}

/**
 * Apply state with a zero delta and flush to the skeleton, so a change is visible on the very
 * next frame without waiting for the ticker.
 *
 * `resetSlotsToSetup` avoids a one-frame blink where slots still show the previous animation's
 * end state before the incoming animation's own timelines apply at time 0.
 */
export function immediateUpdate(spine: AnySpine, resetSlotsToSetup = false): void {
	if (spine.state.tracks.length === 0) return
	if (resetSlotsToSetup) skeletonSetupPoseSlots(spine.skeleton)
	spine.state.update(0)
	spine.state.apply(spine.skeleton)
	spine.skeleton.update(0)
	spine.skeleton.updateWorldTransform(Physics.update)
	spineAfterManualWorldTransform(spine)
}

/** Seek track 0 to a 0–1 fraction of its animation and render that exact frame. */
export function seekTrackProgress(spine: AnySpine, progress: number, trackIndex = 0): void {
	const track = spine.state.tracks[trackIndex]
	if (!track?.animation) return

	const duration = track.animation.duration
	if (!duration) return

	const time = Math.min(Math.max(progress, 0), 1) * duration
	track.trackTime = time
	immediateUpdate(spine)
}

export type MixTimeRule = {
	animation: string
	direction: 'from' | 'to' | 'both'
	mixTime: number
}

/** Per-animation-pair mix overrides, applied through `AnimationStateData.setMix`. */
export function applyMixTimeRules(spine: AnySpine, rules: readonly MixTimeRule[]): void {
	if (!rules.length) return

	const data = spine.state.data
	const animations = spine.skeleton.data.animations
	if (!animations) return

	const names = animations.map((animation) => animation.name)

	for (const rule of rules) {
		if (!names.includes(rule.animation)) continue
		for (const name of names) {
			if (name === rule.animation) continue
			if (rule.direction === 'from' || rule.direction === 'both') {
				data.setMix(rule.animation, name, rule.mixTime)
			}
			if (rule.direction === 'to' || rule.direction === 'both') {
				data.setMix(name, rule.animation, rule.mixTime)
			}
		}
	}
}
