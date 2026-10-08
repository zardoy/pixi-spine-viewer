<script lang="ts" module>
	import type { ScreenshotStageState } from './state/screenshotStageState.svelte'

	export type Props = { state: ScreenshotStageState }
</script>

<script lang="ts">
	import { App, createApp, setContextApp } from 'pixi-svelte'

	import ScreenshotSpine from './screenshot/ScreenshotSpine.svelte'

	const { state: stage }: Props = $props()

	const context = createApp({ assets: {} })
	setContextApp(context)

	// The canvas is created once at its first size; later size changes resize it in place.
	$effect(() => {
		const app = context.stateApp.pixiApplication
		if (!app) return
		app.renderer.resize(stage.canvasWidth, stage.canvasHeight)
	})
</script>

<!-- resolution 1: the PNG must be exactly canvasWidth x canvasHeight, whatever the display's DPR. -->
<App
	resetAssets={false}
	resetOnDestroy={false}
	size={{ width: stage.canvasWidth, height: stage.canvasHeight }}
	backgroundAlpha={0}
	antialias
	resolution={1}
>
	{#if stage.loader && stage.bounds}
		{#key stage.captureSession}
			<ScreenshotSpine {stage} loader={stage.loader} bounds={stage.bounds} />
		{/key}
	{/if}
</App>
