import type { TextureSource } from 'pixi.js';

/** Spine asset key → atlas page texture sources (registered at load time). */
const registry = new Map<string, TextureSource[]>();

export type SpineAtlasSourceProvider = (assetKey: string) => TextureSource[];

let sourceProvider: SpineAtlasSourceProvider | null = null;

/**
 * Optional override used when spines load through slots-engine `SpineLoader`
 * (`loadedTextureSources`) instead of pixi-svelte `AssetsLoader`.
 */
export function setSpineAtlasSourceProvider(provider: SpineAtlasSourceProvider | null): void {
	sourceProvider = provider;
}

export function registerSpineAtlasSources(
	assetKey: string,
	sources: readonly TextureSource[],
): void {
	if (sources.length === 0) return;
	registry.set(assetKey, [...sources]);
}

export function getRegisteredSpineAtlasSources(assetKey: string): TextureSource[] {
	return registry.get(assetKey) ?? [];
}

export function getSpineAtlasSources(assetKey: string): TextureSource[] {
	const fromProvider = sourceProvider?.(assetKey) ?? [];
	if (fromProvider.length > 0) return fromProvider;
	return getRegisteredSpineAtlasSources(assetKey);
}
