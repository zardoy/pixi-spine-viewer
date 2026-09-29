import type { Renderer } from 'pixi.js';

import { setBitmapFontMipLodBias, setBitmapFontMipmapsEnabled } from './bitmapFontMipmaps';
import { setSpineAtlasMipmapsEnabled } from './spineAtlasMipmaps';
import { getSpineAtlasSources } from './spineAtlasTextureRegistry';
import { setStaticTextureMipmapsEnabled } from './staticTextureMipmaps';

function isDevMode(): boolean {
	return Boolean((import.meta as { env?: { DEV_MODE?: boolean } }).env?.DEV_MODE);
}

/** Default LOD cap for outlined bitmap fonts (THS `BITMAP_FONT_MAX_LOD`). */
export const BITMAP_FONT_MAX_LOD = 2;

export type MipmapFontPolicy = {
	name: string;
	/** Allow mip 0–maxLod only. Defaults to {@link BITMAP_FONT_MAX_LOD}. */
	maxLod?: number;
};

/**
 * Allowlist of assets that get a mip chain after load.
 *
 * Only add a spine once its atlas has gutter between regions — mip level 1 averages
 * 2×2 blocks, so edge-to-edge packing bleeds neighbouring regions at deeper levels.
 * Single-image static textures and bitmap fonts don't have that packing concern.
 */
export type MipmapPolicy = {
	/** Master switch — `false` restores plain bilinear. Default `true` when any list is set. */
	enabled?: boolean;
	spines?: readonly string[];
	fonts?: readonly (string | MipmapFontPolicy)[];
	textures?: readonly string[];
};

function fontEntry(entry: string | MipmapFontPolicy): MipmapFontPolicy {
	return typeof entry === 'string' ? { name: entry } : entry;
}

export function mergeMipmapPolicies(
	...policies: Array<MipmapPolicy | undefined>
): MipmapPolicy {
	const spines = new Set<string>();
	const textures = new Set<string>();
	const fonts = new Map<string, MipmapFontPolicy>();
	let enabled: boolean | undefined;

	for (const policy of policies) {
		if (!policy) continue;
		if (policy.enabled === false) enabled = false;
		else if (policy.enabled === true && enabled !== false) enabled = true;
		for (const key of policy.spines ?? []) spines.add(key);
		for (const key of policy.textures ?? []) textures.add(key);
		for (const entry of policy.fonts ?? []) {
			const font = fontEntry(entry);
			fonts.set(font.name, font);
		}
	}

	return {
		enabled,
		spines: [...spines],
		fonts: [...fonts.values()],
		textures: [...textures],
	};
}

/** True when every listed spine has at least one registered atlas page. */
export function spineMipmapSourcesReady(policy: MipmapPolicy | undefined): boolean {
	const keys = policy?.spines ?? [];
	if (keys.length === 0) return true;
	return keys.every((key) => getSpineAtlasSources(key).length > 0);
}

export function applyMipmapPolicy(policy: MipmapPolicy | undefined, renderer?: Renderer): void {
	if (!policy) return;
	const enabled = policy.enabled !== false;
	const hasAny =
		(policy.spines?.length ?? 0) > 0 ||
		(policy.fonts?.length ?? 0) > 0 ||
		(policy.textures?.length ?? 0) > 0;
	if (!hasAny) return;

	if (!enabled) {
		console.info('[mipmapPolicy] disabled — plain bilinear');
		return;
	}

	for (const key of policy.spines ?? []) {
		const pages = setSpineAtlasMipmapsEnabled(key, true);
		if (isDevMode()) {
			console.info(`[spineMipmapPolicy] ${key}: mipmaps on (${pages} page${pages === 1 ? '' : 's'})`);
		}
	}

	for (const entry of policy.fonts ?? []) {
		const font = fontEntry(entry);
		const maxLod = font.maxLod ?? BITMAP_FONT_MAX_LOD;
		const pages = setBitmapFontMipmapsEnabled(font.name, true, {
			maxMipLevelCount: maxLod + 1,
		});
		const lodPages = renderer
			? setBitmapFontMipLodBias(renderer, font.name, 0, maxLod)
			: 0;
		if (isDevMode()) {
			console.info(
				`[bitmapFontMipmapPolicy] ${font.name}: mipmaps on (${pages} page${pages === 1 ? '' : 's'}), maxLod=${maxLod} (${lodPages})`,
			);
		}
	}

	for (const key of policy.textures ?? []) {
		const pages = setStaticTextureMipmapsEnabled(key, true);
		if (isDevMode()) {
			console.info(
				`[staticTextureMipmapPolicy] ${key}: mipmaps ${pages > 0 ? 'on' : 'skipped (not loaded)'}`,
			);
		}
	}
}
