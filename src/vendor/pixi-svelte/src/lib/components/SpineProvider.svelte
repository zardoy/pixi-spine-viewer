<script lang="ts" module>
	import type { Snippet } from 'svelte';
	import * as SPINE_PIXI from '@esotericsoftware/spine-pixi-v8';

	import { type Props as BaseProps } from './BaseSpineProvider.svelte';
	import type { PixiPoint } from '../types';
	import type { SpineDebugCell } from '../context.svelte';

	export type SpineProviderChildArgs = { spine: SPINE_PIXI.Spine; assetKey?: string };

	export type Props = Omit<BaseProps, 'spineData' | 'pivot' | 'scale' | 'children'> & {
		debug?: boolean;
		key: string;
		/** When set, used instead of `loadedAssets[key]` (loader is authoritative). */
		spineDataOverride?: SPINE_PIXI.SkeletonData;
		anchor?: PixiPoint;
		scale?: PixiPoint;
		debugCell?: SpineDebugCell;
		children: Snippet<[SpineProviderChildArgs]>;
	};
</script>

<script lang="ts">
	import BaseSpineProvider from './BaseSpineProvider.svelte';
	import { anchorToPivot } from '../utils.svelte';
	import { getContextApp } from '../context.svelte';

	const { debug, key, spineDataOverride, anchor, children, scale: scaleProp, debugCell, ...baseSpineProps }: Props =
		$props();
	const context = getContextApp();
	const spineData = $derived(
		(spineDataOverride ??
			(context.stateApp.loadedAssets?.[key] as SPINE_PIXI.SkeletonData | undefined)) as
			| SPINE_PIXI.SkeletonData
			| undefined,
	);

	const SCALE_BASE = { x: 1, y: 1 };

	const scaleSize = $derived.by(() => {
		if (!spineData) return SCALE_BASE;
		if (!spineData?.width || !spineData?.height) return SCALE_BASE;
		if (!baseSpineProps.width && !baseSpineProps.height) return SCALE_BASE;
		if (!baseSpineProps.width && baseSpineProps.height) {
			const scaleHeight = baseSpineProps.height / spineData.height;
			return { x: scaleHeight, y: scaleHeight };
		}
		if (baseSpineProps.width && !baseSpineProps.height) {
			const scaleWidth = baseSpineProps.width / spineData.width;
			return { x: scaleWidth, y: scaleWidth };
		}
		if (baseSpineProps.width && baseSpineProps.height) {
			return {
				x: baseSpineProps.width / spineData.width,
				y: baseSpineProps.height / spineData.height,
			};
		}

		return SCALE_BASE;
	});

	const scale = $derived.by(() => {
		if (typeof scaleProp === 'number')
			return { x: scaleSize.x * scaleProp, y: scaleSize.y * scaleProp };
		return { x: scaleSize.x * (scaleProp?.x || 1), y: scaleSize.y * (scaleProp?.y || 1) };
	});

	const pivot = $derived.by(() => {
		if (!spineData) return 0;
		if (!spineData?.width || !spineData?.height) return 0;
		const factWidth = baseSpineProps.width || spineData.width;
		const factHeight = baseSpineProps.height || spineData.height;

		return anchorToPivot({ anchor, sizes: { width: factWidth, height: factHeight } });
	});
</script>

{#if !spineData}
	{console.error(`Spine: key "${key}" is not found in loadedAssets`)}
{:else}
	{#key spineData}
		<BaseSpineProvider {...baseSpineProps} {scale} {pivot} {spineData} assetKey={key} {debugCell}>
			{#snippet children(provider)}
				{@render children(provider)}
			{/snippet}
		</BaseSpineProvider>
	{/key}
{/if}
