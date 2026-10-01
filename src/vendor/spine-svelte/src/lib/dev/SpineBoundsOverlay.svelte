<script lang="ts" module>
	export type SpineBoundsOverlayMode = 'live' | 'max' | 'both'

	export type Props = {
		spine: AnySpine
		/**
		 * `live` = this frame's AABB, `max` = the widest AABB across the whole animation,
		 * `both` = draw each in its own colour.
		 */
		mode?: SpineBoundsOverlayMode
		/** Animation sampled for `max`. Defaults to whatever track 0 is playing. */
		animationName?: string
		skinName?: string
		liveColor?: string
		maxColor?: string
		/** Desired thickness in screen pixels — compensated for the spine's world scale so it
		 * reads the same whether the spine renders at 0.2x (a small board symbol) or 3x. */
		lineWidth?: number
	}

	import type { AnySpine } from '../core/runtime/spineRuntime'
</script>

<script lang="ts">
	import { Graphics } from 'pixi-svelte'

	import { computeMaxAnimationBounds, type SpineBounds } from '../core/bounds/spineUtils'
	import { onTick, TICK_PRIORITY } from '../state/onTick.svelte'

	const props: Props = $props()

	const mode = $derived(props.mode ?? 'live')
	const showLive = $derived(mode === 'live' || mode === 'both')
	const showMax = $derived(mode === 'max' || mode === 'both')

	const resolvedAnimation = $derived(
		props.animationName ?? props.spine.state?.tracks?.[0]?.animation?.name,
	)

	/**
	 * Sampling every animation frame is expensive, so this recomputes only when the animation or
	 * skin changes rather than per frame.
	 */
	const maxBounds = $derived.by((): SpineBounds | null => {
		if (!showMax) return null
		const data = props.spine.skeleton?.data
		if (!data) return null
		return computeMaxAnimationBounds(data, resolvedAnimation, 0.05, props.skinName)
	})

	let liveBounds = $state<SpineBounds | null>(null)
	// Screen-constant line thickness: divide the desired pixel width by the spine's *accumulated*
	// world scale (all ancestor containers, not just the spine's own `scale`), so it renders the
	// same whether this spine sits under a 0.2x board-cell container or is shown at 1x.
	let worldScale = $state(1)

	onTick(() => {
		const spine = props.spine
		const t = spine.worldTransform
		const scaleX = Math.sqrt(t.a * t.a + t.c * t.c)
		const scaleY = Math.sqrt(t.b * t.b + t.d * t.d)
		const nextWorldScale = (scaleX + scaleY) / 2 || 1
		if (Math.abs(nextWorldScale - worldScale) > 1e-4) {
			worldScale = nextWorldScale
		}

		if (!showLive) return
		const bounds = spine.bounds
		if (!bounds) return
		// Cheap identity check — reassigning every frame would invalidate the draw needlessly.
		if (
			liveBounds &&
			liveBounds.x === bounds.minX &&
			liveBounds.y === bounds.minY &&
			liveBounds.width === bounds.maxX - bounds.minX &&
			liveBounds.height === bounds.maxY - bounds.minY
		) {
			return
		}
		liveBounds = {
			x: bounds.minX,
			y: bounds.minY,
			width: bounds.maxX - bounds.minX,
			height: bounds.maxY - bounds.minY,
		}
	}, TICK_PRIORITY.OVERLAYS)

	/** Skeleton space → the spine's parent space, which is where this Graphics lives. */
	function toParentSpace(bounds: SpineBounds) {
		const spine = props.spine
		const scaleX = spine.scale?.x ?? 1
		const scaleY = spine.scale?.y ?? 1
		return {
			x: spine.x + bounds.x * scaleX,
			y: spine.y + bounds.y * scaleY,
			width: bounds.width * scaleX,
			height: bounds.height * scaleY,
		}
	}
</script>

<Graphics
	zIndex={9_000}
	draw={(graphics) => {
		graphics.clear()
		// Matches the original viewer's bounds overlay stroke (PixiApp.tsx used width: 2, drawn in
		// screen space); here we're in a scaled container, so divide by that scale to match.
		const width = (props.lineWidth ?? 2) / worldScale

		if (showMax && maxBounds) {
			const rect = toParentSpace(maxBounds)
			graphics.rect(rect.x, rect.y, rect.width, rect.height)
			graphics.stroke({ color: props.maxColor ?? 'rgb(0, 255, 26)', width, alpha: 0.9 })
		}

		if (showLive && liveBounds) {
			const rect = toParentSpace(liveBounds)
			graphics.rect(rect.x, rect.y, rect.width, rect.height)
			graphics.stroke({ color: props.liveColor ?? 'rgb(74, 222, 128)', width, alpha: 0.9 })
		}
	}}
/>
