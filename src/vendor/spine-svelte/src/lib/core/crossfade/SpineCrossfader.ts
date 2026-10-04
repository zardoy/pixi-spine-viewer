import { Physics } from '@esotericsoftware/spine-core'
import { Ticker } from 'pixi.js'

import type { AnySpine } from '../runtime/spineRuntime'
import {
	CrossfadeClock,
	DEFAULT_CROSSFADE_MODE,
	shouldCrossfade,
	type CrossfadeOptions,
} from './crossfadePlan'

type TrackSnapshot = {
	index: number
	animation: string
	loop: boolean
	trackTime: number
	timeScale: number
}

/**
 * Crossfades a spine between two animations by blending the rendered result (see
 * {@link CrossfadeOptions}). Framework-agnostic: wrap whatever call switches the animation in
 * {@link SpineCrossfader.run}.
 *
 * Mechanism: before the switch, a *ghost* spine is built from the same skeleton data (so the atlas
 * textures are shared — no GPU upload) and put into the outgoing pose; the real spine then switches
 * with no mix underneath and fades in while the ghost keeps playing the old animation.
 *
 * Not mirrored onto the ghost: runtime attachment tweaks the host applies per frame to the real
 * spine (force-hide, attachment mix rules). A hidden attachment can therefore show on the ghost
 * for the length of the fade.
 */
export class SpineCrossfader {
	private ghost: AnySpine | null = null
	private tick: ((ticker: Ticker) => void) | null = null
	private baseAlpha = 1

	constructor(private readonly spine: AnySpine) {}

	/** `true` while a fade is in progress. */
	get active(): boolean {
		return this.ghost !== null
	}

	/**
	 * Runs `change` (which switches the animation). When the switch qualifies, `change` receives
	 * `true` and **must not mix** (hard cut) because the crossfade replaces the mix.
	 * Returns whether a crossfade was started.
	 */
	run(
		change: (crossfading: boolean) => void,
		options: CrossfadeOptions | null | undefined,
		to: string,
		trackIndex = 0,
	): boolean {
		const spine = this.spine
		const outgoing = spine.state.tracks[trackIndex]
		const from = outgoing?.animation?.name ?? null

		const crossfade = shouldCrossfade({ options, data: spine.skeleton.data, from, to })
		if (!crossfade || !options || !spine.parent || spine.destroyed) {
			this.finish()
			change(false)
			return false
		}

		// A fade already running is completed instantly so the new one starts from a clean state.
		this.finish()
		const snapshot = this.capture()
		const ghost = this.buildGhost(snapshot)
		this.baseAlpha = spine.alpha
		spine.parent.addChildAt(ghost, spine.parent.getChildIndex(spine))

		change(true)

		const mode = options.mode ?? DEFAULT_CROSSFADE_MODE
		const clock = new CrossfadeClock(options.duration, mode)
		const first = clock.step(0)
		spine.alpha = this.baseAlpha * first.incoming
		ghost.alpha = this.baseAlpha * first.outgoing

		this.ghost = ghost
		this.tick = (ticker) => {
			const { outgoing, incoming, done } = clock.step(ticker.deltaMS / 1000)
			spine.alpha = this.baseAlpha * incoming
			ghost.alpha = this.baseAlpha * outgoing
			if (done) this.finish()
		}
		Ticker.shared.add(this.tick)
		return true
	}

	/** End any running fade now: the real spine is fully shown, the ghost removed. */
	finish(): void {
		if (this.tick) Ticker.shared.remove(this.tick)
		this.tick = null

		const ghost = this.ghost
		this.ghost = null
		if (ghost) {
			if (!ghost.destroyed) ghost.destroy()
			if (!this.spine.destroyed) this.spine.alpha = this.baseAlpha
		}
	}

	destroy(): void {
		this.finish()
	}

	private capture(): TrackSnapshot[] {
		const out: TrackSnapshot[] = []
		this.spine.state.tracks.forEach((entry, index) => {
			if (!entry?.animation) return
			out.push({
				index,
				animation: entry.animation.name,
				loop: entry.loop,
				trackTime: entry.trackTime,
				timeScale: entry.timeScale,
			})
		})
		return out
	}

	private buildGhost(tracks: TrackSnapshot[]): AnySpine {
		const spine = this.spine
		const Ctor = spine.constructor as new (options: { skeletonData: unknown }) => AnySpine
		const ghost = new Ctor({ skeletonData: spine.skeleton.data })

		if (spine.skeleton.skin) ghost.skeleton.setSkin(spine.skeleton.skin)
		ghost.state.timeScale = spine.state.timeScale
		for (const t of tracks) {
			const entry = ghost.state.setAnimation(t.index, t.animation, t.loop)
			entry.trackTime = t.trackTime
			entry.timeScale = t.timeScale
		}
		// Settle the pose now so the first drawn ghost frame matches the last real one.
		ghost.state.update(0)
		ghost.state.apply(ghost.skeleton)
		ghost.skeleton.updateWorldTransform(Physics.update)

		ghost.position.copyFrom(spine.position)
		ghost.scale.copyFrom(spine.scale)
		ghost.pivot.copyFrom(spine.pivot)
		ghost.rotation = spine.rotation
		ghost.skew.copyFrom(spine.skew)
		ghost.zIndex = spine.zIndex
		ghost.blendMode = spine.blendMode
		ghost.eventMode = 'none'
		return ghost
	}
}
