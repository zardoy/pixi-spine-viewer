// Side effects first: the mesh patch must be installed before any Spine is constructed, and
// `prepare` must be registered before anything calls `app.renderer.prepare.upload`.
import './core/runtime/spineMeshAttachmentPatch'
import 'pixi.js/prepare'

export {
	configureSpineSvelte,
	spineSvelteConfig,
	resetSpineSvelteConfig,
	supportedSpineVersionsText,
	type SpineSvelteConfig,
} from './configure'

export * from './core/runtime/spineRuntime'
export * from './core/runtime/spineCompat'
export * from './core/runtime/spineSlot'
export * from './core/runtime/spineAttachments'
export * from './provider'

/*
 * Pure TypeScript only. Svelte components live behind `spine-svelte/components` and runes modules
 * behind `spine-svelte/state`, because a plain `tsc` (which the host's React build runs) resolves
 * `.svelte` through an opaque ambient shim and chokes on re-exported component types.
 */
export * from './types'

export * from './core/override/spineOverrideController'
export * from './core/crossfade/crossfadePlan'
export { SpineCrossfader } from './core/crossfade/SpineCrossfader'
export * from './core/playback/attachmentMixRules'
export * from './core/playback/spinePlaybackCore'
export * from './core/visibility/forceHideAttachments'
export * from './core/visibility/spineRenderModes'

export * from './core/bounds/SpineDisplay'
export * from './core/bounds/spineUtils'
export * from './core/bounds/animationUtils'

export * from './core/debug/SpineDebugRenderer'

export * from './dev/captureCanvas'
export * from './dev/originAxes'
export * from './dev/checkerboardBackground'
export * from './dev/spineFollow'
export * from './dev/pixiWebGLRendererStats'
export * from './dev/pixiCanvasScreenBounds'
