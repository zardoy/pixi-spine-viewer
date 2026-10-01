<script lang="ts" module>
	import type { Snippet } from 'svelte';
	import * as SPINE_PIXI from '@esotericsoftware/spine-pixi-v8';

	import { type Props as BaseProps } from './BaseSpineProvider.svelte';
	import type { PixiPoint } from 'pixi-svelte';
	import type { SpineDebugCell } from './context';

	export type SpineProviderChildArgs = { spine: SPINE_PIXI.Spine; assetKey?: string };

	export type Props = Omit<BaseProps, 'spineData' | 'pivot' | 'scale' | 'children' | 'width' | 'height'> & {
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
	import { anchorToPivot } from 'pixi-svelte';
	import { getContextApp } from 'pixi-svelte';

	const { debug, key, spineDataOverride, anchor, children, scale: scaleProp, debugCell, ...baseSpineProps }: Props =
		$props();
	const context = getContextApp();
	const spineData = $derived(
		(spineDataOverride ??
			(context.stateApp.loadedAssets?.[key] as SPINE_PIXI.SkeletonData | undefined)) as
			| SPINE_PIXI.SkeletonData
			| undefined,
	);

	const scale = $derived.by(() => {
		if (typeof scaleProp === 'number') return { x: scaleProp, y: scaleProp };
		return { x: scaleProp?.x ?? 1, y: scaleProp?.y ?? 1 };
	});

	const pivot = $derived.by(() => {
		if (!spineData) return 0;
		if (!spineData?.width || !spineData?.height) return 0;
		return anchorToPivot({ anchor, sizes: { width: spineData.width, height: spineData.height } });
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
