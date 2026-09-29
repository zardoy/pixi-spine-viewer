import * as PIXI from 'pixi.js';
import type { TextureSource } from 'pixi.js';

import { setTextureSourcesMipmapsEnabled } from './textureSourceMipmaps';

export type StaticTextureSourceProvider = (textureName: string) => TextureSource | null;

let sourceProvider: StaticTextureSourceProvider | null = null;

/**
 * Optional override used when static textures load through slots-engine
 * `StaticTextureLoader` instead of pixi-svelte `AssetsLoader`.
 */
export function setStaticTextureSourceProvider(
	provider: StaticTextureSourceProvider | null,
): void {
	sourceProvider = provider;
}

function sourceForStaticTexture(textureName: string): TextureSource | null {
	const fromProvider = sourceProvider?.(textureName);
	if (fromProvider) return fromProvider;

	const cached = PIXI.Assets.get(textureName) as PIXI.Texture | undefined;
	return cached?.source ?? null;
}

/** @returns `1` if the texture was touched; `0` if it isn't loaded yet. */
export function setStaticTextureMipmapsEnabled(textureName: string, enabled: boolean): number {
	const source = sourceForStaticTexture(textureName);
	if (!source) {
		console.warn(`[staticTextureMipmaps] no loaded texture for "${textureName}"`);
		return 0;
	}
	return setTextureSourcesMipmapsEnabled([source], enabled);
}
