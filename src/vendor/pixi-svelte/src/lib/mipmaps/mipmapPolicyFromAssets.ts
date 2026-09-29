import type { MipmapPolicy } from './applyMipmapPolicy';
import type { Asset, Assets } from '../types';

function wantsMipmaps(asset: Asset): boolean {
	return asset.mipmaps === true || asset.data?.autoGenerateMipmaps === true;
}

/** Keys flagged `mipmaps` / `data.autoGenerateMipmaps` on the pixi-svelte manifest. */
export function mipmapPolicyFromAssets(assets: Assets | undefined): MipmapPolicy {
	const spines: string[] = [];
	const fonts: string[] = [];
	const textures: string[] = [];
	if (!assets) return {};

	for (const [key, asset] of Object.entries(assets)) {
		if (!wantsMipmaps(asset)) continue;
		if (asset.type === 'spine') spines.push(key);
		else if (asset.type === 'font') {
			fonts.push(key.startsWith('fonts/') ? key.slice('fonts/'.length) : key);
		} else if (asset.type === 'sprite' || asset.type === 'sprites' || asset.type === 'spriteSheet') {
			textures.push(key);
		}
	}

	return { spines, fonts, textures };
}
