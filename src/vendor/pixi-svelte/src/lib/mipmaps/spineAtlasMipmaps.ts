import type { Renderer } from 'pixi.js';

import { getSpineAtlasSources } from './spineAtlasTextureRegistry';
import {
	setTextureSourcesMipLodBias,
	setTextureSourcesMipmapsEnabled,
} from './textureSourceMipmaps';

/** @returns number of atlas pages touched; `0` means the spine's textures aren't loaded yet. */
export function setSpineAtlasMipmapsEnabled(assetKey: string, enabled: boolean): number {
	const sources = getSpineAtlasSources(assetKey);
	if (sources.length === 0) {
		console.warn(`[spineAtlasMipmaps] no loaded atlas pages for ${assetKey}`);
		return 0;
	}
	return setTextureSourcesMipmapsEnabled(sources, enabled);
}

/**
 * Softness dial for a spine atlas. `0` is plain trilinear; `1` is roughly the
 * softness of a half-resolution atlas; fractional values are fine.
 *
 * Requires WebGL2 and mipmaps already enabled; call it after
 * {@link setSpineAtlasMipmapsEnabled}.
 */
export function setSpineAtlasMipLodBias(
	renderer: Renderer,
	assetKey: string,
	minLod: number,
	maxLod?: number,
): number {
	const sources = getSpineAtlasSources(assetKey);
	return setTextureSourcesMipLodBias(renderer, sources, minLod, maxLod);
}
