<script lang="ts" module>
	export type Props = {
		/** Freezes playback without stopping the ticker, so overlays keep updating. */
		paused?: boolean
		timeScale?: number
		/** Position within the current animation, 0–1. Applied whenever it changes. */
		animationProgress?: number
		reverse?: boolean
		/** Per-animation-pair mix overrides. */
		mixTimeRules?: readonly MixTimeRule[]
		/** Default cross-fade, in seconds. */
		mixTime?: number
		/** When set, used instead of the nearest spine context. */
		spine?: AnySpine
	}

	import type { MixTimeRule } from '../core/playback/spinePlaybackCore'
	import type { AnySpine } from '../core/runtime/spineRuntime'
</script>

<script lang="ts">
	import { getContextSpine } from 'pixi-svelte'

	import { applyMixTimeRules, seekTrackProgress } from '../core/playback/spinePlaybackCore'

	const props: Props = $props()
	const spine = props.spine ?? getContextSpine()

	// Pause is a zeroed timeScale rather than a stopped ticker: debug renderers, bone followers
	// and overlays must keep running while the animation is frozen.
	$effect(() => {
		spine.state.timeScale = props.paused ? 0 : (props.timeScale ?? 1)
	})

	$effect(() => {
		if (props.mixTime !== undefined) spine.state.data.defaultMix = props.mixTime
	})

	$effect(() => {
		if (props.mixTimeRules?.length) applyMixTimeRules(spine, props.mixTimeRules)
	})

	$effect(() => {
		const track = spine.state.tracks[0]
		if (track) track.reverse = Boolean(props.reverse)
	})

	$effect(() => {
		if (props.animationProgress === undefined) return
		seekTrackProgress(spine, props.animationProgress)
	})
</script>
