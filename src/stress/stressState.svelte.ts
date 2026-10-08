import type { Texture } from 'pixi.js'

import type { FileSpineLoader } from '../lib/FileSpineLoader'

export type StressCell = {
	/** Live spine mounted in the cell. */
	mounted: boolean
	/** Static sprite of the same pose drawn under the spine, like the baked symbol textures. */
	showBaked: boolean
	skin: string
	animation: string
}

/**
 * Reactive bridge to the Svelte stage. Authored in a `.svelte.ts` module because `$state` is a
 * compiler rune — a plain `.ts` file cannot create the proxy that `mount()` props need.
 */
export function createStressState(cols: number, rows: number, cellSize: number) {
	const state = $state({
		loader: null as FileSpineLoader | null,
		/** Pre-drawn stand-in for the baked-symbol swap scenarios; set before the stage mounts. */
		bakedTexture: null as Texture | null,
		spineKey: 'stress',
		cols,
		rows,
		cellSize,
		cells: Array.from(
			{ length: cols * rows },
			(): StressCell => ({ mounted: false, showBaked: false, skin: 'default', animation: 'idle' }),
		),
	})
	return state
}

export type StressState = ReturnType<typeof createStressState>
