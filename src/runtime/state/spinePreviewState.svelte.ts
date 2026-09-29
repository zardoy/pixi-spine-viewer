import type { SpineLoaderApi } from 'spine-svelte'

/**
 * Reactive bridge object handed to the Svelte preview root.
 *
 * Authored here rather than in the React component because `$state` is a compiler rune — a plain
 * `.ts` file cannot create the proxy, and without the proxy `mount()` props never update.
 */
export function createSpinePreviewState(canvasWidth: number, canvasHeight: number, padding: number) {
	// `$state` is only valid as a declaration initializer, so it cannot be returned inline.
	const state = $state({
		loader: null as SpineLoaderApi | null,
		spineKey: 'preview',
		canvasWidth,
		canvasHeight,
		padding,
	})
	return state
}

export type SpinePreviewState = ReturnType<typeof createSpinePreviewState>
