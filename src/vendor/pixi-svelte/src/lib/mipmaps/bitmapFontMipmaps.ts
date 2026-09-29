import { Assets, type Renderer, type TextureSource } from 'pixi.js';

import {
	setTextureSourcesMipLodBias,
	setTextureSourcesMipmapsEnabled,
} from './textureSourceMipmaps';

/**
 * Toggle trilinear mipmapping on a bitmap font's page textures at runtime.
 *
 * Same trick as spine atlas mipmaps, applied to glyph atlases: pixi's bitmap-font
 * loader only forces `autoGenerateMipmaps: false` for MSDF/SDF fonts — a plain
 * rasterized font loads with the default (no mip chain), so it's sampled with a
 * 2×2 bilinear kernel no matter how far it's minified.
 *
 * WebGL only, same as the spine version.
 */
function fontAtlasSourcesFor(fontName: string): TextureSource[] {
	const font = Assets.cache.get(`fonts/${fontName}`) as
		| { pages?: { texture: { source: TextureSource } }[] }
		| undefined;
	return font?.pages?.map((p) => p.texture.source) ?? [];
}

/** @returns number of atlas pages touched; `0` means the font isn't loaded yet. */
export function setBitmapFontMipmapsEnabled(
	fontName: string,
	enabled: boolean,
	options?: { maxMipLevelCount?: number },
): number {
	const sources = fontAtlasSourcesFor(fontName);
	if (sources.length === 0) {
		console.warn(`[bitmapFontMipmaps] no loaded atlas pages for font "${fontName}"`);
		return 0;
	}
	return setTextureSourcesMipmapsEnabled(sources, enabled, options);
}

/**
 * LOD clamp on a mipmapped glyph atlas.
 *
 * `minLod` skips the sharpest mips — higher = blurrier.
 * `maxLod` caps how deep the sampler may go. Unclamped, outlined white glyphs at
 * small `fontSize` pick deep mips where fill + baked black outline averages to charcoal.
 */
export function setBitmapFontMipLodBias(
	renderer: Renderer,
	fontName: string,
	minLod: number,
	maxLod?: number,
): number {
	const sources = fontAtlasSourcesFor(fontName);
	return setTextureSourcesMipLodBias(renderer, sources, minLod, maxLod);
}
