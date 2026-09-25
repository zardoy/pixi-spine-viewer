<script lang="ts" module>
	export type SpinePreviewStageState = {
		loader: SpineLoaderApi | null
		spineKey: string
		canvasWidth: number
		canvasHeight: number
		padding: number
	}

	export type Props = { state: SpinePreviewStageState }

	import type { SpineLoaderApi } from 'spine-svelte'
</script>

<script lang="ts">
	import { App, createApp, setContextApp } from 'pixi-svelte'
	import { boundsToContainTransform, computeMaxAnimationBounds, type AnySkeletonData } from 'spine-svelte'
	import { SpineNode } from 'spine-svelte/components'

	const { state }: Props = $props()

	const context = createApp({ assets: {} })
	setContextApp(context)

	const skeletonData = $derived(
		state.loader?.getSkeletonData?.(state.spineKey) as AnySkeletonData | undefined,
	)

	// Fit the whole animation, not just its first frame, so a looping preview never clips.
	const transform = $derived.by(() => {
		const fallback = { x: state.canvasWidth / 2, y: state.canvasHeight / 2, scale: 0.5 }
		const firstAnimation = skeletonData?.animations[0]?.name
		if (!skeletonData || !firstAnimation) return fallback

		const bounds = computeMaxAnimationBounds(skeletonData, firstAnimation)
		return bounds
			? boundsToContainTransform(bounds, state.canvasWidth, state.canvasHeight, state.padding)
			: fallback
	})

	export function getApp() {
		return context.stateApp.pixiApplication
	}
</script>

<App
	resetAssets={false}
	resetOnDestroy={false}
	size={{ width: state.canvasWidth, height: state.canvasHeight }}
	backgroundAlpha={0}
>
	{#if skeletonData}
		<SpineNode
			key={state.spineKey}
			spineData={skeletonData}
			loop
			x={transform.x}
			y={transform.y}
			scale={transform.scale}
		/>
	{/if}
</App>
