/**
 * Pure bookkeeping for the remount stress test — no Pixi, no DOM, so it runs under vitest.
 *
 * A "frame" is one real `renderer.render()` of the app. After each one the harness reads the canvas
 * back and tells the tracker which cells contain any non-background pixel. A mount is clean when
 * the *first* frame rendered after the Svelte state flip already shows content.
 */

export type Rgb = readonly [number, number, number]

export type CellRect = { x: number; y: number; width: number; height: number }

/**
 * True when any pixel in `rect` differs from `bg` by more than `tolerance` on some channel.
 * `rgba` is a tightly packed top-left-origin RGBA readback of `canvasWidth` × N pixels.
 */
export function regionHasContent(
	rgba: Uint8ClampedArray | Uint8Array,
	canvasWidth: number,
	rect: CellRect,
	bg: Rgb,
	tolerance = 24,
	minPixels = 4,
): boolean {
	let hits = 0
	for (let y = rect.y; y < rect.y + rect.height; y += 1) {
		let i = (y * canvasWidth + rect.x) * 4
		for (let x = 0; x < rect.width; x += 1, i += 4) {
			const dr = Math.abs(rgba[i]! - bg[0])
			const dg = Math.abs(rgba[i + 1]! - bg[1])
			const db = Math.abs(rgba[i + 2]! - bg[2])
			if (dr > tolerance || dg > tolerance || db > tolerance) {
				hits += 1
				if (hits >= minPixels) return true
			}
		}
	}
	return false
}

export type MountRecord = {
	id: number
	scenario: string
	/** Where in the frame the state flip happened (`timeout`, `raf`, `postrender`, `ticker-high`). */
	phase: string
	cell: number
	/** Rendered frames before the flip; the first frame that can show the mount is `flipFrame + 1`. */
	flipFrame: number
	/** Frames rendered after the flip with the cell still empty, before it first had content. */
	blankFrames: number | null
	/** Frames rendered after content first appeared where the cell went empty again. */
	flickerFrames: number
	/** Never produced content within the tracker's patience window. */
	neverVisible: boolean
}

export type TrackerOptions = {
	/** Give up on a mount after this many rendered frames without content. */
	patienceFrames?: number
	/** Keep watching for flicker this long after a mount first showed content. */
	flickerWatchFrames?: number
	/** Fired once per mount, as soon as its blank-frame count is known. */
	onResolved?: (record: MountRecord) => void
}

type Open = {
	record: MountRecord
	firstVisibleFrame: number | null
	closed: boolean
}

export class MountTracker {
	readonly records: MountRecord[] = []
	private open: Open[] = []
	private nextId = 1
	private readonly patience: number
	private readonly flickerWatch: number
	private readonly onResolved: ((record: MountRecord) => void) | undefined

	constructor(options: TrackerOptions = {}) {
		this.patience = options.patienceFrames ?? 30
		this.flickerWatch = options.flickerWatchFrames ?? 6
		this.onResolved = options.onResolved
	}

	/** Cells that have a mount still waiting for its first content, as of `frame`. */
	awaitingContent(frame: number): number[] {
		return this.open
			.filter((o) => o.firstVisibleFrame === null && frame > o.record.flipFrame)
			.map((o) => o.record.cell)
	}

	/** Call at the moment the Svelte state flip mounts a spine in `cell`. */
	beginMount(scenario: string, phase: string, cell: number, framesRendered: number): MountRecord {
		const record: MountRecord = {
			id: this.nextId++,
			scenario,
			phase,
			cell,
			flipFrame: framesRendered,
			blankFrames: null,
			flickerFrames: 0,
			neverVisible: false,
		}
		this.records.push(record)
		this.open.push({ record, firstVisibleFrame: null, closed: false })
		return record
	}

	/** Call at the moment a cell is unmounted, so its tail frames are not judged. */
	endMount(cell: number): void {
		for (const o of this.open) if (o.record.cell === cell) o.closed = true
		this.open = this.open.filter((o) => !o.closed)
	}

	/**
	 * Feed one rendered frame. `frame` counts renders (1-based), `visible(cell)` is the readback.
	 */
	onFrame(frame: number, visible: (cell: number) => boolean): void {
		for (const o of this.open) {
			const { record } = o
			if (frame <= record.flipFrame) continue
			const has = visible(record.cell)

			if (o.firstVisibleFrame === null) {
				if (has) {
					o.firstVisibleFrame = frame
					record.blankFrames = frame - record.flipFrame - 1
					this.onResolved?.(record)
				} else if (frame - record.flipFrame >= this.patience) {
					record.neverVisible = true
					record.blankFrames = frame - record.flipFrame
					o.closed = true
					this.onResolved?.(record)
				}
				continue
			}

			if (!has) record.flickerFrames += 1
			if (frame - o.firstVisibleFrame >= this.flickerWatch) o.closed = true
		}
		this.open = this.open.filter((o) => !o.closed)
	}

	get pending(): number {
		return this.open.length
	}
}

export type ScenarioSummary = {
	scenario: string
	phase: string
	mounts: number
	cleanMounts: number
	blankMounts: number
	neverVisible: number
	/** Longest run of empty frames after a mount. */
	maxBlankFrames: number
	flickerMounts: number
}

export function summarise(records: readonly MountRecord[]): ScenarioSummary[] {
	const groups = new Map<string, MountRecord[]>()
	for (const r of records) {
		const key = `${r.scenario}\u0000${r.phase}`
		const list = groups.get(key)
		if (list) list.push(r)
		else groups.set(key, [r])
	}

	return [...groups.values()].map((list) => {
		const resolved = list.filter((r) => r.blankFrames !== null)
		return {
			scenario: list[0]!.scenario,
			phase: list[0]!.phase,
			mounts: list.length,
			cleanMounts: resolved.filter((r) => r.blankFrames === 0 && r.flickerFrames === 0).length,
			blankMounts: resolved.filter((r) => (r.blankFrames ?? 0) > 0).length,
			neverVisible: list.filter((r) => r.neverVisible).length,
			maxBlankFrames: resolved.reduce((m, r) => Math.max(m, r.blankFrames ?? 0), 0),
			flickerMounts: list.filter((r) => r.flickerFrames > 0).length,
		}
	})
}

/** A run passes only when every mount shows content on its first rendered frame and never flickers. */
export function isClean(summaries: readonly ScenarioSummary[]): boolean {
	return summaries.every((s) => s.blankMounts === 0 && s.neverVisible === 0 && s.flickerMounts === 0)
}
