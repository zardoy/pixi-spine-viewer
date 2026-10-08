import type { Ticker } from 'pixi.js'
import { spineViewerStore } from '../../store/spineViewerStore'

/** Feeds the perf panel: instant fps every frame, and once a second the averaged stats. */
export class FpsMonitor {
	private frames = 0
	private frameTimeSum = 0
	private lastSecond = performance.now()

	tick(ticker: Ticker): void {
		const { ui } = spineViewerStore

		const deltaMS = ticker.deltaMS
		const tickerFps = ticker.FPS ?? 0
		const instantFps = deltaMS > 0 ? 1000 / deltaMS : tickerFps
		ui.fps = instantFps > 0 ? instantFps : tickerFps

		const fpsElement = (window as { __fpsRef?: HTMLElement }).__fpsRef
		if (fpsElement) fpsElement.textContent = ui.fps.toFixed(1)

		this.frameTimeSum += ticker.elapsedMS ?? deltaMS
		this.frames++

		const now = performance.now()
		if (now - this.lastSecond < 1000) return

		ui.fpsRendered = this.frames
		if (this.frames > 0) ui.fps = this.frames
		ui.frameTimeMs = this.frames > 0 ? this.frameTimeSum / this.frames : null
		this.frames = 0
		this.frameTimeSum = 0
		this.lastSecond = now

		const heap = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize
		ui.memoryMB = typeof heap === 'number' ? heap / 1024 / 1024 : null
	}
}
