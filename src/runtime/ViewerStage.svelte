<script lang="ts" module>
	import type { ViewerStageState } from './state/viewerStageState.svelte'

	export type Props = { state: ViewerStageState }
</script>

<script lang="ts">
	import { App, createApp, setContextApp } from 'pixi-svelte'
	import { isCheckerBackground } from 'spine-svelte'
	import { onDestroy } from 'svelte'

	import ViewerScene from './viewer/ViewerScene.svelte'

	const { state: stage }: Props = $props()

	// Subscribe before the first render so the scene never starts from a stale snapshot.
	const disconnect = stage.connect()
	onDestroy(disconnect)

	// `resetAssets`/`resetOnDestroy` off: PIXI.Assets is global and other roots (the spines-map
	// tiles) share it, so this root must not wipe it on the way out.
	const context = createApp({ assets: {} })
	setContextApp(context)

	let wrapper = $state<HTMLDivElement>()

	const isChecker = $derived(isCheckerBackground(stage.ui.backgroundColor))
</script>

<!-- The checkerboard is drawn into the world; this solid colour sits behind a transparent canvas. -->
<div bind:this={wrapper} class="h-full w-full" style:background-color={isChecker ? '#1a1a1a' : undefined}>
	{#if wrapper}
		<App
			resizeTo={wrapper}
			resetAssets={false}
			resetOnDestroy={false}
			antialias
			backgroundColor={isChecker ? '#000000' : stage.ui.backgroundColor}
			backgroundAlpha={isChecker ? 0 : 1}
		>
			<ViewerScene {stage} />
		</App>
	{/if}
</div>
