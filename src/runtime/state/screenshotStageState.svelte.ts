import type { Application } from 'pixi.js'
import type { SpineBounds } from 'spine-svelte'
import type { FileSpineLoader } from '../../lib/FileSpineLoader'

/**
 * Reactive bridge object for the screenshot stage. Authored here because `$state` is a compiler
 * rune — a plain `.ts` file can't create the proxy the mounted Svelte root needs.
 */
export function createScreenshotStageState() {
	const state = $state({
		loader: null as FileSpineLoader | null,
		spineKey: 'screenshot-spine',
		bounds: null as SpineBounds | null,
		outputScale: 1,
		animName: '',
		skinName: '',
		animationProgress: 0,
		/** Output size in pixels; the canvas is exactly this big, never DPR-scaled. */
		canvasWidth: 1,
		canvasHeight: 1,
		/** Bumping this remounts the spine, which is what triggers a (re)capture. */
		captureSession: 0,
		autoDownload: true,
		onCapture: null as ((app: Application, session: number) => void) | null,
	})
	return state
}

export type ScreenshotStageState = ReturnType<typeof createScreenshotStageState>
