import { flushSync } from 'svelte'
import { Ticker, UPDATE_PRIORITY, type Application } from 'pixi.js'
import { addSpineMountHook } from 'spine-svelte'

import { MountTracker, regionHasContent, type CellRect, type Rgb } from './frameProbe'
import type { StressState } from './stressState.svelte'
import { STRESS_ANIMATIONS, STRESS_SKINS } from './syntheticSpine'

/**
 * What differs between runs. `baseline` is the library exactly as shipped; the others are the
 * candidate fixes, applied from outside so they can be compared against it without editing the lib.
 */
export type StressConfig = {
	name: 'baseline' | 'shared-ticker' | 'spine-app-ticker' | 'prime'
	/** Start `Ticker.shared` before the Application's own ticker, flipping their per-frame order. */
	sharedFirst: boolean
}

export const CONFIG_NAMES: StressConfig['name'][] = [
	'baseline',
	'shared-ticker',
	'spine-app-ticker',
	'prime',
]

export type Phase = 'timeout' | 'raf' | 'postrender' | 'ticker-high'
export const PHASES: Phase[] = ['timeout', 'raf', 'postrender', 'ticker-high']

const BG: Rgb = [0, 0, 0]

type Waiter = { frame: number; resolve: () => void }

/** Install the config's ticker wiring. Returns a cleanup. */
export function installConfig(app: Application, config: StressConfig): () => void {
	const cleanups: Array<() => void> = []
	switch (config.name) {
		case 'baseline':
			break
		case 'shared-ticker': {
			// Render (LOW) and the spines' autoUpdate (NORMAL) share one ticker, so every update
			// is ordered before the render of the same tick.
			const own = app.ticker
			app.ticker = Ticker.shared
			// Hand render back to the app's own ticker: a destroyed app must not leave its `render`
			// on the global ticker, where it throws every frame and breaks every later run.
			cleanups.push(() => {
				if (app.renderer) app.ticker = own
				else Ticker.shared.remove(app.render, app)
			})
			break
		}
		case 'spine-app-ticker':
			cleanups.push(
				addSpineMountHook((spine) => {
					spine.ticker = app.ticker
				}),
			)
			break
		case 'prime':
			// Apply track 0 once at mount so the very first render already has a pose.
			cleanups.push(
				addSpineMountHook((spine) => {
					spine.update(0)
				}),
			)
			break
	}
	return () => cleanups.forEach((c) => c())
}

export class Harness {
	frames = 0
	readonly tracker = new MountTracker()
	private waiters: Waiter[] = []
	private postRender: Array<() => void> = []
	private tickerHigh: Array<() => void> = []
	private readonly readback: CanvasRenderingContext2D
	private readonly cellRects: CellRect[]
	private readonly detach: () => void
	private scenario = ''

	constructor(
		private readonly app: Application,
		private readonly state: StressState,
	) {
		const { canvas, resolution } = app.renderer
		const probeCanvas = document.createElement('canvas')
		probeCanvas.width = canvas.width
		probeCanvas.height = canvas.height
		this.readback = probeCanvas.getContext('2d', { willReadFrequently: true })!

		// Central 40 % of each cell: a rotating 80 px box centred in a 120 px cell always covers it.
		const inset = state.cellSize * 0.3
		this.cellRects = state.cells.map((_, i) => ({
			x: Math.round(((i % state.cols) * state.cellSize + inset) * resolution),
			y: Math.round((Math.floor(i / state.cols) * state.cellSize + inset) * resolution),
			width: Math.round((state.cellSize - inset * 2) * resolution),
			height: Math.round((state.cellSize - inset * 2) * resolution),
		}))

		const ticker = app.ticker
		const onHigh = () => {
			const queued = this.tickerHigh
			this.tickerHigh = []
			for (const fn of queued) fn()
		}
		ticker.add(onHigh, null, UPDATE_PRIORITY.HIGH)
		// UTILITY runs after the app's LOW-priority render: this callback is "a frame was drawn".
		ticker.add(this.onRendered, this, UPDATE_PRIORITY.UTILITY)
		this.detach = () => {
			ticker.remove(onHigh)
			ticker.remove(this.onRendered, this)
		}
	}

	destroy(): void {
		this.detach()
	}

	setScenario(name: string): void {
		this.scenario = name
	}

	private onRendered = (): void => {
		this.frames += 1
		const { canvas } = this.app.renderer
		// Same task as the draw, so the WebGL back buffer is still valid without preserveDrawingBuffer.
		this.readback.drawImage(canvas, 0, 0)
		const image = this.readback.getImageData(0, 0, canvas.width, canvas.height)
		this.tracker.onFrame(this.frames, (cell) =>
			regionHasContent(image.data, canvas.width, this.cellRects[cell]!, BG),
		)

		const ready = this.waiters.filter((w) => w.frame <= this.frames)
		this.waiters = this.waiters.filter((w) => w.frame > this.frames)
		for (const w of ready) w.resolve()

		const queued = this.postRender
		this.postRender = []
		for (const fn of queued) fn()
	}

	waitFrames(n: number): Promise<void> {
		return new Promise((resolve) => this.waiters.push({ frame: this.frames + n, resolve }))
	}

