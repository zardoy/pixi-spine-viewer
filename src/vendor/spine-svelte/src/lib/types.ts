import type { TextureSource } from 'pixi.js'
import type * as SPINE_PIXI from '@esotericsoftware/spine-pixi-v8'
import type { AnySkeletonData, AnySpine } from './core/runtime/spineRuntime'

/**
 * Structural contract for whatever loaded the skeleton.
 *
 * Deliberately duck-typed: the viewer supplies a file/URL loader, a game supplies its own asset
 * pipeline, and neither has to be known to this package.
 */
export type SpineLoaderApi = {
	loadSpine: (spineKey: string) => Promise<unknown>
	getSkeletonData?: (spineKey: string) => AnySkeletonData | undefined
	/**
	 * Texture sources to push to the GPU before the first frame. Without this Pixi uploads
	 * lazily and the first rendered frame can show blank textures.
	 */
	getTextureSourcesForPreload?: (spineKey: string) => TextureSource[] | undefined
}

export type SpineLoadedDetail = {
	spine: AnySpine
	assetKey?: string
}

/** Track listener, as accepted by `TrackEntry.listener`. */
export type SpineTrackListener = NonNullable<SPINE_PIXI.TrackEntry['listener']>
