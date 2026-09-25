import type { AnySkeletonData } from 'spine-svelte'

export type SpinesMapTile = {
	/** Stable identity across re-renders — the spine's map path. */
	id: string
	spineKey: string
	spineData: AnySkeletonData
	animation: string
	skin?: string
	x: number
	y: number
	scale: number
}

/**
 * Many tiles share one Pixi Application, so the React side publishes a descriptor per tile and
 * the Svelte stage renders whatever is present. Keeps tile selection logic (animation/skin
 * indices, saved bounds) in the existing React components instead of duplicating it.
 */
export function createSpinesMapStageState() {
	const state = $state({
		width: 0,
		height: 0,
		tiles: {} as Record<string, SpinesMapTile>,
	})
	return state
}

export type SpinesMapStageState = ReturnType<typeof createSpinesMapStageState>