	/** Run `fn` at the given point of the frame; resolves once it ran. */
	at(phase: Phase, fn: () => void): Promise<void> {
		return new Promise((resolve) => {
			const run = () => {
				fn()
				resolve()
			}
			switch (phase) {
				case 'timeout':
					setTimeout(run, Math.random() * 20)
					break
				case 'raf':
					requestAnimationFrame(run)
					break
				case 'postrender':
					this.postRender.push(run)
					break
				case 'ticker-high':
					this.tickerHigh.push(run)
					break
			}
		})
	}

	mount(phase: string, cell: number, opts: { skin?: string; animation?: string; baked?: boolean } = {}): void {
		const c = this.state.cells[cell]!
		c.skin = opts.skin ?? 'default'
		c.animation = opts.animation ?? 'idle'
		c.mounted = true
		if (opts.baked !== undefined) c.showBaked = opts.baked
		flushSync()
		this.tracker.beginMount(this.scenario, phase, cell, this.frames)
	}

	unmount(cell: number, baked = false): void {
		const c = this.state.cells[cell]!
		c.mounted = false
		c.showBaked = baked
		flushSync()
		this.tracker.endMount(cell)
	}

	hideBaked(cell: number): void {
		this.state.cells[cell]!.showBaked = false
		flushSync()
	}
}

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!

export type Scenario = {
	name: string
	run: (h: Harness, state: StressState, cycles: number) => Promise<void>
}

const MID = (state: StressState): number => Math.floor(state.cells.length / 2)

/** One cell remounted over and over, with random skin + clip so the skin/track effects run too. */
const single = (phase: Phase): Scenario => ({
	name: `single/${phase}`,
	async run(h, state, cycles) {
		const cell = MID(state)
		for (let i = 0; i < cycles; i += 1) {
			const skin = pick(STRESS_SKINS)
			const animation = pick(STRESS_ANIMATIONS)
			await h.at(phase, () => h.mount(phase, cell, { skin, animation }))
			await h.waitFrames(4)
			h.unmount(cell)
			await h.waitFrames(2)
		}
	},
})

/** The whole board lands in one Svelte flush, like a spin stopping. */
const burst = (phase: Phase): Scenario => ({
	name: `burst/${phase}`,
	async run(h, state, cycles) {
		for (let i = 0; i < cycles; i += 1) {
			await h.at(phase, () => {
				for (let cell = 0; cell < state.cells.length; cell += 1) {
					state.cells[cell]!.skin = pick(STRESS_SKINS)
					state.cells[cell]!.animation = pick(STRESS_ANIMATIONS)
					state.cells[cell]!.mounted = true
				}
				flushSync()
				for (let cell = 0; cell < state.cells.length; cell += 1) {
					h.tracker.beginMount(`burst/${phase}`, phase, cell, h.frames)
				}
			})
			await h.waitFrames(4)
			for (let cell = 0; cell < state.cells.length; cell += 1) h.unmount(cell)
			await h.waitFrames(2)
		}
	},
})

/** Random cells flip every frame — the idle-pulse / spin-transition worst case. */
const churn = (phase: Phase): Scenario => ({
	name: `churn/${phase}`,
	async run(h, state, cycles) {
		const age = new Array<number>(state.cells.length).fill(0)
		const frames = cycles * 8
		for (let f = 0; f < frames; f += 1) {
			await h.at(phase, () => {
				for (let cell = 0; cell < state.cells.length; cell += 1) {
					const c = state.cells[cell]!
					age[cell]! += 1
					if (!c.mounted && Math.random() < 0.3) {
						h.mount(phase, cell, { skin: pick(STRESS_SKINS), animation: pick(STRESS_ANIMATIONS) })
						age[cell] = 0
					} else if (c.mounted && age[cell]! > 3 && Math.random() < 0.4) {
						h.unmount(cell)
					}
				}
			})
		}
		for (let cell = 0; cell < state.cells.length; cell += 1) h.unmount(cell)
		await h.waitFrames(2)
	},
})

/**
 * Baked sprite → live spine, the symbol-landing swap. The sprite stays under the spine for
 * `underlayFrames` rendered frames; at 0 it is removed in the same flush the spine mounts.
 */
const swap = (underlayFrames: number, phase: Phase): Scenario => ({
	name: `swap/${phase}/underlay-${underlayFrames}`,
	async run(h, state, cycles) {
		const cell = MID(state)
		h.unmount(cell, true)
		await h.waitFrames(2)
		for (let i = 0; i < cycles; i += 1) {
			await h.at(phase, () => h.mount(phase, cell, { baked: underlayFrames > 0 }))
			if (underlayFrames > 0) {
				await h.waitFrames(underlayFrames)
				h.hideBaked(cell)
			}
			await h.waitFrames(4)
			h.unmount(cell, true)
			await h.waitFrames(2)
		}
		h.unmount(cell)
	},
})

export const SCENARIOS: Scenario[] = [
	...PHASES.map(single),
	burst('postrender'),
	burst('ticker-high'),
	churn('postrender'),
	churn('ticker-high'),
	swap(0, 'ticker-high'),
	swap(1, 'ticker-high'),
	swap(2, 'ticker-high'),
	swap(3, 'ticker-high'),
]
