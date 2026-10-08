<script lang="ts" module>
	import type { StressState } from './stressState.svelte'

	export type Props = { state: StressState; api?: Record<string, never> }
</script>

<script lang="ts">
	import { App, BaseSprite, Container, createApp, setContextApp } from 'pixi-svelte'
	import type { AnySkeletonData } from 'spine-svelte'
	import { SpineNode } from 'spine-svelte/components'

	const { state }: Props = $props()

	const context = createApp({ assets: {} })
	setContextApp(context)

	// Resolved once, like a game that has already loaded its skeletons — mounts below never wait.
	const skeletonData = state.loader?.getSkeletonData(state.spineKey) as AnySkeletonData | undefined
	const bakedTexture = state.bakedTexture

	export function getApp() {
		return context.stateApp.pixiApplication
	}
</script>

<App
	resetAssets={false}
	resetOnDestroy={false}
	size={{ width: state.cols * state.cellSize, height: state.rows * state.cellSize }}
	backgroundColor="#000000"
	backgroundAlpha={1}
>
	{#each state.cells as cell, i (i)}
		<Container
			x={(i % state.cols) * state.cellSize + state.cellSize / 2}
			y={Math.floor(i / state.cols) * state.cellSize + state.cellSize / 2}
		>
			{#if cell.showBaked && bakedTexture}
				<BaseSprite texture={bakedTexture} anchor={0.5} />
			{/if}
			{#if cell.mounted && skeletonData}
				<SpineNode
					key={state.spineKey}
					spineData={skeletonData}
					skin={cell.skin}
					animation={cell.animation}
					loop
				/>
			{/if}
		</Container>
	{/each}
</App>
