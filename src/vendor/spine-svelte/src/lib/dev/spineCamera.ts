import type { AnimationViewport } from '../core/bounds/SpineDisplay'
import { SpineDisplay } from '../core/bounds/SpineDisplay'
import type { AnySpine } from '../core/runtime/spineRuntime'

export type AutoViewportMode = 'first' | 'per-animation' | 'all'

export type CameraTransform = { x: number; y: number; scale: number }

const PADDING = 0.1

/**
 * Pick the bounds the camera should frame.
 *
 * `first` keeps the camera pinned to one reference animation even while a different one plays,
 * so switching clips doesn't make the view jump; `per-animation` refits on every switch; `all`
 * frames the union so nothing is ever clipped.
 */
export function resolveAutoViewport(
	spine: AnySpine,
	mode: AutoViewportMode,
	animationName: string,
	referenceAnimationName: string,
	availableAnimations: readonly string[],
): AnimationViewport | null {
	const data = spine.skeleton?.data
	if (!data) return null

	if (mode === 'all') {
		const union = SpineDisplay.calculateMaxAnimationsViewport(spine, PADDING)
		if (union) return union
		const fallback = data.findAnimation?.(animationName)
		return fallback ? SpineDisplay.calculateAnimationViewport(fallback, spine, PADDING) : null
	}

	const targetName =
		mode === 'first'
			? referenceAnimationName && availableAnimations.includes(referenceAnimationName)
				? referenceAnimationName
				: (availableAnimations[0] ?? animationName)
			: animationName

	const animation = data.findAnimation?.(targetName)
	if (!animation) return null
	return SpineDisplay.calculateAnimationViewport(animation, spine, PADDING)
}

function paddedSize(viewport: AnimationViewport) {
	return {
		width: viewport.width + viewport.padLeft + viewport.padRight,
		height: viewport.height + viewport.padTop + viewport.padBottom,
	}
}

function center(viewport: AnimationViewport) {
	return { x: viewport.x + viewport.width / 2, y: viewport.y + viewport.height / 2 }
}

/** Scale and offset that fit `viewport` inside the screen, centred. */
export function viewportToCameraTransform(
	viewport: AnimationViewport,
	screenWidth: number,
	screenHeight: number,
): CameraTransform | null {
	const size = paddedSize(viewport)
	if (size.width <= 0 || size.height <= 0) return null

	const scale = Math.min(screenWidth / size.width, screenHeight / size.height)
	if (!Number.isFinite(scale) || scale <= 0) return null

	const middle = center(viewport)
	return {
		scale,
		x: screenWidth / 2 - middle.x * scale,
		y: screenHeight / 2 - middle.y * scale,
	}
}

/**
 * Camera transform partway through a move between two framings.
 *
 * Size and centre are interpolated separately — lerping the raw transform instead would make the
 * subject drift while the zoom catches up.
 *
 * `scaleOverride` keeps a user-chosen zoom while still letting the camera recentre.
 */
export function interpolateCameraTransform(
	previous: AnimationViewport,
	current: AnimationViewport,
	alpha: number,
	screenWidth: number,
	screenHeight: number,
	scaleOverride?: number,
): CameraTransform | null {
	const t = Math.min(Math.max(alpha, 0), 1)

	const previousSize = paddedSize(previous)
	const currentSize = paddedSize(current)
	const width = previousSize.width + (currentSize.width - previousSize.width) * t
	const height = previousSize.height + (currentSize.height - previousSize.height) * t
	if (width <= 0 || height <= 0) return null

	const fitScale = Math.min(screenWidth / width, screenHeight / height)
	if (!Number.isFinite(fitScale) || fitScale <= 0) return null

	const scale = scaleOverride ?? fitScale
	const previousCenter = center(previous)
	const currentCenter = center(current)
	const x = previousCenter.x + (currentCenter.x - previousCenter.x) * t
	const y = previousCenter.y + (currentCenter.y - previousCenter.y) * t

	return {
		scale: fitScale,
		x: screenWidth / 2 - x * scale,
		y: screenHeight / 2 - y * scale,
	}
}
