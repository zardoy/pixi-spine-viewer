import { UPDATE_PRIORITY, type TickerCallback } from 'pixi.js'
import { getContextApp } from 'pixi-svelte'

/**
 * Per-frame work ordered explicitly rather than by mount order.
 *
 * Relative order between tick tasks is load-bearing — camera interpolation has to settle before
 * anything that reads the resulting transform, or overlays trail the camera by a frame.
 */
export const TICK_PRIORITY = {
	CAMERA: UPDATE_PRIORITY.HIGH,
	FOLLOW: UPDATE_PRIORITY.NORMAL,
	OVERLAYS: UPDATE_PRIORITY.LOW,
	STATS: UPDATE_PRIORITY.UTILITY,
} as const

/** Runs `fn` every frame for as long as the calling component is alive. */
export function onTick(fn: TickerCallback<unknown>, priority: number = UPDATE_PRIORITY.NORMAL): void {
	const context = getContextApp()

	$effect(() => {
		const app = context.stateApp.pixiApplication
		if (!app) return

		app.ticker.add(fn, null, priority)
		return () => {
			app.ticker.remove(fn, null)
		}
	})
}
