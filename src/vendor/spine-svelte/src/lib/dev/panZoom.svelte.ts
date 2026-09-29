import type { Container } from 'pixi.js'

export type PanZoomTransform = { x: number; y: number; scale: number }

export type PanZoomOptions = {
	/** The container that actually moves. Mutated directly for zero-latency dragging. */
	target: () => Container | undefined
	/** Called once an interaction settles, so the host can persist the transform. */
	onCommit?: (transform: PanZoomTransform) => void
	/** Called on every change, e.g. to keep screen-constant overlays in step. */
	onChange?: (transform: PanZoomTransform) => void
	/** True while the user is driving, so automatic camera logic can stand down. */
	onInteractingChange?: (interacting: boolean) => void
	enabled?: () => boolean
	minScale?: number
	maxScale?: number
	/** Delay before committing a wheel gesture, in ms. */
	wheelCommitDelay?: number
}

/**
 * Drag-to-pan and wheel-to-zoom on a canvas.
 *
 * The container is mutated directly rather than round-tripping through host state: routing every
 * pointer move through a store made dragging feel laggy. The host is told once the gesture
 * settles instead.
 */
export function panZoom(canvas: HTMLCanvasElement, options: PanZoomOptions) {
	let current = options
	let drag: { pointerId: number; lastX: number; lastY: number } | null = null
	let wheelCommitTimer: ReturnType<typeof setTimeout> | null = null

	const minScale = () => current.minScale ?? 0.01
	const maxScale = () => current.maxScale ?? 10
	const isEnabled = () => current.enabled?.() ?? true

	const readTransform = (container: Container): PanZoomTransform => ({
		x: container.x,
		y: container.y,
		scale: container.scale.x,
	})

	const commit = () => {
		const container = current.target()
		if (container) current.onCommit?.(readTransform(container))
	}

	const clearWheelCommit = () => {
		if (wheelCommitTimer !== null) {
			clearTimeout(wheelCommitTimer)
			wheelCommitTimer = null
		}
	}

	const scheduleWheelCommit = () => {
		clearWheelCommit()
		wheelCommitTimer = setTimeout(() => {
			wheelCommitTimer = null
			current.onInteractingChange?.(false)
			commit()
		}, current.wheelCommitDelay ?? 120)
	}

	const endPan = (event: PointerEvent) => {
		if (!drag || drag.pointerId !== event.pointerId) return
		drag = null
		try {
			canvas.releasePointerCapture(event.pointerId)
		} catch {
			/* already released */
		}
		canvas.style.cursor = 'grab'
		current.onInteractingChange?.(false)
		commit()
	}

	const onPointerDown = (event: PointerEvent) => {
		if (!isEnabled() || event.button !== 0) return
		drag = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY }
		canvas.setPointerCapture(event.pointerId)
		canvas.style.cursor = 'grabbing'
		current.onInteractingChange?.(true)
	}

	const onPointerMove = (event: PointerEvent) => {
		if (!drag || drag.pointerId !== event.pointerId) return
		const container = current.target()
		if (!container) return

		container.x += event.clientX - drag.lastX
		container.y += event.clientY - drag.lastY
		drag.lastX = event.clientX
		drag.lastY = event.clientY
		current.onChange?.(readTransform(container))
	}

	const onWheel = (event: WheelEvent) => {
		if (!isEnabled()) return
		event.preventDefault()

		const container = current.target()
		if (!container) return

		current.onInteractingChange?.(true)

		const factor = Math.exp(-event.deltaY * 0.002)
		const oldScale = container.scale.x
		const newScale = Math.min(maxScale(), Math.max(minScale(), oldScale * factor))

		const rect = canvas.getBoundingClientRect()
		const pointerX = event.clientX - rect.left
		const pointerY = event.clientY - rect.top

		// Keep whatever is under the cursor pinned there while the scale changes.
		const worldX = (pointerX - container.x) / oldScale
		const worldY = (pointerY - container.y) / oldScale

		container.scale.set(newScale)
		container.x = pointerX - worldX * newScale
		container.y = pointerY - worldY * newScale

		current.onChange?.(readTransform(container))
		scheduleWheelCommit()
	}

	canvas.style.cursor = 'grab'
	canvas.addEventListener('pointerdown', onPointerDown)
	canvas.addEventListener('pointermove', onPointerMove)
	canvas.addEventListener('pointerup', endPan)
	canvas.addEventListener('pointercancel', endPan)
	// Non-passive: the wheel gesture is a zoom, not a page scroll.
	canvas.addEventListener('wheel', onWheel, { passive: false })

	return {
		update(next: PanZoomOptions) {
			current = next
		},
		destroy() {
			clearWheelCommit()
			drag = null
			canvas.removeEventListener('pointerdown', onPointerDown)
			canvas.removeEventListener('pointermove', onPointerMove)
			canvas.removeEventListener('pointerup', endPan)
			canvas.removeEventListener('pointercancel', endPan)
			canvas.removeEventListener('wheel', onWheel)
		},
	}
}
