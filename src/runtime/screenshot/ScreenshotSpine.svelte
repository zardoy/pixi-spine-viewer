<script lang="ts" module>
	import type { SpineBounds } from 'spine-svelte'
	import type { FileSpineLoader } from '../../lib/FileSpineLoader'
	import type { ScreenshotStageState } from '../state/screenshotStageState.svelte'

	export type Props = {
		stage: ScreenshotStageState
		loader: FileSpineLoader
		bounds: SpineBounds
	}

	/** Ticks to wait after the spine mounts, so its first frame has certainly been applied. */
	const SETTLE_TICKS = 6
</script>

<script lang="ts">
	import { getContextApp } from 'pixi-svelte'
	import { SpineNode } from 'spine-svelte/components'
	import { onTick } from 'spine-svelte/state'

	const { stage, loader, bounds }: Props = $props()
	const context = getContextApp()

	// This component is re-created for every capture session, so these start fresh each time.
	const session = stage.captureSession
	let mounted = false
	let ticks = 0
	let captured = false

	onTick(() => {
		if (!mounted || !stage.autoDownload || captured) return
		if (++ticks < SETTLE_TICKS) return
		captured = true

		const app = context.stateApp.pixiApplication
		if (!app) return
		// Two rAF passes ensure WebGL has flushed the draw commands.
		requestAnimationFrame(() => requestAnimationFrame(() => stage.onCapture?.(app, session)))
	})
</script>

<!-- Paused on a single frame: `animationProgress` picks the pose. The origin is shifted so the
	 chosen bounds' top-left lands on the canvas' (0, 0). -->
<SpineNode
	key={stage.spineKey}
	{loader}
	animation={stage.animName || undefined}
	skin={stage.skinName}
	animationProgress={stage.animationProgress}
	paused
	loop={false}
	x={-bounds.x * stage.outputScale}
	y={-bounds.y * stage.outputScale}
	scale={stage.outputScale}
	onSpineLoaded={() => (mounted = true)}
/>
