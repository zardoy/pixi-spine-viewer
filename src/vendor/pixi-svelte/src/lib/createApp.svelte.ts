import * as PIXI from 'pixi.js';

import type { MipmapPolicy } from './mipmaps/applyMipmapPolicy';
import type { LoadedAssets, Assets } from './types';

export function createApp({
	assets,
	mipmapPolicy,
	onReset,
}: {
	assets: Assets;
	/** Applied automatically by `AssetsLoader` after each load batch. */
	mipmapPolicy?: MipmapPolicy;
	onReset?: () => void;
}) {
	const reset = () => {
		onReset?.();
		stateApp.loaded = false;
		stateApp.loadingProgress = 0;
		stateApp.loadingBytesLoaded = 0;
		stateApp.loadingBytesTotal = 0;
		stateApp.loadedAssets = {};
		stateApp.pixiApplication = undefined as PIXI.Application | undefined;
	};

	const stateApp = $state({
		reset,
		assets,
		mipmapPolicy,
		loaded: false,
		loadingProgress: 0,
		loadingBytesLoaded: 0,
		loadingBytesTotal: 0,
		loadedAssets: {} as LoadedAssets,
		pixiApplication: undefined as PIXI.Application | undefined,
	});

	return {
		stateApp,
	};
}

export type PixiSvelteApp = ReturnType<typeof createApp>;
