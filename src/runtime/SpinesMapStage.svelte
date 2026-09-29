<script lang="ts" module>
	export type Props = { state: SpinesMapStageState }

	import type { SpinesMapStageState } from './state/spinesMapStageState.svelte'
</script>

<script lang="ts">
	import { App, createApp, setContextApp } from 'pixi-svelte'
	import { SpineNode } from 'spine-svelte/components'

	const { state }: Props = $props()

	const context = createApp({ assets: {} })
	setContextApp(context)

	const tiles = $derived(Object.values(state.tiles))

	export function getApp() {
		return context.stateApp.pixiApplication
	}
</script>

<App
	resetAssets={false}
	resetOnDestroy={false}
	size={{ width: state.width, height: state.height }}
	backgroundAlpha={0}
>
	{#each tiles as tile (tile.id)}
		<SpineNode
			key={tile.spineKey}
			spineData={tile.spineData}
			animation={tile.animation}
			skin={tile.skin}
			loop
			x={tile.x}
			y={tile.y}
			scale={tile.scale}
		/>
	{/each}
</App>
