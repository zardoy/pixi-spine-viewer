import { Physics } from '@esotericsoftware/spine-core'
import {
	EMPTY_ANIMATION_NAME,
	interpolateCameraTransform,
	pickInitialSkinName,
	resolveAutoViewport,
	viewportToCameraTransform,
	type AnimationViewport,
	type AnySpine,
	type CameraTransform,
} from 'spine-svelte'
import { spineViewerStore } from '../../store/spineViewerStore'
import type { LoadingToast } from './loadingToast'

/** Seconds the camera takes to glide between per-animation framings. */
const VIEWPORT_TRANSITION_SECONDS = 0.25

export type ScreenSize = { width: number; height: number }

const ui = () => spineViewerStore.ui
const refs = () => spineViewerStore.refs

function paddedSize(viewport: AnimationViewport): ScreenSize {
	return {
		width: viewport.width + viewport.padLeft + viewport.padRight,
		height: viewport.height + viewport.padTop + viewport.padBottom,
	}
}

function viewportCentre(viewport: AnimationViewport) {
	return { x: viewport.x + viewport.width / 2, y: viewport.y + viewport.height / 2 }
}

/** Where the camera must sit so `viewport`'s centre lands mid-screen at `scale`. */
function centredPosition(viewport: AnimationViewport, screen: ScreenSize, scale: number) {
	const centre = viewportCentre(viewport)
	return {
		x: screen.width / 2 - centre.x * scale,
		y: screen.height / 2 - centre.y * scale,
	}
}

function setCameraPosition(pos: { x: number; y: number }) {
	ui().spinePosition = pos
	ui().manualPosition = { ...pos }
}

function setGuideFromViewport(viewport: AnimationViewport, pos: { x: number; y: number }) {
	ui().manualGuideSize = paddedSize(viewport)
	ui().manualGuidePosition = { x: pos.x, y: pos.y }
}

function isUsableViewport(viewport: AnimationViewport): boolean {
	return (
		Number.isFinite(viewport.x) &&
		Number.isFinite(viewport.y) &&
		Number.isFinite(viewport.width) &&
		Number.isFinite(viewport.height) &&
		viewport.width > 0 &&
		viewport.height > 0
	)
}

function resolveViewport(spine: AnySpine, mode: 'first' | 'per-animation' | 'all', animationName: string) {
	return resolveAutoViewport(spine, mode, animationName, ui().autoViewportAnimation, ui().animations)
}

/**
 * First-load setup once the spine exists and the renderer has a size: list animations/skins,
 * frame the camera, and choose the starting animation/skin/time (URL params and a synced-folder
 * reload both take precedence over the defaults).
 *
 * Returns false when it could not finish, so the caller may try again.
 */
export function completeSpineLoadedSetup(
	spine: AnySpine,
	screen: ScreenSize,
	loadingToast: LoadingToast,
): boolean {
	ui().userScaleOverride = false
	ui().userPositionOverride = false

	try {
		const data = spine.skeleton.data
		const animations = data.animations.map((animation) => animation.name)
		const skins = data.skins.map((skin) => skin.name)
		ui().animations = animations
		ui().skins = skins

		const params = new URLSearchParams(window.location.search)
		const urlAnimation = params.get('animation')
		const urlSkin = params.get('skin')
		const urlTime = params.get('time')

		const preserve = spineViewerStore.reloadPreserveAnimation
		const initialAnimation =
			preserve && animations.includes(preserve)
				? preserve
				: urlAnimation && animations.includes(urlAnimation)
					? urlAnimation
					: animations[0]
		spineViewerStore.reloadPreserveAnimation = null

		if (animations.length === 0 || !initialAnimation) {
			ui().loadError = 'No animations found in skeleton data'
			loadingToast.finish('Spine loaded but no animations found', 'warning')
			return true
		}

		const animation = data.findAnimation(initialAnimation)
		if (animation) {
			const viewport = resolveViewport(spine, ui().autoViewportMode, initialAnimation)
			if (viewport) {
				refs().currentViewport = viewport
				const fit = viewportToCameraTransform(viewport, screen.width, screen.height)
				if (fit) {
					ui().scale = fit.scale
					setCameraPosition({ x: fit.x, y: fit.y })
					setGuideFromViewport(viewport, fit)
				} else {
					console.warn('Invalid scale calculated, using default scale 1.0')
					ui().scale = 1
					setCameraPosition({ x: screen.width / 2, y: screen.height / 2 })
				}
			}

			ui().selectedAnimation = initialAnimation
			ui().timelineDuration = animation.duration ?? 0

			// Pause on a URL time only when it is a real position in the clip; 0 or junk starts playing.
			const initialTime = urlTime ? parseFloat(urlTime) : NaN
			if (!Number.isNaN(initialTime) && initialTime > 0 && initialTime <= (animation.duration ?? 0)) {
				ui().timeline = initialTime
				ui().isPlaying = false

				const track = spine.state.tracks[0]
				if (track) {
					track.trackTime = initialTime
					track.trackEnd = initialTime
					spine.state.apply(spine.skeleton)
					spine.skeleton.updateWorldTransform(Physics.update)
				}
			} else {
				ui().timeline = 0
				ui().isPlaying = true
			}
		}

		if (skins.length > 0) ui().selectedSkin = pickInitialSkinName(skins, urlSkin)

		ui().loadError = null
		loadingToast.finish(`Loaded Spine animation with ${animations.length} animation(s)`)
		return true
	} catch (error) {
		console.error('Error in completeSpineLoadedSetup:', error)
		loadingToast.finish(
			'Failed to initialize spine: ' + (error instanceof Error ? error.message : 'Unknown error'),
			'error',
		)
		return false
	}
}

