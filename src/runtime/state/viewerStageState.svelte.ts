import { snapshot, subscribe } from 'valtio'
import type { SpineFiles } from '../../pages/Index'
import { spineViewerStore, type SpineViewerState } from '../../store/spineViewerStore'

type Ui = SpineViewerState['ui']

/**
 * Reactive, read-only view of `spineViewerStore` for the Svelte viewer stage.
 *
 * The store stays the source of truth because the React sidebar/timeline read and write it. The
 * stage reads this mirror in the template/`$effect`s, so it re-runs on exactly the keys that
 * changed, and writes straight to the store (a store write round-trips back here, a no-op when
 * the value already matches).
 *
 * Authored as `.svelte.ts` because `$state` is a compiler rune; a plain `.ts` file can't make it.
 */
export function createViewerStageState() {
	const initial = snapshot(spineViewerStore) as SpineViewerState

	// Deep `$state` gives one signal per key, so a per-frame `timeline` write doesn't wake effects
	// that only read `selectedAnimation`.
	const ui = $state<Ui>({ ...initial.ui })

	// Raw: these hold File handles and are replaced wholesale, never mutated.
	let files = $state.raw<SpineFiles | null>(initial.files)
	let secondFiles = $state.raw<SpineFiles | null>(initial.secondFiles)
	let secondSpineOffset = $state.raw(initial.secondSpineOffset)
	let secondSpineOpacity = $state.raw(initial.secondSpineOpacity)
	let syncedDir = $state.raw(initial.syncedDir)

	let last = initial

	function apply(next: SpineViewerState) {
		const uiRecord = ui as Record<string, unknown>
		const nextUi = next.ui as Record<string, unknown>
		const lastUi = last.ui as Record<string, unknown>
		// valtio snapshots share structure, so an untouched subtree keeps its reference and `!==`
		// is an accurate "changed" test — no deep comparison needed.
		for (const key of Object.keys(nextUi)) {
			if (nextUi[key] !== lastUi[key]) uiRecord[key] = nextUi[key]
		}
		if (next.files !== last.files) files = next.files
		if (next.secondFiles !== last.secondFiles) secondFiles = next.secondFiles
		if (next.secondSpineOffset !== last.secondSpineOffset) secondSpineOffset = next.secondSpineOffset
		if (next.secondSpineOpacity !== last.secondSpineOpacity) secondSpineOpacity = next.secondSpineOpacity
		if (next.syncedDir !== last.syncedDir) syncedDir = next.syncedDir
		last = next
	}

	return {
		ui: ui as Readonly<Ui>,
		get files() {
			return files
		},
		get secondFiles() {
			return secondFiles
		},
		get secondSpineOffset() {
			return secondSpineOffset
		},
		get secondSpineOpacity() {
			return secondSpineOpacity
		},
		get syncedDir() {
			return syncedDir
		},
		/** Start following the store. Returns the unsubscribe function. */
		connect(): () => void {
			apply(snapshot(spineViewerStore) as SpineViewerState)
			return subscribe(spineViewerStore, () => apply(snapshot(spineViewerStore) as SpineViewerState))
		},
	}
}

export type ViewerStageState = ReturnType<typeof createViewerStageState>
