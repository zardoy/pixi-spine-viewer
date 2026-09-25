import { Rectangle, type Application, type Container } from 'pixi.js'
import { spineSvelteConfig } from '../configure'

export type CaptureOptions = {
	/** Defaults to the whole stage. */
	target?: Container
	/** Region to capture, in renderer pixels. Defaults to the full renderer size. */
	frame?: { x: number; y: number; width: number; height: number }
	/** RGBA 0–1. Defaults to fully transparent. */
	clearColor?: [number, number, number, number]
}

/**
 * Render the current frame to an offscreen canvas.
 *
 * Reads back what the renderer has right now, so call it after the frame you want is drawn.
 */
export function extractRendererCanvas(
	app: Application,
	options: CaptureOptions = {},
): HTMLCanvasElement | null {
	try {
		const frame = options.frame
			? new Rectangle(options.frame.x, options.frame.y, options.frame.width, options.frame.height)
			: new Rectangle(0, 0, app.renderer.width, app.renderer.height)

		return app.renderer.extract.canvas({
			target: options.target ?? app.stage,
			frame,
			clearColor: options.clearColor ?? [0, 0, 0, 0],
		}) as HTMLCanvasElement
	} catch (error) {
		spineSvelteConfig().warn('[spine-svelte] canvas extract failed', error)
		return null
	}
}

/**
 * True when any pixel has non-zero alpha.
 *
 * Worth checking before saving: an off-screen camera or a fully hidden skeleton produces a
 * perfectly valid but entirely empty PNG, which is confusing to receive.
 */
export function canvasHasVisiblePixels(canvas: HTMLCanvasElement): boolean {
	const context = canvas.getContext('2d', { willReadFrequently: true })
	if (!context || canvas.width <= 0 || canvas.height <= 0) return false

	try {
		const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
		for (let i = 3; i < data.length; i += 4) {
			if (data[i] > 0) return true
		}
		return false
	} catch (error) {
		spineSvelteConfig().warn('[spine-svelte] could not read pixels for empty check', error)
		return false
	}
}

export function downloadCanvasPng(canvas: HTMLCanvasElement, filename: string): void {
	const link = document.createElement('a')
	link.download = filename
	link.href = canvas.toDataURL('image/png')
	document.body.appendChild(link)
	link.click()
	document.body.removeChild(link)
}

export type CaptureResult = 'saved' | 'empty' | 'failed'

/** Extract, reject an empty frame, then save. */
export function captureCanvasPng(
	app: Application,
	filename: string,
	options: CaptureOptions = {},
): CaptureResult {
	const canvas = extractRendererCanvas(app, options)
	if (!canvas) return 'failed'
	if (!canvasHasVisiblePixels(canvas)) return 'empty'

	try {
		downloadCanvasPng(canvas, filename)
		return 'saved'
	} catch (error) {
		spineSvelteConfig().warn('[spine-svelte] canvas download failed', error)
		return 'failed'
	}
}
