import * as SPINE_PIXI from '@esotericsoftware/spine-pixi-v8';
import * as PIXI from 'pixi.js';
import type { TextureSource } from 'pixi.js';

import { registerSpineAtlasSources } from './spineAtlasTextureRegistry';

type SpinePageTexture = {
	texture?: { source?: TextureSource };
	source?: TextureSource;
};

function atlasPageUrl(atlasUrl: string, pageName: string): string {
	const slash = atlasUrl.lastIndexOf('/');
	const base = slash >= 0 ? atlasUrl.slice(0, slash + 1) : '';
	return `${base}${pageName}`;
}

function textureSourceFromPage(
	page: SPINE_PIXI.TextureAtlasPage,
	atlasUrl?: string,
): TextureSource | undefined {
	const spineTexture = page.texture as SpinePageTexture | null;
	const bound = spineTexture?.texture?.source ?? spineTexture?.source;
	if (bound) return bound;

	// Atlas is parsed before spine-pixi binds page.texture — resolve the page image from Assets.
	if (!atlasUrl) return undefined;
	const pageUrl = atlasPageUrl(atlasUrl, page.name);
	const cached = PIXI.Assets.get(pageUrl) as PIXI.Texture | undefined;
	return cached?.source;
}

export function sourcesFromAtlas(
	atlas: SPINE_PIXI.TextureAtlas,
	atlasUrl?: string,
): TextureSource[] {
	const sources: TextureSource[] = [];
	const seen = new Set<TextureSource>();
	for (const page of atlas.pages) {
		const source = textureSourceFromPage(page, atlasUrl);
		if (source && !seen.has(source)) {
			seen.add(source);
			sources.push(source);
		}
	}
	return sources;
}

/** Walk a pixi-svelte manifest and register atlas page sources for each spine entry. */
export function registerSpineAtlasSourcesFromAssets(
	assets: Record<string, { type?: string; src?: unknown }>,
): void {
	for (const [key, asset] of Object.entries(assets)) {
		if (asset.type !== 'spine' || !asset.src || typeof asset.src !== 'object') continue;
		const atlasUrl = (asset.src as { atlas?: string }).atlas;
		if (!atlasUrl) continue;
		const atlas = PIXI.Assets.get(atlasUrl) as SPINE_PIXI.TextureAtlas | undefined;
		if (!atlas?.pages?.length) continue;
		registerSpineAtlasSources(key, sourcesFromAtlas(atlas, atlasUrl));
	}
}
