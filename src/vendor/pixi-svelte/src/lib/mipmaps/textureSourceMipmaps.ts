import type { Renderer, TextureSource } from 'pixi.js';

function maxMipLevels(source: TextureSource): number {
	return Math.floor(Math.log2(Math.max(source.width, source.height))) + 1;
}

type TextureSystemGl = {
	_gl?: WebGL2RenderingContext;
	getGlSource?: (source: TextureSource) => { target: number; texture: WebGLTexture } | undefined;
	bindSource?: (source: TextureSource, location: number) => void;
};

/**
 * Toggle trilinear mipmapping on already-uploaded Pixi texture sources.
 *
 * Atlases in this stack ship `filter:Linear,Linear` — linear min/mag with *no* mip chain —
 * so minified art is sampled with a 2×2 kernel however far down it is scaled. Turning the
 * mip chain on is the cheapest AA fix: no extra draw, no render target, ~33% more texture
 * memory, and it reads softer than the aliased original.
 *
 * WebGL only. It allocates with `texImage2D` (mutable), so mip levels can be attached after
 * the base upload; WebGPU allocates immutably and would need a reload.
 */
export function setTextureSourcesMipmapsEnabled(
	sources: readonly TextureSource[],
	enabled: boolean,
	options?: { maxMipLevelCount?: number },
): number {
	for (const source of sources) {
		source.autoGenerateMipmaps = enabled;
		const full = maxMipLevels(source);
		const capped =
			options?.maxMipLevelCount != null ? Math.min(full, options.maxMipLevelCount) : full;
		// `mipLevelCount` is normally derived once in `GlTextureSystem._initSource`; these pages
		// were already uploaded without mips, so set it by hand before forcing the re-upload.
		source.mipLevelCount = enabled ? capped : 1;
		source.style.mipmapFilter = 'linear';
		// `update` re-uploads the base level and, when `mipLevelCount > 1`, runs `gl.generateMipmap`.
		source.update();
		// `applyStyleParams` picks the mipmapped MIN filter off `mipLevelCount > 1` at style time.
		source.emit('styleChange', source);
	}
	return sources.length;
}

/**
 * Softness dial: forces the sampler to skip / cap mip levels.
 *
 * `minLod` (TEXTURE_MIN_LOD) skips the sharpest mips — higher = blurrier.
 * `maxLod` (TEXTURE_MAX_LOD) caps how deep the sampler may go.
 *
 * Pixi's `TextureStyle.lodMinClamp` is *not* applied by the WebGL backend
 * (`applyStyleParams` only writes min/mag/mipmap filters), so this sets the GL
 * parameters directly. Requires WebGL2 and mipmaps already enabled.
 */
export function setTextureSourcesMipLodBias(
	renderer: Renderer,
	sources: readonly TextureSource[],
	minLod: number,
	maxLod?: number,
): number {
	const textureSystem = renderer.texture as unknown as TextureSystemGl;
	const gl = textureSystem._gl;
	if (!gl || typeof gl.texParameterf !== 'function' || !('TEXTURE_MIN_LOD' in gl)) {
		console.warn('[textureSourceMipmaps] LOD bias needs WebGL2 — skipped');
		return 0;
	}

	let applied = 0;
	for (const source of sources) {
		const glTexture = textureSystem.getGlSource?.(source);
		if (!glTexture) continue;
		textureSystem.bindSource?.(source, 0);
		gl.texParameterf(glTexture.target, gl.TEXTURE_MIN_LOD, minLod);
		if (maxLod != null && 'TEXTURE_MAX_LOD' in gl) {
			gl.texParameterf(glTexture.target, gl.TEXTURE_MAX_LOD, maxLod);
		}
		applied += 1;
	}
	return applied;
}
