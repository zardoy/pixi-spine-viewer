import { AttachmentTimeline } from '@esotericsoftware/spine-core'

import type { AnySkeletonData } from '../runtime/spineRuntime'

/**
 * Spine's own mixing only blends numeric timelines (bones, colour, alpha). Attachment timelines —
 * the frame-by-frame sprite swaps most 2D game art is built from — switch discretely, so a mix
 * between two such animations pops no matter how long it is. A crossfade blends the *rendered*
 * result instead: the outgoing pose keeps playing on a ghost spine while the incoming one fades in.
 *
 *  - `over`     incoming fades in on top of the outgoing pose at full alpha. No brightness dip,
 *               so it is the right default for opaque art.
 *  - `dissolve` outgoing fades out while incoming fades in (classic cross-dissolve; dips when
 *               both are translucent).
 */
export type CrossfadeMode = 'over' | 'dissolve'

/**
 * When a switch gets a crossfade:
 *  - `auto`   only when the outgoing or incoming animation drives attachments (what Spine can't mix)
 *  - `always` every switch (use to compare against, or to override, plain mixing)
 */
export type CrossfadeTrigger = 'auto' | 'always'

export type CrossfadeOptions = {
	/** Seconds. `<= 0` disables the crossfade. */
	duration: number
	mode?: CrossfadeMode
	trigger?: CrossfadeTrigger
	/** Restrict to switches leaving / entering these animations (any match). Omit for no filter. */
	only?: { from?: readonly string[]; to?: readonly string[] }
}

export const DEFAULT_CROSSFADE_MODE: CrossfadeMode = 'over'
export const DEFAULT_CROSSFADE_TRIGGER: CrossfadeTrigger = 'auto'

/** `true` when the animation keys any slot's attachment — i.e. Spine cannot blend it smoothly. */
export function animationDrivesAttachments(data: AnySkeletonData, name: string | null | undefined): boolean {
	if (!name) return false
	const animation = data.findAnimation(name)
	if (!animation) return false
	return animation.timelines.some((timeline) => timeline instanceof AttachmentTimeline)
}

export type CrossfadeDecisionInput = {
	options: CrossfadeOptions | null | undefined
	data: AnySkeletonData
	from: string | null | undefined
	to: string
}

export function shouldCrossfade({ options, data, from, to }: CrossfadeDecisionInput): boolean {
	if (!options || !(options.duration > 0)) return false
	// Nothing playing yet — there is no outgoing pose to fade from.
	if (!from) return false

	const { only } = options
	if (only?.from && !only.from.includes(from)) return false
	if (only?.to && !only.to.includes(to)) return false

	const trigger = options.trigger ?? DEFAULT_CROSSFADE_TRIGGER
	if (trigger === 'always') return true
	// Re-running the same clip has no outgoing/incoming difference worth fading under `auto`.
	if (from === to) return false
	return animationDrivesAttachments(data, from) || animationDrivesAttachments(data, to)
}

export type CrossfadeAlphas = { outgoing: number; incoming: number }

const easeInOut = (t: number) => t * t * (3 - 2 * t)

/** Alphas for the ghost (outgoing) and the real spine (incoming) at `progress` in [0, 1]. */
export function crossfadeAlphas(progress: number, mode: CrossfadeMode): CrossfadeAlphas {
	const p = easeInOut(Math.min(1, Math.max(0, progress)))
	return mode === 'dissolve' ? { outgoing: 1 - p, incoming: p } : { outgoing: 1, incoming: p }
}

/** Frame-driven clock for one crossfade; independent of Pixi so it can be unit-tested. */
export class CrossfadeClock {
	private elapsed = 0

	constructor(
		readonly duration: number,
		readonly mode: CrossfadeMode = DEFAULT_CROSSFADE_MODE,
	) {}

	/** Advance by `deltaSeconds`; returns the new alphas and whether the fade is complete. */
	step(deltaSeconds: number): CrossfadeAlphas & { done: boolean } {
		this.elapsed += Math.max(0, deltaSeconds)
		const progress = this.duration > 0 ? this.elapsed / this.duration : 1
		return { ...crossfadeAlphas(progress, this.mode), done: progress >= 1 }
	}
}
