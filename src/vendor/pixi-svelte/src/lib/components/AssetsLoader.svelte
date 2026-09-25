<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as PIXI from 'pixi.js';

	import { getContextApp } from '../context.svelte';
	import { getProcessed } from '../assetLoad';
	import {
		applyMipmapPolicy,
		mergeMipmapPolicies,
		mipmapPolicyFromAssets,
		registerSpineAtlasSourcesFromAssets,
		spineMipmapSourcesReady,
	} from '../mipmaps';
	import type { LoadedAssets, RawAsset } from '../types';

	type Props = { children: Snippet };

	const props: Props = $props();
	const context = getContextApp();

	let preLoaded = $state(false);

	const assetNameList = $derived(
		context.stateApp.assets
			? Object.keys(context.stateApp.assets).filter(
					(key) => Boolean(context.stateApp.assets?.[key].preload) === false,
				)
			: [],
	);

	const preAssetNameList = $derived(
		context.stateApp.assets
			? Object.keys(context.stateApp.assets).filter(
					(key) => context.stateApp.assets?.[key].preload === true,
				)
			: [],
	);

	const totalAssets = $derived(assetNameList.length + preAssetNameList.length);
	let doneAssets = 0;

	/**
	 * One step per finished asset, across the preload and the post-load batch alike.
	 * (Pixi's own per-file `onProgress` fires many times per asset and per file, and only ever
	 * counted the post-load batch — so the bar sat at 0 for the whole preload.)
	 */
	const markAssetDone = () => {
		doneAssets += 1;
		if (totalAssets === 0) return;
		context.stateApp.loadingProgress = Math.min(100, Math.round((doneAssets / totalAssets) * 100));
	};

	function applyLoadedMipmaps(): boolean {
		const assets = context.stateApp.assets;
		if (assets) registerSpineAtlasSourcesFromAssets(assets);
		const policy = mergeMipmapPolicies(
			mipmapPolicyFromAssets(assets),
			context.stateApp.mipmapPolicy,
		);
		const ready = spineMipmapSourcesReady(policy);
		if (!ready) return false;
		applyMipmapPolicy(policy, context.stateApp.pixiApplication?.renderer);
		return true;
	}

	function applyLoadedMipmapsWithRetry(): void {
		if (applyLoadedMipmaps()) return;
		let frames = 0;
		const tick = () => {
			if (applyLoadedMipmaps()) return;
			if (frames++ >= 60) {
				const assets = context.stateApp.assets;
				if (assets) registerSpineAtlasSourcesFromAssets(assets);
				applyMipmapPolicy(
					mergeMipmapPolicies(mipmapPolicyFromAssets(assets), context.stateApp.mipmapPolicy),
					context.stateApp.pixiApplication?.renderer,
				);
				return;
			}
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	}

	const loadAssets = async (nameList: string[]) => {
		const loadedAssetsArray = await Promise.all(
			nameList.map(async (key) => {
				try {
					const { type, src, data } = context.stateApp.assets![key];
					if (type === 'font' && typeof src === 'string') {
						// BMFont XML — Pixi installs by `info.face`; nothing to put in loadedAssets.
						await PIXI.Assets.load({ alias: key, src, data: { crossOrigin: 'anonymous' } });
						return;
					}
					const loadSrc =
						type === 'spine' ? Object.values(src).filter((item) => typeof item === 'string') : src;
					const rawAsset =
						type === 'sprite' && data && typeof loadSrc === 'string'
							? await PIXI.Assets.load<RawAsset>({ alias: key, src: loadSrc, data })
							: await PIXI.Assets.load<RawAsset>(loadSrc);
					const processed = getProcessed({ key, rawAsset, type, src });
					return processed;
				} catch (error) {
					console.error(error);
				} finally {
					markAssetDone();
				}
			}),
		);

		return loadedAssetsArray.reduce(
			(acc, cur) => ({
				...acc,
				...cur,
			}),
			{} as LoadedAssets,
		);
	};

	$effect(() => {
		if (!preLoaded) {
			(async () => {
				if (preAssetNameList.length > 0) {
					const preLoadedAssets = await loadAssets(preAssetNameList);
					applyLoadedMipmapsWithRetry();
					if (preLoadedAssets) context.stateApp.loadedAssets = preLoadedAssets;
				}
				preLoaded = true;
			})();
		}
	});

	$effect(() => {
		if (!context.stateApp.loaded && preLoaded) {
			(async () => {
				if (assetNameList.length > 0) {
					const postLoadedAssets = await loadAssets(assetNameList);
					applyLoadedMipmapsWithRetry();
					if (postLoadedAssets)
						context.stateApp.loadedAssets = {
							...context.stateApp.loadedAssets,
							...postLoadedAssets,
						};
				}
				context.stateApp.loaded = true;
			})();
		}
	});
</script>

{#if preLoaded}
	{@render props.children()}
{/if}
