import { Physics } from '@esotericsoftware/spine-core'
import { AlphaFilter, Ticker, type Filter } from 'pixi.js'

import { EMPTY_ANIMATION_NAME } from '../playback/spinePlaybackCore'
import type { AnySpine } from '../runtime/spineRuntime'
import {
	CrossfadeClock,
	DEFAULT_CROSSFADE_MODE,
	shouldCrossfade,
	type CrossfadeOptions,
} from './crossfadePlan'

const asFilterList = (filters: Filter | readonly Filter[] | null | undefined): Filter[] =>
	!filters ? [] : Array.isArray(filters) ? [...filters] : [filters as Filter]

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
 * Both spines are faded through an `AlphaFilter`, not `container.alpha`: a spine's slots are
 * separate quads and Pixi applies container alpha to each, so a layered rig (skins, outfits, hair
 * over face) would show its overlapping parts *through* each other mid-fade. The filter renders the
 * spine flat first and fades that.
 *
 * Not mirrored onto the ghost: runtime attachment tweaks the host applies per frame to the real
 * spine (force-hide, attachment mix rules). A hidden attachment can therefore show on the ghost
 * for the length of the fade.
 */
export class SpineCrossfader {
	private ghost: AnySpine | null = null
	private tick: ((ticker: Ticker) => void) | null = null
	private spineFade: AlphaFilter | null = null

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
		spine.parent.addChildAt(ghost, spine.parent.getChildIndex(spine))

		change(true)

		const mode = options.mode ?? DEFAULT_CROSSFADE_MODE
		const clock = new CrossfadeClock(options.duration, mode)
		const first = clock.step(0)

		const spineFade = new AlphaFilter({ alpha: first.incoming })
		const ghostFade = new AlphaFilter({ alpha: first.outgoing })
		// Keep whatever filters the host put on the spine (render modes); ours goes last.
		spine.filters = [...asFilterList(spine.filters), spineFade]
		ghost.filters = [...asFilterList(ghost.filters), ghostFade]

		this.spineFade = spineFade
		this.ghost = ghost
		this.tick = (ticker) => {
			const { outgoing, incoming, done } = clock.step(ticker.deltaMS / 1000)
			spineFade.alpha = incoming
			ghostFade.alpha = outgoing
			if (done) this.finish()
		}
		Ticker.shared.add(this.tick)
		return true
	}

	/** End any running fade now: the real spine is fully shown, the ghost removed. */
	finish(): void {
		if (this.tick) Ticker.shared.remove(this.tick)
		this.tick = null

		const fade = this.spineFade
		this.spineFade = null
		if (fade && !this.spine.destroyed) {
			// Remove only our filter: the host may have changed the others mid-fade.
			this.spine.filters = asFilterList(this.spine.filters).filter((filter) => filter !== fade)
		}
		fade?.destroy()

		const ghost = this.ghost
		this.ghost = null
		if (ghost && !ghost.destroyed) ghost.destroy()
	}

	destroy(): void {
		this.finish()
	}

	private capture(): TrackSnapshot[] {
		const out: TrackSnapshot[] = []
		this.spine.state.tracks.forEach((entry, index) => {
			// The empty pseudo-animation is not in the skeleton data, and shows nothing anyway.
			if (!entry?.animation || entry.animation.name === EMPTY_ANIMATION_NAME) return
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
		ghost.alpha = spine.alpha
		ghost.zIndex = spine.zIndex
		ghost.blendMode = spine.blendMode
		ghost.eventMode = 'none'
		// Nothing was playing (e.g. fading in from the empty pseudo-animation): there is no outgoing
		// pose, and an unposed ghost would show the setup pose.
		ghost.visible = tracks.length > 0
		return ghost
	}
}