/**
 * Per-frame: mirror playback time into the store, then (unless the user is steering) keep the
 * camera framed — gliding between per-animation framings, otherwise holding the current one.
 */
export function tickTimelineAndViewport(screen: ScreenSize, userIsPanning: boolean): void {
	const spine = refs().spine
	if (!spine || (spine as { destroyed?: boolean }).destroyed) return

	const track = spine.state.tracks[0]
	if (track && ui().isPlaying) ui().timeline = track.getAnimationTime()

	if (ui().userPositionOverride || userIsPanning) return

	const current = refs().currentViewport
	const previous = refs().previousViewport
	if (!current) return

	if (previous) {
		const elapsed = (performance.now() - refs().viewportTransitionStart) / 1000
		const alpha = Math.min(elapsed / VIEWPORT_TRANSITION_SECONDS, 1)

		if (alpha < 1) {
			const transform: CameraTransform | null = interpolateCameraTransform(
				previous,
				current,
				alpha,
				screen.width,
				screen.height,
				ui().userScaleOverride ? ui().scale : undefined,
			)
			if (!transform) return
			if (!ui().userScaleOverride) ui().scale = transform.scale
			setCameraPosition({ x: transform.x, y: transform.y })
			return
		}

		refs().previousViewport = null
		// Transition done: settle on the current framing at whatever scale is in force.
		setCameraPosition(centredPosition(current, screen, ui().scale))
		return
	}

	const size = paddedSize(current)
	const fitScale = Math.min(screen.width / size.width, screen.height / size.height)
	if (Number.isFinite(fitScale) && fitScale > 0 && !ui().userScaleOverride) ui().scale = fitScale
	setCameraPosition(centredPosition(current, screen, ui().scale))
}

/**
 * The selected animation changed: refresh the timeline, and in `per-animation` mode start gliding
 * the camera to that animation's framing. The animation itself is switched by `SpineNode`.
 */
export function onSelectedAnimationChanged(spine: AnySpine, screen: ScreenSize): void {
	if (!ui().selectedAnimation) return

	// The debug empty pseudo-animation has no clip: nothing to time or frame.
	if (ui().selectedAnimation === EMPTY_ANIMATION_NAME) {
		ui().timelineDuration = 0
		ui().timeline = 0
		return
	}

	const animation = spine.skeleton?.data?.findAnimation(ui().selectedAnimation)
	if (!animation) return

	// Callers (sidebar, keyboard) set previousAnimation before changing selectedAnimation.
	if (
		ui().previousAnimation &&
		ui().previousAnimation !== ui().selectedAnimation &&
		ui().increaseResetCounterOnAnimSwitch
	) {
		ui().resetCounter += 1
	}

	ui().timelineDuration = animation.duration ?? 0
	ui().timeline = 0

	if (ui().autoViewportMode !== 'per-animation' || ui().userPositionOverride) return

	const viewport = resolveViewport(spine, 'per-animation', ui().selectedAnimation)
	if (!viewport) return
	if (!isUsableViewport(viewport)) {
		console.warn('Invalid viewport calculated for animation:', ui().selectedAnimation, viewport)
		return
	}

	refs().previousViewport = refs().currentViewport
	refs().currentViewport = viewport
	refs().viewportTransitionStart = performance.now()

	const pos = centredPosition(viewport, screen, ui().scale)
	setCameraPosition(pos)
	setGuideFromViewport(viewport, pos)
}

/** Autoscale mode or reference animation changed (`first` / `all`): re-fit straight away. */
export function refitForAutoViewportSettings(spine: AnySpine, screen: ScreenSize): void {
	if (ui().userPositionOverride) return

	const mode = ui().autoViewportMode
	if (mode === 'per-animation') return

	const viewport = resolveViewport(spine, mode, ui().selectedAnimation)
	if (!viewport) return

	refs().previousViewport = null
	refs().currentViewport = viewport

	const size = paddedSize(viewport)
	const fitScale = Math.min(screen.width / size.width, screen.height / size.height)
	if (Number.isFinite(fitScale) && fitScale > 0 && !ui().userScaleOverride) ui().scale = fitScale

	const pos = centredPosition(viewport, screen, ui().scale)
	ui().spinePosition = pos
	setGuideFromViewport(viewport, pos)
	ui().manualPosition = { ...pos }
}
